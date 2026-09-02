const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    buildDisponibilidadeColaborador,
    calculateIntervalMinutes,
    describePlantaoMovement,
    minutesToDurationLabel
} = require('../utils/bancoHoras');
const { getBancoHorasCapabilities, getSchemaInfo, hasColumn, hasTable } = require('../utils/schema');
const {
    deleteEscalaDiaByOrigin,
    restoreEscalaDefaultsForPeriod,
    syncPlantaoToEscalaDia
} = require('../utils/escala');
const { withTransaction } = require('../utils/transactions');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime
} = require('../utils/validation');
const {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    generateUpcomingSaturdays,
    normalizeColaboradores,
    normalizePlantaoType,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
} = require('../utils/plantoes');

function buildPlantaoSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'id',
        'data_plantao',
        'colaboradores_ids',
        'criado_em',
        'atualizado_em'
    ];

    if (capabilities.hasPlantaoHoraInicio) {
        columns.push('hora_inicio');
    }

    if (capabilities.hasPlantaoHoraFim) {
        columns.push('hora_fim');
    }

    if (capabilities.hasPlantaoObservacao) {
        columns.push('observacao');
    }

    if (capabilities.hasPlantaoTipo) {
        columns.push('tipo_plantao');
    }

    return columns.join(',\n            ');
}

async function findPlantaoByDate(poolOrTx, dataISO, schema) {
    const result = await poolOrTx.request()
        .input('data_plantao', sql.Date, dataISO)
        .query(`
            SELECT
                ${buildPlantaoSelect(schema)}
            FROM plantoes
            WHERE data_plantao = @data_plantao
        `);

    return result.recordset[0] || null;
}

// Datas de feriado (ISO) cadastradas, como Set — para o tipo do plantao poder
// ser 'feriado' (inclusive em dia util). A tabela Feriados e obrigatoria.
async function loadFeriadosSet(poolOrTx) {
    const result = await poolOrTx.request().query('SELECT Data FROM Feriados');
    const set = new Set();

    for (const row of result.recordset) {
        const iso = extractDateString(row.Data);
        if (iso) {
            set.add(iso);
        }
    }

    return set;
}

async function ensureColaboradoresExist(poolOrTx, colaboradoresIds) {
    for (const colaboradorId of colaboradoresIds) {
        const result = await poolOrTx.request()
            .input('id', sql.Int, colaboradorId)
            .query('SELECT Id FROM Colaboradores WHERE Id = @id');

        if (result.recordset.length === 0) {
            throw new AppError(404, `Colaborador ${colaboradorId} nao encontrado.`);
        }
    }
}

function buildPlantaoPayload(body, fallback = {}, feriados = null) {
    const dataISO = body.dataISO !== undefined
        ? normalizeIsoDate(body.dataISO, 'Data do plantao')
        : normalizeIsoDate(
            extractDateString(fallback.dataISO || fallback.data_plantao || fallback.DataPlantao),
            'Data do plantao'
        );

    const colaboradores = body.colaboradores !== undefined
        ? normalizeColaboradores(body.colaboradores)
        : normalizeColaboradores(fallback.colaboradores || fallback.colaboradores_ids || []);

    const horaInicio = body.horaInicio !== undefined
        ? normalizeNullableTime(body.horaInicio, 'Hora inicial do plantao')
        : extractTimeString(fallback.hora_inicio || fallback.HoraInicio || fallback.horaInicio);

    const horaFim = body.horaFim !== undefined
        ? normalizeNullableTime(body.horaFim, 'Hora final do plantao')
        : extractTimeString(fallback.hora_fim || fallback.HoraFim || fallback.horaFim);

    if (!horaInicio || !horaFim) {
        throw new AppError(400, 'Hora inicial e hora final do plantao sao obrigatorias.');
    }

    const duracaoMinutos = calculateIntervalMinutes(horaInicio, horaFim, {
        startLabel: 'Hora inicial do plantao',
        endLabel: 'Hora final do plantao'
    });

    const observacao = body.observacao !== undefined
        ? normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 })
        : normalizeOptionalText(fallback.observacao || fallback.Observacao, 'Observacao', { maxLength: 500 });

    const tipoPlantao = body.tipoPlantao !== undefined
        ? normalizePlantaoType(body.tipoPlantao, dataISO, feriados)
        : normalizePlantaoType(fallback.tipo_plantao || fallback.TipoPlantao || fallback.tipoPlantao, dataISO, feriados);

    return {
        dataISO,
        tipoPlantao,
        colaboradores,
        horaInicio,
        horaFim,
        observacao,
        duracaoMinutos
    };
}

// O dia pode ter MAIS DE UM lancamento (turnos diferentes, com pessoas e
// horarios diferentes), entao a busca por data devolve lista. findPlantaoByDate
// continua existindo para os pontos que so precisam saber se o dia tem algo.
async function findPlantoesByDate(poolOrTx, dataISO, schema) {
    const result = await poolOrTx.request()
        .input('data_plantao', sql.Date, dataISO)
        .query(`
            SELECT
                ${buildPlantaoSelect(schema)}
            FROM plantoes
            WHERE data_plantao = @data_plantao
            ORDER BY hora_inicio, id
        `);

    return result.recordset;
}

function buildDisponibilidadeSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'Id',
        'ColaboradorId',
        'Tipo',
        'DataInicio',
        'DataFim',
        'PeriodoTipo',
        'HoraInicio',
        'HoraFim'
    ];

    if (capabilities.hasAusenciaSubtipo) {
        columns.push('Subtipo');
    }

    return columns.join(',\n                ');
}

async function listDisponibilidade(poolOrTx, schema, plantao) {
    // Colaborador desligado (Ativo = 0) nao aparece como disponivel para plantao.
    const filtroAtivo = hasColumn(schema, 'Colaboradores', 'Ativo') ? 'WHERE Ativo = 1' : '';
    const colaboradoresResult = await poolOrTx.request().query(`SELECT * FROM Colaboradores ${filtroAtivo} ORDER BY Nome`);
    const ausenciasResult = await poolOrTx.request()
        .input('dataPlantao', sql.Date, plantao.dataISO)
        .query(`
            SELECT
                ${buildDisponibilidadeSelect(schema)}
            FROM Ausencias
            WHERE @dataPlantao BETWEEN DataInicio AND DataFim
        `);

    const ausenciasPorColaborador = new Map();

    for (const ausencia of ausenciasResult.recordset) {
        const colaboradorId = ausencia.ColaboradorId;

        if (!ausenciasPorColaborador.has(colaboradorId)) {
            ausenciasPorColaborador.set(colaboradorId, []);
        }

        ausenciasPorColaborador.get(colaboradorId).push(ausencia);
    }

    return colaboradoresResult.recordset.map((colaborador) => buildDisponibilidadeColaborador(
        colaborador,
        ausenciasPorColaborador.get(colaborador.Id) || [],
        plantao
    ));
}

async function assertColaboradoresDisponiveis(poolOrTx, schema, payload) {
    const disponibilidade = await listDisponibilidade(poolOrTx, schema, payload);
    const indisponiveis = disponibilidade.filter((item) => payload.colaboradores.includes(item.id) && !item.disponivel);

    if (indisponiveis.length === 0) {
        return;
    }

    const detalhes = indisponiveis.map((item) => `${item.nome} (${item.motivoLabel})`).join(', ');
    throw new AppError(400, `Nao foi possivel salvar o plantao. Colaboradores indisponiveis: ${detalhes}.`);
}

async function deletePlantaoMovements(poolOrTx, plantaoId) {
    await poolOrTx.request()
        .input('origemTipo', sql.NVarChar(30), 'plantao')
        .input('origemId', sql.Int, plantaoId)
        .query(`
            DELETE FROM BancoHorasMovimentos
            WHERE OrigemTipo = @origemTipo
              AND OrigemId = @origemId
        `);
}

async function syncPlantaoMovements(poolOrTx, schema, row) {
    const capabilities = getBancoHorasCapabilities(schema);

    if (!capabilities.hasMovimentosTable) {
        return { synced: false, skippedReason: 'movimentos_table_missing' };
    }

    const plantao = serializePlantaoRecord(row);
    await deletePlantaoMovements(poolOrTx, plantao.id);

    if (!plantao.horaInicio || !plantao.horaFim || plantao.colaboradores.length === 0) {
        return { synced: false, skippedReason: 'missing_required_data' };
    }

    const minutos = calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim, {
        startLabel: 'Hora inicial do plantao',
        endLabel: 'Hora final do plantao'
    });

    for (const colaboradorId of plantao.colaboradores) {
        await poolOrTx.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('dataReferencia', sql.Date, plantao.dataISO)
            .input('minutos', sql.Int, minutos)
            .input('origemTipo', sql.NVarChar(30), 'plantao')
            .input('origemId', sql.Int, plantao.id)
            .input('descricao', sql.NVarChar(255), describePlantaoMovement(plantao))
            .input('observacao', sql.NVarChar(500), plantao.observacao || null)
            .query(`
                INSERT INTO BancoHorasMovimentos (
                    ColaboradorId,
                    DataReferencia,
                    Minutos,
                    OrigemTipo,
                    OrigemId,
                    Descricao,
                    Observacao
                ) VALUES (
                    @colaboradorId,
                    @dataReferencia,
                    @minutos,
                    @origemTipo,
                    @origemId,
                    @descricao,
                    @observacao
                )
            `);
    }

    return {
        synced: true,
        minutos
    };
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const capabilities = getBancoHorasCapabilities(schema);
    const request = pool.request();
    const clauses = [];

    if (req.query.from) {
        request.input('from', sql.Date, normalizeIsoDate(req.query.from, 'Data inicial'));
        clauses.push('data_plantao >= @from');
    }

    if (req.query.to) {
        request.input('to', sql.Date, normalizeIsoDate(req.query.to, 'Data final'));
        clauses.push('data_plantao <= @to');
    }

    if (req.query.tipoPlantao) {
        const tipoPlantao = normalizePlantaoType(req.query.tipoPlantao);

        if (capabilities.hasPlantaoTipo) {
            request.input('tipoPlantao', sql.NVarChar(30), tipoPlantao);
            clauses.push('LOWER(tipo_plantao) = @tipoPlantao');
        }
    }

    const result = await request.query(`
        SELECT
            ${buildPlantaoSelect(schema)}
        FROM plantoes
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY data_plantao DESC
    `);

    const records = result.recordset.map((row) => {
        const serialized = serializePlantaoRecord(row);

        if (!serialized.duracaoFormatada && serialized.horaInicio && serialized.horaFim) {
            serialized.duracaoMinutos = calculateIntervalMinutes(serialized.horaInicio, serialized.horaFim);
            serialized.duracaoFormatada = minutesToDurationLabel(serialized.duracaoMinutos);
        }

        return serialized;
    }).filter((plantao) => ['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao));

    res.json(records);
});

router.get('/proximos/:quantidade', async (req, res) => {
    const sabados = generateUpcomingSaturdays(req.params.quantidade);
    res.json(sabados);
});

router.get('/disponibilidade/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');
    resolvePlantaoTypeByDate(dataISO, await loadFeriadosSet(pool));
    const horaInicio = req.query.horaInicio ? normalizeNullableTime(req.query.horaInicio, 'Hora inicial do plantao') : null;
    const horaFim = req.query.horaFim ? normalizeNullableTime(req.query.horaFim, 'Hora final do plantao') : null;

    if ((horaInicio && !horaFim) || (!horaInicio && horaFim)) {
        throw new AppError(400, 'Informe hora inicial e hora final para validar disponibilidade por horario.');
    }

    const disponibilidade = await listDisponibilidade(pool, schema, {
        dataISO,
        horaInicio,
        horaFim
    });

    res.json({
        dataISO,
        horaInicio,
        horaFim,
        colaboradores: disponibilidade
    });
});

router.get('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');
    resolvePlantaoTypeByDate(dataISO, await loadFeriadosSet(pool));
    const plantoes = await findPlantoesByDate(pool, dataISO, schema);

    if (plantoes.length === 0) {
        throw new AppError(404, 'Plantao nao encontrado.');
    }

    const lancamentos = plantoes.map((plantao) => {
        const serialized = serializePlantaoRecord(plantao);

        if (!serialized.duracaoFormatada && serialized.horaInicio && serialized.horaFim) {
            serialized.duracaoMinutos = calculateIntervalMinutes(serialized.horaInicio, serialized.horaFim);
            serialized.duracaoFormatada = minutesToDurationLabel(serialized.duracaoMinutos);
        }

        return serialized;
    });

    // O corpo continua sendo o primeiro lancamento, para nao quebrar quem ja
    // consumia esta rota esperando um objeto; a lista completa vem em
    // "lancamentos".
    res.json({ ...lancamentos[0], total: lancamentos.length, lancamentos });
});

// Salva o DIA inteiro: recebe a lista de lancamentos e substitui o que houver
// naquela data. E o contrato que a tela usa ("adiciona varios e salva o dia"),
// e tambem o que mantem o banco de horas coerente — apagar e regravar num so
// lugar evita credito orfao de um turno que deixou de existir.
router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const feriados = await loadFeriadosSet(pool);
    const payload = buildPlantaoDiaPayload(req.body, feriados);
    const capabilities = getBancoHorasCapabilities(schema);

    const result = await withTransaction(sql, pool, async (tx) => {
        for (const lancamento of payload.lancamentos) {
            await ensureColaboradoresExist(tx, lancamento.colaboradores);
            await assertColaboradoresDisponiveis(tx, schema, {
                dataISO: payload.dataISO,
                horaInicio: lancamento.horaInicio,
                horaFim: lancamento.horaFim,
                colaboradores: lancamento.colaboradores
            });
        }

        const anteriores = await findPlantoesByDate(tx, payload.dataISO, schema);
        const existia = anteriores.length > 0;

        for (const anterior of anteriores) {
            if (capabilities.hasMovimentosTable) {
                await deletePlantaoMovements(tx, anterior.id);
            }

            if (hasTable(schema, 'escala_dia')) {
                await deleteEscalaDiaByOrigin(tx, 'plantao', anterior.id);
            }
        }

        await tx.request()
            .input('data_plantao', sql.Date, payload.dataISO)
            .query('DELETE FROM plantoes WHERE data_plantao = @data_plantao');

        const colaboradoresDoBanco = hasTable(schema, 'escala_dia')
            ? (await tx.request().query('SELECT * FROM Colaboradores')).recordset
            : [];

        const salvos = [];

        for (const lancamento of agruparLancamentosPorHorario(payload.lancamentos)) {
            const fields = ['data_plantao', 'colaboradores_ids'];
            const values = ['@data_plantao', '@colaboradores_ids'];

            if (capabilities.hasPlantaoHoraInicio) {
                fields.push('hora_inicio');
                values.push('@horaInicio');
            }

            if (capabilities.hasPlantaoHoraFim) {
                fields.push('hora_fim');
                values.push('@horaFim');
            }

            if (capabilities.hasPlantaoObservacao) {
                fields.push('observacao');
                values.push('@observacao');
            }

            if (capabilities.hasPlantaoTipo) {
                fields.push('tipo_plantao');
                values.push('@tipoPlantao');
            }

            const insertResult = await tx.request()
                .input('data_plantao', sql.Date, payload.dataISO)
                .input('colaboradores_ids', sql.NVarChar(sql.MAX), JSON.stringify(lancamento.colaboradores))
                .input('tipoPlantao', sql.NVarChar(30), payload.tipoPlantao)
                .input('horaInicio', sql.Time, toSqlTime(lancamento.horaInicio, 'Hora inicial do plantao'))
                .input('horaFim', sql.Time, toSqlTime(lancamento.horaFim, 'Hora final do plantao'))
                .input('observacao', sql.NVarChar(500), lancamento.observacao)
                .query(`
                    INSERT INTO plantoes (${fields.join(', ')})
                    OUTPUT INSERTED.*
                    VALUES (${values.join(', ')})
                `);

            const saved = insertResult.recordset[0];

            if (saved.hora_inicio === undefined && capabilities.hasPlantaoHoraInicio) {
                saved.hora_inicio = toSqlTime(lancamento.horaInicio, 'Hora inicial do plantao');
            }

            if (saved.hora_fim === undefined && capabilities.hasPlantaoHoraFim) {
                saved.hora_fim = toSqlTime(lancamento.horaFim, 'Hora final do plantao');
            }

            if (saved.observacao === undefined && capabilities.hasPlantaoObservacao) {
                saved.observacao = lancamento.observacao;
            }

            if (saved.tipo_plantao === undefined && capabilities.hasPlantaoTipo) {
                saved.tipo_plantao = payload.tipoPlantao;
            }

            await syncPlantaoMovements(tx, schema, saved);

            if (hasTable(schema, 'escala_dia')) {
                await syncPlantaoToEscalaDia(tx, schema, saved, colaboradoresDoBanco);
            }

            salvos.push(serializePlantaoRecord({
                ...saved,
                duracaoMinutos: lancamento.duracaoMinutos
            }));
        }

        return { action: existia ? 'updated' : 'created', plantoes: salvos };
    });

    res.status(result.action === 'created' ? 201 : 200).json({
        message: result.action === 'created'
            ? 'Plantao salvo com sucesso!'
            : 'Plantao atualizado com sucesso!',
        success: true,
        action: result.action,
        total: result.plantoes.length,
        data: result.plantoes.length === 1 ? result.plantoes[0] : result.plantoes,
        lancamentos: result.plantoes
    });
});
router.delete('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');

    await withTransaction(sql, pool, async (tx) => {
        // O dia pode ter varios lancamentos: limpar so o primeiro deixaria
        // credito de banco de horas orfao nos demais.
        const existentes = await findPlantoesByDate(tx, dataISO, schema);

        if (existentes.length === 0) {
            throw new AppError(404, 'Plantao nao encontrado.');
        }

        for (const existing of existentes) {
            if (getBancoHorasCapabilities(schema).hasMovimentosTable) {
                await deletePlantaoMovements(tx, existing.id);
            }

            if (hasTable(schema, 'escala_dia')) {
                await deleteEscalaDiaByOrigin(tx, 'plantao', existing.id);
            }
        }

        await tx.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('DELETE FROM plantoes WHERE data_plantao = @data_plantao');

        if (hasTable(schema, 'escala_dia')) {
            await restoreEscalaDefaultsForPeriod(tx, schema, dataISO, dataISO);
        }
    });

    res.json({
        message: 'Plantao excluido com sucesso!',
        success: true
    });
});

module.exports = router;

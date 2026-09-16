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
    syncPlantaoDiaToEscalaDia
} = require('../utils/escala');
const { withTransaction } = require('../utils/transactions');
const {
    extractDateString,
    normalizeIsoDate,
    normalizeNullableTime,
    toSqlTime
} = require('../utils/validation');
const {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    generateUpcomingSaturdays,
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

    if (capabilities.hasPlantaoTipoCredito) {
        columns.push('tipo_credito');
    }

    return columns.join(',\n            ');
}

// O dia pode ter MAIS DE UM lancamento (turnos com horarios, pessoas e destinos
// diferentes), entao a busca por data devolve lista.
async function findPlantoesByDate(poolOrTx, dataISO, schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const result = await poolOrTx.request()
        .input('data_plantao', sql.Date, dataISO)
        .query(`
            SELECT
                ${buildPlantaoSelect(schema)}
            FROM plantoes
            WHERE data_plantao = @data_plantao
            ORDER BY ${capabilities.hasPlantaoHoraInicio ? 'hora_inicio, ' : ''}id
        `);

    return result.recordset;
}

// Datas de feriado (ISO) cadastradas, como Set — para o tipo do plantao poder
// ser 'feriado' (inclusive em dia util). Aqui vem so o feriado municipal/
// estadual: os nacionais resolvePlantaoTypeByDate calcula sozinho, entao um
// 07/09 continua sendo feriado mesmo sem nenhuma linha na tabela Feriados.
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

function hydratePlantaoDuration(serialized) {
    if (!serialized.duracaoFormatada && serialized.horaInicio && serialized.horaFim) {
        serialized.duracaoMinutos = calculateIntervalMinutes(serialized.horaInicio, serialized.horaFim);
        serialized.duracaoFormatada = minutesToDurationLabel(serialized.duracaoMinutos);
    }

    return serialized;
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

    // Hora extra e paga em folha: o plantao fica registrado e entra na escala do
    // dia, mas nao vira credito no banco de horas. O DELETE acima roda antes
    // deste corte de proposito — se o lancamento era 'banco' e virou 'extra',
    // o movimento antigo precisa sumir.
    if (plantao.tipoCredito === 'extra') {
        return { synced: false, skippedReason: 'hora_extra' };
    }

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
        ORDER BY data_plantao DESC, ${capabilities.hasPlantaoHoraInicio ? 'hora_inicio, ' : ''}id
    `);

    const records = result.recordset
        .map((row) => hydratePlantaoDuration(serializePlantaoRecord(row)))
        .filter((plantao) => ['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao));

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
    const tipoPlantao = resolvePlantaoTypeByDate(dataISO, await loadFeriadosSet(pool));
    const rows = await findPlantoesByDate(pool, dataISO, schema);

    if (rows.length === 0) {
        throw new AppError(404, 'Plantao nao encontrado.');
    }

    const lancamentos = rows.map((row) => hydratePlantaoDuration(serializePlantaoRecord(row)));

    res.json({
        dataISO,
        tipoPlantao,
        // A observacao e do dia: todas as linhas gravam o mesmo texto.
        observacao: lancamentos.find((item) => item.observacao)?.observacao || null,
        lancamentos
    });
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const capabilities = getBancoHorasCapabilities(schema);
    const feriados = await loadFeriadosSet(pool);
    const payload = buildPlantaoDiaPayload(req.body, feriados);
    const grupos = agruparLancamentosPorHorario(payload.lancamentos);
    const colaboradoresDoDia = [...new Set(grupos.flatMap((grupo) => grupo.colaboradores))];

    // A coluna tipo_credito chega junto com o indice que libera varias linhas
    // por dia (migration 2026-09-04). Sem ela, os dois recursos ficariam
    // gravando errado em silencio, entao a recusa e explicita.
    if (!capabilities.hasPlantaoTipoCredito) {
        if (grupos.some((grupo) => grupo.tipoCredito === 'extra')) {
            throw new AppError(
                503,
                'Hora extra ainda nao esta disponivel: aplique a migration 2026-09-04-plantao-lancamentos.sql.'
            );
        }

        if (grupos.length > 1) {
            throw new AppError(
                503,
                'Mais de um turno no mesmo dia ainda nao esta disponivel: aplique a migration 2026-09-04-plantao-lancamentos.sql.'
            );
        }
    }

    const result = await withTransaction(sql, pool, async (tx) => {
        await ensureColaboradoresExist(tx, colaboradoresDoDia);

        for (const grupo of grupos) {
            await assertColaboradoresDisponiveis(tx, schema, {
                dataISO: payload.dataISO,
                horaInicio: grupo.horaInicio,
                horaFim: grupo.horaFim,
                colaboradores: grupo.colaboradores
            });
        }

        const anteriores = await findPlantoesByDate(tx, payload.dataISO, schema);
        const action = anteriores.length > 0 ? 'updated' : 'created';

        // O dia e reescrito inteiro a cada gravacao: casar linha por linha com o
        // que ja existia daria o mesmo resultado por muito mais codigo, e a tela
        // sempre manda o dia completo.
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

        const salvos = [];

        for (const grupo of grupos) {
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

            if (capabilities.hasPlantaoTipoCredito) {
                fields.push('tipo_credito');
                values.push('@tipoCredito');
            }

            const insertResult = await tx.request()
                .input('data_plantao', sql.Date, payload.dataISO)
                .input('colaboradores_ids', sql.NVarChar(sql.MAX), JSON.stringify(grupo.colaboradores))
                .input('tipoPlantao', sql.NVarChar(30), payload.tipoPlantao)
                .input('tipoCredito', sql.NVarChar(20), grupo.tipoCredito)
                .input('horaInicio', sql.Time, toSqlTime(grupo.horaInicio, 'Hora inicial do plantao'))
                .input('horaFim', sql.Time, toSqlTime(grupo.horaFim, 'Hora final do plantao'))
                .input('observacao', sql.NVarChar(500), payload.observacao)
                .query(`
                    INSERT INTO plantoes (${fields.join(', ')})
                    OUTPUT INSERTED.*
                    VALUES (${values.join(', ')})
                `);

            const saved = insertResult.recordset[0];

            // OUTPUT INSERTED.* nao devolve o que a tabela ainda nao tem; o
            // fallback mantem a serializacao completa mesmo sem a coluna.
            if (saved.hora_inicio === undefined && capabilities.hasPlantaoHoraInicio) {
                saved.hora_inicio = toSqlTime(grupo.horaInicio, 'Hora inicial do plantao');
            }

            if (saved.hora_fim === undefined && capabilities.hasPlantaoHoraFim) {
                saved.hora_fim = toSqlTime(grupo.horaFim, 'Hora final do plantao');
            }

            if (saved.observacao === undefined && capabilities.hasPlantaoObservacao) {
                saved.observacao = payload.observacao;
            }

            if (saved.tipo_plantao === undefined && capabilities.hasPlantaoTipo) {
                saved.tipo_plantao = payload.tipoPlantao;
            }

            if (saved.tipo_credito === undefined && capabilities.hasPlantaoTipoCredito) {
                saved.tipo_credito = grupo.tipoCredito;
            }

            saved.duracaoMinutos = grupo.duracaoMinutos;
            salvos.push(saved);
        }

        for (const saved of salvos) {
            await syncPlantaoMovements(tx, schema, saved);
        }

        if (hasTable(schema, 'escala_dia')) {
            const colaboradoresResult = await tx.request().query('SELECT * FROM Colaboradores');
            await syncPlantaoDiaToEscalaDia(tx, schema, payload.dataISO, salvos, colaboradoresResult.recordset);
        }

        return {
            action,
            lancamentos: salvos.map((saved) => hydratePlantaoDuration(serializePlantaoRecord(saved)))
        };
    });

    res.status(result.action === 'created' ? 201 : 200).json({
        message: result.action === 'created'
            ? 'Plantao salvo com sucesso!'
            : 'Plantao atualizado com sucesso!',
        success: true,
        action: result.action,
        data: {
            dataISO: payload.dataISO,
            tipoPlantao: payload.tipoPlantao,
            observacao: payload.observacao,
            lancamentos: result.lancamentos
        }
    });
});

router.delete('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');

    await withTransaction(sql, pool, async (tx) => {
        const existentes = await findPlantoesByDate(tx, dataISO, schema);

        if (existentes.length === 0) {
            throw new AppError(404, 'Plantao nao encontrado.');
        }

        // Excluir o dia derruba TODOS os turnos daquela data.
        for (const existente of existentes) {
            if (getBancoHorasCapabilities(schema).hasMovimentosTable) {
                await deletePlantaoMovements(tx, existente.id);
            }

            if (hasTable(schema, 'escala_dia')) {
                await deleteEscalaDiaByOrigin(tx, 'plantao', existente.id);
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

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
const { getBancoHorasCapabilities, getSchemaInfo, hasTable } = require('../utils/schema');
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
    generateUpcomingSaturdays,
    normalizeColaboradores,
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

function buildPlantaoPayload(body, fallback = {}) {
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

    return {
        dataISO,
        colaboradores,
        horaInicio,
        horaFim,
        observacao,
        duracaoMinutos
    };
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
    const colaboradoresResult = await poolOrTx.request().query('SELECT * FROM Colaboradores ORDER BY Nome');
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
    });

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
    const plantao = await findPlantaoByDate(pool, dataISO, schema);

    if (!plantao) {
        throw new AppError(404, 'Plantao nao encontrado.');
    }

    const serialized = serializePlantaoRecord(plantao);

    if (!serialized.duracaoFormatada && serialized.horaInicio && serialized.horaFim) {
        serialized.duracaoMinutos = calculateIntervalMinutes(serialized.horaInicio, serialized.horaFim);
        serialized.duracaoFormatada = minutesToDurationLabel(serialized.duracaoMinutos);
    }

    res.json(serialized);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const payload = buildPlantaoPayload(req.body);

    if (payload.colaboradores.length === 0) {
        throw new AppError(400, 'Selecione pelo menos um colaborador para o plantao.');
    }

    const result = await withTransaction(sql, pool, async (tx) => {
        await ensureColaboradoresExist(tx, payload.colaboradores);
        await assertColaboradoresDisponiveis(tx, schema, payload);

        const existing = await findPlantaoByDate(tx, payload.dataISO, schema);
        const capabilities = getBancoHorasCapabilities(schema);
        let saved;
        let action;

        if (existing) {
            action = 'updated';

            const setParts = [
                'colaboradores_ids = @colaboradores_ids',
                'atualizado_em = GETDATE()'
            ];

            if (capabilities.hasPlantaoHoraInicio) {
                setParts.push('hora_inicio = @horaInicio');
            }

            if (capabilities.hasPlantaoHoraFim) {
                setParts.push('hora_fim = @horaFim');
            }

            if (capabilities.hasPlantaoObservacao) {
                setParts.push('observacao = @observacao');
            }

            const updateResult = await tx.request()
                .input('data_plantao', sql.Date, payload.dataISO)
                .input('colaboradores_ids', sql.NVarChar(sql.MAX), JSON.stringify(payload.colaboradores))
                .input('horaInicio', sql.Time, toSqlTime(payload.horaInicio, 'Hora inicial do plantao'))
                .input('horaFim', sql.Time, toSqlTime(payload.horaFim, 'Hora final do plantao'))
                .input('observacao', sql.NVarChar(500), payload.observacao)
                .query(`
                    UPDATE plantoes
                    SET ${setParts.join(', ')}
                    OUTPUT INSERTED.*
                    WHERE data_plantao = @data_plantao
                `);

            saved = updateResult.recordset[0];
        } else {
            action = 'created';

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

            const insertResult = await tx.request()
                .input('data_plantao', sql.Date, payload.dataISO)
                .input('colaboradores_ids', sql.NVarChar(sql.MAX), JSON.stringify(payload.colaboradores))
                .input('horaInicio', sql.Time, toSqlTime(payload.horaInicio, 'Hora inicial do plantao'))
                .input('horaFim', sql.Time, toSqlTime(payload.horaFim, 'Hora final do plantao'))
                .input('observacao', sql.NVarChar(500), payload.observacao)
                .query(`
                    INSERT INTO plantoes (${fields.join(', ')})
                    OUTPUT INSERTED.*
                    VALUES (${values.join(', ')})
                `);

            saved = insertResult.recordset[0];
        }

        if (saved.hora_inicio === undefined && capabilities.hasPlantaoHoraInicio) {
            saved.hora_inicio = toSqlTime(payload.horaInicio, 'Hora inicial do plantao');
        }

        if (saved.hora_fim === undefined && capabilities.hasPlantaoHoraFim) {
            saved.hora_fim = toSqlTime(payload.horaFim, 'Hora final do plantao');
        }

        if (saved.observacao === undefined && capabilities.hasPlantaoObservacao) {
            saved.observacao = payload.observacao;
        }

        await syncPlantaoMovements(tx, schema, saved);

        if (hasTable(schema, 'escala_dia')) {
            const colaboradoresResult = await tx.request().query('SELECT * FROM Colaboradores');
            await syncPlantaoToEscalaDia(tx, schema, saved, colaboradoresResult.recordset);
        }

        return {
            action,
            plantao: serializePlantaoRecord({
                ...saved,
                duracaoMinutos: payload.duracaoMinutos
            })
        };
    });

    res.status(result.action === 'created' ? 201 : 200).json({
        message: result.action === 'created'
            ? 'Plantao salvo com sucesso!'
            : 'Plantao atualizado com sucesso!',
        success: true,
        action: result.action,
        data: result.plantao
    });
});

router.delete('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');

    await withTransaction(sql, pool, async (tx) => {
        const existing = await findPlantaoByDate(tx, dataISO, schema);

        if (!existing) {
            throw new AppError(404, 'Plantao nao encontrado.');
        }

        if (getBancoHorasCapabilities(schema).hasMovimentosTable) {
            await deletePlantaoMovements(tx, existing.id);
        }

        if (hasTable(schema, 'escala_dia')) {
            await deleteEscalaDiaByOrigin(tx, 'plantao', existing.id);
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

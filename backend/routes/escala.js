const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../utils/transactions');
const { AppError } = require('../utils/errors');
const { getSchemaInfo } = require('../utils/schema');
const {
    applyLunchPeriod,
    ensureEscalaDiaForPeriod,
    listEscalaDiaByDate,
    listEscalaReport,
    normalizeEscalaTipo,
    upsertManualEscalaDia
} = require('../utils/escala');
const {
    buildDateRange,
    ensurePositiveInt,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText
} = require('../utils/validation');

const router = express.Router();

function parseManualEscalaPayload(req) {
    return {
        colaboradorId: ensurePositiveInt(req.params.colaboradorId, 'Colaborador'),
        dataISO: normalizeIsoDate(req.params.dataISO, 'Data'),
        horaInicio: req.body.horaInicio !== undefined
            ? normalizeNullableTime(req.body.horaInicio, 'Hora inicial')
            : undefined,
        horaFim: req.body.horaFim !== undefined
            ? normalizeNullableTime(req.body.horaFim, 'Hora final')
            : undefined,
        almocoInicio: req.body.almocoInicio !== undefined
            ? normalizeNullableTime(req.body.almocoInicio, 'Inicio do almoco')
            : undefined,
        almocoFim: req.body.almocoFim !== undefined
            ? normalizeNullableTime(req.body.almocoFim, 'Fim do almoco')
            : undefined,
        observacao: req.body.observacao !== undefined
            ? normalizeOptionalText(req.body.observacao, 'Observacao', { maxLength: 500 })
            : undefined,
        tipo: req.body.tipo !== undefined
            ? normalizeEscalaTipo(req.body.tipo)
            : undefined
    };
}

function parseLunchPeriodPayload(body) {
    const { dataInicio, dataFim } = buildDateRange(body.dataInicio, body.dataFim);

    return {
        colaboradorId: ensurePositiveInt(body.colaboradorId, 'Colaborador'),
        dataInicio,
        dataFim,
        almocoInicio: normalizeNullableTime(body.almocoInicio, 'Inicio do almoco'),
        almocoFim: normalizeNullableTime(body.almocoFim, 'Fim do almoco')
    };
}

router.get('/dia/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data');

    const items = await withTransaction(sql, pool, async (tx) => listEscalaDiaByDate(tx, schema, dataISO));

    res.json({
        dataISO,
        items
    });
});

router.get('/relatorio', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    if (!req.query.dataInicio || !req.query.dataFim) {
        throw new AppError(400, 'Informe dataInicio e dataFim para gerar o relatorio de escala.');
    }

    const { dataInicio, dataFim } = buildDateRange(req.query.dataInicio, req.query.dataFim);
    const colaboradorId = req.query.colaboradorId
        ? ensurePositiveInt(req.query.colaboradorId, 'Colaborador')
        : null;
    const tipo = req.query.tipo
        ? normalizeEscalaTipo(req.query.tipo)
        : null;

    const items = await withTransaction(sql, pool, async (tx) => listEscalaReport(tx, schema, {
        dataInicio,
        dataFim,
        colaboradorId,
        tipo
    }));

    res.json({
        filters: {
            dataInicio,
            dataFim,
            colaboradorId,
            tipo
        },
        total: items.length,
        items
    });
});

router.put('/dia/:dataISO/colaborador/:colaboradorId', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const payload = parseManualEscalaPayload(req);

    const record = await withTransaction(sql, pool, async (tx) => upsertManualEscalaDia(tx, schema, payload));

    res.json({
        message: 'Escala diaria atualizada com sucesso!',
        success: true,
        data: record
    });
});

router.put('/almoco-periodo', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const payload = parseLunchPeriodPayload(req.body);

    const result = await withTransaction(sql, pool, async (tx) => applyLunchPeriod(tx, schema, payload));

    res.json({
        message: 'Horario de almoco aplicado no periodo com sucesso!',
        success: true,
        data: {
            ...payload,
            ...result
        }
    });
});

router.post('/rebuild', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    if (!req.body?.dataInicio || !req.body?.dataFim) {
        throw new AppError(400, 'Informe dataInicio e dataFim para sincronizar a escala diaria.');
    }

    const { dataInicio, dataFim } = buildDateRange(req.body.dataInicio, req.body.dataFim);
    const colaboradorId = req.body.colaboradorId
        ? ensurePositiveInt(req.body.colaboradorId, 'Colaborador')
        : null;

    const result = await withTransaction(sql, pool, async (tx) => ensureEscalaDiaForPeriod(tx, schema, dataInicio, dataFim, {
        colaboradorId
    }));

    res.json({
        message: 'Escala diaria sincronizada com sucesso!',
        success: true,
        data: {
            dataInicio,
            dataFim,
            colaboradorId,
            counters: result.counters
        }
    });
});

module.exports = router;

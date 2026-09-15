const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../db/transactions');
const { AppError } = require('../lib/errors');
const { getSchemaInfo } = require('../db/schema');
const { getSetoresPermitidosRequest, idsPermitidosNumericos } = require('../auth/acesso-setores');
const {
    applyLunchPeriod,
    ensureEscalaDiaForPeriod,
    iterateIsoDates,
    listEscalaDiaByDate,
    listEscalaReport,
    normalizeEscalaTipo,
    resetEscalaLunchesToCadastro,
    upsertManualEscalaDia
} = require('../services/escala');
const {
    buildDateRange,
    ensurePositiveInt,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText
} = require('../lib/validation');

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

function parseRebuildPeriodPayload(body = {}) {
    if (body.dataInicio && body.dataFim) {
        return buildDateRange(body.dataInicio, body.dataFim);
    }

    const monthValue = Number.parseInt(body.mes ?? body.month, 10);
    const yearValue = Number.parseInt(body.ano ?? body.year, 10);

    if (!Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12 || !Number.isInteger(yearValue)) {
        throw new AppError(400, 'Informe dataInicio/dataFim ou mes/ano para sincronizar a escala diaria.');
    }

    const dataInicio = `${yearValue}-${String(monthValue).padStart(2, '0')}-01`;
    const lastDay = new Date(yearValue, monthValue, 0).getDate();
    const dataFim = `${yearValue}-${String(monthValue).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return buildDateRange(dataInicio, dataFim);
}

router.get('/dia/:dataISO', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data');
    const setorId = req.query.setorId
        ? ensurePositiveInt(req.query.setorId, 'Setor')
        : null;

    const items = await withTransaction(sql, pool, async (tx) => listEscalaDiaByDate(tx, schema, dataISO, {
        setorId
    }));

    // Controle de acesso por setor: a conta so recebe os itens dos setores que
    // tem permissao (a escala tem fonte propria, entao filtrar colaboradores
    // nao basta). Vazio = sem restricao.
    const itemsVisiveis = await filtrarItensPorSetoresPermitidos(pool, req, items);

    res.json({
        dataISO,
        setorId,
        items: itemsVisiveis
    });
});

// Mantem so os itens de escala cujos setores a conta pode ver. Item sem setor
// (setorId nulo) fica de fora quando ha restricao.
async function filtrarItensPorSetoresPermitidos(pool, req, items) {
    const permitidos = await getSetoresPermitidosRequest(pool, req);

    if (!permitidos.length) {
        return items;
    }

    const ids = new Set(idsPermitidosNumericos(permitidos));

    return (items || []).filter((item) => ids.has(Number(item.setorId)));
}

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
    const setorId = req.query.setorId
        ? ensurePositiveInt(req.query.setorId, 'Setor')
        : null;
    const tipo = req.query.tipo
        ? normalizeEscalaTipo(req.query.tipo)
        : null;

    const items = await withTransaction(sql, pool, async (tx) => listEscalaReport(tx, schema, {
        dataInicio,
        dataFim,
        colaboradorId,
        setorId,
        tipo
    }));

    res.json({
        filters: {
            dataInicio,
            dataFim,
            colaboradorId,
            setorId,
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

router.put('/dia/:dataISO/almocos/cadastro', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data');
    const setorId = req.body?.setorId
        ? ensurePositiveInt(req.body.setorId, 'Setor')
        : null;

    const result = await withTransaction(sql, pool, async (tx) => resetEscalaLunchesToCadastro(tx, schema, dataISO, {
        setorId
    }));

    res.json({
        message: 'Almocos restaurados com base no cadastro.',
        success: true,
        data: {
            dataISO,
            setorId,
            ...result
        }
    });
});

router.post('/rebuild', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const { dataInicio, dataFim } = parseRebuildPeriodPayload(req.body || {});
    const colaboradorId = req.body.colaboradorId
        ? ensurePositiveInt(req.body.colaboradorId, 'Colaborador')
        : null;

    const result = await withTransaction(sql, pool, async (tx) => ensureEscalaDiaForPeriod(tx, schema, dataInicio, dataFim, {
        colaboradorId
    }));
    const rows = Array.from(result.existingMap?.values?.() || []);
    const colaboradoresIncluidos = new Set(
        rows
            .filter((row) => row.horaInicio && row.horaFim)
            .map((row) => Number(row.colaboradorId))
            .filter((id) => Number.isFinite(id) && id > 0)
    );
    const plantoesAplicados = rows.filter((row) => row.tipo === 'plantao' || row.origemTipo === 'plantao').length;
    const ajustesPreservados = rows.filter((row) => row.ajusteManual).length;
    const diasProcessados = iterateIsoDates(dataInicio, dataFim).length;

    res.json({
        message: 'Escala diaria sincronizada com sucesso!',
        success: true,
        data: {
            dataInicio,
            dataFim,
            colaboradorId,
            counters: result.counters,
            resumo: {
                diasProcessados,
                colaboradoresIncluidos: colaboradoresIncluidos.size,
                plantoesAplicados,
                ajustesPreservados
            }
        }
    });
});

module.exports = router;

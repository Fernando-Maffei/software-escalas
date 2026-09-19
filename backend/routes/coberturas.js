// PROTOTIPO (branch prototipo/cobertura) - rotas de cobertura e compensacao.
const express = require('express');

const { sql, conectar } = require('../db');
const { getSchemaInfo } = require('../db/schema');
const { withTransaction } = require('../db/transactions');
const { buildDateRange, ensurePositiveInt } = require('../lib/validation');
const {
    excluirCobertura,
    excluirCompensacao,
    listCoberturas,
    listCompensacoes,
    salvarCobertura,
    salvarCompensacao
} = require('../services/coberturas');

const router = express.Router();

// GET /api/coberturas?inicio=&fim= -> coberturas e compensacoes do periodo
router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const { dataInicio, dataFim } = buildDateRange(req.query.inicio, req.query.fim);

    const [coberturas, compensacoes] = await Promise.all([
        listCoberturas(pool, schema, { inicio: dataInicio, fim: dataFim }),
        listCompensacoes(pool, schema, { inicio: dataInicio, fim: dataFim })
    ]);

    res.json({ inicio: dataInicio, fim: dataFim, coberturas, compensacoes });
});

router.post('/compensacoes', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const data = await withTransaction(sql, pool, (tx) => salvarCompensacao(tx, schema, req.body || {}));
    res.status(201).json({ success: true, message: 'Compensacao lancada.', data });
});

router.put('/compensacoes/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const id = ensurePositiveInt(req.params.id, 'Compensacao');
    const data = await withTransaction(sql, pool, (tx) => salvarCompensacao(tx, schema, req.body || {}, id));
    res.json({ success: true, message: 'Compensacao atualizada.', data });
});

router.delete('/compensacoes/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    await withTransaction(sql, pool, (tx) => excluirCompensacao(tx, schema, req.params.id));
    res.json({ success: true, message: 'Compensacao excluida.' });
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const data = await withTransaction(sql, pool, (tx) => salvarCobertura(tx, schema, req.body || {}));
    res.status(201).json({ success: true, message: 'Cobertura lancada.', data });
});

router.put('/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const id = ensurePositiveInt(req.params.id, 'Cobertura');
    const data = await withTransaction(sql, pool, (tx) => salvarCobertura(tx, schema, req.body || {}, id));
    res.json({ success: true, message: 'Cobertura atualizada.', data });
});

router.delete('/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    await withTransaction(sql, pool, (tx) => excluirCobertura(tx, schema, req.params.id));
    res.json({ success: true, message: 'Cobertura excluida.' });
});

module.exports = router;

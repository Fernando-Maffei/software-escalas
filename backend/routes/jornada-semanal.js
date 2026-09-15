const express = require('express');

const { conectar } = require('../db');
const { getSchemaInfo } = require('../db/schema');
const { listJornadaSemanal } = require('../services/jornada-semanal');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const colaboradorId = req.query.colaboradorId
        ? ensurePositiveInt(req.query.colaboradorId, 'Colaborador')
        : null;

    const items = await listJornadaSemanal(pool, schema, {
        colaboradorId,
        onlyActive: true,
        allowMissingTable: true
    });

    res.json({
        colaboradorId,
        total: items.length,
        items
    });
});

module.exports = router;

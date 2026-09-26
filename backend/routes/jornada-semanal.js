const express = require('express');

const { conectar } = require('../db');
const { listJornadaSemanal } = require('../services/jornada-semanal');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

router.get('/', async (req, res) => {
    const pool = await conectar();
    const colaboradorId = req.query.colaboradorId
        ? ensurePositiveInt(req.query.colaboradorId, 'Colaborador')
        : null;

    const items = await listJornadaSemanal(pool, {
        colaboradorId,
        onlyActive: true
    });

    res.json({
        colaboradorId,
        total: items.length,
        items
    });
});

module.exports = router;

const express = require('express');

const { conectar } = require('../db');
const { listJornadaSemanal } = require('../services/jornada-semanal');
const { colaboradoresVisiveis, exigirColaboradorVisivel } = require('../auth/acesso-setores');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

router.get('/', async (req, res) => {
    const pool = await conectar();
    const colaboradorId = req.query.colaboradorId
        ? ensurePositiveInt(req.query.colaboradorId, 'Colaborador')
        : null;

    const visiveis = await colaboradoresVisiveis(pool, req);

    if (colaboradorId) {
        exigirColaboradorVisivel(visiveis, colaboradorId);
    }

    const todos = await listJornadaSemanal(pool, {
        colaboradorId,
        onlyActive: true
    });
    const items = visiveis ? todos.filter((item) => visiveis.has(Number(item.colaboradorId))) : todos;

    res.json({
        colaboradorId,
        total: items.length,
        items
    });
});

module.exports = router;

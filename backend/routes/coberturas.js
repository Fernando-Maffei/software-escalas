// Coberturas de plantonista (ver backend/services/coberturas.js).
//
// Leitura segue o teto de setor pelo TITULAR: a conta ve a cobertura de quem
// ela ve. Gravar e so do admin, pelo portao central de permissao em app.js.
const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction, withTransactionDescartada } = require('../db/transactions');
const { colaboradoresVisiveis, exigirColaboradorVisivel } = require('../auth/acesso-setores');
const {
    createCobertura,
    deleteCobertura,
    findCoberturaById,
    listCoberturas,
    listarDisponibilidade,
    sugerirTrechos,
    updateCobertura
} = require('../services/coberturas');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

router.get('/', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);

    const items = await listCoberturas(pool, {
        dataInicio: req.query.dataInicio,
        dataFim: req.query.dataFim,
        titularId: req.query.titularId,
        situacao: req.query.situacao
    }, visiveis);

    res.json({ total: items.length, items });
});

// Horario a cobrir sugerido pela jornada do titular, sem gravar nada.
router.get('/sugestao', async (req, res) => {
    const pool = await conectar();
    exigirColaboradorVisivel(await colaboradoresVisiveis(pool, req), req.query.titularId);

    res.json(await sugerirTrechos(pool, {
        titularId: req.query.titularId,
        dataInicio: req.query.dataInicio,
        dataFim: req.query.dataFim,
        ausenciaId: req.query.ausenciaId
    }));
});

// Quem pode assumir um horario, com o motivo de quem nao pode. Le a escala do
// dia gerada sob demanda numa transacao descartada, como a Escala do Dia: a
// resposta e a mesma e nada fica gravado.
router.get('/disponibilidade', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);

    const colaboradores = await withTransactionDescartada(sql, pool, async (tx) => listarDisponibilidade(tx, {
        dataISO: req.query.dataISO,
        horaInicio: req.query.horaInicio,
        horaFim: req.query.horaFim,
        titularId: req.query.titularId,
        coberturaId: req.query.coberturaId,
        trechoId: req.query.trechoId
    }, visiveis));

    res.json({ total: colaboradores.length, colaboradores });
});

router.get('/:id', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);
    const cobertura = await findCoberturaById(pool, req.params.id, visiveis);

    exigirColaboradorVisivel(visiveis, cobertura.titularId);
    res.json(cobertura);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);

    const cobertura = await withTransaction(sql, pool, async (tx) => createCobertura(tx, req.body || {}, visiveis));

    res.status(201).json({
        success: true,
        message: 'Cobertura registrada com sucesso!',
        data: cobertura
    });
});

router.put('/:id', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);
    const id = ensurePositiveInt(req.params.id, 'Cobertura');

    const cobertura = await withTransaction(sql, pool, async (tx) => updateCobertura(tx, id, req.body || {}, visiveis));

    res.json({
        success: true,
        message: 'Cobertura atualizada com sucesso!',
        data: cobertura
    });
});

router.delete('/:id', async (req, res) => {
    const pool = await conectar();
    const visiveis = await colaboradoresVisiveis(pool, req);
    const id = ensurePositiveInt(req.params.id, 'Cobertura');

    const removida = await withTransaction(sql, pool, async (tx) => deleteCobertura(tx, id, visiveis));

    res.json({
        success: true,
        message: 'Cobertura removida.',
        data: removida
    });
});

module.exports = router;

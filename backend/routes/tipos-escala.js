const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../db/transactions');
const {
    aplicarTipoEscalaNoColaborador,
    createTipoEscala,
    findTipoEscalaById,
    listTiposEscala,
    updateTipoEscala
} = require('../services/tipos-escala');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

// Lista tolerante a banco desatualizado: sem as tabelas devolve vazio em vez
// de 409, para a tela de colaborador continuar abrindo (o select de tipo
// simplesmente nao aparece).
router.get('/', async (req, res) => {
    const pool = await conectar();
    const incluirInativos = String(req.query.includeInactive || '').trim().toLowerCase() === 'true';

    const items = await listTiposEscala(pool, {
        onlyActive: !incluirInativos
    });

    res.json({ total: items.length, items });
});

router.get('/:id', async (req, res) => {
    const pool = await conectar();
    const tipoEscala = await findTipoEscalaById(pool, req.params.id);

    res.json(tipoEscala);
});

router.post('/', async (req, res) => {
    const pool = await conectar();

    const tipoEscala = await withTransaction(sql, pool, async (tx) => createTipoEscala(tx, req.body || {}));

    res.status(201).json({
        success: true,
        message: 'Tipo de escala criado com sucesso!',
        data: tipoEscala
    });
});

router.put('/:id', async (req, res) => {
    const pool = await conectar();

    const tipoEscala = await withTransaction(sql, pool, async (tx) => updateTipoEscala(
        tx,
        req.params.id,
        req.body || {}
    ));

    res.json({
        success: true,
        message: 'Tipo de escala atualizado com sucesso!',
        data: tipoEscala
    });
});

// Aplicar o molde num colaborador: escreve a jornada semanal dele e grava o
// vinculo. E um ponto de partida — depois disso o colaborador pode divergir
// do tipo sem que nada seja desfeito.
router.post('/:id/aplicar/:colaboradorId', async (req, res) => {
    const pool = await conectar();
    const colaboradorId = ensurePositiveInt(req.params.colaboradorId, 'Colaborador');

    const resultado = await withTransaction(sql, pool, async (tx) => aplicarTipoEscalaNoColaborador(
        tx,
        req.params.id,
        colaboradorId
    ));

    res.json({
        success: true,
        message: `Tipo de escala "${resultado.tipoEscala.nome}" aplicado ao colaborador.`,
        data: {
            colaboradorId,
            tipoEscala: resultado.tipoEscala,
            jornadaSemanal: resultado.jornadaSemanal
        }
    });
});

module.exports = router;

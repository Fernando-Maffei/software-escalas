const express = require('express');

const { sql, conectar } = require('../db');
const { getSchemaInfo } = require('../db/schema');
const { withTransaction } = require('../db/transactions');
const {
    createFolgaDomingo,
    deleteFolgaDomingo,
    findFolgaDomingoById,
    listFolgasDomingo,
    updateFolgaDomingo
} = require('../services/folgas-domingo');
const { deleteEscalaDiaByOrigin, ensureEscalaDiaForPeriod } = require('../services/escala');
const { ensurePositiveInt } = require('../lib/validation');

const router = express.Router();

// A janela que a escala precisa regerar. Inclui as datas ANTIGAS: mudar a
// reposicao de quinta para sexta tem que apagar a linha da quinta, e para isso
// a quinta precisa entrar no periodo regerado.
function janelaAfetada(...folgas) {
    const datas = folgas
        .filter(Boolean)
        .flatMap((folga) => [folga.dataDomingo, folga.dataReposicao])
        .filter(Boolean)
        .sort();

    if (!datas.length) {
        return null;
    }

    return { inicio: datas[0], fim: datas[datas.length - 1] };
}

// Limpa as linhas de escala que esta folga gerou e manda regerar a janela.
// Sempre nesta ordem: a hidratacao so recria o que a folga ainda diz, entao
// uma data que saiu do registro some da escala em vez de ficar orfa.
async function ressincronizarEscala(tx, schema, folgaId, janela) {
    await deleteEscalaDiaByOrigin(tx, 'folga_domingo', folgaId);

    if (janela) {
        await ensureEscalaDiaForPeriod(tx, schema, janela.inicio, janela.fim);
    }
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const items = await listFolgasDomingo(pool, schema, {
        dataInicio: req.query.dataInicio,
        dataFim: req.query.dataFim,
        colaboradorId: req.query.colaboradorId,
        allowMissingTable: true
    });

    res.json({ total: items.length, items });
});

router.get('/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    res.json(await findFolgaDomingoById(pool, schema, req.params.id));
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const folga = await withTransaction(sql, pool, async (tx) => {
        const criada = await createFolgaDomingo(tx, schema, req.body || {});
        await ressincronizarEscala(tx, schema, criada.id, janelaAfetada(criada));
        return criada;
    });

    res.status(201).json({
        success: true,
        message: 'Folga de domingo registrada com sucesso!',
        data: folga
    });
});

router.put('/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const id = ensurePositiveInt(req.params.id, 'Folga de domingo');

    const folga = await withTransaction(sql, pool, async (tx) => {
        const anterior = await findFolgaDomingoById(tx, schema, id);
        const atualizada = await updateFolgaDomingo(tx, schema, id, req.body || {});
        await ressincronizarEscala(tx, schema, id, janelaAfetada(anterior, atualizada));
        return atualizada;
    });

    res.json({
        success: true,
        message: 'Folga de domingo atualizada com sucesso!',
        data: folga
    });
});

router.delete('/:id', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const id = ensurePositiveInt(req.params.id, 'Folga de domingo');

    const removida = await withTransaction(sql, pool, async (tx) => {
        const folga = await deleteFolgaDomingo(tx, schema, id);
        // A cobertura nao e apagada aqui: aquela linha pertence ao plantao e
        // volta sozinha a ser 'plantao' na regeracao, porque nao ha mais folga
        // dizendo que era cobertura.
        await ressincronizarEscala(tx, schema, id, janelaAfetada(folga));
        return folga;
    });

    res.json({
        success: true,
        message: 'Folga de domingo removida.',
        data: removida
    });
});

module.exports = router;

const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../db/transactions');
const { colaboradoresVisiveis, exigirColaboradorVisivel } = require('../auth/acesso-setores');
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
async function ressincronizarEscala(tx, folgaId, janela) {
    await deleteEscalaDiaByOrigin(tx, 'folga_domingo', folgaId);

    if (janela) {
        await ensureEscalaDiaForPeriod(tx, janela.inicio, janela.fim);
    }
}

router.get('/', async (req, res) => {
    const pool = await conectar();

    const items = await listFolgasDomingo(pool, {
        dataInicio: req.query.dataInicio,
        dataFim: req.query.dataFim,
        colaboradorId: req.query.colaboradorId
    });

    const visiveis = await colaboradoresVisiveis(pool, req);
    const filtrados = visiveis ? items.filter((item) => visiveis.has(Number(item.colaboradorId))) : items;

    res.json({ total: filtrados.length, items: filtrados });
});

router.get('/:id', async (req, res) => {
    const pool = await conectar();

    const folga = await findFolgaDomingoById(pool, req.params.id);
    exigirColaboradorVisivel(await colaboradoresVisiveis(pool, req), folga.colaboradorId);

    res.json(folga);
});

router.post('/', async (req, res) => {
    const pool = await conectar();

    const folga = await withTransaction(sql, pool, async (tx) => {
        const criada = await createFolgaDomingo(tx, req.body || {});
        await ressincronizarEscala(tx, criada.id, janelaAfetada(criada));
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
    const id = ensurePositiveInt(req.params.id, 'Folga de domingo');

    const folga = await withTransaction(sql, pool, async (tx) => {
        const anterior = await findFolgaDomingoById(tx, id);
        const atualizada = await updateFolgaDomingo(tx, id, req.body || {});
        await ressincronizarEscala(tx, id, janelaAfetada(anterior, atualizada));
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
    const id = ensurePositiveInt(req.params.id, 'Folga de domingo');

    const removida = await withTransaction(sql, pool, async (tx) => {
        const folga = await deleteFolgaDomingo(tx, id);
        // A cobertura nao e apagada aqui: aquela linha pertence ao plantao e
        // volta sozinha a ser 'plantao' na regeracao, porque nao ha mais folga
        // dizendo que era cobertura.
        await ressincronizarEscala(tx, id, janelaAfetada(folga));
        return folga;
    });

    res.json({
        success: true,
        message: 'Folga de domingo removida.',
        data: removida
    });
});

module.exports = router;

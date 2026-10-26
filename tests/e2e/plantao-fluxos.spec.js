// Roteiros de Lancar Plantao e Escala do Dia (so na instancia de teste):
// conferem o que a auditoria dessas telas corrigiu — gravacao duplicada,
// reflexo do plantao na escala e buscas repetidas ao trocar de dia.
const { test, expect } = require('@playwright/test');
const { observarErros, abrirTela, esperarCalmaria } = require('./apoio');

const sufixo = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

function isoDe(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

// Segundo sabado de daqui a dois meses: a regua abre no mes atual e o
// roteiro anda duas vezes com a seta.
function sabadoDaquiADoisMeses() {
    const hoje = new Date();
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 8, 12);

    while (data.getDay() !== 6) {
        data.setDate(data.getDate() + 1);
    }

    return isoDe(data);
}

let estado;

test.beforeEach(({ page }) => {
    estado = observarErros(page);
});

test.afterEach(() => {
    estado.fecharPasso();
    expect(estado.erros, 'Erros de JavaScript/API durante o roteiro').toEqual([]);
});

test('plantao: clique duplo em salvar grava uma vez, aparece na escala e sai ao excluir', async ({ page }) => {
    const api = page.request;
    const setores = await (await api.get('/api/setores')).json();
    const criado = await api.post('/api/colaboradores', {
        data: {
            nome: `Plantao ${sufixo()}`,
            setorId: Array.isArray(setores) && setores[0] ? (setores[0].Id ?? setores[0].id) : null,
            trabalhoInicio: '08:00',
            trabalhoFim: '17:00',
            almocoInicio: '12:00',
            almocoFim: '13:00'
        }
    });
    expect(criado.status(), await criado.text()).toBe(201);
    const colaboradorId = Number((await criado.json()).data.Id);

    const dia = sabadoDaquiADoisMeses();
    // Sobra de uma rodada anterior: 404 aqui e o esperado.
    await api.delete(`/api/plantoes/${dia}`);

    await abrirTela(page, estado, 'lancamentoPlantao');
    await page.locator('#plantaoProximoBtn').click();
    await page.locator('#plantaoProximoBtn').click();
    await page.locator(`[data-plantao-sabado="${dia}"]`).click();
    await expect(page.locator('#plantaoEditor')).toBeVisible();

    await page.locator('#plantaoNovoColaborador').selectOption(String(colaboradorId));
    await page.locator('#plantaoNovoInicio').fill('08:00');
    await page.locator('#plantaoNovoFim').fill('12:00');
    await page.locator('#plantaoEditor [data-chamar="confirmarLancamentoPlantao"]').click();
    await expect(page.locator('#plantaoEditor .plantao-linha')).toHaveCount(1);

    const gravacoes = [];
    page.on('request', (requisicao) => {
        if (requisicao.method() !== 'GET' && requisicao.url().includes('/api/plantoes')) {
            gravacoes.push(`${requisicao.method()} ${requisicao.url()}`);
        }
    });

    await page.locator('#plantaoEditor [data-chamar="salvarPlantao"]').dblclick();
    await expect(page.locator('#plantaoEditor')).toBeHidden();
    await expect(page.locator(`[data-plantao-sabado="${dia}"]`)).toHaveClass(/is-lancado/);
    await esperarCalmaria(page, estado);
    expect(gravacoes, 'o clique duplo gravou o dia mais de uma vez').toHaveLength(1);

    const escala = await (await api.get(`/api/escala/dia/${dia}`)).json();
    const item = escala.items.find((linha) => Number(linha.colaboradorId) === colaboradorId);
    expect(item, `o plantao nao entrou na escala de ${dia}`).toBeTruthy();
    expect(item.origemTipo).toBe('plantao');
    expect(String(item.horaInicio).slice(0, 5)).toBe('08:00');

    // Abrir de novo e salvar sem mudar nada nao manda nada ao servidor.
    await page.locator(`[data-plantao-sabado="${dia}"]`).click();
    await expect(page.locator('#plantaoEditor .plantao-linha')).toHaveCount(1);
    await page.locator('#plantaoEditor [data-chamar="salvarPlantao"]').click();
    await expect(page.locator('#plantaoEditor')).toBeHidden();
    await esperarCalmaria(page, estado);
    expect(gravacoes, 'salvar sem alteracao regravou o dia').toHaveLength(1);

    page.once('dialog', (dialogo) => dialogo.accept());
    await page.locator(`[data-plantao-sabado="${dia}"]`).click();
    await page.locator('#plantaoEditor [data-chamar="excluirPlantao"]').click();
    await expect(page.locator(`[data-plantao-sabado="${dia}"]`)).not.toHaveClass(/is-lancado/);
    await esperarCalmaria(page, estado);
    expect(gravacoes).toHaveLength(2);

    expect((await api.get(`/api/plantoes/${dia}`)).status()).toBe(404);
    const depois = await (await api.get(`/api/escala/dia/${dia}`)).json();
    expect(
        depois.items.some((linha) => Number(linha.colaboradorId) === colaboradorId && linha.origemTipo === 'plantao'),
        'o plantao excluido continuou na escala do dia'
    ).toBe(false);
});

test('escala do dia: trocar de dia nao refaz a busca da faixa da semana; voltar a tela refaz', async ({ page }) => {
    const buscasDaFaixa = [];
    page.on('request', (requisicao) => {
        if (requisicao.url().includes('/api/escala/relatorio')) {
            buscasDaFaixa.push(requisicao.url());
        }
    });

    await abrirTela(page, estado, 'escala');
    await expect(page.locator('.escala-week-pill.is-selected')).toHaveCount(1);
    await esperarCalmaria(page, estado);
    buscasDaFaixa.length = 0;

    const seletor = page.locator('#seletorDataEscala');
    const inicio = await seletor.inputValue();

    for (let passo = 1; passo <= 3; passo += 1) {
        await page.locator('#btnDiaProximoEscala').click();
        const [ano, mes, diaDoMes] = inicio.split('-').map(Number);
        await expect(seletor).toHaveValue(isoDe(new Date(ano, mes - 1, diaDoMes + passo, 12)));
        await esperarCalmaria(page, estado);
    }

    expect(buscasDaFaixa, 'andar um dia refez o relatorio de 12 semanas da faixa').toEqual([]);

    // A data aberta sobrevive a ida e volta; a faixa busca de novo porque
    // algo pode ter mudado na outra tela.
    const aberta = await seletor.inputValue();
    await page.locator('.sidebar-btn[data-page="dashboard"]').click();
    await esperarCalmaria(page, estado);
    buscasDaFaixa.length = 0;
    await page.locator('.sidebar-btn[data-page="escala"]').click();
    await expect(page.locator('#seletorDataEscala')).toHaveValue(aberta);
    await expect(page.locator('.escala-week-pill.is-selected')).toHaveAttribute('data-dia', aberta);
    await esperarCalmaria(page, estado);
    expect(buscasDaFaixa).toHaveLength(1);
});

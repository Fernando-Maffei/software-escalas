// Roteiros de ponta a ponta (so na instancia de teste): fazem o caminho de um
// usuario do comeco ao fim e conferem o RESULTADO. E o tipo de defeito que o
// clique aleatorio nao pega, porque nada quebra: o dado so aparece errado.
const { test, expect } = require('@playwright/test');
const { observarErros, abrirTela } = require('./apoio');

const sufixo = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

function isoDe(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

// Uma quarta-feira daqui a algumas semanas que nao seja feriado: evita que a
// regra de feriado mascare o que o roteiro quer conferir.
async function quartaSemFeriado(api) {
    const resposta = await api.get('/api/feriados');
    const feriados = resposta.ok() ? await resposta.json() : [];
    const datasFeriado = new Set((Array.isArray(feriados) ? feriados : [])
        .map((f) => String(f.Data || f.data || '').slice(0, 10)));
    const data = new Date();
    data.setDate(data.getDate() + 21 + ((3 - data.getDay() + 7) % 7));

    while (datasFeriado.has(isoDe(data))) {
        data.setDate(data.getDate() + 7);
    }

    return isoDe(data);
}

async function primeiroSetorId(api) {
    const resposta = await api.get('/api/setores');
    const setores = resposta.ok() ? await resposta.json() : [];
    const primeiro = Array.isArray(setores) ? setores[0] : null;
    return primeiro ? (primeiro.Id ?? primeiro.id ?? null) : null;
}

let estado;

test.beforeEach(({ page }) => {
    estado = observarErros(page);
});

test.afterEach(() => {
    estado.fecharPasso();
    expect(estado.erros, 'Erros de JavaScript/API durante o roteiro').toEqual([]);
});

test('cadastrar colaborador pela tela e ve-lo na lista', async ({ page }) => {
    const nome = `Roteiro ${sufixo()}`;

    await abrirTela(page, estado, 'colaboradores');
    await page.locator('#btnNovoColaborador').click();
    await page.locator('#editorNome').fill(nome);

    const setores = await page.locator('#editorSetorId option').evaluateAll(
        (opcoes) => opcoes.map((o) => o.value).filter(Boolean)
    );

    if (setores.length) {
        await page.locator('#editorSetorId').selectOption(setores[0]);
    }

    await page.locator('#editorTrabInicio').fill('08:00');
    await page.locator('#editorTrabFim').fill('17:00');
    await page.locator('#editorAlmInicio').fill('12:00');
    await page.locator('#editorAlmFim').fill('13:00');
    await page.locator('#colaboradorEditorContent .editor-actions .btn-primary').click();

    await expect(page.locator('.colaborador-nome', { hasText: nome })).toBeVisible();

    const lista = await (await page.request.get('/api/colaboradores')).json();
    expect(lista.some((c) => c.Nome === nome), 'o colaborador aparece na tela mas nao foi gravado').toBeTruthy();
});

test('folga lancada aparece na escala do dia', async ({ page }) => {
    const api = page.request;
    const criado = await api.post('/api/colaboradores', {
        data: {
            nome: `Folga ${sufixo()}`,
            setorId: await primeiroSetorId(api),
            trabalhoInicio: '08:00',
            trabalhoFim: '17:00',
            almocoInicio: '12:00',
            almocoFim: '13:00'
        }
    });
    expect(criado.status(), await criado.text()).toBe(201);
    const colaboradorId = Number((await criado.json()).data.Id);

    const dia = await quartaSemFeriado(api);
    const ausencia = await api.post('/api/ausencias', {
        data: { colaboradorId, tipo: 'folga', dataInicio: dia, dataFim: dia, periodoTipo: 'dia_inteiro' }
    });
    expect(ausencia.status(), await ausencia.text()).toBe(201);

    const escala = await (await api.get(`/api/escala/dia/${dia}`)).json();
    const item = escala.items.find((i) => Number(i.colaboradorId) === colaboradorId);

    expect(item, `o colaborador nao aparece na escala de ${dia}`).toBeTruthy();
    expect(item.origemTipo, 'a escala nao ficou ligada a ausencia').toBe('ausencia');
    expect(item.tipo, 'a folga nao mudou o tipo do dia na escala').not.toBe('normal');
});

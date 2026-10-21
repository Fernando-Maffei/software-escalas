// Roteiro A/B do frontend: o mesmo roteiro de interacoes (todas as telas,
// editar/cancelar lancamento, excluir, relatorios, barra lateral) numa demo de
// referencia e na demo atual, com relogio fixo. Grava texto das telas, modais,
// valores de formulario, classes do body e erros de console de cada passo.
// Usado para provar que uma refatoracao de tela nao mudou comportamento
// (M15, no AUDITORIA.md). Passo a passo:
//
//   git worktree add ../referencia <commit-antes>
//   (cd ../referencia && DEMO_PORTA=4471 node tests/e2e/servidor-demo.js) &
//   DEMO_PORTA=4470 node tests/e2e/servidor-demo.js &
//   node tests/e2e/comparar-ab/roteiro.js http://127.0.0.1:4471/ antes.json
//   node tests/e2e/comparar-ab/roteiro.js http://127.0.0.1:4470/ depois.json
//   node tests/e2e/comparar-ab/comparar.js antes.json depois.json
const fs = require('fs');
const { chromium } = require('@playwright/test');

const [url, saida] = process.argv.slice(2);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    // relogio fixo: as duas execucoes veem o mesmo "agora"
    await page.clock.install({ time: new Date('2026-09-26T10:30:00') });
    // A demo nao tem ausencias; injeta uma lista fixa (igual nas duas execucoes)
    // por cima do fetch do mock, refletindo exclusoes, para exercitar editar
    // ausencia (banco de horas) e excluir.
    await page.addInitScript(() => {
        let ausencias = [
            { Id: 1, ColaboradorId: 1, Tipo: 'ferias', Subtipo: 'ferias', DataInicio: '2026-09-14T00:00:00.000Z', DataFim: '2026-09-18T00:00:00.000Z', PeriodoTipo: 'dia_inteiro', DescontaBancoHoras: false, HoraInicio: null, HoraFim: null, Observacao: 'viagem' },
            { Id: 2, ColaboradorId: 3, Tipo: 'ausencia', Subtipo: 'comum', DataInicio: '2026-09-22T00:00:00.000Z', DataFim: '2026-09-22T00:00:00.000Z', PeriodoTipo: 'horas', DescontaBancoHoras: true, HoraInicio: '08:00', HoraFim: '12:00', Observacao: null },
            { Id: 3, ColaboradorId: 5, Tipo: 'folga', Subtipo: 'folga', DataInicio: '2026-09-25T00:00:00.000Z', DataFim: '2026-09-25T00:00:00.000Z', PeriodoTipo: 'dia_inteiro', DescontaBancoHoras: true, HoraInicio: null, HoraFim: null, Observacao: null }
        ];
        // O primeiro fetch instalado e o do mock (demo/mock-api.js): so ele e
        // embrulhado. Quem instalar depois (o vigia de sessao do api.js) embrulha
        // o nosso, como faria normalmente.
        let atual = window.fetch;
        let instalados = 0;
        Object.defineProperty(window, 'fetch', {
            configurable: true,
            get() {
                return atual;
            },
            set(v) {
                instalados++;
                if (instalados > 1) {
                    atual = v;
                    return;
                }
                const mock = v;
                atual = function (entrada, opcoes) {
                    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
                    const metodo = ((opcoes && opcoes.method) || 'GET').toUpperCase();
                    const m = url.match(/\/api\/ausencias(?:\/(\d+))?(?:\?|$)/);
                    if (m && metodo === 'GET' && !m[1]) {
                        return Promise.resolve(new Response(JSON.stringify(ausencias), { headers: { 'Content-Type': 'application/json' } }));
                    }
                    if (m && metodo === 'DELETE' && m[1]) {
                        ausencias = ausencias.filter((a) => a.Id !== Number(m[1]));
                    }
                    return mock(entrada, opcoes);
                };
            }
        });
    });
    const erros = [];
    page.on('console', (m) => {
        if (m.type() === 'error') {erros.push(m.text());}
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    page.on('dialog', (d) => d.accept());
    const passos = [];

    async function snap(nome) {
        await espera(700);
        const s = await page.evaluate(() => {
            const visivel = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            const modais = [...document.querySelectorAll('.modal, [id^=modal], .lc-modal, .editor-panel, #colaboradorEditor, #relatorioVisualizacao')]
                .filter(visivel)
                .filter((m) => !m.classList.contains('hidden'))
                .map((m) => `${m.id}: ${m.innerText}`);
            const valores = [...document.querySelectorAll('input, select, textarea')]
                .filter((e) => e.id && visivel(e))
                .map((e) => `${e.id}=${e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value}`);
            return {
                hash: location.hash,
                body: document.body.className,
                ativo: [...document.querySelectorAll('.sidebar-btn.active')].map((b) => b.dataset.page).join(','),
                app: document.getElementById('appContent')?.innerText || '',
                modais,
                valores
            };
        });
        passos.push({ nome, ...s, erros: erros.splice(0) });
    }
    async function clicar(sel, opcional = false) {
        const ok = await page.evaluate((s) => {
            const todos = [...document.querySelectorAll(s)];
            const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            const el = todos.find(visivel) || todos[0];
            if (!el) {return false;}
            el.click();
            return true;
        }, sel);
        if (!ok && !opcional) {passos.push({ nome: `FALTOU ${sel}` });}
        return ok;
    }
    async function menu(pagina) {
        await clicar(`.sidebar-btn[data-page="${pagina}"]`);
        await espera(1500);
        await snap(`tela ${pagina}`);
    }

    await page.goto(url);
    await espera(3000);
    await snap('inicio');

    await menu('calendario');
    await clicar('#nextMonth');
    await snap('calendario proximo mes');
    await clicar('#prevMonth');
    await clicar('#prevMonth');
    await snap('calendario mes anterior');
    await clicar('#nextMonth');

    await clicar('#btnLancamentoAjuste');
    await snap('modal lancamento');
    if (await clicar('#modalLancamento [data-acao="editar"]', true)) {
        await snap('editando lancamento');
        await clicar('#cancelarEdicaoLancamentoBtn');
        await snap('edicao cancelada');
    }
    await clicar('#tabFeriados');
    await snap('aba feriados');
    if (await clicar('#modalLancamento [data-acao="editar"]', true)) {
        await snap('editando feriado');
        await clicar('#cancelarEdicaoLancamentoBtn');
        await snap('feriado cancelado');
    }
    await clicar('#tabPessoal');
    // ausencia (caminho com banco de horas; as injetadas acima sao de setembro)
    if (await clicar('#modalLancamento [data-acao="editar"][data-escopo-tipo="pessoal"]', true)) {
        await snap('editando ausencia');
        await clicar('#cancelarEdicaoLancamentoBtn');
        await snap('ausencia cancelada');
    }
    await clicar('#fecharModalLancamentoBtn');
    await snap('modal fechado');

    await clicar('#calendar .day:nth-of-type(12)');
    await snap('clique no dia');
    await clicar('#fecharModalLancamentoBtn', true);

    await menu('dashboard');
    await menu('colaboradores');
    if (await clicar('.colaborador-card', true)) {await snap('editor colaborador');}
    await clicar('#fecharColaboradorEditor, [onclick*="fecharColaboradorEditor"], [data-chamar="fecharColaboradorEditor"]', true);
    await snap('editor colaborador fechado');

    await menu('escala');
    if (await clicar('.escala-row, .escala-timeline-row, [data-colaborador-id]', true)) {await snap('escala editor');}
    await clicar('[onclick*="fecharEditor"], [data-chamar="fecharEditor"]', true);

    await menu('lancamentoPlantao');
    if (await clicar('[data-plantao-sabado], [data-plantao-data], .plantao-dia, .regua-plantao button', true)) {await snap('plantao editor');}
    await clicar('[data-chamar="cancelarPlantaoEditor"], [onclick*="fecharPlantaoEditor"], [data-chamar="fecharPlantaoEditor"]', true);

    await menu('bancoHoras');
    await menu('relatorios');
    if (await clicar('[onclick*="gerarRelatorioCompleto"], [data-chamar="gerarRelatorioCompleto"]', true)) {
        await espera(1500);
        await snap('relatorio completo');
        await clicar('[onclick*="fecharRelatorio"], [data-chamar="fecharRelatorio"]', true);
    }
    if (await clicar('[onclick*="gerarRelatorioPlantoes"], [data-chamar="gerarRelatorioPlantoes"]', true)) {
        await espera(1500);
        await snap('relatorio plantoes');
    }
    if (await clicar('[onclick*="gerarRelatorioEscala"], [data-chamar="gerarRelatorioEscala"]', true)) {
        await espera(1500);
        await snap('relatorio escala');
    }
    await menu('configuracoes');
    await menu('usuarios');

    // exclusao pelo modal de lancamentos
    await menu('calendario');
    await clicar('#btnLancamentoAjuste');
    if (await clicar('#modalLancamento [data-acao="excluir"]', true)) {
        await snap('confirmar exclusao');
        await page.evaluate(() => {
            const s = document.getElementById('senhaExclusaoInput');
            if (s) {s.value = 'demo';}
        });
        const alvo = await page.evaluate(() => [...document.querySelectorAll('#modalConfirmacao button')].map((b) => `${b.id}|${b.className}|${b.innerText.trim()}`));
        passos.push({ nome: 'botoes confirmacao', app: JSON.stringify(alvo) });
        await clicar('#confirmarExclusaoBtn, #btnConfirmarExclusao, #modalConfirmacao .btn-danger', true);
        await espera(1500);
        await snap('apos exclusao');
    }
    await clicar('#fecharModalLancamentoBtn', true);

    // recolher barra lateral
    await clicar('#toggleMainSidebar');
    await snap('barra recolhida');
    await clicar('#toggleMainSidebar');
    await snap('barra expandida');

    fs.writeFileSync(saida, JSON.stringify(passos, null, 1));
    await browser.close();
    console.log(`${passos.length} passos`);
})();

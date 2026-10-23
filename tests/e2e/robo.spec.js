// Robo de testes: age como um usuario "sem juizo". Entra em cada tela do
// menu, clica em botoes, abre modais e preenche campos com dados aleatorios,
// varias vezes, observando o que quebra: erro de JavaScript, resposta 5xx da
// API, area principal que fica em branco, texto digitado executado como HTML.
//
// Variaveis (PowerShell: $env:ROBO_ACOES="200"; npm run e2e:demo):
//   ROBO_ACOES    acoes por tela (padrao 25)
//   ROBO_RODADAS  quantas vezes passa por todas as telas (padrao 1)
//   ROBO_SEMENTE  repete exatamente uma execucao anterior (sai no relatorio)
const { test } = require('@playwright/test');
const {
    TELAS,
    criarSorteio,
    hashTexto,
    observarErros,
    esperarCalmaria,
    abrirTela,
    entrar
} = require('./apoio');

const SEMENTE = Number(process.env.ROBO_SEMENTE) || 1;
const ACOES = Number(process.env.ROBO_ACOES) || 25;
const RODADAS = Number(process.env.ROBO_RODADAS) || 1;
const MAX_ERROS_POR_TELA = 10;

// O robo nunca toca nestes elementos: acoes que tiram o proprio robo do ar
// (sair, trocar a senha do admin, apontar o app para outro banco) ou que
// abrem janelas do sistema operacional (seletor de pasta/arquivo). O menu
// lateral fica de fora porque a navegacao entre telas e sorteada a parte.
const SELETORES_BLOQUEADOS = [
    '.sidebar-btn',
    '#logoutBtn',
    '[data-config-section="banco"]',
    '#selecionarDiretorioBackupBtn',
    '#salvarConfiguracaoBackupBtn',
    '#backupDirectory',
    '#modalTrocarSenha',
    // A propria conta na tela de Usuarios (o card marcado "voce"): limitar os
    // setores dela esconderia do robo os dados das outras telas.
    '.usr-cartao[data-propria]',
    '#trocarSenhaScreen',
    '#loginScreen',
    '#setupScreen',
    'input[type="file"]',
    'a[target="_blank"]'
];
const TEXTO_BLOQUEADO = '\\b(sair|importar|restaurar backup|resetar|redefinir senha|alterar senha|trocar senha|selecionar pasta)\\b';

// O que o robo digita: nomes validos, vazio, limites de tamanho, acentos,
// emoji, HTML e SQL. O <img onerror> denuncia XSS se algum dia for executado.
const TEXTOS = [
    'Robo Teste',
    'Maria da Silva',
    'José Conceição',
    "D'Ávila",
    '',
    '   ',
    '0',
    '-1',
    '99999',
    '31/02/2026',
    'a'.repeat(310),
    '😀 emoji',
    '<b>negrito</b>',
    '<img src=x onerror="window.__roboXss=(window.__roboXss||0)+1">',
    "'; DROP TABLE Colaboradores; --"
];
const TIPOS_TEXTO = ['', 'text', 'search', 'email', 'password', 'tel', 'url'];

const doisDigitos = (n) => String(n).padStart(2, '0');

// Roda dentro do navegador (serializada pelo Playwright): lista o que um
// usuario conseguiria usar agora e marca cada alvo com data-robo-alvo.
function coletarAlvosNoNavegador({ seletores, texto }) {
    const bloqueioTexto = new RegExp(texto, 'i');
    document.querySelectorAll('[data-robo-alvo]').forEach((el) => el.removeAttribute('data-robo-alvo'));

    const visivel = (el) => {
        const r = el.getBoundingClientRect();

        if (r.width < 2 || r.height < 2) {
            return false;
        }

        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };

    // Com um modal aberto o usuario so mexe nele; fora dele o clique cai no
    // fundo escurecido. Pega o ultimo visivel (o de cima).
    const modais = [...document.querySelectorAll('.modal, [role="dialog"], [aria-modal="true"], [class*="overlay"]')]
        .filter((el) => visivel(el) && !el.closest('#loginScreen, #setupScreen'));
    const escopo = modais.length ? modais[modais.length - 1] : document.body;

    const INTERATIVOS = 'button, a[href], input, select, textarea, summary, [onclick], [data-chamar], [role="button"], [role="tab"], [role="menuitem"], [role="option"]';

    const achar = (raiz) => {
        const encontrados = new Set(raiz.querySelectorAll(INTERATIVOS));

        // Clique ligado por addEventListener nao deixa marca no HTML; o
        // cursor de "maozinha" e o melhor indicio disponivel. Filhos que so
        // herdam o cursor do pai sao ignorados.
        raiz.querySelectorAll('div, span, li, td, th, tr, article, label, i, h3, h4').forEach((el) => {
            if (encontrados.has(el) || getComputedStyle(el).cursor !== 'pointer') {
                return;
            }

            const pai = el.parentElement;

            if (pai && getComputedStyle(pai).cursor === 'pointer') {
                return;
            }

            encontrados.add(el);
        });

        return [...encontrados];
    };

    const permitido = (el) => {
        if (!visivel(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        if (el.matches('input[type="hidden"], input[type="range"], input[type="color"]')) {
            return false;
        }

        if (el.matches('input, textarea') && el.readOnly) {
            return false;
        }

        if (seletores.some((seletor) => el.closest(seletor))) {
            return false;
        }

        if (el.matches('a[href]') && el.origin && el.origin !== location.origin) {
            return false;
        }

        const rotulo = (el.innerText || el.title || el.getAttribute('aria-label') || '').slice(0, 200);
        return !bloqueioTexto.test(rotulo);
    };

    let lista = achar(escopo).filter(permitido);

    if (!lista.length && escopo !== document.body) {
        lista = achar(document.body).filter(permitido);
    }

    const alvos = lista.slice(0, 400).map((el, indice) => {
        el.setAttribute('data-robo-alvo', String(indice));

        return {
            indice,
            tag: el.tagName.toLowerCase(),
            tipo: (el.getAttribute('type') || '').toLowerCase(),
            id: el.id || '',
            rotulo: (el.innerText || el.getAttribute('aria-label') || el.title || el.placeholder || el.name || '')
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 40)
        };
    });

    return { alvos, modalAberto: escopo !== document.body };
}

function descreverAlvo(alvo) {
    return `${alvo.tag}${alvo.id ? `#${alvo.id}` : ''}${alvo.rotulo ? ` "${alvo.rotulo}"` : ''}`;
}

function dataAleatoria(sorteio) {
    const ano = new Date().getFullYear() + sorteio.inteiro(-1, 1);
    return `${ano}-${doisDigitos(sorteio.inteiro(1, 12))}-${doisDigitos(sorteio.inteiro(1, 28))}`;
}

async function agir(page, sorteio, alvo) {
    const local = page.locator(`[data-robo-alvo="${alvo.indice}"]`);
    const opcoes = { timeout: 2000 };

    if (alvo.tag === 'select') {
        const valores = await local.evaluate((el) => [...el.options].filter((o) => !o.disabled).map((o) => o.value));

        if (!valores.length) {
            return 'select sem opcoes';
        }

        const valor = sorteio.escolher(valores);
        await local.selectOption(valor, opcoes);
        return `escolher "${valor}"`;
    }

    if (alvo.tag === 'textarea' || (alvo.tag === 'input' && TIPOS_TEXTO.includes(alvo.tipo))) {
        const texto = sorteio.escolher(TEXTOS);
        await local.fill(texto, opcoes);

        if (sorteio.chance(0.2)) {
            await local.press('Enter', opcoes);
            return `digitar ${JSON.stringify(texto.slice(0, 40))} + Enter`;
        }

        return `digitar ${JSON.stringify(texto.slice(0, 40))}`;
    }

    if (alvo.tag === 'input' && alvo.tipo === 'number') {
        const valor = String(sorteio.escolher([sorteio.inteiro(0, 480), -1, 0, 99999, '']));
        await local.fill(valor, opcoes);
        return `digitar ${valor || '(vazio)'}`;
    }

    if (alvo.tag === 'input' && alvo.tipo === 'date') {
        const valor = sorteio.chance(0.1) ? '' : dataAleatoria(sorteio);
        await local.fill(valor, opcoes);
        return `data ${valor || '(vazia)'}`;
    }

    if (alvo.tag === 'input' && alvo.tipo === 'time') {
        const minuto = sorteio.escolher([0, 15, 30, 45, sorteio.inteiro(0, 59)]);
        const valor = sorteio.chance(0.1) ? '' : `${doisDigitos(sorteio.inteiro(0, 23))}:${doisDigitos(minuto)}`;
        await local.fill(valor, opcoes);
        return `hora ${valor || '(vazia)'}`;
    }

    if (alvo.tag === 'input' && alvo.tipo === 'month') {
        const valor = dataAleatoria(sorteio).slice(0, 7);
        await local.fill(valor, opcoes);
        return `mes ${valor}`;
    }

    await local.click(opcoes);
    return 'clicar';
}

// Checagens depois de cada acao. Devolve false se o robo precisou entrar de
// novo (a tela foi recarregada e a acao seguinte deve reabrir a tela).
async function verificarTela(page, estado, contexto) {
    const { tela, demo, passos } = contexto;
    const situacao = await page.evaluate(() => {
        const conteudo = document.getElementById('appContent');
        const autenticado = document.body.classList.contains('authenticated');
        const login = document.getElementById('loginScreen');

        return {
            xss: window.__roboXss || 0,
            naTelaDeLogin: !autenticado && Boolean(login) && !login.classList.contains('hidden'),
            vazia: autenticado && Boolean(conteudo)
                && conteudo.innerText.trim() === ''
                && conteudo.querySelectorAll('canvas, img, svg, iframe').length === 0
        };
    });

    if (situacao.xss > 0) {
        estado.registrar('xss', 'Texto digitado foi executado como HTML (o <img onerror> do robo rodou): risco de XSS.');
    }

    if (situacao.naTelaDeLogin) {
        if (demo) {
            estado.registrar('sessao', 'A demo voltou para a tela de login sem ninguem clicar em "Sair".');
            return true;
        }

        // Na instancia de teste a sessao pode cair por acao do proprio robo
        // (ex.: desativou o admin). Anota e entra de novo.
        estado.avisar('sessao', 'Sessao perdida; o robo entrou de novo.');
        const resposta = await entrar(page.context().request);

        if (!resposta.ok()) {
            throw new Error(
                `O robo perdeu o acesso e nao conseguiu entrar de novo (HTTP ${resposta.status()}). `
                + 'A senha do admin de teste foi alterada ou a conta desativada? Recrie a instancia: npm run teste:derrubar e npm run teste:subir.\n'
                + `Ultimos passos:\n${passos.slice(-10).join('\n')}`
            );
        }

        await abrirTela(page, estado, tela);
        return false;
    }

    if (situacao.vazia) {
        await page.waitForTimeout(800);
        const aindaVazia = await page.evaluate(() => {
            const conteudo = document.getElementById('appContent');
            return Boolean(conteudo) && conteudo.innerText.trim() === '';
        });

        if (aindaVazia) {
            estado.registrar('tela-vazia', 'A area principal (#appContent) ficou em branco.');
        }
    }

    return true;
}

function montarRelatorio(estado, passos, { tela, rodada, projeto }) {
    const linhas = [
        `O robo encontrou ${estado.erros.length} problema(s) na tela "${tela}" (rodada ${rodada}).`,
        ''
    ];

    estado.erros.forEach((erro, i) => {
        linhas.push(`[${i + 1}] ${erro.tipo} no passo #${erro.passo}`);
        linhas.push(`    ${String(erro.mensagem).split('\n').slice(0, 6).join('\n    ')}`);
    });

    const primeiro = estado.erros[0].passo;
    const fim = passos.findIndex((p) => p.startsWith(`#${primeiro} `));
    const trecho = passos.slice(0, fim === -1 ? passos.length : fim + 1).slice(-15);

    linhas.push('', 'Passos ate o primeiro problema:', ...trecho.map((p) => `  ${p}`));
    linhas.push(
        '',
        'Para repetir exatamente esta sequencia (PowerShell):',
        `  $env:ROBO_SEMENTE="${SEMENTE}"; $env:ROBO_ACOES="${ACOES}"; npx playwright test --project=${projeto} -g "rodada-${rodada} ${tela}$"`
    );

    return linhas.join('\n');
}

for (let rodada = 1; rodada <= RODADAS; rodada += 1) {
    for (const tela of TELAS) {
        test(`rodada-${rodada} ${tela}`, async ({ page, context }, info) => {
            test.setTimeout(60000 + ACOES * 5000);

            const sorteio = criarSorteio(hashTexto(`${SEMENTE}|${tela}|${rodada}`));
            const estado = observarErros(page);
            const passos = [];
            const contexto = { tela, demo: info.project.name === 'demo', passos };

            info.annotations.push({ type: 'semente', description: String(SEMENTE) });

            page.on('dialog', async (dialogo) => {
                const mensagem = dialogo.message().replace(/\s+/g, ' ').slice(0, 80);

                if (dialogo.type() === 'prompt') {
                    const resposta = sorteio.escolher(TEXTOS);
                    passos.push(`   -> prompt "${mensagem}" respondido com ${JSON.stringify(resposta.slice(0, 40))}`);
                    await dialogo.accept(resposta);
                    return;
                }

                if (dialogo.type() === 'confirm' && !sorteio.chance(0.75)) {
                    passos.push(`   -> confirm cancelado: "${mensagem}"`);
                    await dialogo.dismiss();
                    return;
                }

                passos.push(`   -> ${dialogo.type()} aceito: "${mensagem}"`);
                await dialogo.accept();
            });

            // Relatorios/PDF podem abrir outra janela; o robo fica na principal.
            context.on('page', (outra) => {
                outra.close().catch(() => {});
            });

            const abriu = await abrirTela(page, estado, tela);
            test.skip(!abriu, `A tela "${tela}" nao aparece no menu para este usuario.`);
            passos.push(`abrir tela ${tela}`);
            estado.fecharPasso();

            let capturas = 0;

            for (let passo = 1; passo <= ACOES && estado.erros.length < MAX_ERROS_POR_TELA; passo += 1) {
                estado.passo = passo;
                const errosAntes = estado.erros.length;
                const { alvos, modalAberto } = await page.evaluate(coletarAlvosNoNavegador, {
                    seletores: SELETORES_BLOQUEADOS,
                    texto: TEXTO_BLOQUEADO
                });
                let descricao;

                if (modalAberto && sorteio.chance(0.1)) {
                    await page.keyboard.press('Escape');
                    descricao = 'tecla Esc';
                } else if (!alvos.length || sorteio.chance(0.04)) {
                    const destino = sorteio.chance(0.5) ? tela : sorteio.escolher(TELAS);
                    await page.locator(`.sidebar-btn[data-page="${destino}"]`).click({ timeout: 2000 }).catch(() => {});
                    descricao = `menu -> ${destino}`;
                } else {
                    const alvo = sorteio.escolher(alvos);

                    try {
                        descricao = `${await agir(page, sorteio, alvo)} em ${descreverAlvo(alvo)}`;
                    } catch (erro) {
                        // Elemento sumiu ou ficou coberto entre a coleta e o clique:
                        // normal numa interface viva, nao e defeito.
                        descricao = `(nao deu para agir em ${descreverAlvo(alvo)}: ${erro.message.split('\n')[0]})`;
                    }
                }

                passos.push(`#${passo} ${descricao}`);
                await esperarCalmaria(page, estado);
                estado.fecharPasso();
                await verificarTela(page, estado, contexto);

                if (estado.erros.length > errosAntes && capturas < 3) {
                    capturas += 1;
                    await info.attach(`erro-no-passo-${passo}.png`, {
                        body: await page.screenshot(),
                        contentType: 'image/png'
                    });
                }
            }

            await info.attach('passos.txt', { body: passos.join('\n'), contentType: 'text/plain' });

            if (estado.avisos.length) {
                await info.attach('avisos.json', {
                    body: JSON.stringify(estado.avisos, null, 2),
                    contentType: 'application/json'
                });
            }

            if (estado.erros.length) {
                throw new Error(montarRelatorio(estado, passos, { tela, rodada, projeto: info.project.name }));
            }
        });
    }
}

// Pecas compartilhadas pelo robo de testes e pelos roteiros de ponta a ponta.
const path = require('path');

// Telas do menu lateral (data-page em frontend/index.html).
const TELAS = [
    'dashboard',
    'calendario',
    'colaboradores',
    'bancoHoras',
    'escala',
    'lancamentoPlantao',
    'relatorios',
    'configuracoes',
    'usuarios'
];

// Credenciais do admin da instancia de TESTE (docker-compose.teste.yml).
// Nunca as da producao: o robo nem aceita apontar para a porta 4450.
const USUARIO_TESTE = process.env.E2E_USUARIO || 'admin';
const SENHA_TESTE = process.env.E2E_SENHA || 'Robo!Teste2026';
const ARQUIVO_SESSAO = path.join(__dirname, '.auth', 'admin.json');

function hashTexto(texto) {
    let hash = 2166136261;

    for (let i = 0; i < texto.length; i += 1) {
        hash ^= texto.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

// Gerador pseudoaleatorio com semente (mulberry32). A mesma semente repete a
// mesma sequencia de escolhas, e e isso que torna reproduzivel um bug achado
// pelo robo.
function criarSorteio(semente) {
    let estado = semente >>> 0;

    const numero = () => {
        estado = (estado + 0x6D2B79F5) >>> 0;
        let t = estado;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        numero,
        inteiro: (min, max) => min + Math.floor(numero() * (max - min + 1)),
        escolher: (lista) => lista[Math.floor(numero() * lista.length)],
        chance: (probabilidade) => numero() < probabilidade
    };
}

function caminhoDaUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname + u.search;
    } catch (erro) {
        return url;
    }
}

// console.error com cara de erro de programacao continua sendo defeito mesmo
// que o app tenha mostrado um toast (ex.: catch que exibe "Cannot read ...").
const ERRO_DE_CODIGO = /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b|is not a function|is not defined|Cannot read properties/;

// Liga os "sensores" na pagina. Vai para `erros` o que indica defeito: erro
// de JavaScript nao tratado, console.error fora de contexto, resposta 5xx,
// requisicao da API que caiu. Vai para `avisos` o que e esperado quando se
// digita lixo: 4xx da validacao e o console.error de um erro que o app tratou
// e mostrou ao usuario. `pendentes` conta requisicoes em voo (ver
// esperarCalmaria).
function observarErros(page) {
    const estado = {
        erros: [],
        avisos: [],
        pendentes: 0,
        passo: 0,
        consolePendentes: [],
        erroTratado: false,
        registrar(tipo, mensagem) {
            const repetido = estado.erros.some((e) => e.tipo === tipo && e.mensagem === mensagem);

            if (!repetido) {
                estado.erros.push({ tipo, mensagem, passo: estado.passo });
            }
        },
        avisar(tipo, mensagem) {
            estado.avisos.push({ tipo, mensagem, passo: estado.passo });
        },
        // Chamado ao fim de cada acao: decide se os console.error dela foram
        // erro tratado (houve 4xx ou toast de erro/aviso) ou defeito.
        fecharPasso() {
            estado.consolePendentes.forEach((texto) => {
                if (estado.erroTratado && !ERRO_DE_CODIGO.test(texto)) {
                    estado.avisar('console', texto);
                } else {
                    estado.registrar('console', texto);
                }
            });
            estado.consolePendentes = [];
            estado.erroTratado = false;
        }
    };

    page.on('pageerror', (erro) => estado.registrar('erro-js', erro.stack || erro.message));

    page.on('console', (msg) => {
        const texto = msg.text();

        // mostrarToast (frontend/js/core/app.js) loga "Toast: <mensagem> (<tipo>)":
        // e assim que o robo sabe que o app avisou o usuario de um erro.
        if (msg.type() === 'log' && /^Toast: [\s\S]* \((error|warning)\)$/.test(texto)) {
            estado.erroTratado = true;
            return;
        }

        // O navegador ja loga "Failed to load resource" para toda resposta
        // 4xx/5xx; o listener de response abaixo cuida disso com mais detalhe.
        if (msg.type() !== 'error' || texto.startsWith('Failed to load resource')) {
            return;
        }

        estado.consolePendentes.push(texto);
    });

    const terminou = () => {
        estado.pendentes = Math.max(0, estado.pendentes - 1);
    };

    page.on('request', () => {
        estado.pendentes += 1;
    });
    page.on('requestfinished', terminou);
    // So a API do proprio app conta como defeito. Servico de fora (o
    // calendario busca feriados em brasilapi.com.br) pode falhar por motivo
    // alheio ao sistema: vira aviso, assim como o console.error que o app faz
    // ao tratar essa falha.
    const daPropriaApi = (url) => {
        try {
            const alvo = new URL(url);
            return alvo.origin === new URL(page.url()).origin && alvo.pathname.startsWith('/api/');
        } catch (erro) {
            return false;
        }
    };
    const ehChamadaDeDados = (req) => ['fetch', 'xhr'].includes(req.resourceType());

    page.on('requestfailed', (req) => {
        terminou();
        const falha = req.failure()?.errorText || '';

        if (falha.includes('ERR_ABORTED') || !ehChamadaDeDados(req)) {
            return;
        }

        if (daPropriaApi(req.url())) {
            estado.registrar('rede', `${req.method()} ${caminhoDaUrl(req.url())} falhou: ${falha}`);
        } else {
            estado.erroTratado = true;
            estado.avisar('externo', `${req.method()} ${req.url()} falhou: ${falha}`);
        }
    });

    page.on('response', (resposta) => {
        const status = resposta.status();

        if (status < 400 || !ehChamadaDeDados(resposta.request())) {
            return;
        }

        const url = resposta.url();
        const metodo = resposta.request().method();

        // Qualquer 4xx/5xx faz o console.error da mesma acao virar aviso: o
        // 4xx e validacao esperada, e o 5xx ja fica registrado aqui.
        estado.erroTratado = true;

        if (!daPropriaApi(url)) {
            estado.avisar('externo', `${metodo} ${url} -> ${status}`);
        } else if (status >= 500) {
            estado.registrar('http-5xx', `${metodo} ${caminhoDaUrl(url)} -> ${status}`);
        } else {
            estado.avisar('http-4xx', `${metodo} ${caminhoDaUrl(url)} -> ${status}`);
        }
    });

    return estado;
}

// Espera a rede ficar quieta por 250ms (ou desiste apos o limite). Mais
// confiavel que waitForLoadState('networkidle'), que so vale para o load
// inicial e nao para as chamadas disparadas por um clique.
async function esperarCalmaria(page, estado, limiteMs = 3000) {
    const inicio = Date.now();
    let quietoDesde = null;

    while (Date.now() - inicio < limiteMs) {
        if (estado.pendentes === 0) {
            quietoDesde = quietoDesde || Date.now();

            if (Date.now() - quietoDesde >= 250) {
                return;
            }
        } else {
            quietoDesde = null;
        }

        await page.waitForTimeout(50);
    }
}

async function abrirTela(page, estado, tela) {
    // A sessao guardada pelo preparo e compartilhada por todos os testes; se
    // algum deles a derrubou, entra de novo em vez de travar na tela de login.
    // Na demo /api/auth/me nem existe no servidor (responde 404), so no mock.
    const sessao = await page.context().request.get('/api/auth/me');

    if (sessao.status() === 401) {
        const resposta = await entrar(page.context().request);

        if (!resposta.ok()) {
            throw new Error(`Nao foi possivel entrar na instancia de teste (HTTP ${resposta.status()}). Recrie com npm run teste:derrubar e npm run teste:subir.`);
        }
    }

    await page.goto('/');
    await page.waitForFunction(() => document.body.classList.contains('authenticated'), null, { timeout: 20000 });

    const botao = page.locator(`.sidebar-btn[data-page="${tela}"]`);

    if (!(await botao.isVisible())) {
        return false;
    }

    await botao.click();
    await esperarCalmaria(page, estado);
    return true;
}

// `contexto` e um APIRequestContext (fixture `request` ou page.context().request,
// que compartilha os cookies com o navegador).
function entrar(contexto) {
    return contexto.post('/api/auth/login', {
        data: { username: USUARIO_TESTE, password: SENHA_TESTE }
    });
}

module.exports = {
    TELAS,
    USUARIO_TESTE,
    SENHA_TESTE,
    ARQUIVO_SESSAO,
    hashTexto,
    criarSorteio,
    observarErros,
    esperarCalmaria,
    abrirTela,
    entrar
};

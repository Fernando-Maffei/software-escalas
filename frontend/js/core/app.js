let ausencias = [];
let colaboradores = [];
let setores = [];
let editandoId = null;
let editandoAusenciaId = null;
let plantoesLancados = [];
let feriadosLocais = []
let editandoFeriadoId = null;
let exclusaoPendenteId = null;
let exclusaoTipo = 'ausencia';


// EXPOR FUNÇÕES GLOBAIS (já está correto)
window.carregarPagina = carregarPagina;
window.abrirModalHorario = abrirModalHorario;
window.debugTiposAusencias = debugTiposAusencias;
window.debugDados = debugDados;
window.testarAtualizacao = testarAtualizacao;
window.ausencias = ausencias;
window.colaboradores = colaboradores;
window.setores = setores;
window.feriadosLocais = feriadosLocais;
window.editarFeriado = editarFeriado;
window.excluirFeriado = excluirFeriado;
window.gerarRelatorioCompleto = gerarRelatorioCompleto;
window.toggleCamposHora = toggleCamposHora;
window.mostrarDetalhesHora = mostrarDetalhesHora;
window.corrigirDataISO = corrigirDataISO;
window.carregarSetores = carregarSetores;

const ESCALA_CORES_STORAGE_KEY = 'escalaCoresPersonalizadas';
const ESCALA_CORES_PADRAO = [
    {
        key: 'trabalhando',
        label: 'Trabalhando',
        description: 'Faixa de trabalho normal',
        icon: 'briefcase',
        color: '#3f74be',
        cssVar: '--escala-status-trabalhando',
        strongVar: '--escala-status-trabalhando-strong'
    },
    {
        key: 'almoco',
        label: 'Almoco',
        description: 'Intervalo de almoco',
        icon: 'utensils',
        color: '#e0973a',
        cssVar: '--escala-status-almoco',
        strongVar: '--escala-status-almoco-strong'
    },
    {
        key: 'folga',
        label: 'Folga',
        description: 'Dia de folga',
        icon: 'bed',
        color: '#94a3b8',
        cssVar: '--escala-status-folga',
        strongVar: '--escala-status-folga-strong'
    },
    {
        key: 'ferias',
        label: 'Ferias',
        description: 'Periodo de ferias',
        icon: 'umbrella-beach',
        color: '#0d9488',
        cssVar: '--escala-status-ferias',
        strongVar: '--escala-status-ferias-strong'
    },
    {
        key: 'ausencia',
        label: 'Ausencia',
        description: 'Ausencia integral',
        icon: 'user-slash',
        color: '#ef4444',
        cssVar: '--escala-status-ausencia',
        strongVar: '--escala-status-ausencia-strong'
    },
    {
        key: 'ausenciaParcial',
        label: 'Ausencia parcial',
        description: 'Bloqueio por horas',
        icon: 'clock',
        color: '#b83b64',
        cssVar: '--escala-status-ausencia-parcial',
        strongVar: '--escala-status-ausencia-parcial-strong'
    },
    {
        key: 'fora',
        label: 'Fora',
        description: 'Fora do horario',
        icon: 'ban',
        color: '#94a3b8',
        cssVar: '--escala-status-fora',
        strongVar: '--escala-status-fora-strong'
    }
];

window.ESCALA_CORES_PADRAO = ESCALA_CORES_PADRAO;
window.aplicarCoresEscala = aplicarCoresEscala;



window.abrirModalFeriado = function(dataISO) {
    window.abrirModalLancamento('feriados', dataISO);
};


// Elemento principal onde o conteúdo será renderizado
const appContent = document.getElementById("appContent");
window.__appBootstrapPromise = window.__appBootstrapPromise || null;

function getApiBaseUrl() {
    if (window.API?.baseURL) {
        return window.API.baseURL;
    }

    const origin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'http://localhost:4450';

    return `${origin.replace(/\/$/, '')}/api`;
}

function apiUrl(path = '') {
    const normalizedPath = String(path || '');

    if (!normalizedPath || normalizedPath === '/') {
        return getApiBaseUrl();
    }

    return normalizedPath.startsWith('/')
        ? `${getApiBaseUrl()}${normalizedPath}`
        : `${getApiBaseUrl()}/${normalizedPath}`;
}

function normalizeLegacyApiUrl(url) {
    if (typeof url !== 'string') {
        return url;
    }

    if (!url.startsWith('http://localhost:3000/api')) {
        return url;
    }

    const suffix = url.slice('http://localhost:3000/api'.length);
    return suffix ? `${getApiBaseUrl()}${suffix}` : getApiBaseUrl();
}

function normalizarCorHex(value, fallback = '#3f74be') {
    const raw = String(value || '').trim();

    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
        return raw.toLowerCase();
    }

    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
        return `#${raw.slice(1).split('').map((char) => char + char).join('')}`.toLowerCase();
    }

    return fallback;
}

function ajustarCorHex(hex, percent = -18) {
    const normalized = normalizarCorHex(hex);
    const value = normalized.replace('#', '');
    const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
    const adjusted = channels.map((channel) => {
        const next = percent < 0
            ? channel + ((channel * percent) / 100)
            : channel + (((255 - channel) * percent) / 100);

        return Math.max(0, Math.min(255, Math.round(next)));
    });

    return `#${adjusted.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function getCoresEscalaPadrao() {
    return ESCALA_CORES_PADRAO.reduce((acc, item) => {
        acc[item.key] = item.color;
        return acc;
    }, {});
}

function carregarCoresEscala() {
    let salvas = {};

    try {
        salvas = JSON.parse(localStorage.getItem(ESCALA_CORES_STORAGE_KEY) || '{}') || {};
    } catch (error) {
        salvas = {};
    }

    return ESCALA_CORES_PADRAO.reduce((acc, item) => {
        acc[item.key] = normalizarCorHex(salvas[item.key], item.color);
        return acc;
    }, {});
}

function aplicarCoresEscala(cores = carregarCoresEscala()) {
    const root = document.documentElement;

    ESCALA_CORES_PADRAO.forEach((item) => {
        const color = normalizarCorHex(cores[item.key], item.color);
        root.style.setProperty(item.cssVar, color);

        if (item.strongVar) {
            // "strong" = a propria cor base: o degrade das celulas (base ->
            // strong) fica chapado, sem o "reflexo de luz"/aspecto glossy.
            root.style.setProperty(item.strongVar, color);
        }
    });
}

function gerarConfiguracaoCoresEscalaHtml() {
    const cores = carregarCoresEscala();

    return ESCALA_CORES_PADRAO.map((item) => `
        <label class="escala-color-option" for="escalaCor_${item.key}">
            <span class="escala-color-icon" style="--escala-color-preview: ${cores[item.key]};">
                <i class="fas fa-${item.icon}"></i>
            </span>
            <span class="escala-color-text">
                <strong>${item.label}</strong>
                <small>${item.description}</small>
            </span>
            <input
                type="color"
                id="escalaCor_${item.key}"
                class="escala-color-input"
                value="${cores[item.key]}"
                data-escala-color-key="${item.key}"
                aria-label="Cor de ${item.label}"
            >
        </label>
    `).join('');
}

function atualizarInputsCoresEscala(cores = carregarCoresEscala()) {
    ESCALA_CORES_PADRAO.forEach((item) => {
        const input = document.getElementById(`escalaCor_${item.key}`);
        const preview = input?.closest('.escala-color-option')?.querySelector('.escala-color-icon');
        const color = normalizarCorHex(cores[item.key], item.color);

        if (input) {
            input.value = color;
        }

        if (preview) {
            preview.style.setProperty('--escala-color-preview', color);
        }
    });
}

function salvarCoresEscala() {
    const cores = {};

    ESCALA_CORES_PADRAO.forEach((item) => {
        const input = document.getElementById(`escalaCor_${item.key}`);
        cores[item.key] = normalizarCorHex(input?.value, item.color);
    });

    localStorage.setItem(ESCALA_CORES_STORAGE_KEY, JSON.stringify(cores));
    aplicarCoresEscala(cores);
    atualizarInputsCoresEscala(cores);
    mostrarToast('Cores da escala salvas!', 'success');
}

function resetarCoresEscala() {
    localStorage.removeItem(ESCALA_CORES_STORAGE_KEY);
    const coresPadrao = getCoresEscalaPadrao();

    aplicarCoresEscala(coresPadrao);
    atualizarInputsCoresEscala(coresPadrao);
    mostrarToast('Cores padrao restauradas!', 'success');
}

function inicializarPersonalizacaoEscala() {
    const inputs = document.querySelectorAll('[data-escala-color-key]');

    inputs.forEach((input) => {
        input.addEventListener('input', () => {
            const cores = carregarCoresEscala();

            inputs.forEach((currentInput) => {
                const key = currentInput.getAttribute('data-escala-color-key');
                cores[key] = normalizarCorHex(currentInput.value, cores[key]);
            });

            aplicarCoresEscala(cores);
            atualizarInputsCoresEscala(cores);
        });
    });

    document.getElementById('salvarCoresEscalaBtn')?.addEventListener('click', salvarCoresEscala);
    document.getElementById('resetarCoresEscalaBtn')?.addEventListener('click', resetarCoresEscala);
    atualizarInputsCoresEscala();
}

aplicarCoresEscala();

const CONFIGURACOES_SECOES = [
    {
        id: 'personalizacao',
        label: 'Personalizacao',
        icon: 'palette',
        description: 'Tema e cores'
    },
    {
        id: 'operacao',
        label: 'Operacao',
        icon: 'sliders-h',
        description: 'Preferencias gerais'
    },
    {
        id: 'banco',
        label: 'Conexao banco',
        icon: 'database',
        description: 'SQL Server e tabelas'
    },
    {
        id: 'backup',
        label: 'Backup',
        icon: 'cloud-upload-alt',
        description: 'Pasta e rotina local'
    },
    {
        id: 'ferramentas',
        label: 'Ferramentas',
        icon: 'tools',
        description: 'Importar e exportar'
    },
    {
        id: 'sobre',
        label: 'Sobre',
        icon: 'info-circle',
        description: 'Versao do sistema'
    }
];

const CONFIGURACOES_SECAO_STORAGE_KEY = 'configuracoesSecaoAtual';

function gerarMenuConfiguracoesHtml() {
    const secaoAtual = getSecaoConfiguracoesAtual();

    return CONFIGURACOES_SECOES.map((secao) => `
        <button
            type="button"
            class="config-section-btn ${secao.id === secaoAtual ? 'is-active' : ''}"
            data-config-tab="${secao.id}"
        >
            <i class="fas fa-${secao.icon}"></i>
            <span>
                <strong>${secao.label}</strong>
                <small>${secao.description}</small>
            </span>
        </button>
    `).join('');
}

function getSecaoConfiguracoesAtual() {
    const saved = localStorage.getItem(CONFIGURACOES_SECAO_STORAGE_KEY);
    return CONFIGURACOES_SECOES.some((secao) => secao.id === saved)
        ? saved
        : 'personalizacao';
}

function ativarSecaoConfiguracoes(secaoId) {
    const nextSection = CONFIGURACOES_SECOES.some((secao) => secao.id === secaoId)
        ? secaoId
        : 'personalizacao';

    localStorage.setItem(CONFIGURACOES_SECAO_STORAGE_KEY, nextSection);

    document.querySelectorAll('[data-config-tab]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-config-tab') === nextSection);
    });

    document.querySelectorAll('[data-config-section]').forEach((card) => {
        card.classList.toggle('is-hidden', card.getAttribute('data-config-section') !== nextSection);
    });
}

function inicializarSecoesConfiguracoes() {
    document.querySelectorAll('[data-config-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            ativarSecaoConfiguracoes(button.getAttribute('data-config-tab'));
        });
    });

    ativarSecaoConfiguracoes(getSecaoConfiguracoesAtual());
}

function escapeNetworkText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function definirStatusComunicacaoRede(variant, message, detail = '') {
    const card = document.getElementById('configNetworkStatus');
    const badge = document.getElementById('configNetworkStatusBadge');
    const text = document.getElementById('configNetworkStatusTexto');
    const detailNode = document.getElementById('configNetworkStatusDetalhe');

    if (!card || !badge || !text || !detailNode) {
        return;
    }

    card.className = `config-status-card is-${variant}`;
    badge.textContent = variant === 'success'
        ? 'Online'
        : variant === 'error'
            ? 'Falha'
            : variant === 'loading'
                ? 'Testando'
                : 'Aguardando';
    text.textContent = message;
    detailNode.textContent = detail;
}

function renderizarUrlsComunicacaoRede(payload = {}) {
    const list = document.getElementById('configNetworkUrls');

    if (!list) {
        return;
    }

    const urls = Array.isArray(payload.server?.urls)
        ? payload.server.urls
        : [window.location.origin].filter(Boolean);

    list.innerHTML = urls.map((url) => `
        <div class="network-url-item">
            <i class="fas fa-link"></i>
            <code>${escapeNetworkText(url)}</code>
        </div>
    `).join('');
}

async function testarComunicacaoRede(options = {}) {
    const startedAt = performance.now();

    definirStatusComunicacaoRede(
        'loading',
        'Testando comunicacao com o servidor...',
        `Base atual da API: ${window.API?.baseURL || getApiBaseUrl()}`
    );

    try {
        const payload = await window.API.getNetworkStatus();
        const latency = Math.max(1, Math.round(performance.now() - startedAt));
        const dbStatus = payload.database?.status === 'connected'
            ? 'banco conectado'
            : 'banco indisponivel';
        const corsText = payload.cors?.mode === 'restricted'
            ? 'CORS restrito por configuracao (CORS_ORIGINS)'
            : 'CORS liberado apenas para a mesma origem';

        renderizarUrlsComunicacaoRede(payload);
        definirStatusComunicacaoRede(
            'success',
            `Servidor respondeu em ${latency} ms; ${dbStatus}.`,
            `${corsText}. Cliente detectado: ${payload.request?.clientIp || 'nao informado'}.`
        );

        if (options.showToast !== false) {
            mostrarToast('Comunicacao com o servidor validada.', 'success');
        }

        return payload;
    } catch (error) {
        definirStatusComunicacaoRede(
            'error',
            'Nao foi possivel comunicar com o servidor.',
            error.message || 'Confira se o servidor esta aberto e se o notebook esta na mesma rede.'
        );

        if (options.showToast !== false) {
            mostrarToast('Falha ao testar comunicacao com o servidor.', 'error');
        }

        return null;
    }
}

function inicializarDiagnosticoRede() {
    const testarBtn = document.getElementById('testarComunicacaoRedeBtn');
    const copiarBtn = document.getElementById('copiarUrlRedeBtn');

    testarBtn?.addEventListener('click', () => testarComunicacaoRede());
    copiarBtn?.addEventListener('click', async () => {
        const url = window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : (window.API?.baseURL || getApiBaseUrl()).replace(/\/api$/, '');

        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error('Clipboard indisponivel');
            }

            await navigator.clipboard.writeText(url);
            mostrarToast('URL copiada para testar no notebook.', 'success');
        } catch (error) {
            mostrarToast(`URL para teste: ${url}`, 'info');
        }
    });

    renderizarUrlsComunicacaoRede({
        server: {
            urls: [window.location.origin].filter(Boolean)
        }
    });

    testarComunicacaoRede({ showToast: false });
}

function definirStatusServidorSegundoPlano(variant, message, detail = '') {
    const card = document.getElementById('backgroundServerStatus');
    const badge = document.getElementById('backgroundServerStatusBadge');
    const text = document.getElementById('backgroundServerStatusTexto');
    const detailNode = document.getElementById('backgroundServerStatusDetalhe');

    if (!card || !badge || !text || !detailNode) {
        return;
    }

    card.className = `config-status-card is-${variant}`;
    badge.textContent = variant === 'success'
        ? 'Configurado'
        : variant === 'error'
            ? 'Falha'
            : variant === 'loading'
                ? 'Processando'
                : 'Pendente';
    text.textContent = message;
    detailNode.textContent = detail;
}

const BACKGROUND_SERVER_ACTION_ROUTES = {
    install: 'instalar',
    start: 'iniciar',
    stop: 'parar',
    uninstall: 'desinstalar'
};

async function chamarApiServidorSegundoPlano(path, options = {}) {
    const response = await fetch(`/api/sistema/servidor-background/${path}`, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel comunicar com o servidor.');
    }

    return data;
}

function renderizarServidorSegundoPlanoStatus(status = {}) {
    const panel = document.getElementById('backgroundServerPanel');
    const urlNode = document.getElementById('backgroundServerRecommendedUrl');
    const commandNode = document.getElementById('backgroundServerCommand');

    if (!panel) {
        return;
    }

    if (status.available === false) {
        panel.classList.add('is-hidden');
        return;
    }

    panel.classList.remove('is-hidden');

    if (urlNode) {
        urlNode.textContent = status.recommendedUrl || '';
    }

    if (commandNode) {
        commandNode.textContent = status.command || '';
    }

    if (status.installed) {
        definirStatusServidorSegundoPlano(
            'success',
            'Servidor em segundo plano configurado para iniciar com o Windows.',
            `Nome da maquina: ${status.machineName || 'nao informado'}; porta: ${status.port || '4450'}.`
        );
        return;
    }

    definirStatusServidorSegundoPlano(
        'neutral',
        'Servidor em segundo plano ainda nao configurado.',
        'Instale a inicializacao automatica nesta maquina servidora para os clientes acessarem sem abrir a tela.'
    );
}

async function carregarServidorSegundoPlanoStatus() {
    try {
        const status = await chamarApiServidorSegundoPlano('status');
        renderizarServidorSegundoPlanoStatus(status);
        return status;
    } catch (error) {
        definirStatusServidorSegundoPlano(
            'error',
            'Nao foi possivel consultar a inicializacao em segundo plano.',
            error.message || ''
        );
        return null;
    }
}

async function executarAcaoServidorSegundoPlano(action) {
    const routePath = BACKGROUND_SERVER_ACTION_ROUTES[action];

    if (!routePath) {
        return;
    }

    const labels = {
        install: 'Instalando inicializacao em segundo plano...',
        start: 'Iniciando servidor em segundo plano...',
        stop: 'Parando servidor em segundo plano...',
        uninstall: 'Removendo inicializacao em segundo plano...'
    };

    definirStatusServidorSegundoPlano('loading', labels[action] || 'Processando...', '');

    try {
        const status = await chamarApiServidorSegundoPlano(routePath, { method: 'POST' });
        renderizarServidorSegundoPlanoStatus(status);
        mostrarToast('Acao concluida.', 'success');
    } catch (error) {
        definirStatusServidorSegundoPlano(
            'error',
            'Nao foi possivel executar a acao solicitada.',
            error.message || ''
        );
        mostrarToast(error.message || 'Erro ao configurar servidor em segundo plano.', 'error');
    }
}

function inicializarServidorSegundoPlano() {
    const panel = document.getElementById('backgroundServerPanel');

    if (!panel) {
        return;
    }

    document.getElementById('instalarServidorSegundoPlanoBtn')?.addEventListener('click', () => executarAcaoServidorSegundoPlano('install'));
    document.getElementById('iniciarServidorSegundoPlanoBtn')?.addEventListener('click', () => executarAcaoServidorSegundoPlano('start'));
    document.getElementById('pararServidorSegundoPlanoBtn')?.addEventListener('click', () => executarAcaoServidorSegundoPlano('stop'));
    document.getElementById('removerServidorSegundoPlanoBtn')?.addEventListener('click', () => executarAcaoServidorSegundoPlano('uninstall'));

    carregarServidorSegundoPlanoStatus();
}

window.testarComunicacaoRede = testarComunicacaoRede;

if (!window.__API_FETCH_NORMALIZER_INSTALLED__ && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = function fetchWithDynamicApiHost(input, init) {
        if (typeof input === 'string') {
            return nativeFetch(normalizeLegacyApiUrl(input), init);
        }

        return nativeFetch(input, init);
    };

    window.__API_FETCH_NORMALIZER_INSTALLED__ = true;
    window.normalizeLegacyApiUrl = normalizeLegacyApiUrl;
}

function inicializarAplicacaoUmaVez() {
    if (window.__appBootstrapPromise) {
        return window.__appBootstrapPromise;
    }

    window.__appBootstrapPromise = (async () => {
        console.log("Inicializando aplicaÃ§Ã£o...");

        const temaSalvo = localStorage.getItem('tema') || 'light';
        document.documentElement.setAttribute('data-theme', temaSalvo);

        try {
            await carregarColaboradores();
            console.log("Colaboradores carregados:", colaboradores.length);

            await carregarAusencias();
            console.log("AusÃªncias carregadas:", ausencias.length);

            await carregarFeriadosLocais();
            console.log("Feriados locais carregados:", feriadosLocais.length);

            if (typeof carregarPlantoes === 'function') {
                await carregarPlantoes();
            }
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            mostrarToast("Erro ao carregar dados do servidor", "error");
        }

        configurarNavegacao();
        configurarModais();
        configurarObservers();

        const paginaInicial = typeof getPaginaFromURL === 'function'
            ? getPaginaFromURL()
            : 'dashboard';

        // Espera o perfil do usuario antes de renderizar: sem isso, um
        // usuario comum veria o dashboard aparecer e so depois ser trocado
        // pelo calendario. Usa window.carregarPagina (e nao a funcao local)
        // porque e nela que js/core/permissoes.js instala o filtro de perfil.
        if (typeof window.aguardarUsuarioAutenticado === 'function') {
            await window.aguardarUsuarioAutenticado();
        }

        console.log("Carregando pÃ¡gina inicial:", paginaInicial);
        window.carregarPagina(paginaInicial);
    })();

    return window.__appBootstrapPromise;
}
document.addEventListener("DOMContentLoaded", async () => {
    inicializarAplicacaoUmaVez();
});



async function testarConexaoBackend() {
    console.log("Testando conexão com backend...");
    
    const testes = [
        { url: 'http://localhost:3000/api/feriados', nome: 'Feriados' },
        { url: 'http://localhost:3000/api/ausencias', nome: 'Ausências' },
        { url: 'http://localhost:3000/api/colaboradores', nome: 'Colaboradores' }
    ];
    
    for (const teste of testes) {
        try {
            const response = await fetch(teste.url);
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ ${teste.nome}: OK (${data.length} registros)`);
            } else {
                console.error(`❌ ${teste.nome}: Erro ${response.status}`);
            }
        } catch (error) {
            console.error(`❌ ${teste.nome}: Falha na conexão`, error.message);
        }
    }
}

window.testarConexaoBackend = testarConexaoBackend;


/* ===========================
   CONFIGURAÇÃO DE MODAIS
=========================== */
// Função para fechar modal
function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
}

let dataSelecionada = null;

// Função para abrir modal de horário
function abrirModalHorario(colaborador) {
    console.log("Abrindo modal de horário...");
    
    const modal = document.getElementById("modalHorario");
    if (!modal) {
        console.error("Modal de horário não encontrado!");
        return;
    }
    
    window.colaboradorEditando = colaborador.Id;
    
    const modalNome = document.getElementById("modalNome");
    const trabInicio = document.getElementById("modalTrabInicio");
    const trabFim = document.getElementById("modalTrabFim");
    const almInicio = document.getElementById("modalAlmInicio");
    const almFim = document.getElementById("modalAlmFim");
    
    if (modalNome) modalNome.innerText = colaborador.Nome;
    if (trabInicio) trabInicio.value = formatarHora(colaborador.TrabalhoInicio);
    if (trabFim) trabFim.value = formatarHora(colaborador.TrabalhoFim);
    if (almInicio) almInicio.value = formatarHora(colaborador.AlmocoInicio);
    if (almFim) almFim.value = formatarHora(colaborador.AlmocoFim);
    
    modal.classList.remove("hidden");
    modal.classList.add("active");
}


// Adicione no início do app.js
function corrigirDataISO(dataStr) {
    if (!dataStr) return dataStr;
    
    // Se já estiver no formato YYYY-MM-DD, retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        return dataStr;
    }
    
    // Se tiver T, extrai só a parte da data
    if (dataStr.includes('T')) {
        return dataStr.split('T')[0];
    }
    
    return dataStr;
}

// Função para cancelar edição
function cancelarEdicaoAusencia() {
    editandoAusenciaId = null;
    
    const colaboradorSelect = document.getElementById("colaboradorSelect");
    const tipoSelect = document.getElementById("tipoSelect");
    const dataInicio = document.getElementById("dataInicio");
    const dataFim = document.getElementById("dataFim");
    const salvarBtn = document.getElementById("salvarAusenciaBtn");
    const cancelarBtn = document.getElementById("cancelarEdicaoLancamentoBtn");
    
    if (colaboradorSelect) colaboradorSelect.value = "";
    if (tipoSelect) tipoSelect.value = "folga";
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";
    if (salvarBtn) salvarBtn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    if (cancelarBtn) cancelarBtn.classList.add("hidden");
}

// Carrega colaboradores no select
function carregarColaboradoresNoSelect() {
    const select = document.getElementById("colaboradorSelect");
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    
    if (colaboradores && colaboradores.length > 0) {
        colaboradores.forEach(c => {
            select.innerHTML += `<option value="${c.Id}">${c.Nome}</option>`;
        });
    }
}




/* ===========================
   NAVEGAÇÃO
=========================== */
function configurarNavegacao() {
   console.log('Navegação configurada');
}

// Pagina que esta montada agora. O popstate abaixo usa para ignorar o eco da
// propria troca de hash (ver comentario no listener).
let paginaCarregadaAtual = null;

function carregarPagina(pagina) {
    console.log('Carregando página:', pagina);

    if (!appContent) return;

    paginaCarregadaAtual = pagina;

    // 🔥 NOVO: Atualiza a URL sem recarregar a página
    window.location.hash = pagina;
    
    // Atualiza o botão ativo na sidebar
    if (typeof window.setActiveButton === 'function') {
        window.setActiveButton(pagina);
    }
    
    // Parar atualização automática do dashboard se estiver saindo dele
    if (pagina !== 'dashboard' && typeof window.pararAtualizacaoAutomatica === 'function') {
        window.pararAtualizacaoAutomatica();
    }
    
    switch (pagina) {
        case "dashboard":
            renderDashboard();
            break;
        case "calendario":
            renderCalendario();
            break;
        case "colaboradores":
            renderColaboradores();
            break;
        case "escala":
            renderEscalaDia();
            break;
        case "lancamentoPlantao":
            renderLancamentoPlantao();
            break;
        case "configuracoes":
            renderConfiguracoes();
            break;
        case "usuarios":
            renderUsuarios();
            break;
        case "relatorios":
            renderRelatorios();
            break;
        case "bancoHoras":
            if (typeof window.renderBancoHoras === 'function') {
                window.renderBancoHoras();
            } else {
                console.error('renderBancoHoras nao carregado');
                renderDashboard();
            }
            break;
        default:
            console.log("Página não encontrada:", pagina);
            renderDashboard(); // Fallback para dashboard
    }
}

function getDiaSemana(dataISO) {
    if (!dataISO) return new Date().getDay();
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia); // mês em JS é 0-11
    return data.getDay(); // 0 = Domingo, 6 = Sábado
}


function buscarPlantaoDoDia(dataISO) {
    console.log('🔍 ===== INICIANDO BUSCA DE PLANTÃO =====');
    console.log('📅 Data recebida:', dataISO);
    
    // 🔥 USAR plantoesLancados DIRETAMENTE, não window.plantoesLancados
    if (!plantoesLancados || plantoesLancados.length === 0) {
        console.log('❌ Nenhum plantão carregado');
        return null;
    }
    
    console.log('📋 Total de plantões:', plantoesLancados.length);
    
    const dataBusca = String(dataISO).trim().split('T')[0];
    console.log('📅 Data de busca limpa:', dataBusca);
    
    // O dia pode ter varios turnos (registros), cada um com sua equipe. Quem
    // esta em QUALQUER turno esta de plantao naquele dia, entao a busca junta
    // todos — pegar so o primeiro registro deixaria de fora quem entrou no
    // turno da tarde.
    const doDia = plantoesLancados.filter(p => {
        let dataPlantao = p.dataISO || p.data_plantao || '';
        dataPlantao = String(dataPlantao).trim().split('T')[0];
        return dataPlantao === dataBusca;
    });

    if (doDia.length > 0) {
        const colaboradoresDoDia = [...new Set(
            doDia.flatMap(p => Array.isArray(p.colaboradores) ? p.colaboradores : [])
        )];

        console.log('✅ Plantão encontrado! Colaboradores:', colaboradoresDoDia);
        return colaboradoresDoDia;
    }

    console.log('❌ Nenhum plantão encontrado para', dataBusca);
    return null;
}


function gerarResumoHorariosVazio() {
    const resumoGrid = document.getElementById('resumoGrid');
    if (!resumoGrid) return;
    
    resumoGrid.innerHTML = `
        <div class="resumo-card" style="grid-column: span 12; text-align: center; padding: 40px;">
            <i class="fas fa-sun" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;"></i>
            <h3 style="color: var(--text); margin-bottom: 8px;">Domingo - Não há expediente</h3>
            <p style="color: var(--text-light);">Nenhum colaborador trabalha aos domingos</p>
        </div>
    `;
}

/* ===========================
   TELA COLABORADORES
=========================== */
function renderColaboradores() {
    appContent.innerHTML = `
        <div class="page-header colaboradores-page-header">
            <h1>Colaboradores</h1>
            <div class="colaboradores-header-actions">
                <button id="btnColaboradoresDesligados" class="btn-secondary" type="button">
                    <i class="fas fa-user-slash"></i> Desligados
                </button>
                <button id="btnNovoColaborador" class="btn-primary">
                    <i class="fas fa-plus"></i> Novo Colaborador
                </button>
            </div>
        </div>

        <div class="colaboradores-layout">
            <!-- LISTA DE COLABORADORES -->
            <div class="colaboradores-container">
                <div class="colaboradores-header">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="searchColaborador" placeholder="Buscar colaborador..." class="form-control">
                    </div>
                    <span class="total-colaboradores">
                        <i class="fas fa-users"></i> Total: ${colaboradores.length}
                    </span>
                </div>
                
                <div id="listaColaboradores" class="colaboradores-grid"></div>
            </div>

            <!-- PAINEL LATERAL DE EDIÇÃO (sempre visível quando aberto) -->
            <div id="colaboradorEditor" class="editor-sidebar" style="display: none;">
                <div class="editor-content" style="opacity: 1; visibility: visible;">
                    <div class="editor-header">
                        <h3><i class="fas fa-user-edit"></i> <span id="editorTitle">Novo Colaborador</span></h3>
                        <button onclick="fecharColaboradorEditor()" class="btn-close-editor">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="colaboradorEditorContent" class="editor-form"></div>
                </div>
            </div>
        </div>
    `;

    renderListaColaboradores();
    
    // Evento do botão novo colaborador
    document.getElementById('btnNovoColaborador').addEventListener('click', function() {
        abrirEditorColaborador(null);
    });

    // Evento do botão "Desligados" (soft delete / retencao / limpeza)
    const btnDesligados = document.getElementById('btnColaboradoresDesligados');
    if (btnDesligados && typeof window.abrirDesligadosColaboradores === 'function') {
        btnDesligados.addEventListener('click', function() {
            window.abrirDesligadosColaboradores();
        });
    }
    
    // Evento de busca
    document.getElementById('searchColaborador').addEventListener('input', function(e) {
        filtrarColaboradores(e.target.value);
    });

    ajustarOffsetCabecalhoColaboradores();
}

// A barra de busca e fixa logo abaixo do cabecalho da pagina, mas os dois
// ficam em pais diferentes, entao o CSS precisava de um "top" fixo (88px)
// que nao correspondia a altura real do cabecalho (83px). A diferenca abria
// uma fresta por onde os cards apareciam ao rolar. Aqui a altura e medida e
// publicada como variavel CSS, o que tambem acompanha o cabecalho quando ele
// quebra em duas linhas em telas estreitas.
function ajustarOffsetCabecalhoColaboradores() {
    const cabecalho = document.querySelector('.colaboradores-page-header');
    const layout = document.querySelector('.colaboradores-layout');

    if (!cabecalho || !layout) {
        return;
    }

    const aplicar = () => {
        const alvo = document.querySelector('.colaboradores-page-header');
        const destino = document.querySelector('.colaboradores-layout');

        if (!alvo || !destino) {
            return;
        }

        const altura = Math.round(alvo.getBoundingClientRect().height);

        if (altura > 0) {
            // 1px de sobreposicao evita fresta por arredondamento de subpixel.
            destino.style.setProperty('--colaboradores-offset-topo', `${altura - 1}px`);
        }
    };

    aplicar();

    // A referencia do observer precisa ficar guardada: um ResizeObserver sem
    // referencia forte pode ser coletado e simplesmente parar de disparar.
    // O listener de resize cobre o caso de o observer nao estar disponivel.
    if (window.__colaboradoresOffsetObserver) {
        window.__colaboradoresOffsetObserver.disconnect();
    }

    if (typeof ResizeObserver === 'function') {
        window.__colaboradoresOffsetObserver = new ResizeObserver(aplicar);
        window.__colaboradoresOffsetObserver.observe(cabecalho);
    }

    if (!window.__colaboradoresOffsetResizeLigado) {
        window.__colaboradoresOffsetResizeLigado = true;
        window.addEventListener('resize', aplicar);
    }
}

function fecharColaboradorEditor() {
    const editorPanel = document.getElementById('colaboradorEditor');
    if (editorPanel) {
        editorPanel.style.display = 'none';
    }
    editandoId = null;
}

function getBancoHorasResumoEditor(colaboradorId) {
    return (window.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
}

function formatarSaldoBancoHorasInput(minutos) {
    const safe = Number.isFinite(Number(minutos)) ? Math.round(Number(minutos)) : 0;
    const sign = safe < 0 ? '-' : '+';
    const total = Math.abs(safe);
    const horas = Math.floor(total / 60);
    const restante = total % 60;

    return `${sign}${String(horas).padStart(2, '0')}:${String(restante).padStart(2, '0')}`;
}

function parseSaldoBancoHorasEditorParts(value) {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^([+-])?\s*(\d+):(\d{2})$/);

    if (!match) {
        return {
            sign: '+',
            hours: 0,
            minutes: 0,
            raw: '+00:00'
        };
    }

    const sign = match[1] === '-' ? '-' : '+';
    const hours = Number(match[2]) || 0;
    const minutes = Math.min(Math.max(Number(match[3]) || 0, 0), 59);

    return {
        sign,
        hours,
        minutes,
        raw: `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    };
}

function formatarSaldoBancoHorasPreview(sign, hours, minutes) {
    const prefix = sign === '-' ? '-' : '+';
    return `${prefix}${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function atualizarPreviewBancoHorasEditor(sign, hours, minutes) {
    const preview = document.getElementById('editorBancoHorasPreview');

    if (!preview) {
        return;
    }

    preview.textContent = formatarSaldoBancoHorasPreview(sign, hours, minutes);
    preview.classList.toggle('negativo', sign === '-');
    preview.classList.toggle('positivo', sign !== '-');
}

function sincronizarBancoHorasEditor() {
    const sign = document.getElementById('editorBancoHorasSinal')?.value === '-' ? '-' : '+';
    const hours = Math.max(Number(document.getElementById('editorBancoHorasHoras')?.value || 0), 0);
    const minutes = Math.min(Math.max(Number(document.getElementById('editorBancoHorasMinutos')?.value || 0), 0), 59);

    atualizarPreviewBancoHorasEditor(
        sign,
        Number.isFinite(hours) ? hours : 0,
        Number.isFinite(minutes) ? minutes : 0
    );
}

function alternarSinalBancoHorasEditor(sign) {
    const safeSign = sign === '-' ? '-' : '+';
    const signInput = document.getElementById('editorBancoHorasSinal');

    if (signInput) {
        signInput.value = safeSign;
    }

    document.querySelectorAll('[data-banco-horas-sinal]').forEach((button) => {
        const ativo = button.dataset.bancoHorasSinal === safeSign;
        button.classList.toggle('is-active', ativo);
        button.classList.toggle('is-negative', ativo && safeSign === '-');
        button.classList.toggle('is-positive', ativo && safeSign !== '-');
    });

    sincronizarBancoHorasEditor();
}

function obterSaldoBancoHorasEditorValue() {
    const sign = document.getElementById('editorBancoHorasSinal')?.value === '-' ? '-' : '+';
    const hoursValue = String(document.getElementById('editorBancoHorasHoras')?.value || '').trim();
    const minutesValue = String(document.getElementById('editorBancoHorasMinutos')?.value || '').trim();

    if (!/^\d+$/.test(hoursValue)) {
        throw new Error('Informe as horas do banco de horas.');
    }

    if (!/^\d+$/.test(minutesValue)) {
        throw new Error('Informe os minutos do banco de horas.');
    }

    const hours = Number(hoursValue);
    const minutes = Number(minutesValue);

    if (!Number.isFinite(hours) || hours < 0) {
        throw new Error('As horas do banco de horas precisam ser um numero valido.');
    }

    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
        throw new Error('Os minutos do banco de horas precisam ficar entre 0 e 59.');
    }

    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildBancoHorasEditorMarkup(colaborador = null) {
    const resumoBancoHoras = colaborador ? getBancoHorasResumoEditor(colaborador.Id) : null;
    const bancoHorasDisponivel = !window.bancoHorasStatus || window.bancoHorasStatus.enabled !== false;
    const saldoBancoHoras = formatarSaldoBancoHorasInput(resumoBancoHoras?.saldoMinutos || 0);
    const saldoAtual = parseSaldoBancoHorasEditorParts(saldoBancoHoras);
    const helperText = bancoHorasDisponivel
        ? 'Defina o saldo final do colaborador sem precisar digitar o formato manualmente.'
        : 'Banco de horas indisponivel agora. O cadastro sera salvo sem alterar o saldo.';

    return `
        <div class="editor-form-group banco-horas-editor-group">
            <label><i class="fas fa-clock"></i> Banco de horas</label>
            <div class="banco-horas-editor-shell ${bancoHorasDisponivel ? '' : 'is-disabled'}" data-enabled="${bancoHorasDisponivel ? 'true' : 'false'}">
                <div class="banco-horas-editor-summary">
                    <div>
                        <span class="banco-horas-label">Saldo final</span>
                        <strong id="editorBancoHorasPreview" class="${saldoAtual.sign === '-' ? 'negativo' : 'positivo'}">${formatarSaldoBancoHorasPreview(saldoAtual.sign, saldoAtual.hours, saldoAtual.minutes)}</strong>
                    </div>
                    <small class="banco-horas-current">Atual: ${resumoBancoHoras?.saldoFormatado || '+00h 00m'}</small>
                </div>

                <div class="banco-horas-editor-controls">
                    <div class="banco-horas-signal-toggle" role="group" aria-label="Tipo de saldo">
                        <button
                            type="button"
                            class="banco-horas-signal-btn ${saldoAtual.sign === '+' ? 'is-active is-positive' : ''}"
                            data-banco-horas-sinal="+"
                            onclick="alternarSinalBancoHorasEditor('+')"
                            ${bancoHorasDisponivel ? '' : 'disabled'}
                        >
                            <i class="fas fa-arrow-up"></i> Credito
                        </button>
                        <button
                            type="button"
                            class="banco-horas-signal-btn ${saldoAtual.sign === '-' ? 'is-active is-negative' : ''}"
                            data-banco-horas-sinal="-"
                            onclick="alternarSinalBancoHorasEditor('-')"
                            ${bancoHorasDisponivel ? '' : 'disabled'}
                        >
                            <i class="fas fa-arrow-down"></i> Debito
                        </button>
                    </div>

                    <div class="time-inputs banco-horas-time-inputs">
                        <input
                            type="number"
                            id="editorBancoHorasHoras"
                            value="${saldoAtual.hours}"
                            min="0"
                            step="1"
                            class="form-control banco-horas-input"
                            inputmode="numeric"
                            oninput="sincronizarBancoHorasEditor()"
                            ${bancoHorasDisponivel ? '' : 'disabled'}
                        >
                        <span>h</span>
                        <input
                            type="number"
                            id="editorBancoHorasMinutos"
                            value="${String(saldoAtual.minutes).padStart(2, '0')}"
                            min="0"
                            max="59"
                            step="1"
                            class="form-control banco-horas-input"
                            inputmode="numeric"
                            oninput="sincronizarBancoHorasEditor()"
                            ${bancoHorasDisponivel ? '' : 'disabled'}
                        >
                        <span>min</span>
                    </div>
                </div>
            </div>
            <input type="hidden" id="editorBancoHorasSinal" value="${saldoAtual.sign}">
            <input type="hidden" id="editorBancoHorasSaldoOriginal" value="${saldoBancoHoras}">
            <small class="helper-text">${helperText}</small>
        </div>
    `;
}

function filtrarColaboradores(termo) {
    if (!termo) {
        renderListaColaboradores();
        return;
    }
    
    const filtrados = colaboradores.filter(c =>
        String(c.Nome || c.nome || '').toLowerCase().includes(termo.toLowerCase())
    );
    
    renderListaColaboradores(filtrados);
}

function cancelarEdicao() {
    editandoId = null;
    renderColaboradores();
}

// Abre a modal #modalSenhaExclusao e resolve com a senha digitada quando o
// usuario confirma E a verificacao (options.verificar) passa; resolve com null
// se ele cancelar/fechar. Senha errada mantem a modal aberta com o erro — nada
// e apagado. Interacao autocontida: nao mexe na modal generica de confirmacao.
// Usada pela exclusao definitiva de colaborador desligado (runtime-fixes.js).
function solicitarSenhaModal(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalSenhaExclusao');
        const mensagem = document.getElementById('senhaExclusaoMensagem');
        const input = document.getElementById('senhaExclusaoInput');
        const erro = document.getElementById('senhaExclusaoErro');
        const btnOk = document.getElementById('confirmarSenhaExclusaoBtn');
        const btnCancelar = document.getElementById('cancelarSenhaExclusaoBtn');
        const btnFechar = document.getElementById('fecharModalSenhaExclusaoBtn');

        if (!modal || !input || !btnOk || !btnCancelar) {
            resolve(null);
            return;
        }

        if (mensagem) mensagem.textContent = options.mensagem || 'Esta ação não pode ser desfeita.';
        input.value = '';
        if (erro) { erro.textContent = ''; erro.hidden = true; }
        // O CSS mostra os modais via .modal.active (opacity/visibility). Sem
        // adicionar .active o modal ficava display:flex porem opacity:0 —
        // invisivel — dando a impressao de que "clicar nao faz nada".
        modal.classList.remove('hidden');
        modal.classList.add('active');
        setTimeout(() => input.focus(), 50);

        let ocupado = false;

        function limpar() {
            btnOk.removeEventListener('click', aoConfirmar);
            btnCancelar.removeEventListener('click', aoCancelar);
            if (btnFechar) btnFechar.removeEventListener('click', aoCancelar);
            input.removeEventListener('keydown', aoTeclar);
            modal.classList.remove('active');
            modal.classList.add('hidden');
        }

        function mostrarErro(texto) {
            if (erro) { erro.textContent = texto; erro.hidden = false; }
            input.focus();
            input.select();
        }

        async function aoConfirmar() {
            if (ocupado) return;
            const senha = input.value;

            if (!senha) {
                mostrarErro('Informe sua senha.');
                return;
            }

            ocupado = true;
            btnOk.disabled = true;

            try {
                if (typeof options.verificar === 'function') {
                    await options.verificar(senha);
                }
                limpar();
                btnOk.disabled = false;
                resolve(senha);
            } catch (error) {
                ocupado = false;
                btnOk.disabled = false;
                mostrarErro(error && error.status === 403
                    ? 'Senha incorreta.'
                    : (error?.message || 'Não foi possível verificar a senha.'));
            }
        }

        function aoCancelar() {
            limpar();
            resolve(null);
        }

        function aoTeclar(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                aoConfirmar();
            } else if (event.key === 'Escape') {
                aoCancelar();
            }
        }

        btnOk.addEventListener('click', aoConfirmar);
        btnCancelar.addEventListener('click', aoCancelar);
        if (btnFechar) btnFechar.addEventListener('click', aoCancelar);
        input.addEventListener('keydown', aoTeclar);
    });
}

/* ===========================
   CARREGAR DADOS
=========================== */
async function carregarColaboradores() {
    try {
        const res = await fetch('http://localhost:3000/api/colaboradores');
        if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
        const data = await res.json();
        colaboradores = Array.isArray(data) ? data : [];
        
        // 🔥 ATUALIZAR WINDOW
        window.colaboradores = colaboradores;
        
        console.log(`Colaboradores carregados: ${colaboradores.length}`);
        return colaboradores;
    } catch (error) {
        console.error("Erro ao carregar colaboradores:", error);
        colaboradores = [];
        window.colaboradores = [];
        return [];
    }
}

async function carregarSetores() {
    try {
        const res = await fetch(`${getApiBaseUrl()}/setores`);
        if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
        const data = await res.json();
        setores = Array.isArray(data) ? data : [];
        window.setores = setores;
        return setores;
    } catch (error) {
        console.error("Erro ao carregar setores:", error);
        setores = [];
        window.setores = [];
        return [];
    }
}

function buildSetorOptionsHtml(selectedId = null) {
    const currentSetores = Array.isArray(window.setores) ? window.setores : [];

    return [
        '<option value="">Selecione...</option>',
        ...currentSetores.map((setor) => `
            <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${setor.nome}</option>
        `)
    ].join('');
}

async function adicionarSetorRapido() {
    const nome = window.prompt('Nome do novo setor:');

    if (!nome || !String(nome).trim()) {
        return;
    }

    try {
        await window.API.salvarSetor({ nome });
        await carregarSetores();

        const select = document.getElementById('editorSetorId');
        const setorCriado = (window.setores || []).find((item) => item.nome.toLowerCase() === String(nome).trim().toLowerCase());

        if (select) {
            select.innerHTML = buildSetorOptionsHtml(setorCriado?.id || null);

            if (setorCriado?.id) {
                select.value = String(setorCriado.id);
            }
        }

        mostrarToast('Setor salvo com sucesso!', 'success');
    } catch (error) {
        mostrarToast(error.message || 'Erro ao salvar setor.', 'error');
    }
}

window.adicionarSetorRapido = adicionarSetorRapido;

// app.js - Função carregarAusencias (já deve estar assim, mas vamos verificar)

async function carregarAusencias() {
    try {
        console.log("📥 Carregando ausências do backend...");
        const response = await fetch('http://localhost:3000/api/ausencias');
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("📦 Dados brutos recebidos:", data);
        
        // Mapear para o formato esperado pelo frontend
        window.ausencias = data.map(a => {
            // Log para debug
            console.log(`🔍 Processando ausência ID ${a.Id}:`, {
                PeriodoTipo: a.PeriodoTipo,
                HoraInicio: a.HoraInicio
            });
            
            return {
                // Formato com maiúsculas
                Id: a.Id,
                ColaboradorId: a.ColaboradorId,
                Tipo: a.Tipo,
                DataInicio: a.DataInicio,
                DataFim: a.DataFim,
                PeriodoTipo: a.PeriodoTipo || 'dia_inteiro',
                HoraInicio: a.HoraInicio,
                HoraFim: a.HoraFim,
                DataCadastro: a.DataCadastro,
                
                // Formato com minúsculas
                id: a.Id,
                colaboradorId: a.ColaboradorId,
                tipo: a.Tipo,
                dataInicio: a.DataInicio,
                dataFim: a.DataFim,
                periodoTipo: a.PeriodoTipo || 'dia_inteiro',
                horaInicio: a.HoraInicio,
                horaFim: a.HoraFim
            };
        });
        
        console.log(`✅ Ausências carregadas e mapeadas: ${window.ausencias.length}`);
        
        // Verificar especificamente as com horas
        const comHoras = window.ausencias.filter(a => a.periodoTipo === 'horas' || a.horaInicio);
        console.log(`⏰ Ausências com horas: ${comHoras.length}`, comHoras);
        
        return window.ausencias;
        
    } catch (error) {
        console.error("❌ Erro ao carregar ausências:", error);
        window.ausencias = [];
        mostrarToast("Erro ao carregar ausências", "error");
        return [];
    }
}

/* ===========================
   TELA ESCALA DO DIA
=========================== */
function configurarSidebarEditor() {
    const sidebar = document.getElementById('sidebarEditor');
    const toggleBtn = document.getElementById('toggleEditor');
    const toggleIcon = document.getElementById('toggleIcon');

    if (!sidebar || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Muda o ícone conforme estado
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.className = 'fas fa-chevron-left';
        } else {
            toggleIcon.className = 'fas fa-chevron-right';
        }
    });
}

function gerarTimelineVisualComAusencias() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    body.innerHTML = "";

    if (!colaboradores || colaboradores.length === 0) {
        body.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const diaSemana = getDiaSemana(dataSelecionada);
    
    console.log(`📅 Gerando escala para: ${dataSelecionada} - Dia da semana: ${diaSemana} (0=Dom, 6=Sáb)`);

    // 🔥 CONDIÇÃO 1: Se for DOMINGO (diaSemana === 0)
    if (diaSemana === 0) {
        // Criar linha de mensagem
        const row = document.createElement("div");
        row.classList.add("timeline-row", "mensagem-row");
        
        // Nome da coluna
        let html = `<div class="timeline-name mensagem-nome">
            <i class="fas fa-sun"></i>
            <span>DOMINGO</span>
        </div>`;
        
        // Coluna de total vazia
        html += `<div class="timeline-cell total-cell"></div>`;
        
        // Mensagem centralizada
        html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
            <div class="mensagem-conteudo">
                <i class="fas fa-calendar-times"></i>
                <h3>Não há expediente aos domingos</h3>
                <p>Nenhum colaborador trabalha neste dia</p>
            </div>
        </div>`;
        
        row.innerHTML = html;
        body.appendChild(row);
        
        // Esconder o resumo
        const resumoContainer = document.getElementById('resumoContainer');
        if (resumoContainer) {
            resumoContainer.style.display = 'none';
        }
        
        return;
    } 

    // 🔥 CONDIÇÃO 2: Se for SÁBADO (diaSemana === 6)
    let colaboradoresFiltrados = colaboradores;
    let plantaoDoDia = null; // 🔥 DEFINIR A VARIÁVEL FORA DO IF
    
    if (diaSemana === 6) {
        plantaoDoDia = buscarPlantaoDoDia(dataSelecionada); // 🔥 AGORA É ACESSÍVEL FORA
        
        if (plantaoDoDia && plantaoDoDia.length > 0) {
            console.log("📋 Colaboradores no plantão:", plantaoDoDia);
            
            // Filtrar apenas os colaboradores que estão no plantão
            colaboradoresFiltrados = colaboradores.filter(c => 
                plantaoDoDia.includes(c.Id)
            );
            
            console.log(`✅ Mostrando apenas ${colaboradoresFiltrados.length} colaboradores do plantão`);
            
            // Se não houver colaboradores no plantão, mostrar mensagem
            if (colaboradoresFiltrados.length === 0) {
                const row = document.createElement("div");
                row.classList.add("timeline-row", "mensagem-row");
                
                let html = `<div class="timeline-name mensagem-nome">
                    <i class="fas fa-calendar-check"></i>
                    <span>PLANTÃO</span>
                </div>`;
                
                html += `<div class="timeline-cell total-cell"></div>`;
                
                html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
                    <div class="mensagem-conteudo">
                        <i class="fas fa-users-slash"></i>
                        <h3>Nenhum colaborador no plantão</h3>
                        <p>Este sábado não tem plantão lançado</p>
                    </div>
                </div>`;
                
                row.innerHTML = html;
                body.appendChild(row);
                
                adicionarLinhaTotalizador();
                gerarResumoHorarios();
                return;
            }
        } else {
            // Sábado sem plantão
            const row = document.createElement("div");
            row.classList.add("timeline-row", "mensagem-row");
            
            let html = `<div class="timeline-name mensagem-nome">
                <i class="fas fa-calendar-check"></i>
                <span>SÁBADO</span>
            </div>`;
            
            html += `<div class="timeline-cell total-cell"></div>`;
            
            html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
                <div class="mensagem-conteudo">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Nenhum plantão lançado</h3>
                    <p>Este sábado não tem plantão cadastrado</p>
                </div>
            </div>`;
            
            row.innerHTML = html;
            body.appendChild(row);
            
            adicionarLinhaTotalizador();
            gerarResumoHorarios();
            return;
        }
    }

    // Usar a lista filtrada (todos os colaboradores ou apenas os do plantão)
    colaboradoresFiltrados.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicioStr = (a.DataInicio || a.dataInicio || '').split('T')[0];
            const dataFimStr = (a.DataFim || a.dataFim || '').split('T')[0];
            
            return dataSelecionada >= dataInicioStr && dataSelecionada <= dataFimStr;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }
        
        // 🔥 AGORA plantaoDoDia ESTÁ ACESSÍVEL AQUI
        const estaNoPlantao = diaSemana === 6 ? (plantaoDoDia?.includes(c.Id) || false) : false;
        
        const horasTrabalhadas = calcularHorasTrabalhadas(c, dataSelecionada, ausenciasDoDia);
        
        const horasFormatadas = horasTrabalhadas % 1 === 0 
            ? `${horasTrabalhadas}h` 
            : `${horasTrabalhadas.toFixed(1)}h`;

        const row = document.createElement("div");
        row.classList.add("timeline-row");
        
        if (diaSemana === 6 && estaNoPlantao) {
            row.classList.add("plantao-row");
        }
        
        row.setAttribute('data-colaborador-id', c.Id);

        // Nome do colaborador
        let html = `<div class="timeline-name" onclick="abrirEditorNaEscala(${c.Id})">
            <i class="fas fa-user"></i> 
            <span>${c.Nome || 'Sem nome'}</span>`;
        
        if (diaSemana === 6 && estaNoPlantao) {
            html += `<span class="plantao-badge"><i class="fas fa-calendar-check"></i> Plantão</span>`;
        }
        
        html += `<i class="fas fa-pen edit-indicator"></i>
        </div>`;

        // Coluna de total de horas
        let totalClass = 'total-cell';
        let totalTooltip = `${horasFormatadas} trabalhadas`;

        if (horasTrabalhadas === 0) {
            totalClass += ' total-zero';
            if (tipoAusenciaDia === 'ferias') totalTooltip = 'Férias - 0h';
            else if (tipoAusenciaDia === 'folga') totalTooltip = 'Folga - 0h';
            else if (tipoAusenciaDia === 'ausencia') totalTooltip = 'Ausente - 0h';
            else totalTooltip = 'Não trabalha hoje - 0h';
        } else if (horasTrabalhadas < (trabFim - trabInicio - ((almFim - almInicio) || 0))) {
            totalClass += ' total-parcial';
            totalTooltip = `Parcial: ${horasFormatadas} (esperado ${(trabFim - trabInicio - ((almFim - almInicio) || 0)).toFixed(1)}h)`;
        }

        html += `<div class="timeline-cell ${totalClass}" title="${totalTooltip}">
            <span class="total-valor">${horasFormatadas}</span>
        </div>`;

        // Gerar células para cada hora
        for (let hora = 7; hora <= 18; hora++) {
            let classe = "fora-expediente";
            let tooltip = `${hora}:00 - `;
            let status = "Fora do expediente";

            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                classe = "ferias";
                status = "Férias (dia inteiro)";
            } 
            else if (tipoAusenciaDia === 'folga' && !horasAusencia) {
                classe = "folga";
                status = "Folga (dia inteiro)";
            }
            else if (tipoAusenciaDia === 'ausencia' && !horasAusencia) {
                classe = "folga";
                status = "Ausente (dia inteiro)";
            }
            else {
                const noTrabalho = trabInicio !== null && trabFim !== null && 
                                  hora >= trabInicio && hora < trabFim;
                
                const noAlmoco = almInicio !== null && almFim !== null && 
                                hora >= almInicio && hora < almFim;

                if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                    classe = "ausencia-parcial";
                    status = `Ausente (${hora}:00-${horasAusencia.fim}:00)`;
                }
                else if (noAlmoco) {
                    classe = "almoco";
                    status = "Horário de almoço";
                }
                else if (noTrabalho) {
                    classe = "trabalhando";
                    status = "Trabalhando";
                }
            }

            tooltip += status;
            html += `<div class="timeline-cell ${classe}" title="${tooltip}"></div>`;
        }

        row.innerHTML = html;
        body.appendChild(row);
    });

    adicionarLinhaTotalizador();
    gerarResumoHorarios();
}


function adicionarLinhaTotalizador() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    // Remover linha anterior
    const linhaAnterior = document.getElementById('linha-total-timeline');
    if (linhaAnterior) linhaAnterior.remove();

    // Array para contar quantos estão trabalhando em cada hora
    const trabalhandoPorHora = [];
    for (let hora = 7; hora <= 18; hora++) {
        trabalhandoPorHora.push({
            hora: hora,
            contagem: 0
        });
    }

    // Coletar dados - contar apenas quem está trabalhando
    document.querySelectorAll('.timeline-row').forEach(row => {
        if (row.id === 'linha-total-timeline') return;
        
        const cells = row.querySelectorAll('.timeline-cell:not(.total-cell)');
        cells.forEach((cell, index) => {
            if (index < trabalhandoPorHora.length) {
                if (cell.classList.contains('trabalhando')) {
                    trabalhandoPorHora[index].contagem++;
                }
            }
        });
    });

    // Criar linha de total
    const totalRow = document.createElement("div");
    totalRow.id = 'linha-total-timeline';
    totalRow.classList.add("timeline-row", "total-row");

    // Nome da linha (ocupa primeira coluna)
    let html = `<div class="timeline-name total-nome">
        <i class="fas fa-users"></i>
        <span><strong>TRABALHANDO</strong></span>
    </div>`;

    // Coluna de total (segunda coluna) - VAZIA ou com informação
    html += `<div class="timeline-cell total-cell" title="Total de colaboradores"></div>`;

    // Colunas por hora (12 colunas)
    trabalhandoPorHora.forEach(item => {
        html += `
            <div class="timeline-cell total-cell" 
                 title="${item.hora}:00 - ${item.contagem} trabalhando"
                 onclick="mostrarDetalhesHora(${item.hora})"
                 style="cursor: pointer;">
                <span class="total-valor">${item.contagem}</span>
            </div>
        `;
    });

    totalRow.innerHTML = html;
    body.appendChild(totalRow);
}

function formatarHoraNumerica(horas) {
    if (horas === null || horas === undefined) return '';
    return `${Math.floor(horas).toString().padStart(2, '0')}:00`;
}

// app.js - Função gerarHeaderTimeline corrigida

function gerarHeaderTimeline() {
    const header = document.getElementById("timelineHeader");
    if (!header) return;

    // Limpar header
    header.innerHTML = '';
    
    // Coluna do colaborador
    header.innerHTML += '<div class="timeline-name-header">Colaborador</div>';
    
    // Coluna de total de horas
    header.innerHTML += '<div class="hora-header total-header" title="Total de horas trabalhadas no dia">Total</div>';

    // Colunas das horas
    for (let hora = 7; hora <= 18; hora++) {
        header.innerHTML += `
            <div class="hora-header">
                <span>${hora}:00</span>
            </div>
        `;
    }
    
    console.log("✅ Header da timeline gerado com coluna de total");
}

// app.js - Função para calcular horas trabalhadas no dia

function calcularHorasTrabalhadas(colaborador, dataSelecionada, ausenciasDoDia) {
    // Horário base do colaborador
    const trabInicio = obterHoraNumerica(colaborador.TrabalhoInicio);
    const trabFim = obterHoraNumerica(colaborador.TrabalhoFim);
    const almInicio = obterHoraNumerica(colaborador.AlmocoInicio);
    const almFim = obterHoraNumerica(colaborador.AlmocoFim);
    
    // Se não tem horário definido
    if (trabInicio === null || trabFim === null) return 0;
    
    // Duração total do expediente (em horas)
    let horasTrabalho = trabFim - trabInicio;
    
    // Subtrair almoço se existir
    if (almInicio !== null && almFim !== null) {
        horasTrabalho -= (almFim - almInicio);
    }
    
    // Verificar ausências
    if (ausenciasDoDia.length > 0) {
        const ausencia = ausenciasDoDia[0];
        const tipoAusencia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        const periodoTipo = ausencia.periodoTipo || ausencia.PeriodoTipo || 'dia_inteiro';
        
        // Ausência dia inteiro
        if (periodoTipo === 'dia_inteiro') {
            return 0;
        }
        
        // Ausência parcial (horas específicas)
        if (periodoTipo === 'horas') {
            const horaInicioAusencia = obterHoraNumerica(ausencia.horaInicio || ausencia.HoraInicio);
            const horaFimAusencia = obterHoraNumerica(ausencia.horaFim || ausencia.HoraFim);
            
            if (horaInicioAusencia !== null && horaFimAusencia !== null) {
                // Calcular interseção entre horário de trabalho e ausência
                const inicioAusencia = Math.max(trabInicio, horaInicioAusencia);
                const fimAusencia = Math.min(trabFim, horaFimAusencia);
                
                if (fimAusencia > inicioAusencia) {
                    const horasAusentes = fimAusencia - inicioAusencia;
                    
                    // Ajustar se a ausência cobre parte do almoço
                    if (almInicio !== null && almFim !== null) {
                        const inicioAlmocoAusencia = Math.max(almInicio, horaInicioAusencia);
                        const fimAlmocoAusencia = Math.min(almFim, horaFimAusencia);
                        
                        if (fimAlmocoAusencia > inicioAlmocoAusencia) {
                            // A ausência já cobre parte do almoço, não precisa subtrair novamente
                            horasTrabalho -= horasAusentes;
                        } else {
                            horasTrabalho -= horasAusentes;
                        }
                    } else {
                        horasTrabalho -= horasAusentes;
                    }
                }
            }
        }
    }
    
    // Garantir que não fique negativo
    return Math.max(0, horasTrabalho);
}

/* ===========================
   UTILITÁRIOS
=========================== */
function formatarHora(hora) {
    if (!hora) return "";

    if (hora instanceof Date && !isNaN(hora.getTime())) {
        const isTimeOnlyDate = hora.getUTCFullYear() === 1970
            && hora.getUTCMonth() === 0
            && hora.getUTCDate() === 1;
        const h = String(isTimeOnlyDate ? hora.getUTCHours() : hora.getHours()).padStart(2, "0");
        const m = String(isTimeOnlyDate ? hora.getUTCMinutes() : hora.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }

    const raw = String(hora).trim();

    if (!raw) {
        return "";
    }

    const isoMatch = raw.match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?/);
    if (isoMatch) {
        return isoMatch[1];
    }

    const timeMatch = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (timeMatch) {
        return timeMatch[1];
    }

    return "";
}

function obterHoraNumerica(hora) {
    if (!hora) return null;
    
    const horaStr = formatarHora(hora);
    if (!horaStr) return null;
    
    const partes = horaStr.split(":");
    if (partes.length < 1) return null;
    
    return parseInt(partes[0]);
}

// Função para mostrar toast
function mostrarToast(mensagem, tipo = "success") {
    console.log(`Toast: ${mensagem} (${tipo})`);
    
    // Cria o container se não existir
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    
    let icone = "fa-info-circle";
    if (tipo === "success") icone = "fa-check-circle";
    else if (tipo === "error") icone = "fa-exclamation-circle";
    else if (tipo === "warning") icone = "fa-exclamation-triangle";
    
    toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
    
    container.appendChild(toast);
    
    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => {
            if (toast.parentNode === container) {
                toast.remove();
            }
            
            // Remove container se estiver vazio
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3000);
}

// Função para debug - mostra o estado atual
function debugAusencias() {
    console.log("=== DEBUG AUSÊNCIAS ===");
    console.log("Data selecionada:", dataSelecionada);
    console.log("Todas ausências:", ausencias);
    console.log("Colaboradores:", colaboradores);
    
    if (dataSelecionada) {
        const filtradas = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            const dataAlvo = new Date(dataSelecionada);
            
            dataInicio.setHours(0,0,0,0);
            dataFim.setHours(0,0,0,0);
            dataAlvo.setHours(0,0,0,0);
            
            return dataAlvo >= dataInicio && dataAlvo <= dataFim;
        });
        console.log("Filtradas pelo dia:", filtradas);
    }
}

function gerarResumoHorarios() {
    const resumoGrid = document.getElementById('resumoGrid');
    if (!resumoGrid) return;

    if (!colaboradores || colaboradores.length === 0) {
        resumoGrid.innerHTML = '<div class="resumo-empty">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const dataObj = new Date(dataSelecionada + 'T12:00:00');

    // Cria array para contar colaboradores por hora
    const contagemPorHora = [];

    for (let hora = 7; hora <= 18; hora++) {
        contagemPorHora.push({
            hora: hora,
            trabalhando: 0,
            almoco: 0,
            folga: 0,
            ferias: 0,
            ausente: 0,
            fora: 0
        });
    }

    // Conta colaboradores em cada hora considerando ausências
    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(0, 0, 0, 0);
            const dataComp = new Date(dataSelecionada);
            dataComp.setHours(0, 0, 0, 0);
            
            return dataComp >= dataInicio && dataComp <= dataFim;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }

        for (let hora = 7; hora <= 18; hora++) {
            const index = hora - 7;
            
            // Verificar ausência dia inteiro
            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                contagemPorHora[index].ferias++;
                continue;
            }
            else if ((tipoAusenciaDia === 'folga' || tipoAusenciaDia === 'ausencia') && !horasAusencia) {
                contagemPorHora[index].folga++;
                continue;
            }
            
            // Verificar ausência parcial
            if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                contagemPorHora[index].ausente++;
                continue;
            }
            
            // Verificar horário normal
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;
            
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim && !noAlmoco;

            if (noAlmoco) {
                contagemPorHora[index].almoco++;
            } else if (noTrabalho) {
                contagemPorHora[index].trabalhando++;
            } else {
                contagemPorHora[index].fora++;
            }
        }
    });

    // Gerar o HTML do resumo
    let html = '';
    
    contagemPorHora.forEach(item => {
        const total = item.trabalhando + item.almoco + item.folga + item.ferias + item.ausente + item.fora;
        
        html += `
            <div class="resumo-card">
                <div class="resumo-hora">${item.hora}:00</div>
                <div class="resumo-barras">
                    <div class="resumo-barra-container">
                        <div class="resumo-barra trabalhando" style="width: ${(item.trabalhando / total) * 100}%" title="Trabalhando: ${item.trabalhando}"></div>
                        <div class="resumo-barra almoco" style="width: ${(item.almoco / total) * 100}%" title="Almoço: ${item.almoco}"></div>
                        <div class="resumo-barra folga" style="width: ${(item.folga / total) * 100}%" title="Folga: ${item.folga}"></div>
                        <div class="resumo-barra ferias" style="width: ${(item.ferias / total) * 100}%" title="Férias: ${item.ferias}"></div>
                        <div class="resumo-barra ausente" style="width: ${(item.ausente / total) * 100}%" title="Ausente: ${item.ausente}"></div>
                        <div class="resumo-barra fora" style="width: ${(item.fora / total) * 100}%" title="Fora: ${item.fora}"></div>
                    </div>
                </div>
                <div class="resumo-numeros">
                    <span class="resumo-num trabalhando-num" title="Trabalhando"><i class="fas fa-briefcase"></i> ${item.trabalhando}</span>
                    <span class="resumo-num almoco-num" title="Almoço"><i class="fas fa-utensils"></i> ${item.almoco}</span>
                    <span class="resumo-num folga-num" title="Folga"><i class="fas fa-leaf"></i> ${item.folga}</span>
                    <span class="resumo-num ferias-num" title="Férias"><i class="fas fa-umbrella-beach"></i> ${item.ferias}</span>
                    <span class="resumo-num ausente-num" title="Ausente"><i class="fas fa-exclamation-triangle"></i> ${item.ausente}</span>
                    <span class="resumo-num fora-num" title="Fora"><i class="fas fa-clock"></i> ${item.fora}</span>
                </div>
            </div>
        `;
    });

    resumoGrid.innerHTML = html;
}

function abrirSeletorMes() {
    // Remove seletor existente se houver
    const overlayExistente = document.querySelector('.month-selector-overlay');
    if (overlayExistente) {
        overlayExistente.remove();
    }

    // Cria o overlay
    const overlay = document.createElement('div');
    overlay.className = 'month-selector-overlay';
    
    // Lista de meses em português
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    // Gera os botões dos meses
    let mesesHTML = '';
    meses.forEach((mes, index) => {
        const activeClass = index === mesAtual ? 'active' : '';
        mesesHTML += `
            <button class="month-btn ${activeClass}" data-mes="${index}">
                ${mes.substring(0, 3)}
            </button>
        `;
    });
    
    overlay.innerHTML = `
        <div class="month-selector-modal">
            <div class="month-selector-header">
                <h3><i class="fas fa-calendar-alt"></i> Navegar</h3>
                <button class="month-selector-close" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="year-selector">
                <button class="year-btn" id="prevYearBtn">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="current-year" id="currentYearDisplay">${anoAtual}</span>
                <button class="year-btn" id="nextYearBtn">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="months-grid">
                ${mesesHTML}
            </div>
            
            <div class="month-selector-actions">
                <button class="btn-primary" id="irParaDataBtn">
                    <i class="fas fa-check"></i> Ir para
                </button>
                <button class="btn-secondary" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Configurar eventos
    const yearDisplay = document.getElementById('currentYearDisplay');
    let anoSelecionado = anoAtual;
    
    // Botão ano anterior
    document.getElementById('prevYearBtn').addEventListener('click', () => {
        anoSelecionado--;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão próximo ano
    document.getElementById('nextYearBtn').addEventListener('click', () => {
        anoSelecionado++;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão "Ir para"
    document.getElementById('irParaDataBtn').addEventListener('click', async () => {
        const mesSelecionado = document.querySelector('.month-btn.active')?.dataset.mes;
        
        if (mesSelecionado !== undefined) {
            const novoMes = parseInt(mesSelecionado);
            
            // Atualiza mês e ano
            mesAtual = novoMes;
            anoAtual = anoSelecionado;
            
            // Recarrega feriados para o novo ano
            await carregarFeriados(anoAtual);
            
            // Atualiza o calendário
            gerarCalendario(mesAtual, anoAtual);
            
            // Fecha o modal
            overlay.remove();
        }
    });
    
    // Evento para os botões de mês
    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active de todos
            document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
            // Adiciona active no clicado
            this.classList.add('active');
        });
    });
    
    // Fecha ao clicar no overlay (fora do modal)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// Tela de Usuarios (antes era uma aba dentro de Configuracoes; virou item
// proprio no menu, admin-only). O conteudo em si e montado por
// inicializarUsuariosTela() em configuracoes-usuarios.js, que popula o
// #usuariosCardConteudo. A visibilidade e navegacao ja sao filtradas por
// permissoes.js (o item some e a rota cai no calendario para nao-admin).
function renderUsuarios() {
    if (!appContent) {
        return;
    }

    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-users-cog"></i> Usuários</h1>
            <p>Contas e acessos ao sistema</p>
        </div>

        <div class="configuracoes-grid">
            <div class="config-card config-card-wide" data-config-section="usuarios">
                <div class="config-card-body" id="usuariosCardConteudo">
                    <p class="config-descricao">Carregando usuarios...</p>
                </div>
            </div>
        </div>
    `;

    if (typeof window.inicializarUsuariosTela === 'function') {
        window.inicializarUsuariosTela();
    }
}

function renderConfiguracoes() {
    // Verifica o tema atual salvo
    const temaAtual = localStorage.getItem('tema') || 'light';
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-cog"></i> Configurações</h1>
            <p>Personalize sua experiência no sistema</p>
        </div>

        <div class="configuracoes-shell">
            <nav class="config-section-menu" aria-label="Secoes de configuracao">
                ${gerarMenuConfiguracoesHtml()}
            </nav>

        <div class="configuracoes-grid">
            <!-- CARD DE TEMA -->
            <div class="config-card" data-config-section="personalizacao">
                <div class="config-card-header">
                    <i class="fas fa-palette"></i>
                    <h2>Aparência</h2>
                </div>
                
                <div class="config-card-body">
                    <p class="config-description">
                        Escolha o tema que prefere para o sistema
                    </p>
                    
                    <div class="tema-opcoes">
                        <div class="tema-opcao ${temaAtual === 'light' ? 'active' : ''}" data-tema="light">
                            <div class="tema-preview tema-preview-light">
                                <div class="preview-header"></div>
                                <div class="preview-sidebar"></div>
                                <div class="preview-content"></div>
                            </div>
                            <div class="tema-info">
                                <i class="fas fa-sun"></i>
                                <span>Claro</span>
                            </div>
                        </div>
                        
                        <div class="tema-opcao ${temaAtual === 'dark' ? 'active' : ''}" data-tema="dark">
                            <div class="tema-preview tema-preview-dark">
                                <div class="preview-header"></div>
                                <div class="preview-sidebar"></div>
                                <div class="preview-content"></div>
                            </div>
                            <div class="tema-info">
                                <i class="fas fa-moon"></i>
                                <span>Escuro</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CARD DE PREFERÊNCIAS -->
            <div class="config-card config-card-wide" data-config-section="personalizacao">
                <div class="config-card-header">
                    <i class="fas fa-fill-drip"></i>
                    <h2>Personalizacao da escala</h2>
                </div>

                <div class="config-card-body">
                    <p class="config-description">
                        Escolha as cores exibidas na tela de escala do dia. As alteracoes ficam salvas neste computador.
                    </p>

                    <div class="escala-color-grid">
                        ${gerarConfiguracaoCoresEscalaHtml()}
                    </div>

                    <div class="config-actions-row">
                        <button class="config-btn" id="salvarCoresEscalaBtn" type="button">
                            <i class="fas fa-save"></i>
                            Salvar cores
                        </button>

                        <button class="config-btn" id="resetarCoresEscalaBtn" type="button">
                            <i class="fas fa-rotate-left"></i>
                            Restaurar padrao
                        </button>
                    </div>
                </div>
            </div>

            <div class="config-card" data-config-section="operacao">
                <div class="config-card-header">
                    <i class="fas fa-sliders-h"></i>
                    <h2>Preferências</h2>
                </div>
                
                <div class="config-card-body">
                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-calendar-week"></i>
                            <div>
                                <strong>Semana começa em:</strong>
                                <p>Defina o primeiro dia da semana</p>
                            </div>
                        </div>
                        <select id="primeiroDiaSemana" class="config-select">
                            <option value="0">Domingo</option>
                            <option value="1" selected>Segunda-feira</option>
                            <option value="6">Sábado</option>
                        </select>
                    </div>

                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-clock"></i>
                            <div>
                                <strong>Formato de hora:</strong>
                                <p>Escolha como as horas são exibidas</p>
                            </div>
                        </div>
                        <select id="formatoHora" class="config-select">
                            <option value="24" selected>24 horas (14:30)</option>
                            <option value="12">12 horas (2:30 PM)</option>
                        </select>
                    </div>

                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-bell"></i>
                            <div>
                                <strong>Notificações:</strong>
                                <p>Receber alertas do sistema</p>
                            </div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="notificacoes" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- CARD SOBRE O SISTEMA -->
            <div class="config-card" data-config-section="sobre">
                <div class="config-card-header">
                    <i class="fas fa-info-circle"></i>
                    <h2>Sobre</h2>
                </div>
                
                <div class="config-card-body">
                    <div class="sobre-info">
                        <i class="fas fa-calendar-check sobre-icon"></i>
                        <h3>Software de Escalas</h3>
                        <p class="versao">Versão 1.2.0</p>
                        <p class="descricao">
                            Sistema completo para gestão de escalas de trabalho, 
                            colaboradores e horários.
                        </p>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-code-branch"></i>
                        <span>Desenvolvido com HTML5, CSS3 e JavaScript</span>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-database"></i>
                        <span>Backend: Node.js + Express</span>
                    </div>
                    
                </div>
            </div>

            <!-- CARD DE AÇÕES -->
            <div class="config-card config-card-half" data-config-section="banco">
                <div class="config-card-header">
                    <i class="fas fa-database"></i>
                    <h2>Configuração do Banco de Dados</h2>
                </div>

                <div class="config-card-body">
                    <p class="config-description">
                        Configure a conexão local com o SQL Server, teste a comunicação e verifique as tabelas necessárias da aplicação.
                    </p>

                    <div id="configuracaoBancoStatus" class="config-status-card is-neutral">
                        <div class="config-status-header">
                            <strong>Status da conexão</strong>
                            <span id="configuracaoBancoStatusBadge" class="config-status-badge">Não testado</span>
                        </div>
                        <p id="configuracaoBancoStatusTexto">Carregando a configuração salva no backend...</p>
                        <small id="configuracaoBancoStatusDetalhe" class="config-status-detail"></small>
                    </div>

                    <div id="configuracaoBancoForm" class="config-form-grid">
                        <div class="form-group">
                            <label for="dbHost">Servidor / Host</label>
                            <input type="text" id="dbHost" class="form-control" placeholder="Ex: localhost">
                        </div>

                        <div class="form-group">
                            <label for="dbPort">Porta</label>
                            <input type="number" id="dbPort" class="form-control" placeholder="1433" min="1" max="65535">
                        </div>

                        <div class="form-group">
                            <label for="dbInstance">Instancia</label>
                            <input type="text" id="dbInstance" class="form-control" placeholder="Ex: SQLEXPRESS">
                        </div>

                        <div class="form-group">
                            <label for="dbDatabase">Banco de dados</label>
                            <input type="text" id="dbDatabase" class="form-control" placeholder="Ex: SoftwareEscalas">
                        </div>

                        <div class="form-group form-group-full">
                            <label>Autenticação</label>
                            <div class="config-auth-options">
                                <label class="config-auth-option">
                                    <input type="radio" name="dbAuthenticationType" value="sql" checked>
                                    <span>SQL Server Authentication</span>
                                </label>
                                <label class="config-auth-option">
                                    <input type="radio" name="dbAuthenticationType" value="windows" id="dbAuthWindows">
                                    <span>Windows Authentication</span>
                                </label>
                            </div>
                            <small id="dbAuthHint" class="helper-text">
                                Use SQL Server Authentication nesta versão do projeto para garantir compatibilidade imediata.
                            </small>
                        </div>

                        <div class="form-group">
                            <label for="dbUser">Usuário</label>
                            <input type="text" id="dbUser" class="form-control" placeholder="Usuário do SQL Server">
                        </div>

                        <div class="form-group">
                            <label for="dbPassword">Senha</label>
                            <input type="password" id="dbPassword" class="form-control" placeholder="Senha do SQL Server">
                            <small id="dbPasswordHint" class="helper-text">
                                A senha salva nunca é exibida no frontend.
                            </small>
                        </div>

                        <div class="form-group form-group-full">
                            <div class="config-checkbox-row">
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="dbEncrypt" checked>
                                    <span>Usar conexão criptografada</span>
                                </label>
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="dbTrustCertificate" checked>
                                    <span>Confiar no certificado do servidor</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group" hidden>
                            <label class="checkbox-inline" for="autoBackupEnabledHidden">
                                <input type="checkbox" id="autoBackupEnabledHidden">
                                Ativar backup automático periódico
                            </label>
                            <small class="helper-text">
                                Gera um novo arquivo JSON automaticamente no intervalo configurado abaixo.
                            </small>
                        </div>

                        <div class="form-group">
                            <label for="autoBackupIntervalMinutesHidden">Intervalo automático (minutos)</label>
                            <input
                                type="number"
                                id="autoBackupIntervalMinutesHidden"
                                class="form-control"
                                min="15"
                                step="15"
                                value="180"
                            >
                            <small class="helper-text">
                                Exemplo: 60 para uma vez por hora.
                            </small>
                        </div>

                        <div class="form-group form-group-full">
                            <label class="checkbox-inline" for="autoBackupOnShutdownHidden">
                                <input type="checkbox" id="autoBackupOnShutdownHidden">
                                Fazer backup antes de encerrar o servidor
                            </label>
                            <small class="helper-text">
                                Quando o servidor for fechado normalmente, ele tenta gerar um backup extra na pasta configurada.
                            </small>
                        </div>
                    </div>

                    <div class="config-actions-row">
                        <button class="config-btn" id="testarConfiguracaoBancoBtn" type="button">
                            <i class="fas fa-vial"></i>
                            Testar Conexão
                        </button>

                        <button class="config-btn" id="salvarConfiguracaoBancoBtn" type="button">
                            <i class="fas fa-save"></i>
                            Salvar Configuração
                        </button>

                        <button class="config-btn" id="verificarTabelasBancoBtn" type="button">
                            <i class="fas fa-table"></i>
                            Criar / Verificar Tabelas
                        </button>

                        <button class="config-btn" id="carregarExemplosBancoBtn" type="button">
                            <i class="fas fa-seedling"></i>
                            Carregar Dados de Exemplo
                        </button>
                    </div>
                </div>
            </div>

            <div class="config-card config-card-half" data-config-section="backup">
                <div class="config-card-header">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <h2>Backup Local do Banco</h2>
                </div>

                <div class="config-card-body">
                    <p class="config-description">
                        Defina uma pasta local para gerar backups completos do banco em formato JSON.
                        Você pode usar uma pasta sincronizada com OneDrive, Google Drive ou outro serviço de nuvem.
                    </p>

                    <div id="configuracaoBackupStatus" class="config-status-card is-neutral">
                        <div class="config-status-header">
                            <strong>Status do backup</strong>
                            <span id="configuracaoBackupStatusBadge" class="config-status-badge">Não configurado</span>
                        </div>
                        <p id="configuracaoBackupStatusTexto">Informe a pasta de backup para começar.</p>
                        <small id="configuracaoBackupStatusDetalhe" class="config-status-detail"></small>
                    </div>

                    <div id="configuracaoBackupForm" class="config-form-grid">
                        <div class="form-group form-group-full">
                            <label for="backupDirectory">Pasta de backup</label>
                            <input
                                type="text"
                                id="backupDirectory"
                                class="form-control config-input-mono"
                                placeholder="Ex: C:\\Users\\Fernando\\OneDrive\\Backups\\Escalas"
                                readonly
                                title="Clique para selecionar a pasta no Windows"
                            >
                            <button class="config-btn config-inline-picker-btn" id="selecionarDiretorioBackupBtn" type="button">
                                <i class="fas fa-folder-open"></i>
                                Selecionar pasta
                            </button>
                            <div class="config-backup-options">
                                <label class="checkbox-inline" for="autoBackupEnabled">
                                    <input type="checkbox" id="autoBackupEnabled">
                                    Ativar backup automatico periodico
                                </label>
                                <small class="helper-text">
                                    Gera um novo arquivo JSON automaticamente no intervalo configurado abaixo.
                                </small>
                                <div class="config-backup-interval">
                                    <label for="autoBackupIntervalMinutes">Intervalo automatico (minutos)</label>
                                    <input
                                        type="number"
                                        id="autoBackupIntervalMinutes"
                                        class="form-control"
                                        min="15"
                                        step="15"
                                        value="180"
                                    >
                                    <small class="helper-text">
                                        Exemplo: 60 para uma vez por hora.
                                    </small>
                                </div>
                                <label class="checkbox-inline" for="autoBackupOnShutdown">
                                    <input type="checkbox" id="autoBackupOnShutdown">
                                    Fazer backup antes de encerrar o servidor
                                </label>
                                <small class="helper-text">
                                    Quando o servidor for fechado normalmente, ele tenta gerar um backup extra na pasta configurada.
                                </small>
                            </div>
                            <small class="helper-text">
                                Use um caminho absoluto. Se a pasta não existir, o sistema tentará criá-la automaticamente.
                            </small>
                        </div>
                    </div>

                    <div class="config-actions-row">
                        <button class="config-btn" id="salvarConfiguracaoBackupBtn" type="button">
                            <i class="fas fa-folder-plus"></i>
                            Salvar Backup
                        </button>

                        <button class="config-btn" id="gerarBackupSistemaBtn" type="button">
                            <i class="fas fa-shield-alt"></i>
                            Gerar Backup Agora
                        </button>
                    </div>
                </div>
            </div>

            <div class="config-card config-network-card" data-config-section="ferramentas">
                <div class="config-card-header">
                    <i class="fas fa-network-wired"></i>
                    <h2>Comunicacao em Rede</h2>
                </div>

                <div class="config-card-body">
                    <p class="config-description">
                        Use este teste para validar se esta maquina esta comunicando com o servidor que atende os outros dispositivos.
                    </p>

                    <div id="configNetworkStatus" class="config-status-card is-neutral">
                        <div class="config-status-header">
                            <strong>Status da comunicacao</strong>
                            <span id="configNetworkStatusBadge" class="config-status-badge">Aguardando</span>
                        </div>
                        <p id="configNetworkStatusTexto">Clique em testar para validar a API.</p>
                        <small id="configNetworkStatusDetalhe" class="config-status-detail">
                            Base atual da API: ${escapeNetworkText(window.API?.baseURL || getApiBaseUrl())}
                        </small>
                    </div>

                    <div class="network-url-panel">
                        <strong>Enderecos para testar no notebook</strong>
                        <div id="configNetworkUrls" class="network-url-list"></div>
                    </div>

                    <div class="background-server-panel is-hidden" id="backgroundServerPanel">
                        <div id="backgroundServerStatus" class="config-status-card is-neutral">
                            <div class="config-status-header">
                                <strong>Servidor em segundo plano</strong>
                                <span id="backgroundServerStatusBadge" class="config-status-badge">Pendente</span>
                            </div>
                            <p id="backgroundServerStatusTexto">Consultando configuracao do Windows...</p>
                            <small id="backgroundServerStatusDetalhe" class="config-status-detail"></small>
                        </div>

                        <div class="network-url-panel">
                            <strong>Endereco recomendado para clientes</strong>
                            <div class="network-url-item">
                                <i class="fas fa-desktop"></i>
                                <code id="backgroundServerRecommendedUrl"></code>
                            </div>
                            <small class="helper-text">
                                Use esse endereco no notebook cliente. Ele usa o nome da maquina em vez do IP.
                            </small>
                        </div>

                        <details class="background-server-details">
                            <summary>Detalhes tecnicos da inicializacao</summary>
                            <code id="backgroundServerCommand"></code>
                        </details>

                        <div class="config-actions-row">
                            <button class="config-btn" id="instalarServidorSegundoPlanoBtn" type="button">
                                <i class="fas fa-toggle-on"></i>
                                Instalar inicio automatico
                            </button>

                            <button class="config-btn" id="iniciarServidorSegundoPlanoBtn" type="button">
                                <i class="fas fa-play"></i>
                                Iniciar agora
                            </button>

                            <button class="config-btn" id="pararServidorSegundoPlanoBtn" type="button">
                                <i class="fas fa-stop"></i>
                                Parar
                            </button>

                            <button class="config-btn config-btn-danger" id="removerServidorSegundoPlanoBtn" type="button">
                                <i class="fas fa-trash-alt"></i>
                                Remover inicio automatico
                            </button>
                        </div>

                        <small class="helper-text">
                            O servidor passa a subir no boot da maquina, sem precisar
                            que alguem faca login no Windows. Para instalar, abra o
                            aplicativo como administrador (a tarefa roda na conta SYSTEM).
                        </small>
                    </div>

                    <div class="config-actions-row">
                        <button class="config-btn" id="testarComunicacaoRedeBtn" type="button">
                            <i class="fas fa-signal"></i>
                            Testar Comunicacao
                        </button>

                        <button class="config-btn" id="copiarUrlRedeBtn" type="button">
                            <i class="fas fa-copy"></i>
                            Copiar URL atual
                        </button>
                    </div>
                </div>
            </div>

            <div class="config-card config-card-tools" data-config-section="ferramentas">
                <div class="config-card-header">
                    <i class="fas fa-tools"></i>
                    <h2>Ferramentas</h2>
                </div>
                
                <div class="config-card-body">
                    <button class="config-btn" onclick="atualizarTudo()">
                        <i class="fas fa-rotate-right"></i>
                        Atualizar Dados
                    </button>

                    <button class="config-btn" onclick="exportarDados()">
                        <i class="fas fa-download"></i>
                        Exportar Dados
                    </button>
                    
                    <button class="config-btn" onclick="importarDados()">
                        <i class="fas fa-upload"></i>
                        Importar Dados
                    </button>
                    
                    <button class="config-btn config-btn-danger" onclick="resetarSistema()">
                        <i class="fas fa-trash-alt"></i>
                        Resetar Sistema
                    </button>
                </div>
            </div>
        </div>
        </div>
    `;

    // Adiciona eventos para as opções de tema
    document.querySelectorAll('.tema-opcao').forEach(opcao => {
        opcao.addEventListener('click', function() {
            const tema = this.dataset.tema;
            mudarTema(tema);
            
            // Atualiza a classe active
            document.querySelectorAll('.tema-opcao').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Carrega preferências salvas
    carregarPreferencias();
    inicializarSecoesConfiguracoes();
    inicializarPersonalizacaoEscala();
    
    // Eventos para salvar preferências
    document.getElementById('primeiroDiaSemana').addEventListener('change', salvarPreferencias);
    document.getElementById('formatoHora').addEventListener('change', salvarPreferencias);
    document.getElementById('notificacoes').addEventListener('change', salvarPreferencias);

    if (typeof window.inicializarConfiguracaoBancoTela === 'function') {
        window.inicializarConfiguracaoBancoTela();
    }

    if (typeof window.inicializarBackupSistemaTela === 'function') {
        window.inicializarBackupSistemaTela();
    }

    inicializarDiagnosticoRede();
    inicializarServidorSegundoPlano();
}

// Função para mudar o tema
function mudarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('tema', tema);
    
    mostrarToast(`Tema ${tema === 'dark' ? 'escuro' : 'claro'} ativado!`, 'success');
}

// Função para carregar preferências salvas
function carregarPreferencias() {
    const primeiroDia = localStorage.getItem('primeiroDiaSemana');
    const formatoHora = localStorage.getItem('formatoHora');
    const notificacoes = localStorage.getItem('notificacoes');
    
    if (primeiroDia) document.getElementById('primeiroDiaSemana').value = primeiroDia;
    if (formatoHora) document.getElementById('formatoHora').value = formatoHora;
    if (notificacoes) document.getElementById('notificacoes').checked = notificacoes === 'true';
}

// Função para salvar preferências
function salvarPreferencias() {
    localStorage.setItem('primeiroDiaSemana', document.getElementById('primeiroDiaSemana').value);
    localStorage.setItem('formatoHora', document.getElementById('formatoHora').value);
    localStorage.setItem('notificacoes', document.getElementById('notificacoes').checked);
    mostrarToast('Preferências salvas!', 'success');
}

// Funções de ferramentas (exemplo)
function exportarDados() {
    try {
        // Prepara os dados completos do sistema
        const dados = {
            colaboradores: colaboradores,
            ausencias: ausencias,
            preferencias: {
                tema: localStorage.getItem('tema') || 'light',
                primeiroDiaSemana: localStorage.getItem('primeiroDiaSemana') || '1',
                formatoHora: localStorage.getItem('formatoHora') || '24',
                notificacoes: localStorage.getItem('notificacoes') === 'true'
            },
            metadata: {
                versao: '1.2.0',
                dataExportacao: new Date().toISOString(),
                sistema: 'Software de Escalas'
            }
        };
        
        // Converte para JSON bonito
        const jsonString = JSON.stringify(dados, null, 2);
        
        // Cria o arquivo para download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-escalas-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        // Limpa a URL criada
        URL.revokeObjectURL(url);
        
        mostrarToast('Dados exportados com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        mostrarToast('Erro ao exportar dados', 'error');
    }
}
function aplicarPreferenciasImportadas(preferencias = {}) {
    if (!preferencias || typeof preferencias !== 'object') {
        return;
    }

    if (preferencias.tema) {
        localStorage.setItem('tema', preferencias.tema);
        document.documentElement.setAttribute('data-theme', preferencias.tema);
    }

    if (preferencias.primeiroDiaSemana !== undefined) {
        localStorage.setItem('primeiroDiaSemana', String(preferencias.primeiroDiaSemana));
    }

    if (preferencias.formatoHora !== undefined) {
        localStorage.setItem('formatoHora', String(preferencias.formatoHora));
    }

    if (preferencias.notificacoes !== undefined) {
        localStorage.setItem('notificacoes', String(preferencias.notificacoes));
    }
}

importarDados = function importarDadosAtualizado() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = async (e) => {
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const dados = JSON.parse(event.target.result);
                const isLegacyBackup = Array.isArray(dados?.colaboradores) && Array.isArray(dados?.ausencias);
                const isSystemBackup = Boolean(dados?.data && typeof dados.data === 'object');
                const hasTableSnapshot = ['Colaboradores', 'Ausencias', 'Feriados', 'plantoes', 'BancoHorasMovimentos', 'escala_dia']
                    .some((tableName) => Array.isArray(dados?.[tableName]));

                if (!isLegacyBackup && !isSystemBackup && !hasTableSnapshot) {
                    throw new Error('Arquivo invalido. Use um backup JSON gerado pelo sistema.');
                }

                if (!confirm('A importacao ira substituir todos os dados atuais. Deseja continuar?')) {
                    return;
                }

                mostrarToast('Importando backup...', 'warning');

                const response = await window.API.restaurarBackupSistema({
                    fileName: file.name,
                    backupData: dados
                });

                aplicarPreferenciasImportadas(response?.preferences || dados?.preferencias || {});

                if (response?.safetyBackup?.fileName) {
                    mostrarToast(`Backup importado. O estado anterior foi salvo em "${response.safetyBackup.fileName}".`, 'success');
                } else if (response?.safetyBackupError) {
                    // Restauracao aconteceu, mas sem rede de seguranca: avisa
                    // para o usuario nao supor que ha um ponto de retorno.
                    mostrarToast('Backup importado, mas NAO foi possivel salvar o estado anterior. Verifique a pasta de backup.', 'warning');
                } else {
                    mostrarToast('Backup importado com sucesso! Recarregando a tela...', 'success');
                }

                setTimeout(() => {
                    window.location.reload();
                }, 1400);
            } catch (error) {
                console.error('Erro ao importar:', error);
                mostrarToast(error.message || 'Erro ao importar arquivo', 'error');
            }
        };

        reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
};

function resetarSistema() {
    // Modal de confirmação mais seguro
    if (confirm('⚠️ ATENÇÃO: Isso irá apagar TODOS os dados do sistema!\n\nTem certeza?')) {
        
        const senha = prompt('Digite "RESET" para confirmar:');
        
        if (senha === 'RESET') {
            mostrarToast('Resetando sistema...', 'warning');
            
            // Limpa localStorage
            localStorage.clear();
            
            // Recarrega a página
            setTimeout(() => {
                location.reload();
            }, 1500);
            
        } else {
            mostrarToast('Operação cancelada', 'error');
        }
    }
}

function gerarOptionsMeses(mesSelecionado) {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    let options = '';
    meses.forEach((mes, index) => {
        const selected = index === mesSelecionado ? 'selected' : '';
        options += `<option value="${index}" ${selected}>${mes}</option>`;
    });
    
    return options;
}

// ========== RELATÓRIO MENSAL COMPLETO ==========
async function gerarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);
    
    console.log("📊 Gerando relatório para:", mes + 1, "/", ano);
    console.log("Recarregando dados...");

    // 🔥 IMPORTANTE: Carregar todos os dados
    await carregarColaboradores();
    await carregarAusencias();
    await carregarFeriadosLocais();
    await carregarFeriadosAPI(ano); // 🔥 Carregar feriados da API

    console.log("Dados carregados:", {
        colaboradores: colaboradores.length,
        ausencias: ausencias.length,
        feriadosLocais: feriadosLocais.length,
        feriadosAPI: feriadosAPI.length
    });

    // Gerar o relatório calendário
    gerarRelatorioCalendarioCompleto(mes, ano);
}

function mostrarRelatorio(titulo, conteudo) {
    document.getElementById('relatorioTitulo').innerText = titulo;
    document.getElementById('relatorioConteudo').innerHTML = conteudo;
    document.getElementById('relatorioVisualizacao').style.display = 'block';
}

function fecharRelatorio() {
    document.getElementById('relatorioVisualizacao').style.display = 'none';
}

// ========== FUNÇÕES DE EXPORTAÇÃO ==========
async function exportarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);
    
    await exportarComoPDF(mes, ano);
}

async function exportarRelatorioPDF() {
    const elemento = document.querySelector('.relatorio-calendario');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    if (!elemento) return;
    
    mostrarToast('Gerando PDF...', 'warning');
    
    try {
        // Captura o elemento como canvas
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [canvas.width * 0.75, canvas.height * 0.75]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
        pdf.save(`${titulo.replace(/ /g, '_')}.pdf`);
        
        mostrarToast('PDF gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        mostrarToast('Erro ao gerar PDF', 'error');
    }
}
async function exportarRelatorioImagem() {
    const elemento = document.querySelector('.relatorio-calendario');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    if (!elemento) return;
    
    mostrarToast('Gerando imagem...', 'warning');
    
    try {
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const link = document.createElement('a');
        link.download = `${titulo.replace(/ /g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        mostrarToast('Imagem gerada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar imagem:', error);
        mostrarToast('Erro ao gerar imagem', 'error');
    }
}
function exportarRelatorioCSV() {
    const tabelas = document.querySelectorAll('.relatorio-tabela');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    let csv = '';
    
    tabelas.forEach((tabela, index) => {
        const linhas = tabela.querySelectorAll('tr');
        
        linhas.forEach(linha => {
            const colunas = linha.querySelectorAll('th, td');
            const dados = Array.from(colunas).map(col => 
                `"${col.innerText.replace(/"/g, '""')}"`
            );
            csv += dados.join(',') + '\n';
        });
        
        if (index < tabelas.length - 1) {
            csv += '\n\n'; // Separa as tabelas
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${titulo.replace(/ /g, '_')}.csv`;
    link.click();
    
    mostrarToast('CSV exportado com sucesso!', 'success');
}

function mostrarOpcoesExportacao(dados, mes, ano) {
    // Cria modal de opções
    const modal = document.createElement('div');
    modal.className = 'exportar-modal-overlay';
    modal.innerHTML = `
        <div class="exportar-modal">
            <div class="exportar-modal-header">
                <h3><i class="fas fa-download"></i> Exportar Relatório</h3>
                <button onclick="this.closest('.exportar-modal-overlay').remove()" class="btn-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="exportar-modal-body">
                <p>Escolha o formato para exportar:</p>
                
                <div class="exportar-opcoes">
                    <button onclick="exportarComoPDF(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-pdf"></i>
                        <span>PDF</span>
                    </button>
                    
                    <button onclick="exportarComoImagem(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-image"></i>
                        <span>Imagem</span>
                    </button>
                    
                    <button onclick="exportarComoCSV(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-csv"></i>
                        <span>CSV</span>
                    </button>
                    
                    <button onclick="exportarComoJSON(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-code"></i>
                        <span>JSON</span>
                    </button>
                </div>
            </div>
            
            <div class="exportar-modal-footer">
                <button onclick="this.closest('.exportar-modal-overlay').remove()" class="btn-secondary">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function exportarComoImagem(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    mostrarToast('Gerando imagem...', 'warning');
    
    try {
        const dados = await gerarRelatorioCalendarioParaExportar(mes, ano);
        const relatorioHTML = renderizarRelatorioParaExportar(dados);
        
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.innerHTML = relatorioHTML;
        document.body.appendChild(container);
        
        const canvas = await html2canvas(container, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const link = document.createElement('a');
        link.download = `Relatorio_${dados.mesNome}_${dados.ano}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        document.body.removeChild(container);
        mostrarToast('Imagem gerada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar imagem:', error);
        mostrarToast('Erro ao gerar imagem', 'error');
    }
}

function exportarComoCSV(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    mostrarToast('Gerando CSV...', 'warning');
    
    // Coleta dados do mês
    const dados = coletarDadosParaCSV(mes, ano);
    
    // Gera CSV
    let csv = `Mês,${dados.mesNome} ${dados.ano}\n\n`;
    csv += 'Data,Dia da Semana,Feriado,Tipo,Colaborador\n';
    
    dados.eventos.forEach(e => {
        csv += `"${e.data}","${e.diaSemana}","${e.feriado || ''}","${e.tipo}","${e.colaborador}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${dados.mesNome}_${dados.ano}.csv`;
    link.click();
    
    mostrarToast('CSV gerado com sucesso!', 'success');
}

function exportarComoJSON(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    
    const dados = coletarDadosParaJSON(mes, ano);
    const jsonString = JSON.stringify(dados, null, 2);
    
    const blob = new Blob([jsonString], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${dados.mesNome}_${dados.ano}.json`;
    link.click();
    
    mostrarToast('JSON gerado com sucesso!', 'success');
}

// ========== FUNÇÕES AUXILIARES ==========

async function carregarFeriadosLocais() {
    console.log("=== CARREGANDO FERIADOS LOCAIS ===");
    
    try {
        const response = await fetch('http://localhost:3000/api/feriados');
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }
        
        const data = await response.json();
        console.log("📦 Dados do backend:", data);
        
        // 🔥 MAPEAMENTO CORRETO - backend envia maiúsculas (Id, Nome, Data, Tipo)
        feriadosLocais = data.map(f => ({
            // Formato com maiúsculas (para o frontend)
            Id: f.Id,
            Nome: f.Nome,
            Data: f.Data,
            Tipo: f.Tipo || 'municipal',
            
            // Formato com minúsculas (para compatibilidade)
            id: f.Id,
            nome: f.Nome,
            data: f.Data,
            tipo: f.Tipo || 'municipal'
        }));
        
        window.feriadosLocais = feriadosLocais;
        
        console.log(`✅ Feriados carregados: ${feriadosLocais.length}`);
        
        // Atualizar calendário
        if (typeof gerarCalendario === "function" && document.getElementById("calendar")) {
            gerarCalendario(mesAtual, anoAtual);
        }
        
        return feriadosLocais;
        
    } catch (error) {
        console.error("❌ Erro:", error);
        feriadosLocais = [];
        window.feriadosLocais = [];
        return [];
    }
}

// Abrir modal de feriado
function abrirModalFeriado() {
    console.log("Abrindo modal de feriado...");

    const modal = document.getElementById('modalFeriado');
    if (!modal) {
        console.error("Modal de feriado não encontrado!");
        return;
    }

    // Mostra loading, esconde outros
    document.getElementById("loadingFeriados").classList.remove("hidden");
    document.getElementById("emptyFeriados").classList.add("hidden");
    document.getElementById("listaFeriados").classList.add("hidden");

    // Limpa formulário
    document.getElementById("feriadoNome").value = "";
    document.getElementById("feriadoData").value = "";
    document.getElementById("feriadoTipo").value = "municipal";

    editandoFeriadoId = null;
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-save"></i> Salvar Feriado';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.add("hidden");

    // Carrega a lista de feriados
    carregarListaFeriados();

    // Abre o modal
    modal.classList.remove("hidden");
    modal.classList.add("active");
}

// Carregar listagem de feriados
async function carregarListaFeriados() {
    console.log("=== CARREGANDO FERIADOS (API + MANUAIS) ===");
    
    const container = document.getElementById("listaFeriados");
    if (!container) return;
    
    const loadingEl = document.getElementById("loadingLancamentos");
    if (loadingEl) loadingEl.classList.remove("hidden");
    container.innerHTML = '';
    
    try {
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        // ===== 1. FERIADOS NACIONAIS (calculados pelo servidor) =====
        let feriadosAPI = [];
        try {
            feriadosAPI = await window.buscarFeriadosNacionais(anoAtual);
        } catch (e) {
            console.error("❌ Erro ao carregar feriados nacionais:", e);
        }
        
        // ===== 2. FERIADOS MANUAIS (do banco) =====
        let feriadosManuais = window.feriadosLocais || [];
        console.log("📝 Feriados manuais (do banco):", feriadosManuais);
        
        // ===== 3. COMBINAR TODOS OS FERIADOS =====
        const todosFeriados = [];
        
        // API feriados
        feriadosAPI.forEach(f => {
            const data = new Date(f.date + 'T12:00:00');
            todosFeriados.push({
                id: `api-${f.date}`,
                nome: f.name,
                data: data,
                dataStr: f.date,
                tipo: 'federal',
                origem: 'api',
                icone: '🇧🇷',
                cor: '#0d9488',
                mes: data.getMonth(),
                ano: data.getFullYear()
            });
        });
        
        // Manuais (do banco)
        feriadosManuais.forEach(f => {
            // 🔥 USAR OS CAMPOS CORRETOS (maiúsculos)
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return;
            
            // Extrair apenas a data (remover o T00:00:00.000Z)
            const dataStr = dataFeriado.split('T')[0];
            const data = new Date(dataStr + 'T12:00:00');
            
            todosFeriados.push({
                id: f.Id || f.id,
                nome: f.Nome || f.nome || 'Feriado',
                data: data,
                dataStr: dataStr,
                tipo: f.Tipo || f.tipo || 'municipal',
                origem: 'manual',
                icone: '📝',
                cor: '#e0973a',
                mes: data.getMonth(),
                ano: data.getFullYear()
            });
        });
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (todosFeriados.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado encontrado</div>';
            return;
        }
        
        // Filtrar apenas do mês atual
        const feriadosDoMes = todosFeriados.filter(f => f.mes === mesAtual && f.ano === anoAtual);
        
        if (feriadosDoMes.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado neste mês</div>';
            return;
        }
        
        // Ordenar
        feriadosDoMes.sort((a, b) => a.data - b.data);
        
        // Gerar HTML
        let html = '';
        feriadosDoMes.forEach(f => {
            const dataFormatada = f.data.toLocaleDateString('pt-BR');
            const isManual = f.origem === 'manual';
            const cor = f.cor;
            const bgCor = isManual ? '#e0973a20' : '#0d948820';
            
            html += `
                <div class="lancamento-card" style="border-left: 4px solid ${cor}; margin-bottom: 10px;">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas ${isManual ? 'fa-city' : 'fa-globe'}" style="color: ${cor};"></i>
                            <span><strong>${f.nome}</strong></span>
                        </div>
                        <span class="lancamento-badge" style="background: ${bgCor}; color: ${cor};">
                            ${f.icone} ${isManual ? f.tipo : 'Federal'}
                        </span>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin: 8px 0; padding: 8px; background: var(--card-dark); border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-calendar-alt" style="color: ${cor};"></i>
                            <span>${dataFormatada}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; justify-content: flex-end; padding-top: 8px; border-top: 1px dashed var(--border);">
                        ${isManual ? `
                            <button onclick="editarLancamento('feriado', '${f.id}')" class="btn-icon-sm edit" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="excluirLancamento('feriado', '${f.id}')" class="btn-icon-sm delete" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : `
                            <span style="background: #e2e8f0; color: #64748b; padding: 4px 12px; border-radius: 16px; font-size: 11px;">
                                <i class="fas fa-lock"></i> Feriado oficial
                            </span>
                        `}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log("✅ Lista de feriados renderizada!");
        
    } catch (error) {
        console.error("❌ Erro:", error);
        if (loadingEl) loadingEl.classList.add("hidden");
        container.innerHTML = `<div class="empty-state">Erro: ${error.message}</div>`;
    }
}

// ================= SALVAR FERIADO =================
async function salvarFeriado() {
    try {
        const nome = document.getElementById("feriadoNome").value;
        const tipo = document.getElementById("feriadoTipo").value;
        const dataInicio = document.getElementById("dataInicio").value;
        
        if (!nome || !dataInicio) {
            mostrarToast("Preencha nome e data", "error");
            return;
        }
        
        const dados = {
            nome: nome,
            data: dataInicio,  
            tipo: tipo || 'municipal'
        };
        
        console.log("📤 Enviando:", dados);
        
        const response = await fetch('http://localhost:3000/api/feriados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }
        
        const result = await response.json();
        console.log("✅ Resposta:", result);
        
        // Recarregar feriados
        await carregarFeriadosLocais();
        
        // Recarregar lista no modal
        if (typeof carregarListaFeriados === 'function') {
            await carregarListaFeriados();
        }
        
        // Atualizar calendário
        if (typeof gerarCalendario === 'function' && document.getElementById("calendar")) {
            gerarCalendario(mesAtual, anoAtual);
        }
        
        mostrarToast("Feriado salvo!", "success");
        resetarFormularioLancamento();
        
    } catch (error) {
        console.error("❌ Erro:", error);
        mostrarToast("Erro ao salvar feriado", "error");
    }
}

// Editar feriado
function editarFeriado(id) {
    console.log("Editando feriado ID:", id);
    
    const feriado = feriadosLocais.find(f => (f.Id === id || f.id === id));
    if (!feriado) {
        mostrarToast("Feriado não encontrado", "error");
        return;
    }

    editandoFeriadoId = id;
    
    document.getElementById("feriadoNome").value = feriado.Nome || feriado.nome;
    
    // Formata a data para o input
    if (feriado.Data || feriado.data) {
        const dataObj = new Date(feriado.Data || feriado.data);
        const dataFormatada = dataObj.toISOString().split('T')[0];
        document.getElementById("feriadoData").value = dataFormatada;
    }
    
    document.getElementById("feriadoTipo").value = feriado.Tipo || feriado.tipo || 'municipal';
    
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.remove("hidden");
    
    document.querySelector('.form-section')?.scrollIntoView({ behavior: 'smooth' });
}

// Cancelar edição de feriado
function cancelarEdicaoFeriado() {
    editandoFeriadoId = null;
    document.getElementById("feriadoNome").value = "";
    document.getElementById("feriadoData").value = "";
    document.getElementById("feriadoTipo").value = "municipal";
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-save"></i> Salvar Feriado';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.add("hidden");
}

// Excluir feriado
async function excluirFeriado(id) {

    if (!confirm("Deseja realmente excluir este feriado?")) return;

    try {

        await API.excluirFeriado(id);

        await carregarFeriadosLocais();
        await carregarListaFeriados();

        console.log("Feriado removido");

    } catch (error) {

        console.error("Erro ao excluir feriado:", error);
        alert("Erro ao excluir feriado");

    }

}
function gerarLegendaMensal() {
    const container = document.getElementById("legendaMensalContent");
    if (!container) return;

    // Verificar se os dados existem
    if (!colaboradores) colaboradores = [];
    if (!ausencias) ausencias = [];
    if (!feriados) feriados = [];
    if (!feriadosLocais) feriadosLocais = [];

    const mes = mesAtual;
    const ano = anoAtual;
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Contadores
    let totalFeriados = 0;
    let totalAusencias = 0;
    let totalFolgas = 0;
    let totalFerias = 0;
    let eventosPorDia = {};

    // Inicializar eventos por dia
    for (let dia = 1; dia <= diasNoMes; dia++) {
        eventosPorDia[dia] = {
            feriados: [],
            ausencias: [],
            folgas: [],
            ferias: []
        };
    }

    // Processar feriados da API
    if (feriados && feriados.length > 0) {
        feriados.forEach(f => {
            if (f.date) {
                const [anoF, mesF, diaF] = f.date.split('-').map(Number);
                if (mesF === mes + 1 && anoF === ano) {
                    eventosPorDia[diaF].feriados.push(f.name);
                    totalFeriados++;
                }
            }
        });
    }

    // Processar feriados locais
    if (feriadosLocais && feriadosLocais.length > 0) {
        feriadosLocais.forEach(f => {
            if (f.Data) {
                const data = new Date(f.Data);
                if (data.getMonth() === mes && data.getFullYear() === ano) {
                    const dia = data.getDate();
                    eventosPorDia[dia].feriados.push(`${f.Nome} (${f.Tipo || 'municipal'})`);
                    totalFeriados++;
                }
            }
        });
    }

    // 🔥 CORREÇÃO: Processar ausências com os tipos corretos
    if (ausencias && ausencias.length > 0 && colaboradores.length > 0) {
        ausencias.forEach(a => {
            if (a.DataInicio && a.DataFim) {
                const dataInicio = new Date(a.DataInicio);
                const dataFim = new Date(a.DataFim);
                const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                
                if (!colaborador) return;

                // Verificar se o período cruza com o mês atual
                const primeiroDiaMes = new Date(ano, mes, 1);
                const ultimoDiaMes = new Date(ano, mes + 1, 0);
                
                if (dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes) {
                    
                    // 🔥 CORREÇÃO: Identificar o tipo corretamente
                    const tipo = (a.tipo || a.Tipo || '').toLowerCase();
                    
                    // Incrementar contadores por tipo
                    if (tipo === 'folga') {
                        totalFolgas++;
                    } else if (tipo === 'ferias') {
                        totalFerias++;
                    } else if (tipo === 'ausencia') {
                        totalAusencias++;
                    }
                    
                    // Adicionar aos dias específicos do mês
                    const diaInicio = Math.max(1, dataInicio.getDate());
                    const diaFim = Math.min(diasNoMes, dataFim.getDate());
                    
                    for (let dia = diaInicio; dia <= diaFim; dia++) {
                        const dataDia = new Date(ano, mes, dia);
                        
                        // Verificar se o dia está dentro do período
                        if (dataDia >= dataInicio && dataDia <= dataFim) {
                            if (tipo === 'folga') {
                                eventosPorDia[dia].folgas.push(colaborador.Nome);
                            } else if (tipo === 'ferias') {
                                eventosPorDia[dia].ferias.push(colaborador.Nome);
                            } else if (tipo === 'ausencia') {
                                eventosPorDia[dia].ausencias.push(colaborador.Nome);
                            }
                        }
                    }
                }
            }
        });
    }

    // Gerar HTML da legenda
    let html = `
        <div class="legenda-resumo">
            <div class="legenda-cards">
                <div class="legenda-card feriado">
                    <i class="fas fa-calendar-day"></i>
                    <div>
                        <strong>${totalFeriados}</strong>
                        <span>Feriados</span>
                    </div>
                </div>
                <div class="legenda-card ferias">
                    <i class="fas fa-umbrella-beach"></i>
                    <div>
                        <strong>${totalFerias}</strong>
                        <span>Férias</span>
                    </div>
                </div>
                <div class="legenda-card folga">
                    <i class="fas fa-leaf"></i>
                    <div>
                        <strong>${totalFolgas}</strong>
                        <span>Folgas</span>
                    </div>
                </div>
                <div class="legenda-card ausencia">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>${totalAusencias}</strong>
                        <span>Ausências</span>
                    </div>
                </div>
            </div>
    `;

    // Dias com eventos
    const diasComEventos = [];
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const eventos = eventosPorDia[dia];
        if (eventos.feriados.length > 0 || eventos.ausencias.length > 0 || 
            eventos.folgas.length > 0 || eventos.ferias.length > 0) {
            diasComEventos.push({ dia, eventos });
        }
    }

    if (diasComEventos.length > 0) {
        html += `
            <div class="legenda-dias">
                <h5>Detalhamento por dia</h5>
                <div class="legenda-dias-grid">
        `;

        diasComEventos.forEach(({ dia, eventos }) => {
            html += `<div class="legenda-dia-card">`;
            html += `<div class="legenda-dia-numero">${dia}</div>`;
            html += `<div class="legenda-dia-eventos">`;
            
            eventos.feriados.forEach(f => {
                html += `<span class="legenda-evento feriado-tag">📅 ${f}</span>`;
            });
            
            eventos.ferias.forEach(f => {
                html += `<span class="legenda-evento ferias-tag">🏖️ ${f}</span>`;
            });
            
            eventos.folgas.forEach(f => {
                html += `<span class="legenda-evento folga-tag">🌸 ${f}</span>`;
            });
            
            eventos.ausencias.forEach(a => {
                html += `<span class="legenda-evento ausencia-tag">⚠️ ${a}</span>`;
            });
            
            html += `</div></div>`;
        });

        html += `
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="legenda-sem-eventos">
                <i class="fas fa-check-circle"></i>
                <p>Nenhum evento no mês atual</p>
            </div>
        `;
    }

    html += `</div>`;

    container.innerHTML = html;

}


function debugTiposAusencias() {
    console.log("=== DEBUG TIPOS DE AUSÊNCIAS ===");
    if (ausencias && ausencias.length > 0) {
        ausencias.forEach((a, index) => {
            console.log(`Ausência ${index + 1}:`, {
                id: a.id || a.Id,
                tipo: a.tipo || a.Tipo,
                tipoLower: (a.tipo || a.Tipo || '').toLowerCase(),
                colaboradorId: a.colaboradorId || a.ColaboradorId,
                dataInicio: a.DataInicio,
                dataFim: a.DataFim
            });
        });
    } else {
        console.log("Nenhuma ausência encontrada");
    }
}

function renderCalendario() {
    console.log('Renderizando calendário...');
    
    if (!appContent) {
        console.error("appContent não encontrado!");
        return;
    }
    
    // Usuario comum abre esta tela apenas para consultar folgas e ferias da
    // equipe; o botao de lancamento resultaria em 403 no back-end.
    const podeLancar = typeof window.usuarioEhAdmin !== 'function' || window.usuarioEhAdmin();

    appContent.innerHTML = `
        <div class="page-header">
            <h1>Calendário Mensal</h1>
            <div class="header-actions">
                ${podeLancar ? `
                <button id="btnLancamentoAjuste" class="btn-primary">
                    <i class="fas fa-plus"></i> Lançamento
                </button>
                ` : ''}
            </div>
        </div>

        <div class="calendar-wrapper">
            <div class="calendar-header">
                <div class="month-nav">
                    <button id="prevMonth" class="nav-btn">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h2 id="monthTitle">Carregando...</h2>
                    <button id="nextMonth" class="nav-btn">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>

            <div class="weekdays"></div>
            <div id="calendar" class="calendar-grid"></div>
        </div>
    `;

    // 🔥 VERIFICAR SE OS ELEMENTOS FORAM CRIADOS
    setTimeout(() => {
        const calendar = document.getElementById('calendar');
        const prevMonth = document.getElementById('prevMonth');
        const nextMonth = document.getElementById('nextMonth');
        
        console.log('Verificando elementos do calendário:', {
            calendar: !!calendar,
            prevMonth: !!prevMonth,
            nextMonth: !!nextMonth
        });
        
        if (!calendar) {
            console.error("Elemento calendar não foi criado!");
            return;
        }
        
        // Inicializar o calendário
        if (typeof window.inicializarCalendario === 'function') {
            console.log('Chamando inicializarCalendario...');
            window.inicializarCalendario();
        } else {
            console.error('Função inicializarCalendario não encontrada!');
        }
    }, 200); // Pequeno delay para garantir que o DOM foi atualizado
}
// Modificar a função abrirModalAusencia para resetar os campos de hora
function abrirModalAusencia(dataISO = null) {
    console.log("Abrindo modal de ausência...", dataISO);
    
    const modal = document.getElementById("modal");
    if (!modal) {
        console.error("Modal não encontrado!");
        return;
    }
    
    dataSelecionada = dataISO;
    
    document.getElementById("loadingAusencias").classList.remove("hidden");
    document.getElementById("emptyAusencias").classList.add("hidden");
    document.getElementById("listaAusencias").classList.add("hidden");
    
    document.getElementById("colaboradorSelect").value = "";
    document.getElementById("tipoSelect").value = "folga";
    document.getElementById("periodoTipo").value = "dia_inteiro";
    document.getElementById("camposHora").classList.add("hidden");
    document.getElementById("horaInicio").value = "";
    document.getElementById("horaFim").value = "";
    
    if (dataISO) {
        let dataFormatada = dataISO;
        if (dataISO.includes('T')) {
            dataFormatada = dataISO.split('T')[0];
        }
        document.getElementById("dataInicio").value = dataFormatada;
        document.getElementById("dataFim").value = dataFormatada;
    } else {
        document.getElementById("dataInicio").value = "";
        document.getElementById("dataFim").value = "";
    }
    
    editandoAusenciaId = null;
    document.getElementById("salvarAusenciaBtn").innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById("cancelarEdicaoLancamentoBtn").classList.add("hidden");
    
    carregarColaboradoresNoSelect();
    carregarAusenciasDoDia(dataISO);
    
    // 🔥 CHAMAR A CONFIGURAÇÃO DOS CAMPOS DE HORA
    configurarCamposHora();
    
    modal.classList.remove("hidden");
    modal.classList.add("active");
}
function debugDados() {
    console.log("=== DEBUG DO SISTEMA ===");
    console.log("Colaboradores:", colaboradores.length);
    console.log("Ausências:", ausencias.length);
    console.log("Feriados API:", feriados?.length || 0);
    console.log("Feriados Locais:", feriadosLocais?.length || 0);
    
    if (ausencias.length > 0) {
        console.log("Primeira ausência:", ausencias[0]);
    }
}

function getPaginaFromURL() {
    // Pega o hash da URL, ex: #dashboard, #calendario
    const hash = window.location.hash.substring(1); // Remove o #
    
    // Se não tiver hash ou for inválido, retorna dashboard
    const paginasValidas = ['dashboard', 'calendario', 'colaboradores', 'escala', 'lancamentoPlantao', 'bancoHoras', 'relatorios', 'configuracoes', 'usuarios'];
    
    if (hash && paginasValidas.includes(hash)) {
        return hash;
    }
    
    return 'dashboard';
}

// carregarPagina troca window.location.hash, e no navegador isso tambem dispara
// popstate: cada navegacao montava a tela duas vezes (na Escala do Dia, duas
// requisicoes que gravam a escala do mesmo dia ao mesmo tempo). Aqui so
// recarrega quando a URL aponta para outra pagina — o "voltar" do navegador.
window.addEventListener('popstate', () => {
    const pagina = getPaginaFromURL();

    if (pagina === paginaCarregadaAtual) {
        return;
    }

    carregarPagina(pagina);
});

function testarAtualizacao() {
    console.log("Testando atualização...");
    atualizarTudo();
}

// No app.js, adicione esta função
function atualizarCalendario() {
    if (document.getElementById("calendar")) {
        // Atualizar a variável global no calendar.js
        if (typeof window.feriadosLocais !== 'undefined') {
            window.feriadosLocais = feriadosLocais;
        }
        
        // Chamar a função de gerar calendário
        if (typeof gerarCalendario === 'function') {
            gerarCalendario(mesAtual, anoAtual);
        }
    }
}

function toggleCamposHora(select) {
    const camposHora = document.getElementById('camposHora');
    if (select.value === 'horas') {
        camposHora.classList.remove('hidden');
    } else {
        camposHora.classList.add('hidden');
    }
}


// ========== FUNÇÃO PARA CARREGAR OS FERIADOS NACIONAIS ==========
// A lista vem do servidor (que a calcula); a BrasilAPI ficou como reserva
// dentro de buscarFeriadosNacionais, em api.js.
async function carregarFeriadosAPI(ano) {
    try {
        feriadosAPI = await window.buscarFeriadosNacionais(ano);
        window.feriadosAPI = feriadosAPI; // Disponibilizar globalmente
        console.log(`✅ Feriados nacionais carregados: ${feriadosAPI.length}`);
        return feriadosAPI;
    } catch (error) {
        console.error("❌ Erro ao carregar feriados nacionais:", error);
        feriadosAPI = [];
        window.feriadosAPI = [];
        return [];
    }
}


// ================= FUNÇÃO PARA MOSTRAR DETALHES DA HORA =================
function mostrarDetalhesHora(hora) {
    console.log(`Mostrando detalhes da hora ${hora}:00`);
    
    // Coletar colaboradores que estão trabalhando nesta hora
    const colaboradoresTrabalhando = [];
    const colaboradoresAlmoco = [];
    const colaboradoresFolga = [];
    const colaboradoresFerias = [];
    const colaboradoresAusentes = [];
    
    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    
    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);
        
        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(0, 0, 0, 0);
            const dataComp = new Date(dataSelecionada);
            dataComp.setHours(0, 0, 0, 0);
            
            return dataComp >= dataInicio && dataComp <= dataFim;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }
        
        // Verificar status do colaborador nesta hora
        if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
            colaboradoresFerias.push(c.Nome);
        }
        else if ((tipoAusenciaDia === 'folga' || tipoAusenciaDia === 'ausencia') && !horasAusencia) {
            colaboradoresFolga.push(c.Nome);
        }
        else {
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim;
            
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;

            if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                colaboradoresAusentes.push(c.Nome);
            }
            else if (noAlmoco) {
                colaboradoresAlmoco.push(c.Nome);
            }
            else if (noTrabalho) {
                colaboradoresTrabalhando.push(c.Nome);
            }
        }
    });
    
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'modal detalhes-hora-modal';
    modal.id = 'detalhesHoraModal';
    
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);">
                <h3 style="color: white;"><i class="fas fa-clock"></i> ${hora}:00 - Detalhamento</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()" style="color: white;">&times;</button>
            </div>
            
            <div class="modal-body" style="max-height: 500px; overflow-y: auto; padding: 20px;">
                ${colaboradoresTrabalhando.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-briefcase"></i> Trabalhando (${colaboradoresTrabalhando.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresTrabalhando.map(nome => `
                                <div style="background: var(--primary-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--primary);">
                                    <i class="fas fa-user" style="color: var(--primary); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresAlmoco.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--warning); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-utensils"></i> Almoço (${colaboradoresAlmoco.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresAlmoco.map(nome => `
                                <div style="background: var(--warning-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--warning);">
                                    <i class="fas fa-user" style="color: var(--warning); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresFolga.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: #94a3b8; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-leaf"></i> Folga (${colaboradoresFolga.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresFolga.map(nome => `
                                <div style="background: #f1f5f9; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #94a3b8;">
                                    <i class="fas fa-user" style="color: #64748b; margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresFerias.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: #0d9488; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-umbrella-beach"></i> Férias (${colaboradoresFerias.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresFerias.map(nome => `
                                <div style="background: #dbeafe; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #0d9488;">
                                    <i class="fas fa-user" style="color: #1d63ed; margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresAusentes.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--danger); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-exclamation-triangle"></i> Ausente (${colaboradoresAusentes.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresAusentes.map(nome => `
                                <div style="background: var(--danger-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--danger);">
                                    <i class="fas fa-user" style="color: var(--danger); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresTrabalhando.length === 0 && colaboradoresAlmoco.length === 0 && 
                  colaboradoresFolga.length === 0 && colaboradoresFerias.length === 0 && 
                  colaboradoresAusentes.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--text-light);">
                        <i class="fas fa-clock" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                        <p>Nenhum colaborador com status registrado para esta hora</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="modal-actions" style="padding: 16px 20px; border-top: 1px solid var(--border);">
                <button onclick="this.closest('.modal').remove()" class="btn-primary" style="width: 100%;">
                    <i class="fas fa-check"></i> Fechar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Mostrar modal
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}



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
        id: 'escalas',
        label: 'Escalas',
        icon: 'calendar-check',
        description: 'Tipos de escala'
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


const LEGACY_API_URL_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1):3000\/api(?=\/|$|\?)/i;

function getRuntimeApiBaseUrl() {
    if (window.__API_BASE_URL) {
        const explicitBase = String(window.__API_BASE_URL).replace(/\/$/, '');
        return explicitBase.endsWith('/api') ? explicitBase : `${explicitBase}/api`;
    }

    const origin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'http://localhost:4450';

    return `${origin.replace(/\/$/, '')}/api`;
}

function normalizeApiUrl(input) {
    if (typeof input !== 'string') {
        return input;
    }

    return input.replace(LEGACY_API_URL_PATTERN, getRuntimeApiBaseUrl());
}

function normalizeFetchInput(input) {
    if (typeof input === 'string') {
        return normalizeApiUrl(input);
    }

    if (typeof URL !== 'undefined' && input instanceof URL) {
        const normalized = normalizeApiUrl(input.href);
        return normalized === input.href ? input : new URL(normalized);
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
        const normalized = normalizeApiUrl(input.url);
        return normalized === input.url ? input : new Request(normalized, input);
    }

    return input;
}

function getRequestUrl(input) {
    if (typeof input === 'string') {
        return input;
    }

    if (input && typeof input.url === 'string') {
        return input.url;
    }

    return '';
}

function notifyIfSessionExpired(response, requestUrl) {
    if (response.status !== 401) {
        return;
    }

    if (!requestUrl.includes('/api/') || requestUrl.includes('/api/auth/')) {
        return;
    }

    window.dispatchEvent(new CustomEvent('auth:expired'));
}

function installApiFetchNormalizer() {
    if (window.__API_FETCH_NORMALIZER_INSTALLED__ || typeof window.fetch !== 'function') {
        return;
    }

    const nativeFetch = window.fetch.bind(window);

    window.fetch = function fetchWithDynamicApiHost(input, init) {
        const normalizedInput = normalizeFetchInput(input);

        return nativeFetch(normalizedInput, init).then((response) => {
            notifyIfSessionExpired(response, getRequestUrl(normalizedInput));
            return response;
        });
    };

    window.__API_FETCH_NORMALIZER_INSTALLED__ = true;
    window.normalizeLegacyApiUrl = normalizeApiUrl;
}

installApiFetchNormalizer();

const API = {
    get baseURL() {
        return getRuntimeApiBaseUrl();
    },

    normalizeUrl: normalizeApiUrl,

    toQuery(params = {}) {
        const searchParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                return;
            }

            searchParams.set(key, value);
        });

        const query = searchParams.toString();
        return query ? `?${query}` : '';
    },

    async request(endpoint, options = {}) {
        const requestOptions = { ...options };
        const headers = new Headers(requestOptions.headers || {});

        if (requestOptions.body !== undefined && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        requestOptions.headers = headers;

        const response = await fetch(`${this.baseURL}${endpoint}`, requestOptions);
        const contentType = response.headers.get('content-type') || '';

        let payload = null;

        if (contentType.includes('application/json')) {
            payload = await response.json().catch(() => null);
        } else {
            payload = await response.text().catch(() => '');
        }

        if (!response.ok) {
            const message = payload?.error || payload?.message ||
                (typeof payload === 'string' && payload.trim()) ||
                `Erro ${response.status}`;

            const error = new Error(message);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    },

    get(endpoint, params) {
        return this.request(`${endpoint}${this.toQuery(params)}`);
    },

    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    },

    health: () => API.get('/health'),
    getNetworkStatus: () => API.get('/network/status'),

    getColaboradores: (params = {}) => API.get('/colaboradores', params),
    getSetores: (params = {}) => API.get('/setores', params),
    salvarSetor: (data) => API.post('/setores', data),
    salvarColaborador: (data) => data.id
        ? API.put(`/colaboradores/${data.id}`, data)
        : API.post('/colaboradores', data),
    getColaboradorJornadaSemanal: (colaboradorId) => API.get(`/colaboradores/${colaboradorId}/jornada-semanal`),
    salvarColaboradorJornadaSemanal: (colaboradorId, jornadaSemanal) => API.put(`/colaboradores/${colaboradorId}/jornada-semanal`, {
        jornadaSemanal
    }),
    getJornadaSemanal: (params = {}) => API.get('/jornada-semanal', params),
    excluirColaborador: (id) => API.delete(`/colaboradores/${id}`),
    desligarColaborador: (id, data) => API.put(`/colaboradores/${id}/desligar`, data),
    reativarColaborador: (id) => API.put(`/colaboradores/${id}/reativar`, {}),
    // Confirma a senha do usuario logado antes de uma acao sensivel (ex.:
    // excluir colaborador). Lanca erro com .status 403 se a senha estiver errada.
    verificarSenha: (password) => API.post('/auth/verify-password', { password }),

    getAusencias: (params = {}) => API.get('/ausencias', params),
    salvarAusencia: (data) => data.id
        ? API.put(`/ausencias/${data.id}`, data)
        : API.post('/ausencias', data),
    excluirAusencia: (id) => API.delete(`/ausencias/${id}`),

    getFeriados: (params = {}) => API.get('/feriados', params),
    salvarFeriado: (data) => data.id
        ? API.put(`/feriados/${data.id}`, data)
        : API.post('/feriados', data),
    excluirFeriado: (id) => API.delete(`/feriados/${id}`),

    getPlantoes: (params = {}) => API.get('/plantoes', params),
    salvarPlantao: (data) => API.post('/plantoes', data),
    getPlantaoDia: (dataISO) => API.get(`/plantoes/${dataISO}`),
    excluirPlantao: (dataISO) => API.delete(`/plantoes/${dataISO}`),
    getPlantaoDisponibilidade: (dataISO, params = {}) => API.get(`/plantoes/disponibilidade/${dataISO}`, params),

    getEscalaDia: (dataISO, params = {}) => API.get(`/escala/dia/${dataISO}`, params),
    getEscalaRelatorio: (params = {}) => API.get('/escala/relatorio', params),
    salvarEscalaDia: (dataISO, colaboradorId, data) => API.put(`/escala/dia/${dataISO}/colaborador/${colaboradorId}`, data),
    aplicarAlmocoPeriodo: (data) => API.put('/escala/almoco-periodo', data),
    restaurarAlmocosCadastroEscala: (dataISO, data = {}) => API.put(`/escala/dia/${dataISO}/almocos/cadastro`, data),
    sincronizarEscala: (data) => API.post('/escala/rebuild', data),

    getBancoHorasStatus: () => API.get('/banco-horas/status'),
    getBancoHorasResumo: (params = {}) => API.get('/banco-horas/resumo', params),
    getBancoHorasExtrato: (colaboradorId, params = {}) => API.get(`/banco-horas/colaborador/${colaboradorId}`, params),
    atualizarBancoHorasSaldo: (colaboradorId, data) => API.put(`/banco-horas/colaborador/${colaboradorId}/saldo`, data),
    recalcularBancoHoras: () => API.post('/banco-horas/recalcular', {}),

    getBancoHorasSemanal: (params = {}) => API.get('/banco-horas-semanal', params),
    salvarBancoHorasSemanalCelula: (data) => API.put('/banco-horas-semanal/celula', data),
    salvarBancoHorasSemanalNota: (data) => API.put('/banco-horas-semanal/nota', data),
    verificarBancoHorasSemanal: (params = {}) => API.get('/banco-horas-semanal/verificar', params),
    getBancoHorasSaldosSemanais: (params = {}) => API.get('/banco-horas-semanal/saldos', params),
    gerarBancoHorasSemana: (data) => API.post('/banco-horas-semanal/gerar-semana', data),
    confirmarBancoHorasSemana: (data) => API.put('/banco-horas-semanal/confirmar-semana', data),
    excluirBancoHorasSemana: (semana) => API.delete(`/banco-horas-semanal/semana/${semana}`),
    getBancoHorasExtras: (params = {}) => API.get('/banco-horas-semanal/horas-extras', params),

    getConfiguracaoBanco: () => API.get('/configuracao-banco'),
    salvarConfiguracaoBanco: (data) => API.post('/configuracao-banco/salvar', data),
    testarConfiguracaoBanco: (data) => API.post('/configuracao-banco/testar', data),
    verificarTabelasBanco: () => API.post('/configuracao-banco/verificar-tabelas', {}),
    carregarExemplosBanco: () => API.post('/configuracao-banco/carregar-exemplos', {}),
    getConfiguracaoBackup: () => API.get('/configuracao-banco/backup'),
    selecionarDiretorioBackup: (data = {}) => API.post('/configuracao-banco/backup/selecionar-pasta', data),
    salvarConfiguracaoBackup: (data) => API.post('/configuracao-banco/backup/salvar', data),
    gerarBackupSistema: (data) => API.post('/configuracao-banco/backup/gerar', data),
    restaurarBackupSistema: (data) => API.post('/configuracao-banco/backup/restaurar', data)
};

window.API = API;

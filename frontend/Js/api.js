const API = {
    get baseURL() {
        if (window.__API_BASE_URL) {
            return window.__API_BASE_URL;
        }

        const origin = window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : 'http://localhost:3000';

        return `${origin.replace(/\/$/, '')}/api`;
    },

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

    getColaboradores: (params = {}) => API.get('/colaboradores', params),
    salvarColaborador: (data) => data.id
        ? API.put(`/colaboradores/${data.id}`, data)
        : API.post('/colaboradores', data),
    excluirColaborador: (id) => API.delete(`/colaboradores/${id}`),

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
    excluirPlantao: (dataISO) => API.delete(`/plantoes/${dataISO}`),
    getPlantaoDisponibilidade: (dataISO, params = {}) => API.get(`/plantoes/disponibilidade/${dataISO}`, params),

    getEscalaDia: (dataISO) => API.get(`/escala/dia/${dataISO}`),
    getEscalaRelatorio: (params = {}) => API.get('/escala/relatorio', params),
    salvarEscalaDia: (dataISO, colaboradorId, data) => API.put(`/escala/dia/${dataISO}/colaborador/${colaboradorId}`, data),
    aplicarAlmocoPeriodo: (data) => API.put('/escala/almoco-periodo', data),
    sincronizarEscala: (data) => API.post('/escala/rebuild', data),

    getBancoHorasStatus: () => API.get('/banco-horas/status'),
    getBancoHorasResumo: (params = {}) => API.get('/banco-horas/resumo', params),
    getBancoHorasExtrato: (colaboradorId, params = {}) => API.get(`/banco-horas/colaborador/${colaboradorId}`, params),
    atualizarBancoHorasSaldo: (colaboradorId, data) => API.put(`/banco-horas/colaborador/${colaboradorId}/saldo`, data),
    recalcularBancoHoras: () => API.post('/banco-horas/recalcular', {}),

    getConfiguracaoBanco: () => API.get('/configuracao-banco'),
    salvarConfiguracaoBanco: (data) => API.post('/configuracao-banco/salvar', data),
    testarConfiguracaoBanco: (data) => API.post('/configuracao-banco/testar', data),
    verificarTabelasBanco: () => API.post('/configuracao-banco/verificar-tabelas', {}),
    getConfiguracaoBackup: () => API.get('/configuracao-banco/backup'),
    selecionarDiretorioBackup: (data = {}) => API.post('/configuracao-banco/backup/selecionar-pasta', data),
    salvarConfiguracaoBackup: (data) => API.post('/configuracao-banco/backup/salvar', data),
    gerarBackupSistema: (data) => API.post('/configuracao-banco/backup/gerar', data),
    restaurarBackupSistema: (data) => API.post('/configuracao-banco/backup/restaurar', data)
};

window.API = API;

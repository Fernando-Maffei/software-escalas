(function initRuntimeNormalizationHelpers(root) {
    if (root.__runtimeNormalizationHelpersLoaded) {
        return;
    }

    root.__runtimeNormalizationHelpersLoaded = true;

    root.normalizeRuntimeToken = function normalizeRuntimeToken(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s-]+/g, '_')
            .replace(/_+/g, '_');
    };

    root.normalizeRuntimeAusenciaTipo = function normalizeRuntimeAusenciaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        return 'ausencia';
    };

    root.normalizeRuntimePeriodoTipo = function normalizeRuntimePeriodoTipo(value) {
        const token = root.normalizeRuntimeToken(value);
        return token === 'horas' ? 'horas' : 'dia_inteiro';
    };

    root.normalizeRuntimeEscalaTipo = function normalizeRuntimeEscalaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        if (token.startsWith('plantao')) {
            return 'plantao';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        if (token.startsWith('ajuste')) {
            return 'ajuste';
        }

        return 'normal';
    };
}(window));

(function () {
    if (window.__runtimeFixesLoaded) {
        return;
    }

    window.__runtimeFixesLoaded = true;

    const inflight = new Map();

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function limparExclusaoPendente() {
        window.exclusaoPendenteId = null;
        window.exclusaoTipo = 'ausencia';

        try {
            exclusaoPendenteId = null;
            exclusaoTipo = 'ausencia';
        } catch (error) {
            // ignore
        }
    }

    function obterDataISO(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            return valor.includes('T') ? valor.split('T')[0] : valor;
        }

        const data = new Date(valor);
        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function mapAusencia(item) {
        const tipo = window.normalizeRuntimeAusenciaTipo(item.Tipo || item.tipo);
        const periodoTipo = window.normalizeRuntimePeriodoTipo(item.PeriodoTipo || item.periodoTipo || 'dia_inteiro');

        return {
            Id: item.Id,
            ColaboradorId: item.ColaboradorId,
            Tipo: tipo,
            DataInicio: item.DataInicio,
            DataFim: item.DataFim,
            DataCadastro: item.DataCadastro,
            PeriodoTipo: periodoTipo,
            HoraInicio: item.HoraInicio,
            HoraFim: item.HoraFim,
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo,
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim,
            observacao: item.Observacao || item.observacao || null,
            Observacao: item.Observacao || item.observacao || null
        };
    }

    function mapPlantao(item) {
        const dataISO = obterDataISO(item.dataISO || item.data_plantao);

        return {
            ...item,
            dataISO,
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
            horaInicio: item.horaInicio || item.hora_inicio || null,
            horaFim: item.horaFim || item.hora_fim || null,
            observacao: item.observacao || null
        };
    }

    if (typeof carregarColaboradores === 'function') {
        const originalCarregarColaboradores = carregarColaboradores;

        window.carregarColaboradores = carregarColaboradores = function carregarColaboradoresComCache() {
            return withInFlight('colaboradores', async () => {
                const data = await originalCarregarColaboradores();
                const lista = Array.isArray(data) ? data : [];

                try {
                    colaboradores = lista;
                } catch (error) {
                    // ignore
                }

                window.colaboradores = lista;
                return lista;
            });
        };
    }

    window.carregarSetores = carregarSetores = function carregarSetoresComCache() {
        return withInFlight('setores', async () => {
            let lista = [];

            try {
                const data = await window.API.getSetores();
                lista = Array.isArray(data) ? data : [];
            } catch (error) {
                lista = [];
            }

            try {
                setores = lista;
            } catch (error) {
                // ignore
            }

            window.setores = lista;
            return lista;
        });
    };

    window.carregarAusencias = carregarAusencias = function carregarAusenciasComCache() {
        return withInFlight('ausencias', async () => {
            let lista = [];

            try {
                const data = await window.API.getAusencias();
                lista = Array.isArray(data) ? data.map(mapAusencia) : [];
            } catch (error) {
                lista = [];
            }

            try {
                ausencias = lista;
            } catch (error) {
                // ignore
            }

            window.ausencias = lista;
            return lista;
        });
    };

    window.carregarFeriadosLocais = carregarFeriadosLocais = function carregarFeriadosLocaisComCache() {
        return withInFlight('feriadosLocais', async () => {
            let lista = [];

            try {
                const data = await window.API.getFeriados();
                lista = Array.isArray(data) ? data : [];
                localStorage.setItem('feriadosLocais', JSON.stringify(lista));
            } catch (error) {
                try {
                    lista = JSON.parse(localStorage.getItem('feriadosLocais') || '[]');
                } catch (storageError) {
                    lista = [];
                }
            }

            try {
                feriadosLocais = lista;
            } catch (error) {
                // ignore
            }

            window.feriadosLocais = lista;
            return lista;
        });
    };

    window.carregarPlantoes = carregarPlantoes = function carregarPlantoesComCache() {
        return withInFlight('plantoes', async () => {
            let lista = [];

            try {
                const data = await window.API.getPlantoes();
                lista = Array.isArray(data) ? data.map(mapPlantao) : [];
            } catch (error) {
                lista = [];
            }

            try {
                plantoesLancados = lista;
            } catch (error) {
                // ignore
            }

            window.plantoesLancados = lista;
            return lista;
        });
    };

    window.confirmarExclusao = confirmarExclusao = async function confirmarExclusaoPadronizada() {
        const id = window.exclusaoPendenteId;
        const tipo = window.exclusaoTipo || 'ausencia';

        if (!id) {
            fecharModalSeguro('modalConfirmacao');
            return;
        }

        try {
            if (tipo === 'feriado') {
                await window.API.excluirFeriado(id);
            } else {
                await window.API.excluirAusencia(id);
            }

            if (typeof cancelarEdicaoLancamento === 'function') {
                cancelarEdicaoLancamento();
            }

            await atualizarTudo({ silent: true });

            if (typeof mostrarToast === 'function') {
                mostrarToast('Excluído com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao excluir: ${error.message}`, 'error');
            }
        } finally {
            limparExclusaoPendente();
            fecharModalSeguro('modalConfirmacao');
        }
    };

    window.configurarModais = configurarModais = function configurarModaisUmaVez() {
        if (window.__modaisConfigurados) {
            return;
        }

        window.__modaisConfigurados = true;

        document.addEventListener('click', (event) => {
            const target = event.target;

            if (target.closest('#btnLancamentoAjuste')) {
                event.preventDefault();
                if (typeof window.abrirModalLancamento === 'function') {
                    window.abrirModalLancamento('pessoal', null, false);
                }
                return;
            }

            if (target.closest('#fecharModalLancamentoBtn')) {
                fecharModalSeguro('modalLancamento');
                return;
            }

            if (target.closest('#fecharModalConfirmacaoBtn') || target.closest('#cancelarExclusaoBtn')) {
                limparExclusaoPendente();
                fecharModalSeguro('modalConfirmacao');
                return;
            }

            if (target.closest('#confirmarExclusaoBtn')) {
                event.preventDefault();
                confirmarExclusao();
                return;
            }

            if (target.closest('#fecharModalHorarioBtn') || target.closest('#fecharModalHorarioBtn2')) {
                fecharModalSeguro('modalHorario');
            }
        });

        window.addEventListener('click', (event) => {
            if (!event.target.classList?.contains('modal')) {
                return;
            }

            if (event.target.id === 'modalConfirmacao') {
                limparExclusaoPendente();
            }

            event.target.classList.add('hidden');
            event.target.classList.remove('active');
        });
    };

    window.configurarObservers = configurarObservers = function configurarObserversEstavel() {
        if (window.__observersConfigurados) {
            return;
        }

        window.__observersConfigurados = true;
    };

    window.atualizarTudo = atualizarTudo = async function atualizarTudoPadronizado(options = {}) {
        const { silent = false } = options;

        try {
            await Promise.allSettled([
                carregarColaboradores(),
                typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
                carregarAusencias(),
                carregarFeriadosLocais(),
                typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
            ]);

            const modalLancamento = document.getElementById('modalLancamento');
            if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
                if (window.modalDataSelecionada && typeof carregarListagensComFiltro === 'function') {
                    await carregarListagensComFiltro(window.modalDataSelecionada, window.modalFiltroData !== false);
                } else if (typeof carregarListagens === 'function') {
                    await carregarListagens();
                }
            }

            if (typeof window.__refreshVisibleViews === 'function') {
                await window.__refreshVisibleViews(options);
            }

            if (!silent && typeof mostrarToast === 'function') {
                mostrarToast('Dados atualizados!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao atualizar dados: ${error.message}`, 'error');
            }
        }
    };
})();

(function () {
    if (window.__configuracaoBancoRuntimeLoaded) {
        return;
    }

    window.__configuracaoBancoRuntimeLoaded = true;

    let configuracaoBancoAtual = {
        hasPasswordSaved: false,
        windowsAuthenticationAvailable: false,
        source: 'defaults',
        requiredTables: []
    };
    let configuracaoBackupAtual = {
        directory: '',
        hasConfiguredDirectory: false,
        lastBackupAt: null,
        lastBackupFile: '',
        lastBackupPath: '',
        lastBackupTotalRows: 0,
        lastBackupTableCounts: {},
        source: 'defaults'
    };

    function obterTipoAutenticacaoBanco() {
        return document.querySelector('input[name="dbAuthenticationType"]:checked')?.value || 'sql';
    }

    function obterDescricaoOrigemConfiguracao(source) {
        if (source === 'file') {
            return 'Origem atual: arquivo local salvo no backend.';
        }

        if (source === 'env') {
            return 'Origem atual: variaveis de ambiente do servidor.';
        }

        return 'Nenhuma configuracao salva foi detectada ainda.';
    }

    function definirStatusConfiguracaoBanco(variant, message, detail = '') {
        const card = document.getElementById('configuracaoBancoStatus');
        const badge = document.getElementById('configuracaoBancoStatusBadge');
        const text = document.getElementById('configuracaoBancoStatusTexto');
        const detailNode = document.getElementById('configuracaoBancoStatusDetalhe');

        if (!card || !badge || !text || !detailNode) {
            return;
        }

        card.classList.remove('is-neutral', 'is-loading', 'is-success', 'is-error');
        card.classList.add(`is-${variant}`);

        const badgeLabels = {
            neutral: 'Nao testado',
            loading: 'Processando',
            success: 'Conectado',
            error: 'Erro'
        };

        badge.textContent = badgeLabels[variant] || 'Status';
        text.textContent = message;
        detailNode.textContent = detail || '';
    }

    function atualizarCamposAutenticacaoBanco() {
        const authType = obterTipoAutenticacaoBanco();
        const userInput = document.getElementById('dbUser');
        const passwordInput = document.getElementById('dbPassword');
        const windowsOption = document.getElementById('dbAuthWindows');
        const authHint = document.getElementById('dbAuthHint');
        const passwordHint = document.getElementById('dbPasswordHint');
        const sqlMode = authType === 'sql';

        if (windowsOption) {
            windowsOption.disabled = !configuracaoBancoAtual.windowsAuthenticationAvailable;

            if (!configuracaoBancoAtual.windowsAuthenticationAvailable && windowsOption.checked) {
                document.querySelector('input[name="dbAuthenticationType"][value="sql"]')?.click();
            }
        }

        if (userInput) {
            userInput.disabled = !sqlMode;
        }

        if (passwordInput) {
            passwordInput.disabled = !sqlMode;
        }

        if (authHint) {
            authHint.textContent = configuracaoBancoAtual.windowsAuthenticationAvailable
                ? 'Escolha o modo de autenticacao compatível com o seu SQL Server.'
                : 'Windows Authentication ainda nao esta disponivel nesta instalacao. Use SQL Server Authentication.';
        }

        if (passwordHint) {
            passwordHint.textContent = configuracaoBancoAtual.hasPasswordSaved && sqlMode
                ? 'Existe uma senha salva no backend. Se deixar em branco, ela sera mantida.'
                : 'A senha salva nunca e exibida no frontend.';
        }
    }

    function preencherFormularioConfiguracaoBanco(data) {
        document.getElementById('dbHost').value = data.host || '';
        document.getElementById('dbPort').value = data.port || '';
        document.getElementById('dbInstance').value = data.instanceName || '';
        document.getElementById('dbDatabase').value = data.database || '';
        document.getElementById('dbUser').value = data.user || '';
        document.getElementById('dbPassword').value = '';
        document.getElementById('dbPassword').placeholder = data.hasPasswordSaved
            ? 'Senha salva no backend'
            : 'Senha do SQL Server';
        document.getElementById('dbEncrypt').checked = data.encrypt !== false;
        document.getElementById('dbTrustCertificate').checked = data.trustServerCertificate !== false;

        const authType = data.authenticationType || 'sql';
        document.querySelector(`input[name="dbAuthenticationType"][value="${authType}"]`)?.click();
    }

    function construirPayloadConfiguracaoBanco() {
        const passwordInput = document.getElementById('dbPassword');

        return {
            host: document.getElementById('dbHost')?.value || '',
            port: document.getElementById('dbPort')?.value || '',
            instanceName: document.getElementById('dbInstance')?.value || '',
            database: document.getElementById('dbDatabase')?.value || '',
            user: document.getElementById('dbUser')?.value || '',
            password: passwordInput?.value || '',
            authenticationType: obterTipoAutenticacaoBanco(),
            encrypt: document.getElementById('dbEncrypt')?.checked ?? true,
            trustServerCertificate: document.getElementById('dbTrustCertificate')?.checked ?? true,
            preservePassword: Boolean(configuracaoBancoAtual.hasPasswordSaved && !(passwordInput?.value || ''))
        };
    }

    async function testarConfiguracaoBanco(exibirToast = true) {
        definirStatusConfiguracaoBanco('loading', 'Testando conexao com o SQL Server...', 'Validando acesso ao servidor e ao banco selecionado.');

        const response = await window.API.testarConfiguracaoBanco(construirPayloadConfiguracaoBanco());
        const detail = [
            response.connection?.serverName ? `Servidor: ${response.connection.serverName}` : '',
            response.connection?.databaseName ? `Banco: ${response.connection.databaseName}` : ''
        ].filter(Boolean).join(' | ');

        definirStatusConfiguracaoBanco('success', response.message || 'Conexao realizada com sucesso.', detail);

        if (exibirToast && typeof mostrarToast === 'function') {
            mostrarToast(response.message || 'Conexao realizada com sucesso.', 'success');
        }

        return response;
    }

    async function salvarConfiguracaoBanco() {
        definirStatusConfiguracaoBanco('loading', 'Salvando configuracao do banco...', 'A conexao sera validada antes de persistir os dados no backend.');

        const response = await window.API.salvarConfiguracaoBanco(construirPayloadConfiguracaoBanco());
        configuracaoBancoAtual = {
            ...configuracaoBancoAtual,
            ...(response.configuracao || {})
        };

        document.getElementById('dbPassword').value = '';
        document.getElementById('dbPassword').placeholder = configuracaoBancoAtual.hasPasswordSaved
            ? 'Senha salva no backend'
            : 'Senha do SQL Server';
        atualizarCamposAutenticacaoBanco();

        definirStatusConfiguracaoBanco(
            'success',
            response.message || 'Configuracao salva com sucesso.',
            obterDescricaoOrigemConfiguracao(configuracaoBancoAtual.source)
        );

        if (typeof mostrarToast === 'function') {
            mostrarToast(response.message || 'Configuracao salva com sucesso.', 'success');
        }
    }

    async function verificarTabelasBanco() {
        definirStatusConfiguracaoBanco('loading', 'Verificando tabelas da aplicacao...', 'Criando apenas as estruturas ausentes, sem apagar dados existentes.');

        const response = await window.API.verificarTabelasBanco();
        const createdText = response.createdTables?.length
            ? `Tabelas criadas: ${response.createdTables.join(', ')}`
            : `Todas as ${response.requiredTables?.length || 0} tabelas obrigatorias ja existiam.`;

        definirStatusConfiguracaoBanco('success', response.message || 'Estrutura verificada com sucesso.', createdText);

        if (typeof mostrarToast === 'function') {
            mostrarToast(response.message || 'Estrutura verificada com sucesso.', 'success');
        }
    }

    async function carregarConfiguracaoBancoTela() {
        definirStatusConfiguracaoBanco('loading', 'Carregando configuracao do banco...', 'Buscando a configuracao atual salva no backend.');

        try {
            const response = await window.API.getConfiguracaoBanco();
            configuracaoBancoAtual = response || configuracaoBancoAtual;
            preencherFormularioConfiguracaoBanco(response || {});
            atualizarCamposAutenticacaoBanco();

            if (response?.hasConfiguredConnection) {
                definirStatusConfiguracaoBanco('neutral', 'Configuracao carregada. Execute um teste para validar a conexao atual.', obterDescricaoOrigemConfiguracao(response.source));
                await testarConfiguracaoBanco(false);
            } else {
                definirStatusConfiguracaoBanco('neutral', 'Preencha os dados do SQL Server para testar e salvar a conexao.', obterDescricaoOrigemConfiguracao(response?.source));
            }
        } catch (error) {
            definirStatusConfiguracaoBanco('error', error.message || 'Nao foi possivel carregar a configuracao do banco.', 'Revise o backend antes de continuar.');

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao carregar configuracao do banco: ${error.message}`, 'error');
            }
        }
    }

    function formatarDataHoraBackup(valor) {
        if (!valor) {
            return '';
        }

        const date = new Date(valor);

        if (Number.isNaN(date.getTime())) {
            return String(valor);
        }

        return date.toLocaleString('pt-BR');
    }

    function montarDetalheConfiguracaoBackup(data) {
        const parts = [];

        if (data.directory) {
            parts.push(`Pasta: ${data.directory}`);
        }

        if (data.lastBackupFile) {
            parts.push(`Arquivo: ${data.lastBackupFile}`);
        }

        if (data.lastBackupAt) {
            parts.push(`Ultimo backup: ${formatarDataHoraBackup(data.lastBackupAt)}`);
        }

        if (data.lastBackupTrigger) {
            const triggerLabels = {
                manual: 'manual',
                'auto-schedule': 'automatico agendado',
                'auto-shutdown': 'automatico ao encerrar'
            };
            parts.push(`Origem do ultimo backup: ${triggerLabels[data.lastBackupTrigger] || data.lastBackupTrigger}`);
        }

        if (Number(data.lastBackupTotalRows) > 0) {
            parts.push(`Registros exportados: ${data.lastBackupTotalRows}`);
        }

        if (data.autoBackupEnabled) {
            parts.push(`Agendamento: a cada ${Number(data.autoBackupIntervalMinutes) || 180} minuto(s)`);
        }

        if (data.autoBackupOnShutdown) {
            parts.push('Backup ao encerrar: ativo');
        }

        if (data.lastRestoreAt) {
            parts.push(`Ultima importacao: ${formatarDataHoraBackup(data.lastRestoreAt)}`);
        }

        return parts.join(' | ');
    }

    function definirStatusConfiguracaoBackup(variant, message, detail = '') {
        const card = document.getElementById('configuracaoBackupStatus');
        const badge = document.getElementById('configuracaoBackupStatusBadge');
        const text = document.getElementById('configuracaoBackupStatusTexto');
        const detailNode = document.getElementById('configuracaoBackupStatusDetalhe');

        if (!card || !badge || !text || !detailNode) {
            return;
        }

        card.classList.remove('is-neutral', 'is-loading', 'is-success', 'is-error');
        card.classList.add(`is-${variant}`);

        const badgeLabels = {
            neutral: 'Nao configurado',
            loading: 'Processando',
            success: 'Backup pronto',
            error: 'Erro'
        };

        badge.textContent = badgeLabels[variant] || 'Status';
        text.textContent = message;
        detailNode.textContent = detail || '';
    }

    function preencherFormularioConfiguracaoBackup(data) {
        const directoryInput = document.getElementById('backupDirectory');
        const autoBackupEnabledInput = document.getElementById('autoBackupEnabled');
        const autoBackupIntervalInput = document.getElementById('autoBackupIntervalMinutes');
        const autoBackupOnShutdownInput = document.getElementById('autoBackupOnShutdown');

        if (directoryInput) {
            directoryInput.value = data.directory || '';
        }

        if (autoBackupEnabledInput) {
            autoBackupEnabledInput.checked = Boolean(data.autoBackupEnabled);
        }

        if (autoBackupIntervalInput) {
            autoBackupIntervalInput.value = Number(data.autoBackupIntervalMinutes) > 0
                ? String(data.autoBackupIntervalMinutes)
                : '180';
        }

        if (autoBackupOnShutdownInput) {
            autoBackupOnShutdownInput.checked = Boolean(data.autoBackupOnShutdown);
        }
    }

    function atualizarConfiguracaoBackupAtual(data) {
        configuracaoBackupAtual = {
            ...configuracaoBackupAtual,
            ...(data || {}),
            lastBackupTableCounts: data?.lastBackupTableCounts || configuracaoBackupAtual.lastBackupTableCounts || {}
        };
    }

    function restaurarStatusConfiguracaoBackupAtual() {
        if (configuracaoBackupAtual?.hasConfiguredDirectory) {
            definirStatusConfiguracaoBackup(
                'success',
                configuracaoBackupAtual.lastBackupAt
                    ? 'Pasta de backup carregada. O ultimo backup gerado esta registrado abaixo.'
                    : 'Pasta de backup carregada. Gere o primeiro arquivo quando quiser.',
                montarDetalheConfiguracaoBackup(configuracaoBackupAtual)
            );
            return;
        }

        definirStatusConfiguracaoBackup('neutral', 'Informe uma pasta para armazenar os backups locais.', '');
    }

    function construirPayloadConfiguracaoBackup() {
        return {
            directory: document.getElementById('backupDirectory')?.value || '',
            autoBackupEnabled: Boolean(document.getElementById('autoBackupEnabled')?.checked),
            autoBackupIntervalMinutes: document.getElementById('autoBackupIntervalMinutes')?.value || '180',
            autoBackupOnShutdown: Boolean(document.getElementById('autoBackupOnShutdown')?.checked)
        };
    }

    async function selecionarDiretorioBackup() {
        definirStatusConfiguracaoBackup('loading', 'Abrindo seletor de pasta...', 'Escolha no Windows a pasta onde os backups devem ser salvos.');

        const response = await window.API.selecionarDiretorioBackup(construirPayloadConfiguracaoBackup());

        if (response?.canceled) {
            restaurarStatusConfiguracaoBackupAtual();
            return response;
        }

        preencherFormularioConfiguracaoBackup({
            directory: response?.directory || ''
        });

        definirStatusConfiguracaoBackup(
            'success',
            'Pasta selecionada. Clique em "Salvar Configuracao de Backup" para aplicar.',
            response?.directory ? `Pasta escolhida: ${response.directory}` : ''
        );

        if (typeof mostrarToast === 'function') {
            mostrarToast('Pasta selecionada. Salve para aplicar a configuracao.', 'success');
        }

        return response;
    }

    async function carregarConfiguracaoBackupTela() {
        definirStatusConfiguracaoBackup('loading', 'Carregando configuracao de backup...', 'Buscando a pasta e o historico salvos no backend.');

        try {
            const response = await window.API.getConfiguracaoBackup();
            atualizarConfiguracaoBackupAtual(response);
            preencherFormularioConfiguracaoBackup(response || {});

            restaurarStatusConfiguracaoBackupAtual();
        } catch (error) {
            definirStatusConfiguracaoBackup('error', error.message || 'Nao foi possivel carregar a configuracao de backup.', '');

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao carregar configuracao de backup: ${error.message}`, 'error');
            }
        }
    }

    async function salvarConfiguracaoBackup() {
        definirStatusConfiguracaoBackup('loading', 'Salvando configuracao de backup...', 'Validando o caminho informado, as opcoes automaticas e a permissao de escrita.');

        const response = await window.API.salvarConfiguracaoBackup(construirPayloadConfiguracaoBackup());
        atualizarConfiguracaoBackupAtual(response.backup || {});
        preencherFormularioConfiguracaoBackup(response.backup || {});
        definirStatusConfiguracaoBackup('success', response.message || 'Configuracao de backup salva com sucesso.', montarDetalheConfiguracaoBackup(configuracaoBackupAtual));

        if (typeof mostrarToast === 'function') {
            mostrarToast(response.message || 'Configuracao de backup salva com sucesso.', 'success');
        }

        return response;
    }

    async function gerarBackupSistema() {
        definirStatusConfiguracaoBackup('loading', 'Gerando backup do banco...', 'Lendo as tabelas do sistema e gravando o arquivo JSON na pasta configurada.');

        const response = await window.API.gerarBackupSistema(construirPayloadConfiguracaoBackup());
        atualizarConfiguracaoBackupAtual(response.backup || {});
        preencherFormularioConfiguracaoBackup(response.backup || {});
        definirStatusConfiguracaoBackup('success', response.message || 'Backup gerado com sucesso.', montarDetalheConfiguracaoBackup(configuracaoBackupAtual));

        if (typeof mostrarToast === 'function') {
            const fileName = response.result?.fileName ? ` (${response.result.fileName})` : '';
            mostrarToast(`${response.message || 'Backup gerado com sucesso.'}${fileName}`, 'success');
        }

        return response;
    }

    window.inicializarConfiguracaoBancoTela = function inicializarConfiguracaoBancoTela() {
        const form = document.getElementById('configuracaoBancoForm');

        if (!form || form.dataset.bound === 'true') {
            return;
        }

        form.dataset.bound = 'true';

        document.getElementById('testarConfiguracaoBancoBtn')?.addEventListener('click', async () => {
            try {
                await testarConfiguracaoBanco(true);
            } catch (error) {
                definirStatusConfiguracaoBanco('error', error.message || 'Erro ao testar a conexao.', 'Revise host, banco, usuario, senha e permissões.');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao testar conexao: ${error.message}`, 'error');
                }
            }
        });

        document.getElementById('salvarConfiguracaoBancoBtn')?.addEventListener('click', async () => {
            try {
                await salvarConfiguracaoBanco();
            } catch (error) {
                definirStatusConfiguracaoBanco('error', error.message || 'Erro ao salvar a configuracao.', 'Nenhuma credencial sensivel foi exibida no frontend.');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao salvar configuracao: ${error.message}`, 'error');
                }
            }
        });

        document.getElementById('verificarTabelasBancoBtn')?.addEventListener('click', async () => {
            try {
                await verificarTabelasBanco();
            } catch (error) {
                definirStatusConfiguracaoBanco('error', error.message || 'Erro ao verificar as tabelas.', 'Verifique a permissao do usuario para criar estruturas no banco.');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao verificar tabelas: ${error.message}`, 'error');
                }
            }
        });

        document.querySelectorAll('input[name="dbAuthenticationType"]').forEach((input) => {
            input.addEventListener('change', atualizarCamposAutenticacaoBanco);
        });

        atualizarCamposAutenticacaoBanco();
        carregarConfiguracaoBancoTela();
    };

    window.inicializarBackupSistemaTela = function inicializarBackupSistemaTela() {
        const form = document.getElementById('configuracaoBackupForm');

        if (!form || form.dataset.bound === 'true') {
            return;
        }

        form.dataset.bound = 'true';

        const abrirSeletorPasta = async () => {
            try {
                await selecionarDiretorioBackup();
            } catch (error) {
                definirStatusConfiguracaoBackup('error', error.message || 'Erro ao abrir o seletor de pasta.', '');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao selecionar pasta de backup: ${error.message}`, 'error');
                }
            }
        };

        const directoryInput = document.getElementById('backupDirectory');

        if (directoryInput) {
            directoryInput.addEventListener('click', async () => {
                await abrirSeletorPasta();
            });

            directoryInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                await abrirSeletorPasta();
            });
        }

        document.getElementById('selecionarDiretorioBackupBtn')?.addEventListener('click', async () => {
            await abrirSeletorPasta();
        });

        document.getElementById('salvarConfiguracaoBackupBtn')?.addEventListener('click', async () => {
            try {
                await salvarConfiguracaoBackup();
            } catch (error) {
                definirStatusConfiguracaoBackup('error', error.message || 'Erro ao salvar a pasta de backup.', '');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao salvar pasta de backup: ${error.message}`, 'error');
                }
            }
        });

        document.getElementById('gerarBackupSistemaBtn')?.addEventListener('click', async () => {
            try {
                await gerarBackupSistema();
            } catch (error) {
                definirStatusConfiguracaoBackup('error', error.message || 'Erro ao gerar o backup do banco.', '');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao gerar backup: ${error.message}`, 'error');
                }
            }
        });

        carregarConfiguracaoBackupTela();
    };
})();

(function () {
    if (window.__relatorioMensalFixLoaded) {
        return;
    }

    window.__relatorioMensalFixLoaded = true;

    const MESES_PT_BR = [
        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    function escapeHtmlRelatorio(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function obterDataIsoRelatorio(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            return valor.includes('T') ? valor.split('T')[0] : valor;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const ano = data.getUTCFullYear();
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(data.getUTCDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function criarDataUtcSegura(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);
        return new Date(Date.UTC(ano, (mes || 1) - 1, dia || 1, 12, 0, 0));
    }

    function formatarDataRelatorio(dataISO) {
        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function montarPeriodoRelatorio(dataInicioISO, dataFimISO) {
        if (!dataInicioISO && !dataFimISO) {
            return '--';
        }

        if (!dataFimISO || dataInicioISO === dataFimISO) {
            return formatarDataRelatorio(dataInicioISO || dataFimISO);
        }

        return `de ${formatarDataRelatorio(dataInicioISO)} ate ${formatarDataRelatorio(dataFimISO)}`;
    }

    function criarMapaEventosPorData(mes, ano) {
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const eventosPorData = {};

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            eventosPorData[dataISO] = {
                feriado: null,
                colaboradores: []
            };
        }

        return eventosPorData;
    }

    function iterateDateRange(startISO, endISO, callback) {
        const current = criarDataUtcSegura(startISO);
        const end = criarDataUtcSegura(endISO);

        while (current <= end) {
            const ano = current.getUTCFullYear();
            const mes = String(current.getUTCMonth() + 1).padStart(2, '0');
            const dia = String(current.getUTCDate()).padStart(2, '0');
            callback(`${ano}-${mes}-${dia}`);
            current.setUTCDate(current.getUTCDate() + 1);
        }
    }

    function ordenarPorDataCampo(items, campo) {
        return [...items].sort((first, second) => {
            const valorA = first[campo] || '';
            const valorB = second[campo] || '';
            return valorA.localeCompare(valorB);
        });
    }

    async function construirDadosRelatorioMensal(mes, ano) {
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const primeiroDia = new Date(ano, mes, 1).getDay();
        const eventosPorData = criarMapaEventosPorData(mes, ano);
        const ferias = [];
        const folgas = [];
        const ausenciasLista = [];
        const feriadosLista = [];
        const primeiroDiaMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
        const ultimoDiaMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diasNoMes).padStart(2, '0')}`;

        function adicionarFeriado(item) {
            const dataISO = obterDataIsoRelatorio(item.data || item.Data || item.date);

            if (!dataISO || !eventosPorData[dataISO]) {
                return;
            }

            if (!eventosPorData[dataISO].feriado) {
                eventosPorData[dataISO].feriado = item.nome || item.Nome || item.name || 'Feriado';
            }

            feriadosLista.push({
                nome: item.nome || item.Nome || item.name || 'Feriado',
                data: dataISO,
                dataFormatada: formatarDataRelatorio(dataISO),
                tipo: item.tipo || item.Tipo || 'federal'
            });
        }

        try {
            if ((!window.feriadosAPI || !Array.isArray(window.feriadosAPI) || window.feriadosAPI.length === 0) && typeof carregarFeriadosAPI === 'function') {
                await carregarFeriadosAPI(ano);
            }
        } catch (error) {
            // ignore
        }

        (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.date);

            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                adicionarFeriado({
                    nome: item.name,
                    data: dataISO,
                    tipo: 'federal'
                });
            }
        });

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.Data || item.data);

            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                adicionarFeriado({
                    nome: item.Nome || item.nome,
                    data: dataISO,
                    tipo: item.Tipo || item.tipo || 'municipal'
                });
            }
        });

        (Array.isArray(window.ausencias) ? window.ausencias : []).forEach((item) => {
            const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
            const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);

            if (!dataInicioISO || !dataFimISO) {
                return;
            }

            if (dataFimISO < primeiroDiaMesISO || dataInicioISO > ultimoDiaMesISO) {
                return;
            }

            const colaboradorId = Number(item.ColaboradorId || item.colaboradorId);
            const colaborador = (window.colaboradores || []).find((entry) => Number(entry.Id) === colaboradorId);

            if (!colaborador) {
                return;
            }

            const tipo = String(item.Tipo || item.tipo || '').toLowerCase();
            const nomeColaborador = colaborador.Nome || 'Desconhecido';
            const inicioNoMes = dataInicioISO < primeiroDiaMesISO ? primeiroDiaMesISO : dataInicioISO;
            const fimNoMes = dataFimISO > ultimoDiaMesISO ? ultimoDiaMesISO : dataFimISO;

            iterateDateRange(inicioNoMes, fimNoMes, (dataISO) => {
                if (!eventosPorData[dataISO]) {
                    return;
                }

                eventosPorData[dataISO].colaboradores.push({
                    nome: nomeColaborador,
                    tipo
                });
            });

            if (tipo === 'ferias') {
                ferias.push({
                    colaborador: nomeColaborador,
                    dataInicio: dataInicioISO,
                    dataFim: dataFimISO,
                    inicioNoMes,
                    fimNoMes,
                    periodoTexto: montarPeriodoRelatorio(dataInicioISO, dataFimISO),
                    periodoNoMesTexto: montarPeriodoRelatorio(inicioNoMes, fimNoMes)
                });
                return;
            }

            iterateDateRange(inicioNoMes, fimNoMes, (dataISO) => {
                const eventoInfo = {
                    colaborador: nomeColaborador,
                    data: dataISO,
                    dataFormatada: formatarDataRelatorio(dataISO),
                    tipo
                };

                if (tipo === 'folga') {
                    folgas.push(eventoInfo);
                } else if (tipo === 'ausencia') {
                    ausenciasLista.push(eventoInfo);
                }
            });
        });

        return {
            mesNome: MESES_PT_BR[mes],
            ano,
            primeiroDia,
            diasNoMes,
            eventosPorData,
            ferias: ordenarPorDataCampo(ferias, 'dataInicio'),
            folgas: ordenarPorDataCampo(folgas, 'data'),
            ausencias: ordenarPorDataCampo(ausenciasLista, 'data'),
            feriados: ordenarPorDataCampo(feriadosLista, 'data'),
            mes
        };
    }

    function renderResumoTabelaRelatorio(config) {
        const { titulo, items, headers, emptyLabel, rowRenderer, limit = 10 } = config;

        return `
            <div class="resumo-coluna">
                <h4>${titulo} (${items.length})</h4>
                <table class="resumo-tabela">
                    <thead>
                        <tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${items.length > 0 ? `
                            ${items.slice(0, limit).map(rowRenderer).join('')}
                            ${items.length > limit ? `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-light);">... e mais ${items.length - limit} registro(s)</td></tr>` : ''}
                        ` : `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-light);">${emptyLabel}</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;
    }

    function gerarHtmlVisualizacaoRelatorioMensal(dados) {
        const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes } = dados;
        const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;

        let html = `
            <div class="relatorio-calendario">
                <div class="calendario-titulo">
                    <h2>${ano}</h2>
                    <h3>${mesNome.toUpperCase()}</h3>
                </div>

                <table class="calendario-tabela">
                    <thead>
                        <tr>
                            ${diasSemana.map((dia) => `<th>${dia}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
        `;

        for (let i = 0; i < primeiroDia; i += 1) {
            html += '<td class="vazio"></td>';
        }

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga').map((item) => item.nome);
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias').map((item) => item.nome);
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia').map((item) => item.nome);

            html += `<td class="${isFeriado ? 'feriado' : ''}">`;
            html += `<div class="dia-numero">${dia}</div>`;

            if (isFeriado) {
                html += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">📅 ${escapeHtmlRelatorio(eventos.feriado)}</div>`;
            }

            if (folgasDia.length > 0) {
                html += '<div class="dia-folgas">';
                folgasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="folga-tag" title="${escapeHtmlRelatorio(nome)}">🌸 ${escapeHtmlRelatorio(nomeCurto)}</span>`;
                });
                if (folgasDia.length > 3) {
                    html += `<span class="mais-tag">+${folgasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            if (feriasDia.length > 0) {
                html += '<div class="dia-ferias">';
                feriasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="ferias-tag" title="${escapeHtmlRelatorio(nome)}">🏖️ ${escapeHtmlRelatorio(nomeCurto)}</span>`;
                });
                if (feriasDia.length > 3) {
                    html += `<span class="mais-tag">+${feriasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            if (ausenciasDia.length > 0) {
                html += '<div class="dia-ausencias">';
                ausenciasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="ausencia-tag" title="${escapeHtmlRelatorio(nome)}">⚠️ ${escapeHtmlRelatorio(nomeCurto)}</span>`;
                });
                if (ausenciasDia.length > 3) {
                    html += `<span class="mais-tag">+${ausenciasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            html += '</td>';

            if ((primeiroDia + dia) % 7 === 0) {
                html += '</tr><tr>';
            }
        }

        const totalCelulas = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
        const celulasRestantes = totalCelulas - (primeiroDia + diasNoMes);

        for (let i = 0; i < celulasRestantes; i += 1) {
            html += '<td class="vazio"></td>';
        }

        html += `
                        </tr>
                    </tbody>
                </table>

                <div class="calendario-resumo">
                    ${renderResumoTabelaRelatorio({
                        titulo: '📅 Feriados',
                        items: feriados,
                        headers: ['Feriado', 'Data', 'Tipo'],
                        emptyLabel: 'Nenhum feriado no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtmlRelatorio(item.nome)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '🏖️ Ferias',
                        items: ferias,
                        headers: ['Colaborador', 'Periodo'],
                        emptyLabel: 'Nenhuma ferias no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '🌸 Folgas',
                        items: folgas,
                        headers: ['Colaborador', 'Data'],
                        emptyLabel: 'Nenhuma folga no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '⚠️ Ausencias',
                        items: ausencias,
                        headers: ['Colaborador', 'Data'],
                        emptyLabel: 'Nenhuma ausencia no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                            </tr>
                        `
                    })}
                </div>

                    <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                    <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
            </div>
        `;

        return html;
    }

    function gerarHtmlPdfRelatorioMensal(dados) {
        const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes, ferias, folgas, ausencias, feriados } = dados;
        const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio ${mesNome} ${ano}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Inter', Arial, sans-serif; margin: 15px; background: white; color: #1e293b; width: 1200px; }
                    h1 { color: #6366f1; text-align: center; font-size: 28px; margin-bottom: 5px; }
                    h2 { color: #1e293b; text-align: center; font-size: 20px; text-transform: uppercase; margin-bottom: 15px; }
                    .calendario-pdf { width: 100%; border-collapse: collapse; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); table-layout: fixed; }
                    .calendario-pdf th { background: #6366f1; color: white; padding: 8px; font-weight: 600; font-size: 12px; border: 1px solid #cbd5e1; text-align: center; width: 14.28%; }
                    .calendario-pdf td { border: 1px solid #cbd5e1; vertical-align: top; height: 70px; padding: 4px; font-size: 10px; background: white; overflow: hidden; }
                    .calendario-pdf td.vazio { background: #f8fafc; }
                    .calendario-pdf td.domingo { background-color: #fef9c3 !important; }
                    .calendario-pdf td.feriado { background: #fee2e2; }
                    .dia-numero { font-weight: bold; font-size: 14px; margin-bottom: 2px; color: #1e293b; }
                    .dia-feriado { font-size: 8px; color: #dc2626; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fee2e2; padding: 1px 3px; border-radius: 3px; }
                    .evento-tag { font-size: 7px; padding: 1px 3px; border-radius: 3px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
                    .folga-tag { background: #d1fae5; color: #059669; border-left: 2px solid #10b981; }
                    .ferias-tag { background: #e0e7ff; color: #4f52e0; border-left: 2px solid #6366f1; }
                    .ausencia-tag { background: #fee2e2; color: #dc2626; border-left: 2px solid #ef4444; }
                    .legendas-pdf { display: flex; gap: 15px; margin: 10px 0; padding: 8px 12px; background: #f8fafc; border-radius: 6px; flex-wrap: wrap; border: 1px solid #e2e8f0; font-size: 10px; }
                    .legenda-item { display: flex; align-items: center; gap: 5px; }
                    .legenda-cor { width: 12px; height: 12px; border-radius: 3px; }
                    .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                    .legenda-ferias { background: #e0e7ff; border: 1px solid #4f52e0; }
                    .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-domingo { background: #fef9c3; border: 1px solid #b45309; }
                    .listas-container { margin-top: 15px; }
                    .listas-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                    .lista-card { background: #f8fafc; border-radius: 6px; padding: 10px; border: 1px solid #e2e8f0; }
                    .lista-card h3 { font-size: 13px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 5px; }
                    .lista-card table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    .lista-card th { text-align: left; padding: 3px; background: #e2e8f0; color: #475569; font-weight: 600; font-size: 8px; }
                    .lista-card td { padding: 2px 3px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    .lista-card tr:last-child td { border-bottom: none; }
                    .empty-message { text-align: center; color: #64748b; font-size: 9px; padding: 10px; font-style: italic; }
                    .resumo-rodape { margin-top: 15px; padding: 10px; background: linear-gradient(135deg, #6366f1 0%, #4f52e0 100%); border-radius: 6px; text-align: center; color: white; }
                    .resumo-rodape strong { font-size: 14px; }
                    .resumo-rodape small { display: block; margin-top: 3px; font-size: 10px; opacity: 0.9; }
                </style>
            </head>
            <body>
                <h1>${ano}</h1>
                <h2>${mesNome.toUpperCase()}</h2>
                <table class="calendario-pdf">
                    <thead>
                        <tr>
                            ${diasSemana.map((dia) => `<th>${dia}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        let linhaAtual = '<tr>';

        for (let i = 0; i < primeiroDia; i += 1) {
            linhaAtual += '<td class="vazio"></td>';
        }

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataAtual = new Date(ano, mes, dia);
            const isDomingo = dataAtual.getDay() === 0;
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga').slice(0, 2);
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias').slice(0, 2);
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia').slice(0, 2);
            const classesCelula = [];

            if (isDomingo) {
                classesCelula.push('domingo');
            }

            if (isFeriado) {
                classesCelula.push('feriado');
            }

            linhaAtual += `<td class="${classesCelula.join(' ')}">`;
            linhaAtual += `<div class="dia-numero">${dia}</div>`;

            if (isFeriado) {
                const nomeFeriado = eventos.feriado.length > 15 ? `${eventos.feriado.substring(0, 12)}...` : eventos.feriado;
                linhaAtual += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">📅 ${escapeHtmlRelatorio(nomeFeriado)}</div>`;
            }

            folgasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag folga-tag" title="${escapeHtmlRelatorio(item.nome)}">🌸 ${escapeHtmlRelatorio(nome)}</div>`;
            });

            feriasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ferias-tag" title="${escapeHtmlRelatorio(item.nome)}">🏖️ ${escapeHtmlRelatorio(nome)}</div>`;
            });

            ausenciasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ausencia-tag" title="${escapeHtmlRelatorio(item.nome)}">⚠️ ${escapeHtmlRelatorio(nome)}</div>`;
            });

            if (colaboradoresDia.length > 2) {
                linhaAtual += `<div style="font-size: 7px; color: #64748b; margin-top: 1px;">+${colaboradoresDia.length - 2}</div>`;
            }

            linhaAtual += '</td>';

            if ((primeiroDia + dia) % 7 === 0) {
                linhaAtual += '</tr>';
                html += linhaAtual;
                if (dia < diasNoMes) {
                    linhaAtual = '<tr>';
                }
            }
        }

        if (linhaAtual !== '<tr>' && !linhaAtual.endsWith('</tr>')) {
            const celulasUsadas = (primeiroDia + diasNoMes) % 7;

            if (celulasUsadas > 0) {
                for (let i = celulasUsadas; i < 7; i += 1) {
                    linhaAtual += '<td class="vazio"></td>';
                }
            }

            linhaAtual += '</tr>';
            html += linhaAtual;
        }

        html += `
                    </tbody>
                </table>

                <div class="legendas-pdf">
                    <div class="legenda-item"><span class="legenda-cor legenda-folga"></span><span>Folga (🌸)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-ferias"></span><span>Ferias (🏖️)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-ausencia"></span><span>Ausencia (⚠️)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-feriado"></span><span>Feriado (📅)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-domingo"></span><span>Domingo</span></div>
                </div>

                <div class="listas-container">
                    <div class="listas-grid">
                        <div class="lista-card">
                            <h3>📅 Feriados</h3>
                            ${feriados.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 58%">Feriado</th><th style="width: 22%">Data</th><th style="width: 20%">Tipo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${feriados.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.nome)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
                                            </tr>
                                        `).join('')}
                                        ${feriados.length > 8 ? `<tr><td colspan="3" style="text-align: center; color: #64748b;">... e mais ${feriados.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhum feriado</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>🏖️ Ferias</h3>
                            ${ferias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 42%">Colaborador</th><th style="width: 58%">Periodo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ferias.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ferias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ferias.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ferias</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>🌸 Folgas</h3>
                            ${folgas.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${folgas.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${folgas.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${folgas.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma folga</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>⚠️ Ausencias</h3>
                            ${ausencias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ausencias.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ausencias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ausencias.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ausencia</div>'}
                        </div>
                    </div>
                </div>

                <div class="resumo-rodape">
                    <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                    <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
                </div>
            </body>
            </html>
        `;

        return html;
    }

    function gerarHtmlPdfRelatorioMensalExpandido(dados) {
        const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes, ferias, folgas, ausencias, feriados } = dados;
        const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio ${mesNome} ${ano}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        background: white;
                        color: #0f172a;
                        width: 1480px;
                        padding: 18px;
                    }
                    .pdf-pagina {
                        width: 1444px;
                        min-height: 970px;
                        padding: 12px 14px 14px;
                        background: white;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 32px;
                    }
                    .cabecalho-principal {
                        text-align: center;
                        margin-bottom: 12px;
                    }
                    .cabecalho-principal h1 {
                        color: #4f46e5;
                        font-size: 44px;
                        line-height: 1.1;
                        margin-bottom: 4px;
                    }
                    .cabecalho-principal p {
                        color: #475569;
                        font-size: 18px;
                    }
                    .cabecalho-secundario {
                        margin-bottom: 18px;
                    }
                    .cabecalho-secundario h2 {
                        color: #0f172a;
                        font-size: 28px;
                        margin-bottom: 14px;
                    }
                    .resumo-metricas {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 12px;
                    }
                    .metrica-card {
                        padding: 14px 16px;
                        border: 1px solid #dbe3ef;
                        border-radius: 12px;
                        background: #f8fafc;
                    }
                    .metrica-card strong {
                        display: block;
                        font-size: 28px;
                        line-height: 1;
                        margin-bottom: 6px;
                        color: #0f172a;
                    }
                    .metrica-card span {
                        display: block;
                        font-size: 12px;
                        color: #475569;
                    }
                    .calendario-pdf {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        border: 1px solid #cbd5e1;
                    }
                    .calendario-pdf th {
                        background: #4f46e5;
                        color: white;
                        padding: 13px 8px;
                        font-weight: 700;
                        font-size: 16px;
                        border: 1px solid #cbd5e1;
                        text-align: center;
                        width: 14.28%;
                    }
                    .calendario-pdf td {
                        border: 1px solid #cbd5e1;
                        vertical-align: top;
                        height: 148px;
                        padding: 10px;
                        background: white;
                        overflow: hidden;
                    }
                    .calendario-pdf td.vazio {
                        background: #f8fafc;
                    }
                    .calendario-pdf td.domingo {
                        background: #fef3c7;
                    }
                    .calendario-pdf td.feriado {
                        background: #fee2e2;
                    }
                    .dia-numero {
                        font-weight: 700;
                        font-size: 25px;
                        line-height: 1;
                        margin-bottom: 7px;
                        color: #0f172a;
                    }
                    .dia-feriado {
                        font-size: 12px;
                        color: #b91c1c;
                        font-weight: 700;
                        margin-bottom: 8px;
                        line-height: 1.3;
                        background: rgba(255, 255, 255, 0.78);
                        padding: 4px 6px;
                        border-radius: 6px;
                        white-space: normal;
                        overflow: hidden;
                    }
                    .dia-eventos {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                    .evento-tag {
                        font-size: 12px;
                        line-height: 1.25;
                        padding: 6px 7px;
                        border-radius: 6px;
                        white-space: normal;
                        overflow: hidden;
                        font-weight: 700;
                    }
                    .folga-tag {
                        background: #d1fae5;
                        color: #047857;
                        border-left: 3px solid #10b981;
                    }
                    .ferias-tag {
                        background: #e0e7ff;
                        color: #4338ca;
                        border-left: 3px solid #6366f1;
                    }
                    .ausencia-tag {
                        background: #fee2e2;
                        color: #b91c1c;
                        border-left: 3px solid #ef4444;
                    }
                    .mais-eventos {
                        font-size: 12px;
                        line-height: 1.2;
                        color: #475569;
                        font-weight: 700;
                        margin-top: 2px;
                    }
                    .legendas-pdf {
                        display: flex;
                        gap: 14px;
                        margin-top: 14px;
                        padding: 12px 14px;
                        background: #f8fafc;
                        border-radius: 10px;
                        flex-wrap: wrap;
                        border: 1px solid #e2e8f0;
                        font-size: 12px;
                    }
                    .legenda-item {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .legenda-cor {
                        width: 14px;
                        height: 14px;
                        border-radius: 4px;
                    }
                    .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                    .legenda-ferias { background: #e0e7ff; border: 1px solid #4f46e5; }
                    .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-domingo { background: #fef3c7; border: 1px solid #d97706; }
                    .nota-pdf {
                        margin-top: 10px;
                        color: #475569;
                        font-size: 11px;
                    }
                    .listas-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 14px;
                    }
                    .lista-card {
                        background: #f8fafc;
                        border-radius: 12px;
                        padding: 12px;
                        border: 1px solid #e2e8f0;
                    }
                    .lista-card h3 {
                        font-size: 15px;
                        font-weight: 700;
                        color: #0f172a;
                        margin-bottom: 10px;
                        padding-bottom: 6px;
                        border-bottom: 1px solid #dbe3ef;
                    }
                    .lista-card table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                    }
                    .lista-card th {
                        text-align: left;
                        padding: 6px;
                        background: #e2e8f0;
                        color: #334155;
                        font-weight: 700;
                        font-size: 10px;
                    }
                    .lista-card td {
                        padding: 5px 6px;
                        border-bottom: 1px solid #e2e8f0;
                        vertical-align: top;
                    }
                    .lista-card tr:last-child td {
                        border-bottom: none;
                    }
                    .empty-message {
                        text-align: center;
                        color: #64748b;
                        font-size: 11px;
                        padding: 16px 8px;
                        font-style: italic;
                    }
                    .resumo-rodape {
                        margin-top: 18px;
                        padding: 14px;
                        background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
                        border-radius: 12px;
                        text-align: center;
                        color: white;
                    }
                    .resumo-rodape strong {
                        font-size: 18px;
                    }
                    .resumo-rodape small {
                        display: block;
                        margin-top: 4px;
                        font-size: 12px;
                        opacity: 0.92;
                    }
                </style>
            </head>
            <body>
                <section class="pdf-pagina calendario-pagina">
                    <div class="cabecalho-principal">
                        <h1>Relatorio de ${mesNome} ${ano}</h1>
                        <p>Calendario mensal ampliado para facilitar a leitura dos lancamentos</p>
                    </div>
                    <table class="calendario-pdf">
                        <thead>
                            <tr>
                                ${diasSemana.map((dia) => `<th>${dia}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        let linhaAtual = '<tr>';

        for (let i = 0; i < primeiroDia; i += 1) {
            linhaAtual += '<td class="vazio"></td>';
        }

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataAtual = new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
            const isDomingo = dataAtual.getUTCDay() === 0;
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga');
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias');
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia');
            const folgasVisiveis = folgasDia.slice(0, 3);
            const feriasVisiveis = feriasDia.slice(0, 3);
            const ausenciasVisiveis = ausenciasDia.slice(0, 3);
            const itensExibidos = folgasVisiveis.length + feriasVisiveis.length + ausenciasVisiveis.length;
            const classesCelula = [];

            if (isDomingo) {
                classesCelula.push('domingo');
            }

            if (isFeriado) {
                classesCelula.push('feriado');
            }

            linhaAtual += `<td class="${classesCelula.join(' ')}">`;
            linhaAtual += `<div class="dia-numero">${dia}</div>`;

            if (isFeriado) {
                const nomeFeriado = eventos.feriado.length > 26 ? `${eventos.feriado.substring(0, 23)}...` : eventos.feriado;
                linhaAtual += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">${escapeHtmlRelatorio(nomeFeriado)}</div>`;
            }

            linhaAtual += '<div class="dia-eventos">';

            folgasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag folga-tag" title="${escapeHtmlRelatorio(item.nome)}">Folga: ${escapeHtmlRelatorio(nome)}</div>`;
            });

            feriasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ferias-tag" title="${escapeHtmlRelatorio(item.nome)}">Ferias: ${escapeHtmlRelatorio(nome)}</div>`;
            });

            ausenciasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ausencia-tag" title="${escapeHtmlRelatorio(item.nome)}">Ausencia: ${escapeHtmlRelatorio(nome)}</div>`;
            });

            if (colaboradoresDia.length > itensExibidos) {
                linhaAtual += `<div class="mais-eventos">+${colaboradoresDia.length - itensExibidos} registro(s)</div>`;
            }

            linhaAtual += '</div>';
            linhaAtual += '</td>';

            if ((primeiroDia + dia) % 7 === 0) {
                linhaAtual += '</tr>';
                html += linhaAtual;
                if (dia < diasNoMes) {
                    linhaAtual = '<tr>';
                }
            }
        }

        if (linhaAtual !== '<tr>' && !linhaAtual.endsWith('</tr>')) {
            const celulasUsadas = (primeiroDia + diasNoMes) % 7;

            if (celulasUsadas > 0) {
                for (let i = celulasUsadas; i < 7; i += 1) {
                    linhaAtual += '<td class="vazio"></td>';
                }
            }

            linhaAtual += '</tr>';
            html += linhaAtual;
        }

        html += `
                        </tbody>
                    </table>

                </section>

                <section class="pdf-pagina resumo-pagina">
                    <div class="cabecalho-secundario">
                        <h2>Resumo do mes</h2>
                        <div class="resumo-metricas">
                            <div class="metrica-card"><strong>${feriados.length}</strong><span>Feriados</span></div>
                            <div class="metrica-card"><strong>${ferias.length}</strong><span>Ferias</span></div>
                            <div class="metrica-card"><strong>${folgas.length}</strong><span>Folgas</span></div>
                            <div class="metrica-card"><strong>${ausencias.length}</strong><span>Ausencias</span></div>
                        </div>
                    </div>

                    <div class="listas-grid">
                        <div class="lista-card">
                            <h3>Feriados</h3>
                            ${feriados.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 56%">Feriado</th><th style="width: 22%">Data</th><th style="width: 22%">Tipo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${feriados.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.nome)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
                                            </tr>
                                        `).join('')}
                                        ${feriados.length > 10 ? `<tr><td colspan="3" style="text-align: center; color: #64748b;">... e mais ${feriados.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhum feriado no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Ferias</h3>
                            ${ferias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 42%">Colaborador</th><th style="width: 58%">Periodo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ferias.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ferias.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ferias.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ferias no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Folgas</h3>
                            ${folgas.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${folgas.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${folgas.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${folgas.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma folga no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Ausencias</h3>
                            ${ausencias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ausencias.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ausencias.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ausencias.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ausencia no periodo</div>'}
                        </div>
                    </div>

                    <div class="resumo-rodape">
                        <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                        <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
                    </div>
                </section>
            </body>
            </html>
        `;

        return html;
    }

    function criarContainerTemporarioRelatorioPdf(html, options = {}) {
        const parser = new DOMParser().parseFromString(html, 'text/html');
        const container = document.createElement('div');
        const estilos = Array.from(parser.querySelectorAll('style'))
            .map((style) => style.outerHTML)
            .join('');
        const containerWidth = Math.max(Number(options.width) || 1500, 1200);

        container.setAttribute('data-relatorio-pdf', 'true');
        container.style.position = 'fixed';
        container.style.left = '-100000px';
        container.style.top = '0';
        container.style.width = `${containerWidth}px`;
        container.style.background = '#ffffff';
        container.style.transform = 'none';
        container.style.transformOrigin = 'top left';
        container.style.pointerEvents = 'none';
        container.style.contain = 'layout paint style';
        container.style.zIndex = '-1';

        container.innerHTML = `${estilos}${parser.body.innerHTML}`;
        document.body.appendChild(container);

        return container;
    }

    async function aguardarLayoutRelatorioPdf() {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        if (document.fonts?.ready) {
            try {
                await document.fonts.ready;
            } catch (error) {
                // ignore
            }
        }
    }

    function lockPdfViewportOverflow() {
        const root = document.documentElement;
        const body = document.body;
        const previousState = {
            rootOverflowX: root?.style?.overflowX || '',
            bodyOverflowX: body?.style?.overflowX || ''
        };

        if (root) {
            root.style.overflowX = 'hidden';
        }

        if (body) {
            body.style.overflowX = 'hidden';
        }

        return () => {
            if (root) {
                root.style.overflowX = previousState.rootOverflowX;
            }

            if (body) {
                body.style.overflowX = previousState.bodyOverflowX;
            }
        };
    }

    async function renderizarPaginaPdfEmCanvas(elemento, options = {}) {
        const minWidth = Math.max(Number(options.minWidth) || 1800, 1400);
        const minHeight = Math.max(Number(options.minHeight) || 1200, 1000);
        const configuredScale = Number(options.scale);
        const deviceScale = Number(window.devicePixelRatio) || 1;
        const desiredScale = Number.isFinite(configuredScale) && configuredScale > 0
            ? Math.max(configuredScale, 1)
            : Math.max(Math.min(deviceScale * 1.5, 3), 2.2);
        const sourceWidth = Math.max(Number(elemento.scrollWidth) || minWidth, 1);
        const sourceHeight = Math.max(Number(elemento.scrollHeight) || minHeight, 1);
        const maxCanvasSide = Math.max(Number(options.maxCanvasSide) || 12000, 4000);
        const maxCanvasPixels = Math.max(Number(options.maxCanvasPixels) || 24000000, 6000000);
        const scaleBySide = Math.min(maxCanvasSide / sourceWidth, maxCanvasSide / sourceHeight);
        const scaleByPixels = Math.sqrt(maxCanvasPixels / Math.max(sourceWidth * sourceHeight, 1));
        const renderScale = Math.max(Math.min(desiredScale, scaleBySide, scaleByPixels), 1);

        const canvas = await html2canvas(elemento, {
            scale: renderScale,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: sourceWidth,
            height: sourceHeight,
            windowWidth: Math.max(sourceWidth, minWidth),
            windowHeight: Math.max(sourceHeight, minHeight)
        });

        canvas.__pdfSourceWidth = sourceWidth;
        canvas.__pdfSourceHeight = sourceHeight;
        canvas.__pdfRenderScale = renderScale;

        return canvas;
    }

    const PDF_PAGE_SIZES_MM = [
        { name: 'a4', width: 210, height: 297 },
        { name: 'a3', width: 297, height: 420 },
        { name: 'a2', width: 420, height: 594 },
        { name: 'a1', width: 594, height: 841 },
        { name: 'a0', width: 841, height: 1189 }
    ];

    function resolvePdfOneSheetLayout(canvas, options = {}) {
        const margin = Math.max(Number(options.marginMm) || 6, 0);
        const preferLandscape = options.preferLandscape !== false;
        const minScale = Math.max(Number(options.minScaleMmPerPixel) || 0.075, 0.03);
        const sourceWidth = Math.max(Number(options.sourceWidth || canvas.__pdfSourceWidth || canvas.width), 1);
        const sourceHeight = Math.max(Number(options.sourceHeight || canvas.__pdfSourceHeight || canvas.height), 1);
        const orientations = preferLandscape
            ? ['landscape', 'portrait']
            : ['portrait', 'landscape'];

        for (const size of PDF_PAGE_SIZES_MM) {
            for (const orientation of orientations) {
                const pageWidth = orientation === 'landscape' ? size.height : size.width;
                const pageHeight = orientation === 'landscape' ? size.width : size.height;
                const usableWidth = pageWidth - (margin * 2);
                const usableHeight = pageHeight - (margin * 2);
                const scale = Math.min(usableWidth / sourceWidth, usableHeight / sourceHeight);

                if (scale >= minScale) {
                    return {
                        format: size.name,
                        orientation,
                        pageWidth,
                        pageHeight,
                        margin,
                        sourceWidth,
                        sourceHeight,
                        scale
                    };
                }
            }
        }

        const rawWidth = (sourceWidth * minScale) + (margin * 2);
        const rawHeight = (sourceHeight * minScale) + (margin * 2);
        const orientation = rawWidth >= rawHeight ? 'landscape' : 'portrait';
        const pageWidth = rawWidth;
        const pageHeight = rawHeight;
        const scale = Math.min(
            (pageWidth - (margin * 2)) / sourceWidth,
            (pageHeight - (margin * 2)) / sourceHeight
        );

        return {
            format: [pageWidth, pageHeight],
            orientation,
            pageWidth,
            pageHeight,
            margin,
            sourceWidth,
            sourceHeight,
            scale
        };
    }

    function getPdfCanvasImagePayload(canvas, options = {}) {
        const requestedFormat = String(options.imageFormat || '').trim().toUpperCase();
        const format = requestedFormat === 'PNG' ? 'PNG' : 'JPEG';

        if (format === 'PNG') {
            return {
                data: canvas.toDataURL('image/png'),
                format,
                compression: 'MEDIUM'
            };
        }

        const quality = Math.min(Math.max(Number(options.imageQuality) || 0.94, 0.75), 0.98);

        return {
            data: canvas.toDataURL('image/jpeg', quality),
            format,
            compression: 'FAST'
        };
    }

    function criarPdfUmaFolhaComCanvas(canvas, options = {}) {
        const layout = resolvePdfOneSheetLayout(canvas, options);
        const pdf = new window.jspdf.jsPDF({
            orientation: layout.orientation,
            unit: 'mm',
            format: layout.format,
            compress: true
        });
        const larguraRender = layout.sourceWidth * layout.scale;
        const alturaRender = layout.sourceHeight * layout.scale;
        const posicaoX = (layout.pageWidth - larguraRender) / 2;
        const posicaoY = (layout.pageHeight - alturaRender) / 2;
        const imagePayload = getPdfCanvasImagePayload(canvas, options);

        pdf.addImage(
            imagePayload.data,
            imagePayload.format,
            posicaoX,
            posicaoY,
            larguraRender,
            alturaRender,
            undefined,
            imagePayload.compression
        );

        return {
            pdf,
            layout,
            larguraRender,
            alturaRender
        };
    }

    function recortarCanvasParaPaginaPdf(canvas, startSourceY, pageSourceHeight, sourceWidth, sourceHeight) {
        const renderScale = Math.max(Number(canvas.__pdfRenderScale) || (canvas.height / sourceHeight) || 1, 1);
        const startCanvasY = Math.max(Math.floor(startSourceY * renderScale), 0);
        const canvasSliceHeight = Math.max(
            Math.min(Math.ceil(pageSourceHeight * renderScale), canvas.height - startCanvasY),
            1
        );
        const sliceCanvas = document.createElement('canvas');
        const context = sliceCanvas.getContext('2d');

        sliceCanvas.width = canvas.width;
        sliceCanvas.height = canvasSliceHeight;

        if (context) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            context.drawImage(
                canvas,
                0,
                startCanvasY,
                canvas.width,
                canvasSliceHeight,
                0,
                0,
                canvas.width,
                canvasSliceHeight
            );
        }

        sliceCanvas.__pdfSourceWidth = sourceWidth;
        sliceCanvas.__pdfSourceHeight = Math.min(pageSourceHeight, sourceHeight - startSourceY);
        sliceCanvas.__pdfRenderScale = renderScale;

        return sliceCanvas;
    }

    function dividirCanvasEmPaginasPdf(canvas, options = {}) {
        const sourceWidth = Math.max(Number(canvas.__pdfSourceWidth || canvas.width), 1);
        const sourceHeight = Math.max(Number(canvas.__pdfSourceHeight || canvas.height), 1);
        const minimumPages = Math.max(Number(options.minimumPages) || 1, 1);
        const configuredMaxHeight = Number(options.maxSourcePageHeight);
        const maxSourcePageHeight = Number.isFinite(configuredMaxHeight) && configuredMaxHeight > 0
            ? configuredMaxHeight
            : sourceHeight;
        const pageCountByHeight = Math.max(Math.ceil(sourceHeight / maxSourcePageHeight), 1);
        const pageCount = Math.max(pageCountByHeight, minimumPages);
        const pageSourceHeight = sourceHeight / pageCount;

        return Array.from({ length: pageCount }, (_, pageIndex) => {
            const startSourceY = pageIndex * pageSourceHeight;
            return recortarCanvasParaPaginaPdf(
                canvas,
                startSourceY,
                pageSourceHeight,
                sourceWidth,
                sourceHeight
            );
        });
    }

    function adicionarCanvasAoPdf(pdf, canvas, options = {}) {
        const layout = resolvePdfOneSheetLayout(canvas, options);
        let pdfDoc = pdf;

        if (!pdfDoc) {
            pdfDoc = new window.jspdf.jsPDF({
                orientation: layout.orientation,
                unit: 'mm',
                format: layout.format,
                compress: true
            });
        } else {
            pdfDoc.addPage(layout.format, layout.orientation);
        }

        const larguraRender = layout.sourceWidth * layout.scale;
        const alturaRender = layout.sourceHeight * layout.scale;
        const posicaoX = (layout.pageWidth - larguraRender) / 2;
        const posicaoY = (layout.pageHeight - alturaRender) / 2;
        const imagePayload = getPdfCanvasImagePayload(canvas, options);

        pdfDoc.addImage(
            imagePayload.data,
            imagePayload.format,
            posicaoX,
            posicaoY,
            larguraRender,
            alturaRender,
            undefined,
            imagePayload.compression
        );

        return {
            pdf: pdfDoc,
            layout
        };
    }

    function criarPdfMultipaginasComCanvas(canvas, options = {}) {
        const pageCanvases = dividirCanvasEmPaginasPdf(canvas, options);
        let pdf = null;
        const layouts = [];

        pageCanvases.forEach((pageCanvas) => {
            const result = adicionarCanvasAoPdf(pdf, pageCanvas, options);
            pdf = result.pdf;
            layouts.push(result.layout);
        });

        return {
            pdf,
            pageCount: pageCanvases.length,
            layouts
        };
    }

    function baixarPdfSemPreview(pdf, fileName) {
        const normalizedName = String(fileName || 'relatorio.pdf').trim() || 'relatorio.pdf';
        const finalName = normalizedName.toLowerCase().endsWith('.pdf')
            ? normalizedName
            : `${normalizedName}.pdf`;
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = finalName;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        window.setTimeout(() => {
            URL.revokeObjectURL(url);
            link.remove();
        }, 1000);
    }

    window.baixarPdfSemPreview = baixarPdfSemPreview;
    window.criarContainerTemporarioRelatorioPdf = criarContainerTemporarioRelatorioPdf;
    window.aguardarLayoutRelatorioPdf = aguardarLayoutRelatorioPdf;
    window.lockPdfViewportOverflow = lockPdfViewportOverflow;
    window.renderizarPaginaPdfEmCanvas = renderizarPaginaPdfEmCanvas;
    window.criarPdfUmaFolhaComCanvas = criarPdfUmaFolhaComCanvas;
    window.criarPdfMultipaginasComCanvas = criarPdfMultipaginasComCanvas;

    window.gerarRelatorioCalendarioCompleto = gerarRelatorioCalendarioCompleto = async function gerarRelatorioCalendarioCompletoConsolidado(mes, ano) {
        const dados = await construirDadosRelatorioMensal(mes, ano);
        mostrarRelatorioCalendarioCompleto(
            dados.mesNome,
            dados.ano,
            dados.primeiroDia,
            dados.diasNoMes,
            dados.eventosPorData,
            dados.ferias,
            dados.folgas,
            dados.ausencias,
            dados.feriados,
            dados.mes
        );
    };

    window.mostrarRelatorioCalendarioCompleto = mostrarRelatorioCalendarioCompleto = function mostrarRelatorioCalendarioCompletoConsolidado(mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes) {
        const dados = {
            mesNome,
            ano,
            primeiroDia,
            diasNoMes,
            eventosPorData,
            ferias,
            folgas,
            ausencias,
            feriados,
            mes
        };

        document.getElementById('relatorioTitulo').innerText = `Relatorio de ${mesNome} ${ano}`;
        document.getElementById('relatorioConteudo').innerHTML = gerarHtmlVisualizacaoRelatorioMensal(dados);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    };

    window.gerarDadosRelatorioCompleto = gerarDadosRelatorioCompleto = async function gerarDadosRelatorioCompletoConsolidado(mes, ano) {
        return construirDadosRelatorioMensal(mes, ano);
    };

    window.gerarHTMLCompletoPDF = gerarHTMLCompletoPDF = function gerarHTMLCompletoPDFConsolidado(dados) {
        return gerarHtmlPdfRelatorioMensalExpandido(dados);
    };

    window.formatarDataBR = formatarDataBR = function formatarDataBRSeguro(dataISO) {
        return formatarDataRelatorio(obterDataIsoRelatorio(dataISO));
    };

    window.gerarRelatorioCompleto = gerarRelatorioCompleto = async function gerarRelatorioCompletoSeguro() {
        const mes = parseInt(document.getElementById('relatorioMesCompleto').value, 10);
        const ano = parseInt(document.getElementById('relatorioAnoCompleto').value, 10);

        await Promise.all([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarFeriadosLocais === 'function' ? carregarFeriadosLocais() : Promise.resolve([]),
            typeof carregarFeriadosAPI === 'function' ? carregarFeriadosAPI(ano) : Promise.resolve([])
        ]);

        await gerarRelatorioCalendarioCompleto(mes, ano);
    };

    window.gerarRelatorioCalendarioParaExportar = gerarRelatorioCalendarioParaExportar = async function gerarRelatorioCalendarioParaExportarSeguro(mes, ano) {
        return construirDadosRelatorioMensal(mes, ano);
    };

    window.renderizarRelatorioParaExportar = renderizarRelatorioParaExportar = function renderizarRelatorioParaExportarSeguro(dados) {
        return gerarHtmlVisualizacaoRelatorioMensal(dados);
    };

    window.exportarComoPDF = exportarComoPDF = async function exportarComoPDFMaisLegivel(mes, ano) {
        document.querySelector('.exportar-modal-overlay')?.remove();
        let releaseViewportLock = null;

        if (typeof mostrarToast === 'function') {
            mostrarToast('Gerando PDF com layout ampliado...', 'warning');
        }

        let container = null;

        try {
            releaseViewportLock = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;

            if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
                throw new Error('Bibliotecas de exportacao nao estao disponiveis.');
            }

            await Promise.all([
                typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
                typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
                typeof carregarFeriadosLocais === 'function' ? carregarFeriadosLocais() : Promise.resolve([])
            ]);

            const dados = await gerarDadosRelatorioCompleto(mes, ano);
            const htmlPDF = gerarHTMLCompletoPDF(dados);

            container = criarContainerTemporarioRelatorioPdf(htmlPDF, { width: 1500 });
            await aguardarLayoutRelatorioPdf();

            const canvas = await renderizarPaginaPdfEmCanvas(container, {
                minWidth: 1800,
                minHeight: 1200,
                scale: 1.6,
                maxCanvasSide: 12000,
                maxCanvasPixels: 22000000
            });
            const { pdf } = criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: 6,
                minScaleMmPerPixel: 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: 2,
                maxSourcePageHeight: 1300
            });

            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `Relatorio_${dados.mesNome}_${dados.ano}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao gerar PDF ampliado:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar PDF: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };

    window.coletarDadosParaCSV = coletarDadosParaCSV = function coletarDadosParaCSVSeguro(mes, ano) {
        const dados = {
            mesNome: MESES_PT_BR[mes],
            ano,
            eventos: []
        };

        const mapaEventos = criarMapaEventosPorData(mes, ano);
        const feriadosPorData = new Map();

        (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.date);
            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                feriadosPorData.set(dataISO, item.name);
            }
        });

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.Data || item.data);
            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                feriadosPorData.set(dataISO, item.Nome || item.nome || 'Feriado');
            }
        });

        Object.keys(mapaEventos).forEach((dataISO) => {
            const dataUtc = criarDataUtcSegura(dataISO);
            const diaSemana = dataUtc.toLocaleDateString('pt-BR', {
                weekday: 'long',
                timeZone: 'UTC'
            });
            const feriado = feriadosPorData.get(dataISO) || '';
            const ausenciasDoDia = (Array.isArray(window.ausencias) ? window.ausencias : []).filter((item) => {
                const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
                const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);
                return dataInicioISO && dataFimISO && dataISO >= dataInicioISO && dataISO <= dataFimISO;
            });

            if (ausenciasDoDia.length === 0 && !feriado) {
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado: '',
                    tipo: 'normal',
                    colaborador: ''
                });
                return;
            }

            if (feriado) {
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado,
                    tipo: 'feriado',
                    colaborador: ''
                });
            }

            ausenciasDoDia.forEach((item) => {
                const colaborador = (window.colaboradores || []).find((entry) => Number(entry.Id) === Number(item.ColaboradorId || item.colaboradorId));
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado,
                    tipo: String(item.Tipo || item.tipo || '').toLowerCase(),
                    colaborador: colaborador?.Nome || 'Desconhecido'
                });
            });
        });

        return dados;
    };

    window.coletarDadosParaJSON = coletarDadosParaJSON = function coletarDadosParaJSONSeguro(mes, ano) {
        const inicioMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
        const fimMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(new Date(ano, mes + 1, 0).getDate()).padStart(2, '0')}`;

        return {
            mes: mes + 1,
            ano,
            colaboradores: window.colaboradores || [],
            ausencias: (window.ausencias || []).filter((item) => {
                const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
                const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);
                return dataInicioISO && dataFimISO && !(dataFimISO < inicioMesISO || dataInicioISO > fimMesISO);
            })
        };
    };
})();

(function () {
    if (window.__bancoHorasRuntimeEnhancementsLoaded) {
        return;
    }

    window.__bancoHorasRuntimeEnhancementsLoaded = true;

    const inflight = new Map();
    let disponibilidadeTimer = null;

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function obterDataISO(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            return valor.includes('T') ? valor.split('T')[0] : valor;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function obterHoraValor(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            const bruto = valor.includes('T') ? valor.split('T')[1] : valor;
            const match = bruto.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
            return match ? `${match[1]}:00` : null;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const isTimeOnlyDate = data.getUTCFullYear() === 1970
            && data.getUTCMonth() === 0
            && data.getUTCDate() === 1;
        const horas = String(isTimeOnlyDate ? data.getUTCHours() : data.getHours()).padStart(2, '0');
        const minutos = String(isTimeOnlyDate ? data.getUTCMinutes() : data.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}:00`;
    }

    function formatarDataPtBr(valor) {
        const dataISO = obterDataISO(valor);

        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function formatarHoraInput(valor) {
        const hora = obterHoraValor(valor);
        return hora ? hora.slice(0, 5) : '';
    }

    function minutosParaTexto(valor, options = {}) {
        const { signed = false } = options;
        const total = Number.isFinite(valor) ? Math.round(valor) : 0;
        const sinal = total < 0 ? '-' : '+';
        const absoluto = Math.abs(total);
        const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
        const minutos = String(absoluto % 60).padStart(2, '0');
        return `${signed ? sinal : ''}${horas}h ${minutos}m`;
    }

    function mapAusencia(item) {
        const descontaBancoHoras = item.DescontaBancoHoras ?? item.descontaBancoHoras;

        return {
            Id: item.Id,
            ColaboradorId: item.ColaboradorId,
            Tipo: item.Tipo,
            DataInicio: item.DataInicio,
            DataFim: item.DataFim,
            DataCadastro: item.DataCadastro,
            PeriodoTipo: item.PeriodoTipo || 'dia_inteiro',
            HoraInicio: item.HoraInicio,
            HoraFim: item.HoraFim,
            Subtipo: item.Subtipo || null,
            DescontaBancoHoras: descontaBancoHoras === null || descontaBancoHoras === undefined
                ? null
                : Boolean(descontaBancoHoras),
            Observacao: item.Observacao || null,
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo: item.Tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo: item.PeriodoTipo || 'dia_inteiro',
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim,
            subtipo: item.Subtipo || null,
            descontaBancoHoras: descontaBancoHoras === null || descontaBancoHoras === undefined
                ? null
                : Boolean(descontaBancoHoras),
            observacao: item.Observacao || null
        };
    }

    function mapPlantao(item) {
        return {
            ...item,
            dataISO: obterDataISO(item.dataISO || item.data_plantao),
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            horaInicio: obterHoraValor(item.horaInicio || item.hora_inicio),
            horaFim: obterHoraValor(item.horaFim || item.hora_fim),
            observacao: item.observacao || null,
            duracaoMinutos: Number.isFinite(item.duracaoMinutos) ? item.duracaoMinutos : null,
            duracaoFormatada: item.duracaoFormatada || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : []
        };
    }

    function mapBancoHorasResumo(item) {
        return {
            colaboradorId: Number(item.colaboradorId),
            nome: item.nome,
            saldoMinutos: Number(item.saldoMinutos || 0),
            saldoFormatado: item.saldoFormatado || minutosParaTexto(item.saldoMinutos || 0, { signed: true }),
            creditosMesMinutos: Number(item.creditosMesMinutos || 0),
            creditosMesFormatado: item.creditosMesFormatado || minutosParaTexto(item.creditosMesMinutos || 0),
            debitosMesMinutos: Number(item.debitosMesMinutos || 0),
            debitosMesFormatado: item.debitosMesFormatado || minutosParaTexto(item.debitosMesMinutos || 0),
            ultimoMovimentoEm: item.ultimoMovimentoEm || null
        };
    }

    function getBancoHorasResumoByColaborador(colaboradorId) {
        return (window.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getPlantaoEditorState() {
        if (!window.__plantaoEditorState) {
            window.__plantaoEditorState = null;
        }

        return window.__plantaoEditorState;
    }

    function setPlantaoEditorState(state) {
        window.__plantaoEditorState = state;
        return state;
    }

    function isColaboradoresScreenVisible() {
        return Boolean(document.getElementById('listaColaboradores'));
    }

    function getAusenciaDefaults(tipo, subtipo = null) {
        if (tipo === 'ferias') {
            return {
                subtipo: 'ferias',
                descontaBancoHoras: false,
                subtipoBloqueado: true,
                descontoBloqueado: true,
                hint: 'Ferias nao descontam do banco de horas.'
            };
        }

        if (tipo === 'folga') {
            return {
                subtipo: 'folga',
                descontaBancoHoras: true,
                subtipoBloqueado: true,
                descontoBloqueado: false,
                hint: 'Folga debita a jornada padrao do colaborador no banco de horas.'
            };
        }

        if (subtipo === 'medico') {
            return {
                subtipo: 'medico',
                descontaBancoHoras: false,
                subtipoBloqueado: false,
                descontoBloqueado: false,
                hint: 'Lancamentos medicos podem ficar sem desconto no banco.'
            };
        }

        return {
            subtipo: subtipo || 'comum',
            descontaBancoHoras: true,
            subtipoBloqueado: false,
            descontoBloqueado: false,
            hint: 'Ausencias e folgas podem gerar debito, salvo quando voce desmarcar o desconto.'
        };
    }

    function aplicarDefaultsBancoHorasLancamento(options = {}) {
        const { force = false, resetManual = false } = options;
        const tipo = document.getElementById('tipoLancamento')?.value;
        const painel = document.getElementById('camposBancoHorasPessoal');
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const hint = document.getElementById('descontaBancoHorasHint');

        if (!painel || !subtipo || !desconto || !hint) {
            return;
        }

        if (resetManual) {
            delete desconto.dataset.manualOverride;
        }

        const isPessoal = tipo && tipo !== 'feriado';
        painel.classList.toggle('hidden', !isPessoal);

        if (!isPessoal) {
            return;
        }

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        const keepManual = desconto.dataset.manualOverride === 'true' && !force;

        if (!subtipo.value || force || defaults.subtipoBloqueado) {
            subtipo.value = defaults.subtipo;
        }

        if (!keepManual) {
            desconto.checked = defaults.descontaBancoHoras;
        }

        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function resetBancoHorasLancamento() {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');

        if (subtipo) {
            subtipo.value = 'comum';
        }

        if (desconto) {
            desconto.checked = true;
            delete desconto.dataset.manualOverride;
        }

        if (observacao) {
            observacao.value = '';
        }

        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }

    function preencherBancoHorasLancamento(item) {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');
        const hint = document.getElementById('descontaBancoHorasHint');
        const tipo = document.getElementById('tipoLancamento')?.value || item.tipo || item.Tipo;

        if (!subtipo || !desconto || !observacao || !hint) {
            return;
        }

        subtipo.value = item.subtipo || item.Subtipo || getAusenciaDefaults(tipo).subtipo;
        desconto.checked = item.descontaBancoHoras === null || item.descontaBancoHoras === undefined
            ? getAusenciaDefaults(tipo, subtipo.value).descontaBancoHoras
            : Boolean(item.descontaBancoHoras);
        observacao.value = item.observacao || item.Observacao || '';
        desconto.dataset.manualOverride = 'true';

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function renderResumoBancoHorasAviso() {
        if (!window.bancoHorasStatus || window.bancoHorasStatus.enabled !== false) {
            return '';
        }

        return `
            <div class="banco-horas-alert">
                <i class="fas fa-database"></i>
                <div>
                    <strong>Banco de horas aguardando migracao</strong>
                    <span>${escapeHtml(window.bancoHorasStatus.message || 'Aplique o script SQL para liberar saldo e extrato.')}</span>
                </div>
            </div>
        `;
    }

    function renderCardBancoHoras(colaborador) {
        const resumo = getBancoHorasResumoByColaborador(colaborador.Id);
        const saldoClasse = resumo?.saldoMinutos < 0 ? 'negativo' : 'positivo';
        const saldoTexto = resumo ? resumo.saldoFormatado : '+00h 00m';
        const creditosTexto = resumo ? resumo.creditosMesFormatado : '00h 00m';
        const debitosTexto = resumo ? resumo.debitosMesFormatado : '00h 00m';

        return `
            <div class="banco-horas-card">
                <div class="banco-horas-saldo ${saldoClasse}">
                    <span class="banco-horas-label">Saldo atual</span>
                    <strong>${escapeHtml(saldoTexto)}</strong>
                </div>
                <div class="banco-horas-metrics">
                    <span><i class="fas fa-arrow-up"></i> Creditos do mes: ${escapeHtml(creditosTexto)}</span>
                    <span><i class="fas fa-arrow-down"></i> Debitos do mes: ${escapeHtml(debitosTexto)}</span>
                </div>
                <button type="button" class="btn-secondary btn-banco-horas" data-extrato-colaborador="${colaborador.Id}">
                    <i class="fas fa-receipt"></i> Extrato
                </button>
            </div>
        `;
    }

    function ensureBancoHorasModal() {
        if (document.getElementById('modalBancoHoras')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'modalBancoHoras';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content banco-horas-modal-content">
                <div class="modal-header">
                    <h3 id="modalBancoHorasTitulo"><i class="fas fa-receipt"></i> Banco de horas</h3>
                    <button class="modal-close" id="fecharModalBancoHorasBtn">&times;</button>
                </div>
                <div class="modal-body" id="modalBancoHorasBody">
                    <div class="loading-state">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Carregando extrato...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    function renderExtratoBancoHoras(payload) {
        const body = document.getElementById('modalBancoHorasBody');

        if (!body) {
            return;
        }

        const items = Array.isArray(payload.items) ? payload.items : [];

        if (items.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento encontrado.</p>
                </div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="banco-horas-extrato-list">
                ${items.map((item) => `
                    <article class="banco-horas-movimento ${item.minutos < 0 ? 'debito' : 'credito'}">
                        <header>
                            <div>
                                <strong>${escapeHtml(item.descricao)}</strong>
                                <span>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</span>
                            </div>
                            <div class="banco-horas-movimento-valores">
                                <strong>${escapeHtml(item.minutosFormatado)}</strong>
                                <span>Saldo: ${escapeHtml(item.saldoAcumuladoFormatado)}</span>
                            </div>
                        </header>
                        ${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}
                    </article>
                `).join('')}
            </div>
        `;
    }

    async function abrirExtratoBancoHoras(colaboradorId) {
        ensureBancoHorasModal();
        const modal = document.getElementById('modalBancoHoras');
        const titulo = document.getElementById('modalBancoHorasTitulo');
        const body = document.getElementById('modalBancoHorasBody');
        const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

        if (!modal || !titulo || !body) {
            return;
        }

        titulo.innerHTML = `<i class="fas fa-receipt"></i> Banco de horas - ${escapeHtml(colaborador?.Nome || 'Colaborador')}`;
        body.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-circle-notch fa-spin"></i>
                <p>Carregando extrato...</p>
            </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('active');

        try {
            const payload = await window.API.getBancoHorasExtrato(colaboradorId);
            renderExtratoBancoHoras(payload);
        } catch (error) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${escapeHtml(error.message || 'Nao foi possivel carregar o extrato.')}</p>
                </div>
            `;
        }
    }

    function renderChecklistColaboradoresAvancado(selecionados = [], disponibilidade = []) {
        const listaColaboradores = Array.isArray(window.colaboradores) ? window.colaboradores : [];

        if (listaColaboradores.length === 0) {
            return `
                <div class="empty-msg">
                    <i class="fas fa-users"></i>
                    <p>Nenhum colaborador cadastrado</p>
                </div>
            `;
        }

        const disponibilidadeMap = new Map((disponibilidade || []).map((item) => [Number(item.id), item]));
        let selecionadosDisponiveis = 0;

        const html = listaColaboradores.map((colaborador) => {
            const status = disponibilidadeMap.get(Number(colaborador.Id)) || {
                disponivel: true,
                motivoLabel: null
            };
            const disponivel = status.disponivel !== false;
            const checked = disponivel && selecionados.includes(colaborador.Id);

            if (checked) {
                selecionadosDisponiveis += 1;
            }

            return `
                <label class="colaborador-checkbox ${disponivel ? '' : 'indisponivel'}">
                    <input type="checkbox" value="${colaborador.Id}" ${checked ? 'checked' : ''} ${disponivel ? '' : 'disabled'}>
                    <span class="checkbox-label">
                        <i class="fas fa-user-circle"></i>
                        <span>
                            <strong>${escapeHtml(colaborador.Nome)}</strong>
                            ${disponivel ? '' : `<small class="status-indisponivel">${escapeHtml(status.motivoLabel || 'Indisponivel')}</small>`}
                        </span>
                    </span>
                </label>
            `;
        }).join('');

        return `
            ${html}
            <div class="selecionados-count">
                <i class="fas fa-check-circle"></i>
                <span id="plantaoSelecionadosCount">${selecionadosDisponiveis} colaborador(es) selecionado(s)</span>
            </div>
        `;
    }

    function updatePlantaoSelectionSummary() {
        const contador = document.getElementById('plantaoSelecionadosCount');
        const credito = document.getElementById('plantaoCreditoPreview');

        if (contador) {
            const selecionados = document.querySelectorAll('#checklistColaboradores input:checked').length;
            contador.textContent = `${selecionados} colaborador(es) selecionado(s)`;
        }

        if (credito) {
            const horaInicio = document.getElementById('plantaoHoraInicio')?.value;
            const horaFim = document.getElementById('plantaoHoraFim')?.value;

            if (!horaInicio || !horaFim) {
                credito.textContent = 'Credito por colaborador: informe o horario';
                return;
            }

            const [horaInicioHoras, horaInicioMinutos] = horaInicio.split(':').map(Number);
            const [horaFimHoras, horaFimMinutos] = horaFim.split(':').map(Number);
            const minutos = ((horaFimHoras * 60) + horaFimMinutos) - ((horaInicioHoras * 60) + horaInicioMinutos);

            if (minutos <= 0) {
                credito.textContent = 'Credito por colaborador: horario invalido';
                return;
            }

            credito.textContent = `Credito por colaborador: ${minutosParaTexto(minutos)}`;
        }
    }

    async function carregarDisponibilidadePlantao(state) {
        try {
            const response = await window.API.getPlantaoDisponibilidade(state.dataISO, {
                horaInicio: state.horaInicio || undefined,
                horaFim: state.horaFim || undefined
            });

            state.disponibilidade = Array.isArray(response?.colaboradores) ? response.colaboradores : [];
        } catch (error) {
            state.disponibilidade = (window.colaboradores || []).map((item) => ({
                id: item.Id,
                nome: item.Nome,
                disponivel: true,
                motivoLabel: null
            }));
        }

        const disponiveis = new Set(
            (state.disponibilidade || [])
                .filter((item) => item.disponivel !== false)
                .map((item) => Number(item.id))
        );

        state.selecionados = (state.selecionados || []).filter((item) => disponiveis.has(Number(item)));
        return state;
    }

    function renderPlantaoEditor(state) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        editorPanel.style.display = 'block';
        editorTitle.innerText = `Plantao - ${state.dataFormatada}`;

        editorContent.innerHTML = `
            <div class="editor-plantao">
                <div class="editor-form-grid">
                    <div class="editor-form-group">
                        <label><i class="fas fa-calendar-week"></i> Tipo do plantao</label>
                        <select id="plantaoTipoPlantao" class="form-control">
                            <option value="sabado" selected>Sabado</option>
                        </select>
                        <small class="helper-text">Plantao extra permitido apenas aos sabados.</small>
                    </div>
                    <div class="editor-form-group">
                        <label><i class="fas fa-clock"></i> Horario do plantao</label>
                        <div class="time-inputs plantao-time-inputs">
                            <input type="time" id="plantaoHoraInicio" value="${escapeHtml(formatarHoraInput(state.horaInicio))}">
                            <span>ate</span>
                            <input type="time" id="plantaoHoraFim" value="${escapeHtml(formatarHoraInput(state.horaFim))}">
                        </div>
                        <small class="helper-text">Essas horas viram credito no banco de horas.</small>
                    </div>
                    <div class="editor-form-group">
                        <label><i class="fas fa-wallet"></i> Resumo</label>
                        <div class="plantao-bank-preview">
                            <span id="plantaoCreditoPreview">Credito por colaborador: ${state.horaInicio && state.horaFim ? minutosParaTexto((((Number(state.horaFim.slice(0, 2)) * 60) + Number(state.horaFim.slice(3, 5))) - ((Number(state.horaInicio.slice(0, 2)) * 60) + Number(state.horaInicio.slice(3, 5))))) : 'informe o horario'}</span>
                        </div>
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="plantaoObservacao" class="form-control" rows="3" placeholder="Detalhes opcionais para o plantao">${escapeHtml(state.observacao || '')}</textarea>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-users"></i> Selecione os colaboradores</label>
                    <div class="colaboradores-checklist" id="checklistColaboradores">
                        ${renderChecklistColaboradoresAvancado(state.selecionados, state.disponibilidade)}
                    </div>
                </div>

                <div class="editor-actions">
                    <button onclick="salvarPlantao('${state.dataISO}')" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar Plantao
                    </button>
                    <button onclick="fecharPlantaoEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;

        editorContent.querySelectorAll('#checklistColaboradores input[type="checkbox"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updatePlantaoSelectionSummary);
        });

        const horaInicio = document.getElementById('plantaoHoraInicio');
        const horaFim = document.getElementById('plantaoHoraFim');

        [horaInicio, horaFim].forEach((campo) => {
            campo?.addEventListener('input', () => {
                updatePlantaoSelectionSummary();

                if (disponibilidadeTimer) {
                    clearTimeout(disponibilidadeTimer);
                }

                disponibilidadeTimer = setTimeout(async () => {
                    const currentState = getPlantaoEditorState();

                    if (!currentState) {
                        return;
                    }

                    currentState.horaInicio = horaInicio?.value || null;
                    currentState.horaFim = horaFim?.value || null;
                    await carregarDisponibilidadePlantao(currentState);
                    renderPlantaoEditor(currentState);
                    updatePlantaoSelectionSummary();
                }, 250);
            });
        });

        updatePlantaoSelectionSummary();
    }

    window.carregarAusencias = carregarAusencias = function carregarAusenciasComBancoHoras() {
        return withInFlight('ausencias-banco-horas', async () => {
            let lista = [];

            try {
                const data = await window.API.getAusencias();
                lista = Array.isArray(data) ? data.map(mapAusencia) : [];
            } catch (error) {
                lista = [];
            }

            try {
                ausencias = lista;
            } catch (error) {
                // ignore
            }

            window.ausencias = lista;
            return lista;
        });
    };

    window.carregarPlantoes = carregarPlantoes = function carregarPlantoesComBancoHoras() {
        return withInFlight('plantoes-banco-horas', async () => {
            let lista = [];

            try {
                const data = await window.API.getPlantoes();
                lista = Array.isArray(data) ? data.map(mapPlantao) : [];
            } catch (error) {
                lista = [];
            }

            try {
                plantoesLancados = lista;
            } catch (error) {
                // ignore
            }

            window.plantoesLancados = lista;
            return lista;
        });
    };

    window.carregarBancoHorasResumo = carregarBancoHorasResumo = function carregarBancoHorasResumoComCache() {
        return withInFlight('banco-horas-resumo', async () => {
            let items = [];
            let status = { enabled: true, message: null };

            try {
                const payload = await window.API.getBancoHorasResumo();
                items = Array.isArray(payload?.items) ? payload.items.map(mapBancoHorasResumo) : [];
                status = {
                    enabled: payload?.enabled !== false,
                    message: null
                };
            } catch (error) {
                items = [];
                status = {
                    enabled: false,
                    message: error.message || 'Banco de horas indisponivel.'
                };
            }

            window.bancoHorasResumo = items;
            window.bancoHorasStatus = status;
            return { items, status };
        });
    };

    if (typeof renderListaColaboradores === 'function') {
        window.renderListaColaboradores = renderListaColaboradores = function renderListaColaboradoresComBancoHoras(lista = window.colaboradores || []) {
            const container = document.getElementById('listaColaboradores');

            if (!container) {
                return;
            }

            if (!lista || lista.length === 0) {
                container.innerHTML = `
                    ${renderResumoBancoHorasAviso()}
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>Nenhum colaborador encontrado</p>
                        <small>Clique em "Novo Colaborador" para adicionar</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                ${renderResumoBancoHorasAviso()}
                ${lista.map((colaborador) => `
                    <article class="colaborador-card" data-colaborador-id="${colaborador.Id}">
                        <div class="colaborador-avatar">
                            ${escapeHtml(colaborador.Nome?.charAt(0) || '?')}
                        </div>
                        <div class="colaborador-info">
                            <h4 class="colaborador-nome">${escapeHtml(colaborador.Nome || 'Sem nome')}</h4>
                            ${colaborador.SetorNome ? `
                                <div class="colaborador-setor-badge">
                                    <i class="fas fa-layer-group"></i> ${escapeHtml(colaborador.SetorNome)}
                                </div>
                            ` : ''}
                            <div class="colaborador-horarios">
                                <span class="horario-tag">
                                    <i class="fas fa-briefcase"></i> ${escapeHtml(formatarHora(colaborador.TrabalhoInicio))} - ${escapeHtml(formatarHora(colaborador.TrabalhoFim))}
                                </span>
                                <span class="horario-tag">
                                    <i class="fas fa-utensils"></i> ${escapeHtml(formatarHora(colaborador.AlmocoInicio))} - ${escapeHtml(formatarHora(colaborador.AlmocoFim))}
                                </span>
                            </div>
                            ${renderCardBancoHoras(colaborador)}
                        </div>
                        <div class="colaborador-edit-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </article>
                `).join('')}
            `;

            container.querySelectorAll('.colaborador-card').forEach((card) => {
                card.addEventListener('click', (event) => {
                    if (event.target.closest('[data-extrato-colaborador]')) {
                        return;
                    }

                    const colaboradorId = Number(card.dataset.colaboradorId);

                    if (typeof window.abrirEditorColaboradores === 'function') {
                        window.abrirEditorColaboradores(colaboradorId);
                    } else if (typeof abrirEditorColaboradores === 'function') {
                        abrirEditorColaboradores(colaboradorId);
                    }
                });
            });

            container.querySelectorAll('[data-extrato-colaborador]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    abrirExtratoBancoHoras(button.dataset.extratoColaborador);
                });
            });
        };
    }

    function buildSetorEditorOptions(selectedId = '') {
        return [
            '<option value="">Selecione...</option>',
            ...((window.setores || []).map((setor) => `
                <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${escapeHtml(setor.nome)}</option>
            `))
        ].join('');
    }

    const JORNADA_SEMANAL_DIAS = [
        { diaSemana: 0, label: 'Domingo' },
        { diaSemana: 1, label: 'Segunda' },
        { diaSemana: 2, label: 'Terca' },
        { diaSemana: 3, label: 'Quarta' },
        { diaSemana: 4, label: 'Quinta' },
        { diaSemana: 5, label: 'Sexta' },
        { diaSemana: 6, label: 'Sabado' }
    ];

    function buildJornadaSemanalDefaultRows() {
        return JORNADA_SEMANAL_DIAS.map((dia) => ({
            diaSemana: dia.diaSemana,
            label: dia.label,
            checked: false,
            trabalhoInicio: '',
            trabalhoFim: '',
            almocoInicio: '',
            almocoFim: ''
        }));
    }

    function mapJornadaSemanalRowsToEditor(items = []) {
        const byDay = new Map();

        (Array.isArray(items) ? items : []).forEach((item) => {
            const day = Number(item.diaSemana ?? item.DiaSemana);

            if (!Number.isInteger(day) || day < 0 || day > 6) {
                return;
            }

            byDay.set(day, {
                trabalhoInicio: formatarHora(item.trabalhoInicio || item.TrabalhoInicio || ''),
                trabalhoFim: formatarHora(item.trabalhoFim || item.TrabalhoFim || ''),
                almocoInicio: formatarHora(item.almocoInicio || item.AlmocoInicio || ''),
                almocoFim: formatarHora(item.almocoFim || item.AlmocoFim || '')
            });
        });

        return buildJornadaSemanalDefaultRows().map((row) => {
            const loaded = byDay.get(row.diaSemana);

            if (!loaded) {
                return row;
            }

            return {
                ...row,
                checked: true,
                ...loaded
            };
        });
    }

    function getJornadaSemanalEditorMeta() {
        if (!window.__jornadaSemanalEditorMeta) {
            window.__jornadaSemanalEditorMeta = {
                colaboradorId: null,
                hasExisting: false,
                touched: false,
                loaded: false
            };
        }

        return window.__jornadaSemanalEditorMeta;
    }

    function setJornadaSemanalEditorTouched(value = true) {
        const meta = getJornadaSemanalEditorMeta();
        meta.touched = Boolean(value);
    }

    function renderJornadaSemanalRows(rows = []) {
        return rows.map((row) => `
            <div class="jornada-semanal-row${row.checked ? ' is-selected' : ''}" data-jornada-row="${row.diaSemana}">
                <label class="jornada-semanal-day-toggle">
                    <input type="checkbox" data-jornada-check="${row.diaSemana}" ${row.checked ? 'checked' : ''}>
                    <span>${escapeHtml(row.label)}</span>
                </label>
                <div class="jornada-semanal-times${row.checked ? '' : ' is-hidden'}" data-jornada-times="${row.diaSemana}">
                    <div class="jornada-time-group">
                        <small>Jornada</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-entrada="${row.diaSemana}" value="${escapeHtml(row.trabalhoInicio || '')}" class="form-control" title="Entrada">
                            <span>ate</span>
                            <input type="time" data-jornada-saida="${row.diaSemana}" value="${escapeHtml(row.trabalhoFim || '')}" class="form-control" title="Saida">
                        </div>
                    </div>
                    <div class="jornada-time-group">
                        <small>Almoco</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-almoco-inicio="${row.diaSemana}" value="${escapeHtml(row.almocoInicio || '')}" class="form-control" title="Almoco inicio">
                            <span>ate</span>
                            <input type="time" data-jornada-almoco-fim="${row.diaSemana}" value="${escapeHtml(row.almocoFim || '')}" class="form-control" title="Almoco fim">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function buildJornadaSemanalEditorMarkup(rows = [], options = {}) {
        const { showSuggestion = false } = options;

        return `
            <div class="editor-form-group">
                <label><i class="fas fa-calendar-week"></i> Jornada semanal</label>
                <div id="jornadaSemanalSection" class="jornada-semanal-shell">
                    <div class="jornada-semanal-actions">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSegSex">
                            <i class="fas fa-business-time"></i> Selecionar segunda a sexta
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaTodos">
                            <i class="fas fa-layer-group"></i> Selecionar todos
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaCopiarPadrao">
                            <i class="fas fa-copy"></i> Copiar horario padrao para dias selecionados
                        </button>
                    </div>
                    <div class="jornada-semanal-grid" id="jornadaSemanalGrid">
                        ${renderJornadaSemanalRows(rows)}
                    </div>
                    <div id="jornadaSemanalHint" class="helper-text jornada-semanal-hint${showSuggestion ? '' : ' is-hidden'}">
                        Este colaborador ainda nao possui jornada semanal salva. Use o botao abaixo para sugerir o padrao atual sem salvar automaticamente.
                    </div>
                    <div id="jornadaSemanalSuggestionActions" class="jornada-semanal-suggestion-actions${showSuggestion ? '' : ' is-hidden'}">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSugerirPadrao">
                            <i class="fas fa-magic"></i> Sugerir jornada com base no horario padrao
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function toggleJornadaSemanalDayRow(day, checked) {
        const row = document.querySelector(`[data-jornada-row="${day}"]`);
        const times = document.querySelector(`[data-jornada-times="${day}"]`);

        if (row) {
            row.classList.toggle('is-selected', checked);
        }

        if (times) {
            times.classList.toggle('is-hidden', !checked);
        }
    }

    function getHorarioPadraoEditor() {
        return {
            trabalhoInicio: document.getElementById('editorTrabInicio')?.value || '',
            trabalhoFim: document.getElementById('editorTrabFim')?.value || '',
            almocoInicio: document.getElementById('editorAlmInicio')?.value || '',
            almocoFim: document.getElementById('editorAlmFim')?.value || ''
        };
    }

    function copyHorarioPadraoParaJornadaSelecionada() {
        const padrao = getHorarioPadraoEditor();
        const checkedDays = Array.from(document.querySelectorAll('[data-jornada-check]:checked'));

        checkedDays.forEach((checkbox) => {
            const day = checkbox.getAttribute('data-jornada-check');
            const entrada = document.querySelector(`[data-jornada-entrada="${day}"]`);
            const saida = document.querySelector(`[data-jornada-saida="${day}"]`);
            const almocoInicio = document.querySelector(`[data-jornada-almoco-inicio="${day}"]`);
            const almocoFim = document.querySelector(`[data-jornada-almoco-fim="${day}"]`);

            if (entrada) entrada.value = padrao.trabalhoInicio;
            if (saida) saida.value = padrao.trabalhoFim;
            if (almocoInicio) almocoInicio.value = padrao.almocoInicio;
            if (almocoFim) almocoFim.value = padrao.almocoFim;
        });

        if (checkedDays.length > 0) {
            setJornadaSemanalEditorTouched(true);
        }
    }

    function setJornadaSemanalDays(days = []) {
        const daySet = new Set(days.map((day) => Number(day)));

        JORNADA_SEMANAL_DIAS.forEach((dayInfo) => {
            const checkbox = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`);
            const checked = daySet.has(dayInfo.diaSemana);

            if (checkbox) {
                checkbox.checked = checked;
            }

            toggleJornadaSemanalDayRow(dayInfo.diaSemana, checked);
        });

        setJornadaSemanalEditorTouched(true);
    }

    function collectJornadaSemanalPayloadFromEditor() {
        return JORNADA_SEMANAL_DIAS.map((dayInfo) => {
            const checked = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`)?.checked;

            if (!checked) {
                return null;
            }

            return {
                diaSemana: dayInfo.diaSemana,
                trabalhoInicio: document.querySelector(`[data-jornada-entrada="${dayInfo.diaSemana}"]`)?.value || null,
                trabalhoFim: document.querySelector(`[data-jornada-saida="${dayInfo.diaSemana}"]`)?.value || null,
                almocoInicio: document.querySelector(`[data-jornada-almoco-inicio="${dayInfo.diaSemana}"]`)?.value || null,
                almocoFim: document.querySelector(`[data-jornada-almoco-fim="${dayInfo.diaSemana}"]`)?.value || null
            };
        }).filter(Boolean);
    }

    function bindJornadaSemanalEditorEvents() {
        const section = document.getElementById('jornadaSemanalSection');

        if (!section || section.dataset.bound === 'true') {
            return;
        }

        section.dataset.bound = 'true';

        document.querySelectorAll('[data-jornada-check]').forEach((input) => {
            input.addEventListener('change', () => {
                const day = Number(input.getAttribute('data-jornada-check'));
                toggleJornadaSemanalDayRow(day, input.checked);
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.querySelectorAll(
            '[data-jornada-entrada], [data-jornada-saida], [data-jornada-almoco-inicio], [data-jornada-almoco-fim]'
        ).forEach((input) => {
            input.addEventListener('input', () => {
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.getElementById('btnJornadaSegSex')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
        });

        document.getElementById('btnJornadaTodos')?.addEventListener('click', () => {
            setJornadaSemanalDays([0, 1, 2, 3, 4, 5, 6]);
        });

        document.getElementById('btnJornadaCopiarPadrao')?.addEventListener('click', () => {
            copyHorarioPadraoParaJornadaSelecionada();
        });

        document.getElementById('btnJornadaSugerirPadrao')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
            copyHorarioPadraoParaJornadaSelecionada();
        });
    }

    function updateJornadaSemanalSuggestionVisibility(showSuggestion) {
        const hint = document.getElementById('jornadaSemanalHint');
        const actions = document.getElementById('jornadaSemanalSuggestionActions');

        if (hint) {
            hint.classList.toggle('is-hidden', !showSuggestion);
        }

        if (actions) {
            actions.classList.toggle('is-hidden', !showSuggestion);
        }
    }

    async function hydrateJornadaSemanalEditor(colaboradorId) {
        const meta = getJornadaSemanalEditorMeta();
        meta.loaded = false;
        meta.hasExisting = false;

        if (!colaboradorId || !window.API?.getColaboradorJornadaSemanal) {
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(false);
            bindJornadaSemanalEditorEvents();
            return;
        }

        try {
            const payload = await window.API.getColaboradorJornadaSemanal(colaboradorId);
            const rows = mapJornadaSemanalRowsToEditor(payload?.items || []);
            const grid = document.getElementById('jornadaSemanalGrid');

            if (grid) {
                grid.innerHTML = renderJornadaSemanalRows(rows);
            }

            meta.hasExisting = rows.some((item) => item.checked);
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(!meta.hasExisting);
            bindJornadaSemanalEditorEvents();
        } catch (error) {
            meta.loaded = true;
            meta.hasExisting = false;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(true);
            bindJornadaSemanalEditorEvents();
        }
    }

    window.abrirEditorColaboradores = abrirEditorColaboradores = async function abrirEditorColaboradoresAtualizado(id) {
        if (
            (!Array.isArray(window.setores) || window.setores.length === 0)
            && typeof carregarSetores === 'function'
        ) {
            await carregarSetores();
        }

        const colaborador = id ? (window.colaboradores || []).find((item) => Number(item.Id) === Number(id)) : null;
        const editorPanel = document.getElementById('colaboradorEditor');
        const editorTitle = document.getElementById('editorTitle');
        const editorContent = document.getElementById('colaboradorEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        editorPanel.style.display = 'block';
        editorTitle.innerText = colaborador ? 'Editar Colaborador' : 'Novo Colaborador';

        const jornadaMeta = getJornadaSemanalEditorMeta();
        jornadaMeta.colaboradorId = colaborador ? Number(colaborador.Id) : null;
        jornadaMeta.hasExisting = false;
        jornadaMeta.loaded = false;
        jornadaMeta.touched = false;

        editorContent.innerHTML = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" value="${escapeHtml(colaborador?.Nome || '')}" placeholder="Nome completo" class="form-control">
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-layer-group"></i> Setor</label>
                    <div class="setor-inputs">
                        <select id="editorSetorId" class="form-control">
                            ${buildSetorEditorOptions(colaborador?.SetorId || '')}
                        </select>
                        <button type="button" onclick="adicionarSetorRapido()" class="btn-secondary btn-setor-rapido">
                            <i class="fas fa-plus"></i> Novo setor
                        </button>
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Horario de entrada e saida</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" value="${escapeHtml(formatarHora(colaborador?.TrabalhoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorTrabFim" value="${escapeHtml(formatarHora(colaborador?.TrabalhoFim) || '')}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Horario de almoco</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" value="${escapeHtml(formatarHora(colaborador?.AlmocoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorAlmFim" value="${escapeHtml(formatarHora(colaborador?.AlmocoFim) || '')}" class="form-control">
                    </div>
                    <small class="helper-text">Esses horarios definem a base padrao da escala para esse colaborador.</small>
                </div>

                ${typeof buildBancoHorasEditorMarkup === 'function' ? buildBancoHorasEditorMarkup(colaborador) : ''}
                ${buildJornadaSemanalEditorMarkup(buildJornadaSemanalDefaultRows(), { showSuggestion: false })}

                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(${colaborador ? colaborador.Id : 'null'})" class="btn-primary">
                        <i class="fas fa-save"></i> ${colaborador ? 'Atualizar' : 'Salvar'}
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                ${colaborador ? `
                    <div class="editor-footer">
                        <button onclick="excluirColaborador(${colaborador.Id})" class="btn-danger" style="width: 100%;">
                            <i class="fas fa-trash"></i> Excluir Colaborador
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        if (colaborador?.Id) {
            hydrateJornadaSemanalEditor(colaborador.Id);
        } else {
            bindJornadaSemanalEditorEvents();
            jornadaMeta.loaded = true;
            updateJornadaSemanalSuggestionVisibility(false);
            setJornadaSemanalEditorTouched(false);
        }
    };

    window.abrirEditorColaborador = abrirEditorColaborador = async function abrirEditorColaboradorAtualizado(id) {
        return window.abrirEditorColaboradores(id);
    };

    window.salvarColaboradorEditor = salvarColaboradorEditor = async function salvarColaboradorEditorComSetor(id) {
        const nome = document.getElementById('editorNome')?.value?.trim();
        const setorId = document.getElementById('editorSetorId')?.value || null;
        const trabalhoInicio = document.getElementById('editorTrabInicio')?.value || null;
        const trabalhoFim = document.getElementById('editorTrabFim')?.value || null;
        const almocoInicio = document.getElementById('editorAlmInicio')?.value || null;
        const almocoFim = document.getElementById('editorAlmFim')?.value || null;
        const bancoHorasSaldoOriginal = (document.getElementById('editorBancoHorasSaldoOriginal')?.value || '').trim() || '+00:00';
        const bancoHorasHabilitado = document.querySelector('.banco-horas-editor-shell')?.dataset?.enabled !== 'false';
        let bancoHorasSaldo = bancoHorasSaldoOriginal;

        if (!nome) {
            mostrarToast('Nome e obrigatorio!', 'error');
            return;
        }

        if (!setorId) {
            mostrarToast('Selecione um setor para o colaborador.', 'warning');
            return;
        }

        if (bancoHorasHabilitado) {
            try {
                bancoHorasSaldo = obterSaldoBancoHorasEditorValue();
            } catch (error) {
                mostrarToast(error.message || 'Revise o saldo do banco de horas.', 'error');
                return;
            }
        }

        try {
            const metodo = id ? 'PUT' : 'POST';
            const url = id
                ? `http://localhost:3000/api/colaboradores/${id}`
                : 'http://localhost:3000/api/colaboradores';
            const jornadaMeta = getJornadaSemanalEditorMeta();
            const jornadaSemanal = collectJornadaSemanalPayloadFromEditor();
            const shouldSendJornadaSemanal = Boolean(
                jornadaMeta.touched
                || (!id && jornadaSemanal.length > 0)
            );
            const invalidJornadaDia = shouldSendJornadaSemanal
                ? jornadaSemanal.find((item) => !item.trabalhoInicio || !item.trabalhoFim)
                : null;
            const body = {
                nome,
                setorId,
                trabalhoInicio,
                trabalhoFim,
                almocoInicio,
                almocoFim
            };

            if (invalidJornadaDia) {
                const dayInfo = JORNADA_SEMANAL_DIAS.find((day) => Number(day.diaSemana) === Number(invalidJornadaDia.diaSemana));
                mostrarToast(`Preencha entrada e saida para ${dayInfo?.label || 'o dia selecionado'}.`, 'warning');
                return;
            }

            if (shouldSendJornadaSemanal) {
                body.jornadaSemanal = jornadaSemanal;
            }

            const response = await fetch(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || data?.message || 'Erro ao salvar');
            }

            const colaboradorId = Number(data?.data?.Id || data?.Id || id);

            if (
                bancoHorasHabilitado
                && bancoHorasSaldo !== bancoHorasSaldoOriginal
                && Number.isFinite(colaboradorId)
                && colaboradorId > 0
                && window.API?.atualizarBancoHorasSaldo
            ) {
                await window.API.atualizarBancoHorasSaldo(colaboradorId, {
                    saldo: bancoHorasSaldo
                });
            }

            await Promise.allSettled([
                typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
                carregarColaboradores(),
                typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
            ]);

            if (typeof renderListaColaboradores === 'function') {
                renderListaColaboradores();
            }

            if (typeof fecharColaboradorEditor === 'function') {
                fecharColaboradorEditor();
            }

            mostrarToast(
                id ? 'Colaborador atualizado!' : 'Colaborador salvo com sucesso!',
                'success'
            );
        } catch (error) {
            console.error('Erro ao salvar:', error);
            mostrarToast(error.message || 'Erro ao salvar colaborador', 'error');
        }
    };

    window.renderColaboradoresPlantao = renderColaboradoresPlantao = function renderColaboradoresPlantaoAvancado(colaboradoresIds) {
        if (!colaboradoresIds || colaboradoresIds.length === 0) {
            return '<span class="sem-colaboradores">Nenhum colaborador selecionado</span>';
        }

        return colaboradoresIds.map((id) => {
            const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));

            if (!colaborador) {
                return '';
            }

            const resumo = getBancoHorasResumoByColaborador(id);

            return `
                <span class="colaborador-tag">
                    <i class="fas fa-user"></i> ${escapeHtml(colaborador.Nome)}
                    ${resumo ? `<small>${escapeHtml(resumo.saldoFormatado)}</small>` : ''}
                </span>
            `;
        }).join('');
    };

    const PLANTAO_SABADOS_ANTERIORES = 8;
    const PLANTAO_SABADOS_POSTERIORES = 10;
    const PLANTAO_SABADOS_PASSO = 8;
    const PLANTAO_MESES_LABELS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    function criarDataLocalPlantao(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);

        if (!ano || !mes || !dia) {
            return new Date();
        }

        return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    }

    function formatarDataPlantaoCard(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-');
        return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
    }

    function formatarMesPlantaoCard(dataISO) {
        const [, mes] = String(dataISO || '').split('-').map(Number);
        return PLANTAO_MESES_LABELS[mes - 1] || '--';
    }

    function ajustarAncoraSabadoPlantao(referenciaISO) {
        const data = criarDataLocalPlantao(obterDataISO(referenciaISO) || obterDataISO(new Date()));

        if (data.getDay() === 0) {
            data.setDate(data.getDate() - 1);
        }

        while (data.getDay() !== 6) {
            data.setDate(data.getDate() + 1);
        }

        return obterDataISO(data);
    }

    function obterAncoraSabadoPlantao() {
        if (!window.__plantaoSabadoAncoraISO) {
            window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(new Date());
        }

        return window.__plantaoSabadoAncoraISO;
    }

    function definirAncoraSabadoPlantao(referenciaISO) {
        window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(referenciaISO);
        return window.__plantaoSabadoAncoraISO;
    }

    function mudarPaginaSabadosPlantao(passosEmSemanas) {
        const data = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        data.setDate(data.getDate() + (Number(passosEmSemanas) || 0) * 7);
        definirAncoraSabadoPlantao(obterDataISO(data));
    }

    function construirSabadosVisiveisPlantao() {
        const hojeISO = obterDataISO(new Date());
        const dataAncora = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || '');
        const sabados = [];

        for (let deslocamento = PLANTAO_SABADOS_ANTERIORES * -1; deslocamento <= PLANTAO_SABADOS_POSTERIORES; deslocamento += 1) {
            const data = new Date(dataAncora);
            data.setDate(data.getDate() + (deslocamento * 7));

            const dataISO = obterDataISO(data);
            const plantao = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO) || null;

            sabados.push({
                dataISO,
                formatada: formatarDataPlantaoCard(dataISO),
                dia: String(data.getDate()).padStart(2, '0'),
                mes: formatarMesPlantaoCard(dataISO),
                ano: data.getFullYear(),
                plantao,
                temPlantao: Boolean(plantao),
                isPast: dataISO < hojeISO,
                isToday: dataISO === hojeISO,
                isActive: dataFoco === dataISO,
                tipoLabel: 'Sabado'
            });
        }

        return sabados;
    }

    function renderSabadosPlantaoHistorico(items) {
        return items.map((sabado) => `
            <button
                type="button"
                class="sabado-card ${sabado.temPlantao ? 'lancado' : ''} ${sabado.isPast ? 'passado' : ''} ${sabado.isToday ? 'hoje' : ''} ${sabado.isActive ? 'is-active' : ''}"
                data-plantao-sabado="${sabado.dataISO}"
                onclick="abrirPlantaoPorData('${sabado.dataISO}')"
                title="${escapeHtml(sabado.formatada)}${sabado.temPlantao ? ' - Plantao ja lancado' : ''}"
            >
                <div class="sabado-card-badges">
                    ${sabado.temPlantao ? '<span class="badge-plantao">Lancado</span>' : ''}
                    ${sabado.isPast ? '<span class="badge-historico">Historico</span>' : ''}
                </div>
                <div class="sabado-dia">${escapeHtml(sabado.dia)}</div>
                <div class="sabado-mes">${escapeHtml(sabado.mes)}</div>
                <div class="sabado-ano">${escapeHtml(String(sabado.ano))}</div>
                <div class="sabado-tipo">${escapeHtml(sabado.tipoLabel || 'Sabado')}</div>
                <div class="sabado-status">${sabado.temPlantao ? 'Clique para editar' : 'Clique para lancar'}</div>
            </button>
        `).join('');
    }

    function atualizarSabadoSelecionadoPlantao(dataISO) {
        document.querySelectorAll('[data-plantao-sabado]').forEach((element) => {
            element.classList.toggle('is-active', element.getAttribute('data-plantao-sabado') === dataISO);
        });
    }

    async function openPlantaoEditorFromGrid(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized || typeof window.abrirEditorPlantao !== 'function') {
            return;
        }

        await window.abrirEditorPlantao(normalized, formatarDataPlantaoCard(normalized));
    }

    function resolvePlantaoWeekdayEscala(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function isPlantaoSabadoEscala(dataISO) {
        return Boolean(obterDataISO(dataISO)) && resolvePlantaoWeekdayEscala(dataISO) === 6;
    }

    window.abrirPlantaoPorData = abrirPlantaoPorData = function abrirPlantaoPorDataAtualizado(dataISO) {
        return openPlantaoEditorFromGrid(dataISO);
    };

    function atualizarResumoPlantaoNaTela() {
        const container = document.getElementById('listaPlantoesLancados');

        if (!container || typeof renderPlantoesLancados !== 'function') {
            return;
        }

        container.innerHTML = renderPlantoesLancados();
    }

    if (typeof renderPlantoesLancados === 'function') {
        window.renderPlantoesLancados = renderPlantoesLancados = function renderPlantoesLancadosAvancado() {
            if (!window.plantoesLancados || window.plantoesLancados.length === 0) {
                return '<div class="empty-state">Nenhum plantao lancado ainda</div>';
            }

            const ordenados = [...window.plantoesLancados]
                .filter((plantao) => plantao.tipoPlantao === 'sabado' || isPlantaoSabadoEscala(plantao.dataISO))
                .sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));

            if (ordenados.length === 0) {
                return '<div class="empty-state">Nenhum plantao de sabado lancado ainda</div>';
            }

            return ordenados.map((plantao) => `
                <div class="plantao-card">
                    <div class="plantao-header">
                        <div>
                            <div class="plantao-data">${escapeHtml(formatarDataPtBr(plantao.dataISO))}</div>
                            <div class="plantao-meta">
                                <span><i class="fas fa-calendar-week"></i> ${escapeHtml((plantao.tipoPlantao || 'sabado').charAt(0).toUpperCase() + (plantao.tipoPlantao || 'sabado').slice(1))}</span>
                                <span><i class="fas fa-clock"></i> ${escapeHtml(formatarHoraInput(plantao.horaInicio) || '--:--')} - ${escapeHtml(formatarHoraInput(plantao.horaFim) || '--:--')}</span>
                                <span><i class="fas fa-wallet"></i> ${escapeHtml(plantao.duracaoFormatada || (plantao.horaInicio && plantao.horaFim ? minutosParaTexto((((Number(plantao.horaFim.slice(0, 2)) * 60) + Number(plantao.horaFim.slice(3, 5))) - ((Number(plantao.horaInicio.slice(0, 2)) * 60) + Number(plantao.horaInicio.slice(3, 5))))) : 'Horario pendente'))}</span>
                            </div>
                        </div>
                        <div class="plantao-actions">
                            <button onclick="editarPlantao('${plantao.dataISO}')" class="btn-icon-sm edit" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="excluirPlantao('${plantao.dataISO}')" class="btn-icon-sm delete" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${plantao.observacao ? `<p class="plantao-observacao">${escapeHtml(plantao.observacao)}</p>` : ''}
                    <div class="plantao-colaboradores">
                        ${renderColaboradoresPlantao(plantao.colaboradores)}
                    </div>
                </div>
            `).join('');
        };
    }

    window.carregarPlantoesLancadosNaTela = carregarPlantoesLancadosNaTela = function carregarPlantoesLancadosNaTelaAtualizado() {
        atualizarResumoPlantaoNaTela();
    };

    window.renderLancamentoPlantao = renderLancamentoPlantao = async function renderLancamentoPlantaoAtualizado() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([]),
            typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
        ]);

        window.plantoesLancados = (window.plantoesLancados || []).filter((plantao) => isPlantaoSabadoEscala(plantao.dataISO));

        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || getPlantaoEditorState()?.dataISO || '');
        definirAncoraSabadoPlantao(dataFoco || obterAncoraSabadoPlantao());

        const sabados = construirSabadosVisiveisPlantao();
        const primeiraData = sabados[0]?.formatada || '--';
        const ultimaData = sabados[sabados.length - 1]?.formatada || '--';

        appContent.innerHTML = `
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-calendar-plus"></i> Plantoes de sabado</h1>
                    <p>Consulte os plantões de sabado, abra um registro existente para editar e mantenha o mesmo lancamento atualizado.</p>
                </div>
            </div>

            <div class="plantao-layout">
                <div class="sabados-container">
                    <div class="sabados-header">
                        <div>
                            <h3><i class="fas fa-calendar-day"></i> Sabados disponiveis</h3>
                            <p class="sabados-subtitle">Janela atual: ${escapeHtml(primeiraData)} ate ${escapeHtml(ultimaData)}</p>
                        </div>
                        <div class="sabados-nav">
                            <button type="button" class="btn-secondary" id="plantaoAnteriorBtn">
                                <i class="fas fa-arrow-left"></i> Anteriores
                            </button>
                            <button type="button" class="btn-secondary" id="plantaoHojeBtn">
                                <i class="fas fa-bullseye"></i> Atual
                            </button>
                            <button type="button" class="btn-secondary" id="plantaoProximoBtn">
                                Proximos <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>

                    <div class="sabados-grid" id="listaSabados">
                        ${renderSabadosPlantaoHistorico(sabados)}
                    </div>
                </div>

                <div id="plantaoEditor" class="editor-sidebar" style="display: none;">
                    <div class="editor-content">
                        <div class="editor-header">
                            <h3><i class="fas fa-clock"></i> <span id="plantaoDataTitle">Selecione um sabado</span></h3>
                            <button onclick="fecharPlantaoEditor()" class="btn-close-editor">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="plantaoEditorContent" class="editor-form">
                            <div class="editor-empty">
                                <i class="fas fa-hand-pointer"></i>
                                <p>Escolha um sabado para abrir o plantao, revisar a equipe e salvar sem duplicar o lancamento.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="plantoes-lancados-container">
                <div class="plantoes-lancados-header">
                    <div>
                        <h3><i class="fas fa-list"></i> Plantoes lancados</h3>
                        <p class="sabados-subtitle">Edite sabados anteriores diretamente por esta lista quando preferir.</p>
                    </div>
                </div>
                <div id="listaPlantoesLancados" class="plantoes-grid">
                    ${renderPlantoesLancados()}
                </div>
            </div>
        `;

        document.getElementById('plantaoAnteriorBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO * -1);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoHojeBtn')?.addEventListener('click', () => {
            definirAncoraSabadoPlantao(new Date());
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoProximoBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('listaSabados')?.addEventListener('click', async (event) => {
            const trigger = event.target.closest('[data-plantao-sabado]');

            if (!trigger) {
                return;
            }

            const dataISO = trigger.getAttribute('data-plantao-sabado');
            await openPlantaoEditorFromGrid(dataISO);
        });

        if (dataFoco) {
            await openPlantaoEditorFromGrid(dataFoco);
        } else {
            const editorPanel = document.getElementById('plantaoEditor');

            setPlantaoEditorState(null);

            if (editorPanel) {
                editorPanel.style.display = 'none';
            }
        }
    };

    window.abrirEditorPlantao = abrirEditorPlantao = async function abrirEditorPlantaoAvancado(dataISO, dataFormatada) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            window.__plantaoDataFocoISO = dataISO;

            if (typeof renderLancamentoPlantao === 'function') {
                await renderLancamentoPlantao();
            }

            return;
        }

        window.__plantaoDataFocoISO = dataISO;
        definirAncoraSabadoPlantao(dataISO);
        atualizarSabadoSelecionadoPlantao(dataISO);

        const existente = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO);

        if (!isPlantaoSabadoEscala(dataISO)) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Plantao agora e lancado somente aos sabados.', 'warning');
            }
            return;
        }

        const state = setPlantaoEditorState({
            dataISO,
            dataFormatada,
            tipoPlantao: 'sabado',
            horaInicio: existente?.horaInicio ? formatarHoraInput(existente.horaInicio) : '',
            horaFim: existente?.horaFim ? formatarHoraInput(existente.horaFim) : '',
            observacao: existente?.observacao || '',
            selecionados: Array.isArray(existente?.colaboradores) ? [...existente.colaboradores] : [],
            disponibilidade: []
        });

        renderPlantaoEditor(state);
        await carregarDisponibilidadePlantao(state);
        renderPlantaoEditor(state);
        atualizarSabadoSelecionadoPlantao(dataISO);
    };

    window.fecharPlantaoEditor = fecharPlantaoEditor = function fecharPlantaoEditorAtualizado() {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorContent = document.getElementById('plantaoEditorContent');

        window.__plantaoDataFocoISO = null;
        setPlantaoEditorState(null);
        atualizarSabadoSelecionadoPlantao(null);

        if (editorContent) {
            editorContent.innerHTML = `
                <div class="editor-empty">
                    <i class="fas fa-hand-pointer"></i>
                    <p>Escolha um sabado para abrir o plantao, revisar a equipe e salvar sem duplicar o lancamento.</p>
                </div>
            `;
        }

        if (editorPanel) {
            editorPanel.style.display = 'none';
        }
    };

    window.salvarPlantao = salvarPlantao = async function salvarPlantaoAvancado(dataISO) {
        const tipoPlantao = 'sabado';
        const horaInicio = document.getElementById('plantaoHoraInicio')?.value;
        const horaFim = document.getElementById('plantaoHoraFim')?.value;
        const observacao = document.getElementById('plantaoObservacao')?.value || '';
        const selecionados = Array.from(document.querySelectorAll('#checklistColaboradores input:checked'))
            .map((checkbox) => Number(checkbox.value));

        if (!horaInicio || !horaFim) {
            mostrarToast('Informe a hora inicial e final do plantao.', 'error');
            return;
        }

        if (horaFim <= horaInicio) {
            mostrarToast('A hora final precisa ser maior que a hora inicial.', 'error');
            return;
        }

        if (selecionados.length === 0) {
            mostrarToast('Selecione pelo menos um colaborador disponivel.', 'error');
            return;
        }

        if (!isPlantaoSabadoEscala(dataISO)) {
            mostrarToast('Plantao agora e lancado somente aos sabados.', 'warning');
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.salvarPlantao({
                dataISO,
                tipoPlantao,
                horaInicio,
                horaFim,
                observacao,
                colaboradores: selecionados
            });

            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao salvo com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao salvar plantao: ${error.message}`, 'error');
        }
    };

    window.excluirPlantao = excluirPlantao = async function excluirPlantaoAvancado(dataISO) {
        if (!window.confirm('Tem certeza que deseja excluir este plantao?')) {
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.excluirPlantao(dataISO);
            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao excluido com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao excluir plantao: ${error.message}`, 'error');
        }
    };

    if (typeof editarLancamento === 'function') {
        const originalEditarLancamento = editarLancamento;

        window.editarLancamento = editarLancamento = function editarLancamentoComBancoHoras(tipo, id) {
            originalEditarLancamento(tipo, id);

            if (tipo === 'feriado') {
                aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
                return;
            }

            const item = (window.ausencias || []).find((ausencia) => Number(ausencia.id || ausencia.Id) === Number(id));

            if (!item) {
                return;
            }

            preencherBancoHorasLancamento(item);
        };
    }

    if (typeof cancelarEdicaoLancamento === 'function') {
        const originalCancelarEdicaoLancamento = cancelarEdicaoLancamento;

        window.cancelarEdicaoLancamento = cancelarEdicaoLancamento = function cancelarEdicaoLancamentoComBancoHoras() {
            originalCancelarEdicaoLancamento();
            resetBancoHorasLancamento();
        };
    }

    window.salvarAusencia = salvarAusencia = async function salvarAusenciaComBancoHoras(tipo, dataInicio, dataFim) {
        const colaboradorId = document.getElementById('colaboradorSelect')?.value;
        const periodoTipo = document.getElementById('periodoTipo')?.value || 'dia_inteiro';
        const horaInicio = document.getElementById('horaInicio')?.value || '';
        const horaFim = document.getElementById('horaFim')?.value || '';
        const subtipo = document.getElementById('ausenciaSubtipo')?.value || 'comum';
        const descontaBancoHoras = document.getElementById('descontaBancoHoras')?.checked ?? true;
        const observacao = document.getElementById('observacaoLancamento')?.value || '';

        if (!colaboradorId) {
            throw new Error('Selecione um colaborador.');
        }

        if (periodoTipo === 'horas') {
            if (!horaInicio || !horaFim) {
                throw new Error('Preencha as horas de inicio e fim.');
            }

            if (horaFim <= horaInicio) {
                throw new Error('Hora final deve ser maior que a hora inicial.');
            }
        }

        const dados = {
            id: editandoTipoLancamento === 'pessoal' ? editandoLancamentoId : undefined,
            colaboradorId: Number(colaboradorId),
            tipo,
            dataInicio,
            dataFim,
            periodoTipo,
            subtipo,
            descontaBancoHoras,
            observacao
        };

        if (periodoTipo === 'horas') {
            dados.horaInicio = horaInicio;
            dados.horaFim = horaFim;
        }

        return window.API.salvarAusencia(dados);
    };

    document.addEventListener('click', (event) => {
        if (event.target.closest('#fecharModalBancoHorasBtn')) {
            fecharModalSeguro('modalBancoHoras');
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target.id === 'tipoLancamento') {
            aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
        }

        if (event.target.id === 'ausenciaSubtipo') {
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }

        if (event.target.id === 'descontaBancoHoras') {
            event.target.dataset.manualOverride = 'true';
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }
    });

    const atualizarTudoBase = window.atualizarTudo;

    window.atualizarTudo = atualizarTudo = async function atualizarTudoComBancoHoras(options = {}) {
        if (typeof atualizarTudoBase === 'function') {
            await atualizarTudoBase({ ...options, silent: true });
        }

        await Promise.allSettled([
            carregarBancoHorasResumo()
        ]);

        if (document.getElementById('listaColaboradores') && typeof renderListaColaboradores === 'function') {
            const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
            const lista = termoBusca
                ? (window.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
                : (window.colaboradores || []);

            renderListaColaboradores(lista);
        }

        if (document.getElementById('listaPlantoesLancados') && typeof carregarPlantoesLancadosNaTela === 'function') {
            carregarPlantoesLancadosNaTela();
        }

        if (!options.silent && typeof mostrarToast === 'function') {
            mostrarToast('Dados atualizados!', 'success');
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        carregarBancoHorasResumo()
            .then(() => {
                if (isColaboradoresScreenVisible() && typeof renderListaColaboradores === 'function') {
                    renderListaColaboradores();
                }
            })
            .catch(() => {});
    });

    setTimeout(() => {
        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }, 0);
})();

(function () {
    if (window.__escalaDiaUiFixLoaded) {
        return;
    }

    window.__escalaDiaUiFixLoaded = true;

    const HORA_INICIAL = 7;
    const HORA_FINAL = 18;
    const ESCALA_EDITOR_MINUTO_INICIAL = 6 * 60;
    const ESCALA_EDITOR_MINUTO_FINAL = 22 * 60;
    const ESCALA_EDITOR_PASSO_MINUTOS = 15;
    const ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS = 60;
    const DIA_LABELS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
    const TIPO_LABELS = {
        normal: 'Normal',
        plantao: 'Plantao',
        folga: 'Folga',
        ferias: 'Ferias',
        ausencia: 'Ausencia',
        ajuste: 'Ajuste'
    };
    const RELATORIO_ESCALA_MODOS = {
        QUADRO_MENSAL: 'quadro_mensal',
        DETALHADO: 'detalhado'
    };
    const MESES_LABELS = [
        'Janeiro',
        'Fevereiro',
        'Marco',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro'
    ];
    const ESCALA_QUADRO_WEEKDAY_HEADERS = [
        'SEGUNDA-FEIRA',
        'TERCA-FEIRA',
        'QUARTA-FEIRA',
        'QUINTA-FEIRA',
        'SEXTA-FEIRA',
        'SABADO',
        'DOMINGO'
    ];

    function buildEscalaMonthOptions(selectedMonth) {
        return MESES_LABELS.map((label, index) => {
            const month = index + 1;
            const selected = month === Number(selectedMonth) ? 'selected' : '';
            return `<option value="${month}" ${selected}>${label}</option>`;
        }).join('');
    }

    function escapeHtmlEscala(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function toISODateEscala(value) {
        if (!value) {
            return null;
        }

        if (typeof value === 'string') {
            return value.includes('T') ? value.split('T')[0] : value;
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const isUtcMidnight = date.getUTCHours() === 0
            && date.getUTCMinutes() === 0
            && date.getUTCSeconds() === 0
            && date.getUTCMilliseconds() === 0;
        const isLocalMidnight = date.getHours() === 0
            && date.getMinutes() === 0
            && date.getSeconds() === 0
            && date.getMilliseconds() === 0;
        const useUtcDate = isUtcMidnight && !isLocalMidnight;
        const year = useUtcDate ? date.getUTCFullYear() : date.getFullYear();
        const month = String((useUtcDate ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
        const day = String(useUtcDate ? date.getUTCDate() : date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatDatePtBrEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (!normalized) {
            return '--';
        }

        const [year, month, day] = normalized.split('-');
        return `${day}/${month}/${year}`;
    }

    function formatTimeInputEscala(value) {
        if (!value) {
            return '';
        }

        const raw = String(value);

        if (raw.includes('T')) {
            const match = raw.match(/T(\d{2}:\d{2})/);
            return match ? match[1] : '';
        }

        return raw.includes(':') ? raw.slice(0, 5) : '';
    }

    function formatTimeRangeEscala(inicio, fim) {
        const formattedStart = formatTimeInputEscala(inicio);
        const formattedEnd = formatTimeInputEscala(fim);

        if (!formattedStart || !formattedEnd) {
            return '--';
        }

        return `${formattedStart} às ${formattedEnd}`;
    }

    function getTimeMinutesEscala(value) {
        const formatted = formatTimeInputEscala(value);

        if (!formatted) {
            return null;
        }

        const [hours, minutes] = formatted.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    function formatMinutesToTimeEscala(totalMinutes) {
        if (!Number.isFinite(totalMinutes)) {
            return '';
        }

        const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
        const hours = String(Math.floor(safeMinutes / 60)).padStart(2, '0');
        const minutes = String(safeMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function clampMinutesEscala(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function roundMinutesEscala(value, step = ESCALA_EDITOR_PASSO_MINUTOS) {
        if (!Number.isFinite(value)) {
            return value;
        }

        return Math.round(value / step) * step;
    }

    function formatDurationEscala(totalMinutes) {
        const safeMinutes = Math.max(Number(totalMinutes) || 0, 0);
        const hours = Math.floor(safeMinutes / 60);
        const minutes = safeMinutes % 60;

        if (minutes === 0) {
            return `${hours}h`;
        }

        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }

    function getIsoDayOfWeekEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function getDayLabelEscala(dataISO) {
        return DIA_LABELS[getIsoDayOfWeekEscala(dataISO)] || '';
    }

    function getMonthBoundsEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const [year, month] = normalized.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();

        return {
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        };
    }

    function getEscalaReportMode() {
        return document.getElementById('relatorioEscalaModo')?.value || RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;
    }

    function toggleEscalaReportModeFilters() {
        const currentMode = getEscalaReportMode();

        document.querySelectorAll('[data-escala-report-mode]').forEach((section) => {
            section.classList.toggle('is-active', section.dataset.escalaReportMode === currentMode);
        });
    }

    function getEscalaMonthlyFilters() {
        const month = parseInt(document.getElementById('relatorioEscalaMes')?.value, 10);
        const year = parseInt(document.getElementById('relatorioEscalaAno')?.value, 10);

        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2035) {
            return null;
        }

        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const bounds = getMonthBoundsEscala(start);
        const setorId = getRelatorioEscalaSetorId();

        return {
            month,
            year,
            dataInicio: bounds.start,
            dataFim: bounds.end,
            setorId,
            setorNome: getRelatorioEscalaSetorNome(setorId)
        };
    }

    function getEscalaCalendarSlots(boardUtils, days) {
        if (boardUtils && typeof boardUtils.buildEscalaQuadroCalendarSlots === 'function') {
            return boardUtils.buildEscalaQuadroCalendarSlots(days);
        }

        return Array.isArray(days) ? days : [];
    }

    function getEscalaCalendarWeeks(boardUtils, days) {
        if (boardUtils && typeof boardUtils.buildEscalaQuadroCalendarWeeks === 'function') {
            return boardUtils.buildEscalaQuadroCalendarWeeks(days);
        }

        const slots = getEscalaCalendarSlots(boardUtils, days);
        const weeks = [];

        for (let index = 0; index < slots.length; index += 7) {
            weeks.push(slots.slice(index, index + 7));
        }

        return weeks.length > 0 ? weeks : [Array(7).fill(null)];
    }

    function formatEscalaMonthHeading(month, year) {
        const label = String(MESES_LABELS[Number(month) - 1] || month).toUpperCase();
        return `${label} DE ${year}`;
    }

    function renderEscalaQuadroDayCard(day, options = {}) {
        if (!day) {
            const placeholderClassName = options.placeholderClassName || 'escala-quadro-dia-placeholder';
            return `<article class="${placeholderClassName}" aria-hidden="true"></article>`;
        }

        const emptyClassName = day.hasScale ? '' : ' is-empty';
        const titleAttribute = day.dayLabel ? ` title="${escapeHtmlEscala(day.dayLabel)}"` : '';

        return `
            <article class="escala-quadro-dia${emptyClassName}">
                <div class="escala-quadro-dia-header"${titleAttribute}>
                    ${escapeHtmlEscala(day.dateLabel)}
                </div>
                <table class="escala-quadro-tabela">
                    <thead>
                        <tr>
                            <th>Almoco</th>
                            <th>Colaborador</th>
                            <th>Jornada</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${day.hasScale ? day.rows.map((row) => `
                            <tr>
                                ${row.showAlmoco ? `<td rowspan="${row.almocoRowspan}" class="escala-quadro-grupo">${escapeHtmlEscala(row.almocoLabel)}</td>` : ''}
                                <td>${escapeHtmlEscala(row.colaboradorNome)}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan}" class="escala-quadro-grupo">${escapeHtmlEscala(row.jornadaLabel)}</td>` : ''}
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="3" class="escala-quadro-sem-escala">Sem escala</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </article>
        `;
    }

    function renderEscalaQuadroCalendarTable(weeks, options = {}) {
        const normalizedWeeks = Array.isArray(weeks) && weeks.length > 0
            ? weeks.map((week) => Array.from({ length: 7 }, (_, index) => week?.[index] || null))
            : [Array(7).fill(null)];
        const wrapperClassName = options.wrapperClassName || 'escala-quadro-calendario';
        const titleClassName = options.titleClassName || 'escala-quadro-calendario-titulo';
        const tableClassName = options.tableClassName || 'escala-quadro-calendario-tabela';
        const cellClassName = options.cellClassName || 'escala-quadro-calendario-celula';
        const denseClassName = normalizedWeeks.length >= 6 ? ' is-dense' : '';
        const titleHtml = options.heading
            ? `<div class="${titleClassName}">${escapeHtmlEscala(options.heading)}</div>`
            : '';

        return `
            <div class="${wrapperClassName}${denseClassName}">
                ${titleHtml}
                <div class="escala-quadro-calendario-scroll">
                    <table class="${tableClassName}${denseClassName}">
                        <thead>
                            <tr>
                                ${ESCALA_QUADRO_WEEKDAY_HEADERS.map((label) => `<th scope="col">${escapeHtmlEscala(label)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${normalizedWeeks.map((week) => `
                                <tr>
                                    ${week.map((day) => `
                                        <td class="${cellClassName}${day ? '' : ' is-empty'}">
                                            ${day ? renderEscalaQuadroDayCard(day) : ''}
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function getEscalaSetorNome(item) {
        const nome = item?.setorNome ?? item?.SetorNome ?? item?.setor ?? item?.Setor;
        const normalized = String(nome ?? '').trim();
        return normalized || 'Sem setor';
    }

    function getEscalaSetorKey(item) {
        const id = item?.setorId ?? item?.SetorId;

        if (id !== undefined && id !== null && String(id).trim() !== '') {
            return `id:${String(id).trim()}`;
        }

        return `nome:${getEscalaSetorNome(item).toLowerCase()}`;
    }

    function groupEscalaItemsBySetor(items, options = {}) {
        const source = Array.isArray(items) ? items : [];
        const groups = new Map();

        source.forEach((item) => {
            const key = getEscalaSetorKey(item);

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    setorNome: getEscalaSetorNome(item),
                    items: []
                });
            }

            groups.get(key).items.push(item);
        });

        const result = [...groups.values()].sort((first, second) => (
            first.setorNome.localeCompare(second.setorNome, 'pt-BR', { sensitivity: 'base' })
        ));

        if (result.length === 0 && options.includeEmpty) {
            return [{
                key: 'sem-setor',
                setorNome: 'Sem setor',
                items: []
            }];
        }

        return result;
    }

    function normalizeEscalaReportItems(items) {
        return (Array.isArray(items) ? items : []).map((item) => ({
            ...item,
            tipo: window.normalizeRuntimeEscalaTipo(item.tipo || item.Tipo || 'normal'),
            setorNome: getEscalaSetorNome(item)
        }));
    }

    function renderMonthlyEscalaReport(items, filters) {
        const boardUtils = window.EscalaReportUtils;

        if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Os utilitarios do quadro mensal nao foram carregados.</p>
                </div>
            `;
        }

        const normalizedItems = normalizeEscalaReportItems(items);
        const setorGroups = groupEscalaItemsBySetor(normalizedItems, { includeEmpty: true }).map((group) => {
            const days = boardUtils.buildEscalaQuadroMensal(group.items, {
                month: filters.month,
                year: filters.year
            });

            return {
                ...group,
                days,
                calendarSlots: getEscalaCalendarSlots(boardUtils, days),
                daysWithScale: days.filter((day) => day.hasScale).length,
                totalRows: days.reduce((sum, day) => sum + day.rows.length, 0)
            };
        });
        const daysWithScale = setorGroups.reduce((sum, group) => sum + group.daysWithScale, 0);
        const totalRows = setorGroups.reduce((sum, group) => sum + group.totalRows, 0);

        return `
            <div class="escala-quadro-mensal">
                ${renderRelatorioEscalaFiltrosAtivos(filters)}
                <div class="relatorio-total" hidden>
                    Mes: <strong>${escapeHtmlEscala(MESES_LABELS[filters.month - 1] || filters.month)}/${escapeHtmlEscala(filters.year)}</strong>
                    • Setores: <strong>${setorGroups.length}</strong>
                    • Dias com escala: <strong>${daysWithScale}</strong>
                    • Linhas listadas: <strong>${totalRows}</strong>
                </div>
                ${setorGroups.map((group) => `
                    <section class="relatorio-setor-section">
                        <div class="relatorio-setor-header">
                            <span><i class="fas fa-layer-group"></i> ${escapeHtmlEscala(group.setorNome)}</span>
                            <strong>${group.totalRows} registro(s)</strong>
                        </div>
                        <div class="escala-quadro-grid escala-quadro-grid-calendario">
                            ${group.calendarSlots.map((day) => renderEscalaQuadroDayCard(day)).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
        `;
    }

    function getCurrentScaleState() {
        return window.__escalaDiaState || {
            dataISO: toISODateEscala(new Date()),
            items: []
        };
    }

    function setCurrentScaleState(state) {
        window.__escalaDiaState = state;
        return state;
    }

    function getScaleHourBoundsEscala(items = getCurrentScaleState().items || []) {
        let earliestMinutes = null;
        let latestMinutes = null;

        const includeCandidate = (value) => {
            if (!Number.isFinite(value)) {
                return;
            }

            earliestMinutes = earliestMinutes === null ? value : Math.min(earliestMinutes, value);
            latestMinutes = latestMinutes === null ? value : Math.max(latestMinutes, value);
        };

        (items || []).forEach((item) => {
            const workStart = getTimeMinutesEscala(item?.horaInicio);
            const workEnd = getTimeMinutesEscala(item?.horaFim);

            if (workStart !== null && workEnd !== null && workEnd > workStart) {
                includeCandidate(workStart);
                includeCandidate(workEnd);
                includeCandidate(getTimeMinutesEscala(item?.almocoInicio));
                includeCandidate(getTimeMinutesEscala(item?.almocoFim));
            }
        });

        if (earliestMinutes === null || latestMinutes === null) {
            earliestMinutes = HORA_INICIAL * 60;
            latestMinutes = HORA_FINAL * 60;
        }

        const startHour = Math.max(0, Math.floor(earliestMinutes / 60));
        const endHour = Math.min(23, Math.ceil(latestMinutes / 60));

        return {
            startHour,
            endHour: Math.max(startHour, endHour),
            columnCount: Math.max(1, (Math.max(startHour, endHour) - startHour) + 1)
        };
    }

    function applyScaleHourBoundsCssEscala(items = getCurrentScaleState().items || []) {
        const escalaPage = document.querySelector('.escala-page');
        const bounds = getScaleHourBoundsEscala(items);

        if (escalaPage) {
            escalaPage.style.setProperty('--escala-hour-columns', String(bounds.columnCount));
        }

        return bounds;
    }

    function getScaleSortModeEscala() {
        return window.__escalaSortMode || 'alpha';
    }

    function setScaleSortModeEscala(value) {
        const allowedModes = ['alpha', 'work_start', 'lunch_start', 'lunch_end'];
        const normalized = allowedModes.includes(String(value || '').trim()) ? value : 'alpha';
        window.__escalaSortMode = normalized;

        const select = document.getElementById('escalaSortMode');
        if (select && select.value !== normalized) {
            select.value = normalized;
        }

        return normalized;
    }

    function getScaleSectorFilterEscala() {
        return window.__escalaSectorFilterId || 'all';
    }

    function setScaleSectorFilterEscala(value) {
        const normalized = value === 'all' || !value ? 'all' : String(value);
        window.__escalaSectorFilterId = normalized;
        return normalized;
    }

    function buildScaleSectorFiltersEscala(items = []) {
        const dynamicMap = new Map();

        (window.setores || []).forEach((setor) => {
            dynamicMap.set(String(setor.id), {
                id: String(setor.id),
                nome: setor.nome
            });
        });

        (items || []).forEach((item) => {
            if (item.setorId && item.setorNome && !dynamicMap.has(String(item.setorId))) {
                dynamicMap.set(String(item.setorId), {
                    id: String(item.setorId),
                    nome: item.setorNome
                });
            }
        });

        return [
            { id: 'all', nome: 'Todos' },
            ...Array.from(dynamicMap.values()).sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || '')))
        ];
    }

    function filterScaleItemsBySectorEscala(items = []) {
        const filterId = getScaleSectorFilterEscala();

        if (filterId === 'all') {
            return [...items];
        }

        return (items || []).filter((item) => String(item.setorId || '') === String(filterId));
    }

    function renderScaleSectorTabsEscala(items = []) {
        const container = document.getElementById('escalaSectorTabs');

        if (!container) {
            return;
        }

        const currentFilter = getScaleSectorFilterEscala();
        const filters = buildScaleSectorFiltersEscala(items);
        const hasCurrentFilter = filters.some((item) => String(item.id) === String(currentFilter));
        const safeFilter = hasCurrentFilter ? currentFilter : 'all';

        if (!hasCurrentFilter) {
            setScaleSectorFilterEscala(safeFilter);
        }

        container.innerHTML = filters.map((setor) => `
            <button
                type="button"
                class="escala-sector-tab ${String(setor.id) === String(safeFilter) ? 'is-active' : ''}"
                data-escala-setor="${escapeHtmlEscala(String(setor.id))}"
            >
                ${escapeHtmlEscala(setor.nome)}
            </button>
        `).join('');

        container.querySelectorAll('[data-escala-setor]').forEach((button) => {
            button.addEventListener('click', () => {
                setScaleSectorFilterEscala(button.getAttribute('data-escala-setor'));
                renderScaleSectorTabsEscala(getCurrentScaleState().items || []);
                renderScaleRowsEscala(getCurrentScaleState());
            });
        });
    }

    function getSortableMinutesEscala(value) {
        const minutes = getTimeMinutesEscala(value);
        return minutes === null ? Number.POSITIVE_INFINITY : minutes;
    }

    function compareScaleRecordsEscala(first, second) {
        const sortMode = getScaleSortModeEscala();
        const nameA = String(first.colaboradorNome || '').toLowerCase();
        const nameB = String(second.colaboradorNome || '').toLowerCase();

        if (sortMode === 'work_start') {
            const diff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return diff || nameA.localeCompare(nameB);
        }

        if (sortMode === 'lunch_start') {
            const diff = getSortableMinutesEscala(first.almocoInicio) - getSortableMinutesEscala(second.almocoInicio);
            if (diff) {
                return diff;
            }

            const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return workDiff || nameA.localeCompare(nameB);
        }

        if (sortMode === 'lunch_end') {
            const diff = getSortableMinutesEscala(first.almocoFim) - getSortableMinutesEscala(second.almocoFim);
            if (diff) {
                return diff;
            }

            const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return workDiff || nameA.localeCompare(nameB);
        }

        return nameA.localeCompare(nameB);
    }

    function isFullDayOffEscala(record) {
        return ['folga', 'ferias', 'ausencia'].includes(String(record?.tipo || '').toLowerCase())
            && !getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
    }

    function getPartialAbsenceEscala(colaboradorId, dataISO) {
        const normalizedDate = toISODateEscala(dataISO);

        return (window.ausencias || []).find((item) => {
            const itemColaboradorId = Number(item.colaboradorId || item.ColaboradorId);
            const periodoTipo = String(item.periodoTipo || item.PeriodoTipo || 'dia_inteiro').toLowerCase();
            const inicio = toISODateEscala(item.DataInicio || item.dataInicio);
            const fim = toISODateEscala(item.DataFim || item.dataFim);

            return itemColaboradorId === Number(colaboradorId)
                && periodoTipo === 'horas'
                && inicio
                && fim
                && normalizedDate >= inicio
                && normalizedDate <= fim;
        }) || null;
    }

    function getIntervalOverlapMinutesEscala(start, end, targetStart, targetEnd) {
        if (![start, end, targetStart, targetEnd].every(Number.isFinite) || end <= start || targetEnd <= targetStart) {
            return 0;
        }

        return Math.max(Math.min(end, targetEnd) - Math.max(start, targetStart), 0);
    }

    function getClampedIntervalEscala(start, end, min, max) {
        if (![start, end, min, max].every(Number.isFinite) || end <= start || max <= min) {
            return null;
        }

        const clampedStart = Math.max(start, min);
        const clampedEnd = Math.min(end, max);

        if (clampedEnd <= clampedStart) {
            return null;
        }

        return {
            start: clampedStart,
            end: clampedEnd
        };
    }

    function mergeIntervalsEscala(intervals) {
        const sorted = intervals
            .filter(Boolean)
            .sort((first, second) => first.start - second.start || first.end - second.end);
        const merged = [];

        sorted.forEach((interval) => {
            const previous = merged[merged.length - 1];

            if (!previous || interval.start > previous.end) {
                merged.push({ ...interval });
                return;
            }

            previous.end = Math.max(previous.end, interval.end);
        });

        return merged;
    }

    function hasCellClassEscala(className, expectedClass) {
        return String(className || '').split(/\s+/).includes(expectedClass);
    }

    function calculateWorkedMinutesEscala(record) {
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);

        if (start === null || end === null || isFullDayOffEscala(record)) {
            return 0;
        }

        const total = Math.max(end - start, 0);
        const blockedIntervals = [];
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            blockedIntervals.push(getClampedIntervalEscala(lunchStart, lunchEnd, start, end));
        }

        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
            blockedIntervals.push(getClampedIntervalEscala(absenceStart, absenceEnd, start, end));
        }

        const blockedMinutes = mergeIntervalsEscala(blockedIntervals)
            .reduce((sum, interval) => sum + Math.max(interval.end - interval.start, 0), 0);

        return Math.max(total - blockedMinutes, 0);
    }

    function getColaboradorCadastroEscala(colaboradorId) {
        return (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId)) || null;
    }

    function getDefaultLunchRangeEscala(colaboradorId) {
        const colaborador = getColaboradorCadastroEscala(colaboradorId);
        const start = getTimeMinutesEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
        const end = getTimeMinutesEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

        if (start === null || end === null || end <= start) {
            return null;
        }

        return { start, end };
    }

    function isSameLunchAsCadastroEscala(colaboradorId, almocoInicio, almocoFim) {
        const colaborador = getColaboradorCadastroEscala(colaboradorId);
        const cadastroInicio = formatTimeInputEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
        const cadastroFim = formatTimeInputEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

        return cadastroInicio === formatTimeInputEscala(almocoInicio)
            && cadastroFim === formatTimeInputEscala(almocoFim);
    }

    function getCellStateEscala(record, hour) {
        const tipo = window.normalizeRuntimeEscalaTipo(record.tipo || '');
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        const defaultLunch = getDefaultLunchRangeEscala(record.colaboradorId);
        const adjustedLunch = Boolean(record.almocoPersonalizado || record.almocoAjustado);
        const currentHourStart = hour * 60;
        const currentHourEnd = (hour + 1) * 60;
        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (tipo === 'ferias' && !partialAbsence) {
            return { className: 'ferias', status: 'Ferias' };
        }

        if (tipo === 'folga' && !partialAbsence) {
            return { className: 'folga', status: 'Folga' };
        }

        if (tipo === 'ausencia' && !partialAbsence) {
            return { className: 'ausencia', status: 'Ausencia' };
        }

        const workOverlap = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, start, end);

        if (start === null || end === null || end <= start || workOverlap <= 0) {
            return { className: 'fora-expediente', status: 'Fora do expediente' };
        }

        if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
            const overlapAbsence = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, absenceStart, absenceEnd);

            if (overlapAbsence > 0) {
                return { className: 'ausencia-parcial', status: 'Ausencia parcial' };
            }
        }

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            const overlapLunch = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, lunchStart, lunchEnd);

            if (overlapLunch > 0) {
                return { className: `almoco${adjustedLunch ? ' almoco-ajustado' : ''}`, status: 'Almoco' };
            }
        }

        if (adjustedLunch && defaultLunch) {
            const overlapDefaultLunch = Math.max(
                Math.min(currentHourEnd, defaultLunch.end) - Math.max(currentHourStart, defaultLunch.start),
                0
            );

            if (overlapDefaultLunch > 0) {
                return { className: 'trabalhando almoco-cadastro-hint', status: 'Horario padrao do almoco' };
            }
        }

        return {
            className: 'trabalhando',
            status: tipo === 'plantao' ? 'Plantao' : 'Trabalhando'
        };
    }

    function clearLunchDropPreviewEscala() {
        document.querySelectorAll('.timeline-cell.drop-target-over, .timeline-cell.drop-preview').forEach((cell) => {
            cell.classList.remove('drop-target-over', 'drop-preview');
        });

        document.querySelectorAll('.timeline-row.is-dragging-lunch, .timeline-row.is-saving-lunch').forEach((row) => {
            row.classList.remove('is-dragging-lunch', 'is-saving-lunch');
        });
    }

    function buildLunchDropRangeEscala(record, targetHour) {
        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);

        if (
            workStart === null
            || workEnd === null
            || lunchStart === null
            || lunchEnd === null
            || lunchEnd <= lunchStart
        ) {
            return null;
        }

        const duration = lunchEnd - lunchStart;
        const nextStart = targetHour * 60;
        const nextEnd = nextStart + duration;

        if (nextStart < workStart || nextEnd > workEnd) {
            return null;
        }

        return {
            startMinutes: nextStart,
            endMinutes: nextEnd
        };
    }

    function applyLunchDropPreviewEscala(row, range) {
        clearLunchDropPreviewEscala();

        if (!row || !range) {
            return;
        }

        row.classList.add('is-dragging-lunch');

        row.querySelectorAll('.timeline-cell[data-hour]').forEach((cell) => {
            const hour = Number(cell.dataset.hour);
            const currentHourStart = hour * 60;
            const currentHourEnd = (hour + 1) * 60;
            const overlap = Math.max(
                Math.min(currentHourEnd, range.endMinutes) - Math.max(currentHourStart, range.startMinutes),
                0
            );

            if (overlap > 0) {
                cell.classList.add('drop-preview');
            }
        });
    }

    function getTimelineVisibleBoundsEscala() {
        const bounds = getScaleHourBoundsEscala();
        return {
            start: bounds.startHour * 60,
            end: (bounds.endHour + 1) * 60
        };
    }

    function getScaleLunchDraftEscala(colaboradorId) {
        return window.__escalaLunchDrafts?.[Number(colaboradorId)] || null;
    }

    function setScaleLunchDraftEscala(colaboradorId, draft) {
        if (!window.__escalaLunchDrafts) {
            window.__escalaLunchDrafts = {};
        }

        if (!draft) {
            delete window.__escalaLunchDrafts[Number(colaboradorId)];
            return;
        }

        window.__escalaLunchDrafts[Number(colaboradorId)] = draft;
    }

    function applyScaleLunchDraftEscala(record) {
        const draft = getScaleLunchDraftEscala(record?.colaboradorId);

        if (!draft) {
            return record;
        }

        return {
            ...record,
            almocoInicio: draft.almocoInicio,
            almocoFim: draft.almocoFim
        };
    }

    function buildTimelineLunchOverlayEscala(record) {
        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        const visibleBounds = getTimelineVisibleBoundsEscala();
        const visibleSpan = visibleBounds.end - visibleBounds.start;

        if (workStart === null || workEnd === null || lunchStart === null || lunchEnd === null || lunchEnd <= lunchStart) {
            return '';
        }

        const clampedStart = Math.max(lunchStart, visibleBounds.start);
        const clampedEnd = Math.min(lunchEnd, visibleBounds.end);

        if (clampedEnd <= clampedStart || visibleSpan <= 0) {
            return '';
        }

        const left = ((clampedStart - visibleBounds.start) / visibleSpan) * 100;
        const width = ((clampedEnd - clampedStart) / visibleSpan) * 100;
        const adjusted = record.almocoPersonalizado || record.almocoAjustado;

        return `
            <div class="timeline-lunch-overlay" data-colaborador-id="${record.colaboradorId}">
                <div
                    class="timeline-lunch-drag-block${adjusted ? ' is-adjusted' : ''}"
                    data-role="lunch-block"
                    style="left:${left}%;width:${width}%;"
                    title="Arraste o almoco diretamente na tabela"
                >
                    <button type="button" class="timeline-lunch-handle start" data-role="start" aria-label="Ajustar inicio do almoco"></button>
                    <span class="timeline-lunch-label">${escapeHtmlEscala(formatTimeRangeEscala(record.almocoInicio, record.almocoFim))}</span>
                    <button type="button" class="timeline-lunch-handle end" data-role="end" aria-label="Ajustar fim do almoco"></button>
                </div>
            </div>
        `;
    }

    async function salvarAjusteDiretoAlmocoEscala(colaboradorId, startMinutes, endMinutes) {
        const state = getCurrentScaleState();
        const currentRecord = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId));

        if (!currentRecord) {
            throw new Error('Registro diario nao encontrado para este colaborador.');
        }

        const nextStart = formatMinutesToTimeEscala(startMinutes);
        const nextEnd = formatMinutesToTimeEscala(endMinutes);
        const restoredDefault = isSameLunchAsCadastroEscala(colaboradorId, nextStart, nextEnd);
        const currentStart = formatTimeInputEscala(currentRecord.almocoInicio);
        const currentEnd = formatTimeInputEscala(currentRecord.almocoFim);

        if (nextStart === currentStart && nextEnd === currentEnd) {
            setScaleLunchDraftEscala(colaboradorId, null);
            return {
                restoredDefault
            };
        }

        setScaleLunchDraftEscala(colaboradorId, {
            almocoInicio: nextStart,
            almocoFim: nextEnd
        });

        try {
            await window.API.salvarEscalaDia(state.dataISO, colaboradorId, {
                horaInicio: currentRecord.horaInicio || null,
                horaFim: currentRecord.horaFim || null,
                almocoInicio: nextStart,
                almocoFim: nextEnd,
                observacao: currentRecord.observacao ?? null
            });
            setScaleLunchDraftEscala(colaboradorId, null);
            await atualizarTudo({ silent: true, source: 'escala' });

            if (window.__escalaEditorColaboradorId && Number(window.__escalaEditorColaboradorId) === Number(colaboradorId)) {
                abrirEditorNaEscala(colaboradorId);
            }

            return {
                restoredDefault
            };
        } catch (error) {
            setScaleLunchDraftEscala(colaboradorId, null);
            renderScaleRowsEscala(getCurrentScaleState());
            throw error;
        }
    }

    function bindLunchCellDragEscala(row, record) {
        const lunchCells = Array.from(row.querySelectorAll('.timeline-cell.almoco[data-hour]'));
        const allCells = Array.from(row.querySelectorAll('.timeline-cell[data-hour]'));

        if (lunchCells.length === 0) {
            return;
        }

        const dragState = {
            colaboradorId: Number(record.colaboradorId),
            dataISO: record.dataISO
        };

        lunchCells.forEach((cell) => {
            cell.draggable = true;
            cell.classList.add('is-lunch-draggable');

            cell.addEventListener('dragstart', (event) => {
                window.__escalaLunchHtmlDrag = dragState;
                row.classList.add('is-dragging-lunch');
                cell.classList.add('is-drag-source');

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(record.colaboradorId));
                }
            });

            cell.addEventListener('dragend', () => {
                cell.classList.remove('is-drag-source');
                window.__escalaLunchHtmlDrag = null;
                clearLunchDropPreviewEscala();
            });
        });

        allCells.forEach((cell) => {
            const hour = Number(cell.dataset.hour);

            cell.addEventListener('dragover', (event) => {
                const currentDrag = window.__escalaLunchHtmlDrag;
                const range = buildLunchDropRangeEscala(record, hour);

                if (!currentDrag || currentDrag.colaboradorId !== Number(record.colaboradorId) || !range) {
                    return;
                }

                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
                cell.classList.add('drop-target-over');
                applyLunchDropPreviewEscala(row, range);
            });

            cell.addEventListener('dragleave', () => {
                cell.classList.remove('drop-target-over');
            });

            cell.addEventListener('drop', async (event) => {
                const currentDrag = window.__escalaLunchHtmlDrag;
                const range = buildLunchDropRangeEscala(record, hour);

                event.preventDefault();
                event.stopPropagation();
                cell.classList.remove('drop-target-over');

                if (!currentDrag || currentDrag.colaboradorId !== Number(record.colaboradorId) || !range) {
                    clearLunchDropPreviewEscala();
                    return;
                }

                row.classList.add('is-saving-lunch');

                try {
                    const result = await salvarAjusteDiretoAlmocoEscala(record.colaboradorId, range.startMinutes, range.endMinutes);
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(
                            result?.restoredDefault
                                ? 'Almoco voltou ao horario padrao do cadastro.'
                                : 'Almoco ajustado apenas para este dia.',
                            'success'
                        );
                    }
                } catch (error) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Erro ao ajustar almoco: ${error.message}`, 'error');
                    }
                } finally {
                    window.__escalaLunchHtmlDrag = null;
                    clearLunchDropPreviewEscala();
                }
            });
        });
    }

    function bindTimelineLunchDragEscala(row, record) {
        const overlay = row.querySelector('.timeline-lunch-overlay');
        const block = overlay?.querySelector('[data-role="lunch-block"]');
        const startHandle = overlay?.querySelector('[data-role="start"]');
        const endHandle = overlay?.querySelector('[data-role="end"]');
        const timeCells = Array.from(row.querySelectorAll('.timeline-cell:not(.total-cell)'));

        if (!overlay || !block || !startHandle || !endHandle || timeCells.length === 0) {
            return;
        }

        const firstCell = timeCells[0];
        const lastCell = timeCells[timeCells.length - 1];
        const rowRect = row.getBoundingClientRect();
        const firstRect = firstCell.getBoundingClientRect();
        const lastRect = lastCell.getBoundingClientRect();
        const overlayLeft = firstRect.left - rowRect.left;
        const overlayWidth = lastRect.right - firstRect.left;

        overlay.style.left = `${overlayLeft}px`;
        overlay.style.width = `${overlayWidth}px`;

        const visibleBounds = getTimelineVisibleBoundsEscala();
        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);

        if (workStart === null || workEnd === null || workEnd <= workStart) {
            return;
        }

        const getPointerMinutes = (clientX) => {
            const rect = overlay.getBoundingClientRect();

            if (rect.width <= 0) {
                return workStart;
            }

            const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
            const absolute = visibleBounds.start + ((visibleBounds.end - visibleBounds.start) * ratio);
            return roundMinutesEscala(absolute);
        };

        const updateBlock = (startMinutes, endMinutes) => {
            const visibleSpan = visibleBounds.end - visibleBounds.start;
            const left = ((startMinutes - visibleBounds.start) / visibleSpan) * 100;
            const width = ((endMinutes - startMinutes) / visibleSpan) * 100;
            const label = block.querySelector('.timeline-lunch-label');

            block.style.left = `${left}%`;
            block.style.width = `${width}%`;

            if (label) {
                label.textContent = formatTimeRangeEscala(
                    formatMinutesToTimeEscala(startMinutes),
                    formatMinutesToTimeEscala(endMinutes)
                );
            }
        };

        const beginDrag = (mode, event) => {
            event.preventDefault();
            event.stopPropagation();

            const initialStart = getTimeMinutesEscala(record.almocoInicio);
            const initialEnd = getTimeMinutesEscala(record.almocoFim);

            if (initialStart === null || initialEnd === null || initialEnd <= initialStart) {
                return;
            }

            const duration = initialEnd - initialStart;
            const pointerState = {
                mode,
                startPointerMinutes: getPointerMinutes(event.clientX),
                initialStart,
                initialEnd,
                duration
            };

            const move = (moveEvent) => {
                let nextStart = pointerState.initialStart;
                let nextEnd = pointerState.initialEnd;

                if (pointerState.mode === 'move') {
                    const currentPointerMinutes = getPointerMinutes(moveEvent.clientX);
                    const delta = currentPointerMinutes - pointerState.startPointerMinutes;
                    nextStart = roundMinutesEscala(
                        clampMinutesEscala(pointerState.initialStart + delta, workStart, workEnd - duration)
                    );
                    nextEnd = nextStart + duration;
                } else if (pointerState.mode === 'start') {
                    nextStart = roundMinutesEscala(
                        clampMinutesEscala(getPointerMinutes(moveEvent.clientX), workStart, pointerState.initialEnd - ESCALA_EDITOR_PASSO_MINUTOS)
                    );
                } else {
                    nextEnd = roundMinutesEscala(
                        clampMinutesEscala(getPointerMinutes(moveEvent.clientX), pointerState.initialStart + ESCALA_EDITOR_PASSO_MINUTOS, workEnd)
                    );
                }

                if (nextEnd <= nextStart) {
                    nextEnd = nextStart + ESCALA_EDITOR_PASSO_MINUTOS;
                }

                updateBlock(nextStart, nextEnd);
                block.dataset.pendingStart = String(nextStart);
                block.dataset.pendingEnd = String(nextEnd);
            };

            const stop = async () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);

                const pendingStart = Number(block.dataset.pendingStart || pointerState.initialStart);
                const pendingEnd = Number(block.dataset.pendingEnd || pointerState.initialEnd);
                delete block.dataset.pendingStart;
                delete block.dataset.pendingEnd;

                row.classList.add('is-saving-lunch');

                try {
                    await salvarAjusteDiretoAlmocoEscala(record.colaboradorId, pendingStart, pendingEnd);
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Almoco ajustado com sucesso!', 'success');
                    }
                } catch (error) {
                    updateBlock(pointerState.initialStart, pointerState.initialEnd);
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Erro ao ajustar almoco: ${error.message}`, 'error');
                    }
                } finally {
                    row.classList.remove('is-saving-lunch');
                }
            };

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop, { once: true });
        };

        block.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        block.addEventListener('pointerdown', (event) => {
            if (event.target === startHandle || event.target === endHandle) {
                return;
            }

            beginDrag('move', event);
        });
        startHandle.addEventListener('pointerdown', (event) => beginDrag('start', event));
        endHandle.addEventListener('pointerdown', (event) => beginDrag('end', event));
    }

    function renderScaleHeaderEscala() {
        const header = document.getElementById('timelineHeader');

        if (!header) {
            return;
        }

        const bounds = applyScaleHourBoundsCssEscala();

        header.innerHTML = '<div class="timeline-name-header">Colaborador</div>'
            + '<div class="hora-header total-header" title="Total de horas no dia">Total</div>'
            + Array.from({ length: bounds.columnCount }, (_, index) => {
                const hour = bounds.startHour + index;
                return `<div class="hora-header">${String(hour).padStart(2, '0')}:00</div>`;
            }).join('');
    }

    function renderTotalRowEscala(items) {
        const body = document.getElementById('timelineBody');

        if (!body || !items.length) {
            return;
        }

        const bounds = getScaleHourBoundsEscala(items);
        const counts = Array.from({ length: bounds.columnCount }, (_, index) => ({
            hour: bounds.startHour + index,
            count: 0
        }));

        items.forEach((record) => {
            counts.forEach((item) => {
                if (hasCellClassEscala(getCellStateEscala(record, item.hour).className, 'trabalhando')) {
                    item.count += 1;
                }
            });
        });

        const row = document.createElement('div');
        row.className = 'timeline-row total-row';
        row.innerHTML = `
            <div class="timeline-name total-nome">
                <i class="fas fa-users"></i>
                <span><strong>TRABALHANDO</strong></span>
            </div>
            <div class="timeline-cell total-cell"></div>
            ${counts.map((item) => `
                <div class="timeline-cell total-cell" title="${item.hour}:00 - ${item.count} trabalhando">
                    <span class="total-valor">${item.count}</span>
                </div>
            `).join('')}
        `;

        body.appendChild(row);
    }

    function renderScaleSummaryEscala(items) {
        const container = document.getElementById('resumoContainer');
        const grid = document.getElementById('resumoGrid');

        if (!container || !grid) {
            return;
        }

        if (!items.length) {
            container.style.display = 'none';
            grid.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        const bounds = getScaleHourBoundsEscala(items);

        const cards = Array.from({ length: bounds.columnCount }, (_, index) => {
            const hour = bounds.startHour + index;
            const counters = {
                trabalhando: 0,
                almoco: 0,
                folga: 0,
                ferias: 0,
                ausente: 0,
                fora: 0
            };

            items.forEach((record) => {
                const state = getCellStateEscala(record, hour).className;

                if (hasCellClassEscala(state, 'trabalhando')) {
                    counters.trabalhando += 1;
                } else if (hasCellClassEscala(state, 'almoco')) {
                    counters.almoco += 1;
                } else if (hasCellClassEscala(state, 'ferias')) {
                    counters.ferias += 1;
                } else if (hasCellClassEscala(state, 'ausencia-parcial') || hasCellClassEscala(state, 'ausencia')) {
                    counters.ausente += 1;
                } else if (hasCellClassEscala(state, 'folga')) {
                    counters.folga += 1;
                } else {
                    counters.fora += 1;
                }
            });

            const total = Object.values(counters).reduce((sum, value) => sum + value, 0) || 1;

            return `
                <div class="resumo-card">
                    <div class="resumo-hora">${String(hour).padStart(2, '0')}:00</div>
                    <div class="resumo-barras">
                        <div class="resumo-barra-container">
                            <div class="resumo-barra trabalhando" style="width: ${(counters.trabalhando / total) * 100}%"></div>
                            <div class="resumo-barra almoco" style="width: ${(counters.almoco / total) * 100}%"></div>
                            <div class="resumo-barra folga" style="width: ${(counters.folga / total) * 100}%"></div>
                            <div class="resumo-barra ferias" style="width: ${(counters.ferias / total) * 100}%"></div>
                            <div class="resumo-barra ausente" style="width: ${(counters.ausente / total) * 100}%"></div>
                            <div class="resumo-barra fora" style="width: ${(counters.fora / total) * 100}%"></div>
                        </div>
                    </div>
                    <div class="resumo-numeros">
                        <span class="resumo-num trabalhando-num"><i class="fas fa-briefcase"></i> ${counters.trabalhando}</span>
                        <span class="resumo-num almoco-num"><i class="fas fa-utensils"></i> ${counters.almoco}</span>
                        <span class="resumo-num folga-num"><i class="fas fa-leaf"></i> ${counters.folga}</span>
                        <span class="resumo-num ferias-num"><i class="fas fa-umbrella-beach"></i> ${counters.ferias}</span>
                        <span class="resumo-num ausente-num"><i class="fas fa-user-clock"></i> ${counters.ausente}</span>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = cards.join('');
    }

    function renderScaleEmptyMessageEscala(dataISO) {
        const body = document.getElementById('timelineBody');
        const weekday = getIsoDayOfWeekEscala(dataISO);

        if (!body) {
            return;
        }

        let title = 'Nenhum registro encontrado';
        let description = 'Nao ha colaboradores escalados para esta data.';
        let label = getDayLabelEscala(dataISO).toUpperCase();
        let icon = 'fa-calendar-times';

        if (weekday === 0) {
            title = 'Nenhum registro para este domingo';
            description = 'Configure a jornada semanal do colaborador ou use ajuste manual para este dia.';
            icon = 'fa-calendar-day';
            label = 'DOMINGO';
        } else if (weekday === 6) {
            title = 'Nenhum registro para este sabado';
            description = 'Lance um plantao ou ajuste manual para que ele apareca na escala.';
            icon = 'fa-calendar-check';
            label = 'SABADO';
        }

        const bounds = getScaleHourBoundsEscala();
        body.innerHTML = `
            <div class="timeline-row mensagem-row">
                <div class="timeline-name mensagem-nome">
                    <i class="fas ${icon}"></i>
                    <span>${label}</span>
                </div>
                <div class="timeline-cell total-cell"></div>
                <div class="timeline-cell mensagem-cell" style="grid-column: span ${bounds.columnCount};">
                    <div class="mensagem-conteudo">
                        <i class="fas ${icon}"></i>
                        <h3>${escapeHtmlEscala(title)}</h3>
                        <p>${escapeHtmlEscala(description)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderInlineScaleEditorRowEscala(record) {
        const row = document.createElement('div');
        const workRange = formatTimeRangeEscala(record.horaInicio, record.horaFim);
        const lunchRange = formatTimeRangeEscala(record.almocoInicio, record.almocoFim);
        const almocoStatus = record.almocoPersonalizado || record.almocoAjustado
            ? 'Almoco ajustado'
            : 'Almoco padrao';

        row.className = 'timeline-row timeline-inline-editor-row';
        row.innerHTML = `
            <div class="timeline-name timeline-inline-editor-name">
                <i class="fas fa-up-down-left-right"></i>
                <div class="timeline-inline-labels">
                    <strong>Ajuste rapido</strong>
                    <small>${escapeHtmlEscala(record.colaboradorNome || 'Colaborador')}</small>
                </div>
            </div>
            <div class="timeline-cell timeline-inline-editor-cell" style="grid-column: 2 / -1;">
                <div class="timeline-inline-panel">
                    <div class="timeline-inline-head">
                        <div>
                            <strong>${escapeHtmlEscala(formatDatePtBrEscala(record.dataISO))} • ${escapeHtmlEscala(getDayLabelEscala(record.dataISO))}</strong>
                            <span>Arraste o bloco de almoco na horizontal para ajustar apenas este dia.</span>
                        </div>
                        <div class="timeline-inline-summary">
                            <span class="timeline-pill work">
                                <i class="fas fa-briefcase"></i>
                                ${escapeHtmlEscala(workRange)}
                            </span>
                            <span class="timeline-pill lunch">
                                <i class="fas fa-utensils"></i>
                                ${escapeHtmlEscala(lunchRange)}
                            </span>
                            <span class="timeline-pill ${record.almocoPersonalizado || record.almocoAjustado ? 'warning' : ''}">
                                <i class="fas fa-wand-magic-sparkles"></i>
                                ${escapeHtmlEscala(almocoStatus)}
                            </span>
                        </div>
                    </div>

                    <div class="escala-inline-hidden-inputs" aria-hidden="true">
                        <input type="time" id="escalaHoraInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaInicio))}">
                        <input type="time" id="escalaHoraFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaFim))}">
                        <input type="time" id="escalaAlmocoInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoInicio))}">
                        <input type="time" id="escalaAlmocoFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoFim))}">
                        <textarea id="escalaObservacao-${record.colaboradorId}">${escapeHtmlEscala(record.observacao || '')}</textarea>
                    </div>

                    <div class="escala-range-card">
                        <div class="escala-range-card-header">
                            <strong>Almoco do dia</strong>
                            <span>O bloco fica preso a jornada do colaborador e respeita a duracao original.</span>
                        </div>
                        <div id="escalaRangeLunch-${record.colaboradorId}" class="escala-range-editor"></div>
                    </div>

                    <div class="timeline-inline-actions">
                        <button type="button" onclick="salvarEscalaDia(${record.colaboradorId})" class="btn-primary">
                            <i class="fas fa-save"></i> Salvar ajuste
                        </button>
                        <button type="button" onclick="restaurarAlmocoPadraoEscala(${record.colaboradorId})" class="btn-secondary">
                            <i class="fas fa-rotate-left"></i> Voltar ao padrao
                        </button>
                        <button type="button" onclick="fecharEditor()" class="btn-secondary">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;

        return row;
    }

    function renderScaleRowsEscala(state) {
        const body = document.getElementById('timelineBody');

        if (!body) {
            return;
        }

        const items = filterScaleItemsBySectorEscala(state.items || []).sort(compareScaleRecordsEscala);
        const selectedColaboradorId = Number(window.__escalaEditorColaboradorId || 0);
        const bounds = applyScaleHourBoundsCssEscala(items);

        body.innerHTML = '';

        if (items.length === 0) {
            renderScaleEmptyMessageEscala(state.dataISO);
            atualizarBotaoRestaurarAlmocosEscala();
            return;
        }

        items.forEach((record) => {
            const totalMinutes = calculateWorkedMinutesEscala(record);
            const totalLabel = formatDurationEscala(totalMinutes);
            const row = document.createElement('div');
            const type = String(record.tipo || '').toLowerCase();
            const typeLabel = TIPO_LABELS[type] || 'Escala';
            const isSelected = Number(record.colaboradorId) === selectedColaboradorId;
            row.className = `timeline-row${type === 'plantao' ? ' plantao-row' : ''}${isSelected ? ' is-selected' : ''}`;

            row.innerHTML = `
                <div class="timeline-name" data-colaborador-id="${record.colaboradorId}" title="Editar escala de ${escapeHtmlEscala(record.colaboradorNome || 'colaborador')}">
                    <i class="fas fa-user"></i>
                    <span class="timeline-name-main">
                        <strong class="timeline-name-text">${escapeHtmlEscala(record.colaboradorNome || 'Sem nome')}</strong>
                        <span class="timeline-name-meta">
                            ${record.setorNome ? `<small class="escala-sector-chip">${escapeHtmlEscala(record.setorNome)}</small>` : ''}
                            ${type === 'plantao' ? '<span class="plantao-badge"><i class="fas fa-calendar-check"></i> Plantao</span>' : ''}
                            ${type !== 'normal' && type !== 'plantao' ? `<small class="escala-dia-tipo">${escapeHtmlEscala(typeLabel)}</small>` : ''}
                        </span>
                    </span>
                    <span class="timeline-name-action" aria-label="Editar escala">
                        <i class="fas fa-pen edit-indicator"></i>
                    </span>
                </div>
                <div class="timeline-cell total-cell">
                    <span class="total-valor">${escapeHtmlEscala(totalLabel)}</span>
                </div>
                ${Array.from({ length: bounds.columnCount }, (_, index) => {
                    const hour = bounds.startHour + index;
                    const cellState = getCellStateEscala(record, hour);
                    return `<div class="timeline-cell ${cellState.className}" data-hour="${hour}" data-colaborador-id="${record.colaboradorId}"></div>`;
                }).join('')}
            `;

            row.querySelector('.timeline-name')?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                abrirEditorNaEscala(record.colaboradorId);
            });

            body.appendChild(row);
            bindLunchCellDragEscala(row, record);
        });

        renderTotalRowEscala(items);
        atualizarBotaoRestaurarAlmocosEscala();
    }

    function getScaleEditorRecordEscala(colaboradorId) {
        return (getCurrentScaleState().items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getScaleEditorTimeValueEscala(inputId, fallbackValue = null) {
        const input = document.getElementById(inputId);
        const currentValue = input?.value || fallbackValue;
        return getTimeMinutesEscala(currentValue);
    }

    function getScaleEditorWorkBoundsEscala(colaboradorId) {
        const record = getScaleEditorRecordEscala(colaboradorId);
        const workStart = getScaleEditorTimeValueEscala(`escalaHoraInicio-${colaboradorId}`, record?.horaInicio);
        const workEnd = getScaleEditorTimeValueEscala(`escalaHoraFim-${colaboradorId}`, record?.horaFim);

        if (workStart === null || workEnd === null || workEnd <= workStart) {
            return {
                min: ESCALA_EDITOR_MINUTO_INICIAL,
                max: ESCALA_EDITOR_MINUTO_FINAL,
                isValid: false
            };
        }

        return {
            min: workStart,
            max: workEnd,
            isValid: true
        };
    }

    function buildDefaultLunchRangeEscala(colaboradorId) {
        const workBounds = getScaleEditorWorkBoundsEscala(colaboradorId);
        const min = workBounds.isValid ? workBounds.min : 12 * 60;
        const max = workBounds.isValid ? workBounds.max : 18 * 60;
        const span = Math.max(max - min, ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS);
        const duration = Math.min(ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS, span);
        const center = min + Math.floor(span / 2);
        let start = roundMinutesEscala(center - Math.floor(duration / 2));
        start = clampMinutesEscala(start, min, Math.max(min, max - duration));
        const end = clampMinutesEscala(start + duration, start + ESCALA_EDITOR_PASSO_MINUTOS, max);

        return {
            start,
            end
        };
    }

    function setScaleRangeInputsEscala(startInputId, endInputId, startMinutes, endMinutes) {
        const startInput = document.getElementById(startInputId);
        const endInput = document.getElementById(endInputId);

        if (startInput) {
            startInput.value = formatMinutesToTimeEscala(startMinutes);
        }

        if (endInput) {
            endInput.value = formatMinutesToTimeEscala(endMinutes);
        }
    }

    function buildScaleDragTrackConfigEscala(colaboradorId, kind) {
        const record = getScaleEditorRecordEscala(colaboradorId);
        const isLunch = kind === 'lunch';
        const startInputId = isLunch
            ? `escalaAlmocoInicio-${colaboradorId}`
            : `escalaHoraInicio-${colaboradorId}`;
        const endInputId = isLunch
            ? `escalaAlmocoFim-${colaboradorId}`
            : `escalaHoraFim-${colaboradorId}`;
        let currentStart = getScaleEditorTimeValueEscala(startInputId, isLunch ? record?.almocoInicio : record?.horaInicio);
        let currentEnd = getScaleEditorTimeValueEscala(endInputId, isLunch ? record?.almocoFim : record?.horaFim);
        const workBounds = getScaleEditorWorkBoundsEscala(colaboradorId);
        const bounds = isLunch
            ? {
                min: workBounds.isValid ? workBounds.min : ESCALA_EDITOR_MINUTO_INICIAL,
                max: workBounds.isValid ? workBounds.max : ESCALA_EDITOR_MINUTO_FINAL,
                isValid: workBounds.isValid
            }
                : {
                    min: ESCALA_EDITOR_MINUTO_INICIAL,
                    max: ESCALA_EDITOR_MINUTO_FINAL,
                    isValid: true
                };

        if (Number.isFinite(currentStart) && Number.isFinite(currentEnd) && bounds.max > bounds.min) {
            currentStart = clampMinutesEscala(currentStart, bounds.min, bounds.max - ESCALA_EDITOR_PASSO_MINUTOS);
            currentEnd = clampMinutesEscala(currentEnd, currentStart + ESCALA_EDITOR_PASSO_MINUTOS, bounds.max);

            if (currentEnd <= currentStart) {
                currentEnd = clampMinutesEscala(currentStart + ESCALA_EDITOR_PASSO_MINUTOS, currentStart + ESCALA_EDITOR_PASSO_MINUTOS, bounds.max);
            }

            setScaleRangeInputsEscala(startInputId, endInputId, currentStart, currentEnd);
        }

        return {
            kind,
            colaboradorId,
            startInputId,
            endInputId,
            startMinutes: currentStart,
            endMinutes: currentEnd,
            minMinutes: bounds.min,
            maxMinutes: bounds.max,
            isValidBounds: bounds.isValid,
            accentClass: isLunch ? 'is-lunch' : 'is-work',
            label: isLunch ? 'Almoco' : 'Jornada',
            emptyMessage: isLunch
                ? 'Sem almoco definido. Crie a faixa abaixo e depois arraste.'
                : 'Informe inicio e fim da jornada para liberar o arraste.'
        };
    }

    function renderScaleDragTrackEscala(shell, config) {
        if (!shell) {
            return;
        }

        const hasRange = Number.isFinite(config.startMinutes)
            && Number.isFinite(config.endMinutes)
            && config.endMinutes > config.startMinutes
            && config.maxMinutes > config.minMinutes;

        shell.dataset.kind = config.kind;
        shell.dataset.startInputId = config.startInputId;
        shell.dataset.endInputId = config.endInputId;
        shell.dataset.colaboradorId = String(config.colaboradorId);

        if (!hasRange) {
            shell.innerHTML = `
                <div class="escala-range-placeholder">
                    <i class="fas fa-up-down-left-right"></i>
                    <span>${escapeHtmlEscala(config.emptyMessage)}</span>
                </div>
            `;
            return;
        }

        const span = config.maxMinutes - config.minMinutes;
        const left = ((config.startMinutes - config.minMinutes) / span) * 100;
        const width = ((config.endMinutes - config.startMinutes) / span) * 100;
        const middleLabel = formatTimeRangeEscala(
            formatMinutesToTimeEscala(config.startMinutes),
            formatMinutesToTimeEscala(config.endMinutes)
        );

        shell.innerHTML = `
            <div class="escala-range-head">
                <span>${escapeHtmlEscala(config.label)}</span>
                <strong>${escapeHtmlEscala(middleLabel)}</strong>
            </div>
            <div class="escala-range-axis">
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.minMinutes))}</span>
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.minMinutes + Math.round(span / 2)))}</span>
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.maxMinutes))}</span>
            </div>
            <div class="escala-range-track ${config.accentClass}" data-track-role="track">
                <div class="escala-range-selection ${config.accentClass}" data-track-role="selection" style="left: ${left}%; width: ${width}%;">
                    <button type="button" class="escala-range-handle start" data-track-role="start" aria-label="Arrastar inicio"></button>
                    <button type="button" class="escala-range-handle end" data-track-role="end" aria-label="Arrastar fim"></button>
                </div>
            </div>
            <div class="escala-range-helper">
                Arraste as extremidades para ajustar o horario ou a faixa inteira para mover o bloco.
            </div>
        `;

        bindScaleDragTrackEscala(shell, config);
    }

    function bindScaleDragTrackEscala(shell, config) {
        const track = shell.querySelector('[data-track-role="track"]');
        const selection = shell.querySelector('[data-track-role="selection"]');
        const startHandle = shell.querySelector('[data-track-role="start"]');
        const endHandle = shell.querySelector('[data-track-role="end"]');
        const startInput = document.getElementById(config.startInputId);
        const endInput = document.getElementById(config.endInputId);

        if (!track || !selection || !startHandle || !endHandle || !startInput || !endInput) {
            return;
        }

        const minimumDuration = ESCALA_EDITOR_PASSO_MINUTOS;

        const getPointerMinutes = (clientX) => {
            const rect = track.getBoundingClientRect();
            if (rect.width <= 0) {
                return config.startMinutes;
            }

            const ratio = clampMinutesEscala((clientX - rect.left) / rect.width, 0, 1);
            const absolute = config.minMinutes + ((config.maxMinutes - config.minMinutes) * ratio);
            return roundMinutesEscala(absolute);
        };

        const updateRange = (startMinutes, endMinutes) => {
            setScaleRangeInputsEscala(config.startInputId, config.endInputId, startMinutes, endMinutes);

            const span = config.maxMinutes - config.minMinutes;
            const left = ((startMinutes - config.minMinutes) / span) * 100;
            const width = ((endMinutes - startMinutes) / span) * 100;

            selection.style.left = `${left}%`;
            selection.style.width = `${width}%`;

            const label = shell.querySelector('.escala-range-head strong');
            if (label) {
                label.textContent = formatTimeRangeEscala(
                    formatMinutesToTimeEscala(startMinutes),
                    formatMinutesToTimeEscala(endMinutes)
                );
            }
        };

        const beginDrag = (mode, event) => {
            event.preventDefault();

            const initialStart = getTimeMinutesEscala(startInput.value);
            const initialEnd = getTimeMinutesEscala(endInput.value);

            if (initialStart === null || initialEnd === null) {
                return;
            }

            const duration = initialEnd - initialStart;
            const pointerState = {
                mode,
                startPointerMinutes: getPointerMinutes(event.clientX),
                initialStart,
                initialEnd,
                duration
            };

            const move = (moveEvent) => {
                let nextStart = pointerState.initialStart;
                let nextEnd = pointerState.initialEnd;

                if (pointerState.mode === 'move') {
                    const currentPointerMinutes = getPointerMinutes(moveEvent.clientX);
                    const delta = currentPointerMinutes - pointerState.startPointerMinutes;
                    nextStart = clampMinutesEscala(pointerState.initialStart + delta, config.minMinutes, config.maxMinutes - duration);
                    nextStart = roundMinutesEscala(nextStart);
                    nextEnd = nextStart + duration;
                } else if (pointerState.mode === 'start') {
                    nextStart = clampMinutesEscala(getPointerMinutes(moveEvent.clientX), config.minMinutes, pointerState.initialEnd - minimumDuration);
                    nextStart = roundMinutesEscala(nextStart);
                } else {
                    nextEnd = clampMinutesEscala(getPointerMinutes(moveEvent.clientX), pointerState.initialStart + minimumDuration, config.maxMinutes);
                    nextEnd = roundMinutesEscala(nextEnd);
                }

                if (nextEnd <= nextStart) {
                    nextEnd = nextStart + minimumDuration;
                }

                updateRange(nextStart, nextEnd);
            };

            const stop = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                syncScaleDragEditorEscala(config.colaboradorId);
            };

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop, { once: true });
        };

        selection.addEventListener('pointerdown', (event) => {
            if (event.target === startHandle || event.target === endHandle) {
                return;
            }

            beginDrag('move', event);
        });

        startHandle.addEventListener('pointerdown', (event) => beginDrag('start', event));
        endHandle.addEventListener('pointerdown', (event) => beginDrag('end', event));
    }

    function syncScaleDragEditorEscala(colaboradorId) {
        const workShell = document.getElementById(`escalaRangeWork-${colaboradorId}`);
        const lunchShell = document.getElementById(`escalaRangeLunch-${colaboradorId}`);

        renderScaleDragTrackEscala(workShell, buildScaleDragTrackConfigEscala(colaboradorId, 'work'));
        renderScaleDragTrackEscala(lunchShell, buildScaleDragTrackConfigEscala(colaboradorId, 'lunch'));
    }

    function bindScaleEditorInputsEscala(colaboradorId) {
        [
            `escalaHoraInicio-${colaboradorId}`,
            `escalaHoraFim-${colaboradorId}`,
            `escalaAlmocoInicio-${colaboradorId}`,
            `escalaAlmocoFim-${colaboradorId}`
        ].forEach((inputId) => {
            const input = document.getElementById(inputId);

            if (!input || input.dataset.scaleDragBound === 'true') {
                return;
            }

            input.dataset.scaleDragBound = 'true';
            input.addEventListener('input', () => {
                syncScaleDragEditorEscala(colaboradorId);
            });
        });
    }

    window.criarFaixaAlmocoEscala = criarFaixaAlmocoEscala = function criarFaixaAlmocoEscalaAtualizada(colaboradorId) {
        const defaults = buildDefaultLunchRangeEscala(colaboradorId);
        setScaleRangeInputsEscala(`escalaAlmocoInicio-${colaboradorId}`, `escalaAlmocoFim-${colaboradorId}`, defaults.start, defaults.end);
        syncScaleDragEditorEscala(colaboradorId);
    };

    window.limparFaixaAlmocoEscala = limparFaixaAlmocoEscala = function limparFaixaAlmocoEscalaAtualizada(colaboradorId) {
        const startInput = document.getElementById(`escalaAlmocoInicio-${colaboradorId}`);
        const endInput = document.getElementById(`escalaAlmocoFim-${colaboradorId}`);

        if (startInput) {
            startInput.value = '';
        }

        if (endInput) {
            endInput.value = '';
        }

        syncScaleDragEditorEscala(colaboradorId);
    };

    function renderScaleEditorEscala(record) {
        const sidebar = document.getElementById('sidebarEditor');
        const content = document.getElementById('editorContent');
        const toggleIcon = document.getElementById('toggleIcon');

        if (!sidebar || !content) {
            return;
        }

        const lunchRange = formatTimeRangeEscala(record.almocoInicio, record.almocoFim);

        sidebar.classList.remove('collapsed');
        if (toggleIcon) {
            toggleIcon.className = 'fas fa-chevron-right';
        }

        content.innerHTML = `
            <div class="editor-colaborador">
                <div class="editor-header">
                    <div>
                        <h4>${escapeHtmlEscala(record.colaboradorNome || 'Colaborador')}</h4>
                        <small>${escapeHtmlEscala(formatDatePtBrEscala(record.dataISO))} • ${escapeHtmlEscala(getDayLabelEscala(record.dataISO))} • ${escapeHtmlEscala(TIPO_LABELS[record.tipo] || 'Escala')}</small>
                    </div>
                    <button onclick="fecharEditor()" class="btn-close-editor">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Jornada do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaHoraInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaHoraFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaFim))}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoco do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaAlmocoInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaAlmocoFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoFim))}" class="form-control">
                    </div>
                    <small class="helper-text">Atual: ${escapeHtmlEscala(lunchRange)}</small>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="escalaObservacao-${record.colaboradorId}" class="form-control" rows="3" placeholder="Detalhes deste dia">${escapeHtmlEscala(record.observacao || '')}</textarea>
                </div>

                <div class="editor-actions editor-actions-main">
                    <button onclick="salvarEscalaDia(${record.colaboradorId})" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar dia
                    </button>
                    <button onclick="fecharEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                <div class="editor-period-panel">
                    <div class="editor-period-header">
                        <label><i class="fas fa-calendar-alt"></i> Almoco por periodo</label>
                        <small>Aplique o mesmo intervalo de almoco em varios dias de uma vez.</small>
                    </div>

                    <div class="time-inputs time-inputs-period">
                        <input type="time" id="escalaPeriodoAlmocoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaPeriodoAlmocoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>

                    <div class="time-inputs time-inputs-period">
                        <input type="date" id="escalaPeriodoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="date" id="escalaPeriodoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>

                    <small class="helper-text">Preencha apenas quando quiser aplicar um almoco em lote. Em branco, esse bloco nao interfere na escala.</small>

                    <div class="editor-actions editor-actions-single">
                        <button onclick="aplicarAlmocoPeriodoEscala(${record.colaboradorId})" class="btn-secondary">
                            <i class="fas fa-utensils"></i> Aplicar almoco no periodo
                        </button>
                    </div>
                </div>
            </div>
        `;

    }

    async function carregarEscalaDiaEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const payload = await window.API.getEscalaDia(normalized);
        const state = setCurrentScaleState({
            dataISO: normalized,
            items: Array.isArray(payload?.items) ? payload.items : []
        });

        window.dataEscalaSelecionada = normalized;
        const selector = document.getElementById('seletorDataEscala');
        if (selector) {
            selector.value = normalized;
        }

        renderScaleHeaderEscala();
        renderScaleSectorTabsEscala(state.items || []);
        renderScaleRowsEscala(state);

        return state;
    }

    function ensureScaleSidebarToggleEscala() {
        const sidebar = document.getElementById('sidebarEditor');
        const toggle = document.getElementById('toggleEditor');
        const icon = document.getElementById('toggleIcon');

        if (!sidebar || !toggle || toggle.dataset.bound === 'true') {
            return;
        }

        toggle.dataset.bound = 'true';
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (icon) {
                icon.className = sidebar.classList.contains('collapsed')
                    ? 'fas fa-chevron-left'
                    : 'fas fa-chevron-right';
            }
        });
    }

    window.fecharEditor = fecharEditor = function fecharEditorEscala() {
        const content = document.getElementById('editorContent');

        window.__escalaEditorColaboradorId = null;
        renderScaleRowsEscala(getCurrentScaleState());

        if (!content) {
            return;
        }

        content.innerHTML = `
            <div class="editor-empty">
                <i class="fas fa-arrow-left"></i>
                <p>Clique no nome de um colaborador para editar o dia ou aplicar almoco por periodo.</p>
            </div>
        `;
    };

    window.abrirEditorNaEscala = abrirEditorNaEscala = function abrirEditorNaEscalaAtualizada(colaboradorId) {
        const state = getCurrentScaleState();
        const record = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId));

        if (!record) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Registro diario nao encontrado para este colaborador.', 'warning');
            }
            return;
        }

        window.__escalaEditorColaboradorId = Number(colaboradorId);
        renderScaleRowsEscala(state);
        renderScaleEditorEscala(record);
    };

    function bindScaleOutsideSelectionEscala() {
        const escalaPage = document.querySelector('.escala-page');

        if (!escalaPage || escalaPage.dataset.selectionBound === 'true') {
            return;
        }

        escalaPage.dataset.selectionBound = 'true';
        escalaPage.addEventListener('click', (event) => {
            if (!window.__escalaEditorColaboradorId) {
                return;
            }

            const clickedInsideTimeline = event.target.closest('.timeline-container');
            const clickedInsideSidebar = event.target.closest('#sidebarEditor');

            if (clickedInsideTimeline || clickedInsideSidebar) {
                return;
            }

            if (typeof window.fecharEditor === 'function') {
                window.fecharEditor();
            }
        });
    }

    window.salvarEscalaDia = salvarEscalaDia = async function salvarEscalaDiaAtualizada(colaboradorId) {
        const state = getCurrentScaleState();
        const currentRecord = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || {};
        const payload = {
            horaInicio: document.getElementById(`escalaHoraInicio-${colaboradorId}`)?.value || currentRecord.horaInicio || null,
            horaFim: document.getElementById(`escalaHoraFim-${colaboradorId}`)?.value || currentRecord.horaFim || null,
            almocoInicio: document.getElementById(`escalaAlmocoInicio-${colaboradorId}`)?.value || currentRecord.almocoInicio || null,
            almocoFim: document.getElementById(`escalaAlmocoFim-${colaboradorId}`)?.value || currentRecord.almocoFim || null,
            observacao: document.getElementById(`escalaObservacao-${colaboradorId}`)?.value ?? currentRecord.observacao ?? null
        };

        try {
            await window.API.salvarEscalaDia(state.dataISO, colaboradorId, payload);
            await atualizarTudo({ silent: true, source: 'escala' });
            abrirEditorNaEscala(colaboradorId);

            if (typeof mostrarToast === 'function') {
                mostrarToast('Escala do dia atualizada com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao salvar escala: ${error.message}`, 'error');
            }
        }
    };

    window.aplicarAlmocoPeriodoEscala = aplicarAlmocoPeriodoEscala = async function aplicarAlmocoPeriodoEscalaAtualizado(colaboradorId) {
        const state = getCurrentScaleState();
        const payload = {
            colaboradorId,
            dataInicio: document.getElementById(`escalaPeriodoInicio-${colaboradorId}`)?.value,
            dataFim: document.getElementById(`escalaPeriodoFim-${colaboradorId}`)?.value,
            almocoInicio: document.getElementById(`escalaPeriodoAlmocoInicio-${colaboradorId}`)?.value,
            almocoFim: document.getElementById(`escalaPeriodoAlmocoFim-${colaboradorId}`)?.value
        };

        if (!payload.dataInicio || !payload.dataFim || !payload.almocoInicio || !payload.almocoFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Preencha inicio, fim e periodo antes de aplicar o almoco em lote.', 'warning');
            }
            return;
        }

        try {
            await window.API.aplicarAlmocoPeriodo(payload);
            await atualizarTudo({ silent: true, source: 'escala' });
            abrirEditorNaEscala(colaboradorId);

            if (typeof mostrarToast === 'function') {
                mostrarToast('Almoco aplicado no periodo com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao aplicar almoco: ${error.message}`, 'error');
            }
        }
    };

    window.restaurarAlmocoPadraoEscala = restaurarAlmocoPadraoEscala = async function restaurarAlmocoPadraoEscalaAtualizado(colaboradorId) {
        const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

        if (!colaborador) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Colaborador nao encontrado para restaurar o almoco.', 'warning');
            }
            return;
        }

        const inicioInput = document.getElementById(`escalaAlmocoInicio-${colaboradorId}`);
        const fimInput = document.getElementById(`escalaAlmocoFim-${colaboradorId}`);

        if (inicioInput) {
            inicioInput.value = formatarHora(colaborador.AlmocoInicio) || '';
        }

        if (fimInput) {
            fimInput.value = formatarHora(colaborador.AlmocoFim) || '';
        }

        syncScaleDragEditorEscala(colaboradorId);
        await salvarEscalaDia(colaboradorId);
    };

    function obterDataSelecionadaEscala() {
        return document.getElementById('seletorDataEscala')?.value || getCurrentScaleState()?.dataISO || toISODateEscala(new Date());
    }

    function shiftIsoDateEscala(dataISO, deltaDays) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const [year, month, day] = normalized.split('-').map(Number);
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + Number(deltaDays || 0));
        return toISODateEscala(nextDate);
    }

    async function carregarEscalaSelecionadaEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        window.dataEscalaSelecionada = normalized;
        await carregarEscalaDiaEscala(normalized);
        atualizarAcoesCabecalhoEscala();
    }

    function atualizarAcoesCabecalhoEscala() {
        const botaoPlantao = document.getElementById('btnAbrirPlantaoEscala');
        const dataISO = obterDataSelecionadaEscala();
        const isSaturday = getIsoDayOfWeekEscala(dataISO) === 6;

        if (!botaoPlantao) {
            return;
        }

        botaoPlantao.disabled = !isSaturday;
        botaoPlantao.title = isSaturday
            ? 'Abrir o plantao do sabado selecionado'
            : 'Selecione um sabado para abrir o plantao';
        botaoPlantao.classList.toggle('is-disabled', !isSaturday);
    }

    function atualizarBotaoRestaurarAlmocosEscala() {
        const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');

        if (!button) {
            return;
        }

        const hasVisibleItems = filterScaleItemsBySectorEscala(getCurrentScaleState().items || []).length > 0;
        button.disabled = !hasVisibleItems;
        button.classList.toggle('is-disabled', !hasVisibleItems);
        button.title = hasVisibleItems
            ? 'Restaurar os almocos da data para o horario cadastrado nos colaboradores'
            : 'Nao ha colaboradores visiveis para restaurar nesta data';
    }

    function getSelectedScaleSectorContextEscala() {
        const filterId = getScaleSectorFilterEscala();

        if (filterId === 'all') {
            return {
                setorId: null,
                setorNome: 'todos os setores'
            };
        }

        const selected = buildScaleSectorFiltersEscala(getCurrentScaleState().items || [])
            .find((item) => String(item.id) === String(filterId));

        return {
            setorId: Number(filterId),
            setorNome: selected?.nome || `setor ${filterId}`
        };
    }

    async function restaurarAlmocosCadastroDiaEscala() {
        const state = getCurrentScaleState();
        const dataISO = obterDataSelecionadaEscala();
        const visibleItems = filterScaleItemsBySectorEscala(state.items || []);

        if (visibleItems.length === 0) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Nao ha colaboradores visiveis para restaurar nesta data.', 'warning');
            }
            return;
        }

        const setor = getSelectedScaleSectorContextEscala();
        const scopeLabel = setor.setorId ? `do setor ${setor.setorNome}` : 'de todos os setores';
        const confirmed = window.confirm(
            `Restaurar os almocos ${scopeLabel} em ${formatDatePtBrEscala(dataISO)} para o horario do cadastro?`
        );

        if (!confirmed) {
            return;
        }

        const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');
        const selectedEditorId = window.__escalaEditorColaboradorId;

        if (button) {
            button.disabled = true;
            button.classList.add('is-loading');
        }

        try {
            const payload = await window.API.restaurarAlmocosCadastroEscala(dataISO, {
                setorId: setor.setorId || undefined
            });
            const result = payload?.data || {};

            window.__escalaLunchDrafts = {};
            await carregarEscalaSelecionadaEscala(dataISO);

            if (selectedEditorId && getScaleEditorRecordEscala(selectedEditorId)) {
                abrirEditorNaEscala(selectedEditorId);
            }

            const details = [
                `${result.updated || 0} almoco(s) restaurado(s)`,
                result.invalidos ? `${result.invalidos} fora da jornada` : '',
                result.semCadastro ? `${result.semCadastro} sem almoco no cadastro` : ''
            ].filter(Boolean).join(', ');

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Restauracao concluida: ${details}.`, result.updated ? 'success' : 'warning');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao restaurar almocos: ${error.message}`, 'error');
            }
        } finally {
            if (button) {
                button.classList.remove('is-loading');
                atualizarBotaoRestaurarAlmocosEscala();
            }
        }
    }

    function abrirLancamentoPessoalEscala() {
        const dataISO = obterDataSelecionadaEscala();

        if (typeof window.abrirModalLancamento === 'function') {
            window.abrirModalLancamento('pessoal', dataISO, true);
        }
    }

    function abrirPlantaoDaEscala() {
        const dataISO = obterDataSelecionadaEscala();

        if (getIsoDayOfWeekEscala(dataISO) !== 6) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Selecione um sabado para abrir o plantao.', 'warning');
            }
            return;
        }

        window.__plantaoSabadoAncoraISO = dataISO;
        window.__plantaoDataFocoISO = dataISO;

        if (typeof carregarPagina === 'function') {
            carregarPagina('lancamentoPlantao');
        }
    }

    window.renderEscalaDia = renderEscalaDia = async function renderEscalaDiaAtualizada() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        const todayISO = toISODateEscala(window.dataEscalaSelecionada || new Date());

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
        ]);

        appContent.innerHTML = `
            <div class="escala-page">
                <div class="escala-sticky-panel">
                <div class="escala-header">
                    <h1>Escala do Dia</h1>
                    <p>Visualize e gerencie a escala de trabalhos do dia selecionado.</p>
                </div>

                <div class="escala-toolbar">
                    <div class="toolbar-actions data-selector">
                        <button id="btnDiaAnteriorEscala" class="btn-secondary btn-day-nav" type="button" title="Dia anterior" aria-label="Dia anterior">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <label class="escala-date-shell" for="seletorDataEscala">
                            <i class="fas fa-calendar-alt"></i>
                            <input type="date" id="seletorDataEscala" value="${escapeHtmlEscala(todayISO)}" class="form-control date-input">
                            <span class="escala-date-chevron">
                                <i class="fas fa-chevron-down"></i>
                            </span>
                        </label>
                        <button id="btnDiaProximoEscala" class="btn-secondary btn-day-nav" type="button" title="Próximo dia" aria-label="Próximo dia">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <button id="btnNovoLancamentoEscala" class="btn-secondary">
                            <i class="fas fa-plus"></i> Novo lancamento
                        </button>
                        <button id="btnAbrirPlantaoEscala" class="btn-secondary">
                            <i class="fas fa-calendar-check"></i> Abrir plantao
                        </button>
                        <button id="btnRestaurarAlmocosCadastroEscala" class="btn-secondary btn-reset-lunch" type="button">
                            <i class="fas fa-rotate-left"></i> Resetar almocos
                        </button>
                    </div>

                    <div class="legenda-timeline legenda">
                        <span class="legenda-item"><span class="cor trabalhando"></span> Trabalhando</span>
                        <span class="legenda-item"><span class="cor almoco"></span> Almoco</span>
                        <span class="legenda-item"><span class="cor folga"></span> Folga</span>
                        <span class="legenda-item"><span class="cor ferias"></span> Ferias</span>
                        <span class="legenda-item"><span class="cor ausencia"></span> Ausencia</span>
                        <span class="legenda-item"><span class="cor ausencia-parcial"></span> Ausencia parcial</span>
                        <span class="legenda-item"><span class="cor fora"></span> Fora</span>
                    </div>
                </div>

                </div>

                <div class="escala-view-controls">
                    <div class="escala-sector-tabs" id="escalaSectorTabs"></div>
                    <label class="escala-select-chip" for="escalaSortMode">
                        <span>Organizar</span>
                        <select id="escalaSortMode" class="form-control">
                            <option value="alpha">Por nome</option>
                            <option value="work_start">Por inicio da jornada</option>
                            <option value="lunch_start">Por inicio do almoco</option>
                            <option value="lunch_end">Por fim do almoco</option>
                        </select>
                    </label>
                    <div class="escala-hint-chip">
                        <i class="fas fa-hand-pointer"></i>
                        <span>Clique em um colaborador para editar na barra lateral.</span>
                    </div>
                </div>

                <div class="escala-layout">
                    <div class="escala-card escala-main-card">
                        <div class="escala-scroll">
                            <div class="timeline-container">
                                <div class="timeline-header" id="timelineHeader"></div>
                                <div id="timelineBody" class="timeline-body"></div>
                            </div>
                        </div>
                    </div>

                    <div id="sidebarEditor" class="editor-sidebar collapsed">
                        <div class="editor-toggle" id="toggleEditor">
                            <i class="fas fa-chevron-left" id="toggleIcon"></i>
                        </div>
                        <div class="editor-content">
                            <h3><i class="fas fa-clock"></i> Ajustes da escala</h3>
                            <div id="editorContent" class="editor-form">
                                <div class="editor-empty">
                                    <i class="fas fa-arrow-left"></i>
                                    <p>Clique no nome de um colaborador para editar o dia ou aplicar almoco por periodo.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;

        ensureScaleSidebarToggleEscala();
        bindScaleOutsideSelectionEscala();
        atualizarAcoesCabecalhoEscala();

        document.getElementById('btnDiaAnteriorEscala')?.addEventListener('click', async () => {
            const nextDate = shiftIsoDateEscala(obterDataSelecionadaEscala(), -1);
            await carregarEscalaSelecionadaEscala(nextDate);
        });

        document.getElementById('btnDiaProximoEscala')?.addEventListener('click', async () => {
            const nextDate = shiftIsoDateEscala(obterDataSelecionadaEscala(), 1);
            await carregarEscalaSelecionadaEscala(nextDate);
        });

        document.getElementById('seletorDataEscala')?.addEventListener('change', async (event) => {
            await carregarEscalaSelecionadaEscala(event.target.value);
        });

        document.getElementById('btnNovoLancamentoEscala')?.addEventListener('click', abrirLancamentoPessoalEscala);
        document.getElementById('btnAbrirPlantaoEscala')?.addEventListener('click', abrirPlantaoDaEscala);
        document.getElementById('btnRestaurarAlmocosCadastroEscala')?.addEventListener('click', restaurarAlmocosCadastroDiaEscala);
        document.getElementById('escalaSortMode')?.addEventListener('change', (event) => {
            setScaleSortModeEscala(event.target.value);
            renderScaleRowsEscala(getCurrentScaleState());
        });
        setScaleSortModeEscala(getScaleSortModeEscala());

        try {
            await carregarEscalaSelecionadaEscala(todayISO);
        } catch (error) {
            renderScaleHeaderEscala();
            renderScaleEmptyMessageEscala(todayISO);
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao carregar escala: ${error.message}`, 'error');
            }
        }
    };

    function getCurrentPageKeyEscala() {
        const hash = (window.location.hash || '#dashboard').replace(/^#/, '').trim();
        return hash || 'dashboard';
    }

    async function refreshEscalaViewEscala() {
        if (!document.getElementById('timelineBody')) {
            return;
        }

        const selectedDate = obterDataSelecionadaEscala();
        await carregarEscalaDiaEscala(selectedDate);
        atualizarAcoesCabecalhoEscala();

        if (window.__escalaEditorColaboradorId) {
            abrirEditorNaEscala(window.__escalaEditorColaboradorId);
        }
    }

    function refreshColaboradoresViewEscala() {
        if (!isColaboradoresScreenVisible() || typeof renderListaColaboradores !== 'function') {
            return;
        }

        const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
        const lista = termoBusca
            ? (window.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
            : (window.colaboradores || []);

        renderListaColaboradores(lista);
    }

    function captureRelatoriosStateEscala() {
        const visualization = document.getElementById('relatorioVisualizacao');
        const title = document.getElementById('relatorioTitulo')?.innerText || '';

        return {
            reportVisible: Boolean(visualization && visualization.style.display !== 'none'),
            reportTitle: title,
            escalaMode: document.getElementById('relatorioEscalaModo')?.value || RELATORIO_ESCALA_MODOS.QUADRO_MENSAL,
            escalaMes: document.getElementById('relatorioEscalaMes')?.value || '',
            escalaAno: document.getElementById('relatorioEscalaAno')?.value || '',
            escalaDataInicio: document.getElementById('relatorioEscalaDataInicio')?.value || '',
            escalaDataFim: document.getElementById('relatorioEscalaDataFim')?.value || '',
            escalaSetor: document.getElementById('relatorioEscalaSetor')?.value || '',
            escalaColaborador: document.getElementById('relatorioEscalaColaborador')?.value || '',
            escalaTipo: document.getElementById('relatorioEscalaTipo')?.value || '',
            plantaoDataInicio: document.getElementById('relatorioPlantaoDataInicio')?.value || '',
            plantaoDataFim: document.getElementById('relatorioPlantaoDataFim')?.value || '',
            plantaoColaborador: document.getElementById('relatorioPlantaoColaborador')?.value || '',
            plantaoStatus: document.getElementById('relatorioPlantaoStatus')?.value || 'todos'
        };
    }

    function restoreRelatoriosStateEscala(snapshot) {
        const setValue = (id, value) => {
            const element = document.getElementById(id);
            if (element && value !== undefined) {
                element.value = value;
            }
        };

        setValue('relatorioEscalaModo', snapshot.escalaMode);
        if (typeof toggleEscalaReportModeFilters === 'function') {
            toggleEscalaReportModeFilters();
        }

        setValue('relatorioEscalaMes', snapshot.escalaMes);
        setValue('relatorioEscalaAno', snapshot.escalaAno);
        setValue('relatorioEscalaDataInicio', snapshot.escalaDataInicio);
        setValue('relatorioEscalaDataFim', snapshot.escalaDataFim);
        setValue('relatorioEscalaSetor', snapshot.escalaSetor);
        setValue('relatorioEscalaColaborador', snapshot.escalaColaborador);
        setValue('relatorioEscalaTipo', snapshot.escalaTipo);
        setValue('relatorioPlantaoDataInicio', snapshot.plantaoDataInicio);
        setValue('relatorioPlantaoDataFim', snapshot.plantaoDataFim);
        setValue('relatorioPlantaoColaborador', snapshot.plantaoColaborador);
        setValue('relatorioPlantaoStatus', snapshot.plantaoStatus);
    }

    async function refreshRelatoriosViewEscala() {
        if (!document.querySelector('.relatorios-grid')) {
            return;
        }

        const snapshot = captureRelatoriosStateEscala();

        if (!snapshot.reportVisible || typeof renderRelatorios !== 'function') {
            return;
        }

        await renderRelatorios();
        restoreRelatoriosStateEscala(snapshot);

        const reportKey = window.normalizeRuntimeToken(snapshot.reportTitle);

        if (reportKey.includes('plantao') && typeof gerarRelatorioPlantoes === 'function') {
            await gerarRelatorioPlantoes();
            return;
        }

        if (reportKey.includes('escala') && typeof gerarRelatorioEscala === 'function') {
            await gerarRelatorioEscala();
            return;
        }

        if ((reportKey.includes('mensal') || reportKey.includes('completo')) && typeof gerarRelatorioCompleto === 'function') {
            await gerarRelatorioCompleto();
        }
    }

    window.__refreshVisibleViews = async function refreshVisibleViewsEscala(options = {}) {
        if (document.getElementById('calendar') && typeof gerarCalendario === 'function') {
            const mes = window.mesAtual ?? new Date().getMonth();
            const ano = window.anoAtual ?? new Date().getFullYear();
            gerarCalendario(mes, ano);
        }

        if (typeof gerarLegendaMensal === 'function') {
            gerarLegendaMensal();
        }

        const currentPage = getCurrentPageKeyEscala();

        if (currentPage === 'dashboard' && typeof renderDashboard === 'function') {
            await renderDashboard();
            return;
        }

        if (currentPage === 'escala') {
            await refreshEscalaViewEscala();
            return;
        }

        if (currentPage === 'lancamentoPlantao' && typeof renderLancamentoPlantao === 'function') {
            await renderLancamentoPlantao();
            return;
        }

        if (currentPage === 'colaboradores') {
            refreshColaboradoresViewEscala();
            return;
        }

        if (currentPage === 'relatorios') {
            await refreshRelatoriosViewEscala();
        }
    };

    window.editarPlantao = editarPlantao = function editarPlantaoSeguroEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (typeof window.abrirEditorPlantao === 'function') {
            window.abrirEditorPlantao(normalized, formatDatePtBrEscala(normalized));
        }
    };

    function buildColaboradorOptionsEscala(selectedId = '') {
        return `
            <option value="">Todos os colaboradores</option>
            ${(window.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(item.Nome)}
                </option>
            `).join('')}
        `;
    }

    function getSetorIdFromItemEscala(item) {
        return item?.id ?? item?.Id ?? item?.setorId ?? item?.SetorId ?? null;
    }

    function getSetorNomeFromItemEscala(item) {
        return item?.nome ?? item?.Nome ?? item?.setorNome ?? item?.SetorNome ?? '';
    }

    function buildSetorOptionsRelatorioEscala(selectedId = '') {
        const setoresOrdenados = [...(window.setores || [])]
            .map((item) => ({
                id: getSetorIdFromItemEscala(item),
                nome: getSetorNomeFromItemEscala(item)
            }))
            .filter((item) => item.id !== null && item.id !== undefined && String(item.id).trim() !== '')
            .sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR', { sensitivity: 'base' }));

        return `
            <option value="">Todos os setores</option>
            ${setoresOrdenados.map((setor) => `
                <option value="${escapeHtmlEscala(String(setor.id))}" ${String(selectedId) === String(setor.id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(setor.nome || 'Sem nome')}
                </option>
            `).join('')}
        `;
    }

    function getRelatorioEscalaSetorId() {
        const value = document.getElementById('relatorioEscalaSetor')?.value || '';
        return value ? String(value) : '';
    }

    function getRelatorioEscalaSetorNome(setorId = getRelatorioEscalaSetorId()) {
        if (!setorId) {
            return 'Todos os setores';
        }

        const setor = (window.setores || []).find((item) => String(getSetorIdFromItemEscala(item)) === String(setorId));
        const nome = getSetorNomeFromItemEscala(setor);
        return nome || `Setor ${setorId}`;
    }

    function getRelatorioEscalaSetorFileSuffix(setorId = getRelatorioEscalaSetorId()) {
        if (!setorId) {
            return '';
        }

        return `_${getRelatorioEscalaSetorNome(setorId)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || `Setor_${setorId}`}`;
    }

    function renderRelatorioEscalaFiltrosAtivos(filters = {}) {
        const setorNome = filters.setorNome || getRelatorioEscalaSetorNome(filters.setorId);

        if (!filters.setorId) {
            return '';
        }

        return `
            <div class="relatorio-filtros-ativos">
                <span><i class="fas fa-building"></i> Setor: <strong>${escapeHtmlEscala(setorNome)}</strong></span>
            </div>
        `;
    }

    function buildTipoOptionsEscala(selectedType = '') {
        return `
            <option value="">Todos os tipos</option>
            ${Object.entries(TIPO_LABELS).map(([value, label]) => `
                <option value="${value}" ${selectedType === value ? 'selected' : ''}>${label}</option>
            `).join('')}
        `;
    }

    function renderDetailedEscalaReport(items, filters) {
        if (!items.length) {
            return `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <p>Nenhum registro encontrado para o periodo informado.</p>
                </div>
            `;
        }

        const normalizedItems = normalizeEscalaReportItems(items);
        const setorGroups = groupEscalaItemsBySetor(normalizedItems);
        const colaboradoresUnicos = new Set(normalizedItems.map((item) => String(item.colaboradorId || item.colaboradorNome || ''))).size;
        const resumo = normalizedItems.reduce((accumulator, item) => {
            accumulator[item.tipo] = (accumulator[item.tipo] || 0) + 1;
            return accumulator;
        }, {
            normal: 0,
            plantao: 0,
            folga: 0,
            ferias: 0,
            ausencia: 0,
            ajuste: 0
        });

        return `
            <div class="relatorio-tabela-container">
                ${renderRelatorioEscalaFiltrosAtivos(filters)}
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio))}</strong>
                    ate
                    <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim))}</strong>
                    • Registros: <strong>${items.length}</strong>
                </div>
                <div class="resumo-cards" style="margin-bottom: 18px;">
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-list-check"></i>
                        <div>
                            <strong>${normalizedItems.length}</strong>
                            <span>Registros retornados</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-users"></i>
                        <div>
                            <strong>${colaboradoresUnicos}</strong>
                            <span>Colaboradores no periodo</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-layer-group"></i>
                        <div>
                            <strong>${setorGroups.length}</strong>
                            <span>Setores</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-calendar-check"></i>
                        <div>
                            <strong>${resumo.plantao}</strong>
                            <span>Plantoes</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-user-clock"></i>
                        <div>
                            <strong>${resumo.ausencia + resumo.folga + resumo.ferias}</strong>
                            <span>Ausencias, folgas e ferias</span>
                        </div>
                    </div>
                </div>
                ${setorGroups.map((group) => `
                    <section class="relatorio-setor-section">
                        <div class="relatorio-setor-header">
                            <span><i class="fas fa-layer-group"></i> ${escapeHtmlEscala(group.setorNome)}</span>
                            <strong>${group.items.length} registro(s)</strong>
                        </div>
                        <table class="relatorio-tabela escala-detalhada-tabela">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Dia</th>
                                    <th>Colaborador</th>
                                    <th>Entrada</th>
                                    <th>Saida</th>
                                    <th>Almoco</th>
                                    <th>Tipo</th>
                                    <th>Observacoes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.items.map((item) => `
                                    <tr>
                                        <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</strong></td>
                                        <td>${escapeHtmlEscala(item.diaSemana || getDayLabelEscala(item.dataISO))}</td>
                                        <td>${escapeHtmlEscala(item.colaboradorNome || '--')}</td>
                                        <td>${escapeHtmlEscala(item.horaInicio || '--')}</td>
                                        <td>${escapeHtmlEscala(item.horaFim || '--')}</td>
                                        <td>${escapeHtmlEscala(item.almoco || '--')}</td>
                                        <td><span class="evento-tipo badge-${escapeHtmlEscala(item.tipo)}">${escapeHtmlEscala(TIPO_LABELS[item.tipo] || item.tipo || '--')}</span></td>
                                        <td>${escapeHtmlEscala(item.observacao || '--')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </section>
                `).join('')}
            </div>
        `;
    }

    function chunkEscalaItems(items, chunkSize) {
        const source = Array.isArray(items) ? items : [];
        const size = Math.max(Number(chunkSize) || 1, 1);
        const chunks = [];

        for (let index = 0; index < source.length; index += size) {
            chunks.push(source.slice(index, index + size));
        }

        return chunks;
    }

    function buildEscalaExportStats(items, feriados = []) {
        const counters = {
            totalRegistros: Array.isArray(items) ? items.length : 0,
            colaboradores: 0,
            plantoes: 0,
            ausencias: 0,
            ferias: 0,
            folgas: 0,
            ajustes: 0,
            normais: 0,
            feriados: Array.isArray(feriados) ? feriados.length : 0
        };
        const colaboradoresSet = new Set();

        (Array.isArray(items) ? items : []).forEach((item) => {
            const colaboradorKey = item.colaboradorId || item.colaboradorNome;

            if (colaboradorKey) {
                colaboradoresSet.add(String(colaboradorKey));
            }

            switch (String(item.tipo || '').toLowerCase()) {
                case 'plantao':
                    counters.plantoes += 1;
                    break;
                case 'ausencia':
                    counters.ausencias += 1;
                    break;
                case 'ferias':
                    counters.ferias += 1;
                    break;
                case 'folga':
                    counters.folgas += 1;
                    break;
                case 'ajuste':
                    counters.ajustes += 1;
                    break;
                default:
                    counters.normais += 1;
                    break;
            }
        });

        counters.colaboradores = colaboradoresSet.size;
        return counters;
    }

    function collectYearsInRange(startISO, endISO) {
        const years = new Set();
        const startYear = Number(String(startISO).slice(0, 4));
        const endYear = Number(String(endISO).slice(0, 4));

        for (let year = startYear; year <= endYear; year += 1) {
            years.add(year);
        }

        return [...years];
    }

    async function collectEscalaHolidayItems(startISO, endISO) {
        const merged = new Map();

        if (typeof carregarFeriadosLocais === 'function') {
            try {
                await carregarFeriadosLocais();
            } catch (error) {
                // ignore
            }
        }

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = String(item.Data || item.data || '').split('T')[0];

            if (!dataISO || dataISO < startISO || dataISO > endISO) {
                return;
            }

            const key = `${dataISO}|${item.Nome || item.nome || 'Feriado'}`;
            merged.set(key, {
                dataISO,
                nome: item.Nome || item.nome || 'Feriado',
                origem: 'local'
            });
        });

        const years = collectYearsInRange(startISO, endISO);
        const nationalHolidayResults = await Promise.all(years.map(async (year) => {
            if (typeof carregarFeriadosAPI !== 'function') {
                return [];
            }

            try {
                const result = await carregarFeriadosAPI(year);
                return Array.isArray(result) ? result : [];
            } catch (error) {
                return [];
            }
        }));

        nationalHolidayResults.flat().forEach((item) => {
            const dataISO = String(item.date || item.data || '').split('T')[0];

            if (!dataISO || dataISO < startISO || dataISO > endISO) {
                return;
            }

            const key = `${dataISO}|${item.name || item.nome || 'Feriado nacional'}`;

            if (!merged.has(key)) {
                merged.set(key, {
                    dataISO,
                    nome: item.name || item.nome || 'Feriado nacional',
                    origem: 'nacional'
                });
            }
        });

        return [...merged.values()].sort((first, second) => String(first.dataISO).localeCompare(String(second.dataISO)));
    }

    function renderEscalaExportStats(stats) {
        return `
            <div class="escala-export-meta">
                <span>Colaboradores: <strong>${stats.colaboradores}</strong></span>
                <span>Plantoes: <strong>${stats.plantoes}</strong></span>
                <span>Ausencias: <strong>${stats.ausencias}</strong></span>
                <span>Ferias: <strong>${stats.ferias}</strong></span>
                <span>Folgas: <strong>${stats.folgas}</strong></span>
                <span>Feriados: <strong>${stats.feriados}</strong></span>
            </div>
        `;
    }

    function renderEscalaHolidayList(feriados) {
        if (!Array.isArray(feriados) || feriados.length === 0) {
            return '';
        }

        const visible = feriados.slice(0, 8);

        return `
            <div class="escala-export-holidays">
                <strong>Feriados no periodo</strong>
                <ul>
                    ${visible.map((item) => `
                        <li>
                            <span>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</span>
                            <span>${escapeHtmlEscala(item.nome)}</span>
                        </li>
                    `).join('')}
                    ${feriados.length > visible.length ? `
                        <li class="is-muted">
                            <span>... e mais ${feriados.length - visible.length} feriados</span>
                        </li>
                    ` : ''}
                </ul>
            </div>
        `;
    }

    function compactEscalaExportLabel(value) {
        return String(value || '--')
            .replace(/\s+às\s+/gi, '-')
            .replace(/\s+-\s+/g, '-')
            .replace(/\s+/g, ' ')
            .trim() || '--';
    }

    function compactEscalaExportName(value) {
        const name = String(value || '--').replace(/\s+/g, ' ').trim();

        if (name.length <= 12) {
            return name;
        }

        const parts = name.split(' ').filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0]} ${parts[1].charAt(0)}.`;
        }

        return `${name.slice(0, 13)}...`;
    }

    function renderEscalaExportDayCard(day) {
        if (!day) {
            return '<article class="escala-export-dia-placeholder" aria-hidden="true"></article>';
        }

        if (!day.hasScale || !Array.isArray(day.rows) || day.rows.length === 0) {
            return `
                <article class="escala-export-dia is-empty">
                    <div class="escala-export-dia-header">${escapeHtmlEscala(day.dateLabel || '--')}</div>
                    <div class="escala-export-empty">Sem escala</div>
                </article>
            `;
        }

        return `
            <article class="escala-export-dia">
                <div class="escala-export-dia-header">${escapeHtmlEscala(day.dateLabel || '--')}</div>
                <div class="escala-export-lines">
                    ${day.rows.map((row) => `
                        <div class="escala-export-line">
                            <span class="escala-export-time">${escapeHtmlEscala(compactEscalaExportLabel(row.almocoLabel))}</span>
                            <strong title="${escapeHtmlEscala(row.colaboradorNome || '--')}">${escapeHtmlEscala(compactEscalaExportName(row.colaboradorNome))}</strong>
                            <span class="escala-export-work">${escapeHtmlEscala(compactEscalaExportLabel(row.jornadaLabel))}</span>
                        </div>
                    `).join('')}
                </div>
            </article>
        `;
    }

    function getEscalaExportDayRowCount(day) {
        return Array.isArray(day?.rows) ? day.rows.length : 0;
    }

    function applyEscalaExportRowspan(rows, labelKey, showKey, rowspanKey) {
        let index = 0;

        while (index < rows.length) {
            const currentLabel = rows[index][labelKey];
            let end = index + 1;

            while (end < rows.length && rows[end][labelKey] === currentLabel) {
                end += 1;
            }

            rows[index][showKey] = true;
            rows[index][rowspanKey] = end - index;

            for (let current = index + 1; current < end; current += 1) {
                rows[current][showKey] = false;
                rows[current][rowspanKey] = 0;
            }

            index = end;
        }

        return rows;
    }

    function sliceEscalaExportDayRows(day, startIndex, maxRows) {
        if (!day || !Array.isArray(day.rows)) {
            return day;
        }

        const rows = day.rows.slice(startIndex, startIndex + maxRows).map((row) => ({ ...row }));

        applyEscalaExportRowspan(rows, 'almocoLabel', 'showAlmoco', 'almocoRowspan');
        applyEscalaExportRowspan(rows, 'jornadaLabel', 'showJornada', 'jornadaRowspan');

        return {
            ...day,
            rows,
            hasScale: rows.length > 0
        };
    }

    function buildEscalaExportHolidayMap(feriados) {
        const map = new Map();

        (Array.isArray(feriados) ? feriados : []).forEach((item) => {
            const dataISO = String(item?.dataISO || item?.Data || item?.data || '').split('T')[0];

            if (!dataISO) {
                return;
            }

            const nome = String(item?.nome || item?.Nome || 'Feriado').trim() || 'Feriado';

            if (!map.has(dataISO)) {
                map.set(dataISO, nome);
            }
        });

        return map;
    }

    function hasEscalaExportRows(day) {
        return Array.isArray(day?.rows) && day.rows.length > 0;
    }

    function shouldIncludeSundayInMonthlyExport(snapshot) {
        const groups = Array.isArray(snapshot?.setorGroups) && snapshot.setorGroups.length > 0
            ? snapshot.setorGroups
            : [{ calendarWeeks: Array.isArray(snapshot?.calendarWeeks) ? snapshot.calendarWeeks : [] }];

        return groups.some((group) => (
            (Array.isArray(group.calendarWeeks) ? group.calendarWeeks : []).some((week) => hasEscalaExportRows(week?.[6]))
        ));
    }

    function getEscalaExportWeekSlots(week, includeSunday) {
        const slots = Array.from({ length: 7 }, (_, index) => week?.[index] || null);
        return includeSunday ? slots : slots.slice(0, 6);
    }

    function getEscalaExportWeekdayLabels(includeSunday) {
        return includeSunday ? ESCALA_QUADRO_WEEKDAY_HEADERS : ESCALA_QUADRO_WEEKDAY_HEADERS.slice(0, 6);
    }

    function getEscalaExportEntryMaxRows(weeks, includeSunday) {
        return Math.max(0, ...weeks.flatMap((week) => (
            getEscalaExportWeekSlots(week, includeSunday).map((day) => getEscalaExportDayRowCount(day))
        )));
    }

    function getEscalaSheetDensityClass(maxRows, weekCount) {
        if (maxRows >= 17 || (weekCount > 1 && maxRows >= 13)) {
            return ' is-ultra-dense';
        }

        if (maxRows >= 11 || (weekCount > 1 && maxRows >= 9)) {
            return ' is-dense';
        }

        return '';
    }

    function getMonthlyEscalaOnePageMaxRows(weekCount) {
        if (weekCount >= 6) {
            return 9;
        }

        if (weekCount >= 5) {
            return 14;
        }

        return 18;
    }

    function shouldShowEscalaSheetLunchColumn(day, weekDayIndex) {
        if (weekDayIndex >= 5) {
            return (Array.isArray(day?.rows) ? day.rows : []).some((row) => {
                const label = String(row?.almocoLabel || '').trim();
                return label && label !== '--';
            });
        }

        return true;
    }

    function getEscalaSheetRowClassName(row) {
        const tipo = String(row?.tipo || 'normal').toLowerCase();

        if (!tipo || tipo === 'normal') {
            return '';
        }

        return ` is-${tipo}`;
    }

    function renderEscalaSheetDayTable(day, options = {}) {
        if (!day) {
            return '<article class="escala-sheet-day is-placeholder" aria-hidden="true"></article>';
        }

        const holidayLabel = options.holidayMap?.get(day.dataISO);
        const weekDayIndex = Number(options.weekDayIndex) || 0;
        const includeLunch = shouldShowEscalaSheetLunchColumn(day, weekDayIndex);
        const columnCount = includeLunch ? 3 : 2;
        const rows = Array.isArray(day.rows) ? day.rows : [];
        const hasRows = day.hasScale && rows.length > 0;
        const emptyLabel = holidayLabel ? 'FERIADO' : 'Sem escala';
        const titleAttribute = holidayLabel ? ` title="${escapeHtmlEscala(holidayLabel)}"` : '';

        return `
            <article class="escala-sheet-day${hasRows ? '' : ' is-empty'}${holidayLabel ? ' is-holiday' : ''}">
                <div class="escala-sheet-day-date"${titleAttribute}>${escapeHtmlEscala(day.dateLabel || '--')}</div>
                <table class="escala-sheet-table">
                    <colgroup>
                        ${includeLunch
                            ? '<col style="width:29%"><col style="width:41%"><col style="width:30%">'
                            : '<col style="width:66%"><col style="width:34%">'}
                    </colgroup>
                    <thead>
                        <tr>
                            ${includeLunch ? '<th>Almoco</th>' : ''}
                            <th>Colaborador</th>
                            <th>Jornada</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${hasRows ? rows.map((row) => `
                            <tr class="${getEscalaSheetRowClassName(row)}">
                                ${includeLunch && row.showAlmoco ? `<td rowspan="${row.almocoRowspan || 1}" class="escala-sheet-group">${escapeHtmlEscala(row.almocoLabel || '--')}</td>` : ''}
                                <td class="escala-sheet-name">${escapeHtmlEscala(row.colaboradorNome || '--')}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan || 1}" class="escala-sheet-group">${escapeHtmlEscala(row.jornadaLabel || '--')}</td>` : ''}
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="${columnCount}" class="escala-sheet-empty">${escapeHtmlEscala(emptyLabel)}</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </article>
        `;
    }

    async function buildEscalaExportSnapshot() {
        const modo = getEscalaReportMode();

        if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
            const filters = getEscalaMonthlyFilters();

            if (!filters) {
                throw new Error('Informe um mes e ano validos para o quadro mensal.');
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio: filters.dataInicio,
                dataFim: filters.dataFim,
                setorId: filters.setorId || undefined
            });
            const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
            const boardUtils = window.EscalaReportUtils;

            if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
                throw new Error('Os utilitarios do quadro mensal nao foram carregados.');
            }

            const feriados = await collectEscalaHolidayItems(filters.dataInicio, filters.dataFim);

            const setorGroups = groupEscalaItemsBySetor(items, { includeEmpty: true }).map((group) => {
                const days = boardUtils.buildEscalaQuadroMensal(group.items, {
                    month: filters.month,
                    year: filters.year
                });

                return {
                    ...group,
                    days,
                    calendarWeeks: getEscalaCalendarWeeks(boardUtils, days)
                };
            });
            const days = setorGroups[0]?.days || boardUtils.buildEscalaQuadroMensal([], {
                month: filters.month,
                year: filters.year
            });
            const calendarWeeks = setorGroups[0]?.calendarWeeks || getEscalaCalendarWeeks(boardUtils, days);

            return {
                mode: modo,
                title: `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`,
                fileBase: `Escala_Mensal_${filters.year}-${String(filters.month).padStart(2, '0')}${getRelatorioEscalaSetorFileSuffix(filters.setorId)}`,
                filters,
                items,
                feriados,
                stats: buildEscalaExportStats(items, feriados),
                setorGroups,
                days,
                calendarWeeks,
                calendarSlots: calendarWeeks.flat()
            };
        }

        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const setorId = getRelatorioEscalaSetorId();
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            throw new Error('Informe a data inicial e final do relatorio.');
        }

        const payload = await window.API.getEscalaRelatorio({
            dataInicio,
            dataFim,
            setorId: setorId || undefined,
            colaboradorId: colaboradorId || undefined,
            tipo: tipo || undefined
        });
        const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
        const feriados = await collectEscalaHolidayItems(dataInicio, dataFim);
        const setorGroups = groupEscalaItemsBySetor(items);

        return {
            mode: modo,
            title: `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`,
            fileBase: `Escala_Detalhada_${dataInicio}_${dataFim}${getRelatorioEscalaSetorFileSuffix(setorId)}`,
            filters: {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            },
            items,
            setorGroups,
            feriados,
            stats: buildEscalaExportStats(items, feriados)
        };
    }

    function buildMonthlyEscalaExportPageEntries(snapshot) {
        const compactWeekMaxRows = 12;
        const maxRowsPerWeekDay = 22;
        const sectorEntries = Array.isArray(snapshot.setorGroups) && snapshot.setorGroups.length > 0
            ? snapshot.setorGroups
            : [{
                setorNome: 'Sem setor',
                calendarWeeks: Array.isArray(snapshot.calendarWeeks) ? snapshot.calendarWeeks : []
            }];
        const includeSunday = shouldIncludeSundayInMonthlyExport(snapshot);

        return sectorEntries.flatMap((sector) => {
            const weeks = Array.isArray(sector.calendarWeeks) && sector.calendarWeeks.length > 0
                ? sector.calendarWeeks
                : [Array(7).fill(null)];
            const monthMaxRows = getEscalaExportEntryMaxRows(weeks, includeSunday);
            const onePageMaxRows = getMonthlyEscalaOnePageMaxRows(weeks.length);

            if (monthMaxRows <= onePageMaxRows) {
                return [{
                    sector,
                    weeks,
                    kind: 'month',
                    includeSunday,
                    label: 'Mes completo'
                }];
            }

            const entries = [];
            let weekIndex = 0;

            while (weekIndex < weeks.length) {
                const currentWeek = Array.isArray(weeks[weekIndex]) ? weeks[weekIndex] : Array(7).fill(null);
                const weekMaxRows = Math.max(0, ...currentWeek.map((day) => getEscalaExportDayRowCount(day)));
                const partCount = Math.max(1, Math.ceil(weekMaxRows / maxRowsPerWeekDay));

                if (partCount > 1) {
                    Array.from({ length: partCount }, (_, partIndex) => {
                        const startIndex = partIndex * maxRowsPerWeekDay;
                        const weekPart = currentWeek.map((day) => sliceEscalaExportDayRows(day, startIndex, maxRowsPerWeekDay));

                        entries.push({
                            sector,
                            weeks: [weekPart],
                            kind: 'week',
                            weekIndex,
                            partIndex,
                            partCount,
                            includeSunday,
                            label: `Semana ${weekIndex + 1} - parte ${partIndex + 1}`
                        });
                    });
                    weekIndex += 1;
                    continue;
                }

                const nextWeek = weeks[weekIndex + 1] || null;
                const nextWeekMaxRows = nextWeek
                    ? Math.max(0, ...nextWeek.map((day) => getEscalaExportDayRowCount(day)))
                    : 0;
                const canPairWeeks = nextWeek
                    && weekMaxRows <= compactWeekMaxRows
                    && nextWeekMaxRows <= compactWeekMaxRows;
                const entryWeeks = canPairWeeks ? [currentWeek, nextWeek] : [currentWeek];
                const endWeekIndex = weekIndex + entryWeeks.length - 1;

                entries.push({
                    sector,
                    weeks: entryWeeks,
                    kind: entryWeeks.length > 1 ? 'weeks' : 'week',
                    weekIndex,
                    endWeekIndex,
                    includeSunday,
                    label: entryWeeks.length > 1
                        ? `Semanas ${weekIndex + 1}-${endWeekIndex + 1}`
                        : `Semana ${weekIndex + 1}`
                });

                weekIndex += entryWeeks.length;
            }

            return entries;
        });
    }

    function renderMonthlyEscalaExportPages(snapshot) {
        const pageEntries = buildMonthlyEscalaExportPageEntries(snapshot);
        const holidayMap = buildEscalaExportHolidayMap(snapshot.feriados);
        const pageTitle = formatEscalaMonthHeading(snapshot.filters?.month, snapshot.filters?.year);

        return pageEntries.map((entry, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-month-page${getEscalaSheetDensityClass(getEscalaExportEntryMaxRows(entry.weeks, entry.includeSunday), entry.weeks.length)}">
                <div class="escala-sheet-title">${escapeHtmlEscala(pageTitle)}</div>
                <div class="escala-sheet-meta">
                    <strong>Setor: ${escapeHtmlEscala(entry.sector.setorNome || 'Sem setor')}</strong>
                    <span>${escapeHtmlEscala(entry.label)} - Pagina ${pageIndex + 1} de ${pageEntries.length}</span>
                </div>
                <div class="escala-sheet-weekdays" style="--weekday-count:${entry.includeSunday ? 7 : 6};">
                    ${getEscalaExportWeekdayLabels(entry.includeSunday).map((label) => `<span>${escapeHtmlEscala(label)}</span>`).join('')}
                </div>
                <div class="escala-sheet-grid" style="--weekday-count:${entry.includeSunday ? 7 : 6}; --week-count:${entry.weeks.length || 1};">
                    ${entry.weeks.flatMap((week) => (
                        getEscalaExportWeekSlots(week, entry.includeSunday).map((day, weekDayIndex) => renderEscalaSheetDayTable(day, {
                            weekDayIndex,
                            holidayMap
                        }))
                    )).join('')}
                </div>
            </section>
        `).join('');
    }

    function renderDetailedEscalaExportPages(snapshot) {
        const setorGroups = Array.isArray(snapshot.setorGroups) && snapshot.setorGroups.length > 0
            ? snapshot.setorGroups
            : groupEscalaItemsBySetor(snapshot.items);
        const pageEntries = [];

        (setorGroups.length > 0 ? setorGroups : [{ setorNome: 'Sem setor', items: [] }]).forEach((sector) => {
            const chunks = chunkEscalaItems(sector.items, 22);
            const pages = chunks.length > 0 ? chunks : [[]];

            pages.forEach((group, sectorPageIndex) => {
                pageEntries.push({
                    sector,
                    group,
                    sectorPageIndex,
                    sectorPageCount: pages.length
                });
            });
        });

        return pageEntries.map((entry, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-detailed">
                <div class="escala-export-header">
                    <h1>${escapeHtmlEscala(snapshot.title)}</h1>
                    <p>Pagina ${pageIndex + 1} de ${pageEntries.length}</p>
                </div>
                ${pageIndex === 0 ? `
                    <div class="escala-export-summary">
                        <span>Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataInicio))}</strong> ate <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataFim))}</strong></span>
                        ${snapshot.filters.setorId ? `<span>Setor: <strong>${escapeHtmlEscala(snapshot.filters.setorNome || getRelatorioEscalaSetorNome(snapshot.filters.setorId))}</strong></span>` : ''}
                        <span>Registros: <strong>${snapshot.items.length}</strong></span>
                        <span>Setores: <strong>${setorGroups.length}</strong></span>
                    </div>
                    ${renderEscalaExportStats(snapshot.stats)}
                    ${renderEscalaHolidayList(snapshot.feriados)}
                ` : ''}
                <div class="relatorio-setor-header escala-export-setor-header">
                    <span>Setor: ${escapeHtmlEscala(entry.sector.setorNome || 'Sem setor')}</span>
                    <strong>${entry.sector.items.length} registro(s)</strong>
                </div>
                <table class="relatorio-tabela escala-detalhada-tabela escala-export-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Dia</th>
                            <th>Colaborador</th>
                            <th>Entrada</th>
                            <th>Saida</th>
                            <th>Almoco</th>
                            <th>Tipo</th>
                            <th>Observacoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entry.group.map((item) => `
                            <tr>
                                <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</strong></td>
                                <td>${escapeHtmlEscala(item.diaSemana || getDayLabelEscala(item.dataISO))}</td>
                                <td>${escapeHtmlEscala(item.colaboradorNome || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaInicio || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaFim || '--')}</td>
                                <td>${escapeHtmlEscala(item.almoco || '--')}</td>
                                <td>${escapeHtmlEscala(TIPO_LABELS[item.tipo] || item.tipo || '--')}</td>
                                <td>${escapeHtmlEscala(item.observacao || '--')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
        `).join('');
    }

    function gerarHtmlPdfRelatorioEscala(snapshot) {
        const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;
        const pageMetrics = isMonthlyExport
            ? {
                bodyWidth: 1660,
                pageWidth: 1660,
                pageHeight: 1160,
                pagePadding: 6,
                gridMinHeight: 1010,
                titleSize: 28,
                sectorHeaderSize: 18,
                dayHeaderSize: 18,
                tableFontSize: 14
            }
            : {
                bodyWidth: 1480,
                pageWidth: 1444,
                pageHeight: 980,
                pagePadding: 10,
                gridMinHeight: 900,
                titleSize: 28,
                sectorHeaderSize: 13,
                dayHeaderSize: 12,
                tableFontSize: 10
            };
        const bodyHtml = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL
            ? renderMonthlyEscalaExportPages(snapshot)
            : renderDetailedEscalaExportPages(snapshot);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtmlEscala(snapshot.title)}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        background: #ffffff;
                        color: #0f172a;
                        width: ${pageMetrics.bodyWidth}px;
                        padding: ${isMonthlyExport ? 0 : 16}px;
                    }
                    .pdf-pagina {
                        width: ${pageMetrics.pageWidth}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        height: auto;
                        background: white;
                        padding: ${pageMetrics.pagePadding}px;
                        display: flex;
                        flex-direction: column;
                        overflow: visible;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 24px;
                    }
                    .escala-export-month-page {
                        height: ${pageMetrics.pageHeight}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        overflow: hidden;
                        background: #ffffff;
                        color: #000000;
                    }
                    .escala-export-month-page + .escala-export-month-page {
                        margin-top: 0;
                    }
                    .escala-sheet-title {
                        background: #28577e;
                        border: 2px solid #111111;
                        color: #ffffff;
                        font-size: 42px;
                        font-weight: 900;
                        line-height: 1;
                        padding: 8px 10px 9px;
                        text-align: center;
                        text-transform: uppercase;
                    }
                    .escala-sheet-meta {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 5px 2px 6px;
                        color: #111111;
                        font-size: 14px;
                        font-weight: 700;
                    }
                    .escala-sheet-meta span {
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .escala-sheet-weekdays {
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        gap: 5px;
                        margin-bottom: 5px;
                    }
                    .escala-sheet-weekdays span {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 48px;
                        padding: 4px 6px;
                        background: #28577e;
                        border: 2px solid #ffffff;
                        color: #ffffff;
                        font-size: 17px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-grid {
                        flex: 1;
                        min-height: 0;
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 2), auto);
                        column-gap: 8px;
                        row-gap: 14px;
                        align-content: start;
                        align-items: start;
                    }
                    .escala-sheet-day {
                        min-width: 0;
                        min-height: 0;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        background: #f8fafc;
                        border: 1.5px solid #172033;
                        box-shadow: 0 0 0 2px #e2e8f0;
                    }
                    .escala-sheet-day.is-placeholder {
                        border-color: transparent;
                        background: #ffffff;
                        box-shadow: none;
                    }
                    .escala-sheet-day-date {
                        padding: 2px 5px;
                        background: #28577e;
                        border-bottom: 1.5px solid #111111;
                        color: #ffffff;
                        font-size: 15px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-table {
                        width: 100%;
                        height: auto;
                        flex: 0 0 auto;
                        border-collapse: collapse;
                        table-layout: fixed;
                        background: #ffffff;
                    }
                    .escala-sheet-table th,
                    .escala-sheet-table td {
                        border: 1px solid #2f3a46;
                        color: #000000;
                        font-size: 11px;
                        line-height: 1;
                        padding: 1px 2px;
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-sheet-table th {
                        height: 15px;
                        background: #b7d7f0;
                        font-weight: 900;
                    }
                    .escala-sheet-table td {
                        height: 17px;
                        background: #ffffff;
                        font-weight: 500;
                    }
                    .escala-sheet-table tbody tr:nth-child(even) td {
                        background: #f8fbff;
                    }
                    .escala-sheet-group {
                        background: #eef6fd !important;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-name {
                        background: #ffffff !important;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .escala-sheet-table tr.is-plantao .escala-sheet-name,
                    .escala-sheet-table tr.is-ajuste .escala-sheet-name,
                    .escala-sheet-table tr.is-ausencia .escala-sheet-name {
                        color: #d00000;
                        font-weight: 800;
                    }
                    .escala-sheet-empty {
                        height: 100%;
                        color: #222222 !important;
                        font-size: 13px !important;
                        font-style: italic;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-day.is-empty .escala-sheet-table {
                        height: 100%;
                        flex: 1;
                    }
                    .escala-sheet-day.is-holiday .escala-sheet-empty {
                        color: #000000 !important;
                        font-size: 16px !important;
                        font-style: normal;
                        letter-spacing: 0;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-title {
                        font-size: 36px;
                        padding: 6px 8px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-weekdays span {
                        min-height: 40px;
                        font-size: 14px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-day-date {
                        font-size: 13px;
                        padding: 2px 4px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-grid {
                        row-gap: 10px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th,
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        font-size: 9.5px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th {
                        height: 13px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        height: 14px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-title {
                        font-size: 32px;
                        padding: 5px 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-weekdays span {
                        min-height: 34px;
                        font-size: 12px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-day-date {
                        font-size: 11px;
                        padding: 1px 3px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-grid {
                        row-gap: 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th,
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        font-size: 8px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th {
                        height: 11px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        height: 12px;
                    }
                    .escala-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 16px;
                        margin-bottom: 8px;
                    }
                    .escala-export-header h1 {
                        font-size: ${pageMetrics.titleSize}px;
                        line-height: 1.08;
                        color: #1e3a5f;
                    }
                    .escala-export-header p {
                        font-size: 12px;
                        color: #64748b;
                        font-weight: 700;
                    }
                    .escala-export-summary {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px 16px;
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 12px;
                        background: #eef2ff;
                        color: #312e81;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .escala-export-summary strong {
                        font-size: 16px;
                    }
                    .escala-export-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px 12px;
                        margin-bottom: 14px;
                        color: #1e3a5f;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .escala-export-meta span {
                        padding: 7px 10px;
                        border-radius: 999px;
                        background: #eff6ff;
                        border: 1px solid #bfdbfe;
                    }
                    .escala-export-holidays {
                        margin-bottom: 14px;
                        padding: 12px;
                        border-radius: 12px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                    }
                    .escala-export-holidays strong {
                        display: block;
                        margin-bottom: 8px;
                        color: #1e3a5f;
                    }
                    .escala-export-holidays ul {
                        list-style: none;
                        display: grid;
                        gap: 6px;
                    }
                    .escala-export-holidays li {
                        display: flex;
                        justify-content: space-between;
                        gap: 12px;
                        font-size: 12px;
                        color: #334155;
                    }
                    .escala-export-holidays li.is-muted {
                        color: #64748b;
                        font-style: italic;
                    }
                    .escala-export-page:not(.escala-export-detailed) .escala-export-summary,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-meta,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-holidays {
                        display: none !important;
                    }
                    .relatorio-setor-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 10px;
                        padding: 9px 12px;
                        border-radius: 8px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                        color: #1e3a5f;
                        font-size: ${pageMetrics.sectorHeaderSize}px;
                        font-weight: 700;
                    }
                    .relatorio-setor-header strong {
                        color: #475569;
                        font-size: 12px;
                    }
                    .escala-export-grid {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 5), minmax(0, 1fr));
                        gap: ${isMonthlyExport ? 8 : 10}px;
                        align-items: stretch;
                        flex: 1;
                        min-height: ${pageMetrics.gridMinHeight}px;
                        height: auto;
                        overflow: visible;
                    }
                    .escala-export-weekdays {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .escala-export-weekdays span {
                        padding: 6px 8px;
                        border-radius: 8px;
                        background: #24415f;
                        color: #f8fafc;
                        text-align: center;
                        font-size: 13px;
                        font-weight: 800;
                    }
                    .escala-export-grid-calendario .escala-quadro-dia,
                    .escala-export-grid-calendario .escala-quadro-dia-placeholder {
                        height: 100%;
                    }
                    .escala-export-dia,
                    .escala-export-dia-placeholder {
                        min-width: 0;
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: #ffffff;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 9px rgba(15, 23, 42, 0.04);
                    }
                    .escala-export-dia-placeholder {
                        border-style: dashed;
                        background: #f8fbff;
                        opacity: 0.55;
                    }
                    .escala-export-dia.is-empty {
                        background: #fbfdff;
                    }
                    .escala-export-dia-header {
                        padding: 7px 8px;
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 800;
                        line-height: 1.05;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-export-lines {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding: 7px;
                        min-height: 0;
                        overflow: hidden;
                    }
                    .escala-export-line {
                        display: grid;
                        grid-template-columns: minmax(48px, 0.9fr) minmax(0, 1.25fr) minmax(48px, 0.9fr);
                        align-items: center;
                        gap: 4px;
                        min-height: 26px;
                        padding: 4px 5px;
                        border: 1px solid #dbe3ef;
                        border-radius: 7px;
                        background: #f8fbff;
                        color: #1f2937;
                        font-size: 12px;
                        line-height: 1.05;
                    }
                    .escala-export-line strong {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: #111827;
                        font-size: 12px;
                        text-align: center;
                    }
                    .escala-export-time,
                    .escala-export-work {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        font-weight: 800;
                        text-align: center;
                        color: #334155;
                    }
                    .escala-export-empty {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748b;
                        font-size: 13px;
                        font-style: italic;
                    }
                    .escala-quadro-dia {
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: white;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
                    }
                    .escala-quadro-dia-placeholder {
                        border: 1px dashed #d6e0ea;
                        border-radius: 10px;
                        background: #f8fbff;
                        opacity: 0.6;
                    }
                    .escala-quadro-dia-header {
                        padding: ${isMonthlyExport ? '8px 10px' : '6px 8px'};
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 700;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-quadro-tabela {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        flex: 1;
                        height: 100%;
                    }
                    .escala-quadro-tabela th,
                    .escala-quadro-tabela td {
                        border: 1px solid #dbe3ef;
                        padding: ${isMonthlyExport ? '5px 6px' : '4px 5px'};
                        font-size: ${pageMetrics.tableFontSize}px;
                        line-height: ${isMonthlyExport ? '1.2' : '1.15'};
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-quadro-tabela th {
                        background: #f3f7fb;
                        color: #334155;
                        font-weight: 700;
                    }
                    .escala-quadro-tabela td {
                        background: #ffffff;
                        color: #1f2937;
                    }
                    .escala-quadro-grupo {
                        font-weight: 700;
                        background: #f7fafc !important;
                        color: #334155;
                    }
                    .escala-quadro-sem-escala {
                        padding: 8px 4px !important;
                        color: #64748b;
                        font-style: italic;
                        background: #fbfdff !important;
                    }
                    .escala-export-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .escala-export-table th,
                    .escala-export-table td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        font-size: 12px;
                        line-height: 1.3;
                        vertical-align: top;
                    }
                    .escala-export-table th {
                        background: #e2e8f0;
                        color: #0f172a;
                        font-size: 12px;
                        font-weight: 700;
                        text-align: left;
                    }
                    .escala-export-table td:last-child,
                    .escala-export-table th:last-child {
                        width: 22%;
                    }
                </style>
            </head>
            <body>${bodyHtml}</body>
            </html>
        `;
    }

    const gerarRelatorioEscalaDetalhadoLegacy = async function gerarRelatorioEscalaDetalhado() {
        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const setorId = getRelatorioEscalaSetorId();
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe a data inicial e final do relatorio.', 'error');
            }
            return;
        }

        try {
            const payload = await window.API.getEscalaRelatorio({
                dataInicio,
                dataFim,
                setorId: setorId || undefined,
                colaboradorId: colaboradorId || undefined,
                tipo: tipo || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`;
            document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            });
            document.getElementById('relatorioVisualizacao').style.display = 'block';
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio: ${error.message}`, 'error');
            }
        }
    };

    window.gerarRelatorioEscala = gerarRelatorioEscala = async function gerarRelatorioEscalaAtualizado() {
        const modo = getEscalaReportMode();

        try {
            if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
                const filters = getEscalaMonthlyFilters();

                if (!filters) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Informe um mes e ano validos para o quadro mensal.', 'error');
                    }
                    return;
                }

                const payload = await window.API.getEscalaRelatorio({
                    dataInicio: filters.dataInicio,
                    dataFim: filters.dataFim,
                    setorId: filters.setorId || undefined
                });
                const items = Array.isArray(payload?.items) ? payload.items : [];

                document.getElementById('relatorioTitulo').innerText = `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`;
                document.getElementById('relatorioConteudo').innerHTML = renderMonthlyEscalaReport(items, filters);
                document.getElementById('relatorioVisualizacao').style.display = 'block';
                return;
            }

            const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
            const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
            const setorId = getRelatorioEscalaSetorId();
            const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
            const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

            if (!dataInicio || !dataFim) {
                if (typeof mostrarToast === 'function') {
                    mostrarToast('Informe a data inicial e final do relatorio.', 'error');
                }
                return;
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio,
                dataFim,
                setorId: setorId || undefined,
                colaboradorId: colaboradorId || undefined,
                tipo: tipo || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`;
            document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            });
            document.getElementById('relatorioVisualizacao').style.display = 'block';
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio: ${error.message}`, 'error');
            }
        }
    };

    window.exportarRelatorioEscala = exportarRelatorioEscala = async function exportarRelatorioEscalaAtualizado() {
        if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
            }
            return;
        }

        let container = null;
        let releaseViewportLock = null;

        try {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Gerando PDF do relatorio de escala...', 'warning');
            }

            const snapshot = await buildEscalaExportSnapshot();
            const html = gerarHtmlPdfRelatorioEscala(snapshot);
            const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;

            if (typeof window.criarContainerTemporarioRelatorioPdf !== 'function'
                || typeof window.aguardarLayoutRelatorioPdf !== 'function'
                || typeof window.renderizarPaginaPdfEmCanvas !== 'function') {
                throw new Error('Os utilitarios de renderizacao do PDF nao estao disponiveis.');
            }

            container = window.criarContainerTemporarioRelatorioPdf(html, {
                width: isMonthlyExport ? 1700 : 1480
            });
            await window.aguardarLayoutRelatorioPdf();

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: isMonthlyExport ? 1700 : 1800,
                minHeight: isMonthlyExport ? 1180 : 1200,
                scale: isMonthlyExport ? 1.45 : 1.65,
                maxCanvasSide: isMonthlyExport ? 12000 : 14000,
                maxCanvasPixels: isMonthlyExport ? 22000000 : 24000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: isMonthlyExport ? 5 : 6,
                minScaleMmPerPixel: isMonthlyExport ? 0.075 : 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: isMonthlyExport ? 1 : 2,
                maxSourcePageHeight: isMonthlyExport ? 1160 : 1300
            });

            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `${snapshot.fileBase}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF do relatorio de escala gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao exportar relatorio de escala:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao exportar relatorio de escala: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };

    function buildPlantaoColaboradorOptions(selectedId = '') {
        return `
            <option value="">Todos os colaboradores</option>
            ${(window.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(item.Nome)}
                </option>
            `).join('')}
        `;
    }

    function getPlantaoDurationMinutesReport(plantao) {
        const directMinutes = Number(plantao?.duracaoMinutos);

        if (Number.isFinite(directMinutes) && directMinutes > 0) {
            return directMinutes;
        }

        const start = getTimeMinutesEscala(plantao?.horaInicio);
        const end = getTimeMinutesEscala(plantao?.horaFim);

        if (start === null || end === null || end <= start) {
            return 0;
        }

        return end - start;
    }

    function getPlantaoDurationLabelReport(plantao) {
        const minutes = getPlantaoDurationMinutesReport(plantao);
        return minutes > 0 ? formatDurationEscala(minutes) : '--';
    }

    function buildPlantaoReportSummary(items) {
        const uniqueCollaborators = new Set();
        let totalMinutes = 0;
        let totalCreditMinutes = 0;

        items.forEach((plantao) => {
            const colaboradoresCount = Array.isArray(plantao.colaboradores) ? plantao.colaboradores.length : 0;
            const durationMinutes = getPlantaoDurationMinutesReport(plantao);

            (plantao.colaboradores || []).forEach((id) => uniqueCollaborators.add(Number(id)));
            totalMinutes += durationMinutes;
            totalCreditMinutes += durationMinutes * Math.max(colaboradoresCount, 0);
        });

        return {
            totalPlantoes: items.length,
            totalColaboradores: uniqueCollaborators.size,
            horasProgramadas: formatDurationEscala(totalMinutes || 0),
            horasCreditadas: formatDurationEscala(totalCreditMinutes || 0)
        };
    }

    function getPlantaoReportFiltersFromUI() {
        return {
            dataInicio: document.getElementById('relatorioPlantaoDataInicio')?.value || '',
            dataFim: document.getElementById('relatorioPlantaoDataFim')?.value || '',
            colaboradorId: document.getElementById('relatorioPlantaoColaborador')?.value || '',
            status: document.getElementById('relatorioPlantaoStatus')?.value || 'todos'
        };
    }

    async function buildPlantaoReportItems(filters) {
        if (typeof carregarColaboradores === 'function') {
            await carregarColaboradores();
        }

        const payload = await window.API.getPlantoes({
            from: filters.dataInicio,
            to: filters.dataFim
        });

        return (Array.isArray(payload) ? payload : [])
            .map((item) => ({
                ...item,
                dataISO: toISODateEscala(item.dataISO || item.data_plantao),
                tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
                colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
                horaInicio: item.horaInicio || item.hora_inicio || null,
                horaFim: item.horaFim || item.hora_fim || null,
                observacao: item.observacao || null,
                duracaoMinutos: Number(item.duracaoMinutos || 0) || null,
                duracaoFormatada: item.duracaoFormatada || null
            }))
            .filter((plantao) => {
                if (plantao.tipoPlantao !== 'sabado' && !isPlantaoSabadoEscala(plantao.dataISO)) {
                    return false;
                }

                if (filters.colaboradorId && !(plantao.colaboradores || []).some((id) => Number(id) === Number(filters.colaboradorId))) {
                    return false;
                }

                if (filters.status === 'com_equipe') {
                    return (plantao.colaboradores || []).length > 0;
                }

                if (filters.status === 'sem_equipe') {
                    return (plantao.colaboradores || []).length === 0;
                }

                return true;
            });
    }

    function gerarHtmlPdfRelatorioPlantoes(items, filters = {}) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio de Plantoes</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        width: 1480px;
                        padding: 16px;
                        background: #ffffff;
                        color: #0f172a;
                        font-family: Arial, sans-serif;
                    }
                    .pdf-pagina {
                        width: 1448px;
                        min-height: 980px;
                        padding: 18px;
                        background: #ffffff;
                        overflow: visible;
                    }
                    .plantao-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 18px;
                        margin-bottom: 16px;
                        padding-bottom: 12px;
                        border-bottom: 2px solid #dbeafe;
                    }
                    .plantao-export-header h1 {
                        color: #1e3a5f;
                        font-size: 30px;
                        line-height: 1.1;
                    }
                    .plantao-export-header p {
                        color: #64748b;
                        font-size: 13px;
                        font-weight: 700;
                    }
                    .relatorio-total {
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 10px;
                        background: #eef2ff;
                        color: #312e81;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .resumo-cards {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 10px;
                    }
                    .resumo-card-estatistica {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px;
                        border: 1px solid #dbe3ef;
                        border-radius: 10px;
                        background: #f8fafc;
                    }
                    .resumo-card-estatistica i {
                        color: #6366f1;
                        font-size: 18px;
                    }
                    .resumo-card-estatistica strong {
                        display: block;
                        color: #0f172a;
                        font-size: 18px;
                    }
                    .resumo-card-estatistica span {
                        color: #64748b;
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .relatorio-tabela {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 12px;
                    }
                    .relatorio-tabela th,
                    .relatorio-tabela td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        color: #0f172a;
                        font-size: 12px;
                        line-height: 1.3;
                        text-align: left;
                        vertical-align: top;
                    }
                    .relatorio-tabela th {
                        background: #e2e8f0;
                        color: #0f172a;
                        font-weight: 800;
                    }
                    .evento-tipo {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 999px;
                        font-weight: 700;
                        font-size: 11px;
                    }
                    .badge-folga {
                        background: #dcfce7;
                        color: #166534;
                    }
                    .badge-ausencia {
                        background: #fee2e2;
                        color: #991b1b;
                    }
                    .empty-state {
                        padding: 28px;
                        border: 1px dashed #cbd5e1;
                        border-radius: 12px;
                        color: #64748b;
                        text-align: center;
                        font-size: 16px;
                    }
                </style>
            </head>
            <body>
                <section class="pdf-pagina plantao-export-page">
                    <header class="plantao-export-header">
                        <div>
                            <h1>Relatorio de Plantoes de Sabado</h1>
                            <p>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio))} ate ${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim))}</p>
                        </div>
                        <p>Gerado em ${escapeHtmlEscala(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    ${renderRelatorioPlantoes(items, filters)}
                </section>
            </body>
            </html>
        `;
    }

    window.gerarRelatorioPlantoes = gerarRelatorioPlantoes = async function gerarRelatorioPlantoesAtualizado() {
        const filters = getPlantaoReportFiltersFromUI();

        if (!filters.dataInicio || !filters.dataFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
            }
            return;
        }

        try {
            const items = await buildPlantaoReportItems(filters);

            document.getElementById('relatorioTitulo').innerText = `Relatorio de Plantoes de Sabado - ${formatDatePtBrEscala(filters.dataInicio)} ate ${formatDatePtBrEscala(filters.dataFim)}`;
            document.getElementById('relatorioConteudo').innerHTML = renderRelatorioPlantoes(items, filters);
            document.getElementById('relatorioVisualizacao').style.display = 'block';
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio de plantoes: ${error.message}`, 'error');
            }
        }
    };

    window.exportarRelatorioPlantoes = exportarRelatorioPlantoes = async function exportarRelatorioPlantoesAtualizado() {
        const filters = getPlantaoReportFiltersFromUI();

        if (!filters.dataInicio || !filters.dataFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
            }
            return;
        }

        if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
            }
            return;
        }

        let container = null;
        let releaseViewportLock = null;

        try {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Gerando PDF de plantoes...', 'warning');
            }

            const items = await buildPlantaoReportItems(filters);
            const html = gerarHtmlPdfRelatorioPlantoes(items, filters);

            releaseViewportLock = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;
            container = window.criarContainerTemporarioRelatorioPdf(html, { width: 1480 });
            await window.aguardarLayoutRelatorioPdf();

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: 1600,
                minHeight: 1000,
                scale: 1.65,
                maxCanvasSide: 12000,
                maxCanvasPixels: 22000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: 6,
                minScaleMmPerPixel: 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: 1,
                maxSourcePageHeight: 1300
            });
            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `Relatorio_Plantoes_${filters.dataInicio}_${filters.dataFim}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF de plantoes gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao exportar relatorio de plantoes:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao exportar relatorio de plantoes: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };

    window.renderRelatorioPlantoes = renderRelatorioPlantoes = function renderRelatorioPlantoesSeguro(items, filters = {}) {
        if (!items.length) {
            return '<div class="empty-state">Nenhum plantao encontrado no periodo</div>';
        }

        const summary = buildPlantaoReportSummary(items);

        return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio || items[items.length - 1]?.dataISO))}</strong>
                    ate
                    <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim || items[0]?.dataISO))}</strong>
                </div>
                <div class="resumo-cards" style="margin-bottom: 18px;">
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-calendar-check"></i>
                        <div>
                            <strong>${summary.totalPlantoes}</strong>
                            <span>Plantoes no periodo</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-users"></i>
                        <div>
                            <strong>${summary.totalColaboradores}</strong>
                            <span>Colaboradores envolvidos</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-clock"></i>
                        <div>
                            <strong>${escapeHtmlEscala(summary.horasProgramadas)}</strong>
                            <span>Horas programadas</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-wallet"></i>
                        <div>
                            <strong>${escapeHtmlEscala(summary.horasCreditadas)}</strong>
                            <span>Credito total da equipe</span>
                        </div>
                    </div>
                </div>
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Horario</th>
                            <th>Status</th>
                            <th>Colaboradores</th>
                            <th>Observacao</th>
                            <th>Credito</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...items].sort((first, second) => String(second.dataISO).localeCompare(String(first.dataISO))).map((plantao) => {
                            const colaboradores = (plantao.colaboradores || []).map((id) => {
                                const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));
                                return colaborador?.Nome || 'Desconhecido';
                            });
                            const statusLabel = colaboradores.length > 0 ? 'Equipe definida' : 'Sem equipe';
                            const statusClass = colaboradores.length > 0 ? 'badge-folga' : 'badge-ausencia';

                            return `
                                <tr>
                                    <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(plantao.dataISO))}</strong></td>
                                    <td>${escapeHtmlEscala((plantao.tipoPlantao || 'sabado').charAt(0).toUpperCase() + (plantao.tipoPlantao || 'sabado').slice(1))}</td>
                                    <td>${escapeHtmlEscala(formatTimeRangeEscala(plantao.horaInicio, plantao.horaFim))}</td>
                                    <td><span class="evento-tipo ${statusClass}">${escapeHtmlEscala(statusLabel)}</span></td>
                                    <td>${escapeHtmlEscala(colaboradores.join(', ') || '--')}</td>
                                    <td>${escapeHtmlEscala(plantao.observacao || '--')}</td>
                                    <td>${escapeHtmlEscala(plantao.duracaoFormatada || getPlantaoDurationLabelReport(plantao))}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    window.renderRelatorios = renderRelatorios = async function renderRelatoriosAtualizados() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        const todayISO = toISODateEscala(new Date());
        const monthBounds = getMonthBoundsEscala(todayISO);
        const todayDate = new Date();
        const currentMonth = todayDate.getMonth();
        const currentMonthNumber = currentMonth + 1;
        const currentYear = todayDate.getFullYear();

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
        ]);

        appContent.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-chart-bar"></i> Relatorios</h1>
                <p>Visualize e exporte relatorios do sistema</p>
            </div>

            <div class="relatorios-grid">
                <div class="relatorio-card">
                    <div class="relatorio-card-header">
                        <i class="fas fa-calendar-alt"></i>
                        <h2>Relatorio Mensal Completo</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Ferias, folgas, ausencias e feriados do mes selecionado.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-calendar"></i> Mes/Ano</label>
                                <div class="mes-selector">
                                    <select id="relatorioMesCompleto" class="form-control">
                                        ${typeof gerarOptionsMeses === 'function' ? gerarOptionsMeses(currentMonth) : ''}
                                    </select>
                                    <input type="number" id="relatorioAnoCompleto" class="form-control" value="${currentYear}" min="2020" max="2035">
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button onclick="gerarRelatorioCompleto()" class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioCompleto()" class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="relatorio-card">
                    <div class="relatorio-card-header">
                        <i class="fas fa-table"></i>
                        <h2>Relatorio de Escala</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Alterne entre o quadro mensal operacional e a consulta detalhada da escala diaria consolidada.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-layer-group"></i> Visualizacao</label>
                                <select id="relatorioEscalaModo" class="form-control">
                                    <option value="${RELATORIO_ESCALA_MODOS.QUADRO_MENSAL}" selected>Quadro mensal</option>
                                    <option value="${RELATORIO_ESCALA_MODOS.DETALHADO}">Detalhado</option>
                                </select>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-building"></i> Setor</label>
                                <select id="relatorioEscalaSetor" class="form-control">
                                    ${buildSetorOptionsRelatorioEscala()}
                                </select>
                            </div>
                            <div class="relatorio-escala-view is-active" data-escala-report-mode="${RELATORIO_ESCALA_MODOS.QUADRO_MENSAL}">
                                <div class="filtro-group">
                                    <label><i class="fas fa-calendar-alt"></i> Mes/Ano</label>
                                    <div class="mes-selector">
                                        <select id="relatorioEscalaMes" class="form-control">
                                            ${buildEscalaMonthOptions(currentMonthNumber)}
                                        </select>
                                        <input type="number" id="relatorioEscalaAno" class="form-control" value="${currentYear}" min="2020" max="2035">
                                    </div>
                                </div>
                            </div>
                            <div class="relatorio-escala-view" data-escala-report-mode="${RELATORIO_ESCALA_MODOS.DETALHADO}">
                                <div class="filtro-group">
                                    <label><i class="fas fa-calendar-day"></i> Periodo</label>
                                    <div class="periodo-selector">
                                        <input type="date" id="relatorioEscalaDataInicio" class="form-control" value="${escapeHtmlEscala(monthBounds.start)}">
                                        <span>ate</span>
                                        <input type="date" id="relatorioEscalaDataFim" class="form-control" value="${escapeHtmlEscala(monthBounds.end)}">
                                    </div>
                                </div>
                                <div class="filtro-group">
                                    <label><i class="fas fa-user"></i> Colaborador</label>
                                    <select id="relatorioEscalaColaborador" class="form-control">
                                        ${buildColaboradorOptionsEscala()}
                                    </select>
                                </div>
                                <div class="filtro-group">
                                    <label><i class="fas fa-filter"></i> Tipo</label>
                                    <select id="relatorioEscalaTipo" class="form-control">
                                        ${buildTipoOptionsEscala()}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button onclick="gerarRelatorioEscala()" class="btn-primary">
                                <i class="fas fa-search"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioEscala()" class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="relatorio-card">
                    <div class="relatorio-card-header">
                        <i class="fas fa-calendar-check"></i>
                        <h2>Relatorio de Plantoes de Sabado</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Consulte plantoes de sabado por periodo, colaborador e status da equipe.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-calendar"></i> Periodo</label>
                                <div class="periodo-selector">
                                    <input type="date" id="relatorioPlantaoDataInicio" class="form-control" value="${monthBounds.start}">
                                    <span>ate</span>
                                    <input type="date" id="relatorioPlantaoDataFim" class="form-control" value="${monthBounds.end}">
                                </div>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-user"></i> Colaborador</label>
                                <select id="relatorioPlantaoColaborador" class="form-control">
                                    ${buildPlantaoColaboradorOptions()}
                                </select>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-filter"></i> Status</label>
                                <select id="relatorioPlantaoStatus" class="form-control">
                                    <option value="todos">Todos</option>
                                    <option value="com_equipe">Com equipe</option>
                                    <option value="sem_equipe">Sem equipe</option>
                                </select>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button onclick="gerarRelatorioPlantoes()" class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioPlantoes()" class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="relatorioVisualizacao" class="relatorio-visualizacao" style="display: none;">
                <div class="relatorio-visualizacao-header">
                    <h3><i class="fas fa-file-alt"></i> <span id="relatorioTitulo"></span></h3>
                    <button onclick="fecharRelatorio()" class="btn-secondary">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
                <div id="relatorioConteudo" class="relatorio-conteudo"></div>
            </div>
        `;

        document.getElementById('relatorioEscalaModo')?.addEventListener('change', toggleEscalaReportModeFilters);
        toggleEscalaReportModeFilters();
    };
})();

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
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo: item.Tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo: item.PeriodoTipo || 'dia_inteiro',
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim
        };
    }

    function mapPlantao(item) {
        const dataISO = obterDataISO(item.dataISO || item.data_plantao);

        return {
            ...item,
            dataISO,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : []
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
                carregarAusencias(),
                carregarFeriadosLocais(),
                typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
            ]);

            if (document.getElementById('calendar') && typeof gerarCalendario === 'function') {
                const mes = window.mesAtual ?? new Date().getMonth();
                const ano = window.anoAtual ?? new Date().getFullYear();
                gerarCalendario(mes, ano);
            }

            const modalLancamento = document.getElementById('modalLancamento');
            if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
                if (window.modalFiltroData && window.modalDataSelecionada && typeof carregarListagensComFiltro === 'function') {
                    await carregarListagensComFiltro(window.modalDataSelecionada, true);
                } else if (typeof carregarListagens === 'function') {
                    await carregarListagens();
                }
            }

            if ((window.location.hash || '#dashboard') === '#dashboard' && typeof renderDashboard === 'function') {
                await renderDashboard();
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
        container.style.left = '0';
        container.style.top = '0';
        container.style.width = `${containerWidth}px`;
        container.style.background = '#ffffff';
        container.style.transform = 'translate3d(-250vw, 0, 0)';
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
        const renderScale = Number.isFinite(configuredScale) && configuredScale > 0
            ? Math.max(configuredScale, 1)
            : Math.max(Math.min(deviceScale * 1.5, 3), 2.2);

        return html2canvas(elemento, {
            scale: renderScale,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: elemento.scrollWidth,
            height: elemento.scrollHeight,
            windowWidth: Math.max(elemento.scrollWidth, minWidth),
            windowHeight: Math.max(elemento.scrollHeight, minHeight)
        });
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

            const paginas = Array.from(container.querySelectorAll('.pdf-pagina'));
            const elementos = paginas.length > 0 ? paginas : [container];
            const pdf = new window.jspdf.jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margem = 8;
            const larguraUtil = pageWidth - (margem * 2);
            const alturaUtil = pageHeight - (margem * 2);

            for (let indice = 0; indice < elementos.length; indice += 1) {
                const canvas = await renderizarPaginaPdfEmCanvas(elementos[indice], {
                    minWidth: 1800,
                    minHeight: 1200,
                    scale: 2.3
                });
                const escala = Math.min(larguraUtil / canvas.width, alturaUtil / canvas.height);
                const larguraRender = canvas.width * escala;
                const alturaRender = canvas.height * escala;
                const posicaoX = (pageWidth - larguraRender) / 2;
                const posicaoY = (pageHeight - alturaRender) / 2;

                if (indice > 0) {
                    pdf.addPage();
                }

                pdf.addImage(canvas, 'PNG', posicaoX, posicaoY, larguraRender, alturaRender, undefined, 'MEDIUM');
            }

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

    if (typeof renderPlantoesLancados === 'function') {
        window.renderPlantoesLancados = renderPlantoesLancados = function renderPlantoesLancadosAvancado() {
            if (!window.plantoesLancados || window.plantoesLancados.length === 0) {
                return '<div class="empty-state">Nenhum plantao lancado ainda</div>';
            }

            const ordenados = [...window.plantoesLancados].sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));

            return ordenados.map((plantao) => `
                <div class="plantao-card">
                    <div class="plantao-header">
                        <div>
                            <div class="plantao-data">${escapeHtml(formatarDataPtBr(plantao.dataISO))}</div>
                            <div class="plantao-meta">
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

    window.abrirEditorPlantao = abrirEditorPlantao = async function abrirEditorPlantaoAvancado(dataISO, dataFormatada) {
        const existente = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO);
        const state = setPlantaoEditorState({
            dataISO,
            dataFormatada,
            horaInicio: existente?.horaInicio ? formatarHoraInput(existente.horaInicio) : '',
            horaFim: existente?.horaFim ? formatarHoraInput(existente.horaFim) : '',
            observacao: existente?.observacao || '',
            selecionados: Array.isArray(existente?.colaboradores) ? [...existente.colaboradores] : [],
            disponibilidade: []
        });

        renderPlantaoEditor(state);
        await carregarDisponibilidadePlantao(state);
        renderPlantaoEditor(state);
    };

    window.salvarPlantao = salvarPlantao = async function salvarPlantaoAvancado(dataISO) {
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

        try {
            await window.API.salvarPlantao({
                dataISO,
                horaInicio,
                horaFim,
                observacao,
                colaboradores: selecionados
            });

            await Promise.allSettled([
                carregarPlantoes(),
                carregarBancoHorasResumo()
            ]);

            if (typeof renderLancamentoPlantao === 'function') {
                renderLancamentoPlantao();
            }

            if (isColaboradoresScreenVisible() && typeof renderListaColaboradores === 'function') {
                renderListaColaboradores();
            }

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
            await window.API.excluirPlantao(dataISO);
            await Promise.allSettled([
                carregarPlantoes(),
                carregarBancoHorasResumo()
            ]);

            if (typeof renderLancamentoPlantao === 'function') {
                renderLancamentoPlantao();
            }

            if (isColaboradoresScreenVisible() && typeof renderListaColaboradores === 'function') {
                renderListaColaboradores();
            }

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
        'SABADO'
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

        return {
            month,
            year,
            dataInicio: bounds.start,
            dataFim: bounds.end
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

        for (let index = 0; index < slots.length; index += 6) {
            weeks.push(slots.slice(index, index + 6));
        }

        return weeks.length > 0 ? weeks : [Array(6).fill(null)];
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
            ? weeks.map((week) => Array.from({ length: 6 }, (_, index) => week?.[index] || null))
            : [Array(6).fill(null)];
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

        const days = boardUtils.buildEscalaQuadroMensal(items, {
            month: filters.month,
            year: filters.year
        });
        const calendarSlots = getEscalaCalendarSlots(boardUtils, days);
        const daysWithScale = days.filter((day) => day.hasScale).length;
        const totalRows = days.reduce((sum, day) => sum + day.rows.length, 0);
        return `
            <div class="escala-quadro-mensal">
                <div class="relatorio-total" hidden>
                    Mes: <strong>${escapeHtmlEscala(MESES_LABELS[filters.month - 1] || filters.month)}/${escapeHtmlEscala(filters.year)}</strong>
                    • Dias exibidos: <strong>${days.length}</strong>
                    • Dias com escala: <strong>${daysWithScale}</strong>
                    • Linhas listadas: <strong>${totalRows}</strong>
                </div>
                <div class="escala-quadro-grid escala-quadro-grid-calendario">
                    ${calendarSlots.map((day) => renderEscalaQuadroDayCard(day)).join('')}
                </div>
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

    function calculateWorkedMinutesEscala(record) {
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);

        if (start === null || end === null || isFullDayOffEscala(record)) {
            return 0;
        }

        let total = Math.max(end - start, 0);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            total -= Math.max(Math.min(end, lunchEnd) - Math.max(start, lunchStart), 0);
        }

        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
            total -= Math.max(Math.min(end, absenceEnd) - Math.max(start, absenceStart), 0);
        }

        return Math.max(total, 0);
    }

    function getCellStateEscala(record, hour) {
        const tipo = String(record.tipo || '').toLowerCase();
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        const currentHourStart = hour * 60;
        const currentHourEnd = (hour + 1) * 60;
        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (tipo === 'ferias' && !partialAbsence) {
            return { className: 'ferias', status: 'Ferias' };
        }

        if ((tipo === 'folga' || tipo === 'ausencia') && !partialAbsence) {
            return { className: 'folga', status: tipo === 'folga' ? 'Folga' : 'Ausencia' };
        }

        if (start === null || end === null || currentHourStart < start || currentHourStart >= end) {
            return { className: 'fora-expediente', status: 'Fora do expediente' };
        }

        if (absenceStart !== null && absenceEnd !== null) {
            const overlapAbsence = Math.max(Math.min(currentHourEnd, absenceEnd) - Math.max(currentHourStart, absenceStart), 0);

            if (overlapAbsence > 0) {
                return { className: 'ausencia-parcial', status: 'Ausencia parcial' };
            }
        }

        if (lunchStart !== null && lunchEnd !== null) {
            const overlapLunch = Math.max(Math.min(currentHourEnd, lunchEnd) - Math.max(currentHourStart, lunchStart), 0);

            if (overlapLunch > 0) {
                return { className: 'almoco', status: 'Almoco' };
            }
        }

        return {
            className: 'trabalhando',
            status: tipo === 'plantao' ? 'Plantao' : 'Trabalhando'
        };
    }

    function renderScaleHeaderEscala() {
        const header = document.getElementById('timelineHeader');

        if (!header) {
            return;
        }

        header.innerHTML = '<div class="timeline-name-header">Colaborador</div>'
            + '<div class="hora-header total-header" title="Total de horas no dia">Total</div>'
            + Array.from({ length: (HORA_FINAL - HORA_INICIAL) + 1 }, (_, index) => {
                const hour = HORA_INICIAL + index;
                return `<div class="hora-header">${String(hour).padStart(2, '0')}:00</div>`;
            }).join('');
    }

    function renderTotalRowEscala(items) {
        const body = document.getElementById('timelineBody');

        if (!body || !items.length) {
            return;
        }

        const counts = Array.from({ length: (HORA_FINAL - HORA_INICIAL) + 1 }, (_, index) => ({
            hour: HORA_INICIAL + index,
            count: 0
        }));

        items.forEach((record) => {
            counts.forEach((item) => {
                if (getCellStateEscala(record, item.hour).className === 'trabalhando') {
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

        const cards = Array.from({ length: (HORA_FINAL - HORA_INICIAL) + 1 }, (_, index) => {
            const hour = HORA_INICIAL + index;
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

                if (state === 'trabalhando' || state === 'plantao') {
                    counters.trabalhando += 1;
                } else if (state === 'almoco') {
                    counters.almoco += 1;
                } else if (state === 'ferias') {
                    counters.ferias += 1;
                } else if (state === 'ausencia-parcial') {
                    counters.ausente += 1;
                } else if (state === 'folga') {
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
            title = 'Nao ha expediente aos domingos';
            description = 'Nenhum colaborador aparece na escala padrao para domingo.';
            icon = 'fa-sun';
            label = 'DOMINGO';
        } else if (weekday === 6) {
            title = 'Nenhum registro para este sabado';
            description = 'Lance um plantao ou ajuste manual para que ele apareca na escala.';
            icon = 'fa-calendar-check';
            label = 'SABADO';
        }

        body.innerHTML = `
            <div class="timeline-row mensagem-row">
                <div class="timeline-name mensagem-nome">
                    <i class="fas ${icon}"></i>
                    <span>${label}</span>
                </div>
                <div class="timeline-cell total-cell"></div>
                <div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
                    <div class="mensagem-conteudo">
                        <i class="fas ${icon}"></i>
                        <h3>${escapeHtmlEscala(title)}</h3>
                        <p>${escapeHtmlEscala(description)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderScaleRowsEscala(state) {
        const body = document.getElementById('timelineBody');

        if (!body) {
            return;
        }

        const items = [...(state.items || [])].sort((first, second) => {
            const nameA = String(first.colaboradorNome || '').toLowerCase();
            const nameB = String(second.colaboradorNome || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        body.innerHTML = '';

        if (items.length === 0) {
            renderScaleEmptyMessageEscala(state.dataISO);
            renderScaleSummaryEscala([]);
            return;
        }

        items.forEach((record) => {
            const totalMinutes = calculateWorkedMinutesEscala(record);
            const totalLabel = formatDurationEscala(totalMinutes);
            const row = document.createElement('div');
            const type = String(record.tipo || '').toLowerCase();
            const typeLabel = TIPO_LABELS[type] || 'Escala';
            row.className = `timeline-row${type === 'plantao' ? ' plantao-row' : ''}`;

            row.innerHTML = `
                <div class="timeline-name" data-colaborador-id="${record.colaboradorId}">
                    <i class="fas fa-user"></i>
                    <span>${escapeHtmlEscala(record.colaboradorNome || 'Sem nome')}</span>
                    ${type === 'plantao' ? '<span class="plantao-badge"><i class="fas fa-calendar-check"></i> Plantao</span>' : ''}
                    ${type !== 'normal' && type !== 'plantao' ? `<small class="escala-dia-tipo">${escapeHtmlEscala(typeLabel)}</small>` : ''}
                    <i class="fas fa-pen edit-indicator"></i>
                </div>
                <div class="timeline-cell total-cell" title="${escapeHtmlEscala(totalLabel)}">
                    <span class="total-valor">${escapeHtmlEscala(totalLabel)}</span>
                </div>
                ${Array.from({ length: (HORA_FINAL - HORA_INICIAL) + 1 }, (_, index) => {
                    const hour = HORA_INICIAL + index;
                    const cellState = getCellStateEscala(record, hour);
                    const tooltip = `${String(hour).padStart(2, '0')}:00 - ${cellState.status}`;
                    return `<div class="timeline-cell ${cellState.className}" data-tooltip="${escapeHtmlEscala(tooltip)}" title="${escapeHtmlEscala(tooltip)}"></div>`;
                }).join('')}
            `;

            row.querySelector('.timeline-name')?.addEventListener('click', () => {
                abrirEditorNaEscala(record.colaboradorId);
            });

            body.appendChild(row);
        });

        renderTotalRowEscala(items);
        renderScaleSummaryEscala(items);
    }

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

                <div class="editor-actions">
                    <button onclick="salvarEscalaDia(${record.colaboradorId})" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar dia
                    </button>
                    <button onclick="fecharEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                <div class="editor-form-group" style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--border);">
                    <label><i class="fas fa-calendar-alt"></i> Almoco por periodo</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaPeriodoAlmocoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaPeriodoAlmocoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>
                    <div class="time-inputs" style="margin-top: 12px;">
                        <input type="date" id="escalaPeriodoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="date" id="escalaPeriodoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>
                    <small class="helper-text">Preencha apenas quando quiser aplicar um almoco em lote. Em branco, esse bloco nao interfere na escala.</small>
                </div>

                <div class="editor-actions">
                    <button onclick="aplicarAlmocoPeriodoEscala(${record.colaboradorId})" class="btn-secondary">
                        <i class="fas fa-utensils"></i> Aplicar almoco no periodo
                    </button>
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

        renderScaleEditorEscala(record);
    };

    window.salvarEscalaDia = salvarEscalaDia = async function salvarEscalaDiaAtualizada(colaboradorId) {
        const state = getCurrentScaleState();
        const payload = {
            horaInicio: document.getElementById(`escalaHoraInicio-${colaboradorId}`)?.value || null,
            horaFim: document.getElementById(`escalaHoraFim-${colaboradorId}`)?.value || null,
            almocoInicio: document.getElementById(`escalaAlmocoInicio-${colaboradorId}`)?.value || null,
            almocoFim: document.getElementById(`escalaAlmocoFim-${colaboradorId}`)?.value || null,
            observacao: document.getElementById(`escalaObservacao-${colaboradorId}`)?.value || null
        };

        try {
            await window.API.salvarEscalaDia(state.dataISO, colaboradorId, payload);
            await Promise.allSettled([
                typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
                typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
            ]);
            await carregarEscalaDiaEscala(state.dataISO);
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
            await carregarEscalaDiaEscala(state.dataISO);
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

    window.renderEscalaDia = renderEscalaDia = async function renderEscalaDiaAtualizada() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        const todayISO = toISODateEscala(new Date());

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
        ]);

        appContent.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>Escala do Dia</h1>
                    <div class="data-selector">
                        <i class="fas fa-calendar-alt"></i>
                        <input type="date" id="seletorDataEscala" value="${escapeHtmlEscala(todayISO)}" class="form-control">
                        <button id="btnCarregarEscala" class="btn-primary">
                            <i class="fas fa-search"></i> Ver escala
                        </button>
                    </div>
                </div>
                <div class="legenda-timeline">
                    <span class="legenda-item"><span class="cor trabalhando"></span> Trabalhando</span>
                    <span class="legenda-item"><span class="cor almoco"></span> Almoco</span>
                    <span class="legenda-item"><span class="cor folga"></span> Folga</span>
                    <span class="legenda-item"><span class="cor ferias"></span> Ferias</span>
                    <span class="legenda-item"><span class="cor ausencia-parcial"></span> Ausencia parcial</span>
                    <span class="legenda-item"><span class="cor fora"></span> Fora</span>
                </div>
            </div>

            <div class="escala-layout">
                <div class="timeline-container">
                    <div class="timeline-header" id="timelineHeader"></div>
                    <div id="timelineBody" class="timeline-body"></div>
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

            <div class="resumo-container" id="resumoContainer">
                <div class="resumo-header">
                    <i class="fas fa-chart-pie"></i>
                    <h4>Resumo por horario</h4>
                </div>
                <div class="resumo-grid" id="resumoGrid"></div>
            </div>
        `;

        ensureScaleSidebarToggleEscala();

        document.getElementById('btnCarregarEscala')?.addEventListener('click', async () => {
            const selectedDate = document.getElementById('seletorDataEscala')?.value;
            await carregarEscalaDiaEscala(selectedDate);
        });

        document.getElementById('seletorDataEscala')?.addEventListener('change', async (event) => {
            window.dataEscalaSelecionada = event.target.value;
            await carregarEscalaDiaEscala(event.target.value);
        });

        try {
            await carregarEscalaDiaEscala(todayISO);
        } catch (error) {
            renderScaleHeaderEscala();
            renderScaleEmptyMessageEscala(todayISO);
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao carregar escala: ${error.message}`, 'error');
            }
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

        return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio))}</strong>
                    ate
                    <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim))}</strong>
                    • Registros: <strong>${items.length}</strong>
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
                        ${items.map((item) => `
                            <tr>
                                <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</strong></td>
                                <td>${escapeHtmlEscala(item.diaSemana || getDayLabelEscala(item.dataISO))}</td>
                                <td>${escapeHtmlEscala(item.colaboradorNome || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaInicio || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaFim || '--')}</td>
                                <td>${escapeHtmlEscala(item.almoco || '--')}</td>
                                <td><span class="evento-tipo">${escapeHtmlEscala(TIPO_LABELS[item.tipo] || item.tipo || '--')}</span></td>
                                <td>${escapeHtmlEscala(item.observacao || '--')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
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

    async function buildEscalaExportSnapshot() {
        const modo = getEscalaReportMode();

        if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
            const filters = getEscalaMonthlyFilters();

            if (!filters) {
                throw new Error('Informe um mes e ano validos para o quadro mensal.');
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio: filters.dataInicio,
                dataFim: filters.dataFim
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const boardUtils = window.EscalaReportUtils;

            if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
                throw new Error('Os utilitarios do quadro mensal nao foram carregados.');
            }

            const feriados = await collectEscalaHolidayItems(filters.dataInicio, filters.dataFim);

            const days = boardUtils.buildEscalaQuadroMensal(items, {
                month: filters.month,
                year: filters.year
            });
            const calendarWeeks = getEscalaCalendarWeeks(boardUtils, days);

            return {
                mode: modo,
                title: `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}`,
                fileBase: `Escala_Mensal_${filters.year}-${String(filters.month).padStart(2, '0')}`,
                filters,
                items,
                feriados,
                stats: buildEscalaExportStats(items, feriados),
                days,
                calendarWeeks,
                calendarSlots: calendarWeeks.flat()
            };
        }

        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            throw new Error('Informe a data inicial e final do relatorio.');
        }

        const payload = await window.API.getEscalaRelatorio({
            dataInicio,
            dataFim,
            colaboradorId: colaboradorId || undefined,
            tipo: tipo || undefined
        });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const feriados = await collectEscalaHolidayItems(dataInicio, dataFim);

        return {
            mode: modo,
            title: `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}`,
            fileBase: `Escala_Detalhada_${dataInicio}_${dataFim}`,
            filters: {
                dataInicio,
                dataFim
            },
            items,
            feriados,
            stats: buildEscalaExportStats(items, feriados)
        };
    }

    function renderMonthlyEscalaExportPages(snapshot) {
        const weeks = Array.isArray(snapshot.calendarWeeks) && snapshot.calendarWeeks.length > 0
            ? snapshot.calendarWeeks
            : [Array(6).fill(null)];
        const pages = chunkEscalaItems(weeks, 6);

        return pages.map((group, pageIndex) => `
            <section class="pdf-pagina escala-export-page">
                <div class="escala-export-header">
                    <h1>${escapeHtmlEscala(snapshot.title)}</h1>
                    <p>Pagina ${pageIndex + 1} de ${pages.length}</p>
                </div>
                <div class="escala-export-grid escala-export-grid-calendario" style="--week-count:${group.length || 1};">
                    ${group.flat().map((day) => renderEscalaQuadroDayCard(day)).join('')}
                </div>
            </section>
        `).join('');
    }

    function renderDetailedEscalaExportPages(snapshot) {
        const chunks = chunkEscalaItems(snapshot.items, 24);
        const pages = chunks.length > 0 ? chunks : [[]];

        return pages.map((group, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-detailed">
                <div class="escala-export-header">
                    <h1>${escapeHtmlEscala(snapshot.title)}</h1>
                    <p>Pagina ${pageIndex + 1} de ${pages.length}</p>
                </div>
                ${pageIndex === 0 ? `
                    <div class="escala-export-summary">
                        <span>Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataInicio))}</strong> ate <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataFim))}</strong></span>
                        <span>Registros: <strong>${snapshot.items.length}</strong></span>
                    </div>
                    ${renderEscalaExportStats(snapshot.stats)}
                    ${renderEscalaHolidayList(snapshot.feriados)}
                ` : ''}
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
                        ${group.map((item) => `
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
                        width: 1480px;
                        padding: 16px;
                    }
                    .pdf-pagina {
                        width: 1444px;
                        min-height: 980px;
                        background: white;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 24px;
                    }
                    .escala-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 16px;
                        margin-bottom: 8px;
                    }
                    .escala-export-header h1 {
                        font-size: 28px;
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
                    .escala-export-grid {
                        display: grid;
                        grid-template-columns: repeat(6, minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 5), minmax(0, 1fr));
                        gap: 10px;
                        align-items: stretch;
                        flex: 1;
                        min-height: 900px;
                    }
                    .escala-export-grid-calendario .escala-quadro-dia,
                    .escala-export-grid-calendario .escala-quadro-dia-placeholder {
                        height: 100%;
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
                        padding: 6px 8px;
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: 12px;
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
                        padding: 4px 5px;
                        font-size: 10px;
                        line-height: 1.15;
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
                colaboradorId: colaboradorId || undefined,
                tipo: tipo || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala • ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}`;
            document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
                dataInicio,
                dataFim
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
                    dataFim: filters.dataFim
                });
                const items = Array.isArray(payload?.items) ? payload.items : [];

                document.getElementById('relatorioTitulo').innerText = `Quadro mensal de Escala • ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}`;
                document.getElementById('relatorioConteudo').innerHTML = renderMonthlyEscalaReport(items, filters);
                document.getElementById('relatorioVisualizacao').style.display = 'block';
                return;
            }

            const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
            const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
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
                colaboradorId: colaboradorId || undefined,
                tipo: tipo || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala • ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}`;
            document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
                dataInicio,
                dataFim
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
            releaseViewportLock = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;

            if (typeof mostrarToast === 'function') {
                mostrarToast('Gerando PDF do relatorio de escala...', 'warning');
            }

            const snapshot = await buildEscalaExportSnapshot();
            const html = gerarHtmlPdfRelatorioEscala(snapshot);

            if (typeof window.criarContainerTemporarioRelatorioPdf !== 'function'
                || typeof window.aguardarLayoutRelatorioPdf !== 'function'
                || typeof window.renderizarPaginaPdfEmCanvas !== 'function') {
                throw new Error('Os utilitarios de renderizacao do PDF nao estao disponiveis.');
            }

            container = window.criarContainerTemporarioRelatorioPdf(html, { width: 1480 });
            await window.aguardarLayoutRelatorioPdf();

            const paginas = Array.from(container.querySelectorAll('.pdf-pagina'));
            const elementos = paginas.length > 0 ? paginas : [container];
            const pdf = new window.jspdf.jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margem = 8;
            const larguraUtil = pageWidth - (margem * 2);
            const alturaUtil = pageHeight - (margem * 2);

            for (let indice = 0; indice < elementos.length; indice += 1) {
                const canvas = await window.renderizarPaginaPdfEmCanvas(elementos[indice], {
                    minWidth: snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL ? 2000 : 1800,
                    minHeight: snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL ? 1280 : 1200,
                    scale: snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL ? 2.4 : 2.15
                });
                const escala = Math.min(larguraUtil / canvas.width, alturaUtil / canvas.height);
                const larguraRender = canvas.width * escala;
                const alturaRender = canvas.height * escala;
                const posicaoX = (pageWidth - larguraRender) / 2;
                const posicaoY = (pageHeight - alturaRender) / 2;

                if (indice > 0) {
                    pdf.addPage();
                }

                pdf.addImage(canvas, 'PNG', posicaoX, posicaoY, larguraRender, alturaRender, undefined, 'MEDIUM');
            }

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

    window.renderRelatorioPlantoes = renderRelatorioPlantoes = function renderRelatorioPlantoesSeguro(items) {
        if (!items.length) {
            return '<div class="empty-state">Nenhum plantao encontrado no periodo</div>';
        }

        return `
            <div class="relatorio-tabela-container">
                <h4>Plantoes lancados</h4>
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horario</th>
                            <th>Colaboradores</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...items].sort((first, second) => String(second.dataISO).localeCompare(String(first.dataISO))).map((plantao) => `
                            <tr>
                                <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(plantao.dataISO))}</strong></td>
                                <td>${escapeHtmlEscala(formatTimeRangeEscala(plantao.horaInicio, plantao.horaFim))}</td>
                                <td>${escapeHtmlEscala((plantao.colaboradores || []).map((id) => {
                                    const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));
                                    return colaborador?.Nome || 'Desconhecido';
                                }).join(', ') || '--')}</td>
                            </tr>
                        `).join('')}
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
                        <h2>Relatorio de Plantoes</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Consulta rapida dos plantoes lancados por periodo.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-calendar"></i> Mes inicial/final</label>
                                <div class="periodo-selector">
                                    <input type="month" id="relatorioPlantaoInicio" class="form-control" value="${monthBounds.start.slice(0, 7)}">
                                    <span>ate</span>
                                    <input type="month" id="relatorioPlantaoFim" class="form-control" value="${monthBounds.end.slice(0, 7)}">
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button onclick="gerarRelatorioPlantoes()" class="btn-secondary">
                                <i class="fas fa-file-alt"></i> Visualizar
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

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

    async function carregarExemplosBanco() {
        const confirmar = typeof window.confirm === 'function'
            ? window.confirm('Carregar dados de exemplo (setores e colaboradores de demonstracao)?\n\nNenhum dado existente sera apagado — apenas o que ainda faltar sera adicionado.')
            : true;

        if (!confirmar) {
            return;
        }

        definirStatusConfiguracaoBanco('loading', 'Carregando dados de exemplo...', 'Inserindo apenas registros ausentes, sem apagar dados existentes.');

        const response = await window.API.carregarExemplosBanco();
        const totals = response.totals || {};
        const detalhe = `Totais no banco: ${totals.setores || 0} setores, ${totals.colaboradores || 0} colaboradores, ${totals.feriados || 0} feriados.`;

        definirStatusConfiguracaoBanco('success', response.message || 'Dados de exemplo carregados.', detalhe);

        if (typeof mostrarToast === 'function') {
            mostrarToast(response.message || 'Dados de exemplo carregados.', 'success');
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

        document.getElementById('carregarExemplosBancoBtn')?.addEventListener('click', async () => {
            try {
                await carregarExemplosBanco();
            } catch (error) {
                definirStatusConfiguracaoBanco('error', error.message || 'Erro ao carregar os dados de exemplo.', 'Verifique a permissao do usuario para inserir dados no banco.');

                if (typeof mostrarToast === 'function') {
                    mostrarToast(`Erro ao carregar dados de exemplo: ${error.message}`, 'error');
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

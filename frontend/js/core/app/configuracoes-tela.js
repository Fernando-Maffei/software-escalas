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


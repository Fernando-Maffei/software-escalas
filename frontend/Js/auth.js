(function () {
    const AUTH_ME_URL = '/api/auth/me';
    const AUTH_LOGIN_URL = '/api/auth/login';
    const AUTH_LOGOUT_URL = '/api/auth/logout';
    const AUTH_TROCAR_SENHA_URL = '/api/auth/trocar-senha';
    const SETUP_STATUS_URL = '/api/setup/status';
    const SETUP_TESTAR_URL = '/api/configuracao-banco/testar';
    const SETUP_SALVAR_URL = '/api/configuracao-banco/salvar';

    const loginScreen = document.getElementById('loginScreen');
    const setupScreen = document.getElementById('setupScreen');
    const setupForm = document.getElementById('setupForm');
    const setupError = document.getElementById('setupError');
    const setupSuccess = document.getElementById('setupSuccess');
    const setupTestarBtn = document.getElementById('setupTestarBtn');
    const setupSalvarBtn = document.getElementById('setupSalvarBtn');
    const setupAdminResultado = document.getElementById('setupAdminResultado');
    const setupIrLoginBtn = document.getElementById('setupIrLoginBtn');
    const trocarSenhaScreen = document.getElementById('trocarSenhaScreen');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const trocarSenhaForm = document.getElementById('trocarSenhaForm');
    const trocarSenhaError = document.getElementById('trocarSenhaError');
    const logoutBtn = document.getElementById('logoutBtn');

    const abrirTrocarSenhaBtn = document.getElementById('abrirTrocarSenhaBtn');
    const modalTrocarSenha = document.getElementById('modalTrocarSenha');
    const modalTrocarSenhaForm = document.getElementById('modalTrocarSenhaForm');
    const modalTrocarSenhaError = document.getElementById('modalTrocarSenhaError');
    const fecharModalTrocarSenhaBtn = document.getElementById('fecharModalTrocarSenhaBtn');
    const cancelarModalTrocarSenhaBtn = document.getElementById('cancelarModalTrocarSenhaBtn');

    let hasBeenAuthenticated = false;
    let setupMode = false;

    function showError(element, message) {
        if (!element) {
            return;
        }

        element.textContent = message;
        element.classList.remove('hidden');
    }

    function hideError(element) {
        if (!element) {
            return;
        }

        element.classList.add('hidden');
        element.textContent = '';
    }

    function showLoginScreen() {
        document.body.classList.remove('authenticated');

        if (loginScreen) {
            loginScreen.classList.remove('hidden');
        }

        if (setupScreen) {
            setupScreen.classList.add('hidden');
        }

        if (trocarSenhaScreen) {
            trocarSenhaScreen.classList.add('hidden');
        }
    }

    function showSetupScreen() {
        setupMode = true;
        document.body.classList.remove('authenticated');

        if (loginScreen) {
            loginScreen.classList.add('hidden');
        }

        if (trocarSenhaScreen) {
            trocarSenhaScreen.classList.add('hidden');
        }

        if (setupScreen) {
            setupScreen.classList.remove('hidden');
        }
    }

    function showTrocarSenhaScreen() {
        document.body.classList.remove('authenticated');

        if (loginScreen) {
            loginScreen.classList.add('hidden');
        }

        if (trocarSenhaScreen) {
            trocarSenhaScreen.classList.remove('hidden');
        }
    }

    function showApp() {
        hasBeenAuthenticated = true;
        document.body.classList.add('authenticated');
    }

    function handleAuthenticatedUser(user) {
        // Compartilha o usuario logado com o restante do front-end (ex.: o
        // card de Usuarios em Configuracoes precisa saber se e admin).
        window.__usuarioAtual = user || null;

        if (user && user.deveTrocarSenha) {
            showTrocarSenhaScreen();
            return;
        }

        showApp();
    }

    async function isSetupPending() {
        try {
            const response = await fetch(SETUP_STATUS_URL, { method: 'GET' });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return data.databaseConfigured === false;
        } catch (error) {
            // Se nem o status respondeu, segue para o fluxo normal de login,
            // que ja sabe apresentar erros de comunicacao.
            return false;
        }
    }

    async function checkSession() {
        if (await isSetupPending()) {
            showSetupScreen();
            return;
        }

        try {
            const response = await fetch(AUTH_ME_URL, { method: 'GET' });

            if (!response.ok) {
                showLoginScreen();
                return;
            }

            const data = await response.json();
            handleAuthenticatedUser(data.user);
        } catch (error) {
            showLoginScreen();
        }
    }

    function coletarSetupPayload() {
        const port = document.getElementById('setupPort').value.trim();

        return {
            host: document.getElementById('setupHost').value.trim(),
            instanceName: document.getElementById('setupInstance').value.trim(),
            port: port ? Number(port) : null,
            database: document.getElementById('setupDatabase').value.trim(),
            user: document.getElementById('setupUser').value.trim(),
            password: document.getElementById('setupPassword').value,
            authenticationType: 'sql'
        };
    }

    function setSetupBotoesDesabilitados(disabled) {
        if (setupTestarBtn) {
            setupTestarBtn.disabled = disabled;
        }

        if (setupSalvarBtn) {
            setupSalvarBtn.disabled = disabled;
        }
    }

    if (setupTestarBtn) {
        setupTestarBtn.addEventListener('click', async () => {
            hideError(setupError);

            if (setupSuccess) {
                setupSuccess.classList.add('hidden');
            }

            setSetupBotoesDesabilitados(true);

            try {
                const response = await fetch(SETUP_TESTAR_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(coletarSetupPayload())
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showError(setupError, data.error || 'Nao foi possivel conectar com os dados informados.');
                    return;
                }

                if (setupSuccess) {
                    setupSuccess.textContent = 'Conexao realizada com sucesso. Pode salvar.';
                    setupSuccess.classList.remove('hidden');
                }
            } catch (error) {
                showError(setupError, 'Falha de comunicacao com o servidor. Tente novamente.');
            } finally {
                setSetupBotoesDesabilitados(false);
            }
        });
    }

    if (setupForm) {
        setupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            hideError(setupError);

            if (setupSuccess) {
                setupSuccess.classList.add('hidden');
            }

            setSetupBotoesDesabilitados(true);

            try {
                const response = await fetch(SETUP_SALVAR_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(coletarSetupPayload())
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showError(setupError, data.error || 'Nao foi possivel salvar a configuracao.');
                    return;
                }

                if (data.schemaWarning) {
                    showError(setupError, data.schemaWarning);
                    return;
                }

                const admin = data.adminBootstrap;

                if (admin && admin.password) {
                    // Banco novo: mostra as credenciais geradas uma unica vez.
                    setupForm.classList.add('hidden');
                    document.getElementById('setupAdminUsuario').textContent = admin.username;
                    document.getElementById('setupAdminSenha').textContent = admin.password;

                    if (setupAdminResultado) {
                        setupAdminResultado.classList.remove('hidden');
                    }

                    return;
                }

                // Banco ja tinha usuarios (ex.: reinstalacao apontando para um
                // banco existente): segue direto para o login.
                window.location.reload();
            } catch (error) {
                showError(setupError, 'Falha de comunicacao com o servidor. Tente novamente.');
            } finally {
                setSetupBotoesDesabilitados(false);
            }
        });
    }

    if (setupIrLoginBtn) {
        setupIrLoginBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            hideError(loginError);

            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = true;
            }

            try {
                const response = await fetch(AUTH_LOGIN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showError(loginError, data.error || 'Nao foi possivel entrar. Verifique usuario e senha.');
                    return;
                }

                loginForm.reset();
                // Recarrega a pagina em vez de revelar o app em memoria: o app.js
                // ja pode ter tentado buscar dados protegidos antes do login (e
                // ficado com esse erro em cache), entao um load limpo com a
                // sessao ja valida evita esses estados de erro presos na tela.
                window.location.reload();
            } catch (error) {
                showError(loginError, 'Falha de comunicacao com o servidor. Tente novamente.');
            } finally {
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = false;
                }
            }
        });
    }

    if (trocarSenhaForm) {
        trocarSenhaForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            hideError(trocarSenhaError);

            const novaSenha = document.getElementById('novaSenhaInput').value;
            const confirmarSenha = document.getElementById('confirmarSenhaInput').value;

            if (novaSenha !== confirmarSenha) {
                showError(trocarSenhaError, 'As senhas informadas nao coincidem.');
                return;
            }

            try {
                const response = await fetch(AUTH_TROCAR_SENHA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ novaSenha })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showError(trocarSenhaError, data.error || 'Nao foi possivel salvar a nova senha.');
                    return;
                }

                trocarSenhaForm.reset();
                window.location.reload();
            } catch (error) {
                showError(trocarSenhaError, 'Falha de comunicacao com o servidor. Tente novamente.');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch(AUTH_LOGOUT_URL, { method: 'POST' });
            } catch (error) {
                // Ignora falha de rede no logout - a sessao expira sozinha no servidor.
            }

            window.location.reload();
        });
    }

    window.addEventListener('auth:expired', () => {
        // Na configuracao inicial, as cargas de dados do app disparam 401
        // (nao ha banco nem sessao) — isso nao pode arrancar o usuario da
        // tela de setup de volta para o login.
        if (setupMode) {
            return;
        }

        const shouldNotify = hasBeenAuthenticated;
        showLoginScreen();

        if (shouldNotify) {
            showError(loginError, 'Sua sessao expirou. Entre novamente para continuar.');
        }
    });

    function openTrocarSenhaModal() {
        if (!modalTrocarSenha) {
            return;
        }

        hideError(modalTrocarSenhaError);

        if (modalTrocarSenhaForm) {
            modalTrocarSenhaForm.reset();
        }

        modalTrocarSenha.classList.add('active');
    }

    function closeTrocarSenhaModal() {
        if (modalTrocarSenha) {
            modalTrocarSenha.classList.remove('active');
        }
    }

    if (abrirTrocarSenhaBtn) {
        abrirTrocarSenhaBtn.addEventListener('click', openTrocarSenhaModal);
    }

    if (fecharModalTrocarSenhaBtn) {
        fecharModalTrocarSenhaBtn.addEventListener('click', closeTrocarSenhaModal);
    }

    if (cancelarModalTrocarSenhaBtn) {
        cancelarModalTrocarSenhaBtn.addEventListener('click', closeTrocarSenhaModal);
    }

    if (modalTrocarSenhaForm) {
        modalTrocarSenhaForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            hideError(modalTrocarSenhaError);

            const novaSenha = document.getElementById('modalNovaSenhaInput').value;
            const confirmarSenha = document.getElementById('modalConfirmarSenhaInput').value;

            if (novaSenha !== confirmarSenha) {
                showError(modalTrocarSenhaError, 'As senhas informadas nao coincidem.');
                return;
            }

            try {
                const response = await fetch(AUTH_TROCAR_SENHA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ novaSenha })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showError(modalTrocarSenhaError, data.error || 'Nao foi possivel salvar a nova senha.');
                    return;
                }

                closeTrocarSenhaModal();

                if (typeof window.mostrarToast === 'function') {
                    window.mostrarToast('Senha alterada com sucesso.', 'success');
                }
            } catch (error) {
                showError(modalTrocarSenhaError, 'Falha de comunicacao com o servidor. Tente novamente.');
            }
        });
    }

    checkSession();
})();

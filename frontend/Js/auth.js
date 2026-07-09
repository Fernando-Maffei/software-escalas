(function () {
    const AUTH_ME_URL = '/api/auth/me';
    const AUTH_LOGIN_URL = '/api/auth/login';
    const AUTH_LOGOUT_URL = '/api/auth/logout';
    const AUTH_TROCAR_SENHA_URL = '/api/auth/trocar-senha';

    const loginScreen = document.getElementById('loginScreen');
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

        if (trocarSenhaScreen) {
            trocarSenhaScreen.classList.add('hidden');
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
        if (user && user.deveTrocarSenha) {
            showTrocarSenhaScreen();
            return;
        }

        showApp();
    }

    async function checkSession() {
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

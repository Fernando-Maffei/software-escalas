// Tela de gestao de usuarios (Configuracoes > Usuarios).
// Visivel e funcional apenas para administradores: para os demais, a
// secao inteira e removida do menu (e o backend nega com 403 de qualquer
// forma — a remocao aqui e so usabilidade, nao seguranca).
(function () {
    const USUARIOS_URL = '/api/usuarios';
    const ME_URL = '/api/auth/me';

    function esc(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function toast(mensagem, tipo) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(mensagem, tipo || 'success');
        }
    }

    function formatarDataHora(valor) {
        if (!valor) {
            return 'Nunca entrou';
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return '—';
        }

        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async function buscarUsuarioAtual() {
        if (window.__usuarioAtual) {
            return window.__usuarioAtual;
        }

        try {
            const response = await fetch(ME_URL);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            window.__usuarioAtual = data.user || null;
            return window.__usuarioAtual;
        } catch (error) {
            return null;
        }
    }

    function removerSecaoUsuarios() {
        document.querySelector('[data-config-tab="usuarios"]')?.remove();
        document.querySelector('[data-config-section="usuarios"]')?.remove();

        // Se a secao removida era a que estava aberta, volta para a inicial.
        if (localStorage.getItem('configuracoesSecaoAtual') === 'usuarios'
            && typeof window.ativarSecaoConfiguracoes === 'function') {
            window.ativarSecaoConfiguracoes('personalizacao');
        }
    }

    function mostrarSenhaTemporaria(container, username, senha, isAdmin) {
        const aviso = container.querySelector('#usuariosSenhaTemporaria');

        if (!aviso) {
            return;
        }

        // Conta de administrador e pessoal (senha provisoria, trocada no
        // primeiro acesso); conta de visualizacao e compartilhada pela
        // equipe e a senha vale como esta.
        const rotulo = isAdmin ? 'Senha temporaria' : 'Senha de acesso';
        const explicacao = isAdmin
            ? 'Anote e repasse agora — ela nao sera exibida novamente. O usuario define a senha definitiva no primeiro acesso.'
            : 'Anote e repasse a equipe agora — ela nao sera exibida novamente. Esta senha vale como esta: quem usa a conta de visualizacao nao pode altera-la.';

        aviso.innerHTML = `
            <div class="usuarios-senha-box">
                <div>
                    <strong>${rotulo} de ${esc(username)}:</strong>
                    <code>${esc(senha)}</code>
                </div>
                <p>${explicacao}</p>
                <button type="button" class="btn-secondary" data-fechar-senha>
                    <i class="fas fa-check"></i> Ja anotei
                </button>
            </div>
        `;
        aviso.classList.remove('hidden');
        aviso.querySelector('[data-fechar-senha]').addEventListener('click', () => {
            aviso.innerHTML = '';
            aviso.classList.add('hidden');
        });
    }

    function renderLinhaUsuario(usuario, usuarioAtual) {
        const isSelf = Number(usuario.id) === Number(usuarioAtual.id);
        const badges = [
            usuario.isAdmin ? '<span class="usuario-badge badge-admin">Admin</span>' : '',
            usuario.ativo
                ? '<span class="usuario-badge badge-ativo">Ativo</span>'
                : '<span class="usuario-badge badge-inativo">Inativo</span>',
            usuario.deveTrocarSenha ? '<span class="usuario-badge badge-pendente">Troca de senha pendente</span>' : ''
        ].filter(Boolean).join('');

        const acoes = [];

        acoes.push(`
            <button type="button" class="btn-secondary btn-usuario-acao" data-acao="resetar" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                <i class="fas fa-key"></i> Resetar senha
            </button>
        `);

        if (!isSelf) {
            acoes.push(usuario.isAdmin
                ? `<button type="button" class="btn-secondary btn-usuario-acao" data-acao="remover-admin" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                        <i class="fas fa-user-minus"></i> Remover admin
                   </button>`
                : `<button type="button" class="btn-secondary btn-usuario-acao" data-acao="promover-admin" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                        <i class="fas fa-user-shield"></i> Tornar admin
                   </button>`);

            acoes.push(usuario.ativo
                ? `<button type="button" class="btn-secondary btn-usuario-acao btn-usuario-danger" data-acao="desativar" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                        <i class="fas fa-user-slash"></i> Desativar
                   </button>`
                : `<button type="button" class="btn-secondary btn-usuario-acao" data-acao="reativar" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                        <i class="fas fa-user-check"></i> Reativar
                   </button>`);
        }

        return `
            <div class="usuario-linha${usuario.ativo ? '' : ' usuario-linha-inativa'}">
                <div class="usuario-info">
                    <strong>${esc(usuario.username)}${isSelf ? ' <small>(voce)</small>' : ''}</strong>
                    <div class="usuario-badges">${badges}</div>
                    <small class="usuario-ultimo-login">Ultimo acesso: ${esc(formatarDataHora(usuario.ultimoLoginAt))}</small>
                </div>
                <div class="usuario-acoes">${acoes.join('')}</div>
            </div>
        `;
    }

    async function carregarLista(container, usuarioAtual) {
        const lista = container.querySelector('#usuariosLista');

        if (!lista) {
            return;
        }

        lista.innerHTML = '<p class="config-descricao">Carregando...</p>';

        try {
            const response = await fetch(USUARIOS_URL);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                lista.innerHTML = `<p class="config-descricao">${esc(data.error || 'Erro ao carregar os usuarios.')}</p>`;
                return;
            }

            lista.innerHTML = data.usuarios.map((usuario) => renderLinhaUsuario(usuario, usuarioAtual)).join('');

            lista.querySelectorAll('.btn-usuario-acao').forEach((botao) => {
                botao.addEventListener('click', () => {
                    executarAcao(container, usuarioAtual, botao.dataset.acao, Number(botao.dataset.id), botao.dataset.nome);
                });
            });
        } catch (error) {
            lista.innerHTML = '<p class="config-descricao">Falha de comunicacao ao carregar os usuarios.</p>';
        }
    }

    async function executarAcao(container, usuarioAtual, acao, id, nome) {
        const confirmacoes = {
            desativar: `Desativar o usuario "${nome}"? Ele perde o acesso imediatamente.`,
            'remover-admin': `Remover os poderes de administrador de "${nome}"?`,
            resetar: `Gerar uma nova senha para "${nome}"? A senha atual deixa de valer na hora — numa conta de visualizacao, toda a equipe precisara da senha nova.`
        };

        if (confirmacoes[acao] && !window.confirm(confirmacoes[acao])) {
            return;
        }

        const payloads = {
            desativar: { ativo: false },
            reativar: { ativo: true },
            'promover-admin': { isAdmin: true },
            'remover-admin': { isAdmin: false },
            resetar: { resetarSenha: true }
        };

        try {
            const response = await fetch(`${USUARIOS_URL}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloads[acao])
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast(data.error || 'Nao foi possivel atualizar o usuario.', 'error');
                return;
            }

            if (data.senhaTemporaria) {
                mostrarSenhaTemporaria(container, nome, data.senhaTemporaria, Boolean(data.usuario?.isAdmin));
            }

            toast(data.message || 'Usuario atualizado.');
            carregarLista(container, usuarioAtual);
        } catch (error) {
            toast('Falha de comunicacao ao atualizar o usuario.', 'error');
        }
    }

    async function criarUsuario(container, usuarioAtual) {
        const usernameInput = container.querySelector('#novoUsuarioNome');
        const senhaInput = container.querySelector('#novoUsuarioSenha');
        const adminCheck = container.querySelector('#novoUsuarioAdmin');
        const username = usernameInput.value.trim();

        if (!username) {
            toast('Informe o nome do novo usuario.', 'error');
            return;
        }

        try {
            const response = await fetch(USUARIOS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    senha: senhaInput.value,
                    isAdmin: adminCheck.checked
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast(data.error || 'Nao foi possivel criar o usuario.', 'error');
                return;
            }

            usernameInput.value = '';
            senhaInput.value = '';
            adminCheck.checked = false;

            if (data.senhaTemporaria) {
                mostrarSenhaTemporaria(container, username, data.senhaTemporaria, Boolean(data.usuario?.isAdmin));
            }

            toast(data.message || 'Usuario criado.');
            carregarLista(container, usuarioAtual);
        } catch (error) {
            toast('Falha de comunicacao ao criar o usuario.', 'error');
        }
    }

    window.inicializarUsuariosTela = async function inicializarUsuariosTela() {
        const container = document.getElementById('usuariosCardConteudo');

        if (!container) {
            return;
        }

        const usuarioAtual = await buscarUsuarioAtual();

        if (!usuarioAtual || !usuarioAtual.isAdmin) {
            removerSecaoUsuarios();
            return;
        }

        container.innerHTML = `
            <p class="config-descricao">
                Contas de <strong>administrador</strong> sao pessoais e fazem lancamentos:
                a senha definida aqui e temporaria e o dono troca no primeiro acesso.
                A conta de <strong>visualizacao</strong> e compartilhada pela equipe e so
                enxerga o calendario — a senha vale como definida e quem a usa nao pode
                altera-la.
            </p>

            <div id="usuariosSenhaTemporaria" class="hidden"></div>

            <div class="usuarios-novo">
                <div class="usuarios-novo-campos">
                    <label class="usuarios-campo">
                        <span>Nome de usuario</span>
                        <input type="text" id="novoUsuarioNome" class="form-control" placeholder="ex.: equipe" autocomplete="off">
                    </label>
                    <label class="usuarios-campo">
                        <span>Senha</span>
                        <input type="password" id="novoUsuarioSenha" class="form-control" placeholder="vazio = gerar automaticamente" autocomplete="new-password">
                    </label>
                </div>
                <div class="usuarios-novo-acoes">
                    <label class="usuarios-novo-admin">
                        <input type="checkbox" id="novoUsuarioAdmin"> Administrador
                    </label>
                    <button type="button" id="novoUsuarioBtn" class="btn-primary">
                        <i class="fas fa-user-plus"></i> Criar usuario
                    </button>
                </div>
            </div>

            <div id="usuariosLista" class="usuarios-lista"></div>
        `;

        container.querySelector('#novoUsuarioBtn').addEventListener('click', () => {
            criarUsuario(container, usuarioAtual);
        });

        carregarLista(container, usuarioAtual);
    };
})();

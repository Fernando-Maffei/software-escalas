// Tela de gestao de usuarios (Configuracoes > Usuarios).
// Visivel e funcional apenas para administradores: para os demais, a
// secao inteira e removida do menu (e o backend nega com 403 de qualquer
// forma — a remocao aqui e so usabilidade, nao seguranca).
(function () {
    const USUARIOS_URL = '/api/usuarios';
    const ME_URL = '/api/auth/me';
    const SETORES_URL = '/api/setores';

    // Setores disponiveis para atribuir como "permitidos" a cada conta.
    let setoresDisponiveis = [];

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

    // Form inline para o administrador digitar uma senha especifica (diferente
    // do "Resetar", que gera uma aleatoria). Reaproveita a area de aviso do topo.
    function mostrarFormDefinirSenha(container, usuarioAtual, id, nome) {
        const aviso = container.querySelector('#usuariosSenhaTemporaria');

        if (!aviso) {
            return;
        }

        aviso.innerHTML = `
            <div class="usuarios-senha-box">
                <div class="usuarios-definir-form">
                    <label class="usuarios-campo">
                        <span>Nova senha para ${esc(nome)}</span>
                        <input type="password" id="definirSenhaInput" class="form-control" placeholder="minimo 8 caracteres" autocomplete="new-password">
                    </label>
                    <div class="usuarios-definir-acoes">
                        <button type="button" class="btn-primary" data-salvar-senha>
                            <i class="fas fa-check"></i> Salvar senha
                        </button>
                        <button type="button" class="btn-secondary" data-cancelar-senha>Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        aviso.classList.remove('hidden');

        const input = aviso.querySelector('#definirSenhaInput');
        input.focus();

        const fechar = () => {
            aviso.innerHTML = '';
            aviso.classList.add('hidden');
        };

        const salvar = async () => {
            const nova = input.value;

            if (nova.length < 8) {
                toast('A senha deve ter pelo menos 8 caracteres.', 'error');
                input.focus();
                return;
            }

            try {
                const response = await fetch(`${USUARIOS_URL}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ novaSenha: nova })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    toast(data.error || 'Nao foi possivel definir a senha.', 'error');
                    return;
                }

                fechar();
                toast(data.message || 'Senha definida com sucesso.');
                carregarLista(container, usuarioAtual);
            } catch (error) {
                toast('Falha de comunicacao ao definir a senha.', 'error');
            }
        };

        aviso.querySelector('[data-cancelar-senha]').addEventListener('click', fechar);
        aviso.querySelector('[data-salvar-senha]').addEventListener('click', salvar);
        input.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                salvar();
            }
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
            <button type="button" class="btn-secondary btn-usuario-acao" data-acao="definir-senha" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                <i class="fas fa-pen"></i> Definir senha
            </button>
        `);

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

            // Excluir e diferente de desativar: apaga a conta de vez. Fica por
            // ultimo e com estilo de perigo para nao ser confundido com o resto.
            acoes.push(`
                <button type="button" class="btn-secondary btn-usuario-acao btn-usuario-danger" data-acao="excluir" data-id="${usuario.id}" data-nome="${esc(usuario.username)}">
                    <i class="fas fa-trash-alt"></i> Excluir
                </button>
            `);
        }

        return `
            <div class="usuario-linha${usuario.ativo ? '' : ' usuario-linha-inativa'}">
                <div class="usuario-info">
                    <strong>${esc(usuario.username)}${isSelf ? ' <small>(voce)</small>' : ''}</strong>
                    <div class="usuario-badges">${badges}</div>
                    <small class="usuario-ultimo-login">Ultimo acesso: ${esc(formatarDataHora(usuario.ultimoLoginAt))}</small>
                </div>
                <div class="usuario-acoes">${acoes.join('')}</div>
                ${renderSetoresPermitidos(usuario)}
            </div>
        `;
    }

    // Linha de chips para atribuir os setores que a conta PODE ver (teto de
    // acesso). Nenhum ligado = sem restricao (ve todos). Vale para qualquer
    // perfil, inclusive admin (a decisao foi: todos seguem a propria permissao).
    function renderSetoresPermitidos(usuario) {
        if (!setoresDisponiveis.length) {
            return '';
        }

        const permitidos = new Set((usuario.setoresPermitidos || []).map(String));
        const semRestricao = permitidos.size === 0;

        const chips = setoresDisponiveis.map((setor) => {
            const id = String(setor.id ?? setor.Id ?? '');
            const nome = setor.nome ?? setor.Nome ?? id;
            const ativo = permitidos.has(id);
            return `
                <button type="button" class="usuario-setor-chip ${ativo ? 'is-active' : ''}" data-setor-id="${esc(id)}" data-user-id="${usuario.id}" aria-pressed="${ativo ? 'true' : 'false'}">
                    ${esc(nome)}
                </button>
            `;
        }).join('');

        return `
            <div class="usuario-setores" data-user-id="${usuario.id}">
                <span class="usuario-setores-label"><i class="fas fa-shield-halved"></i> Setores permitidos</span>
                <div class="usuario-setores-chips">${chips}</div>
                <span class="usuario-setores-hint ${semRestricao ? '' : 'is-restrito'}">${semRestricao ? 'Todos (sem restricao)' : 'So os marcados'}</span>
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

            lista.querySelectorAll('.usuario-setor-chip').forEach((chip) => {
                chip.addEventListener('click', () => {
                    chip.classList.toggle('is-active');
                    salvarSetoresPermitidos(lista, Number(chip.dataset.userId));
                });
            });
        } catch (error) {
            lista.innerHTML = '<p class="config-descricao">Falha de comunicacao ao carregar os usuarios.</p>';
        }
    }

    // Le os chips ativos da conta e persiste o teto de acesso. Nenhum ativo =
    // lista vazia = sem restricao (ve todos). Atualiza a dica localmente sem
    // recarregar a lista inteira (nao perde o lugar do admin).
    async function salvarSetoresPermitidos(lista, userId) {
        const bloco = lista.querySelector(`.usuario-setores[data-user-id="${userId}"]`);

        if (!bloco) {
            return;
        }

        const setores = Array.from(bloco.querySelectorAll('.usuario-setor-chip.is-active'))
            .map((chip) => chip.dataset.setorId);

        const dica = bloco.querySelector('.usuario-setores-hint');

        if (dica) {
            const semRestricao = setores.length === 0;
            dica.textContent = semRestricao ? 'Todos (sem restricao)' : 'So os marcados';
            dica.classList.toggle('is-restrito', !semRestricao);
        }

        bloco.querySelectorAll('.usuario-setor-chip').forEach((chip) => {
            chip.setAttribute('aria-pressed', chip.classList.contains('is-active') ? 'true' : 'false');
        });

        try {
            const response = await fetch(`${USUARIOS_URL}/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setoresPermitidos: setores })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                toast(data.error || 'Nao foi possivel salvar os setores permitidos.', 'error');
            }
        } catch (error) {
            toast('Falha de comunicacao ao salvar os setores permitidos.', 'error');
        }
    }

    async function executarAcao(container, usuarioAtual, acao, id, nome) {
        // Definir senha nao e um PUT imediato: abre o campo para o admin digitar.
        if (acao === 'definir-senha') {
            mostrarFormDefinirSenha(container, usuarioAtual, id, nome);
            return;
        }

        const confirmacoes = {
            desativar: `Desativar o usuario "${nome}"? Ele perde o acesso imediatamente.`,
            'remover-admin': `Remover os poderes de administrador de "${nome}"?`,
            resetar: `Gerar uma nova senha para "${nome}"? A senha atual deixa de valer na hora — numa conta de visualizacao, toda a equipe precisara da senha nova.`,
            excluir: `Excluir DEFINITIVAMENTE o usuario "${nome}"? Esta acao nao pode ser desfeita — diferente de desativar, a conta e apagada de vez.`
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

        // Excluir usa DELETE (sem corpo); as demais acoes sao PUT de flags.
        const requestInit = acao === 'excluir'
            ? { method: 'DELETE' }
            : {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloads[acao])
            };

        try {
            const response = await fetch(`${USUARIOS_URL}/${id}`, requestInit);
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
            // A tela e admin-only e o permissoes.js ja redireciona o usuario
            // comum; esta e so uma rede de seguranca visual.
            container.innerHTML = '<p class="config-descricao">Apenas administradores podem gerenciar usuarios.</p>';
            return;
        }

        // Carrega os setores para os chips de "setores permitidos". Falha aqui
        // nao impede gerir contas — so esconde os chips.
        try {
            const setoresResp = await fetch(SETORES_URL);
            const setoresData = await setoresResp.json().catch(() => []);
            const bruto = Array.isArray(setoresData) ? setoresData : (setoresData.setores || setoresData.data || []);
            setoresDisponiveis = bruto.filter((setor) => (setor.id ?? setor.Id) != null);
        } catch (error) {
            setoresDisponiveis = [];
        }

        container.innerHTML = `
            <div class="usuarios-topo">
                <p class="config-descricao">
                    Contas de <strong>administrador</strong> sao pessoais e fazem lancamentos:
                    a senha definida aqui e temporaria e o dono troca no primeiro acesso.
                    A conta de <strong>visualizacao</strong> e compartilhada pela equipe e so
                    enxerga o calendario — a senha vale como definida e quem a usa nao pode
                    altera-la.
                </p>
                <button type="button" id="btnMinhaSenha" class="btn-secondary usuarios-minha-senha">
                    <i class="fas fa-key"></i> Minha senha
                </button>
            </div>

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

        // "Minha senha" reaproveita o modal de troca de senha que antes era
        // aberto pelo botao da sidebar (auth.js expoe window.abrirModalTrocarSenha).
        container.querySelector('#btnMinhaSenha')?.addEventListener('click', () => {
            if (typeof window.abrirModalTrocarSenha === 'function') {
                window.abrirModalTrocarSenha();
            }
        });

        carregarLista(container, usuarioAtual);
    };
})();

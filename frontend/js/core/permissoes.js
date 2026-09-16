// Camada de permissao do front-end. O controle real esta no back-end
// (portao em backend/server.js: nao-admin so faz GET e nao acessa
// configuracao-banco/sistema/usuarios). Aqui a intencao e apenas nao
// oferecer ao usuario comum botoes que resultariam em 403 — esconder
// interface nao e mecanismo de seguranca.
(function initPermissoes(root) {
    'use strict';

    // Usuario comum tem acesso somente de leitura, e por ora apenas ao
    // calendario compartilhado (folgas, ferias e ausencias da equipe).
    const PAGINAS_USUARIO_COMUM = Object.freeze(['calendario']);
    const PAGINA_PADRAO_USUARIO_COMUM = 'calendario';

    function usuarioEhAdmin() {
        return Boolean(root.__usuarioAtual && root.__usuarioAtual.isAdmin);
    }

    function paginaPermitida(pagina) {
        return usuarioEhAdmin() || PAGINAS_USUARIO_COMUM.includes(pagina);
    }

    // Filtra os botoes de navegacao (os que tem data-page). "Sair" nao tem
    // data-page e continua visivel para qualquer perfil — esconde-lo
    // deixaria o usuario comum sem como sair.
    function aplicarPermissoesSidebar() {
        const admin = usuarioEhAdmin();

        // Inclui o item "Usuarios" (data-page="usuarios"): como nao esta em
        // PAGINAS_USUARIO_COMUM, ja fica oculto para o usuario comum aqui. A
        // troca de senha pessoal saiu da sidebar e virou o botao "Minha senha"
        // dentro dessa tela (so admin a alcanca).
        document.querySelectorAll('.sidebar-btn[data-page]').forEach((btn) => {
            const permitido = admin || PAGINAS_USUARIO_COMUM.includes(btn.dataset.page);
            btn.classList.toggle('sidebar-btn-oculto', !permitido);
        });
    }

    // Envolve carregarPagina para que qualquer caminho de navegacao — clique
    // na sidebar, hash na URL, chamada interna — caia na mesma checagem.
    function protegerNavegacao() {
        const original = root.carregarPagina;

        if (typeof original !== 'function' || original.__permissoesAplicadas) {
            return;
        }

        function carregarPaginaComPermissao(pagina) {
            if (!paginaPermitida(pagina)) {
                return original.call(this, PAGINA_PADRAO_USUARIO_COMUM);
            }

            return original.call(this, pagina);
        }

        carregarPaginaComPermissao.__permissoesAplicadas = true;
        root.carregarPagina = carregarPaginaComPermissao;
    }

    function aplicarPermissoesUI() {
        aplicarPermissoesSidebar();
    }

    root.usuarioEhAdmin = usuarioEhAdmin;
    root.aplicarPermissoesUI = aplicarPermissoesUI;

    // Instalado ja no carregamento do script, e nao dentro de
    // aplicarPermissoesUI: o bootstrap do app.js chama carregarPagina para
    // renderizar a primeira tela, e ele precisa encontrar a versao protegida.
    // Este arquivo e carregado depois de app.js, entao carregarPagina existe.
    protegerNavegacao();

    // Rede de seguranca para a corrida de carregamento: se a sessao ja
    // estava resolvida antes deste script carregar, auth.js nao encontrou
    // aplicarPermissoesUI e a sidebar ficaria sem filtro.
    document.addEventListener('DOMContentLoaded', function reaplicar() {
        if (root.__usuarioAtual) {
            aplicarPermissoesUI();
        }
    });
}(window));

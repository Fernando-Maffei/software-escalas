// Camada de permissao do front-end. O controle real esta no back-end
// (portao em backend/server.js: nao-admin so faz GET e nao acessa
// configuracao-banco/sistema/usuarios). Aqui a intencao e apenas nao
// oferecer ao usuario comum botoes que resultariam em 403 — esconder
// interface nao e mecanismo de seguranca.

import { estado } from './estado.js';

// Usuario comum tem acesso somente de leitura, e por ora apenas ao
// calendario compartilhado (folgas, ferias e ausencias da equipe).
const PAGINAS_USUARIO_COMUM = Object.freeze(['calendario']);
const PAGINA_PADRAO_USUARIO_COMUM = 'calendario';

export function usuarioEhAdmin() {
    return Boolean(estado.usuarioAtual && estado.usuarioAtual.isAdmin);
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

// Pagina que a navegacao deve abrir de fato: usuario comum que pede uma
// pagina fora do seu perfil cai na pagina padrao. carregarPagina passa
// por aqui em todo caminho (clique na sidebar, hash na URL, chamada interna).
export function paginaDestinoPermitida(pagina) {
    return paginaPermitida(pagina) ? pagina : PAGINA_PADRAO_USUARIO_COMUM;
}

export function aplicarPermissoesUI() {
    aplicarPermissoesSidebar();
}

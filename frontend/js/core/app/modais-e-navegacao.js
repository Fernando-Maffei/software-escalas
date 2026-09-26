

let dataSelecionada = null;

/* ===========================
   NAVEGAÇÃO
=========================== */
function configurarNavegacao() {
}

// Pagina que esta montada agora. O popstate abaixo usa para ignorar o eco da
// propria troca de hash (ver comentario no listener).
let paginaCarregadaAtual = null;

function carregarPagina(pagina) {

    if (!appContent) {
        return;
    }

    paginaCarregadaAtual = pagina;

    // 🔥 NOVO: Atualiza a URL sem recarregar a página
    window.location.hash = pagina;
    
    // Atualiza o botão ativo na sidebar
    if (typeof window.setActiveButton === 'function') {
        window.setActiveButton(pagina);
    }
    
    // Parar atualização automática do dashboard se estiver saindo dele
    if (pagina !== 'dashboard' && typeof window.pararAtualizacaoAutomatica === 'function') {
        window.pararAtualizacaoAutomatica();
    }
    
    switch (pagina) {
        case "dashboard":
            renderDashboard();
            break;
        case "calendario":
            renderCalendario();
            break;
        case "colaboradores":
            renderColaboradores();
            break;
        case "escala":
            renderEscalaDia();
            break;
        case "lancamentoPlantao":
            renderLancamentoPlantao();
            break;
        case "configuracoes":
            renderConfiguracoes();
            break;
        case "usuarios":
            renderUsuarios();
            break;
        case "relatorios":
            renderRelatorios();
            break;
        case "bancoHoras":
            if (typeof window.renderBancoHoras === 'function') {
                window.renderBancoHoras();
            } else {
                console.error('renderBancoHoras nao carregado');
                renderDashboard();
            }
            break;
        default:
            console.warn("Página não encontrada:", pagina);
            renderDashboard(); // Fallback para dashboard
    }
}

/* ===========================
   TELA COLABORADORES
=========================== */

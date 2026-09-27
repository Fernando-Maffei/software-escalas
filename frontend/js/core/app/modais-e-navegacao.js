import { render as renderBancoHoras } from '../../telas/banco-horas.js';
import { pararAtualizacaoAutomatica, renderDashboard } from '../../telas/dashboard/render.js';
import { renderEscalaDia } from '../../telas/escala-dia-editor.js';
import { appContent } from '../app.js';
import { setActiveButton } from '../layout-pagina.js';
import { paginaDestinoPermitida } from '../permissoes.js';
import { renderRelatorios } from '../runtime/escala-e-relatorios.js';
import { renderLancamentoPlantao } from '../runtime/plantao-colaboradores/plantao-regua-e-relatorios.js';
import { renderCalendario } from './calendario-e-legenda.js';
import { renderColaboradores } from './colaboradores.js';
import { renderConfiguracoes } from './configuracoes-tela.js';
import { renderUsuarios } from './horas-e-resumo.js';

/* ===========================
   NAVEGAÇÃO
=========================== */
export function configurarNavegacao() {
}

// Pagina que esta montada agora. O popstate abaixo usa para ignorar o eco da
// propria troca de hash (ver comentario no listener).
export let paginaCarregadaAtual = null;

export function carregarPagina(paginaSolicitada) {
    const pagina = paginaDestinoPermitida(paginaSolicitada);

    if (!appContent) {
        return;
    }

    paginaCarregadaAtual = pagina;

    // 🔥 NOVO: Atualiza a URL sem recarregar a página
    window.location.hash = pagina;

    // Atualiza o botão ativo na sidebar
    setActiveButton(pagina);

    // Parar atualização automática do dashboard se estiver saindo dele
    if (pagina !== 'dashboard') {
        pararAtualizacaoAutomatica();
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
            renderBancoHoras();
            break;
        default:
            console.warn("Página não encontrada:", pagina);
            renderDashboard(); // Fallback para dashboard
    }
}

/* ===========================
   TELA COLABORADORES
=========================== */

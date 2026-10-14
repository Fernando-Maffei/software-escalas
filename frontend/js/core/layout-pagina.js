// Casca da pagina: barra lateral (navegacao, botao ativo, recolher/expandir) e
// o indicador de carregamento. Ate 2026-09 eram tres <script> inline repetidos
// em frontend/index.html e demo/index.html.

import { carregarPagina } from './app/modais-e-navegacao.js';

// Marca na barra lateral o botao da pagina aberta.
export function setActiveButton(page) {
    document.querySelectorAll('.sidebar-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
}

function ligarNavegacaoDaBarraLateral() {
    const botoes = document.querySelectorAll('.sidebar-btn');

    botoes.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            botoes.forEach((outro) => outro.classList.remove('active'));
            btn.classList.add('active');
            carregarPagina(btn.dataset.page);
        });
    });
}

function ligarRecolherBarraLateral() {
    const toggleBtn = document.getElementById('toggleMainSidebar');

    if (!toggleBtn) {
        return;
    }

    document.body.classList.add('sidebar-no-transition');

    const estadoSalvo = localStorage.getItem('mainSidebarCollapsed');

    if (estadoSalvo === 'true') {
        document.body.classList.add('main-sidebar-collapsed');
        toggleBtn.title = 'Expandir menu';
    } else {
        document.body.classList.remove('main-sidebar-collapsed');
        toggleBtn.title = 'Recolher menu';
    }

    setTimeout(() => {
        document.body.classList.remove('sidebar-no-transition');
    }, 100);

    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        document.body.classList.add('sidebar-is-animating');

        const vaiRecolher = !document.body.classList.contains('main-sidebar-collapsed');

        document.body.classList.toggle('main-sidebar-collapsed', vaiRecolher);

        localStorage.setItem('mainSidebarCollapsed', vaiRecolher ? 'true' : 'false');

        toggleBtn.title = vaiRecolher ? 'Expandir menu' : 'Recolher menu';

        // Graficos e a grade da escala recalculam a largura ao fim da animacao.
        setTimeout(() => {
            document.body.classList.remove('sidebar-is-animating');
            window.dispatchEvent(new Event('resize'));
        }, 340);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loading = document.querySelector('.loading-indicator');
        if (loading) {
            loading.style.display = 'none';
        }
    }, 500);

    ligarNavegacaoDaBarraLateral();
    ligarRecolherBarraLateral();
});

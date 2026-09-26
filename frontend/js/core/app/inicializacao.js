
function inicializarAplicacaoUmaVez() {
    if (window.__appBootstrapPromise) {
        return window.__appBootstrapPromise;
    }

    window.__appBootstrapPromise = (async () => {

        const temaSalvo = localStorage.getItem('tema') || 'light';
        document.documentElement.setAttribute('data-theme', temaSalvo);

        try {
            await carregarColaboradores();

            await carregarAusencias();

            await carregarFeriadosLocais();

            if (typeof carregarPlantoes === 'function') {
                await carregarPlantoes();
            }
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            mostrarToast("Erro ao carregar dados do servidor", "error");
        }

        configurarNavegacao();
        configurarModais();
        configurarObservers();

        const paginaInicial = typeof getPaginaFromURL === 'function'
            ? getPaginaFromURL()
            : 'dashboard';

        // Espera o perfil do usuario antes de renderizar: sem isso, um
        // usuario comum veria o dashboard aparecer e so depois ser trocado
        // pelo calendario. Usa window.carregarPagina (e nao a funcao local)
        // porque e nela que js/core/permissoes.js instala o filtro de perfil.
        if (typeof window.aguardarUsuarioAutenticado === 'function') {
            await window.aguardarUsuarioAutenticado();
        }

        window.carregarPagina(paginaInicial);
    })();

    return window.__appBootstrapPromise;
}

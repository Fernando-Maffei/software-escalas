
function inicializarAplicacaoUmaVez() {
    if (window.__appBootstrapPromise) {
        return window.__appBootstrapPromise;
    }

    window.__appBootstrapPromise = (async () => {
        console.log("Inicializando aplicaÃ§Ã£o...");

        const temaSalvo = localStorage.getItem('tema') || 'light';
        document.documentElement.setAttribute('data-theme', temaSalvo);

        try {
            await carregarColaboradores();
            console.log("Colaboradores carregados:", colaboradores.length);

            await carregarAusencias();
            console.log("AusÃªncias carregadas:", ausencias.length);

            await carregarFeriadosLocais();
            console.log("Feriados locais carregados:", feriadosLocais.length);

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

        console.log("Carregando pÃ¡gina inicial:", paginaInicial);
        window.carregarPagina(paginaInicial);
    })();

    return window.__appBootstrapPromise;
}

import { aguardarUsuarioAutenticado } from '../auth.js';
import { estado } from '../estado.js';
import { carregarAusencias, carregarColaboradores, carregarFeriadosLocais, carregarPlantoes, configurarModais, configurarObservers } from '../runtime/dados-e-modais.js';
import { getPaginaFromURL } from './calendario-e-legenda.js';
import { mostrarToast } from './horas-e-resumo.js';
import { carregarPagina, configurarNavegacao } from './modais-e-navegacao.js';

export function inicializarAplicacaoUmaVez() {
    if (estado.appBootstrapPromise) {
        return estado.appBootstrapPromise;
    }

    estado.appBootstrapPromise = (async () => {

        const temaSalvo = localStorage.getItem('tema') || 'light';
        document.documentElement.setAttribute('data-theme', temaSalvo);

        // Dados so depois do login: antes, com a tela de login aberta, o app ja
        // disparava as cargas e todas voltavam 401.
        await aguardarUsuarioAutenticado();

        try {
            await carregarColaboradores();

            await carregarAusencias();

            await carregarFeriadosLocais();

            await carregarPlantoes();
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            mostrarToast("Erro ao carregar dados do servidor", "error");
        }

        configurarNavegacao();
        configurarModais();
        configurarObservers();

        const paginaInicial = getPaginaFromURL();

        // Espera o perfil do usuario antes de renderizar: sem isso, um
        // usuario comum veria o dashboard aparecer e so depois ser trocado
        // pelo calendario (carregarPagina aplica o filtro de perfil de
        // core/permissoes.js).
        await aguardarUsuarioAutenticado();

        carregarPagina(paginaInicial);
    })();

    return estado.appBootstrapPromise;
}

import { abrirModalLancamento, buscarColaboradoresComDiretorio, cancelarEdicaoLancamento, carregarListagens, carregarListagensComFiltro } from '../../telas/lancamentos.js';
import { API } from '../api.js';
import { mostrarToast } from '../app/horas-e-resumo.js';
import { estado } from '../estado.js';
import { __refreshVisibleViews } from './escala-e-relatorios.js';
import { normalizeRuntimeAusenciaTipo, normalizeRuntimePeriodoTipo } from './normalizacao.js';
import { atualizarTudo } from './plantao-colaboradores/plantao-regua-e-relatorios.js';

let exclusaoEmAndamento;
let observersConfigurados;
let modaisConfigurados;

const inflight = new Map();

function withInFlight(key, task) {
    if (inflight.has(key)) {
        return inflight.get(key);
    }

    const promise = Promise.resolve()
        .then(task)
        .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
}

function fecharModalSeguro(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.classList.remove('active');
}

function limparExclusaoPendente() {
    estado.exclusaoPendenteId = null;
    estado.exclusaoTipo = 'ausencia';
    estado.exclusaoPendenteId = null;
    estado.exclusaoTipo = 'ausencia';
}

// Falha ao carregar uma lista NAO pode virar lista vazia em silencio: a
// tela mostraria "nenhum colaborador/ausencia" como se fosse verdade. O
// usuario e avisado (uma vez a cada 30s por recurso, para nao inundar de
// avisos com o servidor fora) e a tela segue com os ultimos dados que
// chegaram. 401 fica de fora: a sessao expirada ja leva para o login.
const INTERVALO_AVISO_FALHA_MS = 30 * 1000;
const ultimoAvisoFalha = new Map();

function falhaAoCarregar(recurso, erro, ultimosDados) {
    console.error(`[dados] falha ao carregar ${recurso}:`, erro);

    const anterior = Array.isArray(ultimosDados) ? ultimosDados : [];

    if (erro?.status === 401) {
        return anterior;
    }

    const agora = Date.now();

    if (agora - (ultimoAvisoFalha.get(recurso) || 0) >= INTERVALO_AVISO_FALHA_MS) {
        ultimoAvisoFalha.set(recurso, agora);

        mostrarToast(
            anterior.length
                ? `Nao foi possivel atualizar ${recurso}. Mostrando os ultimos dados carregados.`
                : `Nao foi possivel carregar ${recurso}. Tente novamente.`,
            'error'
        );
    }

    return anterior;
}

function obterDataISO(valor) {
    if (!valor) {
        return null;
    }

    if (typeof valor === 'string') {
        return valor.includes('T') ? valor.split('T')[0] : valor;
    }

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        return null;
    }

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Esta e a UNICA mapAusencia em uso (chamada em carregarAusencias, abaixo)
// e portanto o que estado.ausencias contem. Subtipo e DescontaBancoHoras
// faltavam aqui: o backend os manda, mas eles morriam nesta funcao. O
// efeito era duplo — o card do lancamento nao tinha o que exibir, e ao
// editar uma ausencia medica sem desconto o formulario reabria com o
// padrao ("Comum", desconto marcado) e o Atualizar gravava esse padrao em
// cima do que estava salvo, mexendo no saldo do banco de horas.
function mapAusencia(item) {
    const tipo = normalizeRuntimeAusenciaTipo(item.Tipo || item.tipo);
    const periodoTipo = normalizeRuntimePeriodoTipo(item.PeriodoTipo || item.periodoTipo || 'dia_inteiro');
    const subtipo = item.Subtipo || item.subtipo || null;

    // Tres estados distintos: true, false e null (coluna ausente no schema
    // ou registro antigo). Boolean() achataria null para false e faria um
    // lancamento antigo parecer "nao desconta".
    const descontaBruto = item.DescontaBancoHoras ?? item.descontaBancoHoras;
    const descontaBancoHoras = descontaBruto === null || descontaBruto === undefined
        ? null
        : Boolean(descontaBruto);

    const observacao = item.Observacao || item.observacao || null;

    return {
        Id: item.Id,
        ColaboradorId: item.ColaboradorId,
        Tipo: tipo,
        DataInicio: item.DataInicio,
        DataFim: item.DataFim,
        DataCadastro: item.DataCadastro,
        PeriodoTipo: periodoTipo,
        HoraInicio: item.HoraInicio,
        HoraFim: item.HoraFim,
        Subtipo: subtipo,
        DescontaBancoHoras: descontaBancoHoras,
        Observacao: observacao,
        id: item.Id,
        colaboradorId: item.ColaboradorId,
        tipo,
        dataInicio: item.DataInicio,
        dataFim: item.DataFim,
        periodoTipo,
        horaInicio: item.HoraInicio,
        horaFim: item.HoraFim,
        subtipo,
        descontaBancoHoras,
        observacao
    };
}

function mapPlantao(item) {
    const dataISO = obterDataISO(item.dataISO || item.data_plantao);

    return {
        ...item,
        dataISO,
        tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
        // Registro antigo (antes da coluna tipo_credito) sempre creditava.
        tipoCredito: String(item.tipoCredito || item.tipo_credito || '').toLowerCase() === 'extra' ? 'extra' : 'banco',
        // Sem o campo (registro antigo), as telas tratam como o plantao do dia.
        tipoLancamento: item.tipoLancamento || item.tipo_lancamento || null,
        colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
        horaInicio: item.horaInicio || item.hora_inicio || null,
        horaFim: item.horaFim || item.hora_fim || null,
        observacao: item.observacao || null
    };
}

// Carregador de colaboradores usado pelo sistema todo: junta chamadas
// simultaneas e trata a falha em volta do carregador de telas/lancamentos.js
// (que tambem mantem o diretorio com os desligados).
export function carregarColaboradores() {
    return withInFlight('colaboradores', async () => {
        let lista;

        try {
            const data = await buscarColaboradoresComDiretorio();
            lista = Array.isArray(data) ? data : [];
        } catch (error) {
            lista = falhaAoCarregar('os colaboradores', error, estado.colaboradores);
        }

        estado.colaboradores = lista;
        estado.colaboradores = lista;
        return lista;
    });
}

export function carregarSetores() {
    return withInFlight('setores', async () => {
        let lista;

        try {
            const data = await API.getSetores();
            lista = Array.isArray(data) ? data : [];
        } catch (error) {
            lista = falhaAoCarregar('os setores', error, estado.setores);
        }

        estado.setores = lista;
        estado.setores = lista;
        return lista;
    });
}

// Tipos de escala: o molde do padrao semanal. Sem tipos cadastrados a lista
// fica vazia e o select de tipo simplesmente nao aparece no editor.
export function carregarTiposEscala() {
    return withInFlight('tiposEscala', async () => {
        let lista;

        try {
            const data = await API.getTiposEscala();
            lista = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
        } catch (error) {
            lista = falhaAoCarregar('os tipos de escala', error, estado.tiposEscala);
        }

        estado.tiposEscala = lista;
        return lista;
    });
}

export function carregarAusencias() {
    return withInFlight('ausencias', async () => {
        let lista;

        try {
            const data = await API.getAusencias();
            lista = Array.isArray(data) ? data.map(mapAusencia) : [];
        } catch (error) {
            lista = falhaAoCarregar('as ausencias', error, estado.ausencias);
        }

        estado.ausencias = lista;
        estado.ausencias = lista;
        return lista;
    });
}

function lerFeriadosSalvos() {
    try {
        const salvos = JSON.parse(localStorage.getItem('feriadosLocais') || '[]');
        return Array.isArray(salvos) ? salvos : [];
    } catch (erro) {
        // Conteudo corrompido no localStorage: e so um cache, descarta.
        return [];
    }
}

export function carregarFeriadosLocais() {
    return withInFlight('feriadosLocais', async () => {
        let lista;

        try {
            const data = await API.getFeriados();
            lista = Array.isArray(data) ? data : [];
            localStorage.setItem('feriadosLocais', JSON.stringify(lista));
        } catch (error) {
            // Sem servidor, a ultima lista salva neste navegador ainda vale.
            lista = falhaAoCarregar('os feriados', error, lerFeriadosSalvos());
        }

        estado.feriadosLocais = lista;
        estado.feriadosLocais = lista;
        return lista;
    });
}

export function carregarPlantoes() {
    return withInFlight('plantoes', async () => {
        let lista;

        try {
            const data = await API.getPlantoes();
            lista = Array.isArray(data) ? data.map(mapPlantao) : [];
        } catch (error) {
            lista = falhaAoCarregar('os plantoes', error, estado.plantoesLancados);
        }

        estado.plantoesLancados = lista;
        estado.plantoesLancados = lista;
        return lista;
    });
}

async function confirmarExclusao() {
    const id = estado.exclusaoPendenteId;
    const tipo = estado.exclusaoTipo || 'ausencia';

    if (!id) {
        fecharModalSeguro('modalConfirmacao');
        return;
    }

    // Clique duplo em "Sim, excluir" mandava dois DELETE: o segundo voltava
    // 404 e a tela mostrava erro e sucesso ao mesmo tempo.
    if (exclusaoEmAndamento) {
        return;
    }

    exclusaoEmAndamento = true;

    try {
        if (tipo === 'feriado') {
            await API.excluirFeriado(id);
        } else {
            await API.excluirAusencia(id);
        }

        cancelarEdicaoLancamento();

        await atualizarTudo({ silent: true });

        mostrarToast('Excluído com sucesso!', 'success');
    } catch (error) {
        mostrarToast(`Erro ao excluir: ${error.message}`, 'error');
    } finally {
        exclusaoEmAndamento = false;
        limparExclusaoPendente();
        fecharModalSeguro('modalConfirmacao');
    }
}

export function configurarModais() {
    if (modaisConfigurados) {
        return;
    }

    modaisConfigurados = true;

    document.addEventListener('click', (event) => {
        const target = event.target;

        if (target.closest('#btnLancamentoAjuste')) {
            event.preventDefault();
            abrirModalLancamento('pessoal', null, false);
            return;
        }

        if (target.closest('#fecharModalLancamentoBtn')) {
            fecharModalSeguro('modalLancamento');
            return;
        }

        if (target.closest('#fecharModalConfirmacaoBtn') || target.closest('#cancelarExclusaoBtn')) {
            limparExclusaoPendente();
            fecharModalSeguro('modalConfirmacao');
            return;
        }

        if (target.closest('#confirmarExclusaoBtn')) {
            event.preventDefault();
            confirmarExclusao();
            return;
        }
    });

    window.addEventListener('click', (event) => {
        if (!event.target.classList?.contains('modal')) {
            return;
        }

        if (event.target.id === 'modalConfirmacao') {
            limparExclusaoPendente();
        }

        event.target.classList.add('hidden');
        event.target.classList.remove('active');
    });
}

export function configurarObservers() {
    if (observersConfigurados) {
        return;
    }

    observersConfigurados = true;
}

export async function atualizarDadosCompartilhados(options = {}) {
    const { silent = false } = options;

    try {
        await Promise.allSettled([
            carregarColaboradores(),
            carregarSetores(),
            carregarAusencias(),
            carregarFeriadosLocais(),
            carregarPlantoes()
        ]);

        const modalLancamento = document.getElementById('modalLancamento');
        if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
            if (estado.modalDataSelecionada) {
                await carregarListagensComFiltro(estado.modalDataSelecionada, estado.modalFiltroData !== false);
            } else {
                await carregarListagens();
            }
        }

        await __refreshVisibleViews(options);

        if (!silent) {
            mostrarToast('Dados atualizados!', 'success');
        }
    } catch (error) {
        mostrarToast(`Erro ao atualizar dados: ${error.message}`, 'error');
    }
}

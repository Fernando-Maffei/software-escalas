import { API } from '../../core/api.js';
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { carregarPagina } from '../../core/app/modais-e-navegacao.js';
import { estado } from '../../core/estado.js';
import { dataPlantaoValidaComFeriados, ehDataPlantaoValida } from '../../core/runtime/plantao-colaboradores/plantao-regua-e-relatorios.js';
import { abrirEditorNaEscala } from '../escala-dia-editor.js';
import { formatDatePtBrEscala, toISODateEscala } from '../escala-dia-shared.js';
import { abrirModalLancamento } from '../lancamentos.js';
import { carregarEscalaDiaEscala, getScaleEditorRecordEscala } from './editor-lateral.js';
import { getCurrentScaleState } from './estado-e-layout.js';
import { buildScaleSectorFiltersEscala, filterScaleItemsBySectorEscala, getScaleSectorSelectionEscala } from './filtros-setor.js';
import { abrirReporDomingoEscala, atualizarBotaoReporDomingoEscala } from './repor-domingo.js';

export function obterDataSelecionadaEscala() {
    return document.getElementById('seletorDataEscala')?.value || getCurrentScaleState()?.dataISO || toISODateEscala(new Date());
}

export function shiftIsoDateEscala(dataISO, deltaDays) {
    const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const [year, month, day] = normalized.split('-').map(Number);
    const nextDate = new Date(year, month - 1, day);
    nextDate.setDate(nextDate.getDate() + Number(deltaDays || 0));
    return toISODateEscala(nextDate);
}

export async function carregarEscalaSelecionadaEscala(dataISO, opcoes = {}) {
    const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
    estado.dataEscalaSelecionada = normalized;
    await carregarEscalaDiaEscala(normalized, opcoes);
    atualizarAcoesCabecalhoEscala();
}

// Depois de gravar algo que so mexe na escala do dia (horario, almoco), basta
// reler o dia. Antes cada ajuste chamava atualizarTudo, que recarregava
// colaboradores, setores, ausencias, feriados, plantoes e o banco de horas —
// nada disso muda com um ajuste da escala.
export function recarregarDiaAbertoEscala() {
    return carregarEscalaSelecionadaEscala(obterDataSelecionadaEscala());
}

function marcarBotaoPlantaoEscala(botao, permitido) {
    botao.disabled = !permitido;
    botao.title = permitido
        ? 'Abrir o plantao do dia selecionado'
        : 'Selecione um sabado, domingo ou feriado para abrir o plantao';
    botao.classList.toggle('is-disabled', !permitido);
}

// Plantao existe em sabado, domingo e feriado (a mesma regra da tela de
// plantoes). O botao so aceitava sabado: no domingo do plantonista, ou num
// feriado, nao havia como ir da escala para o plantao do dia.
export function atualizarAcoesCabecalhoEscala() {
    const botaoPlantao = document.getElementById('btnAbrirPlantaoEscala');
    const dataISO = obterDataSelecionadaEscala();

    atualizarBotaoReporDomingoEscala(dataISO);

    if (!botaoPlantao) {
        return;
    }

    marcarBotaoPlantaoEscala(botaoPlantao, ehDataPlantaoValida(dataISO));

    // Feriado nacional de outro ano pode ainda nao estar na lista: confere
    // (uma busca por ano, com cache) e so entao libera.
    if (botaoPlantao.disabled) {
        dataPlantaoValidaComFeriados(dataISO).then((valida) => {
            if (valida && obterDataSelecionadaEscala() === dataISO) {
                marcarBotaoPlantaoEscala(botaoPlantao, true);
            }
        });
    }
}

// "Repor domingo": grava o dia aberto como o dia da reposicao de uma folga de
// domingo pendente e recarrega o dia para a linha aparecer.
export function reporDomingoDaEscala() {
    const dataISO = obterDataSelecionadaEscala();

    return abrirReporDomingoEscala(dataISO, { aoGravar: () => carregarEscalaSelecionadaEscala(dataISO) });
}

export function atualizarBotaoRestaurarAlmocosEscala() {
    const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');

    if (!button) {
        return;
    }

    const hasVisibleItems = filterScaleItemsBySectorEscala(getCurrentScaleState().items || []).length > 0;
    button.disabled = !hasVisibleItems;
    button.classList.toggle('is-disabled', !hasVisibleItems);
    button.title = hasVisibleItems
        ? 'Restaurar os almocos da data para o horario cadastrado nos colaboradores'
        : 'Nao ha colaboradores visiveis para restaurar nesta data';
}

function getSelectedScaleSectorContextEscala() {
    const selecao = getScaleSectorSelectionEscala();

    // Restaurar almocos age por 1 setor ou "todos". Com varios selecionados,
    // cai em "todos" (a API aceita 1 setorId ou nenhum).
    if (selecao.size !== 1) {
        return {
            setorId: null,
            setorNome: selecao.size === 0 ? 'todos os setores' : 'setores selecionados'
        };
    }

    const filterId = [...selecao][0];
    const selected = buildScaleSectorFiltersEscala(getCurrentScaleState().items || [])
        .find((item) => String(item.id) === String(filterId));

    return {
        setorId: Number(filterId),
        setorNome: selected?.nome || `setor ${filterId}`
    };
}

export async function restaurarAlmocosCadastroDiaEscala() {
    const state = getCurrentScaleState();
    const dataISO = obterDataSelecionadaEscala();
    const visibleItems = filterScaleItemsBySectorEscala(state.items || []);

    if (visibleItems.length === 0) {
        mostrarToast('Nao ha colaboradores visiveis para restaurar nesta data.', 'warning');
        return;
    }

    const setor = getSelectedScaleSectorContextEscala();
    const scopeLabel = setor.setorId ? `do setor ${setor.setorNome}` : 'de todos os setores';
    const confirmed = window.confirm(
        `Restaurar os almocos ${scopeLabel} em ${formatDatePtBrEscala(dataISO)} para o horario do cadastro?`
    );

    if (!confirmed) {
        return;
    }

    const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');
    const selectedEditorId = estado.escalaEditorColaboradorId;

    if (button) {
        button.disabled = true;
        button.classList.add('is-loading');
    }

    try {
        const payload = await API.restaurarAlmocosCadastroEscala(dataISO, {
            setorId: setor.setorId || undefined
        });
        const result = payload?.data || {};

        estado.escalaLunchDrafts = {};
        await carregarEscalaSelecionadaEscala(dataISO);

        if (selectedEditorId && getScaleEditorRecordEscala(selectedEditorId)) {
            abrirEditorNaEscala(selectedEditorId);
        }

        const details = [
            `${result.updated || 0} almoco(s) restaurado(s)`,
            result.invalidos ? `${result.invalidos} fora da jornada` : '',
            result.semCadastro ? `${result.semCadastro} sem almoco no cadastro` : ''
        ].filter(Boolean).join(', ');

        mostrarToast(`Restauracao concluida: ${details}.`, result.updated ? 'success' : 'warning');
    } catch (error) {
        mostrarToast(`Erro ao restaurar almocos: ${error.message}`, 'error');
    } finally {
        if (button) {
            button.classList.remove('is-loading');
            atualizarBotaoRestaurarAlmocosEscala();
        }
    }
}

export function abrirLancamentoPessoalEscala() {
    const dataISO = obterDataSelecionadaEscala();

    abrirModalLancamento('pessoal', dataISO, true);
}

export async function abrirPlantaoDaEscala() {
    const dataISO = obterDataSelecionadaEscala();

    if (!(await dataPlantaoValidaComFeriados(dataISO))) {
        mostrarToast('Selecione um sabado, domingo ou feriado para abrir o plantao.', 'warning');
        return;
    }

    // A tela de plantoes abre no mes deste dia, com ele ja no painel.
    estado.plantaoAbrirDataISO = dataISO;

    carregarPagina('lancamentoPlantao');
}

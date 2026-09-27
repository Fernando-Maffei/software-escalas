import { API } from '../../core/api.js';
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { carregarPagina } from '../../core/app/modais-e-navegacao.js';
import { estado } from '../../core/estado.js';
import { abrirEditorNaEscala } from '../escala-dia-editor.js';
import { formatDatePtBrEscala, getIsoDayOfWeekEscala, toISODateEscala } from '../escala-dia-shared.js';
import { abrirModalLancamento } from '../lancamentos.js';
import { carregarEscalaDiaEscala, getScaleEditorRecordEscala } from './editor-lateral.js';
import { getCurrentScaleState } from './estado-e-layout.js';
import { buildScaleSectorFiltersEscala, filterScaleItemsBySectorEscala, getScaleSectorSelectionEscala } from './filtros-setor.js';

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

export async function carregarEscalaSelecionadaEscala(dataISO) {
    const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
    estado.dataEscalaSelecionada = normalized;
    await carregarEscalaDiaEscala(normalized);
    atualizarAcoesCabecalhoEscala();
}

export function atualizarAcoesCabecalhoEscala() {
    const botaoPlantao = document.getElementById('btnAbrirPlantaoEscala');
    const dataISO = obterDataSelecionadaEscala();
    const isSaturday = getIsoDayOfWeekEscala(dataISO) === 6;

    if (!botaoPlantao) {
        return;
    }

    botaoPlantao.disabled = !isSaturday;
    botaoPlantao.title = isSaturday
        ? 'Abrir o plantao do sabado selecionado'
        : 'Selecione um sabado para abrir o plantao';
    botaoPlantao.classList.toggle('is-disabled', !isSaturday);
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

export function abrirPlantaoDaEscala() {
    const dataISO = obterDataSelecionadaEscala();

    if (getIsoDayOfWeekEscala(dataISO) !== 6) {
        mostrarToast('Selecione um sabado para abrir o plantao.', 'warning');
        return;
    }

    estado.plantaoSabadoAncoraISO = dataISO;
    estado.plantaoDataFocoISO = dataISO;

    carregarPagina('lancamentoPlantao');
}

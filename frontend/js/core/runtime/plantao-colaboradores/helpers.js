import { estado } from '../../estado.js';

let plantaoEditorState;

const inflight = new Map();

export function withInFlight(key, task) {
    if (inflight.has(key)) {
        return inflight.get(key);
    }

    const promise = Promise.resolve()
        .then(task)
        .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
}

export function fecharModalSeguro(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.classList.remove('active');
}

export function obterDataISO(valor) {
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

function obterHoraValor(valor) {
    if (!valor) {
        return null;
    }

    if (typeof valor === 'string') {
        const bruto = valor.includes('T') ? valor.split('T')[1] : valor;
        const match = bruto.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
        return match ? `${match[1]}:00` : null;
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        return null;
    }

    const isTimeOnlyDate = data.getUTCFullYear() === 1970
        && data.getUTCMonth() === 0
        && data.getUTCDate() === 1;
    const horas = String(isTimeOnlyDate ? data.getUTCHours() : data.getHours()).padStart(2, '0');
    const minutos = String(isTimeOnlyDate ? data.getUTCMinutes() : data.getMinutes()).padStart(2, '0');
    return `${horas}:${minutos}:00`;
}

export function formatarDataPtBr(valor) {
    const dataISO = obterDataISO(valor);

    if (!dataISO) {
        return '--';
    }

    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

export function formatarHoraInput(valor) {
    const hora = obterHoraValor(valor);
    return hora ? hora.slice(0, 5) : '';
}

export function minutosParaTexto(valor, options = {}) {
    const { signed = false } = options;
    const total = Number.isFinite(valor) ? Math.round(valor) : 0;
    const sinal = total < 0 ? '-' : '+';
    const absoluto = Math.abs(total);
    const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
    const minutos = String(absoluto % 60).padStart(2, '0');
    return `${signed ? sinal : ''}${horas}h ${minutos}m`;
}

export function mapBancoHorasResumo(item) {
    return {
        colaboradorId: Number(item.colaboradorId),
        nome: item.nome,
        saldoMinutos: Number(item.saldoMinutos || 0),
        saldoFormatado: item.saldoFormatado || minutosParaTexto(item.saldoMinutos || 0, { signed: true }),
        creditosMesMinutos: Number(item.creditosMesMinutos || 0),
        creditosMesFormatado: item.creditosMesFormatado || minutosParaTexto(item.creditosMesMinutos || 0),
        debitosMesMinutos: Number(item.debitosMesMinutos || 0),
        debitosMesFormatado: item.debitosMesFormatado || minutosParaTexto(item.debitosMesMinutos || 0),
        ultimoMovimentoEm: item.ultimoMovimentoEm || null
    };
}

export function getBancoHorasResumoByColaborador(colaboradorId) {
    return (estado.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
}

export function getPlantaoEditorState() {
    if (!plantaoEditorState) {
        plantaoEditorState = null;
    }

    return plantaoEditorState;
}

export function setPlantaoEditorState(state) {
    plantaoEditorState = state;
    return state;
}

export function isColaboradoresScreenVisible() {
    return Boolean(document.getElementById('listaColaboradores'));
}

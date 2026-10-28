// Regras puras da tela de Coberturas (telas/coberturas.js), sem DOM, para
// serem testadas em tests/unit/coberturasTela.test.js. Quem valida de verdade
// e o servidor (backend/services/cobertura-trechos.js): aqui so o que a tela
// precisa para montar a lista, dividir um horario e mostrar o resumo antes de
// salvar.

const TIPOS_AUSENCIA_COM_COBERTURA = ['ferias', 'ausencia', 'folga'];
const PASSO_DIVISAO = 30;

export const ROTULOS_SITUACAO = Object.freeze({
    coberto: 'Coberto',
    parcial: 'Parcial',
    pendente: 'Pendente',
    vazia: 'Sem horario'
});

export const ROTULOS_ORIGEM = Object.freeze({
    ferias: 'Ferias',
    ausencia: 'Ausencia',
    folga: 'Folga'
});

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export function minutosDoHorario(hora) {
    const [h, m] = String(hora || '').split(':').map(Number);

    return Number.isFinite(h) && Number.isFinite(m) ? (h * 60) + m : null;
}

function horarioDosMinutos(minutos) {
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

// 'HH:MM:SS' do servidor -> 'HH:MM' dos <input type="time">.
export function horaCurta(hora) {
    return String(hora || '').slice(0, 5);
}

export function duracaoTrecho(trecho) {
    const inicio = minutosDoHorario(trecho.horaInicio);
    const fim = minutosDoHorario(trecho.horaFim);

    return inicio !== null && fim !== null && fim > inicio ? fim - inicio : 0;
}

export function textoDuracao(minutos) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;

    return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`;
}

export function rotuloDia(dataISO) {
    const [ano, mes, dia] = String(dataISO).split('-').map(Number);
    const semana = new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay();

    return `${DIAS_CURTOS[semana]} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export function dataBr(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');

    return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
}

export function rotuloOrigem(cobertura) {
    if (cobertura.ausenciaRemovida) {
        return 'Ausencia removida';
    }

    return cobertura.ausencia ? ROTULOS_ORIGEM[cobertura.ausencia.tipo] || 'Ausencia' : 'Avulsa';
}

// Corta o trecho no meio, numa meia hora cheia quando da. A primeira metade
// fica com o id e com quem ja cobria; a segunda nasce pendente, que e o caso
// de uso: entregar o resto do horario para outra pessoa. Sem espaco para
// dividir, devolve null.
export function dividirAoMeio(trecho) {
    const inicio = minutosDoHorario(trecho.horaInicio);
    const fim = minutosDoHorario(trecho.horaFim);

    if (inicio === null || fim === null || fim - inicio < 2) {
        return null;
    }

    let corte = Math.round((inicio + ((fim - inicio) / 2)) / PASSO_DIVISAO) * PASSO_DIVISAO;

    if (corte <= inicio || corte >= fim) {
        corte = inicio + Math.floor((fim - inicio) / 2);
    }

    const { id, ...semId } = trecho;

    return [
        { ...trecho, horaFim: horarioDosMinutos(corte) },
        {
            ...semId,
            horaInicio: horarioDosMinutos(corte),
            substitutoId: null,
            substitutoNome: null,
            substitutoOculto: false,
            tipoCredito: null
        }
    ];
}

// Cenario "uma pessoa cobre tudo": so os trechos ainda sem substituto.
export function atribuirPendentes(trechos, substitutoId, tipoCredito) {
    return trechos.map((trecho) => (
        trecho.substitutoId === null || trecho.substitutoId === undefined
            ? { ...trecho, substitutoId: Number(substitutoId), substitutoNome: null, tipoCredito }
            : trecho
    ));
}

export function agruparPorDia(trechos) {
    const dias = new Map();

    trechos.forEach((trecho, indice) => {
        if (!dias.has(trecho.dataISO)) {
            dias.set(trecho.dataISO, { dataISO: trecho.dataISO, tipoDia: trecho.tipoDia || 'util', itens: [] });
        }

        dias.get(trecho.dataISO).itens.push({ trecho, indice });
    });

    return [...dias.values()].sort((a, b) => a.dataISO.localeCompare(b.dataISO));
}

export function resumirTrechos(trechos) {
    let cobertos = 0;
    let pendentes = 0;

    for (const trecho of trechos) {
        const minutos = duracaoTrecho(trecho);

        if (trecho.substitutoId === null || trecho.substitutoId === undefined) {
            pendentes += minutos;
        } else {
            cobertos += minutos;
        }
    }

    let situacao = 'vazia';

    if (pendentes > 0) {
        situacao = cobertos > 0 ? 'parcial' : 'pendente';
    } else if (cobertos > 0) {
        situacao = 'coberto';
    }

    return { situacao, minutosCobertos: cobertos, minutosPendentes: pendentes };
}

// O que vai no PUT: so os campos que o servidor le de um trecho.
export function trechosParaEnvio(trechos) {
    return trechos.map((trecho) => ({
        ...(trecho.id ? { id: trecho.id } : {}),
        dataISO: trecho.dataISO,
        horaInicio: horaCurta(trecho.horaInicio),
        horaFim: horaCurta(trecho.horaFim),
        substitutoId: trecho.substitutoId ?? null,
        tipoCredito: trecho.substitutoId === null || trecho.substitutoId === undefined ? null : trecho.tipoCredito || null,
        observacao: trecho.observacao || null
    }));
}

// Ferias, ausencia ou folga de dia inteiro de um plantonista ativo, que ainda
// nao terminou e nao tem cobertura aberta: o atalho "Abrir cobertura".
export function ausenciasSemCobertura(ausencias, colaboradores, coberturas, hojeISO) {
    const plantonistas = new Map(
        (colaboradores || [])
            .filter((item) => item.IsPlantonista && item.Ativo !== false && item.Ativo !== 0)
            .map((item) => [Number(item.Id), item])
    );
    const comCobertura = new Set((coberturas || []).map((item) => Number(item.ausenciaId)).filter(Boolean));

    return (ausencias || [])
        .map((item) => ({
            id: Number(item.Id ?? item.id),
            colaboradorId: Number(item.ColaboradorId ?? item.colaboradorId),
            tipo: String(item.Tipo ?? item.tipo ?? '').toLowerCase(),
            periodoTipo: String(item.PeriodoTipo ?? item.periodoTipo ?? 'dia_inteiro').toLowerCase(),
            dataInicio: String(item.DataInicio ?? item.dataInicio ?? '').slice(0, 10),
            dataFim: String(item.DataFim ?? item.dataFim ?? '').slice(0, 10)
        }))
        .filter((item) => plantonistas.has(item.colaboradorId)
            && TIPOS_AUSENCIA_COM_COBERTURA.includes(item.tipo)
            && item.periodoTipo === 'dia_inteiro'
            && item.dataFim >= hojeISO
            && !comCobertura.has(item.id))
        .map((item) => ({ ...item, colaboradorNome: plantonistas.get(item.colaboradorId).Nome }))
        .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || a.colaboradorNome.localeCompare(b.colaboradorNome));
}

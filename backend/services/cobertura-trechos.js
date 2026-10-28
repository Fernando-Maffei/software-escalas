// Cobertura de plantonista: o horario que o titular deixa vago (ferias, folga,
// ausencia ou cobertura avulsa) dividido em TRECHOS — dia + horario + quem
// cobre. Ainda sem banco nem rota: aqui ficam so as regras, puras, para serem
// testadas sozinhas antes de qualquer migracao.
//
// A ideia central: os trechos de um dia formam uma PARTICAO do horario
// necessario. Ao abrir a cobertura cada dia nasce com um trecho so, pendente
// (substituto null); depois o administrador atribui, divide ou junta. Como
// dois trechos do mesmo dia nunca se sobrepoem, um mesmo horario nao tem como
// ser coberto duas vezes, e o que ficou sem substituto e exatamente o que esta
// descoberto.
//
// O horario necessario e CORRIDO (do inicio ao fim da jornada do titular): o
// almoco dele nao e descontado, quem cobre faz o proprio intervalo.
const { AppError } = require('../lib/errors');
const { PLANTAO_TIPOS_CREDITO } = require('../lib/dominio');
const { isFeriadoNacional } = require('./feriados-nacionais');
const {
    ensurePositiveInt,
    normalizeEnum,
    normalizeIsoDate,
    normalizeOptionalText,
    normalizeTime
} = require('../lib/validation');

function minutosDoHorario(hora) {
    const [h, m] = String(hora).split(':').map(Number);

    return (h * 60) + m;
}

function horarioDosMinutos(minutos) {
    const h = String(Math.floor(minutos / 60)).padStart(2, '0');
    const m = String(minutos % 60).padStart(2, '0');

    return `${h}:${m}:00`;
}

function intervalosSeCruzam(a, b) {
    return minutosDoHorario(a.horaInicio) < minutosDoHorario(b.horaFim)
        && minutosDoHorario(b.horaInicio) < minutosDoHorario(a.horaFim);
}

function duracaoMinutos(trecho) {
    return minutosDoHorario(trecho.horaFim) - minutosDoHorario(trecho.horaInicio);
}

function formatarDataBr(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');

    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(dataISO || '');
}

function formatarHora(hora) {
    return String(hora || '').slice(0, 5);
}

function diaDaSemana(dataISO) {
    const [ano, mes, dia] = dataISO.split('-').map(Number);

    return new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay();
}

function proximoDia(dataISO) {
    const [ano, mes, dia] = dataISO.split('-').map(Number);

    return new Date(Date.UTC(ano, mes - 1, dia + 1, 12)).toISOString().slice(0, 10);
}

// Tipo do dia para a cobertura: decide, mais adiante, se o trecho vira turno
// de plantao (sabado/domingo/feriado) ou linha da escala do dia util. Mesma
// prioridade de resolvePlantaoTypeByDate — feriado vence o fim de semana —,
// mas sem recusar o dia util, que aqui e valido.
function tipoDoDia(dataISO, feriados = null) {
    if (isFeriadoNacional(dataISO) || (feriados && typeof feriados.has === 'function' && feriados.has(dataISO))) {
        return 'feriado';
    }

    const semana = diaDaSemana(dataISO);

    if (semana === 6) {
        return 'sabado';
    }

    return semana === 0 ? 'domingo' : 'util';
}

// Credito do trecho. Sem padrao, por decisao do time: enquanto o trecho esta
// pendente fica null; atribuido, banco ou extra precisa ser escolhido.
function normalizarTipoCredito(valor, rotulo) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
        return null;
    }

    return normalizeEnum(valor, `Credito do ${rotulo}`, PLANTAO_TIPOS_CREDITO);
}

function normalizarSubstituto(valor, rotulo) {
    if (valor === undefined || valor === null || valor === '') {
        return null;
    }

    const id = Number(valor);

    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(400, `Substituto do ${rotulo} invalido.`);
    }

    return id;
}

// Horario necessario de cada dia do periodo, a partir da jornada do titular.
//
// `jornadaPorDiaSemana`: Map (0 = domingo .. 6 = sabado) -> { horaInicio,
//   horaFim } com a jornada ATIVA do titular. Dia sem jornada nao gera trecho:
//   o titular nao trabalharia nele, nao ha o que cobrir.
// `ausencia`: opcional. Ausencia por horas ({ periodoTipo: 'horas', horaInicio,
//   horaFim }) limita cada dia a parte dela que cai dentro da jornada;
//   ferias, folga, ausencia de dia inteiro e cobertura avulsa cobrem a jornada
//   toda.
// `feriados`: Set de datas ISO cadastradas (os nacionais sao calculados).
//
// Feriado tambem gera trecho: o posto existe, e o feriado e justamente quando
// o plantao costuma ser preciso. Se naquele feriado ninguem trabalha, o
// administrador remove o dia.
function gerarTrechosNecessarios({ dataInicio, dataFim, jornadaPorDiaSemana, ausencia = null, feriados = null }) {
    const inicio = normalizeIsoDate(dataInicio, 'Data inicial da cobertura');
    const fim = normalizeIsoDate(dataFim, 'Data final da cobertura');

    if (fim < inicio) {
        throw new AppError(400, 'Data final da cobertura deve ser maior ou igual a data inicial.');
    }

    const porHoras = String(ausencia?.periodoTipo || '').toLowerCase() === 'horas';
    const limite = porHoras
        ? {
            horaInicio: normalizeTime(ausencia.horaInicio, 'Hora inicial da ausencia'),
            horaFim: normalizeTime(ausencia.horaFim, 'Hora final da ausencia')
        }
        : null;
    const trechos = [];

    for (let dataISO = inicio; dataISO <= fim; dataISO = proximoDia(dataISO)) {
        const jornada = jornadaPorDiaSemana?.get?.(diaDaSemana(dataISO));

        if (!jornada?.horaInicio || !jornada?.horaFim) {
            continue;
        }

        let comeco = minutosDoHorario(normalizeTime(jornada.horaInicio, 'Hora inicial da jornada'));
        let termino = minutosDoHorario(normalizeTime(jornada.horaFim, 'Hora final da jornada'));

        if (limite) {
            comeco = Math.max(comeco, minutosDoHorario(limite.horaInicio));
            termino = Math.min(termino, minutosDoHorario(limite.horaFim));
        }

        if (comeco >= termino) {
            continue;
        }

        trechos.push({
            dataISO,
            tipoDia: tipoDoDia(dataISO, feriados),
            horaInicio: horarioDosMinutos(comeco),
            horaFim: horarioDosMinutos(termino),
            substitutoId: null,
            tipoCredito: null
        });
    }

    return trechos;
}

// Divide um trecho em dois no horario de corte (16h-22h cortado as 19h vira
// 16h-19h e 19h-22h). As duas metades herdam o resto do trecho original —
// substituto e credito inclusive —, e o administrador troca o que precisar.
// O id fica so na primeira: a segunda e uma linha nova.
function dividirTrecho(trecho, horaCorte) {
    const corte = normalizeTime(horaCorte, 'Horario da divisao');
    const minutosCorte = minutosDoHorario(corte);

    if (minutosCorte <= minutosDoHorario(trecho.horaInicio) || minutosCorte >= minutosDoHorario(trecho.horaFim)) {
        throw new AppError(
            400,
            `O horario da divisao precisa ficar entre ${formatarHora(trecho.horaInicio)} e ${formatarHora(trecho.horaFim)}.`
        );
    }

    const { id, ...semId } = trecho;

    return [
        { ...trecho, horaFim: corte },
        { ...semId, horaInicio: corte }
    ];
}

// Desfaz uma divisao: junta dois trechos do mesmo dia, um emendado no outro e
// com o mesmo substituto e credito. Fica com o id do primeiro.
function juntarTrechos(primeiro, segundo) {
    const [a, b] = minutosDoHorario(primeiro.horaInicio) <= minutosDoHorario(segundo.horaInicio)
        ? [primeiro, segundo]
        : [segundo, primeiro];

    if (a.dataISO !== b.dataISO) {
        throw new AppError(400, 'So da para juntar trechos do mesmo dia.');
    }

    if (minutosDoHorario(a.horaFim) !== minutosDoHorario(b.horaInicio)) {
        throw new AppError(400, 'So da para juntar trechos em sequencia, um terminando onde o outro comeca.');
    }

    if ((a.substitutoId ?? null) !== (b.substitutoId ?? null) || (a.tipoCredito ?? null) !== (b.tipoCredito ?? null)) {
        throw new AppError(400, 'So da para juntar trechos com o mesmo substituto e o mesmo credito.');
    }

    return { ...a, horaFim: b.horaFim };
}

// Valida e normaliza o conjunto de trechos de UMA cobertura antes de gravar.
// Recusa (400, com o motivo):
//   - trecho fora do periodo da cobertura ou com horario invertido;
//   - titular cobrindo a si mesmo;
//   - trecho atribuido sem credito escolhido (credito sem substituto e
//     descartado: o trecho pendente nao credita ninguem);
//   - dois trechos do mesmo dia que se sobrepoem — e o que impede o mesmo
//     horario de ser coberto duas vezes.
function validarTrechosDaCobertura({ titularId, dataInicio, dataFim, trechos, feriados = null }) {
    const inicio = normalizeIsoDate(dataInicio, 'Data inicial da cobertura');
    const fim = normalizeIsoDate(dataFim, 'Data final da cobertura');
    const titular = Number(titularId);

    const normalizados = (Array.isArray(trechos) ? trechos : []).map((bruto, indice) => {
        const rotulo = `trecho ${indice + 1}`;
        const dataISO = normalizeIsoDate(bruto.dataISO, `Data do ${rotulo}`);
        const horaInicio = normalizeTime(bruto.horaInicio, `Hora inicial do ${rotulo}`);
        const horaFim = normalizeTime(bruto.horaFim, `Hora final do ${rotulo}`);
        const substitutoId = normalizarSubstituto(bruto.substitutoId, rotulo);
        const tipoCredito = substitutoId === null ? null : normalizarTipoCredito(bruto.tipoCredito, rotulo);

        if (dataISO < inicio || dataISO > fim) {
            throw new AppError(400, `O ${rotulo} (${formatarDataBr(dataISO)}) esta fora do periodo da cobertura.`);
        }

        if (minutosDoHorario(horaInicio) >= minutosDoHorario(horaFim)) {
            throw new AppError(400, `O ${rotulo} precisa terminar depois de comecar.`);
        }

        if (substitutoId !== null && substitutoId === titular) {
            throw new AppError(400, `O ${rotulo}: o titular nao pode cobrir o proprio horario.`);
        }

        if (substitutoId !== null && tipoCredito === null) {
            throw new AppError(400, `O ${rotulo}: escolha se as horas vao para o banco de horas ou para hora extra.`);
        }

        // id presente = trecho ja gravado sendo editado; sem id = trecho novo.
        const id = bruto.id === undefined || bruto.id === null || bruto.id === ''
            ? null
            : ensurePositiveInt(bruto.id, `Id do ${rotulo}`);

        return {
            ...(id === null ? {} : { id }),
            dataISO,
            tipoDia: tipoDoDia(dataISO, feriados),
            horaInicio,
            horaFim,
            substitutoId,
            tipoCredito,
            observacao: normalizeOptionalText(bruto.observacao, `Observacao do ${rotulo}`, { maxLength: 500 })
        };
    });

    const ordenados = [...normalizados].sort((a, b) => (
        a.dataISO.localeCompare(b.dataISO) || minutosDoHorario(a.horaInicio) - minutosDoHorario(b.horaInicio)
    ));

    // Ordenados por dia e inicio, basta comparar cada trecho com o anterior.
    for (let i = 1; i < ordenados.length; i += 1) {
        const anterior = ordenados[i - 1];
        const atual = ordenados[i];

        if (anterior.dataISO === atual.dataISO && intervalosSeCruzam(anterior, atual)) {
            throw new AppError(
                400,
                `Em ${formatarDataBr(atual.dataISO)} os trechos ${formatarHora(anterior.horaInicio)}-${formatarHora(anterior.horaFim)}`
                + ` e ${formatarHora(atual.horaInicio)}-${formatarHora(atual.horaFim)} se sobrepoem.`
            );
        }
    }

    return ordenados;
}

// Situacao da cobertura para a tela e para a aba Pendencias:
//   dia      'coberto' (todos os trechos tem substituto), 'parcial' ou 'pendente'
//   geral    o mesmo, olhando a cobertura inteira ('vazia' sem trecho nenhum)
//   minutos  cobertos e pendentes, no total e por substituto (o resumo antes
//            de salvar)
function resumirCobertura(trechos) {
    const porDia = new Map();
    const porSubstituto = new Map();
    let minutosCobertos = 0;
    let minutosPendentes = 0;

    for (const trecho of Array.isArray(trechos) ? trechos : []) {
        const minutos = duracaoMinutos(trecho);
        const coberto = trecho.substitutoId !== null && trecho.substitutoId !== undefined;

        if (!porDia.has(trecho.dataISO)) {
            porDia.set(trecho.dataISO, { dataISO: trecho.dataISO, minutosCobertos: 0, minutosPendentes: 0 });
        }

        const dia = porDia.get(trecho.dataISO);

        if (coberto) {
            dia.minutosCobertos += minutos;
            minutosCobertos += minutos;
            porSubstituto.set(Number(trecho.substitutoId), (porSubstituto.get(Number(trecho.substitutoId)) || 0) + minutos);
        } else {
            dia.minutosPendentes += minutos;
            minutosPendentes += minutos;
        }
    }

    const situacao = (cobertos, pendentes) => {
        if (pendentes === 0) {
            return cobertos > 0 ? 'coberto' : 'vazia';
        }

        return cobertos > 0 ? 'parcial' : 'pendente';
    };

    return {
        situacao: situacao(minutosCobertos, minutosPendentes),
        minutosCobertos,
        minutosPendentes,
        dias: [...porDia.values()]
            .sort((a, b) => a.dataISO.localeCompare(b.dataISO))
            .map((dia) => ({ ...dia, situacao: situacao(dia.minutosCobertos, dia.minutosPendentes) })),
        substitutos: [...porSubstituto.entries()]
            .map(([substitutoId, minutos]) => ({ substitutoId, minutos }))
            .sort((a, b) => b.minutos - a.minutos || a.substitutoId - b.substitutoId)
    };
}

module.exports = {
    dividirTrecho,
    formatarDataBr,
    formatarHora,
    gerarTrechosNecessarios,
    intervalosSeCruzam,
    juntarTrechos,
    minutosDoHorario,
    resumirCobertura,
    tipoDoDia,
    validarTrechosDaCobertura
};

// Conflitos do SUBSTITUTO de um trecho de cobertura.
//
// Mesmo espirito de folgas-domingo-conflitos.js: recusar na hora de gravar,
// com o motivo, em vez de gravar e deixar uma linha "ganhar" da outra. Aqui so
// a regra, pura; quem consulta o banco e monta a entrada vem na fase da API.
//
// Barra o trecho:
//   1. substituto desligado;
//   2. ferias / folga / ausencia de dia inteiro naquele dia;
//   3. ausencia por horas que cruza o trecho;
//   4. dia sem trabalho na escala dele (domingo folgado, folga compensatoria);
//   5. expediente proprio que CRUZA o trecho;
//   6. turno de plantao dele que cruza o trecho;
//   7. outro trecho de cobertura dele (de qualquer cobertura) que cruza.
//
// NAO barra o expediente proprio que so encosta ou fica separado do trecho:
// trabalhar das 08h as 17h e cobrir das 19h as 22h e permitido (segundo turno
// no mesmo dia, decisao do time). O resultado avisa `segundoTurno` para a tela
// destacar.
const { AppError } = require('../lib/errors');
const { formatarDataBr, formatarHora, intervalosSeCruzam } = require('./cobertura-trechos');

const MOTIVO_AUSENCIA = Object.freeze({
    ferias: 'ferias lancadas',
    folga: 'uma folga lancada',
    ausencia: 'uma ausencia lancada'
});

// Tipos de escala_dia em que a pessoa nao trabalha. ferias/folga/ausencia ja
// chegam pela lista de ausencias (motivo mais preciso); estes dois so existem
// na escala, vindos da folga de domingo.
const MOTIVO_DIA_SEM_TRABALHO = Object.freeze({
    domingo_folgado: 'folga de domingo nesse dia',
    folga_compensatoria: 'folga compensatoria nesse dia'
});

function faixa(item) {
    return `${formatarHora(item.horaInicio)}-${formatarHora(item.horaFim)}`;
}

function temHorario(item) {
    return Boolean(item?.horaInicio && item?.horaFim);
}

function rotuloAusencia(ausencia) {
    const tipo = String(ausencia.Tipo ?? ausencia.tipo ?? '').trim().toLowerCase();

    return MOTIVO_AUSENCIA[tipo] || MOTIVO_AUSENCIA.ausencia;
}

function horarioDaAusencia(ausencia) {
    return {
        horaInicio: ausencia.HoraInicio ?? ausencia.horaInicio ?? null,
        horaFim: ausencia.HoraFim ?? ausencia.horaFim ?? null
    };
}

function ehPorHoras(ausencia) {
    return String(ausencia.PeriodoTipo ?? ausencia.periodoTipo ?? 'dia_inteiro').trim().toLowerCase() === 'horas';
}

// Entrada (tudo ja filtrado para o substituto e o DIA do trecho):
//   trecho          { id?, dataISO, horaInicio, horaFim }
//   substituto      { nome, ativo }
//   ausencias       linhas de Ausencias que cobrem o dia
//   expediente      a linha da escala do dia dele SEM o que coberturas geraram
//                   ({ tipo, horaInicio, horaFim }) ou null
//   plantoes        turnos de plantao dele no dia ({ horaInicio, horaFim,
//                   coberturaTrechoId? }); o turno gerado por ESTE trecho e
//                   ignorado
//   outrosTrechos   trechos de cobertura atribuidos a ele no dia; o proprio
//                   trecho (mesmo id) e ignorado
//
// Devolve { conflito: mensagem | null, segundoTurno }.
function detectarConflitoSubstituto({
    trecho,
    substituto = { nome: null, ativo: true },
    ausencias = [],
    expediente = null,
    plantoes = [],
    outrosTrechos = []
}) {
    const nome = substituto.nome || 'O colaborador';
    const prefixo = `Nao da para ${nome} cobrir ${formatarDataBr(trecho.dataISO)} ${faixa(trecho)}:`;
    const resposta = (conflito, segundoTurno = false) => ({ conflito, segundoTurno });

    if (substituto.ativo === false) {
        return resposta(`${prefixo} o cadastro esta desligado.`);
    }

    const diaInteiro = ausencias.find((ausencia) => !ehPorHoras(ausencia));

    if (diaInteiro) {
        return resposta(`${prefixo} tem ${rotuloAusencia(diaInteiro)} nesse dia.`);
    }

    const parcial = ausencias.find((ausencia) => {
        const horario = horarioDaAusencia(ausencia);

        return temHorario(horario) && intervalosSeCruzam(trecho, horario);
    });

    if (parcial) {
        return resposta(`${prefixo} tem ${rotuloAusencia(parcial)} das ${faixa(horarioDaAusencia(parcial))}.`);
    }

    const motivoSemTrabalho = MOTIVO_DIA_SEM_TRABALHO[String(expediente?.tipo || '').toLowerCase()];

    if (motivoSemTrabalho) {
        return resposta(`${prefixo} tem ${motivoSemTrabalho}.`);
    }

    if (temHorario(expediente) && intervalosSeCruzam(trecho, expediente)) {
        return resposta(`${prefixo} ja trabalha das ${faixa(expediente)} nesse dia.`);
    }

    // Trecho ainda nao gravado (sem id) nao gerou nada: nao ha o que ignorar.
    const ehDesteTrecho = (id) => trecho.id !== undefined && trecho.id !== null && Number(id) === Number(trecho.id);
    const outrosPlantoes = plantoes.filter((turno) => temHorario(turno) && !ehDesteTrecho(turno.coberturaTrechoId));
    const plantao = outrosPlantoes.find((turno) => intervalosSeCruzam(trecho, turno));

    if (plantao) {
        return resposta(`${prefixo} ja esta no plantao das ${faixa(plantao)}.`);
    }

    const outro = outrosTrechos.find((item) => (
        !ehDesteTrecho(item.id) && temHorario(item) && intervalosSeCruzam(trecho, item)
    ));

    if (outro) {
        return resposta(`${prefixo} ja cobre outro horario das ${faixa(outro)}.`);
    }

    // Trabalha no dia (expediente proprio ou outro plantao) sem cruzar: segundo turno.
    return resposta(null, temHorario(expediente) || outrosPlantoes.length > 0);
}

// Consulta pronta para a rota: lanca o 409 com o motivo.
function exigirSubstitutoSemConflito(entrada) {
    const { conflito, segundoTurno } = detectarConflitoSubstituto(entrada);

    if (conflito) {
        throw new AppError(409, conflito);
    }

    return { segundoTurno };
}

module.exports = {
    detectarConflitoSubstituto,
    exigirSubstitutoSemConflito
};

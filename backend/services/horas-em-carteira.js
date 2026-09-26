// Horas em carteira do banco de horas semanal: o saldo de um colaborador numa
// data = ultimo lancamento manual da grade (a "base") + plantoes creditados −
// folgas/ausencias descontadas entre a semana base e a data.
//
// Usado por GET /banco-horas-semanal/verificar (conferencia) e por POST
// /banco-horas-semanal/gerar-semana (proposta da proxima semana). As duas rotas
// tinham este calculo copiado, cada uma com ~170 linhas.
const { sql } = require('../db');
const { colaboradoresVisiveis } = require('../auth/acesso-setores');
const {
    calculateDailyWorkMinutes,
    calculateIntervalMinutes,
    normalizeSubtipo,
    resolveDefaultDescontaBancoHoras
} = require('./bancoHoras');
const { serializePlantaoRecord } = require('./plantoes');
const { extractDateString } = require('../lib/validation');

const PLANTAO_COLUNAS_CREDITO = 'id, data_plantao, colaboradores_ids, hora_inicio, hora_fim, tipo_credito';

// Formata minutos como relogio HH:MM com sinal apenas quando negativo.
// Aceita totais grandes (ex: 163:37), como na planilha.
function minutosParaRelogio(minutos) {
    const safe = Number.isFinite(Number(minutos)) ? Math.round(Number(minutos)) : 0;
    const sinal = safe < 0 ? '-' : '';
    const total = Math.abs(safe);
    const horas = Math.floor(total / 60);
    const restante = total % 60;
    return `${sinal}${horas}:${String(restante).padStart(2, '0')}`;
}

function semanaISO(valor) {
    return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}

// Desconto de uma ausencia dentro da janela [inicioISO, fimISO] (inclusive).
// Espelha a regra de calculateAusenciaDebitMinutes, mas limitado a janela,
// para nao descontar de novo o que ja estava no saldo manual da semana base.
// Retorna { minutos, aviso }.
function calcularDescontoNaJanela(ausencia, colaborador, inicioISO, fimISO) {
    const tipo = String(ausencia.Tipo || '').trim().toLowerCase();
    const subtipo = normalizeSubtipo(ausencia.Subtipo);
    const temExplicito = ausencia.DescontaBancoHoras !== undefined && ausencia.DescontaBancoHoras !== null;
    const desconta = temExplicito
        ? Boolean(ausencia.DescontaBancoHoras)
        : resolveDefaultDescontaBancoHoras(tipo, subtipo);

    if (!desconta || tipo === 'ferias') {
        return { minutos: 0, aviso: null };
    }

    const periodoTipo = String(ausencia.PeriodoTipo || 'dia_inteiro').trim().toLowerCase();

    if (periodoTipo === 'horas') {
        const dataISO = extractDateString(ausencia.DataInicio);

        if (!dataISO || dataISO < inicioISO || dataISO > fimISO) {
            return { minutos: 0, aviso: null };
        }

        try {
            return { minutos: calculateIntervalMinutes(ausencia.HoraInicio, ausencia.HoraFim), aviso: null };
        } catch (error) {
            return { minutos: 0, aviso: `Ausencia ${ausencia.Id}: ${error.message}` };
        }
    }

    const inicioAusencia = extractDateString(ausencia.DataInicio);
    const fimAusencia = extractDateString(ausencia.DataFim);
    const janelaInicio = inicioAusencia > inicioISO ? inicioAusencia : inicioISO;
    const janelaFim = fimAusencia < fimISO ? fimAusencia : fimISO;

    if (!janelaInicio || !janelaFim || janelaInicio > janelaFim) {
        return { minutos: 0, aviso: null };
    }

    let minutosDia = 0;

    try {
        minutosDia = calculateDailyWorkMinutes(colaborador);
    } catch (error) {
        return { minutos: 0, aviso: `Colaborador ${colaborador.Nome}: ${error.message}` };
    }

    // Conta TODOS os dias da janela (inclusive sabado/domingo): a escala agora
    // tem plantonista de fim de semana, entao folga/ausencia em fim de semana
    // tambem desconta.
    const umDia = 24 * 60 * 60 * 1000;
    const dias = Math.floor(
        (new Date(`${janelaFim}T00:00:00Z`).getTime() - new Date(`${janelaInicio}T00:00:00Z`).getTime()) / umDia
    ) + 1;
    return { minutos: minutosDia * dias, aviso: null };
}

// Credito de plantao para um colaborador na janela [inicioISO, fimISO]:
// para cada plantao em que ele trabalhou no periodo, soma (hora fim - hora inicio).
function calcularCreditoPlantaoNaJanela(plantoes, colaboradorId, inicioISO, fimISO) {
    let minutos = 0;
    const avisos = [];

    for (const plantao of plantoes) {
        const dataISO = plantao.dataISO;

        if (!dataISO || dataISO < inicioISO || dataISO > fimISO) {
            continue;
        }

        if (!(plantao.colaboradores || []).map(Number).includes(Number(colaboradorId))) {
            continue;
        }

        // Hora extra e paga em folha e nao entra no saldo. Creditar aqui fazia
        // a grade semanal e o "em carteira" pagarem a mesma hora duas vezes:
        // uma na folha e outra em folga.
        if (plantao.tipoCredito === 'extra') {
            continue;
        }

        if (!plantao.horaInicio || !plantao.horaFim) {
            avisos.push(`Plantao ${plantao.id}: sem horario, credito ignorado.`);
            continue;
        }

        try {
            minutos += calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim);
        } catch (error) {
            avisos.push(`Plantao ${plantao.id}: ${error.message}`);
        }
    }

    return { minutos, avisos };
}

// Colaboradores ativos que a conta logada pode ver, por nome.
async function listarColaboradoresAtivosVisiveis(pool, req) {
    const result = await pool.request().query('SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');
    const visiveis = await colaboradoresVisiveis(pool, req);

    return visiveis ? result.recordset.filter((item) => visiveis.has(Number(item.Id))) : result.recordset;
}

// Base de cada colaborador: o ultimo lancamento da grade ate a data.
// `ateInclusive` = semana <= data (verificar); senao semana < data (a semana
// anterior ao alvo, em gerar-semana).
async function carregarBases(pool, dataISO, { ateInclusive }) {
    const result = await pool.request()
        .input('data', sql.Date, dataISO)
        .query(`
            SELECT b.ColaboradorId, b.SemanaSegunda, b.Minutos
            FROM BancoHorasSemanal b
            INNER JOIN (
                SELECT ColaboradorId, MAX(SemanaSegunda) AS SemanaSegunda
                FROM BancoHorasSemanal
                WHERE SemanaSegunda ${ateInclusive ? '<=' : '<'} @data
                GROUP BY ColaboradorId
            ) ultima
                ON ultima.ColaboradorId = b.ColaboradorId
               AND ultima.SemanaSegunda = b.SemanaSegunda
        `);

    return new Map(
        result.recordset.map((row) => [
            Number(row.ColaboradorId),
            { semanaSegunda: semanaISO(row.SemanaSegunda), minutos: Number(row.Minutos) }
        ])
    );
}

// Ausencias e plantoes entre a base mais antiga e a data. Sem nenhuma base, nao
// ha o que calcular e nada e lido.
async function carregarMovimentacao(pool, bases, fimISO) {
    const ausenciasPorColaborador = new Map();

    if (bases.size === 0) {
        return { ausenciasPorColaborador, plantoes: [] };
    }

    const pisoISO = [...bases.values()].map((item) => item.semanaSegunda).sort()[0];

    const ausenciasResult = await pool.request()
        .input('piso', sql.Date, pisoISO)
        .input('fim', sql.Date, fimISO)
        .query(`
            SELECT Id, ColaboradorId, Tipo, Subtipo, DescontaBancoHoras,
                   PeriodoTipo, DataInicio, DataFim, HoraInicio, HoraFim
            FROM Ausencias
            WHERE DataInicio <= @fim AND DataFim >= @piso
        `);

    for (const ausencia of ausenciasResult.recordset) {
        const colaboradorId = Number(ausencia.ColaboradorId);

        if (!ausenciasPorColaborador.has(colaboradorId)) {
            ausenciasPorColaborador.set(colaboradorId, []);
        }

        ausenciasPorColaborador.get(colaboradorId).push(ausencia);
    }

    const plantoesResult = await pool.request()
        .input('piso', sql.Date, pisoISO)
        .input('fim', sql.Date, fimISO)
        .query(`
            SELECT ${PLANTAO_COLUNAS_CREDITO}
            FROM plantoes
            WHERE data_plantao <= @fim AND data_plantao >= @piso
        `);

    return {
        ausenciasPorColaborador,
        plantoes: plantoesResult.recordset.map((row) => serializePlantaoRecord(row))
    };
}

// Saldo de um colaborador na janela [base.semanaSegunda, fimISO]. Os avisos
// (horario invalido, jornada sem horario) vao para `avisos`.
function calcularSaldo(colaborador, base, movimentacao, fimISO, avisos) {
    const credito = calcularCreditoPlantaoNaJanela(movimentacao.plantoes, colaborador.Id, base.semanaSegunda, fimISO);
    credito.avisos.forEach((aviso) => avisos.push(aviso));

    let descontoMinutos = 0;

    for (const ausencia of movimentacao.ausenciasPorColaborador.get(colaborador.Id) || []) {
        const { minutos, aviso } = calcularDescontoNaJanela(ausencia, colaborador, base.semanaSegunda, fimISO);
        descontoMinutos += minutos;

        if (aviso) {
            avisos.push(aviso);
        }
    }

    return {
        plantaoMinutos: credito.minutos,
        descontoMinutos,
        resultadoMinutos: base.minutos + credito.minutos - descontoMinutos
    };
}

module.exports = {
    PLANTAO_COLUNAS_CREDITO,
    calcularCreditoPlantaoNaJanela,
    calcularDescontoNaJanela,
    calcularSaldo,
    carregarBases,
    carregarMovimentacao,
    listarColaboradoresAtivosVisiveis,
    minutosParaRelogio,
    semanaISO
};

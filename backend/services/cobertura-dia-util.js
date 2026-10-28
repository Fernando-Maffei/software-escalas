// Trechos de cobertura em DIA UTIL que ja tem substituto: o trabalho que a
// cobertura gera fora da tabela plantoes. Sabado, domingo e feriado viram
// plantao (cobertura-plantoes.js) e entram na escala, no banco e nas horas
// extras por la; por isso carregarTrechosDeDiaUtil os deixa de fora, senao
// seriam contados duas vezes.
//
// Daqui saem a escala do dia (cobertura-na-escala.js), o banco de horas
// (cobertura-banco.js), o banco semanal e o relatorio de horas extras.
const { sql } = require('../db');
const { calculateIntervalMinutes } = require('./bancoHoras');
const { formatarHora, tipoDoDia } = require('./cobertura-trechos');
const { extractDateString, extractTimeString, normalizeIsoDate } = require('../lib/validation');

function serializarTrechoDiaUtil(linha) {
    const horaInicio = extractTimeString(linha.HoraInicio);
    const horaFim = extractTimeString(linha.HoraFim);

    return {
        id: Number(linha.Id),
        coberturaId: Number(linha.CoberturaId),
        dataISO: extractDateString(linha.Data),
        horaInicio,
        horaFim,
        minutos: calculateIntervalMinutes(horaInicio, horaFim),
        substitutoId: Number(linha.SubstitutoId),
        tipoCredito: String(linha.TipoCredito || '').toLowerCase(),
        titularId: Number(linha.TitularId),
        titularNome: linha.TitularNome ?? null,
        observacao: linha.Observacao ?? null
    };
}

// Trechos atribuidos com o tipo do dia ('util', 'sabado', 'domingo',
// 'feriado'). Filtros opcionais: periodo, substituto e cobertura. Sem periodo,
// le tudo (o recalculo do banco de horas).
async function carregarTrechosAtribuidos(poolOrTx, filtros = {}) {
    const { dataInicio = null, dataFim = null, substitutoId = null, coberturaId = null } = filtros;
    const request = poolOrTx.request();
    const clausulas = ['t.SubstitutoId IS NOT NULL'];

    if (dataInicio) {
        request.input('dataInicio', sql.Date, normalizeIsoDate(dataInicio, 'Data inicial'));
        clausulas.push('t.Data >= @dataInicio');
    }

    if (dataFim) {
        request.input('dataFim', sql.Date, normalizeIsoDate(dataFim, 'Data final'));
        clausulas.push('t.Data <= @dataFim');
    }

    if (substitutoId) {
        request.input('substitutoId', sql.Int, Number(substitutoId));
        clausulas.push('t.SubstitutoId = @substitutoId');
    }

    if (coberturaId) {
        request.input('coberturaId', sql.Int, Number(coberturaId));
        clausulas.push('t.CoberturaId = @coberturaId');
    }

    const result = await request.query(`
        SELECT
            t.Id, t.CoberturaId, t.Data, t.HoraInicio, t.HoraFim,
            t.SubstitutoId, t.TipoCredito, t.Observacao,
            c.TitularId, titular.Nome AS TitularNome
        FROM CoberturaTrechos t
        INNER JOIN Coberturas c ON c.Id = t.CoberturaId
        INNER JOIN Colaboradores titular ON titular.Id = c.TitularId
        WHERE ${clausulas.join(' AND ')}
        ORDER BY t.Data, t.HoraInicio, t.Id
    `);

    if (result.recordset.length === 0) {
        return [];
    }

    // Feriado cadastrado (municipal/estadual); o nacional tipoDoDia calcula.
    const feriadosResult = await poolOrTx.request().query('SELECT Data FROM Feriados');
    const feriados = new Set(feriadosResult.recordset.map((linha) => extractDateString(linha.Data)).filter(Boolean));

    return result.recordset.map((linha) => {
        const trecho = serializarTrechoDiaUtil(linha);
        return { ...trecho, tipoDia: tipoDoDia(trecho.dataISO, feriados) };
    });
}

async function carregarTrechosDeDiaUtil(poolOrTx, filtros = {}) {
    return (await carregarTrechosAtribuidos(poolOrTx, filtros)).filter((trecho) => trecho.tipoDia === 'util');
}

// Os de sabado, domingo e feriado: viram plantao (cobertura-plantoes.js).
async function carregarTrechosDePlantao(poolOrTx, filtros = {}) {
    return (await carregarTrechosAtribuidos(poolOrTx, filtros)).filter((trecho) => trecho.tipoDia !== 'util');
}

function descreverTrecho(trecho) {
    const quem = trecho.titularNome ? `Cobertura de ${trecho.titularNome}` : 'Cobertura';

    return `${quem} ${formatarHora(trecho.horaInicio)}-${formatarHora(trecho.horaFim)}`;
}

// O trecho no formato de um plantao serializado, para as contas que ja somam
// plantoes (banco semanal e relatorio de horas extras) somarem a cobertura
// pelo mesmo caminho. `origem` separa um do outro onde o id importa.
function trechoComoLancamento(trecho) {
    const cobrindo = trecho.titularNome ? `Cobrindo ${trecho.titularNome}` : null;

    return {
        id: trecho.id,
        origem: 'cobertura',
        dataISO: trecho.dataISO,
        colaboradores: [trecho.substitutoId],
        horaInicio: trecho.horaInicio,
        horaFim: trecho.horaFim,
        tipoCredito: trecho.tipoCredito,
        tipoPlantao: 'cobertura',
        tipoLancamento: null,
        descricao: descreverTrecho(trecho),
        observacao: [cobrindo, trecho.observacao].filter(Boolean).join(' | ') || null
    };
}

module.exports = {
    carregarTrechosDePlantao,
    carregarTrechosDeDiaUtil,
    descreverTrecho,
    serializarTrechoDiaUtil,
    trechoComoLancamento
};

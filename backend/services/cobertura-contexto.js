// Carrega do banco o que as regras puras da cobertura precisam: a jornada do
// titular (para gerar os trechos) e a agenda dos substitutos (para conferir
// conflitos). As regras em si moram em cobertura-trechos.js e
// cobertura-conflitos.js; aqui so ha consulta e montagem da entrada delas.
//
// A agenda e lida por PERIODO e para todos os substitutos de uma vez — uma
// consulta por tabela, nao uma por trecho —, e depois indexada por
// "substituto|dia".
const { sql } = require('../db');
const { ensureEscalaDiaForPeriod } = require('./escala');
const { listJornadaSemanal } = require('./jornada-semanal');
const { extractDateString, extractTimeString, normalizeIsoDate } = require('../lib/validation');

function chave(colaboradorId, dataISO) {
    return `${Number(colaboradorId)}|${dataISO}`;
}

function empilhar(mapa, key, valor) {
    if (!mapa.has(key)) {
        mapa.set(key, []);
    }

    mapa.get(key).push(valor);
}

function proximoDia(dataISO) {
    const [ano, mes, dia] = dataISO.split('-').map(Number);

    return new Date(Date.UTC(ano, mes - 1, dia + 1, 12)).toISOString().slice(0, 10);
}

// Parametros @prefixo0, @prefixo1... para um IN com ids ja validados.
function parametrosIn(request, prefixo, ids) {
    return ids.map((id, indice) => {
        request.input(`${prefixo}${indice}`, sql.Int, Number(id));
        return `@${prefixo}${indice}`;
    }).join(', ');
}

// Jornada efetiva do titular por dia da semana, no formato que
// gerarTrechosNecessarios espera. Mesma regra da geracao da escala
// (ensureEscalaBaseForPeriod): quem tem jornada semanal usa os dias ativos
// dela; quem nao tem usa o horario do cadastro de segunda a sexta.
async function carregarJornadaDoTitular(poolOrTx, titular) {
    const linhas = await listJornadaSemanal(poolOrTx, { colaboradorId: titular.Id, onlyActive: false });
    const jornada = new Map();

    if (linhas.length > 0) {
        for (const linha of linhas) {
            if (linha.ativo && linha.trabalhoInicio && linha.trabalhoFim) {
                jornada.set(linha.diaSemana, { horaInicio: linha.trabalhoInicio, horaFim: linha.trabalhoFim });
            }
        }

        return jornada;
    }

    const horaInicio = extractTimeString(titular.TrabalhoInicio);
    const horaFim = extractTimeString(titular.TrabalhoFim);

    if (horaInicio && horaFim) {
        [1, 2, 3, 4, 5].forEach((dia) => jornada.set(dia, { horaInicio, horaFim }));
    }

    return jornada;
}

// Datas de feriado CADASTRADAS no periodo (os nacionais tipoDoDia calcula).
async function carregarFeriadosCadastrados(poolOrTx, dataInicio, dataFim) {
    const result = await poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(dataInicio, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(dataFim, 'Data final'))
        .query('SELECT Data FROM Feriados WHERE Data BETWEEN @dataInicio AND @dataFim');

    return new Set(result.recordset.map((linha) => extractDateString(linha.Data)).filter(Boolean));
}

// Agenda dos substitutos no periodo. `coberturaId` (na edicao) tira da conta
// os trechos da propria cobertura: entre eles quem garante que nao ha
// sobreposicao e a validacao da particao.
//
// O expediente vem da escala do dia, que e gerada sob demanda — por isso o
// ensureEscalaDiaForPeriod antes de ler (mesmo caminho da folga de domingo).
// Da escala ficam de fora as linhas que vieram de plantao (os turnos sao
// conferidos um a um na tabela plantoes; a linha da escala junta os turnos do
// dia e inventaria sobreposicao no intervalo entre eles) e as que a propria
// cobertura gerar.
async function carregarAgendaDosSubstitutos(poolOrTx, { dataInicio, dataFim, substitutoIds, coberturaId = null }) {
    const ids = [...new Set((substitutoIds || []).map(Number))].filter((id) => Number.isInteger(id) && id > 0);
    const agenda = {
        substitutos: new Map(),
        ausencias: new Map(),
        expedientes: new Map(),
        plantoes: new Map(),
        trechos: new Map()
    };

    if (ids.length === 0) {
        return agenda;
    }

    await ensureEscalaDiaForPeriod(poolOrTx, dataInicio, dataFim);

    const periodo = (request) => request
        .input('dataInicio', sql.Date, normalizeIsoDate(dataInicio, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(dataFim, 'Data final'));

    const reqColaboradores = poolOrTx.request();
    const colaboradores = await reqColaboradores.query(`
        SELECT Id, Nome, Ativo FROM Colaboradores WHERE Id IN (${parametrosIn(reqColaboradores, 'c', ids)})
    `);

    for (const linha of colaboradores.recordset) {
        agenda.substitutos.set(Number(linha.Id), {
            nome: linha.Nome,
            ativo: linha.Ativo === true || linha.Ativo === 1
        });
    }

    const reqAusencias = periodo(poolOrTx.request());
    const ausencias = await reqAusencias.query(`
        SELECT ColaboradorId, Tipo, PeriodoTipo, HoraInicio, HoraFim,
               CONVERT(VARCHAR(10), DataInicio, 23) AS DataInicio,
               CONVERT(VARCHAR(10), DataFim, 23) AS DataFim
        FROM Ausencias
        WHERE ColaboradorId IN (${parametrosIn(reqAusencias, 'a', ids)})
          AND DataFim >= @dataInicio AND DataInicio <= @dataFim
    `);

    for (const linha of ausencias.recordset) {
        const inicio = linha.DataInicio > dataInicio ? linha.DataInicio : dataInicio;
        const fim = linha.DataFim < dataFim ? linha.DataFim : dataFim;
        const ausencia = {
            Tipo: linha.Tipo,
            PeriodoTipo: linha.PeriodoTipo,
            HoraInicio: extractTimeString(linha.HoraInicio),
            HoraFim: extractTimeString(linha.HoraFim)
        };

        for (let dataISO = inicio; dataISO <= fim; dataISO = proximoDia(dataISO)) {
            empilhar(agenda.ausencias, chave(linha.ColaboradorId, dataISO), ausencia);
        }
    }

    const reqEscala = periodo(poolOrTx.request());
    const escala = await reqEscala.query(`
        SELECT colaborador_id, CONVERT(VARCHAR(10), data, 23) AS data, tipo, hora_inicio, hora_fim
        FROM escala_dia
        WHERE colaborador_id IN (${parametrosIn(reqEscala, 'e', ids)})
          AND data BETWEEN @dataInicio AND @dataFim
          AND ISNULL(origem_tipo, '') NOT IN ('plantao', 'cobertura')
    `);

    for (const linha of escala.recordset) {
        agenda.expedientes.set(chave(linha.colaborador_id, linha.data), {
            tipo: linha.tipo,
            horaInicio: extractTimeString(linha.hora_inicio),
            horaFim: extractTimeString(linha.hora_fim)
        });
    }

    const reqPlantoes = periodo(poolOrTx.request());
    const plantoes = await reqPlantoes.query(`
        SELECT pc.ColaboradorId, CONVERT(VARCHAR(10), p.data_plantao, 23) AS data, p.hora_inicio, p.hora_fim
        FROM plantoes p
        INNER JOIN dbo.PlantaoColaborador pc ON pc.PlantaoId = p.id
        WHERE pc.ColaboradorId IN (${parametrosIn(reqPlantoes, 'p', ids)})
          AND p.data_plantao BETWEEN @dataInicio AND @dataFim
    `);

    for (const linha of plantoes.recordset) {
        empilhar(agenda.plantoes, chave(linha.ColaboradorId, linha.data), {
            horaInicio: extractTimeString(linha.hora_inicio),
            horaFim: extractTimeString(linha.hora_fim)
        });
    }

    const reqTrechos = periodo(poolOrTx.request()).input('coberturaId', sql.Int, coberturaId);
    const trechos = await reqTrechos.query(`
        SELECT Id, SubstitutoId, CONVERT(VARCHAR(10), Data, 23) AS Data, HoraInicio, HoraFim
        FROM CoberturaTrechos
        WHERE SubstitutoId IN (${parametrosIn(reqTrechos, 't', ids)})
          AND Data BETWEEN @dataInicio AND @dataFim
          AND (@coberturaId IS NULL OR CoberturaId <> @coberturaId)
    `);

    for (const linha of trechos.recordset) {
        empilhar(agenda.trechos, chave(linha.SubstitutoId, linha.Data), {
            id: linha.Id,
            horaInicio: extractTimeString(linha.HoraInicio),
            horaFim: extractTimeString(linha.HoraFim)
        });
    }

    return agenda;
}

// Entrada de detectarConflitoSubstituto para um trecho, tirada da agenda.
function entradaDeConflito(agenda, trecho, substitutoId) {
    const key = chave(substitutoId, trecho.dataISO);

    return {
        trecho,
        substituto: agenda.substitutos.get(Number(substitutoId)) || { nome: null, ativo: false },
        ausencias: agenda.ausencias.get(key) || [],
        expediente: agenda.expedientes.get(key) || null,
        plantoes: agenda.plantoes.get(key) || [],
        outrosTrechos: agenda.trechos.get(key) || []
    };
}

module.exports = {
    carregarAgendaDosSubstitutos,
    carregarFeriadosCadastrados,
    carregarJornadaDoTitular,
    entradaDeConflito
};

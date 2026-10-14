// Conflitos da DATA DE REPOSICAO de uma folga de domingo.
//
// A linha da escala (colaborador + dia) e disputada por varias fontes: jornada
// normal, plantao, ausencia/ferias, ajuste manual e a propria reposicao. A
// regra e recusar na hora de gravar, com o motivo, em vez de gravar e deixar a
// linha "ganhar" ou "perder" conforme a ordem em que as coisas foram lancadas:
//
//   1. ajuste manual do usuario   -> nada automatico sobrescreve
//   2. ausencia / ferias / folga  -> a pessoa nao esta; nao ha o que repor
//   3. vinculo da folga           -> domingo folgado, reposicao, cobertura
//   4. plantao, 5. escala normal  -> cedem o lugar a reposicao
//
// So os itens 1 e 2 barram: 4 e 5 sao substituidos de proposito (a reposicao
// cai num dia que a jornada marca como folga, e plantao no mesmo dia e um
// arranjo que o usuario resolve na escala).
const { sql } = require('../db');
const { AppError } = require('../lib/errors');

function formatarDataBr(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(dataISO || '');
}

const MOTIVO_AUSENCIA = Object.freeze({
    ferias: 'ferias lancadas',
    folga: 'uma folga lancada',
    ausencia: 'uma ausencia lancada'
});

// Pura: recebe o que a consulta achou e devolve a mensagem do conflito (ou
// null). Ausencia vem antes de ajuste manual porque e o motivo mais forte.
function detectarConflitoReposicao({ colaboradorNome = null, dataReposicao, ausencias = [], temAjusteManual = false }) {
    const nome = colaboradorNome || 'O colaborador';
    const prefixo = `Nao da para repor em ${formatarDataBr(dataReposicao)}:`;

    if (ausencias.length > 0) {
        const tipo = String(ausencias[0].Tipo ?? ausencias[0].tipo ?? '').trim().toLowerCase();
        const motivo = MOTIVO_AUSENCIA[tipo] || MOTIVO_AUSENCIA.ausencia;
        return `${prefixo} ${nome} tem ${motivo} nesse dia. Escolha outra data.`;
    }

    if (temAjusteManual) {
        return `${prefixo} a escala de ${nome} nesse dia foi ajustada a mao. Remova o ajuste na Escala do Dia ou escolha outra data.`;
    }

    return null;
}

// Consulta e lanca o 409. `folgaId` exclui a linha de escala que a PROPRIA folga
// ja gerou (ao editar), para ela nao contar como conflito consigo mesma.
async function exigirReposicaoSemConflito(poolOrTx, { colaboradorId, dataReposicao, folgaId = null }) {
    const ausencias = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('data', sql.Date, dataReposicao)
        .query(`
            SELECT Tipo
            FROM Ausencias
            WHERE ColaboradorId = @colaboradorId
              AND PeriodoTipo = 'dia_inteiro'
              AND @data BETWEEN DataInicio AND DataFim
        `);

    const ajuste = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('data', sql.Date, dataReposicao)
        .input('folgaId', sql.Int, folgaId)
        .query(`
            SELECT TOP 1 id
            FROM escala_dia
            WHERE colaborador_id = @colaboradorId
              AND data = @data
              AND ajuste_manual = 1
              AND (ISNULL(origem_tipo, '') <> 'folga_domingo' OR ISNULL(origem_id, 0) <> ISNULL(@folgaId, -1))
        `);

    const mensagem = detectarConflitoReposicao({
        colaboradorNome: await buscarNome(poolOrTx, colaboradorId),
        dataReposicao,
        ausencias: ausencias.recordset,
        temAjusteManual: ajuste.recordset.length > 0
    });

    if (mensagem) {
        throw new AppError(409, mensagem);
    }
}

async function buscarNome(poolOrTx, colaboradorId) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT Nome FROM Colaboradores WHERE Id = @id');

    return result.recordset[0]?.Nome || null;
}

module.exports = {
    detectarConflitoReposicao,
    exigirReposicaoSemConflito
};

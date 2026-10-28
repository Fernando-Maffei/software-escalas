// Credito no banco de horas do substituto pelos trechos de dia util com
// destino 'banco'. 'extra' e pago em folha e nao gera movimento, a mesma
// regra do plantao (syncPlantaoMovements). Cada movimento aponta para o
// trecho: OrigemTipo 'cobertura', OrigemId = Id do trecho.
const { sql } = require('../db');
const { carregarTrechosDeDiaUtil, descreverTrecho } = require('./cobertura-dia-util');

const ORIGEM_COBERTURA = 'cobertura';

async function gravarMovimentosDosTrechos(tx, trechos) {
    let gerados = 0;

    for (const trecho of trechos) {
        if (trecho.tipoCredito !== 'banco') {
            continue;
        }

        await tx.request()
            .input('colaboradorId', sql.Int, trecho.substitutoId)
            .input('dataReferencia', sql.Date, trecho.dataISO)
            .input('minutos', sql.Int, trecho.minutos)
            .input('origemTipo', sql.NVarChar(30), ORIGEM_COBERTURA)
            .input('origemId', sql.Int, trecho.id)
            .input('descricao', sql.NVarChar(255), descreverTrecho(trecho))
            .input('observacao', sql.NVarChar(500), trecho.observacao || null)
            .query(`
                INSERT INTO BancoHorasMovimentos (
                    ColaboradorId, DataReferencia, Minutos, OrigemTipo, OrigemId, Descricao, Observacao
                ) VALUES (
                    @colaboradorId, @dataReferencia, @minutos, @origemTipo, @origemId, @descricao, @observacao
                )
            `);

        gerados += 1;
    }

    return gerados;
}

// Refaz os movimentos de uma cobertura DEPOIS de gravada (ou apagada). Leva
// junto o movimento de trecho que nao existe mais: na edicao o trecho
// removido ja saiu da tabela, e na exclusao a cobertura inteira.
async function sincronizarMovimentosDaCobertura(tx, coberturaId) {
    await tx.request()
        .input('origemTipo', sql.NVarChar(30), ORIGEM_COBERTURA)
        .input('coberturaId', sql.Int, coberturaId)
        .query(`
            DELETE m
            FROM BancoHorasMovimentos m
            WHERE m.OrigemTipo = @origemTipo
              AND (
                    m.OrigemId IN (SELECT Id FROM CoberturaTrechos WHERE CoberturaId = @coberturaId)
                 OR NOT EXISTS (SELECT 1 FROM CoberturaTrechos t WHERE t.Id = m.OrigemId)
              )
        `);

    return gravarMovimentosDosTrechos(tx, await carregarTrechosDeDiaUtil(tx, { coberturaId }));
}

module.exports = {
    ORIGEM_COBERTURA,
    gravarMovimentosDosTrechos,
    sincronizarMovimentosDaCobertura
};

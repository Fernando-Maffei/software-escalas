// Exclusao DEFINITIVA de um colaborador (a "limpeza" depois do periodo de
// retencao). O desligamento comum e soft delete (Ativo = 0) e mora na rota.
//
// Tudo roda numa transacao so: se qualquer passo falhar, nada foi apagado.
// Antes cada DELETE era uma ida solta ao banco, e uma FK esquecida
// (BancoHorasSemanal, FolgasDomingo) estourava no fim — depois de ja ter
// apagado ausencias, movimentos, escala e jornada.
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { extractDateString } = require('../lib/validation');
const { removerColaboradorDasEquipes } = require('./equipe-plantao');

// Toda tabela com FK para Colaboradores(Id), e a coluna da FK. Uma tabela nova
// que referencie Colaboradores precisa entrar aqui — o teste de integracao
// "exclusao definitiva remove o colaborador e todo o historico" confere que o
// colaborador some sem sobrar vinculo.
const TABELAS_FILHAS = Object.freeze([
    ['BancoHorasMovimentos', 'ColaboradorId'],
    ['BancoHorasSemanal', 'ColaboradorId'],
    ['escala_dia', 'colaborador_id'],
    ['ColaboradorJornadaSemanal', 'ColaboradorId'],
    ['AlmocosPersonalizados', 'ColaboradorId'],
    ['FolgasDomingo', 'ColaboradorId'],
    // Os trechos da cobertura saem junto (ON DELETE CASCADE).
    ['Coberturas', 'TitularId'],
    ['Ausencias', 'ColaboradorId']
]);

function assertPodeExcluirDefinitivamente(colaborador, hojeISO) {
    if (colaborador.Ativo === true || colaborador.Ativo === 1) {
        throw new AppError(400, 'Desligue o colaborador antes de excluir definitivamente.');
    }

    const dataDesligamento = extractDateString(colaborador.DataDesligamento);

    if (!dataDesligamento || dataDesligamento > hojeISO) {
        throw new AppError(
            400,
            'A exclusao definitiva so e permitida apos a data de desligamento (periodo de retencao ainda vigente).'
        );
    }
}

async function excluirColaboradorDefinitivamente(tx, colaboradorId, options = {}) {
    const hojeISO = options.hojeISO || extractDateString(new Date());
    const resultado = await tx
        .request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT Id, Ativo, DataDesligamento FROM Colaboradores WITH (UPDLOCK) WHERE Id = @id');
    const colaborador = resultado.recordset[0];

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    assertPodeExcluirDefinitivamente(colaborador, hojeISO);
    // Sai das equipes de plantao; os plantoes continuam (a FK impediria
    // apagar o cadastro com a pessoa ainda escalada).
    await removerColaboradorDasEquipes(tx, colaboradorId);

    // A folga de OUTRA pessoa pode apontar este colaborador como quem cobriu
    // (coluna legada, a tela nao preenche mais). O registro da folga continua
    // verdadeiro; so perde a referencia.
    await tx
        .request()
        .input('id', sql.Int, colaboradorId)
        .query('UPDATE FolgasDomingo SET CobertoPorColaboradorId = NULL WHERE CobertoPorColaboradorId = @id');

    // Trecho que este colaborador cobriu na cobertura de OUTRA pessoa volta a
    // ficar sem substituto: a cobertura do titular continua existindo.
    await tx
        .request()
        .input('id', sql.Int, colaboradorId)
        .query('UPDATE CoberturaTrechos SET SubstitutoId = NULL, TipoCredito = NULL WHERE SubstitutoId = @id');

    for (const [tabela, coluna] of TABELAS_FILHAS) {
        await tx.request().input('id', sql.Int, colaboradorId).query(`DELETE FROM dbo.[${tabela}] WHERE [${coluna}] = @id`);
    }

    await tx.request().input('id', sql.Int, colaboradorId).query('DELETE FROM Colaboradores WHERE Id = @id');
}

module.exports = {
    TABELAS_FILHAS,
    assertPodeExcluirDefinitivamente,
    excluirColaboradorDefinitivamente
};

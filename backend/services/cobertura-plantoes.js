// Trecho de cobertura em sabado, domingo ou feriado vira plantao: uma linha em
// plantoes com o substituto na equipe e cobertura_trecho_id apontando para o
// trecho. Dali para frente e um plantao como os outros — escala do dia, banco
// de horas, banco semanal, horas extras e relatorios ja sabem le-lo.
//
// A linha e derivada: a cada gravacao da cobertura os plantoes dela sao
// apagados (com o movimento de banco e a linha de escala que geraram) e
// recriados dos trechos. Por isso o id do plantao muda a cada edicao, como ja
// acontece quando o dia de plantao e regravado.
//
// Em dois passos porque a FK plantoes -> CoberturaTrechos nao tem cascata:
// removerPlantoesDaCobertura ANTES de mexer nos trechos, gerarPlantoesDaCobertura
// DEPOIS de grava-los.
const { sql } = require('../db');
const { carregarTrechosDePlantao } = require('./cobertura-dia-util');
const { SQL_EQUIPE_PLANTAO, gravarEquipePlantao } = require('./equipe-plantao');
const { deleteEscalaDiaByOrigin, restoreEscalaDefaultsForPeriod, syncPlantaoDiaToEscalaDia } = require('./escala');
const { deletePlantaoMovements, syncPlantaoMovements } = require('./plantao-movimentos');
const { extractDateString, toSqlTime } = require('../lib/validation');

const COLUNAS = `id, data_plantao, ${SQL_EQUIPE_PLANTAO}, hora_inicio, hora_fim, observacao,
                tipo_plantao, tipo_credito, tipo_lancamento, cobertura_trecho_id`;

// Apaga plantoes e tudo o que eles geraram. Devolve as datas mexidas, para a
// escala ser refeita nelas.
async function apagarPlantoes(tx, rows) {
    const datas = new Set();

    for (const row of rows) {
        await deletePlantaoMovements(tx, row.id);
        await deleteEscalaDiaByOrigin(tx, 'plantao', row.id);
        // A equipe sai junto (PlantaoColaborador com ON DELETE CASCADE).
        await tx.request().input('id', sql.Int, row.id).query('DELETE FROM plantoes WHERE id = @id');
        datas.add(extractDateString(row.data_plantao));
    }

    return datas;
}

// Refaz a escala de cada data com TODOS os plantoes que sobraram nela (a
// linha da escala junta os turnos do dia de cada pessoa).
async function refazerEscalaDosDias(tx, datas) {
    if (datas.size === 0) {
        return;
    }

    const colaboradores = (await tx.request().query('SELECT * FROM Colaboradores')).recordset;

    for (const dataISO of [...datas].sort()) {
        const doDia = await tx.request()
            .input('data', sql.Date, dataISO)
            .query(`SELECT ${COLUNAS} FROM plantoes WHERE data_plantao = @data`);

        if (doDia.recordset.length > 0) {
            await syncPlantaoDiaToEscalaDia(tx, dataISO, doDia.recordset, colaboradores);
        } else {
            await restoreEscalaDefaultsForPeriod(tx, dataISO, dataISO);
        }
    }
}

async function removerPlantoesDaCobertura(tx, coberturaId) {
    const result = await tx.request()
        .input('coberturaId', sql.Int, coberturaId)
        .query(`
            SELECT ${COLUNAS}
            FROM plantoes
            WHERE cobertura_trecho_id IN (SELECT Id FROM CoberturaTrechos WHERE CoberturaId = @coberturaId)
        `);

    return apagarPlantoes(tx, result.recordset);
}

function observacaoDoTrecho(trecho) {
    return [trecho.titularNome ? `Cobrindo ${trecho.titularNome}` : null, trecho.observacao]
        .filter(Boolean)
        .join(' | ') || null;
}

// `datasMexidas`: o que removerPlantoesDaCobertura devolveu, para a escala do
// dia que perdeu o plantao tambem ser refeita.
async function gerarPlantoesDaCobertura(tx, coberturaId, datasMexidas = new Set()) {
    const datas = new Set(datasMexidas);

    for (const trecho of await carregarTrechosDePlantao(tx, { coberturaId })) {
        // tipoDia ja e 'sabado', 'domingo' ou 'feriado' (mesma regra de
        // resolvePlantaoTypeByDate). O lancamento e o plantao regular do dia.
        const inserido = await tx.request()
            .input('data', sql.Date, trecho.dataISO)
            .input('horaInicio', sql.Time, toSqlTime(trecho.horaInicio, 'Hora inicial do plantao'))
            .input('horaFim', sql.Time, toSqlTime(trecho.horaFim, 'Hora final do plantao'))
            .input('observacao', sql.NVarChar(500), observacaoDoTrecho(trecho))
            .input('tipo', sql.NVarChar(30), trecho.tipoDia)
            .input('tipoCredito', sql.NVarChar(20), trecho.tipoCredito)
            .input('trechoId', sql.Int, trecho.id)
            .query(`
                INSERT INTO plantoes (
                    data_plantao, hora_inicio, hora_fim, observacao,
                    tipo_plantao, tipo_credito, tipo_lancamento, cobertura_trecho_id
                )
                OUTPUT INSERTED.id
                VALUES (@data, @horaInicio, @horaFim, @observacao, @tipo, @tipoCredito, @tipo, @trechoId)
            `);
        const plantaoId = Number(inserido.recordset[0].id);

        await gravarEquipePlantao(tx, plantaoId, [trecho.substitutoId]);
        await syncPlantaoMovements(tx, {
            id: plantaoId,
            data_plantao: trecho.dataISO,
            equipe: [trecho.substitutoId],
            hora_inicio: trecho.horaInicio,
            hora_fim: trecho.horaFim,
            observacao: observacaoDoTrecho(trecho),
            tipo_plantao: trecho.tipoDia,
            tipo_credito: trecho.tipoCredito,
            tipo_lancamento: trecho.tipoDia
        });
        datas.add(trecho.dataISO);
    }

    await refazerEscalaDosDias(tx, datas);
}

// Exclusao definitiva de colaborador: os plantoes de cobertura em que ele e
// o titular (a cobertura sai com ele) ou o substituto (o trecho volta a
// pendente). Roda antes de os trechos mudarem, pela FK.
async function removerPlantoesDeCoberturaDoColaborador(tx, colaboradorId) {
    const result = await tx.request()
        .input('id', sql.Int, colaboradorId)
        .query(`
            SELECT ${COLUNAS}
            FROM plantoes
            WHERE cobertura_trecho_id IN (
                SELECT t.Id
                FROM CoberturaTrechos t
                INNER JOIN Coberturas c ON c.Id = t.CoberturaId
                WHERE c.TitularId = @id OR t.SubstitutoId = @id
            )
        `);

    await refazerEscalaDosDias(tx, await apagarPlantoes(tx, result.recordset));
}

module.exports = {
    gerarPlantoesDaCobertura,
    removerPlantoesDaCobertura,
    removerPlantoesDeCoberturaDoColaborador
};

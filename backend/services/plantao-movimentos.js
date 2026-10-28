// Credito do plantao no banco de horas (BancoHorasMovimentos, OrigemTipo
// 'plantao'). Saiu de routes/plantoes.js sem mudar nada: o plantao gerado por
// uma cobertura (cobertura-plantoes.js) credita pelo mesmo caminho.
const { sql } = require('../db');
const { calculateIntervalMinutes, describePlantaoMovement } = require('./bancoHoras');
const { serializePlantaoRecord } = require('./plantoes');

async function deletePlantaoMovements(poolOrTx, plantaoId) {
    await poolOrTx.request()
        .input('origemTipo', sql.NVarChar(30), 'plantao')
        .input('origemId', sql.Int, plantaoId)
        .query(`
            DELETE FROM BancoHorasMovimentos
            WHERE OrigemTipo = @origemTipo
              AND OrigemId = @origemId
        `);
}

async function syncPlantaoMovements(poolOrTx, row) {
    const plantao = serializePlantaoRecord(row);
    await deletePlantaoMovements(poolOrTx, plantao.id);

    // Hora extra e paga em folha: o plantao fica registrado e entra na escala do
    // dia, mas nao vira credito no banco de horas. O DELETE acima roda antes
    // deste corte de proposito — se o lancamento era 'banco' e virou 'extra',
    // o movimento antigo precisa sumir.
    if (plantao.tipoCredito === 'extra') {
        return { synced: false, skippedReason: 'hora_extra' };
    }

    if (!plantao.horaInicio || !plantao.horaFim || plantao.colaboradores.length === 0) {
        return { synced: false, skippedReason: 'missing_required_data' };
    }

    const minutos = calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim, {
        startLabel: 'Hora inicial do plantao',
        endLabel: 'Hora final do plantao'
    });

    for (const colaboradorId of plantao.colaboradores) {
        await poolOrTx.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('dataReferencia', sql.Date, plantao.dataISO)
            .input('minutos', sql.Int, minutos)
            .input('origemTipo', sql.NVarChar(30), 'plantao')
            .input('origemId', sql.Int, plantao.id)
            .input('descricao', sql.NVarChar(255), describePlantaoMovement(plantao))
            .input('observacao', sql.NVarChar(500), plantao.observacao || null)
            .query(`
                INSERT INTO BancoHorasMovimentos (
                    ColaboradorId,
                    DataReferencia,
                    Minutos,
                    OrigemTipo,
                    OrigemId,
                    Descricao,
                    Observacao
                ) VALUES (
                    @colaboradorId,
                    @dataReferencia,
                    @minutos,
                    @origemTipo,
                    @origemId,
                    @descricao,
                    @observacao
                )
            `);
    }

    return {
        synced: true,
        minutos
    };
}

module.exports = {
    deletePlantaoMovements,
    syncPlantaoMovements
};

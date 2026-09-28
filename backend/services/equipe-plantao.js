// Equipe do plantao: tabela de ligacao PlantaoColaborador (M17 da auditoria;
// ver database/migrations/2026-09-28-plantao-colaborador.sql).
const { sql } = require('../db');

// Coluna de SELECT com a equipe como array JSON ordenado ("[3,7]"), o formato
// que serializePlantaoRecord le (campo `equipe`). Serve para consultas
// `FROM plantoes` sem apelido.
const SQL_EQUIPE_PLANTAO = `COALESCE((
                SELECT '[' + STRING_AGG(CAST(pc.ColaboradorId AS VARCHAR(12)), ',')
                    WITHIN GROUP (ORDER BY pc.ColaboradorId) + ']'
                FROM dbo.PlantaoColaborador pc
                WHERE pc.PlantaoId = plantoes.id
            ), '[]') AS equipe`;

// Filtro de WHERE: plantoes (FROM plantoes, sem apelido) em que o colaborador
// do parametro @colaboradorId esta na equipe.
const SQL_PLANTAO_COM_COLABORADOR = `EXISTS (
            SELECT 1 FROM dbo.PlantaoColaborador pc
            WHERE pc.PlantaoId = plantoes.id AND pc.ColaboradorId = @colaboradorId
        )`;

// Grava a equipe de um plantao recem-inserido. `colaboradores` ja vem
// normalizado (ids inteiros, sem repeticao).
async function gravarEquipePlantao(tx, plantaoId, colaboradores) {
    for (const colaboradorId of colaboradores) {
        await tx.request()
            .input('plantaoId', sql.Int, plantaoId)
            .input('colaboradorId', sql.Int, colaboradorId)
            .query('INSERT INTO dbo.PlantaoColaborador (PlantaoId, ColaboradorId) VALUES (@plantaoId, @colaboradorId)');
    }
}

// Tira o colaborador de todas as equipes (exclusao definitiva do cadastro) e
// marca os plantoes afetados como atualizados.
async function removerColaboradorDasEquipes(tx, colaboradorId) {
    await tx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            UPDATE plantoes SET atualizado_em = GETDATE()
            WHERE ${SQL_PLANTAO_COM_COLABORADOR};

            DELETE FROM dbo.PlantaoColaborador WHERE ColaboradorId = @colaboradorId;
        `);
}

module.exports = {
    SQL_EQUIPE_PLANTAO,
    SQL_PLANTAO_COM_COLABORADOR,
    gravarEquipePlantao,
    removerColaboradorDasEquipes
};

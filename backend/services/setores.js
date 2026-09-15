const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { getSchemaInfo, hasTable } = require('../db/schema');
const { ensurePositiveInt, normalizeOptionalText } = require('../lib/validation');

function serializeSetor(row) {
    return {
        id: Number(row.Id ?? row.id ?? 0) || null,
        nome: row.Nome ?? row.nome ?? null,
        ativo: row.Ativo === undefined || row.Ativo === null ? true : row.Ativo === true || row.Ativo === 1,
        ordem: Number(row.Ordem ?? row.ordem ?? 0) || 0,
        criadoEm: row.CriadoEm ?? row.criadoEm ?? null,
        atualizadoEm: row.AtualizadoEm ?? row.atualizadoEm ?? null
    };
}

function normalizeSetorNome(value, fieldName = 'Setor') {
    const normalized = normalizeOptionalText(value, fieldName, { maxLength: 120 });

    if (!normalized) {
        throw new AppError(400, `${fieldName} e obrigatorio.`);
    }

    return normalized;
}

function normalizeNullableSetorId(value, fieldName = 'Setor') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return ensurePositiveInt(value, fieldName);
}

async function listSetores(poolOrTx, options = {}) {
    const schema = await getSchemaInfo(poolOrTx);

    if (!hasTable(schema, 'Setores')) {
        return [];
    }

    const { onlyActive = true } = options;
    const request = poolOrTx.request();
    const clauses = [];

    if (onlyActive) {
        clauses.push('Ativo = 1');
    }

    const result = await request.query(`
        SELECT
            Id,
            Nome,
            Ativo,
            Ordem,
            CriadoEm,
            AtualizadoEm
        FROM Setores
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY Ordem, Nome
    `);

    return result.recordset.map(serializeSetor);
}

async function findSetorById(poolOrTx, setorId) {
    const schema = await getSchemaInfo(poolOrTx);

    if (!hasTable(schema, 'Setores')) {
        return null;
    }

    const id = ensurePositiveInt(setorId, 'Setor');
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query(`
            SELECT
                Id,
                Nome,
                Ativo,
                Ordem,
                CriadoEm,
                AtualizadoEm
            FROM Setores
            WHERE Id = @id
        `);

    return result.recordset[0] ? serializeSetor(result.recordset[0]) : null;
}

async function ensureSetorExists(poolOrTx, setorId) {
    if (!setorId) {
        return null;
    }

    const schema = await getSchemaInfo(poolOrTx);

    if (!hasTable(schema, 'Setores')) {
        throw new AppError(409, 'A tabela de setores ainda nao foi criada. Use a opcao de verificar/gerar tabelas antes de vincular um setor.');
    }

    const setor = await findSetorById(poolOrTx, setorId);

    if (!setor) {
        throw new AppError(404, 'Setor nao encontrado.');
    }

    return setor;
}

module.exports = {
    ensureSetorExists,
    findSetorById,
    listSetores,
    normalizeNullableSetorId,
    normalizeSetorNome,
    serializeSetor
};

const { AppError } = require('./errors');

const SCHEMA_CACHE_TTL_MS = 10000;
const TRACKED_TABLES = ['Ausencias', 'BancoHorasMovimentos', 'Colaboradores', 'plantoes', 'escala_dia'];

let schemaCache = null;
let schemaCacheExpiresAt = 0;

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function buildEmptySchema() {
    return {
        tables: {}
    };
}

async function getSchemaInfo(pool, options = {}) {
    const { forceRefresh = false } = options;

    if (!forceRefresh && schemaCache && Date.now() < schemaCacheExpiresAt) {
        return schemaCache;
    }

    const result = await pool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN (${TRACKED_TABLES.map((table) => `'${table}'`).join(', ')})
    `);

    const schema = buildEmptySchema();

    for (const row of result.recordset) {
        const tableName = normalizeName(row.TABLE_NAME);
        const columnName = normalizeName(row.COLUMN_NAME);

        if (!schema.tables[tableName]) {
            schema.tables[tableName] = new Set();
        }

        schema.tables[tableName].add(columnName);
    }

    schemaCache = schema;
    schemaCacheExpiresAt = Date.now() + SCHEMA_CACHE_TTL_MS;
    return schema;
}

function hasTable(schema, tableName) {
    return Boolean(schema?.tables?.[normalizeName(tableName)]);
}

function hasColumn(schema, tableName, columnName) {
    if (!hasTable(schema, tableName)) {
        return false;
    }

    return schema.tables[normalizeName(tableName)].has(normalizeName(columnName));
}

function clearSchemaCache() {
    schemaCache = null;
    schemaCacheExpiresAt = 0;
}

function getBancoHorasCapabilities(schema) {
    return {
        hasMovimentosTable: hasTable(schema, 'BancoHorasMovimentos'),
        hasAusenciaSubtipo: hasColumn(schema, 'Ausencias', 'Subtipo'),
        hasAusenciaDesconta: hasColumn(schema, 'Ausencias', 'DescontaBancoHoras'),
        hasAusenciaObservacao: hasColumn(schema, 'Ausencias', 'Observacao'),
        hasPlantaoHoraInicio: hasColumn(schema, 'plantoes', 'hora_inicio'),
        hasPlantaoHoraFim: hasColumn(schema, 'plantoes', 'hora_fim'),
        hasPlantaoObservacao: hasColumn(schema, 'plantoes', 'observacao')
    };
}

function describeBancoHorasMissingPieces(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const missing = [];

    if (!capabilities.hasMovimentosTable) {
        missing.push('tabela BancoHorasMovimentos');
    }

    if (!capabilities.hasAusenciaDesconta) {
        missing.push('coluna Ausencias.DescontaBancoHoras');
    }

    if (!capabilities.hasPlantaoHoraInicio) {
        missing.push('coluna plantoes.hora_inicio');
    }

    if (!capabilities.hasPlantaoHoraFim) {
        missing.push('coluna plantoes.hora_fim');
    }

    return missing;
}

function ensureBancoHorasTable(schema) {
    if (hasTable(schema, 'BancoHorasMovimentos')) {
        return;
    }

    throw new AppError(
        409,
        'Banco de horas ainda nao esta habilitado no banco. Aplique o script de migracao antes de usar esse recurso.',
        { missing: describeBancoHorasMissingPieces(schema) }
    );
}

module.exports = {
    clearSchemaCache,
    describeBancoHorasMissingPieces,
    ensureBancoHorasTable,
    getBancoHorasCapabilities,
    getSchemaInfo,
    hasColumn,
    hasTable
};

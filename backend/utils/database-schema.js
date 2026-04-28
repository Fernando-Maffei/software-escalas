const fs = require('fs');
const path = require('path');

const { AppError } = require('./errors');
const { clearSchemaCache } = require('./schema');

const REQUIRED_TABLES = Object.freeze([
    'Colaboradores',
    'Ausencias',
    'Feriados',
    'plantoes',
    'BancoHorasMovimentos',
    'escala_dia'
]);

const SCHEMA_SCRIPT_PATHS = Object.freeze([
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-27-base-schema.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-23-banco-horas.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-24-escala-dia.sql')
]);

function splitSqlBatches(script) {
    return String(script || '')
        .split(/^\s*GO\s*$/gim)
        .map((batch) => batch.trim())
        .filter(Boolean);
}

async function executeSqlScriptFile(pool, filePath) {
    const script = await fs.promises.readFile(filePath, 'utf8');

    for (const batch of splitSqlBatches(script)) {
        await pool.request().batch(batch);
    }
}

async function listExistingRequiredTables(pool) {
    const result = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME IN (${REQUIRED_TABLES.map((table) => `'${table}'`).join(', ')})
    `);

    return result.recordset.map((row) => row.TABLE_NAME);
}

async function ensureApplicationSchema(pool) {
    const before = await listExistingRequiredTables(pool);

    for (const filePath of SCHEMA_SCRIPT_PATHS) {
        await executeSqlScriptFile(pool, filePath);
    }

    clearSchemaCache();

    const after = await listExistingRequiredTables(pool);
    const missingTables = REQUIRED_TABLES.filter((table) => !after.includes(table));

    if (missingTables.length > 0) {
        throw new AppError(
            500,
            'A rotina de verificacao terminou, mas ainda faltam tabelas obrigatorias no banco configurado.',
            { missingTables }
        );
    }

    return {
        requiredTables: [...REQUIRED_TABLES],
        createdTables: REQUIRED_TABLES.filter((table) => !before.includes(table) && after.includes(table)),
        existingTables: REQUIRED_TABLES.filter((table) => before.includes(table)),
        scriptsExecuted: SCHEMA_SCRIPT_PATHS.map((filePath) => path.basename(filePath))
    };
}

module.exports = {
    REQUIRED_TABLES,
    ensureApplicationSchema
};

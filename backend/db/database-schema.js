const path = require('path');

const { AppError } = require('../lib/errors');
const { ensureDefaultAdmin } = require('../auth/auth');
const { aplicarMigracoes, executeSqlScriptFile } = require('./migracoes');

const REQUIRED_TABLES = Object.freeze([
    'Colaboradores',
    'ColaboradorJornadaSemanal',
    'TiposEscala',
    'TipoEscalaDia',
    'FolgasDomingo',
    'Setores',
    'Ausencias',
    'Feriados',
    'plantoes',
    'PlantaoColaborador',
    'BancoHorasMovimentos',
    'BancoHorasSemanal',
    'BancoHorasSemanalNota',
    'escala_dia',
    'AlmocosPersonalizados',
    'Usuarios',
    'Sessoes'
]);

const SCHEMA_SCRIPT_PATHS = Object.freeze([
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-27-base-schema.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-23-banco-horas.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-04-24-escala-dia.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-05-21-setores-plantoes-almoco.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-05-28-colaborador-jornada-semanal.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-07-08-usuarios.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-07-09-usuarios-admin.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-08-11-usuarios-setores-visiveis.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-08-12-usuarios-setores-permitidos.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-08-26-sessoes.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-08-27-banco-horas-semanal.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-08-28-colaborador-desligamento.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-04-plantao-lancamentos.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-21-tipos-escala.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-22-escala-dia-tipos-plantonista.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-23-folgas-domingo.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-28-plantao-colaborador.sql'),
    path.join(__dirname, '..', '..', 'database', 'migrations', '2026-09-30-plantonista-colaborador.sql')
]);

const EXAMPLE_SEED_SCRIPT_PATH = path.join(__dirname, '..', '..', 'database', 'seeds', 'dados-exemplo.sql');

async function listExistingRequiredTables(pool) {
    const result = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME IN (${REQUIRED_TABLES.map((table) => `'${table}'`).join(', ')})
    `);

    return result.recordset.map((row) => row.TABLE_NAME);
}

async function getSchemaSnapshot(pool) {
    const result = await pool.request().query(`
        SELECT
            TABLE_NAME,
            COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN (${REQUIRED_TABLES.map((table) => `'${table}'`).join(', ')})
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    const tables = new Map();

    result.recordset.forEach((row) => {
        const tableName = row.TABLE_NAME;
        const columnName = row.COLUMN_NAME;

        if (!tables.has(tableName)) {
            tables.set(tableName, new Set());
        }

        tables.get(tableName).add(columnName);
    });

    return tables;
}

function diffSchemaColumns(before, after) {
    const addedColumns = [];

    after.forEach((columns, tableName) => {
        const previousColumns = before.get(tableName) || new Set();

        columns.forEach((columnName) => {
            if (!previousColumns.has(columnName)) {
                addedColumns.push({
                    table: tableName,
                    column: columnName
                });
            }
        });
    });

    return addedColumns;
}

async function ensureApplicationSchema(pool) {
    const before = await listExistingRequiredTables(pool);
    const schemaBefore = await getSchemaSnapshot(pool);

    // So roda o que este banco ainda nao aplicou (ver db/migracoes.js).
    const { executadas } = await aplicarMigracoes(pool, SCHEMA_SCRIPT_PATHS);

    const after = await listExistingRequiredTables(pool);
    const schemaAfter = await getSchemaSnapshot(pool);
    const missingTables = REQUIRED_TABLES.filter((table) => !after.includes(table));
    const createdTables = REQUIRED_TABLES.filter((table) => !before.includes(table) && after.includes(table));
    const addedColumns = diffSchemaColumns(schemaBefore, schemaAfter);

    if (missingTables.length > 0) {
        throw new AppError(
            500,
            'A rotina de verificacao terminou, mas ainda faltam tabelas obrigatorias no banco configurado.',
            { missingTables }
        );
    }

    createdTables.forEach((tableName) => {
        console.log(`[schema] tabela criada: ${tableName}`);
    });
    addedColumns.forEach(({ table, column }) => {
        console.log(`[schema] coluna criada/garantida: ${table}.${column}`);
    });

    const bootstrappedAdmin = await ensureDefaultAdmin(pool);

    if (bootstrappedAdmin) {
        console.log('========================================================');
        console.log('[auth] Usuario administrador criado automaticamente.');
        console.log(`[auth] Usuario: ${bootstrappedAdmin.username}`);

        if (bootstrappedAdmin.generated) {
            console.log(`[auth] Senha gerada: ${bootstrappedAdmin.password}`);
            console.log('[auth] Anote esta senha agora - ela nao sera exibida novamente.');
            console.log('[auth] Uma troca de senha sera solicitada no primeiro login.');
        } else {
            console.log('[auth] Senha definida via variavel de ambiente ADMIN_PASSWORD.');
        }

        console.log('========================================================');
    }

    return {
        requiredTables: [...REQUIRED_TABLES],
        createdTables,
        existingTables: REQUIRED_TABLES.filter((table) => before.includes(table)),
        addedColumns,
        scriptsExecuted: executadas,
        // So expoe a senha quando ela foi gerada aleatoriamente agora (o
        // destinatario e quem esta instalando o sistema); senha vinda do
        // .env nunca e ecoada de volta.
        bootstrappedAdmin: bootstrappedAdmin
            ? {
                username: bootstrappedAdmin.username,
                generated: bootstrappedAdmin.generated,
                password: bootstrappedAdmin.generated ? bootstrappedAdmin.password : null
            }
            : null
    };
}

// Carrega o template de dados de exemplo (setores e colaboradores de
// demonstracao). O script SQL e idempotente e nunca
// apaga/sobrescreve dados existentes, entao e seguro rodar num banco que ja
// tem conteudo — apenas preenche o que ainda faltar. Serve para um banco
// recem-instalado nao comecar totalmente vazio.
async function applyExampleSeed(pool) {
    // Garante que as tabelas existam antes de tentar inserir nelas.
    await ensureApplicationSchema(pool);

    await executeSqlScriptFile(pool, EXAMPLE_SEED_SCRIPT_PATH);

    const counts = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM dbo.Setores) AS setores,
            (SELECT COUNT(*) FROM dbo.Colaboradores) AS colaboradores,
            (SELECT COUNT(*) FROM dbo.Feriados) AS feriados
    `);

    const row = counts.recordset[0] || {};

    return {
        seedApplied: true,
        totals: {
            setores: Number(row.setores) || 0,
            colaboradores: Number(row.colaboradores) || 0,
            feriados: Number(row.feriados) || 0
        }
    };
}

module.exports = {
    REQUIRED_TABLES,
    ensureApplicationSchema,
    applyExampleSeed
};

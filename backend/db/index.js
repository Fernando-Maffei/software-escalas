const sql = require('mssql');

const {
    buildMssqlConfig,
    getDatabaseSettingsFingerprint,
    getEffectiveDatabaseSettings
} = require('./database-config');

let poolPromise = null;
let activePoolFingerprint = null;

// Fechar um pool que falha nao pode derrubar quem fecha (troca de banco,
// desligamento), mas a falha fica registrada.
async function fecharPool(pool) {
    try {
        await pool.close();
    } catch (error) {
        console.warn('[db] falha ao fechar o pool de conexoes:', error.message);
    }
}

async function abrirPool(settings) {
    const pool = new sql.ConnectionPool(buildMssqlConfig(settings));
    await pool.connect();
    return pool;
}

async function conectar(options = {}) {
    const settings = options.settings || getEffectiveDatabaseSettings();
    const fingerprint = getDatabaseSettingsFingerprint(settings);

    if (options.fresh) {
        return abrirPool(settings);
    }

    if (!poolPromise || activePoolFingerprint !== fingerprint) {
        await fecharConexao();

        activePoolFingerprint = fingerprint;
        poolPromise = abrirPool(settings)
            .then((pool) => {
                pool.on('error', () => {
                    poolPromise = null;
                    activePoolFingerprint = null;
                });
                return pool;
            })
            .catch((error) => {
                poolPromise = null;
                activePoolFingerprint = null;
                throw error;
            });
    }

    return poolPromise;
}

async function testarConexao(settings) {
    const pool = await abrirPool(settings);

    try {
        const result = await pool.request().query(`
            SELECT
                @@SERVERNAME AS serverName,
                DB_NAME() AS databaseName
        `);
        const firstRow = result.recordset[0] || {};

        return {
            serverName: firstRow.serverName || null,
            databaseName: firstRow.databaseName || settings.database || null
        };
    } finally {
        await fecharPool(pool);
    }
}

async function fecharConexao() {
    if (!poolPromise) {
        activePoolFingerprint = null;
        return;
    }

    const currentPromise = poolPromise;
    poolPromise = null;
    activePoolFingerprint = null;

    // Pool que nem chegou a conectar nao tem o que fechar; o erro da conexao
    // ja foi entregue a quem chamou conectar().
    const pool = await currentPromise.catch(() => null);

    if (pool) {
        await fecharPool(pool);
    }
}

module.exports = {
    sql,
    conectar,
    fecharConexao,
    testarConexao
};

const sql = require('mssql');

const {
    buildMssqlConfig,
    getDatabaseSettingsFingerprint,
    getEffectiveDatabaseSettings
} = require('./utils/database-config');

let poolPromise = null;
let activePoolFingerprint = null;

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
        await pool.close().catch(() => {});
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

    const pool = await currentPromise.catch(() => null);

    if (pool) {
        await pool.close().catch(() => {});
    }
}

module.exports = {
    sql,
    conectar,
    fecharConexao,
    testarConexao
};

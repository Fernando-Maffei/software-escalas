const sql = require("mssql");

const config = {
    user: "admin",
    password: "lifer1924",
    server: "FERNANDOMAFFEI\\SQLExpress",
    database: "SoftwareEscalas",
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function conectar() {
    try {
        const pool = await sql.connect(config);
        console.log("Conectado ao SQL Server!");
        return pool;
    } catch (err) {
        console.log("Erro ao conectar:", err);
    }
}

module.exports = { sql, conectar };

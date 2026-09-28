// Controle de versao das migrations (M9 da auditoria).
//
// Cada script de database/migrations roda UMA vez por banco e fica registrado
// em dbo.SchemaMigrations (nome + checksum do conteudo). Antes todos rodavam a
// cada boot: funcionava porque sao idempotentes, mas revalidava tabelas inteiras
// toda vez e um script nao idempotente derrubaria o sistema em 503.
//
// Banco que ja existia antes deste controle nao tem registro nenhum: na
// primeira subida todos os scripts rodam uma vez (como sempre rodaram) e sao
// registrados. Script ja aplicado cujo conteudo mudou NAO roda de novo — mudar
// migration aplicada e erro; a correcao e um script novo. So avisa no log.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SQL_TABELA_MIGRACOES = `
IF OBJECT_ID('dbo.SchemaMigrations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SchemaMigrations (
        Nome NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
        Checksum CHAR(64) NOT NULL,
        AplicadaEm DATETIME2 NOT NULL CONSTRAINT DF_SchemaMigrations_AplicadaEm DEFAULT SYSUTCDATETIME()
    );
END`;

function splitSqlBatches(script) {
    return String(script || '')
        .split(/^\s*GO\s*$/gim)
        .map((batch) => batch.trim())
        .filter(Boolean);
}

// O checkout no Windows pode trocar LF por CRLF (e um editor pode por BOM):
// isso nao e mudanca de conteudo e nao pode parecer migration alterada.
function checksumScript(texto) {
    const normalizado = String(texto).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(normalizado, 'utf8').digest('hex');
}

async function executarScript(pool, nome, texto) {
    const lotes = splitSqlBatches(texto);

    for (let indice = 0; indice < lotes.length; indice += 1) {
        try {
            await pool.request().batch(lotes[indice]);
        } catch (error) {
            error.message = `[schema] Falha ao executar ${nome} (lote ${indice + 1}/${lotes.length}): ${error.message || error}`;
            throw error;
        }
    }
}

async function executeSqlScriptFile(pool, caminho) {
    await executarScript(pool, path.basename(caminho), await fs.promises.readFile(caminho, 'utf8'));
}

async function lerAplicadas(pool) {
    const resultado = await pool.request().query('SELECT Nome, Checksum FROM dbo.SchemaMigrations');
    return new Map(resultado.recordset.map((linha) => [linha.Nome, linha.Checksum.trim()]));
}

// Aplica, na ordem dada, os scripts ainda nao registrados. O registro so e
// gravado depois do script inteiro rodar: se ele falhar no meio, roda de novo
// na proxima subida (por isso os scripts continuam idempotentes).
async function aplicarMigracoes(pool, caminhos, { log = console } = {}) {
    await pool.request().batch(SQL_TABELA_MIGRACOES);
    const aplicadas = await lerAplicadas(pool);
    const executadas = [];
    const alteradas = [];

    for (const caminho of caminhos) {
        const nome = path.basename(caminho);
        const texto = await fs.promises.readFile(caminho, 'utf8');
        const checksum = checksumScript(texto);

        if (aplicadas.has(nome)) {
            if (aplicadas.get(nome) !== checksum) {
                alteradas.push(nome);
                log.warn(`[schema] ${nome} ja foi aplicada, mas o arquivo mudou desde entao. Ela NAO roda de novo: crie uma migration nova para a correcao.`);
            }
            continue;
        }

        await executarScript(pool, nome, texto);
        await pool.request()
            .input('nome', nome)
            .input('checksum', checksum)
            .query('INSERT INTO dbo.SchemaMigrations (Nome, Checksum) VALUES (@nome, @checksum)');
        executadas.push(nome);
        log.log(`[schema] migration aplicada: ${nome}`);
    }

    return { executadas, alteradas };
}

module.exports = {
    aplicarMigracoes,
    checksumScript,
    executeSqlScriptFile,
    splitSqlBatches
};

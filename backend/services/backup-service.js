// Backup e restauracao do banco em arquivo JSON.
//
// O QUE entra no backup e COMO cada coluna e lida esta em backup/especificacao.js
// e backup/normalizacao.js; este arquivo so grava o arquivo e aplica a
// restauracao numa transacao.
const fs = require('fs');
const path = require('path');

const { sql } = require('../db');
const { withTransaction } = require('../db/transactions');
const { AppError } = require('../lib/errors');
const { normalizeBackupDirectory } = require('./backup-config');
const { NOMES_TABELAS_BACKUP, TABELAS_BACKUP } = require('./backup/especificacao');
const { coerceBackupPayload, tipoSql } = require('./backup/normalizacao');
const { nomeArquivoBackup } = require('./backup/retencao');
const { SQL_DERIVAR_PLANTONISTA_DE_BACKUP_ANTIGO } = require('./plantonista');
const { version: VERSAO_SISTEMA } = require('../../package.json');

function formatBackupTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function backupJsonReplacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('base64');
    }

    return value;
}

async function ensureBackupDirectory(directory) {
    const normalizedDirectory = normalizeBackupDirectory(directory);

    try {
        await fs.promises.mkdir(normalizedDirectory, { recursive: true });
        await fs.promises.access(normalizedDirectory, fs.constants.W_OK);
    } catch (error) {
        throw new AppError(500, 'Nao foi possivel acessar ou gravar na pasta de backup informada.', {
            directory: normalizedDirectory,
            code: error.code || null
        });
    }

    return normalizedDirectory;
}

// Le todas as tabelas da especificacao e monta o conteudo do backup. Usado
// tanto para gravar na pasta do servidor quanto para o download pela tela.
async function montarBackup(pool, options = {}) {
    const generatedAt = options.generatedAt || new Date();
    const data = {};
    const tableCounts = {};
    let totalRows = 0;

    // Tabelas fixas, nunca vindas de entrada do usuario: seguro interpolar.
    for (const tableName of NOMES_TABELAS_BACKUP) {
        const result = await pool.request().query(`SELECT * FROM [dbo].[${tableName}]`);
        const rows = result.recordset.map((row) => JSON.parse(JSON.stringify(row, backupJsonReplacer)));

        data[tableName] = rows;
        tableCounts[tableName] = rows.length;
        totalRows += rows.length;
    }

    const payload = {
        metadata: {
            system: 'Software de Escalas',
            version: VERSAO_SISTEMA,
            generatedAt: generatedAt.toISOString(),
            generatedBy: options.generatedBy || 'backup-local-manual',
            database: options.databaseInfo || {},
            tablesExported: [...NOMES_TABELAS_BACKUP],
            tableCounts,
            totalRows
        },
        data
    };

    return payload;
}

async function createSystemBackup(pool, options = {}) {
    const directory = await ensureBackupDirectory(options.directory);
    const generatedAt = new Date();
    const fileName = nomeArquivoBackup(formatBackupTimestamp(generatedAt), { automatico: Boolean(options.automatico) });
    const filePath = path.join(directory, fileName);
    const payload = await montarBackup(pool, { ...options, generatedAt });
    const { tableCounts, totalRows } = payload.metadata;

    try {
        await fs.promises.writeFile(filePath, JSON.stringify(payload, backupJsonReplacer, 2), 'utf8');
    } catch (error) {
        throw new AppError(500, 'Nao foi possivel gravar o arquivo de backup na pasta informada.', {
            filePath,
            code: error.code || null
        });
    }

    return {
        generatedAt: payload.metadata.generatedAt,
        generatedBy: payload.metadata.generatedBy,
        fileName,
        filePath,
        tableCounts,
        totalRows,
        tablesExported: [...NOMES_TABELAS_BACKUP]
    };
}

async function reseedIdentity(transaction, tableName, identityColumn) {
    const result = await transaction.request().query(`SELECT MAX([${identityColumn}]) AS maxIdentity FROM [dbo].[${tableName}]`);
    const maxIdentity = Number(result.recordset[0]?.maxIdentity || 0);
    const safeValue = Number.isInteger(maxIdentity) && maxIdentity >= 0 ? maxIdentity : 0;

    await transaction.request().query(`DBCC CHECKIDENT ('dbo.${tableName}', RESEED, ${safeValue}) WITH NO_INFOMSGS`);
}

async function insertTableRows(transaction, especificacao, rows) {
    const { tabela, identidade, colunas } = especificacao;
    const comIdentidade = Boolean(identidade) && rows.some((row) => row[identidade] != null);

    if (comIdentidade && rows.some((row) => row[identidade] == null)) {
        throw new AppError(400, `Os registros da tabela ${tabela} possuem IDs inconsistentes no backup.`);
    }

    for (const row of rows) {
        // So as colunas presentes na linha: coluna ausente (backup antigo) fica
        // com o DEFAULT do banco em vez de NULL explicito.
        const presentes = colunas.filter(
            (coluna) => row[coluna.nome] !== undefined && (comIdentidade || coluna.nome !== identidade)
        );
        const request = transaction.request();

        presentes.forEach((coluna, indice) => {
            request.input(`p${indice}`, tipoSql(coluna), row[coluna.nome]);
        });

        const insert = `INSERT INTO [dbo].[${tabela}] (${presentes.map((c) => `[${c.nome}]`).join(', ')})
            VALUES (${presentes.map((_, indice) => `@p${indice}`).join(', ')})`;

        // SET IDENTITY_INSERT nao sobrevive entre requests (cada .query() e um
        // batch isolado), entao vai no MESMO batch do INSERT.
        await request.query(
            comIdentidade
                ? `SET IDENTITY_INSERT [dbo].[${tabela}] ON; ${insert}; SET IDENTITY_INSERT [dbo].[${tabela}] OFF;`
                : insert
        );
    }

    if (identidade) {
        await reseedIdentity(transaction, tabela, identidade);
    }
}

// Backup anterior a 2026-09-30 nao traz IsPlantonista: o banco assume 0 para todo
// mundo. Nesse caso (e so nele) deriva os plantonistas dos sinais que o arquivo
// ja tem, como a migration faz com os dados existentes.
function backupSemCampoPlantonista(snapshot) {
    const colaboradores = snapshot.data.Colaboradores || [];

    return colaboradores.length > 0 && colaboradores.every((linha) => linha.IsPlantonista === undefined);
}

async function restoreSystemBackup(pool, rawPayload, options = {}) {
    const snapshot = coerceBackupPayload(rawPayload);
    const tableCounts = {};
    let totalRows = 0;

    await withTransaction(sql, pool, async (transaction) => {
        // Filhos antes dos pais ao apagar; pais antes dos filhos ao inserir.
        for (const tableName of [...NOMES_TABELAS_BACKUP].reverse()) {
            await transaction.request().query(`DELETE FROM [dbo].[${tableName}]`);
        }

        for (const especificacao of TABELAS_BACKUP) {
            const rows = snapshot.data[especificacao.tabela];
            tableCounts[especificacao.tabela] = rows.length;
            totalRows += rows.length;
            await insertTableRows(transaction, especificacao, rows);
        }

        if (backupSemCampoPlantonista(snapshot)) {
            await transaction.request().query(SQL_DERIVAR_PLANTONISTA_DE_BACKUP_ANTIGO);
        }
    });

    snapshot.avisos.forEach((aviso) => console.warn(`[backup] ${aviso}`));

    return {
        restoredAt: new Date().toISOString(),
        fileName: options.fileName || '',
        format: snapshot.format,
        avisos: snapshot.avisos,
        metadata: snapshot.metadata,
        preferences: snapshot.preferences,
        tableCounts,
        totalRows,
        tablesRestored: [...NOMES_TABELAS_BACKUP]
    };
}

module.exports = {
    coerceBackupPayload,
    createSystemBackup,
    ensureBackupDirectory,
    formatBackupTimestamp,
    montarBackup,
    restoreSystemBackup
};

const express = require('express');

const { conectar, fecharConexao, testarConexao } = require('../db');
const { createSystemBackup, ensureBackupDirectory, restoreSystemBackup } = require('../utils/backup-service');
const { initializeAutoBackupScheduler } = require('../utils/backup-scheduler');
const { openNativeFolderPicker } = require('../utils/folder-picker');
const { AppError } = require('../utils/errors');
const { mapDatabaseConnectionError } = require('../utils/database-connection-error');
const {
    buildBackupExecutionSettings,
    buildBackupRestoreSettings,
    getBackupSettings,
    getPublicBackupSettings,
    normalizeBackupDirectory,
    saveBackupSettings
} = require('../utils/backup-config');
const {
    getDefaultDatabaseSettings,
    getEffectiveDatabaseSettings,
    getPublicDatabaseSettings,
    normalizeDatabaseSettings,
    saveDatabaseSettings
} = require('../utils/database-config');
const { ensureApplicationSchema, REQUIRED_TABLES } = require('../utils/database-schema');
const { clearSchemaCache } = require('../utils/schema');

const router = express.Router();

router.get('/', async (req, res) => {
    res.json({
        ...getPublicDatabaseSettings(),
        backup: getPublicBackupSettings(),
        requiredTables: [...REQUIRED_TABLES]
    });
});

router.get('/backup', async (req, res) => {
    res.json(getPublicBackupSettings());
});

router.post('/testar', async (req, res, next) => {
    try {
        const payload = normalizeDatabaseSettings(req.body || {}, {
            currentSettings: getEffectiveDatabaseSettings()
        });
        const connection = await testarConexao(payload);

        res.json({
            success: true,
            message: 'Conexao realizada com sucesso.',
            connection
        });
    } catch (error) {
        next(mapDatabaseConnectionError(error, 'Erro ao testar a conexao com o banco informado.'));
    }
});

router.post('/salvar', async (req, res, next) => {
    try {
        const payload = normalizeDatabaseSettings(req.body || {}, {
            currentSettings: getEffectiveDatabaseSettings()
        });
        const connection = await testarConexao(payload);
        const saved = saveDatabaseSettings(payload);

        clearSchemaCache();
        await fecharConexao();

        // Garante tabelas (e o admin inicial, se o banco for novo) ja na
        // gravacao — sem isso, um banco recem-apontado so ganharia as
        // tabelas no proximo reinicio do servidor, e o login falharia.
        let schema = null;
        let adminBootstrap = null;
        let schemaWarning = null;

        try {
            const pool = await conectar();
            schema = await ensureApplicationSchema(pool);
            adminBootstrap = schema.bootstrappedAdmin;
        } catch (schemaError) {
            schemaWarning = `Conexao salva, mas a verificacao das tabelas falhou: ${schemaError.message || schemaError}`;
        }

        res.json({
            success: true,
            message: schemaWarning || 'Configuracao do banco salva com sucesso.',
            connection,
            configuracao: getPublicDatabaseSettings(),
            savedAt: new Date().toISOString(),
            updatedFields: {
                host: saved.host,
                database: saved.database,
                authenticationType: saved.authenticationType
            },
            createdTables: schema ? schema.createdTables : [],
            adminBootstrap,
            schemaWarning
        });
    } catch (error) {
        next(mapDatabaseConnectionError(error, 'Erro ao salvar a configuracao do banco.'));
    }
});

router.post('/verificar-tabelas', async (req, res, next) => {
    try {
        const effectiveSettings = getEffectiveDatabaseSettings();
        normalizeDatabaseSettings(effectiveSettings, {
            currentSettings: getDefaultDatabaseSettings()
        });

        const pool = await conectar();
        const result = await ensureApplicationSchema(pool);

        res.json({
            success: true,
            message: result.createdTables.length > 0
                ? 'Conexao realizada com sucesso e tabelas verificadas/criadas.'
                : 'Conexao realizada com sucesso. Todas as tabelas ja existem.',
            ...result
        });
    } catch (error) {
        next(mapDatabaseConnectionError(error, 'Erro ao verificar ou criar as tabelas da aplicacao.'));
    }
});

router.post('/backup/salvar', async (req, res, next) => {
    try {
        const currentSettings = getBackupSettings();
        const requestedSettings = {
            ...currentSettings,
            ...req.body
        };
        const directory = normalizeBackupDirectory(requestedSettings.directory || currentSettings.directory);
        const writableDirectory = await ensureBackupDirectory(directory);
        const saved = saveBackupSettings({
            ...requestedSettings,
            directory: writableDirectory
        });
        const scheduler = initializeAutoBackupScheduler();

        res.json({
            success: true,
            message: 'Configuracao de backup salva com sucesso.',
            backup: getPublicBackupSettings(),
            savedDirectory: saved.directory,
            scheduler
        });
    } catch (error) {
        next(error instanceof AppError ? error : new AppError(500, 'Erro ao salvar a configuracao de backup.'));
    }
});

router.post('/backup/selecionar-pasta', async (req, res, next) => {
    try {
        const currentSettings = getBackupSettings();
        const pickerResult = await openNativeFolderPicker({
            initialDirectory: req.body?.directory || currentSettings.directory || ''
        });

        res.json({
            success: true,
            canceled: pickerResult.canceled,
            directory: pickerResult.directory
        });
    } catch (error) {
        next(error instanceof AppError ? error : new AppError(500, 'Erro ao abrir a selecao de pasta de backup.'));
    }
});

router.post('/backup/gerar', async (req, res, next) => {
    try {
        const currentSettings = getBackupSettings();
        const requestedDirectory = req.body?.directory || currentSettings.directory;
        const directory = normalizeBackupDirectory(requestedDirectory);
        const writableDirectory = await ensureBackupDirectory(directory);
        const pool = await conectar();
        const databaseSettings = getPublicDatabaseSettings();
        const result = await createSystemBackup(pool, {
            directory: writableDirectory,
            generatedBy: 'manual',
            databaseInfo: {
                host: databaseSettings.host,
                instanceName: databaseSettings.instanceName,
                database: databaseSettings.database,
                source: databaseSettings.source
            }
        });

        saveBackupSettings(buildBackupExecutionSettings({
            ...currentSettings,
            directory: writableDirectory
        }, result, {
            trigger: 'manual'
        }));

        res.json({
            success: true,
            message: 'Backup gerado com sucesso.',
            backup: getPublicBackupSettings(),
            result
        });
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
            return;
        }

        next(mapDatabaseConnectionError(error, 'Erro ao gerar o backup do banco de dados.'));
    }
});

router.post('/backup/restaurar', async (req, res, next) => {
    try {
        const backupData = req.body?.backupData ?? req.body;
        const currentSettings = getBackupSettings();
        const pool = await conectar();

        await ensureApplicationSchema(pool);

        // Rede de seguranca: antes de sobrescrever tudo, tenta salvar um backup
        // do estado ATUAL. Se a restauracao trouxer dados errados, o usuario
        // tem como voltar. E best-effort — se nao der para gravar (pasta
        // invalida, etc.), a restauracao segue mesmo assim, ja que o usuario
        // confirmou a substituicao; a resposta avisa que a rede falhou.
        let safetyBackup = null;
        let safetyBackupError = null;

        try {
            const safetyDirectory = await ensureBackupDirectory(currentSettings.directory);
            const databaseSettings = getPublicDatabaseSettings();
            safetyBackup = await createSystemBackup(pool, {
                directory: safetyDirectory,
                generatedBy: 'pre-restauracao',
                databaseInfo: {
                    host: databaseSettings.host,
                    instanceName: databaseSettings.instanceName,
                    database: databaseSettings.database,
                    source: databaseSettings.source
                }
            });
        } catch (error) {
            safetyBackupError = error instanceof AppError
                ? error.message
                : 'Nao foi possivel gerar o backup de seguranca antes de restaurar.';
        }

        const result = await restoreSystemBackup(pool, backupData, {
            fileName: req.body?.fileName || ''
        });

        saveBackupSettings(buildBackupRestoreSettings(currentSettings, result, {
            fileName: req.body?.fileName || ''
        }));

        res.json({
            success: true,
            message: safetyBackup
                ? 'Backup importado com sucesso. Um backup de seguranca do estado anterior foi salvo.'
                : 'Backup importado com sucesso.',
            backup: getPublicBackupSettings(),
            result,
            safetyBackup: safetyBackup
                ? { fileName: safetyBackup.fileName, filePath: safetyBackup.filePath }
                : null,
            safetyBackupError,
            preferences: result.preferences || {}
        });
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
            return;
        }

        next(mapDatabaseConnectionError(error, 'Erro ao importar o backup do banco de dados.'));
    }
});

module.exports = router;

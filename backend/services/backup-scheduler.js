const { conectar } = require('../db');
const {
    buildBackupExecutionSettings,
    getBackupSettings,
    saveBackupSettings
} = require('./backup-config');
const { getPublicDatabaseSettings } = require('../db/database-config');
const { AppError } = require('../lib/errors');
const { createSystemBackup } = require('./backup-service');
const { aplicarRetencao } = require('./backup/retencao');

let autoBackupTimer = null;
let autoBackupRunning = false;

function clearAutoBackupScheduler() {
    if (autoBackupTimer) {
        clearInterval(autoBackupTimer);
        autoBackupTimer = null;
    }
}

async function executeAutomaticBackup(trigger = 'auto-schedule', options = {}) {
    if (autoBackupRunning) {
        return {
            success: false,
            skipped: true,
            reason: 'already_running'
        };
    }

    const settings = getBackupSettings();

    // Gatilho desligado e checado ANTES de exigir a pasta: sem isso todo
    // desligamento do servidor sem pasta configurada registrava um erro, mesmo
    // com o backup de desligamento desativado.
    if (trigger === 'auto-schedule' && !settings.autoBackupEnabled && !options.force) {
        return {
            success: false,
            skipped: true,
            reason: 'auto_backup_disabled'
        };
    }

    if (trigger === 'auto-shutdown' && !settings.autoBackupOnShutdown && !options.force) {
        return {
            success: false,
            skipped: true,
            reason: 'shutdown_backup_disabled'
        };
    }

    if (!settings.directory) {
        throw new AppError(400, 'Configure uma pasta de backup antes de usar o backup automatico.');
    }

    autoBackupRunning = true;

    try {
        const pool = await conectar();
        const databaseSettings = getPublicDatabaseSettings();
        const result = await createSystemBackup(pool, {
            directory: settings.directory,
            generatedBy: trigger,
            automatico: true,
            databaseInfo: {
                host: databaseSettings.host,
                instanceName: databaseSettings.instanceName,
                database: databaseSettings.database,
                source: databaseSettings.source
            }
        });

        saveBackupSettings(buildBackupExecutionSettings(settings, result, { trigger }));

        const retencao = await limparBackupsAntigos(settings);

        return {
            success: true,
            trigger,
            ...result,
            retencao
        };
    } finally {
        autoBackupRunning = false;
    }
}

// O backup ja foi gravado: um problema na limpeza vira log, nunca falha do backup.
async function limparBackupsAntigos(settings) {
    if (!(settings.autoBackupRetencao > 0)) {
        return null;
    }

    try {
        const resultado = await aplicarRetencao(settings.directory, settings.autoBackupRetencao);

        if (resultado.removidos.length) {
            console.log(`Retencao de backups: ${resultado.removidos.length} backup(s) automatico(s) antigo(s) removido(s).`);
        }

        resultado.falhas.forEach((falha) => {
            console.error(`Retencao de backups: nao foi possivel apagar ${falha.nome} (${falha.erro}).`);
        });

        return resultado;
    } catch (error) {
        console.error('Retencao de backups: falha ao listar a pasta:', error.message);
        return null;
    }
}

function initializeAutoBackupScheduler() {
    clearAutoBackupScheduler();

    const settings = getBackupSettings();

    if (!settings.autoBackupEnabled || !settings.directory) {
        return {
            scheduled: false,
            intervalMinutes: settings.autoBackupIntervalMinutes || 0
        };
    }

    const intervalMinutes = Number(settings.autoBackupIntervalMinutes) || 180;
    autoBackupTimer = setInterval(() => {
        executeAutomaticBackup('auto-schedule').catch((error) => {
            console.error('Erro no backup automatico agendado:', error.message);
        });
    }, intervalMinutes * 60 * 1000);

    if (typeof autoBackupTimer.unref === 'function') {
        autoBackupTimer.unref();
    }

    return {
        scheduled: true,
        intervalMinutes
    };
}

module.exports = {
    clearAutoBackupScheduler,
    executeAutomaticBackup,
    initializeAutoBackupScheduler
};

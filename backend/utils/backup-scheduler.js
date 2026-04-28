const { conectar } = require('../db');
const {
    buildBackupExecutionSettings,
    getBackupSettings,
    saveBackupSettings
} = require('./backup-config');
const { getPublicDatabaseSettings } = require('./database-config');
const { AppError } = require('./errors');
const { createSystemBackup } = require('./backup-service');

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

    if (!settings.directory) {
        throw new AppError(400, 'Configure uma pasta de backup antes de usar o backup automatico.');
    }

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

    autoBackupRunning = true;

    try {
        const pool = await conectar();
        const databaseSettings = getPublicDatabaseSettings();
        const result = await createSystemBackup(pool, {
            directory: settings.directory,
            generatedBy: trigger,
            databaseInfo: {
                host: databaseSettings.host,
                instanceName: databaseSettings.instanceName,
                database: databaseSettings.database,
                source: databaseSettings.source
            }
        });

        saveBackupSettings(buildBackupExecutionSettings(settings, result, { trigger }));

        return {
            success: true,
            trigger,
            ...result
        };
    } finally {
        autoBackupRunning = false;
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

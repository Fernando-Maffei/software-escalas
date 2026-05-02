const fs = require('fs');
const path = require('path');

const { AppError } = require('./errors');
const { ensureDataDirectory, resolveDataPath } = require('./app-paths');

const CONFIG_PATH = resolveDataPath('backup.local.json');

function normalizeTrimmedString(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
}

function stripWrappingQuotes(value) {
    const normalized = normalizeTrimmedString(value);

    if (
        (normalized.startsWith('"') && normalized.endsWith('"'))
        || (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
        return normalized.slice(1, -1).trim();
    }

    return normalized;
}

function normalizeBackupDirectory(value) {
    const normalized = path.normalize(stripWrappingQuotes(value));

    if (!normalized) {
        throw new AppError(400, 'Informe a pasta onde os backups devem ser salvos.');
    }

    if (!path.isAbsolute(normalized)) {
        throw new AppError(400, 'Informe o caminho absoluto da pasta de backup.');
    }

    return normalized;
}

function normalizeTableCounts(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, amount]) => {
            const parsed = Number(amount);
            return [String(key), Number.isFinite(parsed) && parsed >= 0 ? parsed : 0];
        })
    );
}

function normalizeBackupBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        if (value === 1) {
            return true;
        }

        if (value === 0) {
            return false;
        }
    }

    const normalized = String(value).trim().toLowerCase();

    if (['true', '1', 'sim', 'yes'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'nao', 'no'].includes(normalized)) {
        return false;
    }

    throw new AppError(400, 'Valor booleano invalido na configuracao de backup.');
}

function normalizeAutoBackupIntervalMinutes(value, fallback = 180) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
    }

    const parsed = Number.parseInt(String(value).trim(), 10);

    if (!Number.isInteger(parsed) || parsed < 15) {
        throw new AppError(400, 'O intervalo do backup automatico deve ser de pelo menos 15 minutos.');
    }

    if (parsed > 7 * 24 * 60) {
        throw new AppError(400, 'O intervalo do backup automatico nao pode passar de 7 dias.');
    }

    return parsed;
}

function getDefaultBackupSettings() {
    return {
        directory: '',
        autoBackupEnabled: false,
        autoBackupIntervalMinutes: 180,
        autoBackupOnShutdown: false,
        lastBackupAt: null,
        lastBackupFile: '',
        lastBackupPath: '',
        lastBackupTotalRows: 0,
        lastBackupTableCounts: {},
        lastBackupTrigger: 'manual',
        lastRestoreAt: null,
        lastRestoreFile: ''
    };
}

function readConfigFile() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        throw new AppError(
            500,
            'O arquivo local de configuracao de backup esta invalido. Revise o JSON salvo para este aplicativo.',
            { configPath: CONFIG_PATH }
        );
    }
}

function coerceBackupSettings(input = {}) {
    const defaults = getDefaultBackupSettings();

    return {
        directory: normalizeTrimmedString(input.directory) ? path.normalize(stripWrappingQuotes(input.directory)) : defaults.directory,
        autoBackupEnabled: normalizeBackupBoolean(input.autoBackupEnabled, defaults.autoBackupEnabled),
        autoBackupIntervalMinutes: normalizeAutoBackupIntervalMinutes(
            input.autoBackupIntervalMinutes,
            defaults.autoBackupIntervalMinutes
        ),
        autoBackupOnShutdown: normalizeBackupBoolean(input.autoBackupOnShutdown, defaults.autoBackupOnShutdown),
        lastBackupAt: normalizeTrimmedString(input.lastBackupAt) || defaults.lastBackupAt,
        lastBackupFile: normalizeTrimmedString(input.lastBackupFile) || defaults.lastBackupFile,
        lastBackupPath: normalizeTrimmedString(input.lastBackupPath) ? path.normalize(stripWrappingQuotes(input.lastBackupPath)) : defaults.lastBackupPath,
        lastBackupTotalRows: Number.isFinite(Number(input.lastBackupTotalRows)) ? Number(input.lastBackupTotalRows) : defaults.lastBackupTotalRows,
        lastBackupTableCounts: normalizeTableCounts(input.lastBackupTableCounts),
        lastBackupTrigger: normalizeTrimmedString(input.lastBackupTrigger) || defaults.lastBackupTrigger,
        lastRestoreAt: normalizeTrimmedString(input.lastRestoreAt) || defaults.lastRestoreAt,
        lastRestoreFile: normalizeTrimmedString(input.lastRestoreFile) || defaults.lastRestoreFile
    };
}

function buildBackupExecutionSettings(currentSettings, result, options = {}) {
    return {
        ...coerceBackupSettings(currentSettings),
        lastBackupAt: result.generatedAt,
        lastBackupFile: result.fileName,
        lastBackupPath: result.filePath,
        lastBackupTotalRows: result.totalRows,
        lastBackupTableCounts: normalizeTableCounts(result.tableCounts),
        lastBackupTrigger: normalizeTrimmedString(options.trigger) || 'manual'
    };
}

function buildBackupRestoreSettings(currentSettings, result, options = {}) {
    return {
        ...coerceBackupSettings(currentSettings),
        lastRestoreAt: result.restoredAt,
        lastRestoreFile: normalizeTrimmedString(options.fileName || result.fileName)
    };
}

function getBackupSettingsWithSource() {
    const savedConfig = readConfigFile();

    if (!savedConfig) {
        return {
            source: 'defaults',
            settings: getDefaultBackupSettings()
        };
    }

    return {
        source: 'file',
        settings: coerceBackupSettings(savedConfig)
    };
}

function getBackupSettings() {
    return getBackupSettingsWithSource().settings;
}

function saveBackupSettings(settings) {
    const normalized = coerceBackupSettings(settings);

    ensureDataDirectory();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}

function getPublicBackupSettings() {
    const resolved = getBackupSettingsWithSource();

    return {
        source: resolved.source,
        configPath: CONFIG_PATH,
        hasConfiguredDirectory: Boolean(resolved.settings.directory),
        ...resolved.settings
    };
}

module.exports = {
    CONFIG_PATH,
    getBackupSettings,
    getBackupSettingsWithSource,
    getDefaultBackupSettings,
    getPublicBackupSettings,
    buildBackupExecutionSettings,
    buildBackupRestoreSettings,
    normalizeAutoBackupIntervalMinutes,
    normalizeBackupDirectory,
    saveBackupSettings
};

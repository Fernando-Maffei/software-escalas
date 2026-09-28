const fs = require('fs');
const path = require('path');

const { AppError } = require('../lib/errors');
const { normalizeBoolean } = require('../lib/validation');
const { ensureDataDirectory, resolveDataPath } = require('../lib/app-paths');
const { RETENCAO_MAXIMA } = require('./backup/retencao');

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

// Quantos backups automaticos manter na pasta (0 = todos). Ver backup/retencao.js.
function normalizeAutoBackupRetencao(value, fallback = 0) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
    }

    const parsed = Number(String(value).trim());

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > RETENCAO_MAXIMA) {
        throw new AppError(400, `Informe quantos backups automaticos manter: um numero inteiro de 0 (todos) a ${RETENCAO_MAXIMA}.`);
    }

    return parsed;
}

function getDefaultBackupSettings() {
    return {
        directory: '',
        autoBackupEnabled: false,
        autoBackupIntervalMinutes: 180,
        autoBackupOnShutdown: false,
        autoBackupRetencao: 0,
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
        autoBackupEnabled: normalizeBoolean(input.autoBackupEnabled, 'Backup automatico', {
            defaultValue: defaults.autoBackupEnabled
        }),
        autoBackupIntervalMinutes: normalizeAutoBackupIntervalMinutes(
            input.autoBackupIntervalMinutes,
            defaults.autoBackupIntervalMinutes
        ),
        autoBackupOnShutdown: normalizeBoolean(input.autoBackupOnShutdown, 'Backup ao desligar', {
            defaultValue: defaults.autoBackupOnShutdown
        }),
        autoBackupRetencao: normalizeAutoBackupRetencao(input.autoBackupRetencao, defaults.autoBackupRetencao),
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
    normalizeAutoBackupRetencao,
    normalizeBackupDirectory,
    saveBackupSettings
};

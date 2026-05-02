const path = require('path');

const DEPLOYMENT_MODES = Object.freeze({
    STANDALONE: 'standalone',
    SERVER: 'server',
    CLIENT: 'client'
});

const DEFAULT_SERVER_PORT = 3000;

function normalizeTrimmedString(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
}

function normalizeMode(value) {
    const normalized = normalizeTrimmedString(value).toLowerCase();

    if (Object.values(DEPLOYMENT_MODES).includes(normalized)) {
        return normalized;
    }

    return DEPLOYMENT_MODES.STANDALONE;
}

function normalizePort(value, fallback = DEFAULT_SERVER_PORT) {
    const normalized = normalizeTrimmedString(value);

    if (!normalized) {
        return fallback;
    }

    const parsed = Number.parseInt(normalized, 10);

    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
        return parsed;
    }

    return fallback;
}

function buildDefaultLocalDataDirectory(systemDrive = process.env.SystemDrive || 'C:') {
    return path.resolve(path.join(systemDrive, 'App de Escalas', 'dados'));
}

function normalizeDirectoryPath(value) {
    const normalized = normalizeTrimmedString(value);

    if (!normalized) {
        return '';
    }

    return path.resolve(normalized);
}

function normalizeServerUrl(value) {
    const normalized = normalizeTrimmedString(value);

    if (!normalized) {
        return '';
    }

    const withProtocol = /^https?:\/\//i.test(normalized)
        ? normalized
        : `http://${normalized}`;
    const parsedUrl = new URL(withProtocol);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
    const basePath = normalizedPath === '/' || normalizedPath === '/api'
        ? ''
        : normalizedPath;

    return `${parsedUrl.origin}${basePath}`;
}

function normalizeLauncherConfig(input = {}, options = {}) {
    const mode = normalizeMode(input.mode);
    const defaultLocalDataDirectory = options.defaultLocalDataDirectory || buildDefaultLocalDataDirectory(options.systemDrive);
    const dataDirectory = mode === DEPLOYMENT_MODES.CLIENT
        ? ''
        : normalizeDirectoryPath(input.dataDirectory || input.sharedDataDirectory || defaultLocalDataDirectory);
    const serverUrl = mode === DEPLOYMENT_MODES.CLIENT
        ? normalizeServerUrl(input.serverUrl || input.remoteServerUrl)
        : '';
    const serverPort = mode === DEPLOYMENT_MODES.SERVER
        ? normalizePort(input.serverPort, DEFAULT_SERVER_PORT)
        : DEFAULT_SERVER_PORT;

    const normalized = {
        mode,
        dataDirectory,
        serverUrl,
        serverPort,
        lastRunVersion: normalizeTrimmedString(input.lastRunVersion),
        lastSuccessfulLaunchAt: normalizeTrimmedString(input.lastSuccessfulLaunchAt)
    };

    if (!options.allowIncomplete) {
        if (mode === DEPLOYMENT_MODES.CLIENT && !normalized.serverUrl) {
            throw new Error('Informe o endereco do servidor para o modo cliente.');
        }

        if (mode !== DEPLOYMENT_MODES.CLIENT && !normalized.dataDirectory) {
            throw new Error('Informe a pasta de dados para esta instalacao.');
        }
    }

    return normalized;
}

module.exports = {
    DEFAULT_SERVER_PORT,
    DEPLOYMENT_MODES,
    buildDefaultLocalDataDirectory,
    normalizeLauncherConfig,
    normalizePort,
    normalizeServerUrl,
    normalizeTrimmedString
};

const fs = require('fs');

const { AppError } = require('./errors');
const { ensureDataDirectory, resolveDataPath } = require('./app-paths');

const CONFIG_PATH = resolveDataPath('database.local.json');
const AUTHENTICATION_TYPES = Object.freeze({
    SQL: 'sql',
    WINDOWS: 'windows'
});

function normalizeTrimmedString(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
}

function splitServerAndInstance(value) {
    const normalized = normalizeTrimmedString(value);

    if (!normalized.includes('\\')) {
        return {
            host: normalized,
            instanceName: ''
        };
    }

    const [host, ...rest] = normalized.split('\\');
    return {
        host: normalizeTrimmedString(host),
        instanceName: normalizeTrimmedString(rest.join('\\'))
    };
}

function normalizePort(value) {
    const normalized = normalizeTrimmedString(value);

    if (!normalized) {
        return null;
    }

    const parsed = Number.parseInt(normalized, 10);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new AppError(400, 'A porta do SQL Server deve estar entre 1 e 65535.');
    }

    return parsed;
}

function normalizeBoolean(value, defaultValue) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value).trim().toLowerCase();

    if (['true', '1', 'sim', 'yes'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) {
        return false;
    }

    throw new AppError(400, 'Valor booleano invalido na configuracao do banco.');
}

function normalizeAuthenticationType(value, fallback = AUTHENTICATION_TYPES.SQL) {
    const normalized = normalizeTrimmedString(value).toLowerCase() || fallback;

    if (!Object.values(AUTHENTICATION_TYPES).includes(normalized)) {
        throw new AppError(400, 'Tipo de autenticacao invalido.');
    }

    return normalized;
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
            'O arquivo local de configuracao do banco esta invalido. Revise o JSON salvo para este aplicativo.',
            { configPath: CONFIG_PATH }
        );
    }
}

function getEnvironmentDatabaseSettings() {
    const serverValue = process.env.DB_HOST || process.env.DB_SERVER || '';
    const serverParts = splitServerAndInstance(serverValue);

    return {
        host: serverParts.host,
        port: normalizePort(process.env.DB_PORT || ''),
        instanceName: normalizeTrimmedString(process.env.DB_INSTANCE) || serverParts.instanceName,
        database: normalizeTrimmedString(process.env.DB_DATABASE),
        user: normalizeTrimmedString(process.env.DB_USER),
        password: normalizeTrimmedString(process.env.DB_PASSWORD),
        authenticationType: normalizeAuthenticationType(process.env.DB_AUTH_TYPE, AUTHENTICATION_TYPES.SQL),
        encrypt: normalizeBoolean(process.env.DB_ENCRYPT, true),
        trustServerCertificate: normalizeBoolean(process.env.DB_TRUST_CERT, true)
    };
}

function getDefaultDatabaseSettings() {
    return {
        host: '',
        port: null,
        instanceName: '',
        database: 'SoftwareEscalas',
        user: '',
        password: '',
        authenticationType: AUTHENTICATION_TYPES.SQL,
        encrypt: true,
        trustServerCertificate: true
    };
}

function hasAnyConfiguredValue(settings) {
    return Boolean(
        settings
        && (
            settings.host
            || settings.instanceName
            || settings.database
            || settings.user
            || settings.password
        )
    );
}

function hasUsableConnectionSettings(settings) {
    if (!settings) {
        return false;
    }

    if (!settings.host || !settings.database) {
        return false;
    }

    if (settings.authenticationType === AUTHENTICATION_TYPES.SQL) {
        return Boolean(settings.user);
    }

    return false;
}

function normalizeDatabaseSettings(input, options = {}) {
    const currentSettings = options.currentSettings || getDefaultDatabaseSettings();
    const preservePassword = Boolean(input?.preservePassword);
    const hasOwn = (fieldName) => Boolean(input) && Object.prototype.hasOwnProperty.call(input, fieldName);
    const authType = normalizeAuthenticationType(
        input?.authenticationType !== undefined ? input.authenticationType : currentSettings.authenticationType
    );
    const incomingServer = hasOwn('host')
        ? input.host
        : (hasOwn('server') ? input.server : currentSettings.host);
    const serverParts = splitServerAndInstance(incomingServer);
    const explicitInstance = hasOwn('instanceName')
        ? input.instanceName
        : (hasOwn('instance') ? input.instance : currentSettings.instanceName);
    const host = hasOwn('host') || hasOwn('server')
        ? normalizeTrimmedString(serverParts.host)
        : normalizeTrimmedString(currentSettings.host);
    const instanceName = hasOwn('instanceName') || hasOwn('instance')
        ? normalizeTrimmedString(explicitInstance || serverParts.instanceName)
        : normalizeTrimmedString(currentSettings.instanceName || serverParts.instanceName);
    const database = normalizeTrimmedString(
        hasOwn('database') ? input.database : currentSettings.database
    );
    const user = authType === AUTHENTICATION_TYPES.SQL
        ? normalizeTrimmedString(hasOwn('user') ? input.user : currentSettings.user)
        : '';
    let password = authType === AUTHENTICATION_TYPES.SQL
        ? normalizeTrimmedString(input?.password !== undefined ? input.password : '')
        : '';

    if (!password && preservePassword && currentSettings.password) {
        password = currentSettings.password;
    }

    const settings = {
        host,
        port: input?.port !== undefined ? normalizePort(input.port) : currentSettings.port || null,
        instanceName,
        database,
        user,
        password,
        authenticationType: authType,
        encrypt: normalizeBoolean(
            input?.encrypt !== undefined ? input.encrypt : currentSettings.encrypt,
            true
        ),
        trustServerCertificate: normalizeBoolean(
            input?.trustServerCertificate !== undefined
                ? input.trustServerCertificate
                : currentSettings.trustServerCertificate,
            true
        )
    };

    if (!settings.host) {
        throw new AppError(400, 'Informe o servidor ou host do SQL Server.');
    }

    if (!settings.database) {
        throw new AppError(400, 'Informe o nome do banco de dados.');
    }

    if (settings.authenticationType === AUTHENTICATION_TYPES.SQL && !settings.user) {
        throw new AppError(400, 'Informe o usuario para SQL Server Authentication.');
    }

    return settings;
}

function getEffectiveDatabaseSettingsWithSource() {
    const savedConfig = readConfigFile();

    if (savedConfig) {
        return {
            source: 'file',
            settings: normalizeDatabaseSettings(savedConfig, {
                currentSettings: getDefaultDatabaseSettings()
            })
        };
    }

    const envSettings = getEnvironmentDatabaseSettings();

    if (hasAnyConfiguredValue(envSettings)) {
        return {
            source: 'env',
            settings: envSettings
        };
    }

    return {
        source: 'defaults',
        settings: getDefaultDatabaseSettings()
    };
}

function getEffectiveDatabaseSettings() {
    return getEffectiveDatabaseSettingsWithSource().settings;
}

function saveDatabaseSettings(settings) {
    const normalized = normalizeDatabaseSettings(settings, {
        currentSettings: getDefaultDatabaseSettings()
    });

    ensureDataDirectory();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}

function maskDatabaseSettings(settings) {
    return {
        host: settings.host,
        port: settings.port,
        instanceName: settings.instanceName,
        database: settings.database,
        user: settings.user,
        authenticationType: settings.authenticationType,
        encrypt: settings.encrypt,
        trustServerCertificate: settings.trustServerCertificate,
        hasPasswordSaved: Boolean(settings.password),
        passwordMasked: settings.password ? '********' : ''
    };
}

function getPublicDatabaseSettings() {
    const resolved = getEffectiveDatabaseSettingsWithSource();
    return {
        source: resolved.source,
        hasConfiguredConnection: hasUsableConnectionSettings(resolved.settings),
        windowsAuthenticationAvailable: false,
        configPath: CONFIG_PATH,
        ...maskDatabaseSettings(resolved.settings)
    };
}

function getDatabaseSettingsFingerprint(settings) {
    return JSON.stringify({
        host: settings.host,
        port: settings.port,
        instanceName: settings.instanceName,
        database: settings.database,
        user: settings.user,
        password: settings.password,
        authenticationType: settings.authenticationType,
        encrypt: settings.encrypt,
        trustServerCertificate: settings.trustServerCertificate
    });
}

function buildMssqlConfig(settings) {
    const normalized = normalizeDatabaseSettings(settings, {
        currentSettings: getDefaultDatabaseSettings()
    });

    if (normalized.authenticationType === AUTHENTICATION_TYPES.WINDOWS) {
        throw new AppError(
            501,
            'Windows Authentication ainda nao esta disponivel nesta instalacao. Use SQL Server Authentication nesta versao do projeto.'
        );
    }

    const config = {
        user: normalized.user,
        password: normalized.password,
        server: normalized.host,
        database: normalized.database,
        options: {
            encrypt: normalized.encrypt,
            trustServerCertificate: normalized.trustServerCertificate
        }
    };

    if (normalized.port) {
        config.port = normalized.port;
    }

    if (normalized.instanceName) {
        config.options.instanceName = normalized.instanceName;
    }

    return config;
}

module.exports = {
    AUTHENTICATION_TYPES,
    CONFIG_PATH,
    buildMssqlConfig,
    getDatabaseSettingsFingerprint,
    getDefaultDatabaseSettings,
    getEffectiveDatabaseSettings,
    getEffectiveDatabaseSettingsWithSource,
    getPublicDatabaseSettings,
    hasUsableConnectionSettings,
    maskDatabaseSettings,
    normalizeDatabaseSettings,
    saveDatabaseSettings
};

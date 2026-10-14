const fs = require('fs');
const path = require('path');

const CUSTOM_DATA_DIR_ENV = 'APP_DE_ESCALAS_DATA_DIR';
const LEGACY_CONFIG_DIR = path.join(__dirname, '..', 'config');

function getCustomDataDir() {
    const rawValue = process.env[CUSTOM_DATA_DIR_ENV];

    if (!rawValue || !String(rawValue).trim()) {
        return '';
    }

    return path.resolve(String(rawValue).trim());
}

function getDataDirectory() {
    return getCustomDataDir() || LEGACY_CONFIG_DIR;
}

function ensureDataDirectory() {
    const dataDirectory = getDataDirectory();
    fs.mkdirSync(dataDirectory, { recursive: true });
    return dataDirectory;
}

function resolveDataPath(fileName) {
    return path.join(getDataDirectory(), fileName);
}

module.exports = {
    CUSTOM_DATA_DIR_ENV,
    LEGACY_CONFIG_DIR,
    ensureDataDirectory,
    getDataDirectory,
    resolveDataPath
};

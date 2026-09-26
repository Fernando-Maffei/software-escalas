// Enderecos pelos quais o servidor e alcancado na rede (log de inicio e tela
// de rede) e a porta padrao.
const os = require('os');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 4450;

function getServerAccessUrls(host, port, options = {}) {
    const urls = new Set();
    const includeNetworkUrls = options.includeNetworkUrls !== false;

    if (host === '127.0.0.1' || host === 'localhost') {
        urls.add(`http://127.0.0.1:${port}`);
        urls.add(`http://localhost:${port}`);
        return [...urls];
    }

    if (host !== DEFAULT_HOST && host !== '::') {
        urls.add(`http://${host}:${port}`);
        return [...urls];
    }

    urls.add(`http://localhost:${port}`);

    const machineName = os.hostname();
    if (machineName) {
        urls.add(`http://${machineName}:${port}`);
    }

    if (!includeNetworkUrls) {
        return [...urls];
    }

    const networkInterfaces = os.networkInterfaces();

    Object.values(networkInterfaces).forEach((interfaceGroup) => {
        (interfaceGroup || []).forEach((networkInterface) => {
            if (!networkInterface || networkInterface.internal) {
                return;
            }

            if (networkInterface.family !== 'IPv4') {
                return;
            }

            urls.add(`http://${networkInterface.address}:${port}`);
        });
    });

    return [...urls];
}

function normalizePort(value) {
    const parsed = Number(value);

    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
        return parsed;
    }

    return DEFAULT_PORT;
}

module.exports = {
    DEFAULT_HOST,
    DEFAULT_PORT,
    getServerAccessUrls,
    normalizePort
};

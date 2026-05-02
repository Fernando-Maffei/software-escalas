const assert = require('node:assert/strict');

const {
    DEPLOYMENT_MODES,
    buildDefaultLocalDataDirectory,
    normalizeLauncherConfig,
    normalizeServerUrl
} = require('../electron/launcher-config');

module.exports = [
    {
        name: 'normalizeServerUrl adds http protocol when only the host is informed',
        run() {
            assert.equal(normalizeServerUrl('192.168.0.15:3000'), 'http://192.168.0.15:3000');
        }
    },
    {
        name: 'normalizeServerUrl strips trailing api path',
        run() {
            assert.equal(normalizeServerUrl('http://servidor.local:3000/api'), 'http://servidor.local:3000');
        }
    },
    {
        name: 'normalizeLauncherConfig defaults to standalone mode with a local folder',
        run() {
            const config = normalizeLauncherConfig({}, {
                allowIncomplete: true,
                defaultLocalDataDirectory: buildDefaultLocalDataDirectory('C:')
            });

            assert.equal(config.mode, DEPLOYMENT_MODES.STANDALONE);
            assert.match(config.dataDirectory, /App de Escalas/i);
        }
    },
    {
        name: 'normalizeLauncherConfig requires server url in client mode',
        run() {
            assert.throws(() => normalizeLauncherConfig({
                mode: DEPLOYMENT_MODES.CLIENT
            }), /servidor/i);
        }
    },
    {
        name: 'normalizeLauncherConfig keeps a fixed port for network server mode',
        run() {
            const config = normalizeLauncherConfig({
                mode: DEPLOYMENT_MODES.SERVER,
                dataDirectory: 'C:\\App de Escalas\\dados',
                serverPort: '3210'
            });

            assert.equal(config.mode, DEPLOYMENT_MODES.SERVER);
            assert.equal(config.serverPort, 3210);
        }
    }
];

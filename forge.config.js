const path = require('path');

const appIconBasePath = path.join(__dirname, 'electron', 'assets', 'app-icon');

module.exports = {
    packagerConfig: {
        asar: true,
        executableName: 'appdeescalas',
        icon: appIconBasePath,
        ignore: [
            /^\/\.git($|\/)/,
            /^\/\.tmp-/,
            /^\/out($|\/)/,
            /^\/out-locked-/,
            /^\/tmp-server-.*\.log$/,
            /^\/backend\/config\/.*\.json$/
        ]
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            platforms: ['win32'],
            config: {
                authors: 'Fernando Maffei',
                name: 'appdeescalas',
                noMsi: true,
                setupExe: 'AppDeEscalasSetup.exe',
                setupIcon: `${appIconBasePath}.ico`
            }
        }
    ]
};

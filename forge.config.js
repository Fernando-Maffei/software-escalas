const path = require('path');

const appIconBasePath = path.join(__dirname, 'electron', 'assets', 'app-icon');

module.exports = {
    packagerConfig: {
        asar: true,
        executableName: 'appdeescalas',
        icon: appIconBasePath
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

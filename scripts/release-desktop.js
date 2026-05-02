const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const installerOutputPath = path.join(
    projectRoot,
    'out',
    'make',
    'squirrel.windows',
    'x64',
    'AppDeEscalasSetup.exe'
);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isValidSemver(version) {
    return /^\d+\.\d+\.\d+$/.test(String(version || '').trim());
}

function updateProjectVersion(nextVersion) {
    const packageJson = readJson(packageJsonPath);
    const packageLock = readJson(packageLockPath);

    packageJson.version = nextVersion;
    packageLock.version = nextVersion;

    if (packageLock.packages && packageLock.packages['']) {
        packageLock.packages[''].version = nextVersion;
    }

    writeJson(packageJsonPath, packageJson);
    writeJson(packageLockPath, packageLock);
}

function runCommand(command, args) {
    const commandToRun = process.platform === 'win32' ? 'cmd.exe' : command;
    const commandArgs = process.platform === 'win32'
        ? ['/c', command, ...args]
        : args;
    const result = spawnSync(commandToRun, commandArgs, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false
    });

    if (result.error) {
        console.error(`Falha ao executar ${command}: ${result.error.message}`);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function main() {
    const requestedVersion = process.argv[2] ? String(process.argv[2]).trim() : '';
    const currentPackage = readJson(packageJsonPath);
    const currentVersion = currentPackage.version;
    const targetVersion = requestedVersion || currentVersion;

    if (requestedVersion && !isValidSemver(requestedVersion)) {
        console.error('Versao invalida. Use o formato x.y.z, por exemplo: 1.0.1');
        process.exit(1);
    }

    if (requestedVersion && requestedVersion !== currentVersion) {
        console.log(`Atualizando versao do projeto: ${currentVersion} -> ${requestedVersion}`);
        updateProjectVersion(requestedVersion);
    } else {
        console.log(`Mantendo versao atual: ${currentVersion}`);
    }

    console.log('Executando validacoes...');
    runCommand('npm.cmd', ['run', 'smoke']);
    runCommand('npm.cmd', ['test']);

    console.log('Gerando instalador desktop...');
    runCommand('npm.cmd', ['run', 'desktop:make']);

    console.log('');
    console.log(`Versao pronta: ${targetVersion}`);
    console.log(`Instalador gerado em: ${installerOutputPath}`);
}

main();

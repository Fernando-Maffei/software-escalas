const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const forgeOutputBaseDirectory = path.join(projectRoot, 'out', 'make', 'squirrel.windows');
const installersOutputDirectory = path.join(projectRoot, 'out', 'installers');
const supportedArchitectures = Object.freeze(['x64', 'ia32', 'arm64']);
const defaultArchitectures = Object.freeze(['x64', 'ia32', 'arm64']);
const architectureLabels = Object.freeze({
    x64: 'x64',
    ia32: 'x86',
    arm64: 'arm64'
});

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

function parseArguments(argv) {
    let requestedVersion = '';
    let architectures = [...defaultArchitectures];

    argv.forEach((argument) => {
        const normalized = String(argument || '').trim();

        if (!normalized) {
            return;
        }

        if (normalized.startsWith('--archs=')) {
            const rawArchitectures = normalized.slice('--archs='.length);
            architectures = normalizeArchitectures(rawArchitectures.split(','));
            return;
        }

        if (!requestedVersion) {
            requestedVersion = normalized;
        }
    });

    return {
        requestedVersion,
        architectures
    };
}

function normalizeArchitectures(values) {
    const uniqueValues = [...new Set(
        (values || [])
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean)
    )];

    if (uniqueValues.length === 0) {
        return [...defaultArchitectures];
    }

    const invalidArchitectures = uniqueValues.filter((value) => !supportedArchitectures.includes(value));

    if (invalidArchitectures.length > 0) {
        console.error(
            `Arquitetura invalida: ${invalidArchitectures.join(', ')}. `
            + `Use apenas: ${supportedArchitectures.join(', ')}.`
        );
        process.exit(1);
    }

    return uniqueValues;
}

function ensureDirectory(directoryPath) {
    fs.mkdirSync(directoryPath, { recursive: true });
    return directoryPath;
}

function getForgeInstallerPath(arch) {
    return path.join(forgeOutputBaseDirectory, arch, 'AppDeEscalasSetup.exe');
}

function buildInstallerFileName(version, arch) {
    const architectureLabel = architectureLabels[arch] || arch;
    return `AppDeEscalasSetup-${version}-${architectureLabel}.exe`;
}

function copyInstallerArtifact(version, arch) {
    const sourcePath = getForgeInstallerPath(arch);

    if (!fs.existsSync(sourcePath)) {
        console.error(`O instalador da arquitetura ${arch} nao foi encontrado em: ${sourcePath}`);
        process.exit(1);
    }

    ensureDirectory(installersOutputDirectory);
    const fileName = buildInstallerFileName(version, arch);
    const destinationPath = path.join(installersOutputDirectory, fileName);

    fs.copyFileSync(sourcePath, destinationPath);

    return {
        arch,
        fileName,
        sourcePath,
        destinationPath
    };
}

function buildInstallers(version, architectures) {
    const results = [];

    architectures.forEach((arch, index) => {
        console.log('');
        console.log(`[${index + 1}/${architectures.length}] Gerando instalador para ${arch}...`);
        runCommand('npm.cmd', ['run', 'desktop:make', '--', `--arch=${arch}`]);
        results.push(copyInstallerArtifact(version, arch));
    });

    return results;
}

function main() {
    const { requestedVersion, architectures } = parseArguments(process.argv.slice(2));
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

    console.log(`Arquiteturas selecionadas: ${architectures.join(', ')}`);
    console.log('Executando validacoes...');
    runCommand('npm.cmd', ['run', 'smoke']);
    runCommand('npm.cmd', ['test']);

    console.log('Gerando instaladores desktop...');
    const artifacts = buildInstallers(targetVersion, architectures);

    console.log('');
    console.log(`Versao pronta: ${targetVersion}`);
    console.log(`Pasta consolidada dos instaladores: ${installersOutputDirectory}`);
    console.log('Arquivos finais:');

    artifacts.forEach((artifact) => {
        console.log(`- ${artifact.destinationPath}`);
    });
}

main();

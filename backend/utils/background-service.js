const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { AppError } = require('./errors');

const TASK_NAME = 'CentralDeEscalasServidor';
const TASK_LABEL = 'Central de Escalas - Servidor';
const SERVER_ENTRY_POINT = path.join(__dirname, '..', 'server.js');
const DEFAULT_PORT = 4450;

function quoteWindowsArgument(value) {
    return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function runWindowsCommand(command, args) {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        windowsHide: true
    });

    return {
        ok: result.status === 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error?.message || ''
    };
}

function assertAvailable() {
    if (process.platform !== 'win32') {
        throw new AppError(501, 'Recurso disponivel apenas no Windows.');
    }
}

function buildServerTaskCommand() {
    return [
        quoteWindowsArgument(process.execPath),
        quoteWindowsArgument(SERVER_ENTRY_POINT)
    ].join(' ');
}

function buildStatusPayload(extra = {}) {
    const machineName = os.hostname();

    return {
        available: process.platform === 'win32',
        taskName: TASK_NAME,
        label: TASK_LABEL,
        installed: false,
        machineName,
        port: DEFAULT_PORT,
        host: '0.0.0.0',
        recommendedUrl: machineName ? `http://${machineName}:${DEFAULT_PORT}` : `http://localhost:${DEFAULT_PORT}`,
        command: buildServerTaskCommand(),
        ...extra
    };
}

function queryBackgroundServerTask() {
    if (process.platform !== 'win32') {
        return buildStatusPayload({
            available: false,
            message: 'Recurso disponivel apenas no Windows.'
        });
    }

    const result = runWindowsCommand('schtasks.exe', [
        '/Query',
        '/TN',
        TASK_NAME,
        '/FO',
        'LIST',
        '/V'
    ]);

    return buildStatusPayload({
        installed: result.ok,
        rawStatus: result.stdout,
        message: result.ok
            ? 'Servidor em segundo plano configurado.'
            : 'Servidor em segundo plano ainda nao instalado.'
    });
}

function installBackgroundServerTask() {
    assertAvailable();

    const command = buildServerTaskCommand();
    const result = runWindowsCommand('schtasks.exe', [
        '/Create',
        '/TN',
        TASK_NAME,
        '/TR',
        command,
        '/SC',
        'ONLOGON',
        '/RL',
        'LIMITED',
        '/F'
    ]);

    if (!result.ok) {
        throw new AppError(500, result.stderr || result.stdout || result.error || 'Nao foi possivel criar a tarefa em segundo plano.');
    }

    return queryBackgroundServerTask();
}

function uninstallBackgroundServerTask() {
    assertAvailable();
    runWindowsCommand('schtasks.exe', ['/End', '/TN', TASK_NAME]);

    const result = runWindowsCommand('schtasks.exe', [
        '/Delete',
        '/TN',
        TASK_NAME,
        '/F'
    ]);

    if (!result.ok && !/cannot find|nao.*encontr/i.test(`${result.stdout} ${result.stderr}`)) {
        throw new AppError(500, result.stderr || result.stdout || result.error || 'Nao foi possivel remover a tarefa em segundo plano.');
    }

    return queryBackgroundServerTask();
}

function startBackgroundServerTask() {
    assertAvailable();

    const result = runWindowsCommand('schtasks.exe', [
        '/Run',
        '/TN',
        TASK_NAME
    ]);

    if (!result.ok) {
        throw new AppError(500, result.stderr || result.stdout || result.error || 'Nao foi possivel iniciar a tarefa em segundo plano.');
    }

    return queryBackgroundServerTask();
}

function stopBackgroundServerTask() {
    assertAvailable();

    const result = runWindowsCommand('schtasks.exe', [
        '/End',
        '/TN',
        TASK_NAME
    ]);

    if (!result.ok && !/not currently running|nao.*exec/i.test(`${result.stdout} ${result.stderr}`)) {
        throw new AppError(500, result.stderr || result.stdout || result.error || 'Nao foi possivel parar a tarefa em segundo plano.');
    }

    return queryBackgroundServerTask();
}

module.exports = {
    installBackgroundServerTask,
    queryBackgroundServerTask,
    startBackgroundServerTask,
    stopBackgroundServerTask,
    uninstallBackgroundServerTask
};

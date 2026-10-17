// Consulta a tarefa agendada que mantem o servidor no ar. Quem cria a tarefa e
// o instalador (INSTALAR-SERVIDOR.cmd -> scripts/instalar-servidor.ps1), que a
// registra sem limite de tempo e rodando o laco que religa o node se ele cair.
// A tela so mostra o estado: os antigos botoes de instalar/iniciar/parar/remover
// criavam uma tarefa pior com o mesmo nome (limite de 72 h, sem religar) e o
// "parar" derrubava o proprio servidor que mostrava a tela.
const os = require('os');
const { execFile } = require('child_process');

const { normalizePort } = require('./rede');

const TASK_NAME = 'CentralDeEscalasServidor';

// Assincrono: com spawnSync o servidor inteiro parava (nenhuma outra
// requisicao era atendida) enquanto o schtasks rodava. O tempo limite evita que
// um schtasks travado segure a requisicao para sempre.
const TEMPO_LIMITE_COMANDO_MS = 30000;

// Nunca rejeita: devolve ok/stdout/stderr para quem chama decidir. `error` so
// vem preenchido quando o comando nem rodou ate o fim (nao existe, tempo
// esgotado); codigo de saida diferente de zero e so ok = false, como antes.
function runWindowsCommand(command, args) {
    return new Promise((resolve) => {
        execFile(command, args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: TEMPO_LIMITE_COMANDO_MS
        }, (error, stdout, stderr) => {
            const terminouComCodigo = error && typeof error.code === 'number';

            resolve({
                ok: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error && !terminouComCodigo ? error.message : ''
            });
        });
    });
}

function buildStatusPayload(extra = {}) {
    const machineName = os.hostname();
    const port = normalizePort(process.env.PORT || undefined);

    return {
        available: process.platform === 'win32',
        taskName: TASK_NAME,
        installed: false,
        machineName,
        port,
        recommendedUrl: machineName ? `http://${machineName}:${port}` : `http://localhost:${port}`,
        ...extra
    };
}

async function queryBackgroundServerTask() {
    if (process.platform !== 'win32') {
        return buildStatusPayload({ available: false });
    }

    const result = await runWindowsCommand('schtasks.exe', ['/Query', '/TN', TASK_NAME]);

    return buildStatusPayload({ installed: result.ok });
}

module.exports = {
    runWindowsCommand,
    queryBackgroundServerTask
};

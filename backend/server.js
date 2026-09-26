// Sobe e derruba o servidor HTTP. A aplicacao (rotas, middlewares) esta em
// app.js; o bootstrap do banco em lib/bootstrap-banco.js.
const { fecharConexao } = require('./db');
const { clearAutoBackupScheduler, executeAutomaticBackup } = require('./services/backup-scheduler');
const { DEFAULT_HOST, DEFAULT_PORT, getServerAccessUrls, normalizePort } = require('./lib/rede');
const { iniciarBootstrapBanco, pararBootstrapBanco } = require('./lib/bootstrap-banco');
const app = require('./app');

let activeController = null;

function resolveRuntimeOptions(options = {}) {
    return {
        host: options.host || process.env.HOST || DEFAULT_HOST,
        port: normalizePort(options.port ?? process.env.PORT ?? DEFAULT_PORT),
        installSignalHandlers: options.installSignalHandlers !== false,
        logNetworkUrls: options.logNetworkUrls !== false
    };
}

function getControllerPort(controller) {
    const address = controller.server.address();

    if (address && typeof address === 'object') {
        return address.port;
    }

    return controller.requestedPort;
}

function getControllerUrl(controller) {
    const port = getControllerPort(controller);

    if (controller.host === '127.0.0.1' || controller.host === 'localhost') {
        return `http://127.0.0.1:${port}`;
    }

    return `http://localhost:${port}`;
}

function start(options = {}) {
    if (activeController) {
        return activeController;
    }

    const runtimeOptions = resolveRuntimeOptions(options);
    let isShuttingDown = false;
    let readySettled = false;
    let resolveReady;
    let rejectReady;

    const controller = {
        server: null,
        host: runtimeOptions.host,
        requestedPort: runtimeOptions.port,
        ready: null,
        shutdownPromise: null,
        // Lido pela retentativa do bootstrap para parar de reagendar quando o
        // servidor comeca a encerrar.
        encerrando: false,
        get port() {
            return getControllerPort(controller);
        },
        get url() {
            return getControllerUrl(controller);
        },
        shutdown
    };

    controller.ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });

    controller.server = app.listen(runtimeOptions.port, runtimeOptions.host, async () => {
        const urls = getServerAccessUrls(controller.host, controller.port, {
            includeNetworkUrls: runtimeOptions.logNetworkUrls
        });

        console.log('Servidor rodando em:');
        urls.forEach((url) => {
            console.log(`- ${url}`);
        });
        console.log('Rotas disponiveis:');
        console.log('- GET  /api/health');
        console.log('- POST /api/auth/login');
        console.log('- GET  /api/network/status');
        console.log('- GET  /api/colaboradores');
        console.log('- GET  /api/setores');
        console.log('- GET  /api/ausencias');
        console.log('- GET  /api/plantoes');
        console.log('- GET  /api/feriados');
        console.log('- GET  /api/banco-horas/resumo');
        console.log('- GET  /api/escala/dia/:dataISO');
        console.log('- GET  /api/jornada-semanal');
        console.log('- GET  /api/configuracao-banco');

        app.set('servidor', { host: controller.host, port: controller.port, url: controller.url });
        await iniciarBootstrapBanco(() => Boolean(activeController) && !activeController.encerrando);

        if (!readySettled) {
            readySettled = true;
            resolveReady({
                host: controller.host,
                port: controller.port,
                url: controller.url,
                urls
            });
        }
    });

    controller.server.once('error', (error) => {
        activeController = null;

        if (error.code === 'EADDRINUSE') {
            console.error(`A porta ${runtimeOptions.port} ja esta em uso. Feche o outro servidor ou escolha outra porta.`);
        }

        if (!readySettled) {
            readySettled = true;
            rejectReady(error);
        }
    });

    if (runtimeOptions.installSignalHandlers) {
        ['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach((signal) => {
            process.once(signal, () => {
                shutdown(signal, { exitProcess: true }).catch((error) => {
                    console.error(`Erro ao encerrar o servidor com ${signal}:`);
                    console.error(error.message);
                    process.exit(1);
                });
            });
        });
    }

    activeController = controller;
    return controller;

    async function shutdown(reason = 'manual', shutdownOptions = {}) {
        if (isShuttingDown) {
            return controller.shutdownPromise;
        }

        isShuttingDown = true;
        // Sinaliza para a retentativa do bootstrap parar de reagendar; sem
        // isto um retry pendente poderia reabrir a conexao durante o encerramento.
        controller.encerrando = true;
        pararBootstrapBanco();
        clearAutoBackupScheduler();
        console.log(`${reason} recebido. Encerrando servidor...`);

        controller.shutdownPromise = new Promise((resolve, reject) => {
            (async () => {
                try {
                    const backupResult = await executeAutomaticBackup('auto-shutdown');

                    if (backupResult && 'fileName' in backupResult) {
                        console.log(`Backup automatico de encerramento gerado: ${backupResult.fileName}`);
                    }
                } catch (error) {
                    console.error('Falha ao gerar backup automatico antes do encerramento.');
                    console.error(error.message);
                }

                let timeoutId = null;

                const finalize = async (exitCode, error = null) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }

                    await fecharConexao();
                    activeController = null;

                    if (shutdownOptions.exitProcess) {
                        process.exit(exitCode);
                        return;
                    }

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                };

                controller.server.close(() => {
                    finalize(0).catch(reject);
                });

                timeoutId = setTimeout(() => {
                    finalize(1, new Error('Tempo limite ao encerrar o servidor.')).catch(reject);
                }, 5000);

                if (typeof timeoutId.unref === 'function') {
                    timeoutId.unref();
                }
            })().catch(async (error) => {
                await fecharConexao();
                activeController = null;

                if (shutdownOptions.exitProcess) {
                    process.exit(1);
                    return;
                }

                reject(error);
            });
        });

        return controller.shutdownPromise;
    }
}

if (require.main === module) {
    start();
}

module.exports = {
    app,
    start
};

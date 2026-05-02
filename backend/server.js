const express = require('express');
const os = require('os');
const path = require('path');
const cors = require('cors');

const { conectar, fecharConexao } = require('./db');
const {
    clearAutoBackupScheduler,
    executeAutomaticBackup,
    initializeAutoBackupScheduler
} = require('./utils/backup-scheduler');
const { AppError } = require('./utils/errors');

const colaboradoresRoutes = require('./routes/colaboradores');
const ausenciasRoutes = require('./routes/ausencias');
const plantoesRoutes = require('./routes/plantoes');
const feriadosRoutes = require('./routes/feriados');
const bancoHorasRoutes = require('./routes/banco-horas');
const escalaRoutes = require('./routes/escala');
const configuracaoBancoRoutes = require('./routes/configuracao-banco');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

let activeController = null;

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

    if (!includeNetworkUrls) {
        return [...urls];
    }

    const networkInterfaces = os.networkInterfaces();

    Object.values(networkInterfaces).forEach((interfaceGroup) => {
        (interfaceGroup || []).forEach((networkInterface) => {
            if (!networkInterface || networkInterface.internal) {
                return;
            }

            if (networkInterface.family !== 'IPv4' && networkInterface.family !== 4) {
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

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(frontendPath));

app.get('/api/health', async (req, res, next) => {
    try {
        const pool = await conectar();
        await pool.request().query('SELECT 1 AS status');

        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API funcionando!',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/plantoes', plantoesRoutes);
app.use('/api/feriados', feriadosRoutes);
app.use('/api/banco-horas', bancoHorasRoutes);
app.use('/api/escala', escalaRoutes);
app.use('/api/configuracao-banco', configuracaoBancoRoutes);

app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((req, res, next) => {
    next(new AppError(404, 'Rota nao encontrada.'));
});

app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Erro interno no servidor.';

    if (statusCode >= 500) {
        console.error(`[${req.method}] ${req.originalUrl}`, error);
    }

    res.status(statusCode).json({
        error: message,
        details: error.details || null
    });
});

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
        console.log('- GET  /api/colaboradores');
        console.log('- GET  /api/ausencias');
        console.log('- GET  /api/plantoes');
        console.log('- GET  /api/feriados');
        console.log('- GET  /api/banco-horas/resumo');
        console.log('- GET  /api/escala/dia/:dataISO');
        console.log('- GET  /api/configuracao-banco');

        try {
            await conectar();
            console.log('Banco de dados conectado com sucesso.');
            const scheduler = initializeAutoBackupScheduler();

            if (scheduler.scheduled) {
                console.log(`Backup automatico agendado a cada ${scheduler.intervalMinutes} minuto(s).`);
            } else {
                console.log('Backup automatico periodico desativado.');
            }
        } catch (error) {
            console.error('Servidor iniciado, mas nao foi possivel conectar ao banco na inicializacao.');
            console.error(error.message);
        } finally {
            if (!readySettled) {
                readySettled = true;
                resolveReady({
                    host: controller.host,
                    port: controller.port,
                    url: controller.url,
                    urls
                });
            }
        }
    });

    controller.server.once('error', (error) => {
        activeController = null;

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
        clearAutoBackupScheduler();
        console.log(`${reason} recebido. Encerrando servidor...`);

        controller.shutdownPromise = new Promise((resolve, reject) => {
            (async () => {
                try {
                    const backupResult = await executeAutomaticBackup('auto-shutdown');

                    if (backupResult?.success) {
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

                    await fecharConexao().catch(() => {});
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
                await fecharConexao().catch(() => {});
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

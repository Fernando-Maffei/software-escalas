const express = require('express');
const os = require('os');
const path = require('path');
const cors = require('cors');

const { conectar, fecharConexao } = require('./db');
const {
    clearAutoBackupScheduler,
    executeAutomaticBackup,
    initializeAutoBackupScheduler
} = require('./services/backup-scheduler');
const { AppError } = require('./lib/errors');
const { requireAuth, purgeExpiredSessions } = require('./auth/auth');
const { checkAccess } = require('./auth/permissoes');
const { ensureApplicationSchema } = require('./db/database-schema');
const { isDatabaseConfigured } = require('./db/database-config');
const { isSchemaReady, setSchemaReady } = require('./lib/app-state');

const authRoutes = require('./routes/auth');
const colaboradoresRoutes = require('./routes/colaboradores');
const setoresRoutes = require('./routes/setores');
const ausenciasRoutes = require('./routes/ausencias');
const plantoesRoutes = require('./routes/plantoes');
const feriadosRoutes = require('./routes/feriados');
const bancoHorasRoutes = require('./routes/banco-horas');
const bancoHorasSemanalRoutes = require('./routes/banco-horas-semanal');
const escalaRoutes = require('./routes/escala');
const jornadaSemanalRoutes = require('./routes/jornada-semanal');
const tiposEscalaRoutes = require('./routes/tipos-escala');
const folgasDomingoRoutes = require('./routes/folgas-domingo');
const configuracaoBancoRoutes = require('./routes/configuracao-banco');
const sistemaRoutes = require('./routes/sistema');
const usuariosRoutes = require('./routes/usuarios');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 4450;
const CORS_ORIGINS_ENV = 'CORS_ORIGINS';

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

let activeController = null;
let sessionCleanupTimer = null;
let bootstrapRetryTimer = null;

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Retentativa do bootstrap do banco (conectar + garantir schema).
// Sem isto, um unico tropeco na inicializacao deixava o sistema em modo
// manutencao (503) ATE alguem reiniciar na mao. O caso comum e o reinicio da
// maquina: com "restart: always" o app sobe junto com o SQL Server, que leva
// ~1 minuto para aceitar conexoes — o app perdia a corrida, desistia e o
// restart automatico virava um sistema no ar porem inutilizavel.
const BOOTSTRAP_RETRY_INICIAL_MS = 5 * 1000;
const BOOTSTRAP_RETRY_MAX_MS = 60 * 1000;

function clearBootstrapRetry() {
    if (bootstrapRetryTimer) {
        clearTimeout(bootstrapRetryTimer);
        bootstrapRetryTimer = null;
    }
}

// Conecta ao banco e garante o schema. Em caso de falha, reagenda a si mesma
// com espera crescente (5s -> 60s) ate conseguir, em vez de desistir na
// primeira tentativa. Enquanto nao conclui, schemaReady segue false e as rotas
// de dados respondem 503 — a diferenca e que agora o sistema se recupera
// sozinho assim que o banco fica de pe.
//
// Nunca lanca: e chamada sem await pelo timer, e uma excecao aqui viraria
// unhandled rejection e derrubaria o processo.
async function bootstrapDatabaseWithRetry(esperaMs = BOOTSTRAP_RETRY_INICIAL_MS) {
    clearBootstrapRetry();

    const reagendar = (proximaEspera) => {
        // Nao insiste depois de um pedido de encerramento: o processo esta
        // saindo e um timer pendente atrasaria o shutdown.
        if (!activeController || activeController.encerrando) {
            return;
        }

        const espera = Math.min(proximaEspera, BOOTSTRAP_RETRY_MAX_MS);
        console.error(`[boot] Nova tentativa em ${Math.round(espera / 1000)}s...`);
        bootstrapRetryTimer = setTimeout(() => {
            bootstrapDatabaseWithRetry(Math.min(espera * 2, BOOTSTRAP_RETRY_MAX_MS));
        }, espera);

        if (typeof bootstrapRetryTimer.unref === 'function') {
            bootstrapRetryTimer.unref();
        }
    };

    let pool;

    try {
        pool = await conectar();
        console.log('Banco de dados conectado com sucesso.');
    } catch (error) {
        setSchemaReady(false);
        console.error('========================================================');
        console.error('[boot] FALHA: nao foi possivel conectar ao banco na inicializacao.');
        console.error(`[boot] ${error.message}`);
        console.error('[boot] O servidor esta no ar; as rotas de dados respondem 503');
        console.error('[boot] enquanto isso. Isto se resolve sozinho quando o banco subir.');
        console.error('========================================================');
        reagendar(esperaMs);
        return;
    }

    try {
        await ensureApplicationSchema(pool);
        setSchemaReady(true);
        startSessionCleanup();
        const scheduler = initializeAutoBackupScheduler();

        if (scheduler.scheduled) {
            console.log(`Backup automatico agendado a cada ${scheduler.intervalMinutes} minuto(s).`);
        } else {
            console.log('Backup automatico periodico desativado.');
        }
    } catch (error) {
        setSchemaReady(false);
        // Nao engolir em silencio: sem isto o servidor subia "ok" e o login
        // quebrava com um erro cru de SQL. Caso classico no Docker: uma
        // migration nova em ./database nao entra na imagem, entao
        // ensureApplicationSchema falha ao aplicar o arquivo ausente.
        console.error('========================================================');
        console.error('[boot] FALHA ao verificar/criar o schema do banco.');
        console.error(`[boot] ${error.message}`);
        if (error.details && error.details.missingTables) {
            console.error(`[boot] Tabelas ausentes: ${error.details.missingTables.join(', ')}`);
        }
        console.error('[boot] O servidor esta no ar, mas as rotas de dados (inclusive login)');
        console.error('[boot] responderao 503 ate isto ser resolvido.');
        console.error('[boot] Se for migration faltando na imagem, reconstrua:');
        console.error('[boot]   docker compose up -d --build');
        console.error('========================================================');
        reagendar(esperaMs);
    }
}

function clearSessionCleanup() {
    if (sessionCleanupTimer) {
        clearInterval(sessionCleanupTimer);
        sessionCleanupTimer = null;
    }
}

// Varre sessoes expiradas: uma vez agora e a cada hora. As linhas vencidas ja
// nao autenticam (getSession filtra por ExpiresAt); isto so impede a tabela de
// crescer sem limite. Falha na limpeza nunca derruba o servidor.
function startSessionCleanup() {
    clearSessionCleanup();

    const varrer = async () => {
        try {
            const pool = await conectar();
            await purgeExpiredSessions(pool);
        } catch (error) {
            console.error('Falha ao limpar sessoes expiradas:', error.message);
        }
    };

    varrer();
    sessionCleanupTimer = setInterval(varrer, SESSION_CLEANUP_INTERVAL_MS);

    if (typeof sessionCleanupTimer.unref === 'function') {
        sessionCleanupTimer.unref();
    }
}

function normalizeCorsOrigin(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return null;
    }

    try {
        const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
        return url.origin;
    } catch (error) {
        return null;
    }
}

function parseCorsOrigins(value) {
    return new Set(
        String(value || '')
            .split(',')
            .map(normalizeCorsOrigin)
            .filter(Boolean)
    );
}

const configuredCorsOrigins = parseCorsOrigins(process.env[CORS_ORIGINS_ENV]);

function getCorsStatus() {
    return {
        mode: configuredCorsOrigins.size > 0 ? 'restricted' : 'same-origin-only',
        allowedOrigins: [...configuredCorsOrigins]
    };
}

function isSameOriginRequest(req, origin) {
    if (!origin) {
        return true;
    }

    try {
        const requestHost = req.get('host');
        return Boolean(requestHost) && new URL(origin).host === requestHost;
    } catch (error) {
        return false;
    }
}

function corsOptionsDelegate(req, callback) {
    // Navegadores modernos enviam o header "Origin" mesmo em requisicoes de
    // mesma origem (ex: POST do proprio front-end). Por isso comparamos o
    // Origin recebido contra o Host da propria requisicao — e nao apenas
    // contra a allowlist — antes de decidir se e uma chamada same-origin.
    // Origens cross-site só são liberadas se estiverem na allowlist explicita
    // de CORS_ORIGINS; por padrao (allowlist vazia) toda origem cross-site e
    // negada, para nao expor a sessao autenticada a sites de terceiros.
    const origin = req.header('Origin') || null;

    if (isSameOriginRequest(req, origin) || configuredCorsOrigins.has(origin)) {
        callback(null, { origin: true, credentials: true });
        return;
    }

    callback(new AppError(403, 'Origem nao autorizada para acessar a API.'));
}

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

function getClientIp(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const rawIp = forwardedFor || req.socket?.remoteAddress || req.ip || '';
    return String(rawIp).replace(/^::ffff:/, '');
}

async function getDatabaseHealth() {
    try {
        const pool = await conectar();
        await pool.request().query('SELECT 1 AS status');

        return {
            status: 'connected'
        };
    } catch (error) {
        return {
            status: 'unavailable',
            message: error.message || 'Nao foi possivel conectar ao banco.'
        };
    }
}

function getNetworkStatusPayload(req) {
    const port = activeController
        ? getControllerPort(activeController)
        : normalizePort(process.env.PORT ?? DEFAULT_PORT);
    const host = activeController?.host || process.env.HOST || DEFAULT_HOST;
    const urls = getServerAccessUrls(host, port, {
        includeNetworkUrls: true
    });

    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
            host,
            port,
            primaryUrl: activeController?.url || `http://localhost:${port}`,
            urls
        },
        request: {
            host: req.get('host') || null,
            origin: req.get('origin') || null,
            clientIp: getClientIp(req),
            protocol: req.protocol
        },
        cors: getCorsStatus()
    };
}

app.disable('x-powered-by');
app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '25mb' }));
// Sem cache nos arquivos do front-end: garante que o time sempre recebe a
// versao atual (CSS/JS/HTML). Sem isso, o navegador segurava versoes velhas
// e mudancas so apareciam com hard refresh — pior ainda com o ?v fixo dos
// @import. App pequeno em rede local: o custo de rebaixar o cache e minimo.
app.use(express.static(frontendPath, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
}));

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

// Portao de prontidao do schema: enquanto o banco nao estiver pronto (falha de
// conexao ou schema desatualizado no boot), responde 503 com uma mensagem
// acionavel em vez de deixar cada rota estourar um erro cru de SQL como
// "Invalid object name 'Sessoes'". Fica ANTES de /api/auth para que o proprio
// login receba a mensagem clara. Libera /api/health, /api/setup/status e o
// fluxo de configuracao inicial (bootstrap), senao uma instalacao nova — ou um
// banco quebrado — ficaria sem saida.
app.use('/api', (req, res, next) => {
    if (isSchemaReady()) {
        next();
        return;
    }

    const requestPath = req.path.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && (requestPath === '/health' || requestPath === '/setup/status')) {
        next();
        return;
    }

    if (isBootstrapConfigRequest(req)) {
        next();
        return;
    }

    next(new AppError(
        503,
        'Sistema em manutencao: o banco de dados nao esta pronto (indisponivel ou schema desatualizado). '
        + 'Um administrador precisa reiniciar/atualizar o servidor. No Docker: docker compose up -d --build.'
    ));
});

app.use('/api/auth', authRoutes);

// Estado do setup, publico de proposito: o front-end precisa saber, antes
// de qualquer login, se deve mostrar a tela de configuracao inicial do
// banco em vez da tela de login. Nao expoe nenhum dado da conexao.
app.get('/api/setup/status', (req, res) => {
    res.json({ databaseConfigured: isDatabaseConfigured() });
});

// Modo bootstrap: enquanto NENHUM banco estiver configurado (sem
// database.local.json e sem .env), as rotas minimas de configuracao de
// conexao ficam acessiveis sem login — sem banco nao ha dado a proteger,
// e sem isso uma instalacao nova ficaria num impasse (o login exige banco,
// e a tela de configurar banco exigia login). Assim que uma conexao valida
// e salva, isDatabaseConfigured() vira true e o cadeado fecha sozinho.
// Importante: banco configurado porem fora do ar NAO libera nada.
function isBootstrapConfigRequest(req) {
    if (isDatabaseConfigured()) {
        return false;
    }

    const requestPath = req.path.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && requestPath === '/configuracao-banco') {
        return true;
    }

    return req.method === 'POST'
        && (requestPath === '/configuracao-banco/testar' || requestPath === '/configuracao-banco/salvar');
}

app.use('/api', (req, res, next) => {
    if (isBootstrapConfigRequest(req)) {
        next();
        return;
    }

    requireAuth(req, res, next);
});

// Portao de permissao central: usuario comum tem acesso somente de leitura.
// Feito num unico ponto, e nao com requireAdmin espalhado por cada arquivo
// de rota, para que rota nova nasca protegida por padrao — o risco do
// modelo espalhado e alguem adicionar um endpoint e esquecer o middleware.
// /api/auth/* fica de fora porque e montado antes deste portao (o usuario
// precisa poder trocar a propria senha e sair).
app.use('/api', (req, res, next) => {
    if (isBootstrapConfigRequest(req)) {
        next();
        return;
    }

    const denial = checkAccess({
        isAdmin: Boolean(req.user?.isAdmin),
        method: req.method,
        path: req.path
    });

    if (denial) {
        next(new AppError(denial.status, denial.message));
        return;
    }

    next();
});

app.get('/api/network/status', async (req, res) => {
    const database = await getDatabaseHealth();

    res.json({
        ...getNetworkStatusPayload(req),
        database
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API funcionando!',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/setores', setoresRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/plantoes', plantoesRoutes);
app.use('/api/feriados', feriadosRoutes);
app.use('/api/banco-horas', bancoHorasRoutes);
app.use('/api/banco-horas-semanal', bancoHorasSemanalRoutes);
app.use('/api/escala', escalaRoutes);
app.use('/api/jornada-semanal', jornadaSemanalRoutes);
app.use('/api/tipos-escala', tiposEscalaRoutes);
app.use('/api/folgas-domingo', folgasDomingoRoutes);
app.use('/api/configuracao-banco', configuracaoBancoRoutes);
app.use('/api/sistema', sistemaRoutes);
app.use('/api/usuarios', usuariosRoutes);

app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.set('Cache-Control', 'no-store, must-revalidate');
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

        await bootstrapDatabaseWithRetry();

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
        clearBootstrapRetry();
        clearAutoBackupScheduler();
        clearSessionCleanup();
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

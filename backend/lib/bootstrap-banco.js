// Bootstrap do banco no inicio do servidor: conectar, aplicar o schema, ligar
// a limpeza de sessoes e o backup agendado — com retentativa ate o banco subir.
const { conectar } = require('../db');
const { ensureApplicationSchema } = require('../db/database-schema');
const { purgeExpiredSessions } = require('../auth/auth');
const { initializeAutoBackupScheduler } = require('../services/backup-scheduler');
const { setSchemaReady } = require('./app-state');

let sessionCleanupTimer = null;
let bootstrapRetryTimer = null;
// Consultado antes de reagendar: quando o servidor esta encerrando, a
// retentativa para.
let deveContinuar = () => true;

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
        if (!deveContinuar()) {
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

// Liga o bootstrap; `continuar` diz se ainda vale reagendar (false durante o
// encerramento).
function iniciarBootstrapBanco(continuar) {
    deveContinuar = continuar;
    return bootstrapDatabaseWithRetry();
}

function pararBootstrapBanco() {
    clearBootstrapRetry();
    clearSessionCleanup();
}

module.exports = {
    iniciarBootstrapBanco,
    pararBootstrapBanco
};

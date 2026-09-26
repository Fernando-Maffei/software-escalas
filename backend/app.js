// Aplicacao Express: middlewares, portoes (prontidao do banco, login,
// permissao), rotas e tratamento de erro. Quem sobe e derruba o servidor HTTP
// e o server.js.
const express = require('express');
const path = require('path');
const cors = require('cors');

const { conectar } = require('./db');
const { AppError } = require('./lib/errors');
const { corsOptionsDelegate, getCorsStatus } = require('./lib/cors');
const { getClientIp, parseTrustProxy } = require('./lib/ip-cliente');
const { DEFAULT_HOST, DEFAULT_PORT, getServerAccessUrls, normalizePort } = require('./lib/rede');
const { tratadorDeErros } = require('./lib/tratador-erros');
const { cabecalhosDeSeguranca } = require('./lib/cabecalhos-seguranca');
const { requireAuth } = require('./auth/auth');
const { checkAccess } = require('./auth/permissoes');
const { isDatabaseConfigured } = require('./db/database-config');
const { isSchemaReady } = require('./lib/app-state');

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

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

// app.get('servidor') e preenchido pelo server.js ao subir (host e porta reais),
// para a tela de rede.

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
    const servidor = req.app.get('servidor');
    const port = servidor ? servidor.port : normalizePort(process.env.PORT ?? DEFAULT_PORT);
    const host = servidor?.host || process.env.HOST || DEFAULT_HOST;
    const urls = getServerAccessUrls(host, port, {
        includeNetworkUrls: true
    });

    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
            host,
            port,
            primaryUrl: servidor?.url || `http://localhost:${port}`,
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
// Sem TRUST_PROXY, X-Forwarded-For e ignorado (ver lib/ip-cliente.js).
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.use(cabecalhosDeSeguranca);
app.use(cors(corsOptionsDelegate));
// So a restauracao de backup recebe o arquivo inteiro no corpo; o resto da
// API trafega formularios pequenos. Um limite unico de 25 MB deixava qualquer
// rota aceitar (e parsear) corpos enormes.
app.use('/api/configuracao-banco/backup/restaurar', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '1mb' }));
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

    // Senha provisoria (conta criada ou resetada pelo admin, ou o admin
    // inicial): so /api/auth/* funciona ate a troca. Antes isso era imposto so
    // pela tela, e a API respondia normalmente.
    if (req.user?.deveTrocarSenha) {
        next(new AppError(403, 'Defina uma nova senha antes de continuar.'));
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

app.use(tratadorDeErros());

module.exports = app;

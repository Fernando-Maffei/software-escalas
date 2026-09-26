// Apoio dos testes de integracao: sobem o servidor de verdade, em processo,
// contra um SQL Server descartavel, e falam com ele por HTTP como o navegador.
//
// Por que existir: os testes unitarios cobrem as regras puras, mas os bugs
// graves deste projeto moravam na costura — transacao, FK, lista de tabelas
// escrita a mao. So um banco de verdade pega isso.
//
// Banco: por padrao 127.0.0.1:14339 (npm run integracao:banco:subir). O nome
// do banco PRECISA conter "Integracao": o apoio apaga e recria esse banco a
// cada execucao, entao a trava impede apontar por engano para a producao.
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');

const CONFIG_BANCO = Object.freeze({
    host: process.env.INTEGRACAO_DB_HOST || '127.0.0.1',
    port: Number(process.env.INTEGRACAO_DB_PORT || 14339),
    database: process.env.INTEGRACAO_DB_DATABASE || 'SoftwareEscalasIntegracao',
    user: process.env.INTEGRACAO_DB_USER || 'sa',
    password: process.env.INTEGRACAO_DB_PASSWORD || 'Integracao!Escalas2026'
});

const ADMIN = Object.freeze({ username: 'admin', password: 'Admin!Integracao1' });

if (!/integracao/i.test(CONFIG_BANCO.database)) {
    throw new Error(
        `Recusado: o banco de integracao "${CONFIG_BANCO.database}" nao tem "Integracao" no nome. ` +
            'Os testes apagam e recriam esse banco; a trava existe para nunca tocar a producao.'
    );
}

// Precisa acontecer ANTES de qualquer require do backend: database-config le
// o diretorio de dados no carregamento do modulo, e um database.local.json da
// maquina de quem roda o teste teria precedencia sobre estas variaveis.
const PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'escalas-integracao-'));

Object.assign(process.env, {
    APP_DE_ESCALAS_DATA_DIR: PASTA_DADOS,
    DB_HOST: CONFIG_BANCO.host,
    DB_PORT: String(CONFIG_BANCO.port),
    DB_DATABASE: CONFIG_BANCO.database,
    DB_USER: CONFIG_BANCO.user,
    DB_PASSWORD: CONFIG_BANCO.password,
    DB_AUTH_TYPE: 'sql',
    DB_ENCRYPT: 'true',
    DB_TRUST_CERT: 'true',
    ADMIN_USERNAME: ADMIN.username,
    ADMIN_PASSWORD: ADMIN.password
});

const sql = require('mssql');

async function recriarBanco() {
    const master = new sql.ConnectionPool({
        server: CONFIG_BANCO.host,
        port: CONFIG_BANCO.port,
        user: CONFIG_BANCO.user,
        password: CONFIG_BANCO.password,
        database: 'master',
        options: { encrypt: true, trustServerCertificate: true }
    });

    await master.connect();

    try {
        const nome = CONFIG_BANCO.database.replace(/]/g, ']]');
        await master.request().batch(`
            IF DB_ID(N'${nome}') IS NOT NULL
            BEGIN
                ALTER DATABASE [${nome}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE [${nome}];
            END;
            CREATE DATABASE [${nome}];
        `);
    } finally {
        await master.close();
    }
}

let controlador = null;

async function subirServidor() {
    await recriarBanco();

    const { start } = require(path.join(RAIZ, 'backend', 'server.js'));
    const { isSchemaReady } = require(path.join(RAIZ, 'backend', 'lib', 'app-state.js'));

    controlador = start({ host: '127.0.0.1', port: 0, installSignalHandlers: false, logNetworkUrls: false });
    await controlador.ready;

    if (!isSchemaReady()) {
        throw new Error('O servidor subiu, mas o schema do banco de integracao nao ficou pronto (veja o log acima).');
    }

    return controlador;
}

async function derrubarServidor() {
    if (controlador) {
        await controlador.shutdown('fim dos testes de integracao');
        controlador = null;
    }

    fs.rmSync(PASTA_DADOS, { recursive: true, force: true });
}

// Cliente HTTP com "pote de cookies" de uma sessao so, como uma aba do navegador.
function criarCliente() {
    let cookie = '';

    async function requisitar(metodo, rota, corpo, cabecalhosExtras = {}) {
        const cabecalhos = { ...cabecalhosExtras };

        if (cookie) {
            cabecalhos.Cookie = cookie;
        }

        if (corpo !== undefined) {
            cabecalhos['Content-Type'] = 'application/json';
        }

        const resposta = await fetch(`${controlador.url}${rota}`, {
            method: metodo,
            headers: cabecalhos,
            body: corpo === undefined ? undefined : JSON.stringify(corpo)
        });

        const setCookie = resposta.headers.get('set-cookie');

        if (setCookie) {
            cookie = setCookie.split(';')[0];
        }

        const texto = await resposta.text();
        let json = null;

        try {
            json = texto ? JSON.parse(texto) : null;
        } catch (erro) {
            json = null;
        }

        return { status: resposta.status, body: json, texto, headers: resposta.headers };
    }

    return {
        get: (rota, cabecalhos) => requisitar('GET', rota, undefined, cabecalhos),
        post: (rota, corpo, cabecalhos) => requisitar('POST', rota, corpo, cabecalhos),
        put: (rota, corpo, cabecalhos) => requisitar('PUT', rota, corpo, cabecalhos),
        delete: (rota, cabecalhos) => requisitar('DELETE', rota, undefined, cabecalhos),
        definirCookie(valor) {
            cookie = valor;
        },
        async entrar(usuario = ADMIN.username, senha = ADMIN.password) {
            const resposta = await requisitar('POST', '/api/auth/login', { username: usuario, password: senha });

            if (resposta.status !== 200) {
                throw new Error(`Login de ${usuario} falhou: ${resposta.status} ${resposta.texto}`);
            }

            return resposta;
        }
    };
}

// Espera 2xx; senao falha mostrando o corpo, que e onde o backend explica o erro.
function esperarSucesso(resposta, contexto) {
    if (resposta.status < 200 || resposta.status >= 300) {
        throw new Error(`${contexto}: esperava 2xx, veio ${resposta.status} — ${resposta.texto}`);
    }

    return resposta.body;
}

// Acesso direto ao banco, para conferir o que a API nao expoe.
async function consultar(query) {
    const { conectar } = require(path.join(RAIZ, 'backend', 'db'));
    const pool = await conectar();
    const resultado = await pool.request().query(query);
    return resultado.recordset;
}

let sequencia = 0;

function nomeUnico(prefixo) {
    sequencia += 1;
    return `${prefixo} ${Date.now().toString(36)}-${sequencia}`;
}

module.exports = {
    ADMIN,
    CONFIG_BANCO,
    PASTA_DADOS,
    consultar,
    criarCliente,
    derrubarServidor,
    esperarSucesso,
    nomeUnico,
    subirServidor
};

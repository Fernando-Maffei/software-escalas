const assert = require('node:assert/strict');

const { ADMIN, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');

async function criarUsuarioComum() {
    const admin = criarCliente();
    await admin.entrar();

    const username = nomeUnico('leitor').replace(/\s+/g, '-');
    const senha = 'Leitor!Integracao1';
    esperarSucesso(await admin.post('/api/usuarios', { username, senha }), 'criar usuario comum');

    return { username, senha };
}

module.exports = [
    {
        name: 'login do admin devolve sessao e /me reconhece o usuario',
        async run() {
            const cliente = criarCliente();
            const login = await cliente.entrar();

            assert.equal(login.body.user.username, ADMIN.username);
            assert.equal(login.body.user.isAdmin, true);
            assert.match(login.headers.get('set-cookie'), /HttpOnly/);

            const me = esperarSucesso(await cliente.get('/api/auth/me'), '/me');
            assert.equal(me.user.username, ADMIN.username);
        }
    },
    {
        name: 'senha errada devolve 401 sem revelar se o usuario existe',
        async run() {
            const cliente = criarCliente();
            const existente = await cliente.post('/api/auth/login', {
                username: ADMIN.username,
                password: 'errada-123'
            });
            const inexistente = await cliente.post('/api/auth/login', {
                username: 'ninguem-aqui',
                password: 'errada-123'
            });

            assert.equal(existente.status, 401);
            assert.equal(inexistente.status, 401);
            assert.equal(existente.body.error, inexistente.body.error);
        }
    },
    {
        name: 'rota de dados sem sessao devolve 401',
        async run() {
            const resposta = await criarCliente().get('/api/colaboradores');
            assert.equal(resposta.status, 401);
        }
    },
    {
        // decodeURIComponent('%') lanca URIError; antes virava 500.
        name: 'cookie de sessao malformado e tratado como sessao invalida (401), nao erro interno',
        async run() {
            const cliente = criarCliente();
            cliente.definirCookie('escalas_sid=%E0%A4%A');

            const resposta = await cliente.get('/api/colaboradores');
            assert.equal(resposta.status, 401);
        }
    },
    {
        // O X-Forwarded-For vem do cliente: se entrasse na chave do limite,
        // bastaria trocar o header a cada tentativa para nunca ser bloqueado.
        name: 'limite de tentativas de login nao e contornado trocando X-Forwarded-For',
        async run() {
            const { username } = await criarUsuarioComum();
            const cliente = criarCliente();
            let ultima = null;

            for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
                ultima = await cliente.post(
                    '/api/auth/login',
                    { username, password: 'senha-errada' },
                    { 'X-Forwarded-For': `10.0.0.${tentativa}` }
                );
            }

            assert.equal(ultima.status, 429);
        }
    },
    {
        name: 'usuario comum le dados mas nao grava nem entra na area administrativa',
        async run() {
            const { username, senha } = await criarUsuarioComum();
            const leitor = criarCliente();
            await leitor.entrar(username, senha);

            assert.equal((await leitor.get('/api/colaboradores')).status, 200);
            assert.equal((await leitor.post('/api/setores', { nome: 'Nao pode' })).status, 403);
            assert.equal((await leitor.get('/api/usuarios')).status, 403);
            assert.equal((await leitor.get('/api/configuracao-banco')).status, 403);
        }
    },
    {
        // Antes o id passava na validacao, estourava o INT no driver e o 500
        // devolvia a mensagem crua do tedious.
        name: 'id acima do limite do banco e entrada invalida (400), sem mensagem do driver',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const resposta = await cliente.get('/api/colaboradores/99999999999');

            assert.equal(resposta.status, 400);
            assert.doesNotMatch(String(resposta.body?.error), /Validation failed|mssql|tedious/i);
        }
    },
    {
        // M4 da auditoria: as flags eram gravadas antes de validar a senha nova;
        // o 400 chegava com o usuario ja desativado.
        name: 'atualizar usuario com senha invalida nao grava nada',
        async run() {
            const { username } = await criarUsuarioComum();
            const admin = criarCliente();
            await admin.entrar();

            const lista = esperarSucesso(await admin.get('/api/usuarios'), 'listar usuarios');
            const alvo = lista.usuarios.find((usuario) => usuario.username === username);
            const resposta = await admin.put(`/api/usuarios/${alvo.id}`, { ativo: false, novaSenha: 'curta' });

            assert.equal(resposta.status, 400);

            const depois = esperarSucesso(await admin.get('/api/usuarios'), 'listar usuarios');
            assert.equal(depois.usuarios.find((usuario) => usuario.id === alvo.id).ativo, true);
        }
    },
    {
        name: 'respostas levam cabecalhos de seguranca',
        async run() {
            const resposta = await criarCliente().get('/api/setup/status');

            assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
            assert.equal(resposta.headers.get('x-frame-options'), 'SAMEORIGIN');
            assert.match(resposta.headers.get('content-security-policy'), /frame-ancestors 'self'/);
        }
    },
    {
        // M6 da auditoria: o limite de 25 MB valia para toda a API.
        name: 'corpo acima de 1 MB e recusado fora da restauracao de backup',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const resposta = await cliente.post('/api/setores', { nome: 'x'.repeat(1024 * 1024 + 10) });
            assert.equal(resposta.status, 413);
        }
    }
];

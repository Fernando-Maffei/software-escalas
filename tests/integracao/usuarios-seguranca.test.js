// Regras de seguranca da gestao de contas (/api/usuarios e troca de senha).
const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const { criarSetor } = require('./fabrica');

const SENHA = 'Conta!Seguranca7';

function nomeConta(prefixo) {
    return nomeUnico(prefixo).replace(/\s+/g, '-');
}

async function adminLogado() {
    const admin = criarCliente();
    await admin.entrar();
    return admin;
}

async function meuId(cliente) {
    return esperarSucesso(await cliente.get('/api/auth/me'), '/me').user.id;
}

module.exports = [
    {
        name: 'usuario comum nao cria, altera nem exclui contas',
        async run() {
            const admin = await adminLogado();
            const username = nomeConta('leitor-seg');
            const criado = esperarSucesso(await admin.post('/api/usuarios', { username, senha: SENHA }), 'criar');
            const leitor = criarCliente();
            await leitor.entrar(username, SENHA);

            assert.equal((await leitor.post('/api/usuarios', { username: nomeConta('x'), senha: SENHA })).status, 403);
            assert.equal((await leitor.put(`/api/usuarios/${criado.usuario.id}`, { isAdmin: true })).status, 403);
            assert.equal((await leitor.delete(`/api/usuarios/${criado.usuario.id}`)).status, 403);

            const [linha] = await consultar(`SELECT IsAdmin FROM Usuarios WHERE Id = ${Number(criado.usuario.id)}`);
            assert.equal(Boolean(linha.IsAdmin), false);
        }
    },
    {
        name: 'criar e definir senha recusam senha fraca e nome fora do padrao',
        async run() {
            const admin = await adminLogado();
            const username = nomeConta('fraca');

            const fraca = await admin.post('/api/usuarios', { username, senha: 'senha123' });
            assert.equal(fraca.status, 400);
            assert.match(fraca.body.error, /facil demais/);

            const comNome = await admin.post('/api/usuarios', { username, senha: `${username}!9` });
            assert.equal(comNome.status, 400);
            assert.match(comNome.body.error, /nome de usuario/);

            const html = await admin.post('/api/usuarios', { username: '<img src=x>', senha: SENHA });
            assert.equal(html.status, 400);

            const [{ total }] = await consultar(
                `SELECT COUNT(*) AS total FROM Usuarios WHERE Username = '${username}'`
            );
            assert.equal(total, 0, 'nada foi criado');

            const criado = esperarSucesso(await admin.post('/api/usuarios', { username, senha: SENHA }), 'criar');
            assert.equal(criado.senhaTemporaria, null, 'senha digitada nao volta na resposta');

            const definir = await admin.put(`/api/usuarios/${criado.usuario.id}`, { novaSenha: 'abcdef12' });
            assert.equal(definir.status, 400);
            await criarCliente().entrar(username, SENHA);
        }
    },
    {
        name: 'conta criada sem senha recebe senha gerada uma unica vez e sem cache',
        async run() {
            const admin = await adminLogado();
            const resposta = await admin.post('/api/usuarios', { username: nomeConta('gerada') });

            assert.equal(resposta.status, 201);
            assert.equal(typeof resposta.body.senhaTemporaria, 'string');
            assert.ok(resposta.body.senhaTemporaria.length >= 12);
            assert.match(resposta.headers.get('cache-control') || '', /no-store/);
            assert.match((await admin.get('/api/usuarios')).headers.get('cache-control') || '', /no-store/);
        }
    },
    {
        name: 'nome repetido (inclusive mudando maiusculas) e recusado',
        async run() {
            const admin = await adminLogado();
            const username = nomeConta('dupla');
            esperarSucesso(await admin.post('/api/usuarios', { username, senha: SENHA }), 'criar');

            const repetido = await admin.post('/api/usuarios', { username: username.toUpperCase(), senha: SENHA });
            assert.equal(repetido.status, 400);
            assert.match(repetido.body.error, /Ja existe/);
        }
    },
    {
        name: 'admin nao troca a propria senha pela gestao de contas, nem se desativa ou rebaixa',
        async run() {
            const admin = await adminLogado();
            const id = await meuId(admin);

            for (const corpo of [
                { resetarSenha: true },
                { novaSenha: 'Outra!Senha2026' },
                { ativo: false },
                { isAdmin: false }
            ]) {
                const resposta = await admin.put(`/api/usuarios/${id}`, corpo);
                assert.equal(resposta.status, 400, JSON.stringify(corpo));
            }

            assert.equal((await admin.delete(`/api/usuarios/${id}`)).status, 400);
            assert.equal((await admin.get('/api/auth/me')).status, 200, 'a sessao segue valendo');
        }
    },
    {
        name: 'setores permitidos so aceitam setores existentes e valem ja na criacao',
        async run() {
            const admin = await adminLogado();
            const setor = await criarSetor(admin, nomeUnico('Setor Seg'));
            const username = nomeConta('setorial-seg');

            const inexistente = await admin.post('/api/usuarios', {
                username,
                senha: SENHA,
                setoresPermitidos: [2147480000]
            });
            assert.equal(inexistente.status, 400);
            const [{ total }] = await consultar(
                `SELECT COUNT(*) AS total FROM Usuarios WHERE Username = '${username}'`
            );
            assert.equal(total, 0, 'conta nao nasce sem o teto pedido');

            const criado = esperarSucesso(
                await admin.post('/api/usuarios', { username, senha: SENHA, setoresPermitidos: [setor.Id] }),
                'criar com setor'
            );
            assert.deepEqual(criado.usuario.setoresPermitidos, [String(setor.Id)]);

            for (const setoresPermitidos of [['abc'], [0], 'texto', null, [99999999999]]) {
                const resposta = await admin.put(`/api/usuarios/${criado.usuario.id}`, { setoresPermitidos });
                assert.equal(resposta.status, 400, JSON.stringify(setoresPermitidos));
            }

            const limpo = esperarSucesso(
                await admin.put(`/api/usuarios/${criado.usuario.id}`, { setoresPermitidos: [] }),
                'remover restricao'
            );
            assert.deepEqual(limpo.usuario.setoresPermitidos, []);
        }
    },
    {
        name: 'trocar a propria senha tambem exige senha forte',
        async run() {
            const admin = await adminLogado();
            const username = nomeConta('troca-forte');
            esperarSucesso(await admin.post('/api/usuarios', { username, senha: SENHA, isAdmin: true }), 'criar admin');

            const dono = criarCliente();
            await dono.entrar(username, SENHA);
            const fraca = await dono.post('/api/auth/trocar-senha', { senhaAtual: SENHA, novaSenha: '12345678' });
            assert.equal(fraca.status, 400);
            esperarSucesso(
                await dono.post('/api/auth/trocar-senha', { senhaAtual: SENHA, novaSenha: 'Plantao!Forte42' }),
                'senha forte'
            );
        }
    }
];

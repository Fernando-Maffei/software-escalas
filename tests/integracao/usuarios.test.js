const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');

const SENHA = 'Conta!Integracao1';

async function criarConta({ isAdmin = false } = {}) {
    const admin = criarCliente();
    await admin.entrar();

    const username = nomeUnico(isAdmin ? 'admin-extra' : 'conta').replace(/\s+/g, '-');
    const criada = esperarSucesso(
        await admin.post('/api/usuarios', { username, senha: SENHA, isAdmin }),
        'criar conta'
    );
    const cliente = criarCliente();
    await cliente.entrar(username, SENHA);

    // Admin criado por outra pessoa nasce com senha provisoria (API bloqueada).
    if (isAdmin) {
        esperarSucesso(
            await cliente.post('/api/auth/trocar-senha', { senhaAtual: SENHA, novaSenha: SENHA }),
            'trocar senha provisoria'
        );
    }

    return { id: criada.usuario.id, username, cliente, admin };
}

module.exports = [
    {
        // T10: o papel vinha da copia gravada na sessao no login.
        name: 'sessao aberta passa a ver o papel novo da conta sem novo login',
        async run() {
            const conta = await criarConta();
            assert.equal((await conta.cliente.get('/api/usuarios')).status, 403);

            esperarSucesso(await conta.admin.put(`/api/usuarios/${conta.id}`, { isAdmin: true }), 'promover');

            assert.equal((await conta.cliente.get('/api/usuarios')).status, 200);
        }
    },
    {
        // T10: a sessao so caia porque a rota lembrava de chamar
        // revokeUserSessions. Desativando direto no banco, ela seguia valendo.
        name: 'conta desativada perde a sessao mesmo sem revogacao explicita',
        async run() {
            const conta = await criarConta();
            assert.equal((await conta.cliente.get('/api/colaboradores')).status, 200);

            await consultar(`UPDATE Usuarios SET Ativo = 0 WHERE Id = ${Number(conta.id)}`);

            assert.equal((await conta.cliente.get('/api/colaboradores')).status, 401);
        }
    },
    {
        // T11: a contagem de "outro admin ativo" era feita fora da transacao;
        // dois admins rebaixando um ao outro ao mesmo tempo passavam os dois.
        name: 'dois admins rebaixando um ao outro ao mesmo tempo nao deixam o sistema sem admin',
        async run() {
            const a = await criarConta({ isAdmin: true });
            const b = await criarConta({ isAdmin: true });

            // Deixa A e B como os unicos admins ativos e devolve o resto no fim.
            const outros = await consultar(`
                SELECT Id FROM Usuarios
                WHERE IsAdmin = 1 AND Ativo = 1 AND Id NOT IN (${Number(a.id)}, ${Number(b.id)})
            `);
            const idsOutros = outros.map((linha) => Number(linha.Id));

            try {
                if (idsOutros.length) {
                    await consultar(`UPDATE Usuarios SET Ativo = 0 WHERE Id IN (${idsOutros.join(', ')})`);
                }

                const respostas = await Promise.all([
                    a.cliente.put(`/api/usuarios/${b.id}`, { isAdmin: false }),
                    b.cliente.put(`/api/usuarios/${a.id}`, { isAdmin: false })
                ]);
                const status = respostas.map((resposta) => resposta.status).sort();

                // O segundo leva 400 (ultimo admin) ou 403 (ja foi rebaixado
                // quando o pedido dele chegou) — nunca 200.
                assert.equal(status.filter((codigo) => codigo === 200).length, 1, `status: ${status.join(',')}`);
                assert.ok([400, 403].includes(status[1]), `status: ${status.join(',')}`);

                const [restantes] = await consultar(`
                    SELECT COUNT(*) AS total FROM Usuarios
                    WHERE IsAdmin = 1 AND Ativo = 1 AND Id IN (${Number(a.id)}, ${Number(b.id)})
                `);
                assert.equal(restantes.total, 1);
            } finally {
                if (idsOutros.length) {
                    await consultar(`UPDATE Usuarios SET Ativo = 1 WHERE Id IN (${idsOutros.join(', ')})`);
                }
            }
        }
    }
];

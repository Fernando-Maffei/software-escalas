const assert = require('node:assert/strict');

const {
    credenciaisValidas,
    ensureDefaultAdmin,
    getSessionTokenFromRequest,
    verifyPassword
} = require('../../backend/auth/auth');

// Pool falso so com o que ensureDefaultAdmin usa: conta usuarios, insere e
// relê pelo nome. Guarda a linha inserida para o teste conferir a senha.
function criarPoolFalso() {
    const estado = { usuarios: [] };

    return {
        estado,
        request() {
            const parametros = {};

            return {
                input(nome, tipo, valor) {
                    parametros[nome] = valor;
                    return this;
                },
                async query(texto) {
                    if (/SELECT COUNT\(\*\) AS total FROM Usuarios/.test(texto)) {
                        return { recordset: [{ total: estado.usuarios.length }] };
                    }

                    if (/INSERT INTO Usuarios/.test(texto)) {
                        estado.usuarios.push({
                            Id: estado.usuarios.length + 1,
                            Username: parametros.username,
                            PasswordHash: parametros.hash,
                            PasswordSalt: parametros.salt,
                            DeveTrocarSenha: parametros.deveTrocarSenha,
                            IsAdmin: parametros.isAdmin,
                            Ativo: true
                        });
                        return { recordset: [] };
                    }

                    if (/FROM Usuarios WHERE Username = @username/.test(texto)) {
                        return { recordset: estado.usuarios.filter((u) => u.Username === parametros.username) };
                    }

                    throw new Error(`Consulta inesperada no pool falso: ${texto}`);
                }
            };
        }
    };
}

async function comAmbiente(variaveis, tarefa) {
    const anteriores = {};

    Object.keys(variaveis).forEach((chave) => {
        anteriores[chave] = process.env[chave];

        if (variaveis[chave] === undefined) {
            delete process.env[chave];
        } else {
            process.env[chave] = variaveis[chave];
        }
    });

    try {
        return await tarefa();
    } finally {
        Object.keys(anteriores).forEach((chave) => {
            if (anteriores[chave] === undefined) {
                delete process.env[chave];
            } else {
                process.env[chave] = anteriores[chave];
            }
        });
    }
}

module.exports = [
    {
        name: 'ensureDefaultAdmin usa ADMIN_PASSWORD valida e nao a devolve',
        async run() {
            const pool = criarPoolFalso();
            const resultado = await comAmbiente(
                { ADMIN_USERNAME: 'chefe', ADMIN_PASSWORD: 'Senha!Valida1' },
                () => ensureDefaultAdmin(pool)
            );

            assert.equal(resultado.username, 'chefe');
            assert.equal(resultado.generated, false);

            const [linha] = pool.estado.usuarios;
            assert.equal(await verifyPassword('Senha!Valida1', linha.PasswordHash, linha.PasswordSalt), true);
            assert.equal(linha.DeveTrocarSenha, false);
        }
    },
    {
        // A2 da auditoria: com ADMIN_PASSWORD curta a senha era sorteada, mas
        // marcada como "nao gerada" — ninguem via a senha e ninguem entrava.
        name: 'ensureDefaultAdmin com ADMIN_PASSWORD curta sorteia a senha, mostra e exige troca',
        async run() {
            const pool = criarPoolFalso();
            const resultado = await comAmbiente(
                { ADMIN_USERNAME: undefined, ADMIN_PASSWORD: 'curta' },
                () => ensureDefaultAdmin(pool)
            );

            assert.equal(resultado.generated, true);
            assert.ok(resultado.password && resultado.password !== 'curta');

            const [linha] = pool.estado.usuarios;
            assert.equal(await verifyPassword(resultado.password, linha.PasswordHash, linha.PasswordSalt), true);
            assert.equal(linha.DeveTrocarSenha, true);
        }
    },
    {
        name: 'ensureDefaultAdmin nao cria ninguem se ja existe usuario',
        async run() {
            const pool = criarPoolFalso();
            pool.estado.usuarios.push({ Id: 1, Username: 'existente' });

            assert.equal(await ensureDefaultAdmin(pool), null);
            assert.equal(pool.estado.usuarios.length, 1);
        }
    },
    {
        name: 'getSessionTokenFromRequest le o cookie de sessao entre outros cookies',
        run() {
            const token = 'a'.repeat(64);
            const req = { headers: { cookie: `tema=escuro; escalas_sid=${token}; outro=1` } };

            assert.equal(getSessionTokenFromRequest(req), token);
            assert.equal(getSessionTokenFromRequest({ headers: {} }), null);
        }
    },
    {
        // M3 da auditoria: decodeURIComponent lancava URIError e virava 500.
        name: 'getSessionTokenFromRequest trata cookie malformado como ausente em vez de lancar',
        run() {
            const req = { headers: { cookie: 'escalas_sid=%E0%A4%A; tema=%' } };

            assert.equal(getSessionTokenFromRequest(req), null);
        }
    }
,
    {
        // B7 da auditoria: usuario inexistente respondia sem rodar o scrypt, e o
        // tempo de resposta revelava quais contas existem.
        name: 'credenciaisValidas recusa inexistente, inativo e senha errada; aceita a certa',
        async run() {
            const pool = criarPoolFalso();
            await comAmbiente({ ADMIN_USERNAME: 'chefe', ADMIN_PASSWORD: 'Senha!Valida1' }, () => ensureDefaultAdmin(pool));
            const [linha] = pool.estado.usuarios;
            const usuario = { passwordHash: linha.PasswordHash, passwordSalt: linha.PasswordSalt, ativo: true };

            assert.equal(await credenciaisValidas(usuario, 'Senha!Valida1'), true);
            assert.equal(await credenciaisValidas(usuario, 'errada-123'), false);
            assert.equal(await credenciaisValidas({ ...usuario, ativo: false }, 'Senha!Valida1'), false);
            assert.equal(await credenciaisValidas(null, 'qualquer-coisa'), false);
        }
    }
];

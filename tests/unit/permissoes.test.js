const assert = require('assert');

const { checkAccess, isAdminOnlyPath, isReadOnlyMethod } = require('../../backend/auth/permissoes');

module.exports = [
    {
        name: 'checkAccess libera qualquer rota e metodo para administrador',
        run() {
            assert.strictEqual(checkAccess({ isAdmin: true, method: 'DELETE', path: '/colaboradores/7' }), null);
            assert.strictEqual(checkAccess({ isAdmin: true, method: 'POST', path: '/configuracao-banco/salvar' }), null);
            assert.strictEqual(checkAccess({ isAdmin: true, method: 'POST', path: '/sistema/servidor-background/parar' }), null);
        }
    },
    {
        name: 'checkAccess permite leitura de dados para usuario comum',
        run() {
            assert.strictEqual(checkAccess({ isAdmin: false, method: 'GET', path: '/ausencias' }), null);
            assert.strictEqual(checkAccess({ isAdmin: false, method: 'GET', path: '/colaboradores' }), null);
            assert.strictEqual(checkAccess({ isAdmin: false, method: 'GET', path: '/feriados/2026' }), null);
            assert.strictEqual(checkAccess({ isAdmin: false, method: 'HEAD', path: '/escala' }), null);
        }
    },
    {
        name: 'checkAccess bloqueia escrita de usuario comum em rotas de dados',
        run() {
            ['POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
                const denial = checkAccess({ isAdmin: false, method, path: '/colaboradores/7' });

                assert.ok(denial, `${method} deveria ser bloqueado`);
                assert.strictEqual(denial.status, 403);
            });
        }
    },
    {
        name: 'checkAccess bloqueia usuario comum nas areas administrativas ate para leitura',
        run() {
            // GET /configuracao-banco devolve host e usuario do banco; GET
            // /usuarios lista as contas. Nenhum dos dois e para usuario comum.
            ['/configuracao-banco', '/configuracao-banco/backup', '/sistema/servidor-background/status', '/usuarios']
                .forEach((path) => {
                    const denial = checkAccess({ isAdmin: false, method: 'GET', path });

                    assert.ok(denial, `${path} deveria ser bloqueado`);
                    assert.strictEqual(denial.status, 403);
                    assert.match(denial.message, /administradores/i);
                });
        }
    },
    {
        name: 'isAdminOnlyPath nao casa prefixo parcial de outra rota',
        run() {
            // Guarda contra o bug classico de startsWith: uma rota futura
            // chamada /sistemas ou /usuarios-relatorio nao deve herdar a
            // restricao de /sistema e /usuarios por acidente.
            assert.strictEqual(isAdminOnlyPath('/sistemas'), false);
            assert.strictEqual(isAdminOnlyPath('/usuarios-relatorio'), false);
            assert.strictEqual(isAdminOnlyPath('/configuracao-banco-teste'), false);

            assert.strictEqual(isAdminOnlyPath('/sistema'), true);
            assert.strictEqual(isAdminOnlyPath('/usuarios/3'), true);
        }
    },
    {
        name: 'isAdminOnlyPath ignora barra final',
        run() {
            assert.strictEqual(isAdminOnlyPath('/usuarios/'), true);
            assert.strictEqual(isAdminOnlyPath('/configuracao-banco//'), true);
        }
    },
    {
        name: 'isReadOnlyMethod aceita metodo em minusculas',
        run() {
            assert.strictEqual(isReadOnlyMethod('get'), true);
            assert.strictEqual(isReadOnlyMethod('GET'), true);
            assert.strictEqual(isReadOnlyMethod('post'), false);
            assert.strictEqual(isReadOnlyMethod(''), false);
            assert.strictEqual(isReadOnlyMethod(undefined), false);
        }
    }
];

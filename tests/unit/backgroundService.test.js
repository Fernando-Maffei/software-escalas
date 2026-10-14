const assert = require('node:assert/strict');

const { runWindowsCommand } = require('../../backend/lib/background-service');

// O proprio Node faz o papel do schtasks: roda em qualquer sistema, inclusive
// no CI (Linux).
const NODE = process.execPath;

module.exports = [
    {
        name: 'runWindowsCommand devolve a saida e ok quando o comando termina com 0',
        async run() {
            const resultado = await runWindowsCommand(NODE, ['-e', 'process.stdout.write("pronto")']);

            assert.deepEqual(resultado, { ok: true, stdout: 'pronto', stderr: '', error: '' });
        }
    },
    {
        // Codigo de saida diferente de zero e resposta do comando (ex.: "tarefa
        // nao encontrada"), nao falha de execucao: quem chama le stdout/stderr.
        name: 'runWindowsCommand com codigo de saida diferente de zero e ok false sem error',
        async run() {
            const resultado = await runWindowsCommand(NODE, [
                '-e',
                'process.stderr.write("Acesso negado"); process.exit(3)'
            ]);

            assert.equal(resultado.ok, false);
            assert.equal(resultado.stderr, 'Acesso negado');
            assert.equal(resultado.error, '');
        }
    },
    {
        name: 'runWindowsCommand com executavel inexistente nao lanca e preenche error',
        async run() {
            const resultado = await runWindowsCommand('comando-que-nao-existe-escalas', []);

            assert.equal(resultado.ok, false);
            assert.match(resultado.error, /ENOENT/);
        }
    },
    {
        // T14: com spawnSync, nada mais rodava ate o comando acabar.
        name: 'runWindowsCommand nao trava o servidor enquanto o comando roda',
        async run() {
            let rodouNoMeio = false;
            const comando = runWindowsCommand(NODE, ['-e', 'setTimeout(() => {}, 300)']);

            setImmediate(() => {
                rodouNoMeio = true;
            });

            await comando;
            assert.equal(rodouNoMeio, true);
        }
    }
];

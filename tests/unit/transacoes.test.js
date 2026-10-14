const assert = require('node:assert/strict');

const { withTransaction, withTransactionDescartada } = require('../../backend/db/transactions');

// Imita o sql.Transaction do mssql: registra begin/commit/rollback e deixa
// simular falha no commit e transacao abortada pelo proprio servidor.
function criarSqlFalso({ commitFalha = false, abortarNoServidor = false } = {}) {
    const chamadas = [];

    class Transaction {
        constructor() {
            this.ouvintes = {};
        }

        on(evento, ouvinte) {
            this.ouvintes[evento] = ouvinte;
        }

        async begin() {
            chamadas.push('begin');
        }

        async commit() {
            chamadas.push('commit');

            if (commitFalha) {
                throw new Error('commit falhou');
            }
        }

        async rollback() {
            chamadas.push('rollback');
        }

        abortar() {
            this.ouvintes.rollback?.(true);
        }
    }

    return { sql: { Transaction }, chamadas, abortarNoServidor };
}

module.exports = [
    {
        name: 'withTransaction confirma quando a tarefa da certo',
        async run() {
            const { sql, chamadas } = criarSqlFalso();

            assert.equal(await withTransaction(sql, {}, async () => 'ok'), 'ok');
            assert.deepEqual(chamadas, ['begin', 'commit']);
        }
    },
    {
        name: 'withTransaction desfaz e relanca quando a tarefa falha',
        async run() {
            const { sql, chamadas } = criarSqlFalso();

            await assert.rejects(
                withTransaction(sql, {}, async () => {
                    throw new Error('falhou');
                }),
                /falhou/
            );
            assert.deepEqual(chamadas, ['begin', 'rollback']);
        }
    },
    {
        name: 'withTransaction tenta desfazer quando o proprio commit falha',
        async run() {
            const { sql, chamadas } = criarSqlFalso({ commitFalha: true });

            await assert.rejects(
                withTransaction(sql, {}, async () => 'ok'),
                /commit falhou/
            );
            assert.deepEqual(chamadas, ['begin', 'commit', 'rollback']);
        }
    },
    {
        name: 'withTransaction nao desfaz de novo a transacao que o servidor ja abortou',
        async run() {
            const { sql, chamadas } = criarSqlFalso();

            await assert.rejects(
                withTransaction(sql, {}, async (tx) => {
                    tx.abortar();
                    throw new Error('erro grave');
                }),
                /erro grave/
            );
            assert.deepEqual(chamadas, ['begin']);
        }
    },
    {
        // T8: as leituras da escala geram as linhas numa transacao e respondem
        // com elas, mas nao podem deixar nada gravado.
        name: 'withTransactionDescartada devolve o resultado e desfaz em vez de confirmar',
        async run() {
            const { sql, chamadas } = criarSqlFalso();

            assert.deepEqual(await withTransactionDescartada(sql, {}, async () => ({ linhas: 3 })), { linhas: 3 });
            assert.deepEqual(chamadas, ['begin', 'rollback']);
        }
    },
    {
        name: 'withTransactionDescartada desfaz uma vez so e relanca quando a tarefa falha',
        async run() {
            const { sql, chamadas } = criarSqlFalso();

            await assert.rejects(
                withTransactionDescartada(sql, {}, async () => {
                    throw new Error('falhou');
                }),
                /falhou/
            );
            assert.deepEqual(chamadas, ['begin', 'rollback']);
        }
    }
];

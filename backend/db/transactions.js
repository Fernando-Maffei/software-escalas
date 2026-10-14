// Executa `task` numa transacao: commit se tudo der certo, rollback se lancar.
//
// O SQL Server as vezes aborta a transacao sozinho (erros graves, XACT_ABORT)
// e ai um rollback manual falharia com "no corresponding BEGIN TRANSACTION".
// Isso e detectado pelo evento publico 'rollback' do mssql (aborted = true),
// em vez de ler o campo privado _aborted.
async function executarEmTransacao(sql, pool, task, { confirmar }) {
    const transaction = new sql.Transaction(pool);
    let abortadaPeloServidor = false;

    transaction.on('rollback', (aborted) => {
        if (aborted) {
            abortadaPeloServidor = true;
        }
    });

    async function desfazer() {
        if (abortadaPeloServidor) {
            return;
        }

        try {
            await transaction.rollback();
        } catch (rollbackError) {
            // O que importa e o resultado (ou o erro original); a falha do
            // rollback so fica registrada.
            console.error('[transacao] falha ao desfazer a transacao:', rollbackError);
        }
    }

    await transaction.begin();

    let result;

    try {
        result = await task(transaction);

        if (confirmar) {
            await transaction.commit();
        }
    } catch (error) {
        await desfazer();
        throw error;
    }

    if (!confirmar) {
        await desfazer();
    }

    return result;
}

async function withTransaction(sql, pool, task) {
    return executarEmTransacao(sql, pool, task, { confirmar: true });
}

// Roda `task` numa transacao e DESFAZ tudo no fim, mesmo dando certo: devolve
// o resultado sem deixar nada gravado. E o que as leituras da escala usam — o
// gerador monta a escala do periodo gravando em escala_dia, e a resposta sai
// dessas linhas, mas uma consulta nao pode deixar rastro no banco.
async function withTransactionDescartada(sql, pool, task) {
    return executarEmTransacao(sql, pool, task, { confirmar: false });
}

module.exports = {
    withTransaction,
    withTransactionDescartada
};

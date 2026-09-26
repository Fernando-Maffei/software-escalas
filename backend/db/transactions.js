// Executa `task` numa transacao: commit se tudo der certo, rollback se lancar.
//
// O SQL Server as vezes aborta a transacao sozinho (erros graves, XACT_ABORT)
// e ai um rollback manual falharia com "no corresponding BEGIN TRANSACTION".
// Isso e detectado pelo evento publico 'rollback' do mssql (aborted = true),
// em vez de ler o campo privado _aborted.
async function withTransaction(sql, pool, task) {
    const transaction = new sql.Transaction(pool);
    let abortadaPeloServidor = false;

    transaction.on('rollback', (aborted) => {
        if (aborted) {
            abortadaPeloServidor = true;
        }
    });

    await transaction.begin();

    try {
        const result = await task(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        if (!abortadaPeloServidor) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                // O erro que importa e o original (relancado abaixo); a falha do
                // rollback so fica registrada.
                console.error('[transacao] falha ao desfazer a transacao:', rollbackError);
            }
        }

        throw error;
    }
}

module.exports = {
    withTransaction
};

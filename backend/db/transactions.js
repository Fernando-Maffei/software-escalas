async function withTransaction(sql, pool, task) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const result = await task(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        if (transaction._aborted !== true) {
            await transaction.rollback().catch(() => {});
        }

        throw error;
    }
}

module.exports = {
    withTransaction
};

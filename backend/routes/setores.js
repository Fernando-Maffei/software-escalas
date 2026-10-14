const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../db/transactions');
const { listSetores, normalizeSetorNome } = require('../services/setores');

const router = express.Router();

router.get('/', async (req, res) => {
    const pool = await conectar();
    const includeInactive = String(req.query.includeInactive || '').trim().toLowerCase() === 'true';

    const items = await listSetores(pool, {
        onlyActive: !includeInactive
    });

    res.json(items);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const nome = normalizeSetorNome(req.body?.nome);

    const result = await withTransaction(sql, pool, async (tx) => {
        const existing = await tx.request()
            .input('nome', sql.NVarChar(120), nome)
            .query(`
                SELECT TOP 1
                    Id,
                    Nome,
                    Ativo,
                    Ordem,
                    CriadoEm,
                    AtualizadoEm
                FROM Setores
                WHERE Nome = @nome
            `);

        if (existing.recordset.length > 0) {
            return {
                action: 'existing',
                record: existing.recordset[0]
            };
        }

        const ordemResult = await tx.request().query('SELECT COALESCE(MAX(Ordem), 0) AS maxOrdem FROM Setores');
        const nextOrder = Number(ordemResult.recordset[0]?.maxOrdem || 0) + 1;

        const inserted = await tx.request()
            .input('nome', sql.NVarChar(120), nome)
            .input('ordem', sql.Int, nextOrder)
            .query(`
                INSERT INTO Setores (Nome, Ordem)
                OUTPUT INSERTED.*
                VALUES (@nome, @ordem)
            `);

        return {
            action: 'created',
            record: inserted.recordset[0]
        };
    });

    res.status(result.action === 'created' ? 201 : 200).json({
        success: true,
        action: result.action,
        message: result.action === 'created'
            ? 'Setor criado com sucesso!'
            : 'Setor ja existente.',
        data: result.record
    });
});

module.exports = router;

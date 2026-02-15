const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// Listar todos os colaboradores
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request().query('SELECT * FROM Colaboradores ORDER BY Nome');
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao listar colaboradores:", err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar colaborador por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Colaboradores WHERE Id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "Colaborador não encontrado" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Erro ao buscar colaborador:", err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar colaborador
router.post('/', async (req, res) => {
    const { nome, trabalhoInicio, trabalhoFim, almocoInicio, almocoFim } = req.body;

    if (!nome) {
        return res.status(400).json({ error: "Nome é obrigatório." });
    }

    try {
        const pool = await conectar();

        await pool.request()
            .input('nome', sql.NVarChar(300), nome)
            .input('trabalhoInicio', sql.Time, trabalhoInicio ? new Date(`1970-01-01T${trabalhoInicio}:00`) : null)
            .input('trabalhoFim', sql.Time, trabalhoFim ? new Date(`1970-01-01T${trabalhoFim}:00`) : null)
            .input('almocoInicio', sql.Time, almocoInicio ? new Date(`1970-01-01T${almocoInicio}:00`) : null)
            .input('almocoFim', sql.Time, almocoFim ? new Date(`1970-01-01T${almocoFim}:00`) : null)
            .query(`
                INSERT INTO Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim)
                VALUES (@nome, @trabalhoInicio, @trabalhoFim, @almocoInicio, @almocoFim)
            `);

        res.json({ message: 'Colaborador adicionado com sucesso!', success: true });
    } catch (err) {
        console.error("ERRO SQL:", err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar colaborador
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, trabalhoInicio, trabalhoFim, almocoInicio, almocoFim } = req.body;

    try {
        const pool = await conectar();

        // Verifica se o colaborador existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Colaboradores WHERE Id = @id');

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Colaborador não encontrado" });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar(300), nome || null)
            .input('trabalhoInicio', sql.Time, trabalhoInicio ? new Date(`1970-01-01T${trabalhoInicio}:00`) : null)
            .input('trabalhoFim', sql.Time, trabalhoFim ? new Date(`1970-01-01T${trabalhoFim}:00`) : null)
            .input('almocoInicio', sql.Time, almocoInicio ? new Date(`1970-01-01T${almocoInicio}:00`) : null)
            .input('almocoFim', sql.Time, almocoFim ? new Date(`1970-01-01T${almocoFim}:00`) : null)
            .query(`
                UPDATE Colaboradores
                SET 
                    Nome = COALESCE(@nome, Nome),
                    TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim,
                    AlmocoInicio = @almocoInicio,
                    AlmocoFim = @almocoFim
                WHERE Id = @id
            `);

        res.json({ message: 'Colaborador atualizado com sucesso!', success: true });
    } catch (err) {
        console.error("Erro ao atualizar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Excluir colaborador
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();

        // Verifica se o colaborador existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Colaboradores WHERE Id = @id');

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Colaborador não encontrado" });
        }

        // Verifica se existem ausências vinculadas
        const checkAusencias = await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('SELECT COUNT(*) as total FROM Ausencias WHERE ColaboradorId = @colaboradorId');

        if (checkAusencias.recordset[0].total > 0) {
            return res.status(400).json({ 
                error: "Não é possível excluir: colaborador possui lançamentos vinculados" 
            });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Colaboradores WHERE Id = @id');

        res.json({ message: 'Colaborador excluído com sucesso!', success: true });
    } catch (err) {
        console.error("Erro ao excluir:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
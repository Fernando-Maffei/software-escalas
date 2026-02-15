const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// Listar ausencias
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request().query('SELECT * FROM Ausencias');
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao listar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar ausencia
router.post('/', async (req, res) => {
    const { colaboradorId, tipo, dataInicio, dataFim } = req.body;

    if (!colaboradorId || !tipo || !dataInicio || !dataFim) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    try {
        const pool = await conectar();
        await pool.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('tipo', sql.NVarChar, tipo)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .query('INSERT INTO Ausencias (ColaboradorId, Tipo, DataInicio, DataFim) VALUES (@colaboradorId, @tipo, @dataInicio, @dataFim)');

        res.json({ message: 'Ausência adicionada!', success: true });
    } catch (err) {
        console.error("Erro ao adicionar:", err);
        res.status(500).json({ error: err.message });
    }
});

// 🔥 ROTA PUT (editar) - ADICIONAR
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { colaboradorId, tipo, dataInicio, dataFim } = req.body;

    if (!colaboradorId || !tipo || !dataInicio || !dataFim) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    try {
        const pool = await conectar();
        
        // Verifica se o registro existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Ausencias WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Lançamento não encontrado" });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('tipo', sql.NVarChar, tipo)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .query(`
                UPDATE Ausencias 
                SET ColaboradorId = @colaboradorId, 
                    Tipo = @tipo, 
                    DataInicio = @dataInicio, 
                    DataFim = @dataFim 
                WHERE Id = @id
            `);

        res.json({ message: 'Ausência atualizada!', success: true });
    } catch (err) {
        console.error("Erro ao atualizar:", err);
        res.status(500).json({ error: err.message });
    }
});

// 🔥 ROTA DELETE (excluir) - ADICIONAR
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();
        
        // Verifica se o registro existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Ausencias WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Lançamento não encontrado" });
        }

        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Ausencias WHERE Id = @id');

        res.json({ 
            message: 'Ausência excluída!', 
            success: true,
            rowsAffected: result.rowsAffected[0]
        });
    } catch (err) {
        console.error("Erro ao excluir:", err);
        res.status(500).json({ error: err.message });
    }
});

// Rota para buscar ausências por colaborador (opcional)
router.get('/colaborador/:colaboradorId', async (req, res) => {
    const { colaboradorId } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .query('SELECT * FROM Ausencias WHERE ColaboradorId = @colaboradorId ORDER BY DataInicio DESC');

        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao buscar por colaborador:", err);
        res.status(500).json({ error: err.message });
    }
});

// Rota para buscar ausências por período (opcional)
router.get('/periodo', async (req, res) => {
    const { dataInicio, dataFim } = req.query;

    try {
        const pool = await conectar();
        let query = 'SELECT * FROM Ausencias WHERE 1=1';
        
        if (dataInicio) {
            query += ` AND DataInicio >= '${dataInicio}'`;
        }
        if (dataFim) {
            query += ` AND DataFim <= '${dataFim}'`;
        }
        
        query += ' ORDER BY DataInicio DESC';
        
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao buscar por período:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
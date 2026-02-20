const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// Listar ausencias
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request().query('SELECT * FROM Ausencias ORDER BY DataInicio DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao listar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar ausencia
router.post('/', async (req, res) => {
    const { colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim } = req.body;

    if (!colaboradorId || !tipo || !dataInicio || !dataFim) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    // Validação para período com horas
    if (periodoTipo === 'horas' && (!horaInicio || !horaFim)) {
        return res.status(400).json({ error: "Horas são obrigatórias para período de horas" });
    }

    try {
        const pool = await conectar();
        
        const request = pool.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('tipo', sql.NVarChar, tipo)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .input('periodoTipo', sql.NVarChar(20), periodoTipo || 'dia_inteiro');

        // Adiciona horas apenas se for período de horas
        if (periodoTipo === 'horas' && horaInicio && horaFim) {
            request.input('horaInicio', sql.Time, horaInicio)
                   .input('horaFim', sql.Time, horaFim);
        } else {
            request.input('horaInicio', sql.Time, null)
                   .input('horaFim', sql.Time, null);
        }

        await request.query(`
            INSERT INTO Ausencias (
                ColaboradorId, Tipo, DataInicio, DataFim, 
                PeriodoTipo, HoraInicio, HoraFim, DataCadastro
            ) VALUES (
                @colaboradorId, @tipo, @dataInicio, @dataFim,
                @periodoTipo, @horaInicio, @horaFim, GETDATE()
            )
        `);

        res.json({ message: 'Ausência adicionada!', success: true });
    } catch (err) {
        console.error("Erro ao adicionar:", err);
        res.status(500).json({ error: err.message });
    }
});

// ROTA PUT (editar)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim } = req.body;

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

        const request = pool.request()
            .input('id', sql.Int, id)
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('tipo', sql.NVarChar, tipo)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .input('periodoTipo', sql.NVarChar(20), periodoTipo || 'dia_inteiro');

        if (periodoTipo === 'horas' && horaInicio && horaFim) {
            request.input('horaInicio', sql.Time, horaInicio)
                   .input('horaFim', sql.Time, horaFim);
        } else {
            request.input('horaInicio', sql.Time, null)
                   .input('horaFim', sql.Time, null);
        }

        await request.query(`
            UPDATE Ausencias 
            SET ColaboradorId = @colaboradorId, 
                Tipo = @tipo, 
                DataInicio = @dataInicio, 
                DataFim = @dataFim,
                PeriodoTipo = @periodoTipo,
                HoraInicio = @horaInicio,
                HoraFim = @horaFim
            WHERE Id = @id
        `);

        res.json({ message: 'Ausência atualizada!', success: true });
    } catch (err) {
        console.error("Erro ao atualizar:", err);
        res.status(500).json({ error: err.message });
    }
});

// ROTA DELETE
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();
        
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Ausencias WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Lançamento não encontrado" });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Ausencias WHERE Id = @id');

        res.json({ message: 'Ausência excluída!', success: true });
    } catch (err) {
        console.error("Erro ao excluir:", err);
        res.status(500).json({ error: err.message });
    }
});

// Rota para buscar ausências por colaborador
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

module.exports = router;
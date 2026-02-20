const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// Listar todos os feriados
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request()
            .query('SELECT * FROM Feriados ORDER BY Data');
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao listar feriados:", err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar feriado por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Feriados WHERE Id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "Feriado não encontrado" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Erro ao buscar feriado:", err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar feriados por ano
router.get('/ano/:ano', async (req, res) => {
    const { ano } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('ano', sql.Int, ano)
            .query(`
                SELECT * FROM Feriados 
                WHERE YEAR(Data) = @ano 
                ORDER BY Data
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao buscar feriados por ano:", err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar feriados por mês/ano
router.get('/mes/:ano/:mes', async (req, res) => {
    const { ano, mes } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('ano', sql.Int, ano)
            .input('mes', sql.Int, mes)
            .query(`
                SELECT * FROM Feriados 
                WHERE YEAR(Data) = @ano AND MONTH(Data) = @mes
                ORDER BY Data
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro ao buscar feriados por mês:", err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar feriado
router.post('/', async (req, res) => {
    const { nome, data, tipo } = req.body;

    if (!nome || !data) {
        return res.status(400).json({ error: "Nome e data são obrigatórios" });
    }

    try {
        const pool = await conectar();
        
        // Verificar se já existe feriado na mesma data
        const checkResult = await pool.request()
            .input('data', sql.Date, data)
            .query('SELECT Id FROM Feriados WHERE Data = @data');
        
        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: "Já existe um feriado cadastrado nesta data" });
        }

        await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('data', sql.Date, data)
            .input('tipo', sql.NVarChar, tipo || 'municipal')
            .query(`
                INSERT INTO Feriados (Nome, Data, Tipo) 
                VALUES (@nome, @data, @tipo)
            `);

        res.json({ 
            message: 'Feriado adicionado com sucesso!', 
            success: true 
        });
    } catch (err) {
        console.error("Erro ao adicionar feriado:", err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar feriado
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, data, tipo } = req.body;

    try {
        const pool = await conectar();
        
        // Verificar se o feriado existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Feriados WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Feriado não encontrado" });
        }

        // Verificar se a nova data já está em uso por outro feriado
        if (data) {
            const dataCheck = await pool.request()
                .input('data', sql.Date, data)
                .input('id', sql.Int, id)
                .query('SELECT Id FROM Feriados WHERE Data = @data AND Id != @id');
            
            if (dataCheck.recordset.length > 0) {
                return res.status(400).json({ error: "Já existe outro feriado nesta data" });
            }
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome || null)
            .input('data', sql.Date, data || null)
            .input('tipo', sql.NVarChar, tipo || null)
            .query(`
                UPDATE Feriados 
                SET 
                    Nome = COALESCE(@nome, Nome),
                    Data = COALESCE(@data, Data),
                    Tipo = COALESCE(@tipo, Tipo)
                WHERE Id = @id
            `);

        res.json({ 
            message: 'Feriado atualizado com sucesso!', 
            success: true 
        });
    } catch (err) {
        console.error("Erro ao atualizar feriado:", err);
        res.status(500).json({ error: err.message });
    }
});

// Excluir feriado
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await conectar();
        
        // Verificar se o feriado existe
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Feriados WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Feriado não encontrado" });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Feriados WHERE Id = @id');

        res.json({ 
            message: 'Feriado excluído com sucesso!', 
            success: true 
        });
    } catch (err) {
        console.error("Erro ao excluir feriado:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
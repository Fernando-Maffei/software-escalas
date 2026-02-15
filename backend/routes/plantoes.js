const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// ================= LISTAR TODOS OS PLANTÕES =================
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request()
            .query('SELECT * FROM plantoes ORDER BY data_plantao DESC');
        
        // Converte o JSON string de volta para array
        const plantoes = result.recordset.map(row => ({
            id: row.id,
            data_plantao: row.data_plantao,
            dataISO: row.data_plantao.toISOString().split('T')[0],
            colaboradores: JSON.parse(row.colaboradores_ids),
            criado_em: row.criado_em,
            atualizado_em: row.atualizado_em
        }));
        
        res.json(plantoes);
    } catch (err) {
        console.error("Erro ao listar plantões:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= BUSCAR PLANTÃO POR DATA =================
router.get('/:dataISO', async (req, res) => {
    const { dataISO } = req.params;

    try {
        const pool = await conectar();
        const result = await pool.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('SELECT * FROM plantoes WHERE data_plantao = @data_plantao');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "Plantão não encontrado" });
        }

        const row = result.recordset[0];
        res.json({
            id: row.id,
            data_plantao: row.data_plantao,
            dataISO: row.data_plantao.toISOString().split('T')[0],
            colaboradores: JSON.parse(row.colaboradores_ids),
            criado_em: row.criado_em,
            atualizado_em: row.atualizado_em
        });
    } catch (err) {
        console.error("Erro ao buscar plantão:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= CRIAR OU ATUALIZAR PLANTÃO =================
router.post('/', async (req, res) => {
    const { dataISO, colaboradores } = req.body;

    if (!dataISO || !colaboradores) {
        return res.status(400).json({ error: "Data e colaboradores são obrigatórios" });
    }

    try {
        const pool = await conectar();
        
        // Verifica se já existe plantão para esta data
        const checkResult = await pool.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('SELECT id FROM plantoes WHERE data_plantao = @data_plantao');
        
        if (checkResult.recordset.length > 0) {
            // Atualiza existente
            await pool.request()
                .input('colaboradores_ids', sql.NVarChar, JSON.stringify(colaboradores))
                .input('data_plantao', sql.Date, dataISO)
                .query('UPDATE plantoes SET colaboradores_ids = @colaboradores_ids WHERE data_plantao = @data_plantao');
            
            res.json({ 
                message: 'Plantão atualizado com sucesso!', 
                success: true,
                action: 'updated' 
            });
        } else {
            // Cria novo
            await pool.request()
                .input('data_plantao', sql.Date, dataISO)
                .input('colaboradores_ids', sql.NVarChar, JSON.stringify(colaboradores))
                .query('INSERT INTO plantoes (data_plantao, colaboradores_ids) VALUES (@data_plantao, @colaboradores_ids)');
            
            res.json({ 
                message: 'Plantão criado com sucesso!', 
                success: true,
                action: 'created' 
            });
        }
        
    } catch (err) {
        console.error("Erro ao salvar plantão:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= EXCLUIR PLANTÃO =================
router.delete('/:dataISO', async (req, res) => {
    const { dataISO } = req.params;

    try {
        const pool = await conectar();
        
        // Verifica se o plantão existe
        const checkResult = await pool.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('SELECT id FROM plantoes WHERE data_plantao = @data_plantao');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: "Plantão não encontrado" });
        }

        await pool.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('DELETE FROM plantoes WHERE data_plantao = @data_plantao');

        res.json({ 
            message: 'Plantão excluído com sucesso!', 
            success: true 
        });
        
    } catch (err) {
        console.error("Erro ao excluir plantão:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= LISTAR PRÓXIMOS SÁBADOS (opcional) =================
router.get('/proximos/:quantidade', async (req, res) => {
    const { quantidade } = req.params;
    const hoje = new Date();
    const sabados = [];
    
    // Encontra o próximo sábado
    const proximoSabado = new Date(hoje);
    while (proximoSabado.getDay() !== 6) {
        proximoSabado.setDate(proximoSabado.getDate() + 1);
    }
    
    // Gera a quantidade solicitada de sábados
    for (let i = 0; i < parseInt(quantidade); i++) {
        const data = new Date(proximoSabado);
        data.setDate(data.getDate() + (i * 7));
        
        sabados.push({
            dataISO: data.toISOString().split('T')[0],
            dataFormatada: data.toLocaleDateString('pt-BR'),
            dia: data.getDate(),
            mes: data.getMonth() + 1,
            ano: data.getFullYear()
        });
    }
    
    res.json(sabados);
});

module.exports = router;
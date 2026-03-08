const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');

// Listar ausencias
router.get('/', async (req, res) => {
    try {
        const pool = await conectar();
        const result = await pool.request().query(`
            SELECT 
                Id,
                ColaboradorId,
                Tipo,
                DataInicio,
                DataFim,
                DataCadastro,
                PeriodoTipo,
                HoraInicio,
                HoraFim
            FROM Ausencias 
            ORDER BY DataInicio DESC
        `);
        
        console.log(`📊 Enviando ${result.recordset.length} ausências`);
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Erro ao listar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar ausencia
router.post('/', async (req, res) => {
    console.log("=".repeat(50));
    console.log("📥 ROTA POST /ausencias ACIONADA");
    console.log("=".repeat(50));
    
    let { colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim } = req.body;
    
    console.log("📦 Dados recebidos (RAW):", { 
        colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim 
    });

    // Validações básicas
    if (!colaboradorId || !tipo || !dataInicio || !dataFim) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    try {
        const pool = await conectar();
        
        const request = pool.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('tipo', sql.NVarChar, tipo)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .input('periodoTipo', sql.NVarChar(20), periodoTipo || 'dia_inteiro');

        // TRATAMENTO CORRETO DAS HORAS
        if (periodoTipo === 'horas' && horaInicio && horaFim) {
            console.log("⏰ Processando horas...");
            
            // Garantir que as horas têm o formato HH:mm:ss
            let horaInicioFormatada = horaInicio;
            let horaFimFormatada = horaFim;
            
            if (horaInicio.length === 5 && horaInicio.includes(':')) {
                horaInicioFormatada = horaInicio + ':00';
            }
            if (horaFim.length === 5 && horaFim.includes(':')) {
                horaFimFormatada = horaFim + ':00';
            }
            
            console.log("⏰ Horas formatadas:", { horaInicioFormatada, horaFimFormatada });
            
            // Criar objetos Date completos
            const dataReferencia = '1970-01-01';
            const horaInicioDate = new Date(`${dataReferencia}T${horaInicioFormatada}`);
            const horaFimDate = new Date(`${dataReferencia}T${horaFimFormatada}`);
            
            console.log("⏰ Objetos Date criados:", {
                inicio: horaInicioDate.toISOString(),
                fim: horaFimDate.toISOString()
            });
            
            if (isNaN(horaInicioDate.getTime()) || isNaN(horaFimDate.getTime())) {
                throw new Error(`Horas inválidas: ${horaInicio} ou ${horaFim}`);
            }
            
            request.input('horaInicio', sql.Time, horaInicioDate)
                   .input('horaFim', sql.Time, horaFimDate);
        } else {
            request.input('horaInicio', sql.Time, null)
                   .input('horaFim', sql.Time, null);
        }

        const query = `
            INSERT INTO Ausencias (
                ColaboradorId, Tipo, DataInicio, DataFim, 
                PeriodoTipo, HoraInicio, HoraFim, DataCadastro
            ) VALUES (
                @colaboradorId, @tipo, @dataInicio, @dataFim,
                @periodoTipo, @horaInicio, @horaFim, GETDATE()
            )
        `;
        
        console.log("📝 Executando query...");
        await request.query(query);
        
        // Buscar o registro recém-criado
        const result = await pool.request()
            .query('SELECT TOP 1 * FROM Ausencias ORDER BY Id DESC');
        
        console.log("✅ Ausência salva com sucesso!");
        res.json({ 
            message: 'Ausência adicionada!', 
            success: true,
            data: result.recordset[0]
        });
        
    } catch (err) {
        console.error("❌ ERRO DETALHADO:");
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Editar ausencia
router.put('/:id', async (req, res) => {
    console.log("=".repeat(50));
    console.log("📥 ROTA PUT /ausencias ACIONADA - ID:", req.params.id);
    console.log("=".repeat(50));
    
    const { id } = req.params;
    let { colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim } = req.body;
    
    console.log("📦 Dados recebidos (RAW):", { 
        id, colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim 
    });

    // Validações básicas
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

        // TRATAMENTO CORRETO DAS HORAS
        if (periodoTipo === 'horas' && horaInicio && horaFim) {
            console.log("⏰ Processando horas para atualização...");
            
            let horaInicioFormatada = horaInicio;
            let horaFimFormatada = horaFim;
            
            if (horaInicio && horaInicio.length === 5 && horaInicio.includes(':')) {
                horaInicioFormatada = horaInicio + ':00';
            }
            if (horaFim && horaFim.length === 5 && horaFim.includes(':')) {
                horaFimFormatada = horaFim + ':00';
            }
            
            console.log("⏰ Horas formatadas:", { horaInicioFormatada, horaFimFormatada });
            
            const dataReferencia = '1970-01-01';
            const horaInicioDate = new Date(`${dataReferencia}T${horaInicioFormatada}`);
            const horaFimDate = new Date(`${dataReferencia}T${horaFimFormatada}`);
            
            console.log("⏰ Objetos Date criados:", {
                inicio: horaInicioDate.toISOString(),
                fim: horaFimDate.toISOString()
            });
            
            if (isNaN(horaInicioDate.getTime()) || isNaN(horaFimDate.getTime())) {
                throw new Error(`Horas inválidas: ${horaInicio} ou ${horaFim}`);
            }
            
            request.input('horaInicio', sql.Time, horaInicioDate)
                   .input('horaFim', sql.Time, horaFimDate);
        } else {
            request.input('horaInicio', sql.Time, null)
                   .input('horaFim', sql.Time, null);
        }

        const query = `
            UPDATE Ausencias 
            SET ColaboradorId = @colaboradorId, 
                Tipo = @tipo, 
                DataInicio = @dataInicio, 
                DataFim = @dataFim,
                PeriodoTipo = @periodoTipo,
                HoraInicio = @horaInicio,
                HoraFim = @horaFim
            WHERE Id = @id
        `;
        
        console.log("📝 Executando query...");
        await request.query(query);
        
        // Buscar o registro atualizado
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Ausencias WHERE Id = @id');
        
        console.log("✅ Ausência atualizada com sucesso!");
        res.json({ 
            message: 'Ausência atualizada!', 
            success: true,
            data: result.recordset[0]
        });
        
    } catch (err) {
        console.error("❌ ERRO DETALHADO:");
        console.error(err);
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
const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const { syncColaboradorDefaultsToEscalaDia } = require('../utils/escala');
const { getBancoHorasCapabilities, getSchemaInfo, hasTable } = require('../utils/schema');
const { withTransaction } = require('../utils/transactions');
const {
    ensurePositiveInt,
    extractTimeString,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('../utils/validation');

function buildColaboradorPayload(body, fallback = {}) {
    const nome = body.nome !== undefined
        ? normalizeOptionalText(body.nome, 'Nome', { maxLength: 300 })
        : normalizeOptionalText(fallback.Nome || fallback.nome, 'Nome', { maxLength: 300 });

    if (!nome) {
        throw new AppError(400, 'Nome é obrigatório.');
    }

    const trabalhoInicio = body.trabalhoInicio !== undefined
        ? normalizeNullableTime(body.trabalhoInicio, 'Início do trabalho')
        : extractTimeString(fallback.TrabalhoInicio || fallback.trabalhoInicio);

    const trabalhoFim = body.trabalhoFim !== undefined
        ? normalizeNullableTime(body.trabalhoFim, 'Fim do trabalho')
        : extractTimeString(fallback.TrabalhoFim || fallback.trabalhoFim);

    const almocoInicio = body.almocoInicio !== undefined
        ? normalizeNullableTime(body.almocoInicio, 'Início do almoço')
        : extractTimeString(fallback.AlmocoInicio || fallback.almocoInicio);

    const almocoFim = body.almocoFim !== undefined
        ? normalizeNullableTime(body.almocoFim, 'Fim do almoço')
        : extractTimeString(fallback.AlmocoFim || fallback.almocoFim);

    validateWorkSchedule({
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    });

    return {
        nome,
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    };
}

async function findColaboradorById(pool, id) {
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM Colaboradores WHERE Id = @id');

    return result.recordset[0] || null;
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const request = pool.request();
    const clauses = [];
    const search = (req.query.search || '').trim();

    if (search) {
        request.input('search', sql.NVarChar(300), `%${search}%`);
        clauses.push('Nome LIKE @search');
    }

    const query = `
        SELECT * FROM Colaboradores
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY Nome
    `;

    const result = await request.query(query);
    res.json(result.recordset);
});

router.get('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const colaborador = await findColaboradorById(pool, id);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador não encontrado.');
    }

    res.json(colaborador);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const payload = buildColaboradorPayload(req.body);

    const result = await pool.request()
        .input('nome', sql.NVarChar(300), payload.nome)
        .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Início do trabalho'))
        .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
        .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Início do almoço'))
        .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoço'))
        .query(`
            INSERT INTO Colaboradores (Nome, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim)
            OUTPUT INSERTED.*
            VALUES (@nome, @trabalhoInicio, @trabalhoFim, @almocoInicio, @almocoFim)
        `);

    res.status(201).json({
        message: 'Colaborador adicionado com sucesso!',
        success: true,
        data: result.recordset[0]
    });
});

router.put('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const existing = await findColaboradorById(pool, id);
    const schema = await getSchemaInfo(pool);

    if (!existing) {
        throw new AppError(404, 'Colaborador não encontrado.');
    }

    const payload = buildColaboradorPayload(req.body, existing);
    const saved = await withTransaction(sql, pool, async (tx) => {
        const result = await tx.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar(300), payload.nome)
            .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Início do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Início do almoço'))
            .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoço'))
            .query(`
                UPDATE Colaboradores
                SET
                    Nome = @nome,
                    TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim,
                    AlmocoInicio = @almocoInicio,
                    AlmocoFim = @almocoFim
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);
        const colaboradorSalvo = result.recordset[0];

        if (hasTable(schema, 'escala_dia')) {
            await syncColaboradorDefaultsToEscalaDia(tx, schema, colaboradorSalvo);
        }

        return colaboradorSalvo;
    });

    res.json({
        message: 'Colaborador atualizado com sucesso!',
        success: true,
        data: saved
    });
});

router.delete('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const colaborador = await findColaboradorById(pool, id);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador não encontrado.');
    }

    const checkAusencias = await pool.request()
        .input('colaboradorId', sql.Int, id)
        .query('SELECT COUNT(*) AS total FROM Ausencias WHERE ColaboradorId = @colaboradorId');

    if (checkAusencias.recordset[0].total > 0) {
        throw new AppError(400, 'Não é possível excluir: colaborador possui lançamentos vinculados.');
    }

    const plantoes = await pool.request()
        .query('SELECT id, colaboradores_ids FROM plantoes');

    for (const plantao of plantoes.recordset) {
        let colaboradoresIds = [];

        try {
            colaboradoresIds = JSON.parse(plantao.colaboradores_ids || '[]');
        } catch (error) {
            colaboradoresIds = [];
        }

        if (!Array.isArray(colaboradoresIds) || !colaboradoresIds.includes(id)) {
            continue;
        }

        const atualizados = colaboradoresIds.filter((colaboradorId) => colaboradorId !== id);

        await pool.request()
            .input('id', sql.Int, plantao.id)
            .input('colaboradores_ids', sql.NVarChar(sql.MAX), JSON.stringify(atualizados))
            .query(`
                UPDATE plantoes
                SET colaboradores_ids = @colaboradores_ids, atualizado_em = GETDATE()
                WHERE id = @id
            `);
    }

    if (getBancoHorasCapabilities(schema).hasMovimentosTable) {
        await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('DELETE FROM BancoHorasMovimentos WHERE ColaboradorId = @colaboradorId');
    }

    if (hasTable(schema, 'escala_dia')) {
        await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('DELETE FROM escala_dia WHERE colaborador_id = @colaboradorId');
    }

    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Colaboradores WHERE Id = @id');

    res.json({
        message: 'Colaborador excluído com sucesso!',
        success: true
    });
});

module.exports = router;

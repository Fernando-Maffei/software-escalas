const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    ensurePositiveInt,
    extractDateString,
    normalizeIsoDate,
    normalizeOptionalText
} = require('../utils/validation');

function buildFeriadoPayload(body, fallback = {}) {
    const nome = body.nome !== undefined
        ? normalizeOptionalText(body.nome, 'Nome', { maxLength: 200 })
        : normalizeOptionalText(fallback.Nome || fallback.nome, 'Nome', { maxLength: 200 });

    const data = body.data !== undefined
        ? normalizeIsoDate(body.data, 'Data')
        : normalizeIsoDate(extractDateString(fallback.Data || fallback.data), 'Data');

    const tipo = body.tipo !== undefined
        ? normalizeOptionalText(body.tipo, 'Tipo', { maxLength: 50 })
        : normalizeOptionalText(fallback.Tipo || fallback.tipo, 'Tipo', { maxLength: 50 });

    if (!nome) {
        throw new AppError(400, 'Nome é obrigatório.');
    }

    return {
        nome,
        data,
        tipo: tipo || 'municipal'
    };
}

async function findFeriadoById(pool, id) {
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM Feriados WHERE Id = @id');

    return result.recordset[0] || null;
}

async function listFeriados(pool, filters = {}) {
    const request = pool.request();
    const clauses = [];

    if (filters.ano) {
        request.input('ano', sql.Int, ensurePositiveInt(filters.ano, 'Ano'));
        clauses.push('YEAR(Data) = @ano');
    }

    if (filters.mes) {
        const mes = ensurePositiveInt(filters.mes, 'Mês');

        if (mes > 12) {
            throw new AppError(400, 'Mês inválido.');
        }

        request.input('mes', sql.Int, mes);
        clauses.push('MONTH(Data) = @mes');
    }

    if (filters.tipo) {
        request.input('tipo', sql.NVarChar(50), String(filters.tipo).trim().toLowerCase());
        clauses.push('LOWER(Tipo) = @tipo');
    }

    if (filters.search) {
        request.input('search', sql.NVarChar(200), `%${String(filters.search).trim()}%`);
        clauses.push('Nome LIKE @search');
    }

    const query = `
        SELECT * FROM Feriados
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY Data
    `;

    const result = await request.query(query);
    return result.recordset;
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const feriados = await listFeriados(pool, req.query);
    res.json(feriados);
});

router.get('/ano/:ano', async (req, res) => {
    const pool = await conectar();
    const feriados = await listFeriados(pool, { ano: req.params.ano });
    res.json(feriados);
});

router.get('/mes/:ano/:mes', async (req, res) => {
    const pool = await conectar();
    const feriados = await listFeriados(pool, {
        ano: req.params.ano,
        mes: req.params.mes
    });
    res.json(feriados);
});

router.get('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Feriado');
    const pool = await conectar();
    const feriado = await findFeriadoById(pool, id);

    if (!feriado) {
        throw new AppError(404, 'Feriado não encontrado.');
    }

    res.json(feriado);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const payload = buildFeriadoPayload(req.body);

    const checkResult = await pool.request()
        .input('data', sql.Date, payload.data)
        .query('SELECT Id FROM Feriados WHERE Data = @data');

    if (checkResult.recordset.length > 0) {
        throw new AppError(400, 'Já existe um feriado cadastrado nesta data.');
    }

    const result = await pool.request()
        .input('nome', sql.NVarChar(200), payload.nome)
        .input('data', sql.Date, payload.data)
        .input('tipo', sql.NVarChar(50), payload.tipo)
        .query(`
            INSERT INTO Feriados (Nome, Data, Tipo)
            OUTPUT INSERTED.*
            VALUES (@nome, @data, @tipo)
        `);

    res.status(201).json({
        message: 'Feriado adicionado com sucesso!',
        success: true,
        data: result.recordset[0]
    });
});

router.put('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Feriado');
    const pool = await conectar();
    const existing = await findFeriadoById(pool, id);

    if (!existing) {
        throw new AppError(404, 'Feriado não encontrado.');
    }

    const payload = buildFeriadoPayload(req.body, existing);

    const dataCheck = await pool.request()
        .input('data', sql.Date, payload.data)
        .input('id', sql.Int, id)
        .query('SELECT Id FROM Feriados WHERE Data = @data AND Id != @id');

    if (dataCheck.recordset.length > 0) {
        throw new AppError(400, 'Já existe outro feriado nesta data.');
    }

    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('nome', sql.NVarChar(200), payload.nome)
        .input('data', sql.Date, payload.data)
        .input('tipo', sql.NVarChar(50), payload.tipo)
        .query(`
            UPDATE Feriados
            SET
                Nome = @nome,
                Data = @data,
                Tipo = @tipo
            OUTPUT INSERTED.*
            WHERE Id = @id
        `);

    res.json({
        message: 'Feriado atualizado com sucesso!',
        success: true,
        data: result.recordset[0]
    });
});

router.delete('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Feriado');
    const pool = await conectar();
    const feriado = await findFeriadoById(pool, id);

    if (!feriado) {
        throw new AppError(404, 'Feriado não encontrado.');
    }

    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Feriados WHERE Id = @id');

    res.json({
        message: 'Feriado excluído com sucesso!',
        success: true
    });
});

module.exports = router;

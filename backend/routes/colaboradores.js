const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const { getSetoresPermitidosRequest, idsPermitidosNumericos } = require('../utils/acesso-setores');
const { syncColaboradorDefaultsToEscalaDia } = require('../utils/escala');
const {
    listJornadaSemanal,
    normalizeJornadaSemanalPayload,
    replaceColaboradorJornadaSemanal
} = require('../utils/jornada-semanal');
const { getBancoHorasCapabilities, getSchemaInfo, hasTable } = require('../utils/schema');
const { ensureSetorExists, normalizeNullableSetorId } = require('../utils/setores');
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
        throw new AppError(400, 'Nome e obrigatorio.');
    }

    const trabalhoInicio = body.trabalhoInicio !== undefined
        ? normalizeNullableTime(body.trabalhoInicio, 'Inicio do trabalho')
        : extractTimeString(fallback.TrabalhoInicio || fallback.trabalhoInicio);

    const trabalhoFim = body.trabalhoFim !== undefined
        ? normalizeNullableTime(body.trabalhoFim, 'Fim do trabalho')
        : extractTimeString(fallback.TrabalhoFim || fallback.trabalhoFim);

    const almocoInicio = body.almocoInicio !== undefined
        ? normalizeNullableTime(body.almocoInicio, 'Inicio do almoco')
        : extractTimeString(fallback.AlmocoInicio || fallback.almocoInicio);

    const almocoFim = body.almocoFim !== undefined
        ? normalizeNullableTime(body.almocoFim, 'Fim do almoco')
        : extractTimeString(fallback.AlmocoFim || fallback.almocoFim);

    const setorId = body.setorId !== undefined
        ? normalizeNullableSetorId(body.setorId, 'Setor')
        : normalizeNullableSetorId(fallback.SetorId || fallback.setorId, 'Setor');

    validateWorkSchedule({
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    });

    return {
        nome,
        setorId,
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    };
}

function hasSetorSupport(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    return capabilities.hasSetoresTable && capabilities.hasColaboradorSetorId;
}

function buildColaboradorSelectQuery(schema, options = {}) {
    const { whereClause = '', single = false } = options;
    const selectSetor = hasSetorSupport(schema)
        ? 's.Nome AS SetorNome'
        : 'CAST(NULL AS NVARCHAR(120)) AS SetorNome';
    const joinSetor = hasSetorSupport(schema)
        ? 'LEFT JOIN Setores s ON s.Id = c.SetorId'
        : '';
    const topClause = single ? 'TOP 1' : '';

    return `
        SELECT ${topClause}
            c.*,
            ${selectSetor}
        FROM Colaboradores c
        ${joinSetor}
        ${whereClause}
        ORDER BY c.Nome
    `;
}

async function findColaboradorById(pool, id) {
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM Colaboradores WHERE Id = @id');

    return result.recordset[0] || null;
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const request = pool.request();
    const clauses = [];
    const search = (req.query.search || '').trim();

    if (search) {
        request.input('search', sql.NVarChar(300), `%${search}%`);
        clauses.push('c.Nome LIKE @search');
    }

    if (req.query.setorId && hasSetorSupport(schema)) {
        request.input('setorId', sql.Int, ensurePositiveInt(req.query.setorId, 'Setor'));
        clauses.push('c.SetorId = @setorId');
    }

    // Controle de acesso por setor: a conta so ve colaboradores dos setores que
    // tem permissao. Como as telas (Escala, Dashboard, Plantao) derivam desta
    // lista, filtrar aqui ja as limita. Vazio = sem restricao (ve todos).
    if (hasSetorSupport(schema)) {
        const permitidos = await getSetoresPermitidosRequest(pool, req);

        if (permitidos.length) {
            const ids = idsPermitidosNumericos(permitidos);

            if (ids.length) {
                const params = ids.map((id, index) => {
                    request.input(`perm${index}`, sql.Int, id);
                    return `@perm${index}`;
                });
                clauses.push(`c.SetorId IN (${params.join(', ')})`);
            } else {
                clauses.push('1 = 0'); // permitidos invalidos: nao vaza ninguem
            }
        }
    }

    const query = buildColaboradorSelectQuery(schema, {
        whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    });
    const result = await request.query(query);

    res.json(result.recordset);
});

router.get('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query(buildColaboradorSelectQuery(schema, {
            single: true,
            whereClause: 'WHERE c.Id = @id'
        }));
    const colaborador = result.recordset[0] || null;

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    // Controle de acesso por setor: nao revela colaborador de setor sem
    // permissao (404, para nao confirmar sequer a existencia).
    if (hasSetorSupport(schema)) {
        const permitidos = await getSetoresPermitidosRequest(pool, req);

        if (permitidos.length) {
            const ids = idsPermitidosNumericos(permitidos);

            if (!ids.includes(Number(colaborador.SetorId))) {
                throw new AppError(404, 'Colaborador nao encontrado.');
            }
        }
    }

    res.json(colaborador);
});

router.get('/:id/jornada-semanal', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const colaborador = await findColaboradorById(pool, colaboradorId);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const items = await listJornadaSemanal(pool, schema, {
        colaboradorId,
        onlyActive: true,
        allowMissingTable: true
    });

    res.json({
        colaboradorId,
        items
    });
});

router.post('/:id/jornada-semanal', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const payloadSource = req.body?.jornadaSemanal !== undefined
        ? req.body.jornadaSemanal
        : req.body;
    const jornadaSemanal = normalizeJornadaSemanalPayload(payloadSource, {
        fieldName: 'Jornada semanal'
    }) || [];
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const items = await withTransaction(sql, pool, async (tx) => replaceColaboradorJornadaSemanal(
        tx,
        schema,
        colaboradorId,
        jornadaSemanal
    ));

    res.json({
        message: 'Jornada semanal salva com sucesso!',
        success: true,
        data: {
            colaboradorId,
            items
        }
    });
});

router.put('/:id/jornada-semanal', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const payloadSource = req.body?.jornadaSemanal !== undefined
        ? req.body.jornadaSemanal
        : req.body;
    const jornadaSemanal = normalizeJornadaSemanalPayload(payloadSource, {
        fieldName: 'Jornada semanal'
    }) || [];
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const items = await withTransaction(sql, pool, async (tx) => replaceColaboradorJornadaSemanal(
        tx,
        schema,
        colaboradorId,
        jornadaSemanal
    ));

    res.json({
        message: 'Jornada semanal atualizada com sucesso!',
        success: true,
        data: {
            colaboradorId,
            items
        }
    });
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const supportsSetor = hasSetorSupport(schema);
    const payload = buildColaboradorPayload(req.body);
    const jornadaSemanal = normalizeJornadaSemanalPayload(req.body?.jornadaSemanal, {
        fieldName: 'jornadaSemanal'
    });

    if (jornadaSemanal !== undefined && !hasTable(schema, 'ColaboradorJornadaSemanal')) {
        throw new AppError(409, 'O banco atual ainda nao possui a tabela de jornada semanal. Verifique/atualize as tabelas antes de salvar a jornada.');
    }

    const created = await withTransaction(sql, pool, async (tx) => {
        if (!supportsSetor && payload.setorId) {
            throw new AppError(409, 'O banco atual ainda nao possui o campo de setor. Use a opcao de verificar/gerar tabelas antes de salvar com setor.');
        }

        await ensureSetorExists(tx, supportsSetor ? payload.setorId : null);

        const fields = ['Nome', 'TrabalhoInicio', 'TrabalhoFim', 'AlmocoInicio', 'AlmocoFim'];
        const values = ['@nome', '@trabalhoInicio', '@trabalhoFim', '@almocoInicio', '@almocoFim'];
        const request = tx.request()
            .input('nome', sql.NVarChar(300), payload.nome)
            .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoco'));

        if (supportsSetor) {
            fields.splice(1, 0, 'SetorId');
            values.splice(1, 0, '@setorId');
            request.input('setorId', sql.Int, payload.setorId);
        }

        const result = await request.query(`
            INSERT INTO Colaboradores (${fields.join(', ')})
            OUTPUT INSERTED.*
            VALUES (${values.join(', ')})
        `);
        const colaboradorSalvo = result.recordset[0];

        if (jornadaSemanal !== undefined && hasTable(schema, 'ColaboradorJornadaSemanal')) {
            await replaceColaboradorJornadaSemanal(tx, schema, colaboradorSalvo.Id, jornadaSemanal);
        }

        return colaboradorSalvo;
    });

    res.status(201).json({
        message: 'Colaborador adicionado com sucesso!',
        success: true,
        data: created
    });
});

router.put('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const existing = await findColaboradorById(pool, id);
    const schema = await getSchemaInfo(pool);
    const supportsSetor = hasSetorSupport(schema);
    const jornadaSemanal = normalizeJornadaSemanalPayload(req.body?.jornadaSemanal, {
        fieldName: 'jornadaSemanal'
    });

    if (jornadaSemanal !== undefined && !hasTable(schema, 'ColaboradorJornadaSemanal')) {
        throw new AppError(409, 'O banco atual ainda nao possui a tabela de jornada semanal. Verifique/atualize as tabelas antes de salvar a jornada.');
    }

    if (!existing) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const payload = buildColaboradorPayload(req.body, existing);
    const saved = await withTransaction(sql, pool, async (tx) => {
        if (!supportsSetor && payload.setorId) {
            throw new AppError(409, 'O banco atual ainda nao possui o campo de setor. Use a opcao de verificar/gerar tabelas antes de salvar com setor.');
        }

        await ensureSetorExists(tx, supportsSetor ? payload.setorId : null);

        const setParts = [
            'Nome = @nome',
            'TrabalhoInicio = @trabalhoInicio',
            'TrabalhoFim = @trabalhoFim',
            'AlmocoInicio = @almocoInicio',
            'AlmocoFim = @almocoFim'
        ];
        const request = tx.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar(300), payload.nome)
            .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoco'));

        if (supportsSetor) {
            setParts.splice(1, 0, 'SetorId = @setorId');
            request.input('setorId', sql.Int, payload.setorId);
        }

        const result = await request.query(`
            UPDATE Colaboradores
            SET ${setParts.join(', ')}
            OUTPUT INSERTED.*
            WHERE Id = @id
        `);
        const colaboradorSalvo = result.recordset[0];

        if (jornadaSemanal !== undefined && hasTable(schema, 'ColaboradorJornadaSemanal')) {
            await replaceColaboradorJornadaSemanal(tx, schema, colaboradorSalvo.Id, jornadaSemanal);
        }

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
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const checkAusencias = await pool.request()
        .input('colaboradorId', sql.Int, id)
        .query('SELECT COUNT(*) AS total FROM Ausencias WHERE ColaboradorId = @colaboradorId');

    if (checkAusencias.recordset[0].total > 0) {
        throw new AppError(400, 'Nao e possivel excluir: colaborador possui lancamentos vinculados.');
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

    if (hasTable(schema, 'ColaboradorJornadaSemanal')) {
        await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('DELETE FROM ColaboradorJornadaSemanal WHERE ColaboradorId = @colaboradorId');
    }

    // Almocos personalizados (o ajuste de almoco por dia/periodo) ficavam
    // para tras quando o colaborador era excluido, virando linhas orfas
    // apontando para um Id que nao existe mais.
    if (hasTable(schema, 'AlmocosPersonalizados')) {
        await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('DELETE FROM AlmocosPersonalizados WHERE ColaboradorId = @colaboradorId');
    }

    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Colaboradores WHERE Id = @id');

    res.json({
        message: 'Colaborador excluido com sucesso!',
        success: true
    });
});

module.exports = router;

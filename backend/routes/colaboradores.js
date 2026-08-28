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
const { getBancoHorasCapabilities, getSchemaInfo, hasColumn, hasTable } = require('../utils/schema');
const { ensureSetorExists, normalizeNullableSetorId } = require('../utils/setores');
const { withTransaction } = require('../utils/transactions');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
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

    // Soft delete: por padrao esconde colaboradores desligados (Ativo = 0). As
    // telas ativas (Escala, Calendario, Plantao, Dashboard) derivam desta lista,
    // entao o desligado some delas de uma vez. `?incluirInativos=1` traz todos
    // (usado pela tela de limpeza/gestao).
    const incluirInativos = String(req.query.incluirInativos || '') === '1';

    if (!incluirInativos && hasColumn(schema, 'Colaboradores', 'Ativo')) {
        clauses.push('c.Ativo = 1');
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

// Desliga o colaborador (soft delete): esconde das telas ativas, mas mantem o
// historico no banco. DataDesligamento e a referencia para a limpeza posterior.
router.put('/:id/desligar', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    if (!hasColumn(schema, 'Colaboradores', 'Ativo') || !hasColumn(schema, 'Colaboradores', 'DataDesligamento')) {
        throw new AppError(400, 'Atualize o banco: faltam as colunas de desligamento.');
    }

    const colaborador = await findColaboradorById(pool, id);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const dataDesligamento = req.body?.dataDesligamento
        ? normalizeIsoDate(req.body.dataDesligamento, 'Data de desligamento')
        : extractDateString(new Date());

    await pool.request()
        .input('id', sql.Int, id)
        .input('data', sql.Date, dataDesligamento)
        .query('UPDATE Colaboradores SET Ativo = 0, DataDesligamento = @data WHERE Id = @id');

    res.json({
        success: true,
        message: 'Colaborador desligado. O historico foi preservado.',
        data: { id, ativo: false, dataDesligamento }
    });
});

// Reativa um colaborador desligado (desfaz o desligamento).
router.put('/:id/reativar', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    if (!hasColumn(schema, 'Colaboradores', 'Ativo')) {
        throw new AppError(400, 'Atualize o banco: falta a coluna Ativo.');
    }

    const colaborador = await findColaboradorById(pool, id);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    await pool.request()
        .input('id', sql.Int, id)
        .query('UPDATE Colaboradores SET Ativo = 1, DataDesligamento = NULL WHERE Id = @id');

    res.json({ success: true, message: 'Colaborador reativado.', data: { id, ativo: true } });
});

// Exclusao DEFINITIVA (limpeza). So permitida para quem ja esta desligado E cuja
// data de desligamento ja passou (fim do periodo de retencao). Agora sim cascata
// completa, inclusive Ausencias e banco de horas semanal.
router.delete('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const colaborador = await findColaboradorById(pool, id);

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    if (hasColumn(schema, 'Colaboradores', 'Ativo')) {
        const ativo = colaborador.Ativo === true || colaborador.Ativo === 1;

        if (ativo) {
            throw new AppError(400, 'Desligue o colaborador antes de excluir definitivamente.');
        }

        const dataDesligamento = extractDateString(colaborador.DataDesligamento);
        const hojeISO = extractDateString(new Date());

        if (!dataDesligamento || dataDesligamento > hojeISO) {
            throw new AppError(400, 'A exclusao definitiva so e permitida apos a data de desligamento (periodo de retencao ainda vigente).');
        }
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

    if (hasTable(schema, 'BancoHorasSemanal')) {
        await pool.request()
            .input('colaboradorId', sql.Int, id)
            .query('DELETE FROM BancoHorasSemanal WHERE ColaboradorId = @colaboradorId');
    }

    // Na limpeza pos-retencao, as ausencias tambem sao removidas (o historico
    // ja passou do periodo de guarda). Antes, elas BLOQUEAVAM a exclusao.
    await pool.request()
        .input('colaboradorId', sql.Int, id)
        .query('DELETE FROM Ausencias WHERE ColaboradorId = @colaboradorId');

    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Colaboradores WHERE Id = @id');

    res.json({
        message: 'Colaborador e historico excluidos definitivamente.',
        success: true
    });
});

module.exports = router;

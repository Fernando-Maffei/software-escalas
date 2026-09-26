const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { getSetoresPermitidosRequest, idsPermitidosNumericos } = require('../auth/acesso-setores');
const { syncColaboradorDefaultsToEscalaDia } = require('../services/escala');
const {
    listJornadaSemanal,
    normalizeJornadaSemanalPayload,
    replaceColaboradorJornadaSemanal
} = require('../services/jornada-semanal');
const { getSchemaInfo } = require('../db/schema');
const { excluirColaboradorDefinitivamente } = require('../services/exclusao-colaborador');
const { ensureSetorExists, normalizeNullableSetorId } = require('../services/setores');
const { withTransaction } = require('../db/transactions');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('../lib/validation');

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

    // O tipo de escala e so o VINCULO (o molde que este colaborador segue).
    // Ele nao reescreve a jornada semanal sozinho: quem aplica o padrao e o
    // botao da tela (POST /tipos-escala/:id/aplicar/:colaboradorId) ou a
    // propria jornada enviada neste save. Assim o tipo nunca contradiz em
    // silencio os dias que estao gravados.
    const tipoEscalaId = body.tipoEscalaId !== undefined
        ? normalizeNullableId(body.tipoEscalaId, 'Tipo de escala')
        : normalizeNullableId(fallback.TipoEscalaId ?? fallback.tipoEscalaId, 'Tipo de escala');

    return {
        nome,
        setorId,
        tipoEscalaId,
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    };
}

function normalizeNullableId(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return ensurePositiveInt(value, fieldName);
}

function buildColaboradorSelectQuery(options = {}) {
    const { whereClause = '', single = false } = options;
    const topClause = single ? 'TOP 1' : '';

    return `
        SELECT ${topClause}
            c.*,
            s.Nome AS SetorNome
        FROM Colaboradores c
        LEFT JOIN Setores s ON s.Id = c.SetorId
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
    const request = pool.request();
    const clauses = [];
    const search = String(req.query.search || '').trim();

    if (search) {
        request.input('search', sql.NVarChar(300), `%${search}%`);
        clauses.push('c.Nome LIKE @search');
    }

    if (req.query.setorId) {
        request.input('setorId', sql.Int, ensurePositiveInt(req.query.setorId, 'Setor'));
        clauses.push('c.SetorId = @setorId');
    }

    // Controle de acesso por setor: a conta so ve colaboradores dos setores que
    // tem permissao. Como as telas (Escala, Dashboard, Plantao) derivam desta
    // lista, filtrar aqui ja as limita. Vazio = sem restricao (ve todos).
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

    // Soft delete: por padrao esconde colaboradores desligados (Ativo = 0). As
    // telas ativas (Escala, Calendario, Plantao, Dashboard) derivam desta lista,
    // entao o desligado some delas de uma vez. `?incluirInativos=1` traz todos
    // (usado pela tela de limpeza/gestao).
    if (String(req.query.incluirInativos || '') !== '1') {
        clauses.push('c.Ativo = 1');
    }

    const query = buildColaboradorSelectQuery({
        whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    });
    const result = await request.query(query);

    res.json(result.recordset);
});

router.get('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query(buildColaboradorSelectQuery({
            single: true,
            whereClause: 'WHERE c.Id = @id'
        }));
    const colaborador = result.recordset[0] || null;

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    // Controle de acesso por setor: nao revela colaborador de setor sem
    // permissao (404, para nao confirmar sequer a existencia).
    const permitidos = await getSetoresPermitidosRequest(pool, req);

    if (permitidos.length && !idsPermitidosNumericos(permitidos).includes(Number(colaborador.SetorId))) {
        throw new AppError(404, 'Colaborador nao encontrado.');
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

// POST e PUT fazem a mesma coisa (substituem a jornada inteira); as duas rotas
// existem porque telas diferentes usam uma ou outra.
function salvarJornadaSemanal(mensagem) {
    return async (req, res) => {
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
            message: mensagem,
            success: true,
            data: {
                colaboradorId,
                items
            }
        });
    };
}

router.post('/:id/jornada-semanal', salvarJornadaSemanal('Jornada semanal salva com sucesso!'));
router.put('/:id/jornada-semanal', salvarJornadaSemanal('Jornada semanal atualizada com sucesso!'));

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const payload = buildColaboradorPayload(req.body);
    const jornadaSemanal = normalizeJornadaSemanalPayload(req.body?.jornadaSemanal, {
        fieldName: 'jornadaSemanal'
    });

    const created = await withTransaction(sql, pool, async (tx) => {
        await ensureSetorExists(tx, payload.setorId);

        const result = await tx.request()
            .input('nome', sql.NVarChar(300), payload.nome)
            .input('setorId', sql.Int, payload.setorId)
            .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoco'))
            .input('tipoEscalaId', sql.Int, payload.tipoEscalaId)
            .query(`
                INSERT INTO Colaboradores (Nome, SetorId, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim, TipoEscalaId)
                OUTPUT INSERTED.*
                VALUES (@nome, @setorId, @trabalhoInicio, @trabalhoFim, @almocoInicio, @almocoFim, @tipoEscalaId)
            `);
        const colaboradorSalvo = result.recordset[0];

        if (jornadaSemanal !== undefined) {
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
    const jornadaSemanal = normalizeJornadaSemanalPayload(req.body?.jornadaSemanal, {
        fieldName: 'jornadaSemanal'
    });

    if (!existing) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const payload = buildColaboradorPayload(req.body, existing);
    const saved = await withTransaction(sql, pool, async (tx) => {
        await ensureSetorExists(tx, payload.setorId);

        const result = await tx.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar(300), payload.nome)
            .input('setorId', sql.Int, payload.setorId)
            .input('trabalhoInicio', sql.Time, toSqlTime(payload.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(payload.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(payload.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(payload.almocoFim, 'Fim do almoco'))
            .input('tipoEscalaId', sql.Int, payload.tipoEscalaId)
            .query(`
                UPDATE Colaboradores
                SET Nome = @nome,
                    SetorId = @setorId,
                    TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim,
                    AlmocoInicio = @almocoInicio,
                    AlmocoFim = @almocoFim,
                    TipoEscalaId = @tipoEscalaId
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);
        const colaboradorSalvo = result.recordset[0];

        if (jornadaSemanal !== undefined) {
            await replaceColaboradorJornadaSemanal(tx, schema, colaboradorSalvo.Id, jornadaSemanal);
        }

        await syncColaboradorDefaultsToEscalaDia(tx, schema, colaboradorSalvo);

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
// data de desligamento ja passou (fim do periodo de retencao). A cascata inteira
// esta em services/exclusao-colaborador.js e roda numa transacao so.
router.delete('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();

    await withTransaction(sql, pool, (tx) => excluirColaboradorDefinitivamente(tx, id));

    res.json({
        message: 'Colaborador e historico excluidos definitivamente.',
        success: true
    });
});

module.exports = router;

const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    calculateAusenciaDebitMinutes,
    describeAusenciaMovement,
    normalizeSubtipo,
    resolveDefaultDescontaBancoHoras
} = require('../utils/bancoHoras');
const { getBancoHorasCapabilities, getSchemaInfo, hasTable } = require('../utils/schema');
const {
    restoreEscalaDefaultsForPeriod,
    syncAusenciaToEscalaDia
} = require('../utils/escala');
const { withTransaction } = require('../utils/transactions');
const {
    buildDateRange,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime
} = require('../utils/validation');

const AUSENCIA_TIPOS = ['folga', 'ausencia', 'ferias'];
const PERIODO_TIPOS = ['dia_inteiro', 'horas'];

function buildAusenciasSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'Id',
        'ColaboradorId',
        'Tipo',
        'DataInicio',
        'DataFim',
        'DataCadastro',
        'PeriodoTipo',
        'HoraInicio',
        'HoraFim'
    ];

    if (capabilities.hasAusenciaSubtipo) {
        columns.push('Subtipo');
    }

    if (capabilities.hasAusenciaDesconta) {
        columns.push('DescontaBancoHoras');
    }

    if (capabilities.hasAusenciaObservacao) {
        columns.push('Observacao');
    }

    return columns.join(',\n            ');
}

async function findAusenciaById(poolOrTx, id, schema) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query(`
            SELECT
                ${buildAusenciasSelect(schema)}
            FROM Ausencias
            WHERE Id = @id
        `);

    return result.recordset[0] || null;
}

async function getColaboradorById(poolOrTx, colaboradorId) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT * FROM Colaboradores WHERE Id = @id');

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    return result.recordset[0];
}

function resolveDefaultSubtipo(tipo, value) {
    const normalizedValue = normalizeSubtipo(value);

    if (normalizedValue) {
        return normalizedValue;
    }

    if (tipo === 'ferias') {
        return 'ferias';
    }

    if (tipo === 'folga') {
        return 'folga';
    }

    return 'comum';
}

function buildAusenciaPayload(body, fallback = {}, schema) {
    const capabilities = getBancoHorasCapabilities(schema);

    const colaboradorId = body.colaboradorId !== undefined
        ? ensurePositiveInt(body.colaboradorId, 'Colaborador')
        : ensurePositiveInt(fallback.ColaboradorId || fallback.colaboradorId, 'Colaborador');

    const tipo = body.tipo !== undefined
        ? normalizeEnum(body.tipo, 'Tipo', AUSENCIA_TIPOS)
        : normalizeEnum(fallback.Tipo || fallback.tipo, 'Tipo', AUSENCIA_TIPOS);

    const { dataInicio, dataFim } = buildDateRange(
        body.dataInicio !== undefined ? body.dataInicio : extractDateString(fallback.DataInicio || fallback.dataInicio),
        body.dataFim !== undefined ? body.dataFim : extractDateString(fallback.DataFim || fallback.dataFim)
    );

    const periodoTipo = body.periodoTipo !== undefined
        ? normalizeEnum(body.periodoTipo, 'Tipo de periodo', PERIODO_TIPOS, { defaultValue: 'dia_inteiro' })
        : normalizeEnum(fallback.PeriodoTipo || fallback.periodoTipo || 'dia_inteiro', 'Tipo de periodo', PERIODO_TIPOS, {
            defaultValue: 'dia_inteiro'
        });

    let horaInicio = null;
    let horaFim = null;

    if (periodoTipo === 'horas') {
        horaInicio = body.horaInicio !== undefined
            ? normalizeNullableTime(body.horaInicio, 'Hora inicial')
            : extractTimeString(fallback.HoraInicio || fallback.horaInicio);

        horaFim = body.horaFim !== undefined
            ? normalizeNullableTime(body.horaFim, 'Hora final')
            : extractTimeString(fallback.HoraFim || fallback.horaFim);

        if (!horaInicio || !horaFim) {
            throw new AppError(400, 'Hora inicial e hora final sao obrigatorias para lancamentos por horas.');
        }

        if (dataInicio !== dataFim) {
            throw new AppError(400, 'Lancamentos por horas devem acontecer no mesmo dia.');
        }
    }

    if (tipo === 'ferias' && periodoTipo === 'horas') {
        throw new AppError(400, 'Ferias devem ser lancadas como dia inteiro.');
    }

    const fallbackSubtipo = capabilities.hasAusenciaSubtipo
        ? (fallback.Subtipo || fallback.subtipo)
        : null;

    const subtipo = resolveDefaultSubtipo(
        tipo,
        body.subtipo !== undefined ? body.subtipo : fallbackSubtipo
    );

    const fallbackDesconto = capabilities.hasAusenciaDesconta
        ? fallback.DescontaBancoHoras
        : undefined;

    const descontaBancoHoras = body.descontaBancoHoras !== undefined
        ? normalizeBoolean(body.descontaBancoHoras, 'Desconto do banco de horas')
        : normalizeBoolean(fallbackDesconto, 'Desconto do banco de horas', {
            defaultValue: resolveDefaultDescontaBancoHoras(tipo, subtipo)
        });

    const fallbackObservacao = capabilities.hasAusenciaObservacao
        ? (fallback.Observacao || fallback.observacao)
        : null;

    const observacao = body.observacao !== undefined
        ? normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 })
        : normalizeOptionalText(fallbackObservacao, 'Observacao', { maxLength: 500 });

    return {
        colaboradorId,
        tipo,
        dataInicio,
        dataFim,
        periodoTipo,
        horaInicio,
        horaFim,
        subtipo,
        descontaBancoHoras,
        observacao
    };
}

async function deleteAusenciaMovement(poolOrTx, ausenciaId) {
    await poolOrTx.request()
        .input('origemTipo', sql.NVarChar(30), 'ausencia')
        .input('origemId', sql.Int, ausenciaId)
        .query(`
            DELETE FROM BancoHorasMovimentos
            WHERE OrigemTipo = @origemTipo
              AND OrigemId = @origemId
        `);
}

async function syncAusenciaMovement(poolOrTx, schema, ausencia, colaborador) {
    const capabilities = getBancoHorasCapabilities(schema);

    if (!capabilities.hasMovimentosTable) {
        return { synced: false, skippedReason: 'movimentos_table_missing' };
    }

    await deleteAusenciaMovement(poolOrTx, ausencia.Id);

    const minutosDebito = calculateAusenciaDebitMinutes(ausencia, colaborador);

    if (minutosDebito <= 0) {
        return { synced: false, skippedReason: 'no_debit' };
    }

    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaborador.Id)
        .input('dataReferencia', sql.Date, extractDateString(ausencia.DataInicio))
        .input('minutos', sql.Int, minutosDebito * -1)
        .input('origemTipo', sql.NVarChar(30), 'ausencia')
        .input('origemId', sql.Int, ausencia.Id)
        .input('descricao', sql.NVarChar(255), describeAusenciaMovement(ausencia))
        .input('observacao', sql.NVarChar(500), ausencia.Observacao || null)
        .query(`
            MERGE BancoHorasMovimentos AS target
            USING (
                SELECT
                    @colaboradorId AS ColaboradorId,
                    @origemTipo AS OrigemTipo,
                    @origemId AS OrigemId
            ) AS source
            ON target.ColaboradorId = source.ColaboradorId
               AND target.OrigemTipo = source.OrigemTipo
               AND target.OrigemId = source.OrigemId
            WHEN MATCHED THEN UPDATE SET
                DataReferencia = @dataReferencia,
                Minutos = @minutos,
                Descricao = @descricao,
                Observacao = @observacao
            WHEN NOT MATCHED THEN INSERT (
                ColaboradorId,
                DataReferencia,
                Minutos,
                OrigemTipo,
                OrigemId,
                Descricao,
                Observacao
            ) VALUES (
                @colaboradorId,
                @dataReferencia,
                @minutos,
                @origemTipo,
                @origemId,
                @descricao,
                @observacao
            )
            OUTPUT INSERTED.*;
        `);

    return {
        synced: true,
        movimento: result.recordset[0]
    };
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const request = pool.request();
    const clauses = [];

    if (req.query.colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(req.query.colaboradorId, 'Colaborador'));
        clauses.push('ColaboradorId = @colaboradorId');
    }

    if (req.query.tipo) {
        request.input('tipo', sql.NVarChar(30), normalizeEnum(req.query.tipo, 'Tipo', AUSENCIA_TIPOS));
        clauses.push('LOWER(Tipo) = @tipo');
    }

    if (req.query.data) {
        request.input('data', sql.Date, normalizeIsoDate(req.query.data, 'Data'));
        clauses.push('@data BETWEEN DataInicio AND DataFim');
    }

    if (req.query.dataInicio) {
        request.input('dataInicioFiltro', sql.Date, normalizeIsoDate(req.query.dataInicio, 'Data inicial'));
        clauses.push('DataFim >= @dataInicioFiltro');
    }

    if (req.query.dataFim) {
        request.input('dataFimFiltro', sql.Date, normalizeIsoDate(req.query.dataFim, 'Data final'));
        clauses.push('DataInicio <= @dataFimFiltro');
    }

    const result = await request.query(`
        SELECT
            ${buildAusenciasSelect(schema)}
        FROM Ausencias
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY DataInicio DESC, Id DESC
    `);

    res.json(result.recordset);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const payload = buildAusenciaPayload(req.body, {}, schema);

    const result = await withTransaction(sql, pool, async (tx) => {
        const colaborador = await getColaboradorById(tx, payload.colaboradorId);
        const capabilities = getBancoHorasCapabilities(schema);

        const fields = [
            'ColaboradorId',
            'Tipo',
            'DataInicio',
            'DataFim',
            'PeriodoTipo',
            'HoraInicio',
            'HoraFim',
            'DataCadastro'
        ];

        const values = [
            '@colaboradorId',
            '@tipo',
            '@dataInicio',
            '@dataFim',
            '@periodoTipo',
            '@horaInicio',
            '@horaFim',
            'GETDATE()'
        ];

        if (capabilities.hasAusenciaSubtipo) {
            fields.splice(5, 0, 'Subtipo');
            values.splice(5, 0, '@subtipo');
        }

        if (capabilities.hasAusenciaDesconta) {
            fields.splice(fields.length - 1, 0, 'DescontaBancoHoras');
            values.splice(values.length - 1, 0, '@descontaBancoHoras');
        }

        if (capabilities.hasAusenciaObservacao) {
            fields.splice(fields.length - 1, 0, 'Observacao');
            values.splice(values.length - 1, 0, '@observacao');
        }

        const insertResult = await tx.request()
            .input('colaboradorId', sql.Int, payload.colaboradorId)
            .input('tipo', sql.NVarChar(30), payload.tipo)
            .input('dataInicio', sql.Date, payload.dataInicio)
            .input('dataFim', sql.Date, payload.dataFim)
            .input('periodoTipo', sql.NVarChar(20), payload.periodoTipo)
            .input('horaInicio', sql.Time, toSqlTime(payload.horaInicio, 'Hora inicial'))
            .input('horaFim', sql.Time, toSqlTime(payload.horaFim, 'Hora final'))
            .input('subtipo', sql.NVarChar(50), payload.subtipo)
            .input('descontaBancoHoras', sql.Bit, payload.descontaBancoHoras)
            .input('observacao', sql.NVarChar(500), payload.observacao)
            .query(`
                INSERT INTO Ausencias (${fields.join(', ')})
                OUTPUT INSERTED.*
                VALUES (${values.join(', ')})
            `);

        const saved = insertResult.recordset[0];

        if (!saved.Subtipo && capabilities.hasAusenciaSubtipo) {
            saved.Subtipo = payload.subtipo;
        }

        if (saved.DescontaBancoHoras === undefined && capabilities.hasAusenciaDesconta) {
            saved.DescontaBancoHoras = payload.descontaBancoHoras;
        }

        if (saved.Observacao === undefined && capabilities.hasAusenciaObservacao) {
            saved.Observacao = payload.observacao;
        }

        await syncAusenciaMovement(tx, schema, saved, colaborador);

        if (hasTable(schema, 'escala_dia')) {
            await syncAusenciaToEscalaDia(tx, schema, saved, colaborador);
        }

        return saved;
    });

    res.status(201).json({
        message: 'Lancamento salvo com sucesso!',
        success: true,
        data: result
    });
});

router.put('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Lancamento');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    const result = await withTransaction(sql, pool, async (tx) => {
        const existing = await findAusenciaById(tx, id, schema);

        if (!existing) {
            throw new AppError(404, 'Lancamento nao encontrado.');
        }

        const payload = buildAusenciaPayload(req.body, existing, schema);
        const colaborador = await getColaboradorById(tx, payload.colaboradorId);
        const capabilities = getBancoHorasCapabilities(schema);

        const setParts = [
            'ColaboradorId = @colaboradorId',
            'Tipo = @tipo',
            'DataInicio = @dataInicio',
            'DataFim = @dataFim',
            'PeriodoTipo = @periodoTipo',
            'HoraInicio = @horaInicio',
            'HoraFim = @horaFim'
        ];

        if (capabilities.hasAusenciaSubtipo) {
            setParts.push('Subtipo = @subtipo');
        }

        if (capabilities.hasAusenciaDesconta) {
            setParts.push('DescontaBancoHoras = @descontaBancoHoras');
        }

        if (capabilities.hasAusenciaObservacao) {
            setParts.push('Observacao = @observacao');
        }

        const updateResult = await tx.request()
            .input('id', sql.Int, id)
            .input('colaboradorId', sql.Int, payload.colaboradorId)
            .input('tipo', sql.NVarChar(30), payload.tipo)
            .input('dataInicio', sql.Date, payload.dataInicio)
            .input('dataFim', sql.Date, payload.dataFim)
            .input('periodoTipo', sql.NVarChar(20), payload.periodoTipo)
            .input('horaInicio', sql.Time, toSqlTime(payload.horaInicio, 'Hora inicial'))
            .input('horaFim', sql.Time, toSqlTime(payload.horaFim, 'Hora final'))
            .input('subtipo', sql.NVarChar(50), payload.subtipo)
            .input('descontaBancoHoras', sql.Bit, payload.descontaBancoHoras)
            .input('observacao', sql.NVarChar(500), payload.observacao)
            .query(`
                UPDATE Ausencias
                SET ${setParts.join(', ')}
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);

        const saved = updateResult.recordset[0];

        if (!saved.Subtipo && capabilities.hasAusenciaSubtipo) {
            saved.Subtipo = payload.subtipo;
        }

        if (saved.DescontaBancoHoras === undefined && capabilities.hasAusenciaDesconta) {
            saved.DescontaBancoHoras = payload.descontaBancoHoras;
        }

        if (saved.Observacao === undefined && capabilities.hasAusenciaObservacao) {
            saved.Observacao = payload.observacao;
        }

        await syncAusenciaMovement(tx, schema, saved, colaborador);

        if (hasTable(schema, 'escala_dia')) {
            await restoreEscalaDefaultsForPeriod(
                tx,
                schema,
                extractDateString(existing.DataInicio),
                extractDateString(existing.DataFim),
                { colaboradorId: existing.ColaboradorId }
            );
            await syncAusenciaToEscalaDia(tx, schema, saved, colaborador);
        }

        return saved;
    });

    res.json({
        message: 'Lancamento atualizado com sucesso!',
        success: true,
        data: result
    });
});

router.delete('/:id', async (req, res) => {
    const id = ensurePositiveInt(req.params.id, 'Lancamento');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);

    await withTransaction(sql, pool, async (tx) => {
        const existing = await findAusenciaById(tx, id, schema);

        if (!existing) {
            throw new AppError(404, 'Lancamento nao encontrado.');
        }

        if (getBancoHorasCapabilities(schema).hasMovimentosTable) {
            await deleteAusenciaMovement(tx, id);
        }

        if (hasTable(schema, 'escala_dia')) {
            await tx.request()
                .input('origemTipo', sql.NVarChar(30), 'ausencia')
                .input('origemId', sql.Int, id)
                .query(`
                    DELETE FROM escala_dia
                    WHERE origem_tipo = @origemTipo
                      AND origem_id = @origemId
                `);

            await restoreEscalaDefaultsForPeriod(
                tx,
                schema,
                extractDateString(existing.DataInicio),
                extractDateString(existing.DataFim),
                { colaboradorId: existing.ColaboradorId }
            );
        }

        await tx.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Ausencias WHERE Id = @id');
    });

    res.json({
        message: 'Lancamento excluido com sucesso!',
        success: true
    });
});

router.get('/colaborador/:colaboradorId', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.colaboradorId, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    await getColaboradorById(pool, colaboradorId);

    const result = await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            SELECT
                ${buildAusenciasSelect(schema)}
            FROM Ausencias
            WHERE ColaboradorId = @colaboradorId
            ORDER BY DataInicio DESC, Id DESC
        `);

    res.json(result.recordset);
});

module.exports = router;

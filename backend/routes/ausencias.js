const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { AUSENCIA_PERIODOS: PERIODO_TIPOS, AUSENCIA_TIPOS } = require('../lib/dominio');
const {
    calculateAusenciaDebitMinutes,
    describeAusenciaMovement,
    normalizeSubtipo,
    resolveDefaultDescontaBancoHoras
} = require('../services/bancoHoras');
const {
    restoreEscalaDefaultsForPeriod,
    syncAusenciaToEscalaDia
} = require('../services/escala');
const { withTransaction } = require('../db/transactions');
const { colaboradoresVisiveis, escopoLancamentos, exigirColaboradorVisivel } = require('../auth/acesso-setores');
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
} = require('../lib/validation');


const AUSENCIA_COLUNAS = `
            Id,
            ColaboradorId,
            Tipo,
            DataInicio,
            DataFim,
            DataCadastro,
            PeriodoTipo,
            HoraInicio,
            HoraFim,
            Subtipo,
            DescontaBancoHoras,
            Observacao`;

async function findAusenciaById(poolOrTx, id) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query(`
            SELECT ${AUSENCIA_COLUNAS}
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

function buildAusenciaPayload(body, fallback = {}) {

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

    const fallbackSubtipo = fallback.Subtipo || fallback.subtipo;

    const subtipo = resolveDefaultSubtipo(
        tipo,
        body.subtipo !== undefined ? body.subtipo : fallbackSubtipo
    );

    const fallbackDesconto = fallback.DescontaBancoHoras;

    const descontaBancoHoras = body.descontaBancoHoras !== undefined
        ? normalizeBoolean(body.descontaBancoHoras, 'Desconto do banco de horas')
        : normalizeBoolean(fallbackDesconto, 'Desconto do banco de horas', {
            defaultValue: resolveDefaultDescontaBancoHoras(tipo, subtipo)
        });

    const fallbackObservacao = fallback.Observacao || fallback.observacao;

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

async function syncAusenciaMovement(poolOrTx, ausencia, colaborador) {
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
        SELECT ${AUSENCIA_COLUNAS}
        FROM Ausencias
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY DataInicio DESC, Id DESC
    `);
    // A tela de lancamentos e geral (ver escopoLancamentos); as outras leituras
    // de ausencias (Dashboard, Escala do Dia) seguem limitadas pelo teto.
    const visiveis = escopoLancamentos(req) ? null : await colaboradoresVisiveis(pool, req);

    res.json(visiveis ? result.recordset.filter((linha) => visiveis.has(Number(linha.ColaboradorId))) : result.recordset);
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const payload = buildAusenciaPayload(req.body, {});

    const result = await withTransaction(sql, pool, async (tx) => {
        const colaborador = await getColaboradorById(tx, payload.colaboradorId);

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
                INSERT INTO Ausencias (
                    ColaboradorId, Tipo, DataInicio, DataFim, PeriodoTipo, Subtipo, HoraInicio, HoraFim,
                    DescontaBancoHoras, Observacao, DataCadastro
                )
                OUTPUT INSERTED.*
                VALUES (
                    @colaboradorId, @tipo, @dataInicio, @dataFim, @periodoTipo, @subtipo, @horaInicio, @horaFim,
                    @descontaBancoHoras, @observacao, GETDATE()
                )
            `);

        const saved = insertResult.recordset[0];

        await syncAusenciaMovement(tx, saved, colaborador);
        await syncAusenciaToEscalaDia(tx, saved, colaborador);

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

    const result = await withTransaction(sql, pool, async (tx) => {
        const existing = await findAusenciaById(tx, id);

        if (!existing) {
            throw new AppError(404, 'Lancamento nao encontrado.');
        }

        const payload = buildAusenciaPayload(req.body, existing);
        const colaborador = await getColaboradorById(tx, payload.colaboradorId);

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
                SET ColaboradorId = @colaboradorId,
                    Tipo = @tipo,
                    DataInicio = @dataInicio,
                    DataFim = @dataFim,
                    PeriodoTipo = @periodoTipo,
                    HoraInicio = @horaInicio,
                    HoraFim = @horaFim,
                    Subtipo = @subtipo,
                    DescontaBancoHoras = @descontaBancoHoras,
                    Observacao = @observacao
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);

        const saved = updateResult.recordset[0];

        await syncAusenciaMovement(tx, saved, colaborador);
        await restoreEscalaDefaultsForPeriod(
            tx,
            extractDateString(existing.DataInicio),
            extractDateString(existing.DataFim),
            { colaboradorId: existing.ColaboradorId }
        );
        await syncAusenciaToEscalaDia(tx, saved, colaborador);

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

    await withTransaction(sql, pool, async (tx) => {
        const existing = await findAusenciaById(tx, id);

        if (!existing) {
            throw new AppError(404, 'Lancamento nao encontrado.');
        }

        await deleteAusenciaMovement(tx, id);

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
            extractDateString(existing.DataInicio),
            extractDateString(existing.DataFim),
            { colaboradorId: existing.ColaboradorId }
        );

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
    await getColaboradorById(pool, colaboradorId);
    exigirColaboradorVisivel(await colaboradoresVisiveis(pool, req), colaboradorId);

    const result = await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            SELECT ${AUSENCIA_COLUNAS}
            FROM Ausencias
            WHERE ColaboradorId = @colaboradorId
            ORDER BY DataInicio DESC, Id DESC
        `);

    res.json(result.recordset);
});

module.exports = router;

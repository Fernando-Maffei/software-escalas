const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const {
    ensurePositiveInt,
    extractTimeString,
    normalizeBoolean,
    normalizeNullableTime,
    toSqlTime,
    validateWorkSchedule
} = require('../lib/validation');

const DIAS_SEMANA_VALIDOS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

function normalizeDiaSemana(value, fieldName = 'Dia da semana') {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || !DIAS_SEMANA_VALIDOS.includes(parsed)) {
        throw new AppError(400, `${fieldName} invalido. Use valores de 0 (domingo) a 6 (sabado).`);
    }

    return parsed;
}

function coerceBoolean(value) {
    return value === true || value === 1;
}

function serializeJornadaSemanalRow(row) {
    return {
        id: row.Id ?? row.id ?? null,
        colaboradorId: Number(row.ColaboradorId ?? row.colaboradorId ?? 0) || null,
        diaSemana: Number(row.DiaSemana ?? row.diaSemana ?? 0),
        trabalhoInicio: extractTimeString(row.TrabalhoInicio ?? row.trabalhoInicio),
        trabalhoFim: extractTimeString(row.TrabalhoFim ?? row.trabalhoFim),
        almocoInicio: extractTimeString(row.AlmocoInicio ?? row.almocoInicio),
        almocoFim: extractTimeString(row.AlmocoFim ?? row.almocoFim),
        ativo: coerceBoolean(row.Ativo ?? row.ativo),
        dataCadastro: row.DataCadastro ?? row.dataCadastro ?? null,
        dataAtualizacao: row.DataAtualizacao ?? row.dataAtualizacao ?? null
    };
}

function normalizeJornadaSemanalItem(rawItem, index) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        throw new AppError(400, `Jornada semanal invalida na posicao ${index + 1}.`);
    }

    const diaSemana = normalizeDiaSemana(
        rawItem.diaSemana ?? rawItem.DiaSemana,
        `Dia da semana (${index + 1})`
    );
    const trabalhoInicio = normalizeNullableTime(
        rawItem.trabalhoInicio ?? rawItem.TrabalhoInicio,
        `Inicio do trabalho (${index + 1})`
    );
    const trabalhoFim = normalizeNullableTime(
        rawItem.trabalhoFim ?? rawItem.TrabalhoFim,
        `Fim do trabalho (${index + 1})`
    );
    const almocoInicio = normalizeNullableTime(
        rawItem.almocoInicio ?? rawItem.AlmocoInicio,
        `Inicio do almoco (${index + 1})`
    );
    const almocoFim = normalizeNullableTime(
        rawItem.almocoFim ?? rawItem.AlmocoFim,
        `Fim do almoco (${index + 1})`
    );
    const ativo = normalizeBoolean(rawItem.ativo ?? rawItem.Ativo, 'Status ativo', {
        defaultValue: true
    });

    validateWorkSchedule({
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    });

    if (ativo && (!trabalhoInicio || !trabalhoFim)) {
        throw new AppError(400, `Informe inicio e fim do trabalho para o dia ${diaSemana}.`);
    }

    return {
        diaSemana,
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim,
        ativo
    };
}

function normalizeJornadaSemanalPayload(rawValue, options = {}) {
    const { fieldName = 'jornadaSemanal' } = options;

    if (rawValue === undefined) {
        return undefined;
    }

    const source = rawValue === null ? [] : rawValue;

    if (!Array.isArray(source)) {
        throw new AppError(400, `${fieldName} deve ser uma lista de dias da semana.`);
    }

    const rows = source.map((item, index) => normalizeJornadaSemanalItem(item, index));
    const seenDays = new Set();

    rows.forEach((row) => {
        if (!row.ativo) {
            return;
        }

        if (seenDays.has(row.diaSemana)) {
            throw new AppError(400, `Nao repita o dia da semana ${row.diaSemana} na jornada semanal.`);
        }

        seenDays.add(row.diaSemana);
    });

    return rows;
}

async function ensureColaboradorExists(poolOrTx, colaboradorId) {
    const id = ensurePositiveInt(colaboradorId, 'Colaborador');
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query('SELECT Id FROM Colaboradores WHERE Id = @id');

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    return id;
}

async function listJornadaSemanal(poolOrTx, options = {}) {
    const { colaboradorId = null, onlyActive = true } = options;

    const request = poolOrTx.request();
    const clauses = [];

    if (colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'));
        clauses.push('ColaboradorId = @colaboradorId');
    }

    if (onlyActive) {
        clauses.push('Ativo = 1');
    }

    const result = await request.query(`
        SELECT
            Id,
            ColaboradorId,
            DiaSemana,
            TrabalhoInicio,
            TrabalhoFim,
            AlmocoInicio,
            AlmocoFim,
            Ativo,
            DataCadastro,
            DataAtualizacao
        FROM ColaboradorJornadaSemanal
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY ColaboradorId, DiaSemana
    `);

    return result.recordset.map(serializeJornadaSemanalRow);
}

async function replaceColaboradorJornadaSemanal(poolOrTx, colaboradorId, jornadaSemanal) {
    const normalizedColaboradorId = await ensureColaboradorExists(poolOrTx, colaboradorId);
    const normalizedRows = normalizeJornadaSemanalPayload(jornadaSemanal, {
        fieldName: 'Jornada semanal'
    }) || [];

    await poolOrTx.request()
        .input('colaboradorId', sql.Int, normalizedColaboradorId)
        .query(`
            UPDATE ColaboradorJornadaSemanal
            SET
                Ativo = 0,
                DataAtualizacao = GETDATE()
            WHERE ColaboradorId = @colaboradorId
              AND Ativo = 1
        `);

    const activeRows = normalizedRows.filter((row) => row.ativo);

    if (activeRows.length === 0) {
        for (const diaSemana of DIAS_SEMANA_VALIDOS) {
            await poolOrTx.request()
                .input('colaboradorId', sql.Int, normalizedColaboradorId)
                .input('diaSemana', sql.TinyInt, diaSemana)
                .query(`
                    MERGE ColaboradorJornadaSemanal AS target
                    USING (
                        SELECT
                            @colaboradorId AS ColaboradorId,
                            @diaSemana AS DiaSemana
                    ) AS source
                    ON target.ColaboradorId = source.ColaboradorId
                       AND target.DiaSemana = source.DiaSemana
                    WHEN MATCHED THEN UPDATE SET
                        TrabalhoInicio = NULL,
                        TrabalhoFim = NULL,
                        AlmocoInicio = NULL,
                        AlmocoFim = NULL,
                        Ativo = 0,
                        DataAtualizacao = GETDATE()
                    WHEN NOT MATCHED THEN INSERT (
                        ColaboradorId,
                        DiaSemana,
                        TrabalhoInicio,
                        TrabalhoFim,
                        AlmocoInicio,
                        AlmocoFim,
                        Ativo,
                        DataCadastro,
                        DataAtualizacao
                    ) VALUES (
                        @colaboradorId,
                        @diaSemana,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        0,
                        GETDATE(),
                        GETDATE()
                    );
                `);
        }
    }

    for (const row of activeRows) {

        await poolOrTx.request()
            .input('colaboradorId', sql.Int, normalizedColaboradorId)
            .input('diaSemana', sql.TinyInt, row.diaSemana)
            .input('trabalhoInicio', sql.Time, toSqlTime(row.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(row.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(row.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(row.almocoFim, 'Fim do almoco'))
            .query(`
                MERGE ColaboradorJornadaSemanal AS target
                USING (
                    SELECT
                        @colaboradorId AS ColaboradorId,
                        @diaSemana AS DiaSemana
                ) AS source
                ON target.ColaboradorId = source.ColaboradorId
                   AND target.DiaSemana = source.DiaSemana
                WHEN MATCHED THEN UPDATE SET
                    TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim,
                    AlmocoInicio = @almocoInicio,
                    AlmocoFim = @almocoFim,
                    Ativo = 1,
                    DataAtualizacao = GETDATE()
                WHEN NOT MATCHED THEN INSERT (
                    ColaboradorId,
                    DiaSemana,
                    TrabalhoInicio,
                    TrabalhoFim,
                    AlmocoInicio,
                    AlmocoFim,
                    Ativo,
                    DataCadastro,
                    DataAtualizacao
                ) VALUES (
                    @colaboradorId,
                    @diaSemana,
                    @trabalhoInicio,
                    @trabalhoFim,
                    @almocoInicio,
                    @almocoFim,
                    1,
                    GETDATE(),
                    GETDATE()
                );
            `);
    }

    return listJornadaSemanal(poolOrTx, {
        colaboradorId: normalizedColaboradorId,
        onlyActive: true
    });
}

module.exports = {
    listJornadaSemanal,
    normalizeDiaSemana,
    normalizeJornadaSemanalPayload,
    replaceColaboradorJornadaSemanal,
    serializeJornadaSemanalRow
};

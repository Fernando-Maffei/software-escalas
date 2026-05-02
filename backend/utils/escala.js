const { sql } = require('../db');
const { AppError } = require('./errors');
const { serializePlantaoRecord } = require('./plantoes');
const { getBancoHorasCapabilities, hasTable } = require('./schema');
const {
    buildDateRange,
    compareTimes,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('./validation');

const ESCALA_TIPOS = ['normal', 'plantao', 'folga', 'ferias', 'ausencia', 'ajuste'];
const DIA_SEMANA_LABELS = [
    'Domingo',
    'Segunda-feira',
    'Terca-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sabado'
];

function normalizeEscalaTipo(value, fieldName = 'Tipo') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return 'normal';
    }

    const normalized = String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_');

    if (normalized.startsWith('plantao')) {
        return 'plantao';
    }

    if (normalized.startsWith('folga')) {
        return 'folga';
    }

    if (normalized.startsWith('ferias')) {
        return 'ferias';
    }

    if (normalized.startsWith('ausencia')) {
        return 'ausencia';
    }

    if (normalized.startsWith('ajuste')) {
        return 'ajuste';
    }

    if (normalized === 'normal') {
        return 'normal';
    }

    throw new AppError(400, `${fieldName} invalido.`);
}

function getDayOfWeek(dataISO) {
    const [year, month, day] = normalizeIsoDate(dataISO, 'Data').split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function getDayOfWeekLabel(dataISO) {
    return DIA_SEMANA_LABELS[getDayOfWeek(dataISO)] || '';
}

function isSunday(dataISO) {
    return getDayOfWeek(dataISO) === 0;
}

function shouldCreateWeekdayBase(dataISO) {
    const weekday = getDayOfWeek(dataISO);
    return weekday >= 1 && weekday <= 5;
}

function iterateIsoDates(startISO, endISO) {
    const { dataInicio, dataFim } = buildDateRange(startISO, endISO);
    const dates = [];
    const [startYear, startMonth, startDay] = dataInicio.split('-').map(Number);
    const [endYear, endMonth, endDay] = dataFim.split('-').map(Number);
    const current = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0));
    const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0));

    while (current <= end) {
        const year = current.getUTCFullYear();
        const month = String(current.getUTCMonth() + 1).padStart(2, '0');
        const day = String(current.getUTCDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
}

function buildEscalaKey(colaboradorId, dataISO) {
    return `${Number(colaboradorId)}|${normalizeIsoDate(dataISO, 'Data')}`;
}

function trimToNull(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized === '' ? null : normalized;
}

function formatTimeToDisplay(timeValue) {
    const normalized = extractTimeString(timeValue);
    return normalized ? normalized.slice(0, 5) : null;
}

function buildTimeRangeLabel(start, end) {
    const formattedStart = formatTimeToDisplay(start);
    const formattedEnd = formatTimeToDisplay(end);

    if (!formattedStart || !formattedEnd) {
        return null;
    }

    return `${formattedStart} às ${formattedEnd}`;
}

function buildEscalaObservationParts(...values) {
    return values
        .map((value) => trimToNull(value))
        .filter(Boolean)
        .join(' | ') || null;
}

function coerceBoolean(value) {
    return value === true || value === 1;
}

function getColaboradorDefaultTimes(colaborador) {
    return {
        horaInicio: extractTimeString(colaborador.TrabalhoInicio || colaborador.trabalhoInicio),
        horaFim: extractTimeString(colaborador.TrabalhoFim || colaborador.trabalhoFim),
        almocoInicio: extractTimeString(colaborador.AlmocoInicio || colaborador.almocoInicio),
        almocoFim: extractTimeString(colaborador.AlmocoFim || colaborador.almocoFim)
    };
}

function createDefaultEscalaRecord(colaborador, dataISO, overrides = {}) {
    const defaults = getColaboradorDefaultTimes(colaborador);

    return {
        id: overrides.id ?? null,
        colaboradorId: Number(colaborador.Id || colaborador.id || overrides.colaboradorId),
        colaboradorNome: colaborador.Nome || colaborador.nome || overrides.colaboradorNome || null,
        dataISO: normalizeIsoDate(dataISO, 'Data'),
        horaInicio: overrides.horaInicio !== undefined ? overrides.horaInicio : defaults.horaInicio,
        horaFim: overrides.horaFim !== undefined ? overrides.horaFim : defaults.horaFim,
        almocoInicio: overrides.almocoInicio !== undefined ? overrides.almocoInicio : defaults.almocoInicio,
        almocoFim: overrides.almocoFim !== undefined ? overrides.almocoFim : defaults.almocoFim,
        tipo: normalizeEscalaTipo(overrides.tipo || 'normal'),
        observacao: trimToNull(overrides.observacao),
        origemTipo: trimToNull(overrides.origemTipo),
        origemId: overrides.origemId !== undefined && overrides.origemId !== null
            ? ensurePositiveInt(overrides.origemId, 'Origem')
            : null,
        ajusteManual: Boolean(overrides.ajusteManual),
        almocoAjustado: Boolean(overrides.almocoAjustado),
        criadoEm: overrides.criadoEm || null,
        atualizadoEm: overrides.atualizadoEm || null
    };
}

function createAusenciaEscalaRecord(colaborador, ausencia, dataISO) {
    const tipo = normalizeEscalaTipo(ausencia.Tipo || ausencia.tipo || 'ausencia');
    const periodoTipo = String(ausencia.PeriodoTipo || ausencia.periodoTipo || 'dia_inteiro').trim().toLowerCase();
    const observacaoBase = trimToNull(ausencia.Observacao || ausencia.observacao);
    const subtipo = trimToNull(ausencia.Subtipo || ausencia.subtipo);
    const horaInicioAusencia = extractTimeString(ausencia.HoraInicio || ausencia.horaInicio);
    const horaFimAusencia = extractTimeString(ausencia.HoraFim || ausencia.horaFim);
    const observacaoPeriodo = periodoTipo === 'horas'
        ? `Ausencia parcial ${buildTimeRangeLabel(horaInicioAusencia, horaFimAusencia) || ''}`.trim()
        : null;

    if (periodoTipo === 'horas') {
        return createDefaultEscalaRecord(colaborador, dataISO, {
            tipo,
            observacao: buildEscalaObservationParts(observacaoBase, subtipo, observacaoPeriodo),
            origemTipo: 'ausencia',
            origemId: ausencia.Id || ausencia.id
        });
    }

    return createDefaultEscalaRecord(colaborador, dataISO, {
        tipo,
        horaInicio: null,
        horaFim: null,
        almocoInicio: null,
        almocoFim: null,
        observacao: buildEscalaObservationParts(observacaoBase, subtipo),
        origemTipo: 'ausencia',
        origemId: ausencia.Id || ausencia.id
    });
}

function createPlantaoEscalaRecord(colaborador, plantao) {
    return createDefaultEscalaRecord(colaborador, plantao.dataISO, {
        horaInicio: extractTimeString(plantao.horaInicio || plantao.hora_inicio),
        horaFim: extractTimeString(plantao.horaFim || plantao.hora_fim),
        almocoInicio: null,
        almocoFim: null,
        tipo: 'plantao',
        observacao: trimToNull(plantao.observacao),
        origemTipo: 'plantao',
        origemId: plantao.id
    });
}

function buildColaboradorDefaultSyncRecord(colaborador, existingRecord) {
    return createDefaultEscalaRecord(colaborador, existingRecord.dataISO, {
        tipo: existingRecord.tipo || 'normal',
        observacao: existingRecord.observacao
    });
}

function canAutoRefreshDefaultEscala(record) {
    return Boolean(record)
        && !record.ajusteManual
        && !trimToNull(record.origemTipo)
        && !record.origemId;
}

function serializeEscalaDiaRecord(row) {
    return {
        id: row.id ?? row.Id ?? null,
        colaboradorId: Number(row.colaborador_id ?? row.ColaboradorId ?? row.colaboradorId ?? 0) || null,
        colaboradorNome: row.colaboradorNome ?? row.ColaboradorNome ?? row.Nome ?? row.nome ?? null,
        dataISO: normalizeIsoDate(
            row.dataISO
                || row.DataISO
                || extractDateString(row.data)
                || extractDateString(row.Data),
            'Data'
        ),
        horaInicio: extractTimeString(row.hora_inicio ?? row.HoraInicio ?? row.horaInicio),
        horaFim: extractTimeString(row.hora_fim ?? row.HoraFim ?? row.horaFim),
        almocoInicio: extractTimeString(row.almoco_inicio ?? row.AlmocoInicio ?? row.almocoInicio),
        almocoFim: extractTimeString(row.almoco_fim ?? row.AlmocoFim ?? row.almocoFim),
        tipo: normalizeEscalaTipo(row.tipo ?? row.Tipo ?? 'normal'),
        observacao: trimToNull(row.observacao ?? row.Observacao),
        origemTipo: trimToNull(row.origem_tipo ?? row.OrigemTipo),
        origemId: row.origem_id ?? row.OrigemId ?? null,
        ajusteManual: coerceBoolean(row.ajuste_manual ?? row.AjusteManual),
        almocoAjustado: coerceBoolean(row.almoco_ajustado ?? row.AlmocoAjustado),
        criadoEm: row.criado_em ?? row.CriadoEm ?? null,
        atualizadoEm: row.atualizado_em ?? row.AtualizadoEm ?? null
    };
}

function didEscalaRecordChange(previousRecord, nextRecord) {
    if (!previousRecord) {
        return true;
    }

    const keys = [
        'horaInicio',
        'horaFim',
        'almocoInicio',
        'almocoFim',
        'tipo',
        'observacao',
        'origemTipo',
        'origemId',
        'ajusteManual',
        'almocoAjustado'
    ];

    return keys.some((key) => {
        const before = previousRecord[key] ?? null;
        const after = nextRecord[key] ?? null;
        return before !== after;
    });
}

function mergeEscalaRecord(existingRecord, incomingRecord, options = {}) {
    const { force = false } = options;

    if (!existingRecord) {
        return { ...incomingRecord };
    }

    if (existingRecord.ajusteManual && !force) {
        return null;
    }

    const preserveLunch = existingRecord.almocoAjustado === true;

    return {
        ...existingRecord,
        ...incomingRecord,
        id: existingRecord.id ?? incomingRecord.id ?? null,
        colaboradorId: existingRecord.colaboradorId,
        colaboradorNome: existingRecord.colaboradorNome || incomingRecord.colaboradorNome || null,
        dataISO: existingRecord.dataISO,
        almocoInicio: preserveLunch ? existingRecord.almocoInicio : incomingRecord.almocoInicio,
        almocoFim: preserveLunch ? existingRecord.almocoFim : incomingRecord.almocoFim,
        ajusteManual: force ? Boolean(incomingRecord.ajusteManual) : Boolean(existingRecord.ajusteManual),
        almocoAjustado: preserveLunch ? true : Boolean(incomingRecord.almocoAjustado),
        origemTipo: incomingRecord.origemTipo ?? existingRecord.origemTipo ?? null,
        origemId: incomingRecord.origemId ?? existingRecord.origemId ?? null,
        observacao: incomingRecord.observacao !== undefined
            ? trimToNull(incomingRecord.observacao)
            : trimToNull(existingRecord.observacao)
    };
}

function validateEscalaTimes(record, options = {}) {
    const { allowLunchWithoutWork = false } = options;
    const {
        horaInicio,
        horaFim,
        almocoInicio,
        almocoFim
    } = record;

    if (!horaInicio && !horaFim && almocoInicio && almocoFim && allowLunchWithoutWork) {
        if (compareTimes(almocoInicio, almocoFim) >= 0) {
            throw new AppError(400, 'O horario de inicio do almoco deve ser menor que o horario de fim.');
        }

        return;
    }

    validateWorkSchedule({
        trabalhoInicio: horaInicio,
        trabalhoFim: horaFim,
        almocoInicio,
        almocoFim
    });
}

function buildEscalaSelect(alias = 'e') {
    return [
        `${alias}.id`,
        `${alias}.colaborador_id`,
        `CONVERT(VARCHAR(10), ${alias}.data, 23) AS dataISO`,
        `${alias}.hora_inicio`,
        `${alias}.hora_fim`,
        `${alias}.almoco_inicio`,
        `${alias}.almoco_fim`,
        `${alias}.tipo`,
        `${alias}.observacao`,
        `${alias}.origem_tipo`,
        `${alias}.origem_id`,
        `${alias}.ajuste_manual`,
        `${alias}.almoco_ajustado`,
        `${alias}.criado_em`,
        `${alias}.atualizado_em`
    ].join(',\n                ');
}

function ensureEscalaDiaTable(schema) {
    if (hasTable(schema, 'escala_dia')) {
        return;
    }

    throw new AppError(
        409,
        'A tabela escala_dia ainda nao esta habilitada no banco. Aplique o script SQL da migracao antes de usar a escala diaria.',
        { missing: ['tabela escala_dia'] }
    );
}

async function findColaboradorById(poolOrTx, colaboradorId) {
    const id = ensurePositiveInt(colaboradorId, 'Colaborador');
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM Colaboradores WHERE Id = @id');

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    return result.recordset[0];
}

async function listColaboradores(poolOrTx, options = {}) {
    const { colaboradorId = null } = options;
    const request = poolOrTx.request();
    const clauses = [];

    if (colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'));
        clauses.push('Id = @colaboradorId');
    }

    const result = await request.query(`
        SELECT *
        FROM Colaboradores
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY Nome
    `);

    return result.recordset;
}

async function listEscalaDiaRows(poolOrTx, startISO, endISO, options = {}) {
    const { colaboradorId = null, tipo = null } = options;
    const request = poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'));
    const clauses = ['e.data BETWEEN @dataInicio AND @dataFim'];

    if (colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'));
        clauses.push('e.colaborador_id = @colaboradorId');
    }

    if (tipo) {
        request.input('tipo', sql.NVarChar(30), normalizeEscalaTipo(tipo));
        clauses.push('LOWER(e.tipo) = @tipo');
    }

    const result = await request.query(`
        SELECT
            ${buildEscalaSelect('e')},
            c.Nome AS colaboradorNome
        FROM escala_dia e
        INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY e.data, c.Nome
    `);

    return result.recordset.map(serializeEscalaDiaRecord);
}

async function findEscalaDiaByColaboradorAndDate(poolOrTx, colaboradorId, dataISO) {
    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'))
        .input('data', sql.Date, normalizeIsoDate(dataISO, 'Data'))
        .query(`
            SELECT
                ${buildEscalaSelect('e')},
                c.Nome AS colaboradorNome
            FROM escala_dia e
            INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
            WHERE e.colaborador_id = @colaboradorId
              AND e.data = @data
        `);

    return result.recordset[0] ? serializeEscalaDiaRecord(result.recordset[0]) : null;
}

async function persistEscalaDiaRecord(poolOrTx, record) {
    validateEscalaTimes(record, {
        allowLunchWithoutWork: record.tipo !== 'normal' && record.tipo !== 'plantao' && !record.horaInicio && !record.horaFim
    });

    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, ensurePositiveInt(record.colaboradorId, 'Colaborador'))
        .input('data', sql.Date, normalizeIsoDate(record.dataISO, 'Data'))
        .input('horaInicio', sql.Time, toSqlTime(record.horaInicio, 'Hora inicial'))
        .input('horaFim', sql.Time, toSqlTime(record.horaFim, 'Hora final'))
        .input('almocoInicio', sql.Time, toSqlTime(record.almocoInicio, 'Inicio do almoco'))
        .input('almocoFim', sql.Time, toSqlTime(record.almocoFim, 'Fim do almoco'))
        .input('tipo', sql.NVarChar(30), normalizeEscalaTipo(record.tipo))
        .input('observacao', sql.NVarChar(500), trimToNull(record.observacao))
        .input('origemTipo', sql.NVarChar(30), trimToNull(record.origemTipo))
        .input('origemId', sql.Int, record.origemId || null)
        .input('ajusteManual', sql.Bit, Boolean(record.ajusteManual))
        .input('almocoAjustado', sql.Bit, Boolean(record.almocoAjustado))
        .query(`
            MERGE escala_dia AS target
            USING (
                SELECT
                    @colaboradorId AS colaborador_id,
                    @data AS data
            ) AS source
            ON target.colaborador_id = source.colaborador_id
               AND target.data = source.data
            WHEN MATCHED THEN UPDATE SET
                hora_inicio = @horaInicio,
                hora_fim = @horaFim,
                almoco_inicio = @almocoInicio,
                almoco_fim = @almocoFim,
                tipo = @tipo,
                observacao = @observacao,
                origem_tipo = @origemTipo,
                origem_id = @origemId,
                ajuste_manual = @ajusteManual,
                almoco_ajustado = @almocoAjustado,
                atualizado_em = GETDATE()
            WHEN NOT MATCHED THEN INSERT (
                colaborador_id,
                data,
                hora_inicio,
                hora_fim,
                almoco_inicio,
                almoco_fim,
                tipo,
                observacao,
                origem_tipo,
                origem_id,
                ajuste_manual,
                almoco_ajustado
            ) VALUES (
                @colaboradorId,
                @data,
                @horaInicio,
                @horaFim,
                @almocoInicio,
                @almocoFim,
                @tipo,
                @observacao,
                @origemTipo,
                @origemId,
                @ajusteManual,
                @almocoAjustado
            )
            OUTPUT INSERTED.*;
        `);

    return result.recordset[0];
}

async function deleteEscalaDiaByOrigin(poolOrTx, origemTipo, origemId) {
    if (!origemId) {
        return;
    }

    await poolOrTx.request()
        .input('origemTipo', sql.NVarChar(30), trimToNull(origemTipo))
        .input('origemId', sql.Int, ensurePositiveInt(origemId, 'Origem'))
        .query(`
            DELETE FROM escala_dia
            WHERE origem_tipo = @origemTipo
              AND origem_id = @origemId
        `);
}

async function applyAutomaticEscalaRecord(poolOrTx, existingMap, incomingRecord, options = {}) {
    const key = buildEscalaKey(incomingRecord.colaboradorId, incomingRecord.dataISO);
    const existingRecord = existingMap.get(key) || null;
    const nextRecord = mergeEscalaRecord(existingRecord, incomingRecord, options);

    if (!nextRecord || !didEscalaRecordChange(existingRecord, nextRecord)) {
        return {
            action: 'skipped',
            record: existingRecord
        };
    }

    const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);
    const serialized = serializeEscalaDiaRecord({
        ...persisted,
        colaboradorNome: nextRecord.colaboradorNome
    });
    existingMap.set(key, serialized);

    return {
        action: existingRecord ? 'updated' : 'created',
        record: serialized
    };
}

async function ensureEscalaBaseForPeriod(poolOrTx, schema, startISO, endISO, options = {}) {
    ensureEscalaDiaTable(schema);

    const { colaboradorId = null, includeSaturday = false } = options;
    const colaboradores = await listColaboradores(poolOrTx, { colaboradorId });
    const existingRows = await listEscalaDiaRows(poolOrTx, startISO, endISO, { colaboradorId });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));
    const counters = {
        created: 0,
        updated: 0,
        skipped: 0
    };

    for (const dataISO of iterateIsoDates(startISO, endISO)) {
        const weekday = getDayOfWeek(dataISO);
        const shouldCreate = includeSaturday
            ? weekday >= 1 && weekday <= 6
            : shouldCreateWeekdayBase(dataISO);

        if (!shouldCreate) {
            continue;
        }

        for (const colaborador of colaboradores) {
            const key = buildEscalaKey(colaborador.Id, dataISO);
            const existingRecord = existingMap.get(key) || null;
            const defaultRecord = createDefaultEscalaRecord(colaborador, dataISO, {
                tipo: weekday === 6 ? 'ajuste' : 'normal'
            });

            if (!existingRecord) {
                const created = await persistEscalaDiaRecord(poolOrTx, defaultRecord);
                existingMap.set(key, serializeEscalaDiaRecord({
                    ...created,
                    colaboradorNome: colaborador.Nome
                }));
                counters.created += 1;
                continue;
            }

            if (!canAutoRefreshDefaultEscala(existingRecord)) {
                counters.skipped += 1;
                continue;
            }

            const result = await applyAutomaticEscalaRecord(poolOrTx, existingMap, defaultRecord);
            counters[result.action] = (counters[result.action] || 0) + 1;
        }
    }

    return {
        counters,
        existingMap,
        colaboradores
    };
}

async function syncColaboradorDefaultsToEscalaDia(poolOrTx, schema, colaborador) {
    ensureEscalaDiaTable(schema);

    const colaboradorId = ensurePositiveInt(colaborador.Id || colaborador.id, 'Colaborador');
    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            SELECT
                ${buildEscalaSelect('e')},
                c.Nome AS colaboradorNome
            FROM escala_dia e
            INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
            WHERE e.colaborador_id = @colaboradorId
            ORDER BY e.data
        `);
    const rows = result.recordset.map(serializeEscalaDiaRecord);
    const existingMap = new Map(rows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));
    const counters = {
        updated: 0,
        skipped: 0
    };

    for (const row of rows) {
        if (!canAutoRefreshDefaultEscala(row)) {
            counters.skipped += 1;
            continue;
        }

        const syncRecord = buildColaboradorDefaultSyncRecord(colaborador, row);
        const syncResult = await applyAutomaticEscalaRecord(poolOrTx, existingMap, syncRecord);

        if (syncResult.action === 'updated') {
            counters.updated += 1;
        } else {
            counters.skipped += 1;
        }
    }

    return counters;
}

function buildHistoricAusenciaSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'Id',
        'ColaboradorId',
        'Tipo',
        'DataInicio',
        'DataFim',
        'PeriodoTipo',
        'HoraInicio',
        'HoraFim'
    ];

    if (capabilities.hasAusenciaSubtipo) {
        columns.push('Subtipo');
    }

    if (capabilities.hasAusenciaObservacao) {
        columns.push('Observacao');
    }

    return columns.join(',\n                ');
}

function buildHistoricPlantaoSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'id',
        'data_plantao',
        'colaboradores_ids'
    ];

    if (capabilities.hasPlantaoHoraInicio) {
        columns.push('hora_inicio');
    }

    if (capabilities.hasPlantaoHoraFim) {
        columns.push('hora_fim');
    }

    if (capabilities.hasPlantaoObservacao) {
        columns.push('observacao');
    }

    return columns.join(',\n                ');
}

async function hydrateHistoricSourcesIntoEscala(poolOrTx, schema, existingMap, colaboradores, startISO, endISO, options = {}) {
    const { colaboradorId = null } = options;
    const counters = {
        created: 0,
        updated: 0,
        skipped: 0
    };
    const colaboradoresMap = new Map(colaboradores.map((item) => [Number(item.Id), item]));
    const requestAusencias = poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'));
    const ausenciaClauses = [
        'DataFim >= @dataInicio',
        'DataInicio <= @dataFim'
    ];

    if (colaboradorId) {
        requestAusencias.input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'));
        ausenciaClauses.push('ColaboradorId = @colaboradorId');
    }

    const ausenciasResult = await requestAusencias.query(`
        SELECT
            ${buildHistoricAusenciaSelect(schema)}
        FROM Ausencias
        WHERE ${ausenciaClauses.join(' AND ')}
    `);

    for (const ausencia of ausenciasResult.recordset) {
        const colaborador = colaboradoresMap.get(Number(ausencia.ColaboradorId));

        if (!colaborador) {
            continue;
        }

        const dataInicioAusencia = extractDateString(ausencia.DataInicio);
        const dataFimAusencia = extractDateString(ausencia.DataFim);
        const effectiveStart = dataInicioAusencia > startISO ? dataInicioAusencia : startISO;
        const effectiveEnd = dataFimAusencia < endISO ? dataFimAusencia : endISO;

        for (const dataISO of iterateIsoDates(effectiveStart, effectiveEnd)) {
            const result = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createAusenciaEscalaRecord(colaborador, ausencia, dataISO),
                { force: false }
            );

            counters[result.action] = (counters[result.action] || 0) + 1;
        }
    }

    const requestPlantoes = poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'));
    const plantaoClauses = [
        'data_plantao >= @dataInicio',
        'data_plantao <= @dataFim'
    ];

    const plantoesResult = await requestPlantoes.query(`
        SELECT
            ${buildHistoricPlantaoSelect(schema)}
        FROM plantoes
        WHERE ${plantaoClauses.join(' AND ')}
    `);

    for (const row of plantoesResult.recordset) {
        const plantao = serializePlantaoRecord(row);

        for (const colaboradorEscalado of plantao.colaboradores) {
            if (colaboradorId && Number(colaboradorEscalado) !== Number(colaboradorId)) {
                continue;
            }

            const colaborador = colaboradoresMap.get(Number(colaboradorEscalado));

            if (!colaborador) {
                continue;
            }

            const result = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createPlantaoEscalaRecord(colaborador, plantao),
                { force: false }
            );

            counters[result.action] = (counters[result.action] || 0) + 1;
        }
    }

    return counters;
}

async function ensureEscalaDiaForPeriod(poolOrTx, schema, startISO, endISO, options = {}) {
    const { hydrateSources = true, colaboradorId = null, includeSaturday = false } = options;
    const baseResult = await ensureEscalaBaseForPeriod(poolOrTx, schema, startISO, endISO, {
        colaboradorId,
        includeSaturday
    });
    const counters = {
        ...baseResult.counters
    };

    if (hydrateSources) {
        const hydratedCounters = await hydrateHistoricSourcesIntoEscala(
            poolOrTx,
            schema,
            baseResult.existingMap,
            baseResult.colaboradores,
            startISO,
            endISO,
            { colaboradorId }
        );

        counters.created += hydratedCounters.created || 0;
        counters.updated += hydratedCounters.updated || 0;
        counters.skipped += hydratedCounters.skipped || 0;
    }

    return {
        counters,
        existingMap: baseResult.existingMap,
        colaboradores: baseResult.colaboradores
    };
}

async function syncAusenciaToEscalaDia(poolOrTx, schema, ausencia, colaborador) {
    ensureEscalaDiaTable(schema);

    const dataInicio = extractDateString(ausencia.DataInicio || ausencia.dataInicio);
    const dataFim = extractDateString(ausencia.DataFim || ausencia.dataFim);

    await deleteEscalaDiaByOrigin(poolOrTx, 'ausencia', ausencia.Id || ausencia.id);
    await ensureEscalaDiaForPeriod(poolOrTx, schema, dataInicio, dataFim, {
        colaboradorId: colaborador.Id,
        hydrateSources: false
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));

    for (const dataISO of iterateIsoDates(dataInicio, dataFim)) {
        await applyAutomaticEscalaRecord(
            poolOrTx,
            existingMap,
            createAusenciaEscalaRecord(colaborador, ausencia, dataISO),
            { force: true }
        );
    }
}

async function syncPlantaoToEscalaDia(poolOrTx, schema, plantaoRow, colaboradores) {
    ensureEscalaDiaTable(schema);

    const plantao = serializePlantaoRecord(plantaoRow);
    const colaboradoresIds = Array.isArray(plantao.colaboradores) ? plantao.colaboradores : [];
    const colaboradoresMap = new Map((colaboradores || []).map((item) => [Number(item.Id), item]));

    await deleteEscalaDiaByOrigin(poolOrTx, 'plantao', plantao.id);
    await ensureEscalaDiaForPeriod(poolOrTx, schema, plantao.dataISO, plantao.dataISO, {
        hydrateSources: false
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, plantao.dataISO, plantao.dataISO);
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));

    for (const colaboradorId of colaboradoresIds) {
        const colaborador = colaboradoresMap.get(Number(colaboradorId));

        if (!colaborador) {
            continue;
        }

        await applyAutomaticEscalaRecord(
            poolOrTx,
            existingMap,
            createPlantaoEscalaRecord(colaborador, plantao),
            { force: true }
        );
    }
}

async function restoreEscalaDefaultsForPeriod(poolOrTx, schema, startISO, endISO, options = {}) {
    return ensureEscalaDiaForPeriod(poolOrTx, schema, startISO, endISO, {
        ...options,
        hydrateSources: false
    });
}

async function upsertManualEscalaDia(poolOrTx, schema, payload) {
    ensureEscalaDiaTable(schema);

    const colaborador = await findColaboradorById(poolOrTx, payload.colaboradorId);
    const dataISO = normalizeIsoDate(payload.dataISO, 'Data');

    await ensureEscalaDiaForPeriod(poolOrTx, schema, dataISO, dataISO, {
        colaboradorId: colaborador.Id
    });

    const existing = await findEscalaDiaByColaboradorAndDate(poolOrTx, colaborador.Id, dataISO);
    const fallback = existing || createDefaultEscalaRecord(colaborador, dataISO, {
        tipo: getDayOfWeek(dataISO) === 6 ? 'ajuste' : 'normal'
    });

    const nextRecord = {
        ...fallback,
        dataISO,
        colaboradorId: colaborador.Id,
        colaboradorNome: colaborador.Nome,
        horaInicio: payload.horaInicio !== undefined ? payload.horaInicio : fallback.horaInicio,
        horaFim: payload.horaFim !== undefined ? payload.horaFim : fallback.horaFim,
        almocoInicio: payload.almocoInicio !== undefined ? payload.almocoInicio : fallback.almocoInicio,
        almocoFim: payload.almocoFim !== undefined ? payload.almocoFim : fallback.almocoFim,
        tipo: payload.tipo !== undefined
            ? normalizeEscalaTipo(payload.tipo)
            : normalizeEscalaTipo(fallback.tipo || (existing ? fallback.tipo : 'ajuste')),
        observacao: payload.observacao !== undefined
            ? payload.observacao
            : fallback.observacao,
        ajusteManual: true,
        almocoAjustado: fallback.almocoAjustado || payload.almocoInicio !== undefined || payload.almocoFim !== undefined
    };

    validateEscalaTimes(nextRecord, {
        allowLunchWithoutWork: nextRecord.tipo !== 'normal' && nextRecord.tipo !== 'plantao' && !nextRecord.horaInicio && !nextRecord.horaFim
    });

    const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);

    return serializeEscalaDiaRecord({
        ...persisted,
        colaboradorNome: colaborador.Nome
    });
}

async function applyLunchPeriod(poolOrTx, schema, payload) {
    ensureEscalaDiaTable(schema);

    const colaborador = await findColaboradorById(poolOrTx, payload.colaboradorId);
    const { dataInicio, dataFim } = buildDateRange(payload.dataInicio, payload.dataFim);
    const almocoInicio = normalizeNullableTime(payload.almocoInicio, 'Inicio do almoco');
    const almocoFim = normalizeNullableTime(payload.almocoFim, 'Fim do almoco');

    if (!almocoInicio || !almocoFim) {
        throw new AppError(400, 'Informe inicio e fim do almoco para o periodo.');
    }

    if (compareTimes(almocoInicio, almocoFim) >= 0) {
        throw new AppError(400, 'O horario de inicio do almoco deve ser menor que o horario de fim.');
    }

    await ensureEscalaDiaForPeriod(poolOrTx, schema, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));
    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const dataISO of iterateIsoDates(dataInicio, dataFim)) {
        const key = buildEscalaKey(colaborador.Id, dataISO);
        const existing = existingMap.get(key) || null;

        if (!existing && isSunday(dataISO)) {
            skipped += 1;
            continue;
        }

        const baseRecord = existing || createDefaultEscalaRecord(colaborador, dataISO, {
            tipo: getDayOfWeek(dataISO) === 6 ? 'ajuste' : 'normal'
        });
        const nextRecord = {
            ...baseRecord,
            colaboradorId: colaborador.Id,
            colaboradorNome: colaborador.Nome,
            dataISO,
            almocoInicio,
            almocoFim,
            almocoAjustado: true
        };

        validateEscalaTimes(nextRecord, {
            allowLunchWithoutWork: !nextRecord.horaInicio && !nextRecord.horaFim
        });

        const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);
        existingMap.set(key, serializeEscalaDiaRecord({
            ...persisted,
            colaboradorNome: colaborador.Nome
        }));

        if (existing) {
            updated += 1;
        } else {
            created += 1;
        }
    }

    return {
        created,
        updated,
        skipped
    };
}

async function listEscalaDiaByDate(poolOrTx, schema, dataISO) {
    ensureEscalaDiaTable(schema);

    const normalized = normalizeIsoDate(dataISO, 'Data');
    await ensureEscalaDiaForPeriod(poolOrTx, schema, normalized, normalized);
    const rows = await listEscalaDiaRows(poolOrTx, normalized, normalized);

    return rows.map((row) => ({
        ...row,
        diaSemana: getDayOfWeekLabel(row.dataISO),
        horario: buildTimeRangeLabel(row.horaInicio, row.horaFim),
        almoco: buildTimeRangeLabel(row.almocoInicio, row.almocoFim)
    }));
}

async function listEscalaReport(poolOrTx, schema, filters) {
    ensureEscalaDiaTable(schema);

    const { dataInicio, dataFim } = buildDateRange(filters.dataInicio, filters.dataFim);
    await ensureEscalaDiaForPeriod(poolOrTx, schema, dataInicio, dataFim, {
        colaboradorId: filters.colaboradorId || null
    });

    const rows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: filters.colaboradorId || null,
        tipo: filters.tipo || null
    });

    return rows.map((row) => ({
        id: row.id,
        dataISO: row.dataISO,
        diaSemana: getDayOfWeekLabel(row.dataISO),
        colaboradorId: row.colaboradorId,
        colaboradorNome: row.colaboradorNome,
        horaInicio: formatTimeToDisplay(row.horaInicio),
        horaFim: formatTimeToDisplay(row.horaFim),
        almocoInicio: formatTimeToDisplay(row.almocoInicio),
        almocoFim: formatTimeToDisplay(row.almocoFim),
        horario: buildTimeRangeLabel(row.horaInicio, row.horaFim),
        almoco: buildTimeRangeLabel(row.almocoInicio, row.almocoFim),
        tipo: row.tipo,
        observacao: row.observacao || null
    }));
}

module.exports = {
    ESCALA_TIPOS,
    applyLunchPeriod,
    buildColaboradorDefaultSyncRecord,
    buildTimeRangeLabel,
    canAutoRefreshDefaultEscala,
    createAusenciaEscalaRecord,
    createDefaultEscalaRecord,
    createPlantaoEscalaRecord,
    deleteEscalaDiaByOrigin,
    ensureEscalaDiaForPeriod,
    ensureEscalaDiaTable,
    findColaboradorById,
    findEscalaDiaByColaboradorAndDate,
    formatTimeToDisplay,
    getDayOfWeek,
    getDayOfWeekLabel,
    isSunday,
    iterateIsoDates,
    listEscalaDiaByDate,
    listEscalaReport,
    normalizeEscalaTipo,
    persistEscalaDiaRecord,
    restoreEscalaDefaultsForPeriod,
    serializeEscalaDiaRecord,
    shouldCreateWeekdayBase,
    syncColaboradorDefaultsToEscalaDia,
    syncAusenciaToEscalaDia,
    syncPlantaoToEscalaDia,
    upsertManualEscalaDia
};

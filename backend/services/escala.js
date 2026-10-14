const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { isFeriadoNacional } = require('./feriados-nacionais');
const { listJornadaSemanal } = require('./jornada-semanal');
const { serializePlantaoRecord } = require('./plantoes');
const { SQL_EQUIPE_PLANTAO } = require('./equipe-plantao');
const { temFolgaDeDomingo } = require('./plantonista');
const { mergeEscalaDiaEmLote } = require('./escala-gravacao-em-lote');
const {
    buildDateRange,
    compareTimes,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
    normalizeNullableTime,
    toSqlTime,
    validateWorkSchedule
} = require('../lib/validation');

const ESCALA_TIPOS = [
    'normal',
    'plantao',
    'folga',
    'ferias',
    'ausencia',
    'ajuste',
    // Tipos do plantonista. 'cobertura' e separada de 'plantao': plantao e
    // turno extra num dia sem expediente; cobertura e assumir o posto de quem
    // estava de folga, e sai do vinculo, nao de escolha do usuario.
    'domingo_folgado',
    'reposicao',
    'folga_compensatoria',
    'cobertura'
];
// Plantoes que viram linha na escala do dia. Antes so o de sabado entrava, e o
// lancamento de domingo/feriado nao aparecia na escala nem no relatorio.
const { PLANTAO_TIPOS: ESCALA_PLANTAO_TIPOS } = require('../lib/dominio');
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

    // Valor exato PRIMEIRO. Os startsWith abaixo existem para dado legado
    // (acentuado, ou variantes como 'plantao_sabado'), mas engoliriam os tipos
    // novos: 'folga_compensatoria' comeca com 'folga' e viraria 'folga',
    // perdendo em silencio a distincao que esta fase existe para criar.
    if (ESCALA_TIPOS.includes(normalized)) {
        return normalized;
    }

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

// Datas de feriado do periodo: nacionais (calculados) e os cadastrados na
// tabela Feriados (municipal/estadual). Em feriado a escala padrao nao e
// gerada — so aparece quem tem lancamento de plantao no dia.
async function loadFeriadosDoPeriodo(poolOrTx, startISO, endISO) {
    const datas = new Set(iterateIsoDates(startISO, endISO).filter((dataISO) => isFeriadoNacional(dataISO)));

    const result = await poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'))
        .query('SELECT Data FROM Feriados WHERE Data BETWEEN @dataInicio AND @dataFim');

    for (const row of result.recordset) {
        const dataISO = extractDateString(row.Data);

        if (dataISO) {
            datas.add(dataISO);
        }
    }

    return datas;
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

function hasColaboradorDefaultWorkSchedule(colaborador) {
    const defaults = getColaboradorDefaultTimes(colaborador);
    return Boolean(defaults.horaInicio && defaults.horaFim);
}

function createEscalaRecordFromWeeklySchedule(colaborador, jornadaDia, dataISO, overrides = {}) {
    const trabalhoInicio = extractTimeString(jornadaDia?.trabalhoInicio ?? jornadaDia?.TrabalhoInicio);
    const trabalhoFim = extractTimeString(jornadaDia?.trabalhoFim ?? jornadaDia?.TrabalhoFim);
    const almocoInicio = extractTimeString(jornadaDia?.almocoInicio ?? jornadaDia?.AlmocoInicio);
    const almocoFim = extractTimeString(jornadaDia?.almocoFim ?? jornadaDia?.AlmocoFim);

    return createDefaultEscalaRecord(colaborador, dataISO, {
        ...overrides,
        horaInicio: overrides.horaInicio !== undefined ? overrides.horaInicio : trabalhoInicio,
        horaFim: overrides.horaFim !== undefined ? overrides.horaFim : trabalhoFim,
        almocoInicio: overrides.almocoInicio !== undefined ? overrides.almocoInicio : almocoInicio,
        almocoFim: overrides.almocoFim !== undefined ? overrides.almocoFim : almocoFim,
        tipo: overrides.tipo || 'normal'
    });
}

function buildJornadaSemanalIndex(jornadaRows) {
    const map = new Map();

    for (const row of jornadaRows || []) {
        const colaboradorId = Number(row.colaboradorId || row.ColaboradorId || 0);
        const diaSemana = Number(row.diaSemana ?? row.DiaSemana);
        const ativo = coerceBoolean(row.ativo ?? row.Ativo);

        if (!Number.isFinite(colaboradorId) || colaboradorId <= 0 || !Number.isFinite(diaSemana)) {
            continue;
        }

        if (!map.has(colaboradorId)) {
            map.set(colaboradorId, {
                hasRows: false,
                activeByDay: new Map()
            });
        }

        const target = map.get(colaboradorId);
        target.hasRows = true;

        if (ativo) {
            target.activeByDay.set(diaSemana, row);
        }
    }

    return map;
}

function canDeleteAutomaticEscalaRecord(record) {
    if (!record) {
        return false;
    }

    return !record.ajusteManual
        && !trimToNull(record.origemTipo)
        && !record.origemId
        && (record.tipo === 'normal' || record.tipo === 'ajuste');
}

function getColaboradorDefaultLunchTimes(colaborador) {
    const defaults = getColaboradorDefaultTimes(colaborador);

    return {
        almocoInicio: defaults.almocoInicio,
        almocoFim: defaults.almocoFim
    };
}

function areSameLunchTimes(firstStart, firstEnd, secondStart, secondEnd) {
    return (extractTimeString(firstStart) || null) === (extractTimeString(secondStart) || null)
        && (extractTimeString(firstEnd) || null) === (extractTimeString(secondEnd) || null);
}

function createDefaultEscalaRecord(colaborador, dataISO, overrides = {}) {
    const defaults = getColaboradorDefaultTimes(colaborador);

    return {
        id: overrides.id ?? null,
        colaboradorId: Number(colaborador.Id || colaborador.id || overrides.colaboradorId),
        colaboradorNome: colaborador.Nome || colaborador.nome || overrides.colaboradorNome || null,
        setorId: colaborador.SetorId ?? colaborador.setorId ?? overrides.setorId ?? null,
        setorNome: colaborador.SetorNome || colaborador.setorNome || overrides.setorNome || null,
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

function createAusenciaEscalaRecord(colaborador, ausencia, dataISO, baseRecord = null) {
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
            horaInicio: baseRecord?.horaInicio,
            horaFim: baseRecord?.horaFim,
            almocoInicio: baseRecord?.almocoInicio,
            almocoFim: baseRecord?.almocoFim,
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

// Os tres registros que uma folga de domingo produz. Puros de proposito: e a
// parte com regra de verdade, e assim da para testar sem banco.
function createDomingoFolgadoEscalaRecord(colaborador, folga) {
    return createDefaultEscalaRecord(colaborador, folga.dataDomingo, {
        tipo: 'domingo_folgado',
        horaInicio: null,
        horaFim: null,
        almocoInicio: null,
        almocoFim: null,
        observacao: buildEscalaObservationParts('Domingo de folga', trimToNull(folga.observacao)),
        origemTipo: 'folga_domingo',
        origemId: folga.id
    });
}

function createReposicaoEscalaRecord(colaborador, folga) {
    return createDefaultEscalaRecord(colaborador, folga.dataReposicao, {
        tipo: 'reposicao',
        horaInicio: extractTimeString(folga.reposicaoHoraInicio),
        horaFim: extractTimeString(folga.reposicaoHoraFim),
        // O almoco vem do proprio registro da folga, pelo mesmo motivo do
        // horario de trabalho: o dia reposto e folga na jornada, entao nao ha
        // almoco de cadastro de onde herdar. Cai nos campos almoco_inicio /
        // almoco_fim de escala_dia, os mesmos de todo almoco do sistema.
        almocoInicio: extractTimeString(folga.reposicaoAlmocoInicio),
        almocoFim: extractTimeString(folga.reposicaoAlmocoFim),
        observacao: `Reposicao do domingo ${folga.dataDomingo}`,
        origemTipo: 'folga_domingo',
        origemId: folga.id
    });
}

// A cobertura NAO troca a origem: aquela linha pertence ao plantao e continua
// apontando para ele. Apagar a folga faz a proxima geracao nao reclassificar,
// e a linha volta a ser plantao sozinha.
//
// Recebe a LISTA de quem folgou no domingo, nao uma pessoa: quem esta escalado
// naquele dia cobre o posto de todos os que folgaram, e nao ha como (nem por
// que) dizer quem cobriu quem individualmente.
function createCoberturaEscalaRecord(registroDoPlantao, nomesDeQuemFolgou) {
    const nomes = (Array.isArray(nomesDeQuemFolgou) ? nomesDeQuemFolgou : [nomesDeQuemFolgou])
        .map((nome) => trimToNull(nome))
        .filter(Boolean);

    return {
        ...registroDoPlantao,
        tipo: 'cobertura',
        observacao: buildEscalaObservationParts(
            nomes.length ? `Cobrindo ${nomes.join(', ')}` : 'Cobertura de domingo',
            trimToNull(registroDoPlantao.observacao)
        )
    };
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
        && !record.almocoAjustado
        && !trimToNull(record.origemTipo)
        && !record.origemId;
}

function serializeEscalaDiaRecord(row) {
    return {
        id: row.id ?? row.Id ?? null,
        colaboradorId: Number(row.colaborador_id ?? row.ColaboradorId ?? row.colaboradorId ?? 0) || null,
        colaboradorNome: row.colaboradorNome ?? row.ColaboradorNome ?? row.Nome ?? row.nome ?? null,
        setorId: row.setorId ?? row.SetorId ?? null,
        setorNome: row.setorNome ?? row.SetorNome ?? null,
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
        almocoPersonalizado: coerceBoolean(row.almoco_personalizado ?? row.AlmocoPersonalizado),
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
        setorId: existingRecord.setorId ?? incomingRecord.setorId ?? null,
        setorNome: existingRecord.setorNome || incomingRecord.setorNome || null,
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

async function findColaboradorById(poolOrTx, colaboradorId) {
    const id = ensurePositiveInt(colaboradorId, 'Colaborador');
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query(`
            SELECT
                c.*,
                s.Nome AS SetorNome
            FROM Colaboradores c
            LEFT JOIN Setores s ON s.Id = c.SetorId
            WHERE c.Id = @id
        `);

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
        clauses.push('c.Id = @colaboradorId');
    }

    const result = await request.query(`
        SELECT
            c.*,
            s.Nome AS SetorNome
        FROM Colaboradores c
        LEFT JOIN Setores s ON s.Id = c.SetorId
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY c.Nome
    `);

    return result.recordset;
}

async function listEscalaDiaRows(poolOrTx, startISO, endISO, options = {}) {
    const { colaboradorId = null, tipo = null, setorId = null } = options;
    const request = poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'));
    // Colaborador desligado (Ativo = 0) some da escala e do relatorio, mesmo com
    // linhas historicas em escala_dia (o historico segue no banco ate a limpeza).
    const clauses = ['e.data BETWEEN @dataInicio AND @dataFim', 'c.Ativo = 1'];

    if (colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(colaboradorId, 'Colaborador'));
        clauses.push('e.colaborador_id = @colaboradorId');
    }

    if (tipo) {
        request.input('tipo', sql.NVarChar(30), normalizeEscalaTipo(tipo));
        clauses.push('LOWER(e.tipo) = @tipo');
    }

    if (setorId) {
        request.input('setorId', sql.Int, ensurePositiveInt(setorId, 'Setor'));
        clauses.push('c.SetorId = @setorId');
    }

    const result = await request.query(`
        SELECT
            ${buildEscalaSelect('e')},
            c.Nome AS colaboradorNome,
            c.SetorId AS setorId,
            s.Nome AS setorNome
        FROM escala_dia e
        INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
        LEFT JOIN Setores s ON s.Id = c.SetorId
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
                c.Nome AS colaboradorNome,
                c.SetorId AS setorId,
                s.Nome AS setorNome
            FROM escala_dia e
            INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
            LEFT JOIN Setores s ON s.Id = c.SetorId
            WHERE e.colaborador_id = @colaboradorId
              AND e.data = @data
        `);

    return result.recordset[0] ? serializeEscalaDiaRecord(result.recordset[0]) : null;
}

// Valida e normaliza uma linha de escala_dia para gravar. Usada pela gravacao
// de uma linha (persistEscalaDiaRecord) e pela em lote: as duas gravam os
// mesmos valores e recusam o mesmo registro com o mesmo erro.
function prepararLinhaEscalaDia(record) {
    validateEscalaTimes(record, {
        allowLunchWithoutWork: record.tipo !== 'normal' && record.tipo !== 'plantao' && !record.horaInicio && !record.horaFim
    });

    return {
        colaboradorId: ensurePositiveInt(record.colaboradorId, 'Colaborador'),
        data: normalizeIsoDate(record.dataISO, 'Data'),
        horaInicio: toSqlTime(record.horaInicio, 'Hora inicial'),
        horaFim: toSqlTime(record.horaFim, 'Hora final'),
        almocoInicio: toSqlTime(record.almocoInicio, 'Inicio do almoco'),
        almocoFim: toSqlTime(record.almocoFim, 'Fim do almoco'),
        tipo: normalizeEscalaTipo(record.tipo),
        observacao: trimToNull(record.observacao),
        origemTipo: trimToNull(record.origemTipo),
        origemId: record.origemId || null,
        ajusteManual: Boolean(record.ajusteManual),
        almocoAjustado: Boolean(record.almocoAjustado)
    };
}

async function persistEscalaDiaRecord(poolOrTx, record) {
    const linha = prepararLinhaEscalaDia(record);

    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, linha.colaboradorId)
        .input('data', sql.Date, linha.data)
        .input('horaInicio', sql.Time, linha.horaInicio)
        .input('horaFim', sql.Time, linha.horaFim)
        .input('almocoInicio', sql.Time, linha.almocoInicio)
        .input('almocoFim', sql.Time, linha.almocoFim)
        .input('tipo', sql.NVarChar(30), linha.tipo)
        .input('observacao', sql.NVarChar(500), linha.observacao)
        .input('origemTipo', sql.NVarChar(30), linha.origemTipo)
        .input('origemId', sql.Int, linha.origemId)
        .input('ajusteManual', sql.Bit, linha.ajusteManual)
        .input('almocoAjustado', sql.Bit, linha.almocoAjustado)
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

async function ensureEscalaBaseForPeriod(poolOrTx, startISO, endISO, options = {}) {
    const { colaboradorId = null, includeSaturday = false } = options;
    const colaboradores = await listColaboradores(poolOrTx, { colaboradorId });
    const jornadaSemanalRows = await listJornadaSemanal(poolOrTx, {
        colaboradorId,
        onlyActive: false
    });
    const jornadaSemanalIndex = buildJornadaSemanalIndex(jornadaSemanalRows);
    const existingRows = await listEscalaDiaRows(poolOrTx, startISO, endISO, { colaboradorId });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));
    const feriados = await loadFeriadosDoPeriodo(poolOrTx, startISO, endISO);
    const counters = {
        created: 0,
        updated: 0,
        skipped: 0,
        deleted: 0
    };
    // Linhas que ainda nao existiam no mapa; vao para o banco num lote so.
    const novasLinhas = [];
    const colaboradoresDasNovas = new Map();

    for (const dataISO of iterateIsoDates(startISO, endISO)) {
        const weekday = getDayOfWeek(dataISO);
        const isFeriado = feriados.has(dataISO);

        for (const colaborador of colaboradores) {
            const key = buildEscalaKey(colaborador.Id, dataISO);
            const existingRecord = existingMap.get(key) || null;
            const jornadaInfo = jornadaSemanalIndex.get(Number(colaborador.Id)) || {
                hasRows: false,
                activeByDay: new Map()
            };
            let defaultRecord = null;

            if (isFeriado) {
                // Feriado: sem escala padrao. A linha automatica que ja existia
                // e removida abaixo; o plantao do feriado entra na hidratacao.
            } else if (jornadaInfo.hasRows) {
                const jornadaDia = jornadaInfo.activeByDay.get(weekday);

                if (jornadaDia) {
                    defaultRecord = createEscalaRecordFromWeeklySchedule(colaborador, jornadaDia, dataISO, {
                        tipo: 'normal'
                    });

                    if (!defaultRecord.horaInicio || !defaultRecord.horaFim) {
                        defaultRecord = null;
                    }
                }
            } else {
                const shouldCreate = includeSaturday
                    ? weekday >= 1 && weekday <= 6
                    : shouldCreateWeekdayBase(dataISO);

                if (shouldCreate && hasColaboradorDefaultWorkSchedule(colaborador)) {
                    defaultRecord = createDefaultEscalaRecord(colaborador, dataISO, {
                        tipo: 'normal'
                    });
                }
            }

            if (!defaultRecord) {
                if (existingRecord && canDeleteAutomaticEscalaRecord(existingRecord)) {
                    await poolOrTx.request()
                        .input('colaboradorId', sql.Int, ensurePositiveInt(colaborador.Id, 'Colaborador'))
                        .input('data', sql.Date, normalizeIsoDate(dataISO, 'Data'))
                        .query(`
                            DELETE FROM escala_dia
                            WHERE colaborador_id = @colaboradorId
                              AND data = @data
                        `);

                    existingMap.delete(key);
                    counters.deleted += 1;
                } else if (existingRecord) {
                    counters.skipped += 1;
                }

                continue;
            }

            if (!existingRecord) {
                // Valida ja (mesmo erro, no mesmo ponto) e grava no lote abaixo.
                novasLinhas.push(prepararLinhaEscalaDia(defaultRecord));
                colaboradoresDasNovas.set(key, colaborador);
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

    // Adiar a gravacao para ca nao muda o resultado: cada chave (colaborador +
    // dia) e visitada uma vez so no laco acima, e o mapa so e lido de novo pela
    // hidratacao, depois deste ponto. Todo chamador roda numa transacao.
    const gravadas = await mergeEscalaDiaEmLote(poolOrTx, novasLinhas);

    for (const gravada of gravadas) {
        const serializada = serializeEscalaDiaRecord(gravada);
        const key = buildEscalaKey(serializada.colaboradorId, serializada.dataISO);
        const colaborador = colaboradoresDasNovas.get(key);

        existingMap.set(key, serializeEscalaDiaRecord({
            ...gravada,
            colaboradorNome: colaborador.Nome,
            setorId: colaborador.SetorId ?? null,
            setorNome: colaborador.SetorNome ?? null
        }));
    }

    return {
        counters,
        existingMap,
        colaboradores,
        feriados
    };
}

async function syncColaboradorDefaultsToEscalaDia(poolOrTx, colaborador) {
    const colaboradorId = ensurePositiveInt(colaborador.Id || colaborador.id, 'Colaborador');

    const jornadaRows = await listJornadaSemanal(poolOrTx, {
        colaboradorId,
        onlyActive: false
    });

    if (jornadaRows.length > 0) {
        return {
            updated: 0,
            skipped: 0,
            ignoredByWeeklySchedule: true
        };
    }

    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            SELECT
                ${buildEscalaSelect('e')},
                c.Nome AS colaboradorNome,
                c.SetorId AS setorId,
                s.Nome AS setorNome
            FROM escala_dia e
            INNER JOIN Colaboradores c ON c.Id = e.colaborador_id
            LEFT JOIN Setores s ON s.Id = c.SetorId
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

async function listLunchOverrideRows(poolOrTx, startISO, endISO, options = {}) {
    const request = poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'));
    const clauses = ['a.Data BETWEEN @dataInicio AND @dataFim'];

    if (options.colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(options.colaboradorId, 'Colaborador'));
        clauses.push('a.ColaboradorId = @colaboradorId');
    }

    const result = await request.query(`
        SELECT
            a.Id,
            a.ColaboradorId,
            CONVERT(VARCHAR(10), a.Data, 23) AS dataISO,
            a.AlmocoInicio,
            a.AlmocoFim,
            a.CriadoEm,
            a.AtualizadoEm
        FROM AlmocosPersonalizados a
        WHERE ${clauses.join(' AND ')}
        ORDER BY a.Data, a.ColaboradorId
    `);

    return result.recordset.map((row) => ({
        id: row.Id,
        colaboradorId: Number(row.ColaboradorId),
        dataISO: normalizeIsoDate(row.dataISO, 'Data'),
        almocoInicio: extractTimeString(row.AlmocoInicio),
        almocoFim: extractTimeString(row.AlmocoFim),
        criadoEm: row.CriadoEm,
        atualizadoEm: row.AtualizadoEm
    }));
}

async function upsertLunchOverride(poolOrTx, colaborador, dataISO, almocoInicio, almocoFim) {
    const defaults = getColaboradorDefaultLunchTimes(colaborador);
    const useDefault = areSameLunchTimes(defaults.almocoInicio, defaults.almocoFim, almocoInicio, almocoFim);

    if (useDefault || (!almocoInicio && !almocoFim)) {
        await poolOrTx.request()
            .input('colaboradorId', sql.Int, ensurePositiveInt(colaborador.Id || colaborador.id, 'Colaborador'))
            .input('data', sql.Date, normalizeIsoDate(dataISO, 'Data'))
            .query(`
                DELETE FROM AlmocosPersonalizados
                WHERE ColaboradorId = @colaboradorId
                  AND Data = @data
            `);

        return { action: 'deleted' };
    }

    await poolOrTx.request()
        .input('colaboradorId', sql.Int, ensurePositiveInt(colaborador.Id || colaborador.id, 'Colaborador'))
        .input('data', sql.Date, normalizeIsoDate(dataISO, 'Data'))
        .input('almocoInicio', sql.Time, toSqlTime(almocoInicio, 'Inicio do almoco'))
        .input('almocoFim', sql.Time, toSqlTime(almocoFim, 'Fim do almoco'))
        .query(`
            MERGE AlmocosPersonalizados AS target
            USING (
                SELECT
                    @colaboradorId AS ColaboradorId,
                    @data AS Data
            ) AS source
            ON target.ColaboradorId = source.ColaboradorId
               AND target.Data = source.Data
            WHEN MATCHED THEN UPDATE SET
                AlmocoInicio = @almocoInicio,
                AlmocoFim = @almocoFim,
                AtualizadoEm = GETDATE()
            WHEN NOT MATCHED THEN INSERT (
                ColaboradorId,
                Data,
                AlmocoInicio,
                AlmocoFim
            ) VALUES (
                @colaboradorId,
                @data,
                @almocoInicio,
                @almocoFim
            );
        `);

    return { action: 'upserted' };
}

async function hydrateLunchOverridesIntoEscala(poolOrTx, existingMap, colaboradores, startISO, endISO, options = {}) {
    const overrides = await listLunchOverrideRows(poolOrTx, startISO, endISO, {
        colaboradorId: options.colaboradorId || null
    });
    const colaboradoresMap = new Map((colaboradores || []).map((item) => [Number(item.Id), item]));
    const feriados = options.feriados || new Set();

    for (const override of overrides) {
        const colaborador = colaboradoresMap.get(Number(override.colaboradorId));

        if (!colaborador) {
            continue;
        }

        // Feriado nao tem escala padrao. Um almoco personalizado gravado antes
        // (ex.: "aplicar almoco no periodo" cobrindo o feriado) recriava aqui a
        // linha que a base acabou de remover, com o horario do cadastro. Quem
        // trabalha no feriado vem do plantao, que nao tem almoco.
        if (feriados.has(override.dataISO)) {
            continue;
        }

        const key = buildEscalaKey(override.colaboradorId, override.dataISO);
        const existing = existingMap.get(key) || createDefaultEscalaRecord(colaborador, override.dataISO, {
            tipo: getDayOfWeek(override.dataISO) === 6 ? 'ajuste' : 'normal'
        });
        const nextRecord = {
            ...existing,
            colaboradorId: override.colaboradorId,
            colaboradorNome: colaborador.Nome,
            setorId: colaborador.SetorId ?? null,
            setorNome: colaborador.SetorNome ?? null,
            dataISO: override.dataISO,
            almocoInicio: override.almocoInicio,
            almocoFim: override.almocoFim,
            almocoAjustado: true
        };

        const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);
        existingMap.set(key, serializeEscalaDiaRecord({
            ...persisted,
            colaboradorNome: colaborador.Nome,
            setorId: colaborador.SetorId ?? null,
            setorNome: colaborador.SetorNome ?? null,
            almocoPersonalizado: true
        }));
    }
}

const HISTORICO_AUSENCIA_COLUNAS = `
                Id,
                ColaboradorId,
                Tipo,
                DataInicio,
                DataFim,
                PeriodoTipo,
                HoraInicio,
                HoraFim,
                Subtipo,
                Observacao`;

const HISTORICO_PLANTAO_COLUNAS = `
                id,
                data_plantao,
                ${SQL_EQUIPE_PLANTAO},
                hora_inicio,
                hora_fim,
                observacao`;

async function hydrateHistoricSourcesIntoEscala(poolOrTx, existingMap, colaboradores, startISO, endISO, options = {}) {
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
        SELECT ${HISTORICO_AUSENCIA_COLUNAS}
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
            const key = buildEscalaKey(colaborador.Id, dataISO);
            const existing = existingMap.get(key) || null;

            if (!existing) {
                counters.skipped += 1;
                continue;
            }

            const result = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createAusenciaEscalaRecord(colaborador, ausencia, dataISO, existing),
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
        SELECT ${HISTORICO_PLANTAO_COLUNAS}
        FROM plantoes
        WHERE ${plantaoClauses.join(' AND ')}
    `);

    // Agrupa por data antes de aplicar: um dia com varios turnos precisa virar
    // uma linha so por colaborador na escala (ver aggregatePlantoesPorColaborador).
    const plantoesPorData = new Map();

    for (const row of plantoesResult.recordset) {
        const plantao = serializePlantaoRecord(row);

        if (!ESCALA_PLANTAO_TIPOS.includes(plantao.tipoPlantao)) {
            continue;
        }

        if (!plantoesPorData.has(plantao.dataISO)) {
            plantoesPorData.set(plantao.dataISO, []);
        }

        plantoesPorData.get(plantao.dataISO).push(plantao);
    }

    for (const plantoesDoDia of plantoesPorData.values()) {
        for (const [colaboradorEscalado, plantao] of aggregatePlantoesPorColaborador(plantoesDoDia)) {
            if (colaboradorId && Number(colaboradorEscalado) !== Number(colaboradorId)) {
                continue;
            }

            const colaborador = colaboradoresMap.get(Number(colaboradorEscalado));

            if (!colaborador) {
                continue;
            }

            const key = buildEscalaKey(colaborador.Id, plantao.dataISO);
            const existing = existingMap.get(key) || null;

            if (existing && normalizeEscalaTipo(existing.tipo || 'normal') !== 'plantao' && !trimToNull(existing.origemTipo)) {
                counters.skipped += 1;
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

    // DEPOIS dos plantoes, de proposito: a cobertura reclassifica a linha que a
    // passada de plantao acabou de criar para quem cobriu o posto.
    await hydrateFolgasDomingoIntoEscala(poolOrTx, existingMap, colaboradoresMap, startISO, endISO, counters);

    return counters;
}

// Uma linha de FolgasDomingo vira ate tres linhas de escala:
//   DataDomingo   -> o plantonista fica 'domingo_folgado' (sem horario)
//   DataReposicao -> o plantonista fica 'reposicao' (com o horario gravado)
//   DataDomingo   -> quem cobriu passa de 'plantao' para 'cobertura'
//
// Tudo com origem_tipo 'folga_domingo', menos a cobertura: aquela linha ja
// pertence ao plantao e continua apontando para ele. Se a folga for apagada, a
// proxima geracao simplesmente nao reclassifica e a linha volta a ser plantao,
// sem precisar de limpeza.
async function hydrateFolgasDomingoIntoEscala(poolOrTx, existingMap, colaboradoresMap, startISO, endISO, counters) {
    const result = await poolOrTx.request()
        .input('dataInicio', sql.Date, normalizeIsoDate(startISO, 'Data inicial'))
        .input('dataFim', sql.Date, normalizeIsoDate(endISO, 'Data final'))
        .query(`
            SELECT
                Id,
                ColaboradorId,
                CONVERT(VARCHAR(10), DataDomingo, 23) AS DataDomingo,
                CONVERT(VARCHAR(10), DataReposicao, 23) AS DataReposicao,
                ReposicaoHoraInicio,
                ReposicaoHoraFim,
                ReposicaoAlmocoInicio,
                ReposicaoAlmocoFim,
                Observacao
            FROM FolgasDomingo
            WHERE (DataDomingo BETWEEN @dataInicio AND @dataFim)
               OR (DataReposicao BETWEEN @dataInicio AND @dataFim)
        `);

    const conta = (acao) => { counters[acao] = (counters[acao] || 0) + 1; };
    // Domingo -> nomes de quem folgou nele. Alimenta a passada de cobertura
    // mais abaixo, que e por DIA e nao por pessoa.
    const folguistasPorDomingo = new Map();

    for (const folga of result.recordset) {
        const colaborador = colaboradoresMap.get(Number(folga.ColaboradorId));

        // A regra de folga de domingo vem do CADASTRO: quem nao e mais plantonista
        // de final de semana nao tem o domingo folgado nem a reposicao aplicados.
        if (!colaborador || !temFolgaDeDomingo(colaborador)) {
            continue;
        }

        const dataDomingo = extractDateString(folga.DataDomingo);
        const dataReposicao = extractDateString(folga.DataReposicao);
        const noPeriodo = (dataISO) => Boolean(dataISO) && dataISO >= startISO && dataISO <= endISO;

        const dadosDaFolga = {
            id: folga.Id,
            dataDomingo,
            dataReposicao,
            reposicaoHoraInicio: folga.ReposicaoHoraInicio,
            reposicaoHoraFim: folga.ReposicaoHoraFim,
            reposicaoAlmocoInicio: folga.ReposicaoAlmocoInicio,
            reposicaoAlmocoFim: folga.ReposicaoAlmocoFim,
            observacao: folga.Observacao
        };

        if (noPeriodo(dataDomingo)) {
            if (!folguistasPorDomingo.has(dataDomingo)) {
                folguistasPorDomingo.set(dataDomingo, []);
            }

            folguistasPorDomingo.get(dataDomingo).push(colaborador.Nome);

            const aplicado = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createDomingoFolgadoEscalaRecord(colaborador, dadosDaFolga),
                { force: false }
            );

            conta(aplicado.action);
        }

        // A reposicao cai num dia que a jornada marca como folga, entao a
        // geracao base NAO criou linha nenhuma — esta aqui cria do zero. E o
        // motivo de o horario ficar guardado na propria FolgasDomingo: nao ha
        // jornada daquele dia de onde puxar.
        if (noPeriodo(dataReposicao)) {
            const aplicado = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createReposicaoEscalaRecord(colaborador, dadosDaFolga),
                { force: false }
            );

            conta(aplicado.action);
        }

    }

    // Cobertura: num domingo que tem folga registrada, TODO mundo escalado
    // naquele dia esta, por definicao, cobrindo. Nao ha campo "quem cobriu" —
    // ele duplicaria a lista de quem foi lancado no plantao do dia.
    //
    // So pega quem ja tem linha de plantao: sem lancamento, ninguem trabalhou,
    // e o vinculo da folga por si so nao escala ninguem.
    for (const [dataDomingo, folguistas] of folguistasPorDomingo) {
        for (const registro of [...existingMap.values()]) {
            if (registro.dataISO !== dataDomingo || registro.tipo !== 'plantao') {
                continue;
            }

            const aplicado = await applyAutomaticEscalaRecord(
                poolOrTx,
                existingMap,
                createCoberturaEscalaRecord(registro, folguistas),
                { force: false }
            );

            conta(aplicado.action);
        }
    }
}

async function ensureEscalaDiaForPeriod(poolOrTx, startISO, endISO, options = {}) {
    const { hydrateSources = true, colaboradorId = null, includeSaturday = false } = options;
    const baseResult = await ensureEscalaBaseForPeriod(poolOrTx, startISO, endISO, {
        colaboradorId,
        includeSaturday
    });
    const counters = {
        ...baseResult.counters
    };

    if (hydrateSources) {
        const hydratedCounters = await hydrateHistoricSourcesIntoEscala(
            poolOrTx,
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

    await hydrateLunchOverridesIntoEscala(
        poolOrTx,
        baseResult.existingMap,
        baseResult.colaboradores,
        startISO,
        endISO,
        { colaboradorId, feriados: baseResult.feriados }
    );

    return {
        counters,
        existingMap: baseResult.existingMap,
        colaboradores: baseResult.colaboradores
    };
}

async function syncAusenciaToEscalaDia(poolOrTx, ausencia, colaborador) {
    const dataInicio = extractDateString(ausencia.DataInicio || ausencia.dataInicio);
    const dataFim = extractDateString(ausencia.DataFim || ausencia.dataFim);

    await deleteEscalaDiaByOrigin(poolOrTx, 'ausencia', ausencia.Id || ausencia.id);
    await ensureEscalaDiaForPeriod(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id,
        hydrateSources: false
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));

    for (const dataISO of iterateIsoDates(dataInicio, dataFim)) {
        const key = buildEscalaKey(colaborador.Id, dataISO);

        if (!existingMap.has(key)) {
            continue;
        }

        await applyAutomaticEscalaRecord(
            poolOrTx,
            existingMap,
            createAusenciaEscalaRecord(colaborador, ausencia, dataISO, existingMap.get(key)),
            { force: true }
        );
    }
}

// escala_dia so aceita UMA linha por colaborador/data (UX_escala_dia_colaborador_data).
// Como o dia de plantao passou a ter varios turnos, quem faz mais de um no
// mesmo dia vira uma linha unica que cobre do primeiro inicio ao ultimo fim —
// senao o ultimo turno gravado apagaria o anterior na escala.
function aggregatePlantoesPorColaborador(plantoes) {
    const porColaborador = new Map();

    for (const plantao of plantoes) {
        for (const colaboradorId of (plantao.colaboradores || [])) {
            const chave = Number(colaboradorId);
            const atual = porColaborador.get(chave);

            if (!atual) {
                porColaborador.set(chave, {
                    id: plantao.id,
                    dataISO: plantao.dataISO,
                    horaInicio: plantao.horaInicio,
                    horaFim: plantao.horaFim,
                    observacao: plantao.observacao
                });
                continue;
            }

            if (plantao.horaInicio && (!atual.horaInicio || plantao.horaInicio < atual.horaInicio)) {
                atual.horaInicio = plantao.horaInicio;
            }

            if (plantao.horaFim && (!atual.horaFim || plantao.horaFim > atual.horaFim)) {
                atual.horaFim = plantao.horaFim;
            }

            // A escala aponta para uma origem so; fica com o menor id do dia,
            // que e estavel enquanto qualquer turno daquele dia existir.
            if (plantao.id && (!atual.id || plantao.id < atual.id)) {
                atual.id = plantao.id;
            }

            atual.observacao = atual.observacao || plantao.observacao;
        }
    }

    return porColaborador;
}

// Sincroniza TODOS os turnos de um dia de uma vez. Recebe as linhas cruas da
// tabela plantoes daquela data (o dia inteiro, nao um turno solto).
async function syncPlantaoDiaToEscalaDia(poolOrTx, dataISO, plantaoRows, colaboradores) {
    const plantoes = (plantaoRows || [])
        .map((row) => serializePlantaoRecord(row))
        .filter((plantao) => ESCALA_PLANTAO_TIPOS.includes(plantao.tipoPlantao));

    // Limpa a origem de todos os turnos recebidos, inclusive os que sairam da
    // grade por serem de outro tipo — a escala nao pode ficar apontando para
    // uma linha que nao existe mais.
    for (const row of (plantaoRows || [])) {
        await deleteEscalaDiaByOrigin(poolOrTx, 'plantao', row.id ?? row.Id ?? null);
    }

    if (plantoes.length === 0) {
        return;
    }

    const colaboradoresMap = new Map((colaboradores || []).map((item) => [Number(item.Id), item]));

    await ensureEscalaDiaForPeriod(poolOrTx, dataISO, dataISO, {
        hydrateSources: false
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, dataISO, dataISO);
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));

    for (const [colaboradorId, plantao] of aggregatePlantoesPorColaborador(plantoes)) {
        const colaborador = colaboradoresMap.get(colaboradorId);

        if (!colaborador) {
            continue;
        }

        const existing = existingMap.get(buildEscalaKey(colaborador.Id, plantao.dataISO)) || null;

        if (existing && normalizeEscalaTipo(existing.tipo || 'normal') !== 'plantao' && !trimToNull(existing.origemTipo)) {
            continue;
        }

        await applyAutomaticEscalaRecord(
            poolOrTx,
            existingMap,
            createPlantaoEscalaRecord(colaborador, plantao),
            { force: false }
        );
    }
}

async function syncPlantaoToEscalaDia(poolOrTx, plantaoRow, colaboradores) {
    const dataISO = serializePlantaoRecord(plantaoRow).dataISO;
    return syncPlantaoDiaToEscalaDia(poolOrTx, dataISO, [plantaoRow], colaboradores);
}

async function restoreEscalaDefaultsForPeriod(poolOrTx, startISO, endISO, options = {}) {
    return ensureEscalaDiaForPeriod(poolOrTx, startISO, endISO, {
        ...options,
        hydrateSources: false
    });
}

async function upsertManualEscalaDia(poolOrTx, payload) {
    const colaborador = await findColaboradorById(poolOrTx, payload.colaboradorId);
    const dataISO = normalizeIsoDate(payload.dataISO, 'Data');

    await ensureEscalaDiaForPeriod(poolOrTx, dataISO, dataISO, {
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
        setorId: colaborador.SetorId ?? null,
        setorNome: colaborador.SetorNome ?? null,
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
        almocoAjustado: payload.almocoInicio !== undefined || payload.almocoFim !== undefined
            ? !areSameLunchTimes(
                colaborador.AlmocoInicio || colaborador.almocoInicio,
                colaborador.AlmocoFim || colaborador.almocoFim,
                payload.almocoInicio !== undefined ? payload.almocoInicio : fallback.almocoInicio,
                payload.almocoFim !== undefined ? payload.almocoFim : fallback.almocoFim
            )
            : Boolean(fallback.almocoAjustado)
    };

    validateEscalaTimes(nextRecord, {
        allowLunchWithoutWork: nextRecord.tipo !== 'normal' && nextRecord.tipo !== 'plantao' && !nextRecord.horaInicio && !nextRecord.horaFim
    });

    const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);
    await upsertLunchOverride(poolOrTx, colaborador, dataISO, nextRecord.almocoInicio, nextRecord.almocoFim);

    return serializeEscalaDiaRecord({
        ...persisted,
        colaboradorNome: colaborador.Nome,
        setorId: colaborador.SetorId ?? null,
        setorNome: colaborador.SetorNome ?? null,
        almocoPersonalizado: Boolean(nextRecord.almocoAjustado)
    });
}

async function applyLunchPeriod(poolOrTx, payload) {
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

    await ensureEscalaDiaForPeriod(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });

    const existingRows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: colaborador.Id
    });
    const existingMap = new Map(existingRows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));
    let updated = 0;
    let skipped = 0;

    for (const dataISO of iterateIsoDates(dataInicio, dataFim)) {
        const key = buildEscalaKey(colaborador.Id, dataISO);
        const existing = existingMap.get(key) || null;

        if (!existing) {
            skipped += 1;
            continue;
        }

        const baseRecord = existing;
        const nextRecord = {
            ...baseRecord,
            colaboradorId: colaborador.Id,
            colaboradorNome: colaborador.Nome,
            setorId: colaborador.SetorId ?? null,
            setorNome: colaborador.SetorNome ?? null,
            dataISO,
            almocoInicio,
            almocoFim,
            almocoAjustado: !areSameLunchTimes(
                colaborador.AlmocoInicio || colaborador.almocoInicio,
                colaborador.AlmocoFim || colaborador.almocoFim,
                almocoInicio,
                almocoFim
            )
        };

        validateEscalaTimes(nextRecord, {
            allowLunchWithoutWork: !nextRecord.horaInicio && !nextRecord.horaFim
        });

        const persisted = await persistEscalaDiaRecord(poolOrTx, nextRecord);
        await upsertLunchOverride(poolOrTx, colaborador, dataISO, nextRecord.almocoInicio, nextRecord.almocoFim);
        existingMap.set(key, serializeEscalaDiaRecord({
            ...persisted,
            colaboradorNome: colaborador.Nome,
            setorId: colaborador.SetorId ?? null,
            setorNome: colaborador.SetorNome ?? null,
            almocoPersonalizado: Boolean(nextRecord.almocoAjustado)
        }));

        updated += 1;
    }

    return {
        // As linhas do periodo ja foram criadas por ensureEscalaDiaForPeriod
        // acima; aqui so se atualiza. A chave fica na resposta por contrato.
        created: 0,
        updated,
        skipped
    };
}

async function resetEscalaLunchesToCadastro(poolOrTx, dataISO, options = {}) {
    const normalized = normalizeIsoDate(dataISO, 'Data');
    await ensureEscalaDiaForPeriod(poolOrTx, normalized, normalized);

    const rows = await listEscalaDiaRows(poolOrTx, normalized, normalized, {
        setorId: options.setorId || null
    });
    const colaboradores = await listColaboradores(poolOrTx);
    const colaboradoresMap = new Map(colaboradores.map((item) => [Number(item.Id), item]));
    const result = {
        total: rows.length,
        updated: 0,
        skipped: 0,
        semCadastro: 0,
        invalidos: 0
    };

    for (const row of rows) {
        const colaborador = colaboradoresMap.get(Number(row.colaboradorId));

        if (!colaborador) {
            result.skipped += 1;
            continue;
        }

        const defaults = getColaboradorDefaultLunchTimes(colaborador);
        const defaultStart = defaults.almocoInicio || null;
        const defaultEnd = defaults.almocoFim || null;
        const shouldClearLunch = !defaultStart && !defaultEnd;

        if (!shouldClearLunch && (!defaultStart || !defaultEnd)) {
            result.semCadastro += 1;
            continue;
        }

        if (!shouldClearLunch && compareTimes(defaultStart, defaultEnd) >= 0) {
            result.invalidos += 1;
            continue;
        }

        if (
            !shouldClearLunch
            && row.horaInicio
            && row.horaFim
            && (compareTimes(defaultStart, row.horaInicio) < 0 || compareTimes(defaultEnd, row.horaFim) > 0)
        ) {
            result.invalidos += 1;
            continue;
        }

        const sameLunch = areSameLunchTimes(row.almocoInicio, row.almocoFim, defaultStart, defaultEnd);

        await upsertLunchOverride(poolOrTx, colaborador, normalized, defaultStart, defaultEnd);

        if (sameLunch && !row.almocoAjustado) {
            result.skipped += 1;
            continue;
        }

        await persistEscalaDiaRecord(poolOrTx, {
            ...row,
            almocoInicio: defaultStart,
            almocoFim: defaultEnd,
            almocoAjustado: false
        });
        result.updated += 1;
    }

    result.skipped += result.semCadastro + result.invalidos;
    return result;
}

async function listEscalaDiaByDate(poolOrTx, dataISO, options = {}) {
    const normalized = normalizeIsoDate(dataISO, 'Data');
    await ensureEscalaDiaForPeriod(poolOrTx, normalized, normalized, {
        setorId: options.setorId || null
    });
    const rows = await listEscalaDiaRows(poolOrTx, normalized, normalized, {
        setorId: options.setorId || null
    });

    return rows.map((row) => ({
        ...row,
        diaSemana: getDayOfWeekLabel(row.dataISO),
        horario: buildTimeRangeLabel(row.horaInicio, row.horaFim),
        almoco: buildTimeRangeLabel(row.almocoInicio, row.almocoFim)
    }));
}

async function listEscalaReport(poolOrTx, filters) {
    const { dataInicio, dataFim } = buildDateRange(filters.dataInicio, filters.dataFim);
    await ensureEscalaDiaForPeriod(poolOrTx, dataInicio, dataFim, {
        colaboradorId: filters.colaboradorId || null
    });

    const rows = await listEscalaDiaRows(poolOrTx, dataInicio, dataFim, {
        colaboradorId: filters.colaboradorId || null,
        setorId: filters.setorId || null,
        tipo: filters.tipo || null
    });
    const colaboradores = await listColaboradores(poolOrTx, {
        colaboradorId: filters.colaboradorId || null
    });
    const colaboradoresMap = new Map(colaboradores.map((item) => [Number(item.Id), item]));
    // Mesma fonte que a escala padrao usa (ensureEscalaBaseForPeriod): quem
    // tem jornada semanal tem o almoco do dia definido la, nao na ficha.
    const jornadaSemanalIndex = buildJornadaSemanalIndex(await listJornadaSemanal(poolOrTx, {
        colaboradorId: filters.colaboradorId || null,
        onlyActive: false
    }));

    return rows.map((row) => ({
        id: row.id,
        dataISO: row.dataISO,
        diaSemana: getDayOfWeekLabel(row.dataISO),
        colaboradorId: row.colaboradorId,
        colaboradorNome: row.colaboradorNome,
        setorId: row.setorId,
        setorNome: row.setorNome,
        horaInicio: formatTimeToDisplay(row.horaInicio),
        horaFim: formatTimeToDisplay(row.horaFim),
        almocoInicio: formatTimeToDisplay(row.almocoInicio),
        almocoFim: formatTimeToDisplay(row.almocoFim),
        horario: buildTimeRangeLabel(row.horaInicio, row.horaFim),
        almoco: buildTimeRangeLabel(row.almocoInicio, row.almocoFim),
        almocoForaDoCadastro: isLunchOutsideCadastro(
            row,
            colaboradoresMap.get(Number(row.colaboradorId)),
            jornadaSemanalIndex.get(Number(row.colaboradorId)) || null
        ),
        tipo: row.tipo,
        observacao: row.observacao || null
    }));
}

// O relatorio destaca em vermelho o almoco que difere do cadastro do
// colaborador. Dia sem almoco lancado, ou colaborador sem almoco no cadastro,
// nao tem com o que comparar e fica sem destaque.
//
// "Cadastro" segue a mesma regra da escala padrao: com jornada semanal vale o
// almoco daquele dia da semana; sem jornada, o almoco da ficha. Dia fora da
// jornada (ex.: plantao no sabado) nao tem referencia e nao e destacado.
function getCadastroLunchForDate(colaborador, jornadaInfo, dataISO) {
    if (jornadaInfo && jornadaInfo.hasRows) {
        const jornadaDia = jornadaInfo.activeByDay.get(getDayOfWeek(dataISO));

        return {
            almocoInicio: jornadaDia ? extractTimeString(jornadaDia.almocoInicio ?? jornadaDia.AlmocoInicio) : null,
            almocoFim: jornadaDia ? extractTimeString(jornadaDia.almocoFim ?? jornadaDia.AlmocoFim) : null
        };
    }

    return getColaboradorDefaultLunchTimes(colaborador);
}

function isLunchOutsideCadastro(row, colaborador, jornadaInfo = null) {
    if (!colaborador || !row.almocoInicio || !row.almocoFim) {
        return false;
    }

    const defaults = getCadastroLunchForDate(colaborador, jornadaInfo, row.dataISO);

    if (!defaults.almocoInicio || !defaults.almocoFim) {
        return false;
    }

    return !areSameLunchTimes(row.almocoInicio, row.almocoFim, defaults.almocoInicio, defaults.almocoFim);
}

module.exports = {
    ESCALA_TIPOS,
    applyLunchPeriod,
    buildColaboradorDefaultSyncRecord,
    buildTimeRangeLabel,
    canAutoRefreshDefaultEscala,
    createAusenciaEscalaRecord,
    createDefaultEscalaRecord,
    createCoberturaEscalaRecord,
    createDomingoFolgadoEscalaRecord,
    createPlantaoEscalaRecord,
    createReposicaoEscalaRecord,
    deleteEscalaDiaByOrigin,
    ensureEscalaDiaForPeriod,
    findColaboradorById,
    findEscalaDiaByColaboradorAndDate,
    formatTimeToDisplay,
    getDayOfWeek,
    getDayOfWeekLabel,
    getColaboradorDefaultLunchTimes,
    isLunchOutsideCadastro,
    isSunday,
    iterateIsoDates,
    listEscalaDiaByDate,
    listEscalaReport,
    loadFeriadosDoPeriodo,
    normalizeEscalaTipo,
    persistEscalaDiaRecord,
    resetEscalaLunchesToCadastro,
    restoreEscalaDefaultsForPeriod,
    serializeEscalaDiaRecord,
    shouldCreateWeekdayBase,
    syncColaboradorDefaultsToEscalaDia,
    syncAusenciaToEscalaDia,
    aggregatePlantoesPorColaborador,
    syncPlantaoDiaToEscalaDia,
    syncPlantaoToEscalaDia,
    upsertManualEscalaDia
};

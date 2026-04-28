const fs = require('fs');
const path = require('path');

const { sql } = require('../db');
const { normalizeSubtipo, resolveDefaultDescontaBancoHoras } = require('./bancoHoras');
const {
    normalizeBackupDirectory
} = require('./backup-config');
const { REQUIRED_TABLES } = require('./database-schema');
const { AppError } = require('./errors');
const { normalizeColaboradores } = require('./plantoes');
const { withTransaction } = require('./transactions');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('./validation');

const AUSENCIA_TIPOS = Object.freeze(['folga', 'ausencia', 'ferias']);
const AUSENCIA_PERIODO_TIPOS = Object.freeze(['dia_inteiro', 'horas']);
const ESCALA_DIA_TIPOS = Object.freeze(['normal', 'plantao', 'folga', 'ferias', 'ausencia', 'ajuste']);
const BACKUP_DELETE_ORDER = Object.freeze([
    'BancoHorasMovimentos',
    'escala_dia',
    'Ausencias',
    'plantoes',
    'Feriados',
    'Colaboradores'
]);
const BACKUP_INSERT_ORDER = Object.freeze([
    'Colaboradores',
    'Feriados',
    'Ausencias',
    'plantoes',
    'BancoHorasMovimentos',
    'escala_dia'
]);
const TABLE_INSERT_SPECS = Object.freeze({
    Colaboradores: {
        identityColumn: 'Id',
        columns: [
            ['Id', sql.Int],
            ['Nome', sql.NVarChar(300)],
            ['TrabalhoInicio', sql.Time],
            ['TrabalhoFim', sql.Time],
            ['AlmocoInicio', sql.Time],
            ['AlmocoFim', sql.Time]
        ]
    },
    Feriados: {
        identityColumn: 'Id',
        columns: [
            ['Id', sql.Int],
            ['Nome', sql.NVarChar(200)],
            ['Data', sql.Date],
            ['Tipo', sql.NVarChar(50)]
        ]
    },
    Ausencias: {
        identityColumn: 'Id',
        columns: [
            ['Id', sql.Int],
            ['ColaboradorId', sql.Int],
            ['Tipo', sql.NVarChar(30)],
            ['DataInicio', sql.Date],
            ['DataFim', sql.Date],
            ['DataCadastro', sql.DateTime],
            ['PeriodoTipo', sql.NVarChar(20)],
            ['HoraInicio', sql.Time],
            ['HoraFim', sql.Time],
            ['Subtipo', sql.NVarChar(50)],
            ['DescontaBancoHoras', sql.Bit],
            ['Observacao', sql.NVarChar(500)]
        ]
    },
    plantoes: {
        identityColumn: 'id',
        columns: [
            ['id', sql.Int],
            ['data_plantao', sql.Date],
            ['colaboradores_ids', sql.NVarChar(sql.MAX)],
            ['criado_em', sql.DateTime],
            ['atualizado_em', sql.DateTime],
            ['hora_inicio', sql.Time],
            ['hora_fim', sql.Time],
            ['observacao', sql.NVarChar(500)]
        ]
    },
    BancoHorasMovimentos: {
        identityColumn: 'Id',
        columns: [
            ['Id', sql.Int],
            ['ColaboradorId', sql.Int],
            ['DataReferencia', sql.Date],
            ['Minutos', sql.Int],
            ['OrigemTipo', sql.NVarChar(30)],
            ['OrigemId', sql.Int],
            ['Descricao', sql.NVarChar(255)],
            ['Observacao', sql.NVarChar(500)],
            ['CriadoEm', sql.DateTime]
        ]
    },
    escala_dia: {
        identityColumn: 'id',
        columns: [
            ['id', sql.Int],
            ['colaborador_id', sql.Int],
            ['data', sql.Date],
            ['hora_inicio', sql.Time],
            ['hora_fim', sql.Time],
            ['almoco_inicio', sql.Time],
            ['almoco_fim', sql.Time],
            ['tipo', sql.NVarChar(30)],
            ['observacao', sql.NVarChar(500)],
            ['origem_tipo', sql.NVarChar(30)],
            ['origem_id', sql.Int],
            ['ajuste_manual', sql.Bit],
            ['almoco_ajustado', sql.Bit],
            ['criado_em', sql.DateTime],
            ['atualizado_em', sql.DateTime]
        ]
    }
});

function formatBackupTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function backupJsonReplacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('base64');
    }

    return value;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureBackupObject(value, message) {
    if (!isPlainObject(value)) {
        throw new AppError(400, message);
    }

    return value;
}

function getFirstDefinedValue(source, aliases) {
    if (!source) {
        return undefined;
    }

    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(source, alias) && source[alias] !== undefined) {
            return source[alias];
        }
    }

    return undefined;
}

function getBackupArray(source, aliases) {
    const value = getFirstDefinedValue(source, aliases);
    return Array.isArray(value) ? value : [];
}

function normalizeNullablePositiveInt(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return ensurePositiveInt(value, fieldName);
}

function normalizeBackupDate(value, fieldName) {
    const extracted = extractDateString(value);

    if (!extracted) {
        throw new AppError(400, `${fieldName} invalida no arquivo de backup.`);
    }

    return normalizeIsoDate(extracted, fieldName);
}

function normalizeBackupDateTime(value, fieldName, fallback = null) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
    }

    const date = value instanceof Date ? value : new Date(String(value));

    if (Number.isNaN(date.getTime())) {
        throw new AppError(400, `${fieldName} invalido no arquivo de backup.`);
    }

    return date;
}

function normalizeBackupTimeValue(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    const extracted = extractTimeString(value) || String(value).trim();
    const normalized = normalizeNullableTime(extracted, fieldName);
    return normalized ? toSqlTime(normalized, fieldName) : null;
}

function normalizeTextWithDefault(value, fieldName, options = {}) {
    const normalized = normalizeOptionalText(value, fieldName, options);
    return normalized || (options.defaultValue ?? null);
}

function normalizeRequiredText(value, fieldName, options = {}) {
    const normalized = normalizeOptionalText(value, fieldName, options);

    if (!normalized) {
        throw new AppError(400, `${fieldName} e obrigatorio no arquivo de backup.`);
    }

    return normalized;
}

function normalizePlantaoColaboradores(value) {
    if (value === undefined || value === null || value === '') {
        return '[]';
    }

    let parsed = value;

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            throw new AppError(400, 'O campo colaboradores_ids do plantao esta invalido no backup.');
        }
    }

    return JSON.stringify(normalizeColaboradores(parsed));
}

async function ensureBackupDirectory(directory) {
    const normalizedDirectory = normalizeBackupDirectory(directory);

    try {
        await fs.promises.mkdir(normalizedDirectory, { recursive: true });
        await fs.promises.access(normalizedDirectory, fs.constants.W_OK);
    } catch (error) {
        throw new AppError(
            500,
            'Nao foi possivel acessar ou gravar na pasta de backup informada.',
            {
                directory: normalizedDirectory,
                code: error.code || null
            }
        );
    }

    return normalizedDirectory;
}

async function listExistingBackupTables(pool) {
    const result = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME IN (${REQUIRED_TABLES.map((table) => `'${table}'`).join(', ')})
    `);

    return result.recordset.map((row) => row.TABLE_NAME);
}

async function createSystemBackup(pool, options = {}) {
    const directory = await ensureBackupDirectory(options.directory);
    const existingTables = await listExistingBackupTables(pool);
    const generatedAt = new Date();
    const fileName = `backup-escalas-${formatBackupTimestamp(generatedAt)}.json`;
    const filePath = path.join(directory, fileName);
    const data = {};
    const tableCounts = {};
    let totalRows = 0;

    for (const tableName of REQUIRED_TABLES) {
        if (!existingTables.includes(tableName)) {
            data[tableName] = [];
            tableCounts[tableName] = 0;
            continue;
        }

        const result = await pool.request().query(`SELECT * FROM [dbo].[${tableName}]`);
        const rows = result.recordset.map((row) => JSON.parse(JSON.stringify(row, backupJsonReplacer)));

        data[tableName] = rows;
        tableCounts[tableName] = rows.length;
        totalRows += rows.length;
    }

    const payload = {
        metadata: {
            system: 'Software de Escalas',
            version: '1.0.0',
            generatedAt: generatedAt.toISOString(),
            generatedBy: options.generatedBy || 'backup-local-manual',
            database: options.databaseInfo || {},
            tablesExported: existingTables,
            tableCounts,
            totalRows
        },
        data
    };

    try {
        await fs.promises.writeFile(filePath, JSON.stringify(payload, backupJsonReplacer, 2), 'utf8');
    } catch (error) {
        throw new AppError(
            500,
            'Nao foi possivel gravar o arquivo de backup na pasta informada.',
            {
                filePath,
                code: error.code || null
            }
        );
    }

    return {
        generatedAt: payload.metadata.generatedAt,
        generatedBy: payload.metadata.generatedBy,
        fileName,
        filePath,
        tableCounts,
        totalRows,
        tablesExported: existingTables
    };
}

function normalizeColaboradorRow(row) {
    const normalized = {
        Id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['Id', 'id']), 'Id do colaborador'),
        Nome: normalizeOptionalText(getFirstDefinedValue(row, ['Nome', 'nome']), 'Nome', { maxLength: 300 }),
        TrabalhoInicio: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['TrabalhoInicio', 'trabalhoInicio']),
            'Inicio do trabalho'
        ),
        TrabalhoFim: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['TrabalhoFim', 'trabalhoFim']),
            'Fim do trabalho'
        ),
        AlmocoInicio: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['AlmocoInicio', 'almocoInicio']),
            'Inicio do almoco'
        ),
        AlmocoFim: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['AlmocoFim', 'almocoFim']),
            'Fim do almoco'
        )
    };

    if (!normalized.Nome) {
        throw new AppError(400, 'Todo colaborador do backup precisa ter nome.');
    }

    validateWorkSchedule({
        trabalhoInicio: extractTimeString(normalized.TrabalhoInicio),
        trabalhoFim: extractTimeString(normalized.TrabalhoFim),
        almocoInicio: extractTimeString(normalized.AlmocoInicio),
        almocoFim: extractTimeString(normalized.AlmocoFim)
    });

    return normalized;
}

function normalizeFeriadoRow(row) {
    return {
        Id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['Id', 'id']), 'Id do feriado'),
        Nome: normalizeRequiredText(getFirstDefinedValue(row, ['Nome', 'nome']), 'Nome', { maxLength: 200 }),
        Data: normalizeBackupDate(getFirstDefinedValue(row, ['Data', 'data']), 'Data do feriado'),
        Tipo: normalizeTextWithDefault(getFirstDefinedValue(row, ['Tipo', 'tipo']), 'Tipo do feriado', {
            maxLength: 50,
            defaultValue: 'municipal'
        })
    };
}

function normalizeAusenciaRow(row) {
    const tipo = normalizeEnum(getFirstDefinedValue(row, ['Tipo', 'tipo']), 'Tipo da ausencia', AUSENCIA_TIPOS);
    const periodoTipo = normalizeEnum(
        getFirstDefinedValue(row, ['PeriodoTipo', 'periodoTipo']) || 'dia_inteiro',
        'Tipo de periodo',
        AUSENCIA_PERIODO_TIPOS,
        { defaultValue: 'dia_inteiro' }
    );
    const subtipo = normalizeSubtipo(getFirstDefinedValue(row, ['Subtipo', 'subtipo']))
        || (tipo === 'ferias' ? 'ferias' : (tipo === 'folga' ? 'folga' : 'comum'));
    const horaInicio = normalizeBackupTimeValue(getFirstDefinedValue(row, ['HoraInicio', 'horaInicio']), 'Hora inicial');
    const horaFim = normalizeBackupTimeValue(getFirstDefinedValue(row, ['HoraFim', 'horaFim']), 'Hora final');

    if (periodoTipo === 'horas' && (!horaInicio || !horaFim)) {
        throw new AppError(400, 'Ausencias por horas precisam de hora inicial e hora final no backup.');
    }

    return {
        Id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['Id', 'id']), 'Id da ausencia'),
        ColaboradorId: ensurePositiveInt(
            getFirstDefinedValue(row, ['ColaboradorId', 'colaboradorId']),
            'Colaborador da ausencia'
        ),
        Tipo: tipo,
        DataInicio: normalizeBackupDate(getFirstDefinedValue(row, ['DataInicio', 'dataInicio']), 'Data inicial da ausencia'),
        DataFim: normalizeBackupDate(getFirstDefinedValue(row, ['DataFim', 'dataFim']), 'Data final da ausencia'),
        DataCadastro: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['DataCadastro', 'dataCadastro']),
            'Data de cadastro da ausencia',
            new Date()
        ),
        PeriodoTipo: periodoTipo,
        HoraInicio: horaInicio,
        HoraFim: horaFim,
        Subtipo: subtipo,
        DescontaBancoHoras: normalizeBoolean(
            getFirstDefinedValue(row, ['DescontaBancoHoras', 'descontaBancoHoras']),
            'Desconto do banco de horas',
            { defaultValue: resolveDefaultDescontaBancoHoras(tipo, subtipo) }
        ),
        Observacao: normalizeOptionalText(
            getFirstDefinedValue(row, ['Observacao', 'observacao']),
            'Observacao da ausencia',
            { maxLength: 500 }
        )
    };
}

function normalizePlantaoRow(row) {
    return {
        id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['id', 'Id']), 'Id do plantao'),
        data_plantao: normalizeBackupDate(
            getFirstDefinedValue(row, ['data_plantao', 'dataISO', 'DataPlantao', 'dataPlantao']),
            'Data do plantao'
        ),
        colaboradores_ids: normalizePlantaoColaboradores(
            getFirstDefinedValue(row, ['colaboradores_ids', 'colaboradores', 'ColaboradoresIds', 'Colaboradores'])
        ),
        criado_em: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['criado_em', 'CriadoEm']),
            'Data de criacao do plantao',
            new Date()
        ),
        atualizado_em: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['atualizado_em', 'AtualizadoEm']),
            'Data de atualizacao do plantao',
            new Date()
        ),
        hora_inicio: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['hora_inicio', 'HoraInicio', 'horaInicio']),
            'Hora inicial do plantao'
        ),
        hora_fim: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['hora_fim', 'HoraFim', 'horaFim']),
            'Hora final do plantao'
        ),
        observacao: normalizeOptionalText(
            getFirstDefinedValue(row, ['observacao', 'Observacao']),
            'Observacao do plantao',
            { maxLength: 500 }
        )
    };
}

function normalizeBancoHorasMovimentoRow(row) {
    const minutos = Number.parseInt(String(getFirstDefinedValue(row, ['Minutos', 'minutos']) ?? ''), 10);

    if (!Number.isInteger(minutos)) {
        throw new AppError(400, 'O campo Minutos do banco de horas esta invalido no backup.');
    }

    return {
        Id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['Id', 'id']), 'Id do movimento'),
        ColaboradorId: ensurePositiveInt(
            getFirstDefinedValue(row, ['ColaboradorId', 'colaboradorId']),
            'Colaborador do movimento'
        ),
        DataReferencia: normalizeBackupDate(
            getFirstDefinedValue(row, ['DataReferencia', 'dataReferencia']),
            'Data de referencia do movimento'
        ),
        Minutos: minutos,
        OrigemTipo: normalizeRequiredText(
            getFirstDefinedValue(row, ['OrigemTipo', 'origemTipo']),
            'Origem do movimento',
            { maxLength: 30 }
        ),
        OrigemId: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['OrigemId', 'origemId']), 'Origem do movimento'),
        Descricao: normalizeRequiredText(
            getFirstDefinedValue(row, ['Descricao', 'descricao']),
            'Descricao do movimento',
            { maxLength: 255 }
        ),
        Observacao: normalizeOptionalText(
            getFirstDefinedValue(row, ['Observacao', 'observacao']),
            'Observacao do movimento',
            { maxLength: 500 }
        ),
        CriadoEm: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['CriadoEm', 'criadoEm']),
            'Data de criacao do movimento',
            new Date()
        )
    };
}

function normalizeEscalaDiaRow(row) {
    return {
        id: normalizeNullablePositiveInt(getFirstDefinedValue(row, ['id', 'Id']), 'Id da escala diaria'),
        colaborador_id: ensurePositiveInt(
            getFirstDefinedValue(row, ['colaborador_id', 'colaboradorId']),
            'Colaborador da escala diaria'
        ),
        data: normalizeBackupDate(getFirstDefinedValue(row, ['data', 'Data']), 'Data da escala diaria'),
        hora_inicio: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['hora_inicio', 'HoraInicio', 'horaInicio']),
            'Hora inicial da escala diaria'
        ),
        hora_fim: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['hora_fim', 'HoraFim', 'horaFim']),
            'Hora final da escala diaria'
        ),
        almoco_inicio: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['almoco_inicio', 'AlmocoInicio', 'almocoInicio']),
            'Hora inicial do almoco'
        ),
        almoco_fim: normalizeBackupTimeValue(
            getFirstDefinedValue(row, ['almoco_fim', 'AlmocoFim', 'almocoFim']),
            'Hora final do almoco'
        ),
        tipo: normalizeEnum(
            getFirstDefinedValue(row, ['tipo', 'Tipo']) || 'normal',
            'Tipo da escala diaria',
            ESCALA_DIA_TIPOS,
            { defaultValue: 'normal' }
        ),
        observacao: normalizeOptionalText(
            getFirstDefinedValue(row, ['observacao', 'Observacao']),
            'Observacao da escala diaria',
            { maxLength: 500 }
        ),
        origem_tipo: normalizeOptionalText(
            getFirstDefinedValue(row, ['origem_tipo', 'OrigemTipo', 'origemTipo']),
            'Origem da escala diaria',
            { maxLength: 30 }
        ),
        origem_id: normalizeNullablePositiveInt(
            getFirstDefinedValue(row, ['origem_id', 'OrigemId', 'origemId']),
            'Origem da escala diaria'
        ),
        ajuste_manual: normalizeBoolean(
            getFirstDefinedValue(row, ['ajuste_manual', 'AjusteManual', 'ajusteManual']),
            'Ajuste manual',
            { defaultValue: false }
        ),
        almoco_ajustado: normalizeBoolean(
            getFirstDefinedValue(row, ['almoco_ajustado', 'AlmocoAjustado', 'almocoAjustado']),
            'Almoco ajustado',
            { defaultValue: false }
        ),
        criado_em: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['criado_em', 'CriadoEm']),
            'Data de criacao da escala diaria',
            new Date()
        ),
        atualizado_em: normalizeBackupDateTime(
            getFirstDefinedValue(row, ['atualizado_em', 'AtualizadoEm']),
            'Data de atualizacao da escala diaria',
            new Date()
        )
    };
}

function normalizeRows(rows, mapper, label) {
    if (!Array.isArray(rows)) {
        throw new AppError(400, `${label} invalido no arquivo de backup.`);
    }

    return rows.map((row, index) => {
        if (!isPlainObject(row)) {
            throw new AppError(400, `${label} possui um registro invalido na posicao ${index + 1}.`);
        }

        return mapper(row, index);
    });
}

function coerceBackupPayload(rawPayload = {}) {
    const payload = ensureBackupObject(rawPayload, 'O arquivo de backup esta invalido.');
    const hasStructuredData = isPlainObject(payload.data);
    const hasTopLevelTables = REQUIRED_TABLES.some((tableName) => Array.isArray(payload[tableName]));
    const hasLegacyCollections = Array.isArray(payload.colaboradores) || Array.isArray(payload.ausencias);
    let sourceFormat = 'system';
    let dataSource = payload.data;

    if (hasStructuredData) {
        sourceFormat = 'system';
        dataSource = payload.data;
    } else if (hasTopLevelTables) {
        sourceFormat = 'tables';
        dataSource = payload;
    } else if (hasLegacyCollections) {
        sourceFormat = 'legacy';
        dataSource = payload;
    } else {
        throw new AppError(
            400,
            'Arquivo invalido. Use um JSON gerado pelo sistema de backup ou pela exportacao antiga.'
        );
    }

    const snapshot = {
        format: sourceFormat,
        metadata: isPlainObject(payload.metadata) ? payload.metadata : {},
        preferences: isPlainObject(payload.preferencias) ? payload.preferencias : {},
        data: {
            Colaboradores: [],
            Ausencias: [],
            Feriados: [],
            plantoes: [],
            BancoHorasMovimentos: [],
            escala_dia: []
        }
    };

    if (sourceFormat === 'legacy') {
        snapshot.data.Colaboradores = normalizeRows(
            getBackupArray(dataSource, ['colaboradores', 'Colaboradores']),
            normalizeColaboradorRow,
            'Lista de colaboradores'
        );
        snapshot.data.Ausencias = normalizeRows(
            getBackupArray(dataSource, ['ausencias', 'Ausencias']),
            normalizeAusenciaRow,
            'Lista de ausencias'
        );
        snapshot.data.Feriados = normalizeRows(
            getBackupArray(dataSource, ['feriados', 'Feriados']),
            normalizeFeriadoRow,
            'Lista de feriados'
        );
        snapshot.data.plantoes = normalizeRows(
            getBackupArray(dataSource, ['plantoes', 'Plantoes']),
            normalizePlantaoRow,
            'Lista de plantoes'
        );
        snapshot.data.BancoHorasMovimentos = normalizeRows(
            getBackupArray(dataSource, ['bancoHorasMovimentos', 'BancoHorasMovimentos', 'movimentosBancoHoras']),
            normalizeBancoHorasMovimentoRow,
            'Lista de movimentos do banco de horas'
        );
        snapshot.data.escala_dia = normalizeRows(
            getBackupArray(dataSource, ['escalaDia', 'escala_dia', 'EscalaDia']),
            normalizeEscalaDiaRow,
            'Lista de escala diaria'
        );
        return snapshot;
    }

    snapshot.data.Colaboradores = normalizeRows(
        getBackupArray(dataSource, ['Colaboradores']),
        normalizeColaboradorRow,
        'Tabela Colaboradores'
    );
    snapshot.data.Feriados = normalizeRows(
        getBackupArray(dataSource, ['Feriados']),
        normalizeFeriadoRow,
        'Tabela Feriados'
    );
    snapshot.data.Ausencias = normalizeRows(
        getBackupArray(dataSource, ['Ausencias']),
        normalizeAusenciaRow,
        'Tabela Ausencias'
    );
    snapshot.data.plantoes = normalizeRows(
        getBackupArray(dataSource, ['plantoes']),
        normalizePlantaoRow,
        'Tabela plantoes'
    );
    snapshot.data.BancoHorasMovimentos = normalizeRows(
        getBackupArray(dataSource, ['BancoHorasMovimentos']),
        normalizeBancoHorasMovimentoRow,
        'Tabela BancoHorasMovimentos'
    );
    snapshot.data.escala_dia = normalizeRows(
        getBackupArray(dataSource, ['escala_dia']),
        normalizeEscalaDiaRow,
        'Tabela escala_dia'
    );

    return snapshot;
}

async function clearTablesForRestore(transaction) {
    for (const tableName of BACKUP_DELETE_ORDER) {
        await transaction.request().query(`DELETE FROM [dbo].[${tableName}]`);
    }
}

async function reseedIdentity(transaction, tableName, identityColumn) {
    if (!identityColumn) {
        return;
    }

    const result = await transaction.request().query(`
        SELECT MAX([${identityColumn}]) AS maxIdentity
        FROM [dbo].[${tableName}]
    `);
    const maxIdentity = Number(result.recordset[0]?.maxIdentity || 0);
    const safeValue = Number.isFinite(maxIdentity) && maxIdentity >= 0 ? maxIdentity : 0;

    await transaction.request().query(`DBCC CHECKIDENT ('dbo.${tableName}', RESEED, ${safeValue}) WITH NO_INFOMSGS`);
}

async function insertTableRows(transaction, tableName, rows) {
    const spec = TABLE_INSERT_SPECS[tableName];

    if (!spec) {
        throw new AppError(500, `Tabela de backup nao suportada: ${tableName}.`);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        await reseedIdentity(transaction, tableName, spec.identityColumn);
        return;
    }

    const includeIdentity = Boolean(spec.identityColumn) && rows.some((row) => row[spec.identityColumn] !== null);

    if (includeIdentity && rows.some((row) => row[spec.identityColumn] === null)) {
        throw new AppError(400, `Os registros da tabela ${tableName} possuem IDs inconsistentes no backup.`);
    }

    const columnSpecs = spec.columns.filter(([columnName]) => includeIdentity || columnName !== spec.identityColumn);
    const columnNames = columnSpecs.map(([columnName]) => columnName);
    const insertSql = `
        INSERT INTO [dbo].[${tableName}] (${columnNames.map((columnName) => `[${columnName}]`).join(', ')})
        VALUES (${columnNames.map((_, index) => `@p${index}`).join(', ')})
    `;

    if (includeIdentity) {
        await transaction.request().query(`SET IDENTITY_INSERT [dbo].[${tableName}] ON`);
    }

    try {
        for (const row of rows) {
            const request = transaction.request();

            columnSpecs.forEach(([columnName, sqlType], index) => {
                request.input(`p${index}`, sqlType, row[columnName]);
            });

            await request.query(insertSql);
        }
    } finally {
        if (includeIdentity) {
            await transaction.request().query(`SET IDENTITY_INSERT [dbo].[${tableName}] OFF`);
        }
    }

    await reseedIdentity(transaction, tableName, spec.identityColumn);
}

async function restoreSystemBackup(pool, rawPayload, options = {}) {
    const snapshot = coerceBackupPayload(rawPayload);
    const tableCounts = {};
    let totalRows = 0;

    await withTransaction(sql, pool, async (transaction) => {
        await clearTablesForRestore(transaction);

        for (const tableName of BACKUP_INSERT_ORDER) {
            const rows = snapshot.data[tableName] || [];
            tableCounts[tableName] = rows.length;
            totalRows += rows.length;
            await insertTableRows(transaction, tableName, rows);
        }
    });

    return {
        restoredAt: new Date().toISOString(),
        fileName: options.fileName || '',
        format: snapshot.format,
        metadata: snapshot.metadata,
        preferences: snapshot.preferences,
        tableCounts,
        totalRows,
        tablesRestored: [...BACKUP_INSERT_ORDER]
    };
}

module.exports = {
    createSystemBackup,
    coerceBackupPayload,
    ensureBackupDirectory,
    formatBackupTimestamp,
    restoreSystemBackup
};

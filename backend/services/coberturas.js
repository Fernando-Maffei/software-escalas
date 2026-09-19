// PROTOTIPO (branch prototipo/cobertura).
//
// Cobertura: quem cobriu o posto de quem estava de folga, em que dia e horario,
// e se isso gerou hora extra. O sistema so MARCA a hora extra; valor e com a
// folha de pagamento.
//
// Compensacao: o vinculo entre um dia de folga (domingo folgado ou folga
// compensatoria) e o dia trabalhado em troca (reposicao).
//
// Os dois gravam o dia JA CLASSIFICADO na escala_dia (tipo + origem), de modo
// que a escala do dia e os relatorios apenas leem o que esta gravado. A regra
// de negocio vive aqui, na hora de lancar.

const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { hasTable } = require('../db/schema');
const {
    compareTimes,
    ensurePositiveInt,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime
} = require('../lib/validation');
const {
    applyAutomaticEscalaRecord,
    buildEscalaKey,
    createDefaultEscalaRecord,
    deleteEscalaDiaByOrigin,
    ensureEscalaDiaForPeriod,
    findColaboradorById,
    getDayOfWeek,
    listEscalaDiaRows
} = require('./escala');

const COMPENSACAO_TIPOS = ['domingo_folgado', 'folga_compensatoria'];
// Dia em que a pessoa esta trabalhando pela escala (e portanto nao esta de
// folga para ser coberta, nem livre para uma reposicao).
const TIPOS_DE_TRABALHO = ['normal', 'plantao', 'ajuste', 'reposicao', 'cobertura'];

function ensurePrototipoTables(schema) {
    if (!hasTable(schema, 'Coberturas') || !hasTable(schema, 'Compensacoes')) {
        throw new AppError(409, 'As tabelas de cobertura/compensacao ainda nao existem neste banco (migration 2026-09-19).');
    }
}

function labelData(dataISO) {
    const [ano, mes, dia] = String(dataISO).split('-');
    return `${dia}/${mes}/${ano}`;
}

function isErroDeChaveDuplicada(error) {
    const numero = error?.number ?? error?.originalError?.info?.number;
    return numero === 2601 || numero === 2627;
}

function estaTrabalhando(row) {
    return Boolean(row && row.horaInicio && row.horaFim && TIPOS_DE_TRABALHO.includes(row.tipo));
}

async function linhaDoDia(poolOrTx, colaboradorId, dataISO) {
    const rows = await listEscalaDiaRows(poolOrTx, dataISO, dataISO, { colaboradorId });
    return rows[0] || null;
}

async function temAusenciaDiaInteiro(poolOrTx, colaboradorId, dataISO) {
    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('data', sql.Date, dataISO)
        .query(`
            SELECT TOP 1 Tipo
            FROM Ausencias
            WHERE ColaboradorId = @colaboradorId
              AND @data BETWEEN DataInicio AND DataFim
              AND (PeriodoTipo IS NULL OR LOWER(PeriodoTipo) = 'dia_inteiro')
        `);

    return result.recordset[0]?.Tipo || null;
}

async function colaboradorAtivo(poolOrTx, colaboradorId, rotulo) {
    const colaborador = await findColaboradorById(poolOrTx, colaboradorId);

    if (colaborador.Ativo === false || colaborador.Ativo === 0) {
        throw new AppError(400, `${rotulo}: ${colaborador.Nome} esta desligado.`);
    }

    return colaborador;
}

async function gravarDiaVinculado(poolOrTx, colaborador, dataISO, overrides) {
    const rows = await listEscalaDiaRows(poolOrTx, dataISO, dataISO, { colaboradorId: colaborador.Id });
    const existingMap = new Map(rows.map((row) => [buildEscalaKey(row.colaboradorId, row.dataISO), row]));

    // force: o lancamento vinculado e a fonte de verdade do dia; passa por
    // cima de ajuste manual ou linha automatica que estivesse la.
    await applyAutomaticEscalaRecord(
        poolOrTx,
        existingMap,
        createDefaultEscalaRecord(colaborador, dataISO, overrides),
        { force: true }
    );
}

/* ============================ COBERTURAS ============================ */

function normalizeCoberturaPayload(body = {}) {
    const dataISO = normalizeIsoDate(body.dataISO ?? body.data, 'Data');
    const colaboradorId = ensurePositiveInt(body.colaboradorId, 'Quem cobre');
    const cobertoColaboradorId = ensurePositiveInt(body.cobertoColaboradorId, 'Quem foi coberto');
    const horaInicio = normalizeNullableTime(body.horaInicio, 'Hora inicial');
    const horaFim = normalizeNullableTime(body.horaFim, 'Hora final');

    if (colaboradorId === cobertoColaboradorId) {
        throw new AppError(400, 'A pessoa nao pode cobrir a si mesma.');
    }

    if (!horaInicio || !horaFim) {
        throw new AppError(400, 'Informe o horario da cobertura.');
    }

    if (compareTimes(horaInicio, horaFim) >= 0) {
        throw new AppError(400, 'A hora final da cobertura deve ser maior que a inicial.');
    }

    return {
        dataISO,
        colaboradorId,
        cobertoColaboradorId,
        horaInicio,
        horaFim,
        geraHoraExtra: normalizeBoolean(body.geraHoraExtra, 'Gera hora extra', { defaultValue: true }),
        observacao: normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 })
    };
}

function serializeCobertura(row) {
    return {
        id: row.Id,
        dataISO: row.dataISO,
        colaboradorId: row.ColaboradorId,
        colaboradorNome: row.CobreNome,
        cobertoColaboradorId: row.CobertoColaboradorId,
        cobertoNome: row.CobertoNome,
        horaInicio: extractTimeString(row.HoraInicio),
        horaFim: extractTimeString(row.HoraFim),
        geraHoraExtra: row.GeraHoraExtra === true || row.GeraHoraExtra === 1,
        observacao: row.Observacao || null
    };
}

async function listCoberturas(poolOrTx, schema, { inicio, fim }) {
    ensurePrototipoTables(schema);

    const result = await poolOrTx.request()
        .input('inicio', sql.Date, normalizeIsoDate(inicio, 'Data inicial'))
        .input('fim', sql.Date, normalizeIsoDate(fim, 'Data final'))
        .query(`
            SELECT c.Id, CONVERT(VARCHAR(10), c.Data, 23) AS dataISO, c.ColaboradorId,
                   c.CobertoColaboradorId, c.HoraInicio, c.HoraFim, c.GeraHoraExtra, c.Observacao,
                   quem.Nome AS CobreNome, coberto.Nome AS CobertoNome
            FROM Coberturas c
            INNER JOIN Colaboradores quem ON quem.Id = c.ColaboradorId
            INNER JOIN Colaboradores coberto ON coberto.Id = c.CobertoColaboradorId
            WHERE c.Data BETWEEN @inicio AND @fim
            ORDER BY c.Data, quem.Nome
        `);

    return result.recordset.map(serializeCobertura);
}

async function salvarCobertura(poolOrTx, schema, body, id = null) {
    ensurePrototipoTables(schema);

    const payload = normalizeCoberturaPayload(body);
    const quemCobre = await colaboradorAtivo(poolOrTx, payload.colaboradorId, 'Quem cobre');
    const coberto = await colaboradorAtivo(poolOrTx, payload.cobertoColaboradorId, 'Quem foi coberto');

    if (id) {
        const atual = await poolOrTx.request().input('id', sql.Int, id)
            .query('SELECT Id FROM Coberturas WHERE Id = @id');

        if (!atual.recordset.length) {
            throw new AppError(404, 'Cobertura nao encontrada.');
        }

        // Tira o dia antigo da escala antes de validar o novo.
        await deleteEscalaDiaByOrigin(poolOrTx, 'cobertura', id);
    }

    await ensureEscalaDiaForPeriod(poolOrTx, schema, payload.dataISO, payload.dataISO);

    const ausenciaDeQuemCobre = await temAusenciaDiaInteiro(poolOrTx, quemCobre.Id, payload.dataISO);

    if (ausenciaDeQuemCobre) {
        throw new AppError(400, `${quemCobre.Nome} esta de ${ausenciaDeQuemCobre} em ${labelData(payload.dataISO)} e nao pode cobrir.`);
    }

    const diaDoCoberto = await linhaDoDia(poolOrTx, coberto.Id, payload.dataISO);

    if (estaTrabalhando(diaDoCoberto)) {
        throw new AppError(400, `${coberto.Nome} esta escalado em ${labelData(payload.dataISO)}. Cobertura e para quem esta de folga — lance a folga antes.`);
    }

    let coberturaId = id;

    try {
        const request = poolOrTx.request()
            .input('data', sql.Date, payload.dataISO)
            .input('colaboradorId', sql.Int, payload.colaboradorId)
            .input('cobertoId', sql.Int, payload.cobertoColaboradorId)
            .input('horaInicio', sql.Time, toSqlTime(payload.horaInicio, 'Hora inicial'))
            .input('horaFim', sql.Time, toSqlTime(payload.horaFim, 'Hora final'))
            .input('geraHoraExtra', sql.Bit, payload.geraHoraExtra)
            .input('observacao', sql.NVarChar(500), payload.observacao);

        if (id) {
            await request.input('id', sql.Int, id).query(`
                UPDATE Coberturas
                SET Data = @data, ColaboradorId = @colaboradorId, CobertoColaboradorId = @cobertoId,
                    HoraInicio = @horaInicio, HoraFim = @horaFim, GeraHoraExtra = @geraHoraExtra,
                    Observacao = @observacao, AtualizadoEm = GETDATE()
                WHERE Id = @id
            `);
        } else {
            const inserted = await request.query(`
                INSERT INTO Coberturas (Data, ColaboradorId, CobertoColaboradorId, HoraInicio, HoraFim, GeraHoraExtra, Observacao)
                OUTPUT INSERTED.Id
                VALUES (@data, @colaboradorId, @cobertoId, @horaInicio, @horaFim, @geraHoraExtra, @observacao)
            `);
            coberturaId = inserted.recordset[0].Id;
        }
    } catch (error) {
        if (isErroDeChaveDuplicada(error)) {
            throw new AppError(409, `${quemCobre.Nome} ja tem uma cobertura em ${labelData(payload.dataISO)}.`);
        }

        throw error;
    }

    await gravarDiaVinculado(poolOrTx, quemCobre, payload.dataISO, {
        horaInicio: payload.horaInicio,
        horaFim: payload.horaFim,
        almocoInicio: null,
        almocoFim: null,
        tipo: 'cobertura',
        observacao: `Cobre ${coberto.Nome}${payload.observacao ? ` - ${payload.observacao}` : ''}`,
        origemTipo: 'cobertura',
        origemId: coberturaId
    });

    return { id: coberturaId, ...payload };
}

async function excluirCobertura(poolOrTx, schema, id) {
    ensurePrototipoTables(schema);

    const alvo = ensurePositiveInt(id, 'Cobertura');
    await deleteEscalaDiaByOrigin(poolOrTx, 'cobertura', alvo);
    const result = await poolOrTx.request().input('id', sql.Int, alvo)
        .query('DELETE FROM Coberturas OUTPUT DELETED.Id WHERE Id = @id');

    if (!result.recordset.length) {
        throw new AppError(404, 'Cobertura nao encontrada.');
    }
}

/* =========================== COMPENSACOES =========================== */

function normalizeCompensacaoPayload(body = {}) {
    const tipo = normalizeEnum(body.tipo, 'Tipo de compensacao', COMPENSACAO_TIPOS);
    const dataFolga = normalizeIsoDate(body.dataFolga, 'Dia de folga');
    const dataTrabalho = normalizeIsoDate(body.dataTrabalho, 'Dia da reposicao');
    const trabalhoInicio = normalizeNullableTime(body.trabalhoInicio, 'Inicio da reposicao');
    const trabalhoFim = normalizeNullableTime(body.trabalhoFim, 'Fim da reposicao');

    if (dataFolga === dataTrabalho) {
        throw new AppError(400, 'O dia da folga e o dia da reposicao precisam ser diferentes.');
    }

    if (tipo === 'domingo_folgado' && getDayOfWeek(dataFolga) !== 0) {
        throw new AppError(400, `${labelData(dataFolga)} nao e domingo.`);
    }

    if ((trabalhoInicio && !trabalhoFim) || (!trabalhoInicio && trabalhoFim)) {
        throw new AppError(400, 'Informe inicio e fim da reposicao (ou deixe os dois vazios para usar o cadastro).');
    }

    if (trabalhoInicio && trabalhoFim && compareTimes(trabalhoInicio, trabalhoFim) >= 0) {
        throw new AppError(400, 'O fim da reposicao deve ser maior que o inicio.');
    }

    return {
        colaboradorId: ensurePositiveInt(body.colaboradorId, 'Colaborador'),
        tipo,
        dataFolga,
        dataTrabalho,
        trabalhoInicio,
        trabalhoFim,
        observacao: normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 })
    };
}

function serializeCompensacao(row) {
    return {
        id: row.Id,
        colaboradorId: row.ColaboradorId,
        colaboradorNome: row.Nome,
        tipo: row.Tipo,
        dataFolga: row.dataFolga,
        dataTrabalho: row.dataTrabalho,
        trabalhoInicio: extractTimeString(row.TrabalhoInicio),
        trabalhoFim: extractTimeString(row.TrabalhoFim),
        observacao: row.Observacao || null
    };
}

async function listCompensacoes(poolOrTx, schema, { inicio, fim }) {
    ensurePrototipoTables(schema);

    const result = await poolOrTx.request()
        .input('inicio', sql.Date, normalizeIsoDate(inicio, 'Data inicial'))
        .input('fim', sql.Date, normalizeIsoDate(fim, 'Data final'))
        .query(`
            SELECT c.Id, c.ColaboradorId, c.Tipo, c.TrabalhoInicio, c.TrabalhoFim, c.Observacao,
                   CONVERT(VARCHAR(10), c.DataFolga, 23) AS dataFolga,
                   CONVERT(VARCHAR(10), c.DataTrabalho, 23) AS dataTrabalho,
                   col.Nome
            FROM Compensacoes c
            INNER JOIN Colaboradores col ON col.Id = c.ColaboradorId
            WHERE c.DataFolga BETWEEN @inicio AND @fim
               OR c.DataTrabalho BETWEEN @inicio AND @fim
            ORDER BY c.DataFolga, col.Nome
        `);

    return result.recordset.map(serializeCompensacao);
}

// Almoco do cadastro, so se couber no horario da reposicao.
function almocoDoCadastroDentro(colaborador, inicio, fim) {
    const almocoInicio = extractTimeString(colaborador.AlmocoInicio);
    const almocoFim = extractTimeString(colaborador.AlmocoFim);

    if (!almocoInicio || !almocoFim || !inicio || !fim) {
        return { almocoInicio: null, almocoFim: null };
    }

    const cabe = compareTimes(almocoInicio, inicio) >= 0 && compareTimes(almocoFim, fim) <= 0;
    return cabe ? { almocoInicio, almocoFim } : { almocoInicio: null, almocoFim: null };
}

async function salvarCompensacao(poolOrTx, schema, body, id = null) {
    ensurePrototipoTables(schema);

    const payload = normalizeCompensacaoPayload(body);
    const colaborador = await colaboradorAtivo(poolOrTx, payload.colaboradorId, 'Colaborador');

    if (id) {
        const atual = await poolOrTx.request().input('id', sql.Int, id)
            .query('SELECT Id FROM Compensacoes WHERE Id = @id');

        if (!atual.recordset.length) {
            throw new AppError(404, 'Compensacao nao encontrada.');
        }

        await deleteEscalaDiaByOrigin(poolOrTx, 'compensacao', id);
    }

    await ensureEscalaDiaForPeriod(poolOrTx, schema, payload.dataFolga, payload.dataFolga, { colaboradorId: colaborador.Id });
    await ensureEscalaDiaForPeriod(poolOrTx, schema, payload.dataTrabalho, payload.dataTrabalho, { colaboradorId: colaborador.Id });

    const diaDaReposicao = await linhaDoDia(poolOrTx, colaborador.Id, payload.dataTrabalho);

    if (estaTrabalhando(diaDaReposicao)) {
        throw new AppError(400, `${colaborador.Nome} ja trabalha em ${labelData(payload.dataTrabalho)} pela escala. A reposicao precisa ser num dia que seria de folga.`);
    }

    const ausenciaNaReposicao = await temAusenciaDiaInteiro(poolOrTx, colaborador.Id, payload.dataTrabalho);

    if (ausenciaNaReposicao) {
        throw new AppError(400, `${colaborador.Nome} esta de ${ausenciaNaReposicao} em ${labelData(payload.dataTrabalho)}.`);
    }

    const inicio = payload.trabalhoInicio || extractTimeString(colaborador.TrabalhoInicio);
    const fim = payload.trabalhoFim || extractTimeString(colaborador.TrabalhoFim);

    if (!inicio || !fim) {
        throw new AppError(400, `Informe o horario da reposicao: ${colaborador.Nome} nao tem horario no cadastro.`);
    }

    let compensacaoId = id;

    try {
        const request = poolOrTx.request()
            .input('colaboradorId', sql.Int, colaborador.Id)
            .input('tipo', sql.NVarChar(30), payload.tipo)
            .input('dataFolga', sql.Date, payload.dataFolga)
            .input('dataTrabalho', sql.Date, payload.dataTrabalho)
            .input('trabalhoInicio', sql.Time, toSqlTime(inicio, 'Inicio da reposicao'))
            .input('trabalhoFim', sql.Time, toSqlTime(fim, 'Fim da reposicao'))
            .input('observacao', sql.NVarChar(500), payload.observacao);

        if (id) {
            await request.input('id', sql.Int, id).query(`
                UPDATE Compensacoes
                SET ColaboradorId = @colaboradorId, Tipo = @tipo, DataFolga = @dataFolga,
                    DataTrabalho = @dataTrabalho, TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim, Observacao = @observacao, AtualizadoEm = GETDATE()
                WHERE Id = @id
            `);
        } else {
            const inserted = await request.query(`
                INSERT INTO Compensacoes (ColaboradorId, Tipo, DataFolga, DataTrabalho, TrabalhoInicio, TrabalhoFim, Observacao)
                OUTPUT INSERTED.Id
                VALUES (@colaboradorId, @tipo, @dataFolga, @dataTrabalho, @trabalhoInicio, @trabalhoFim, @observacao)
            `);
            compensacaoId = inserted.recordset[0].Id;
        }
    } catch (error) {
        if (isErroDeChaveDuplicada(error)) {
            throw new AppError(409, `${colaborador.Nome} ja tem uma compensacao usando ${labelData(payload.dataFolga)} ou ${labelData(payload.dataTrabalho)}.`);
        }

        throw error;
    }

    const rotuloFolga = payload.tipo === 'domingo_folgado' ? 'Domingo folgado' : 'Folga compensatoria';

    await gravarDiaVinculado(poolOrTx, colaborador, payload.dataFolga, {
        horaInicio: null,
        horaFim: null,
        almocoInicio: null,
        almocoFim: null,
        tipo: payload.tipo,
        observacao: `${rotuloFolga} - reposicao em ${labelData(payload.dataTrabalho)}${payload.observacao ? ` - ${payload.observacao}` : ''}`,
        origemTipo: 'compensacao',
        origemId: compensacaoId
    });

    await gravarDiaVinculado(poolOrTx, colaborador, payload.dataTrabalho, {
        horaInicio: inicio,
        horaFim: fim,
        ...almocoDoCadastroDentro(colaborador, inicio, fim),
        tipo: 'reposicao',
        observacao: `Reposicao do ${rotuloFolga.toLowerCase()} de ${labelData(payload.dataFolga)}${payload.observacao ? ` - ${payload.observacao}` : ''}`,
        origemTipo: 'compensacao',
        origemId: compensacaoId
    });

    return { id: compensacaoId, ...payload, trabalhoInicio: inicio, trabalhoFim: fim };
}

async function excluirCompensacao(poolOrTx, schema, id) {
    ensurePrototipoTables(schema);

    const alvo = ensurePositiveInt(id, 'Compensacao');
    await deleteEscalaDiaByOrigin(poolOrTx, 'compensacao', alvo);
    const result = await poolOrTx.request().input('id', sql.Int, alvo)
        .query('DELETE FROM Compensacoes OUTPUT DELETED.Id WHERE Id = @id');

    if (!result.recordset.length) {
        throw new AppError(404, 'Compensacao nao encontrada.');
    }
}

// Coberturas marcadas como hora extra no formato que o relatorio de horas
// extras ja consome (o mesmo dos plantoes lancados como 'extra').
async function listCoberturasComoHoraExtra(poolOrTx, schema, { inicio, fim }) {
    if (!hasTable(schema, 'Coberturas')) {
        return [];
    }

    const coberturas = await listCoberturas(poolOrTx, schema, { inicio, fim });

    return coberturas
        .filter((item) => item.geraHoraExtra)
        .map((item) => ({
            id: `cobertura-${item.id}`,
            dataISO: item.dataISO,
            colaboradores: [item.colaboradorId],
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
            tipoCredito: 'extra',
            tipoPlantao: 'cobertura',
            observacao: `Cobertura de ${item.cobertoNome}${item.observacao ? ` - ${item.observacao}` : ''}`
        }));
}

module.exports = {
    COMPENSACAO_TIPOS,
    excluirCobertura,
    excluirCompensacao,
    listCoberturas,
    listCoberturasComoHoraExtra,
    listCompensacoes,
    normalizeCoberturaPayload,
    normalizeCompensacaoPayload,
    salvarCobertura,
    salvarCompensacao
};

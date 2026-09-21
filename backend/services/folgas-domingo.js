// FolgasDomingo: o registro do evento de folga de domingo do plantonista.
//
// Uma linha guarda o evento inteiro — quem folgou, em que domingo, em que dia
// repos e quem cobriu o posto —, em vez de registros soltos que alguem teria
// que correlacionar depois.
//
// Este servico so grava e le. Quem transforma isso em linhas de escala e a
// hidratacao em escala.js (hydrateFolgasDomingoIntoEscala), e quem confere se
// a folga esta em dia com a frequencia da convencao e o /verificar — separado
// do relatorio de proposito, porque relatorio aqui so agrega o que ja esta
// classificado.
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { hasTable } = require('../db/schema');
const { isSunday } = require('./escala');
const {
    buildDateRange,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText
} = require('../lib/validation');

function ensureFolgasDomingoTable(schema, options = {}) {
    const { allowMissing = false } = options;

    if (hasTable(schema, 'FolgasDomingo')) {
        return true;
    }

    if (allowMissing) {
        return false;
    }

    throw new AppError(
        409,
        'O registro de folgas de domingo ainda nao esta habilitado no banco. Aplique o script de migracao antes de usar esse recurso.',
        { missing: ['tabela FolgasDomingo'] }
    );
}

function serializeFolgaDomingo(row) {
    return {
        id: Number(row.Id ?? row.id ?? 0) || null,
        colaboradorId: Number(row.ColaboradorId ?? row.colaboradorId ?? 0) || null,
        colaboradorNome: row.ColaboradorNome ?? row.colaboradorNome ?? null,
        dataDomingo: extractDateString(row.DataDomingo ?? row.dataDomingo),
        dataReposicao: extractDateString(row.DataReposicao ?? row.dataReposicao),
        reposicaoHoraInicio: extractTimeString(row.ReposicaoHoraInicio ?? row.reposicaoHoraInicio),
        reposicaoHoraFim: extractTimeString(row.ReposicaoHoraFim ?? row.reposicaoHoraFim),
        cobertoPorColaboradorId: row.CobertoPorColaboradorId ?? row.cobertoPorColaboradorId ?? null,
        cobertoPorNome: row.CobertoPorNome ?? row.cobertoPorNome ?? null,
        plantaoId: row.PlantaoId ?? row.plantaoId ?? null,
        observacao: row.Observacao ?? row.observacao ?? null,
        criadoEm: row.CriadoEm ?? row.criadoEm ?? null,
        atualizadoEm: row.AtualizadoEm ?? row.atualizadoEm ?? null
    };
}

function normalizeNullableId(valor, campo) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
        return null;
    }

    return ensurePositiveInt(valor, campo);
}

function normalizeFolgaDomingoPayload(body = {}, fallback = {}) {
    const colaboradorId = body.colaboradorId !== undefined
        ? ensurePositiveInt(body.colaboradorId, 'Colaborador')
        : ensurePositiveInt(fallback.colaboradorId, 'Colaborador');

    const dataDomingo = normalizeIsoDate(
        body.dataDomingo !== undefined ? body.dataDomingo : fallback.dataDomingo,
        'Data do domingo'
    );

    // O banco tambem barra (CK_FolgasDomingo_EhDomingo), mas ali a mensagem
    // seria um erro de constraint. Aqui o usuario entende o que fez.
    if (!isSunday(dataDomingo)) {
        throw new AppError(400, `${dataDomingo} nao e um domingo.`);
    }

    const dataReposicaoBruta = body.dataReposicao !== undefined ? body.dataReposicao : fallback.dataReposicao;
    const dataReposicao = dataReposicaoBruta === null || dataReposicaoBruta === undefined || String(dataReposicaoBruta).trim() === ''
        ? null
        : normalizeIsoDate(dataReposicaoBruta, 'Data da reposicao');

    const reposicaoHoraInicio = normalizeNullableTime(
        body.reposicaoHoraInicio !== undefined ? body.reposicaoHoraInicio : fallback.reposicaoHoraInicio,
        'Hora inicial da reposicao'
    );
    const reposicaoHoraFim = normalizeNullableTime(
        body.reposicaoHoraFim !== undefined ? body.reposicaoHoraFim : fallback.reposicaoHoraFim,
        'Hora final da reposicao'
    );

    if (dataReposicao) {
        // O dia reposto e um dia que a jornada marca como folga: nao existe
        // horario padrao de onde puxar na hora de montar a escala.
        if (!reposicaoHoraInicio || !reposicaoHoraFim) {
            throw new AppError(400, 'Informe a hora inicial e a final da reposicao.');
        }

        if (reposicaoHoraInicio >= reposicaoHoraFim) {
            throw new AppError(400, 'A hora inicial da reposicao deve ser menor que a final.');
        }

        if (dataReposicao === dataDomingo) {
            throw new AppError(400, 'A reposicao nao pode cair no proprio domingo folgado.');
        }
    }

    const cobertoPorColaboradorId = body.cobertoPorColaboradorId !== undefined
        ? normalizeNullableId(body.cobertoPorColaboradorId, 'Colaborador que cobriu')
        : normalizeNullableId(fallback.cobertoPorColaboradorId, 'Colaborador que cobriu');

    if (cobertoPorColaboradorId && cobertoPorColaboradorId === colaboradorId) {
        throw new AppError(400, 'O colaborador nao pode cobrir a propria folga.');
    }

    return {
        colaboradorId,
        dataDomingo,
        dataReposicao,
        reposicaoHoraInicio: dataReposicao ? reposicaoHoraInicio : null,
        reposicaoHoraFim: dataReposicao ? reposicaoHoraFim : null,
        cobertoPorColaboradorId,
        plantaoId: body.plantaoId !== undefined
            ? normalizeNullableId(body.plantaoId, 'Plantao')
            : normalizeNullableId(fallback.plantaoId, 'Plantao'),
        observacao: normalizeOptionalText(
            body.observacao !== undefined ? body.observacao : fallback.observacao,
            'Observacao',
            { maxLength: 500 }
        )
    };
}

function buildSelect() {
    return `
        SELECT
            f.Id,
            f.ColaboradorId,
            c.Nome AS ColaboradorNome,
            f.DataDomingo,
            f.DataReposicao,
            f.ReposicaoHoraInicio,
            f.ReposicaoHoraFim,
            f.CobertoPorColaboradorId,
            cob.Nome AS CobertoPorNome,
            f.PlantaoId,
            f.Observacao,
            f.CriadoEm,
            f.AtualizadoEm
        FROM FolgasDomingo f
        INNER JOIN Colaboradores c ON c.Id = f.ColaboradorId
        LEFT JOIN Colaboradores cob ON cob.Id = f.CobertoPorColaboradorId
    `;
}

async function listFolgasDomingo(poolOrTx, schema, filtros = {}) {
    if (!ensureFolgasDomingoTable(schema, { allowMissing: filtros.allowMissingTable })) {
        return [];
    }

    const request = poolOrTx.request();
    const clauses = [];

    if (filtros.dataInicio && filtros.dataFim) {
        const { dataInicio, dataFim } = buildDateRange(filtros.dataInicio, filtros.dataFim);
        request.input('dataInicio', sql.Date, dataInicio);
        request.input('dataFim', sql.Date, dataFim);
        // Pega a folga cuja reposicao cai na janela mesmo que o domingo esteja
        // fora dela (e vice-versa): o evento e um so.
        clauses.push('(f.DataDomingo BETWEEN @dataInicio AND @dataFim OR f.DataReposicao BETWEEN @dataInicio AND @dataFim)');
    }

    if (filtros.colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(filtros.colaboradorId, 'Colaborador'));
        clauses.push('f.ColaboradorId = @colaboradorId');
    }

    const result = await request.query(`
        ${buildSelect()}
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY f.DataDomingo DESC, c.Nome
    `);

    return result.recordset.map(serializeFolgaDomingo);
}

async function findFolgaDomingoById(poolOrTx, schema, id) {
    ensureFolgasDomingoTable(schema);

    const folgaId = ensurePositiveInt(id, 'Folga de domingo');
    const result = await poolOrTx.request()
        .input('id', sql.Int, folgaId)
        .query(`${buildSelect()} WHERE f.Id = @id`);

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Folga de domingo nao encontrada.');
    }

    return serializeFolgaDomingo(result.recordset[0]);
}

async function ensureColaboradorExiste(poolOrTx, colaboradorId, rotulo) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT Id FROM Colaboradores WHERE Id = @id');

    if (result.recordset.length === 0) {
        throw new AppError(404, `${rotulo} nao encontrado.`);
    }
}

function aplicarInputs(request, payload) {
    return request
        .input('colaboradorId', sql.Int, payload.colaboradorId)
        .input('dataDomingo', sql.Date, payload.dataDomingo)
        .input('dataReposicao', sql.Date, payload.dataReposicao)
        .input('reposicaoHoraInicio', sql.Time, payload.reposicaoHoraInicio)
        .input('reposicaoHoraFim', sql.Time, payload.reposicaoHoraFim)
        .input('cobertoPorColaboradorId', sql.Int, payload.cobertoPorColaboradorId)
        .input('plantaoId', sql.Int, payload.plantaoId)
        .input('observacao', sql.NVarChar(500), payload.observacao);
}

// O indice unico (ColaboradorId, DataDomingo) e a rede de seguranca contra
// duplo clique e contra duas abas gravando junto. Traduz para uma mensagem
// que diz o que aconteceu, em vez do erro cru do SQL Server.
function traduzirErroDeDuplicidade(erro) {
    if (erro && /UX_FolgasDomingo_Colaborador_Domingo|duplicate key/i.test(String(erro.message))) {
        return new AppError(409, 'Esse colaborador ja tem uma folga registrada nesse domingo.');
    }

    return erro;
}

async function createFolgaDomingo(poolOrTx, schema, body) {
    ensureFolgasDomingoTable(schema);

    const payload = normalizeFolgaDomingoPayload(body);
    await ensureColaboradorExiste(poolOrTx, payload.colaboradorId, 'Colaborador');

    if (payload.cobertoPorColaboradorId) {
        await ensureColaboradorExiste(poolOrTx, payload.cobertoPorColaboradorId, 'Colaborador que cobriu');
    }

    try {
        const inserido = await aplicarInputs(poolOrTx.request(), payload).query(`
            INSERT INTO FolgasDomingo (
                ColaboradorId, DataDomingo, DataReposicao, ReposicaoHoraInicio, ReposicaoHoraFim,
                CobertoPorColaboradorId, PlantaoId, Observacao
            )
            OUTPUT INSERTED.Id
            VALUES (
                @colaboradorId, @dataDomingo, @dataReposicao, @reposicaoHoraInicio, @reposicaoHoraFim,
                @cobertoPorColaboradorId, @plantaoId, @observacao
            )
        `);

        return findFolgaDomingoById(poolOrTx, schema, inserido.recordset[0].Id);
    } catch (erro) {
        throw traduzirErroDeDuplicidade(erro);
    }
}

async function updateFolgaDomingo(poolOrTx, schema, id, body) {
    const atual = await findFolgaDomingoById(poolOrTx, schema, id);
    const payload = normalizeFolgaDomingoPayload(body, atual);

    await ensureColaboradorExiste(poolOrTx, payload.colaboradorId, 'Colaborador');

    if (payload.cobertoPorColaboradorId) {
        await ensureColaboradorExiste(poolOrTx, payload.cobertoPorColaboradorId, 'Colaborador que cobriu');
    }

    try {
        await aplicarInputs(poolOrTx.request(), payload)
            .input('id', sql.Int, atual.id)
            .query(`
                UPDATE FolgasDomingo
                SET
                    ColaboradorId = @colaboradorId,
                    DataDomingo = @dataDomingo,
                    DataReposicao = @dataReposicao,
                    ReposicaoHoraInicio = @reposicaoHoraInicio,
                    ReposicaoHoraFim = @reposicaoHoraFim,
                    CobertoPorColaboradorId = @cobertoPorColaboradorId,
                    PlantaoId = @plantaoId,
                    Observacao = @observacao,
                    AtualizadoEm = GETDATE()
                WHERE Id = @id
            `);
    } catch (erro) {
        throw traduzirErroDeDuplicidade(erro);
    }

    return findFolgaDomingoById(poolOrTx, schema, atual.id);
}

async function deleteFolgaDomingo(poolOrTx, schema, id) {
    const atual = await findFolgaDomingoById(poolOrTx, schema, id);

    await poolOrTx.request()
        .input('id', sql.Int, atual.id)
        .query('DELETE FROM FolgasDomingo WHERE Id = @id');

    return atual;
}

module.exports = {
    createFolgaDomingo,
    deleteFolgaDomingo,
    ensureFolgasDomingoTable,
    findFolgaDomingoById,
    listFolgasDomingo,
    normalizeFolgaDomingoPayload,
    serializeFolgaDomingo
};

// FolgasDomingo: o registro do evento de folga de domingo do plantonista.
//
// Uma linha guarda o evento inteiro — quem folgou, em que domingo e em que dia
// repos (com horario e almoco) —, em vez de registros soltos que alguem teria
// que correlacionar depois. Quem COBRIU nao e campo: sao os colaboradores
// lancados no plantao daquele domingo, entao guardar de novo duplicaria.
//
// Este servico so grava e le. Quem transforma isso em linhas de escala e a
// hidratacao em escala.js (hydrateFolgasDomingoIntoEscala), e quem confere se
// a folga esta em dia com a frequencia da convencao e o /verificar — separado
// do relatorio de proposito, porque relatorio aqui so agrega o que ja esta
// classificado.
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { isSunday } = require('./escala');
const { exigirReposicaoSemConflito } = require('./folgas-domingo-conflitos');
const {
    buildDateRange,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime
} = require('../lib/validation');

function serializeFolgaDomingo(row) {
    return {
        id: Number(row.Id ?? row.id ?? 0) || null,
        colaboradorId: Number(row.ColaboradorId ?? row.colaboradorId ?? 0) || null,
        colaboradorNome: row.ColaboradorNome ?? row.colaboradorNome ?? null,
        dataDomingo: extractDateString(row.DataDomingo ?? row.dataDomingo),
        dataReposicao: extractDateString(row.DataReposicao ?? row.dataReposicao),
        reposicaoHoraInicio: extractTimeString(row.ReposicaoHoraInicio ?? row.reposicaoHoraInicio),
        reposicaoHoraFim: extractTimeString(row.ReposicaoHoraFim ?? row.reposicaoHoraFim),
        reposicaoAlmocoInicio: extractTimeString(row.ReposicaoAlmocoInicio ?? row.reposicaoAlmocoInicio),
        reposicaoAlmocoFim: extractTimeString(row.ReposicaoAlmocoFim ?? row.reposicaoAlmocoFim),
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

    const reposicaoAlmocoInicio = normalizeNullableTime(
        body.reposicaoAlmocoInicio !== undefined ? body.reposicaoAlmocoInicio : fallback.reposicaoAlmocoInicio,
        'Inicio do almoco da reposicao'
    );
    const reposicaoAlmocoFim = normalizeNullableTime(
        body.reposicaoAlmocoFim !== undefined ? body.reposicaoAlmocoFim : fallback.reposicaoAlmocoFim,
        'Fim do almoco da reposicao'
    );

    // Mesma regra do resto do sistema (validateWorkSchedule e o CHECK da
    // jornada semanal): almoco vem aos pares e cabe dentro da jornada.
    if (Boolean(reposicaoAlmocoInicio) !== Boolean(reposicaoAlmocoFim)) {
        throw new AppError(400, 'Informe o inicio e o fim do almoco da reposicao.');
    }

    if (reposicaoAlmocoInicio && reposicaoAlmocoFim) {
        if (!dataReposicao) {
            throw new AppError(400, 'Marque a data da reposicao antes de lancar o almoco dela.');
        }

        if (reposicaoAlmocoInicio >= reposicaoAlmocoFim) {
            throw new AppError(400, 'O inicio do almoco da reposicao deve ser menor que o fim.');
        }

        if (reposicaoAlmocoInicio <= reposicaoHoraInicio || reposicaoAlmocoFim >= reposicaoHoraFim) {
            throw new AppError(400, 'O almoco da reposicao precisa ficar dentro do horario de trabalho.');
        }
    }

    const temReposicao = Boolean(dataReposicao);

    return {
        colaboradorId,
        dataDomingo,
        dataReposicao,
        reposicaoHoraInicio: temReposicao ? reposicaoHoraInicio : null,
        reposicaoHoraFim: temReposicao ? reposicaoHoraFim : null,
        reposicaoAlmocoInicio: temReposicao ? reposicaoAlmocoInicio : null,
        reposicaoAlmocoFim: temReposicao ? reposicaoAlmocoFim : null,
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
            f.ReposicaoAlmocoInicio,
            f.ReposicaoAlmocoFim,
            f.PlantaoId,
            f.Observacao,
            f.CriadoEm,
            f.AtualizadoEm
        FROM FolgasDomingo f
        INNER JOIN Colaboradores c ON c.Id = f.ColaboradorId
    `;
}

async function listFolgasDomingo(poolOrTx, filtros = {}) {
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

    // Folgas ainda sem dia de reposicao: alimenta a lista de pendencias.
    if (filtros.pendentes) {
        clauses.push('f.DataReposicao IS NULL');
    }

    const result = await request.query(`
        ${buildSelect()}
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY f.DataDomingo DESC, c.Nome
    `);

    return result.recordset.map(serializeFolgaDomingo);
}

async function findFolgaDomingoById(poolOrTx, id) {
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

// Os horarios chegam normalizados como texto "HH:mm:ss"; o driver (tedious)
// so aceita Date num parametro TIME e recusava o texto com "Invalid time".
function aplicarInputs(request, payload) {
    return request
        .input('colaboradorId', sql.Int, payload.colaboradorId)
        .input('dataDomingo', sql.Date, payload.dataDomingo)
        .input('dataReposicao', sql.Date, payload.dataReposicao)
        .input('reposicaoHoraInicio', sql.Time, toSqlTime(payload.reposicaoHoraInicio))
        .input('reposicaoHoraFim', sql.Time, toSqlTime(payload.reposicaoHoraFim))
        .input('reposicaoAlmocoInicio', sql.Time, toSqlTime(payload.reposicaoAlmocoInicio))
        .input('reposicaoAlmocoFim', sql.Time, toSqlTime(payload.reposicaoAlmocoFim))
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

async function createFolgaDomingo(poolOrTx, body) {
    const payload = normalizeFolgaDomingoPayload(body);
    await ensureColaboradorExiste(poolOrTx, payload.colaboradorId, 'Colaborador');

    if (payload.dataReposicao) {
        await exigirReposicaoSemConflito(poolOrTx, {
            colaboradorId: payload.colaboradorId,
            dataReposicao: payload.dataReposicao
        });
    }

    try {
        const inserido = await aplicarInputs(poolOrTx.request(), payload).query(`
            INSERT INTO FolgasDomingo (
                ColaboradorId, DataDomingo, DataReposicao, ReposicaoHoraInicio, ReposicaoHoraFim,
                ReposicaoAlmocoInicio, ReposicaoAlmocoFim, PlantaoId, Observacao
            )
            OUTPUT INSERTED.Id
            VALUES (
                @colaboradorId, @dataDomingo, @dataReposicao, @reposicaoHoraInicio, @reposicaoHoraFim,
                @reposicaoAlmocoInicio, @reposicaoAlmocoFim, @plantaoId, @observacao
            )
        `);

        return findFolgaDomingoById(poolOrTx, inserido.recordset[0].Id);
    } catch (erro) {
        throw traduzirErroDeDuplicidade(erro);
    }
}

async function updateFolgaDomingo(poolOrTx, id, body) {
    const atual = await findFolgaDomingoById(poolOrTx, id);
    const payload = normalizeFolgaDomingoPayload(body, atual);

    await ensureColaboradorExiste(poolOrTx, payload.colaboradorId, 'Colaborador');

    // So confere quando a data (ou a pessoa) mudou: editar apenas a observacao
    // de uma folga antiga nao pode falhar por uma ausencia lancada depois.
    if (payload.dataReposicao
        && (payload.dataReposicao !== atual.dataReposicao || payload.colaboradorId !== atual.colaboradorId)) {
        await exigirReposicaoSemConflito(poolOrTx, {
            colaboradorId: payload.colaboradorId,
            dataReposicao: payload.dataReposicao,
            folgaId: atual.id
        });
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
                    ReposicaoAlmocoInicio = @reposicaoAlmocoInicio,
                    ReposicaoAlmocoFim = @reposicaoAlmocoFim,
                    PlantaoId = @plantaoId,
                    Observacao = @observacao,
                    AtualizadoEm = GETDATE()
                WHERE Id = @id
            `);
    } catch (erro) {
        throw traduzirErroDeDuplicidade(erro);
    }

    return findFolgaDomingoById(poolOrTx, atual.id);
}

async function deleteFolgaDomingo(poolOrTx, id) {
    const atual = await findFolgaDomingoById(poolOrTx, id);

    await poolOrTx.request()
        .input('id', sql.Int, atual.id)
        .query('DELETE FROM FolgasDomingo WHERE Id = @id');

    return atual;
}

module.exports = {
    createFolgaDomingo,
    deleteFolgaDomingo,
    findFolgaDomingoById,
    listFolgasDomingo,
    normalizeFolgaDomingoPayload,
    serializeFolgaDomingo,
    updateFolgaDomingo
};

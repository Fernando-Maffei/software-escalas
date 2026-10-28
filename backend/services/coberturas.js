// Coberturas de plantonista: grava e le o caso (Coberturas) e a divisao do
// horario em trechos (CoberturaTrechos).
//
// O que a cobertura gera e sempre derivado destas tabelas, no mesmo padrao
// das ferias e da folga de domingo. Em dia util: a escala do dia le os trechos
// (cobertura-na-escala.js) e o banco de horas recebe o credito
// (cobertura-banco.js), refeito a cada gravacao. Sabado, domingo e feriado
// viram plantao numa fase seguinte.
//
// As regras estao separadas para serem testadas sem banco:
//   cobertura-trechos.js    gerar, dividir, validar e resumir os trechos
//   cobertura-conflitos.js  se o substituto pode assumir um trecho
//   cobertura-contexto.js   o que essas regras precisam ler do banco
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { sincronizarMovimentosDaCobertura } = require('./cobertura-banco');
const { detectarConflitoSubstituto, exigirSubstitutoSemConflito } = require('./cobertura-conflitos');
const {
    carregarAgendaDosSubstitutos,
    carregarFeriadosCadastrados,
    carregarJornadaDoTitular,
    entradaDeConflito
} = require('./cobertura-contexto');
const { gerarTrechosNecessarios, resumirCobertura, tipoDoDia, validarTrechosDaCobertura } = require('./cobertura-trechos');
const {
    buildDateRange,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeOptionalText,
    toSqlTime
} = require('../lib/validation');

// Teto do periodo: ferias sao 30 dias, e uma cobertura gera escala e confere
// agenda dia a dia. Tres meses ja e folga; mais que isso e data digitada errada.
const MAX_DIAS_COBERTURA = 92;

function idOuNulo(valor, campo) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
        return null;
    }

    return ensurePositiveInt(valor, campo);
}

function serializarTrecho(linha, visiveis = null) {
    const substitutoId = linha.SubstitutoId === null || linha.SubstitutoId === undefined ? null : Number(linha.SubstitutoId);
    // Conta com teto de setor: o trecho aparece (o horario e do titular, que
    // ela ve), mas sem o nome de quem cobre quando essa pessoa e de outro setor.
    const oculto = substitutoId !== null && visiveis !== null && !visiveis.has(substitutoId);
    const dataISO = extractDateString(linha.Data);

    return {
        id: Number(linha.Id),
        dataISO,
        tipoDia: tipoDoDia(dataISO, linha.feriados || null),
        horaInicio: extractTimeString(linha.HoraInicio),
        horaFim: extractTimeString(linha.HoraFim),
        substitutoId,
        substitutoNome: oculto ? null : (linha.SubstitutoNome ?? null),
        substitutoOculto: oculto,
        tipoCredito: linha.TipoCredito ? String(linha.TipoCredito).toLowerCase() : null,
        observacao: linha.Observacao ?? null
    };
}

function serializarCobertura(linha, trechos = []) {
    const ausenciaId = linha.AusenciaId === null || linha.AusenciaId === undefined ? null : Number(linha.AusenciaId);

    return {
        id: Number(linha.Id),
        titularId: Number(linha.TitularId),
        titularNome: linha.TitularNome ?? null,
        dataInicio: extractDateString(linha.DataInicio),
        dataFim: extractDateString(linha.DataFim),
        ausenciaId,
        // A ausencia nao tem FK (apagar as ferias nao apaga a cobertura): o
        // join volta vazio quando ela sumiu, e a tela mostra isso.
        ausencia: ausenciaId === null || !linha.AusenciaTipo
            ? null
            : {
                id: ausenciaId,
                tipo: String(linha.AusenciaTipo).toLowerCase(),
                periodoTipo: String(linha.AusenciaPeriodoTipo || 'dia_inteiro').toLowerCase(),
                dataInicio: extractDateString(linha.AusenciaDataInicio),
                dataFim: extractDateString(linha.AusenciaDataFim)
            },
        ausenciaRemovida: ausenciaId !== null && !linha.AusenciaTipo,
        observacao: linha.Observacao ?? null,
        criadoEm: linha.CriadoEm ?? null,
        atualizadoEm: linha.AtualizadoEm ?? null,
        trechos,
        resumo: resumirCobertura(trechos)
    };
}

const SELECT_COBERTURA = `
    SELECT
        cb.Id, cb.TitularId, t.Nome AS TitularNome, cb.DataInicio, cb.DataFim, cb.AusenciaId,
        a.Tipo AS AusenciaTipo, a.PeriodoTipo AS AusenciaPeriodoTipo,
        a.DataInicio AS AusenciaDataInicio, a.DataFim AS AusenciaDataFim,
        cb.Observacao, cb.CriadoEm, cb.AtualizadoEm
    FROM Coberturas cb
    INNER JOIN Colaboradores t ON t.Id = cb.TitularId
    LEFT JOIN Ausencias a ON a.Id = cb.AusenciaId
`;

async function carregarTrechos(poolOrTx, coberturaIds, visiveis = null) {
    const porCobertura = new Map(coberturaIds.map((id) => [Number(id), []]));

    if (coberturaIds.length === 0) {
        return porCobertura;
    }

    const request = poolOrTx.request();
    const params = coberturaIds.map((id, indice) => {
        request.input(`cb${indice}`, sql.Int, Number(id));
        return `@cb${indice}`;
    });
    const result = await request.query(`
        SELECT tr.Id, tr.CoberturaId, tr.Data, tr.HoraInicio, tr.HoraFim, tr.SubstitutoId,
               s.Nome AS SubstitutoNome, tr.TipoCredito, tr.Observacao
        FROM CoberturaTrechos tr
        LEFT JOIN Colaboradores s ON s.Id = tr.SubstitutoId
        WHERE tr.CoberturaId IN (${params.join(', ')})
        ORDER BY tr.Data, tr.HoraInicio, tr.Id
    `);

    const datas = result.recordset.map((linha) => extractDateString(linha.Data)).sort();
    const feriados = datas.length > 0
        ? await carregarFeriadosCadastrados(poolOrTx, datas[0], datas[datas.length - 1])
        : new Set();

    for (const linha of result.recordset) {
        porCobertura.get(Number(linha.CoberturaId)).push(serializarTrecho({ ...linha, feriados }, visiveis));
    }

    return porCobertura;
}

async function findCoberturaById(poolOrTx, id, visiveis = null) {
    const coberturaId = ensurePositiveInt(id, 'Cobertura');
    const result = await poolOrTx.request()
        .input('id', sql.Int, coberturaId)
        .query(`${SELECT_COBERTURA} WHERE cb.Id = @id`);

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Cobertura nao encontrada.');
    }

    const trechos = await carregarTrechos(poolOrTx, [coberturaId], visiveis);

    return serializarCobertura(result.recordset[0], trechos.get(coberturaId));
}

// Filtros: periodo (coberturas que tocam a janela), titular e situacao
// ('pendente' traz as que ainda tem horario descoberto — parcial ou pendente).
// `visiveis` (teto de setor) filtra pelo titular.
async function listCoberturas(poolOrTx, filtros = {}, visiveis = null) {
    const request = poolOrTx.request();
    const clauses = [];

    if (filtros.dataInicio && filtros.dataFim) {
        const { dataInicio, dataFim } = buildDateRange(filtros.dataInicio, filtros.dataFim);
        request.input('dataInicio', sql.Date, dataInicio).input('dataFim', sql.Date, dataFim);
        clauses.push('cb.DataFim >= @dataInicio AND cb.DataInicio <= @dataFim');
    }

    if (filtros.titularId) {
        request.input('titularId', sql.Int, ensurePositiveInt(filtros.titularId, 'Titular'));
        clauses.push('cb.TitularId = @titularId');
    }

    const result = await request.query(`
        ${SELECT_COBERTURA}
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY cb.DataInicio DESC, t.Nome
    `);

    const linhas = visiveis
        ? result.recordset.filter((linha) => visiveis.has(Number(linha.TitularId)))
        : result.recordset;
    const trechos = await carregarTrechos(poolOrTx, linhas.map((linha) => Number(linha.Id)), visiveis);
    const coberturas = linhas.map((linha) => serializarCobertura(linha, trechos.get(Number(linha.Id))));

    if (String(filtros.situacao || '').toLowerCase() === 'pendente') {
        return coberturas.filter((item) => ['pendente', 'parcial'].includes(item.resumo.situacao));
    }

    return coberturas;
}

async function buscarTitular(poolOrTx, titularId) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, titularId)
        .query('SELECT Id, Nome, Ativo, TrabalhoInicio, TrabalhoFim FROM Colaboradores WHERE Id = @id');

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Titular nao encontrado.');
    }

    return result.recordset[0];
}

async function buscarAusencia(poolOrTx, ausenciaId, titularId) {
    const result = await poolOrTx.request()
        .input('id', sql.Int, ausenciaId)
        .query(`
            SELECT Id, ColaboradorId, Tipo, PeriodoTipo, HoraInicio, HoraFim,
                   CONVERT(VARCHAR(10), DataInicio, 23) AS DataInicio,
                   CONVERT(VARCHAR(10), DataFim, 23) AS DataFim
            FROM Ausencias WHERE Id = @id
        `);
    const ausencia = result.recordset[0];

    if (!ausencia) {
        throw new AppError(404, 'Lancamento de ausencia nao encontrado.');
    }

    if (Number(ausencia.ColaboradorId) !== Number(titularId)) {
        throw new AppError(400, 'A ausencia escolhida e de outro colaborador, nao do titular da cobertura.');
    }

    return {
        id: Number(ausencia.Id),
        tipo: String(ausencia.Tipo).toLowerCase(),
        periodoTipo: String(ausencia.PeriodoTipo || 'dia_inteiro').toLowerCase(),
        horaInicio: extractTimeString(ausencia.HoraInicio),
        horaFim: extractTimeString(ausencia.HoraFim),
        dataInicio: ausencia.DataInicio,
        dataFim: ausencia.DataFim
    };
}

// Periodo da cobertura: o enviado ou, faltando, o da ausencia. Com ausencia,
// precisa caber nela — cobrir o titular num dia em que ele trabalha seria
// escalar duas pessoas no mesmo posto.
function resolverPeriodo(body, fallback, ausencia) {
    const bruto = {
        dataInicio: body.dataInicio ?? fallback.dataInicio ?? ausencia?.dataInicio,
        dataFim: body.dataFim ?? fallback.dataFim ?? ausencia?.dataFim
    };

    if (!bruto.dataInicio || !bruto.dataFim) {
        throw new AppError(400, 'Informe o periodo da cobertura.');
    }

    const periodo = buildDateRange(bruto.dataInicio, bruto.dataFim, { maxDias: MAX_DIAS_COBERTURA });

    if (ausencia && (periodo.dataInicio < ausencia.dataInicio || periodo.dataFim > ausencia.dataFim)) {
        throw new AppError(400, 'O periodo da cobertura precisa ficar dentro do periodo da ausencia do titular.');
    }

    return periodo;
}

// Duas coberturas do mesmo titular no mesmo dia cobririam o mesmo horario duas
// vezes: a particao vale dentro de uma cobertura, esta trava vale entre elas.
async function exigirSemCoberturaSobreposta(poolOrTx, titularId, periodo, ignorarId = null) {
    const result = await poolOrTx.request()
        .input('titularId', sql.Int, titularId)
        .input('dataInicio', sql.Date, periodo.dataInicio)
        .input('dataFim', sql.Date, periodo.dataFim)
        .input('ignorarId', sql.Int, ignorarId)
        .query(`
            SELECT TOP 1 Id, CONVERT(VARCHAR(10), DataInicio, 23) AS DataInicio, CONVERT(VARCHAR(10), DataFim, 23) AS DataFim
            FROM Coberturas
            WHERE TitularId = @titularId
              AND DataFim >= @dataInicio AND DataInicio <= @dataFim
              AND (@ignorarId IS NULL OR Id <> @ignorarId)
        `);

    if (result.recordset.length > 0) {
        const outra = result.recordset[0];
        throw new AppError(
            409,
            `O titular ja tem uma cobertura de ${outra.DataInicio} a ${outra.DataFim} que cruza este periodo. Edite a existente.`
        );
    }
}

// Confere cada trecho ATRIBUIDO contra a agenda do substituto. Na edicao, o
// trecho que ja estava gravado com o mesmo substituto e horario nao e
// reconferido nem exige visibilidade: a conta pode estar so ajustando outro
// dia, e a agenda daquela pessoa nao mudou por causa disso.
async function conferirSubstitutos(poolOrTx, { coberturaId = null, titularId, periodo, trechos, anteriores = new Map(), visiveis = null }) {
    const novos = trechos.filter((trecho) => {
        if (trecho.substitutoId === null) {
            return false;
        }

        const anterior = trecho.id ? anteriores.get(Number(trecho.id)) : null;

        return !anterior
            || anterior.substitutoId !== trecho.substitutoId
            || anterior.dataISO !== trecho.dataISO
            || anterior.horaInicio !== trecho.horaInicio
            || anterior.horaFim !== trecho.horaFim;
    });

    if (novos.length === 0) {
        return;
    }

    const substitutoIds = [...new Set(novos.map((trecho) => trecho.substitutoId))];

    for (const substitutoId of substitutoIds) {
        if (visiveis && !visiveis.has(substitutoId)) {
            throw new AppError(404, 'Substituto nao encontrado.');
        }
    }

    const agenda = await carregarAgendaDosSubstitutos(poolOrTx, {
        dataInicio: periodo.dataInicio,
        dataFim: periodo.dataFim,
        substitutoIds,
        coberturaId
    });

    for (const substitutoId of substitutoIds) {
        if (!agenda.substitutos.has(substitutoId)) {
            throw new AppError(404, `Substituto ${substitutoId} nao encontrado.`);
        }

        if (substitutoId === Number(titularId)) {
            throw new AppError(400, 'O titular nao pode cobrir o proprio horario.');
        }
    }

    for (const trecho of novos) {
        exigirSubstitutoSemConflito(entradaDeConflito(agenda, trecho, trecho.substitutoId));
    }
}

// Grava a particao: atualiza os trechos que vieram com id, insere os novos e
// apaga os que sumiram. Ids estaveis importam — as fases seguintes vao
// pendurar escala, plantao e banco de horas no id do trecho.
async function gravarTrechos(tx, coberturaId, trechos, anteriores) {
    const enviados = new Set();

    for (const trecho of trechos) {
        const request = tx.request()
            .input('coberturaId', sql.Int, coberturaId)
            .input('data', sql.Date, trecho.dataISO)
            .input('horaInicio', sql.Time, toSqlTime(trecho.horaInicio, 'Hora inicial do trecho'))
            .input('horaFim', sql.Time, toSqlTime(trecho.horaFim, 'Hora final do trecho'))
            .input('substitutoId', sql.Int, trecho.substitutoId)
            .input('tipoCredito', sql.NVarChar(20), trecho.tipoCredito)
            .input('observacao', sql.NVarChar(500), trecho.observacao ?? null);

        if (trecho.id) {
            if (!anteriores.has(Number(trecho.id))) {
                throw new AppError(400, `O trecho ${trecho.id} nao pertence a esta cobertura.`);
            }

            enviados.add(Number(trecho.id));
            await request.input('id', sql.Int, trecho.id).query(`
                UPDATE CoberturaTrechos
                SET Data = @data, HoraInicio = @horaInicio, HoraFim = @horaFim, SubstitutoId = @substitutoId,
                    TipoCredito = @tipoCredito, Observacao = @observacao, AtualizadoEm = GETDATE()
                WHERE Id = @id AND CoberturaId = @coberturaId
            `);
            continue;
        }

        await request.query(`
            INSERT INTO CoberturaTrechos (CoberturaId, Data, HoraInicio, HoraFim, SubstitutoId, TipoCredito, Observacao)
            VALUES (@coberturaId, @data, @horaInicio, @horaFim, @substitutoId, @tipoCredito, @observacao)
        `);
    }

    for (const id of anteriores.keys()) {
        if (!enviados.has(id)) {
            await tx.request().input('id', sql.Int, id).query('DELETE FROM CoberturaTrechos WHERE Id = @id');
        }
    }
}

// Trechos sugeridos para um titular e periodo, sem gravar nada: e o que a
// cobertura nova recebe quando o pedido nao manda trechos, e o que a tela usa
// para mostrar o horario a cobrir antes de salvar (ou ao estender o periodo).
async function sugerirTrechos(poolOrTx, { titularId, dataInicio, dataFim, ausenciaId = null }) {
    const titular = await buscarTitular(poolOrTx, ensurePositiveInt(titularId, 'Titular'));
    const ausencia = ausenciaId ? await buscarAusencia(poolOrTx, ensurePositiveInt(ausenciaId, 'Ausencia'), titular.Id) : null;
    const periodo = resolverPeriodo({ dataInicio, dataFim }, {}, ausencia);

    return {
        ...periodo,
        trechos: gerarTrechosNecessarios({
            ...periodo,
            jornadaPorDiaSemana: await carregarJornadaDoTitular(poolOrTx, titular),
            ausencia,
            feriados: await carregarFeriadosCadastrados(poolOrTx, periodo.dataInicio, periodo.dataFim)
        })
    };
}

async function createCobertura(tx, body = {}, visiveis = null) {
    const titularId = ensurePositiveInt(body.titularId, 'Titular');

    if (visiveis && !visiveis.has(titularId)) {
        throw new AppError(404, 'Titular nao encontrado.');
    }

    const titular = await buscarTitular(tx, titularId);
    const ausenciaId = idOuNulo(body.ausenciaId, 'Ausencia');
    const ausencia = ausenciaId ? await buscarAusencia(tx, ausenciaId, titularId) : null;
    const periodo = resolverPeriodo(body, {}, ausencia);
    const observacao = normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 });

    await exigirSemCoberturaSobreposta(tx, titularId, periodo);

    const feriados = await carregarFeriadosCadastrados(tx, periodo.dataInicio, periodo.dataFim);
    const brutos = Array.isArray(body.trechos)
        ? body.trechos.map(({ id: _id, ...trecho }) => trecho)
        : gerarTrechosNecessarios({
            ...periodo,
            jornadaPorDiaSemana: await carregarJornadaDoTitular(tx, titular),
            ausencia,
            feriados
        });
    const trechos = validarTrechosDaCobertura({ titularId, ...periodo, trechos: brutos, feriados });

    await conferirSubstitutos(tx, { titularId, periodo, trechos, visiveis });

    const inserida = await tx.request()
        .input('titularId', sql.Int, titularId)
        .input('dataInicio', sql.Date, periodo.dataInicio)
        .input('dataFim', sql.Date, periodo.dataFim)
        .input('ausenciaId', sql.Int, ausenciaId)
        .input('observacao', sql.NVarChar(500), observacao)
        .query(`
            INSERT INTO Coberturas (TitularId, DataInicio, DataFim, AusenciaId, Observacao)
            OUTPUT INSERTED.Id
            VALUES (@titularId, @dataInicio, @dataFim, @ausenciaId, @observacao)
        `);
    const id = Number(inserida.recordset[0].Id);

    await gravarTrechos(tx, id, trechos, new Map());
    await sincronizarMovimentosDaCobertura(tx, id);

    return findCoberturaById(tx, id, visiveis);
}

// Edita periodo, observacao e trechos. Titular e ausencia de origem nao mudam:
// outro titular ou outra ausencia e outra cobertura. Sem `trechos` no pedido,
// os gravados continuam — e precisam caber no periodo novo.
async function updateCobertura(tx, id, body = {}, visiveis = null) {
    const atual = await findCoberturaById(tx, id, visiveis);

    if (visiveis && !visiveis.has(atual.titularId)) {
        throw new AppError(404, 'Cobertura nao encontrada.');
    }

    if (body.titularId !== undefined && Number(body.titularId) !== atual.titularId) {
        throw new AppError(400, 'O titular de uma cobertura nao muda. Exclua e abra outra.');
    }

    if (body.ausenciaId !== undefined && idOuNulo(body.ausenciaId, 'Ausencia') !== atual.ausenciaId) {
        throw new AppError(400, 'A ausencia de origem de uma cobertura nao muda. Exclua e abra outra.');
    }

    const ausencia = atual.ausenciaId && !atual.ausenciaRemovida
        ? await buscarAusencia(tx, atual.ausenciaId, atual.titularId)
        : null;
    const periodo = resolverPeriodo(body, atual, ausencia);
    const observacao = body.observacao !== undefined
        ? normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 })
        : atual.observacao;

    await exigirSemCoberturaSobreposta(tx, atual.titularId, periodo, atual.id);

    const feriados = await carregarFeriadosCadastrados(tx, periodo.dataInicio, periodo.dataFim);
    const anteriores = new Map(atual.trechos.map((trecho) => [trecho.id, trecho]));
    const trechos = validarTrechosDaCobertura({
        titularId: atual.titularId,
        ...periodo,
        trechos: Array.isArray(body.trechos) ? body.trechos : atual.trechos,
        feriados
    });

    await conferirSubstitutos(tx, { coberturaId: atual.id, titularId: atual.titularId, periodo, trechos, anteriores, visiveis });

    await tx.request()
        .input('id', sql.Int, atual.id)
        .input('dataInicio', sql.Date, periodo.dataInicio)
        .input('dataFim', sql.Date, periodo.dataFim)
        .input('observacao', sql.NVarChar(500), observacao)
        .query(`
            UPDATE Coberturas
            SET DataInicio = @dataInicio, DataFim = @dataFim, Observacao = @observacao, AtualizadoEm = GETDATE()
            WHERE Id = @id
        `);

    await gravarTrechos(tx, atual.id, trechos, anteriores);
    await sincronizarMovimentosDaCobertura(tx, atual.id);

    return findCoberturaById(tx, atual.id, visiveis);
}

// Quem pode assumir um horario: todos os colaboradores ativos (visiveis para a
// conta), com o motivo de quem nao pode. Alimenta o seletor de substituto da
// tela, que mostra os indisponiveis apagados em vez de esconde-los — assim o
// administrador ve POR QUE fulano nao aparece como opcao.
async function listarDisponibilidade(tx, consulta = {}, visiveis = null) {
    const [trecho] = validarTrechosDaCobertura({
        titularId: 0,
        dataInicio: consulta.dataISO,
        dataFim: consulta.dataISO,
        trechos: [{ id: consulta.trechoId, dataISO: consulta.dataISO, horaInicio: consulta.horaInicio, horaFim: consulta.horaFim }]
    });
    const titularId = idOuNulo(consulta.titularId, 'Titular');
    const coberturaId = idOuNulo(consulta.coberturaId, 'Cobertura');

    const result = await tx.request().query('SELECT Id FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');
    const ids = result.recordset
        .map((linha) => Number(linha.Id))
        .filter((id) => id !== titularId && (!visiveis || visiveis.has(id)));
    const agenda = await carregarAgendaDosSubstitutos(tx, {
        dataInicio: trecho.dataISO,
        dataFim: trecho.dataISO,
        substitutoIds: ids,
        coberturaId
    });

    return ids.map((id) => {
        const { conflito, segundoTurno } = detectarConflitoSubstituto(entradaDeConflito(agenda, trecho, id));

        return {
            id,
            nome: agenda.substitutos.get(id)?.nome ?? null,
            disponivel: conflito === null,
            motivo: conflito,
            segundoTurno
        };
    });
}

async function deleteCobertura(tx, id, visiveis = null) {
    const atual = await findCoberturaById(tx, id, visiveis);

    if (visiveis && !visiveis.has(atual.titularId)) {
        throw new AppError(404, 'Cobertura nao encontrada.');
    }

    // Os trechos saem junto (FK com ON DELETE CASCADE).
    await tx.request().input('id', sql.Int, atual.id).query('DELETE FROM Coberturas WHERE Id = @id');
    // Sem trechos, a sincronizacao so apaga os movimentos que apontavam para eles.
    await sincronizarMovimentosDaCobertura(tx, atual.id);

    return atual;
}

module.exports = {
    MAX_DIAS_COBERTURA,
    createCobertura,
    deleteCobertura,
    findCoberturaById,
    listCoberturas,
    listarDisponibilidade,
    serializarCobertura,
    serializarTrecho,
    sugerirTrechos,
    updateCobertura
};

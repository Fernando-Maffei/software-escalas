const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { PLANTAO_TIPOS, PLANTAO_TIPOS_LANCAMENTO } = require('../lib/dominio');
const {
    buildDisponibilidadeColaborador,
    calculateIntervalMinutes,
    describePlantaoMovement,
    minutesToDurationLabel
} = require('../services/bancoHoras');
const {
    deleteEscalaDiaByOrigin,
    restoreEscalaDefaultsForPeriod,
    syncPlantaoDiaToEscalaDia
} = require('../services/escala');
const { withTransaction } = require('../db/transactions');
const { colaboradoresVisiveis } = require('../auth/acesso-setores');
const { SQL_EQUIPE_PLANTAO, gravarEquipePlantao } = require('../services/equipe-plantao');
const {
    extractDateString,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    toSqlTime
} = require('../lib/validation');
const {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    generateUpcomingSaturdays,
    normalizePlantaoType,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
} = require('../services/plantoes');

const PLANTAO_COLUNAS = `
            id,
            data_plantao,
            ${SQL_EQUIPE_PLANTAO},
            criado_em,
            atualizado_em,
            hora_inicio,
            hora_fim,
            observacao,
            tipo_plantao,
            tipo_credito,
            tipo_lancamento`;

// O dia pode ter MAIS DE UM lancamento (turnos com horarios, pessoas e destinos
// diferentes), entao a busca por data devolve lista.
async function findPlantoesByDate(poolOrTx, dataISO) {
    const result = await poolOrTx.request()
        .input('data_plantao', sql.Date, dataISO)
        .query(`
            SELECT ${PLANTAO_COLUNAS}
            FROM plantoes
            WHERE data_plantao = @data_plantao
            ORDER BY hora_inicio, id
        `);

    return result.recordset;
}

// Datas de feriado (ISO) cadastradas, como Set — para o tipo do plantao poder
// ser 'feriado' (inclusive em dia util). Aqui vem so o feriado municipal/
// estadual: os nacionais resolvePlantaoTypeByDate calcula sozinho, entao um
// 07/09 continua sendo feriado mesmo sem nenhuma linha na tabela Feriados.
async function loadFeriadosSet(poolOrTx) {
    const result = await poolOrTx.request().query('SELECT Data FROM Feriados');
    const set = new Set();

    for (const row of result.recordset) {
        const iso = extractDateString(row.Data);
        if (iso) {
            set.add(iso);
        }
    }

    return set;
}

async function ensureColaboradoresExist(poolOrTx, colaboradoresIds) {
    for (const colaboradorId of colaboradoresIds) {
        const result = await poolOrTx.request()
            .input('id', sql.Int, colaboradorId)
            .query('SELECT Id FROM Colaboradores WHERE Id = @id');

        if (result.recordset.length === 0) {
            throw new AppError(404, `Colaborador ${colaboradorId} nao encontrado.`);
        }
    }
}

async function listDisponibilidade(poolOrTx, plantao) {
    // Colaborador desligado (Ativo = 0) nao aparece como disponivel para plantao.
    const colaboradoresResult = await poolOrTx.request().query('SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');
    const ausenciasResult = await poolOrTx.request()
        .input('dataPlantao', sql.Date, plantao.dataISO)
        .query(`
            SELECT Id, ColaboradorId, Tipo, DataInicio, DataFim, PeriodoTipo, HoraInicio, HoraFim, Subtipo
            FROM Ausencias
            WHERE @dataPlantao BETWEEN DataInicio AND DataFim
        `);

    const ausenciasPorColaborador = new Map();

    for (const ausencia of ausenciasResult.recordset) {
        const colaboradorId = ausencia.ColaboradorId;

        if (!ausenciasPorColaborador.has(colaboradorId)) {
            ausenciasPorColaborador.set(colaboradorId, []);
        }

        ausenciasPorColaborador.get(colaboradorId).push(ausencia);
    }

    return colaboradoresResult.recordset.map((colaborador) => buildDisponibilidadeColaborador(
        colaborador,
        ausenciasPorColaborador.get(colaborador.Id) || [],
        plantao
    ));
}

// Cada lancamento mostra so a parte da equipe que a conta pode ver; lancamento
// sem ninguem visivel sai da resposta.
function filtrarEquipesVisiveis(lancamentos, visiveis) {
    if (!visiveis) {
        return lancamentos;
    }

    return lancamentos
        .map((lancamento) => ({
            ...lancamento,
            colaboradores: lancamento.colaboradores.filter((id) => visiveis.has(Number(id)))
        }))
        .filter((lancamento) => lancamento.colaboradores.length > 0);
}

async function assertColaboradoresDisponiveis(poolOrTx, payload) {
    const disponibilidade = await listDisponibilidade(poolOrTx, payload);
    const indisponiveis = disponibilidade.filter((item) => payload.colaboradores.includes(item.id) && !item.disponivel);

    if (indisponiveis.length === 0) {
        return;
    }

    const detalhes = indisponiveis.map((item) => `${item.nome} (${item.motivoLabel})`).join(', ');
    throw new AppError(400, `Nao foi possivel salvar o plantao. Colaboradores indisponiveis: ${detalhes}.`);
}

function hydratePlantaoDuration(serialized) {
    if (!serialized.duracaoFormatada && serialized.horaInicio && serialized.horaFim) {
        serialized.duracaoMinutos = calculateIntervalMinutes(serialized.horaInicio, serialized.horaFim);
        serialized.duracaoFormatada = minutesToDurationLabel(serialized.duracaoMinutos);
    }

    return serialized;
}

async function deletePlantaoMovements(poolOrTx, plantaoId) {
    await poolOrTx.request()
        .input('origemTipo', sql.NVarChar(30), 'plantao')
        .input('origemId', sql.Int, plantaoId)
        .query(`
            DELETE FROM BancoHorasMovimentos
            WHERE OrigemTipo = @origemTipo
              AND OrigemId = @origemId
        `);
}

async function syncPlantaoMovements(poolOrTx, row) {
    const plantao = serializePlantaoRecord(row);
    await deletePlantaoMovements(poolOrTx, plantao.id);

    // Hora extra e paga em folha: o plantao fica registrado e entra na escala do
    // dia, mas nao vira credito no banco de horas. O DELETE acima roda antes
    // deste corte de proposito — se o lancamento era 'banco' e virou 'extra',
    // o movimento antigo precisa sumir.
    if (plantao.tipoCredito === 'extra') {
        return { synced: false, skippedReason: 'hora_extra' };
    }

    if (!plantao.horaInicio || !plantao.horaFim || plantao.colaboradores.length === 0) {
        return { synced: false, skippedReason: 'missing_required_data' };
    }

    const minutos = calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim, {
        startLabel: 'Hora inicial do plantao',
        endLabel: 'Hora final do plantao'
    });

    for (const colaboradorId of plantao.colaboradores) {
        await poolOrTx.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('dataReferencia', sql.Date, plantao.dataISO)
            .input('minutos', sql.Int, minutos)
            .input('origemTipo', sql.NVarChar(30), 'plantao')
            .input('origemId', sql.Int, plantao.id)
            .input('descricao', sql.NVarChar(255), describePlantaoMovement(plantao))
            .input('observacao', sql.NVarChar(500), plantao.observacao || null)
            .query(`
                INSERT INTO BancoHorasMovimentos (
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
            `);
    }

    return {
        synced: true,
        minutos
    };
}

router.get('/', async (req, res) => {
    const pool = await conectar();
    const request = pool.request();
    const clauses = [];

    if (req.query.from) {
        request.input('from', sql.Date, normalizeIsoDate(req.query.from, 'Data inicial'));
        clauses.push('data_plantao >= @from');
    }

    if (req.query.to) {
        request.input('to', sql.Date, normalizeIsoDate(req.query.to, 'Data final'));
        clauses.push('data_plantao <= @to');
    }

    if (req.query.tipoPlantao) {
        request.input('tipoPlantao', sql.NVarChar(30), normalizePlantaoType(req.query.tipoPlantao));
        clauses.push('LOWER(tipo_plantao) = @tipoPlantao');
    }

    // Base dos relatorios por tipo (?tipoLancamento=cobertura_almoco).
    if (req.query.tipoLancamento) {
        request.input('tipoLancamento', sql.NVarChar(30), normalizeEnum(req.query.tipoLancamento, 'Tipo do lancamento', PLANTAO_TIPOS_LANCAMENTO));
        clauses.push('LOWER(tipo_lancamento) = @tipoLancamento');
    }

    const result = await request.query(`
        SELECT ${PLANTAO_COLUNAS}
        FROM plantoes
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY data_plantao DESC, hora_inicio, id
    `);

    const records = result.recordset
        .map((row) => hydratePlantaoDuration(serializePlantaoRecord(row)))
        .filter((plantao) => PLANTAO_TIPOS.includes(plantao.tipoPlantao));

    res.json(filtrarEquipesVisiveis(records, await colaboradoresVisiveis(pool, req)));
});

router.get('/proximos/:quantidade', async (req, res) => {
    const sabados = generateUpcomingSaturdays(req.params.quantidade);
    res.json(sabados);
});

router.get('/disponibilidade/:dataISO', async (req, res) => {
    const pool = await conectar();
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');
    resolvePlantaoTypeByDate(dataISO, await loadFeriadosSet(pool));
    const horaInicio = req.query.horaInicio ? normalizeNullableTime(req.query.horaInicio, 'Hora inicial do plantao') : null;
    const horaFim = req.query.horaFim ? normalizeNullableTime(req.query.horaFim, 'Hora final do plantao') : null;

    if ((horaInicio && !horaFim) || (!horaInicio && horaFim)) {
        throw new AppError(400, 'Informe hora inicial e hora final para validar disponibilidade por horario.');
    }

    const disponibilidade = await listDisponibilidade(pool, {
        dataISO,
        horaInicio,
        horaFim
    });

    const visiveis = await colaboradoresVisiveis(pool, req);

    res.json({
        dataISO,
        horaInicio,
        horaFim,
        colaboradores: visiveis ? disponibilidade.filter((item) => visiveis.has(Number(item.id))) : disponibilidade
    });
});

router.get('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');
    const tipoPlantao = resolvePlantaoTypeByDate(dataISO, await loadFeriadosSet(pool));
    const rows = await findPlantoesByDate(pool, dataISO);

    if (rows.length === 0) {
        throw new AppError(404, 'Plantao nao encontrado.');
    }

    const lancamentos = filtrarEquipesVisiveis(
        rows.map((row) => hydratePlantaoDuration(serializePlantaoRecord(row))),
        await colaboradoresVisiveis(pool, req)
    );

    if (lancamentos.length === 0) {
        throw new AppError(404, 'Plantao nao encontrado.');
    }

    res.json({
        dataISO,
        tipoPlantao,
        // A observacao e do dia: todas as linhas gravam o mesmo texto.
        observacao: lancamentos.find((item) => item.observacao)?.observacao || null,
        lancamentos
    });
});

router.post('/', async (req, res) => {
    const pool = await conectar();
    const feriados = await loadFeriadosSet(pool);
    const payload = buildPlantaoDiaPayload(req.body, feriados);
    const grupos = agruparLancamentosPorHorario(payload.lancamentos);
    const colaboradoresDoDia = [...new Set(grupos.flatMap((grupo) => grupo.colaboradores))];

    const result = await withTransaction(sql, pool, async (tx) => {
        await ensureColaboradoresExist(tx, colaboradoresDoDia);

        for (const grupo of grupos) {
            await assertColaboradoresDisponiveis(tx, {
                dataISO: payload.dataISO,
                horaInicio: grupo.horaInicio,
                horaFim: grupo.horaFim,
                colaboradores: grupo.colaboradores
            });
        }

        const anteriores = await findPlantoesByDate(tx, payload.dataISO);
        const action = anteriores.length > 0 ? 'updated' : 'created';

        // O dia e reescrito inteiro a cada gravacao: casar linha por linha com o
        // que ja existia daria o mesmo resultado por muito mais codigo, e a tela
        // sempre manda o dia completo.
        for (const anterior of anteriores) {
            await deletePlantaoMovements(tx, anterior.id);
            await deleteEscalaDiaByOrigin(tx, 'plantao', anterior.id);
        }

        await tx.request()
            .input('data_plantao', sql.Date, payload.dataISO)
            .query('DELETE FROM plantoes WHERE data_plantao = @data_plantao');

        const salvos = [];

        for (const grupo of grupos) {
            const insertResult = await tx.request()
                .input('data_plantao', sql.Date, payload.dataISO)
                .input('tipoPlantao', sql.NVarChar(30), payload.tipoPlantao)
                .input('tipoCredito', sql.NVarChar(20), grupo.tipoCredito)
                .input('tipoLancamento', sql.NVarChar(30), grupo.tipoLancamento)
                .input('horaInicio', sql.Time, toSqlTime(grupo.horaInicio, 'Hora inicial do plantao'))
                .input('horaFim', sql.Time, toSqlTime(grupo.horaFim, 'Hora final do plantao'))
                .input('observacao', sql.NVarChar(500), payload.observacao)
                .query(`
                    INSERT INTO plantoes (
                        data_plantao, hora_inicio, hora_fim, observacao, tipo_plantao, tipo_credito, tipo_lancamento
                    )
                    OUTPUT INSERTED.*
                    VALUES (@data_plantao, @horaInicio, @horaFim, @observacao, @tipoPlantao, @tipoCredito, @tipoLancamento)
                `);

            const saved = insertResult.recordset[0];

            await gravarEquipePlantao(tx, saved.id, grupo.colaboradores);
            saved.equipe = grupo.colaboradores;
            saved.duracaoMinutos = grupo.duracaoMinutos;
            salvos.push(saved);
        }

        for (const saved of salvos) {
            await syncPlantaoMovements(tx, saved);
        }

        const colaboradoresResult = await tx.request().query('SELECT * FROM Colaboradores');
        await syncPlantaoDiaToEscalaDia(tx, payload.dataISO, salvos, colaboradoresResult.recordset);

        return {
            action,
            lancamentos: salvos.map((saved) => hydratePlantaoDuration(serializePlantaoRecord(saved)))
        };
    });

    res.status(result.action === 'created' ? 201 : 200).json({
        message: result.action === 'created'
            ? 'Plantao salvo com sucesso!'
            : 'Plantao atualizado com sucesso!',
        success: true,
        action: result.action,
        data: {
            dataISO: payload.dataISO,
            tipoPlantao: payload.tipoPlantao,
            observacao: payload.observacao,
            lancamentos: result.lancamentos
        }
    });
});

router.delete('/:dataISO', async (req, res) => {
    const pool = await conectar();
    const dataISO = normalizeIsoDate(req.params.dataISO, 'Data do plantao');

    await withTransaction(sql, pool, async (tx) => {
        const existentes = await findPlantoesByDate(tx, dataISO);

        if (existentes.length === 0) {
            throw new AppError(404, 'Plantao nao encontrado.');
        }

        // Excluir o dia derruba TODOS os turnos daquela data.
        for (const existente of existentes) {
            await deletePlantaoMovements(tx, existente.id);
            await deleteEscalaDiaByOrigin(tx, 'plantao', existente.id);
        }

        await tx.request()
            .input('data_plantao', sql.Date, dataISO)
            .query('DELETE FROM plantoes WHERE data_plantao = @data_plantao');

        await restoreEscalaDefaultsForPeriod(tx, dataISO, dataISO);
    });

    res.json({
        message: 'Plantao excluido com sucesso!',
        success: true
    });
});

module.exports = router;

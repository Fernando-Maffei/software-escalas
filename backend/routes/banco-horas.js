const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const {
    calculateAusenciaDebitMinutes,
    calculateIntervalMinutes,
    describeAusenciaMovement,
    describePlantaoMovement,
    minutesToBalanceLabel,
    minutesToDurationLabel,
    parseBalanceInputToMinutes
} = require('../services/bancoHoras');
const { withTransaction } = require('../db/transactions');
const { colaboradoresVisiveis, exigirColaboradorVisivel } = require('../auth/acesso-setores');
const { ensurePositiveInt, extractDateString, normalizeOptionalText } = require('../lib/validation');
const { serializePlantaoRecord } = require('../services/plantoes');
const { SQL_EQUIPE_PLANTAO, SQL_PLANTAO_COM_COLABORADOR } = require('../services/equipe-plantao');
const { gravarMovimentosDosTrechos } = require('../services/cobertura-banco');
const { carregarTrechosDeDiaUtil } = require('../services/cobertura-dia-util');

function mapResumoRow(row) {
    return {
        colaboradorId: row.Id,
        nome: row.Nome,
        saldoMinutos: row.saldoMinutos,
        saldoFormatado: minutesToBalanceLabel(row.saldoMinutos),
        creditosMesMinutos: row.creditosMesMinutos,
        creditosMesFormatado: minutesToDurationLabel(row.creditosMesMinutos),
        debitosMesMinutos: row.debitosMesMinutos,
        debitosMesFormatado: minutesToDurationLabel(row.debitosMesMinutos),
        ultimoMovimentoEm: row.ultimoMovimentoEm
    };
}

const AUSENCIA_COLUNAS = `
                Id,
                ColaboradorId,
                Tipo,
                DataInicio,
                DataFim,
                PeriodoTipo,
                HoraInicio,
                HoraFim,
                Subtipo,
                DescontaBancoHoras,
                Observacao`;

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
                tipo_credito`;

async function insertMovimento(poolOrTx, movimento) {
    await poolOrTx.request()
        .input('colaboradorId', sql.Int, movimento.colaboradorId)
        .input('dataReferencia', sql.Date, movimento.dataReferencia)
        .input('minutos', sql.Int, movimento.minutos)
        .input('origemTipo', sql.NVarChar(30), movimento.origemTipo)
        .input('origemId', sql.Int, movimento.origemId)
        .input('descricao', sql.NVarChar(255), movimento.descricao)
        .input('observacao', sql.NVarChar(500), movimento.observacao || null)
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

async function getSaldoAtualMinutos(poolOrTx, colaboradorId) {
    const result = await poolOrTx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .query(`
            SELECT COALESCE(SUM(Minutos), 0) AS saldoAtualMinutos
            FROM BancoHorasMovimentos
            WHERE ColaboradorId = @colaboradorId
        `);

    return Number(result.recordset[0]?.saldoAtualMinutos || 0);
}

// Mantido pelo contrato da API. Se esta rota responde, o portao de prontidao
// do server.js ja garantiu todas as migrations aplicadas — o banco de horas
// esta sempre habilitado e nada falta.
const CAPACIDADES_BANCO_HORAS = Object.freeze({
    hasMovimentosTable: true,
    hasJornadaSemanalTable: true,
    hasAusenciaSubtipo: true,
    hasAusenciaDesconta: true,
    hasAusenciaObservacao: true,
    hasColaboradorSetorId: true,
    hasSetoresTable: true,
    hasAlmocosPersonalizadosTable: true,
    hasPlantaoHoraInicio: true,
    hasPlantaoHoraFim: true,
    hasPlantaoObservacao: true,
    hasPlantaoTipo: true,
    hasPlantaoTipoCredito: true
});

router.get('/status', (req, res) => {
    res.json({
        enabled: true,
        capabilities: CAPACIDADES_BANCO_HORAS,
        missing: []
    });
});

router.get('/resumo', async (req, res) => {
    const pool = await conectar();

    const request = pool.request();
    const clauses = [];
    const search = String(req.query.search || '').trim();

    if (req.query.colaboradorId) {
        request.input('colaboradorId', sql.Int, ensurePositiveInt(req.query.colaboradorId, 'Colaborador'));
        clauses.push('c.Id = @colaboradorId');
    }

    if (search) {
        request.input('search', sql.NVarChar(300), `%${search}%`);
        clauses.push('c.Nome LIKE @search');
    }

    const result = await request.query(`
        SELECT
            c.Id,
            c.Nome,
            COALESCE(SUM(m.Minutos), 0) AS saldoMinutos,
            COALESCE(SUM(CASE
                WHEN m.Minutos > 0
                 AND YEAR(m.DataReferencia) = YEAR(GETDATE())
                 AND MONTH(m.DataReferencia) = MONTH(GETDATE())
                THEN m.Minutos
                ELSE 0
            END), 0) AS creditosMesMinutos,
            COALESCE(ABS(SUM(CASE
                WHEN m.Minutos < 0
                 AND YEAR(m.DataReferencia) = YEAR(GETDATE())
                 AND MONTH(m.DataReferencia) = MONTH(GETDATE())
                THEN m.Minutos
                ELSE 0
            END)), 0) AS debitosMesMinutos,
            MAX(m.CriadoEm) AS ultimoMovimentoEm
        FROM Colaboradores c
        LEFT JOIN BancoHorasMovimentos m ON m.ColaboradorId = c.Id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        GROUP BY c.Id, c.Nome
        ORDER BY c.Nome
    `);

    const visiveis = await colaboradoresVisiveis(pool, req);
    const linhas = visiveis ? result.recordset.filter((linha) => visiveis.has(Number(linha.Id))) : result.recordset;

    res.json({
        enabled: true,
        items: linhas.map(mapResumoRow)
    });
});

// Plantoes e coberturas de dia util do colaborador marcados como hora extra,
// do mais novo para o mais velho.
async function listarHorasExtrasDoColaborador(pool, colaboradorId, limit) {
    const result = await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('limite', sql.Int, limit)
        .query(`
            SELECT TOP (@limite) id, data_plantao, ${SQL_EQUIPE_PLANTAO}, hora_inicio, hora_fim, observacao, tipo_plantao, tipo_credito
            FROM plantoes
            WHERE LOWER(tipo_credito) = 'extra'
              AND ${SQL_PLANTAO_COM_COLABORADOR}
            ORDER BY data_plantao DESC, id DESC
        `);

    const plantoes = result.recordset
        .map((row) => serializePlantaoRecord(row))
        .map((plantao) => {
            const minutos = plantao.horaInicio && plantao.horaFim
                ? calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim)
                : 0;

            return {
                plantaoId: plantao.id,
                origem: 'plantao',
                dataReferencia: plantao.dataISO,
                horaInicio: plantao.horaInicio,
                horaFim: plantao.horaFim,
                minutos,
                minutosFormatado: minutesToDurationLabel(minutos),
                tipoPlantao: plantao.tipoPlantao,
                observacao: plantao.observacao
            };
        });
    const coberturas = (await carregarTrechosDeDiaUtil(pool, { substitutoId: colaboradorId }))
        .filter((trecho) => trecho.tipoCredito === 'extra')
        .map((trecho) => ({
            trechoId: trecho.id,
            origem: 'cobertura',
            dataReferencia: trecho.dataISO,
            horaInicio: trecho.horaInicio,
            horaFim: trecho.horaFim,
            minutos: trecho.minutos,
            minutosFormatado: minutesToDurationLabel(trecho.minutos),
            tipoPlantao: 'cobertura',
            observacao: [trecho.titularNome ? `Cobrindo ${trecho.titularNome}` : null, trecho.observacao]
                .filter(Boolean).join(' | ') || null
        }));

    return [...plantoes, ...coberturas]
        .sort((a, b) => String(b.dataReferencia).localeCompare(String(a.dataReferencia))
            || String(b.horaInicio).localeCompare(String(a.horaInicio)))
        .slice(0, limit);
}

router.get('/colaborador/:id', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();

    const limit = req.query.limit ? Math.min(ensurePositiveInt(req.query.limit, 'Limite'), 200) : 100;
    exigirColaboradorVisivel(await colaboradoresVisiveis(pool, req), colaboradorId);

    const colaboradorResult = await pool.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT Id, Nome FROM Colaboradores WHERE Id = @id');

    if (colaboradorResult.recordset.length === 0) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const extratoResult = await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('limit', sql.Int, limit)
        .query(`
            WITH MovimentosOrdenados AS (
                SELECT
                    Id,
                    ColaboradorId,
                    DataReferencia,
                    Minutos,
                    OrigemTipo,
                    OrigemId,
                    Descricao,
                    Observacao,
                    CriadoEm,
                    SUM(Minutos) OVER (
                        PARTITION BY ColaboradorId
                        ORDER BY DataReferencia, Id
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS SaldoAcumulado
                FROM BancoHorasMovimentos
                WHERE ColaboradorId = @colaboradorId
            )
            SELECT TOP (@limit) *
            FROM MovimentosOrdenados
            ORDER BY DataReferencia DESC, Id DESC
        `);

    // Plantao lancado como hora extra nao gera movimento no banco de propósito
    // (a hora e paga em folha), entao ele nao aparece no extrato acima. Sem
    // isso, quem trabalhou num sabado inteiro nao encontra o registro em lugar
    // nenhum e parece que o plantao se perdeu. Vai numa lista a parte, fora da
    // conta do saldo.
    const horasExtras = await listarHorasExtrasDoColaborador(pool, colaboradorId, limit);
    const horasExtrasMinutos = horasExtras.reduce((total, item) => total + item.minutos, 0);

    res.json({
        colaborador: colaboradorResult.recordset[0],
        items: extratoResult.recordset.map((row) => ({
            id: row.Id,
            dataReferencia: row.DataReferencia,
            minutos: row.Minutos,
            minutosFormatado: row.Minutos >= 0
                ? `+${minutesToDurationLabel(row.Minutos)}`
                : `-${minutesToDurationLabel(Math.abs(row.Minutos))}`,
            saldoAcumuladoMinutos: row.SaldoAcumulado,
            saldoAcumuladoFormatado: minutesToBalanceLabel(row.SaldoAcumulado),
            origemTipo: row.OrigemTipo,
            origemId: row.OrigemId,
            descricao: row.Descricao,
            observacao: row.Observacao,
            criadoEm: row.CriadoEm
        })),
        horasExtras,
        horasExtrasMinutos,
        horasExtrasFormatado: minutesToDurationLabel(horasExtrasMinutos)
    });
});

router.put('/colaborador/:id/saldo', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();

    const saldoMinutos = parseBalanceInputToMinutes(req.body?.saldo);
    const observacao = req.body?.observacao !== undefined
        ? normalizeOptionalText(req.body.observacao, 'Observacao', { maxLength: 500 })
        : null;

    const resultado = await withTransaction(sql, pool, async (tx) => {
        const colaboradorResult = await tx.request()
            .input('id', sql.Int, colaboradorId)
            .query('SELECT Id, Nome FROM Colaboradores WHERE Id = @id');

        if (colaboradorResult.recordset.length === 0) {
            throw new AppError(404, 'Colaborador nao encontrado.');
        }

        const colaborador = colaboradorResult.recordset[0];
        const saldoAnteriorMinutos = await getSaldoAtualMinutos(tx, colaboradorId);
        const deltaMinutos = saldoMinutos - saldoAnteriorMinutos;

        if (deltaMinutos !== 0) {
            await insertMovimento(tx, {
                colaboradorId,
                dataReferencia: extractDateString(new Date()),
                minutos: deltaMinutos,
                origemTipo: 'ajuste_manual',
                origemId: null,
                descricao: `Ajuste manual de saldo para ${minutesToBalanceLabel(saldoMinutos)}`,
                observacao: observacao || `Saldo anterior ${minutesToBalanceLabel(saldoAnteriorMinutos)}`
            });
        }

        return {
            colaborador,
            saldoAnteriorMinutos,
            saldoMinutos,
            deltaMinutos,
            movimentoCriado: deltaMinutos !== 0
        };
    });

    res.json({
        message: resultado.movimentoCriado
            ? 'Saldo do banco de horas ajustado com sucesso!'
            : 'Saldo do banco de horas ja estava atualizado.',
        success: true,
        data: {
            colaboradorId: resultado.colaborador.Id,
            nome: resultado.colaborador.Nome,
            saldoAnteriorMinutos: resultado.saldoAnteriorMinutos,
            saldoAnteriorFormatado: minutesToBalanceLabel(resultado.saldoAnteriorMinutos),
            saldoMinutos: resultado.saldoMinutos,
            saldoFormatado: minutesToBalanceLabel(resultado.saldoMinutos),
            deltaMinutos: resultado.deltaMinutos,
            deltaFormatado: `${resultado.deltaMinutos < 0 ? '-' : '+'}${minutesToDurationLabel(Math.abs(resultado.deltaMinutos))}`,
            movimentoCriado: resultado.movimentoCriado
        }
    });
});

router.post('/recalcular', async (req, res) => {
    const pool = await conectar();

    const resultado = await withTransaction(sql, pool, async (tx) => {
        const warnings = [];
        const colaboradoresResult = await tx.request().query('SELECT * FROM Colaboradores');
        const colaboradoresMap = new Map(colaboradoresResult.recordset.map((item) => [item.Id, item]));

        await tx.request().query('DELETE FROM BancoHorasMovimentos');

        const ausenciasResult = await tx.request().query(`
            SELECT ${AUSENCIA_COLUNAS}
            FROM Ausencias
            ORDER BY DataInicio, Id
        `);

        let movimentosGerados = 0;

        for (const ausencia of ausenciasResult.recordset) {
            const colaborador = colaboradoresMap.get(ausencia.ColaboradorId);

            if (!colaborador) {
                warnings.push(`Ausencia ${ausencia.Id}: colaborador ${ausencia.ColaboradorId} nao encontrado.`);
                continue;
            }

            try {
                const minutosDebito = calculateAusenciaDebitMinutes(ausencia, colaborador);

                if (minutosDebito <= 0) {
                    continue;
                }

                await insertMovimento(tx, {
                    colaboradorId: colaborador.Id,
                    dataReferencia: extractDateString(ausencia.DataInicio),
                    minutos: minutosDebito * -1,
                    origemTipo: 'ausencia',
                    origemId: ausencia.Id,
                    descricao: describeAusenciaMovement(ausencia),
                    observacao: ausencia.Observacao || null
                });

                movimentosGerados += 1;
            } catch (error) {
                warnings.push(`Ausencia ${ausencia.Id}: ${error.message}`);
            }
        }

        const plantoesResult = await tx.request().query(`
            SELECT ${PLANTAO_COLUNAS}
            FROM plantoes
            ORDER BY data_plantao, id
        `);

        for (const row of plantoesResult.recordset) {
            const plantao = serializePlantaoRecord(row);

            // Hora extra e paga em folha e nao gera movimento (mesma regra de
            // syncPlantaoMovements, em routes/plantoes.js). Sem este corte, o
            // recalculo devolvia ao saldo as horas que ja tinham sido pagas.
            if (plantao.tipoCredito === 'extra') {
                continue;
            }

            if (!plantao.horaInicio || !plantao.horaFim) {
                warnings.push(`Plantao ${plantao.id}: horario nao informado, credito ignorado.`);
                continue;
            }

            let minutosCredito = 0;

            try {
                minutosCredito = calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim);
            } catch (error) {
                warnings.push(`Plantao ${plantao.id}: ${error.message}`);
                continue;
            }

            for (const colaboradorId of plantao.colaboradores) {
                if (!colaboradoresMap.has(colaboradorId)) {
                    warnings.push(`Plantao ${plantao.id}: colaborador ${colaboradorId} nao encontrado.`);
                    continue;
                }

                await insertMovimento(tx, {
                    colaboradorId,
                    dataReferencia: plantao.dataISO,
                    minutos: minutosCredito,
                    origemTipo: 'plantao',
                    origemId: plantao.id,
                    descricao: describePlantaoMovement(plantao),
                    observacao: plantao.observacao || null
                });

                movimentosGerados += 1;
            }
        }

        // Cobertura em dia util com destino 'banco' (cobertura-banco.js).
        movimentosGerados += await gravarMovimentosDosTrechos(tx, await carregarTrechosDeDiaUtil(tx));

        return {
            movimentosGerados,
            warnings
        };
    });

    res.json({
        success: true,
        message: 'Banco de horas recalculado com sucesso.',
        ...resultado
    });
});

module.exports = router;

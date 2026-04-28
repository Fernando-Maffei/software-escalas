const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    calculateAusenciaDebitMinutes,
    calculateIntervalMinutes,
    describeAusenciaMovement,
    describePlantaoMovement,
    minutesToBalanceLabel,
    minutesToDurationLabel,
    parseBalanceInputToMinutes
} = require('../utils/bancoHoras');
const {
    describeBancoHorasMissingPieces,
    ensureBancoHorasTable,
    getBancoHorasCapabilities,
    getSchemaInfo
} = require('../utils/schema');
const { withTransaction } = require('../utils/transactions');
const { ensurePositiveInt, extractDateString, normalizeOptionalText } = require('../utils/validation');
const { serializePlantaoRecord } = require('../utils/plantoes');

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

function buildAusenciasSelect(schema) {
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

    if (capabilities.hasAusenciaDesconta) {
        columns.push('DescontaBancoHoras');
    }

    if (capabilities.hasAusenciaObservacao) {
        columns.push('Observacao');
    }

    return columns.join(',\n                ');
}

function buildPlantoesSelect(schema) {
    const capabilities = getBancoHorasCapabilities(schema);
    const columns = [
        'id',
        'data_plantao',
        'colaboradores_ids',
        'criado_em',
        'atualizado_em'
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

router.get('/status', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const capabilities = getBancoHorasCapabilities(schema);
    const missing = describeBancoHorasMissingPieces(schema);

    res.json({
        enabled: capabilities.hasMovimentosTable,
        capabilities,
        missing
    });
});

router.get('/resumo', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    ensureBancoHorasTable(schema);

    const request = pool.request();
    const clauses = [];
    const search = (req.query.search || '').trim();

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

    res.json({
        enabled: true,
        items: result.recordset.map(mapResumoRow)
    });
});

router.get('/colaborador/:id', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    ensureBancoHorasTable(schema);

    const limit = req.query.limit ? Math.min(ensurePositiveInt(req.query.limit, 'Limite'), 200) : 100;

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
        }))
    });
});

router.put('/colaborador/:id/saldo', async (req, res) => {
    const colaboradorId = ensurePositiveInt(req.params.id, 'Colaborador');
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    ensureBancoHorasTable(schema);

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
    const schema = await getSchemaInfo(pool);
    ensureBancoHorasTable(schema);

    const resultado = await withTransaction(sql, pool, async (tx) => {
        const warnings = [];
        const colaboradoresResult = await tx.request().query('SELECT * FROM Colaboradores');
        const colaboradoresMap = new Map(colaboradoresResult.recordset.map((item) => [item.Id, item]));

        await tx.request().query('DELETE FROM BancoHorasMovimentos');

        const ausenciasResult = await tx.request().query(`
            SELECT
                ${buildAusenciasSelect(schema)}
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
            SELECT
                ${buildPlantoesSelect(schema)}
            FROM plantoes
            ORDER BY data_plantao, id
        `);

        for (const row of plantoesResult.recordset) {
            const plantao = serializePlantaoRecord(row);

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

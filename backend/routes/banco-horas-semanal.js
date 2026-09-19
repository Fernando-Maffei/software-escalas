const express = require('express');
const { listCoberturasComoHoraExtra } = require('../services/coberturas');

const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { getSetoresPermitidosRequest, idsPermitidosNumericos } = require('../auth/acesso-setores');
const {
    calculateDailyWorkMinutes,
    calculateIntervalMinutes,
    enumerateBusinessDates,
    normalizeSubtipo,
    parseBalanceInputToMinutes,
    resolveDefaultDescontaBancoHoras
} = require('../services/bancoHoras');
const {
    ensurePositiveInt,
    extractDateString,
    normalizeIsoDate,
    normalizeOptionalText
} = require('../lib/validation');
const { montarRelatorioHorasExtras, serializePlantaoRecord } = require('../services/plantoes');
const { getBancoHorasCapabilities, getSchemaInfo } = require('../db/schema');

const SEMANAS_PADRAO = 8;

// Colunas de plantao usadas nos calculos de credito. tipo_credito so entra
// quando a coluna existe: num banco anterior a migration 2026-09-04 a leitura
// nao pode quebrar — la todo plantao era credito de banco de horas.
function buildPlantaoCreditoColumns(capabilities) {
    const columns = ['id', 'data_plantao', 'colaboradores_ids', 'hora_inicio', 'hora_fim'];

    if (capabilities.hasPlantaoTipoCredito) {
        columns.push('tipo_credito');
    }

    return columns.join(', ');
}

// Custo de uma folga em minutos (8h). Usado na coluna "Sugestao" do Verificar:
// quantos dias de folga cabem nas horas em carteira.
const FOLGA_MINUTOS = 8 * 60;

// Normaliza qualquer data para a segunda-feira da mesma semana (ISO YYYY-MM-DD).
// Usa UTC para nao sofrer deslocamento de fuso ao voltar/avancar dias.
function toMondayISO(dateISO) {
    const normalized = normalizeIsoDate(dateISO, 'Semana');
    const date = new Date(`${normalized}T00:00:00Z`);
    const weekday = date.getUTCDay(); // 0 = domingo ... 6 = sabado
    const shift = weekday === 0 ? -6 : 1 - weekday;
    date.setUTCDate(date.getUTCDate() + shift);
    return date.toISOString().slice(0, 10);
}

function addDaysISO(dateISO, days) {
    const date = new Date(`${dateISO}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function todayMondayISO() {
    return toMondayISO(new Date().toISOString().slice(0, 10));
}

// Formata minutos como relogio HH:MM com sinal apenas quando negativo.
// Aceita totais grandes (ex: 163:37), como na planilha.
function minutosParaRelogio(minutos) {
    const safe = Number.isFinite(Number(minutos)) ? Math.round(Number(minutos)) : 0;
    const sinal = safe < 0 ? '-' : '';
    const total = Math.abs(safe);
    const horas = Math.floor(total / 60);
    const restante = total % 60;
    return `${sinal}${horas}:${String(restante).padStart(2, '0')}`;
}

function formatDateLabelISO(dateISO) {
    const [ano, mes, dia] = dateISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Monta a lista de segundas exibidas: as ultimas N semanas ate a semana atual,
// unidas com qualquer semana que ja tenha lancamento no banco (historico).
function montarSemanas(inicioISO, fimISO, semanasComDados) {
    const semanas = new Set(semanasComDados);
    let cursor = inicioISO;

    while (cursor <= fimISO) {
        semanas.add(cursor);
        cursor = addDaysISO(cursor, 7);
    }

    return [...semanas].sort((a, b) => (a < b ? -1 : 1)); // mais antiga primeiro, recente por ultimo
}

// GET /api/banco-horas-semanal?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Retorna a grade: colaboradores (colunas) x semanas (linhas) com as celulas.
router.get('/', async (req, res) => {
    const pool = await conectar();

    const fimISO = req.query.fim
        ? toMondayISO(req.query.fim)
        : todayMondayISO();
    const inicioISO = req.query.inicio
        ? toMondayISO(req.query.inicio)
        : addDaysISO(fimISO, -7 * (SEMANAS_PADRAO - 1));

    if (inicioISO > fimISO) {
        throw new AppError(400, 'O inicio do periodo deve ser anterior ao fim.');
    }

    // Teto de setor por conta (mesma regra da Escala do Dia): a conta so ve
    // colaboradores dos setores permitidos. Lista vazia = sem restricao.
    const permitidos = await getSetoresPermitidosRequest(pool, req);
    const idsPermitidos = new Set(idsPermitidosNumericos(permitidos));

    const colaboradoresResult = await pool.request()
        .query('SELECT Id, Nome, SetorId FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');

    const colaboradores = idsPermitidos.size
        ? colaboradoresResult.recordset.filter((item) => idsPermitidos.has(Number(item.SetorId)))
        : colaboradoresResult.recordset;

    // Busca todas as celulas do periodo E as semanas historicas fora dele,
    // para que a grade tambem mostre semanas antigas ja lancadas.
    const celulasResult = await pool.request()
        .input('inicio', sql.Date, inicioISO)
        .input('fim', sql.Date, fimISO)
        .query(`
            SELECT ColaboradorId, SemanaSegunda, Minutos, Observacao, Status
            FROM BancoHorasSemanal
            ORDER BY SemanaSegunda DESC
        `);

    const notasResult = await pool.request()
        .query('SELECT SemanaSegunda, Observacao FROM BancoHorasSemanalNota');

    const notasPorSemana = new Map();

    for (const row of notasResult.recordset) {
        const semanaISO = row.SemanaSegunda instanceof Date
            ? row.SemanaSegunda.toISOString().slice(0, 10)
            : String(row.SemanaSegunda).slice(0, 10);

        if (row.Observacao) {
            notasPorSemana.set(semanaISO, row.Observacao);
        }
    }

    const celulasPorSemana = new Map();
    const semanasComDados = new Set();

    for (const row of celulasResult.recordset) {
        const semanaISO = row.SemanaSegunda instanceof Date
            ? row.SemanaSegunda.toISOString().slice(0, 10)
            : String(row.SemanaSegunda).slice(0, 10);

        semanasComDados.add(semanaISO);

        if (!celulasPorSemana.has(semanaISO)) {
            celulasPorSemana.set(semanaISO, new Map());
        }

        celulasPorSemana.get(semanaISO).set(Number(row.ColaboradorId), {
            minutos: Number(row.Minutos),
            formatado: minutosParaRelogio(row.Minutos),
            observacao: row.Observacao || null,
            status: row.Status || 'confirmado'
        });
    }

    for (const semanaISO of notasPorSemana.keys()) {
        semanasComDados.add(semanaISO);
    }

    const semanas = montarSemanas(inicioISO, fimISO, semanasComDados).map((semanaISO) => {
        const celulasDaSemana = celulasPorSemana.get(semanaISO) || new Map();
        const celulas = {};
        let totalMinutos = 0;

        for (const colaborador of colaboradores) {
            const celula = celulasDaSemana.get(colaborador.Id);

            if (celula) {
                celulas[colaborador.Id] = celula;
                totalMinutos += celula.minutos;
            }
        }

        return {
            semanaSegunda: semanaISO,
            label: formatDateLabelISO(semanaISO),
            totalMinutos,
            totalFormatado: minutosParaRelogio(totalMinutos),
            observacao: notasPorSemana.get(semanaISO) || null,
            celulas
        };
    });

    res.json({
        periodo: { inicio: inicioISO, fim: fimISO },
        colaboradores: colaboradores.map((item) => ({
            id: item.Id,
            nome: item.Nome,
            setorId: item.SetorId === null || item.SetorId === undefined ? null : Number(item.SetorId)
        })),
        semanas
    });
});

// PUT /api/banco-horas-semanal/celula
// Body: { colaboradorId, semana, saldo, observacao }
// saldo vazio/null => limpa a celula. Aceita HH:MM, +HH:MM, -HH:MM ou minutos.
router.put('/celula', async (req, res) => {
    const pool = await conectar();

    const colaboradorId = ensurePositiveInt(req.body?.colaboradorId, 'Colaborador');
    const semanaISO = toMondayISO(req.body?.semana);
    const observacao = normalizeOptionalText(req.body?.observacao, 'Observacao', { maxLength: 500 });

    const saldoRaw = req.body?.saldo;
    const saldoVazio = saldoRaw === undefined || saldoRaw === null || String(saldoRaw).trim() === '';

    const colaboradorResult = await pool.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT Id, Nome FROM Colaboradores WHERE Id = @id');

    if (colaboradorResult.recordset.length === 0) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    if (saldoVazio) {
        await pool.request()
            .input('colaboradorId', sql.Int, colaboradorId)
            .input('semana', sql.Date, semanaISO)
            .query(`
                DELETE FROM BancoHorasSemanal
                WHERE ColaboradorId = @colaboradorId AND SemanaSegunda = @semana
            `);

        res.json({
            success: true,
            removido: true,
            colaboradorId,
            semanaSegunda: semanaISO
        });
        return;
    }

    const minutos = parseBalanceInputToMinutes(saldoRaw, 'Saldo da semana');

    // Upsert manual (UPDATE, e INSERT se nao existia) apoiado no indice unico.
    await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('semana', sql.Date, semanaISO)
        .input('minutos', sql.Int, minutos)
        .input('observacao', sql.NVarChar(500), observacao)
        .query(`
            UPDATE BancoHorasSemanal
            SET Minutos = @minutos, Observacao = @observacao, Status = 'confirmado', AtualizadoEm = GETDATE()
            WHERE ColaboradorId = @colaboradorId AND SemanaSegunda = @semana;

            IF @@ROWCOUNT = 0
                INSERT INTO BancoHorasSemanal (ColaboradorId, SemanaSegunda, Minutos, Observacao, Status)
                VALUES (@colaboradorId, @semana, @minutos, @observacao, 'confirmado');
        `);

    res.json({
        success: true,
        removido: false,
        colaboradorId,
        semanaSegunda: semanaISO,
        status: 'confirmado',
        minutos,
        formatado: minutosParaRelogio(minutos),
        observacao
    });
});

// PUT /api/banco-horas-semanal/nota
// Body: { semana, observacao }. Nota (Observacao da planilha) da semana inteira.
// Observacao vazia => remove a nota.
router.put('/nota', async (req, res) => {
    const pool = await conectar();

    const semanaISO = toMondayISO(req.body?.semana);
    const observacao = normalizeOptionalText(req.body?.observacao, 'Observacao', { maxLength: 500 });

    if (observacao === null) {
        await pool.request()
            .input('semana', sql.Date, semanaISO)
            .query('DELETE FROM BancoHorasSemanalNota WHERE SemanaSegunda = @semana');

        res.json({ success: true, removido: true, semanaSegunda: semanaISO });
        return;
    }

    await pool.request()
        .input('semana', sql.Date, semanaISO)
        .input('observacao', sql.NVarChar(500), observacao)
        .query(`
            UPDATE BancoHorasSemanalNota
            SET Observacao = @observacao, AtualizadoEm = GETDATE()
            WHERE SemanaSegunda = @semana;

            IF @@ROWCOUNT = 0
                INSERT INTO BancoHorasSemanalNota (SemanaSegunda, Observacao)
                VALUES (@semana, @observacao);
        `);

    res.json({ success: true, removido: false, semanaSegunda: semanaISO, observacao });
});

// Desconto de uma ausencia dentro da janela [inicioISO, fimISO] (inclusive).
// Espelha a regra de calculateAusenciaDebitMinutes, mas limitado a janela,
// para nao descontar de novo o que ja estava no saldo manual da semana base.
// Retorna { minutos, aviso }.
function calcularDescontoNaJanela(ausencia, colaborador, inicioISO, fimISO) {
    const tipo = String(ausencia.Tipo || '').trim().toLowerCase();
    const subtipo = normalizeSubtipo(ausencia.Subtipo);
    const temExplicito = ausencia.DescontaBancoHoras !== undefined && ausencia.DescontaBancoHoras !== null;
    const desconta = temExplicito
        ? Boolean(ausencia.DescontaBancoHoras)
        : resolveDefaultDescontaBancoHoras(tipo, subtipo);

    if (!desconta || tipo === 'ferias') {
        return { minutos: 0, aviso: null };
    }

    const periodoTipo = String(ausencia.PeriodoTipo || 'dia_inteiro').trim().toLowerCase();

    if (periodoTipo === 'horas') {
        const dataISO = extractDateString(ausencia.DataInicio);

        if (!dataISO || dataISO < inicioISO || dataISO > fimISO) {
            return { minutos: 0, aviso: null };
        }

        try {
            return { minutos: calculateIntervalMinutes(ausencia.HoraInicio, ausencia.HoraFim), aviso: null };
        } catch (error) {
            return { minutos: 0, aviso: `Ausencia ${ausencia.Id}: ${error.message}` };
        }
    }

    const inicioAusencia = extractDateString(ausencia.DataInicio);
    const fimAusencia = extractDateString(ausencia.DataFim);
    const janelaInicio = inicioAusencia > inicioISO ? inicioAusencia : inicioISO;
    const janelaFim = fimAusencia < fimISO ? fimAusencia : fimISO;

    if (!janelaInicio || !janelaFim || janelaInicio > janelaFim) {
        return { minutos: 0, aviso: null };
    }

    let minutosDia = 0;

    try {
        minutosDia = calculateDailyWorkMinutes(colaborador);
    } catch (error) {
        return { minutos: 0, aviso: `Colaborador ${colaborador.Nome}: ${error.message}` };
    }

    // Conta TODOS os dias da janela (inclusive sabado/domingo): a escala agora
    // tem plantonista de fim de semana, entao folga/ausencia em fim de semana
    // tambem desconta.
    const umDia = 24 * 60 * 60 * 1000;
    const dias = Math.floor(
        (new Date(`${janelaFim}T00:00:00Z`) - new Date(`${janelaInicio}T00:00:00Z`)) / umDia
    ) + 1;
    return { minutos: minutosDia * dias, aviso: null };
}

// Credito de plantao para um colaborador na janela [inicioISO, fimISO]:
// para cada plantao em que ele trabalhou no periodo, soma (hora fim - hora inicio).
function calcularCreditoPlantaoNaJanela(plantoes, colaboradorId, inicioISO, fimISO) {
    let minutos = 0;
    const avisos = [];

    for (const plantao of plantoes) {
        const dataISO = plantao.dataISO;

        if (!dataISO || dataISO < inicioISO || dataISO > fimISO) {
            continue;
        }

        if (!(plantao.colaboradores || []).map(Number).includes(Number(colaboradorId))) {
            continue;
        }

        // Hora extra e paga em folha e nao entra no saldo. Creditar aqui fazia
        // a grade semanal e o "em carteira" pagarem a mesma hora duas vezes:
        // uma na folha e outra em folga.
        if (plantao.tipoCredito === 'extra') {
            continue;
        }

        if (!plantao.horaInicio || !plantao.horaFim) {
            avisos.push(`Plantao ${plantao.id}: sem horario, credito ignorado.`);
            continue;
        }

        try {
            minutos += calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim);
        } catch (error) {
            avisos.push(`Plantao ${plantao.id}: ${error.message}`);
        }
    }

    return { minutos, avisos };
}

// GET /api/banco-horas-semanal/verificar?data=YYYY-MM-DD
// Horas em carteira de cada colaborador no dia informado:
// saldo do ultimo lancamento manual ate a data, menos ausencias/folgas
// lancadas entre essa semana base e a data.
router.get('/verificar', async (req, res) => {
    const pool = await conectar();

    const dataISO = req.query.data
        ? normalizeIsoDate(req.query.data, 'Data')
        : new Date().toISOString().slice(0, 10);

    const permitidos = await getSetoresPermitidosRequest(pool, req);
    const idsPermitidos = new Set(idsPermitidosNumericos(permitidos));

    const colaboradoresResult = await pool.request()
        .query('SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');

    const colaboradores = idsPermitidos.size
        ? colaboradoresResult.recordset.filter((item) => idsPermitidos.has(Number(item.SetorId)))
        : colaboradoresResult.recordset;

    const basesResult = await pool.request()
        .input('data', sql.Date, dataISO)
        .query(`
            SELECT b.ColaboradorId, b.SemanaSegunda, b.Minutos
            FROM BancoHorasSemanal b
            INNER JOIN (
                SELECT ColaboradorId, MAX(SemanaSegunda) AS SemanaSegunda
                FROM BancoHorasSemanal
                WHERE SemanaSegunda <= @data
                GROUP BY ColaboradorId
            ) ultima
                ON ultima.ColaboradorId = b.ColaboradorId
               AND ultima.SemanaSegunda = b.SemanaSegunda
        `);

    const basePorColaborador = new Map();

    for (const row of basesResult.recordset) {
        const semanaISO = row.SemanaSegunda instanceof Date
            ? row.SemanaSegunda.toISOString().slice(0, 10)
            : String(row.SemanaSegunda).slice(0, 10);

        basePorColaborador.set(Number(row.ColaboradorId), {
            semanaSegunda: semanaISO,
            minutos: Number(row.Minutos)
        });
    }

    // Piso global para buscar ausencias: a base mais antiga entre os colaboradores.
    const bases = [...basePorColaborador.values()];
    const pisoGlobal = bases.length > 0
        ? bases.map((item) => item.semanaSegunda).sort()[0]
        : dataISO;

    const ausenciasPorColaborador = new Map();

    if (bases.length > 0) {
        const ausenciasResult = await pool.request()
            .input('piso', sql.Date, pisoGlobal)
            .input('data', sql.Date, dataISO)
            .query(`
                SELECT Id, ColaboradorId, Tipo, Subtipo, DescontaBancoHoras,
                       PeriodoTipo, DataInicio, DataFim, HoraInicio, HoraFim
                FROM Ausencias
                WHERE DataInicio <= @data AND DataFim >= @piso
            `);

        for (const ausencia of ausenciasResult.recordset) {
            const colaboradorId = Number(ausencia.ColaboradorId);

            if (!ausenciasPorColaborador.has(colaboradorId)) {
                ausenciasPorColaborador.set(colaboradorId, []);
            }

            ausenciasPorColaborador.get(colaboradorId).push(ausencia);
        }
    }

    // Plantoes da janela (creditos: sabado/domingo trabalhado soma hora).
    let plantoesJanela = [];

    if (bases.length > 0) {
        const colunasPlantao = buildPlantaoCreditoColumns(getBancoHorasCapabilities(await getSchemaInfo(pool)));
        const plantoesResult = await pool.request()
            .input('piso', sql.Date, pisoGlobal)
            .input('data', sql.Date, dataISO)
            .query(`
                SELECT ${colunasPlantao}
                FROM plantoes
                WHERE data_plantao <= @data AND data_plantao >= @piso
            `);

        plantoesJanela = plantoesResult.recordset.map((row) => serializePlantaoRecord(row));
    }

    const avisos = [];

    const itens = colaboradores.map((colaborador) => {
        const base = basePorColaborador.get(colaborador.Id) || null;
        const setorId = colaborador.SetorId === null || colaborador.SetorId === undefined
            ? null
            : Number(colaborador.SetorId);

        if (!base) {
            return {
                colaboradorId: colaborador.Id,
                nome: colaborador.Nome,
                setorId,
                semBase: true,
                semanaBase: null,
                baseMinutos: null,
                baseFormatado: null,
                plantaoMinutos: 0,
                plantaoFormatado: minutosParaRelogio(0),
                descontoMinutos: 0,
                descontoFormatado: minutosParaRelogio(0),
                resultadoMinutos: null,
                resultadoFormatado: null,
                sugestaoDias: null
            };
        }

        const ausencias = ausenciasPorColaborador.get(colaborador.Id) || [];
        let descontoMinutos = 0;

        for (const ausencia of ausencias) {
            const { minutos, aviso } = calcularDescontoNaJanela(
                ausencia,
                colaborador,
                base.semanaSegunda,
                dataISO
            );

            descontoMinutos += minutos;

            if (aviso) {
                avisos.push(aviso);
            }
        }

        const credito = calcularCreditoPlantaoNaJanela(
            plantoesJanela,
            colaborador.Id,
            base.semanaSegunda,
            dataISO
        );

        const plantaoMinutos = credito.minutos;
        credito.avisos.forEach((aviso) => avisos.push(aviso));

        const resultadoMinutos = base.minutos + plantaoMinutos - descontoMinutos;
        const sugestaoDias = resultadoMinutos > 0 ? Math.floor(resultadoMinutos / FOLGA_MINUTOS) : 0;

        return {
            colaboradorId: colaborador.Id,
            nome: colaborador.Nome,
            setorId,
            semBase: false,
            semanaBase: base.semanaSegunda,
            baseMinutos: base.minutos,
            baseFormatado: minutosParaRelogio(base.minutos),
            plantaoMinutos,
            plantaoFormatado: minutosParaRelogio(plantaoMinutos),
            descontoMinutos,
            descontoFormatado: minutosParaRelogio(descontoMinutos),
            resultadoMinutos,
            resultadoFormatado: minutosParaRelogio(resultadoMinutos),
            sugestaoDias
        };
    });

    res.json({
        data: dataISO,
        itens,
        avisos
    });
});

// GET /api/banco-horas-semanal/saldos?data=YYYY-MM-DD
// Saldo "atual" de cada colaborador = ultimo lancamento manual da grade
// (semana <= data). Usado no cadastro do colaborador para bater com a grade.
router.get('/saldos', async (req, res) => {
    const pool = await conectar();

    const dataISO = req.query.data
        ? normalizeIsoDate(req.query.data, 'Data')
        : new Date().toISOString().slice(0, 10);

    const permitidos = await getSetoresPermitidosRequest(pool, req);
    const idsPermitidos = new Set(idsPermitidosNumericos(permitidos));

    const result = await pool.request()
        .input('data', sql.Date, dataISO)
        .query(`
            SELECT b.ColaboradorId, b.SemanaSegunda, b.Minutos, c.SetorId
            FROM BancoHorasSemanal b
            INNER JOIN (
                SELECT ColaboradorId, MAX(SemanaSegunda) AS SemanaSegunda
                FROM BancoHorasSemanal
                WHERE SemanaSegunda <= @data
                GROUP BY ColaboradorId
            ) ultima
                ON ultima.ColaboradorId = b.ColaboradorId
               AND ultima.SemanaSegunda = b.SemanaSegunda
            INNER JOIN Colaboradores c ON c.Id = b.ColaboradorId
        `);

    const saldos = result.recordset
        .filter((row) => !idsPermitidos.size || idsPermitidos.has(Number(row.SetorId)))
        .map((row) => ({
            colaboradorId: Number(row.ColaboradorId),
            semanaSegunda: row.SemanaSegunda instanceof Date
                ? row.SemanaSegunda.toISOString().slice(0, 10)
                : String(row.SemanaSegunda).slice(0, 10),
            minutos: Number(row.Minutos),
            formatado: minutosParaRelogio(row.Minutos)
        }));

    res.json({ data: dataISO, saldos });
});

// POST /api/banco-horas-semanal/gerar-semana
// Body: { semana, aplicar }. Calcula o lancamento proposto de cada colaborador
// para a semana alvo = saldo da semana anterior + plantoes − folgas/ausencias
// da janela [semana anterior, alvo]. aplicar=false => so preview (para a modal).
// aplicar=true => grava os valores como 'auto' (amarelo), sem tocar em celula
// ja 'confirmado'.
router.post('/gerar-semana', async (req, res) => {
    const pool = await conectar();

    const alvoISO = toMondayISO(req.body?.semana);
    const aplicar = req.body?.aplicar === true;

    const permitidos = await getSetoresPermitidosRequest(pool, req);
    const idsPermitidos = new Set(idsPermitidosNumericos(permitidos));

    const colaboradoresResult = await pool.request()
        .query('SELECT * FROM Colaboradores WHERE Ativo = 1 ORDER BY Nome');

    const colaboradores = idsPermitidos.size
        ? colaboradoresResult.recordset.filter((item) => idsPermitidos.has(Number(item.SetorId)))
        : colaboradoresResult.recordset;

    // Semana anterior = ultimo lancamento de cada colaborador antes do alvo.
    const anterioresResult = await pool.request()
        .input('alvo', sql.Date, alvoISO)
        .query(`
            SELECT b.ColaboradorId, b.SemanaSegunda, b.Minutos
            FROM BancoHorasSemanal b
            INNER JOIN (
                SELECT ColaboradorId, MAX(SemanaSegunda) AS SemanaSegunda
                FROM BancoHorasSemanal
                WHERE SemanaSegunda < @alvo
                GROUP BY ColaboradorId
            ) ultima
                ON ultima.ColaboradorId = b.ColaboradorId
               AND ultima.SemanaSegunda = b.SemanaSegunda
        `);

    const anteriorPorColaborador = new Map();
    for (const row of anterioresResult.recordset) {
        const semanaISO = row.SemanaSegunda instanceof Date
            ? row.SemanaSegunda.toISOString().slice(0, 10)
            : String(row.SemanaSegunda).slice(0, 10);
        anteriorPorColaborador.set(Number(row.ColaboradorId), {
            semanaSegunda: semanaISO,
            minutos: Number(row.Minutos)
        });
    }

    // Status ja existente na semana alvo (para nao sobrescrever confirmado).
    const alvoResult = await pool.request()
        .input('alvo', sql.Date, alvoISO)
        .query('SELECT ColaboradorId, Status FROM BancoHorasSemanal WHERE SemanaSegunda = @alvo');
    const statusAlvo = new Map(alvoResult.recordset.map((row) => [Number(row.ColaboradorId), row.Status]));

    const anteriores = [...anteriorPorColaborador.values()];
    const pisoGlobal = anteriores.length > 0
        ? anteriores.map((item) => item.semanaSegunda).sort()[0]
        : alvoISO;

    let plantoesJanela = [];
    const ausenciasPorColaborador = new Map();

    if (anteriores.length > 0) {
        const ausenciasResult = await pool.request()
            .input('piso', sql.Date, pisoGlobal)
            .input('alvo', sql.Date, alvoISO)
            .query(`
                SELECT Id, ColaboradorId, Tipo, Subtipo, DescontaBancoHoras,
                       PeriodoTipo, DataInicio, DataFim, HoraInicio, HoraFim
                FROM Ausencias
                WHERE DataInicio <= @alvo AND DataFim >= @piso
            `);
        for (const ausencia of ausenciasResult.recordset) {
            const cid = Number(ausencia.ColaboradorId);
            if (!ausenciasPorColaborador.has(cid)) {
                ausenciasPorColaborador.set(cid, []);
            }
            ausenciasPorColaborador.get(cid).push(ausencia);
        }

        const colunasPlantao = buildPlantaoCreditoColumns(getBancoHorasCapabilities(await getSchemaInfo(pool)));
        const plantoesResult = await pool.request()
            .input('piso', sql.Date, pisoGlobal)
            .input('alvo', sql.Date, alvoISO)
            .query(`
                SELECT ${colunasPlantao}
                FROM plantoes
                WHERE data_plantao <= @alvo AND data_plantao >= @piso
            `);
        plantoesJanela = plantoesResult.recordset.map((row) => serializePlantaoRecord(row));
    }

    const avisos = [];

    const itens = colaboradores.map((colaborador) => {
        const anterior = anteriorPorColaborador.get(colaborador.Id) || null;

        if (!anterior) {
            return {
                colaboradorId: colaborador.Id,
                nome: colaborador.Nome,
                semBase: true,
                jaConfirmado: statusAlvo.get(colaborador.Id) === 'confirmado'
            };
        }

        const credito = calcularCreditoPlantaoNaJanela(plantoesJanela, colaborador.Id, anterior.semanaSegunda, alvoISO);
        credito.avisos.forEach((aviso) => avisos.push(aviso));

        let descontoMinutos = 0;
        for (const ausencia of (ausenciasPorColaborador.get(colaborador.Id) || [])) {
            const { minutos, aviso } = calcularDescontoNaJanela(ausencia, colaborador, anterior.semanaSegunda, alvoISO);
            descontoMinutos += minutos;
            if (aviso) {
                avisos.push(aviso);
            }
        }

        const propostoMinutos = anterior.minutos + credito.minutos - descontoMinutos;

        return {
            colaboradorId: colaborador.Id,
            nome: colaborador.Nome,
            semBase: false,
            semanaAnterior: anterior.semanaSegunda,
            anteriorMinutos: anterior.minutos,
            anteriorFormatado: minutosParaRelogio(anterior.minutos),
            plantaoMinutos: credito.minutos,
            plantaoFormatado: minutosParaRelogio(credito.minutos),
            descontoMinutos,
            descontoFormatado: minutosParaRelogio(descontoMinutos),
            propostoMinutos,
            propostoFormatado: minutosParaRelogio(propostoMinutos),
            jaConfirmado: statusAlvo.get(colaborador.Id) === 'confirmado'
        };
    });

    let gravados = 0;

    if (aplicar) {
        for (const item of itens) {
            if (item.semBase || item.jaConfirmado) {
                continue;
            }
            await pool.request()
                .input('colaboradorId', sql.Int, item.colaboradorId)
                .input('semana', sql.Date, alvoISO)
                .input('minutos', sql.Int, item.propostoMinutos)
                .query(`
                    UPDATE BancoHorasSemanal
                    SET Minutos = @minutos, Status = 'auto', AtualizadoEm = GETDATE()
                    WHERE ColaboradorId = @colaboradorId AND SemanaSegunda = @semana AND Status <> 'confirmado';

                    IF @@ROWCOUNT = 0 AND NOT EXISTS (
                        SELECT 1 FROM BancoHorasSemanal
                        WHERE ColaboradorId = @colaboradorId AND SemanaSegunda = @semana
                    )
                        INSERT INTO BancoHorasSemanal (ColaboradorId, SemanaSegunda, Minutos, Status)
                        VALUES (@colaboradorId, @semana, @minutos, 'auto');
                `);
            gravados += 1;
        }
    }

    res.json({
        semana: alvoISO,
        aplicado: aplicar,
        gravados,
        itens,
        avisos
    });
});

// PUT /api/banco-horas-semanal/confirmar-semana
// Body: { semana }. Marca como 'confirmado' (verde) todos os lancamentos 'auto'
// da semana.
router.put('/confirmar-semana', async (req, res) => {
    const pool = await conectar();
    const semanaISO = toMondayISO(req.body?.semana);

    const resultado = await pool.request()
        .input('semana', sql.Date, semanaISO)
        .query(`
            UPDATE BancoHorasSemanal
            SET Status = 'confirmado', AtualizadoEm = GETDATE()
            WHERE SemanaSegunda = @semana AND Status = 'auto';
            SELECT @@ROWCOUNT AS confirmados;
        `);

    res.json({
        success: true,
        semanaSegunda: semanaISO,
        confirmados: resultado.recordset[0]?.confirmados || 0
    });
});

// DELETE /api/banco-horas-semanal/semana/:semana
// Remove a linha inteira da semana (todos os colaboradores) e a observacao dela.
// Usado quando a semana foi lancada errada.
router.delete('/semana/:semana', async (req, res) => {
    const pool = await conectar();
    const semanaISO = toMondayISO(req.params.semana);

    const resultado = await pool.request()
        .input('semana', sql.Date, semanaISO)
        .query(`
            DELETE FROM BancoHorasSemanal WHERE SemanaSegunda = @semana;
            SELECT @@ROWCOUNT AS removidos;
        `);

    await pool.request()
        .input('semana', sql.Date, semanaISO)
        .query('DELETE FROM BancoHorasSemanalNota WHERE SemanaSegunda = @semana');

    res.json({
        success: true,
        semanaSegunda: semanaISO,
        removidos: resultado.recordset[0]?.removidos || 0
    });
});

// GET /api/banco-horas-semanal/horas-extras?inicio=&fim=&colaboradorId=
// Relatorio de horas extras do periodo: os plantoes lancados com destino
// 'extra' agrupados por colaborador. Essas horas sao pagas em folha e por isso
// nao entram na grade semanal nem no saldo — sem este relatorio nao existia
// nenhum lugar que somasse quanto cada um fez de hora extra no mes.
router.get('/horas-extras', async (req, res) => {
    const pool = await conectar();
    const schema = await getSchemaInfo(pool);
    const capabilities = getBancoHorasCapabilities(schema);

    const hoje = new Date().toISOString().slice(0, 10);
    const inicioISO = req.query.inicio
        ? normalizeIsoDate(req.query.inicio, 'Data inicial')
        : `${hoje.slice(0, 7)}-01`;
    const fimISO = req.query.fim
        ? normalizeIsoDate(req.query.fim, 'Data final')
        : hoje;

    if (inicioISO > fimISO) {
        throw new AppError(400, 'O inicio do periodo deve ser anterior ao fim.');
    }

    const colaboradorId = req.query.colaboradorId
        ? ensurePositiveInt(req.query.colaboradorId, 'Colaborador')
        : null;

    // Banco sem a coluna tipo_credito: nao ha como saber o que e extra, e
    // chutar 'banco' para tudo devolveria um relatorio vazio que parece certo.
    if (!capabilities.hasPlantaoTipoCredito) {
        res.json({
            disponivel: false,
            mensagem: 'Hora extra ainda nao esta disponivel: aplique a migration 2026-09-04-plantao-lancamentos.sql.',
            inicio: inicioISO,
            fim: fimISO,
            itens: [],
            totalMinutos: 0,
            totalFormatado: minutosParaRelogio(0),
            totalColaboradores: 0,
            totalDias: 0,
            avisos: []
        });
        return;
    }

    const permitidos = await getSetoresPermitidosRequest(pool, req);
    const idsPermitidos = new Set(idsPermitidosNumericos(permitidos));

    // Sem filtro de Ativo: quem foi desligado depois de fazer hora extra no
    // periodo continua tendo direito ao pagamento, entao precisa aparecer.
    const colaboradoresResult = await pool.request()
        .query('SELECT Id, Nome, SetorId FROM Colaboradores ORDER BY Nome');

    const colaboradores = idsPermitidos.size
        ? colaboradoresResult.recordset.filter((item) => idsPermitidos.has(Number(item.SetorId)))
        : colaboradoresResult.recordset;

    const plantoesResult = await pool.request()
        .input('inicio', sql.Date, inicioISO)
        .input('fim', sql.Date, fimISO)
        .query(`
            SELECT ${buildPlantaoCreditoColumns(capabilities)}, tipo_plantao, observacao
            FROM plantoes
            WHERE LOWER(tipo_credito) = 'extra'
              AND data_plantao >= @inicio
              AND data_plantao <= @fim
            ORDER BY data_plantao DESC, id DESC
        `);

    // PROTOTIPO: coberturas marcadas como hora extra entram no mesmo relatorio.
    const coberturasExtra = await listCoberturasComoHoraExtra(pool, schema, { inicio: inicioISO, fim: fimISO });

    const relatorio = montarRelatorioHorasExtras(
        plantoesResult.recordset.map((row) => serializePlantaoRecord(row)).concat(coberturasExtra),
        colaboradores,
        { inicioISO, fimISO, colaboradorId }
    );

    res.json({
        disponivel: true,
        inicio: inicioISO,
        fim: fimISO,
        itens: relatorio.itens.map((item) => ({
            ...item,
            totalFormatado: minutosParaRelogio(item.totalMinutos),
            plantoes: item.plantoes.map((plantao) => ({
                ...plantao,
                dataFormatada: formatDateLabelISO(plantao.dataISO),
                minutosFormatado: minutosParaRelogio(plantao.minutos)
            }))
        })),
        totalMinutos: relatorio.totalMinutos,
        totalFormatado: minutosParaRelogio(relatorio.totalMinutos),
        totalColaboradores: relatorio.totalColaboradores,
        totalDias: relatorio.totalDias,
        avisos: relatorio.avisos
    });
});

module.exports = router;

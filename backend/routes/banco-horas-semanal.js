const express = require('express');
const router = express.Router();

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const {
    colaboradoresVisiveis,
    exigirColaboradorVisivel,
    getSetoresPermitidosRequest,
    idsPermitidosNumericos
} = require('../auth/acesso-setores');
const { parseBalanceInputToMinutes } = require('../services/bancoHoras');
const {
    ensurePositiveInt,
    hojeISO,
    normalizeIsoDate,
    normalizeOptionalText
} = require('../lib/validation');
const { montarRelatorioHorasExtras, serializePlantaoRecord } = require('../services/plantoes');
const { withTransaction } = require('../db/transactions');
const { carregarTrechosDeDiaUtil, trechoComoLancamento } = require('../services/cobertura-dia-util');
const {
    PLANTAO_COLUNAS_CREDITO,
    calcularSaldo,
    carregarBases,
    carregarMovimentacao,
    fimDaJanelaSemanal,
    listarColaboradoresAtivosVisiveis,
    minutosParaRelogio,
    semanaISO
} = require('../services/horas-em-carteira');

const SEMANAS_PADRAO = 8;

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
    return toMondayISO(hojeISO());
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

    // Le a tabela INTEIRA de proposito, sem filtrar pelo periodo: a grade mostra
    // as semanas do periodo e tambem toda semana historica ja lancada fora dele
    // (montarSemanas junta as duas). Sao poucas linhas por semana; se um dia
    // pesar, o corte entra aqui e em montarSemanas juntos.
    const celulasResult = await pool.request()
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

// GET /api/banco-horas-semanal/verificar?data=YYYY-MM-DD
// Horas em carteira de cada colaborador no dia informado:
// saldo do ultimo lancamento manual ate a data, menos ausencias/folgas
// lancadas entre essa semana base e a data (ver services/horas-em-carteira.js).
router.get('/verificar', async (req, res) => {
    const pool = await conectar();

    const dataISO = req.query.data
        ? normalizeIsoDate(req.query.data, 'Data')
        : hojeISO();

    const colaboradores = await listarColaboradoresAtivosVisiveis(pool, req);
    const bases = await carregarBases(pool, dataISO, { ateInclusive: true });
    const movimentacao = await carregarMovimentacao(pool, bases, dataISO);
    const avisos = [];

    const itens = colaboradores.map((colaborador) => {
        const base = bases.get(colaborador.Id) || null;
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

        const saldo = calcularSaldo(colaborador, base, movimentacao, dataISO, avisos);

        return {
            colaboradorId: colaborador.Id,
            nome: colaborador.Nome,
            setorId,
            semBase: false,
            semanaBase: base.semanaSegunda,
            baseMinutos: base.minutos,
            baseFormatado: minutosParaRelogio(base.minutos),
            plantaoMinutos: saldo.plantaoMinutos,
            plantaoFormatado: minutosParaRelogio(saldo.plantaoMinutos),
            descontoMinutos: saldo.descontoMinutos,
            descontoFormatado: minutosParaRelogio(saldo.descontoMinutos),
            resultadoMinutos: saldo.resultadoMinutos,
            resultadoFormatado: minutosParaRelogio(saldo.resultadoMinutos),
            detalhes: saldo.detalhes,
            sugestaoDias: saldo.resultadoMinutos > 0 ? Math.floor(saldo.resultadoMinutos / FOLGA_MINUTOS) : 0
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
        : hojeISO();

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
            semanaSegunda: semanaISO(row.SemanaSegunda),
            minutos: Number(row.Minutos),
            formatado: minutosParaRelogio(row.Minutos)
        }));

    res.json({ data: dataISO, saldos });
});

// POST /api/banco-horas-semanal/gerar-semana
// Body: { semana, aplicar }. Calcula o lancamento proposto de cada colaborador
// para a semana alvo = saldo da semana anterior + plantoes − folgas/ausencias
// de segunda a domingo: [semana anterior, vespera do alvo]. O que cai na
// propria segunda alvo entra so na semana seguinte (fimDaJanelaSemanal).
// aplicar=false => so preview (para a modal).
// aplicar=true => grava os valores como 'auto' (amarelo), sem tocar em celula
// ja 'confirmado'.
router.post('/gerar-semana', async (req, res) => {
    const pool = await conectar();

    const alvoISO = toMondayISO(req.body?.semana);
    const fimJanelaISO = fimDaJanelaSemanal(alvoISO);
    const aplicar = req.body?.aplicar === true;

    const colaboradores = await listarColaboradoresAtivosVisiveis(pool, req);
    // Semana anterior = ultimo lancamento de cada colaborador antes do alvo.
    const anteriores = await carregarBases(pool, alvoISO, { ateInclusive: false });

    // Status ja existente na semana alvo (para nao sobrescrever confirmado).
    const alvoResult = await pool.request()
        .input('alvo', sql.Date, alvoISO)
        .query('SELECT ColaboradorId, Status FROM BancoHorasSemanal WHERE SemanaSegunda = @alvo');
    const statusAlvo = new Map(alvoResult.recordset.map((row) => [Number(row.ColaboradorId), row.Status]));

    const movimentacao = await carregarMovimentacao(pool, anteriores, fimJanelaISO);
    const avisos = [];

    const itens = colaboradores.map((colaborador) => {
        const anterior = anteriores.get(colaborador.Id) || null;
        const jaConfirmado = statusAlvo.get(colaborador.Id) === 'confirmado';

        if (!anterior) {
            return {
                colaboradorId: colaborador.Id,
                nome: colaborador.Nome,
                semBase: true,
                jaConfirmado
            };
        }

        const saldo = calcularSaldo(colaborador, anterior, movimentacao, fimJanelaISO, avisos);

        return {
            colaboradorId: colaborador.Id,
            nome: colaborador.Nome,
            semBase: false,
            semanaAnterior: anterior.semanaSegunda,
            anteriorMinutos: anterior.minutos,
            anteriorFormatado: minutosParaRelogio(anterior.minutos),
            plantaoMinutos: saldo.plantaoMinutos,
            plantaoFormatado: minutosParaRelogio(saldo.plantaoMinutos),
            descontoMinutos: saldo.descontoMinutos,
            descontoFormatado: minutosParaRelogio(saldo.descontoMinutos),
            propostoMinutos: saldo.resultadoMinutos,
            propostoFormatado: minutosParaRelogio(saldo.resultadoMinutos),
            detalhes: saldo.detalhes,
            jaConfirmado
        };
    });

    let gravados = 0;

    if (aplicar) {
        // Uma transacao: ou a semana inteira e proposta, ou nada muda.
        gravados = await withTransaction(sql, pool, async (tx) => {
            let total = 0;

            for (const item of itens) {
                if (item.semBase || item.jaConfirmado) {
                    continue;
                }

                await tx.request()
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
                total += 1;
            }

            return total;
        });
    }

    res.json({
        semana: alvoISO,
        aplicado: aplicar,
        gravados,
        itens,
        avisos
    });
});

// GET /api/banco-horas-semanal/detalhe?colaboradorId=&semana=
// O "i" de uma celula da grade: refaz a conta do Gerar semana so para essa
// pessoa e essa semana (saldo anterior + plantoes − descontos, de segunda a
// domingo) e devolve cada lancamento com a data, junto do valor gravado na
// celula. Quando os dois diferem, a celula foi ajustada a mao.
router.get('/detalhe', async (req, res) => {
    const pool = await conectar();

    const colaboradorId = ensurePositiveInt(req.query.colaboradorId, 'Colaborador');
    const alvoISO = toMondayISO(req.query.semana);
    exigirColaboradorVisivel(await colaboradoresVisiveis(pool, req), colaboradorId);

    const colaboradorResult = await pool.request()
        .input('id', sql.Int, colaboradorId)
        .query('SELECT * FROM Colaboradores WHERE Id = @id');
    const colaborador = colaboradorResult.recordset[0];

    if (!colaborador) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }

    const celulaResult = await pool.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('semana', sql.Date, alvoISO)
        .query(`
            SELECT Minutos, Status FROM BancoHorasSemanal
            WHERE ColaboradorId = @colaboradorId AND SemanaSegunda = @semana
        `);
    const celula = celulaResult.recordset[0];
    const lancado = celula
        ? { minutos: Number(celula.Minutos), formatado: minutosParaRelogio(celula.Minutos), status: celula.Status || 'confirmado' }
        : null;

    const todas = await carregarBases(pool, alvoISO, { ateInclusive: false });
    const anterior = todas.get(colaborador.Id) || null;
    const resposta = { colaboradorId, nome: colaborador.Nome, semana: alvoISO, lancado };

    if (!anterior) {
        res.json({ ...resposta, semBase: true, avisos: [] });
        return;
    }

    const fimJanelaISO = fimDaJanelaSemanal(alvoISO);
    const movimentacao = await carregarMovimentacao(pool, new Map([[colaborador.Id, anterior]]), fimJanelaISO);
    const avisos = [];
    const saldo = calcularSaldo(colaborador, anterior, movimentacao, fimJanelaISO, avisos);

    res.json({
        ...resposta,
        semBase: false,
        semanaAnterior: anterior.semanaSegunda,
        anteriorMinutos: anterior.minutos,
        anteriorFormatado: minutosParaRelogio(anterior.minutos),
        plantaoMinutos: saldo.plantaoMinutos,
        plantaoFormatado: minutosParaRelogio(saldo.plantaoMinutos),
        descontoMinutos: saldo.descontoMinutos,
        descontoFormatado: minutosParaRelogio(saldo.descontoMinutos),
        calculadoMinutos: saldo.resultadoMinutos,
        calculadoFormatado: minutosParaRelogio(saldo.resultadoMinutos),
        detalhes: saldo.detalhes,
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
// Relatorio de horas extras do periodo: os plantoes (e as coberturas de dia
// util) lancados com destino 'extra' agrupados por colaborador. Essas horas sao pagas em folha e por isso
// nao entram na grade semanal nem no saldo — sem este relatorio nao existia
// nenhum lugar que somasse quanto cada um fez de hora extra no mes.
router.get('/horas-extras', async (req, res) => {
    const pool = await conectar();

    const hoje = hojeISO();
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
            SELECT ${PLANTAO_COLUNAS_CREDITO}, tipo_plantao, observacao
            FROM plantoes
            WHERE LOWER(tipo_credito) = 'extra'
              AND data_plantao >= @inicio
              AND data_plantao <= @fim
            ORDER BY data_plantao DESC, id DESC
        `);

    // Cobertura de dia util paga como hora extra entra no mesmo relatorio.
    const coberturas = await carregarTrechosDeDiaUtil(pool, { dataInicio: inicioISO, dataFim: fimISO });
    const relatorio = montarRelatorioHorasExtras(
        [
            ...plantoesResult.recordset.map((row) => serializePlantaoRecord(row)),
            ...coberturas.map(trechoComoLancamento)
        ],
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

// Tipo de Escala: o molde do padrao semanal (5x2, plantonista sab-qua, ...).
//
// Este servico NAO participa da geracao da escala. Ele so guarda o molde e
// sabe aplica-lo num colaborador, e aplicar significa escrever em
// ColaboradorJornadaSemanal — que continua sendo a unica fonte que
// ensureEscalaBaseForPeriod le. Isso e deliberado: o gerador nao precisou
// mudar nada para o plantonista funcionar, e um colaborador pode divergir do
// tipo num dia sem quebrar nada, porque o vinculo e ponto de partida, nao
// amarra.
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { replaceColaboradorJornadaSemanal } = require('./jornada-semanal');
const {
    ensurePositiveInt,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('../lib/validation');

const DIAS_SEMANA_VALIDOS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

// 'dias' ja existe no CHECK do banco para o dia em que 12x36 entrar, mas o
// codigo so trata 'semanal'. Aceitar aqui um ciclo que ninguem sabe gerar
// daria um tipo que aplica errado, em silencio.
const CICLOS_SUPORTADOS = Object.freeze(['semanal']);

function coerceBoolean(value) {
    return value === true || value === 1;
}

function serializeTipoEscalaDia(row) {
    return {
        diaSemana: Number(row.DiaSemana ?? row.diaSemana ?? 0),
        trabalha: coerceBoolean(row.Trabalha ?? row.trabalha),
        trabalhoInicio: extractTimeString(row.TrabalhoInicio ?? row.trabalhoInicio),
        trabalhoFim: extractTimeString(row.TrabalhoFim ?? row.trabalhoFim),
        almocoInicio: extractTimeString(row.AlmocoInicio ?? row.almocoInicio),
        almocoFim: extractTimeString(row.AlmocoFim ?? row.almocoFim)
    };
}

function serializeTipoEscala(row, dias = []) {
    const domingos = row.DomingosFolgaCada ?? row.domingosFolgaCada;

    return {
        id: Number(row.Id ?? row.id ?? 0) || null,
        nome: row.Nome ?? row.nome ?? null,
        cicloTipo: String(row.CicloTipo ?? row.cicloTipo ?? 'semanal').trim().toLowerCase(),
        domingosFolgaCada: domingos === null || domingos === undefined ? null : Number(domingos),
        exigeReposicao: coerceBoolean(row.ExigeReposicao ?? row.exigeReposicao),
        ativo: coerceBoolean(row.Ativo ?? row.ativo),
        ordem: Number(row.Ordem ?? row.ordem ?? 0) || 0,
        observacao: row.Observacao ?? row.observacao ?? null,
        criadoEm: row.CriadoEm ?? row.criadoEm ?? null,
        atualizadoEm: row.AtualizadoEm ?? row.atualizadoEm ?? null,
        dias: dias.map(serializeTipoEscalaDia).sort((a, b) => a.diaSemana - b.diaSemana)
    };
}

function normalizeDiaSemana(value, fieldName = 'Dia da semana') {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || !DIAS_SEMANA_VALIDOS.includes(parsed)) {
        throw new AppError(400, `${fieldName} invalido. Use valores de 0 (domingo) a 6 (sabado).`);
    }

    return parsed;
}

// Devolve SEMPRE os sete dias: o molde e um padrao semanal completo, entao um
// dia que o payload omitiu e um dia de folga, nao um dia indefinido.
function normalizeDiasPayload(rawValue) {
    const origem = Array.isArray(rawValue) ? rawValue : [];
    const porDia = new Map();

    origem.forEach((item, indice) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new AppError(400, `Dia invalido na posicao ${indice + 1}.`);
        }

        const diaSemana = normalizeDiaSemana(item.diaSemana ?? item.DiaSemana, `Dia da semana (${indice + 1})`);

        if (porDia.has(diaSemana)) {
            throw new AppError(400, `O dia da semana ${diaSemana} aparece duas vezes no tipo de escala.`);
        }

        const trabalha = normalizeBoolean(item.trabalha ?? item.Trabalha, 'Trabalha', { defaultValue: false });
        const trabalhoInicio = normalizeNullableTime(item.trabalhoInicio ?? item.TrabalhoInicio, 'Inicio do trabalho');
        const trabalhoFim = normalizeNullableTime(item.trabalhoFim ?? item.TrabalhoFim, 'Fim do trabalho');
        const almocoInicio = normalizeNullableTime(item.almocoInicio ?? item.AlmocoInicio, 'Inicio do almoco');
        const almocoFim = normalizeNullableTime(item.almocoFim ?? item.AlmocoFim, 'Fim do almoco');

        validateWorkSchedule({ trabalhoInicio, trabalhoFim, almocoInicio, almocoFim });

        if (trabalha && (!trabalhoInicio || !trabalhoFim)) {
            throw new AppError(400, `Informe inicio e fim do trabalho para o dia ${diaSemana}.`);
        }

        porDia.set(diaSemana, {
            diaSemana,
            trabalha,
            // Dia de folga nao guarda horario: se guardasse, ligar o dia de
            // novo na tela traria horario velho sem ninguem ter digitado.
            trabalhoInicio: trabalha ? trabalhoInicio : null,
            trabalhoFim: trabalha ? trabalhoFim : null,
            almocoInicio: trabalha ? almocoInicio : null,
            almocoFim: trabalha ? almocoFim : null
        });
    });

    return DIAS_SEMANA_VALIDOS.map((diaSemana) => porDia.get(diaSemana) || {
        diaSemana,
        trabalha: false,
        trabalhoInicio: null,
        trabalhoFim: null,
        almocoInicio: null,
        almocoFim: null
    });
}

function normalizeDomingosFolgaCada(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return ensurePositiveInt(value, 'Domingos de folga a cada');
}

function normalizeTipoEscalaPayload(body = {}, fallback = {}) {
    const nome = normalizeOptionalText(
        body.nome !== undefined ? body.nome : fallback.nome,
        'Nome do tipo de escala',
        { maxLength: 120 }
    );

    if (!nome) {
        throw new AppError(400, 'Nome do tipo de escala e obrigatorio.');
    }

    const cicloTipo = normalizeEnum(
        body.cicloTipo !== undefined ? body.cicloTipo : (fallback.cicloTipo || 'semanal'),
        'Tipo de ciclo',
        CICLOS_SUPORTADOS,
        { defaultValue: 'semanal' }
    );

    const dias = normalizeDiasPayload(
        body.dias !== undefined ? body.dias : fallback.dias
    );

    if (!dias.some((dia) => dia.trabalha)) {
        throw new AppError(400, 'O tipo de escala precisa ter pelo menos um dia de trabalho.');
    }

    return {
        nome,
        cicloTipo,
        domingosFolgaCada: normalizeDomingosFolgaCada(
            body.domingosFolgaCada !== undefined ? body.domingosFolgaCada : fallback.domingosFolgaCada
        ),
        exigeReposicao: normalizeBoolean(
            body.exigeReposicao !== undefined ? body.exigeReposicao : fallback.exigeReposicao,
            'Exige reposicao',
            { defaultValue: false }
        ),
        ativo: normalizeBoolean(
            body.ativo !== undefined ? body.ativo : fallback.ativo,
            'Status ativo',
            { defaultValue: true }
        ),
        observacao: normalizeOptionalText(
            body.observacao !== undefined ? body.observacao : fallback.observacao,
            'Observacao',
            { maxLength: 500 }
        ),
        dias
    };
}

async function listTipoEscalaDias(poolOrTx, tipoEscalaId = null) {
    const request = poolOrTx.request();
    let filtro = '';

    if (tipoEscalaId) {
        request.input('tipoEscalaId', sql.Int, ensurePositiveInt(tipoEscalaId, 'Tipo de escala'));
        filtro = 'WHERE TipoEscalaId = @tipoEscalaId';
    }

    const result = await request.query(`
        SELECT TipoEscalaId, DiaSemana, Trabalha, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim
        FROM TipoEscalaDia
        ${filtro}
        ORDER BY TipoEscalaId, DiaSemana
    `);

    return result.recordset;
}

async function listTiposEscala(poolOrTx, options = {}) {
    const { onlyActive = true } = options;

    const result = await poolOrTx.request().query(`
        SELECT Id, Nome, CicloTipo, DomingosFolgaCada, ExigeReposicao, Ativo, Ordem, Observacao, CriadoEm, AtualizadoEm
        FROM TiposEscala
        ${onlyActive ? 'WHERE Ativo = 1' : ''}
        ORDER BY Ordem, Nome
    `);

    const diasPorTipo = new Map();

    for (const dia of await listTipoEscalaDias(poolOrTx)) {
        const id = Number(dia.TipoEscalaId);

        if (!diasPorTipo.has(id)) {
            diasPorTipo.set(id, []);
        }

        diasPorTipo.get(id).push(dia);
    }

    return result.recordset.map((row) => serializeTipoEscala(row, diasPorTipo.get(Number(row.Id)) || []));
}

async function findTipoEscalaById(poolOrTx, tipoEscalaId) {
    const id = ensurePositiveInt(tipoEscalaId, 'Tipo de escala');
    const result = await poolOrTx.request()
        .input('id', sql.Int, id)
        .query(`
            SELECT Id, Nome, CicloTipo, DomingosFolgaCada, ExigeReposicao, Ativo, Ordem, Observacao, CriadoEm, AtualizadoEm
            FROM TiposEscala
            WHERE Id = @id
        `);

    if (result.recordset.length === 0) {
        throw new AppError(404, 'Tipo de escala nao encontrado.');
    }

    return serializeTipoEscala(result.recordset[0], await listTipoEscalaDias(poolOrTx, id));
}

async function replaceTipoEscalaDias(poolOrTx, tipoEscalaId, dias) {
    for (const dia of dias) {
        await poolOrTx.request()
            .input('tipoEscalaId', sql.Int, tipoEscalaId)
            .input('diaSemana', sql.TinyInt, dia.diaSemana)
            .input('trabalha', sql.Bit, dia.trabalha ? 1 : 0)
            .input('trabalhoInicio', sql.Time, toSqlTime(dia.trabalhoInicio, 'Inicio do trabalho'))
            .input('trabalhoFim', sql.Time, toSqlTime(dia.trabalhoFim, 'Fim do trabalho'))
            .input('almocoInicio', sql.Time, toSqlTime(dia.almocoInicio, 'Inicio do almoco'))
            .input('almocoFim', sql.Time, toSqlTime(dia.almocoFim, 'Fim do almoco'))
            .query(`
                MERGE TipoEscalaDia AS target
                USING (SELECT @tipoEscalaId AS TipoEscalaId, @diaSemana AS DiaSemana) AS source
                ON target.TipoEscalaId = source.TipoEscalaId
                   AND target.DiaSemana = source.DiaSemana
                WHEN MATCHED THEN UPDATE SET
                    Trabalha = @trabalha,
                    TrabalhoInicio = @trabalhoInicio,
                    TrabalhoFim = @trabalhoFim,
                    AlmocoInicio = @almocoInicio,
                    AlmocoFim = @almocoFim
                WHEN NOT MATCHED THEN INSERT (
                    TipoEscalaId, DiaSemana, Trabalha, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim
                ) VALUES (
                    @tipoEscalaId, @diaSemana, @trabalha, @trabalhoInicio, @trabalhoFim, @almocoInicio, @almocoFim
                );
            `);
    }
}

async function createTipoEscala(poolOrTx, body) {
    const payload = normalizeTipoEscalaPayload(body);
    const ordemResult = await poolOrTx.request().query('SELECT COALESCE(MAX(Ordem), 0) AS maxOrdem FROM TiposEscala');
    const ordem = Number(ordemResult.recordset[0]?.maxOrdem || 0) + 1;

    const inserido = await poolOrTx.request()
        .input('nome', sql.NVarChar(120), payload.nome)
        .input('cicloTipo', sql.NVarChar(20), payload.cicloTipo)
        .input('domingosFolgaCada', sql.Int, payload.domingosFolgaCada)
        .input('exigeReposicao', sql.Bit, payload.exigeReposicao ? 1 : 0)
        .input('ativo', sql.Bit, payload.ativo ? 1 : 0)
        .input('ordem', sql.Int, ordem)
        .input('observacao', sql.NVarChar(500), payload.observacao)
        .query(`
            INSERT INTO TiposEscala (Nome, CicloTipo, DomingosFolgaCada, ExigeReposicao, Ativo, Ordem, Observacao)
            OUTPUT INSERTED.Id
            VALUES (@nome, @cicloTipo, @domingosFolgaCada, @exigeReposicao, @ativo, @ordem, @observacao)
        `);

    const id = Number(inserido.recordset[0].Id);
    await replaceTipoEscalaDias(poolOrTx, id, payload.dias);

    return findTipoEscalaById(poolOrTx, id);
}

async function updateTipoEscala(poolOrTx, tipoEscalaId, body) {
    const atual = await findTipoEscalaById(poolOrTx, tipoEscalaId);
    const payload = normalizeTipoEscalaPayload(body, atual);

    await poolOrTx.request()
        .input('id', sql.Int, atual.id)
        .input('nome', sql.NVarChar(120), payload.nome)
        .input('cicloTipo', sql.NVarChar(20), payload.cicloTipo)
        .input('domingosFolgaCada', sql.Int, payload.domingosFolgaCada)
        .input('exigeReposicao', sql.Bit, payload.exigeReposicao ? 1 : 0)
        .input('ativo', sql.Bit, payload.ativo ? 1 : 0)
        .input('observacao', sql.NVarChar(500), payload.observacao)
        .query(`
            UPDATE TiposEscala
            SET
                Nome = @nome,
                CicloTipo = @cicloTipo,
                DomingosFolgaCada = @domingosFolgaCada,
                ExigeReposicao = @exigeReposicao,
                Ativo = @ativo,
                Observacao = @observacao,
                AtualizadoEm = GETDATE()
            WHERE Id = @id
        `);

    await replaceTipoEscalaDias(poolOrTx, atual.id, payload.dias);

    return findTipoEscalaById(poolOrTx, atual.id);
}

// O molde no formato que ColaboradorJornadaSemanal entende. Dia de folga vira
// linha inativa; replaceColaboradorJornadaSemanal desliga os dias que nao
// vierem marcados como ativos.
function construirJornadaSemanalDoTipo(tipoEscala) {
    return (tipoEscala.dias || [])
        .filter((dia) => dia.trabalha)
        .map((dia) => ({
            diaSemana: dia.diaSemana,
            trabalhoInicio: dia.trabalhoInicio,
            trabalhoFim: dia.trabalhoFim,
            almocoInicio: dia.almocoInicio,
            almocoFim: dia.almocoFim,
            ativo: true
        }));
}

async function aplicarTipoEscalaNoColaborador(poolOrTx, tipoEscalaId, colaboradorId) {
    const tipoEscala = await findTipoEscalaById(poolOrTx, tipoEscalaId);

    if (tipoEscala.cicloTipo !== 'semanal') {
        throw new AppError(400, `Ciclo "${tipoEscala.cicloTipo}" ainda nao e suportado. Apenas o ciclo semanal pode ser aplicado.`);
    }

    const id = ensurePositiveInt(colaboradorId, 'Colaborador');
    const jornadaSemanal = await replaceColaboradorJornadaSemanal(
        poolOrTx,
        id,
        construirJornadaSemanalDoTipo(tipoEscala)
    );

    await poolOrTx.request()
        .input('colaboradorId', sql.Int, id)
        .input('tipoEscalaId', sql.Int, tipoEscala.id)
        .query('UPDATE Colaboradores SET TipoEscalaId = @tipoEscalaId WHERE Id = @colaboradorId');

    return { tipoEscala, jornadaSemanal };
}

module.exports = {
    aplicarTipoEscalaNoColaborador,
    construirJornadaSemanalDoTipo,
    createTipoEscala,
    findTipoEscalaById,
    listTiposEscala,
    normalizeDiasPayload,
    normalizeTipoEscalaPayload,
    serializeTipoEscala,
    updateTipoEscala
};

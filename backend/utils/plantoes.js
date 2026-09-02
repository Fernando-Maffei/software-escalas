const { AppError } = require('./errors');
const { minutesToDurationLabel } = require('./bancoHoras');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeNumericArray,
    normalizeOptionalText
} = require('./validation');
const { calculateIntervalMinutes } = require('./bancoHoras');

function formatDateToISO(date) {
    return normalizeIsoDate(extractDateString(date), 'Data');
}

function normalizeColaboradores(values) {
    if (values === undefined || values === null) {
        return [];
    }

    return normalizeNumericArray(values, 'Colaborador');
}

const PLANTAO_TIPOS = ['sabado', 'domingo', 'feriado'];

// Tipo do plantao a partir da data. Feriado tem PRIORIDADE (mesmo caindo no fim
// de semana): quando `feriados` (Set de datas ISO) contem a data, o tipo e
// 'feriado'. Sem o Set (chamadas que so validam fim de semana), sabado/domingo
// ainda resolvem; um feriado em dia util so e aceito quando o Set e passado.
function resolvePlantaoTypeByDate(dataISO, feriados = null) {
    const normalized = normalizeIsoDate(dataISO, 'Data do plantao');

    if (feriados && typeof feriados.has === 'function' && feriados.has(normalized)) {
        return 'feriado';
    }

    const [year, month, day] = normalized.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

    if (weekday === 6) {
        return 'sabado';
    }

    if (weekday === 0) {
        return 'domingo';
    }

    throw new AppError(400, 'Plantao deve ser lancado somente para sabado, domingo ou feriado.');
}

function normalizePlantaoType(value, dataISO = null, feriados = null) {
    if (value === undefined || value === null || String(value).trim() === '') {
        if (dataISO) {
            return resolvePlantaoTypeByDate(dataISO, feriados);
        }

        throw new AppError(400, 'Tipo de plantao e obrigatorio.');
    }

    const normalized = normalizeEnum(value, 'Tipo de plantao', PLANTAO_TIPOS);

    if (dataISO) {
        const expected = resolvePlantaoTypeByDate(dataISO, feriados);

        if (normalized !== expected) {
            throw new AppError(400, `A data informada corresponde a ${expected}, nao a ${normalized}.`);
        }
    }

    return normalized;
}

function resolveLegacyPlantaoType(row, dataISO) {
    const rawType = row.tipoPlantao ?? row.tipo_plantao ?? row.TipoPlantao ?? null;

    if (rawType !== undefined && rawType !== null && String(rawType).trim() !== '') {
        const normalized = String(rawType)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        if (normalized === 'sabado' || normalized === 'domingo' || normalized === 'feriado') {
            return normalized;
        }
    }

    if (!dataISO) {
        return null;
    }

    try {
        return resolvePlantaoTypeByDate(dataISO);
    } catch (error) {
        return null;
    }
}

function serializePlantaoRecord(row) {
    const rawDate = row.data_plantao ?? row.DataPlantao ?? row.dataISO ?? null;
    let dataISO = null;

    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
        dataISO = formatDateToISO(rawDate);
    } else if (typeof rawDate === 'string' && rawDate.trim() !== '') {
        dataISO = normalizeIsoDate(rawDate.split('T')[0], 'Data do plantão');
    }

    let colaboradores = row.colaboradores ?? row.Colaboradores ?? row.colaboradores_ids ?? row.ColaboradoresIds ?? [];

    if (typeof colaboradores === 'string') {
        try {
            colaboradores = JSON.parse(colaboradores);
        } catch (error) {
            colaboradores = [];
        }
    }

    return {
        id: row.id ?? row.Id ?? null,
        data_plantao: rawDate,
        dataISO,
        colaboradores: normalizeColaboradores(colaboradores),
        tipoPlantao: resolveLegacyPlantaoType(row, dataISO),
        horaInicio: extractTimeString(row.hora_inicio ?? row.HoraInicio ?? row.horaInicio),
        horaFim: extractTimeString(row.hora_fim ?? row.HoraFim ?? row.horaFim),
        observacao: row.observacao ?? row.Observacao ?? null,
        duracaoMinutos: Number.isFinite(row.duracaoMinutos) ? row.duracaoMinutos : null,
        duracaoFormatada: Number.isFinite(row.duracaoMinutos) ? minutesToDurationLabel(row.duracaoMinutos) : null,
        criado_em: row.criado_em ?? row.CriadoEm ?? null,
        atualizado_em: row.atualizado_em ?? row.AtualizadoEm ?? null
    };
}

function generateUpcomingSaturdays(quantity, referenceDate = new Date()) {
    const total = ensurePositiveInt(quantity, 'Quantidade');

    if (total > 52) {
        throw new AppError(400, 'Quantidade máxima de sábados por consulta é 52.');
    }

    const current = new Date(referenceDate);
    current.setHours(0, 0, 0, 0);

    while (current.getDay() !== 6) {
        current.setDate(current.getDate() + 1);
    }

    return Array.from({ length: total }, (_, index) => {
        const saturday = new Date(current);
        saturday.setDate(current.getDate() + index * 7);

        return {
            dataISO: formatDateToISO(saturday),
            dataFormatada: saturday.toLocaleDateString('pt-BR'),
            dia: saturday.getDate(),
            mes: saturday.getMonth() + 1,
            ano: saturday.getFullYear()
        };
    });
}

function minutosDoHorario(hora) {
    const [h, m] = String(hora).split(':').map(Number);
    return (h * 60) + m;
}

function horariosSeCruzam(a, b) {
    return minutosDoHorario(a.horaInicio) < minutosDoHorario(b.horaFim)
        && minutosDoHorario(b.horaInicio) < minutosDoHorario(a.horaFim);
}

// Um dia de plantao pode ter varios lancamentos: turnos com horarios e pessoas
// diferentes (ex.: um colaborador das 08h as 13h e outro das 13h as 18h).
// Aceita o formato novo ({ dataISO, lancamentos: [...] }) e tambem o antigo
// ({ dataISO, colaboradores, horaInicio, horaFim }), que vira um lancamento so
// — manter os dois evita quebrar chamadas que ainda usem o formato de antes.
function buildPlantaoDiaPayload(body, feriados = null) {
    const dataISO = normalizeIsoDate(body.dataISO, 'Data do plantao');
    const tipoPlantao = normalizePlantaoType(body.tipoPlantao, dataISO, feriados);

    const brutos = Array.isArray(body.lancamentos) && body.lancamentos.length > 0
        ? body.lancamentos
        : [{
            horaInicio: body.horaInicio,
            horaFim: body.horaFim,
            colaboradores: body.colaboradores,
            observacao: body.observacao
        }];

    const lancamentos = brutos.map((item, indice) => {
        const rotulo = `Lancamento ${indice + 1}`;
        const horaInicio = normalizeNullableTime(item.horaInicio, `Hora inicial do ${rotulo}`);
        const horaFim = normalizeNullableTime(item.horaFim, `Hora final do ${rotulo}`);

        if (!horaInicio || !horaFim) {
            throw new AppError(400, `${rotulo}: informe a hora inicial e a final.`);
        }

        const colaboradores = normalizeColaboradores(item.colaboradores);

        if (colaboradores.length === 0) {
            throw new AppError(400, `${rotulo}: selecione pelo menos um colaborador.`);
        }

        return {
            horaInicio,
            horaFim,
            colaboradores,
            observacao: normalizeOptionalText(item.observacao, 'Observacao', { maxLength: 500 }),
            duracaoMinutos: calculateIntervalMinutes(horaInicio, horaFim, {
                startLabel: `Hora inicial do ${rotulo}`,
                endLabel: `Hora final do ${rotulo}`
            })
        };
    });

    // Ninguem pode estar em dois turnos que se sobrepoem no mesmo dia.
    for (let i = 0; i < lancamentos.length; i += 1) {
        for (let j = i + 1; j < lancamentos.length; j += 1) {
            if (!horariosSeCruzam(lancamentos[i], lancamentos[j])) {
                continue;
            }

            const repetido = lancamentos[i].colaboradores
                .find((id) => lancamentos[j].colaboradores.includes(id));

            if (repetido) {
                throw new AppError(400, `O colaborador ${repetido} aparece em dois lancamentos com horarios que se sobrepoem.`);
            }
        }
    }

    return { dataISO, tipoPlantao, lancamentos };
}

// Quem compartilha exatamente o mesmo horario e observacao vira UMA linha, com
// os colaboradores juntos. Preserva o formato de sempre da tabela (um registro
// com colaboradores_ids) e evita inflar o banco quando cinco pessoas fazem o
// mesmo turno.
function agruparLancamentosPorHorario(lancamentos) {
    const grupos = new Map();

    for (const lancamento of lancamentos) {
        const chave = `${lancamento.horaInicio}|${lancamento.horaFim}|${lancamento.observacao || ''}`;
        const atual = grupos.get(chave);

        if (atual) {
            for (const id of lancamento.colaboradores) {
                if (!atual.colaboradores.includes(id)) {
                    atual.colaboradores.push(id);
                }
            }

            continue;
        }

        grupos.set(chave, { ...lancamento, colaboradores: [...lancamento.colaboradores] });
    }

    return [...grupos.values()].map((grupo) => ({
        ...grupo,
        colaboradores: [...grupo.colaboradores].sort((a, b) => a - b)
    }));
}

module.exports = {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    formatDateToISO,
    generateUpcomingSaturdays,
    horariosSeCruzam,
    normalizeColaboradores,
    normalizePlantaoType,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
};

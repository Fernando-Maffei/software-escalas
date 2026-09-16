const { AppError } = require('./errors');
const { minutesToDurationLabel } = require('./bancoHoras');
const { isFeriadoNacional } = require('./feriados-nacionais');
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

// Destino das horas do lancamento. 'banco' credita BancoHorasMovimentos como
// sempre; 'extra' registra o plantao e a escala do dia, mas nao mexe no saldo —
// a hora sai como extra na folha.
const PLANTAO_TIPOS_CREDITO = ['banco', 'extra'];

function normalizeTipoCredito(value, fieldName = 'Tipo de credito') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return 'banco';
    }

    return normalizeEnum(value, fieldName, PLANTAO_TIPOS_CREDITO);
}

function resolveLegacyTipoCredito(row) {
    const raw = row.tipoCredito ?? row.tipo_credito ?? row.TipoCredito ?? null;

    try {
        return normalizeTipoCredito(raw);
    } catch (error) {
        // Valor estranho no banco nao pode derrubar a leitura da tela: o
        // comportamento historico (antes da coluna existir) era creditar.
        return 'banco';
    }
}

// Tipo do plantao a partir da data. Feriado tem PRIORIDADE (mesmo caindo no fim
// de semana), e vem de duas fontes: os feriados nacionais, que sao calculados
// (nao dependem do banco nem do Set), e `feriados` — Set de datas ISO com o
// que esta na tabela Feriados, de onde sai o feriado municipal/estadual. Sem o
// Set, um feriado nacional em dia util ainda resolve; um municipal em dia util
// so e aceito quando o Set e passado.
function resolvePlantaoTypeByDate(dataISO, feriados = null) {
    const normalized = normalizeIsoDate(dataISO, 'Data do plantao');

    if (isFeriadoNacional(normalized)) {
        return 'feriado';
    }

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
        tipoCredito: resolveLegacyTipoCredito(row),
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

// Um dia de plantao pode ter VARIOS lancamentos: turnos com horarios, pessoas e
// destinos diferentes (ex.: um colaborador das 08h as 13h no banco de horas e
// outro das 13h as 18h como hora extra). Aceita tambem o formato antigo
// ({ dataISO, colaboradores, horaInicio, horaFim }), que vira um lancamento so —
// manter os dois evita quebrar chamadas que ainda usem o formato de antes.
function buildPlantaoDiaPayload(body, feriados = null) {
    const dataISO = normalizeIsoDate(body.dataISO, 'Data do plantao');
    const tipoPlantao = normalizePlantaoType(body.tipoPlantao, dataISO, feriados);
    const observacaoDia = normalizeOptionalText(body.observacao, 'Observacao', { maxLength: 500 });

    const brutos = Array.isArray(body.lancamentos) && body.lancamentos.length > 0
        ? body.lancamentos
        : [{
            horaInicio: body.horaInicio,
            horaFim: body.horaFim,
            colaboradores: body.colaboradores,
            tipoCredito: body.tipoCredito
        }];

    const lancamentos = brutos.map((item, indice) => {
        const rotulo = `Lancamento ${indice + 1}`;
        const horaInicio = normalizeNullableTime(item.horaInicio, `Hora inicial do ${rotulo}`);
        const horaFim = normalizeNullableTime(item.horaFim, `Hora final do ${rotulo}`);

        if (!horaInicio || !horaFim) {
            throw new AppError(400, `${rotulo}: informe a hora inicial e a final.`);
        }

        const colaboradores = normalizeColaboradores(
            item.colaboradorId !== undefined && item.colaboradorId !== null
                ? [item.colaboradorId]
                : item.colaboradores
        );

        if (colaboradores.length === 0) {
            throw new AppError(400, `${rotulo}: selecione pelo menos um colaborador.`);
        }

        return {
            horaInicio,
            horaFim,
            colaboradores,
            tipoCredito: normalizeTipoCredito(item.tipoCredito, `Tipo de credito do ${rotulo}`),
            observacao: observacaoDia,
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

    return { dataISO, tipoPlantao, observacao: observacaoDia, lancamentos };
}

// Relatorio de horas extras: agrupa por colaborador os plantoes lancados como
// 'extra' dentro da janela [inicioISO, fimISO]. Hora extra e paga em folha e
// nao gera movimento no banco de horas, entao este e o unico lugar onde essas
// horas aparecem somadas — na grade semanal e no extrato elas nao entram.
// Recebe plantoes ja serializados e devolve so minutos: quem chama decide o
// formato (a tela do Banco de Horas usa H:MM, o extrato usa "05h 00m").
function montarRelatorioHorasExtras(plantoes, colaboradores, filtros = {}) {
    const { inicioISO = null, fimISO = null } = filtros;
    const colaboradorFiltro = filtros.colaboradorId === undefined
        || filtros.colaboradorId === null
        || filtros.colaboradorId === ''
        ? null
        : Number(filtros.colaboradorId);

    // Colaborador fora desta lista (setor sem permissao, cadastro removido)
    // simplesmente nao entra no relatorio, como ja acontece no /verificar.
    const colaboradoresPorId = new Map(
        (colaboradores || []).map((item) => [Number(item.Id ?? item.id), item])
    );

    const avisos = [];
    const acumulado = new Map();
    const dias = new Set();

    for (const plantao of plantoes || []) {
        if (plantao.tipoCredito !== 'extra') {
            continue;
        }

        if (!plantao.dataISO
            || (inicioISO && plantao.dataISO < inicioISO)
            || (fimISO && plantao.dataISO > fimISO)) {
            continue;
        }

        if (!plantao.horaInicio || !plantao.horaFim) {
            avisos.push(`Plantao ${plantao.id}: sem horario, hora extra ignorada.`);
            continue;
        }

        let minutos = 0;

        try {
            minutos = calculateIntervalMinutes(plantao.horaInicio, plantao.horaFim);
        } catch (error) {
            avisos.push(`Plantao ${plantao.id}: ${error.message}`);
            continue;
        }

        for (const id of plantao.colaboradores || []) {
            const colaboradorId = Number(id);

            if (colaboradorFiltro !== null && colaboradorId !== colaboradorFiltro) {
                continue;
            }

            const colaborador = colaboradoresPorId.get(colaboradorId);

            if (!colaborador) {
                continue;
            }

            if (!acumulado.has(colaboradorId)) {
                const setorId = colaborador.SetorId ?? colaborador.setorId ?? null;

                acumulado.set(colaboradorId, {
                    colaboradorId,
                    nome: colaborador.Nome ?? colaborador.nome ?? `Colaborador ${colaboradorId}`,
                    setorId: setorId === null || setorId === undefined ? null : Number(setorId),
                    totalMinutos: 0,
                    plantoes: []
                });
            }

            const item = acumulado.get(colaboradorId);
            item.totalMinutos += minutos;
            item.plantoes.push({
                plantaoId: plantao.id,
                dataISO: plantao.dataISO,
                tipoPlantao: plantao.tipoPlantao,
                horaInicio: plantao.horaInicio,
                horaFim: plantao.horaFim,
                minutos,
                observacao: plantao.observacao || null
            });

            dias.add(plantao.dataISO);
        }
    }

    const itens = [...acumulado.values()]
        .map((item) => ({
            ...item,
            // Mais recente primeiro, como nas outras listagens de plantao.
            plantoes: item.plantoes.sort((a, b) => (
                String(b.dataISO).localeCompare(String(a.dataISO))
                || String(a.horaInicio).localeCompare(String(b.horaInicio))
            ))
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
        itens,
        totalMinutos: itens.reduce((total, item) => total + item.totalMinutos, 0),
        totalColaboradores: itens.length,
        // Conta DIAS, nao turnos: um sabado com dois turnos extras e um dia so.
        totalDias: dias.size,
        avisos
    };
}

// Quem compartilha exatamente o mesmo horario E o mesmo destino das horas vira
// UMA linha, com os colaboradores juntos. Preserva o formato de sempre da
// tabela (um registro com colaboradores_ids) e evita inflar o banco quando
// cinco pessoas fazem o mesmo turno. O tipo_credito entra na chave porque e
// gravado por linha: agrupar banco com extra perderia a distincao.
function agruparLancamentosPorHorario(lancamentos) {
    const grupos = new Map();

    for (const lancamento of lancamentos) {
        const chave = `${lancamento.horaInicio}|${lancamento.horaFim}|${lancamento.tipoCredito}`;
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
    montarRelatorioHorasExtras,
    normalizeColaboradores,
    normalizePlantaoType,
    normalizeTipoCredito,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
};

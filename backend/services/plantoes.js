const { AppError } = require('../lib/errors');
const {
    PLANTAO_TIPO_COBERTURA_ALMOCO,
    PLANTAO_TIPOS,
    PLANTAO_TIPOS_CREDITO,
    PLANTAO_TIPOS_LANCAMENTO
} = require('../lib/dominio');
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
} = require('../lib/validation');
const { calculateIntervalMinutes, minutesToDurationLabel } = require('./bancoHoras');

function formatDateToISO(date) {
    return normalizeIsoDate(extractDateString(date), 'Data');
}

function normalizeColaboradores(values) {
    if (values === undefined || values === null) {
        return [];
    }

    return normalizeNumericArray(values, 'Colaborador');
}

// Equipe do plantao como array de ids. Aceita o array ou o texto JSON que as
// consultas montam a partir de PlantaoColaborador (ver equipe-plantao.js) e o
// que os backups antigos guardavam em plantoes.colaboradores_ids ("[3,7]").
// Texto que nao e JSON valido vira equipe vazia: derrubar a leitura do dia
// inteiro por causa dele seria pior.
function parseEquipePlantao(raw) {
    let valor = raw ?? [];

    if (typeof valor === 'string') {
        try {
            valor = JSON.parse(valor);
        } catch (error) {
            valor = [];
        }
    }

    return normalizeColaboradores(valor);
}



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

// Tipo do lancamento (campo "Tipo" da tela): o plantao regular do dia, que
// sempre e o proprio tipo do dia, ou a cobertura de almoco do plantonista —
// esta so em domingo e feriado.
// Vazio vira o regular — assim chamadas que nao conhecem o campo continuam
// gravando o que gravavam antes.
function normalizeTipoLancamento(value, tipoPlantao, fieldName = 'Tipo do lancamento') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return tipoPlantao;
    }

    const normalized = normalizeEnum(value, fieldName, PLANTAO_TIPOS_LANCAMENTO);

    if (normalized !== PLANTAO_TIPO_COBERTURA_ALMOCO && normalized !== tipoPlantao) {
        throw new AppError(400, `${fieldName}: a data corresponde a ${tipoPlantao}, nao a ${normalized}.`);
    }

    // A cobertura existe para o almoco do plantonista de domingo e feriado; no
    // sabado o lancamento e sempre plantao (a tela nem oferece o campo).
    if (normalized === PLANTAO_TIPO_COBERTURA_ALMOCO && tipoPlantao === 'sabado') {
        throw new AppError(400, `${fieldName}: cobertura de almoco so pode ser lancada em domingo ou feriado.`);
    }

    return normalized;
}

// Linha gravada antes da coluna tipo_lancamento (ou com valor estranho) e o
// plantao regular do dia — mesma regra da migration que preencheu a coluna.
function resolveLegacyTipoLancamento(row, tipoPlantao) {
    const raw = String(row.tipoLancamento ?? row.tipo_lancamento ?? row.TipoLancamento ?? '').trim().toLowerCase();

    return PLANTAO_TIPOS_LANCAMENTO.includes(raw) ? raw : tipoPlantao;
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

    const colaboradores = parseEquipePlantao(
        row.equipe ?? row.colaboradores ?? row.Colaboradores
    );

    const tipoPlantao = resolveLegacyPlantaoType(row, dataISO);

    return {
        id: row.id ?? row.Id ?? null,
        data_plantao: rawDate,
        dataISO,
        colaboradores,
        tipoPlantao,
        tipoLancamento: resolveLegacyTipoLancamento(row, tipoPlantao),
        tipoCredito: resolveLegacyTipoCredito(row),
        horaInicio: extractTimeString(row.hora_inicio ?? row.HoraInicio ?? row.horaInicio),
        horaFim: extractTimeString(row.hora_fim ?? row.HoraFim ?? row.horaFim),
        observacao: row.observacao ?? row.Observacao ?? null,
        // Plantao gerado por cobertura de plantonista (cobertura-plantoes.js);
        // nulo no lancado a mao.
        coberturaTrechoId: Number(row.cobertura_trecho_id ?? row.coberturaTrechoId) || null,
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
            tipoCredito: body.tipoCredito,
            tipoLancamento: body.tipoLancamento
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
            tipoLancamento: normalizeTipoLancamento(item.tipoLancamento, tipoPlantao, `Tipo do ${rotulo}`),
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
                // 'cobertura' quando veio de um trecho de dia util: ai o id e
                // do trecho, nao de plantoes.
                origem: plantao.origem || 'plantao',
                dataISO: plantao.dataISO,
                tipoPlantao: plantao.tipoPlantao,
                tipoLancamento: plantao.tipoLancamento,
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

// Quem compartilha exatamente o mesmo horario, o mesmo destino das horas E o
// mesmo tipo vira UMA linha, com os colaboradores juntos (a equipe vai para
// PlantaoColaborador), o que evita inflar o banco quando cinco pessoas fazem o
// mesmo turno. tipo_credito e tipo_lancamento entram na chave porque sao
// gravados por linha: agrupar banco com extra, ou domingo com cobertura de
// almoco, perderia a distincao.
function agruparLancamentosPorHorario(lancamentos) {
    const grupos = new Map();

    for (const lancamento of lancamentos) {
        const chave = `${lancamento.horaInicio}|${lancamento.horaFim}|${lancamento.tipoCredito}|${lancamento.tipoLancamento}`;
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

// Conta com teto de setor so ve (e so edita) a parte da equipe que esta nos
// setores dela: o GET do dia esconde o resto. Como o POST reescreve o dia
// inteiro e o DELETE apaga o dia inteiro, sem isto salvar ou excluir por essa
// conta apagava em silencio os turnos de quem ela nao enxerga. Devolve, como
// lancamentos no formato de buildPlantaoDiaPayload, a parte de cada registro
// gravado que fica fora do alcance da conta (e que nao veio no payload), para
// ser regravada como estava. `visiveis` null = conta sem teto: nada a manter.
function lancamentosForaDoAlcance(registros, visiveis, tipoPlantao, idsNoPayload = []) {
    if (!visiveis) {
        return [];
    }

    const enviados = new Set((idsNoPayload || []).map(Number));

    return (registros || [])
        .map((registro) => {
            const colaboradores = (registro.colaboradores || [])
                .map(Number)
                .filter((id) => !visiveis.has(id) && !enviados.has(id));

            return {
                horaInicio: registro.horaInicio,
                horaFim: registro.horaFim,
                colaboradores,
                tipoCredito: resolveLegacyTipoCredito(registro),
                // O dia pode ter mudado de tipo depois da gravacao (feriado
                // cadastrado depois): a cobertura continua cobertura, o
                // resto acompanha o tipo atual do dia.
                tipoLancamento: registro.tipoLancamento === PLANTAO_TIPO_COBERTURA_ALMOCO
                    ? PLANTAO_TIPO_COBERTURA_ALMOCO
                    : tipoPlantao,
                observacao: registro.observacao ?? null,
                // Registro antigo pode nao ter horario; ele volta como estava.
                duracaoMinutos: registro.horaInicio && registro.horaFim
                    ? calculateIntervalMinutes(registro.horaInicio, registro.horaFim)
                    : null
            };
        })
        .filter((lancamento) => lancamento.colaboradores.length > 0);
}

module.exports = {
    agruparLancamentosPorHorario,
    lancamentosForaDoAlcance,
    buildPlantaoDiaPayload,
    formatDateToISO,
    generateUpcomingSaturdays,
    horariosSeCruzam,
    montarRelatorioHorasExtras,
    normalizeColaboradores,
    normalizePlantaoType,
    normalizeTipoCredito,
    normalizeTipoLancamento,
    parseEquipePlantao,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
};

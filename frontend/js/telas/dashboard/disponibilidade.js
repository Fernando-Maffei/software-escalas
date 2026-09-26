function obterAusenciasNaData(dataISO) {
    return (window.ausencias || []).filter((ausencia) => {
        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        const fim = toISODate(ausencia.DataFim || ausencia.dataFim);

        return Boolean(inicio && fim && dataISO >= inicio && dataISO <= fim);
    });
}

function obterAusenciaDoColaboradorNaData(colaboradorId, dataISO) {
    return obterAusenciasNaData(dataISO).find((ausencia) => Number(ausencia.colaboradorId || ausencia.ColaboradorId) === Number(colaboradorId)) || null;
}

function getDashboardSetorId(colaborador) {
    const value = colaborador?.SetorId ?? colaborador?.setorId ?? colaborador?.setor_id ?? null;

    if (value === null || value === undefined || String(value).trim() === '') {
        return '';
    }

    return String(value);
}

function getDashboardSetorNome(colaborador, setoresById = new Map()) {
    const setorId = getDashboardSetorId(colaborador);
    const nomeDireto = colaborador?.SetorNome ?? colaborador?.setorNome ?? colaborador?.setor ?? colaborador?.Setor;
    const nomeSetor = nomeDireto || setoresById.get(setorId)?.nome || setoresById.get(setorId)?.Nome;
    const normalized = String(nomeSetor || '').trim();

    return normalized || 'Sem setor';
}

function colaboradorDisponivelAgora(colaborador, minutosAtuais, dataISO, jornadaSemanalIndex) {
    const ausencia = obterAusenciaDoColaboradorNaData(colaborador.Id, dataISO);
    const tipo = String(ausencia?.tipo || ausencia?.Tipo || '').toLowerCase();
    const periodoTipo = String(ausencia?.periodoTipo || ausencia?.PeriodoTipo || '').toLowerCase();
    const schedule = getColaboradorScheduleForDate(colaborador, dataISO, jornadaSemanalIndex);

    if (!schedule) {
        return false;
    }

    if (ausencia && periodoTipo !== 'horas') {
        return false;
    }

    const trabalhoInicio = getTimeMinutesDashboard(schedule.trabalhoInicio);
    const trabalhoFim = getTimeMinutesDashboard(schedule.trabalhoFim);
    const almocoInicio = getTimeMinutesDashboard(schedule.almocoInicio);
    const almocoFim = getTimeMinutesDashboard(schedule.almocoFim);

    if (trabalhoInicio === null || trabalhoFim === null) {
        return false;
    }

    const dentroDoTrabalho = minutosAtuais >= trabalhoInicio && minutosAtuais < trabalhoFim;
    const estaNoAlmoco = almocoInicio !== null && almocoFim !== null && minutosAtuais >= almocoInicio && minutosAtuais < almocoFim;

    if (!dentroDoTrabalho || estaNoAlmoco) {
        return false;
    }

    if (periodoTipo === 'horas') {
        const horaInicio = getTimeMinutesDashboard(ausencia?.horaInicio || ausencia?.HoraInicio);
        const horaFim = getTimeMinutesDashboard(ausencia?.horaFim || ausencia?.HoraFim);

        if (horaInicio !== null && horaFim !== null && minutosAtuais >= horaInicio && minutosAtuais < horaFim) {
            return false;
        }
    }

    return tipo !== 'ferias' && tipo !== 'folga' && tipo !== 'ausencia';
}

// Restringe uma lista de colaboradores aos setores de "Meus setores" (a
// preferencia por usuario, servida por meus-setores.js). Lista vazia de
// preferencia = ver todos (sem filtro).
function filtrarColaboradoresPorSetorDashboard(lista) {
    const base = Array.isArray(lista) ? lista : [];
    const meusSetores = typeof window.getMeusSetores === 'function' ? window.getMeusSetores() : [];

    if (!meusSetores.length) {
        return base;
    }

    const permitidos = new Set(meusSetores.map(String));

    return base.filter((colaborador) => permitidos.has(String(getDashboardSetorId(colaborador) ?? '')));
}


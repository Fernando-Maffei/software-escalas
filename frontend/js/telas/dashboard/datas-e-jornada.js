function toISODate(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value.includes('T') ? value.split('T')[0] : value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTimeInputDashboard(value) {
    if (!value) {
        return null;
    }

    const raw = String(value).trim();

    if (!raw) {
        return null;
    }

    if (raw.includes('T')) {
        const match = raw.match(/T(\d{2}:\d{2})/);
        return match ? match[1] : null;
    }

    if (!raw.includes(':')) {
        return null;
    }

    return raw.slice(0, 5);
}

function getTimeMinutesDashboard(value) {
    const formatted = formatTimeInputDashboard(value);

    if (!formatted) {
        return null;
    }

    const [hours, minutes] = formatted.split(':').map(Number);
    return (hours * 60) + minutes;
}

function getIsoDayOfWeekDashboard(dataISO) {
    const normalized = toISODate(dataISO);

    if (!normalized) {
        return new Date().getDay();
    }

    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0).getDay();
}

function buildJornadaSemanalIndex(items = []) {
    const map = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const colaboradorId = Number(item.colaboradorId || item.ColaboradorId || 0);
        const diaSemana = Number(item.diaSemana ?? item.DiaSemana);
        const trabalhoInicio = formatTimeInputDashboard(item.trabalhoInicio || item.TrabalhoInicio);
        const trabalhoFim = formatTimeInputDashboard(item.trabalhoFim || item.TrabalhoFim);
        const almocoInicio = formatTimeInputDashboard(item.almocoInicio || item.AlmocoInicio);
        const almocoFim = formatTimeInputDashboard(item.almocoFim || item.AlmocoFim);

        if (!Number.isFinite(colaboradorId) || colaboradorId <= 0 || !Number.isFinite(diaSemana)) {
            return;
        }

        if (!map.has(colaboradorId)) {
            map.set(colaboradorId, new Map());
        }

        if (!trabalhoInicio || !trabalhoFim) {
            return;
        }

        map.get(colaboradorId).set(diaSemana, {
            trabalhoInicio,
            trabalhoFim,
            almocoInicio,
            almocoFim
        });
    });

    return map;
}

function hasColaboradorHorarioPadrao(colaborador) {
    return Boolean(
        formatTimeInputDashboard(colaborador?.TrabalhoInicio || colaborador?.trabalhoInicio)
        && formatTimeInputDashboard(colaborador?.TrabalhoFim || colaborador?.trabalhoFim)
    );
}

function getFallbackScheduleForDate(colaborador, dataISO) {
    const weekday = getIsoDayOfWeekDashboard(dataISO);

    if (weekday === 0 || weekday === 6) {
        return null;
    }

    const trabalhoInicio = formatTimeInputDashboard(colaborador?.TrabalhoInicio || colaborador?.trabalhoInicio);
    const trabalhoFim = formatTimeInputDashboard(colaborador?.TrabalhoFim || colaborador?.trabalhoFim);

    if (!trabalhoInicio || !trabalhoFim) {
        return null;
    }

    return {
        trabalhoInicio,
        trabalhoFim,
        almocoInicio: formatTimeInputDashboard(colaborador?.AlmocoInicio || colaborador?.almocoInicio),
        almocoFim: formatTimeInputDashboard(colaborador?.AlmocoFim || colaborador?.almocoFim),
        origem: 'padrao'
    };
}

function getColaboradorScheduleForDate(colaborador, dataISO, jornadaSemanalIndex) {
    const colaboradorId = Number(colaborador?.Id || colaborador?.id || 0);
    const weekday = getIsoDayOfWeekDashboard(dataISO);
    const jornadaByDay = jornadaSemanalIndex.get(colaboradorId);

    if (jornadaByDay) {
        const jornadaDia = jornadaByDay.get(weekday);

        if (!jornadaDia?.trabalhoInicio || !jornadaDia?.trabalhoFim) {
            return null;
        }

        return {
            ...jornadaDia,
            origem: 'jornada'
        };
    }

    return getFallbackScheduleForDate(colaborador, dataISO);
}


const { AppError } = require('./errors');
const { extractDateString, extractTimeString, normalizeIsoDate, normalizeTime } = require('./validation');

function padNumber(value) {
    return String(value).padStart(2, '0');
}

function formatDateLabel(dateISO) {
    if (!dateISO) {
        return '';
    }

    const normalized = normalizeIsoDate(dateISO, 'Data');
    const [year, month, day] = normalized.split('-');
    return `${day}/${month}/${year}`;
}

function timeToMinutes(value, fieldName = 'Horario') {
    const normalized = normalizeTime(value, fieldName);
    const [hours, minutes] = normalized.split(':').map(Number);
    return (hours * 60) + minutes;
}

function calculateIntervalMinutes(startTime, endTime, labels = {}) {
    const startLabel = labels.startLabel || 'Hora inicial';
    const endLabel = labels.endLabel || 'Hora final';

    const startMinutes = timeToMinutes(startTime, startLabel);
    const endMinutes = timeToMinutes(endTime, endLabel);

    if (endMinutes <= startMinutes) {
        throw new AppError(400, `${endLabel} deve ser maior que ${startLabel.toLowerCase()}.`);
    }

    return endMinutes - startMinutes;
}

function calculateDailyWorkMinutes(colaborador) {
    const trabalhoInicio = extractTimeString(colaborador.TrabalhoInicio || colaborador.trabalhoInicio);
    const trabalhoFim = extractTimeString(colaborador.TrabalhoFim || colaborador.trabalhoFim);
    const almocoInicio = extractTimeString(colaborador.AlmocoInicio || colaborador.almocoInicio);
    const almocoFim = extractTimeString(colaborador.AlmocoFim || colaborador.almocoFim);

    if (!trabalhoInicio || !trabalhoFim) {
        throw new AppError(400, 'Defina a jornada do colaborador para calcular debito no banco de horas.');
    }

    let total = calculateIntervalMinutes(trabalhoInicio, trabalhoFim, {
        startLabel: 'Inicio do trabalho',
        endLabel: 'Fim do trabalho'
    });

    if (almocoInicio && almocoFim) {
        total -= calculateIntervalMinutes(almocoInicio, almocoFim, {
            startLabel: 'Inicio do almoco',
            endLabel: 'Fim do almoco'
        });
    }

    return total;
}

function enumerateBusinessDates(startISO, endISO) {
    const startDate = new Date(`${normalizeIsoDate(startISO)}T00:00:00`);
    const endDate = new Date(`${normalizeIsoDate(endISO)}T00:00:00`);
    const dates = [];

    for (const current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
        const weekday = current.getDay();

        if (weekday === 0 || weekday === 6) {
            continue;
        }

        const dateISO = [
            current.getFullYear(),
            padNumber(current.getMonth() + 1),
            padNumber(current.getDate())
        ].join('-');

        dates.push(dateISO);
    }

    return dates;
}

function resolveDefaultDescontaBancoHoras(tipo, subtipo = null) {
    const normalizedTipo = String(tipo || '').trim().toLowerCase();
    const normalizedSubtipo = String(subtipo || '').trim().toLowerCase();

    if (normalizedTipo === 'ferias') {
        return false;
    }

    if (normalizedTipo === 'ausencia' && normalizedSubtipo === 'medico') {
        return false;
    }

    return ['ausencia', 'folga'].includes(normalizedTipo);
}

function normalizeSubtipo(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return String(value).trim().toLowerCase();
}

function calculateAusenciaDebitMinutes(ausencia, colaborador) {
    const tipo = String(ausencia.tipo || ausencia.Tipo || '').trim().toLowerCase();
    const subtipo = normalizeSubtipo(ausencia.subtipo || ausencia.Subtipo);
    const hasExplicitDesconto = ausencia.descontaBancoHoras !== undefined
        && ausencia.descontaBancoHoras !== null;
    const descontaBancoHoras = hasExplicitDesconto
        ? Boolean(ausencia.descontaBancoHoras)
        : resolveDefaultDescontaBancoHoras(tipo, subtipo);

    if (!descontaBancoHoras || tipo === 'ferias') {
        return 0;
    }

    const periodoTipo = String(ausencia.periodoTipo || ausencia.PeriodoTipo || 'dia_inteiro').trim().toLowerCase();

    if (periodoTipo === 'horas') {
        return calculateIntervalMinutes(
            ausencia.horaInicio || ausencia.HoraInicio,
            ausencia.horaFim || ausencia.HoraFim
        );
    }

    const dailyMinutes = calculateDailyWorkMinutes(colaborador);
    const dates = enumerateBusinessDates(
        extractDateString(ausencia.dataInicio || ausencia.DataInicio),
        extractDateString(ausencia.dataFim || ausencia.DataFim)
    );

    return dailyMinutes * dates.length;
}

function minutesToDurationLabel(value) {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const hours = Math.floor(safeValue / 60);
    const minutes = safeValue % 60;
    return `${padNumber(hours)}h ${padNumber(minutes)}m`;
}

function minutesToBalanceLabel(value) {
    const safeValue = Number.isFinite(value) ? Math.round(value) : 0;
    const sign = safeValue < 0 ? '-' : '+';
    return `${sign}${minutesToDurationLabel(Math.abs(safeValue))}`;
}

function parseBalanceInputToMinutes(value, fieldName = 'Saldo do banco de horas') {
    if (value === undefined || value === null) {
        throw new AppError(400, `${fieldName} e obrigatorio.`);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value);
    }

    const normalized = String(value).trim();

    if (!normalized) {
        throw new AppError(400, `${fieldName} e obrigatorio.`);
    }

    const match = normalized.match(/^([+-])?\s*(\d+):(\d{2})$/);

    if (!match) {
        throw new AppError(400, `${fieldName} deve estar no formato +HH:MM ou -HH:MM.`);
    }

    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3]);

    if (minutes >= 60) {
        throw new AppError(400, `${fieldName} possui minutos invalidos.`);
    }

    return sign * ((hours * 60) + minutes);
}

function describeAusenciaMovement(ausencia) {
    const tipo = String(ausencia.tipo || ausencia.Tipo || '').trim().toLowerCase();
    const subtipo = normalizeSubtipo(ausencia.subtipo || ausencia.Subtipo);
    const inicio = extractDateString(ausencia.dataInicio || ausencia.DataInicio);
    const fim = extractDateString(ausencia.dataFim || ausencia.DataFim);
    const dateLabel = inicio && fim && inicio !== fim
        ? `${formatDateLabel(inicio)} a ${formatDateLabel(fim)}`
        : formatDateLabel(inicio || fim);

    if (tipo === 'folga') {
        return `Debito por folga em ${dateLabel}`;
    }

    if (subtipo === 'medico') {
        return `Lancamento medico em ${dateLabel}`;
    }

    return `Debito por ausencia em ${dateLabel}`;
}

function describePlantaoMovement(plantao) {
    const dataISO = extractDateString(plantao.dataISO || plantao.data_plantao || plantao.DataPlantao);
    return `Credito de plantao em ${formatDateLabel(dataISO)}`;
}

function getAusenciaStatusLabel(ausencia) {
    const tipo = String(ausencia.Tipo || ausencia.tipo || '').trim().toLowerCase();
    const subtipo = normalizeSubtipo(ausencia.Subtipo || ausencia.subtipo);

    if (tipo === 'ferias') {
        return { code: 'ferias', label: 'Ferias' };
    }

    if (tipo === 'folga') {
        return { code: 'folga', label: 'Folga' };
    }

    if (subtipo === 'medico') {
        return { code: 'medico', label: 'Atestado' };
    }

    return { code: 'ausencia', label: 'Ausencia' };
}

function isTimeOverlap(startA, endA, startB, endB) {
    return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function isAusenciaOverlappingPlantao(ausencia, plantao) {
    const dataPlantao = normalizeIsoDate(plantao.dataISO, 'Data do plantao');
    const dataInicio = extractDateString(ausencia.DataInicio || ausencia.dataInicio);
    const dataFim = extractDateString(ausencia.DataFim || ausencia.dataFim);

    if (!dataInicio || !dataFim || dataPlantao < dataInicio || dataPlantao > dataFim) {
        return false;
    }

    const periodoTipo = String(ausencia.PeriodoTipo || ausencia.periodoTipo || 'dia_inteiro').trim().toLowerCase();

    if (periodoTipo !== 'horas') {
        return true;
    }

    const horaInicioAusencia = extractTimeString(ausencia.HoraInicio || ausencia.horaInicio);
    const horaFimAusencia = extractTimeString(ausencia.HoraFim || ausencia.horaFim);

    if (!horaInicioAusencia || !horaFimAusencia) {
        return true;
    }

    if (!plantao.horaInicio || !plantao.horaFim) {
        return true;
    }

    return isTimeOverlap(plantao.horaInicio, plantao.horaFim, horaInicioAusencia, horaFimAusencia);
}

function buildDisponibilidadeColaborador(colaborador, ausencias, plantao) {
    const overlapping = (ausencias || []).filter((item) => isAusenciaOverlappingPlantao(item, plantao));

    if (overlapping.length === 0) {
        return {
            id: colaborador.Id,
            nome: colaborador.Nome,
            disponivel: true,
            motivo: null,
            motivoLabel: null
        };
    }

    const sorted = [...overlapping].sort((first, second) => {
        const priorities = {
            ferias: 0,
            folga: 1,
            medico: 2,
            ausencia: 3
        };

        const firstStatus = getAusenciaStatusLabel(first);
        const secondStatus = getAusenciaStatusLabel(second);
        return priorities[firstStatus.code] - priorities[secondStatus.code];
    });

    const match = sorted[0];
    const status = getAusenciaStatusLabel(match);

    return {
        id: colaborador.Id,
        nome: colaborador.Nome,
        disponivel: false,
        motivo: status.code,
        motivoLabel: status.label,
        ausenciaId: match.Id || match.id
    };
}

module.exports = {
    buildDisponibilidadeColaborador,
    calculateAusenciaDebitMinutes,
    calculateDailyWorkMinutes,
    calculateIntervalMinutes,
    describeAusenciaMovement,
    describePlantaoMovement,
    enumerateBusinessDates,
    formatDateLabel,
    getAusenciaStatusLabel,
    isAusenciaOverlappingPlantao,
    parseBalanceInputToMinutes,
    minutesToBalanceLabel,
    minutesToDurationLabel,
    normalizeSubtipo,
    resolveDefaultDescontaBancoHoras,
    timeToMinutes
};

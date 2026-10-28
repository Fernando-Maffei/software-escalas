import { estado } from '../../core/estado.js';
import { ehTipoSemTrabalho, formatTimeInputEscala, getTimeMinutesEscala, toISODateEscala } from '../escala-dia-shared.js';
import { getScaleSortModeEscala } from './estado-e-layout.js';

function getSortableMinutesEscala(value) {
    const minutes = getTimeMinutesEscala(value);
    return minutes === null ? Number.POSITIVE_INFINITY : minutes;
}

export function compareScaleRecordsEscala(first, second) {
    const sortMode = getScaleSortModeEscala();
    const nameA = String(first.colaboradorNome || '').toLowerCase();
    const nameB = String(second.colaboradorNome || '').toLowerCase();

    if (sortMode === 'work_start') {
        const diff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
        return diff || nameA.localeCompare(nameB);
    }

    if (sortMode === 'lunch_start') {
        const diff = getSortableMinutesEscala(first.almocoInicio) - getSortableMinutesEscala(second.almocoInicio);
        if (diff) {
            return diff;
        }

        const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
        return workDiff || nameA.localeCompare(nameB);
    }

    if (sortMode === 'lunch_end') {
        const diff = getSortableMinutesEscala(first.almocoFim) - getSortableMinutesEscala(second.almocoFim);
        if (diff) {
            return diff;
        }

        const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
        return workDiff || nameA.localeCompare(nameB);
    }

    return nameA.localeCompare(nameB);
}

export function isFullDayOffEscala(record) {
    return ehTipoSemTrabalho(record?.tipo)
        && !getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
}

export function getPartialAbsenceEscala(colaboradorId, dataISO) {
    const normalizedDate = toISODateEscala(dataISO);

    return (estado.ausencias || []).find((item) => {
        const itemColaboradorId = Number(item.colaboradorId || item.ColaboradorId);
        const periodoTipo = String(item.periodoTipo || item.PeriodoTipo || 'dia_inteiro').toLowerCase();
        const inicio = toISODateEscala(item.DataInicio || item.dataInicio);
        const fim = toISODateEscala(item.DataFim || item.dataFim);

        return itemColaboradorId === Number(colaboradorId)
            && periodoTipo === 'horas'
            && inicio
            && fim
            && normalizedDate >= inicio
            && normalizedDate <= fim;
    }) || null;
}

// Trechos de cobertura de dia util que a pessoa assume alem da propria linha
// (o "segundo turno"; ver backend/services/cobertura-na-escala.js), em minutos.
export function getCoberturasEscala(record) {
    return (Array.isArray(record?.coberturas) ? record.coberturas : [])
        .map((item) => ({
            ...item,
            start: getTimeMinutesEscala(item.horaInicio),
            end: getTimeMinutesEscala(item.horaFim)
        }))
        .filter((item) => item.start !== null && item.end !== null && item.end > item.start);
}

export function getIntervalOverlapMinutesEscala(start, end, targetStart, targetEnd) {
    if (![start, end, targetStart, targetEnd].every(Number.isFinite) || end <= start || targetEnd <= targetStart) {
        return 0;
    }

    return Math.max(Math.min(end, targetEnd) - Math.max(start, targetStart), 0);
}

export function getClampedIntervalEscala(start, end, min, max) {
    if (![start, end, min, max].every(Number.isFinite) || end <= start || max <= min) {
        return null;
    }

    const clampedStart = Math.max(start, min);
    const clampedEnd = Math.min(end, max);

    if (clampedEnd <= clampedStart) {
        return null;
    }

    return {
        start: clampedStart,
        end: clampedEnd
    };
}

function mergeIntervalsEscala(intervals) {
    const sorted = intervals
        .filter(Boolean)
        .sort((first, second) => first.start - second.start || first.end - second.end);
    const merged = [];

    sorted.forEach((interval) => {
        const previous = merged[merged.length - 1];

        if (!previous || interval.start > previous.end) {
            merged.push({ ...interval });
            return;
        }

        previous.end = Math.max(previous.end, interval.end);
    });

    return merged;
}

export function hasCellClassEscala(className, expectedClass) {
    return String(className || '').split(/\s+/).includes(expectedClass);
}

export function calculateWorkedMinutesEscala(record) {
    const coberturaMinutes = getCoberturasEscala(record)
        .reduce((sum, item) => sum + (item.end - item.start), 0);

    return calculateOwnShiftMinutesEscala(record) + coberturaMinutes;
}

function calculateOwnShiftMinutesEscala(record) {
    const start = getTimeMinutesEscala(record.horaInicio);
    const end = getTimeMinutesEscala(record.horaFim);

    if (start === null || end === null || isFullDayOffEscala(record)) {
        return 0;
    }

    const total = Math.max(end - start, 0);
    const blockedIntervals = [];
    const lunchStart = getTimeMinutesEscala(record.almocoInicio);
    const lunchEnd = getTimeMinutesEscala(record.almocoFim);

    if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
        blockedIntervals.push(getClampedIntervalEscala(lunchStart, lunchEnd, start, end));
    }

    const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
    const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
    const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

    if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
        blockedIntervals.push(getClampedIntervalEscala(absenceStart, absenceEnd, start, end));
    }

    const blockedMinutes = mergeIntervalsEscala(blockedIntervals)
        .reduce((sum, interval) => sum + Math.max(interval.end - interval.start, 0), 0);

    return Math.max(total - blockedMinutes, 0);
}

function getColaboradorCadastroEscala(colaboradorId) {
    return (estado.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId)) || null;
}

export function getDefaultLunchRangeEscala(colaboradorId) {
    const colaborador = getColaboradorCadastroEscala(colaboradorId);
    const start = getTimeMinutesEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
    const end = getTimeMinutesEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

    if (start === null || end === null || end <= start) {
        return null;
    }

    return { start, end };
}

export function isSameLunchAsCadastroEscala(colaboradorId, almocoInicio, almocoFim) {
    const colaborador = getColaboradorCadastroEscala(colaboradorId);
    const cadastroInicio = formatTimeInputEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
    const cadastroFim = formatTimeInputEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

    return cadastroInicio === formatTimeInputEscala(almocoInicio)
        && cadastroFim === formatTimeInputEscala(almocoFim);
}

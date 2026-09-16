const { AppError } = require('./errors');

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function ensurePositiveInt(value, fieldName) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError(400, `${fieldName} invalido.`);
    }

    return parsed;
}

function normalizeOptionalText(value, fieldName, options = {}) {
    const { maxLength = 255 } = options;

    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    const normalized = String(value).trim();

    if (normalized.length > maxLength) {
        throw new AppError(400, `${fieldName} deve ter no maximo ${maxLength} caracteres.`);
    }

    return normalized;
}

function canonicalizeEnumValue(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_');
}

function normalizeEnum(value, fieldName, allowedValues, options = {}) {
    const { defaultValue = null } = options;

    if (value === undefined || value === null || String(value).trim() === '') {
        if (defaultValue !== null) {
            return defaultValue;
        }

        throw new AppError(400, `${fieldName} e obrigatorio.`);
    }

    const normalized = canonicalizeEnumValue(value);
    const matchedValue = allowedValues.find((allowedValue) => canonicalizeEnumValue(allowedValue) === normalized);

    if (!matchedValue) {
        throw new AppError(400, `${fieldName} invalido.`);
    }

    return matchedValue;
}

function normalizeIsoDate(value, fieldName = 'Data') {
    if (typeof value !== 'string') {
        throw new AppError(400, `${fieldName} invalida.`);
    }

    const normalized = value.trim();

    if (!ISO_DATE_REGEX.test(normalized)) {
        throw new AppError(400, `${fieldName} deve estar no formato YYYY-MM-DD.`);
    }

    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new AppError(400, `${fieldName} invalida.`);
    }

    return normalized;
}

function normalizeTime(value, fieldName = 'Horario') {
    if (typeof value !== 'string') {
        throw new AppError(400, `${fieldName} invalido.`);
    }

    const normalized = value.trim();
    const match = normalized.match(TIME_REGEX);

    if (!match) {
        throw new AppError(400, `${fieldName} deve estar no formato HH:mm ou HH:mm:ss.`);
    }

    const [, hours, minutes, seconds = '00'] = match;
    return `${hours}:${minutes}:${seconds}`;
}

function normalizeNullableTime(value, fieldName = 'Horario') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }

    return normalizeTime(value, fieldName);
}

function toSqlTime(value, fieldName = 'Horario') {
    if (!value) {
        return null;
    }

    const normalized = normalizeTime(value, fieldName);
    const [hours, minutes, seconds] = normalized.split(':').map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
}

function compareTimes(firstTime, secondTime) {
    return normalizeTime(firstTime).localeCompare(normalizeTime(secondTime));
}

function buildDateRange(startDate, endDate, options = {}) {
    const {
        startLabel = 'Data inicial',
        endLabel = 'Data final'
    } = options;

    const dataInicio = normalizeIsoDate(startDate, startLabel);
    const dataFim = normalizeIsoDate(endDate, endLabel);

    if (dataFim < dataInicio) {
        throw new AppError(400, `${endLabel} deve ser maior ou igual a ${startLabel.toLowerCase()}.`);
    }

    return { dataInicio, dataFim };
}

function validateWorkSchedule(schedule) {
    const {
        trabalhoInicio,
        trabalhoFim,
        almocoInicio,
        almocoFim
    } = schedule;

    const hasWorkStart = Boolean(trabalhoInicio);
    const hasWorkEnd = Boolean(trabalhoFim);
    const hasLunchStart = Boolean(almocoInicio);
    const hasLunchEnd = Boolean(almocoFim);

    if (hasWorkStart !== hasWorkEnd) {
        throw new AppError(400, 'Preencha inicio e fim do trabalho.');
    }

    if (hasLunchStart !== hasLunchEnd) {
        throw new AppError(400, 'Preencha inicio e fim do almoco.');
    }

    if (hasWorkStart && compareTimes(trabalhoInicio, trabalhoFim) >= 0) {
        throw new AppError(400, 'O horario de inicio do trabalho deve ser menor que o horario de fim.');
    }

    if (hasLunchStart && compareTimes(almocoInicio, almocoFim) >= 0) {
        throw new AppError(400, 'O horario de inicio do almoco deve ser menor que o horario de fim.');
    }

    if (hasWorkStart && hasLunchStart) {
        const lunchStartsBeforeWork = compareTimes(almocoInicio, trabalhoInicio) <= 0;
        const lunchEndsAfterWork = compareTimes(almocoFim, trabalhoFim) >= 0;

        if (lunchStartsBeforeWork || lunchEndsAfterWork) {
            throw new AppError(400, 'O horario de almoco deve estar dentro da jornada de trabalho.');
        }
    }
}

function normalizeNumericArray(values, fieldName = 'Valor') {
    if (!Array.isArray(values)) {
        throw new AppError(400, `${fieldName} invalido.`);
    }

    return [...new Set(values.map((value) => ensurePositiveInt(value, fieldName)))].sort((a, b) => a - b);
}

function normalizeBoolean(value, fieldName = 'Valor booleano', options = {}) {
    const { defaultValue = null } = options;

    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        if (value === 1) {
            return true;
        }

        if (value === 0) {
            return false;
        }
    }

    const normalized = String(value).trim().toLowerCase();

    if (['true', '1', 'sim', 'yes'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) {
        return false;
    }

    throw new AppError(400, `${fieldName} invalido.`);
}

function extractDateString(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        if (ISO_DATE_REGEX.test(value)) {
            return value;
        }

        if (value.includes('T')) {
            return value.split('T')[0];
        }
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const isUtcMidnight = value.getUTCHours() === 0
            && value.getUTCMinutes() === 0
            && value.getUTCSeconds() === 0
            && value.getUTCMilliseconds() === 0;
        const isLocalMidnight = value.getHours() === 0
            && value.getMinutes() === 0
            && value.getSeconds() === 0
            && value.getMilliseconds() === 0;
        const useUtcDate = isUtcMidnight && !isLocalMidnight;
        const year = useUtcDate ? value.getUTCFullYear() : value.getFullYear();
        const month = String((useUtcDate ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, '0');
        const day = String(useUtcDate ? value.getUTCDate() : value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return null;
}

function extractTimeString(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const isTimeOnlyDate = value.getUTCFullYear() === 1970
            && value.getUTCMonth() === 0
            && value.getUTCDate() === 1;
        const hours = String(isTimeOnlyDate ? value.getUTCHours() : value.getHours()).padStart(2, '0');
        const minutes = String(isTimeOnlyDate ? value.getUTCMinutes() : value.getMinutes()).padStart(2, '0');
        const seconds = String(isTimeOnlyDate ? value.getUTCSeconds() : value.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    const raw = String(value).trim();
    const isoMatch = raw.match(/T(\d{2}:\d{2}(?::\d{2})?)/);

    if (isoMatch) {
        return normalizeTime(isoMatch[1]);
    }

    if (TIME_REGEX.test(raw)) {
        return normalizeTime(raw);
    }

    return null;
}

module.exports = {
    buildDateRange,
    compareTimes,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeNumericArray,
    normalizeOptionalText,
    normalizeTime,
    toSqlTime,
    validateWorkSchedule
};

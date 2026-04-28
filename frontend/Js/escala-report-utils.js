(function createEscalaReportUtils(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }

    root.EscalaReportUtils = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildEscalaReportUtils() {
    const DIA_LABELS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

    function padNumber(value) {
        return String(value).padStart(2, '0');
    }

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
        const month = padNumber(date.getMonth() + 1);
        const day = padNumber(date.getDate());
        return `${year}-${month}-${day}`;
    }

    function formatDatePtBr(dataISO) {
        const normalized = toISODate(dataISO);

        if (!normalized) {
            return '--';
        }

        const [year, month, day] = normalized.split('-');
        return `${day}/${month}/${year}`;
    }

    function formatTimeInput(value) {
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

    function getTimeMinutes(value) {
        const formatted = formatTimeInput(value);

        if (!formatted) {
            return null;
        }

        const [hours, minutes] = formatted.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    function formatCompactTime(value) {
        const formatted = formatTimeInput(value);

        if (!formatted) {
            return '--';
        }

        const [hours, minutes] = formatted.split(':');
        return minutes === '00'
            ? `${Number(hours)}h`
            : `${hours}:${minutes}`;
    }

    function formatCompactRange(start, end) {
        const formattedStart = formatTimeInput(start);
        const formattedEnd = formatTimeInput(end);

        if (!formattedStart || !formattedEnd) {
            return '--';
        }

        return `${formatCompactTime(formattedStart)} - ${formatCompactTime(formattedEnd)}`;
    }

    function getIsoDayOfWeek(dataISO) {
        const normalized = toISODate(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function getMonthLength(year, month) {
        return new Date(year, month, 0).getDate();
    }

    function normalizeBoardRecord(record) {
        return {
            dataISO: toISODate(record?.dataISO || record?.DataISO || record?.data || record?.Data),
            colaboradorNome: String(record?.colaboradorNome || record?.ColaboradorNome || record?.Nome || record?.nome || '--').trim() || '--',
            horaInicio: formatTimeInput(record?.horaInicio || record?.HoraInicio || record?.hora_inicio),
            horaFim: formatTimeInput(record?.horaFim || record?.HoraFim || record?.hora_fim),
            almocoInicio: formatTimeInput(record?.almocoInicio || record?.AlmocoInicio || record?.almoco_inicio),
            almocoFim: formatTimeInput(record?.almocoFim || record?.AlmocoFim || record?.almoco_fim),
            tipo: String(record?.tipo || record?.Tipo || 'normal').trim().toLowerCase()
        };
    }

    function hasWorkSchedule(record) {
        return Boolean(record?.horaInicio && record?.horaFim);
    }

    function shouldIncludeBoardRecord(record) {
        if (!record || !hasWorkSchedule(record)) {
            return false;
        }

        if (record.tipo === 'folga' || record.tipo === 'ferias') {
            return false;
        }

        return true;
    }

    function compareBoardRecords(first, second) {
        const firstLunch = getTimeMinutes(first.almocoInicio);
        const secondLunch = getTimeMinutes(second.almocoInicio);

        if (firstLunch === null && secondLunch !== null) {
            return 1;
        }

        if (firstLunch !== null && secondLunch === null) {
            return -1;
        }

        if (firstLunch !== secondLunch) {
            return (firstLunch || 0) - (secondLunch || 0);
        }

        const firstStart = getTimeMinutes(first.horaInicio);
        const secondStart = getTimeMinutes(second.horaInicio);

        if (firstStart === null && secondStart !== null) {
            return 1;
        }

        if (firstStart !== null && secondStart === null) {
            return -1;
        }

        if (firstStart !== secondStart) {
            return (firstStart || 0) - (secondStart || 0);
        }

        return String(first.colaboradorNome || '').localeCompare(String(second.colaboradorNome || ''), 'pt-BR', {
            sensitivity: 'base'
        });
    }

    function applyRowspan(rows, labelKey, showKey, rowspanKey) {
        let index = 0;

        while (index < rows.length) {
            const currentLabel = rows[index][labelKey];
            let end = index + 1;

            while (end < rows.length && rows[end][labelKey] === currentLabel) {
                end += 1;
            }

            rows[index][showKey] = true;
            rows[index][rowspanKey] = end - index;

            for (let current = index + 1; current < end; current += 1) {
                rows[current][showKey] = false;
                rows[current][rowspanKey] = 0;
            }

            index = end;
        }

        return rows;
    }

    function buildBoardRows(items) {
        const rows = [...(items || [])]
            .sort(compareBoardRecords)
            .map((item) => ({
                dataISO: item.dataISO,
                colaboradorNome: item.colaboradorNome,
                almocoLabel: formatCompactRange(item.almocoInicio, item.almocoFim),
                jornadaLabel: formatCompactRange(item.horaInicio, item.horaFim),
                showAlmoco: true,
                almocoRowspan: 1,
                showJornada: true,
                jornadaRowspan: 1
            }));

        applyRowspan(rows, 'almocoLabel', 'showAlmoco', 'almocoRowspan');
        applyRowspan(rows, 'jornadaLabel', 'showJornada', 'jornadaRowspan');

        return rows;
    }

    function buildEscalaQuadroMensal(items, options = {}) {
        const year = Number(options.year);
        const month = Number(options.month);

        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            throw new TypeError('Mes e ano validos sao obrigatorios para montar o quadro mensal.');
        }

        const monthPrefix = `${year}-${padNumber(month)}-`;
        const itemsByDay = new Map();

        for (const rawItem of Array.isArray(items) ? items : []) {
            const item = normalizeBoardRecord(rawItem);

            if (!item.dataISO || !item.dataISO.startsWith(monthPrefix) || getIsoDayOfWeek(item.dataISO) === 0) {
                continue;
            }

            if (!shouldIncludeBoardRecord(item)) {
                continue;
            }

            if (!itemsByDay.has(item.dataISO)) {
                itemsByDay.set(item.dataISO, []);
            }

            itemsByDay.get(item.dataISO).push(item);
        }

        const days = [];
        const totalDays = getMonthLength(year, month);

        for (let day = 1; day <= totalDays; day += 1) {
            const dataISO = `${year}-${padNumber(month)}-${padNumber(day)}`;

            if (getIsoDayOfWeek(dataISO) === 0) {
                continue;
            }

            const rows = buildBoardRows(itemsByDay.get(dataISO) || []);
            days.push({
                dataISO,
                dateLabel: formatDatePtBr(dataISO),
                dayLabel: DIA_LABELS[getIsoDayOfWeek(dataISO)] || '',
                hasScale: rows.length > 0,
                rows
            });
        }

        return days;
    }

    function buildEscalaQuadroCalendarWeeks(days) {
        const sortedDays = [...(Array.isArray(days) ? days : [])].sort((first, second) => String(first?.dataISO || '').localeCompare(String(second?.dataISO || '')));
        const weeks = [];
        let currentWeek = Array(6).fill(null);

        sortedDays.forEach((day) => {
            const weekday = getIsoDayOfWeek(day?.dataISO);

            if (weekday < 1 || weekday > 6) {
                return;
            }

            currentWeek[weekday - 1] = day;

            if (weekday === 6) {
                weeks.push(currentWeek);
                currentWeek = Array(6).fill(null);
            }
        });

        if (currentWeek.some(Boolean)) {
            weeks.push(currentWeek);
        }

        return weeks;
    }

    function buildEscalaQuadroCalendarSlots(days) {
        return buildEscalaQuadroCalendarWeeks(days).flat();
    }

    return {
        buildEscalaQuadroMensal,
        buildEscalaQuadroCalendarSlots,
        buildEscalaQuadroCalendarWeeks,
        compareBoardRecords,
        formatCompactRange,
        formatCompactTime,
        formatDatePtBr,
        formatTimeInput,
        getIsoDayOfWeek,
        normalizeBoardRecord,
        shouldIncludeBoardRecord
    };
}));

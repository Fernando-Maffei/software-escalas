import { escapeHtml } from '../../lib/html-seguro.js';
import * as EscalaReportUtils from '../../lib/escala-report-utils.js';

function getEscalaExportDayRowCount(day) {
    return Array.isArray(day?.rows) ? day.rows.length : 0;
}

function applyEscalaExportRowspan(rows, labelKey, showKey, rowspanKey, groupKey) {
    let index = 0;

    while (index < rows.length) {
        const currentLabel = rows[index][labelKey];
        const currentGroup = groupKey ? rows[index][groupKey] : undefined;
        let end = index + 1;

        while (end < rows.length && rows[end][labelKey] === currentLabel
            && (!groupKey || rows[end][groupKey] === currentGroup)) {
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

export function sliceEscalaExportDayRows(day, startIndex, maxRows) {
    if (!day || !Array.isArray(day.rows)) {
        return day;
    }

    const rows = day.rows.slice(startIndex, startIndex + maxRows).map((row) => ({ ...row }));

    applyEscalaExportRowspan(rows, 'almocoLabel', 'showAlmoco', 'almocoRowspan', 'almocoForaDoCadastro');
    applyEscalaExportRowspan(rows, 'jornadaLabel', 'showJornada', 'jornadaRowspan');

    return {
        ...day,
        rows,
        hasScale: rows.length > 0
    };
}

export function buildEscalaExportHolidayMap(feriados) {
    const map = new Map();

    (Array.isArray(feriados) ? feriados : []).forEach((item) => {
        const dataISO = String(item?.dataISO || item?.Data || item?.data || '').split('T')[0];

        if (!dataISO) {
            return;
        }

        const nome = String(item?.nome || item?.Nome || 'Feriado').trim() || 'Feriado';

        if (!map.has(dataISO)) {
            map.set(dataISO, nome);
        }
    });

    return map;
}

// O quadro mostra SEMPRE os sete dias, mesmo com o domingo vazio: uma folha
// de seis colunas, terminando no sabado, nao deixava o leitor distinguir
// "domingo vazio" de "domingo fora do relatorio".
export function getEscalaExportWeekSlots(week) {
    return Array.from({ length: 7 }, (_, index) => week?.[index] || null);
}

export function getEscalaExportEntryMaxRows(weeks) {
    return Math.max(0, ...weeks.flatMap((week) => (
        getEscalaExportWeekSlots(week).map((day) => getEscalaExportDayRowCount(day))
    )));
}

// Quantas linhas cabem no dia mais cheio de uma folha com N linhas de
// semana. Menos semanas na folha = mais altura para cada dia. Os valores
// sao calibrados por medicao: renderizando a folha e verificando quando
// .escala-sheet-day (que tem overflow: hidden) comeca a cortar conteudo.
export function getMonthlyEscalaOnePageMaxRows(weekCount) {
    const CAPACIDADE_POR_SEMANAS = { 1: 70, 2: 38, 3: 25, 4: 18, 5: 14, 6: 13 };
    return CAPACIDADE_POR_SEMANAS[Math.min(6, Math.max(1, Number(weekCount) || 1))];
}

function shouldShowEscalaSheetLunchColumn(day, weekDayIndex) {
    if (weekDayIndex >= 5) {
        return (Array.isArray(day?.rows) ? day.rows : []).some((row) => {
            const label = String(row?.almocoLabel || '').trim();
            return label && label !== '--';
        });
    }

    return true;
}

// Nome em vermelho so no lancamento de plantao em domingo ou feriado.
// Sabado e trabalho normal (vai para o banco de horas) e quem tem o domingo
// na jornada semanal (linha 'normal') tambem nao e destacado.
function isEscalaSheetDomingoOuFeriado(day, holidayLabel) {
    if (holidayLabel) {
        return true;
    }

    const utils = EscalaReportUtils;
    return Boolean(day?.dataISO && utils && utils.getIsoDayOfWeek(day.dataISO) === 0);
}

// O nome tambem acompanha o almoco fora do cadastro: so a celula do
// almoco vermelha nao deixava claro de quem era o horario alterado.
function isEscalaSheetNomeDestacado(row, domingoOuFeriado) {
    if (row?.almocoForaDoCadastro) {
        return true;
    }

    return domingoOuFeriado && String(row?.tipo || '').toLowerCase() === 'plantao';
}

export function renderEscalaSheetDayTable(day, options = {}) {
    if (!day) {
        return '<article class="escala-sheet-day is-placeholder" aria-hidden="true"></article>';
    }

    const holidayLabel = options.holidayMap?.get(day.dataISO);
    const weekDayIndex = Number(options.weekDayIndex) || 0;
    const includeLunch = shouldShowEscalaSheetLunchColumn(day, weekDayIndex);
    const columnCount = includeLunch ? 3 : 2;
    const rows = Array.isArray(day.rows) ? day.rows : [];
    const hasRows = day.hasScale && rows.length > 0;
    const emptyLabel = holidayLabel ? 'FERIADO' : 'Sem escala';
    const titleAttribute = holidayLabel ? ` title="${escapeHtml(holidayLabel)}"` : '';
    const domingoOuFeriado = isEscalaSheetDomingoOuFeriado(day, holidayLabel);

    return `
            <article class="escala-sheet-day${hasRows ? '' : ' is-empty'}${holidayLabel ? ' is-holiday' : ''}">
                <div class="escala-sheet-day-date"${titleAttribute}>${escapeHtml(day.dateLabel || '--')}</div>
                <table class="escala-sheet-table">
                    <colgroup>
                        ${includeLunch
                        ? '<col style="width:29%"><col style="width:41%"><col style="width:30%">'
                        : '<col style="width:66%"><col style="width:34%">'}
                    </colgroup>
                    <thead>
                        <tr>
                            ${includeLunch ? '<th>Almoco</th>' : ''}
                            <th>Colaborador</th>
                            <th>Jornada</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${hasRows ? rows.map((row) => `
                            <tr>
                                ${includeLunch && row.showAlmoco ? `<td rowspan="${row.almocoRowspan || 1}" class="escala-sheet-group${row.almocoForaDoCadastro ? ' is-destaque' : ''}">${escapeHtml(row.almocoLabel || '--')}</td>` : ''}
                                <td class="escala-sheet-name${isEscalaSheetNomeDestacado(row, domingoOuFeriado) ? ' is-destaque' : ''}">${escapeHtml(row.colaboradorNome || '--')}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan || 1}" class="escala-sheet-group">${escapeHtml(row.jornadaLabel || '--')}</td>` : ''}
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="${columnCount}" class="escala-sheet-empty">${escapeHtml(emptyLabel)}</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </article>
        `;
}

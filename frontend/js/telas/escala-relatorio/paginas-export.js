import { escapeHtml } from '../../lib/html-seguro.js';
import { ESCALA_QUADRO_WEEKDAY_HEADERS, formatDatePtBrEscala, getDayLabelEscala, TIPO_LABELS } from '../escala-dia-shared.js';
import { groupEscalaItemsBySetor } from './agrupamento-setor.js';
import { renderEscalaExportStats, renderEscalaHolidayList } from './feriados-export.js';
import { getRelatorioEscalaSetorNome } from './filtros.js';
import { buildEscalaExportHolidayMap, getEscalaExportEntryMaxRows, getEscalaExportWeekSlots, getMonthlyEscalaOnePageMaxRows, renderEscalaSheetDayTable, sliceEscalaExportDayRows } from './folha-helpers.js';
import { formatEscalaMonthHeading } from './quadro-mensal.js';
import { chunkEscalaItems } from './relatorio-detalhado.js';
import { escolherBlocosDeSemanasPlantao } from './snapshot-export.js';

function buildMonthlyEscalaExportPageEntries(snapshot) {
    // Uma semana sozinha na folha comporta ate essa quantidade de linhas no
    // dia mais cheio; e o tamanho de cada fatia quando nem isso basta.
    const maxRowsPerWeekDay = getMonthlyEscalaOnePageMaxRows(1);
    const sectorEntries = Array.isArray(snapshot.setorGroups) && snapshot.setorGroups.length > 0
        ? snapshot.setorGroups
        : [{
            setorNome: 'Sem setor',
            calendarWeeks: Array.isArray(snapshot.calendarWeeks) ? snapshot.calendarWeeks : []
        }];

    return sectorEntries.flatMap((sector) => {
        const weeks = Array.isArray(sector.calendarWeeks) && sector.calendarWeeks.length > 0
            ? sector.calendarWeeks
            : [Array(7).fill(null)];
        // O atalho que jogava o mes todo numa folha saiu: ele passava por
        // cima do teto de semanas por folha e era justamente o que deixava
        // o quadro miudo demais para ler.

        // Nao cabendo tudo em uma folha, procura o MENOR numero de folhas em
        // que todas as semanas cabem, dividindo o mes em blocos iguais.
        // Antes o codigo pulava direto para "uma semana por pagina", e so
        // emparelhava duas se ambas tivessem <= 12 linhas — o que nunca
        // acontece justamente nos meses cheios. Dai um setor de 15 pessoas
        // sair em 5 folhas, e um mes de 6 semanas sair em 3 mesmo com 11.
        // Menos semanas por folha = mais altura para cada dia, entao a
        // divisao ganha capacidade sem precisar encolher a fonte.
        const blocosPorPagina = escolherBlocosDeSemanasPlantao(weeks);

        if (blocosPorPagina) {
            return blocosPorPagina.map((bloco, indice) => {
                const inicio = blocosPorPagina
                    .slice(0, indice)
                    .reduce((total, anterior) => total + anterior.length, 0);
                const fim = inicio + bloco.length - 1;

                return {
                    sector,
                    weeks: bloco,
                    kind: bloco.length > 1 ? 'weeks' : 'week',
                    weekIndex: inicio,
                    endWeekIndex: fim,
                    label: bloco.length === weeks.length
                        ? 'Mes completo'
                        : (bloco.length > 1
                            ? `Semanas ${inicio + 1}-${fim + 1}`
                            : `Semana ${inicio + 1}`)
                };
            });
        }

        // Nenhuma divisao resolve: ha um dia com mais linhas do que cabe
        // numa folha inteira. Ai cada semana vai numa folha, e a que nao
        // cabe e fatiada em partes.
        return weeks.flatMap((week, weekIndex) => {
            const currentWeek = Array.isArray(week) ? week : Array(7).fill(null);
            const partCount = Math.max(1, Math.ceil(getEscalaExportEntryMaxRows([currentWeek]) / maxRowsPerWeekDay));

            if (partCount === 1) {
                return [{
                    sector,
                    weeks: [currentWeek],
                    kind: 'week',
                    weekIndex,
                    endWeekIndex: weekIndex,
                    label: `Semana ${weekIndex + 1}`
                }];
            }

            return Array.from({ length: partCount }, (_, partIndex) => ({
                sector,
                weeks: [currentWeek.map((day) => sliceEscalaExportDayRows(day, partIndex * maxRowsPerWeekDay, maxRowsPerWeekDay))],
                kind: 'week',
                weekIndex,
                partIndex,
                partCount,
                label: `Semana ${weekIndex + 1} - parte ${partIndex + 1}`
            }));
        });
    });
}

export function renderMonthlyEscalaExportPages(snapshot) {
    const pageEntries = buildMonthlyEscalaExportPageEntries(snapshot);
    const holidayMap = buildEscalaExportHolidayMap(snapshot.feriados);
    const pageTitle = formatEscalaMonthHeading(snapshot.filters?.month, snapshot.filters?.year);

    // A densidade (tamanho da fonte) nao e escolhida aqui: sai da medicao
    // da folha ja montada, em ajustarDensidadeFolhasEscala.
    return pageEntries.map((entry, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-month-page">
                <div class="escala-sheet-title">${escapeHtml(pageTitle)}</div>
                <div class="escala-sheet-meta">
                    <strong>Setor: ${escapeHtml(entry.sector.setorNome || 'Sem setor')}</strong>
                    <span>${escapeHtml(entry.label)} - Pagina ${pageIndex + 1} de ${pageEntries.length}</span>
                </div>
                <div class="escala-sheet-weekdays" style="--weekday-count:7;">
                    ${ESCALA_QUADRO_WEEKDAY_HEADERS.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}
                </div>
                <div class="escala-sheet-grid" style="--weekday-count:7; --week-count:${entry.weeks.length || 1};">
                    ${entry.weeks.flatMap((week) => (
                    getEscalaExportWeekSlots(week).map((day, weekDayIndex) => renderEscalaSheetDayTable(day, {
                        weekDayIndex,
                        holidayMap
                    }))
                )).join('')}
                </div>
            </section>
        `).join('');
}

export function renderDetailedEscalaExportPages(snapshot) {
    const setorGroups = Array.isArray(snapshot.setorGroups) && snapshot.setorGroups.length > 0
        ? snapshot.setorGroups
        : groupEscalaItemsBySetor(snapshot.items);
    const pageEntries = [];

    (setorGroups.length > 0 ? setorGroups : [{ setorNome: 'Sem setor', items: [] }]).forEach((sector) => {
        const chunks = chunkEscalaItems(sector.items, 22);
        const pages = chunks.length > 0 ? chunks : [[]];

        pages.forEach((group, sectorPageIndex) => {
            pageEntries.push({
                sector,
                group,
                sectorPageIndex,
                sectorPageCount: pages.length
            });
        });
    });

    return pageEntries.map((entry, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-detailed">
                <div class="escala-export-header">
                    <h1>${escapeHtml(snapshot.title)}</h1>
                    <p>Pagina ${pageIndex + 1} de ${pageEntries.length}</p>
                </div>
                ${pageIndex === 0 ? `
                    <div class="escala-export-summary">
                        <span>Periodo: <strong>${escapeHtml(formatDatePtBrEscala(snapshot.filters.dataInicio))}</strong> ate <strong>${escapeHtml(formatDatePtBrEscala(snapshot.filters.dataFim))}</strong></span>
                        ${snapshot.filters.setorId ? `<span>Setor: <strong>${escapeHtml(snapshot.filters.setorNome || getRelatorioEscalaSetorNome(snapshot.filters.setorId))}</strong></span>` : ''}
                        <span>Registros: <strong>${snapshot.items.length}</strong></span>
                        <span>Setores: <strong>${setorGroups.length}</strong></span>
                    </div>
                    ${renderEscalaExportStats(snapshot.stats)}
                    ${renderEscalaHolidayList(snapshot.feriados)}
                ` : ''}
                <div class="relatorio-setor-header escala-export-setor-header">
                    <span>Setor: ${escapeHtml(entry.sector.setorNome || 'Sem setor')}</span>
                    <strong>${entry.sector.items.length} registro(s)</strong>
                </div>
                <table class="relatorio-tabela escala-detalhada-tabela escala-export-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Dia</th>
                            <th>Colaborador</th>
                            <th>Entrada</th>
                            <th>Saida</th>
                            <th>Almoco</th>
                            <th>Tipo</th>
                            <th>Observacoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entry.group.map((item) => `
                            <tr>
                                <td><strong>${escapeHtml(formatDatePtBrEscala(item.dataISO))}</strong></td>
                                <td>${escapeHtml(item.diaSemana || getDayLabelEscala(item.dataISO))}</td>
                                <td>${escapeHtml(item.colaboradorNome || '--')}</td>
                                <td>${escapeHtml(item.horaInicio || '--')}</td>
                                <td>${escapeHtml(item.horaFim || '--')}</td>
                                <td>${escapeHtml(item.almoco || '--')}</td>
                                <td>${escapeHtml(TIPO_LABELS[item.tipo] || item.tipo || '--')}</td>
                                <td>${escapeHtml(item.observacao || '--')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
        `).join('');
}

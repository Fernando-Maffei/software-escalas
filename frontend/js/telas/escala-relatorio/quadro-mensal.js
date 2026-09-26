 
// Motor de Relatorio de Escala: dois submodos, Quadro Mensal e Detalhado, mais a
// geracao de PDF/export compartilhada entre eles. Depende de
// frontend/js/telas/escala-dia-shared.js (deve carregar antes deste arquivo).
// Script global (sem IIFE) de proposito: o Relatorio de Plantoes que ficou em
// core/runtime/ chama varias funcoes internas daqui por nome solto
// (buildSetorOptionsRelatorioEscala, buildTipoOptionsEscala, buildColaboradorOptionsEscala,
// toggleEscalaReportModeFilters).

    function getEscalaReportMode() {
        return document.getElementById('relatorioEscalaModo')?.value || RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;
    }

    function toggleEscalaReportModeFilters() {
        const currentMode = getEscalaReportMode();

        document.querySelectorAll('[data-escala-report-mode]').forEach((section) => {
            section.classList.toggle('is-active', section.dataset.escalaReportMode === currentMode);
        });
    }

    function getEscalaMonthlyFilters() {
        const month = parseInt(document.getElementById('relatorioEscalaMes')?.value, 10);
        const year = parseInt(document.getElementById('relatorioEscalaAno')?.value, 10);

        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2035) {
            return null;
        }

        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const bounds = getMonthBoundsEscala(start);
        const setorId = getRelatorioEscalaSetorId();

        return {
            month,
            year,
            dataInicio: bounds.start,
            dataFim: bounds.end,
            setorId,
            setorNome: getRelatorioEscalaSetorNome(setorId)
        };
    }

    function getEscalaCalendarSlots(boardUtils, days) {
        if (boardUtils && typeof boardUtils.buildEscalaQuadroCalendarSlots === 'function') {
            return boardUtils.buildEscalaQuadroCalendarSlots(days);
        }

        return Array.isArray(days) ? days : [];
    }

    function getEscalaCalendarWeeks(boardUtils, days) {
        if (boardUtils && typeof boardUtils.buildEscalaQuadroCalendarWeeks === 'function') {
            return boardUtils.buildEscalaQuadroCalendarWeeks(days);
        }

        const slots = getEscalaCalendarSlots(boardUtils, days);
        const weeks = [];

        for (let index = 0; index < slots.length; index += 7) {
            weeks.push(slots.slice(index, index + 7));
        }

        return weeks.length > 0 ? weeks : [Array(7).fill(null)];
    }

    function formatEscalaMonthHeading(month, year) {
        const label = String(MESES_LABELS[Number(month) - 1] || month).toUpperCase();
        return `${label} DE ${year}`;
    }

    function renderEscalaQuadroDayCard(day, options = {}) {
        if (!day) {
            const placeholderClassName = options.placeholderClassName || 'escala-quadro-dia-placeholder';
            return `<article class="${placeholderClassName}" aria-hidden="true"></article>`;
        }

        const emptyClassName = day.hasScale ? '' : ' is-empty';
        const titleAttribute = day.dayLabel ? ` title="${escapeHtml(day.dayLabel)}"` : '';

        return `
            <article class="escala-quadro-dia${emptyClassName}">
                <div class="escala-quadro-dia-header"${titleAttribute}>
                    ${escapeHtml(day.dateLabel)}
                </div>
                <table class="escala-quadro-tabela">
                    <thead>
                        <tr>
                            <th>Almoco</th>
                            <th>Colaborador</th>
                            <th>Jornada</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${day.hasScale ? day.rows.map((row) => `
                            <tr>
                                ${row.showAlmoco ? `<td rowspan="${row.almocoRowspan}" class="escala-quadro-grupo">${escapeHtml(row.almocoLabel)}</td>` : ''}
                                <td>${escapeHtml(row.colaboradorNome)}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan}" class="escala-quadro-grupo">${escapeHtml(row.jornadaLabel)}</td>` : ''}
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="3" class="escala-quadro-sem-escala">Sem escala</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </article>
        `;
    }


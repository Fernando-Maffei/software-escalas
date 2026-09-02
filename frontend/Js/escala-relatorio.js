/* eslint-disable */
// Motor de Relatorio de Escala: dois submodos, Quadro Mensal e Detalhado, mais a
// geracao de PDF/export compartilhada entre eles. Depende de
// frontend/Js/escala-dia-shared.js (deve carregar antes deste arquivo).
// Script global (sem IIFE) de proposito: o Relatorio de Plantoes que ficou em
// runtime-fixes.js chama varias funcoes internas daqui por nome solto
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
        const titleAttribute = day.dayLabel ? ` title="${escapeHtmlEscala(day.dayLabel)}"` : '';

        return `
            <article class="escala-quadro-dia${emptyClassName}">
                <div class="escala-quadro-dia-header"${titleAttribute}>
                    ${escapeHtmlEscala(day.dateLabel)}
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
                                ${row.showAlmoco ? `<td rowspan="${row.almocoRowspan}" class="escala-quadro-grupo">${escapeHtmlEscala(row.almocoLabel)}</td>` : ''}
                                <td>${escapeHtmlEscala(row.colaboradorNome)}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan}" class="escala-quadro-grupo">${escapeHtmlEscala(row.jornadaLabel)}</td>` : ''}
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

    function renderEscalaQuadroCalendarTable(weeks, options = {}) {
        const normalizedWeeks = Array.isArray(weeks) && weeks.length > 0
            ? weeks.map((week) => Array.from({ length: 7 }, (_, index) => week?.[index] || null))
            : [Array(7).fill(null)];
        const wrapperClassName = options.wrapperClassName || 'escala-quadro-calendario';
        const titleClassName = options.titleClassName || 'escala-quadro-calendario-titulo';
        const tableClassName = options.tableClassName || 'escala-quadro-calendario-tabela';
        const cellClassName = options.cellClassName || 'escala-quadro-calendario-celula';
        const denseClassName = normalizedWeeks.length >= 6 ? ' is-dense' : '';
        const titleHtml = options.heading
            ? `<div class="${titleClassName}">${escapeHtmlEscala(options.heading)}</div>`
            : '';

        return `
            <div class="${wrapperClassName}${denseClassName}">
                ${titleHtml}
                <div class="escala-quadro-calendario-scroll">
                    <table class="${tableClassName}${denseClassName}">
                        <thead>
                            <tr>
                                ${ESCALA_QUADRO_WEEKDAY_HEADERS.map((label) => `<th scope="col">${escapeHtmlEscala(label)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${normalizedWeeks.map((week) => `
                                <tr>
                                    ${week.map((day) => `
                                        <td class="${cellClassName}${day ? '' : ' is-empty'}">
                                            ${day ? renderEscalaQuadroDayCard(day) : ''}
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function getEscalaSetorNome(item) {
        const nome = item?.setorNome ?? item?.SetorNome ?? item?.setor ?? item?.Setor;
        const normalized = String(nome ?? '').trim();
        return normalized || 'Sem setor';
    }

    function getEscalaSetorKey(item) {
        const id = item?.setorId ?? item?.SetorId;

        if (id !== undefined && id !== null && String(id).trim() !== '') {
            return `id:${String(id).trim()}`;
        }

        return `nome:${getEscalaSetorNome(item).toLowerCase()}`;
    }

    function groupEscalaItemsBySetor(items, options = {}) {
        const source = Array.isArray(items) ? items : [];
        const groups = new Map();

        source.forEach((item) => {
            const key = getEscalaSetorKey(item);

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    setorNome: getEscalaSetorNome(item),
                    items: []
                });
            }

            groups.get(key).items.push(item);
        });

        const result = [...groups.values()].sort((first, second) => (
            first.setorNome.localeCompare(second.setorNome, 'pt-BR', { sensitivity: 'base' })
        ));

        if (result.length === 0 && options.includeEmpty) {
            return [{
                key: 'sem-setor',
                setorNome: 'Sem setor',
                items: []
            }];
        }

        return result;
    }

    function normalizeEscalaReportItems(items) {
        return (Array.isArray(items) ? items : []).map((item) => ({
            ...item,
            tipo: window.normalizeRuntimeEscalaTipo(item.tipo || item.Tipo || 'normal'),
            setorNome: getEscalaSetorNome(item)
        }));
    }

    function renderMonthlyEscalaReport(items, filters) {
        const boardUtils = window.EscalaReportUtils;

        if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Os utilitarios do quadro mensal nao foram carregados.</p>
                </div>
            `;
        }

        const normalizedItems = normalizeEscalaReportItems(items);
        const setorGroups = groupEscalaItemsBySetor(normalizedItems, { includeEmpty: true }).map((group) => {
            const days = boardUtils.buildEscalaQuadroMensal(group.items, {
                month: filters.month,
                year: filters.year
            });

            return {
                ...group,
                days,
                calendarSlots: getEscalaCalendarSlots(boardUtils, days),
                daysWithScale: days.filter((day) => day.hasScale).length,
                totalRows: days.reduce((sum, day) => sum + day.rows.length, 0)
            };
        });
        const daysWithScale = setorGroups.reduce((sum, group) => sum + group.daysWithScale, 0);
        const totalRows = setorGroups.reduce((sum, group) => sum + group.totalRows, 0);

        return `
            <div class="escala-quadro-mensal">
                ${renderRelatorioEscalaFiltrosAtivos(filters)}
                <div class="relatorio-total" hidden>
                    Mes: <strong>${escapeHtmlEscala(MESES_LABELS[filters.month - 1] || filters.month)}/${escapeHtmlEscala(filters.year)}</strong>
                    • Setores: <strong>${setorGroups.length}</strong>
                    • Dias com escala: <strong>${daysWithScale}</strong>
                    • Linhas listadas: <strong>${totalRows}</strong>
                </div>
                ${setorGroups.map((group) => `
                    <section class="relatorio-setor-section">
                        <div class="relatorio-setor-header">
                            <span><i class="fas fa-layer-group"></i> ${escapeHtmlEscala(group.setorNome)}</span>
                            <strong>${group.totalRows} registro(s)</strong>
                        </div>
                        <div class="escala-quadro-grid escala-quadro-grid-calendario">
                            ${group.calendarSlots.map((day) => renderEscalaQuadroDayCard(day)).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
        `;
    }


    function buildColaboradorOptionsEscala(selectedId = '') {
        return `
            <option value="">Todos os colaboradores</option>
            ${(window.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(item.Nome)}
                </option>
            `).join('')}
        `;
    }

    function getSetorIdFromItemEscala(item) {
        return item?.id ?? item?.Id ?? item?.setorId ?? item?.SetorId ?? null;
    }

    function getSetorNomeFromItemEscala(item) {
        return item?.nome ?? item?.Nome ?? item?.setorNome ?? item?.SetorNome ?? '';
    }

    function buildSetorOptionsRelatorioEscala(selectedId = '') {
        const setoresOrdenados = [...(window.setores || [])]
            .map((item) => ({
                id: getSetorIdFromItemEscala(item),
                nome: getSetorNomeFromItemEscala(item)
            }))
            .filter((item) => item.id !== null && item.id !== undefined && String(item.id).trim() !== '')
            .sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR', { sensitivity: 'base' }));

        return `
            <option value="">Todos os setores</option>
            ${setoresOrdenados.map((setor) => `
                <option value="${escapeHtmlEscala(String(setor.id))}" ${String(selectedId) === String(setor.id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(setor.nome || 'Sem nome')}
                </option>
            `).join('')}
        `;
    }

    function getRelatorioEscalaSetorId() {
        const value = document.getElementById('relatorioEscalaSetor')?.value || '';
        return value ? String(value) : '';
    }

    function getRelatorioEscalaSetorNome(setorId = getRelatorioEscalaSetorId()) {
        if (!setorId) {
            return 'Todos os setores';
        }

        const setor = (window.setores || []).find((item) => String(getSetorIdFromItemEscala(item)) === String(setorId));
        const nome = getSetorNomeFromItemEscala(setor);
        return nome || `Setor ${setorId}`;
    }

    function getRelatorioEscalaSetorFileSuffix(setorId = getRelatorioEscalaSetorId()) {
        if (!setorId) {
            return '';
        }

        return `_${getRelatorioEscalaSetorNome(setorId)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || `Setor_${setorId}`}`;
    }

    function renderRelatorioEscalaFiltrosAtivos(filters = {}) {
        const setorNome = filters.setorNome || getRelatorioEscalaSetorNome(filters.setorId);

        if (!filters.setorId) {
            return '';
        }

        return `
            <div class="relatorio-filtros-ativos">
                <span><i class="fas fa-building"></i> Setor: <strong>${escapeHtmlEscala(setorNome)}</strong></span>
            </div>
        `;
    }

    function buildTipoOptionsEscala(selectedType = '') {
        return `
            <option value="">Todos os tipos</option>
            ${Object.entries(TIPO_LABELS).map(([value, label]) => `
                <option value="${value}" ${selectedType === value ? 'selected' : ''}>${label}</option>
            `).join('')}
        `;
    }

    // Config de colunas da tabela detalhada: UMA fonte de verdade para header
    // e body. Antes os dois eram blocos de HTML separados e hardcoded, o que
    // deixava fácil header e body divergirem (a causa-raiz de "colunas
    // desalinhadas"). Aqui, adicionar/reordenar coluna é editar uma lista só.
    const COLUNAS_ESCALA_DETALHADA = [
        { titulo: 'Data', html: true, valor: (i) => `<strong>${escapeHtmlEscala(formatDatePtBrEscala(i.dataISO))}</strong>` },
        { titulo: 'Dia', valor: (i) => i.diaSemana || getDayLabelEscala(i.dataISO) },
        { titulo: 'Colaborador', truncar: true, valor: (i) => i.colaboradorNome || '--' },
        { titulo: 'Entrada', valor: (i) => i.horaInicio || '--' },
        { titulo: 'Saida', valor: (i) => i.horaFim || '--' },
        { titulo: 'Almoco', valor: (i) => i.almoco || '--' },
        { titulo: 'Tipo', html: true, valor: (i) => `<span class="evento-tipo badge-${escapeHtmlEscala(i.tipo)}">${escapeHtmlEscala(TIPO_LABELS[i.tipo] || i.tipo || '--')}</span>` },
        { titulo: 'Observacoes', valor: (i) => i.observacao || '--' }
    ];

    // Helper genérico de tabela de relatório: header, `scope="col"` e body
    // derivam da MESMA config de colunas. Só emite HTML quando `col.html` for
    // true (ex.: o badge de tipo); nos demais casos, escapa o valor.
    function renderTabelaRelatorio(config) {
        const colunas = Array.isArray(config && config.colunas) ? config.colunas : [];
        const linhas = Array.isArray(config && config.linhas) ? config.linhas : [];
        const classeTabela = config && config.classe ? ` ${config.classe}` : '';

        const head = colunas
            .map((col) => `<th scope="col">${escapeHtmlEscala(col.titulo || '')}</th>`)
            .join('');

        const body = linhas.map((linha) => {
            const celulas = colunas.map((col) => {
                const bruto = typeof col.valor === 'function' ? col.valor(linha) : (linha ? linha[col.chave] : null);
                const conteudo = col.html
                    ? (bruto == null ? '' : String(bruto))
                    : escapeHtmlEscala(bruto == null ? '--' : bruto);
                const classe = col.truncar ? ' class="is-truncada"' : '';
                return `<td${classe}>${conteudo}</td>`;
            }).join('');
            return `<tr>${celulas}</tr>`;
        }).join('');

        return `
            <div class="relatorio-tabela-scroll">
                <table class="relatorio-tabela${classeTabela}">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        `;
    }

    function renderDetailedEscalaReport(items, filters) {
        if (!items.length) {
            return `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <p>Nenhum registro encontrado para o periodo informado.</p>
                </div>
            `;
        }

        const normalizedItems = normalizeEscalaReportItems(items);
        const setorGroups = groupEscalaItemsBySetor(normalizedItems);
        const colaboradoresUnicos = new Set(normalizedItems.map((item) => String(item.colaboradorId || item.colaboradorNome || ''))).size;
        const resumo = normalizedItems.reduce((accumulator, item) => {
            accumulator[item.tipo] = (accumulator[item.tipo] || 0) + 1;
            return accumulator;
        }, {
            normal: 0,
            plantao: 0,
            folga: 0,
            ferias: 0,
            ausencia: 0,
            ajuste: 0
        });

        return `
            <div class="relatorio-tabela-container">
                ${renderRelatorioEscalaFiltrosAtivos(filters)}
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio))}</strong>
                    ate
                    <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim))}</strong>
                    • Registros: <strong>${items.length}</strong>
                </div>
                <div class="resumo-cards" style="margin-bottom: 18px;">
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-list-check"></i>
                        <div>
                            <strong>${normalizedItems.length}</strong>
                            <span>Registros retornados</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-users"></i>
                        <div>
                            <strong>${colaboradoresUnicos}</strong>
                            <span>Colaboradores no periodo</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-layer-group"></i>
                        <div>
                            <strong>${setorGroups.length}</strong>
                            <span>Setores</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-calendar-check"></i>
                        <div>
                            <strong>${resumo.plantao}</strong>
                            <span>Plantoes</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-user-clock"></i>
                        <div>
                            <strong>${resumo.ausencia + resumo.folga + resumo.ferias}</strong>
                            <span>Ausencias, folgas e ferias</span>
                        </div>
                    </div>
                </div>
                ${setorGroups.map((group) => `
                    <section class="relatorio-setor-section">
                        <div class="relatorio-setor-header">
                            <span><i class="fas fa-layer-group"></i> ${escapeHtmlEscala(group.setorNome)}</span>
                            <strong>${group.items.length} registro(s)</strong>
                        </div>
                        ${renderTabelaRelatorio({
                            classe: 'escala-detalhada-tabela',
                            colunas: COLUNAS_ESCALA_DETALHADA,
                            linhas: group.items
                        })}
                    </section>
                `).join('')}
            </div>
        `;
    }

    function chunkEscalaItems(items, chunkSize) {
        const source = Array.isArray(items) ? items : [];
        const size = Math.max(Number(chunkSize) || 1, 1);
        const chunks = [];

        for (let index = 0; index < source.length; index += size) {
            chunks.push(source.slice(index, index + size));
        }

        return chunks;
    }

    function buildEscalaExportStats(items, feriados = []) {
        const counters = {
            totalRegistros: Array.isArray(items) ? items.length : 0,
            colaboradores: 0,
            plantoes: 0,
            ausencias: 0,
            ferias: 0,
            folgas: 0,
            ajustes: 0,
            normais: 0,
            feriados: Array.isArray(feriados) ? feriados.length : 0
        };
        const colaboradoresSet = new Set();

        (Array.isArray(items) ? items : []).forEach((item) => {
            const colaboradorKey = item.colaboradorId || item.colaboradorNome;

            if (colaboradorKey) {
                colaboradoresSet.add(String(colaboradorKey));
            }

            switch (String(item.tipo || '').toLowerCase()) {
                case 'plantao':
                    counters.plantoes += 1;
                    break;
                case 'ausencia':
                    counters.ausencias += 1;
                    break;
                case 'ferias':
                    counters.ferias += 1;
                    break;
                case 'folga':
                    counters.folgas += 1;
                    break;
                case 'ajuste':
                    counters.ajustes += 1;
                    break;
                default:
                    counters.normais += 1;
                    break;
            }
        });

        counters.colaboradores = colaboradoresSet.size;
        return counters;
    }

    function collectYearsInRange(startISO, endISO) {
        const years = new Set();
        const startYear = Number(String(startISO).slice(0, 4));
        const endYear = Number(String(endISO).slice(0, 4));

        for (let year = startYear; year <= endYear; year += 1) {
            years.add(year);
        }

        return [...years];
    }

    async function collectEscalaHolidayItems(startISO, endISO) {
        const merged = new Map();

        if (typeof carregarFeriadosLocais === 'function') {
            try {
                await carregarFeriadosLocais();
            } catch (error) {
                // ignore
            }
        }

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = String(item.Data || item.data || '').split('T')[0];

            if (!dataISO || dataISO < startISO || dataISO > endISO) {
                return;
            }

            const key = `${dataISO}|${item.Nome || item.nome || 'Feriado'}`;
            merged.set(key, {
                dataISO,
                nome: item.Nome || item.nome || 'Feriado',
                origem: 'local'
            });
        });

        const years = collectYearsInRange(startISO, endISO);
        const nationalHolidayResults = await Promise.all(years.map(async (year) => {
            if (typeof carregarFeriadosAPI !== 'function') {
                return [];
            }

            try {
                const result = await carregarFeriadosAPI(year);
                return Array.isArray(result) ? result : [];
            } catch (error) {
                return [];
            }
        }));

        nationalHolidayResults.flat().forEach((item) => {
            const dataISO = String(item.date || item.data || '').split('T')[0];

            if (!dataISO || dataISO < startISO || dataISO > endISO) {
                return;
            }

            const key = `${dataISO}|${item.name || item.nome || 'Feriado nacional'}`;

            if (!merged.has(key)) {
                merged.set(key, {
                    dataISO,
                    nome: item.name || item.nome || 'Feriado nacional',
                    origem: 'nacional'
                });
            }
        });

        return [...merged.values()].sort((first, second) => String(first.dataISO).localeCompare(String(second.dataISO)));
    }

    function renderEscalaExportStats(stats) {
        return `
            <div class="escala-export-meta">
                <span>Colaboradores: <strong>${stats.colaboradores}</strong></span>
                <span>Plantoes: <strong>${stats.plantoes}</strong></span>
                <span>Ausencias: <strong>${stats.ausencias}</strong></span>
                <span>Ferias: <strong>${stats.ferias}</strong></span>
                <span>Folgas: <strong>${stats.folgas}</strong></span>
                <span>Feriados: <strong>${stats.feriados}</strong></span>
            </div>
        `;
    }

    function renderEscalaHolidayList(feriados) {
        if (!Array.isArray(feriados) || feriados.length === 0) {
            return '';
        }

        const visible = feriados.slice(0, 8);

        return `
            <div class="escala-export-holidays">
                <strong>Feriados no periodo</strong>
                <ul>
                    ${visible.map((item) => `
                        <li>
                            <span>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</span>
                            <span>${escapeHtmlEscala(item.nome)}</span>
                        </li>
                    `).join('')}
                    ${feriados.length > visible.length ? `
                        <li class="is-muted">
                            <span>... e mais ${feriados.length - visible.length} feriados</span>
                        </li>
                    ` : ''}
                </ul>
            </div>
        `;
    }

    function compactEscalaExportLabel(value) {
        return String(value || '--')
            .replace(/\s+às\s+/gi, '-')
            .replace(/\s+-\s+/g, '-')
            .replace(/\s+/g, ' ')
            .trim() || '--';
    }

    function compactEscalaExportName(value) {
        const name = String(value || '--').replace(/\s+/g, ' ').trim();

        if (name.length <= 12) {
            return name;
        }

        const parts = name.split(' ').filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0]} ${parts[1].charAt(0)}.`;
        }

        return `${name.slice(0, 13)}...`;
    }

    function getEscalaExportDayRowCount(day) {
        return Array.isArray(day?.rows) ? day.rows.length : 0;
    }

    function applyEscalaExportRowspan(rows, labelKey, showKey, rowspanKey) {
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

    function sliceEscalaExportDayRows(day, startIndex, maxRows) {
        if (!day || !Array.isArray(day.rows)) {
            return day;
        }

        const rows = day.rows.slice(startIndex, startIndex + maxRows).map((row) => ({ ...row }));

        applyEscalaExportRowspan(rows, 'almocoLabel', 'showAlmoco', 'almocoRowspan');
        applyEscalaExportRowspan(rows, 'jornadaLabel', 'showJornada', 'jornadaRowspan');

        return {
            ...day,
            rows,
            hasScale: rows.length > 0
        };
    }

    function buildEscalaExportHolidayMap(feriados) {
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

    function hasEscalaExportRows(day) {
        return Array.isArray(day?.rows) && day.rows.length > 0;
    }

    // O quadro mostra SEMPRE os sete dias. Antes o domingo so entrava se
    // alguem tivesse escala nele, e um setor que nao trabalha no fim de semana
    // recebia uma folha de seis colunas, terminando no sabado — o leitor nao
    // conseguia distinguir "domingo vazio" de "domingo fora do relatorio".
    function shouldIncludeSundayInMonthlyExport() {
        return true;
    }

    function getEscalaExportWeekSlots(week, includeSunday) {
        const slots = Array.from({ length: 7 }, (_, index) => week?.[index] || null);
        return includeSunday ? slots : slots.slice(0, 6);
    }

    function getEscalaExportWeekdayLabels(includeSunday) {
        return includeSunday ? ESCALA_QUADRO_WEEKDAY_HEADERS : ESCALA_QUADRO_WEEKDAY_HEADERS.slice(0, 6);
    }

    function getEscalaExportEntryMaxRows(weeks, includeSunday) {
        return Math.max(0, ...weeks.flatMap((week) => (
            getEscalaExportWeekSlots(week, includeSunday).map((day) => getEscalaExportDayRowCount(day))
        )));
    }

    function getEscalaSheetDensityClass(maxRows, weekCount) {
        if (maxRows >= 17 || (weekCount > 1 && maxRows >= 13)) {
            return ' is-ultra-dense';
        }

        if (maxRows >= 11 || (weekCount > 1 && maxRows >= 9)) {
            return ' is-dense';
        }

        return '';
    }

    // Quantas linhas cabem no dia mais cheio de uma folha com N linhas de
    // semana. Menos semanas na folha = mais altura para cada dia. Os valores
    // sao calibrados por medicao: renderizando a folha e verificando quando
    // .escala-sheet-day (que tem overflow: hidden) comeca a cortar conteudo.
    function getMonthlyEscalaOnePageMaxRows(weekCount) {
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

    function getEscalaSheetRowClassName(row) {
        const tipo = String(row?.tipo || 'normal').toLowerCase();

        if (!tipo || tipo === 'normal') {
            return '';
        }

        return ` is-${tipo}`;
    }

    function renderEscalaSheetDayTable(day, options = {}) {
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
        const titleAttribute = holidayLabel ? ` title="${escapeHtmlEscala(holidayLabel)}"` : '';

        return `
            <article class="escala-sheet-day${hasRows ? '' : ' is-empty'}${holidayLabel ? ' is-holiday' : ''}">
                <div class="escala-sheet-day-date"${titleAttribute}>${escapeHtmlEscala(day.dateLabel || '--')}</div>
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
                            <tr class="${getEscalaSheetRowClassName(row)}">
                                ${includeLunch && row.showAlmoco ? `<td rowspan="${row.almocoRowspan || 1}" class="escala-sheet-group">${escapeHtmlEscala(row.almocoLabel || '--')}</td>` : ''}
                                <td class="escala-sheet-name">${escapeHtmlEscala(row.colaboradorNome || '--')}</td>
                                ${row.showJornada ? `<td rowspan="${row.jornadaRowspan || 1}" class="escala-sheet-group">${escapeHtmlEscala(row.jornadaLabel || '--')}</td>` : ''}
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="${columnCount}" class="escala-sheet-empty">${escapeHtmlEscala(emptyLabel)}</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </article>
        `;
    }

    async function buildEscalaExportSnapshot() {
        const modo = getEscalaReportMode();

        if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
            const filters = getEscalaMonthlyFilters();

            if (!filters) {
                throw new Error('Informe um mes e ano validos para o quadro mensal.');
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio: filters.dataInicio,
                dataFim: filters.dataFim,
                setorId: filters.setorId || undefined
            });
            const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
            const boardUtils = window.EscalaReportUtils;

            if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
                throw new Error('Os utilitarios do quadro mensal nao foram carregados.');
            }

            const feriados = await collectEscalaHolidayItems(filters.dataInicio, filters.dataFim);

            const setorGroups = groupEscalaItemsBySetor(items, { includeEmpty: true }).map((group) => {
                const days = boardUtils.buildEscalaQuadroMensal(group.items, {
                    month: filters.month,
                    year: filters.year
                });

                return {
                    ...group,
                    days,
                    calendarWeeks: getEscalaCalendarWeeks(boardUtils, days)
                };
            });
            const days = setorGroups[0]?.days || boardUtils.buildEscalaQuadroMensal([], {
                month: filters.month,
                year: filters.year
            });
            const calendarWeeks = setorGroups[0]?.calendarWeeks || getEscalaCalendarWeeks(boardUtils, days);

            return {
                mode: modo,
                title: `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`,
                fileBase: `Escala_Mensal_${filters.year}-${String(filters.month).padStart(2, '0')}${getRelatorioEscalaSetorFileSuffix(filters.setorId)}`,
                filters,
                items,
                feriados,
                stats: buildEscalaExportStats(items, feriados),
                setorGroups,
                days,
                calendarWeeks,
                calendarSlots: calendarWeeks.flat()
            };
        }

        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const setorId = getRelatorioEscalaSetorId();
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            throw new Error('Informe a data inicial e final do relatorio.');
        }

        const payload = await window.API.getEscalaRelatorio({
            dataInicio,
            dataFim,
            setorId: setorId || undefined,
            colaboradorId: colaboradorId || undefined,
            tipo: tipo || undefined
        });
        const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
        const feriados = await collectEscalaHolidayItems(dataInicio, dataFim);
        const setorGroups = groupEscalaItemsBySetor(items);

        return {
            mode: modo,
            title: `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`,
            fileBase: `Escala_Detalhada_${dataInicio}_${dataFim}${getRelatorioEscalaSetorFileSuffix(setorId)}`,
            filters: {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            },
            items,
            setorGroups,
            feriados,
            stats: buildEscalaExportStats(items, feriados)
        };
    }

    function dividirSemanasEmBlocos(weeks, quantidadeDePaginas) {
        const porPagina = Math.ceil(weeks.length / quantidadeDePaginas);
        const blocos = [];

        for (let inicio = 0; inicio < weeks.length; inicio += porPagina) {
            blocos.push(weeks.slice(inicio, inicio + porPagina));
        }

        return blocos;
    }

    // Retorna a primeira divisao (1 folha, depois 2, depois 3...) em que todo
    // bloco cabe na altura da pagina, ou null se nem uma semana isolada couber.
    // Importante caber: .escala-export-month-page tem altura fixa e
    // overflow: hidden, entao o que passa nao "vaza" — some do PDF.
    function escolherBlocosDeSemanasPlantao(weeks, includeSunday) {
        for (let paginas = 1; paginas <= weeks.length; paginas += 1) {
            const blocos = dividirSemanasEmBlocos(weeks, paginas);
            const cabe = blocos.every((bloco) => (
                getEscalaExportEntryMaxRows(bloco, includeSunday) <= getMonthlyEscalaOnePageMaxRows(bloco.length)
            ));

            if (cabe) {
                return blocos;
            }
        }

        return null;
    }

    // Sobra vertical de uma folha ja renderizada: distancia entre a base da
    // celula de dia mais baixa e o fim da area util da pagina. Negativo = o
    // conteudo passou do fim e sera CORTADO (a pagina tem overflow: hidden).
    function medirSobraDaFolhaEscala(pagina) {
        const celulas = [...pagina.querySelectorAll('.escala-sheet-day:not(.is-placeholder)')];

        if (celulas.length === 0) {
            return 0;
        }

        const retangulo = pagina.getBoundingClientRect();
        const recuoInferior = parseFloat(getComputedStyle(pagina).paddingBottom) || 0;
        const limite = retangulo.bottom - recuoInferior;
        const maisBaixa = Math.max(...celulas.map((celula) => celula.getBoundingClientRect().bottom));

        return limite - maisBaixa;
    }

    // As faixas fixas de densidade (>= 9 linhas vira densa, >= 13 vira
    // ultra-densa) erravam por uma linha em varios pontos: com 12 pessoas num
    // mes de 5 semanas, ou 8 num de 6, a folha estourava e o PDF saia com
    // linhas faltando, sem nenhum aviso. Em vez de calibrar faixa por faixa —
    // que muda com o tamanho dos nomes e com a coluna de almoco — a folha ja
    // montada e medida aqui e vai ficando mais compacta ate caber.
    window.ajustarDensidadeFolhasEscala = function ajustarDensidadeFolhasEscala(container) {
        const NIVEIS = ['', 'is-dense', 'is-ultra-dense'];
        const folhas = [...(container?.querySelectorAll('.escala-export-month-page') || [])];
        let folhasEstouradas = 0;

        folhas.forEach((folha) => {
            const nivelAtual = NIVEIS.findIndex((nivel) => nivel && folha.classList.contains(nivel));
            let indice = nivelAtual === -1 ? 0 : nivelAtual;

            while (medirSobraDaFolhaEscala(folha) < 0 && indice < NIVEIS.length - 1) {
                NIVEIS.filter(Boolean).forEach((nivel) => folha.classList.remove(nivel));
                indice += 1;

                if (NIVEIS[indice]) {
                    folha.classList.add(NIVEIS[indice]);
                }
            }

            if (medirSobraDaFolhaEscala(folha) < 0) {
                folhasEstouradas += 1;
            }
        });

        return { folhas: folhas.length, folhasEstouradas };
    };

    function buildMonthlyEscalaExportPageEntries(snapshot) {
        const compactWeekMaxRows = 12;
        const maxRowsPerWeekDay = 22;
        const sectorEntries = Array.isArray(snapshot.setorGroups) && snapshot.setorGroups.length > 0
            ? snapshot.setorGroups
            : [{
                setorNome: 'Sem setor',
                calendarWeeks: Array.isArray(snapshot.calendarWeeks) ? snapshot.calendarWeeks : []
            }];
        const includeSunday = shouldIncludeSundayInMonthlyExport(snapshot);

        return sectorEntries.flatMap((sector) => {
            const weeks = Array.isArray(sector.calendarWeeks) && sector.calendarWeeks.length > 0
                ? sector.calendarWeeks
                : [Array(7).fill(null)];
            const monthMaxRows = getEscalaExportEntryMaxRows(weeks, includeSunday);
            const onePageMaxRows = getMonthlyEscalaOnePageMaxRows(weeks.length);

            if (monthMaxRows <= onePageMaxRows) {
                return [{
                    sector,
                    weeks,
                    kind: 'month',
                    includeSunday,
                    label: 'Mes completo'
                }];
            }

            // Nao cabendo tudo em uma folha, procura o MENOR numero de folhas em
            // que todas as semanas cabem, dividindo o mes em blocos iguais.
            // Antes o codigo pulava direto para "uma semana por pagina", e so
            // emparelhava duas se ambas tivessem <= 12 linhas — o que nunca
            // acontece justamente nos meses cheios. Dai um setor de 15 pessoas
            // sair em 5 folhas, e um mes de 6 semanas sair em 3 mesmo com 11.
            // Menos semanas por folha = mais altura para cada dia, entao a
            // divisao ganha capacidade sem precisar encolher a fonte.
            const blocosPorPagina = escolherBlocosDeSemanasPlantao(weeks, includeSunday);

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
                        includeSunday,
                        label: bloco.length > 1
                            ? `Semanas ${inicio + 1}-${fim + 1}`
                            : `Semana ${inicio + 1}`
                    };
                });
            }

            // Nenhuma divisao resolve: ha um dia com mais linhas do que cabe
            // numa folha inteira. Ai sim a semana e fatiada em partes.
            const entries = [];
            let weekIndex = 0;

            while (weekIndex < weeks.length) {
                const currentWeek = Array.isArray(weeks[weekIndex]) ? weeks[weekIndex] : Array(7).fill(null);
                const weekMaxRows = Math.max(0, ...currentWeek.map((day) => getEscalaExportDayRowCount(day)));
                const partCount = Math.max(1, Math.ceil(weekMaxRows / maxRowsPerWeekDay));

                if (partCount > 1) {
                    Array.from({ length: partCount }, (_, partIndex) => {
                        const startIndex = partIndex * maxRowsPerWeekDay;
                        const weekPart = currentWeek.map((day) => sliceEscalaExportDayRows(day, startIndex, maxRowsPerWeekDay));

                        entries.push({
                            sector,
                            weeks: [weekPart],
                            kind: 'week',
                            weekIndex,
                            partIndex,
                            partCount,
                            includeSunday,
                            label: `Semana ${weekIndex + 1} - parte ${partIndex + 1}`
                        });
                    });
                    weekIndex += 1;
                    continue;
                }

                const nextWeek = weeks[weekIndex + 1] || null;
                const nextWeekMaxRows = nextWeek
                    ? Math.max(0, ...nextWeek.map((day) => getEscalaExportDayRowCount(day)))
                    : 0;
                const canPairWeeks = nextWeek
                    && weekMaxRows <= compactWeekMaxRows
                    && nextWeekMaxRows <= compactWeekMaxRows;
                const entryWeeks = canPairWeeks ? [currentWeek, nextWeek] : [currentWeek];
                const endWeekIndex = weekIndex + entryWeeks.length - 1;

                entries.push({
                    sector,
                    weeks: entryWeeks,
                    kind: entryWeeks.length > 1 ? 'weeks' : 'week',
                    weekIndex,
                    endWeekIndex,
                    includeSunday,
                    label: entryWeeks.length > 1
                        ? `Semanas ${weekIndex + 1}-${endWeekIndex + 1}`
                        : `Semana ${weekIndex + 1}`
                });

                weekIndex += entryWeeks.length;
            }

            return entries;
        });
    }

    function renderMonthlyEscalaExportPages(snapshot) {
        const pageEntries = buildMonthlyEscalaExportPageEntries(snapshot);
        const holidayMap = buildEscalaExportHolidayMap(snapshot.feriados);
        const pageTitle = formatEscalaMonthHeading(snapshot.filters?.month, snapshot.filters?.year);

        return pageEntries.map((entry, pageIndex) => `
            <section class="pdf-pagina escala-export-page escala-export-month-page${getEscalaSheetDensityClass(getEscalaExportEntryMaxRows(entry.weeks, entry.includeSunday), entry.weeks.length)}">
                <div class="escala-sheet-title">${escapeHtmlEscala(pageTitle)}</div>
                <div class="escala-sheet-meta">
                    <strong>Setor: ${escapeHtmlEscala(entry.sector.setorNome || 'Sem setor')}</strong>
                    <span>${escapeHtmlEscala(entry.label)} - Pagina ${pageIndex + 1} de ${pageEntries.length}</span>
                </div>
                <div class="escala-sheet-weekdays" style="--weekday-count:${entry.includeSunday ? 7 : 6};">
                    ${getEscalaExportWeekdayLabels(entry.includeSunday).map((label) => `<span>${escapeHtmlEscala(label)}</span>`).join('')}
                </div>
                <div class="escala-sheet-grid" style="--weekday-count:${entry.includeSunday ? 7 : 6}; --week-count:${entry.weeks.length || 1};">
                    ${entry.weeks.flatMap((week) => (
                        getEscalaExportWeekSlots(week, entry.includeSunday).map((day, weekDayIndex) => renderEscalaSheetDayTable(day, {
                            weekDayIndex,
                            holidayMap
                        }))
                    )).join('')}
                </div>
            </section>
        `).join('');
    }

    function renderDetailedEscalaExportPages(snapshot) {
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
                    <h1>${escapeHtmlEscala(snapshot.title)}</h1>
                    <p>Pagina ${pageIndex + 1} de ${pageEntries.length}</p>
                </div>
                ${pageIndex === 0 ? `
                    <div class="escala-export-summary">
                        <span>Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataInicio))}</strong> ate <strong>${escapeHtmlEscala(formatDatePtBrEscala(snapshot.filters.dataFim))}</strong></span>
                        ${snapshot.filters.setorId ? `<span>Setor: <strong>${escapeHtmlEscala(snapshot.filters.setorNome || getRelatorioEscalaSetorNome(snapshot.filters.setorId))}</strong></span>` : ''}
                        <span>Registros: <strong>${snapshot.items.length}</strong></span>
                        <span>Setores: <strong>${setorGroups.length}</strong></span>
                    </div>
                    ${renderEscalaExportStats(snapshot.stats)}
                    ${renderEscalaHolidayList(snapshot.feriados)}
                ` : ''}
                <div class="relatorio-setor-header escala-export-setor-header">
                    <span>Setor: ${escapeHtmlEscala(entry.sector.setorNome || 'Sem setor')}</span>
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
                                <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(item.dataISO))}</strong></td>
                                <td>${escapeHtmlEscala(item.diaSemana || getDayLabelEscala(item.dataISO))}</td>
                                <td>${escapeHtmlEscala(item.colaboradorNome || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaInicio || '--')}</td>
                                <td>${escapeHtmlEscala(item.horaFim || '--')}</td>
                                <td>${escapeHtmlEscala(item.almoco || '--')}</td>
                                <td>${escapeHtmlEscala(TIPO_LABELS[item.tipo] || item.tipo || '--')}</td>
                                <td>${escapeHtmlEscala(item.observacao || '--')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
        `).join('');
    }

    function gerarHtmlPdfRelatorioEscala(snapshot) {
        const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;
        const pageMetrics = isMonthlyExport
            ? {
                bodyWidth: 1660,
                pageWidth: 1660,
                pageHeight: 1160,
                pagePadding: 6,
                gridMinHeight: 1010,
                titleSize: 28,
                sectorHeaderSize: 18,
                dayHeaderSize: 18,
                tableFontSize: 14
            }
            : {
                bodyWidth: 1480,
                pageWidth: 1444,
                pageHeight: 980,
                pagePadding: 10,
                gridMinHeight: 900,
                titleSize: 28,
                sectorHeaderSize: 13,
                dayHeaderSize: 12,
                tableFontSize: 10
            };
        const bodyHtml = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL
            ? renderMonthlyEscalaExportPages(snapshot)
            : renderDetailedEscalaExportPages(snapshot);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtmlEscala(snapshot.title)}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        background: #ffffff;
                        color: #0f172a;
                        width: ${pageMetrics.bodyWidth}px;
                        padding: ${isMonthlyExport ? 0 : 16}px;
                    }
                    .pdf-pagina {
                        width: ${pageMetrics.pageWidth}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        height: auto;
                        background: white;
                        padding: ${pageMetrics.pagePadding}px;
                        display: flex;
                        flex-direction: column;
                        overflow: visible;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 24px;
                    }
                    .escala-export-month-page {
                        height: ${pageMetrics.pageHeight}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        overflow: hidden;
                        background: #ffffff;
                        color: #000000;
                    }
                    .escala-export-month-page + .escala-export-month-page {
                        margin-top: 0;
                    }
                    .escala-sheet-title {
                        background: #28577e;
                        border: 2px solid #111111;
                        color: #ffffff;
                        font-size: 42px;
                        font-weight: 900;
                        line-height: 1;
                        padding: 8px 10px 9px;
                        text-align: center;
                        text-transform: uppercase;
                    }
                    .escala-sheet-meta {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 5px 2px 6px;
                        color: #111111;
                        font-size: 14px;
                        font-weight: 700;
                    }
                    .escala-sheet-meta span {
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .escala-sheet-weekdays {
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        gap: 5px;
                        margin-bottom: 5px;
                    }
                    .escala-sheet-weekdays span {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 48px;
                        padding: 4px 6px;
                        background: #28577e;
                        border: 2px solid #ffffff;
                        color: #ffffff;
                        font-size: 17px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-grid {
                        flex: 1;
                        min-height: 0;
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 2), auto);
                        column-gap: 8px;
                        row-gap: 14px;
                        align-content: start;
                        align-items: start;
                    }
                    .escala-sheet-day {
                        min-width: 0;
                        min-height: 0;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        background: #f8fafc;
                        border: 1.5px solid #172033;
                        box-shadow: 0 0 0 2px #e2e8f0;
                    }
                    .escala-sheet-day.is-placeholder {
                        border-color: transparent;
                        background: #ffffff;
                        box-shadow: none;
                    }
                    .escala-sheet-day-date {
                        padding: 2px 5px;
                        background: #28577e;
                        border-bottom: 1.5px solid #111111;
                        color: #ffffff;
                        font-size: 15px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-table {
                        width: 100%;
                        height: auto;
                        flex: 0 0 auto;
                        border-collapse: collapse;
                        table-layout: fixed;
                        background: #ffffff;
                    }
                    .escala-sheet-table th,
                    .escala-sheet-table td {
                        border: 1px solid #2f3a46;
                        color: #000000;
                        font-size: 11px;
                        line-height: 1;
                        padding: 1px 2px;
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-sheet-table th {
                        height: 15px;
                        background: #b7d7f0;
                        font-weight: 900;
                    }
                    .escala-sheet-table td {
                        height: 17px;
                        background: #ffffff;
                        font-weight: 500;
                    }
                    .escala-sheet-table tbody tr:nth-child(even) td {
                        background: #f8fbff;
                    }
                    .escala-sheet-group {
                        background: #eef6fd !important;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-name {
                        background: #ffffff !important;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .escala-sheet-table tr.is-plantao .escala-sheet-name,
                    .escala-sheet-table tr.is-ajuste .escala-sheet-name,
                    .escala-sheet-table tr.is-ausencia .escala-sheet-name {
                        color: #d00000;
                        font-weight: 800;
                    }
                    .escala-sheet-empty {
                        height: 100%;
                        color: #222222 !important;
                        font-size: 13px !important;
                        font-style: italic;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-day.is-empty .escala-sheet-table {
                        height: 100%;
                        flex: 1;
                    }
                    .escala-sheet-day.is-holiday .escala-sheet-empty {
                        color: #000000 !important;
                        font-size: 16px !important;
                        font-style: normal;
                        letter-spacing: 0;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-title {
                        font-size: 36px;
                        padding: 6px 8px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-weekdays span {
                        min-height: 40px;
                        font-size: 14px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-day-date {
                        font-size: 13px;
                        padding: 2px 4px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-grid {
                        row-gap: 10px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th,
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        font-size: 9.5px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th {
                        height: 13px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        height: 14px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-title {
                        font-size: 32px;
                        padding: 5px 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-weekdays span {
                        min-height: 34px;
                        font-size: 12px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-day-date {
                        font-size: 11px;
                        padding: 1px 3px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-grid {
                        row-gap: 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th,
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        font-size: 8px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th {
                        height: 11px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        height: 12px;
                    }
                    .escala-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 16px;
                        margin-bottom: 8px;
                    }
                    .escala-export-header h1 {
                        font-size: ${pageMetrics.titleSize}px;
                        line-height: 1.08;
                        color: #1e3a5f;
                    }
                    .escala-export-header p {
                        font-size: 12px;
                        color: #64748b;
                        font-weight: 700;
                    }
                    .escala-export-summary {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px 16px;
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 12px;
                        background: #eef2ff;
                        color: #312e81;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .escala-export-summary strong {
                        font-size: 16px;
                    }
                    .escala-export-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px 12px;
                        margin-bottom: 14px;
                        color: #1e3a5f;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .escala-export-meta span {
                        padding: 7px 10px;
                        border-radius: 999px;
                        background: #eff6ff;
                        border: 1px solid #bfdbfe;
                    }
                    .escala-export-holidays {
                        margin-bottom: 14px;
                        padding: 12px;
                        border-radius: 12px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                    }
                    .escala-export-holidays strong {
                        display: block;
                        margin-bottom: 8px;
                        color: #1e3a5f;
                    }
                    .escala-export-holidays ul {
                        list-style: none;
                        display: grid;
                        gap: 6px;
                    }
                    .escala-export-holidays li {
                        display: flex;
                        justify-content: space-between;
                        gap: 12px;
                        font-size: 12px;
                        color: #334155;
                    }
                    .escala-export-holidays li.is-muted {
                        color: #64748b;
                        font-style: italic;
                    }
                    .escala-export-page:not(.escala-export-detailed) .escala-export-summary,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-meta,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-holidays {
                        display: none !important;
                    }
                    .relatorio-setor-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 10px;
                        padding: 9px 12px;
                        border-radius: 8px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                        color: #1e3a5f;
                        font-size: ${pageMetrics.sectorHeaderSize}px;
                        font-weight: 700;
                    }
                    .relatorio-setor-header strong {
                        color: #475569;
                        font-size: 12px;
                    }
                    .escala-export-grid {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 5), minmax(0, 1fr));
                        gap: ${isMonthlyExport ? 8 : 10}px;
                        align-items: stretch;
                        flex: 1;
                        min-height: ${pageMetrics.gridMinHeight}px;
                        height: auto;
                        overflow: visible;
                    }
                    .escala-export-weekdays {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .escala-export-weekdays span {
                        padding: 6px 8px;
                        border-radius: 8px;
                        background: #24415f;
                        color: #f8fafc;
                        text-align: center;
                        font-size: 13px;
                        font-weight: 800;
                    }
                    .escala-export-grid-calendario .escala-quadro-dia,
                    .escala-export-grid-calendario .escala-quadro-dia-placeholder {
                        height: 100%;
                    }
                    .escala-export-dia,
                    .escala-export-dia-placeholder {
                        min-width: 0;
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: #ffffff;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 9px rgba(15, 23, 42, 0.04);
                    }
                    .escala-export-dia-placeholder {
                        border-style: dashed;
                        background: #f8fbff;
                        opacity: 0.55;
                    }
                    .escala-export-dia.is-empty {
                        background: #fbfdff;
                    }
                    .escala-export-dia-header {
                        padding: 7px 8px;
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 800;
                        line-height: 1.05;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-export-lines {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding: 7px;
                        min-height: 0;
                        overflow: hidden;
                    }
                    .escala-export-line {
                        display: grid;
                        grid-template-columns: minmax(48px, 0.9fr) minmax(0, 1.25fr) minmax(48px, 0.9fr);
                        align-items: center;
                        gap: 4px;
                        min-height: 26px;
                        padding: 4px 5px;
                        border: 1px solid #dbe3ef;
                        border-radius: 7px;
                        background: #f8fbff;
                        color: #1f2937;
                        font-size: 12px;
                        line-height: 1.05;
                    }
                    .escala-export-line strong {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: #111827;
                        font-size: 12px;
                        text-align: center;
                    }
                    .escala-export-time,
                    .escala-export-work {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        font-weight: 800;
                        text-align: center;
                        color: #334155;
                    }
                    .escala-export-empty {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748b;
                        font-size: 13px;
                        font-style: italic;
                    }
                    .escala-quadro-dia {
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: white;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
                    }
                    .escala-quadro-dia-placeholder {
                        border: 1px dashed #d6e0ea;
                        border-radius: 10px;
                        background: #f8fbff;
                        opacity: 0.6;
                    }
                    .escala-quadro-dia-header {
                        padding: ${isMonthlyExport ? '8px 10px' : '6px 8px'};
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 700;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-quadro-tabela {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        flex: 1;
                        height: 100%;
                    }
                    .escala-quadro-tabela th,
                    .escala-quadro-tabela td {
                        border: 1px solid #dbe3ef;
                        padding: ${isMonthlyExport ? '5px 6px' : '4px 5px'};
                        font-size: ${pageMetrics.tableFontSize}px;
                        line-height: ${isMonthlyExport ? '1.2' : '1.15'};
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-quadro-tabela th {
                        background: #f3f7fb;
                        color: #334155;
                        font-weight: 700;
                    }
                    .escala-quadro-tabela td {
                        background: #ffffff;
                        color: #1f2937;
                    }
                    .escala-quadro-grupo {
                        font-weight: 700;
                        background: #f7fafc !important;
                        color: #334155;
                    }
                    .escala-quadro-sem-escala {
                        padding: 8px 4px !important;
                        color: #64748b;
                        font-style: italic;
                        background: #fbfdff !important;
                    }
                    .escala-export-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .escala-export-table th,
                    .escala-export-table td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        font-size: 12px;
                        line-height: 1.3;
                        vertical-align: top;
                    }
                    .escala-export-table th {
                        background: #e2e8f0;
                        color: #0f172a;
                        font-size: 12px;
                        font-weight: 700;
                        text-align: left;
                    }
                    .escala-export-table td:last-child,
                    .escala-export-table th:last-child {
                        width: 22%;
                    }
                </style>
            </head>
            <body>${bodyHtml}</body>
            </html>
        `;
    }

    window.gerarRelatorioEscala = gerarRelatorioEscala = async function gerarRelatorioEscalaAtualizado() {
        const modo = getEscalaReportMode();

        try {
            if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
                const filters = getEscalaMonthlyFilters();

                if (!filters) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Informe um mes e ano validos para o quadro mensal.', 'error');
                    }
                    return;
                }

                const payload = await window.API.getEscalaRelatorio({
                    dataInicio: filters.dataInicio,
                    dataFim: filters.dataFim,
                    setorId: filters.setorId || undefined
                });
                const items = Array.isArray(payload?.items) ? payload.items : [];

                document.getElementById('relatorioTitulo').innerText = `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`;
                document.getElementById('relatorioConteudo').innerHTML = renderMonthlyEscalaReport(items, filters);
                document.getElementById('relatorioVisualizacao').style.display = 'block';
                return;
            }

            const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
            const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
            const setorId = getRelatorioEscalaSetorId();
            const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
            const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

            if (!dataInicio || !dataFim) {
                if (typeof mostrarToast === 'function') {
                    mostrarToast('Informe a data inicial e final do relatorio.', 'error');
                }
                return;
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio,
                dataFim,
                setorId: setorId || undefined,
                colaboradorId: colaboradorId || undefined,
                tipo: tipo || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`;
            document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            });
            document.getElementById('relatorioVisualizacao').style.display = 'block';
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio: ${error.message}`, 'error');
            }
        }
    };

    window.exportarRelatorioEscala = exportarRelatorioEscala = async function exportarRelatorioEscalaAtualizado() {
        if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
            }
            return;
        }

        let container = null;
        let releaseViewportLock = null;

        try {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Gerando PDF do relatorio de escala...', 'warning');
            }

            const snapshot = await buildEscalaExportSnapshot();
            const html = gerarHtmlPdfRelatorioEscala(snapshot);
            const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;

            if (typeof window.criarContainerTemporarioRelatorioPdf !== 'function'
                || typeof window.aguardarLayoutRelatorioPdf !== 'function'
                || typeof window.renderizarPaginaPdfEmCanvas !== 'function') {
                throw new Error('Os utilitarios de renderizacao do PDF nao estao disponiveis.');
            }

            container = window.criarContainerTemporarioRelatorioPdf(html, {
                width: isMonthlyExport ? 1700 : 1480
            });
            await window.aguardarLayoutRelatorioPdf();

            // Com a folha ja montada e medida, e o unico momento em que da para
            // saber se o conteudo realmente coube na altura da pagina.
            if (isMonthlyExport && typeof window.ajustarDensidadeFolhasEscala === 'function') {
                const ajuste = window.ajustarDensidadeFolhasEscala(container);

                if (ajuste.folhasEstouradas > 0) {
                    console.warn('[relatorio-escala] ' + ajuste.folhasEstouradas + ' de ' + ajuste.folhas + ' folha(s) nao couberam nem na densidade maxima; o PDF pode sair com linhas cortadas.');
                }

                await window.aguardarLayoutRelatorioPdf();
            }

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: isMonthlyExport ? 1700 : 1800,
                minHeight: isMonthlyExport ? 1180 : 1200,
                scale: isMonthlyExport ? 1.45 : 1.65,
                maxCanvasSide: isMonthlyExport ? 12000 : 14000,
                maxCanvasPixels: isMonthlyExport ? 22000000 : 24000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: isMonthlyExport ? 5 : 6,
                minScaleMmPerPixel: isMonthlyExport ? 0.075 : 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: isMonthlyExport ? 1 : 2,
                maxSourcePageHeight: isMonthlyExport ? 1160 : 1300
            });

            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `${snapshot.fileBase}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF do relatorio de escala gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao exportar relatorio de escala:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao exportar relatorio de escala: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };


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
                    Mes: <strong>${escapeHtml(MESES_LABELS[filters.month - 1] || filters.month)}/${escapeHtml(filters.year)}</strong>
                    • Setores: <strong>${setorGroups.length}</strong>
                    • Dias com escala: <strong>${daysWithScale}</strong>
                    • Linhas listadas: <strong>${totalRows}</strong>
                </div>
                ${setorGroups.map((group) => `
                    <section class="relatorio-setor-section">
                        <div class="relatorio-setor-header">
                            <span><i class="fas fa-layer-group"></i> ${escapeHtml(group.setorNome)}</span>
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



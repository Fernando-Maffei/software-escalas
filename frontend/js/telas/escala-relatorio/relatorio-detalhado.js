import { escapeHtml } from '../../lib/html-seguro.js';
import { formatDatePtBrEscala } from '../escala-dia-shared.js';
import { groupEscalaItemsBySetor, normalizeEscalaReportItems } from './agrupamento-setor.js';
import { COLUNAS_ESCALA_DETALHADA, renderRelatorioEscalaFiltrosAtivos, renderTabelaRelatorio } from './filtros.js';

export function renderDetailedEscalaReport(items, filters) {
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
                    Periodo: <strong>${escapeHtml(formatDatePtBrEscala(filters.dataInicio))}</strong>
                    ate
                    <strong>${escapeHtml(formatDatePtBrEscala(filters.dataFim))}</strong>
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
                            <span><i class="fas fa-layer-group"></i> ${escapeHtml(group.setorNome)}</span>
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

export function chunkEscalaItems(items, chunkSize) {
    const source = Array.isArray(items) ? items : [];
    const size = Math.max(Number(chunkSize) || 1, 1);
    const chunks = [];

    for (let index = 0; index < source.length; index += size) {
        chunks.push(source.slice(index, index + size));
    }

    return chunks;
}

export function buildEscalaExportStats(items, feriados = []) {
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

import { estado } from '../../core/estado.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { textoSegundoTurno } from '../../lib/coberturas.js';
import { formatDatePtBrEscala, getDayLabelEscala, TIPO_LABELS } from '../escala-dia-shared.js';

export function buildColaboradorOptionsEscala(selectedId = '') {
    return `
            <option value="">Todos os colaboradores</option>
            ${(estado.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtml(item.Nome)}
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

export function buildSetorOptionsRelatorioEscala(selectedId = '') {
    const setoresOrdenados = [...(estado.setores || [])]
        .map((item) => ({
            id: getSetorIdFromItemEscala(item),
            nome: getSetorNomeFromItemEscala(item)
        }))
        .filter((item) => item.id !== null && item.id !== undefined && String(item.id).trim() !== '')
        .sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR', { sensitivity: 'base' }));

    return `
            <option value="">Todos os setores</option>
            ${setoresOrdenados.map((setor) => `
                <option value="${escapeHtml(String(setor.id))}" ${String(selectedId) === String(setor.id) ? 'selected' : ''}>
                    ${escapeHtml(setor.nome || 'Sem nome')}
                </option>
            `).join('')}
        `;
}

export function getRelatorioEscalaSetorId() {
    const value = document.getElementById('relatorioEscalaSetor')?.value || '';
    return value ? String(value) : '';
}

export function getRelatorioEscalaSetorNome(setorId = getRelatorioEscalaSetorId()) {
    if (!setorId) {
        return 'Todos os setores';
    }

    const setor = (estado.setores || []).find((item) => String(getSetorIdFromItemEscala(item)) === String(setorId));
    const nome = getSetorNomeFromItemEscala(setor);
    return nome || `Setor ${setorId}`;
}

export function getRelatorioEscalaSetorFileSuffix(setorId = getRelatorioEscalaSetorId()) {
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

export function renderRelatorioEscalaFiltrosAtivos(filters = {}) {
    const setorNome = filters.setorNome || getRelatorioEscalaSetorNome(filters.setorId);

    if (!filters.setorId) {
        return '';
    }

    return `
            <div class="relatorio-filtros-ativos">
                <span><i class="fas fa-building"></i> Setor: <strong>${escapeHtml(setorNome)}</strong></span>
            </div>
        `;
}

export function buildTipoOptionsEscala(selectedType = '') {
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
export const COLUNAS_ESCALA_DETALHADA = [
    { titulo: 'Data', html: true, valor: (i) => `<strong>${escapeHtml(formatDatePtBrEscala(i.dataISO))}</strong>` },
    { titulo: 'Dia', valor: (i) => i.diaSemana || getDayLabelEscala(i.dataISO) },
    { titulo: 'Colaborador', truncar: true, valor: (i) => i.colaboradorNome || '--' },
    { titulo: 'Entrada', valor: (i) => i.horaInicio || '--' },
    { titulo: 'Saida', valor: (i) => i.horaFim || '--' },
    { titulo: 'Almoco', valor: (i) => i.almoco || '--' },
    { titulo: 'Tipo', html: true, valor: (i) => `<span class="evento-tipo badge-${escapeHtml(i.tipo)}">${escapeHtml(TIPO_LABELS[i.tipo] || i.tipo || '--')}</span>` },
    // O segundo turno de cobertura (ver backend/services/cobertura-na-escala.js)
    // vai junto da observacao do dia.
    { titulo: 'Observacoes', valor: (i) => [i.observacao, textoSegundoTurno(i.coberturas)].filter(Boolean).join(' | ') || '--' }
];

// Helper genérico de tabela de relatório: header, `scope="col"` e body
// derivam da MESMA config de colunas. Só emite HTML quando `col.html` for
// true (ex.: o badge de tipo); nos demais casos, escapa o valor.
export function renderTabelaRelatorio(config) {
    const colunas = Array.isArray(config && config.colunas) ? config.colunas : [];
    const linhas = Array.isArray(config && config.linhas) ? config.linhas : [];
    const classeTabela = config && config.classe ? ` ${config.classe}` : '';

    const head = colunas
        .map((col) => `<th scope="col">${escapeHtml(col.titulo || '')}</th>`)
        .join('');

    const body = linhas.map((linha) => {
        const celulas = colunas.map((col) => {
            const bruto = typeof col.valor === 'function' ? col.valor(linha) : (linha ? linha[col.chave] : null);
            const conteudo = col.html
                ? (bruto == null ? '' : String(bruto))
                : escapeHtml(bruto == null ? '--' : bruto);
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

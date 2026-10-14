import { carregarFeriadosAPI } from '../../core/app/utilitarios.js';
import { estado } from '../../core/estado.js';
import { carregarFeriadosLocais } from '../../core/runtime/dados-e-modais.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { formatDatePtBrEscala } from '../escala-dia-shared.js';

function collectYearsInRange(startISO, endISO) {
    const years = new Set();
    const startYear = Number(String(startISO).slice(0, 4));
    const endYear = Number(String(endISO).slice(0, 4));

    for (let year = startYear; year <= endYear; year += 1) {
        years.add(year);
    }

    return [...years];
}

export async function collectEscalaHolidayItems(startISO, endISO) {
    const merged = new Map();

    // carregarFeriadosLocais nao lanca: em falha avisa o usuario e devolve
    // a ultima lista conhecida (core/runtime/dados-e-modais.js).
    await carregarFeriadosLocais();

    (Array.isArray(estado.feriadosLocais) ? estado.feriadosLocais : []).forEach((item) => {
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

        // carregarFeriadosAPI trata a propria falha (loga e devolve []).
        const result = await carregarFeriadosAPI(year);
        return Array.isArray(result) ? result : [];
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

export function renderEscalaExportStats(stats) {
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

export function renderEscalaHolidayList(feriados) {
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
                            <span>${escapeHtml(formatDatePtBrEscala(item.dataISO))}</span>
                            <span>${escapeHtml(item.nome)}</span>
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

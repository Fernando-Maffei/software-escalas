import { API } from '../../core/api.js';
import { estado } from '../../core/estado.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { DIA_LABELS, formatDatePtBrEscala, formatTimeInputEscala, getDayLabelEscala, getIsoDayOfWeekEscala, toISODateEscala } from '../escala-dia-shared.js';
import { carregarEscalaSelecionadaEscala, shiftIsoDateEscala } from './acoes-do-dia.js';
import { computeCoverageEscala } from './cabecalho-e-cobertura.js';
import { getCurrentScaleState, getScaleHourBoundsEscala } from './estado-e-layout.js';

// Rotulo "08:00 as 17:00" para leitores de tela: a barra na timeline
// comunica o turno visualmente, mas nada disso chega a quem usa leitor —
// o texto vai no aria-label da linha.
export function buildTimeRangeLabelEscala(record) {
    const inicio = formatTimeInputEscala(record?.horaInicio);
    const fim = formatTimeInputEscala(record?.horaFim);

    if (!inicio || !fim) {
        return '';
    }

    return `Das ${inicio} as ${fim}`;
}

// Componente unico para as tres mensagens de tela cheia da timeline:
// vazio, carregando e erro. Antes so existia o markup do vazio, escrito
// inline — carregar e falhar nao mostravam nada, e a tela ficava com os
// dados do dia anterior (ver renderScaleLoadingEscala/ErrorEscala abaixo).
export function renderScaleMessageEscala({ label, icon, title, description, variante = '', acaoHtml = '' }) {
    const body = document.getElementById('timelineBody');

    if (!body) {
        return;
    }

    const bounds = getScaleHourBoundsEscala();

    body.innerHTML = `
            <div class="timeline-row mensagem-row${variante ? ` ${variante}` : ''}">
                <div class="timeline-name mensagem-nome">
                    <i class="fas ${icon}"></i>
                    <span>${escapeHtml(label)}</span>
                </div>
                <div class="timeline-cell mensagem-cell" style="grid-column: span ${bounds.columnCount + 1};">
                    <div class="mensagem-conteudo">
                        <i class="fas ${icon}"></i>
                        <h3>${escapeHtml(title)}</h3>
                        <p>${escapeHtml(description)}</p>
                        ${acaoHtml}
                    </div>
                </div>
            </div>
        `;
}

// Enquanto a requisicao do dia esta em voo. Sem isto, trocar de data dava
// a impressao de que nada aconteceu — a tela seguia mostrando o dia
// anterior ate a resposta chegar.
export function renderScaleLoadingEscala(dataISO) {
    renderScaleMessageEscala({
        label: getDayLabelEscala(dataISO).toUpperCase(),
        icon: 'fa-circle-notch fa-spin',
        title: 'Carregando escala...',
        description: `Buscando os registros de ${formatDatePtBrEscala(dataISO)}.`,
        variante: 'mensagem-row--carregando'
    });
}

// Falha de rede/servidor. Mostra o motivo e um botao de repetir, em vez de
// deixar a tela com dados velhos e nenhum aviso.
export function renderScaleErrorEscala(dataISO, error) {
    renderScaleMessageEscala({
        label: 'ERRO',
        icon: 'fa-triangle-exclamation',
        title: 'Nao foi possivel carregar a escala',
        description: error?.message || 'Verifique sua conexao e tente novamente.',
        variante: 'mensagem-row--erro',
        acaoHtml: `
                <button type="button" class="btn-repetir-escala" data-repetir-escala="${escapeHtml(dataISO)}">
                    <i class="fas fa-rotate-right"></i> Tentar novamente
                </button>
            `
    });
}

export function renderScaleEmptyMessageEscala(dataISO) {
    const body = document.getElementById('timelineBody');
    const weekday = getIsoDayOfWeekEscala(dataISO);

    if (!body) {
        return;
    }

    let title = 'Nenhum registro encontrado';
    let description = 'Nao ha colaboradores escalados para esta data.';
    let label = getDayLabelEscala(dataISO).toUpperCase();
    let icon = 'fa-calendar-times';

    if (weekday === 0) {
        title = 'Nenhum registro para este domingo';
        description = 'Configure a jornada semanal do colaborador ou use ajuste manual para este dia.';
        icon = 'fa-calendar-day';
        label = 'DOMINGO';
    } else if (weekday === 6) {
        title = 'Nenhum registro para este sabado';
        description = 'Lance um plantao ou ajuste manual para que ele apareca na escala.';
        icon = 'fa-calendar-check';
        label = 'SABADO';
    }

    // Passou a reusar o componente comum de mensagem (vazio/carregando/erro).
    renderScaleMessageEscala({ label, icon, title, description });
}

// ===== Previa da semana (faixa dos 7 dias) =====
// Uma unica chamada ao relatorio traz a semana inteira. O dia selecionado
// sempre usa o estado ao vivo (fica correto ate enquanto se arrasta o
// almoco); os demais dias usam o cache da semana. Nao aplica filtro de
// setor: a faixa e uma visao geral do dia inteiro.
function getWeekBoundsEscala(dataISO) {
    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const weekday = getIsoDayOfWeekEscala(iso);
    const start = shiftIsoDateEscala(iso, -weekday);
    const days = [];

    for (let index = 0; index < 7; index += 1) {
        days.push(shiftIsoDateEscala(start, index));
    }

    return { start, end: days[6], days };
}

function getWeekStatusEscala(coverage) {
    if (!coverage || !coverage.hasExpediente) {
        return 'vazio';
    }

    // Mesma regra do dia: cor pela % de menor cobertura no horario comercial.
    if (coverage.minPct < 0.5) {
        return 'critico';
    }

    if (coverage.minPct < 0.7) {
        return 'atencao';
    }

    return 'ok';
}

async function ensureWeekDataEscala(weekStart, weekEnd, { force = false } = {}) {
    const cache = estado.escalaWeekCache;

    if (!force && cache && cache.key === weekStart) {
        return cache.byDay;
    }

    const payload = await API.getEscalaRelatorio({ dataInicio: weekStart, dataFim: weekEnd });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const byDay = {};

    items.forEach((item) => {
        const dia = toISODateEscala(item.dataISO || item.data);

        if (!dia) {
            return;
        }

        (byDay[dia] = byDay[dia] || []).push(item);
    });

    estado.escalaWeekCache = { key: weekStart, byDay };
    return byDay;
}

const WEEK_STATUS_LABEL_ESCALA = {
    ok: 'cobertura tranquila',
    atencao: 'cobertura no limite',
    critico: 'cobertura no talo',
    vazio: 'sem expediente',
    load: 'carregando'
};

function renderWeekStripPillsEscala(dataISO, byDay) {
    const container = document.getElementById('escalaWeekStrip');

    if (!container) {
        return;
    }

    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const { days } = getWeekBoundsEscala(iso);
    const todayISO = toISODateEscala(new Date());
    const liveState = getCurrentScaleState();
    const liveISO = toISODateEscala(liveState.dataISO);

    container.innerHTML = days.map((dia) => {
        let status = 'load';

        if (dia === liveISO) {
            status = getWeekStatusEscala(computeCoverageEscala(liveState.items || []));
        } else if (byDay && Object.prototype.hasOwnProperty.call(byDay, dia)) {
            status = getWeekStatusEscala(computeCoverageEscala(byDay[dia]));
        } else if (byDay) {
            status = 'vazio';
        }

        const dow = (DIA_LABELS[getIsoDayOfWeekEscala(dia)] || '').slice(0, 3);
        const dayNum = Number(dia.split('-')[2]);
        const classes = ['escala-week-pill', `is-${status}`];

        if (dia === iso) {
            classes.push('is-selected');
        }

        if (dia === todayISO) {
            classes.push('is-today');
        }

        return `<button type="button" class="${classes.join(' ')}" data-dia="${dia}" title="${dow} ${dayNum} - ${WEEK_STATUS_LABEL_ESCALA[status] || ''}">
                <span class="wp-dow">${dow}</span>
                <span class="wp-num">${dayNum}</span>
                <span class="wp-dot" aria-hidden="true"></span>
            </button>`;
    }).join('');

    container.querySelectorAll('[data-dia]').forEach((button) => {
        button.addEventListener('click', () => {
            const dia = button.getAttribute('data-dia');

            if (dia && dia !== toISODateEscala(getCurrentScaleState().dataISO)) {
                carregarEscalaSelecionadaEscala(dia);
            }
        });
    });
}

export function refreshWeekStripLiveEscala() {
    const iso = toISODateEscala(getCurrentScaleState().dataISO);

    if (!iso) {
        return;
    }

    const { start } = getWeekBoundsEscala(iso);
    const cache = estado.escalaWeekCache;
    const byDay = (cache && cache.key === start) ? cache.byDay : null;
    renderWeekStripPillsEscala(iso, byDay);
}

export async function renderWeekStripEscala(dataISO, { force = false } = {}) {
    const container = document.getElementById('escalaWeekStrip');

    if (!container) {
        return;
    }

    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const { start, end } = getWeekBoundsEscala(iso);
    const cache = estado.escalaWeekCache;
    const cachedByDay = (cache && cache.key === start) ? cache.byDay : null;

    // Render imediato (cache ou placeholder), depois hidrata com o fetch.
    renderWeekStripPillsEscala(iso, cachedByDay);

    try {
        const byDay = await ensureWeekDataEscala(start, end, { force });
        renderWeekStripPillsEscala(iso, byDay);
    } catch (error) {
        // A previa e apoio: se o fetch falhar, a tela do dia continua util.
    }
}

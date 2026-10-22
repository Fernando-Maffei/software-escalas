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

// ===== Faixa de dias (rolavel) =====
// Seis semanas em volta do dia aberto, numa faixa que se arrasta para o lado
// (mouse, dedo ou trackpad). Uma unica chamada ao relatorio traz a faixa
// inteira. O dia selecionado sempre usa o estado ao vivo (fica correto ate
// enquanto se arrasta o almoco); os demais dias usam o cache. Nao aplica
// filtro de setor: a faixa e uma visao geral do dia inteiro.
const FAIXA_DIAS_ANTES = 21;
const FAIXA_DIAS_DEPOIS = 21;
const MESES_CURTOS_ESCALA = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function getFaixaDiasEscala(dataISO) {
    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const start = shiftIsoDateEscala(iso, -FAIXA_DIAS_ANTES);
    const days = [];

    for (let index = 0; index <= FAIXA_DIAS_ANTES + FAIXA_DIAS_DEPOIS; index += 1) {
        days.push(shiftIsoDateEscala(start, index));
    }

    return { start, end: days[days.length - 1], days };
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

// O cache vale para qualquer faixa que caiba dentro do periodo ja buscado:
// clicar num dia proximo recentra a faixa sem nova chamada.
function cacheCobreFaixaEscala(start, end) {
    const cache = estado.escalaWeekCache;
    return Boolean(cache && cache.start && cache.start <= start && cache.end >= end);
}

async function ensureWeekDataEscala(start, end, { force = false } = {}) {
    if (!force && cacheCobreFaixaEscala(start, end)) {
        return estado.escalaWeekCache.byDay;
    }

    const payload = await API.getEscalaRelatorio({ dataInicio: start, dataFim: end });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const byDay = {};

    items.forEach((item) => {
        const dia = toISODateEscala(item.dataISO || item.data);

        if (!dia) {
            return;
        }

        (byDay[dia] = byDay[dia] || []).push(item);
    });

    estado.escalaWeekCache = { start, end, byDay };
    return byDay;
}

const WEEK_STATUS_LABEL_ESCALA = {
    ok: 'cobertura tranquila',
    atencao: 'cobertura no limite',
    critico: 'cobertura no talo',
    vazio: 'sem expediente',
    load: 'carregando'
};

// Arrastar com o mouse rola a faixa; o clique que encerra um arrasto nao
// abre o dia. No toque e no trackpad a rolagem e a nativa do navegador.
let faixaArrastou = false;

function ligarArrastoFaixaEscala(container) {
    if (container.dataset.arrastoLigado === '1') {
        return;
    }

    container.dataset.arrastoLigado = '1';
    let inicioX = 0;
    let inicioScroll = 0;
    let pressionado = false;

    container.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }

        pressionado = true;
        faixaArrastou = false;
        inicioX = event.clientX;
        inicioScroll = container.scrollLeft;
    });

    container.addEventListener('pointermove', (event) => {
        if (!pressionado) {
            return;
        }

        const deslocamento = event.clientX - inicioX;

        if (!faixaArrastou && Math.abs(deslocamento) > 5) {
            faixaArrastou = true;
            container.classList.add('is-arrastando');
        }

        if (faixaArrastou) {
            container.scrollLeft = inicioScroll - deslocamento;
        }
    });

    const soltar = () => {
        pressionado = false;
        container.classList.remove('is-arrastando');
    };

    container.addEventListener('pointerup', soltar);
    container.addEventListener('pointerleave', soltar);

    // Captura: barra o clique do arrasto antes de chegar ao botao do dia.
    container.addEventListener('click', (event) => {
        if (faixaArrastou) {
            event.preventDefault();
            event.stopPropagation();
            faixaArrastou = false;
        }
    }, true);
}

// Centraliza o dia aberto so quando ele muda; os redesenhos ao vivo (a cada
// ajuste no dia) mantem a rolagem onde a pessoa deixou. Guardado no proprio
// elemento: voltar para a tela cria uma faixa nova, que precisa centralizar.
function posicionarFaixaEscala(container, iso, scrollAnterior) {
    if (container.dataset.diaCentrado === iso) {
        container.scrollLeft = scrollAnterior;
        return;
    }

    container.dataset.diaCentrado = iso;
    const selecionado = container.querySelector('.escala-week-pill.is-selected');

    if (selecionado) {
        container.scrollLeft = selecionado.offsetLeft - ((container.clientWidth - selecionado.offsetWidth) / 2);
    }
}

function renderWeekStripPillsEscala(dataISO, byDay) {
    const container = document.getElementById('escalaWeekStrip');

    if (!container) {
        return;
    }

    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const { days } = getFaixaDiasEscala(iso);
    const todayISO = toISODateEscala(new Date());
    const liveState = getCurrentScaleState();
    const liveISO = toISODateEscala(liveState.dataISO);
    const scrollAnterior = container.scrollLeft;

    container.innerHTML = days.map((dia, indice) => {
        let status = 'load';

        if (dia === liveISO) {
            status = getWeekStatusEscala(computeCoverageEscala(liveState.items || []));
        } else if (byDay && Object.prototype.hasOwnProperty.call(byDay, dia)) {
            status = getWeekStatusEscala(computeCoverageEscala(byDay[dia]));
        } else if (byDay) {
            status = 'vazio';
        }

        const dow = (DIA_LABELS[getIsoDayOfWeekEscala(dia)] || '').slice(0, 3);
        const [, mes, diaDoMes] = dia.split('-').map(Number);
        const dayNum = diaDoMes;
        // Numa faixa de seis semanas o mes muda: o primeiro dia de cada mes
        // (e o primeiro da faixa) mostra qual e.
        const mesCurto = diaDoMes === 1 || indice === 0 ? MESES_CURTOS_ESCALA[mes - 1] : '';
        const classes = ['escala-week-pill', `is-${status}`];

        if (dia === iso) {
            classes.push('is-selected');
        }

        if (dia === todayISO) {
            classes.push('is-today');
        }

        if (getIsoDayOfWeekEscala(dia) === 0) {
            classes.push('is-domingo');
        }

        return `<button type="button" class="${classes.join(' ')}" data-dia="${dia}" title="${formatDatePtBrEscala(dia)} - ${WEEK_STATUS_LABEL_ESCALA[status] || ''}" aria-label="${formatDatePtBrEscala(dia)}, ${WEEK_STATUS_LABEL_ESCALA[status] || ''}"${dia === iso ? ' aria-current="date"' : ''}>
                <span class="wp-dow">${dow}${mesCurto ? ` · ${mesCurto}` : ''}</span>
                <span class="wp-num">${dayNum}</span>
                <span class="wp-dot" aria-hidden="true"></span>
            </button>`;
    }).join('');

    ligarArrastoFaixaEscala(container);
    posicionarFaixaEscala(container, iso, scrollAnterior);

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

    const { start, end } = getFaixaDiasEscala(iso);
    const byDay = cacheCobreFaixaEscala(start, end) ? estado.escalaWeekCache.byDay : null;
    renderWeekStripPillsEscala(iso, byDay);
}

export async function renderWeekStripEscala(dataISO, { force = false } = {}) {
    const container = document.getElementById('escalaWeekStrip');

    if (!container) {
        return;
    }

    const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
    const { start, end } = getFaixaDiasEscala(iso);
    const cachedByDay = cacheCobreFaixaEscala(start, end) ? estado.escalaWeekCache.byDay : null;

    // Render imediato (cache ou placeholder), depois hidrata com o fetch.
    renderWeekStripPillsEscala(iso, cachedByDay);

    try {
        // Busca uma margem extra dos dois lados: os proximos cliques perto
        // daqui recentram a faixa sem nova chamada.
        const byDay = await ensureWeekDataEscala(
            shiftIsoDateEscala(start, -FAIXA_DIAS_ANTES),
            shiftIsoDateEscala(end, FAIXA_DIAS_DEPOIS),
            { force: force || !cachedByDay }
        );
        renderWeekStripPillsEscala(iso, byDay);
    } catch (error) {
        // A faixa e apoio: se o fetch falhar, a tela do dia continua util.
    }
}

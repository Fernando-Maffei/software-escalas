import { formatMinutesToTimeEscala } from '../escala-dia-shared.js';
import { hasCellClassEscala } from './calculo-horas.js';
import { getCellStateEscala } from './celulas-e-almoco.js';
import { applyScaleHourBoundsCssEscala, getCurrentScaleState, getScaleHourBoundsEscala, SLOT_MINUTES } from './estado-e-layout.js';
import { filterScaleItemsBySectorEscala } from './filtros-setor.js';

let escalaScrollResizeBound;
let escalaPanelObservado;
let escalaPanelResizeObserver;

export function renderScaleHeaderEscala(items) {
    const header = document.getElementById('timelineHeader');

    if (!header) {
        return;
    }

    // O cabecalho precisa usar os MESMOS itens visiveis (filtrados por
    // setor) que as linhas. Antes ele usava todos os colaboradores; ao
    // filtrar um setor de jornada mais curta, o numero de colunas divergia
    // do das linhas e o cabecalho quebrava para uma segunda linha.
    const visibleItems = items || filterScaleItemsBySectorEscala(getCurrentScaleState().items || []);
    const bounds = applyScaleHourBoundsCssEscala(visibleItems);

    header.innerHTML = '<div class="timeline-name-header">Colaborador</div>'
        + '<div class="hora-header total-header" title="Total de horas no dia">Total</div>'
        + Array.from({ length: bounds.columnCount }, (_, index) => {
            const slot = bounds.startSlot + index;
            const isHourMark = slot % 2 === 0;
            const label = formatMinutesToTimeEscala(slot * SLOT_MINUTES);
            // O rotulo vai dentro de um <span> proprio para que, no dia
            // longo, o CSS possa centra-lo na divisa da hora e deixa-lo
            // transbordar para a coluna da meia hora ao lado (que fica sem
            // rotulo nesses dias). E o que permite manter "07:00" inteiro
            // mesmo com a coluna em ~28px.
            // Meia hora tem duas versoes do rotulo: a completa ("07:30") e
            // a curta ("30"). No dia longo a coluna fica com ~28px e
            // "07:30" (42px) nao cabe, mas "30" (20px) cabe — e ate no
            // piso de 24px. Quem escolhe e o CSS, pelo data-horas-densas.
            return `<div class="hora-header${isHourMark ? '' : ' hora-header-half'}">`
                + `<span class="hora-rotulo">${label}</span>`
                + (isHourMark ? '' : '<span class="hora-rotulo-min">30</span>')
                + '</div>';
        }).join('');
}

// Cobertura por faixa de 30 min: quantas pessoas estao trabalhando (count) e
// quantas estao escaladas naquele slot (potential = trabalhando, almoco ou
// ausencia parcial). O "vale" e o menor count considerando apenas slots do
// expediente (potential > 0), para nao alarmar faixas em que ninguem trabalha.
export function computeCoverageEscala(items = []) {
    const list = Array.isArray(items) ? items : [];
    const bounds = getScaleHourBoundsEscala(list);
    // O alerta "No talo" (o vale da cobertura) so considera o horario
    // comercial (08:00-18:00). Antes das 8 e depois das 18 e plantao —
    // normal ter pouca gente —, entao essas faixas nao contam como gargalo.
    const COMERCIAL_INICIO_MIN = 8 * 60;
    const COMERCIAL_FIM_MIN = 18 * 60;
    const slots = [];
    let minPct = null;   // menor cobertura como fracao (count/potential)
    let minSlot = bounds.startSlot;
    let minCount = 0;
    let minPotential = 0;

    for (let index = 0; index < bounds.columnCount; index += 1) {
        const slot = bounds.startSlot + index;
        let count = 0;
        let potential = 0;

        list.forEach((record) => {
            const className = getCellStateEscala(record, slot).className;
            const working = hasCellClassEscala(className, 'trabalhando');
            const onShift = working
                || hasCellClassEscala(className, 'almoco')
                || hasCellClassEscala(className, 'ausencia-parcial');

            if (working) {
                count += 1;
            }

            if (onShift) {
                potential += 1;
            }
        });

        // Cobertura RELATIVA: quantos no balcao / quantos escalados naquela
        // hora (dentro do setor filtrado). Nao pune time pequeno: 2 de 2 =
        // 100%, 2 de 4 = 50%. O gargalo e o menor % do horario comercial.
        const pct = potential > 0 ? count / potential : null;
        slots.push({ slot, count, potential, pct });

        const slotMinuto = slot * SLOT_MINUTES;
        const dentroComercial = slotMinuto >= COMERCIAL_INICIO_MIN && slotMinuto < COMERCIAL_FIM_MIN;

        if (potential > 0 && dentroComercial && (minPct === null || pct < minPct)) {
            minPct = pct;
            minSlot = slot;
            minCount = count;
            minPotential = potential;
        }
    }

    return {
        bounds,
        slots,
        hasExpediente: minPct !== null,
        minPct: minPct === null ? 1 : minPct,
        minPctLabel: Math.round((minPct === null ? 1 : minPct) * 100),
        minCount,
        minPotential,
        minSlot,
        minTime: formatMinutesToTimeEscala(minSlot * SLOT_MINUTES)
    };
}

function getCoverageLevelEscala(item) {
    if (item.potential === 0) {
        return 'total-fora';
    }

    // Cor pela % (quem esta / quem foi escalado naquela hora), nao pelo
    // numero cru: <50% critico, 50-70% atencao, >=70% ok.
    const pct = item.pct != null ? item.pct : (item.potential ? item.count / item.potential : 0);

    if (pct < 0.5) {
        return 'total-critico';
    }

    if (pct < 0.7) {
        return 'total-atencao';
    }

    return 'total-ok';
}

// Limita a altura do .escala-scroll ao que sobra na janela para que o grid
// role verticalmente DENTRO dele (e nao no <main>). E o que permite o
// cabecalho de horas grudar no topo (position:sticky) ao rolar a lista.
function ajustarAlturaScrollEscala() {
    const scrollEl = document.querySelector('.escala-page .escala-scroll');

    if (!scrollEl) {
        return;
    }

    // Com o grid rolando aqui dentro, o <main> nao rola e o topo do scroller
    // (logo abaixo do painel fixo) fica estavel para essa medida.
    const topo = scrollEl.getBoundingClientRect().top;
    const folgaInferior = 18;
    const altura = window.innerHeight - topo - folgaInferior;
    scrollEl.style.setProperty('--escala-scroll-max', `${Math.max(260, Math.round(altura))}px`);
}

// O topo do scroller muda com a altura do painel fixo (que cresce/encolhe
// conforme a faixa de acoes quebra de linha ou as abas de setor aparecem) e
// com o tamanho da janela. Reobserva o painel a cada render e escuta resize.
export function bindScrollHeightAutoEscala() {
    ajustarAlturaScrollEscala();

    const panel = document.querySelector('.escala-page .escala-sticky-panel');

    if (panel && window.ResizeObserver && escalaPanelObservado !== panel) {
        if (escalaPanelResizeObserver) {
            escalaPanelResizeObserver.disconnect();
        }
        const observer = new ResizeObserver(() => window.requestAnimationFrame(ajustarAlturaScrollEscala));
        observer.observe(panel);
        escalaPanelResizeObserver = observer;
        escalaPanelObservado = panel;
    }

    if (!escalaScrollResizeBound) {
        escalaScrollResizeBound = true;
        window.addEventListener('resize', () => window.requestAnimationFrame(ajustarAlturaScrollEscala));
    }
}

export function renderTotalRowEscala(items) {
    const body = document.getElementById('timelineBody');

    if (!body || !items.length) {
        return;
    }

    const coverage = computeCoverageEscala(items);
    const maxCount = Math.max(1, ...coverage.slots.map((item) => item.count));
    const row = document.createElement('div');
    row.className = 'timeline-row total-row';
    row.innerHTML = `
            <!-- Ocupa nome + total numa celula so: a coluna de Total nao tem
                 valor nesta linha (o total por pessoa nao se aplica a uma
                 contagem por faixa de horario), entao ficava um retangulo
                 vazio ao lado do rotulo. Fundidas, o rotulo respira e a
                 emenda some. -->
            <div class="timeline-name total-nome total-nome--full">
                <i class="fas fa-users"></i>
                <span><strong>TRABALHANDO</strong></span>
            </div>
            ${coverage.slots.map((item) => {
            const nivel = getCoverageLevelEscala(item);
            const isVale = coverage.hasExpediente && item.slot === coverage.minSlot && item.potential > 0;
            const horaLabel = formatMinutesToTimeEscala(item.slot * SLOT_MINUTES);
            const titulo = item.potential === 0
                ? `${horaLabel} - fora do expediente`
                : `${horaLabel} - ${item.count} trabalhando`;
            const altura = Math.max(3, Math.round((item.count / maxCount) * 34));
            return `
                    <div class="timeline-cell total-cell cov-col ${nivel}${isVale ? ' total-vale' : ''}" title="${titulo}">
                        ${item.potential === 0 ? '' : `<span class="cov-bar" style="height:${altura}px"></span>`}
                        <span class="total-valor">${item.potential === 0 ? '' : item.count}</span>
                    </div>
                `;
        }).join('')}
        `;

    body.appendChild(row);
}

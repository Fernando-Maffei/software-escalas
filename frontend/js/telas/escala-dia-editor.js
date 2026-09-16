/* eslint-disable */
// Editor de Escala do Dia (grade de horarios com arrasta-e-solta do almoco).
// Depende de frontend/js/telas/escala-dia-shared.js (deve carregar antes deste arquivo).
// Script global (sem IIFE) de proposito: o codigo de roteamento de paginas que
// ficou em runtime-fixes.js chama varias funcoes internas daqui por nome solto
// (carregarEscalaDiaEscala, obterDataSelecionadaEscala, atualizarAcoesCabecalhoEscala,
// abrirEditorNaEscala).

    const SLOT_MINUTES = 30;

    function getCurrentScaleState() {
        return window.__escalaDiaState || {
            dataISO: toISODateEscala(new Date()),
            items: []
        };
    }

    function setCurrentScaleState(state) {
        window.__escalaDiaState = state;
        return state;
    }

    function getScaleHourBoundsEscala(items = getCurrentScaleState().items || []) {
        let earliestMinutes = null;
        let latestMinutes = null;

        const includeCandidate = (value) => {
            if (!Number.isFinite(value)) {
                return;
            }

            earliestMinutes = earliestMinutes === null ? value : Math.min(earliestMinutes, value);
            latestMinutes = latestMinutes === null ? value : Math.max(latestMinutes, value);
        };

        (items || []).forEach((item) => {
            const workStart = getTimeMinutesEscala(item?.horaInicio);
            const workEnd = getTimeMinutesEscala(item?.horaFim);

            if (workStart !== null && workEnd !== null && workEnd > workStart) {
                includeCandidate(workStart);
                includeCandidate(workEnd);
                includeCandidate(getTimeMinutesEscala(item?.almocoInicio));
                includeCandidate(getTimeMinutesEscala(item?.almocoFim));
            }
        });

        if (earliestMinutes === null || latestMinutes === null) {
            earliestMinutes = HORA_INICIAL * 60;
            latestMinutes = HORA_FINAL * 60;
        }

        const lastSlotOfDay = Math.floor((24 * 60) / SLOT_MINUTES) - 1;
        const startSlot = Math.max(0, Math.floor(earliestMinutes / SLOT_MINUTES));
        const endSlot = Math.min(lastSlotOfDay, Math.ceil(latestMinutes / SLOT_MINUTES));

        return {
            startSlot,
            endSlot: Math.max(startSlot, endSlot),
            columnCount: Math.max(1, (Math.max(startSlot, endSlot) - startSlot) + 1)
        };
    }

    // Largura da coluna de nomes medida pelo CONTEUDO REAL do dia.
    //
    // Antes era um valor fixo, calibrado no maior nome que existia na epoca.
    // Com nomes curtos ("Ivan", "Jean", "Mike") sobravam ~58px por linha sem
    // uso — espaco que faz falta justamente quando a barra lateral e o painel
    // de ajustes estao abertos e as horas ficam espremidas.
    //
    // A largura continua sendo UM valor unico para todas as linhas (e o que
    // mantem cabecalho e linhas alinhados); o que muda e como esse valor e
    // escolhido. Limites evitam os dois extremos: estreita demais para ler e
    // larga a ponto de roubar a area de horas.
    const NOME_LARGURA_MIN = 132;
    const NOME_LARGURA_MAX = 230;
    let medidorNomeCanvas = null;

    function medirTextoNomeEscala(texto, fonte) {
        if (!medidorNomeCanvas) {
            medidorNomeCanvas = document.createElement('canvas');
        }

        const ctx = medidorNomeCanvas.getContext('2d');
        ctx.font = fonte;
        return ctx.measureText(texto || '').width;
    }

    function ajustarLarguraColunaNomeEscala(items = []) {
        const escalaPage = document.querySelector('.escala-page');
        const amostra = document.querySelector('.timeline-name-text');

        if (!escalaPage || !amostra) {
            return;
        }

        const estilo = window.getComputedStyle(amostra);
        const fonte = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
        let maior = 0;

        (items || []).forEach((item) => {
            maior = Math.max(maior, medirTextoNomeEscala(item?.colaboradorNome || '', fonte));
        });

        // Espaco fixo da celula que nao e o nome: avatar, botao de editar,
        // os dois gaps e o padding lateral. Lido do CSS para nao duplicar
        // numeros que podem mudar por breakpoint.
        const gridCols = window.getComputedStyle(amostra.closest('.timeline-name')).gridTemplateColumns.split(' ');
        const avatar = parseFloat(gridCols[0]) || 30;
        const acao = parseFloat(gridCols[2]) || 30;
        const nomeEl = amostra.closest('.timeline-name');
        const estiloNome = window.getComputedStyle(nomeEl);
        const cromo = avatar + acao
            + (parseFloat(estiloNome.columnGap) || 8) * 2
            + (parseFloat(estiloNome.paddingLeft) || 10)
            + (parseFloat(estiloNome.paddingRight) || 10);

        // +2px de folga para o arredondamento nao cortar a ultima letra.
        const alvo = Math.ceil(maior + 2 + cromo);
        const largura = Math.min(NOME_LARGURA_MAX, Math.max(NOME_LARGURA_MIN, alvo));

        escalaPage.style.setProperty('--esc-col-nome', `${largura}px`);
    }

    // Fonte dos rotulos de hora conforme o espaco REAL de cada coluna.
    //
    // A largura da coluna nao depende so da tela: abrir a barra lateral e o
    // painel de ajustes ao mesmo tempo pode espremer a grade ate o piso de
    // 24px, onde os rotulos passam a quase se encostar. Em vez de deixar o
    // texto colidir (ou sumir), a fonte encolhe junto.
    //
    // Faixas em degraus, nao formula continua: evita o texto "respirando" a
    // cada pixel de redimensionamento.
    function ajustarFonteHorasEscala() {
        const escalaPage = document.querySelector('.escala-page');
        const celula = document.querySelector('.timeline-cell[data-slot]');

        if (!escalaPage || !celula) {
            return;
        }

        const largura = celula.getBoundingClientRect().width;
        let fonte = 11;

        if (largura < 30) {
            fonte = 9;
        } else if (largura < 36) {
            fonte = 10;
        }

        escalaPage.style.setProperty('--esc-hora-fonte', `${fonte}px`);
    }

    // Reage a mudancas de largura da area da timeline — abrir/fechar a barra
    // lateral ou o painel de ajustes muda o espaco sem trocar de dia, entao
    // nao passaria por um novo render.
    function observarLarguraTimelineEscala() {
        const alvo = document.querySelector('.escala-scroll');

        if (!alvo || alvo.dataset.observandoLargura === 'true' || typeof ResizeObserver !== 'function') {
            return;
        }

        alvo.dataset.observandoLargura = 'true';
        new ResizeObserver(() => ajustarFonteHorasEscala()).observe(alvo);
    }

    function applyScaleHourBoundsCssEscala(items = getCurrentScaleState().items || []) {
        const escalaPage = document.querySelector('.escala-page');
        const bounds = getScaleHourBoundsEscala(items);

        if (escalaPage) {
            escalaPage.style.setProperty('--escala-hour-columns', String(bounds.columnCount));
            // Dia longo (ex.: plantonista ate 22:00) gera muitas colunas e cada
            // uma fica estreita demais para o rotulo "07:30". O CSS usa esta
            // marca para enxugar o cabecalho nesses dias, em vez de deixar o
            // texto vazar ou obrigar a rolagem horizontal.
            escalaPage.dataset.horasDensas = bounds.columnCount > 26 ? '1' : '0';
        }

        return bounds;
    }

    function getScaleSortModeEscala() {
        return window.__escalaSortMode || 'alpha';
    }

    function setScaleSortModeEscala(value) {
        const allowedModes = ['alpha', 'work_start', 'lunch_start', 'lunch_end'];
        const normalized = allowedModes.includes(String(value || '').trim()) ? value : 'alpha';
        window.__escalaSortMode = normalized;

        const select = document.getElementById('escalaSortMode');
        if (select && select.value !== normalized) {
            select.value = normalized;
        }

        return normalized;
    }

    const DENSIDADES_ESCALA = ['confortavel', 'compacta'];
    const DENSIDADE_ESCALA_STORAGE_KEY = 'escalaDensidade';

    function lerDensidadeEscalaSalva() {
        try {
            const salva = localStorage.getItem(DENSIDADE_ESCALA_STORAGE_KEY);
            return DENSIDADES_ESCALA.includes(salva) ? salva : 'confortavel';
        } catch (error) {
            // localStorage pode falhar (modo privativo, politica do navegador).
            // A densidade e preferencia visual, entao cai no padrao em silencio.
            return 'confortavel';
        }
    }

    function aplicarDensidadeEscala(valor) {
        const densidade = DENSIDADES_ESCALA.includes(valor) ? valor : 'confortavel';
        const pagina = document.querySelector('.escala-page');

        if (pagina) {
            pagina.dataset.densidade = densidade;
        }

        document.querySelectorAll('.escala-densidade-btn').forEach((botao) => {
            botao.classList.toggle('is-ativo', botao.dataset.densidade === densidade);
        });

        try {
            localStorage.setItem(DENSIDADE_ESCALA_STORAGE_KEY, densidade);
        } catch (error) {
            // Sem persistencia a densidade vale so para esta sessao.
        }

        return densidade;
    }

    // Selecao de setores agora e MULTIPLA: um conjunto de ids. Conjunto vazio =
    // "Todos" (sem filtro). O gestor liga o(s) setor(es) dele e a escala + o %
    // de cobertura passam a considerar so esses.
    function getScaleSectorSelectionEscala() {
        if (!(window.__escalaSectorSelection instanceof Set)) {
            window.__escalaSectorSelection = new Set();

            // Semente com a preferencia "Meus setores" da conta: ao abrir a
            // escala, ela ja vem filtrada pelos setores que o gestor escolheu.
            // So para contas SEM teto de setor — quem tem restricao ve apenas o
            // permitido (imposto no backend) e nao usa o filtro self-service.
            const restrito = typeof window.temRestricaoDeSetor === 'function' && window.temRestricaoDeSetor();

            if (!restrito && typeof window.getMeusSetores === 'function') {
                window.getMeusSetores().forEach((id) => window.__escalaSectorSelection.add(String(id)));
            }
        }
        return window.__escalaSectorSelection;
    }

    function toggleScaleSectorEscala(id) {
        const selecao = getScaleSectorSelectionEscala();

        if (id === 'all' || !id) {
            selecao.clear(); // "Todos" = nenhum filtro
            return selecao;
        }

        const chave = String(id);

        if (selecao.has(chave)) {
            selecao.delete(chave);
        } else {
            selecao.add(chave);
        }

        return selecao;
    }

    function buildScaleSectorFiltersEscala(items = []) {
        const dynamicMap = new Map();

        (window.setores || []).forEach((setor) => {
            dynamicMap.set(String(setor.id), {
                id: String(setor.id),
                nome: setor.nome
            });
        });

        (items || []).forEach((item) => {
            if (item.setorId && item.setorNome && !dynamicMap.has(String(item.setorId))) {
                dynamicMap.set(String(item.setorId), {
                    id: String(item.setorId),
                    nome: item.setorNome
                });
            }
        });

        return [
            { id: 'all', nome: 'Todos' },
            ...Array.from(dynamicMap.values()).sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || '')))
        ];
    }

    function filterScaleItemsBySectorEscala(items = []) {
        const selecao = getScaleSectorSelectionEscala();

        if (selecao.size === 0) {
            return [...items]; // Todos
        }

        return (items || []).filter((item) => selecao.has(String(item.setorId || '')));
    }

    function renderScaleSectorTabsEscala(items = []) {
        const container = document.getElementById('escalaSectorTabs');

        if (!container) {
            return;
        }

        // Conta com teto de setor (definido na config de Usuarios): o que ela ve
        // ja e so o permitido (imposto no backend). Nao faz sentido oferecer
        // abas de setor aqui — some com elas e nao aplica filtro extra.
        if (typeof window.temRestricaoDeSetor === 'function' && window.temRestricaoDeSetor()) {
            getScaleSectorSelectionEscala().clear();
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = '';

        const filters = buildScaleSectorFiltersEscala(items);
        const selecao = getScaleSectorSelectionEscala();

        // A selecao de setor NAO e mais podada aqui.
        //
        // Antes, todo setor ausente do dia atual saia da selecao. Isso fazia o
        // filtro sumir sozinho ao navegar: com "N1" ativo, bastava passar por
        // um dia sem ninguem do N1 para o filtro ser descartado em silencio e
        // nao voltar ao retornar para o dia anterior.
        //
        // O medo original — filtro "fantasma" escondendo todo mundo — e
        // tratado onde de fato importa: quando o filtro zera as linhas, a
        // timeline mostra um estado vazio dizendo que o filtro esta ativo, com
        // um botao para limpa-lo (ver renderScaleRowsEscala).
        //
        // As abas saem de window.setores (todos os cadastrados), nao dos itens
        // do dia, entao um setor selecionado continua visivel para ser
        // desmarcado mesmo sem ninguem escalado nele hoje. Um setor EXCLUIDO do
        // sistema perderia a aba, mas ai o estado vazio com "Limpar filtro"
        // resolve — nao ha como ficar preso.

        container.innerHTML = filters.map((setor) => {
            const ehTodos = setor.id === 'all';
            const ativo = ehTodos ? selecao.size === 0 : selecao.has(String(setor.id));
            return `
            <button
                type="button"
                class="escala-sector-tab ${ativo ? 'is-active' : ''}"
                data-escala-setor="${escapeHtmlEscala(String(setor.id))}"
                aria-pressed="${ativo ? 'true' : 'false'}"
            >
                ${escapeHtmlEscala(setor.nome)}
            </button>`;
        }).join('');

        container.querySelectorAll('[data-escala-setor]').forEach((button) => {
            button.addEventListener('click', () => {
                const selecaoAtual = toggleScaleSectorEscala(button.getAttribute('data-escala-setor'));

                // As abas da escala sao o editor de "Meus setores": o que o
                // gestor liga/desliga aqui vira a preferencia salva da conta e
                // passa a valer tambem no Dashboard e no Plantao.
                if (typeof window.salvarMeusSetores === 'function') {
                    window.salvarMeusSetores([...selecaoAtual]);
                }

                renderScaleSectorTabsEscala(getCurrentScaleState().items || []);
                renderScaleRowsEscala(getCurrentScaleState());
            });
        });
    }

    function getSortableMinutesEscala(value) {
        const minutes = getTimeMinutesEscala(value);
        return minutes === null ? Number.POSITIVE_INFINITY : minutes;
    }

    function compareScaleRecordsEscala(first, second) {
        const sortMode = getScaleSortModeEscala();
        const nameA = String(first.colaboradorNome || '').toLowerCase();
        const nameB = String(second.colaboradorNome || '').toLowerCase();

        if (sortMode === 'work_start') {
            const diff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return diff || nameA.localeCompare(nameB);
        }

        if (sortMode === 'lunch_start') {
            const diff = getSortableMinutesEscala(first.almocoInicio) - getSortableMinutesEscala(second.almocoInicio);
            if (diff) {
                return diff;
            }

            const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return workDiff || nameA.localeCompare(nameB);
        }

        if (sortMode === 'lunch_end') {
            const diff = getSortableMinutesEscala(first.almocoFim) - getSortableMinutesEscala(second.almocoFim);
            if (diff) {
                return diff;
            }

            const workDiff = getSortableMinutesEscala(first.horaInicio) - getSortableMinutesEscala(second.horaInicio);
            return workDiff || nameA.localeCompare(nameB);
        }

        return nameA.localeCompare(nameB);
    }

    function isFullDayOffEscala(record) {
        return ['folga', 'ferias', 'ausencia'].includes(String(record?.tipo || '').toLowerCase())
            && !getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
    }

    function getPartialAbsenceEscala(colaboradorId, dataISO) {
        const normalizedDate = toISODateEscala(dataISO);

        return (window.ausencias || []).find((item) => {
            const itemColaboradorId = Number(item.colaboradorId || item.ColaboradorId);
            const periodoTipo = String(item.periodoTipo || item.PeriodoTipo || 'dia_inteiro').toLowerCase();
            const inicio = toISODateEscala(item.DataInicio || item.dataInicio);
            const fim = toISODateEscala(item.DataFim || item.dataFim);

            return itemColaboradorId === Number(colaboradorId)
                && periodoTipo === 'horas'
                && inicio
                && fim
                && normalizedDate >= inicio
                && normalizedDate <= fim;
        }) || null;
    }

    function getIntervalOverlapMinutesEscala(start, end, targetStart, targetEnd) {
        if (![start, end, targetStart, targetEnd].every(Number.isFinite) || end <= start || targetEnd <= targetStart) {
            return 0;
        }

        return Math.max(Math.min(end, targetEnd) - Math.max(start, targetStart), 0);
    }

    function getClampedIntervalEscala(start, end, min, max) {
        if (![start, end, min, max].every(Number.isFinite) || end <= start || max <= min) {
            return null;
        }

        const clampedStart = Math.max(start, min);
        const clampedEnd = Math.min(end, max);

        if (clampedEnd <= clampedStart) {
            return null;
        }

        return {
            start: clampedStart,
            end: clampedEnd
        };
    }

    function mergeIntervalsEscala(intervals) {
        const sorted = intervals
            .filter(Boolean)
            .sort((first, second) => first.start - second.start || first.end - second.end);
        const merged = [];

        sorted.forEach((interval) => {
            const previous = merged[merged.length - 1];

            if (!previous || interval.start > previous.end) {
                merged.push({ ...interval });
                return;
            }

            previous.end = Math.max(previous.end, interval.end);
        });

        return merged;
    }

    function hasCellClassEscala(className, expectedClass) {
        return String(className || '').split(/\s+/).includes(expectedClass);
    }

    function calculateWorkedMinutesEscala(record) {
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);

        if (start === null || end === null || isFullDayOffEscala(record)) {
            return 0;
        }

        const total = Math.max(end - start, 0);
        const blockedIntervals = [];
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            blockedIntervals.push(getClampedIntervalEscala(lunchStart, lunchEnd, start, end));
        }

        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
            blockedIntervals.push(getClampedIntervalEscala(absenceStart, absenceEnd, start, end));
        }

        const blockedMinutes = mergeIntervalsEscala(blockedIntervals)
            .reduce((sum, interval) => sum + Math.max(interval.end - interval.start, 0), 0);

        return Math.max(total - blockedMinutes, 0);
    }

    function getColaboradorCadastroEscala(colaboradorId) {
        return (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId)) || null;
    }

    function getDefaultLunchRangeEscala(colaboradorId) {
        const colaborador = getColaboradorCadastroEscala(colaboradorId);
        const start = getTimeMinutesEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
        const end = getTimeMinutesEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

        if (start === null || end === null || end <= start) {
            return null;
        }

        return { start, end };
    }

    function isSameLunchAsCadastroEscala(colaboradorId, almocoInicio, almocoFim) {
        const colaborador = getColaboradorCadastroEscala(colaboradorId);
        const cadastroInicio = formatTimeInputEscala(colaborador?.AlmocoInicio || colaborador?.almocoInicio);
        const cadastroFim = formatTimeInputEscala(colaborador?.AlmocoFim || colaborador?.almocoFim);

        return cadastroInicio === formatTimeInputEscala(almocoInicio)
            && cadastroFim === formatTimeInputEscala(almocoFim);
    }

    function getCellStateEscala(record, slot) {
        const tipo = window.normalizeRuntimeEscalaTipo(record.tipo || '');
        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        const defaultLunch = getDefaultLunchRangeEscala(record.colaboradorId);
        const adjustedLunch = Boolean(record.almocoPersonalizado || record.almocoAjustado);
        const currentHourStart = slot * SLOT_MINUTES;
        const currentHourEnd = currentHourStart + SLOT_MINUTES;
        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStart = getTimeMinutesEscala(partialAbsence?.horaInicio || partialAbsence?.HoraInicio);
        const absenceEnd = getTimeMinutesEscala(partialAbsence?.horaFim || partialAbsence?.HoraFim);

        if (tipo === 'ferias' && !partialAbsence) {
            return { className: 'ferias', status: 'Ferias' };
        }

        if (tipo === 'folga' && !partialAbsence) {
            return { className: 'folga', status: 'Folga' };
        }

        if (tipo === 'ausencia' && !partialAbsence) {
            return { className: 'ausencia', status: 'Ausencia' };
        }

        const workOverlap = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, start, end);

        if (start === null || end === null || end <= start || workOverlap <= 0) {
            return { className: 'fora-expediente', status: 'Fora do expediente' };
        }

        if (absenceStart !== null && absenceEnd !== null && absenceEnd > absenceStart) {
            const overlapAbsence = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, absenceStart, absenceEnd);

            if (overlapAbsence > 0) {
                return { className: 'ausencia-parcial', status: 'Ausencia parcial' };
            }
        }

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            const overlapLunch = getIntervalOverlapMinutesEscala(currentHourStart, currentHourEnd, lunchStart, lunchEnd);

            if (overlapLunch > 0) {
                return { className: `almoco${adjustedLunch ? ' almoco-ajustado' : ''}`, status: 'Almoco' };
            }
        }

        if (adjustedLunch && defaultLunch) {
            const overlapDefaultLunch = Math.max(
                Math.min(currentHourEnd, defaultLunch.end) - Math.max(currentHourStart, defaultLunch.start),
                0
            );

            if (overlapDefaultLunch > 0) {
                return { className: 'trabalhando almoco-cadastro-hint', status: 'Horario padrao do almoco' };
            }
        }

        return {
            className: 'trabalhando',
            status: tipo === 'plantao' ? 'Plantao' : 'Trabalhando'
        };
    }

    function clearLunchDropPreviewEscala() {
        document.querySelectorAll('.timeline-cell.drop-target-over, .timeline-cell.drop-preview').forEach((cell) => {
            cell.classList.remove('drop-target-over', 'drop-preview');
        });

        document.querySelectorAll('.timeline-row.is-dragging-lunch, .timeline-row.is-saving-lunch').forEach((row) => {
            row.classList.remove('is-dragging-lunch', 'is-saving-lunch');
        });
    }

    function buildLunchDropRangeEscala(record, targetSlot) {
        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);

        if (
            workStart === null
            || workEnd === null
            || lunchStart === null
            || lunchEnd === null
            || lunchEnd <= lunchStart
        ) {
            return null;
        }

        const duration = lunchEnd - lunchStart;
        const nextStart = targetSlot * SLOT_MINUTES;
        const nextEnd = nextStart + duration;

        if (nextStart < workStart || nextEnd > workEnd) {
            return null;
        }

        return {
            startMinutes: nextStart,
            endMinutes: nextEnd
        };
    }

    function applyLunchDropPreviewEscala(row, range) {
        clearLunchDropPreviewEscala();

        if (!row || !range) {
            return;
        }

        row.classList.add('is-dragging-lunch');

        row.querySelectorAll('.timeline-cell[data-slot]').forEach((cell) => {
            const slot = Number(cell.dataset.slot);
            const currentHourStart = slot * SLOT_MINUTES;
            const currentHourEnd = currentHourStart + SLOT_MINUTES;
            const overlap = Math.max(
                Math.min(currentHourEnd, range.endMinutes) - Math.max(currentHourStart, range.startMinutes),
                0
            );

            if (overlap > 0) {
                cell.classList.add('drop-preview');
            }
        });
    }

    function getTimelineVisibleBoundsEscala() {
        const bounds = getScaleHourBoundsEscala();
        return {
            start: bounds.startSlot * SLOT_MINUTES,
            end: (bounds.endSlot + 1) * SLOT_MINUTES
        };
    }

    function getScaleLunchDraftEscala(colaboradorId) {
        return window.__escalaLunchDrafts?.[Number(colaboradorId)] || null;
    }

    function setScaleLunchDraftEscala(colaboradorId, draft) {
        if (!window.__escalaLunchDrafts) {
            window.__escalaLunchDrafts = {};
        }

        if (!draft) {
            delete window.__escalaLunchDrafts[Number(colaboradorId)];
            return;
        }

        window.__escalaLunchDrafts[Number(colaboradorId)] = draft;
    }

    function applyScaleLunchDraftEscala(record) {
        const draft = getScaleLunchDraftEscala(record?.colaboradorId);

        if (!draft) {
            return record;
        }

        return {
            ...record,
            almocoInicio: draft.almocoInicio,
            almocoFim: draft.almocoFim
        };
    }

    function buildTimelineLunchOverlayEscala(record) {
        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);
        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        const visibleBounds = getTimelineVisibleBoundsEscala();
        const visibleSpan = visibleBounds.end - visibleBounds.start;

        if (workStart === null || workEnd === null || lunchStart === null || lunchEnd === null || lunchEnd <= lunchStart) {
            return '';
        }

        const clampedStart = Math.max(lunchStart, visibleBounds.start);
        const clampedEnd = Math.min(lunchEnd, visibleBounds.end);

        if (clampedEnd <= clampedStart || visibleSpan <= 0) {
            return '';
        }

        const left = ((clampedStart - visibleBounds.start) / visibleSpan) * 100;
        const width = ((clampedEnd - clampedStart) / visibleSpan) * 100;
        const adjusted = record.almocoPersonalizado || record.almocoAjustado;

        return `
            <div class="timeline-lunch-overlay" data-colaborador-id="${record.colaboradorId}">
                <div
                    class="timeline-lunch-drag-block${adjusted ? ' is-adjusted' : ''}"
                    data-role="lunch-block"
                    style="left:${left}%;width:${width}%;"
                    title="Arraste o almoco diretamente na tabela"
                >
                    <button type="button" class="timeline-lunch-handle start" data-role="start" aria-label="Ajustar inicio do almoco"></button>
                    <span class="timeline-lunch-label">${escapeHtmlEscala(formatTimeRangeEscala(record.almocoInicio, record.almocoFim))}</span>
                    <button type="button" class="timeline-lunch-handle end" data-role="end" aria-label="Ajustar fim do almoco"></button>
                </div>
            </div>
        `;
    }

    async function salvarAjusteDiretoAlmocoEscala(colaboradorId, startMinutes, endMinutes) {
        const state = getCurrentScaleState();
        const currentRecord = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId));

        if (!currentRecord) {
            throw new Error('Registro diario nao encontrado para este colaborador.');
        }

        const nextStart = formatMinutesToTimeEscala(startMinutes);
        const nextEnd = formatMinutesToTimeEscala(endMinutes);
        const restoredDefault = isSameLunchAsCadastroEscala(colaboradorId, nextStart, nextEnd);
        const currentStart = formatTimeInputEscala(currentRecord.almocoInicio);
        const currentEnd = formatTimeInputEscala(currentRecord.almocoFim);

        if (nextStart === currentStart && nextEnd === currentEnd) {
            setScaleLunchDraftEscala(colaboradorId, null);
            return {
                restoredDefault
            };
        }

        setScaleLunchDraftEscala(colaboradorId, {
            almocoInicio: nextStart,
            almocoFim: nextEnd
        });

        try {
            await window.API.salvarEscalaDia(state.dataISO, colaboradorId, {
                horaInicio: currentRecord.horaInicio || null,
                horaFim: currentRecord.horaFim || null,
                almocoInicio: nextStart,
                almocoFim: nextEnd,
                observacao: currentRecord.observacao ?? null
            });
            setScaleLunchDraftEscala(colaboradorId, null);
            await atualizarTudo({ silent: true, source: 'escala' });

            if (window.__escalaEditorColaboradorId && Number(window.__escalaEditorColaboradorId) === Number(colaboradorId)) {
                abrirEditorNaEscala(colaboradorId);
            }

            return {
                restoredDefault
            };
        } catch (error) {
            setScaleLunchDraftEscala(colaboradorId, null);
            renderScaleRowsEscala(getCurrentScaleState());
            throw error;
        }
    }

    function bindLunchCellDragEscala(row, record) {
        const lunchCells = Array.from(row.querySelectorAll('.timeline-cell.almoco[data-slot]'));
        const allCells = Array.from(row.querySelectorAll('.timeline-cell[data-slot]'));

        if (lunchCells.length === 0) {
            return;
        }

        const dragState = {
            colaboradorId: Number(record.colaboradorId),
            dataISO: record.dataISO
        };

        lunchCells.forEach((cell) => {
            cell.draggable = true;
            cell.classList.add('is-lunch-draggable');

            cell.addEventListener('dragstart', (event) => {
                window.__escalaLunchHtmlDrag = dragState;
                row.classList.add('is-dragging-lunch');
                cell.classList.add('is-drag-source');

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(record.colaboradorId));
                }
            });

            cell.addEventListener('dragend', () => {
                cell.classList.remove('is-drag-source');
                window.__escalaLunchHtmlDrag = null;
                clearLunchDropPreviewEscala();
            });
        });

        allCells.forEach((cell) => {
            const slot = Number(cell.dataset.slot);

            cell.addEventListener('dragover', (event) => {
                const currentDrag = window.__escalaLunchHtmlDrag;
                const range = buildLunchDropRangeEscala(record, slot);

                if (!currentDrag || currentDrag.colaboradorId !== Number(record.colaboradorId) || !range) {
                    return;
                }

                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
                cell.classList.add('drop-target-over');
                applyLunchDropPreviewEscala(row, range);
            });

            cell.addEventListener('dragleave', () => {
                cell.classList.remove('drop-target-over');
            });

            cell.addEventListener('drop', async (event) => {
                const currentDrag = window.__escalaLunchHtmlDrag;
                const range = buildLunchDropRangeEscala(record, slot);

                event.preventDefault();
                event.stopPropagation();
                cell.classList.remove('drop-target-over');

                if (!currentDrag || currentDrag.colaboradorId !== Number(record.colaboradorId) || !range) {
                    clearLunchDropPreviewEscala();
                    return;
                }

                row.classList.add('is-saving-lunch');

                try {
                    const result = await salvarAjusteDiretoAlmocoEscala(record.colaboradorId, range.startMinutes, range.endMinutes);
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(
                            result?.restoredDefault
                                ? 'Almoco voltou ao horario padrao do cadastro.'
                                : 'Almoco ajustado apenas para este dia.',
                            'success'
                        );
                    }
                } catch (error) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Erro ao ajustar almoco: ${error.message}`, 'error');
                    }
                } finally {
                    window.__escalaLunchHtmlDrag = null;
                    clearLunchDropPreviewEscala();
                }
            });
        });
    }

    function renderScaleHeaderEscala(items) {
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
    function computeCoverageEscala(items = []) {
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
    function bindScrollHeightAutoEscala() {
        ajustarAlturaScrollEscala();

        const panel = document.querySelector('.escala-page .escala-sticky-panel');

        if (panel && window.ResizeObserver && window.__escalaPanelObservado !== panel) {
            if (window.__escalaPanelResizeObserver) {
                window.__escalaPanelResizeObserver.disconnect();
            }
            const observer = new ResizeObserver(() => window.requestAnimationFrame(ajustarAlturaScrollEscala));
            observer.observe(panel);
            window.__escalaPanelResizeObserver = observer;
            window.__escalaPanelObservado = panel;
        }

        if (!window.__escalaScrollResizeBound) {
            window.__escalaScrollResizeBound = true;
            window.addEventListener('resize', () => window.requestAnimationFrame(ajustarAlturaScrollEscala));
        }
    }

    function renderTotalRowEscala(items) {
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

    // Rotulo "08:00 as 17:00" para leitores de tela: a barra na timeline
    // comunica o turno visualmente, mas nada disso chega a quem usa leitor —
    // o texto vai no aria-label da linha.
    function buildTimeRangeLabelEscala(record) {
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
    function renderScaleMessageEscala({ label, icon, title, description, variante = '', acaoHtml = '' }) {
        const body = document.getElementById('timelineBody');

        if (!body) {
            return;
        }

        const bounds = getScaleHourBoundsEscala();

        body.innerHTML = `
            <div class="timeline-row mensagem-row${variante ? ` ${variante}` : ''}">
                <div class="timeline-name mensagem-nome">
                    <i class="fas ${icon}"></i>
                    <span>${escapeHtmlEscala(label)}</span>
                </div>
                <div class="timeline-cell mensagem-cell" style="grid-column: span ${bounds.columnCount + 1};">
                    <div class="mensagem-conteudo">
                        <i class="fas ${icon}"></i>
                        <h3>${escapeHtmlEscala(title)}</h3>
                        <p>${escapeHtmlEscala(description)}</p>
                        ${acaoHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // Enquanto a requisicao do dia esta em voo. Sem isto, trocar de data dava
    // a impressao de que nada aconteceu — a tela seguia mostrando o dia
    // anterior ate a resposta chegar.
    function renderScaleLoadingEscala(dataISO) {
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
    function renderScaleErrorEscala(dataISO, error) {
        renderScaleMessageEscala({
            label: 'ERRO',
            icon: 'fa-triangle-exclamation',
            title: 'Nao foi possivel carregar a escala',
            description: error?.message || 'Verifique sua conexao e tente novamente.',
            variante: 'mensagem-row--erro',
            acaoHtml: `
                <button type="button" class="btn-repetir-escala" data-repetir-escala="${escapeHtmlEscala(dataISO)}">
                    <i class="fas fa-rotate-right"></i> Tentar novamente
                </button>
            `
        });
    }

    function renderScaleEmptyMessageEscala(dataISO) {
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
        const cache = window.__escalaWeekCache;

        if (!force && cache && cache.key === weekStart) {
            return cache.byDay;
        }

        const payload = await window.API.getEscalaRelatorio({ dataInicio: weekStart, dataFim: weekEnd });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const byDay = {};

        items.forEach((item) => {
            const dia = toISODateEscala(item.dataISO || item.data);

            if (!dia) {
                return;
            }

            (byDay[dia] = byDay[dia] || []).push(item);
        });

        window.__escalaWeekCache = { key: weekStart, byDay };
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

    function refreshWeekStripLiveEscala() {
        const iso = toISODateEscala(getCurrentScaleState().dataISO);

        if (!iso) {
            return;
        }

        const { start } = getWeekBoundsEscala(iso);
        const cache = window.__escalaWeekCache;
        const byDay = (cache && cache.key === start) ? cache.byDay : null;
        renderWeekStripPillsEscala(iso, byDay);
    }

    async function renderWeekStripEscala(dataISO, { force = false } = {}) {
        const container = document.getElementById('escalaWeekStrip');

        if (!container) {
            return;
        }

        const iso = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const { start, end } = getWeekBoundsEscala(iso);
        const cache = window.__escalaWeekCache;
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

    // Barra de contexto do dia: resume os fatos que impactam a escala (quantos
    // escalados, de ferias, ausentes) e destaca o pior momento de cobertura no
    // chip de status, usando os mesmos itens visiveis (respeita o filtro de setor).
    function renderDayContextEscala(state) {
        const fatosEl = document.getElementById('escalaDaybarFatos');
        const statusEl = document.getElementById('escalaDaybarStatus');

        if (!fatosEl || !statusEl) {
            return;
        }

        const scale = state || getCurrentScaleState();
        const visibleItems = filterScaleItemsBySectorEscala(scale.items || []);

        let escalados = 0;
        let folgas = 0;
        let ferias = 0;
        let ausencias = 0;

        visibleItems.forEach((record) => {
            const tipo = String(record.tipo || '').toLowerCase();
            const partial = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);

            if (tipo === 'ferias' && !partial) {
                ferias += 1;
            } else if (tipo === 'folga' && !partial) {
                folgas += 1;
            } else if (tipo === 'ausencia' && !partial) {
                ausencias += 1;
            } else {
                escalados += 1;
            }
        });

        const fatos = [
            `<span class="escala-fato escala-fato-escalados"><i class="fas fa-user-clock"></i> ${escalados} escalado${escalados === 1 ? '' : 's'}</span>`
        ];

        if (ferias > 0) {
            fatos.push(`<span class="escala-fato escala-fato-ferias"><i class="fas fa-umbrella-beach"></i> ${ferias} de ferias</span>`);
        }

        if (ausencias > 0) {
            fatos.push(`<span class="escala-fato escala-fato-ausencia"><i class="fas fa-user-slash"></i> ${ausencias} ausencia${ausencias === 1 ? '' : 's'}</span>`);
        }

        if (folgas > 0) {
            fatos.push(`<span class="escala-fato escala-fato-folga"><i class="fas fa-mug-hot"></i> ${folgas} de folga</span>`);
        }

        fatosEl.innerHTML = fatos.join('');

        const coverage = computeCoverageEscala(visibleItems);
        let nivel;
        let icon;
        let texto;

        if (!coverage.hasExpediente) {
            nivel = 'is-neutro';
            icon = 'fa-circle-info';
            texto = 'Sem expediente neste dia';
        } else {
            const pct = coverage.minPctLabel;
            const detalhe = `${coverage.minCount} de ${coverage.minPotential} (${pct}%) às ${coverage.minTime}`;

            if (coverage.minPct < 0.5) {
                nivel = 'is-critico';
                icon = 'fa-triangle-exclamation';
                texto = `Menor cobertura: ${detalhe}`;
            } else if (coverage.minPct < 0.7) {
                nivel = 'is-atencao';
                icon = 'fa-circle-exclamation';
                texto = `Menor cobertura: ${detalhe}`;
            } else {
                nivel = 'is-ok';
                icon = 'fa-circle-check';
                texto = `Cobertura tranquila (mín ${pct}%)`;
            }
        }

        statusEl.className = `escala-daybar-status ${nivel}`;
        statusEl.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtmlEscala(texto)}</span>`;
    }

    // Camada de barras no estilo do prototipo: desenha, por cima das celulas,
    // uma barra unica e arredondada com o horario, o almoco hachurado e (para
    // dias sem expediente) uma faixa com o motivo. Fica com pointer-events:none
    // para o arrasto do almoco continuar acontecendo nas celulas por baixo.
    function buildRowOverlayEscala(record, bounds) {
        const spanStart = bounds.startSlot * SLOT_MINUTES;
        const spanEnd = (bounds.startSlot + bounds.columnCount) * SLOT_MINUTES;
        const span = Math.max(1, spanEnd - spanStart);
        const pct = (minutes) => ((minutes - spanStart) / span) * 100;
        const type = String(record.tipo || '').toLowerCase();

        if (isFullDayOffEscala(record)) {
            const label = TIPO_LABELS[type] || 'Ausencia';
            const motivo = record.observacao ? escapeHtmlEscala(record.observacao) : '';
            const bandType = ['ferias', 'folga', 'ausencia'].includes(type) ? type : 'ausencia';
            return `<div class="escala-overlay">
                <div class="escala-band escala-band-${bandType}">
                    <span class="escala-band-label">${escapeHtmlEscala(label)}</span>
                    ${motivo ? `<span class="escala-band-motivo">${motivo}</span>` : ''}
                </div>
            </div>`;
        }

        const start = getTimeMinutesEscala(record.horaInicio);
        const end = getTimeMinutesEscala(record.horaFim);

        if (start === null || end === null || end <= start) {
            return '<div class="escala-overlay"></div>';
        }

        const left = Math.max(0, pct(start));
        const right = Math.min(100, pct(end));
        const barLabel = `${formatTimeInputEscala(record.horaInicio)}–${formatTimeInputEscala(record.horaFim)}`;
        const isPlantao = type === 'plantao';

        const lunchStart = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd = getTimeMinutesEscala(record.almocoFim);
        let lunch = '';

        if (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart) {
            lunch = `<div class="escala-lunch" data-colaborador-id="${record.colaboradorId}" style="left:${pct(lunchStart)}%;width:${pct(lunchEnd) - pct(lunchStart)}%" title="Arraste para ajustar o almoco">
                <span class="escala-lunch-time">${formatTimeInputEscala(record.almocoInicio)}–${formatTimeInputEscala(record.almocoFim)}</span>
            </div>`;
        }

        // Ausencia por periodo (ex.: 14:00-15:00). O total de horas ja descontava
        // e as celulas por baixo ja pintavam 'ausencia-parcial' — mas esta barra
        // e desenhada POR CIMA das celulas e tapava a marcacao, entao na pratica
        // a ausencia sumia da escala. Desenhamos aqui o mesmo bloco, no mesmo
        // esquema do almoco.
        const partialAbsence = getPartialAbsenceEscala(record.colaboradorId, record.dataISO);
        const absenceStartRaw = partialAbsence?.horaInicio || partialAbsence?.HoraInicio;
        const absenceEndRaw = partialAbsence?.horaFim || partialAbsence?.HoraFim;
        // Recorta na jornada: ausencia que comece antes da entrada ou termine
        // depois da saida nao pode pintar fora da barra.
        const absenceRange = getClampedIntervalEscala(
            getTimeMinutesEscala(absenceStartRaw),
            getTimeMinutesEscala(absenceEndRaw),
            start,
            end
        );

        let absence = '';

        if (absenceRange) {
            const absenceLabel = `${formatTimeInputEscala(absenceStartRaw)}–${formatTimeInputEscala(absenceEndRaw)}`;

            absence = `<div class="escala-ausencia-parcial" style="left:${pct(absenceRange.start)}%;width:${pct(absenceRange.end) - pct(absenceRange.start)}%" title="Ausencia parcial ${escapeHtmlEscala(absenceLabel)}">
                <span class="escala-ausencia-parcial-time">${escapeHtmlEscala(absenceLabel)}</span>
            </div>`;
        }

        return `<div class="escala-overlay">
            <div class="escala-bar${isPlantao ? ' escala-bar-plantao' : ''}" style="left:${left}%;width:${Math.max(0, right - left)}%">
                <span class="escala-bar-label">${escapeHtmlEscala(barLabel)}</span>
            </div>
            ${lunch}
            ${absence}
        </div>`;
    }

    // Arrasto fluido do almoco: o bloco hachurado vira um controle deslizante
    // (estilo barra de volume). Segue o ponteiro suavemente e mostra o horario
    // ao vivo; ao soltar, arredonda para o passo (15 min) e salva. Substitui o
    // antigo arrasto HTML5 celula-a-celula (que era "chunky").
    function bindFluidLunchDragEscala(row, record, bounds) {
        const lunch = row.querySelector('.escala-lunch');

        if (!lunch) {
            return;
        }

        const spanStart = bounds.startSlot * SLOT_MINUTES;
        const spanEnd = (bounds.startSlot + bounds.columnCount) * SLOT_MINUTES;
        const span = Math.max(1, spanEnd - spanStart);
        const pct = (minutes) => ((minutes - spanStart) / span) * 100;

        const workStart = getTimeMinutesEscala(record.horaInicio);
        const workEnd = getTimeMinutesEscala(record.horaFim);
        const lunchStart0 = getTimeMinutesEscala(record.almocoInicio);
        const lunchEnd0 = getTimeMinutesEscala(record.almocoFim);

        if (workStart === null || workEnd === null || lunchStart0 === null || lunchEnd0 === null) {
            return;
        }

        const dur = lunchEnd0 - lunchStart0;
        const minStart = workStart;
        const maxStart = workEnd - dur;

        // Sem espaco para deslizar (almoco ocupa a jornada toda): nao arrasta.
        if (maxStart <= minStart) {
            lunch.style.cursor = 'default';
            return;
        }

        const label = lunch.querySelector('.escala-lunch-time');
        const setTime = (startMin) => {
            lunch.style.left = pct(startMin) + '%';
            if (label) {
                label.textContent = `${formatMinutesToTimeEscala(startMin)}–${formatMinutesToTimeEscala(startMin + dur)}`;
            }
        };

        lunch.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const overlayWidth = lunch.parentElement.getBoundingClientRect().width;
            const minutesPerPx = span / Math.max(1, overlayWidth);
            const startX = event.clientX;
            let currentStart = lunchStart0;

            row.classList.add('is-dragging-lunch');
            lunch.classList.add('is-dragging');

            try {
                lunch.setPointerCapture(event.pointerId);
            } catch (error) {
                // setPointerCapture pode falhar em navegadores antigos; o drag
                // segue mesmo assim pelos listeners abaixo.
            }

            const onMove = (moveEvent) => {
                const deltaMinutes = (moveEvent.clientX - startX) * minutesPerPx;
                // Encaixa de 30 em 30 min enquanto arrasta (passos de meia hora):
                // o bloco "clica" em cada :00/:30, que e onde os almocos caem.
                const snappedLive = Math.round((lunchStart0 + deltaMinutes) / SLOT_MINUTES) * SLOT_MINUTES;
                currentStart = Math.min(maxStart, Math.max(minStart, snappedLive));
                setTime(currentStart);
            };

            const onUp = async () => {
                lunch.removeEventListener('pointermove', onMove);
                lunch.removeEventListener('pointerup', onUp);
                lunch.removeEventListener('pointercancel', onUp);
                lunch.classList.remove('is-dragging');
                row.classList.remove('is-dragging-lunch');

                try {
                    lunch.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // ignora: a captura ja pode ter sido liberada.
                }

                // Ja esta encaixado de 30 em 30 (o arrasto snapa ao vivo); aqui
                // so garante o passo de meia hora tambem no valor final salvo.
                let snapped = Math.round(currentStart / SLOT_MINUTES) * SLOT_MINUTES;
                snapped = Math.min(maxStart, Math.max(minStart, snapped));
                setTime(snapped);

                try {
                    await salvarAjusteDiretoAlmocoEscala(Number(record.colaboradorId), snapped, snapped + dur);
                } catch (error) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Erro ao ajustar almoco: ${error.message}`, 'error');
                    }
                    renderScaleRowsEscala(getCurrentScaleState());
                }
            };

            lunch.addEventListener('pointermove', onMove);
            lunch.addEventListener('pointerup', onUp);
            lunch.addEventListener('pointercancel', onUp);
        });
    }

    function renderScaleRowsEscala(state) {
        const body = document.getElementById('timelineBody');

        if (!body) {
            return;
        }

        const items = filterScaleItemsBySectorEscala(state.items || []).sort(compareScaleRecordsEscala);
        const selectedColaboradorId = Number(window.__escalaEditorColaboradorId || 0);
        const bounds = applyScaleHourBoundsCssEscala(items);

        // Regenera o cabecalho a partir dos MESMOS itens filtrados, sempre que
        // as linhas mudam (troca de setor, edicao, etc.). Isso mantem o numero
        // de colunas do cabecalho e das linhas identico e evita a quebra de
        // linha no cabecalho.
        renderScaleHeaderEscala(items);

        body.innerHTML = '';

        if (items.length === 0) {
            // Distingue "ninguem escalado neste dia" de "o filtro de setor
            // escondeu todo mundo". Sem essa diferenca o usuario via "nenhum
            // registro" num dia cheio e concluia que a escala tinha sumido.
            const totalSemFiltro = (state.items || []).length;
            const filtroAtivo = getScaleSectorSelectionEscala().size > 0;

            if (totalSemFiltro > 0 && filtroAtivo) {
                renderScaleMessageEscala({
                    label: 'FILTRADO',
                    icon: 'fa-filter',
                    title: 'Nenhum colaborador no setor filtrado',
                    description: `Ha ${totalSemFiltro} colaborador(es) escalado(s) neste dia, mas nenhum nos setores selecionados.`,
                    variante: 'mensagem-row--filtrado',
                    acaoHtml: `
                        <button type="button" class="btn-repetir-escala" data-limpar-setor-escala="1">
                            <i class="fas fa-filter-circle-xmark"></i> Limpar filtro de setor
                        </button>
                    `
                });
                renderDayContextEscala(state);
                refreshWeekStripLiveEscala();
                atualizarBotaoRestaurarAlmocosEscala();
                return;
            }

            renderScaleEmptyMessageEscala(state.dataISO);
            renderDayContextEscala(state);
            refreshWeekStripLiveEscala();
            atualizarBotaoRestaurarAlmocosEscala();
            return;
        }

        items.forEach((record) => {
            const totalMinutes = calculateWorkedMinutesEscala(record);
            const totalLabel = formatDurationEscala(totalMinutes);
            const row = document.createElement('div');
            const type = String(record.tipo || '').toLowerCase();
            const typeLabel = TIPO_LABELS[type] || 'Escala';
            const isSelected = Number(record.colaboradorId) === selectedColaboradorId;
            row.className = `timeline-row${type === 'plantao' ? ' plantao-row' : ''}${isSelected ? ' is-selected' : ''}`;

            row.innerHTML = `
                <div class="timeline-name" data-colaborador-id="${record.colaboradorId}"
                     role="button" tabindex="0"
                     aria-label="Editar escala de ${escapeHtmlEscala(record.colaboradorNome || 'colaborador')}${record.setorNome ? `, setor ${escapeHtmlEscala(record.setorNome)}` : ''}. ${escapeHtmlEscala(buildTimeRangeLabelEscala(record) || 'sem horario definido')}"
                     title="Editar escala de ${escapeHtmlEscala(record.colaboradorNome || 'colaborador')}">
                    <span class="timeline-name-main">
                        <strong class="timeline-name-text">${escapeHtmlEscala(record.colaboradorNome || 'Sem nome')}</strong>
                        <span class="timeline-name-meta">
                            ${record.setorNome ? `<small class="escala-sector-chip">${escapeHtmlEscala(record.setorNome)}</small>` : ''}
                            ${type === 'plantao' ? '<span class="plantao-badge">Plantao</span>' : ''}
                            ${type !== 'normal' && type !== 'plantao' ? `<small class="escala-dia-tipo">${escapeHtmlEscala(typeLabel)}</small>` : ''}
                        </span>
                    </span>
                    <span class="timeline-name-action" aria-hidden="true">
                        <i class="fas fa-pen edit-indicator"></i>
                    </span>
                </div>
                <div class="timeline-cell total-cell">
                    <span class="total-valor">${escapeHtmlEscala(totalLabel)}</span>
                </div>
                ${Array.from({ length: bounds.columnCount }, (_, index) => {
                    const slot = bounds.startSlot + index;
                    const cellState = getCellStateEscala(record, slot);
                    // Marca o inicio de cada hora cheia (slots sao de 30 min), mesma
                    // regra do cabecalho. O CSS usa isso para desenhar a linha da
                    // grade mais forte na hora e mais fraca na meia hora — sem essa
                    // hierarquia as 23 colunas viram um paredao de linhas iguais.
                    const isHourMark = slot % 2 === 0;
                    return `<div class="timeline-cell ${cellState.className}${isHourMark ? ' slot-hora-cheia' : ''}" data-slot="${slot}" data-colaborador-id="${record.colaboradorId}"></div>`;
                }).join('')}
                ${buildRowOverlayEscala(record, bounds)}
            `;

            const nomeEl = row.querySelector('.timeline-name');

            nomeEl?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                abrirEditorNaEscala(record.colaboradorId);
            });

            // A celula do nome e um div com role="button": ao contrario de um
            // <button> de verdade, ela nao aciona sozinha por teclado. Sem
            // isto, quem navega por Tab consegue focar a linha mas nunca abrir
            // o editor — a tela ficava inteiramente dependente do mouse.
            nomeEl?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
                    return;
                }

                event.preventDefault();
                abrirEditorNaEscala(record.colaboradorId);
            });

            body.appendChild(row);
            bindFluidLunchDragEscala(row, record, bounds);
        });

        // Depois das linhas existirem no DOM: a medicao usa a fonte real ja
        // aplicada, entao precisa de pelo menos uma celula de nome renderizada.
        ajustarLarguraColunaNomeEscala(items);
        // A largura da coluna de nomes acabou de mudar, entao a das horas
        // tambem: recalcula a fonte dos rotulos com o espaco ja definitivo.
        ajustarFonteHorasEscala();
        observarLarguraTimelineEscala();

        renderTotalRowEscala(items);
        renderDayContextEscala(state);
        refreshWeekStripLiveEscala();
        atualizarBotaoRestaurarAlmocosEscala();
    }

    function getScaleEditorRecordEscala(colaboradorId) {
        return (getCurrentScaleState().items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getScaleEditorTimeValueEscala(inputId, fallbackValue = null) {
        const input = document.getElementById(inputId);
        const currentValue = input?.value || fallbackValue;
        return getTimeMinutesEscala(currentValue);
    }

    function getScaleEditorWorkBoundsEscala(colaboradorId) {
        const record = getScaleEditorRecordEscala(colaboradorId);
        const workStart = getScaleEditorTimeValueEscala(`escalaHoraInicio-${colaboradorId}`, record?.horaInicio);
        const workEnd = getScaleEditorTimeValueEscala(`escalaHoraFim-${colaboradorId}`, record?.horaFim);

        if (workStart === null || workEnd === null || workEnd <= workStart) {
            return {
                min: ESCALA_EDITOR_MINUTO_INICIAL,
                max: ESCALA_EDITOR_MINUTO_FINAL,
                isValid: false
            };
        }

        return {
            min: workStart,
            max: workEnd,
            isValid: true
        };
    }

    function buildDefaultLunchRangeEscala(colaboradorId) {
        const workBounds = getScaleEditorWorkBoundsEscala(colaboradorId);
        const min = workBounds.isValid ? workBounds.min : 12 * 60;
        const max = workBounds.isValid ? workBounds.max : 18 * 60;
        const span = Math.max(max - min, ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS);
        const duration = Math.min(ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS, span);
        const center = min + Math.floor(span / 2);
        let start = roundMinutesEscala(center - Math.floor(duration / 2));
        start = clampMinutesEscala(start, min, Math.max(min, max - duration));
        const end = clampMinutesEscala(start + duration, start + ESCALA_EDITOR_PASSO_MINUTOS, max);

        return {
            start,
            end
        };
    }

    function setScaleRangeInputsEscala(startInputId, endInputId, startMinutes, endMinutes) {
        const startInput = document.getElementById(startInputId);
        const endInput = document.getElementById(endInputId);

        if (startInput) {
            startInput.value = formatMinutesToTimeEscala(startMinutes);
        }

        if (endInput) {
            endInput.value = formatMinutesToTimeEscala(endMinutes);
        }
    }

    function buildScaleDragTrackConfigEscala(colaboradorId, kind) {
        const record = getScaleEditorRecordEscala(colaboradorId);
        const isLunch = kind === 'lunch';
        const startInputId = isLunch
            ? `escalaAlmocoInicio-${colaboradorId}`
            : `escalaHoraInicio-${colaboradorId}`;
        const endInputId = isLunch
            ? `escalaAlmocoFim-${colaboradorId}`
            : `escalaHoraFim-${colaboradorId}`;
        let currentStart = getScaleEditorTimeValueEscala(startInputId, isLunch ? record?.almocoInicio : record?.horaInicio);
        let currentEnd = getScaleEditorTimeValueEscala(endInputId, isLunch ? record?.almocoFim : record?.horaFim);
        const workBounds = getScaleEditorWorkBoundsEscala(colaboradorId);
        const bounds = isLunch
            ? {
                min: workBounds.isValid ? workBounds.min : ESCALA_EDITOR_MINUTO_INICIAL,
                max: workBounds.isValid ? workBounds.max : ESCALA_EDITOR_MINUTO_FINAL,
                isValid: workBounds.isValid
            }
                : {
                    min: ESCALA_EDITOR_MINUTO_INICIAL,
                    max: ESCALA_EDITOR_MINUTO_FINAL,
                    isValid: true
                };

        if (Number.isFinite(currentStart) && Number.isFinite(currentEnd) && bounds.max > bounds.min) {
            currentStart = clampMinutesEscala(currentStart, bounds.min, bounds.max - ESCALA_EDITOR_PASSO_MINUTOS);
            currentEnd = clampMinutesEscala(currentEnd, currentStart + ESCALA_EDITOR_PASSO_MINUTOS, bounds.max);

            if (currentEnd <= currentStart) {
                currentEnd = clampMinutesEscala(currentStart + ESCALA_EDITOR_PASSO_MINUTOS, currentStart + ESCALA_EDITOR_PASSO_MINUTOS, bounds.max);
            }

            setScaleRangeInputsEscala(startInputId, endInputId, currentStart, currentEnd);
        }

        return {
            kind,
            colaboradorId,
            startInputId,
            endInputId,
            startMinutes: currentStart,
            endMinutes: currentEnd,
            minMinutes: bounds.min,
            maxMinutes: bounds.max,
            isValidBounds: bounds.isValid,
            accentClass: isLunch ? 'is-lunch' : 'is-work',
            label: isLunch ? 'Almoco' : 'Jornada',
            emptyMessage: isLunch
                ? 'Sem almoco definido. Crie a faixa abaixo e depois arraste.'
                : 'Informe inicio e fim da jornada para liberar o arraste.'
        };
    }

    function renderScaleDragTrackEscala(shell, config) {
        if (!shell) {
            return;
        }

        const hasRange = Number.isFinite(config.startMinutes)
            && Number.isFinite(config.endMinutes)
            && config.endMinutes > config.startMinutes
            && config.maxMinutes > config.minMinutes;

        shell.dataset.kind = config.kind;
        shell.dataset.startInputId = config.startInputId;
        shell.dataset.endInputId = config.endInputId;
        shell.dataset.colaboradorId = String(config.colaboradorId);

        if (!hasRange) {
            shell.innerHTML = `
                <div class="escala-range-placeholder">
                    <i class="fas fa-up-down-left-right"></i>
                    <span>${escapeHtmlEscala(config.emptyMessage)}</span>
                </div>
            `;
            return;
        }

        const span = config.maxMinutes - config.minMinutes;
        const left = ((config.startMinutes - config.minMinutes) / span) * 100;
        const width = ((config.endMinutes - config.startMinutes) / span) * 100;
        const middleLabel = formatTimeRangeEscala(
            formatMinutesToTimeEscala(config.startMinutes),
            formatMinutesToTimeEscala(config.endMinutes)
        );

        shell.innerHTML = `
            <div class="escala-range-head">
                <span>${escapeHtmlEscala(config.label)}</span>
                <strong>${escapeHtmlEscala(middleLabel)}</strong>
            </div>
            <div class="escala-range-axis">
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.minMinutes))}</span>
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.minMinutes + Math.round(span / 2)))}</span>
                <span>${escapeHtmlEscala(formatMinutesToTimeEscala(config.maxMinutes))}</span>
            </div>
            <div class="escala-range-track ${config.accentClass}" data-track-role="track">
                <div class="escala-range-selection ${config.accentClass}" data-track-role="selection" style="left: ${left}%; width: ${width}%;">
                    <button type="button" class="escala-range-handle start" data-track-role="start" aria-label="Arrastar inicio"></button>
                    <button type="button" class="escala-range-handle end" data-track-role="end" aria-label="Arrastar fim"></button>
                </div>
            </div>
            <div class="escala-range-helper">
                Arraste as extremidades para ajustar o horario ou a faixa inteira para mover o bloco.
            </div>
        `;

        bindScaleDragTrackEscala(shell, config);
    }

    function bindScaleDragTrackEscala(shell, config) {
        const track = shell.querySelector('[data-track-role="track"]');
        const selection = shell.querySelector('[data-track-role="selection"]');
        const startHandle = shell.querySelector('[data-track-role="start"]');
        const endHandle = shell.querySelector('[data-track-role="end"]');
        const startInput = document.getElementById(config.startInputId);
        const endInput = document.getElementById(config.endInputId);

        if (!track || !selection || !startHandle || !endHandle || !startInput || !endInput) {
            return;
        }

        const minimumDuration = ESCALA_EDITOR_PASSO_MINUTOS;

        const getPointerMinutes = (clientX) => {
            const rect = track.getBoundingClientRect();
            if (rect.width <= 0) {
                return config.startMinutes;
            }

            const ratio = clampMinutesEscala((clientX - rect.left) / rect.width, 0, 1);
            const absolute = config.minMinutes + ((config.maxMinutes - config.minMinutes) * ratio);
            return roundMinutesEscala(absolute);
        };

        const updateRange = (startMinutes, endMinutes) => {
            setScaleRangeInputsEscala(config.startInputId, config.endInputId, startMinutes, endMinutes);

            const span = config.maxMinutes - config.minMinutes;
            const left = ((startMinutes - config.minMinutes) / span) * 100;
            const width = ((endMinutes - startMinutes) / span) * 100;

            selection.style.left = `${left}%`;
            selection.style.width = `${width}%`;

            const label = shell.querySelector('.escala-range-head strong');
            if (label) {
                label.textContent = formatTimeRangeEscala(
                    formatMinutesToTimeEscala(startMinutes),
                    formatMinutesToTimeEscala(endMinutes)
                );
            }
        };

        const beginDrag = (mode, event) => {
            event.preventDefault();

            const initialStart = getTimeMinutesEscala(startInput.value);
            const initialEnd = getTimeMinutesEscala(endInput.value);

            if (initialStart === null || initialEnd === null) {
                return;
            }

            const duration = initialEnd - initialStart;
            const pointerState = {
                mode,
                startPointerMinutes: getPointerMinutes(event.clientX),
                initialStart,
                initialEnd,
                duration
            };

            const move = (moveEvent) => {
                let nextStart = pointerState.initialStart;
                let nextEnd = pointerState.initialEnd;

                if (pointerState.mode === 'move') {
                    const currentPointerMinutes = getPointerMinutes(moveEvent.clientX);
                    const delta = currentPointerMinutes - pointerState.startPointerMinutes;
                    nextStart = clampMinutesEscala(pointerState.initialStart + delta, config.minMinutes, config.maxMinutes - duration);
                    nextStart = roundMinutesEscala(nextStart);
                    nextEnd = nextStart + duration;
                } else if (pointerState.mode === 'start') {
                    nextStart = clampMinutesEscala(getPointerMinutes(moveEvent.clientX), config.minMinutes, pointerState.initialEnd - minimumDuration);
                    nextStart = roundMinutesEscala(nextStart);
                } else {
                    nextEnd = clampMinutesEscala(getPointerMinutes(moveEvent.clientX), pointerState.initialStart + minimumDuration, config.maxMinutes);
                    nextEnd = roundMinutesEscala(nextEnd);
                }

                if (nextEnd <= nextStart) {
                    nextEnd = nextStart + minimumDuration;
                }

                updateRange(nextStart, nextEnd);
            };

            const stop = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                syncScaleDragEditorEscala(config.colaboradorId);
            };

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop, { once: true });
        };

        selection.addEventListener('pointerdown', (event) => {
            if (event.target === startHandle || event.target === endHandle) {
                return;
            }

            beginDrag('move', event);
        });

        startHandle.addEventListener('pointerdown', (event) => beginDrag('start', event));
        endHandle.addEventListener('pointerdown', (event) => beginDrag('end', event));
    }

    function syncScaleDragEditorEscala(colaboradorId) {
        const workShell = document.getElementById(`escalaRangeWork-${colaboradorId}`);
        const lunchShell = document.getElementById(`escalaRangeLunch-${colaboradorId}`);

        renderScaleDragTrackEscala(workShell, buildScaleDragTrackConfigEscala(colaboradorId, 'work'));
        renderScaleDragTrackEscala(lunchShell, buildScaleDragTrackConfigEscala(colaboradorId, 'lunch'));
    }

    function bindScaleEditorInputsEscala(colaboradorId) {
        [
            `escalaHoraInicio-${colaboradorId}`,
            `escalaHoraFim-${colaboradorId}`,
            `escalaAlmocoInicio-${colaboradorId}`,
            `escalaAlmocoFim-${colaboradorId}`
        ].forEach((inputId) => {
            const input = document.getElementById(inputId);

            if (!input || input.dataset.scaleDragBound === 'true') {
                return;
            }

            input.dataset.scaleDragBound = 'true';
            input.addEventListener('input', () => {
                syncScaleDragEditorEscala(colaboradorId);
            });
        });
    }

    function renderScaleEditorEscala(record) {
        const sidebar = document.getElementById('sidebarEditor');
        const content = document.getElementById('editorContent');
        const toggleIcon = document.getElementById('toggleIcon');

        if (!sidebar || !content) {
            return;
        }

        const lunchRange = formatTimeRangeEscala(record.almocoInicio, record.almocoFim);

        // Almoco personalizado = veio de AlmocosPersonalizados (aplicacao por
        // periodo ou ajuste manual), nao do cadastro do colaborador. Sem um
        // aviso aqui o usuario nao tem como lembrar que aquele dia esta fora
        // do padrao — o que so aparecia discretamente na barra da grade.
        const almocoPersonalizado = Boolean(record.almocoPersonalizado || record.almocoAjustado);
        const avisoAlmocoPersonalizado = almocoPersonalizado
            ? `
                <div class="editor-aviso-almoco">
                    <i class="fas fa-circle-exclamation"></i>
                    <div>
                        <strong>Almoco personalizado neste dia</strong>
                        <span>Este horario nao segue o cadastro do colaborador — foi aplicado por periodo ou ajustado a mao. Use "Resetar almocos" para voltar ao cadastro.</span>
                    </div>
                </div>
            `
            : '';

        sidebar.classList.remove('collapsed');
        if (toggleIcon) {
            toggleIcon.className = 'fas fa-chevron-right';
        }

        content.innerHTML = `
            <div class="editor-colaborador">
                <div class="editor-header">
                    <div>
                        <h4>${escapeHtmlEscala(record.colaboradorNome || 'Colaborador')}</h4>
                        <small>${escapeHtmlEscala(formatDatePtBrEscala(record.dataISO))} • ${escapeHtmlEscala(getDayLabelEscala(record.dataISO))} • ${escapeHtmlEscala(TIPO_LABELS[record.tipo] || 'Escala')}</small>
                    </div>
                    <button onclick="fecharEditor()" class="btn-close-editor">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Jornada do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaHoraInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaHoraFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.horaFim))}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoco do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaAlmocoInicio-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaAlmocoFim-${record.colaboradorId}" value="${escapeHtmlEscala(formatTimeInputEscala(record.almocoFim))}" class="form-control">
                    </div>
                    <small class="helper-text">Atual: ${escapeHtmlEscala(lunchRange)}</small>
                    ${avisoAlmocoPersonalizado}
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="escalaObservacao-${record.colaboradorId}" class="form-control" rows="3" placeholder="Detalhes deste dia">${escapeHtmlEscala(record.observacao || '')}</textarea>
                </div>

                <div class="editor-actions editor-actions-main">
                    <button onclick="salvarEscalaDia(${record.colaboradorId})" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar dia
                    </button>
                    <button onclick="fecharEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                <div class="editor-period-panel">
                    <div class="editor-period-header">
                        <label><i class="fas fa-calendar-alt"></i> Almoco por periodo</label>
                        <small>Aplique o mesmo intervalo de almoco em varios dias de uma vez.</small>
                    </div>

                    <div class="time-inputs time-inputs-period">
                        <input type="time" id="escalaPeriodoAlmocoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaPeriodoAlmocoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>

                    <div class="time-inputs time-inputs-period">
                        <input type="date" id="escalaPeriodoInicio-${record.colaboradorId}" value="" class="form-control">
                        <span>ate</span>
                        <input type="date" id="escalaPeriodoFim-${record.colaboradorId}" value="" class="form-control">
                    </div>

                    <small class="helper-text">Preencha apenas quando quiser aplicar um almoco em lote. Em branco, esse bloco nao interfere na escala.</small>

                    <div class="editor-actions editor-actions-single">
                        <button onclick="aplicarAlmocoPeriodoEscala(${record.colaboradorId})" class="btn-secondary">
                            <i class="fas fa-utensils"></i> Aplicar almoco no periodo
                        </button>
                    </div>
                </div>
            </div>
        `;

    }

    // Sequencia da requisicao do dia. Cada carregamento recebe um numero e so
    // o mais recente pode pintar a tela: clicar rapido em "proximo dia" dispara
    // varias buscas, e sem isto a que voltasse por ultimo venceria — mesmo
    // sendo de um dia que o usuario ja abandonou (race condition classica).
    let escalaLoadSeq = 0;

    async function carregarEscalaDiaEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const meuLoad = ++escalaLoadSeq;

        window.dataEscalaSelecionada = normalized;
        const selector = document.getElementById('seletorDataEscala');
        if (selector) {
            selector.value = normalized;
        }

        // Cabecalho e faixa da semana ja refletem a data pedida; so a area de
        // linhas espera os dados.
        renderScaleHeaderEscala();
        renderScaleLoadingEscala(normalized);

        let payload;

        try {
            payload = await window.API.getEscalaDia(normalized);
        } catch (error) {
            if (meuLoad !== escalaLoadSeq) {
                return null;
            }

            // Sem isto a tela ficava com os dados do dia anterior e nenhum
            // aviso, dando a impressao de que a data nao tinha registros.
            renderScaleErrorEscala(normalized, error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(error?.message || 'Falha ao carregar a escala do dia.', 'error');
            }

            return null;
        }

        if (meuLoad !== escalaLoadSeq) {
            return null;
        }

        const state = setCurrentScaleState({
            dataISO: normalized,
            items: Array.isArray(payload?.items) ? payload.items : []
        });

        renderScaleSectorTabsEscala(state.items || []);
        renderScaleRowsEscala(state);
        renderWeekStripEscala(normalized);

        return state;
    }

    function ensureScaleSidebarToggleEscala() {
        const sidebar = document.getElementById('sidebarEditor');
        const toggle = document.getElementById('toggleEditor');
        const icon = document.getElementById('toggleIcon');

        if (!sidebar || !toggle || toggle.dataset.bound === 'true') {
            return;
        }

        toggle.dataset.bound = 'true';
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (icon) {
                icon.className = sidebar.classList.contains('collapsed')
                    ? 'fas fa-chevron-left'
                    : 'fas fa-chevron-right';
            }
        });
    }

    window.fecharEditor = fecharEditor = function fecharEditorEscala() {
        const content = document.getElementById('editorContent');

        window.__escalaEditorColaboradorId = null;
        renderScaleRowsEscala(getCurrentScaleState());

        if (!content) {
            return;
        }

        content.innerHTML = `
            <div class="editor-empty">
                <i class="fas fa-arrow-left"></i>
                <p>Clique no nome de um colaborador para editar o dia ou aplicar almoco por periodo.</p>
            </div>
        `;
    };

    window.abrirEditorNaEscala = abrirEditorNaEscala = function abrirEditorNaEscalaAtualizada(colaboradorId) {
        const state = getCurrentScaleState();
        const record = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId));

        if (!record) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Registro diario nao encontrado para este colaborador.', 'warning');
            }
            return;
        }

        window.__escalaEditorColaboradorId = Number(colaboradorId);
        renderScaleRowsEscala(state);
        renderScaleEditorEscala(record);
    };

    function bindScaleOutsideSelectionEscala() {
        const escalaPage = document.querySelector('.escala-page');

        if (!escalaPage || escalaPage.dataset.selectionBound === 'true') {
            return;
        }

        escalaPage.dataset.selectionBound = 'true';
        escalaPage.addEventListener('click', (event) => {
            if (!window.__escalaEditorColaboradorId) {
                return;
            }

            const clickedInsideTimeline = event.target.closest('.timeline-container');
            const clickedInsideSidebar = event.target.closest('#sidebarEditor');

            if (clickedInsideTimeline || clickedInsideSidebar) {
                return;
            }

            if (typeof window.fecharEditor === 'function') {
                window.fecharEditor();
            }
        });
    }

    window.salvarEscalaDia = salvarEscalaDia = async function salvarEscalaDiaAtualizada(colaboradorId) {
        const state = getCurrentScaleState();
        const currentRecord = (state.items || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || {};
        const payload = {
            horaInicio: document.getElementById(`escalaHoraInicio-${colaboradorId}`)?.value || currentRecord.horaInicio || null,
            horaFim: document.getElementById(`escalaHoraFim-${colaboradorId}`)?.value || currentRecord.horaFim || null,
            almocoInicio: document.getElementById(`escalaAlmocoInicio-${colaboradorId}`)?.value || currentRecord.almocoInicio || null,
            almocoFim: document.getElementById(`escalaAlmocoFim-${colaboradorId}`)?.value || currentRecord.almocoFim || null,
            observacao: document.getElementById(`escalaObservacao-${colaboradorId}`)?.value ?? currentRecord.observacao ?? null
        };

        try {
            await window.API.salvarEscalaDia(state.dataISO, colaboradorId, payload);
            await atualizarTudo({ silent: true, source: 'escala' });
            abrirEditorNaEscala(colaboradorId);

            if (typeof mostrarToast === 'function') {
                mostrarToast('Escala do dia atualizada com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao salvar escala: ${error.message}`, 'error');
            }
        }
    };

    window.aplicarAlmocoPeriodoEscala = aplicarAlmocoPeriodoEscala = async function aplicarAlmocoPeriodoEscalaAtualizado(colaboradorId) {
        const state = getCurrentScaleState();
        const payload = {
            colaboradorId,
            dataInicio: document.getElementById(`escalaPeriodoInicio-${colaboradorId}`)?.value,
            dataFim: document.getElementById(`escalaPeriodoFim-${colaboradorId}`)?.value,
            almocoInicio: document.getElementById(`escalaPeriodoAlmocoInicio-${colaboradorId}`)?.value,
            almocoFim: document.getElementById(`escalaPeriodoAlmocoFim-${colaboradorId}`)?.value
        };

        if (!payload.dataInicio || !payload.dataFim || !payload.almocoInicio || !payload.almocoFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Preencha inicio, fim e periodo antes de aplicar o almoco em lote.', 'warning');
            }
            return;
        }

        try {
            await window.API.aplicarAlmocoPeriodo(payload);
            await atualizarTudo({ silent: true, source: 'escala' });
            abrirEditorNaEscala(colaboradorId);
            // Aplicacao em lote muda varios dias: refaz a previa da semana.
            window.__escalaWeekCache = null;
            renderWeekStripEscala(state.dataISO, { force: true });

            if (typeof mostrarToast === 'function') {
                mostrarToast('Almoco aplicado no periodo com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao aplicar almoco: ${error.message}`, 'error');
            }
        }
    };

    window.restaurarAlmocoPadraoEscala = restaurarAlmocoPadraoEscala = async function restaurarAlmocoPadraoEscalaAtualizado(colaboradorId) {
        const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

        if (!colaborador) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Colaborador nao encontrado para restaurar o almoco.', 'warning');
            }
            return;
        }

        const inicioInput = document.getElementById(`escalaAlmocoInicio-${colaboradorId}`);
        const fimInput = document.getElementById(`escalaAlmocoFim-${colaboradorId}`);

        if (inicioInput) {
            inicioInput.value = formatarHora(colaborador.AlmocoInicio) || '';
        }

        if (fimInput) {
            fimInput.value = formatarHora(colaborador.AlmocoFim) || '';
        }

        syncScaleDragEditorEscala(colaboradorId);
        await salvarEscalaDia(colaboradorId);
    };

    function obterDataSelecionadaEscala() {
        return document.getElementById('seletorDataEscala')?.value || getCurrentScaleState()?.dataISO || toISODateEscala(new Date());
    }

    function shiftIsoDateEscala(dataISO, deltaDays) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const [year, month, day] = normalized.split('-').map(Number);
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + Number(deltaDays || 0));
        return toISODateEscala(nextDate);
    }

    async function carregarEscalaSelecionadaEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        window.dataEscalaSelecionada = normalized;
        await carregarEscalaDiaEscala(normalized);
        atualizarAcoesCabecalhoEscala();
    }

    function atualizarAcoesCabecalhoEscala() {
        const botaoPlantao = document.getElementById('btnAbrirPlantaoEscala');
        const dataISO = obterDataSelecionadaEscala();
        const isSaturday = getIsoDayOfWeekEscala(dataISO) === 6;

        if (!botaoPlantao) {
            return;
        }

        botaoPlantao.disabled = !isSaturday;
        botaoPlantao.title = isSaturday
            ? 'Abrir o plantao do sabado selecionado'
            : 'Selecione um sabado para abrir o plantao';
        botaoPlantao.classList.toggle('is-disabled', !isSaturday);
    }

    function atualizarBotaoRestaurarAlmocosEscala() {
        const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');

        if (!button) {
            return;
        }

        const hasVisibleItems = filterScaleItemsBySectorEscala(getCurrentScaleState().items || []).length > 0;
        button.disabled = !hasVisibleItems;
        button.classList.toggle('is-disabled', !hasVisibleItems);
        button.title = hasVisibleItems
            ? 'Restaurar os almocos da data para o horario cadastrado nos colaboradores'
            : 'Nao ha colaboradores visiveis para restaurar nesta data';
    }

    function getSelectedScaleSectorContextEscala() {
        const selecao = getScaleSectorSelectionEscala();

        // Restaurar almocos age por 1 setor ou "todos". Com varios selecionados,
        // cai em "todos" (a API aceita 1 setorId ou nenhum).
        if (selecao.size !== 1) {
            return {
                setorId: null,
                setorNome: selecao.size === 0 ? 'todos os setores' : 'setores selecionados'
            };
        }

        const filterId = [...selecao][0];
        const selected = buildScaleSectorFiltersEscala(getCurrentScaleState().items || [])
            .find((item) => String(item.id) === String(filterId));

        return {
            setorId: Number(filterId),
            setorNome: selected?.nome || `setor ${filterId}`
        };
    }

    async function restaurarAlmocosCadastroDiaEscala() {
        const state = getCurrentScaleState();
        const dataISO = obterDataSelecionadaEscala();
        const visibleItems = filterScaleItemsBySectorEscala(state.items || []);

        if (visibleItems.length === 0) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Nao ha colaboradores visiveis para restaurar nesta data.', 'warning');
            }
            return;
        }

        const setor = getSelectedScaleSectorContextEscala();
        const scopeLabel = setor.setorId ? `do setor ${setor.setorNome}` : 'de todos os setores';
        const confirmed = window.confirm(
            `Restaurar os almocos ${scopeLabel} em ${formatDatePtBrEscala(dataISO)} para o horario do cadastro?`
        );

        if (!confirmed) {
            return;
        }

        const button = document.getElementById('btnRestaurarAlmocosCadastroEscala');
        const selectedEditorId = window.__escalaEditorColaboradorId;

        if (button) {
            button.disabled = true;
            button.classList.add('is-loading');
        }

        try {
            const payload = await window.API.restaurarAlmocosCadastroEscala(dataISO, {
                setorId: setor.setorId || undefined
            });
            const result = payload?.data || {};

            window.__escalaLunchDrafts = {};
            await carregarEscalaSelecionadaEscala(dataISO);

            if (selectedEditorId && getScaleEditorRecordEscala(selectedEditorId)) {
                abrirEditorNaEscala(selectedEditorId);
            }

            const details = [
                `${result.updated || 0} almoco(s) restaurado(s)`,
                result.invalidos ? `${result.invalidos} fora da jornada` : '',
                result.semCadastro ? `${result.semCadastro} sem almoco no cadastro` : ''
            ].filter(Boolean).join(', ');

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Restauracao concluida: ${details}.`, result.updated ? 'success' : 'warning');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao restaurar almocos: ${error.message}`, 'error');
            }
        } finally {
            if (button) {
                button.classList.remove('is-loading');
                atualizarBotaoRestaurarAlmocosEscala();
            }
        }
    }

    function abrirLancamentoPessoalEscala() {
        const dataISO = obterDataSelecionadaEscala();

        if (typeof window.abrirModalLancamento === 'function') {
            window.abrirModalLancamento('pessoal', dataISO, true);
        }
    }

    function abrirPlantaoDaEscala() {
        const dataISO = obterDataSelecionadaEscala();

        if (getIsoDayOfWeekEscala(dataISO) !== 6) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Selecione um sabado para abrir o plantao.', 'warning');
            }
            return;
        }

        window.__plantaoSabadoAncoraISO = dataISO;
        window.__plantaoDataFocoISO = dataISO;

        if (typeof carregarPagina === 'function') {
            carregarPagina('lancamentoPlantao');
        }
    }

    window.renderEscalaDia = renderEscalaDia = async function renderEscalaDiaAtualizada() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        const todayISO = toISODateEscala(window.dataEscalaSelecionada || new Date());

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
        ]);

        appContent.innerHTML = `
            <div class="escala-page">
                <div class="escala-sticky-panel">
                <div class="escala-toolbar">
                    <h1 class="escala-titulo">Escala do Dia</h1>

                    <div class="toolbar-actions data-selector">
                        <button id="btnDiaAnteriorEscala" class="btn-secondary btn-day-nav" type="button" title="Dia anterior" aria-label="Dia anterior">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <label class="escala-date-shell" for="seletorDataEscala">
                            <i class="fas fa-calendar-alt"></i>
                            <input type="date" id="seletorDataEscala" value="${escapeHtmlEscala(todayISO)}" class="form-control date-input">
                            <span class="escala-date-chevron">
                                <i class="fas fa-chevron-down"></i>
                            </span>
                        </label>
                        <button id="btnDiaProximoEscala" class="btn-secondary btn-day-nav" type="button" title="Próximo dia" aria-label="Próximo dia">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <!-- Acoes secundarias como icone: o rotulo delas
                             empurrava a faixa para uma segunda linha em telas
                             de ~1000px, que e o tamanho comum aqui. Vem antes
                             da acao principal para que ela feche a faixa. -->
                        <button id="btnAbrirPlantaoEscala" class="btn-secondary escala-acao-icone escala-acao-inicio" title="Abrir plantao" aria-label="Abrir plantao">
                            <i class="fas fa-calendar-check"></i>
                        </button>
                        <button id="btnRestaurarAlmocosCadastroEscala" class="btn-secondary btn-reset-lunch escala-acao-icone" type="button" title="Resetar almocos para o cadastro" aria-label="Resetar almocos para o cadastro">
                            <i class="fas fa-rotate-left"></i>
                        </button>
                        <button id="btnNovoLancamentoEscala" class="btn-secondary escala-acao-icone" type="button" title="Novo lancamento (ausencia/folga)" aria-label="Novo lancamento (ausencia/folga)">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                        <button id="btnCriarColaboradorEscala" class="btn-primary escala-acao-principal" type="button">
                            <i class="fas fa-user-plus"></i> Criar colaborador
                        </button>
                    </div>
                </div>

                <div class="escala-week-strip" id="escalaWeekStrip" aria-label="Previa da semana"></div>

                <div class="escala-daybar" id="escalaDaybar">
                    <div class="escala-daybar-fatos" id="escalaDaybarFatos"></div>
                    <div class="escala-daybar-status" id="escalaDaybarStatus"></div>
                </div>

                <div class="escala-view-controls">
                    <div class="escala-sector-tabs" id="escalaSectorTabs"></div>
                    <label class="escala-select-chip" for="escalaSortMode" title="Organizar a lista de colaboradores">
                        <i class="fas fa-arrow-down-short-wide" aria-hidden="true"></i>
                        <span class="sr-only">Organizar</span>
                        <select id="escalaSortMode" class="form-control">
                            <option value="alpha">Por nome</option>
                            <option value="work_start">Por inicio da jornada</option>
                            <option value="lunch_start">Por inicio do almoco</option>
                            <option value="lunch_end">Por fim do almoco</option>
                        </select>
                    </label>

                    <div class="escala-densidade" role="group" aria-label="Densidade das linhas">
                        <button type="button" class="escala-densidade-btn" data-densidade="compacta" title="Linhas compactas: mostra mais colaboradores de uma vez">
                            <i class="fas fa-bars"></i>
                        </button>
                        <button type="button" class="escala-densidade-btn is-ativo" data-densidade="confortavel" title="Linhas confortaveis">
                            <i class="fas fa-grip-lines"></i>
                        </button>
                    </div>

                    <!-- A legenda ficava aberta o tempo todo ocupando uma faixa
                         inteira acima da grade. Como e uma consulta pontual,
                         virou um botao que abre sob demanda. -->
                    <details class="escala-legenda-toggle">
                        <summary title="Ver o significado das cores">
                            <i class="fas fa-palette"></i>
                            <span>Legenda</span>
                        </summary>
                        <div class="legenda-timeline legenda">
                            <span class="legenda-item"><span class="cor trabalhando"></span> Trabalhando</span>
                            <span class="legenda-item"><span class="cor almoco"></span> Almoco</span>
                            <span class="legenda-item"><span class="cor folga"></span> Folga</span>
                            <span class="legenda-item"><span class="cor ferias"></span> Ferias</span>
                            <span class="legenda-item"><span class="cor ausencia"></span> Ausencia</span>
                            <span class="legenda-item"><span class="cor ausencia-parcial"></span> Ausencia parcial</span>
                            <span class="legenda-item"><span class="cor fora"></span> Fora</span>
                        </div>
                    </details>

                </div>
                </div>

                <div class="escala-layout">
                    <div class="escala-card escala-main-card">
                        <div class="escala-scroll">
                            <div class="timeline-container">
                                <div class="timeline-header" id="timelineHeader"></div>
                                <div id="timelineBody" class="timeline-body"></div>
                            </div>
                        </div>
                    </div>

                    <div id="sidebarEditor" class="editor-sidebar collapsed">
                        <div class="editor-toggle" id="toggleEditor">
                            <i class="fas fa-chevron-left" id="toggleIcon"></i>
                        </div>
                        <div class="editor-content">
                            <h3><i class="fas fa-clock"></i> Ajustes da escala</h3>
                            <div id="editorContent" class="editor-form">
                                <div class="editor-empty">
                                    <i class="fas fa-arrow-left"></i>
                                    <p>Clique no nome de um colaborador para editar o dia ou aplicar almoco por periodo.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;

        ensureScaleSidebarToggleEscala();
        bindScaleOutsideSelectionEscala();
        atualizarAcoesCabecalhoEscala();
        bindScrollHeightAutoEscala();

        document.getElementById('btnDiaAnteriorEscala')?.addEventListener('click', async () => {
            const nextDate = shiftIsoDateEscala(obterDataSelecionadaEscala(), -1);
            await carregarEscalaSelecionadaEscala(nextDate);
        });

        document.getElementById('btnDiaProximoEscala')?.addEventListener('click', async () => {
            const nextDate = shiftIsoDateEscala(obterDataSelecionadaEscala(), 1);
            await carregarEscalaSelecionadaEscala(nextDate);
        });

        document.getElementById('seletorDataEscala')?.addEventListener('change', async (event) => {
            await carregarEscalaSelecionadaEscala(event.target.value);
        });

        // "Tentar novamente" do estado de erro. Delegado no body da timeline
        // porque o botao e recriado a cada render.
        document.getElementById('timelineBody')?.addEventListener('click', (event) => {
            const repetir = event.target.closest('[data-repetir-escala]');

            if (repetir) {
                carregarEscalaSelecionadaEscala(repetir.dataset.repetirEscala);
                return;
            }

            // Saida do estado "filtro escondeu todo mundo".
            if (event.target.closest('[data-limpar-setor-escala]')) {
                getScaleSectorSelectionEscala().clear();
                const state = getCurrentScaleState();
                renderScaleSectorTabsEscala(state.items || []);
                renderScaleRowsEscala(state);
            }
        });

        document.getElementById('btnNovoLancamentoEscala')?.addEventListener('click', abrirLancamentoPessoalEscala);
        document.getElementById('btnCriarColaboradorEscala')?.addEventListener('click', () => {
            // O editor de colaborador vive na tela Colaboradores. Navega para
            // la (clicando no item do menu) e, quando a tela montar, abre o
            // cadastro de novo colaborador clicando no proprio botao dela.
            const navColaboradores = document.querySelector('.sidebar-btn[data-page="colaboradores"]');
            if (navColaboradores) {
                navColaboradores.click();
            }

            let tentativas = 0;
            const aguardarEditor = setInterval(() => {
                tentativas += 1;
                const btnNovo = document.getElementById('btnNovoColaborador');
                if (btnNovo) {
                    clearInterval(aguardarEditor);
                    btnNovo.click();
                } else if (tentativas > 40) {
                    clearInterval(aguardarEditor); // desiste apos ~2s; ficou na tela Colaboradores
                }
            }, 50);
        });
        document.getElementById('btnAbrirPlantaoEscala')?.addEventListener('click', abrirPlantaoDaEscala);
        document.getElementById('btnRestaurarAlmocosCadastroEscala')?.addEventListener('click', restaurarAlmocosCadastroDiaEscala);
        document.getElementById('escalaSortMode')?.addEventListener('change', (event) => {
            setScaleSortModeEscala(event.target.value);
            renderScaleRowsEscala(getCurrentScaleState());
        });
        setScaleSortModeEscala(getScaleSortModeEscala());

        aplicarDensidadeEscala(lerDensidadeEscalaSalva());

        document.querySelectorAll('.escala-densidade-btn').forEach((botao) => {
            botao.addEventListener('click', () => {
                aplicarDensidadeEscala(botao.dataset.densidade);
            });
        });

        try {
            await carregarEscalaSelecionadaEscala(todayISO);
        } catch (error) {
            renderScaleHeaderEscala();
            renderScaleEmptyMessageEscala(todayISO);
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao carregar escala: ${error.message}`, 'error');
            }
        }
    };


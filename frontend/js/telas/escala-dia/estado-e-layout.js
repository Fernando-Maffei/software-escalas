 
// Editor de Escala do Dia (grade de horarios com arrasta-e-solta do almoco).
// Depende de frontend/js/telas/escala-dia-shared.js (deve carregar antes deste arquivo).
// Script global (sem IIFE) de proposito: o codigo de roteamento de paginas que
// ficou em core/runtime/ chama varias funcoes internas daqui por nome solto
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


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
                    <span>${escapeHtml(config.emptyMessage)}</span>
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
                <span>${escapeHtml(config.label)}</span>
                <strong>${escapeHtml(middleLabel)}</strong>
            </div>
            <div class="escala-range-axis">
                <span>${escapeHtml(formatMinutesToTimeEscala(config.minMinutes))}</span>
                <span>${escapeHtml(formatMinutesToTimeEscala(config.minMinutes + Math.round(span / 2)))}</span>
                <span>${escapeHtml(formatMinutesToTimeEscala(config.maxMinutes))}</span>
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
                        <h4>${escapeHtml(record.colaboradorNome || 'Colaborador')}</h4>
                        <small>${escapeHtml(formatDatePtBrEscala(record.dataISO))} • ${escapeHtml(getDayLabelEscala(record.dataISO))} • ${escapeHtml(TIPO_LABELS[record.tipo] || 'Escala')}</small>
                    </div>
                    <button onclick="fecharEditor()" class="btn-close-editor">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Jornada do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaHoraInicio-${record.colaboradorId}" value="${escapeHtml(formatTimeInputEscala(record.horaInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaHoraFim-${record.colaboradorId}" value="${escapeHtml(formatTimeInputEscala(record.horaFim))}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoco do dia</label>
                    <div class="time-inputs">
                        <input type="time" id="escalaAlmocoInicio-${record.colaboradorId}" value="${escapeHtml(formatTimeInputEscala(record.almocoInicio))}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="escalaAlmocoFim-${record.colaboradorId}" value="${escapeHtml(formatTimeInputEscala(record.almocoFim))}" class="form-control">
                    </div>
                    <small class="helper-text">Atual: ${escapeHtml(lunchRange)}</small>
                    ${avisoAlmocoPersonalizado}
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="escalaObservacao-${record.colaboradorId}" class="form-control" rows="3" placeholder="Detalhes deste dia">${escapeHtml(record.observacao || '')}</textarea>
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


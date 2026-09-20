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

        // Domingo folgado e folga compensatoria sao folga na celula (mesma cor
        // e comportamento), mas o status diz qual e — e a distincao que o
        // relatorio precisa preservar.
        if (ehTipoSemTrabalho(tipo) && !partialAbsence) {
            return { className: 'folga', status: TIPO_LABELS[tipo] || 'Folga' };
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


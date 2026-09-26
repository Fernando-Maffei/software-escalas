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


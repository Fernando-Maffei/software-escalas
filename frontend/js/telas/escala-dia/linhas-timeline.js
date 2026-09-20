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


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


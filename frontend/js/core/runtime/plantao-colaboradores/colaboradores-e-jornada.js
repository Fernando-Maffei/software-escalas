    function buildSetorEditorOptions(selectedId = '') {
        return [
            '<option value="">Selecione...</option>',
            ...((window.setores || []).map((setor) => `
                <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${escapeHtml(setor.nome)}</option>
            `))
        ].join('');
    }

    // Tipo de Escala e so um MOLDE: escolher no select grava o vinculo, mas
    // nao mexe sozinho nos dias. Quem preenche a grade e o botao "Aplicar
    // padrao do tipo", e so depois de o usuario salvar. Assim o tipo nunca
    // sobrescreve em silencio uma jornada ajustada a mao.
    function buildTipoEscalaEditorOptions(selectedId = '') {
        return [
            '<option value="">Sem tipo definido</option>',
            ...((window.tiposEscala || []).map((tipo) => `
                <option value="${tipo.id}" ${Number(selectedId) === Number(tipo.id) ? 'selected' : ''}>${escapeHtml(tipo.nome)}</option>
            `))
        ].join('');
    }

    function buildTipoEscalaEditorMarkup(selectedId = '') {
        // Sem nenhum tipo de escala cadastrado o bloco inteiro some, em vez de
        // mostrar um select que nao tem o que oferecer.
        if (!(window.tiposEscala || []).length) {
            return '';
        }

        return `
            <div class="editor-form-group">
                <label><i class="fas fa-calendar-check"></i> Tipo de escala</label>
                <div class="setor-inputs">
                    <select id="editorTipoEscalaId" class="form-control">
                        ${buildTipoEscalaEditorOptions(selectedId)}
                    </select>
                    <button type="button" class="btn-secondary btn-setor-rapido" id="btnAplicarTipoEscala">
                        <i class="fas fa-wand-magic-sparkles"></i> Aplicar padrao do tipo
                    </button>
                </div>
                <div class="helper-text" id="tipoEscalaHint"></div>
            </div>
        `;
    }

    // Preenche a grade da jornada com os dias do tipo escolhido, SEM salvar —
    // mesmo comportamento do "Sugerir jornada com base no horario padrao".
    function aplicarTipoEscalaNaGrade() {
        const select = document.getElementById('editorTipoEscalaId');
        const tipo = (window.tiposEscala || []).find((item) => Number(item.id) === Number(select?.value));

        if (!tipo) {
            mostrarToast('Escolha um tipo de escala antes de aplicar o padrao.', 'warning');
            return;
        }

        const diasTrabalhados = (tipo.dias || []).filter((dia) => dia.trabalha);
        setJornadaSemanalDays(diasTrabalhados.map((dia) => dia.diaSemana));

        diasTrabalhados.forEach((dia) => {
            const entrada = document.querySelector(`[data-jornada-entrada="${dia.diaSemana}"]`);
            const saida = document.querySelector(`[data-jornada-saida="${dia.diaSemana}"]`);
            const almocoInicio = document.querySelector(`[data-jornada-almoco-inicio="${dia.diaSemana}"]`);
            const almocoFim = document.querySelector(`[data-jornada-almoco-fim="${dia.diaSemana}"]`);

            if (entrada) {
                entrada.value = formatarHora(dia.trabalhoInicio) || '';
            }
            if (saida) {
                saida.value = formatarHora(dia.trabalhoFim) || '';
            }
            if (almocoInicio) {
                almocoInicio.value = formatarHora(dia.almocoInicio) || '';
            }
            if (almocoFim) {
                almocoFim.value = formatarHora(dia.almocoFim) || '';
            }
        });

        atualizarHintTipoEscala();
        mostrarToast(`Padrao de "${tipo.nome}" aplicado na grade. Revise e clique em Salvar.`, 'success');
    }

    function atualizarHintTipoEscala() {
        const hint = document.getElementById('tipoEscalaHint');
        const select = document.getElementById('editorTipoEscalaId');

        if (!hint) {
            return;
        }

        const tipo = (window.tiposEscala || []).find((item) => Number(item.id) === Number(select?.value));

        if (!tipo) {
            hint.innerText = 'Sem tipo: a jornada semanal abaixo vale sozinha.';
            return;
        }

        const partes = [];

        if (tipo.domingosFolgaCada) {
            partes.push(`folga um domingo a cada ${tipo.domingosFolgaCada}`);
        }

        if (tipo.exigeReposicao) {
            partes.push('repoe o domingo folgado num dia de folga');
        }

        hint.innerText = partes.length
            ? `Regra do tipo: ${partes.join('; ')}. O sistema apenas registra — ainda nao gera essas datas.`
            : 'O tipo e um ponto de partida: aplicar preenche a grade abaixo, que voce pode ajustar antes de salvar.';
    }

    const JORNADA_SEMANAL_DIAS = [
        { diaSemana: 0, label: 'Domingo' },
        { diaSemana: 1, label: 'Segunda' },
        { diaSemana: 2, label: 'Terca' },
        { diaSemana: 3, label: 'Quarta' },
        { diaSemana: 4, label: 'Quinta' },
        { diaSemana: 5, label: 'Sexta' },
        { diaSemana: 6, label: 'Sabado' }
    ];

    function buildJornadaSemanalDefaultRows() {
        return JORNADA_SEMANAL_DIAS.map((dia) => ({
            diaSemana: dia.diaSemana,
            label: dia.label,
            checked: false,
            trabalhoInicio: '',
            trabalhoFim: '',
            almocoInicio: '',
            almocoFim: ''
        }));
    }

    function mapJornadaSemanalRowsToEditor(items = []) {
        const byDay = new Map();

        (Array.isArray(items) ? items : []).forEach((item) => {
            const day = Number(item.diaSemana ?? item.DiaSemana);

            if (!Number.isInteger(day) || day < 0 || day > 6) {
                return;
            }

            byDay.set(day, {
                trabalhoInicio: formatarHora(item.trabalhoInicio || item.TrabalhoInicio || ''),
                trabalhoFim: formatarHora(item.trabalhoFim || item.TrabalhoFim || ''),
                almocoInicio: formatarHora(item.almocoInicio || item.AlmocoInicio || ''),
                almocoFim: formatarHora(item.almocoFim || item.AlmocoFim || '')
            });
        });

        return buildJornadaSemanalDefaultRows().map((row) => {
            const loaded = byDay.get(row.diaSemana);

            if (!loaded) {
                return row;
            }

            return {
                ...row,
                checked: true,
                ...loaded
            };
        });
    }

    function getJornadaSemanalEditorMeta() {
        if (!window.__jornadaSemanalEditorMeta) {
            window.__jornadaSemanalEditorMeta = {
                colaboradorId: null,
                hasExisting: false,
                touched: false,
                loaded: false
            };
        }

        return window.__jornadaSemanalEditorMeta;
    }

    function setJornadaSemanalEditorTouched(value = true) {
        const meta = getJornadaSemanalEditorMeta();
        meta.touched = Boolean(value);
    }

    function renderJornadaSemanalRows(rows = []) {
        return rows.map((row) => `
            <div class="jornada-semanal-row${row.checked ? ' is-selected' : ''}" data-jornada-row="${row.diaSemana}">
                <label class="jornada-semanal-day-toggle">
                    <input type="checkbox" data-jornada-check="${row.diaSemana}" ${row.checked ? 'checked' : ''}>
                    <span>${escapeHtml(row.label)}</span>
                </label>
                <div class="jornada-semanal-times${row.checked ? '' : ' is-hidden'}" data-jornada-times="${row.diaSemana}">
                    <div class="jornada-time-group">
                        <small>Jornada</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-entrada="${row.diaSemana}" value="${escapeHtml(row.trabalhoInicio || '')}" class="form-control" title="Entrada">
                            <span>ate</span>
                            <input type="time" data-jornada-saida="${row.diaSemana}" value="${escapeHtml(row.trabalhoFim || '')}" class="form-control" title="Saida">
                        </div>
                    </div>
                    <div class="jornada-time-group">
                        <small>Almoco</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-almoco-inicio="${row.diaSemana}" value="${escapeHtml(row.almocoInicio || '')}" class="form-control" title="Almoco inicio">
                            <span>ate</span>
                            <input type="time" data-jornada-almoco-fim="${row.diaSemana}" value="${escapeHtml(row.almocoFim || '')}" class="form-control" title="Almoco fim">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function buildJornadaSemanalEditorMarkup(rows = [], options = {}) {
        const { showSuggestion = false } = options;

        return `
            <div class="editor-form-group">
                <label><i class="fas fa-calendar-week"></i> Jornada semanal</label>
                <div id="jornadaSemanalSection" class="jornada-semanal-shell">
                    <div class="jornada-semanal-actions">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSegSex">
                            <i class="fas fa-business-time"></i> Selecionar segunda a sexta
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaTodos">
                            <i class="fas fa-layer-group"></i> Selecionar todos
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaCopiarPadrao">
                            <i class="fas fa-copy"></i> Copiar horario padrao para dias selecionados
                        </button>
                    </div>
                    <div class="jornada-semanal-grid" id="jornadaSemanalGrid">
                        ${renderJornadaSemanalRows(rows)}
                    </div>
                    <div id="jornadaSemanalHint" class="helper-text jornada-semanal-hint${showSuggestion ? '' : ' is-hidden'}">
                        Este colaborador ainda nao possui jornada semanal salva. Use o botao abaixo para sugerir o padrao atual sem salvar automaticamente.
                    </div>
                    <div id="jornadaSemanalSuggestionActions" class="jornada-semanal-suggestion-actions${showSuggestion ? '' : ' is-hidden'}">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSugerirPadrao">
                            <i class="fas fa-magic"></i> Sugerir jornada com base no horario padrao
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function toggleJornadaSemanalDayRow(day, checked) {
        const row = document.querySelector(`[data-jornada-row="${day}"]`);
        const times = document.querySelector(`[data-jornada-times="${day}"]`);

        if (row) {
            row.classList.toggle('is-selected', checked);
        }

        if (times) {
            times.classList.toggle('is-hidden', !checked);
        }
    }

    function getHorarioPadraoEditor() {
        return {
            trabalhoInicio: document.getElementById('editorTrabInicio')?.value || '',
            trabalhoFim: document.getElementById('editorTrabFim')?.value || '',
            almocoInicio: document.getElementById('editorAlmInicio')?.value || '',
            almocoFim: document.getElementById('editorAlmFim')?.value || ''
        };
    }

    function copyHorarioPadraoParaJornadaSelecionada() {
        const padrao = getHorarioPadraoEditor();
        const checkedDays = Array.from(document.querySelectorAll('[data-jornada-check]:checked'));

        checkedDays.forEach((checkbox) => {
            const day = checkbox.getAttribute('data-jornada-check');
            const entrada = document.querySelector(`[data-jornada-entrada="${day}"]`);
            const saida = document.querySelector(`[data-jornada-saida="${day}"]`);
            const almocoInicio = document.querySelector(`[data-jornada-almoco-inicio="${day}"]`);
            const almocoFim = document.querySelector(`[data-jornada-almoco-fim="${day}"]`);

            if (entrada) {
                entrada.value = padrao.trabalhoInicio;
            }
            if (saida) {
                saida.value = padrao.trabalhoFim;
            }
            if (almocoInicio) {
                almocoInicio.value = padrao.almocoInicio;
            }
            if (almocoFim) {
                almocoFim.value = padrao.almocoFim;
            }
        });

        if (checkedDays.length > 0) {
            setJornadaSemanalEditorTouched(true);
        }
    }

    function setJornadaSemanalDays(days = []) {
        const daySet = new Set(days.map((day) => Number(day)));

        JORNADA_SEMANAL_DIAS.forEach((dayInfo) => {
            const checkbox = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`);
            const checked = daySet.has(dayInfo.diaSemana);

            if (checkbox) {
                checkbox.checked = checked;
            }

            toggleJornadaSemanalDayRow(dayInfo.diaSemana, checked);
        });

        setJornadaSemanalEditorTouched(true);
    }

    function collectJornadaSemanalPayloadFromEditor() {
        return JORNADA_SEMANAL_DIAS.map((dayInfo) => {
            const checked = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`)?.checked;

            if (!checked) {
                return null;
            }

            return {
                diaSemana: dayInfo.diaSemana,
                trabalhoInicio: document.querySelector(`[data-jornada-entrada="${dayInfo.diaSemana}"]`)?.value || null,
                trabalhoFim: document.querySelector(`[data-jornada-saida="${dayInfo.diaSemana}"]`)?.value || null,
                almocoInicio: document.querySelector(`[data-jornada-almoco-inicio="${dayInfo.diaSemana}"]`)?.value || null,
                almocoFim: document.querySelector(`[data-jornada-almoco-fim="${dayInfo.diaSemana}"]`)?.value || null
            };
        }).filter(Boolean);
    }

    function bindJornadaSemanalEditorEvents() {
        const section = document.getElementById('jornadaSemanalSection');

        if (!section || section.dataset.bound === 'true') {
            return;
        }

        section.dataset.bound = 'true';

        document.querySelectorAll('[data-jornada-check]').forEach((input) => {
            input.addEventListener('change', () => {
                const day = Number(input.getAttribute('data-jornada-check'));
                toggleJornadaSemanalDayRow(day, input.checked);
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.querySelectorAll(
            '[data-jornada-entrada], [data-jornada-saida], [data-jornada-almoco-inicio], [data-jornada-almoco-fim]'
        ).forEach((input) => {
            input.addEventListener('input', () => {
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.getElementById('btnJornadaSegSex')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
        });

        document.getElementById('btnJornadaTodos')?.addEventListener('click', () => {
            setJornadaSemanalDays([0, 1, 2, 3, 4, 5, 6]);
        });

        document.getElementById('btnJornadaCopiarPadrao')?.addEventListener('click', () => {
            copyHorarioPadraoParaJornadaSelecionada();
        });

        document.getElementById('btnJornadaSugerirPadrao')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
            copyHorarioPadraoParaJornadaSelecionada();
        });
    }

    function updateJornadaSemanalSuggestionVisibility(showSuggestion) {
        const hint = document.getElementById('jornadaSemanalHint');
        const actions = document.getElementById('jornadaSemanalSuggestionActions');

        if (hint) {
            hint.classList.toggle('is-hidden', !showSuggestion);
        }

        if (actions) {
            actions.classList.toggle('is-hidden', !showSuggestion);
        }
    }

    async function hydrateJornadaSemanalEditor(colaboradorId) {
        const meta = getJornadaSemanalEditorMeta();
        meta.loaded = false;
        meta.hasExisting = false;

        if (!colaboradorId || !window.API?.getColaboradorJornadaSemanal) {
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(false);
            bindJornadaSemanalEditorEvents();
            return;
        }

        try {
            const payload = await window.API.getColaboradorJornadaSemanal(colaboradorId);
            const rows = mapJornadaSemanalRowsToEditor(payload?.items || []);
            const grid = document.getElementById('jornadaSemanalGrid');

            if (grid) {
                grid.innerHTML = renderJornadaSemanalRows(rows);
            }

            meta.hasExisting = rows.some((item) => item.checked);
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(!meta.hasExisting);
            bindJornadaSemanalEditorEvents();
        } catch (error) {
            meta.loaded = true;
            meta.hasExisting = false;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(true);
            bindJornadaSemanalEditorEvents();
        }
    }

    window.abrirEditorColaboradores = abrirEditorColaboradores = async function abrirEditorColaboradoresAtualizado(id) {
        if (
            (!Array.isArray(window.setores) || window.setores.length === 0)
            && typeof carregarSetores === 'function'
        ) {
            await carregarSetores();
        }

        if (
            !Array.isArray(window.tiposEscala)
            && typeof window.carregarTiposEscala === 'function'
        ) {
            await window.carregarTiposEscala();
        }

        const colaborador = id ? (window.colaboradores || []).find((item) => Number(item.Id) === Number(id)) : null;
        const editorPanel = document.getElementById('colaboradorEditor');
        const editorTitle = document.getElementById('editorTitle');
        const editorContent = document.getElementById('colaboradorEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        editorPanel.style.display = 'block';
        editorTitle.innerText = colaborador ? 'Editar Colaborador' : 'Novo Colaborador';

        const jornadaMeta = getJornadaSemanalEditorMeta();
        jornadaMeta.colaboradorId = colaborador ? Number(colaborador.Id) : null;
        jornadaMeta.hasExisting = false;
        jornadaMeta.loaded = false;
        jornadaMeta.touched = false;

        editorContent.innerHTML = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" value="${escapeHtml(colaborador?.Nome || '')}" placeholder="Nome completo" class="form-control">
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-layer-group"></i> Setor</label>
                    <div class="setor-inputs">
                        <select id="editorSetorId" class="form-control">
                            ${buildSetorEditorOptions(colaborador?.SetorId || '')}
                        </select>
                        <button type="button" onclick="adicionarSetorRapido()" class="btn-secondary btn-setor-rapido">
                            <i class="fas fa-plus"></i> Novo setor
                        </button>
                    </div>
                </div>

                ${buildTipoEscalaEditorMarkup(colaborador?.TipoEscalaId || '')}

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Horario de entrada e saida</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" value="${escapeHtml(formatarHora(colaborador?.TrabalhoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorTrabFim" value="${escapeHtml(formatarHora(colaborador?.TrabalhoFim) || '')}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Horario de almoco</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" value="${escapeHtml(formatarHora(colaborador?.AlmocoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorAlmFim" value="${escapeHtml(formatarHora(colaborador?.AlmocoFim) || '')}" class="form-control">
                    </div>
                    <small class="helper-text">Esses horarios definem a base padrao da escala para esse colaborador.</small>
                </div>

                ${buildJornadaSemanalEditorMarkup(buildJornadaSemanalDefaultRows(), { showSuggestion: false })}

                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(${colaborador ? colaborador.Id : 'null'})" class="btn-primary">
                        <i class="fas fa-save"></i> ${colaborador ? 'Atualizar' : 'Salvar'}
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                ${colaborador ? `
                    <div class="editor-footer">
                        <button onclick="abrirDesligarColaborador(${colaborador.Id}, '${escapeHtml(String(colaborador.Nome || '')).replace(/'/g, "\\'")}')" class="btn-danger" style="width: 100%;">
                            <i class="fas fa-user-slash"></i> Desligar colaborador
                        </button>
                        <small class="helper-text">O historico e preservado. A exclusao definitiva so acontece depois, na tela de desligados.</small>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('btnAplicarTipoEscala')?.addEventListener('click', aplicarTipoEscalaNaGrade);
        document.getElementById('editorTipoEscalaId')?.addEventListener('change', atualizarHintTipoEscala);
        atualizarHintTipoEscala();

        if (colaborador?.Id) {
            hydrateJornadaSemanalEditor(colaborador.Id);
        } else {
            bindJornadaSemanalEditorEvents();
            jornadaMeta.loaded = true;
            updateJornadaSemanalSuggestionVisibility(false);
            setJornadaSemanalEditorTouched(false);
        }
    };

    window.abrirEditorColaborador = abrirEditorColaborador = async function abrirEditorColaboradorAtualizado(id) {
        return window.abrirEditorColaboradores(id);
    };

    window.salvarColaboradorEditor = salvarColaboradorEditor = async function salvarColaboradorEditorComSetor(id) {
        const nome = document.getElementById('editorNome')?.value?.trim();
        const setorId = document.getElementById('editorSetorId')?.value || null;
        const trabalhoInicio = document.getElementById('editorTrabInicio')?.value || null;
        const trabalhoFim = document.getElementById('editorTrabFim')?.value || null;
        const almocoInicio = document.getElementById('editorAlmInicio')?.value || null;
        const almocoFim = document.getElementById('editorAlmFim')?.value || null;

        if (!nome) {
            mostrarToast('Nome e obrigatorio!', 'error');
            return;
        }

        if (!setorId) {
            mostrarToast('Selecione um setor para o colaborador.', 'warning');
            return;
        }

        // Clique duplo em "Salvar" mandava dois POST e criava o colaborador em
        // dobro. Enquanto uma gravacao esta em andamento, as outras sao ignoradas.
        if (salvandoColaboradorEditor) {
            return;
        }

        salvandoColaboradorEditor = true;
        const botaoSalvar = document.querySelector('#colaboradorEditor .editor-actions .btn-primary');

        if (botaoSalvar) {
            botaoSalvar.disabled = true;
        }

        try {
            const jornadaMeta = getJornadaSemanalEditorMeta();
            const jornadaSemanal = collectJornadaSemanalPayloadFromEditor();
            const shouldSendJornadaSemanal = Boolean(
                jornadaMeta.touched
                || (!id && jornadaSemanal.length > 0)
            );
            const invalidJornadaDia = shouldSendJornadaSemanal
                ? jornadaSemanal.find((item) => !item.trabalhoInicio || !item.trabalhoFim)
                : null;
            const body = {
                nome,
                setorId,
                trabalhoInicio,
                trabalhoFim,
                almocoInicio,
                almocoFim
            };

            // O select so aparece quando o banco ja tem os tipos de escala.
            // Sem ele, nao mandamos o campo — evita apagar o vinculo de quem
            // salvou por uma tela antiga.
            const selectTipoEscala = document.getElementById('editorTipoEscalaId');

            if (selectTipoEscala) {
                body.tipoEscalaId = selectTipoEscala.value || null;
            }

            if (invalidJornadaDia) {
                const dayInfo = JORNADA_SEMANAL_DIAS.find((day) => Number(day.diaSemana) === Number(invalidJornadaDia.diaSemana));
                mostrarToast(`Preencha entrada e saida para ${dayInfo?.label || 'o dia selecionado'}.`, 'warning');
                return;
            }

            if (shouldSendJornadaSemanal) {
                body.jornadaSemanal = jornadaSemanal;
            }

            // window.API.request ja transforma resposta de erro em Error com a
            // mensagem do servidor.
            if (id) {
                await window.API.put(`/colaboradores/${id}`, body);
            } else {
                await window.API.post('/colaboradores', body);
            }

            await Promise.allSettled([
                typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
                carregarColaboradores(),
                typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
            ]);

            if (typeof renderListaColaboradores === 'function') {
                renderListaColaboradores();
            }

            if (typeof fecharColaboradorEditor === 'function') {
                fecharColaboradorEditor();
            }

            mostrarToast(
                id ? 'Colaborador atualizado!' : 'Colaborador salvo com sucesso!',
                'success'
            );
        } catch (error) {
            console.error('Erro ao salvar:', error);
            mostrarToast(error.message || 'Erro ao salvar colaborador', 'error');
        } finally {
            salvandoColaboradorEditor = false;

            if (botaoSalvar) {
                botaoSalvar.disabled = false;
            }
        }
    };

    let salvandoColaboradorEditor = false;

    function fecharModalColab() {
        const existente = document.getElementById('modalColabGeral');
        if (existente) {
            existente.remove();
        }
    }

    // Modal de desligamento: pede a data e desliga (soft delete). Nao apaga nada.
    window.abrirDesligarColaborador = function abrirDesligarColaborador(id, nome) {
        fecharModalColab();
        const hojeISO = obterDataISO(new Date());
        const overlay = document.createElement('div');
        overlay.id = 'modalColabGeral';
        overlay.className = 'bh-modal-overlay';
        overlay.innerHTML = `
            <div class="bh-modal" style="max-width: 460px;">
                <div class="bh-modal-header">
                    <h3><i class="fas fa-user-slash"></i> Desligar ${escapeHtml(nome || 'colaborador')}</h3>
                    <button type="button" class="bh-modal-fechar" aria-label="Fechar"><i class="fas fa-times"></i></button>
                </div>
                <div class="bh-modal-body">
                    <p class="bh-modal-info">O colaborador some das escalas, calendario e plantao, mas o <strong>historico continua no banco</strong>. A exclusao definitiva so acontece depois, na tela de desligados.</p>
                    <div class="editor-form-group">
                        <label><i class="fas fa-calendar-day"></i> Data de desligamento</label>
                        <input type="date" id="inputDataDesligamento" class="form-control" value="${hojeISO}">
                    </div>
                </div>
                <div class="bh-modal-footer">
                    <button type="button" class="btn-secondary bh-modal-cancelar">Cancelar</button>
                    <button type="button" class="btn-danger" id="btnConfirmarDesligamento"><i class="fas fa-user-slash"></i> Desligar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.bh-modal-fechar').addEventListener('click', fecharModalColab);
        overlay.querySelector('.bh-modal-cancelar').addEventListener('click', fecharModalColab);
        overlay.addEventListener('click', (evento) => {
            if (evento.target === overlay) {
                fecharModalColab();
            }
        });
        overlay.querySelector('#btnConfirmarDesligamento').addEventListener('click', async () => {
            const dataDesligamento = document.getElementById('inputDataDesligamento')?.value || hojeISO;
            try {
                await window.API.desligarColaborador(id, { dataDesligamento });
                fecharModalColab();
                if (typeof fecharColaboradorEditor === 'function') {
                    fecharColaboradorEditor();
                }
                mostrarToast('Colaborador desligado. Historico preservado.', 'success');
                await Promise.allSettled([
                    typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
                    typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
                ]);
                if (typeof renderListaColaboradores === 'function') {
                    renderListaColaboradores();
                }
            } catch (error) {
                mostrarToast(error.message || 'Nao foi possivel desligar.', 'error');
            }
        });
    };

    // Tela de desligados: lista quem esta desligado, permite reativar e (so
    // depois da data de desligamento) excluir definitivamente.
    window.abrirDesligadosColaboradores = async function abrirDesligadosColaboradores() {
        fecharModalColab();
        const overlay = document.createElement('div');
        overlay.id = 'modalColabGeral';
        overlay.className = 'bh-modal-overlay';
        overlay.innerHTML = `
            <div class="bh-modal">
                <div class="bh-modal-header">
                    <h3><i class="fas fa-user-slash"></i> Colaboradores desligados</h3>
                    <button type="button" class="bh-modal-fechar" aria-label="Fechar"><i class="fas fa-times"></i></button>
                </div>
                <div class="bh-modal-body" id="desligadosBody">
                    <div class="bh-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.bh-modal-fechar').addEventListener('click', fecharModalColab);
        overlay.addEventListener('click', (evento) => {
            if (evento.target === overlay) {
                fecharModalColab();
            }
        });
        await renderDesligadosLista();
    };

    async function renderDesligadosLista() {
        const alvo = document.getElementById('desligadosBody');
        if (!alvo) {
            return;
        }
        try {
            const todos = await window.API.getColaboradores({ incluirInativos: 1 });
            const hojeISO = obterDataISO(new Date());
            const desligados = (Array.isArray(todos) ? todos : []).filter((c) => c.Ativo === false || c.Ativo === 0);

            if (desligados.length === 0) {
                alvo.innerHTML = '<div class="bh-vazio">Nenhum colaborador desligado.</div>';
                return;
            }

            const linhas = desligados.map((c) => {
                const dataISO = obterDataISO(c.DataDesligamento);
                const apto = dataISO && dataISO <= hojeISO;
                return `
                    <tr>
                        <td>${escapeHtml(c.Nome || 'Sem nome')}</td>
                        <td>${dataISO ? escapeHtml(formatarDataPlantaoCard(dataISO)) : '--'}</td>
                        <td>${apto ? '<span class="desligado-apto">Apto a limpeza</span>' : '<span class="desligado-retencao">Em retencao</span>'}</td>
                        <td class="desligado-acoes">
                            <button type="button" class="btn-secondary" data-reativar="${c.Id}"><i class="fas fa-rotate-left"></i> Reativar</button>
                            <button type="button" class="btn-danger" data-excluir="${c.Id}" data-nome="${escapeHtml(c.Nome || '')}" ${apto ? '' : 'disabled'} title="${apto ? 'Excluir definitivamente' : 'So apos a data de desligamento'}"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

            alvo.innerHTML = `
                <p class="bh-modal-info">Desligados mantem o historico ate a data de desligamento. Depois dela ficam <strong>aptos a limpeza</strong> (exclusao definitiva).</p>
                <div class="banco-horas-tabela-wrap">
                    <table class="banco-horas-tabela bh-tabela-verificar">
                        <thead><tr><th>Colaborador</th><th>Desligamento</th><th>Status</th><th></th></tr></thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
            `;

            alvo.querySelectorAll('[data-reativar]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        await window.API.reativarColaborador(Number(btn.dataset.reativar));
                        mostrarToast('Colaborador reativado.', 'success');
                        if (typeof carregarColaboradores === 'function') {
                            await carregarColaboradores();
                        }
                        if (typeof renderListaColaboradores === 'function') {
                            renderListaColaboradores();
                        }
                        await renderDesligadosLista();
                    } catch (error) {
                        mostrarToast(error.message || 'Falha ao reativar.', 'error');
                    }
                });
            });

            alvo.querySelectorAll('[data-excluir]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const nome = btn.dataset.nome || 'este colaborador';
                    // Exclusao definitiva apaga o colaborador e todo o historico
                    // (plantoes, banco de horas, escala, ausencias): so segue com
                    // a senha de quem esta logado, conferida no servidor.
                    const senha = await solicitarSenhaModal({
                        mensagem: `Excluir DEFINITIVAMENTE ${nome} e todo o historico? Esta acao nao pode ser desfeita.`,
                        verificar: (valor) => window.API.verificarSenha(valor)
                    });

                    if (senha === null) {
                        return;
                    }
                    try {
                        await window.API.excluirColaborador(Number(btn.dataset.excluir));
                        mostrarToast('Colaborador excluido definitivamente.', 'success');
                        if (typeof carregarColaboradores === 'function') {
                            await carregarColaboradores();
                        }
                        if (typeof renderListaColaboradores === 'function') {
                            renderListaColaboradores();
                        }
                        await renderDesligadosLista();
                    } catch (error) {
                        mostrarToast(error.message || 'Falha ao excluir.', 'error');
                    }
                });
            });
        } catch (error) {
            alvo.innerHTML = `<div class="bh-erro">${escapeHtml(error.message || 'Falha ao carregar desligados.')}</div>`;
        }
    }

    window.renderColaboradoresPlantao = renderColaboradoresPlantao = function renderColaboradoresPlantaoAvancado(colaboradoresIds) {
        if (!colaboradoresIds || colaboradoresIds.length === 0) {
            return '<span class="sem-colaboradores">Nenhum colaborador selecionado</span>';
        }

        return colaboradoresIds.map((id) => {
            const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));

            if (!colaborador) {
                return '';
            }

            const resumo = getBancoHorasResumoByColaborador(id);

            return `
                <span class="colaborador-tag">
                    <i class="fas fa-user"></i> ${escapeHtml(colaborador.Nome)}
                    ${resumo ? `<small>${escapeHtml(resumo.saldoFormatado)}</small>` : ''}
                </span>
            `;
        }).join('');
    };


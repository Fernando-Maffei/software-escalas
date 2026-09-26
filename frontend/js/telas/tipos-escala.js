/* =====================================================================
   TELA DE TIPOS DE ESCALA (Configuracoes -> Escalas)
   ---------------------------------------------------------------------
   Gerencia os MOLDES de padrao semanal. Aplicar um molde a alguem nao
   acontece aqui — isso fica no editor de colaborador. Aqui so se define
   o molde: quais dias trabalha, em que horario, e a regra de folga de
   domingo (que o sistema apenas registra, nao aplica).

   Usa data-attributes proprios (data-tipo-dia-*) em vez dos
   data-jornada-* do editor de colaborador: aqueles sao lidos por
   document.querySelector global em colaboradores-e-jornada.js, e duas
   grades com os mesmos atributos se atrapalhariam.
   ===================================================================== */
(function initTelaTiposEscala() {
    if (window.__telaTiposEscalaCarregada) {
        return;
    }

    window.__telaTiposEscalaCarregada = true;

    const DIAS = [
        { diaSemana: 0, label: 'Domingo' },
        { diaSemana: 1, label: 'Segunda' },
        { diaSemana: 2, label: 'Terca' },
        { diaSemana: 3, label: 'Quarta' },
        { diaSemana: 4, label: 'Quinta' },
        { diaSemana: 5, label: 'Sexta' },
        { diaSemana: 6, label: 'Sabado' }
    ];
    const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

    let editandoId = null;

    // 'HH:MM:SS' do backend -> 'HH:MM' do <input type="time">.
    function paraInputHora(valor) {
        const bruto = String(valor || '').trim();
        return bruto.includes(':') ? bruto.slice(0, 5) : '';
    }

    function tiposEmMemoria() {
        return Array.isArray(window.tiposEscala) ? window.tiposEscala : [];
    }

    function diasDoTipo(tipo) {
        const porDia = new Map((tipo?.dias || []).map((dia) => [Number(dia.diaSemana), dia]));

        return DIAS.map((info) => porDia.get(info.diaSemana) || {
            diaSemana: info.diaSemana,
            trabalha: false,
            trabalhoInicio: null,
            trabalhoFim: null,
            almocoInicio: null,
            almocoFim: null
        });
    }

    function resumoDosDias(tipo) {
        const trabalhados = diasDoTipo(tipo).filter((dia) => dia.trabalha);

        if (!trabalhados.length) {
            return 'Nenhum dia de trabalho';
        }

        const nomes = trabalhados.map((dia) => DIAS_CURTOS[dia.diaSemana]).join(', ');
        const primeiro = trabalhados[0];
        const horario = primeiro.trabalhoInicio && primeiro.trabalhoFim
            ? ` — ${paraInputHora(primeiro.trabalhoInicio)} as ${paraInputHora(primeiro.trabalhoFim)}`
            : '';

        return `${nomes}${horario}`;
    }

    function resumoDaRegra(tipo) {
        const partes = [];

        if (tipo.domingosFolgaCada) {
            partes.push(`folga 1 domingo a cada ${tipo.domingosFolgaCada}`);
        }

        if (tipo.exigeReposicao) {
            partes.push('com reposicao');
        }

        return partes.join(', ');
    }

    function renderLista() {
        const alvo = document.getElementById('tiposEscalaLista');

        if (!alvo) {
            return;
        }

        const tipos = tiposEmMemoria();

        if (!tipos.length) {
            alvo.innerHTML = `
                <div class="tipos-escala-vazio">
                    Nenhum tipo de escala cadastrado ainda.
                    Se o banco foi atualizado agora, clique em "Recarregar".
                </div>
            `;
            return;
        }

        alvo.innerHTML = tipos.map((tipo) => {
            const regra = resumoDaRegra(tipo);

            return `
                <div class="tipo-escala-item${Number(editandoId) === Number(tipo.id) ? ' is-editando' : ''}">
                    <div class="tipo-escala-info">
                        <strong>
                            ${escapeHtml(tipo.nome)}
                            ${tipo.ativo ? '' : '<span class="tipo-escala-chip is-inativo">Inativo</span>'}
                        </strong>
                        <p>${escapeHtml(resumoDosDias(tipo))}</p>
                        ${regra ? `<p class="tipo-escala-regra"><i class="fas fa-scale-balanced"></i> ${escapeHtml(regra)}</p>` : ''}
                    </div>
                    <button type="button" class="btn-secondary" data-editar-tipo="${tipo.id}">
                        <i class="fas fa-pen"></i> Editar
                    </button>
                </div>
            `;
        }).join('');
    }

    function renderLinhasDoEditor(dias) {
        return dias.map((dia) => {
            const info = DIAS.find((item) => item.diaSemana === dia.diaSemana);
            const marcado = Boolean(dia.trabalha);

            return `
                <div class="tipo-dia-row${marcado ? ' is-selected' : ''}" data-tipo-dia-row="${dia.diaSemana}">
                    <label class="tipo-dia-toggle">
                        <input type="checkbox" data-tipo-dia-check="${dia.diaSemana}" ${marcado ? 'checked' : ''}>
                        <span>${info.label}</span>
                    </label>
                    <div class="tipo-dia-times${marcado ? '' : ' is-hidden'}" data-tipo-dia-times="${dia.diaSemana}">
                        <div class="tipo-dia-group">
                            <small>Trabalho</small>
                            <div class="tipo-dia-pair">
                                <input type="time" data-tipo-dia-entrada="${dia.diaSemana}" value="${escapeHtml(paraInputHora(dia.trabalhoInicio))}" class="form-control">
                                <span>ate</span>
                                <input type="time" data-tipo-dia-saida="${dia.diaSemana}" value="${escapeHtml(paraInputHora(dia.trabalhoFim))}" class="form-control">
                            </div>
                        </div>
                        <div class="tipo-dia-group">
                            <small>Almoco</small>
                            <div class="tipo-dia-pair">
                                <input type="time" data-tipo-dia-almoco-inicio="${dia.diaSemana}" value="${escapeHtml(paraInputHora(dia.almocoInicio))}" class="form-control">
                                <span>ate</span>
                                <input type="time" data-tipo-dia-almoco-fim="${dia.diaSemana}" value="${escapeHtml(paraInputHora(dia.almocoFim))}" class="form-control">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderEditor(tipo) {
        const painel = document.getElementById('tiposEscalaEditor');

        if (!painel) {
            return;
        }

        painel.classList.remove('is-hidden');
        painel.innerHTML = `
            <div class="tipo-escala-editor-header">
                <h3><i class="fas fa-calendar-check"></i> ${tipo?.id ? 'Editar tipo de escala' : 'Novo tipo de escala'}</h3>
                <button type="button" class="btn-icon" id="btnFecharTipoEscala" title="Fechar">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="editor-form-group">
                <label><i class="fas fa-tag"></i> Nome</label>
                <input type="text" id="tipoEscalaNome" class="form-control" value="${escapeHtml(tipo?.nome || '')}" placeholder="ex.: Plantonista Sab-Qua">
            </div>

            <div class="editor-form-group">
                <label><i class="fas fa-calendar-week"></i> Dias e horarios</label>
                <div class="tipo-dias-grid" id="tipoEscalaDias">
                    ${renderLinhasDoEditor(diasDoTipo(tipo))}
                </div>
            </div>

            <div class="editor-form-group">
                <label><i class="fas fa-scale-balanced"></i> Regra de folga em domingo</label>
                <div class="tipo-escala-regra-campos">
                    <label class="tipo-escala-inline">
                        Folga 1 domingo a cada
                        <input type="number" id="tipoEscalaDomingos" class="form-control" min="1" step="1"
                               value="${tipo?.domingosFolgaCada ? escapeHtml(tipo.domingosFolgaCada) : ''}" placeholder="—">
                        domingos
                    </label>
                    <label class="tipo-escala-inline">
                        <input type="checkbox" id="tipoEscalaReposicao" ${tipo?.exigeReposicao ? 'checked' : ''}>
                        Exige reposicao em dia de folga
                    </label>
                </div>
                <div class="helper-text">
                    Deixe em branco quando nao se aplica. O sistema apenas <strong>registra</strong>
                    essa regra — nao gera as datas de folga nem de reposicao.
                </div>
            </div>

            <div class="editor-form-group">
                <label><i class="fas fa-comment"></i> Observacao</label>
                <input type="text" id="tipoEscalaObservacao" class="form-control" maxlength="500" value="${escapeHtml(tipo?.observacao || '')}">
            </div>

            <div class="editor-form-group">
                <label class="tipo-escala-inline">
                    <input type="checkbox" id="tipoEscalaAtivo" ${tipo && tipo.ativo === false ? '' : 'checked'}>
                    Ativo (aparece no cadastro de colaborador)
                </label>
            </div>

            <div class="tipo-escala-acoes">
                <button type="button" class="btn-primary" id="btnSalvarTipoEscala">
                    <i class="fas fa-save"></i> Salvar
                </button>
                <button type="button" class="btn-secondary" id="btnCancelarTipoEscala">
                    Cancelar
                </button>
            </div>
        `;

        painel.querySelectorAll('[data-tipo-dia-check]').forEach((input) => {
            input.addEventListener('change', () => {
                alternarDia(Number(input.getAttribute('data-tipo-dia-check')), input.checked);
            });
        });

        document.getElementById('btnSalvarTipoEscala').addEventListener('click', salvar);
        document.getElementById('btnCancelarTipoEscala').addEventListener('click', fecharEditor);
        document.getElementById('btnFecharTipoEscala').addEventListener('click', fecharEditor);
    }

    function alternarDia(diaSemana, marcado) {
        const linha = document.querySelector(`[data-tipo-dia-row="${diaSemana}"]`);
        const horarios = document.querySelector(`[data-tipo-dia-times="${diaSemana}"]`);

        linha?.classList.toggle('is-selected', marcado);
        horarios?.classList.toggle('is-hidden', !marcado);
    }

    function fecharEditor() {
        editandoId = null;
        const painel = document.getElementById('tiposEscalaEditor');
        painel?.classList.add('is-hidden');

        if (painel) {
            painel.innerHTML = '';
        }

        renderLista();
    }

    function coletarPayload() {
        const dias = DIAS.map((info) => {
            const marcado = document.querySelector(`[data-tipo-dia-check="${info.diaSemana}"]`)?.checked;

            return {
                diaSemana: info.diaSemana,
                trabalha: Boolean(marcado),
                trabalhoInicio: document.querySelector(`[data-tipo-dia-entrada="${info.diaSemana}"]`)?.value || null,
                trabalhoFim: document.querySelector(`[data-tipo-dia-saida="${info.diaSemana}"]`)?.value || null,
                almocoInicio: document.querySelector(`[data-tipo-dia-almoco-inicio="${info.diaSemana}"]`)?.value || null,
                almocoFim: document.querySelector(`[data-tipo-dia-almoco-fim="${info.diaSemana}"]`)?.value || null
            };
        });

        return {
            nome: document.getElementById('tipoEscalaNome')?.value.trim() || '',
            domingosFolgaCada: document.getElementById('tipoEscalaDomingos')?.value || null,
            exigeReposicao: Boolean(document.getElementById('tipoEscalaReposicao')?.checked),
            ativo: Boolean(document.getElementById('tipoEscalaAtivo')?.checked),
            observacao: document.getElementById('tipoEscalaObservacao')?.value.trim() || null,
            dias
        };
    }

    async function salvar() {
        const botao = document.getElementById('btnSalvarTipoEscala');

        if (botao?.disabled) {
            return;
        }

        const payload = coletarPayload();

        if (!payload.nome) {
            mostrarToast('Informe o nome do tipo de escala.', 'warning');
            return;
        }

        const diaIncompleto = payload.dias.find((dia) => dia.trabalha && (!dia.trabalhoInicio || !dia.trabalhoFim));

        if (diaIncompleto) {
            const info = DIAS.find((item) => item.diaSemana === diaIncompleto.diaSemana);
            mostrarToast(`Preencha entrada e saida para ${info.label}.`, 'warning');
            return;
        }

        if (!payload.dias.some((dia) => dia.trabalha)) {
            mostrarToast('Marque pelo menos um dia de trabalho.', 'warning');
            return;
        }

        // Trava o botao: dois cliques criariam o tipo em dobro, como ja
        // aconteceu no cadastro de colaborador.
        if (botao) {
            botao.disabled = true;
        }

        try {
            // API.post/put ja resolvem a base URL e lancam Error com a
            // mensagem que o backend mandou.
            const dados = editandoId
                ? await window.API.put(`/tipos-escala/${editandoId}`, payload)
                : await window.API.post('/tipos-escala', payload);

            mostrarToast(dados?.message || 'Tipo de escala salvo!', 'success');
            await window.carregarTiposEscala();
            fecharEditor();
        } catch (erro) {
            mostrarToast(erro.message, 'error');
        } finally {
            if (botao) {
                botao.disabled = false;
            }
        }
    }

    function abrirEditor(id) {
        editandoId = id ? Number(id) : null;
        renderEditor(editandoId ? tiposEmMemoria().find((t) => Number(t.id) === editandoId) : null);
        renderLista();
    }

    async function recarregar() {
        if (typeof window.carregarTiposEscala === 'function') {
            await window.carregarTiposEscala();
        }

        renderLista();
    }

    // Chamada quando a secao "Escalas" das Configuracoes e montada.
    window.inicializarTiposEscala = async function inicializarTiposEscala() {
        const alvo = document.getElementById('tiposEscalaLista');

        if (!alvo || alvo.dataset.bound === 'true') {
            return;
        }

        alvo.dataset.bound = 'true';
        alvo.addEventListener('click', (evento) => {
            const botao = evento.target.closest('[data-editar-tipo]');

            if (botao) {
                abrirEditor(botao.getAttribute('data-editar-tipo'));
            }
        });

        document.getElementById('btnNovoTipoEscala')?.addEventListener('click', () => abrirEditor(null));
        document.getElementById('btnRecarregarTiposEscala')?.addEventListener('click', recarregar);

        await recarregar();
    };
}());

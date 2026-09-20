(function () {
    if (window.__bancoHorasRuntimeEnhancementsLoaded) {
        return;
    }

    window.__bancoHorasRuntimeEnhancementsLoaded = true;

    const inflight = new Map();
    let disponibilidadeTimer = null;

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function obterDataISO(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            return valor.includes('T') ? valor.split('T')[0] : valor;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function obterHoraValor(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            const bruto = valor.includes('T') ? valor.split('T')[1] : valor;
            const match = bruto.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
            return match ? `${match[1]}:00` : null;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const isTimeOnlyDate = data.getUTCFullYear() === 1970
            && data.getUTCMonth() === 0
            && data.getUTCDate() === 1;
        const horas = String(isTimeOnlyDate ? data.getUTCHours() : data.getHours()).padStart(2, '0');
        const minutos = String(isTimeOnlyDate ? data.getUTCMinutes() : data.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}:00`;
    }

    function formatarDataPtBr(valor) {
        const dataISO = obterDataISO(valor);

        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function formatarHoraInput(valor) {
        const hora = obterHoraValor(valor);
        return hora ? hora.slice(0, 5) : '';
    }

    function minutosParaTexto(valor, options = {}) {
        const { signed = false } = options;
        const total = Number.isFinite(valor) ? Math.round(valor) : 0;
        const sinal = total < 0 ? '-' : '+';
        const absoluto = Math.abs(total);
        const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
        const minutos = String(absoluto % 60).padStart(2, '0');
        return `${signed ? sinal : ''}${horas}h ${minutos}m`;
    }

    function mapPlantao(item) {
        return {
            ...item,
            dataISO: obterDataISO(item.dataISO || item.data_plantao),
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            tipoCredito: String(item.tipoCredito || item.tipo_credito || '').toLowerCase() === 'extra' ? 'extra' : 'banco',
            horaInicio: obterHoraValor(item.horaInicio || item.hora_inicio),
            horaFim: obterHoraValor(item.horaFim || item.hora_fim),
            observacao: item.observacao || null,
            duracaoMinutos: Number.isFinite(item.duracaoMinutos) ? item.duracaoMinutos : null,
            duracaoFormatada: item.duracaoFormatada || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : []
        };
    }

    function mapBancoHorasResumo(item) {
        return {
            colaboradorId: Number(item.colaboradorId),
            nome: item.nome,
            saldoMinutos: Number(item.saldoMinutos || 0),
            saldoFormatado: item.saldoFormatado || minutosParaTexto(item.saldoMinutos || 0, { signed: true }),
            creditosMesMinutos: Number(item.creditosMesMinutos || 0),
            creditosMesFormatado: item.creditosMesFormatado || minutosParaTexto(item.creditosMesMinutos || 0),
            debitosMesMinutos: Number(item.debitosMesMinutos || 0),
            debitosMesFormatado: item.debitosMesFormatado || minutosParaTexto(item.debitosMesMinutos || 0),
            ultimoMovimentoEm: item.ultimoMovimentoEm || null
        };
    }

    function getBancoHorasResumoByColaborador(colaboradorId) {
        return (window.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getPlantaoEditorState() {
        if (!window.__plantaoEditorState) {
            window.__plantaoEditorState = null;
        }

        return window.__plantaoEditorState;
    }

    function setPlantaoEditorState(state) {
        window.__plantaoEditorState = state;
        return state;
    }

    function isColaboradoresScreenVisible() {
        return Boolean(document.getElementById('listaColaboradores'));
    }

    function getAusenciaDefaults(tipo, subtipo = null) {
        if (tipo === 'ferias') {
            return {
                subtipo: 'ferias',
                descontaBancoHoras: false,
                subtipoBloqueado: true,
                descontoBloqueado: true,
                hint: 'Ferias nao descontam do banco de horas.'
            };
        }

        if (tipo === 'folga') {
            return {
                subtipo: 'folga',
                descontaBancoHoras: true,
                subtipoBloqueado: true,
                descontoBloqueado: false,
                hint: 'Folga debita a jornada padrao do colaborador no banco de horas.'
            };
        }

        if (subtipo === 'medico') {
            return {
                subtipo: 'medico',
                descontaBancoHoras: false,
                subtipoBloqueado: false,
                descontoBloqueado: false,
                hint: 'Lancamentos medicos podem ficar sem desconto no banco.'
            };
        }

        return {
            subtipo: subtipo || 'comum',
            descontaBancoHoras: true,
            subtipoBloqueado: false,
            descontoBloqueado: false,
            hint: 'Ausencias e folgas podem gerar debito, salvo quando voce desmarcar o desconto.'
        };
    }

    function aplicarDefaultsBancoHorasLancamento(options = {}) {
        const { force = false, resetManual = false } = options;
        const tipo = document.getElementById('tipoLancamento')?.value;
        const painel = document.getElementById('camposBancoHorasPessoal');
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const hint = document.getElementById('descontaBancoHorasHint');

        if (!painel || !subtipo || !desconto || !hint) {
            return;
        }

        if (resetManual) {
            delete desconto.dataset.manualOverride;
        }

        const isPessoal = tipo && tipo !== 'feriado';
        painel.classList.toggle('hidden', !isPessoal);

        if (!isPessoal) {
            return;
        }

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        const keepManual = desconto.dataset.manualOverride === 'true' && !force;

        if (!subtipo.value || force || defaults.subtipoBloqueado) {
            subtipo.value = defaults.subtipo;
        }

        if (!keepManual) {
            desconto.checked = defaults.descontaBancoHoras;
        }

        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function resetBancoHorasLancamento() {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');

        if (subtipo) {
            subtipo.value = 'comum';
        }

        if (desconto) {
            desconto.checked = true;
            delete desconto.dataset.manualOverride;
        }

        if (observacao) {
            observacao.value = '';
        }

        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }

    function preencherBancoHorasLancamento(item) {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');
        const hint = document.getElementById('descontaBancoHorasHint');
        const tipo = document.getElementById('tipoLancamento')?.value || item.tipo || item.Tipo;

        if (!subtipo || !desconto || !observacao || !hint) {
            return;
        }

        subtipo.value = item.subtipo || item.Subtipo || getAusenciaDefaults(tipo).subtipo;
        desconto.checked = item.descontaBancoHoras === null || item.descontaBancoHoras === undefined
            ? getAusenciaDefaults(tipo, subtipo.value).descontaBancoHoras
            : Boolean(item.descontaBancoHoras);
        observacao.value = item.observacao || item.Observacao || '';
        desconto.dataset.manualOverride = 'true';

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function renderResumoBancoHorasAviso() {
        if (!window.bancoHorasStatus || window.bancoHorasStatus.enabled !== false) {
            return '';
        }

        return `
            <div class="banco-horas-alert">
                <i class="fas fa-database"></i>
                <div>
                    <strong>Banco de horas aguardando migracao</strong>
                    <span>${escapeHtml(window.bancoHorasStatus.message || 'Aplique o script SQL para liberar saldo e extrato.')}</span>
                </div>
            </div>
        `;
    }

    function renderCardBancoHoras(colaborador) {
        const resumo = getBancoHorasResumoByColaborador(colaborador.Id);
        // Saldo atual vem da grade semanal (mesmo numero da tela Banco de Horas).
        const saldoSemanal = (window.bancoHorasSaldoSemanal || {})[Number(colaborador.Id)] || null;
        const saldoClasse = (saldoSemanal ? saldoSemanal.minutos : 0) < 0 ? 'negativo' : 'positivo';
        const saldoTexto = saldoSemanal ? saldoSemanal.formatado : '0:00';
        const creditosTexto = resumo ? resumo.creditosMesFormatado : '00h 00m';
        const debitosTexto = resumo ? resumo.debitosMesFormatado : '00h 00m';

        return `
            <div class="banco-horas-card">
                <div class="banco-horas-saldo ${saldoClasse}">
                    <span class="banco-horas-label">Saldo atual</span>
                    <strong>${escapeHtml(saldoTexto)}</strong>
                </div>
                <div class="banco-horas-metrics">
                    <span><i class="fas fa-arrow-up"></i> Creditos do mes: ${escapeHtml(creditosTexto)}</span>
                    <span><i class="fas fa-arrow-down"></i> Debitos do mes: ${escapeHtml(debitosTexto)}</span>
                </div>
                <button type="button" class="btn-secondary btn-banco-horas" data-extrato-colaborador="${colaborador.Id}">
                    <i class="fas fa-receipt"></i> Extrato
                </button>
            </div>
        `;
    }

    function ensureBancoHorasModal() {
        if (document.getElementById('modalBancoHoras')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'modalBancoHoras';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content banco-horas-modal-content">
                <div class="modal-header">
                    <h3 id="modalBancoHorasTitulo"><i class="fas fa-receipt"></i> Banco de horas</h3>
                    <button class="modal-close" id="fecharModalBancoHorasBtn">&times;</button>
                </div>
                <div class="modal-body" id="modalBancoHorasBody">
                    <div class="loading-state">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Carregando extrato...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    function renderExtratoBancoHoras(payload) {
        const body = document.getElementById('modalBancoHorasBody');

        if (!body) {
            return;
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        const horasExtras = Array.isArray(payload.horasExtras) ? payload.horasExtras : [];

        if (items.length === 0 && horasExtras.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento encontrado.</p>
                </div>
            `;
            return;
        }

        const movimentos = items.length > 0
            ? `
                <div class="banco-horas-extrato-list">
                    ${items.map((item) => `
                        <article class="banco-horas-movimento ${item.minutos < 0 ? 'debito' : 'credito'}">
                            <header>
                                <div>
                                    <strong>${escapeHtml(item.descricao)}</strong>
                                    <span>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</span>
                                </div>
                                <div class="banco-horas-movimento-valores">
                                    <strong>${escapeHtml(item.minutosFormatado)}</strong>
                                    <span>Saldo: ${escapeHtml(item.saldoAcumuladoFormatado)}</span>
                                </div>
                            </header>
                            ${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}
                        </article>
                    `).join('')}
                </div>
            `
            : `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento no banco de horas.</p>
                </div>
            `;

        // Plantao de hora extra e pago em folha e nao mexe no saldo, entao fica
        // numa secao propria — misturar com os movimentos daria a entender que
        // as horas entraram no banco.
        const extras = horasExtras.length === 0 ? '' : `
            <section class="banco-horas-extras">
                <header class="banco-horas-extras-header">
                    <h4><i class="fas fa-money-bill-wave"></i> Horas extras de plantao</h4>
                    <strong>${escapeHtml(payload.horasExtrasFormatado || '')}</strong>
                </header>
                <p class="banco-horas-extras-aviso">Pagas em folha: nao entram no saldo acima.</p>
                <div class="banco-horas-extras-list">
                    ${horasExtras.map((item) => `
                        <article class="banco-horas-extra">
                            <div>
                                <strong>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</strong>
                                <span>${escapeHtml(formatarHoraInput(item.horaInicio) || '--:--')} - ${escapeHtml(formatarHoraInput(item.horaFim) || '--:--')}</span>
                            </div>
                            <strong class="banco-horas-extra-total">${escapeHtml(item.minutosFormatado)}</strong>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;

        body.innerHTML = movimentos + extras;
    }

    async function abrirExtratoBancoHoras(colaboradorId) {
        ensureBancoHorasModal();
        const modal = document.getElementById('modalBancoHoras');
        const titulo = document.getElementById('modalBancoHorasTitulo');
        const body = document.getElementById('modalBancoHorasBody');
        const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

        if (!modal || !titulo || !body) {
            return;
        }

        titulo.innerHTML = `<i class="fas fa-receipt"></i> Banco de horas - ${escapeHtml(colaborador?.Nome || 'Colaborador')}`;
        body.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-circle-notch fa-spin"></i>
                <p>Carregando extrato...</p>
            </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('active');

        try {
            const payload = await window.API.getBancoHorasExtrato(colaboradorId);
            renderExtratoBancoHoras(payload);
        } catch (error) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${escapeHtml(error.message || 'Nao foi possivel carregar o extrato.')}</p>
                </div>
            `;
        }
    }

    // Aplica "Meus setores" a lista do checklist, mas SEMPRE mantem quem ja
    // esta selecionado (mesmo de outro setor). Sem isso, abrir um plantao com
    // equipe de outro setor e salvar dropava esses membros — o salvar so le os
    // checkboxes visiveis e marcados. Preferencia vazia = todos.
    function filtrarChecklistPorMeusSetoresPlantao(lista, selecionados = []) {
        const base = Array.isArray(lista) ? lista : [];
        const meusSetores = typeof window.getMeusSetores === 'function' ? window.getMeusSetores() : [];

        if (!meusSetores.length) {
            return base;
        }

        const permitidos = new Set(meusSetores.map(String));
        const jaSelecionados = new Set((selecionados || []).map(Number));

        return base.filter((colaborador) => {
            const setorId = String(colaborador.SetorId ?? colaborador.setorId ?? colaborador.setor_id ?? '');
            return permitidos.has(setorId) || jaSelecionados.has(Number(colaborador.Id));
        });
    }

    // ---- Lancamentos do dia ----------------------------------------------
    // Cada linha da tela e UM colaborador com UM horario e UM destino para as
    // horas. Um dia pode ter varias. Quem compartilha horario e destino e
    // agrupado so na hora de gravar, no backend — aqui a linha por pessoa e o
    // que deixa montar turnos diferentes (um das 08h as 13h, outro das 13h as
    // 18h) e escolher banco de horas ou hora extra caso a caso.
    const PLANTAO_CREDITO_META = {
        banco: {
            label: 'Banco de horas',
            curto: 'Banco',
            icone: 'fa-piggy-bank',
            ajuda: 'As horas entram como credito no saldo do colaborador.'
        },
        extra: {
            label: 'Hora extra',
            curto: 'Extra',
            icone: 'fa-money-bill-wave',
            ajuda: 'As horas nao entram no banco: saem como extra na folha.'
        }
    };

    function normalizarTipoCreditoPlantao(valor) {
        return String(valor || '').trim().toLowerCase() === 'extra' ? 'extra' : 'banco';
    }

    function nomeColaboradorPlantao(colaboradorId) {
        const colaborador = (window.colaboradores || [])
            .find((item) => Number(item.Id) === Number(colaboradorId));

        return colaborador ? colaborador.Nome : 'Colaborador removido';
    }

    function minutosDoHorarioPlantao(hora) {
        const [h, m] = String(hora || '').split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? (h * 60) + m : null;
    }

    function duracaoLancamentoPlantao(linha) {
        const inicio = minutosDoHorarioPlantao(linha.horaInicio);
        const fim = minutosDoHorarioPlantao(linha.horaFim);

        return inicio !== null && fim !== null && fim > inicio ? fim - inicio : null;
    }

    function ordenarLancamentosPlantao(linhas) {
        return [...linhas].sort((a, b) => (
            String(a.horaInicio).localeCompare(String(b.horaInicio))
            || nomeColaboradorPlantao(a.colaboradorId).localeCompare(nomeColaboradorPlantao(b.colaboradorId))
        ));
    }

    // Monta as linhas da tela a partir do que ja esta gravado. Cada registro do
    // banco pode trazer varios colaboradores no mesmo horario: aqui ele volta a
    // ser uma linha por pessoa, que e como a tela edita.
    function lancamentosDoDiaPlantao(dataISO) {
        const linhas = [];

        (window.plantoesLancados || [])
            .filter((item) => item.dataISO === dataISO)
            .forEach((registro) => {
                const horaInicio = formatarHoraInput(registro.horaInicio) || '';
                const horaFim = formatarHoraInput(registro.horaFim) || '';
                const tipoCredito = normalizarTipoCreditoPlantao(registro.tipoCredito);

                (registro.colaboradores || []).forEach((colaboradorId) => {
                    linhas.push({
                        colaboradorId: Number(colaboradorId),
                        horaInicio,
                        horaFim,
                        tipoCredito
                    });
                });
            });

        return ordenarLancamentosPlantao(linhas);
    }

    // Mesma regra do backend: ninguem em dois turnos que se sobrepoem. Ao editar,
    // a propria linha e ignorada — senao ela sempre colidiria consigo mesma.
    function conflitoDeLancamentoPlantao(linhas, nova, ignorarIndice = null) {
        const inicioNovo = minutosDoHorarioPlantao(nova.horaInicio);
        const fimNovo = minutosDoHorarioPlantao(nova.horaFim);

        return linhas.some((linha, indice) => {
            if (indice === ignorarIndice) {
                return false;
            }

            if (Number(linha.colaboradorId) !== Number(nova.colaboradorId)) {
                return false;
            }

            const inicio = minutosDoHorarioPlantao(linha.horaInicio);
            const fim = minutosDoHorarioPlantao(linha.horaFim);

            return inicio < fimNovo && inicioNovo < fim;
        });
    }

    // A observacao e do dia inteiro e vive num textarea que sobrevive a varios
    // redesenhos da lista; sem guardar antes de redesenhar, o texto se perderia.
    function capturarRascunhoPlantao(state) {
        if (!state) {
            return;
        }

        const observacao = document.getElementById('plantaoObservacao');

        if (observacao) {
            state.observacao = observacao.value;
        }

        const inicio = document.getElementById('plantaoNovoInicio');
        const fim = document.getElementById('plantaoNovoFim');
        const colaborador = document.getElementById('plantaoNovoColaborador');

        state.rascunho = state.rascunho || {};

        if (inicio) { state.rascunho.horaInicio = inicio.value; }
        if (fim) { state.rascunho.horaFim = fim.value; }
        if (colaborador) { state.rascunho.colaboradorId = Number(colaborador.value || 0); }
    }

    function lerFormularioLancamentoPlantao(state) {
        return {
            colaboradorId: Number(document.getElementById('plantaoNovoColaborador')?.value || 0),
            horaInicio: document.getElementById('plantaoNovoInicio')?.value || '',
            horaFim: document.getElementById('plantaoNovoFim')?.value || '',
            tipoCredito: normalizarTipoCreditoPlantao(state?.rascunho?.tipoCredito)
        };
    }

    // Troca o destino das horas sem redesenhar o painel: um render completo aqui
    // roubaria o foco de quem esta no meio do preenchimento.
    window.definirTipoCreditoPlantao = function definirTipoCreditoPlantao(tipo) {
        const state = getPlantaoEditorState();

        if (!state) {
            return;
        }

        const escolhido = normalizarTipoCreditoPlantao(tipo);
        state.rascunho = state.rascunho || {};
        state.rascunho.tipoCredito = escolhido;

        document.querySelectorAll('[data-plantao-credito]').forEach((botao) => {
            const ativo = botao.getAttribute('data-plantao-credito') === escolhido;
            botao.classList.toggle('is-active', ativo);
            botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });

        const ajuda = document.getElementById('plantaoCreditoAjuda');

        if (ajuda) {
            ajuda.textContent = PLANTAO_CREDITO_META[escolhido].ajuda;
        }
    };

    window.confirmarLancamentoPlantao = function confirmarLancamentoPlantao() {
        const state = getPlantaoEditorState();

        if (!state) {
            return;
        }

        capturarRascunhoPlantao(state);

        const nova = lerFormularioLancamentoPlantao(state);
        const editando = Number.isInteger(state.editandoIndice) ? state.editandoIndice : null;

        if (!nova.colaboradorId) {
            mostrarToast('Escolha o colaborador.', 'error');
            return;
        }

        if (!nova.horaInicio || !nova.horaFim) {
            mostrarToast('Informe a hora inicial e a final.', 'error');
            return;
        }

        if (nova.horaFim <= nova.horaInicio) {
            mostrarToast('A hora final precisa ser maior que a inicial.', 'error');
            return;
        }

        if (conflitoDeLancamentoPlantao(state.lancamentos, nova, editando)) {
            mostrarToast(nomeColaboradorPlantao(nova.colaboradorId) + ' ja tem um lancamento que cruza esse horario.', 'error');
            return;
        }

        if (editando === null) {
            state.lancamentos = ordenarLancamentosPlantao([...state.lancamentos, nova]);
        } else {
            const atualizados = [...state.lancamentos];
            atualizados[editando] = nova;
            state.lancamentos = ordenarLancamentosPlantao(atualizados);
            mostrarToast('Lancamento atualizado. Salve o dia para gravar.', 'success');
        }

        // Mantem horario e destino para encadear varios colaboradores no mesmo
        // turno; so o colaborador volta ao vazio.
        state.editandoIndice = null;
        state.rascunho = {
            colaboradorId: 0,
            horaInicio: nova.horaInicio,
            horaFim: nova.horaFim,
            tipoCredito: nova.tipoCredito
        };

        renderPlantaoEditor(state);
        document.getElementById('plantaoNovoColaborador')?.focus();
    };

    window.editarLancamentoPlantao = function editarLancamentoPlantao(indice) {
        const state = getPlantaoEditorState();
        const linha = state?.lancamentos?.[Number(indice)];

        if (!state || !linha) {
            return;
        }

        capturarRascunhoPlantao(state);

        state.editandoIndice = Number(indice);
        state.rascunho = { ...linha };

        renderPlantaoEditor(state);
        document.getElementById('plantaoNovoColaborador')?.focus();
    };

    window.cancelarEdicaoLancamentoPlantao = function cancelarEdicaoLancamentoPlantao() {
        const state = getPlantaoEditorState();

        if (!state) {
            return;
        }

        capturarRascunhoPlantao(state);

        state.editandoIndice = null;
        state.rascunho = {
            colaboradorId: 0,
            horaInicio: state.rascunho?.horaInicio || '',
            horaFim: state.rascunho?.horaFim || '',
            tipoCredito: normalizarTipoCreditoPlantao(state.rascunho?.tipoCredito)
        };

        renderPlantaoEditor(state);
    };

    window.removerLancamentoPlantao = function removerLancamentoPlantao(indice) {
        const state = getPlantaoEditorState();

        if (!state) {
            return;
        }

        capturarRascunhoPlantao(state);

        const posicao = Number(indice);
        state.lancamentos = state.lancamentos.filter((_, atual) => atual !== posicao);

        // Remover uma linha reindexa a lista: a edicao em curso passaria a
        // apontar para outra pessoa.
        if (Number.isInteger(state.editandoIndice)) {
            if (state.editandoIndice === posicao) {
                state.editandoIndice = null;
            } else if (state.editandoIndice > posicao) {
                state.editandoIndice -= 1;
            }
        }

        renderPlantaoEditor(state);
    };

    function renderResumoLancamentosPlantao(state) {
        const totais = state.lancamentos.reduce((acumulado, linha) => {
            acumulado[linha.tipoCredito] += duracaoLancamentoPlantao(linha) || 0;
            return acumulado;
        }, { banco: 0, extra: 0 });

        const pessoas = new Set(state.lancamentos.map((linha) => Number(linha.colaboradorId))).size;
        const parcelas = [];

        if (totais.banco > 0) {
            parcelas.push(`<span class="plantao-total plantao-total--banco"><i class="fas fa-piggy-bank"></i> ${escapeHtml(minutosParaTexto(totais.banco))} em banco</span>`);
        }

        if (totais.extra > 0) {
            parcelas.push(`<span class="plantao-total plantao-total--extra"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(minutosParaTexto(totais.extra))} em hora extra</span>`);
        }

        return `
            <div class="plantao-lancamentos-resumo">
                <span class="plantao-resumo-contagem">
                    <i class="fas fa-list-check"></i> ${state.lancamentos.length} lancamento(s) &middot; ${pessoas} pessoa(s)
                </span>
                ${parcelas.length > 0 ? `<span class="plantao-resumo-totais">${parcelas.join('')}</span>` : ''}
            </div>
        `;
    }

    function renderLancamentosPlantao(state) {
        if (state.lancamentos.length === 0) {
            return `
                <p class="plantao-lancamentos-vazio">
                    <i class="fas fa-inbox"></i>
                    Nenhum lancamento ainda. Escolha o colaborador, o horario e o destino das horas acima.
                </p>
            `;
        }

        const indisponiveis = new Set(
            (state.disponibilidade || [])
                .filter((item) => item.disponivel === false)
                .map((item) => Number(item.id))
        );

        const linhas = state.lancamentos.map((linha, indice) => {
            const minutos = duracaoLancamentoPlantao(linha);
            const indisponivel = indisponiveis.has(Number(linha.colaboradorId));
            const meta = PLANTAO_CREDITO_META[linha.tipoCredito];
            const emEdicao = state.editandoIndice === indice;
            const nome = nomeColaboradorPlantao(linha.colaboradorId);

            return `
                <li class="plantao-lancamento${indisponivel ? ' is-indisponivel' : ''}${emEdicao ? ' is-editando' : ''}">
                    <div class="plantao-lancamento-info">
                        <div class="plantao-lancamento-topo">
                            <span class="plantao-lancamento-hora">${escapeHtml(linha.horaInicio)} - ${escapeHtml(linha.horaFim)}</span>
                            <span class="plantao-lancamento-credito plantao-credito--${linha.tipoCredito}">
                                <i class="fas ${meta.icone}"></i> ${escapeHtml(meta.curto)}
                            </span>
                        </div>
                        <div class="plantao-lancamento-nome">
                            ${escapeHtml(nome)}
                            ${indisponivel ? '<small class="status-indisponivel">Indisponivel</small>' : ''}
                        </div>
                    </div>
                    <div class="plantao-lancamento-acoes">
                        <span class="plantao-lancamento-duracao">${minutos ? escapeHtml(minutosParaTexto(minutos)) : '--'}</span>
                        <button type="button" class="btn-icon-sm edit" title="Editar lancamento" aria-label="Editar lancamento de ${escapeHtml(nome)}" onclick="editarLancamentoPlantao(${indice})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-icon-sm delete" title="Remover lancamento" aria-label="Remover lancamento de ${escapeHtml(nome)}" onclick="removerLancamentoPlantao(${indice})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </li>
            `;
        }).join('');

        return `
            <ul class="plantao-lancamentos">${linhas}</ul>
            ${renderResumoLancamentosPlantao(state)}
        `;
    }

    function renderOpcoesColaboradorPlantao(state) {
        const indisponiveis = new Map(
            (state.disponibilidade || [])
                .filter((item) => item.disponivel === false)
                .map((item) => [Number(item.id), item.motivoLabel || 'Indisponivel'])
        );

        const lista = filtrarChecklistPorMeusSetoresPlantao(
            Array.isArray(window.colaboradores) ? window.colaboradores : [],
            state.lancamentos.map((linha) => linha.colaboradorId)
        );

        const selecionado = Number(state.rascunho?.colaboradorId || 0);

        return ['<option value="">Selecione o colaborador</option>'].concat(
            lista.map((colaborador) => {
                const id = Number(colaborador.Id);
                const motivo = indisponiveis.get(id);
                // Quem esta sendo editado continua selecionavel mesmo marcado
                // como indisponivel; senao o select abriria vazio na edicao.
                const bloqueado = Boolean(motivo) && id !== selecionado;
                const rotulo = escapeHtml(colaborador.Nome) + (motivo ? ` (${escapeHtml(motivo)})` : '');

                return `<option value="${id}"${bloqueado ? ' disabled' : ''}${id === selecionado ? ' selected' : ''}>${rotulo}</option>`;
            })
        ).join('');
    }

    async function carregarDisponibilidadePlantao(state) {
        try {
            const response = await window.API.getPlantaoDisponibilidade(state.dataISO, {
                horaInicio: state.rascunho?.horaInicio || undefined,
                horaFim: state.rascunho?.horaFim || undefined
            });

            state.disponibilidade = Array.isArray(response?.colaboradores) ? response.colaboradores : [];
        } catch (error) {
            state.disponibilidade = (window.colaboradores || []).map((item) => ({
                id: item.Id,
                nome: item.Nome,
                disponivel: true,
                motivoLabel: null
            }));
        }

        return state;
    }

    function renderPlantaoEditor(state) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        const tipo = state.tipoPlantao || 'sabado';
        const rotuloTipo = rotuloTipoPlantao(tipo, construirMapaFeriadosPlantao().get(state.dataISO));
        const jaLancado = (window.plantoesLancados || []).some((item) => item.dataISO === state.dataISO);
        const editando = Number.isInteger(state.editandoIndice);
        const tipoCredito = normalizarTipoCreditoPlantao(state.rascunho?.tipoCredito);

        editorPanel.style.display = 'block';
        editorTitle.innerText = state.dataFormatada;

        // O tipo do dia e detectado pela data e nao e editavel: como campo de
        // formulario ele so ocupava espaco. Vira etiqueta no cabecalho.
        const editorSubtitulo = document.getElementById('plantaoEditorSubtitulo');

        if (editorSubtitulo) {
            editorSubtitulo.innerHTML = `
                <span class="plantao-tipo-chip plantao-tipo--${tipo}">
                    <i class="fas fa-circle"></i> ${escapeHtml(rotuloTipo)}
                </span>
                <span class="plantao-estado-chip${jaLancado ? ' is-lancado' : ''}">
                    ${jaLancado ? 'Plantao lancado' : 'Ainda nao lancado'}
                </span>
            `;
        }

        editorContent.innerHTML = `
            <div class="editor-plantao">
                <div class="editor-form-group plantao-form-novo${editando ? ' is-editando' : ''}">
                    <label>
                        <i class="fas ${editando ? 'fa-pen' : 'fa-user-plus'}"></i>
                        ${editando ? 'Editando lancamento' : 'Adicionar lancamento'}
                    </label>

                    <select id="plantaoNovoColaborador" class="form-control">
                        ${renderOpcoesColaboradorPlantao(state)}
                    </select>

                    <div class="plantao-novo-horario">
                        <input type="time" id="plantaoNovoInicio" class="form-control" value="${escapeHtml(state.rascunho?.horaInicio || '')}" aria-label="Hora inicial">
                        <span>ate</span>
                        <input type="time" id="plantaoNovoFim" class="form-control" value="${escapeHtml(state.rascunho?.horaFim || '')}" aria-label="Hora final">
                    </div>

                    <div class="plantao-credito-escolha" role="group" aria-label="Destino das horas">
                        ${Object.entries(PLANTAO_CREDITO_META).map(([chave, meta]) => `
                            <button
                                type="button"
                                class="plantao-credito-opcao plantao-credito--${chave}${chave === tipoCredito ? ' is-active' : ''}"
                                data-plantao-credito="${chave}"
                                aria-pressed="${chave === tipoCredito ? 'true' : 'false'}"
                                onclick="definirTipoCreditoPlantao('${chave}')"
                            >
                                <i class="fas ${meta.icone}"></i> ${escapeHtml(meta.label)}
                            </button>
                        `).join('')}
                    </div>
                    <small class="helper-text" id="plantaoCreditoAjuda">${escapeHtml(PLANTAO_CREDITO_META[tipoCredito].ajuda)}</small>

                    <div class="plantao-form-acoes">
                        <button type="button" class="btn-primary" onclick="confirmarLancamentoPlantao()">
                            <i class="fas ${editando ? 'fa-check' : 'fa-plus'}"></i>
                            ${editando ? 'Salvar lancamento' : 'Adicionar ao dia'}
                        </button>
                        ${editando ? `
                            <button type="button" class="btn-secondary" onclick="cancelarEdicaoLancamentoPlantao()">
                                <i class="fas fa-times"></i> Cancelar edicao
                            </button>
                        ` : ''}
                    </div>

                    ${editando ? '' : '<small class="helper-text">Um colaborador por linha. Para um turno com varias pessoas, repita o mesmo horario.</small>'}
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-list-check"></i> Lancamentos do dia</label>
                    ${renderLancamentosPlantao(state)}
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="plantaoObservacao" class="form-control" rows="2" placeholder="Detalhes opcionais para o dia">${escapeHtml(state.observacao || '')}</textarea>
                </div>

                <div class="editor-actions">
                    <button type="button" onclick="salvarPlantao('${state.dataISO}')" class="btn-primary">
                        <i class="fas fa-save"></i> ${jaLancado ? 'Salvar alteracoes' : 'Salvar dia'}
                    </button>
                    <button type="button" onclick="fecharPlantaoEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    ${jaLancado ? `
                        <button type="button" onclick="excluirPlantao('${state.dataISO}')" class="btn-danger-ghost" title="Excluir todos os lancamentos do dia">
                            <i class="fas fa-trash"></i> Excluir dia
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        const novoInicio = document.getElementById('plantaoNovoInicio');
        const novoFim = document.getElementById('plantaoNovoFim');
        const novoColaborador = document.getElementById('plantaoNovoColaborador');

        // O horario digitado sobrevive ao redesenho da lista e ainda refiltra a
        // disponibilidade: quem esta ausente naquele intervalo some do select.
        [novoInicio, novoFim].forEach((campo) => {
            campo?.addEventListener('input', () => {
                const currentState = getPlantaoEditorState();

                if (!currentState) {
                    return;
                }

                currentState.rascunho = currentState.rascunho || {};
                currentState.rascunho.horaInicio = novoInicio?.value || '';
                currentState.rascunho.horaFim = novoFim?.value || '';

                if (disponibilidadeTimer) {
                    clearTimeout(disponibilidadeTimer);
                }

                disponibilidadeTimer = setTimeout(async () => {
                    const ultimoState = getPlantaoEditorState();

                    if (!ultimoState) {
                        return;
                    }

                    capturarRascunhoPlantao(ultimoState);
                    await carregarDisponibilidadePlantao(ultimoState);
                    renderPlantaoEditor(ultimoState);
                }, 400);
            });
        });

        novoColaborador?.addEventListener('change', () => {
            const currentState = getPlantaoEditorState();

            if (currentState) {
                currentState.rascunho = currentState.rascunho || {};
                currentState.rascunho.colaboradorId = Number(novoColaborador.value || 0);
            }
        });

        // Enter em qualquer campo do formulario adiciona/salva a linha.
        [novoInicio, novoFim, novoColaborador].forEach((campo) => {
            campo?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    window.confirmarLancamentoPlantao();
                }
            });
        });
    }

    window.carregarBancoHorasResumo = carregarBancoHorasResumo = function carregarBancoHorasResumoComCache() {
        return withInFlight('banco-horas-resumo', async () => {
            let items = [];
            let status = { enabled: true, message: null };

            try {
                const payload = await window.API.getBancoHorasResumo();
                items = Array.isArray(payload?.items) ? payload.items.map(mapBancoHorasResumo) : [];
                status = {
                    enabled: payload?.enabled !== false,
                    message: null
                };
            } catch (error) {
                items = [];
                status = {
                    enabled: false,
                    message: error.message || 'Banco de horas indisponivel.'
                };
            }

            window.bancoHorasResumo = items;
            window.bancoHorasStatus = status;

            // Saldo "atual" do cadastro = ultimo lancamento da grade semanal
            // (BancoHorasSemanal), para bater com a tela de Banco de Horas.
            try {
                const saldosPayload = await window.API.getBancoHorasSaldosSemanais();
                const mapa = {};
                (saldosPayload?.saldos || []).forEach((saldo) => {
                    mapa[Number(saldo.colaboradorId)] = saldo;
                });
                window.bancoHorasSaldoSemanal = mapa;
            } catch (error) {
                window.bancoHorasSaldoSemanal = window.bancoHorasSaldoSemanal || {};
            }

            return { items, status };
        });
    };

    window.renderListaColaboradores = renderListaColaboradores = function renderListaColaboradoresComBancoHoras(lista = window.colaboradores || []) {
            const container = document.getElementById('listaColaboradores');

            if (!container) {
                return;
            }

            if (!lista || lista.length === 0) {
                container.innerHTML = `
                    ${renderResumoBancoHorasAviso()}
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>Nenhum colaborador encontrado</p>
                        <small>Clique em "Novo Colaborador" para adicionar</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                ${renderResumoBancoHorasAviso()}
                ${lista.map((colaborador) => `
                    <article class="colaborador-card" data-colaborador-id="${colaborador.Id}">
                        <div class="colaborador-avatar">
                            ${escapeHtml(colaborador.Nome?.charAt(0) || '?')}
                        </div>
                        <div class="colaborador-info">
                            <h4 class="colaborador-nome">${escapeHtml(colaborador.Nome || 'Sem nome')}</h4>
                            ${colaborador.SetorNome ? `
                                <div class="colaborador-setor-badge">
                                    <i class="fas fa-layer-group"></i> ${escapeHtml(colaborador.SetorNome)}
                                </div>
                            ` : ''}
                            <div class="colaborador-horarios">
                                <span class="horario-tag">
                                    <i class="fas fa-briefcase"></i> ${escapeHtml(formatarHora(colaborador.TrabalhoInicio))} - ${escapeHtml(formatarHora(colaborador.TrabalhoFim))}
                                </span>
                                <span class="horario-tag">
                                    <i class="fas fa-utensils"></i> ${escapeHtml(formatarHora(colaborador.AlmocoInicio))} - ${escapeHtml(formatarHora(colaborador.AlmocoFim))}
                                </span>
                            </div>
                            ${renderCardBancoHoras(colaborador)}
                        </div>
                        <div class="colaborador-edit-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </article>
                `).join('')}
            `;

            container.querySelectorAll('.colaborador-card').forEach((card) => {
                card.addEventListener('click', (event) => {
                    if (event.target.closest('[data-extrato-colaborador]')) {
                        return;
                    }

                    const colaboradorId = Number(card.dataset.colaboradorId);

                    if (typeof window.abrirEditorColaboradores === 'function') {
                        window.abrirEditorColaboradores(colaboradorId);
                    } else if (typeof abrirEditorColaboradores === 'function') {
                        abrirEditorColaboradores(colaboradorId);
                    }
                });
            });

            container.querySelectorAll('[data-extrato-colaborador]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    abrirExtratoBancoHoras(button.dataset.extratoColaborador);
                });
            });
        };

    function buildSetorEditorOptions(selectedId = '') {
        return [
            '<option value="">Selecione...</option>',
            ...((window.setores || []).map((setor) => `
                <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${escapeHtml(setor.nome)}</option>
            `))
        ].join('');
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

            if (entrada) entrada.value = padrao.trabalhoInicio;
            if (saida) saida.value = padrao.trabalhoFim;
            if (almocoInicio) almocoInicio.value = padrao.almocoInicio;
            if (almocoFim) almocoFim.value = padrao.almocoFim;
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
            const metodo = id ? 'PUT' : 'POST';
            const url = id
                ? `http://localhost:3000/api/colaboradores/${id}`
                : 'http://localhost:3000/api/colaboradores';
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

            if (invalidJornadaDia) {
                const dayInfo = JORNADA_SEMANAL_DIAS.find((day) => Number(day.diaSemana) === Number(invalidJornadaDia.diaSemana));
                mostrarToast(`Preencha entrada e saida para ${dayInfo?.label || 'o dia selecionado'}.`, 'warning');
                return;
            }

            if (shouldSendJornadaSemanal) {
                body.jornadaSemanal = jornadaSemanal;
            }

            const response = await fetch(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || data?.message || 'Erro ao salvar');
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

    const PLANTAO_SABADOS_ANTERIORES = 8;
    const PLANTAO_SABADOS_POSTERIORES = 10;
    const PLANTAO_SABADOS_PASSO = 8;
    const PLANTAO_MESES_NOMES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    function criarDataLocalPlantao(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);

        if (!ano || !mes || !dia) {
            return new Date();
        }

        return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    }

    function formatarDataPlantaoCard(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-');
        return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
    }

    function ajustarAncoraSabadoPlantao(referenciaISO) {
        const data = criarDataLocalPlantao(obterDataISO(referenciaISO) || obterDataISO(new Date()));

        if (data.getDay() === 0) {
            data.setDate(data.getDate() - 1);
        }

        while (data.getDay() !== 6) {
            data.setDate(data.getDate() + 1);
        }

        return obterDataISO(data);
    }

    function obterAncoraSabadoPlantao() {
        if (!window.__plantaoSabadoAncoraISO) {
            window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(new Date());
        }

        return window.__plantaoSabadoAncoraISO;
    }

    function definirAncoraSabadoPlantao(referenciaISO) {
        window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(referenciaISO);
        return window.__plantaoSabadoAncoraISO;
    }

    function mudarPaginaSabadosPlantao(passosEmSemanas) {
        const data = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        data.setDate(data.getDate() + (Number(passosEmSemanas) || 0) * 7);
        definirAncoraSabadoPlantao(obterDataISO(data));
    }

    // Feriados cadastrados (locais) + nacionais (API), como Map ISO -> nome.
    function construirMapaFeriadosPlantao() {
        const mapa = new Map();
        const add = (dataRaw, nome) => {
            const iso = obterDataISO(dataRaw);
            if (iso) {
                mapa.set(iso, nome || 'Feriado');
            }
        };
        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : [])
            .forEach((item) => add(item.Data || item.data, item.Nome || item.nome));
        (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : [])
            .forEach((item) => add(item.date, item.name));
        return mapa;
    }

    // Tipo do plantao pela data (feriado tem prioridade sobre o dia da semana).
    // Retorna 'feriado' | 'sabado' | 'domingo' | null (dia comum).
    function resolverTipoPlantaoFront(dataISO, feriadosMap) {
        const iso = obterDataISO(dataISO);
        if (!iso) {
            return null;
        }
        const mapa = feriadosMap || construirMapaFeriadosPlantao();
        if (mapa.has(iso)) {
            return 'feriado';
        }
        const weekday = criarDataLocalPlantao(iso).getDay();
        if (weekday === 6) {
            return 'sabado';
        }
        if (weekday === 0) {
            return 'domingo';
        }
        return null;
    }

    function ehDataPlantaoValida(dataISO) {
        return resolverTipoPlantaoFront(dataISO) !== null;
    }

    function rotuloTipoPlantao(tipo, feriadoNome) {
        if (tipo === 'feriado') {
            return feriadoNome || 'Feriado';
        }
        if (tipo === 'domingo') {
            return 'Domingo';
        }
        return 'Sabado';
    }

    // Regua de datas lancaveis: sabados, domingos e feriados dentro da janela,
    // em ordem cronologica. Antes era so sabado (passos de 7 dias).
    const PLANTAO_DIAS_ANTES = 14;
    const PLANTAO_DIAS_DEPOIS = 56;

    function construirSabadosVisiveisPlantao() {
        const hojeISO = obterDataISO(new Date());
        const dataAncora = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || '');
        const feriadosMap = construirMapaFeriadosPlantao();
        const datas = [];

        for (let off = PLANTAO_DIAS_ANTES * -1; off <= PLANTAO_DIAS_DEPOIS; off += 1) {
            const data = new Date(dataAncora);
            data.setDate(data.getDate() + off);
            const dataISO = obterDataISO(data);
            const tipo = resolverTipoPlantaoFront(dataISO, feriadosMap);

            if (!tipo) {
                continue;
            }

            const feriadoNome = tipo === 'feriado' ? feriadosMap.get(dataISO) : null;
            const plantao = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO) || null;

            datas.push({
                dataISO,
                formatada: formatarDataPlantaoCard(dataISO),
                dia: String(data.getDate()).padStart(2, '0'),
                plantao,
                temPlantao: Boolean(plantao),
                isPast: dataISO < hojeISO,
                isToday: dataISO === hojeISO,
                isActive: dataFoco === dataISO,
                tipo,
                tipoLabel: rotuloTipoPlantao(tipo, feriadoNome),
                feriadoNome
            });
        }

        return datas;
    }

    // A regua cobre 10 semanas: numa grade corrida, "23" podia ser de setembro
    // ou de outubro e so dava para saber lendo a etiqueta de mes de cada card.
    // Agrupado, o mes vira cabecalho e o card so precisa do dia. Os itens ja
    // chegam em ordem cronologica, entao basta quebrar quando o ano-mes muda.
    function agruparSabadosPorMesPlantao(items) {
        const grupos = [];

        items.forEach((item) => {
            const chave = String(item.dataISO).slice(0, 7);
            const atual = grupos[grupos.length - 1];

            if (atual && atual.chave === chave) {
                atual.itens.push(item);
                return;
            }

            const [ano, mes] = chave.split('-').map(Number);

            grupos.push({
                chave,
                rotulo: `${PLANTAO_MESES_NOMES[mes - 1] || ''} de ${ano}`,
                itens: [item]
            });
        });

        return grupos;
    }

    function renderSabadosPlantaoHistorico(items) {
        if (!items.length) {
            return '<div class="empty-state">Nenhum sabado, domingo ou feriado nesta janela.</div>';
        }

        return agruparSabadosPorMesPlantao(items).map((grupo) => `
            <section class="plantao-mes">
                <h4 class="plantao-mes-titulo">
                    <span>${escapeHtml(grupo.rotulo)}</span>
                    <span class="plantao-mes-contagem">${grupo.itens.filter((item) => item.temPlantao).length}/${grupo.itens.length}</span>
                </h4>
                <div class="sabados-grid">
                    ${grupo.itens.map(renderCardSabadoPlantao).join('')}
                </div>
            </section>
        `).join('');
    }

    // Sem onclick inline: o clique ja e tratado pelo listener delegado em
    // #listaSabados (renderLancamentoPlantao). Com os dois, cada clique abria o
    // painel duas vezes em paralelo (duas buscas de disponibilidade).
    function renderCardSabadoPlantao(sabado) {
        return `
            <button
                type="button"
                class="sabado-card sabado-card--${sabado.tipo || 'sabado'} ${sabado.temPlantao ? 'lancado' : ''} ${sabado.isPast ? 'passado' : ''} ${sabado.isToday ? 'hoje' : ''} ${sabado.isActive ? 'is-active' : ''}"
                data-plantao-sabado="${sabado.dataISO}"
                title="${escapeHtml(sabado.formatada)}${sabado.feriadoNome ? ' - ' + escapeHtml(sabado.feriadoNome) : ''}${sabado.temPlantao ? ' - Plantao ja lancado' : ''}"
            >
                <div class="sabado-card-badges">
                    ${sabado.temPlantao ? '<span class="badge-plantao">Lancado</span>' : ''}
                    ${sabado.isPast ? '<span class="badge-historico">Historico</span>' : ''}
                </div>
                <div class="sabado-dia">${escapeHtml(sabado.dia)}</div>
                <div class="sabado-tipo">${escapeHtml(sabado.tipoLabel || 'Sabado')}</div>
                <div class="sabado-status">${sabado.temPlantao ? 'Clique para editar' : 'Clique para lancar'}</div>
            </button>
        `;
    }

    function atualizarSabadoSelecionadoPlantao(dataISO) {
        document.querySelectorAll('[data-plantao-sabado]').forEach((element) => {
            element.classList.toggle('is-active', element.getAttribute('data-plantao-sabado') === dataISO);
        });
    }

    async function openPlantaoEditorFromGrid(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized || typeof window.abrirEditorPlantao !== 'function') {
            return;
        }

        await window.abrirEditorPlantao(normalized, formatarDataPlantaoCard(normalized));
    }

    function resolvePlantaoWeekdayEscala(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function isPlantaoSabadoEscala(dataISO) {
        return Boolean(obterDataISO(dataISO)) && resolvePlantaoWeekdayEscala(dataISO) === 6;
    }

    window.abrirPlantaoPorData = abrirPlantaoPorData = function abrirPlantaoPorDataAtualizado(dataISO) {
        return openPlantaoEditorFromGrid(dataISO);
    };

    // ---- Abas da tela de plantoes ----
    // A aba ativa e os filtros vivem fora do render: renderLancamentoPlantao e
    // chamada de novo a cada gravacao, exclusao e passo da regua, e voltar para
    // "Lancar plantao" (ou limpar o filtro) a cada salvamento tornaria a busca
    // inutil justamente quando se esta revisando varios dias seguidos.
    const PLANTAO_FILTROS_VAZIOS = Object.freeze({
        dataInicio: '',
        dataFim: '',
        colaboradorId: '',
        tipoPlantao: 'todos',
        tipoCredito: 'todos'
    });

    let plantaoAbaAtiva = 'lancar';
    let filtrosPlantoesLancados = { ...PLANTAO_FILTROS_VAZIOS };

    function selecionarAbaPlantao(aba) {
        plantaoAbaAtiva = aba === 'lancados' ? 'lancados' : 'lancar';

        document.querySelectorAll('[data-plantao-aba]').forEach((botao) => {
            const ativa = botao.getAttribute('data-plantao-aba') === plantaoAbaAtiva;
            botao.classList.toggle('is-ativa', ativa);
            botao.setAttribute('aria-selected', ativa ? 'true' : 'false');
        });

        document.querySelectorAll('[data-plantao-painel]').forEach((painel) => {
            painel.hidden = painel.getAttribute('data-plantao-painel') !== plantaoAbaAtiva;
        });
    }

    // Turnos que a lista considera: os mesmos que a regua aceita (sabado,
    // domingo e feriado), ignorando lixo de datas que deixaram de ser validas.
    function plantoesLancadosValidos() {
        return (window.plantoesLancados || []).filter((plantao) => (
            ehDataPlantaoValida(plantao.dataISO)
            || ['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao)
        ));
    }

    // O filtro corta TURNOS, nao dias: buscar por um colaborador mostra so os
    // turnos dele, mesmo num dia em que outras pessoas tambem trabalharam.
    function filtrarPlantoesLancados(lista, filtros = filtrosPlantoesLancados) {
        return lista.filter((plantao) => {
            const dataISO = String(plantao.dataISO || '');

            if (filtros.dataInicio && dataISO < filtros.dataInicio) {
                return false;
            }

            if (filtros.dataFim && dataISO > filtros.dataFim) {
                return false;
            }

            if (filtros.tipoPlantao !== 'todos' && (plantao.tipoPlantao || 'sabado') !== filtros.tipoPlantao) {
                return false;
            }

            if (filtros.tipoCredito !== 'todos'
                && normalizarTipoCreditoPlantao(plantao.tipoCredito) !== filtros.tipoCredito) {
                return false;
            }

            if (filtros.colaboradorId
                && !(plantao.colaboradores || []).some((id) => Number(id) === Number(filtros.colaboradorId))) {
                return false;
            }

            return true;
        });
    }

    function contarPlantoesLancados(lista) {
        const dias = new Set();
        const pessoas = new Set();

        lista.forEach((plantao) => {
            dias.add(plantao.dataISO);
            (plantao.colaboradores || []).forEach((id) => pessoas.add(Number(id)));
        });

        return { dias: dias.size, turnos: lista.length, pessoas: pessoas.size };
    }

    function filtrosPlantoesAtivos(filtros = filtrosPlantoesLancados) {
        return Object.keys(PLANTAO_FILTROS_VAZIOS)
            .some((chave) => filtros[chave] !== PLANTAO_FILTROS_VAZIOS[chave]);
    }

    function lerFiltrosPlantoesLancadosUI() {
        return {
            dataInicio: document.getElementById('plantoesFiltroInicio')?.value || '',
            dataFim: document.getElementById('plantoesFiltroFim')?.value || '',
            colaboradorId: document.getElementById('plantoesFiltroColaborador')?.value || '',
            tipoPlantao: document.getElementById('plantoesFiltroTipo')?.value || 'todos',
            tipoCredito: document.getElementById('plantoesFiltroCredito')?.value || 'todos'
        };
    }

    function renderFiltrosPlantoesLancados() {
        const filtros = filtrosPlantoesLancados;
        const colaboradores = [...(window.colaboradores || [])]
            .sort((a, b) => String(a.Nome || '').localeCompare(String(b.Nome || ''), 'pt-BR'));

        const opcoes = (lista, selecionado) => lista.map(([valor, rotulo]) => `
            <option value="${escapeHtml(valor)}" ${String(selecionado) === String(valor) ? 'selected' : ''}>${escapeHtml(rotulo)}</option>
        `).join('');

        return `
            <div class="plantoes-filtros">
                <div class="plantoes-filtro">
                    <label for="plantoesFiltroInicio">De</label>
                    <input type="date" id="plantoesFiltroInicio" class="form-control" value="${escapeHtml(filtros.dataInicio)}">
                </div>
                <div class="plantoes-filtro">
                    <label for="plantoesFiltroFim">Ate</label>
                    <input type="date" id="plantoesFiltroFim" class="form-control" value="${escapeHtml(filtros.dataFim)}">
                </div>
                <div class="plantoes-filtro">
                    <label for="plantoesFiltroColaborador">Colaborador</label>
                    <select id="plantoesFiltroColaborador" class="form-control">
                        <option value="">Todos</option>
                        ${colaboradores.map((colaborador) => `
                            <option value="${colaborador.Id}" ${String(filtros.colaboradorId) === String(colaborador.Id) ? 'selected' : ''}>
                                ${escapeHtml(colaborador.Nome)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="plantoes-filtro">
                    <label for="plantoesFiltroTipo">Tipo do dia</label>
                    <select id="plantoesFiltroTipo" class="form-control">
                        ${opcoes([
                            ['todos', 'Todos'],
                            ['sabado', 'Sabado'],
                            ['domingo', 'Domingo'],
                            ['feriado', 'Feriado']
                        ], filtros.tipoPlantao)}
                    </select>
                </div>
                <div class="plantoes-filtro">
                    <label for="plantoesFiltroCredito">Destino das horas</label>
                    <select id="plantoesFiltroCredito" class="form-control">
                        ${opcoes([
                            ['todos', 'Todos'],
                            ['banco', 'Banco de horas'],
                            ['extra', 'Hora extra']
                        ], filtros.tipoCredito)}
                    </select>
                </div>
                <button type="button" id="plantoesFiltroLimpar" class="btn-secondary" ${filtrosPlantoesAtivos() ? '' : 'disabled'}>
                    <i class="fas fa-eraser"></i> Limpar
                </button>
            </div>
        `;
    }

    function atualizarContagemPlantoesLancados() {
        const todos = plantoesLancadosValidos();
        const filtrados = filtrarPlantoesLancados(todos);
        const total = contarPlantoesLancados(todos);
        const visivel = contarPlantoesLancados(filtrados);

        const badge = document.getElementById('plantaoAbaContagem');
        if (badge) {
            badge.textContent = String(total.dias);
        }

        const resumo = document.getElementById('plantoesLancadosResumo');
        if (resumo) {
            resumo.textContent = filtrosPlantoesAtivos()
                ? `${visivel.dias} de ${total.dias} dia(s) · ${visivel.turnos} turno(s) · ${visivel.pessoas} pessoa(s)`
                : `${total.dias} dia(s) · ${total.turnos} turno(s) · ${total.pessoas} pessoa(s)`;
        }

        const limpar = document.getElementById('plantoesFiltroLimpar');
        if (limpar) {
            limpar.disabled = !filtrosPlantoesAtivos();
        }
    }

    function aplicarFiltrosPlantoesLancados() {
        filtrosPlantoesLancados = lerFiltrosPlantoesLancadosUI();
        atualizarResumoPlantaoNaTela();
    }

    function limparFiltrosPlantoesLancados() {
        filtrosPlantoesLancados = { ...PLANTAO_FILTROS_VAZIOS };

        const container = document.querySelector('.plantoes-filtros');
        if (container) {
            container.outerHTML = renderFiltrosPlantoesLancados();
            ligarFiltrosPlantoesLancados();
        }

        atualizarResumoPlantaoNaTela();
    }

    function ligarFiltrosPlantoesLancados() {
        ['plantoesFiltroInicio', 'plantoesFiltroFim'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', aplicarFiltrosPlantoesLancados);
        });

        ['plantoesFiltroColaborador', 'plantoesFiltroTipo', 'plantoesFiltroCredito'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', aplicarFiltrosPlantoesLancados);
        });

        document.getElementById('plantoesFiltroLimpar')?.addEventListener('click', limparFiltrosPlantoesLancados);
    }

    function atualizarResumoPlantaoNaTela() {
        const container = document.getElementById('listaPlantoesLancados');

        if (!container || typeof renderPlantoesLancados !== 'function') {
            return;
        }

        container.innerHTML = renderPlantoesLancados();
        atualizarContagemPlantoesLancados();
    }

    // Um dia pode ter varios turnos, e cada turno e uma linha da tabela. O card
    // e do DIA: junta os turnos daquela data e mostra cada um como uma faixa.
    window.renderPlantoesLancados = renderPlantoesLancados = function renderPlantoesLancadosAvancado(filtros) {
            if (!window.plantoesLancados || window.plantoesLancados.length === 0) {
                return '<div class="empty-state">Nenhum plantao lancado ainda</div>';
            }

            const lancados = plantoesLancadosValidos();

            if (lancados.length === 0) {
                return '<div class="empty-state">Nenhum plantao de sabado, domingo ou feriado lancado ainda</div>';
            }

            const validos = filtrarPlantoesLancados(lancados, filtros || filtrosPlantoesLancados);

            if (validos.length === 0) {
                return '<div class="empty-state">Nenhum plantao encontrado com esses filtros. Ajuste o periodo, o colaborador ou o destino das horas.</div>';
            }

            const porData = new Map();

            for (const plantao of validos) {
                if (!porData.has(plantao.dataISO)) {
                    porData.set(plantao.dataISO, []);
                }

                porData.get(plantao.dataISO).push(plantao);
            }

            const dias = [...porData.entries()]
                .sort((a, b) => new Date(b[0]) - new Date(a[0]));

            return dias.map(([dataISO, turnos]) => {
                const ordenados = [...turnos].sort((a, b) => (
                    String(formatarHoraInput(a.horaInicio) || '').localeCompare(String(formatarHoraInput(b.horaInicio) || ''))
                ));
                const tipoPlantao = ordenados[0]?.tipoPlantao || 'sabado';
                const observacao = ordenados.find((item) => item.observacao)?.observacao || '';
                const pessoas = new Set(ordenados.flatMap((item) => item.colaboradores || [])).size;

                const totais = ordenados.reduce((acumulado, item) => {
                    const chave = normalizarTipoCreditoPlantao(item.tipoCredito);
                    const minutos = duracaoLancamentoPlantao({
                        horaInicio: formatarHoraInput(item.horaInicio),
                        horaFim: formatarHoraInput(item.horaFim)
                    }) || 0;

                    acumulado[chave] += minutos * (item.colaboradores || []).length;
                    return acumulado;
                }, { banco: 0, extra: 0 });

                const turnosHtml = ordenados.map((item) => {
                    const chave = normalizarTipoCreditoPlantao(item.tipoCredito);
                    const meta = PLANTAO_CREDITO_META[chave];

                    return `
                        <div class="plantao-turno">
                            <span class="plantao-turno-hora">
                                <i class="fas fa-clock"></i>
                                ${escapeHtml(formatarHoraInput(item.horaInicio) || '--:--')} - ${escapeHtml(formatarHoraInput(item.horaFim) || '--:--')}
                            </span>
                            <span class="plantao-lancamento-credito plantao-credito--${chave}">
                                <i class="fas ${meta.icone}"></i> ${escapeHtml(meta.curto)}
                            </span>
                            <div class="plantao-colaboradores">
                                ${renderColaboradoresPlantao(item.colaboradores)}
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="plantao-card">
                        <div class="plantao-header">
                            <div>
                                <div class="plantao-data">${escapeHtml(formatarDataPtBr(dataISO))}</div>
                                <div class="plantao-meta">
                                    <span><i class="fas fa-calendar-week"></i> ${escapeHtml(tipoPlantao.charAt(0).toUpperCase() + tipoPlantao.slice(1))}</span>
                                    <span><i class="fas fa-list-check"></i> ${ordenados.length} turno(s) &middot; ${pessoas} pessoa(s)</span>
                                    ${totais.banco > 0 ? `<span><i class="fas fa-piggy-bank"></i> ${escapeHtml(minutosParaTexto(totais.banco))} em banco</span>` : ''}
                                    ${totais.extra > 0 ? `<span><i class="fas fa-money-bill-wave"></i> ${escapeHtml(minutosParaTexto(totais.extra))} em hora extra</span>` : ''}
                                </div>
                            </div>
                            <div class="plantao-actions">
                                <button type="button" data-plantao-editar="${dataISO}" class="btn-icon-sm edit" title="Editar dia" aria-label="Editar plantao de ${escapeHtml(formatarDataPtBr(dataISO))}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="excluirPlantao('${dataISO}')" class="btn-icon-sm delete" title="Excluir dia" aria-label="Excluir plantao de ${escapeHtml(formatarDataPtBr(dataISO))}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${observacao ? `<p class="plantao-observacao">${escapeHtml(observacao)}</p>` : ''}
                        <div class="plantao-turnos">${turnosHtml}</div>
                    </div>
                `;
            }).join('');
        };

    window.carregarPlantoesLancadosNaTela = carregarPlantoesLancadosNaTela = function carregarPlantoesLancadosNaTelaAtualizado() {
        atualizarResumoPlantaoNaTela();
    };

    // Garante os feriados NACIONAIS dos anos da janela em window.feriadosAPI.
    // carregarFeriadosAPI substitui a lista a cada chamada, entao aqui juntamos
    // os anos manualmente (dedup por data).
    async function garantirFeriadosApiPlantao(anos) {
        const porData = new Map(
            (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : [])
                .filter((item) => item && item.date)
                .map((item) => [item.date, item])
        );

        for (const ano of anos) {
            try {
                const lista = await window.buscarFeriadosNacionais(ano);
                (Array.isArray(lista) ? lista : []).forEach((item) => {
                    if (item && item.date) {
                        porData.set(item.date, item);
                    }
                });
            } catch (error) {
                // Servidor/API fora do ar: segue com os feriados locais/ja carregados.
            }
        }

        window.feriadosAPI = [...porData.values()];
    }

    window.renderLancamentoPlantao = renderLancamentoPlantao = async function renderLancamentoPlantaoAtualizado() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        const anoInicio = new Date().getFullYear();
        const anoFim = criarDataLocalPlantao(
            obterDataISO(new Date(Date.now() + PLANTAO_DIAS_DEPOIS * 86400000))
        ).getFullYear();
        const anosJanela = anoFim > anoInicio ? [anoInicio, anoFim] : [anoInicio];

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([]),
            typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null),
            typeof carregarFeriadosLocais === 'function' ? carregarFeriadosLocais() : Promise.resolve([]),
            garantirFeriadosApiPlantao(anosJanela)
        ]);

        window.plantoesLancados = (window.plantoesLancados || []).filter((plantao) => ehDataPlantaoValida(plantao.dataISO) || ['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao));

        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || getPlantaoEditorState()?.dataISO || '');
        definirAncoraSabadoPlantao(dataFoco || obterAncoraSabadoPlantao());

        const sabados = construirSabadosVisiveisPlantao();
        const primeiraData = sabados[0]?.formatada || '--';
        const ultimaData = sabados[sabados.length - 1]?.formatada || '--';

        appContent.innerHTML = `
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-calendar-plus"></i> Plantoes</h1>
                    <p>Lance plantoes de sabado, domingo e feriado. Clique numa data para abrir ou editar o registro.</p>
                </div>
            </div>

            <div class="plantao-abas" role="tablist">
                <button type="button" class="plantao-aba" data-plantao-aba="lancar" role="tab" aria-selected="true">
                    <i class="fas fa-calendar-day"></i> Lancar plantao
                </button>
                <button type="button" class="plantao-aba" data-plantao-aba="lancados" role="tab" aria-selected="false">
                    <i class="fas fa-list"></i> Plantoes lancados
                    <span class="plantao-aba-contagem" id="plantaoAbaContagem">0</span>
                </button>
            </div>

            <div class="plantao-layout">
                <div class="plantao-abas-conteudo">
                    <div class="sabados-container" data-plantao-painel="lancar">
                        <div class="sabados-header">
                            <div>
                                <h3><i class="fas fa-calendar-day"></i> Datas disponiveis</h3>
                                <p class="sabados-subtitle">Sabados, domingos e feriados &middot; ${escapeHtml(primeiraData)} ate ${escapeHtml(ultimaData)}</p>
                            </div>
                            <div class="sabados-nav">
                                <button type="button" class="btn-secondary" id="plantaoAnteriorBtn">
                                    <i class="fas fa-arrow-left"></i> Anteriores
                                </button>
                                <button type="button" class="btn-secondary" id="plantaoHojeBtn">
                                    <i class="fas fa-bullseye"></i> Atual
                                </button>
                                <button type="button" class="btn-secondary" id="plantaoProximoBtn">
                                    Proximos <i class="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>

                        <div class="sabados-regua" id="listaSabados">
                            ${renderSabadosPlantaoHistorico(sabados)}
                        </div>
                    </div>

                    <div class="plantoes-lancados-container" data-plantao-painel="lancados" hidden>
                        <div class="plantoes-lancados-header">
                            <div>
                                <h3><i class="fas fa-list"></i> Plantoes lancados</h3>
                                <p class="sabados-subtitle">Filtre os lancamentos e clique em editar para abrir o dia no painel ao lado.</p>
                            </div>
                            <span class="plantoes-lancados-resumo" id="plantoesLancadosResumo"></span>
                        </div>
                        ${renderFiltrosPlantoesLancados()}
                        <div id="listaPlantoesLancados" class="plantoes-grid">
                            ${renderPlantoesLancados()}
                        </div>
                    </div>
                </div>

                <div id="plantaoEditor" class="editor-sidebar" style="display: none;">
                    <div class="editor-content">
                        <div class="editor-header">
                            <div class="editor-header-titulo">
                                <h3><i class="fas fa-clock"></i> <span id="plantaoDataTitle">Selecione uma data</span></h3>
                                <div id="plantaoEditorSubtitulo" class="editor-header-chips"></div>
                            </div>
                            <button onclick="fecharPlantaoEditor()" class="btn-close-editor" aria-label="Fechar painel">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="plantaoEditorContent" class="editor-form">
                            <div class="editor-empty">
                                <i class="fas fa-hand-pointer"></i>
                                <p>Escolha uma data para abrir o plantao, montar os turnos do dia e definir o que vai para o banco de horas.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('plantaoAnteriorBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO * -1);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoHojeBtn')?.addEventListener('click', () => {
            definirAncoraSabadoPlantao(new Date());
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoProximoBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.querySelectorAll('[data-plantao-aba]').forEach((botao) => {
            botao.addEventListener('click', () => selecionarAbaPlantao(botao.getAttribute('data-plantao-aba')));
        });

        selecionarAbaPlantao(plantaoAbaAtiva);
        ligarFiltrosPlantoesLancados();
        atualizarContagemPlantoesLancados();

        // Editar pela lista abre o mesmo painel lateral da regua. O painel e
        // sticky, mas numa tela estreita ele cai abaixo da lista: sem o scroll
        // o clique parece nao ter feito nada.
        document.getElementById('listaPlantoesLancados')?.addEventListener('click', async (event) => {
            const trigger = event.target.closest('[data-plantao-editar]');

            if (!trigger) {
                return;
            }

            await openPlantaoEditorFromGrid(trigger.getAttribute('data-plantao-editar'));

            const editorPanel = document.getElementById('plantaoEditor');

            if (editorPanel && editorPanel.style.display !== 'none') {
                editorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        document.getElementById('listaSabados')?.addEventListener('click', async (event) => {
            const trigger = event.target.closest('[data-plantao-sabado]');

            if (!trigger) {
                return;
            }

            const dataISO = trigger.getAttribute('data-plantao-sabado');
            await openPlantaoEditorFromGrid(dataISO);
        });

        if (dataFoco) {
            await openPlantaoEditorFromGrid(dataFoco);
        } else {
            const editorPanel = document.getElementById('plantaoEditor');

            setPlantaoEditorState(null);

            if (editorPanel) {
                editorPanel.style.display = 'none';
            }
        }
    };

    window.abrirEditorPlantao = abrirEditorPlantao = async function abrirEditorPlantaoAvancado(dataISO, dataFormatada) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            window.__plantaoDataFocoISO = dataISO;

            if (typeof renderLancamentoPlantao === 'function') {
                await renderLancamentoPlantao();
            }

            return;
        }

        window.__plantaoDataFocoISO = dataISO;
        definirAncoraSabadoPlantao(dataISO);
        atualizarSabadoSelecionadoPlantao(dataISO);

        if (!ehDataPlantaoValida(dataISO)) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Plantao so pode ser lancado em sabado, domingo ou feriado.', 'warning');
            }
            return;
        }

        const registrosDoDia = (window.plantoesLancados || []).filter((item) => item.dataISO === dataISO);
        const lancamentos = lancamentosDoDiaPlantao(dataISO);
        // O ultimo turno gravado vira o padrao do formulario: quase sempre a
        // proxima pessoa lancada entra no mesmo horario.
        const ultimo = lancamentos[lancamentos.length - 1] || null;

        const state = setPlantaoEditorState({
            dataISO,
            dataFormatada,
            tipoPlantao: resolverTipoPlantaoFront(dataISO) || 'sabado',
            observacao: registrosDoDia.find((item) => item.observacao)?.observacao || '',
            lancamentos,
            editandoIndice: null,
            rascunho: {
                colaboradorId: 0,
                horaInicio: ultimo?.horaInicio || '',
                horaFim: ultimo?.horaFim || '',
                tipoCredito: ultimo?.tipoCredito || 'banco'
            },
            disponibilidade: []
        });

        renderPlantaoEditor(state);
        await carregarDisponibilidadePlantao(state);
        renderPlantaoEditor(state);
        atualizarSabadoSelecionadoPlantao(dataISO);
    };

    window.fecharPlantaoEditor = fecharPlantaoEditor = function fecharPlantaoEditorAtualizado() {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorContent = document.getElementById('plantaoEditorContent');

        window.__plantaoDataFocoISO = null;
        setPlantaoEditorState(null);
        atualizarSabadoSelecionadoPlantao(null);

        if (editorContent) {
            editorContent.innerHTML = `
                <div class="editor-empty">
                    <i class="fas fa-hand-pointer"></i>
                    <p>Escolha uma data para abrir o plantao, montar os turnos do dia e definir o que vai para o banco de horas.</p>
                </div>
            `;
        }

        const editorSubtitulo = document.getElementById('plantaoEditorSubtitulo');

        if (editorSubtitulo) {
            editorSubtitulo.innerHTML = '';
        }

        if (editorPanel) {
            editorPanel.style.display = 'none';
        }
    };

    window.salvarPlantao = salvarPlantao = async function salvarPlantaoAvancado(dataISO) {
        const state = getPlantaoEditorState();

        if (!state || state.dataISO !== dataISO) {
            mostrarToast('Abra a data novamente antes de salvar.', 'error');
            return;
        }

        capturarRascunhoPlantao(state);

        if (!ehDataPlantaoValida(dataISO)) {
            mostrarToast('Plantao so pode ser lancado em sabado, domingo ou feriado.', 'warning');
            return;
        }

        if (Number.isInteger(state.editandoIndice)) {
            mostrarToast('Termine (ou cancele) a edicao do lancamento antes de salvar o dia.', 'warning');
            return;
        }

        // Salvar um dia sem nenhuma linha equivale a apagar o dia — mas isso e
        // destrutivo demais para acontecer por engano no botao de salvar.
        if (state.lancamentos.length === 0) {
            mostrarToast('Adicione pelo menos um lancamento. Para limpar o dia, use "Excluir dia".', 'error');
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.salvarPlantao({
                dataISO,
                tipoPlantao: resolverTipoPlantaoFront(dataISO) || 'sabado',
                observacao: state.observacao || '',
                lancamentos: state.lancamentos.map((linha) => ({
                    colaboradorId: linha.colaboradorId,
                    horaInicio: linha.horaInicio,
                    horaFim: linha.horaFim,
                    tipoCredito: linha.tipoCredito
                }))
            });

            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao salvo com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao salvar plantao: ${error.message}`, 'error');
        }
    };

    window.excluirPlantao = async function excluirPlantaoAvancado(dataISO) {
        if (!window.confirm('Tem certeza que deseja excluir este plantao?')) {
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.excluirPlantao(dataISO);
            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao excluido com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao excluir plantao: ${error.message}`, 'error');
        }
    };

    if (typeof editarLancamento === 'function') {
        const originalEditarLancamento = editarLancamento;

        window.editarLancamento = editarLancamento = function editarLancamentoComBancoHoras(tipo, id) {
            originalEditarLancamento(tipo, id);

            if (tipo === 'feriado') {
                aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
                return;
            }

            const item = (window.ausencias || []).find((ausencia) => Number(ausencia.id || ausencia.Id) === Number(id));

            if (!item) {
                return;
            }

            preencherBancoHorasLancamento(item);
        };
    }

    if (typeof cancelarEdicaoLancamento === 'function') {
        const originalCancelarEdicaoLancamento = cancelarEdicaoLancamento;

        window.cancelarEdicaoLancamento = cancelarEdicaoLancamento = function cancelarEdicaoLancamentoComBancoHoras() {
            originalCancelarEdicaoLancamento();
            resetBancoHorasLancamento();
        };
    }

    window.salvarAusencia = salvarAusencia = async function salvarAusenciaComBancoHoras(tipo, dataInicio, dataFim) {
        const colaboradorId = document.getElementById('colaboradorSelect')?.value;
        const periodoTipo = document.getElementById('periodoTipo')?.value || 'dia_inteiro';
        const horaInicio = document.getElementById('horaInicio')?.value || '';
        const horaFim = document.getElementById('horaFim')?.value || '';
        // Sem o `|| 'comum'` que havia aqui: para Folga e Ferias o campo fica
        // escondido e o subtipo e derivado do tipo. Mandar 'comum' na mao
        // atropelava o resolveDefaultSubtipo do backend, que grava
        // 'folga'/'ferias'. Vazio vira undefined, sai do JSON e o backend decide.
        const subtipo = document.getElementById('ausenciaSubtipo')?.value || undefined;
        const descontaBancoHoras = document.getElementById('descontaBancoHoras')?.checked ?? true;
        const observacao = document.getElementById('observacaoLancamento')?.value || '';

        if (!colaboradorId) {
            throw new Error('Selecione um colaborador.');
        }

        if (periodoTipo === 'horas') {
            if (!horaInicio || !horaFim) {
                throw new Error('Preencha as horas de inicio e fim.');
            }

            if (horaFim <= horaInicio) {
                throw new Error('Hora final deve ser maior que a hora inicial.');
            }
        }

        const dados = {
            id: editandoTipoLancamento === 'pessoal' ? editandoLancamentoId : undefined,
            colaboradorId: Number(colaboradorId),
            tipo,
            dataInicio,
            dataFim,
            periodoTipo,
            subtipo,
            descontaBancoHoras,
            observacao
        };

        if (periodoTipo === 'horas') {
            dados.horaInicio = horaInicio;
            dados.horaFim = horaFim;
        }

        return window.API.salvarAusencia(dados);
    };

    document.addEventListener('click', (event) => {
        if (event.target.closest('#fecharModalBancoHorasBtn')) {
            fecharModalSeguro('modalBancoHoras');
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target.id === 'tipoLancamento') {
            aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
        }

        if (event.target.id === 'ausenciaSubtipo') {
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }

        if (event.target.id === 'descontaBancoHoras') {
            event.target.dataset.manualOverride = 'true';
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }
    });

    const atualizarTudoBase = window.atualizarTudo;

    window.atualizarTudo = atualizarTudo = async function atualizarTudoComBancoHoras(options = {}) {
        if (typeof atualizarTudoBase === 'function') {
            await atualizarTudoBase({ ...options, silent: true });
        }

        await Promise.allSettled([
            carregarBancoHorasResumo()
        ]);

        if (document.getElementById('listaColaboradores') && typeof renderListaColaboradores === 'function') {
            const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
            const lista = termoBusca
                ? (window.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
                : (window.colaboradores || []);

            renderListaColaboradores(lista);
        }

        if (document.getElementById('listaPlantoesLancados') && typeof carregarPlantoesLancadosNaTela === 'function') {
            carregarPlantoesLancadosNaTela();
        }

        if (!options.silent && typeof mostrarToast === 'function') {
            mostrarToast('Dados atualizados!', 'success');
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        carregarBancoHorasResumo()
            .then(() => {
                if (isColaboradoresScreenVisible() && typeof renderListaColaboradores === 'function') {
                    renderListaColaboradores();
                }
            })
            .catch(() => {});
    });

    setTimeout(() => {
        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }, 0);
})();


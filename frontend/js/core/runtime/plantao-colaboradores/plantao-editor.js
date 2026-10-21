import { escapeHtml } from '../../../lib/html-seguro.js';
import { bindPainelFolgasDomingo, renderPainelFolgasDomingo } from '../../../telas/folgas-domingo.js';
import { API } from '../../api.js';
import { formatarHora, mostrarToast } from '../../app/horas-e-resumo.js';
import { estado } from '../../estado.js';
import { getMeusSetores } from '../../meus-setores.js';
import { abrirExtratoBancoHoras, renderCardBancoHoras, renderResumoBancoHorasAviso } from './banco-horas-lancamento.js';
import { abrirEditorColaboradores } from './colaboradores-e-jornada.js';
import { formatarHoraInput, getPlantaoEditorState, mapBancoHorasResumo, minutosParaTexto, withInFlight } from './helpers.js';
import { construirMapaFeriadosPlantao, rotuloTipoPlantao } from './plantao-regua-e-relatorios.js';
import { atributosAcao } from '../../../lib/atributos-acao.js';

// Aplica "Meus setores" a lista do checklist, mas SEMPRE mantem quem ja
// esta selecionado (mesmo de outro setor). Sem isso, abrir um plantao com
// equipe de outro setor e salvar dropava esses membros — o salvar so le os
// checkboxes visiveis e marcados. Preferencia vazia = todos.
let disponibilidadeTimer = null;

function filtrarChecklistPorMeusSetoresPlantao(lista, selecionados = []) {
    const base = Array.isArray(lista) ? lista : [];
    const meusSetores = getMeusSetores();

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
export const PLANTAO_CREDITO_META = {
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

export function normalizarTipoCreditoPlantao(valor) {
    return String(valor || '').trim().toLowerCase() === 'extra' ? 'extra' : 'banco';
}

// Tipo do lancamento (campo "Tipo"): o plantao regular do dia — que e sempre o
// proprio tipo do dia (sabado, domingo ou feriado) — ou o horario adicional
// que cobre o almoco do plantonista. Espelha CK_plantoes_tipo_lancamento.
const PLANTAO_TIPO_COBERTURA_ALMOCO = 'cobertura_almoco';

export const PLANTAO_TIPO_LANCAMENTO_META = {
    sabado: { label: 'Sabado', icone: 'fa-calendar-day' },
    domingo: { label: 'Domingo', icone: 'fa-calendar-day' },
    feriado: { label: 'Feriado', icone: 'fa-star' },
    [PLANTAO_TIPO_COBERTURA_ALMOCO]: {
        label: 'Cobertura de almoco',
        icone: 'fa-utensils',
        ajuda: 'Horario adicional para cobrir o almoco do plantonista.'
    }
};

// Qualquer valor que nao seja cobertura vira o tipo do dia: registro antigo,
// sem a coluna, e dia que passou a ser feriado depois do lancamento continuam
// salvando sem o backend recusar a combinacao.
export function normalizarTipoLancamentoPlantao(valor, tipoDia) {
    return String(valor || '').trim().toLowerCase() === PLANTAO_TIPO_COBERTURA_ALMOCO
        ? PLANTAO_TIPO_COBERTURA_ALMOCO
        : (PLANTAO_TIPO_LANCAMENTO_META[tipoDia] ? tipoDia : 'sabado');
}

function ajudaTipoLancamentoPlantao(tipo) {
    return PLANTAO_TIPO_LANCAMENTO_META[tipo]?.ajuda || 'Plantao regular do dia.';
}

function nomeColaboradorPlantao(colaboradorId) {
    const colaborador = (estado.colaboradores || [])
        .find((item) => Number(item.Id) === Number(colaboradorId));

    return colaborador ? colaborador.Nome : 'Colaborador removido';
}

function minutosDoHorarioPlantao(hora) {
    const [h, m] = String(hora || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? (h * 60) + m : null;
}

export function duracaoLancamentoPlantao(linha) {
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
export function lancamentosDoDiaPlantao(dataISO) {
    const linhas = [];

    (estado.plantoesLancados || [])
        .filter((item) => item.dataISO === dataISO)
        .forEach((registro) => {
            const horaInicio = formatarHoraInput(registro.horaInicio) || '';
            const horaFim = formatarHoraInput(registro.horaFim) || '';
            const tipoCredito = normalizarTipoCreditoPlantao(registro.tipoCredito);
            const tipoLancamento = normalizarTipoLancamentoPlantao(registro.tipoLancamento, registro.tipoPlantao);

            (registro.colaboradores || []).forEach((colaboradorId) => {
                linhas.push({
                    colaboradorId: Number(colaboradorId),
                    horaInicio,
                    horaFim,
                    tipoCredito,
                    tipoLancamento
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
export function capturarRascunhoPlantao(state) {
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
        tipoCredito: normalizarTipoCreditoPlantao(state?.rascunho?.tipoCredito),
        tipoLancamento: normalizarTipoLancamentoPlantao(state?.rascunho?.tipoLancamento, state?.tipoPlantao)
    };
}

// Troca o destino das horas sem redesenhar o painel: um render completo aqui
// roubaria o foco de quem esta no meio do preenchimento.
export function definirTipoCreditoPlantao(tipo) {
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
}

// Mesmo esquema do destino das horas: troca o tipo sem redesenhar o painel.
export function definirTipoLancamentoPlantao(tipo) {
    const state = getPlantaoEditorState();

    if (!state) {
        return;
    }

    const escolhido = normalizarTipoLancamentoPlantao(tipo, state.tipoPlantao);
    state.rascunho = state.rascunho || {};
    state.rascunho.tipoLancamento = escolhido;

    document.querySelectorAll('[data-plantao-tipo-lancamento]').forEach((botao) => {
        const ativo = botao.getAttribute('data-plantao-tipo-lancamento') === escolhido;
        botao.classList.toggle('is-active', ativo);
        botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });

    const ajuda = document.getElementById('plantaoTipoLancamentoAjuda');

    if (ajuda) {
        ajuda.textContent = ajudaTipoLancamentoPlantao(escolhido);
    }
}

export function confirmarLancamentoPlantao() {
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

    // Mantem horario, destino e tipo para encadear varios colaboradores no
    // mesmo turno; so o colaborador volta ao vazio.
    state.editandoIndice = null;
    state.rascunho = {
        colaboradorId: 0,
        horaInicio: nova.horaInicio,
        horaFim: nova.horaFim,
        tipoCredito: nova.tipoCredito,
        tipoLancamento: nova.tipoLancamento
    };

    renderPlantaoEditor(state);
    document.getElementById('plantaoNovoColaborador')?.focus();
}

export function editarLancamentoPlantao(indice) {
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
}

export function cancelarEdicaoLancamentoPlantao() {
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
        tipoCredito: normalizarTipoCreditoPlantao(state.rascunho?.tipoCredito),
        tipoLancamento: normalizarTipoLancamentoPlantao(state.rascunho?.tipoLancamento, state.tipoPlantao)
    };

    renderPlantaoEditor(state);
}

export function removerLancamentoPlantao(indice) {
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
}

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
        const tipoLancamento = normalizarTipoLancamentoPlantao(linha.tipoLancamento, state.tipoPlantao);
        const metaTipo = PLANTAO_TIPO_LANCAMENTO_META[tipoLancamento];
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
                            <span class="plantao-lancamento-credito plantao-tipo-lancamento--${tipoLancamento}">
                                <i class="fas ${metaTipo.icone}"></i> ${escapeHtml(metaTipo.label)}
                            </span>
                        </div>
                        <div class="plantao-lancamento-nome">
                            ${escapeHtml(nome)}
                            ${indisponivel ? '<small class="status-indisponivel">Indisponivel</small>' : ''}
                        </div>
                    </div>
                    <div class="plantao-lancamento-acoes">
                        <span class="plantao-lancamento-duracao">${minutos ? escapeHtml(minutosParaTexto(minutos)) : '--'}</span>
                        <button type="button" class="btn-icon-sm edit" title="Editar lancamento" aria-label="Editar lancamento de ${escapeHtml(nome)}" ${atributosAcao('editarLancamentoPlantao', indice)}>
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-icon-sm delete" title="Remover lancamento" aria-label="Remover lancamento de ${escapeHtml(nome)}" ${atributosAcao('removerLancamentoPlantao', indice)}>
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
        Array.isArray(estado.colaboradores) ? estado.colaboradores : [],
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

export async function carregarDisponibilidadePlantao(state) {
    try {
        const response = await API.getPlantaoDisponibilidade(state.dataISO, {
            horaInicio: state.rascunho?.horaInicio || undefined,
            horaFim: state.rascunho?.horaFim || undefined
        });

        state.disponibilidade = Array.isArray(response?.colaboradores) ? response.colaboradores : [];
    } catch (error) {
        // Sem a checagem, a lista segue aberta para o lancamento nao travar,
        // mas o usuario precisa saber: quem estiver de folga ou ausente so
        // sera barrado pelo servidor na hora de salvar.
        console.error('[plantao] falha ao verificar disponibilidade:', error);
        mostrarToast('Nao foi possivel verificar a disponibilidade agora. O servidor confere ao salvar.', 'warning');
        state.disponibilidade = (estado.colaboradores || []).map((item) => ({
            id: item.Id,
            nome: item.Nome,
            disponivel: true,
            motivoLabel: null
        }));
    }

    return state;
}

export function renderPlantaoEditor(state) {
    const editorPanel = document.getElementById('plantaoEditor');
    const editorTitle = document.getElementById('plantaoDataTitle');
    const editorContent = document.getElementById('plantaoEditorContent');

    if (!editorPanel || !editorTitle || !editorContent) {
        return;
    }

    const tipo = state.tipoPlantao || 'sabado';
    const rotuloTipo = rotuloTipoPlantao(tipo, construirMapaFeriadosPlantao().get(state.dataISO));
    const jaLancado = (estado.plantoesLancados || []).some((item) => item.dataISO === state.dataISO);
    const editando = Number.isInteger(state.editandoIndice);
    const tipoCredito = normalizarTipoCreditoPlantao(state.rascunho?.tipoCredito);
    const tipoLancamento = normalizarTipoLancamentoPlantao(state.rascunho?.tipoLancamento, tipo);
    // Num dia so cabem dois tipos: o plantao regular daquele dia e a cobertura.
    const opcoesTipoLancamento = [tipo, PLANTAO_TIPO_COBERTURA_ALMOCO];

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
                                ${atributosAcao('definirTipoCreditoPlantao', chave)}
                            >
                                <i class="fas ${meta.icone}"></i> ${escapeHtml(meta.label)}
                            </button>
                        `).join('')}
                    </div>
                    <small class="helper-text" id="plantaoCreditoAjuda">${escapeHtml(PLANTAO_CREDITO_META[tipoCredito].ajuda)}</small>

                    <span class="plantao-campo-rotulo" id="plantaoTipoLancamentoRotulo">Tipo</span>
                    <div class="plantao-credito-escolha plantao-tipo-lancamento-escolha" role="group" aria-labelledby="plantaoTipoLancamentoRotulo">
                        ${opcoesTipoLancamento.map((chave) => `
                            <button
                                type="button"
                                class="plantao-credito-opcao plantao-tipo-lancamento--${chave}${chave === tipoLancamento ? ' is-active' : ''}"
                                data-plantao-tipo-lancamento="${chave}"
                                aria-pressed="${chave === tipoLancamento ? 'true' : 'false'}"
                                ${atributosAcao('definirTipoLancamentoPlantao', chave)}
                            >
                                <i class="fas ${PLANTAO_TIPO_LANCAMENTO_META[chave].icone}"></i> ${escapeHtml(PLANTAO_TIPO_LANCAMENTO_META[chave].label)}
                            </button>
                        `).join('')}
                    </div>
                    <small class="helper-text" id="plantaoTipoLancamentoAjuda">${escapeHtml(ajudaTipoLancamentoPlantao(tipoLancamento))}</small>

                    <div class="plantao-form-acoes">
                        <button type="button" class="btn-primary" ${atributosAcao('confirmarLancamentoPlantao')}>
                            <i class="fas ${editando ? 'fa-check' : 'fa-plus'}"></i>
                            ${editando ? 'Salvar lancamento' : 'Adicionar ao dia'}
                        </button>
                        ${editando ? `
                            <button type="button" class="btn-secondary" ${atributosAcao('cancelarEdicaoLancamentoPlantao')}>
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
                    <button type="button" ${atributosAcao('salvarPlantao', state.dataISO)} class="btn-primary">
                        <i class="fas fa-save"></i> ${jaLancado ? 'Salvar alteracoes' : 'Salvar dia'}
                    </button>
                    <button type="button" ${atributosAcao('fecharPlantaoEditor')} class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    ${jaLancado ? `
                        <button type="button" ${atributosAcao('excluirPlantao', state.dataISO)} class="btn-danger-ghost" title="Excluir todos os lancamentos do dia">
                            <i class="fas fa-trash"></i> Excluir dia
                        </button>
                    ` : ''}
                </div>

                ${renderPainelFolgasDomingo(state.dataISO)}
            </div>
        `;

    // Depois do innerHTML: o painel de folga liga os proprios eventos e
    // busca a lista dele. Em dia que nao e domingo ele nao renderiza nada
    // e esta chamada sai na hora.
    bindPainelFolgasDomingo(state.dataISO);

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
                confirmarLancamentoPlantao();
            }
        });
    });
}

export function carregarBancoHorasResumo() {
    return withInFlight('banco-horas-resumo', async () => {
        let items = [];
        let status = { enabled: true, message: null };

        try {
            const payload = await API.getBancoHorasResumo();
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

        estado.bancoHorasResumo = items;
        estado.bancoHorasStatus = status;

        // Saldo "atual" do cadastro = ultimo lancamento da grade semanal
        // (BancoHorasSemanal), para bater com a tela de Banco de Horas.
        try {
            const saldosPayload = await API.getBancoHorasSaldosSemanais();
            const mapa = {};
            (saldosPayload?.saldos || []).forEach((saldo) => {
                mapa[Number(saldo.colaboradorId)] = saldo;
            });
            estado.bancoHorasSaldoSemanal = mapa;
        } catch (error) {
            estado.bancoHorasSaldoSemanal = estado.bancoHorasSaldoSemanal || {};
        }

        return { items, status };
    });
}

export function renderListaColaboradores(lista = estado.colaboradores || []) {
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

                abrirEditorColaboradores(colaboradorId);
            });
        });

        container.querySelectorAll('[data-extrato-colaborador]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                abrirExtratoBancoHoras(button.dataset.extratoColaborador);
            });
        });
    }

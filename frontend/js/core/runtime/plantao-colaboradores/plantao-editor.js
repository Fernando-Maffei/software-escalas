import { escapeHtml } from '../../../lib/html-seguro.js';
import { bindPainelFolgasDomingo, folgaDomingoPrecisaAbrir, renderPainelFolgasDomingo } from '../../../telas/folgas-domingo.js';
import { API } from '../../api.js';
import { formatarHora, mostrarToast } from '../../app/horas-e-resumo.js';
import { estado } from '../../estado.js';
import { getMeusSetores } from '../../meus-setores.js';
import { abrirExtratoBancoHoras, renderCardBancoHoras, renderResumoBancoHorasAviso } from './banco-horas-lancamento.js';
import { abrirEditorColaboradores } from './colaboradores-e-jornada.js';
import { formatarHoraInput, getPlantaoEditorState, mapBancoHorasResumo, minutosParaTexto, withInFlight } from './helpers.js';
import { construirMapaFeriadosPlantao, rotuloTipoPlantao } from './plantao-regua-e-relatorios.js';
import { atributosAcao } from '../../../lib/atributos-acao.js';
import { aplicarBuscaNosSelects } from '../../select-com-busca.js';

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
        icone: 'fa-piggy-bank'
    },
    extra: {
        label: 'Hora extra',
        curto: 'Extra',
        icone: 'fa-money-bill-wave'
    }
};

export function normalizarTipoCreditoPlantao(valor) {
    return String(valor || '').trim().toLowerCase() === 'extra' ? 'extra' : 'banco';
}

// Tipo do lancamento (campo "Tipo"): Plantao ou Cobertura de almoco (horario
// adicional que cobre o almoco do plantonista). So existe em domingo e
// feriado; no sabado o lancamento e sempre plantao e o campo nem aparece.
// No banco o plantao grava o tipo do dia ('domingo'/'feriado'/'sabado'), o
// que deixa os relatorios agruparem por dia sem outra consulta
// (CK_plantoes_tipo_lancamento).
const PLANTAO_TIPO_COBERTURA_ALMOCO = 'cobertura_almoco';

export const PLANTAO_TIPO_LANCAMENTO_OPCOES = Object.freeze([
    ['plantao', 'Plantao'],
    [PLANTAO_TIPO_COBERTURA_ALMOCO, 'Cobertura de almoco']
]);

function permiteCoberturaAlmocoPlantao(tipoDia) {
    return tipoDia === 'domingo' || tipoDia === 'feriado';
}

// Qualquer valor que nao seja cobertura vira o tipo do dia: registro antigo,
// sem a coluna, e dia que passou a ser feriado depois do lancamento continuam
// salvando sem o backend recusar a combinacao.
export function normalizarTipoLancamentoPlantao(valor, tipoDia) {
    const dia = ['sabado', 'domingo', 'feriado'].includes(tipoDia) ? tipoDia : 'sabado';

    return String(valor || '').trim().toLowerCase() === PLANTAO_TIPO_COBERTURA_ALMOCO && permiteCoberturaAlmocoPlantao(dia)
        ? PLANTAO_TIPO_COBERTURA_ALMOCO
        : dia;
}

export function ehCoberturaAlmocoPlantao(valor) {
    return String(valor || '').trim().toLowerCase() === PLANTAO_TIPO_COBERTURA_ALMOCO;
}

export function rotuloTipoLancamentoPlantao(valor) {
    return ehCoberturaAlmocoPlantao(valor) ? 'Cobertura de almoco' : 'Plantao';
}

// Etiqueta so para a cobertura: o plantao e o caso comum e o dia ja diz o tipo.
export function etiquetaCoberturaAlmocoPlantao(valor) {
    return ehCoberturaAlmocoPlantao(valor)
        ? '<span class="plantao-lancamento-credito plantao-tipo-lancamento--cobertura_almoco"><i class="fas fa-utensils"></i> Cobertura de almoco</span>'
        : '';
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

// Plantao gerado por cobertura de plantonista: e editado na cobertura, entao
// o dia so o mostra e nunca o manda de volta ao salvar (o servidor o preserva).
function ehPlantaoDeCobertura(registro) {
    return Boolean(registro?.coberturaTrechoId);
}

// Os plantoes de cobertura do dia, uma linha por pessoa, so para leitura.
export function coberturasDoDiaPlantao(dataISO) {
    return (estado.plantoesLancados || [])
        .filter((item) => item.dataISO === dataISO && ehPlantaoDeCobertura(item))
        .flatMap((registro) => (registro.colaboradores || []).map((colaboradorId) => ({
            colaboradorId: Number(colaboradorId),
            horaInicio: formatarHoraInput(registro.horaInicio) || '',
            horaFim: formatarHoraInput(registro.horaFim) || '',
            tipoCredito: normalizarTipoCreditoPlantao(registro.tipoCredito),
            observacao: registro.observacao || ''
        })));
}

// Monta as linhas da tela a partir do que ja esta gravado. Cada registro do
// banco pode trazer varios colaboradores no mesmo horario: aqui ele volta a
// ser uma linha por pessoa, que e como a tela edita.
export function lancamentosDoDiaPlantao(dataISO) {
    const linhas = [];

    (estado.plantoesLancados || [])
        .filter((item) => item.dataISO === dataISO && !ehPlantaoDeCobertura(item))
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

    const tipoLancamento = document.getElementById('plantaoNovoTipoLancamento');
    const credito = document.getElementById('plantaoNovoCredito');

    if (credito) { state.rascunho.tipoCredito = normalizarTipoCreditoPlantao(credito.value); }
    if (inicio) { state.rascunho.horaInicio = inicio.value; }
    if (fim) { state.rascunho.horaFim = fim.value; }
    if (colaborador) { state.rascunho.colaboradorId = Number(colaborador.value || 0); }
    if (tipoLancamento) { state.rascunho.tipoLancamento = tipoLancamento.value; }
}

function lerFormularioLancamentoPlantao(state) {
    return {
        colaboradorId: Number(document.getElementById('plantaoNovoColaborador')?.value || 0),
        horaInicio: document.getElementById('plantaoNovoInicio')?.value || '',
        horaFim: document.getElementById('plantaoNovoFim')?.value || '',
        tipoCredito: normalizarTipoCreditoPlantao(
            document.getElementById('plantaoNovoCredito')?.value ?? state?.rascunho?.tipoCredito
        ),
        tipoLancamento: normalizarTipoLancamentoPlantao(
            document.getElementById('plantaoNovoTipoLancamento')?.value ?? state?.rascunho?.tipoLancamento,
            state?.tipoPlantao
        )
    };
}

// A observacao do dia fica recolhida atras de um link ate alguem precisar
// dela (ou ate o dia ja ter uma): quase todo dia e salvo sem observacao.
export function mostrarObservacaoPlantao() {
    const state = getPlantaoEditorState();

    if (!state) {
        return;
    }

    capturarRascunhoPlantao(state);
    state.mostrarObservacao = true;
    renderPlantaoEditor(state);
    document.getElementById('plantaoObservacao')?.focus();
}

// Valida a linha do formulario e a poe na lista do dia (ou atualiza a linha
// em edicao). Devolve false, com o aviso na tela, quando ela nao pode entrar.
// Usada pelo "Adicionar" e pelo salvar do dia (linha preenchida e esquecida).
export function aplicarFormularioLancamentoPlantao(state) {
    capturarRascunhoPlantao(state);

    const nova = lerFormularioLancamentoPlantao(state);
    const editando = Number.isInteger(state.editandoIndice) ? state.editandoIndice : null;

    if (!nova.colaboradorId) {
        mostrarToast('Escolha o colaborador.', 'error');
        return false;
    }

    if (!nova.horaInicio || !nova.horaFim) {
        mostrarToast('Informe a hora inicial e a final.', 'error');
        return false;
    }

    if (nova.horaFim <= nova.horaInicio) {
        mostrarToast('A hora final precisa ser maior que a inicial.', 'error');
        return false;
    }

    if (conflitoDeLancamentoPlantao(state.lancamentos, nova, editando)) {
        mostrarToast(nomeColaboradorPlantao(nova.colaboradorId) + ' ja tem um lancamento que cruza esse horario.', 'error');
        return false;
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

    return true;
}

export function confirmarLancamentoPlantao() {
    const state = getPlantaoEditorState();

    if (!state || !aplicarFormularioLancamentoPlantao(state)) {
        return;
    }

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

// Resumo numa linha de texto, ao lado do titulo da lista:
// "2 lancamentos · 11h 00m em banco · 1h 00m em hora extra".
function textoResumoLancamentosPlantao(state) {
    if (state.lancamentos.length === 0) {
        return '';
    }

    const totais = state.lancamentos.reduce((acumulado, linha) => {
        acumulado[linha.tipoCredito] += duracaoLancamentoPlantao(linha) || 0;
        return acumulado;
    }, { banco: 0, extra: 0 });
    const partes = [`${state.lancamentos.length} lancamento${state.lancamentos.length > 1 ? 's' : ''}`];

    if (totais.banco > 0) {
        partes.push(`${minutosParaTexto(totais.banco)} em banco`);
    }

    if (totais.extra > 0) {
        partes.push(`${minutosParaTexto(totais.extra)} em hora extra`);
    }

    return partes.join(' · ');
}

function renderCoberturasPlantao(dataISO) {
    const linhas = coberturasDoDiaPlantao(dataISO);

    if (linhas.length === 0) {
        return '';
    }

    return `
            <section class="plantao-secao plantao-coberturas" aria-labelledby="plantaoCoberturasTitulo">
                <div class="plantao-secao-topo">
                    <h4 class="plantao-secao-titulo" id="plantaoCoberturasTitulo">Cobertura de plantonista</h4>
                    <span class="plantao-secao-resumo">Editado na cobertura, nao aqui</span>
                </div>
                <ul class="plantao-linhas">
                    ${linhas.map((linha) => {
                        const minutos = duracaoLancamentoPlantao(linha);
                        return `
                            <li class="plantao-linha is-cobertura">
                                <span class="plantao-linha-hora">${escapeHtml(linha.horaInicio)}–${escapeHtml(linha.horaFim)}</span>
                                <span class="plantao-linha-nome">${escapeHtml(nomeColaboradorPlantao(linha.colaboradorId))}</span>
                                <span class="plantao-linha-meta">${escapeHtml(PLANTAO_CREDITO_META[linha.tipoCredito].label)} · ${escapeHtml(linha.observacao)}</span>
                                <span class="plantao-linha-duracao">${minutos ? escapeHtml(minutosParaTexto(minutos)) : '--'}</span>
                                <span class="plantao-linha-acoes"></span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </section>
        `;
}

// Uma linha por pessoa, como uma tabela: horario, nome, destino (e a
// cobertura de almoco, unica marca colorida), duracao e as acoes.
function renderLancamentosPlantao(state) {
    if (state.lancamentos.length === 0) {
        return '<p class="plantao-vazio">Nenhum lancamento ainda.</p>';
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
        const cobertura = ehCoberturaAlmocoPlantao(normalizarTipoLancamentoPlantao(linha.tipoLancamento, state.tipoPlantao));
        const emEdicao = state.editandoIndice === indice;
        const nome = nomeColaboradorPlantao(linha.colaboradorId);

        return `
                <li class="plantao-linha${indisponivel ? ' is-indisponivel' : ''}${emEdicao ? ' is-editando' : ''}">
                    <span class="plantao-linha-hora">${escapeHtml(linha.horaInicio)}–${escapeHtml(linha.horaFim)}</span>
                    <span class="plantao-linha-nome">
                        ${escapeHtml(nome)}
                        ${indisponivel ? '<small class="status-indisponivel">Indisponivel</small>' : ''}
                    </span>
                    <span class="plantao-linha-meta">
                        ${escapeHtml(meta.label)}
                        ${cobertura ? '<span class="plantao-linha-cobertura"><i class="fas fa-utensils" aria-hidden="true"></i> Cobertura de almoco</span>' : ''}
                    </span>
                    <span class="plantao-linha-duracao">${minutos ? escapeHtml(minutosParaTexto(minutos)) : '--'}</span>
                    <span class="plantao-linha-acoes">
                        <button type="button" class="plantao-icone-btn" title="Editar" aria-label="Editar lancamento de ${escapeHtml(nome)}" ${atributosAcao('editarLancamentoPlantao', indice)}>
                            <i class="fas fa-pen" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="plantao-icone-btn is-perigo" title="Remover" aria-label="Remover lancamento de ${escapeHtml(nome)}" ${atributosAcao('removerLancamentoPlantao', indice)}>
                            <i class="fas fa-times" aria-hidden="true"></i>
                        </button>
                    </span>
                </li>
            `;
    }).join('');

    return `<ul class="plantao-linhas">${linhas}</ul>`;
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
    // O servidor so filtra por horario com o intervalo completo (so uma das
    // pontas volta 400). Enquanto o usuario preenche a segunda hora, vale a
    // disponibilidade do dia inteiro.
    const horaInicio = state.rascunho?.horaInicio || '';
    const horaFim = state.rascunho?.horaFim || '';
    const intervaloCompleto = Boolean(horaInicio && horaFim);

    try {
        const response = await API.getPlantaoDisponibilidade(state.dataISO, {
            horaInicio: intervaloCompleto ? horaInicio : undefined,
            horaFim: intervaloCompleto ? horaFim : undefined
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
    const comTipo = permiteCoberturaAlmocoPlantao(tipo);
    const coberturaSelecionada = ehCoberturaAlmocoPlantao(normalizarTipoLancamentoPlantao(state.rascunho?.tipoLancamento, tipo));
    const mostrarObservacao = Boolean(state.mostrarObservacao || String(state.observacao || '').trim());
    const painelFolga = renderPainelFolgasDomingo(state.dataISO);
    // A folga de domingo fica recolhida; abre sozinha quando a pessoa ja
    // abriu antes, veio das Pendencias para editar uma folga ou tem um
    // registro de folga pela metade.
    const folgaAberta = Boolean(state.folgaAberta || folgaDomingoPrecisaAbrir(state.dataISO));
    const resumo = textoResumoLancamentosPlantao(state);

    editorPanel.style.display = 'block';
    editorTitle.innerText = state.dataFormatada;

    // Tipo do dia e situacao numa linha de texto, sem etiquetas.
    const editorSubtitulo = document.getElementById('plantaoEditorSubtitulo');

    if (editorSubtitulo) {
        editorSubtitulo.innerHTML = `
                <span>${escapeHtml(rotuloTipo)}</span>
                <span aria-hidden="true">·</span>
                <span class="${jaLancado ? 'is-lancado' : ''}">${jaLancado ? 'Lancado' : 'Ainda nao lancado'}</span>
            `;
    }

    editorContent.innerHTML = `
            <div class="editor-plantao">
                <section class="plantao-novo${editando ? ' is-editando' : ''}" aria-label="${editando ? 'Editar lancamento' : 'Adicionar lancamento'}">
                    ${editando ? '<p class="plantao-novo-aviso">Editando um lancamento da lista</p>' : ''}
                    <div class="plantao-novo-campos">
                        <label class="plantao-campo">
                            <span>Colaborador</span>
                            <select id="plantaoNovoColaborador" class="form-control" data-pesquisavel aria-label="Colaborador">
                                ${renderOpcoesColaboradorPlantao(state)}
                            </select>
                        </label>
                        <div class="plantao-campo">
                            <span id="plantaoNovoHorarioRotulo">Horario</span>
                            <div class="plantao-novo-horario" role="group" aria-labelledby="plantaoNovoHorarioRotulo">
                                <input type="time" id="plantaoNovoInicio" class="form-control" value="${escapeHtml(state.rascunho?.horaInicio || '')}" aria-label="Hora inicial">
                                <span aria-hidden="true">–</span>
                                <input type="time" id="plantaoNovoFim" class="form-control" value="${escapeHtml(state.rascunho?.horaFim || '')}" aria-label="Hora final">
                            </div>
                        </div>
                        <label class="plantao-campo">
                            <span>Horas vao para</span>
                            <select id="plantaoNovoCredito" class="form-control">
                                ${Object.entries(PLANTAO_CREDITO_META).map(([chave, meta]) => `
                                    <option value="${chave}"${chave === tipoCredito ? ' selected' : ''}>${escapeHtml(meta.label)}</option>
                                `).join('')}
                            </select>
                        </label>
                        ${comTipo ? `
                            <label class="plantao-campo">
                                <span>Tipo</span>
                                <select id="plantaoNovoTipoLancamento" class="form-control">
                                    <option value="${escapeHtml(tipo)}"${coberturaSelecionada ? '' : ' selected'}>Plantao</option>
                                    <option value="${PLANTAO_TIPO_COBERTURA_ALMOCO}"${coberturaSelecionada ? ' selected' : ''}>Cobertura de almoco</option>
                                </select>
                            </label>
                        ` : ''}
                    </div>
                    <div class="plantao-novo-acoes">
                        ${editando ? `
                            <button type="button" class="plantao-link" ${atributosAcao('cancelarEdicaoLancamentoPlantao')}>Cancelar edicao</button>
                        ` : ''}
                        <button type="button" class="btn-secondary" title="Um colaborador por linha. Para um turno com varias pessoas, repita o horario." ${atributosAcao('confirmarLancamentoPlantao')}>
                            <i class="fas ${editando ? 'fa-check' : 'fa-plus'}" aria-hidden="true"></i>
                            ${editando ? 'Atualizar lancamento' : 'Adicionar'}
                        </button>
                    </div>
                </section>

                <section class="plantao-secao" aria-labelledby="plantaoLancamentosTitulo">
                    <div class="plantao-secao-topo">
                        <h4 class="plantao-secao-titulo" id="plantaoLancamentosTitulo">Lancamentos do dia</h4>
                        ${resumo ? `<span class="plantao-secao-resumo">${escapeHtml(resumo)}</span>` : ''}
                    </div>
                    ${renderLancamentosPlantao(state)}
                </section>

                ${renderCoberturasPlantao(state.dataISO)}

                ${mostrarObservacao ? `
                    <label class="plantao-campo plantao-secao">
                        <span>Observacao</span>
                        <textarea id="plantaoObservacao" class="form-control" rows="2" placeholder="Detalhes opcionais para o dia">${escapeHtml(state.observacao || '')}</textarea>
                    </label>
                ` : `
                    <button type="button" class="plantao-link" ${atributosAcao('mostrarObservacaoPlantao')}>
                        <i class="fas fa-plus" aria-hidden="true"></i> Adicionar observacao
                    </button>
                `}

                ${painelFolga ? `
                    <details class="plantao-folga" id="plantaoFolgaDetalhes"${folgaAberta ? ' open' : ''}>
                        <summary>Folga de domingo</summary>
                        ${painelFolga}
                    </details>
                ` : ''}

                <div class="editor-actions">
                    ${jaLancado ? `
                        <button type="button" ${atributosAcao('excluirPlantao', state.dataISO)} class="plantao-link plantao-link--perigo" title="Excluir todos os lancamentos do dia">
                            Excluir dia
                        </button>
                    ` : ''}
                    <button type="button" ${atributosAcao('cancelarPlantaoEditor')} class="btn-secondary">Cancelar</button>
                    <button type="button" ${atributosAcao('salvarPlantao', state.dataISO)} class="btn-primary">${jaLancado ? 'Salvar alteracoes' : 'Salvar dia'}</button>
                </div>
            </div>
        `;

    if (folgaAberta) {
        state.folgaAberta = true;
    }

    document.getElementById('plantaoFolgaDetalhes')?.addEventListener('toggle', (event) => {
        const atual = getPlantaoEditorState();

        if (atual) {
            atual.folgaAberta = event.currentTarget.open;
        }
    });

    // Colaborador com busca por nome (core/select-com-busca.js).
    aplicarBuscaNosSelects(editorContent);

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

                // A janela pode ter sido fechada (ou outro dia aberto)
                // enquanto a busca corria.
                if (getPlantaoEditorState() === ultimoState) {
                    renderPlantaoEditor(ultimoState);
                }
            }, 400);
        });
    });

    const novoTipoLancamento = document.getElementById('plantaoNovoTipoLancamento');

    novoTipoLancamento?.addEventListener('change', () => {
        const currentState = getPlantaoEditorState();

        if (currentState) {
            currentState.rascunho = currentState.rascunho || {};
            currentState.rascunho.tipoLancamento = novoTipoLancamento.value;
        }
    });

    novoColaborador?.addEventListener('change', () => {
        const currentState = getPlantaoEditorState();

        if (currentState) {
            currentState.rascunho = currentState.rascunho || {};
            currentState.rascunho.colaboradorId = Number(novoColaborador.value || 0);
        }
    });

    // Enter em qualquer campo do formulario adiciona/salva a linha.
    [novoInicio, novoFim, novoColaborador, novoTipoLancamento, document.getElementById('plantaoNovoCredito')].forEach((campo) => {
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

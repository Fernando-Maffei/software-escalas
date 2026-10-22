import { escapeHtml } from '../../../lib/html-seguro.js';
import { carregarPendenciasPlantao, ligarPendenciasPlantao, renderAbaPendenciasPlantao } from '../../../telas/pendencias-plantao.js';
import { API, buscarFeriadosNacionais } from '../../api.js';
import { mostrarToast } from '../../app/horas-e-resumo.js';
import { aguardarUsuarioAutenticado } from '../../auth.js';
import { estado } from '../../estado.js';
import { atualizarDadosCompartilhados, carregarAusencias, carregarColaboradores, carregarFeriadosLocais, carregarPlantoes } from '../dados-e-modais.js';
import { aplicarDefaultsBancoHorasLancamento } from './banco-horas-lancamento.js';
import { renderColaboradoresPlantao } from './colaboradores-e-jornada.js';
import { fecharModalSeguro, formatarDataPtBr, formatarHoraInput, getPlantaoEditorState, isColaboradoresScreenVisible, minutosParaTexto, obterDataISO, setPlantaoEditorState } from './helpers.js';
import { capturarRascunhoPlantao, carregarBancoHorasResumo, carregarDisponibilidadePlantao, duracaoLancamentoPlantao, lancamentosDoDiaPlantao, ehCoberturaAlmocoPlantao, etiquetaCoberturaAlmocoPlantao, normalizarTipoCreditoPlantao, normalizarTipoLancamentoPlantao, PLANTAO_CREDITO_META, PLANTAO_TIPO_LANCAMENTO_OPCOES, renderListaColaboradores, renderPlantaoEditor } from './plantao-editor.js';
import { atributosAcao } from '../../../lib/atributos-acao.js';

const PLANTAO_DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const PLANTAO_DIAS_SEMANA_NOMES = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
const PLANTAO_MESES_NOMES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function criarDataLocalPlantao(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);

    if (!ano || !mes || !dia) {
        return new Date();
    }

    return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

export function formatarDataPlantaoCard(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
}

// A regua mostra UM mes por vez (estado.plantaoMesISO, 'AAAA-MM'). O mes so
// muda pelas setas, pelo "Hoje" ou ao entrar na tela (entrarTelaPlantao).
// Antes era uma janela de 10 semanas ancorada no ultimo dia aberto: abrir um
// dia, salvar ou voltar para a tela movia a janela sozinha, e ela sempre
// comecava duas semanas antes — por isso aparecia o fim do mes anterior.
function mesDaDataPlantao(valor) {
    return (obterDataISO(valor) || obterDataISO(new Date())).slice(0, 7);
}

function obterMesPlantao() {
    if (!/^\d{4}-\d{2}$/.test(String(estado.plantaoMesISO || ''))) {
        estado.plantaoMesISO = mesDaDataPlantao(new Date());
    }

    return estado.plantaoMesISO;
}

function definirMesPlantao(valor) {
    estado.plantaoMesISO = mesDaDataPlantao(valor);
    return estado.plantaoMesISO;
}

function mudarMesPlantao(passo) {
    const [ano, mes] = obterMesPlantao().split('-').map(Number);
    definirMesPlantao(new Date(ano, mes - 1 + passo, 1, 12, 0, 0, 0));
}

function rotuloMesPlantao(mesISO = obterMesPlantao()) {
    const [ano, mes] = mesISO.split('-').map(Number);
    return `${PLANTAO_MESES_NOMES[mes - 1] || ''} de ${ano}`;
}

// Entrada na tela pelo menu: sempre o mes atual e nenhum dia aberto. A
// Escala do Dia pode pedir um dia especifico (estado.plantaoAbrirDataISO):
// a regua abre no mes dele, com o dia ja no painel. Os redesenhos internos
// (salvar, excluir, atualizar) chamam renderLancamentoPlantao direto e
// mantem o mes e o dia que estavam na tela.
export async function entrarTelaPlantao() {
    const abrir = obterDataISO(estado.plantaoAbrirDataISO || '');

    estado.plantaoAbrirDataISO = null;
    estado.plantaoDataFocoISO = abrir || null;
    setPlantaoEditorState(null);
    definirMesPlantao(abrir || new Date());

    await renderLancamentoPlantao();
}

// Feriados cadastrados (locais) + nacionais (API), como Map ISO -> nome.
export function construirMapaFeriadosPlantao() {
    const mapa = new Map();
    const add = (dataRaw, nome) => {
        const iso = obterDataISO(dataRaw);
        if (iso) {
            mapa.set(iso, nome || 'Feriado');
        }
    };
    (Array.isArray(estado.feriadosLocais) ? estado.feriadosLocais : [])
        .forEach((item) => add(item.Data || item.data, item.Nome || item.nome));
    (Array.isArray(estado.feriadosAPI) ? estado.feriadosAPI : [])
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

export function ehDataPlantaoValida(dataISO) {
    return resolverTipoPlantaoFront(dataISO) !== null;
}

export function rotuloTipoPlantao(tipo, feriadoNome) {
    if (tipo === 'feriado') {
        return feriadoNome || 'Feriado';
    }
    if (tipo === 'domingo') {
        return 'Domingo';
    }
    return 'Sabado';
}

// Datas lancaveis do mes da regua (sabados, domingos e feriados), em ordem,
// com o resumo do que ja foi lancado em cada uma.
function construirDiasDoMesPlantao() {
    const hojeISO = obterDataISO(new Date());
    const dataFoco = obterDataISO(estado.plantaoDataFocoISO || '');
    const feriadosMap = construirMapaFeriadosPlantao();
    const [ano, mes] = obterMesPlantao().split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const datas = [];

    for (let dia = 1; dia <= diasNoMes; dia += 1) {
        const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
        const dataISO = obterDataISO(data);
        const tipo = resolverTipoPlantaoFront(dataISO, feriadosMap);

        if (!tipo) {
            continue;
        }

        const turnos = (estado.plantoesLancados || []).filter((item) => item.dataISO === dataISO);
        const pessoas = new Set(turnos.flatMap((item) => (item.colaboradores || []).map(Number))).size;

        datas.push({
            dataISO,
            formatada: formatarDataPlantaoCard(dataISO),
            dia: String(dia).padStart(2, '0'),
            diaSemanaCurto: PLANTAO_DIAS_SEMANA_CURTOS[data.getDay()],
            diaSemanaNome: PLANTAO_DIAS_SEMANA_NOMES[data.getDay()],
            temPlantao: turnos.length > 0,
            pessoas,
            temCobertura: turnos.some((item) => ehCoberturaAlmocoPlantao(item.tipoLancamento)),
            isPast: dataISO < hojeISO,
            isToday: dataISO === hojeISO,
            isActive: dataFoco === dataISO,
            tipo,
            feriadoNome: tipo === 'feriado' ? feriadosMap.get(dataISO) : null
        });
    }

    return datas;
}

function textoStatusDiaPlantao(item) {
    if (!item.temPlantao) {
        return item.isPast ? 'Nao lancado' : 'Pendente';
    }

    if (item.pessoas === 0) {
        return 'Sem equipe';
    }

    return `${item.pessoas} pessoa${item.pessoas > 1 ? 's' : ''}`;
}

function renderResumoMesPlantao(items) {
    return `${items.filter((item) => item.temPlantao).length} de ${items.length} lancados`;
}

function renderDiasDoMesPlantao(items) {
    if (!items.length) {
        return '<div class="empty-state">Nenhum sabado, domingo ou feriado neste mes.</div>';
    }

    return `<div class="plantao-dias-grid">${items.map(renderCardDiaPlantao).join('')}</div>`;
}

// Sem onclick inline: o clique ja e tratado pelo listener delegado em
// #listaSabados (renderLancamentoPlantao). Com os dois, cada clique abria o
// painel duas vezes em paralelo (duas buscas de disponibilidade).
function renderCardDiaPlantao(item) {
    const status = textoStatusDiaPlantao(item);
    const classes = [
        'plantao-dia-card',
        `plantao-dia-card--${item.tipo || 'sabado'}`,
        item.temPlantao ? 'is-lancado' : '',
        item.temPlantao && item.pessoas === 0 ? 'is-sem-equipe' : '',
        item.isPast ? 'is-passado' : '',
        item.isToday ? 'is-hoje' : '',
        item.isActive ? 'is-active' : ''
    ].filter(Boolean).join(' ');
    const descricao = [
        `${item.diaSemanaNome}, ${item.formatada}`,
        item.feriadoNome,
        item.isToday ? 'hoje' : '',
        status,
        item.temCobertura ? 'com cobertura de almoco' : ''
    ].filter(Boolean).join(' - ');

    return `
            <button type="button" class="${classes}" data-plantao-sabado="${item.dataISO}" title="${escapeHtml(descricao)}" aria-label="${escapeHtml(descricao)}">
                <span class="plantao-dia-topo">
                    <span class="plantao-dia-numero">${escapeHtml(item.dia)}</span>
                    <span class="plantao-dia-semana">${escapeHtml(item.diaSemanaCurto)}</span>
                </span>
                <span class="plantao-dia-feriado">${escapeHtml(item.feriadoNome || '')}</span>
                <span class="plantao-dia-status">
                    <span class="plantao-dia-ponto" aria-hidden="true"></span>
                    ${escapeHtml(status)}
                    ${item.temCobertura ? '<i class="fas fa-utensils plantao-dia-cobertura" aria-hidden="true"></i>' : ''}
                </span>
            </button>
        `;
}

// Troca o mes sem redesenhar a tela inteira: o painel do dia aberto (e o
// que estiver sendo digitado nele) continua como esta.
async function atualizarReguaPlantao() {
    const [ano] = obterMesPlantao().split('-').map(Number);
    await garantirFeriadosApiPlantao([ano]);

    const dias = construirDiasDoMesPlantao();
    const lista = document.getElementById('listaSabados');
    const titulo = document.getElementById('plantaoMesTitulo');
    const resumo = document.getElementById('plantaoMesResumo');

    if (lista) {
        lista.innerHTML = renderDiasDoMesPlantao(dias);
    }

    if (titulo) {
        titulo.textContent = rotuloMesPlantao();
    }

    if (resumo) {
        resumo.textContent = renderResumoMesPlantao(dias);
    }
}

function atualizarSabadoSelecionadoPlantao(dataISO) {
    document.querySelectorAll('[data-plantao-sabado]').forEach((element) => {
        element.classList.toggle('is-active', element.getAttribute('data-plantao-sabado') === dataISO);
    });
}

async function openPlantaoEditorFromGrid(dataISO) {
    const normalized = obterDataISO(dataISO);

    if (!normalized) {
        return;
    }

    await abrirEditorPlantao(normalized, formatarDataPlantaoCard(normalized));
}

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
    tipoLancamento: 'todos',
    tipoCredito: 'todos'
});

let plantaoAbaAtiva = 'lancar';
let filtrosPlantoesLancados = { ...PLANTAO_FILTROS_VAZIOS };

function selecionarAbaPlantao(aba) {
    plantaoAbaAtiva = ['lancados', 'pendencias'].includes(aba) ? aba : 'lancar';

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
    return (estado.plantoesLancados || []).filter((plantao) => (
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

        if (filtros.tipoLancamento !== 'todos'
            && (ehCoberturaAlmocoPlantao(plantao.tipoLancamento) ? 'cobertura_almoco' : 'plantao') !== filtros.tipoLancamento) {
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
        tipoLancamento: document.getElementById('plantoesFiltroTipoLancamento')?.value || 'todos',
        tipoCredito: document.getElementById('plantoesFiltroCredito')?.value || 'todos'
    };
}

function renderFiltrosPlantoesLancados() {
    const filtros = filtrosPlantoesLancados;
    const colaboradores = [...(estado.colaboradores || [])]
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
                    <label for="plantoesFiltroTipoLancamento">Tipo</label>
                    <select id="plantoesFiltroTipoLancamento" class="form-control">
                        ${opcoes([['todos', 'Todos'], ...PLANTAO_TIPO_LANCAMENTO_OPCOES], filtros.tipoLancamento)}
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

    ['plantoesFiltroColaborador', 'plantoesFiltroTipo', 'plantoesFiltroTipoLancamento', 'plantoesFiltroCredito'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltrosPlantoesLancados);
    });

    document.getElementById('plantoesFiltroLimpar')?.addEventListener('click', limparFiltrosPlantoesLancados);
}

function atualizarResumoPlantaoNaTela() {
    const container = document.getElementById('listaPlantoesLancados');

    if (!container) {
        return;
    }

    container.innerHTML = renderPlantoesLancados();
    atualizarContagemPlantoesLancados();
}

// Um dia pode ter varios turnos, e cada turno e uma linha da tabela. O card
// e do DIA: junta os turnos daquela data e mostra cada um como uma faixa.
function renderPlantoesLancados(filtros) {
        if (!estado.plantoesLancados || estado.plantoesLancados.length === 0) {
            return '<div class="empty-state">Nenhum plantao lancado ainda</div>';
        }

        const lancados = plantoesLancadosValidos();

        if (lancados.length === 0) {
            return '<div class="empty-state">Nenhum plantao de sabado, domingo ou feriado lancado ainda</div>';
        }

        const validos = filtrarPlantoesLancados(lancados, filtros || filtrosPlantoesLancados);

        if (validos.length === 0) {
            return '<div class="empty-state">Nenhum plantao encontrado com esses filtros. Ajuste o periodo, o colaborador, o tipo ou o destino das horas.</div>';
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
                            ${etiquetaCoberturaAlmocoPlantao(item.tipoLancamento)}
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
                                <button ${atributosAcao('excluirPlantao', dataISO)} class="btn-icon-sm delete" title="Excluir dia" aria-label="Excluir plantao de ${escapeHtml(formatarDataPtBr(dataISO))}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${observacao ? `<p class="plantao-observacao">${escapeHtml(observacao)}</p>` : ''}
                        <div class="plantao-turnos">${turnosHtml}</div>
                    </div>
                `;
        }).join('');
    }

function carregarPlantoesLancadosNaTela() {
    atualizarResumoPlantaoNaTela();
}

// Garante os feriados NACIONAIS dos anos da janela em estado.feriadosAPI.
// carregarFeriadosAPI substitui a lista a cada chamada, entao aqui juntamos
// os anos manualmente (dedup por data).
async function garantirFeriadosApiPlantao(anos) {
    const porData = new Map(
        (Array.isArray(estado.feriadosAPI) ? estado.feriadosAPI : [])
            .filter((item) => item && item.date)
            .map((item) => [item.date, item])
    );

    for (const ano of anos) {
        try {
            const lista = await buscarFeriadosNacionais(ano);
            (Array.isArray(lista) ? lista : []).forEach((item) => {
                if (item && item.date) {
                    porData.set(item.date, item);
                }
            });
        } catch (error) {
            // Servidor/API fora do ar: segue com os feriados locais/ja carregados.
        }
    }

    estado.feriadosAPI = [...porData.values()];
}

export async function renderLancamentoPlantao() {
    const appContent = document.getElementById('appContent');

    if (!appContent) {
        return;
    }

    const anosJanela = [...new Set([new Date().getFullYear(), Number(obterMesPlantao().slice(0, 4))])];

    await Promise.allSettled([
        carregarColaboradores(),
        carregarAusencias(),
        carregarPlantoes(),
        carregarBancoHorasResumo(),
        carregarFeriadosLocais(),
        garantirFeriadosApiPlantao(anosJanela)
    ]);

    estado.plantoesLancados = (estado.plantoesLancados || []).filter((plantao) => ehDataPlantaoValida(plantao.dataISO) || ['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao));

    const dataFoco = obterDataISO(estado.plantaoDataFocoISO || getPlantaoEditorState()?.dataISO || '');
    const diasDoMes = construirDiasDoMesPlantao();

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
                <button type="button" class="plantao-aba" data-plantao-aba="pendencias" role="tab" aria-selected="false">
                    <i class="fas fa-bell"></i> Pendencias
                    <span class="plantao-aba-contagem plantao-aba-contagem--alerta" id="plantaoAbaPendenciasContagem" hidden>0</span>
                </button>
            </div>

            <div class="plantao-layout">
                <div class="plantao-abas-conteudo">
                    <div class="sabados-container" data-plantao-painel="lancar">
                        <div class="sabados-header plantao-mes-header">
                            <div class="plantao-mes-nav">
                                <button type="button" class="btn-secondary plantao-mes-seta" id="plantaoAnteriorBtn" aria-label="Mes anterior" title="Mes anterior">
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                                <h3 id="plantaoMesTitulo" aria-live="polite">${escapeHtml(rotuloMesPlantao())}</h3>
                                <button type="button" class="btn-secondary plantao-mes-seta" id="plantaoProximoBtn" aria-label="Proximo mes" title="Proximo mes">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                                <button type="button" class="btn-secondary" id="plantaoHojeBtn">Hoje</button>
                            </div>
                            <span class="plantao-mes-resumo" id="plantaoMesResumo">${escapeHtml(renderResumoMesPlantao(diasDoMes))}</span>
                        </div>

                        <div class="plantao-dias" id="listaSabados">
                            ${renderDiasDoMesPlantao(diasDoMes)}
                        </div>

                        <p class="plantao-dias-legenda">
                            <span><span class="plantao-dia-ponto is-lancado" aria-hidden="true"></span> Lancado</span>
                            <span><span class="plantao-dia-ponto" aria-hidden="true"></span> Pendente</span>
                            <span><span class="plantao-dia-legenda-feriado" aria-hidden="true"></span> Feriado</span>
                            <span><i class="fas fa-utensils" aria-hidden="true"></i> Cobertura de almoco</span>
                        </p>
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

                    <div class="pendencias-plantao-container" data-plantao-painel="pendencias" hidden>
                        ${renderAbaPendenciasPlantao()}
                    </div>
                </div>

            </div>

            <div id="plantaoEditor" class="plantao-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="plantaoDataTitle">
                <div class="plantao-modal-caixa">
                    <div class="editor-header">
                        <div class="editor-header-titulo">
                            <h3 id="plantaoDataTitle">Selecione uma data</h3>
                            <div id="plantaoEditorSubtitulo" class="plantao-modal-subtitulo"></div>
                        </div>
                        <button ${atributosAcao('cancelarPlantaoEditor')} class="btn-close-editor" aria-label="Fechar" title="Fechar (Esc)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="plantaoEditorContent" class="editor-form"></div>
                </div>
            </div>
        `;

    // Clique no fundo escurecido fecha como o X (com o aviso de alteracoes).
    document.getElementById('plantaoEditor')?.addEventListener('mousedown', (event) => {
        if (event.target === event.currentTarget) {
            cancelarPlantaoEditor();
        }
    });
    ligarEscPlantaoEditor();

    document.getElementById('plantaoAnteriorBtn')?.addEventListener('click', () => {
        mudarMesPlantao(-1);
        atualizarReguaPlantao();
    });

    document.getElementById('plantaoHojeBtn')?.addEventListener('click', () => {
        definirMesPlantao(new Date());
        atualizarReguaPlantao();
    });

    document.getElementById('plantaoProximoBtn')?.addEventListener('click', () => {
        mudarMesPlantao(1);
        atualizarReguaPlantao();
    });

    document.querySelectorAll('[data-plantao-aba]').forEach((botao) => {
        botao.addEventListener('click', () => selecionarAbaPlantao(botao.getAttribute('data-plantao-aba')));
    });

    selecionarAbaPlantao(plantaoAbaAtiva);
    ligarFiltrosPlantoesLancados();
    atualizarContagemPlantoesLancados();

    // Aba Pendencias: folgas de domingo sem reposicao e plantoes sem equipe.
    // "Marcar reposicao" e "Abrir plantao" abrem o dia na mesma janela do
    // editor (a folga ja chega com o cartao em edicao).
    ligarPendenciasPlantao((dataISO) => openPlantaoEditorFromGrid(dataISO));
    carregarPendenciasPlantao();

    // Editar pela lista abre a mesma janela do editor da regua.
    document.getElementById('listaPlantoesLancados')?.addEventListener('click', async (event) => {
        const trigger = event.target.closest('[data-plantao-editar]');

        if (!trigger) {
            return;
        }

        await openPlantaoEditorFromGrid(trigger.getAttribute('data-plantao-editar'));
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
}

async function abrirEditorPlantao(dataISO, dataFormatada) {
    const editorPanel = document.getElementById('plantaoEditor');
    const editorTitle = document.getElementById('plantaoDataTitle');
    const editorContent = document.getElementById('plantaoEditorContent');

    if (!editorPanel || !editorTitle || !editorContent) {
        estado.plantaoDataFocoISO = dataISO;

        await renderLancamentoPlantao();

        return;
    }

    estado.plantaoDataFocoISO = dataISO;
    atualizarSabadoSelecionadoPlantao(dataISO);

    if (!ehDataPlantaoValida(dataISO)) {
        mostrarToast('Plantao so pode ser lancado em sabado, domingo ou feriado.', 'warning');
        return;
    }

    const registrosDoDia = (estado.plantoesLancados || []).filter((item) => item.dataISO === dataISO);
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
            tipoCredito: ultimo?.tipoCredito || 'banco',
            // A cobertura de almoco e a excecao: o formulario abre no regular.
            tipoLancamento: resolverTipoPlantaoFront(dataISO) || 'sabado'
        },
        disponibilidade: []
    });

    renderPlantaoEditor(state);
    await carregarDisponibilidadePlantao(state);
    renderPlantaoEditor(state);
    atualizarSabadoSelecionadoPlantao(dataISO);
    document.getElementById('plantaoNovoColaborador')?.focus();
}

// Ha algo no editor que ainda nao foi para o banco? Compara as linhas e a
// observacao com o que esta gravado, e conta como pendente a linha em edicao
// ou o colaborador ja escolhido mas nao adicionado ao dia.
function plantaoEditorTemAlteracoes(state) {
    if (!state) {
        return false;
    }

    capturarRascunhoPlantao(state);

    const chave = (linhas) => JSON.stringify((linhas || []).map((linha) => [
        Number(linha.colaboradorId),
        linha.horaInicio,
        linha.horaFim,
        normalizarTipoCreditoPlantao(linha.tipoCredito),
        normalizarTipoLancamentoPlantao(linha.tipoLancamento, state.tipoPlantao)
    ].join('|')).sort());
    const observacaoGravada = (estado.plantoesLancados || [])
        .find((item) => item.dataISO === state.dataISO && item.observacao)?.observacao || '';

    return chave(state.lancamentos) !== chave(lancamentosDoDiaPlantao(state.dataISO))
        || String(state.observacao || '').trim() !== String(observacaoGravada).trim()
        || Number.isInteger(state.editandoIndice)
        || Number(state.rascunho?.colaboradorId || 0) > 0;
}

function plantaoEditorAberto() {
    const editorPanel = document.getElementById('plantaoEditor');
    return Boolean(editorPanel && editorPanel.style.display !== 'none');
}

// X, Cancelar, Esc e clique fora: fecham a janela, mas perguntam antes se
// houver lancamento ainda nao salvo.
export function cancelarPlantaoEditor() {
    if (plantaoEditorTemAlteracoes(getPlantaoEditorState())
        && !window.confirm('Ha alteracoes neste dia que ainda nao foram salvas. Fechar e descartar?')) {
        return;
    }

    fecharPlantaoEditor();
}

let escPlantaoLigado = false;

function ligarEscPlantaoEditor() {
    if (escPlantaoLigado) {
        return;
    }

    escPlantaoLigado = true;
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && plantaoEditorAberto()) {
            event.preventDefault();
            cancelarPlantaoEditor();
        }
    });
}

function fecharPlantaoEditor() {
    const editorPanel = document.getElementById('plantaoEditor');
    const editorContent = document.getElementById('plantaoEditorContent');
    const diaAberto = estado.plantaoDataFocoISO;

    estado.plantaoDataFocoISO = null;
    setPlantaoEditorState(null);
    atualizarSabadoSelecionadoPlantao(null);

    if (editorContent) {
        editorContent.innerHTML = '';
    }

    const editorSubtitulo = document.getElementById('plantaoEditorSubtitulo');

    if (editorSubtitulo) {
        editorSubtitulo.innerHTML = '';
    }

    if (editorPanel) {
        editorPanel.style.display = 'none';
    }

    // O foco volta para o card do dia, de onde a janela foi aberta.
    if (diaAberto) {
        document.querySelector(`[data-plantao-sabado="${diaAberto}"]`)?.focus();
    }
}

export async function salvarPlantao(dataISO) {
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
        const tipoPlantao = resolverTipoPlantaoFront(dataISO) || 'sabado';

        await API.salvarPlantao({
            dataISO,
            tipoPlantao,
            observacao: state.observacao || '',
            lancamentos: state.lancamentos.map((linha) => ({
                colaboradorId: linha.colaboradorId,
                horaInicio: linha.horaInicio,
                horaFim: linha.horaFim,
                tipoCredito: linha.tipoCredito,
                tipoLancamento: normalizarTipoLancamentoPlantao(linha.tipoLancamento, tipoPlantao)
            }))
        });

        // Salvou: a janela fecha e a regua mostra o dia ja lancado. Com
        // erro, ela fica aberta com tudo o que foi digitado.
        fecharPlantaoEditor();
        await atualizarTudo({ silent: true, source: 'plantao' });

        mostrarToast('Plantao salvo com sucesso!', 'success');
    } catch (error) {
        mostrarToast(`Erro ao salvar plantao: ${error.message}`, 'error');
    }
}

export async function excluirPlantao(dataISO) {
    if (!window.confirm('Tem certeza que deseja excluir este plantao?')) {
        return;
    }

    try {
        await API.excluirPlantao(dataISO);
        fecharPlantaoEditor();
        await atualizarTudo({ silent: true, source: 'plantao' });

        mostrarToast('Plantao excluido com sucesso!', 'success');
    } catch (error) {
        mostrarToast(`Erro ao excluir plantao: ${error.message}`, 'error');
    }
}

export async function salvarAusencia(tipo, dataInicio, dataFim) {
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
        id: estado.editandoTipoLancamento === 'pessoal' ? estado.editandoLancamentoId : undefined,
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

    return API.salvarAusencia(dados);
}

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

// Recarrega os dados de todas as telas (atualizarDadosCompartilhados, em
// core/runtime/dados-e-modais.js) e, em seguida, o banco de horas e as listas
// da tela de plantao.
export async function atualizarTudo(options = {}) {
    await atualizarDadosCompartilhados({ ...options, silent: true });

    await Promise.allSettled([
        carregarBancoHorasResumo()
    ]);

    if (document.getElementById('listaColaboradores')) {
        const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
        const lista = termoBusca
            ? (estado.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
            : (estado.colaboradores || []);

        renderListaColaboradores(lista);
    }

    if (document.getElementById('listaPlantoesLancados')) {
        carregarPlantoesLancadosNaTela();
    }

    if (!options.silent) {
        mostrarToast('Dados atualizados!', 'success');
    }
}

// carregarBancoHorasResumo trata a propria falha; so espera o login para
// nao disparar a carga (e um 401) atras da tela de entrada.
document.addEventListener('DOMContentLoaded', async () => {
    await aguardarUsuarioAutenticado();
    await carregarBancoHorasResumo();

    if (isColaboradoresScreenVisible()) {
        renderListaColaboradores();
    }
});

setTimeout(() => {
    aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
}, 0);

/* =====================================================================
PAINEL DE FOLGA DE DOMINGO (dentro de Lancar Plantao)
---------------------------------------------------------------------
Aparece so quando a data aberta na regua e um DOMINGO. Fica aqui, e nao
numa tela propria, porque o fluxo real e um so: "domingo tal, fulano
folga, beltrano cobre" — lancar a cobertura e registrar a folga no
mesmo lugar evita ir e voltar entre telas.

Nao ha campo "quem cobriu": quem esta lancado no plantao daquele domingo
JA e quem cobriu, entao o campo duplicaria a informacao. A escala marca
esses lancamentos como cobertura sozinha.

A folga tem duas metades — o domingo folgado e o dia da reposicao — e a
segunda pode vir depois. Por isso o registro aceita "Deixar pendente" e
cada cartao da lista tem a acao certa para o estado dele ("Marcar
reposicao" ou "Alterar"). As pendentes de todos os domingos tambem sao
listadas na aba "Plantoes lancados" (renderPendenciasFolgasDomingo).

O painel do plantao se redesenha a cada tecla digitada no formulario
(renderPlantaoEditor e chamado de varios lugares). Por isso:
- a lista de folgas NAO e montada dentro do innerHTML dele: o HTML sai com
  um container vazio e esta funcao preenche depois, em cima do container.
  Assim digitar no plantao nao dispara uma requisicao por tecla;
- o que a pessoa digitou no formulario fica no `rascunho` (e a edicao de um
  cartao em `edicao`), senao cada redesenho apagaria os campos.
===================================================================== */

import { API } from '../core/api.js';
import { mostrarToast } from '../core/app/horas-e-resumo.js';
import { estado } from '../core/estado.js';
import { escapeHtml } from '../lib/html-seguro.js';
import { PRAZO_ATRASO_DIAS, classificarEsperaFolga, diasEntre, hojeISO, textoQuando as textoQuandoDias } from '../lib/pendencias-plantao.js';

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const MODO_AGORA = 'agora';
const MODO_PENDENTE = 'pendente';

// Cache por data: evita refazer a chamada a cada redesenho do painel.
// Invalidado na mao depois de gravar ou remover.
const cachePorData = new Map();

// O que esta digitado no formulario de nova folga. `preenchidoAuto` diz se os
// horarios ainda sao os sugeridos pela jornada do colaborador (e podem ser
// trocados quando ele muda) ou se a pessoa ja mexeu neles.
let rascunho = novoRascunho(null);
let edicao = null;
// Vem da lista de pendencias: ao abrir o domingo, ja abre este cartao em edicao.
let abrirEdicaoDaFolgaId = null;

function novoRascunho(dataISO) {
    return {
        dataISO,
        colaboradorId: '',
        modo: MODO_AGORA,
        dataReposicao: '',
        horaInicio: '',
        horaFim: '',
        almocoInicio: '',
        almocoFim: '',
        observacao: '',
        preenchidoAuto: false,
        dica: ''
    };
}

function ehDomingo(dataISO) {
    const partes = String(dataISO || '').split('-').map(Number);

    if (partes.length !== 3 || partes.some(Number.isNaN)) {
        return false;
    }

    return new Date(Date.UTC(partes[0], partes[1] - 1, partes[2], 12)).getUTCDay() === 0;
}

export function rotuloData(dataISO) {
    const partes = String(dataISO || '').split('-');

    if (partes.length !== 3) {
        return '--';
    }

    const dia = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12)).getUTCDay();
    return `${DIAS_CURTOS[dia]} ${partes[2]}/${partes[1]}`;
}

export function dataCompleta(dataISO) {
    const partes = String(dataISO || '').split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : '--';
}

// Aceita "08:00", "08:00:00" e o ISO que o driver as vezes devolve para TIME.
function hora(valor) {
    const achado = String(valor || '').match(/(\d{2}):(\d{2})/);
    return achado ? `${achado[1]}:${achado[2]}` : '';
}

// "ha 5 dias" / "hoje" / "em 3 dias" para uma data ISO, em relacao a hoje.
export function textoQuando(dataISO) {
    return textoQuandoDias(diasEntre(dataISO, hojeISO()));
}

// Folga de domingo e so de plantonista de FINAL DE SEMANA, definido no cadastro
// do colaborador (E plantonista? Sim + tipo). O de semana nao tem folga no
// domingo, e colaborador normal nao e plantonista.
function podeFolgarNoDomingo(colaborador) {
    return Boolean(colaborador.IsPlantonista) && colaborador.TipoPlantonista === 'FINAL_SEMANA';
}

function opcoesColaborador(selecionado) {
    const lista = (estado.colaboradores || []).filter(podeFolgarNoDomingo);

    return [
        `<option value="">${lista.length === 0 ? 'Nenhum plantonista de final de semana' : 'Selecione...'}</option>`,
        ...lista
            .map((c) => `<option value="${c.Id}" ${Number(selecionado) === Number(c.Id) ? 'selected' : ''}>${escapeHtml(c.Nome)}</option>`)
    ].join('');
}

// Jornada de cadastro do colaborador: o dia da reposicao e folga na jornada
// semanal, entao nao ha horario "do dia" de onde puxar — o horario padrao da
// ficha e a melhor sugestao.
export function jornadaDoColaborador(colaboradorId) {
    const colaborador = (estado.colaboradores || []).find((c) => Number(c.Id) === Number(colaboradorId));

    if (!colaborador) {
        return null;
    }

    const jornada = {
        nome: colaborador.Nome,
        horaInicio: hora(colaborador.TrabalhoInicio),
        horaFim: hora(colaborador.TrabalhoFim),
        almocoInicio: hora(colaborador.AlmocoInicio),
        almocoFim: hora(colaborador.AlmocoFim)
    };

    return jornada.horaInicio && jornada.horaFim ? jornada : null;
}

function camposDeHora(idBase, valores) {
    return `
                        <div class="folga-domingo-par">
                            <input type="time" id="${idBase}Inicio" data-campo="horaInicio" class="form-control" value="${escapeHtml(valores.horaInicio)}" aria-label="Inicio do horario">
                            <span>ate</span>
                            <input type="time" id="${idBase}Fim" data-campo="horaFim" class="form-control" value="${escapeHtml(valores.horaFim)}" aria-label="Fim do horario">
                        </div>`;
}

function camposDeAlmoco(idBase, valores) {
    return `
                        <div class="folga-domingo-par">
                            <input type="time" id="${idBase}Inicio" data-campo="almocoInicio" class="form-control" value="${escapeHtml(valores.almocoInicio)}" aria-label="Inicio do almoco">
                            <span>ate</span>
                            <input type="time" id="${idBase}Fim" data-campo="almocoFim" class="form-control" value="${escapeHtml(valores.almocoFim)}" aria-label="Fim do almoco">
                        </div>`;
}

// O HTML do painel. Sem a lista: ela chega depois, por carregarLista().
export function renderPainelFolgasDomingo(dataISO) {
    if (!ehDomingo(dataISO)) {
        return '';
    }

    if (rascunho.dataISO !== dataISO) {
        rascunho = novoRascunho(dataISO);
    }

    if (edicao && edicao.dataISO !== dataISO) {
        edicao = null;
    }

    const agora = rascunho.modo === MODO_AGORA;

    return `
            <div class="editor-form-group folga-domingo-bloco" data-folga-domingo-data="${escapeHtml(dataISO)}">
                <label><i class="fas fa-scale-balanced"></i> Folga de domingo</label>
                <p class="helper-text">
                    Registra quem folgou este domingo e em que dia repoe, com horario e almoco.
                    Quem esta lancado no plantao deste dia aparece na escala como cobertura.
                </p>

                <div id="folgaDomingoLista" class="folga-domingo-lista">
                    <div class="folga-domingo-vazio">Carregando...</div>
                </div>

                <div class="folga-domingo-form" id="folgaDomingoForm">
                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Quem folgou</small>
                        <select id="folgaDomingoColaborador" class="form-control">${opcoesColaborador(rascunho.colaboradorId)}</select>
                        <p class="folga-domingo-dica">So aparecem plantonistas de final de semana. O tipo se define no cadastro do colaborador.</p>
                    </div>

                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Reposicao</small>
                        <div class="folga-domingo-opcoes" role="radiogroup" aria-label="Reposicao">
                            <label class="folga-domingo-opcao${agora ? ' is-ativa' : ''}">
                                <input type="radio" name="folgaDomingoModo" value="${MODO_AGORA}" ${agora ? 'checked' : ''}>
                                Marcar agora
                            </label>
                            <label class="folga-domingo-opcao${agora ? '' : ' is-ativa'}">
                                <input type="radio" name="folgaDomingoModo" value="${MODO_PENDENTE}" ${agora ? '' : 'checked'}>
                                Deixar pendente
                            </label>
                        </div>
                    </div>

                    <div id="folgaDomingoReposicao" class="folga-domingo-reposicao" ${agora ? '' : 'hidden'}>
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Dia da reposicao</small>
                            <input type="date" id="folgaDomingoDataReposicao" data-campo="dataReposicao" class="form-control" value="${escapeHtml(rascunho.dataReposicao)}">
                        </div>
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Horario da reposicao</small>${camposDeHora('folgaDomingoHora', rascunho)}
                        </div>
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Almoco da reposicao</small>${camposDeAlmoco('folgaDomingoAlmoco', rascunho)}
                        </div>
                        <p class="folga-domingo-dica" id="folgaDomingoDica" ${rascunho.dica ? '' : 'hidden'}>${escapeHtml(rascunho.dica)}</p>
                    </div>

                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Observacao</small>
                        <input type="text" id="folgaDomingoObservacao" data-campo="observacao" class="form-control" maxlength="500" value="${escapeHtml(rascunho.observacao)}">
                    </div>

                    <div id="folgaDomingoAviso" class="folga-domingo-aviso" role="alert" hidden></div>

                    <button type="button" class="btn-primary" id="btnRegistrarFolgaDomingo">
                        <i class="fas fa-plus"></i> Registrar folga
                    </button>
                </div>
            </div>
        `;
}

function resumoReposicao(folga) {
    if (!folga.dataReposicao) {
        return `Domingo ${dataCompleta(folga.dataDomingo)} · sem dia de reposicao`;
    }

    const almoco = folga.reposicaoAlmocoInicio && folga.reposicaoAlmocoFim
        ? ` · almoco ${hora(folga.reposicaoAlmocoInicio)}–${hora(folga.reposicaoAlmocoFim)}`
        : '';

    return `Repoe ${rotuloData(folga.dataReposicao)}, ${hora(folga.reposicaoHoraInicio)}–${hora(folga.reposicaoHoraFim)}${almoco}`;
}

function renderFormularioEdicao(folga) {
    return `
                    <div class="folga-domingo-edicao" data-edicao-folga="${folga.id}">
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Dia da reposicao</small>
                            <input type="date" data-campo="dataReposicao" class="form-control" value="${escapeHtml(edicao.dataReposicao)}">
                        </div>
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Horario da reposicao</small>${camposDeHora(`folgaEdicaoHora${folga.id}`, edicao)}
                        </div>
                        <div class="folga-domingo-campo folga-domingo-campo--largo">
                            <small>Almoco da reposicao</small>${camposDeAlmoco(`folgaEdicaoAlmoco${folga.id}`, edicao)}
                        </div>
                        ${edicao.dica ? `<p class="folga-domingo-dica">${escapeHtml(edicao.dica)}</p>` : ''}
                        <div class="folga-domingo-aviso" role="alert" ${edicao.aviso ? '' : 'hidden'}>${escapeHtml(edicao.aviso || '')}</div>
                        <div class="folga-domingo-acoes">
                            <button type="button" class="btn-primary folga-domingo-btn" data-salvar-folga="${folga.id}">Salvar</button>
                            <button type="button" class="btn-secondary folga-domingo-btn" data-cancelar-folga="${folga.id}">Cancelar</button>
                        </div>
                    </div>`;
}

function renderCartao(folga) {
    const pendente = !folga.dataReposicao;
    const emEdicao = edicao && edicao.id === folga.id;
    const chip = pendente
        ? '<span class="folga-domingo-chip folga-domingo-chip--pendente">Reposicao pendente</span>'
        : '<span class="folga-domingo-chip folga-domingo-chip--marcada">Reposicao marcada</span>';

    return `
                <div class="folga-domingo-item${emEdicao ? ' is-editando' : ''}">
                    <div class="folga-domingo-item-topo">
                        <div>
                            <strong>${escapeHtml(folga.colaboradorNome)}</strong>
                            <p>${escapeHtml(resumoReposicao(folga))}</p>
                            ${folga.observacao ? `<p class="folga-domingo-obs">${escapeHtml(folga.observacao)}</p>` : ''}
                            ${chip}
                        </div>
                        <div class="folga-domingo-item-acoes">
                            ${emEdicao ? '' : `<button type="button" class="${pendente ? 'btn-primary' : 'btn-secondary'} folga-domingo-btn" data-editar-folga="${folga.id}">
                                ${pendente ? '<i class="fas fa-calendar-plus"></i> Marcar reposicao' : '<i class="fas fa-pen"></i> Alterar'}
                            </button>`}
                            <button type="button" class="btn-danger-ghost" data-remover-folga="${folga.id}" title="Remover registro" aria-label="Remover registro de ${escapeHtml(folga.colaboradorNome)}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${emEdicao ? renderFormularioEdicao(folga) : ''}
                </div>
            `;
}

function iniciarEdicao(folga) {
    const jornada = folga.dataReposicao ? null : jornadaDoColaborador(folga.colaboradorId);

    edicao = {
        id: folga.id,
        dataISO: folga.dataDomingo,
        dataReposicao: folga.dataReposicao || '',
        horaInicio: hora(folga.reposicaoHoraInicio) || jornada?.horaInicio || '',
        horaFim: hora(folga.reposicaoHoraFim) || jornada?.horaFim || '',
        almocoInicio: hora(folga.reposicaoAlmocoInicio) || jornada?.almocoInicio || '',
        almocoFim: hora(folga.reposicaoAlmocoFim) || jornada?.almocoFim || '',
        preenchidoAuto: Boolean(jornada),
        dica: jornada ? `Horario preenchido com a jornada de ${jornada.nome}. Ajuste se for diferente.` : '',
        aviso: ''
    };
}

function renderLista(folgas) {
    const alvo = document.getElementById('folgaDomingoLista');

    if (!alvo) {
        return;
    }

    if (abrirEdicaoDaFolgaId !== null) {
        const pedida = folgas.find((folga) => Number(folga.id) === Number(abrirEdicaoDaFolgaId));
        abrirEdicaoDaFolgaId = null;

        if (pedida) {
            iniciarEdicao(pedida);
        }
    }

    if (!folgas.length) {
        alvo.innerHTML = '<div class="folga-domingo-vazio">Nenhuma folga registrada neste domingo.</div>';
        return;
    }

    alvo.innerHTML = folgas.map(renderCartao).join('');
}

async function carregarLista(dataISO, { forcar = false } = {}) {
    if (forcar) {
        cachePorData.delete(dataISO);
    }

    if (cachePorData.has(dataISO)) {
        renderLista(cachePorData.get(dataISO));
        return;
    }

    let folgas = [];

    try {
        const dados = await API.getFolgasDomingo({ dataInicio: dataISO, dataFim: dataISO });
        folgas = Array.isArray(dados?.items) ? dados.items : [];
    } catch (erro) {
        // Banco sem a migracao, ou rede fora: a lista fica vazia com aviso,
        // e o resto do painel do plantao segue utilizavel.
        const alvo = document.getElementById('folgaDomingoLista');

        if (alvo) {
            alvo.innerHTML = `<div class="folga-domingo-vazio">Nao foi possivel carregar: ${escapeHtml(erro.message)}</div>`;
        }

        return;
    }

    cachePorData.set(dataISO, folgas);
    renderLista(folgas);
}

function mostrarAviso(elemento, mensagem) {
    if (!elemento) {
        return;
    }

    elemento.textContent = mensagem || '';
    elemento.hidden = !mensagem;
}

// Qualquer gravacao muda o que a lista de pendencias mostra.
async function depoisDeGravar(dataISO) {
    cachePorData.clear();
    await carregarLista(dataISO, { forcar: true });
    await carregarPendenciasFolgasDomingo();
}

async function registrar(dataISO) {
    const botao = document.getElementById('btnRegistrarFolgaDomingo');
    const aviso = document.getElementById('folgaDomingoAviso');

    if (botao?.disabled) {
        return;
    }

    mostrarAviso(aviso, '');

    if (!rascunho.colaboradorId) {
        mostrarAviso(aviso, 'Escolha quem folgou neste domingo.');
        return;
    }

    const marcarAgora = rascunho.modo === MODO_AGORA;

    if (marcarAgora && !rascunho.dataReposicao) {
        mostrarAviso(aviso, 'Informe o dia da reposicao ou escolha "Deixar pendente".');
        return;
    }

    const payload = {
        colaboradorId: rascunho.colaboradorId,
        dataDomingo: dataISO,
        dataReposicao: marcarAgora ? rascunho.dataReposicao || null : null,
        reposicaoHoraInicio: marcarAgora ? rascunho.horaInicio || null : null,
        reposicaoHoraFim: marcarAgora ? rascunho.horaFim || null : null,
        reposicaoAlmocoInicio: marcarAgora ? rascunho.almocoInicio || null : null,
        reposicaoAlmocoFim: marcarAgora ? rascunho.almocoFim || null : null,
        observacao: rascunho.observacao.trim() || null
    };

    if (botao) {
        botao.disabled = true;
    }

    try {
        const dados = await API.post('/folgas-domingo', payload);
        mostrarToast(dados?.message || 'Folga registrada!', 'success');
        rascunho = novoRascunho(dataISO);
        await depoisDeGravar(dataISO);
        redesenharFormulario(dataISO);
    } catch (erro) {
        // Conflito (ferias, ajuste manual...) aparece aqui, junto do botao,
        // e o formulario continua preenchido para a pessoa so trocar a data.
        mostrarAviso(document.getElementById('folgaDomingoAviso'), erro.message);
    } finally {
        const atual = document.getElementById('btnRegistrarFolgaDomingo');

        if (atual) {
            atual.disabled = false;
        }
    }
}

// Refaz so o formulario (a lista e mantida) depois de limpar o rascunho.
function redesenharFormulario(dataISO) {
    const bloco = document.querySelector('[data-folga-domingo-data]');

    if (!bloco) {
        return;
    }

    const molde = document.createElement('div');
    molde.innerHTML = renderPainelFolgasDomingo(dataISO);
    const novoForm = molde.querySelector('#folgaDomingoForm');
    const formAtual = document.getElementById('folgaDomingoForm');

    if (novoForm && formAtual) {
        formAtual.replaceWith(novoForm);
        ligarFormulario(dataISO);
    }
}

async function remover(dataISO, folgaId) {
    if (!window.confirm('Remover o registro desta folga de domingo?')) {
        return;
    }

    try {
        const dados = await API.delete(`/folgas-domingo/${folgaId}`);
        mostrarToast(dados?.message || 'Folga removida.', 'success');

        if (edicao && edicao.id === Number(folgaId)) {
            edicao = null;
        }

        await depoisDeGravar(dataISO);
    } catch (erro) {
        mostrarToast(erro.message, 'error');
    }
}

async function salvarEdicao(dataISO) {
    if (!edicao) {
        return;
    }

    if (!edicao.dataReposicao) {
        edicao.aviso = 'Informe o dia da reposicao.';
        renderLista(cachePorData.get(dataISO) || []);
        return;
    }

    try {
        const dados = await API.put(`/folgas-domingo/${edicao.id}`, {
            dataReposicao: edicao.dataReposicao,
            reposicaoHoraInicio: edicao.horaInicio || null,
            reposicaoHoraFim: edicao.horaFim || null,
            reposicaoAlmocoInicio: edicao.almocoInicio || null,
            reposicaoAlmocoFim: edicao.almocoFim || null
        });
        mostrarToast(dados?.message || 'Reposicao salva.', 'success');
        edicao = null;
        await depoisDeGravar(dataISO);
    } catch (erro) {
        edicao.aviso = erro.message;
        renderLista(cachePorData.get(dataISO) || []);
    }
}

// Sugere horario e almoco da ficha do colaborador enquanto a pessoa ainda nao
// mexeu neles. Depois que ela edita qualquer horario, a sugestao para de
// sobrescrever.
function sugerirJornada() {
    if (rascunho.preenchidoAuto === false && (rascunho.horaInicio || rascunho.horaFim)) {
        return;
    }

    const jornada = jornadaDoColaborador(rascunho.colaboradorId);

    rascunho.horaInicio = jornada?.horaInicio || '';
    rascunho.horaFim = jornada?.horaFim || '';
    rascunho.almocoInicio = jornada?.almocoInicio || '';
    rascunho.almocoFim = jornada?.almocoFim || '';
    rascunho.preenchidoAuto = Boolean(jornada);
    rascunho.dica = jornada ? `Preenchido com a jornada de ${jornada.nome}. Ajuste se for diferente.` : '';

    const mapa = {
        folgaDomingoHoraInicio: rascunho.horaInicio,
        folgaDomingoHoraFim: rascunho.horaFim,
        folgaDomingoAlmocoInicio: rascunho.almocoInicio,
        folgaDomingoAlmocoFim: rascunho.almocoFim
    };

    Object.entries(mapa).forEach(([id, valor]) => {
        const campo = document.getElementById(id);

        if (campo) {
            campo.value = valor;
        }
    });

    const dica = document.getElementById('folgaDomingoDica');

    if (dica) {
        dica.textContent = rascunho.dica;
        dica.hidden = !rascunho.dica;
    }

}

// Liga os campos do formulario de nova folga ao rascunho.
function ligarFormulario(dataISO) {
    const form = document.getElementById('folgaDomingoForm');

    if (!form) {
        return;
    }

    const aviso = document.getElementById('folgaDomingoAviso');

    form.addEventListener('input', (evento) => {
        const campo = evento.target.closest('[data-campo]');

        if (!campo) {
            return;
        }

        rascunho[campo.getAttribute('data-campo')] = campo.value;

        // Mexer em horario ou almoco tira a sugestao da jornada de cena.
        if (['horaInicio', 'horaFim', 'almocoInicio', 'almocoFim'].includes(campo.getAttribute('data-campo'))) {
            rascunho.preenchidoAuto = false;
            rascunho.dica = '';
            const dica = document.getElementById('folgaDomingoDica');

            if (dica) {
                dica.hidden = true;
            }
        }

        mostrarAviso(aviso, '');
    });

    form.addEventListener('change', (evento) => {
        const alvo = evento.target;

        if (alvo.id === 'folgaDomingoColaborador') {
            rascunho.colaboradorId = alvo.value;
            sugerirJornada();
            mostrarAviso(aviso, '');
            return;
        }

        if (alvo.name === 'folgaDomingoModo') {
            rascunho.modo = alvo.value;
            document.getElementById('folgaDomingoReposicao').hidden = rascunho.modo !== MODO_AGORA;
            form.querySelectorAll('.folga-domingo-opcao').forEach((rotulo) => {
                rotulo.classList.toggle('is-ativa', rotulo.querySelector('input').checked);
            });
            mostrarAviso(aviso, '');
        }
    });

    document.getElementById('btnRegistrarFolgaDomingo')?.addEventListener('click', () => registrar(dataISO));
}

// Cliques e digitacao dentro dos cartoes (delegados: a lista e reescrita).
function ligarLista(dataISO) {
    const lista = document.getElementById('folgaDomingoLista');

    if (!lista) {
        return;
    }

    lista.addEventListener('input', (evento) => {
        const campo = evento.target.closest('[data-campo]');

        if (!campo || !edicao) {
            return;
        }

        const nome = campo.getAttribute('data-campo');
        edicao[nome] = campo.value;
        edicao.aviso = '';

        if (['horaInicio', 'horaFim', 'almocoInicio', 'almocoFim'].includes(nome)) {
            edicao.preenchidoAuto = false;
        }
    });

    lista.addEventListener('click', (evento) => {
        const remove = evento.target.closest('[data-remover-folga]');

        if (remove) {
            remover(dataISO, remove.getAttribute('data-remover-folga'));
            return;
        }

        const edita = evento.target.closest('[data-editar-folga]');

        if (edita) {
            const folga = (cachePorData.get(dataISO) || []).find((item) => Number(item.id) === Number(edita.getAttribute('data-editar-folga')));

            if (folga) {
                iniciarEdicao(folga);
                renderLista(cachePorData.get(dataISO));
            }

            return;
        }

        if (evento.target.closest('[data-salvar-folga]')) {
            salvarEdicao(dataISO);
            return;
        }

        if (evento.target.closest('[data-cancelar-folga]')) {
            edicao = null;
            renderLista(cachePorData.get(dataISO) || []);
        }
    });
}

// Liga os eventos depois que o painel do plantao trocou o innerHTML.
export function bindPainelFolgasDomingo(dataISO) {
    const bloco = document.querySelector('[data-folga-domingo-data]');

    if (!bloco || !ehDomingo(dataISO)) {
        return;
    }

    ligarFormulario(dataISO);
    ligarLista(dataISO);
    carregarLista(dataISO);
}

/* ---------------------------------------------------------------------
FOLGAS AGUARDANDO REPOSICAO (aba "Pendencias" da tela de plantoes)
Folgas de qualquer domingo que ainda nao tem dia de reposicao. Sem a lista a
pendencia so seria vista abrindo cada domingo, um por um.
--------------------------------------------------------------------- */

export function renderPendenciasFolgasDomingo() {
    return `
            <section class="pendencias-secao" id="folgasPendentes">
                <div class="pendencias-titulo">
                    <h4><i class="fas fa-scale-balanced"></i> Folgas de domingo aguardando reposicao</h4>
                    <span class="pendencias-contagem" id="folgasPendentesContagem">0</span>
                </div>
                <p class="pendencias-sub">Mais antigas primeiro; a etiqueta fica vermelha a partir de ${PRAZO_ATRASO_DIAS} dias. Marcar a reposicao abre o domingo no painel ao lado.</p>
                <div class="pendencias-lista" id="folgasPendentesLista">
                    <p class="pendencias-vazio">Carregando...</p>
                </div>
            </section>`;
}

const ROTULO_ESPERA = Object.freeze({
    atraso: 'pendencias-tag--atraso',
    espera: 'pendencias-tag--espera',
    futura: 'pendencias-tag--neutra'
});

function renderLinhaPendencia(folga) {
    const dias = diasEntre(folga.dataDomingo, hojeISO());

    return `
                <div class="pendencias-item">
                    <div>
                        <strong>${escapeHtml(folga.colaboradorNome)}</strong>
                        <span class="pendencias-tag ${ROTULO_ESPERA[classificarEsperaFolga(dias)]}">${escapeHtml(textoQuandoDias(dias))}</span>
                        <p>Domingo ${escapeHtml(dataCompleta(folga.dataDomingo))}</p>
                    </div>
                    <button type="button" class="btn-primary folga-domingo-btn" data-abrir-pendencia="${folga.id}" data-domingo="${escapeHtml(folga.dataDomingo)}">
                        <i class="fas fa-calendar-plus"></i> Marcar reposicao
                    </button>
                </div>`;
}

// Preenche a secao e devolve quantas folgas estao pendentes (o total vira o
// selo da aba). Avisa o resto da tela por evento, porque gravar pelo painel do
// domingo tambem muda esta lista.
export async function carregarPendenciasFolgasDomingo() {
    const lista = document.getElementById('folgasPendentesLista');
    const contagem = document.getElementById('folgasPendentesContagem');

    if (!lista) {
        return 0;
    }

    let folgas = [];

    try {
        const dados = await API.getFolgasDomingo({ pendentes: '1' });
        folgas = Array.isArray(dados?.items) ? dados.items : [];
    } catch (erro) {
        // Sem a migracao ou sem rede: a aba segue funcionando sem este bloco.
        lista.innerHTML = `<p class="pendencias-vazio">Nao foi possivel carregar: ${escapeHtml(erro.message)}</p>`;
        return 0;
    }

    // Mais antigas primeiro: a que esta esperando ha mais tempo e a mais urgente.
    folgas.sort((a, b) => String(a.dataDomingo).localeCompare(String(b.dataDomingo)));

    lista.innerHTML = folgas.length
        ? folgas.map(renderLinhaPendencia).join('')
        : '<p class="pendencias-vazio">Nada pendente aqui.</p>';

    if (contagem) {
        contagem.textContent = String(folgas.length);
        contagem.classList.toggle('is-zero', folgas.length === 0);
    }

    window.dispatchEvent(new CustomEvent('pendencias-plantao:atualizadas', { detail: { folgas: folgas.length } }));
    return folgas.length;
}

// `abrirDia(dataISO)` abre o domingo no painel lateral (quem sabe fazer isso e
// a tela de plantoes). O cartao da folga ja chega em modo de edicao.
export function ligarPendenciasFolgasDomingo(abrirDia) {
    document.getElementById('folgasPendentes')?.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('[data-abrir-pendencia]');

        if (!botao) {
            return;
        }

        edicao = null;
        abrirEdicaoDaFolgaId = Number(botao.getAttribute('data-abrir-pendencia'));
        await abrirDia(botao.getAttribute('data-domingo'));
    });
}

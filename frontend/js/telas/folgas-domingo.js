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

O painel do plantao se redesenha a cada tecla digitada no formulario
(renderPlantaoEditor e chamado de varios lugares). Por isso a lista de
folgas NAO e montada dentro do innerHTML dele: o HTML sai com um
container vazio e esta funcao preenche depois, em cima do container.
Assim digitar no plantao nao dispara uma requisicao por tecla.
===================================================================== */

import { API } from '../core/api.js';
import { mostrarToast } from '../core/app/horas-e-resumo.js';
import { estado } from '../core/estado.js';
import { escapeHtml } from '../lib/html-seguro.js';

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// Cache por data: evita refazer a chamada a cada redesenho do painel.
// Invalidado na mao depois de gravar ou remover.
const cachePorData = new Map();

function ehDomingo(dataISO) {
    const partes = String(dataISO || '').split('-').map(Number);

    if (partes.length !== 3 || partes.some(Number.isNaN)) {
        return false;
    }

    return new Date(Date.UTC(partes[0], partes[1] - 1, partes[2], 12)).getUTCDay() === 0;
}

function rotuloData(dataISO) {
    const partes = String(dataISO || '').split('-');

    if (partes.length !== 3) {
        return '--';
    }

    const dia = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12)).getUTCDay();
    return `${DIAS_CURTOS[dia]} ${partes[2]}/${partes[1]}`;
}

function hora(valor) {
    const bruto = String(valor || '').trim();
    return bruto.includes(':') ? bruto.slice(0, 5) : '';
}

function opcoesColaborador(selecionado) {
    return [
        '<option value="">Selecione...</option>',
        ...(estado.colaboradores || [])
            .map((c) => `<option value="${c.Id}" ${Number(selecionado) === Number(c.Id) ? 'selected' : ''}>${escapeHtml(c.Nome)}</option>`)
    ].join('');
}

// O HTML do painel. Sem a lista: ela chega depois, por carregarLista().
export function renderPainelFolgasDomingo(dataISO) {
    if (!ehDomingo(dataISO)) {
        return '';
    }

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

                <div class="folga-domingo-form">
                    <div class="folga-domingo-campo">
                        <small>Quem folgou</small>
                        <select id="folgaDomingoColaborador" class="form-control">${opcoesColaborador('')}</select>
                    </div>
                    <div class="folga-domingo-campo">
                        <small>Repoe em (opcional)</small>
                        <input type="date" id="folgaDomingoDataReposicao" class="form-control">
                    </div>
                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Horario da reposicao</small>
                        <div class="folga-domingo-par">
                            <input type="time" id="folgaDomingoHoraInicio" class="form-control">
                            <span>ate</span>
                            <input type="time" id="folgaDomingoHoraFim" class="form-control">
                        </div>
                    </div>
                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Almoco da reposicao</small>
                        <div class="folga-domingo-par">
                            <input type="time" id="folgaDomingoAlmocoInicio" class="form-control">
                            <span>ate</span>
                            <input type="time" id="folgaDomingoAlmocoFim" class="form-control">
                        </div>
                    </div>
                    <div class="folga-domingo-campo folga-domingo-campo--largo">
                        <small>Observacao</small>
                        <input type="text" id="folgaDomingoObservacao" class="form-control" maxlength="500">
                    </div>
                    <button type="button" class="btn-primary" id="btnRegistrarFolgaDomingo">
                        <i class="fas fa-plus"></i> Registrar folga
                    </button>
                </div>
            </div>
        `;
}

function renderLista(folgas) {
    const alvo = document.getElementById('folgaDomingoLista');

    if (!alvo) {
        return;
    }

    if (!folgas.length) {
        alvo.innerHTML = '<div class="folga-domingo-vazio">Nenhuma folga registrada neste domingo.</div>';
        return;
    }

    alvo.innerHTML = folgas.map((folga) => {
        const almoco = folga.reposicaoAlmocoInicio && folga.reposicaoAlmocoFim
            ? ` · almoco ${hora(folga.reposicaoAlmocoInicio)}–${hora(folga.reposicaoAlmocoFim)}`
            : '';
        const reposicao = folga.dataReposicao
            ? `repoe ${rotuloData(folga.dataReposicao)} ${hora(folga.reposicaoHoraInicio)}–${hora(folga.reposicaoHoraFim)}${almoco}`
            : '<span class="folga-domingo-pendente">reposicao nao marcada</span>';

        return `
                <div class="folga-domingo-item">
                    <div>
                        <strong>${escapeHtml(folga.colaboradorNome)}</strong>
                        <p>${reposicao}</p>
                        ${folga.observacao ? `<p class="folga-domingo-obs">${escapeHtml(folga.observacao)}</p>` : ''}
                    </div>
                    <button type="button" class="btn-danger-ghost" data-remover-folga="${folga.id}" title="Remover registro">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
    }).join('');
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

async function registrar(dataISO) {
    const botao = document.getElementById('btnRegistrarFolgaDomingo');

    if (botao?.disabled) {
        return;
    }

    const colaboradorId = document.getElementById('folgaDomingoColaborador')?.value;

    if (!colaboradorId) {
        mostrarToast('Escolha quem folgou neste domingo.', 'warning');
        return;
    }

    const payload = {
        colaboradorId,
        dataDomingo: dataISO,
        dataReposicao: document.getElementById('folgaDomingoDataReposicao')?.value || null,
        reposicaoHoraInicio: document.getElementById('folgaDomingoHoraInicio')?.value || null,
        reposicaoHoraFim: document.getElementById('folgaDomingoHoraFim')?.value || null,
        reposicaoAlmocoInicio: document.getElementById('folgaDomingoAlmocoInicio')?.value || null,
        reposicaoAlmocoFim: document.getElementById('folgaDomingoAlmocoFim')?.value || null,
        observacao: document.getElementById('folgaDomingoObservacao')?.value.trim() || null
    };

    if (botao) {
        botao.disabled = true;
    }

    try {
        const dados = await API.post('/folgas-domingo', payload);
        mostrarToast(dados?.message || 'Folga registrada!', 'success');
        await carregarLista(dataISO, { forcar: true });
        limparFormulario();
    } catch (erro) {
        mostrarToast(erro.message, 'error');
    } finally {
        if (botao) {
            botao.disabled = false;
        }
    }
}

function limparFormulario() {
    ['folgaDomingoColaborador', 'folgaDomingoDataReposicao', 'folgaDomingoHoraInicio',
        'folgaDomingoHoraFim', 'folgaDomingoAlmocoInicio', 'folgaDomingoAlmocoFim',
        'folgaDomingoObservacao']
        .forEach((id) => {
            const campo = document.getElementById(id);

            if (campo) {
                campo.value = '';
            }
        });
}

async function remover(dataISO, folgaId) {
    if (!window.confirm('Remover o registro desta folga de domingo?')) {
        return;
    }

    try {
        const dados = await API.delete(`/folgas-domingo/${folgaId}`);
        mostrarToast(dados?.message || 'Folga removida.', 'success');
        await carregarLista(dataISO, { forcar: true });
    } catch (erro) {
        mostrarToast(erro.message, 'error');
    }
}

// Liga os eventos depois que o painel do plantao trocou o innerHTML.
export function bindPainelFolgasDomingo(dataISO) {
    const bloco = document.querySelector('[data-folga-domingo-data]');

    if (!bloco || !ehDomingo(dataISO)) {
        return;
    }

    document.getElementById('btnRegistrarFolgaDomingo')?.addEventListener('click', () => registrar(dataISO));

    document.getElementById('folgaDomingoLista')?.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-remover-folga]');

        if (botao) {
            remover(dataISO, botao.getAttribute('data-remover-folga'));
        }
    });

    carregarLista(dataISO);
}

/* =====================================================================
REPOR DOMINGO (Escala do Dia)
---------------------------------------------------------------------
"O Vinicius vem repor hoje": quem monta a escala de uma quinta pensa no dia,
nao no domingo que ficou para tras. Este botao da barra do dia lista as
folgas de domingo ainda sem reposicao e grava o dia aberto como o dia da
reposicao da que for escolhida.

E uma acao do DIA, nao da linha de um colaborador: quem esta de folga pela
jornada semanal nao tem linha na escala do dia (so existe linha para quem
trabalha, tem plantao ou ausencia), entao nao ha onde pendurar um botao por
pessoa.

O conflito (ferias, ajuste manual...) e recusado pelo servidor com o motivo,
e a mensagem aparece aqui no dialogo — a mesma regra do cadastro da folga.
===================================================================== */

import { API } from '../../core/api.js';
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { dataCompleta, jornadaDoColaborador, rotuloData, textoQuando } from '../folgas-domingo.js';
import { getIsoDayOfWeekEscala } from '../escala-dia-shared.js';

// Quantas folgas aguardam reposicao muda so quando alguem grava; uma janela
// curta evita repetir a chamada a cada atualizacao do cabecalho do dia.
const VALIDADE_CACHE_MS = 10 * 1000;
let cachePendentes = null;

async function buscarPendentes({ forcar = false } = {}) {
    if (!forcar && cachePendentes && Date.now() - cachePendentes.em < VALIDADE_CACHE_MS) {
        return cachePendentes.itens;
    }

    const dados = await API.getFolgasDomingo({ pendentes: '1' });
    const itens = (Array.isArray(dados?.items) ? dados.items : [])
        .sort((a, b) => String(a.dataDomingo).localeCompare(String(b.dataDomingo)));

    cachePendentes = { em: Date.now(), itens };
    return itens;
}

// Mostra o botao (com a contagem) so quando ha o que repor e o dia nao e
// domingo — a reposicao nao cai no proprio domingo folgado.
export async function atualizarBotaoReporDomingoEscala(dataISO) {
    const botao = document.getElementById('btnReporDomingoEscala');

    if (!botao) {
        return;
    }

    if (getIsoDayOfWeekEscala(dataISO) === 0) {
        botao.hidden = true;
        return;
    }

    let pendentes = [];

    try {
        pendentes = await buscarPendentes();
    } catch (erro) {
        // Sem a migracao ou sem rede: o botao simplesmente nao aparece.
        botao.hidden = true;
        return;
    }

    const badge = botao.querySelector('.escala-acao-badge');

    if (badge) {
        badge.textContent = String(pendentes.length);
    }

    botao.title = `Repor domingo: ${pendentes.length} folga${pendentes.length === 1 ? '' : 's'} aguardando reposicao`;
    botao.hidden = pendentes.length === 0;
}

function textoOpcao(folga) {
    return `${folga.colaboradorNome} — domingo ${dataCompleta(folga.dataDomingo)} (${textoQuando(folga.dataDomingo)})`;
}

function marcarAviso(elemento, mensagem) {
    elemento.textContent = mensagem || '';
    elemento.hidden = !mensagem;
}

// Abre o dialogo. `aoGravar` roda depois de gravar (a tela recarrega o dia).
export async function abrirReporDomingoEscala(dataISO, { aoGravar } = {}) {
    if (getIsoDayOfWeekEscala(dataISO) === 0) {
        mostrarToast('A reposicao nao pode cair num domingo. Escolha outro dia.', 'warning');
        return;
    }

    let pendentes = [];

    try {
        pendentes = await buscarPendentes({ forcar: true });
    } catch (erro) {
        mostrarToast(erro.message || 'Nao foi possivel carregar as folgas pendentes.', 'error');
        return;
    }

    if (!pendentes.length) {
        mostrarToast('Nenhuma folga de domingo aguardando reposicao.', 'info');
        atualizarBotaoReporDomingoEscala(dataISO);
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active reposicao-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'reporDomingoTitulo');
    modal.innerHTML = `
            <div class="modal-content reposicao-modal-content">
                <div class="modal-header">
                    <h3 id="reporDomingoTitulo">Repor domingo em ${escapeHtml(rotuloData(dataISO))}</h3>
                    <button type="button" class="modal-close" data-fechar aria-label="Fechar">&times;</button>
                </div>
                <div class="modal-body reposicao-modal-corpo">
                    <div class="folga-domingo-campo">
                        <small>Quem repoe</small>
                        <select id="reporDomingoFolga" class="form-control">
                            ${pendentes.map((folga) => `<option value="${folga.id}">${escapeHtml(textoOpcao(folga))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="folga-domingo-campo">
                        <small>Horario da reposicao</small>
                        <div class="folga-domingo-par">
                            <input type="time" id="reporDomingoHoraInicio" class="form-control" aria-label="Inicio do horario">
                            <span>ate</span>
                            <input type="time" id="reporDomingoHoraFim" class="form-control" aria-label="Fim do horario">
                        </div>
                    </div>
                    <div class="folga-domingo-campo">
                        <small>Almoco da reposicao</small>
                        <div class="folga-domingo-par">
                            <input type="time" id="reporDomingoAlmocoInicio" class="form-control" aria-label="Inicio do almoco">
                            <span>ate</span>
                            <input type="time" id="reporDomingoAlmocoFim" class="form-control" aria-label="Fim do almoco">
                        </div>
                    </div>
                    <p class="folga-domingo-dica" id="reporDomingoDica" hidden></p>
                    <div class="folga-domingo-aviso" id="reporDomingoAviso" role="alert" hidden></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" data-fechar>Cancelar</button>
                    <button type="button" class="btn-primary" id="reporDomingoConfirmar">Confirmar reposicao</button>
                </div>
            </div>
        `;

    const $ = (id) => modal.querySelector(`#${id}`);
    const campos = {
        horaInicio: $('reporDomingoHoraInicio'),
        horaFim: $('reporDomingoHoraFim'),
        almocoInicio: $('reporDomingoAlmocoInicio'),
        almocoFim: $('reporDomingoAlmocoFim')
    };
    let sugestaoAtiva = true;

    const fechar = () => {
        document.removeEventListener('keydown', aoTeclar);
        modal.remove();
    };

    function aoTeclar(evento) {
        if (evento.key === 'Escape') {
            fechar();
        }
    }

    // Sugere a jornada de cadastro de quem foi escolhido, enquanto a pessoa nao
    // tiver mexido nos horarios.
    const sugerirJornada = () => {
        const folga = pendentes.find((item) => Number(item.id) === Number($('reporDomingoFolga').value));
        const jornada = folga ? jornadaDoColaborador(folga.colaboradorId) : null;
        const dica = $('reporDomingoDica');

        campos.horaInicio.value = jornada?.horaInicio || '';
        campos.horaFim.value = jornada?.horaFim || '';
        campos.almocoInicio.value = jornada?.almocoInicio || '';
        campos.almocoFim.value = jornada?.almocoFim || '';
        dica.textContent = jornada ? `Horario preenchido com a jornada de ${jornada.nome}. Ajuste se for diferente.` : '';
        dica.hidden = !jornada;
    };

    const confirmar = async () => {
        const aviso = $('reporDomingoAviso');
        const botao = $('reporDomingoConfirmar');
        marcarAviso(aviso, '');

        if (!campos.horaInicio.value || !campos.horaFim.value) {
            marcarAviso(aviso, 'Informe o horario da reposicao.');
            return;
        }

        botao.disabled = true;

        try {
            const dados = await API.put(`/folgas-domingo/${$('reporDomingoFolga').value}`, {
                dataReposicao: dataISO,
                reposicaoHoraInicio: campos.horaInicio.value,
                reposicaoHoraFim: campos.horaFim.value,
                reposicaoAlmocoInicio: campos.almocoInicio.value || null,
                reposicaoAlmocoFim: campos.almocoFim.value || null
            });

            cachePendentes = null;
            fechar();
            mostrarToast(dados?.message || 'Reposicao marcada.', 'success');

            if (aoGravar) {
                await aoGravar();
            }
        } catch (erro) {
            // Conflito (ferias, ajuste manual...) fica no dialogo, que segue aberto.
            marcarAviso(aviso, erro.message);
            botao.disabled = false;
        }
    };

    modal.addEventListener('click', (evento) => {
        if (evento.target === modal || evento.target.closest('[data-fechar]')) {
            fechar();
        }
    });
    modal.addEventListener('input', (evento) => {
        if (evento.target.type === 'time') {
            sugestaoAtiva = false;
        }

        marcarAviso($('reporDomingoAviso'), '');
    });
    $('reporDomingoFolga').addEventListener('change', () => {
        if (sugestaoAtiva) {
            sugerirJornada();
        }
    });
    $('reporDomingoConfirmar').addEventListener('click', confirmar);

    document.addEventListener('keydown', aoTeclar);
    document.body.appendChild(modal);
    sugerirJornada();
    $('reporDomingoFolga').focus();
}

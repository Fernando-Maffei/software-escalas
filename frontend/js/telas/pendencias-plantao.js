/* =====================================================================
ABA "PENDENCIAS" DA TELA DE PLANTOES
---------------------------------------------------------------------
Reune o que exige uma acao e que, antes, so aparecia abrindo cada dia:

- folgas de domingo aguardando reposicao  (lista em folgas-domingo.js);
- plantoes dos proximos 30 dias sem ninguem da equipe lancado.

Cada linha leva ao dia ou abre o que resolve a pendencia, no mesmo painel
lateral da tela. O selo da aba soma as duas listas. "Colaboradores sem jornada"
fica so no Dashboard (nao e assunto de plantao).
===================================================================== */

import { estado } from '../core/estado.js';
import { formatarHoraInput } from '../core/runtime/plantao-colaboradores/helpers.js';
import { PLANTAO_CREDITO_META, normalizarTipoCreditoPlantao } from '../core/runtime/plantao-colaboradores/plantao-editor.js';
import { escapeHtml } from '../lib/html-seguro.js';
import { JANELA_PLANTOES_DIAS, hojeISO, plantoesSemEquipe, textoQuando } from '../lib/pendencias-plantao.js';
import {
    carregarPendenciasFolgasDomingo,
    dataCompleta,
    ligarPendenciasFolgasDomingo,
    renderPendenciasFolgasDomingo
} from './folgas-domingo.js';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
// Plantao ate esta distancia ganha destaque ambar; alem dela a etiqueta e neutra.
const PROXIMO_EM_DIAS = 7;

const contagem = { folgas: 0, plantoes: 0 };
let ouvindoAtualizacoes = false;

function nomeDoDia(dataISO) {
    const [ano, mes, dia] = String(dataISO).split('-').map(Number);

    return DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()];
}

function atualizarSelo() {
    const selo = document.getElementById('plantaoAbaPendenciasContagem');
    const total = contagem.folgas + contagem.plantoes;

    if (selo) {
        selo.textContent = String(total);
        selo.hidden = total === 0;
    }
}

function rotuloTurno(turno) {
    const horario = `${formatarHoraInput(turno.horaInicio)}–${formatarHoraInput(turno.horaFim)}`;
    const credito = PLANTAO_CREDITO_META[normalizarTipoCreditoPlantao(turno.tipoCredito)]?.label || '';

    return credito ? `${horario} (${credito.toLowerCase()})` : horario;
}

function renderLinhaPlantao(dia) {
    const tag = dia.dias <= PROXIMO_EM_DIAS ? 'pendencias-tag--espera' : 'pendencias-tag--neutra';
    const turnos = dia.turnos.map(rotuloTurno).join(' · ');

    return `
                <div class="pendencias-item">
                    <div>
                        <strong>${escapeHtml(nomeDoDia(dia.dataISO))} ${escapeHtml(dataCompleta(dia.dataISO))}</strong>
                        <span class="pendencias-tag ${tag}">${escapeHtml(textoQuando(-dia.dias))}</span>
                        <p>${escapeHtml(turnos)} · nenhum colaborador lancado</p>
                    </div>
                    <button type="button" class="btn-secondary folga-domingo-btn" data-abrir-plantao-dia="${escapeHtml(dia.dataISO)}">
                        <i class="fas fa-users"></i> Abrir plantao
                    </button>
                </div>`;
}

function renderPlantoesSemEquipe() {
    const lista = document.getElementById('plantoesSemEquipeLista');
    const selo = document.getElementById('plantoesSemEquipeContagem');

    if (!lista) {
        return 0;
    }

    const dias = plantoesSemEquipe(estado.plantoesLancados || [], hojeISO());

    lista.innerHTML = dias.length
        ? dias.map(renderLinhaPlantao).join('')
        : '<p class="pendencias-vazio">Nada pendente aqui.</p>';

    if (selo) {
        selo.textContent = String(dias.length);
        selo.classList.toggle('is-zero', dias.length === 0);
    }

    return dias.length;
}

export function renderAbaPendenciasPlantao() {
    return `
                ${renderPendenciasFolgasDomingo()}

                <section class="pendencias-secao" id="plantoesSemEquipe">
                    <div class="pendencias-titulo">
                        <h4><i class="fas fa-calendar-xmark"></i> Plantoes sem equipe</h4>
                        <span class="pendencias-contagem" id="plantoesSemEquipeContagem">0</span>
                    </div>
                    <p class="pendencias-sub">Proximos ${JANELA_PLANTOES_DIAS} dias, do mais proximo para o mais distante.</p>
                    <div class="pendencias-lista" id="plantoesSemEquipeLista">
                        <p class="pendencias-vazio">Carregando...</p>
                    </div>
                </section>`;
}

// Chamada a cada desenho da tela: os plantoes vem do estado (ja carregado pela
// tela) e as folgas, da API.
export async function carregarPendenciasPlantao() {
    if (!ouvindoAtualizacoes) {
        ouvindoAtualizacoes = true;
        // Gravar uma reposicao pelo painel do domingo muda a lista de folgas sem
        // redesenhar a tela: o selo da aba acompanha por este evento.
        window.addEventListener('pendencias-plantao:atualizadas', (evento) => {
            contagem.folgas = Number(evento.detail?.folgas) || 0;
            atualizarSelo();
        });
    }

    contagem.plantoes = renderPlantoesSemEquipe();
    atualizarSelo();
    contagem.folgas = await carregarPendenciasFolgasDomingo();
    atualizarSelo();
}

// Depois de salvar ou excluir um plantao so a lista de plantoes mudou: refaz
// "Plantoes sem equipe" e o selo sem buscar as folgas de novo.
export function atualizarPlantoesSemEquipe() {
    contagem.plantoes = renderPlantoesSemEquipe();
    atualizarSelo();
}

// `abrirDia(dataISO)` abre o dia no painel lateral da tela de plantoes.
export function ligarPendenciasPlantao(abrirDia) {
    ligarPendenciasFolgasDomingo(abrirDia);

    document.getElementById('plantoesSemEquipe')?.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('[data-abrir-plantao-dia]');

        if (botao) {
            await abrirDia(botao.getAttribute('data-abrir-plantao-dia'));
        }
    });
}

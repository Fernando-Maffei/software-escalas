/* =====================================================================
TELA DE COBERTURAS DE PLANTONISTA
---------------------------------------------------------------------
Quem assume o horario de um plantonista que esta fora (ferias, folga,
ausencia) ou numa troca combinada (cobertura avulsa).

  - "Precisam de cobertura": ferias/folga/ausencia de plantonista que
    ainda nao terminou e nao tem cobertura. "Abrir cobertura" cria a
    cobertura com o horario do titular ja dividido por dia.
  - "Coberturas": as do periodo, com a situacao (coberto, parcial,
    pendente). Abrir mostra a janela de cada uma (editor.js).
  - "Nova cobertura avulsa": titular e periodo, sem ausencia.

Os horarios de dia util viram trabalho do substituto na Escala do Dia e
no banco de horas; os de sabado, domingo e feriado viram plantao.
===================================================================== */

import { API } from '../../core/api.js';
import { appContent } from '../../core/app.js';
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { estado } from '../../core/estado.js';
import { carregarAusencias, carregarColaboradores } from '../../core/runtime/dados-e-modais.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { hojeISO } from '../../lib/pendencias-plantao.js';
import { ROTULOS_ORIGEM, ROTULOS_SITUACAO, ausenciasSemCobertura, dataBr, rotuloOrigem, textoDuracao } from '../../lib/coberturas.js';
import { abrirEditorCobertura } from './editor.js';

// Periodo padrao da lista: um mes para tras e tres para frente.
function somarDias(dataISO, dias) {
    const data = new Date(`${dataISO}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
}

const filtros = { dataInicio: null, dataFim: null, soPendentes: false };
let coberturas = [];
let precisam = [];

function renderPrecisam() {
    if (precisam.length === 0) {
        return '<p class="coberturas-vazio">Nenhum plantonista fora sem cobertura.</p>';
    }

    return precisam.map((item) => `
            <div class="coberturas-item">
                <div>
                    <strong>${escapeHtml(item.colaboradorNome)}</strong>
                    <span class="cobertura-chip is-pendente">${escapeHtml(ROTULOS_ORIGEM[item.tipo] || 'Ausencia')}</span>
                    <p>${escapeHtml(dataBr(item.dataInicio))} a ${escapeHtml(dataBr(item.dataFim))}</p>
                </div>
                <button type="button" class="btn-secondary" data-abrir-ausencia="${item.id}" data-titular="${item.colaboradorId}">
                    <i class="fas fa-user-plus" aria-hidden="true"></i> Abrir cobertura
                </button>
            </div>`).join('');
}

function renderListaCoberturas() {
    const lista = filtros.soPendentes
        ? coberturas.filter((item) => ['pendente', 'parcial'].includes(item.resumo.situacao))
        : coberturas;

    if (lista.length === 0) {
        return '<p class="coberturas-vazio">Nenhuma cobertura neste periodo.</p>';
    }

    return lista.map((item) => {
        const quem = [...new Set(item.trechos.map((trecho) => trecho.substitutoNome).filter(Boolean))];
        const pendente = item.resumo.minutosPendentes
            ? ` · ${textoDuracao(item.resumo.minutosPendentes)} sem ninguem`
            : '';

        return `
            <div class="coberturas-item">
                <div>
                    <strong>${escapeHtml(item.titularNome || 'Colaborador')}</strong>
                    <span class="cobertura-chip is-${escapeHtml(item.resumo.situacao)}">${escapeHtml(ROTULOS_SITUACAO[item.resumo.situacao])}</span>
                    <p>${escapeHtml(dataBr(item.dataInicio))} a ${escapeHtml(dataBr(item.dataFim))} · ${escapeHtml(rotuloOrigem(item))}${escapeHtml(pendente)}</p>
                    ${quem.length ? `<p class="coberturas-quem">Cobrindo: ${escapeHtml(quem.join(', '))}</p>` : ''}
                </div>
                <button type="button" class="btn-secondary" data-abrir-cobertura="${item.id}">
                    <i class="fas fa-pen" aria-hidden="true"></i> Abrir
                </button>
            </div>`;
    }).join('');
}

function redesenharListas() {
    const alvoPrecisam = document.getElementById('coberturasPrecisam');
    const alvoLista = document.getElementById('coberturasLista');
    const contagem = document.getElementById('coberturasPrecisamContagem');

    if (alvoPrecisam) {
        alvoPrecisam.innerHTML = renderPrecisam();
    }

    if (contagem) {
        contagem.textContent = String(precisam.length);
    }

    if (alvoLista) {
        alvoLista.innerHTML = renderListaCoberturas();
    }
}

async function carregarDados() {
    const hoje = hojeISO();
    const [listaPeriodo, comAusencia] = await Promise.all([
        API.getCoberturas({ dataInicio: filtros.dataInicio, dataFim: filtros.dataFim }),
        // Para saber quais ausencias ja tem cobertura, olha tudo de hoje em diante.
        API.getCoberturas({ dataInicio: hoje, dataFim: somarDias(hoje, 400) }),
        carregarColaboradores(),
        carregarAusencias()
    ]);

    coberturas = Array.isArray(listaPeriodo) ? listaPeriodo : listaPeriodo?.items || [];
    const futuras = Array.isArray(comAusencia) ? comAusencia : comAusencia?.items || [];
    precisam = ausenciasSemCobertura(estado.ausencias, estado.colaboradores, futuras, hoje);
}

async function atualizar() {
    try {
        await carregarDados();
    } catch (error) {
        mostrarToast(`Erro ao carregar as coberturas: ${error.message}`, 'error');
    }

    redesenharListas();
}

async function abrirPorId(id) {
    try {
        abrirEditorCobertura(await API.getCobertura(id), atualizar);
    } catch (error) {
        mostrarToast(error.message || 'Nao foi possivel abrir a cobertura.', 'error');
    }
}

async function criar(corpo) {
    try {
        const resposta = await API.criarCobertura(corpo);
        await atualizar();
        abrirEditorCobertura(resposta.data, atualizar);
    } catch (error) {
        mostrarToast(error.message || 'Nao foi possivel abrir a cobertura.', 'error');
    }
}

function renderFormAvulsa() {
    const opcoes = (estado.colaboradores || [])
        .filter((item) => item.Ativo !== false && item.Ativo !== 0)
        .sort((a, b) => String(a.Nome).localeCompare(String(b.Nome), 'pt-BR'))
        .map((item) => `<option value="${Number(item.Id)}">${escapeHtml(item.Nome)}${item.IsPlantonista ? ' (plantonista)' : ''}</option>`)
        .join('');

    return `
            <form id="coberturaAvulsaForm" class="coberturas-avulsa" hidden>
                <label>
                    <span>Titular (de quem e o horario)</span>
                    <select name="titularId" required><option value="">Escolha</option>${opcoes}</select>
                </label>
                <label><span>De</span><input type="date" name="dataInicio" required></label>
                <label><span>Ate</span><input type="date" name="dataFim" required></label>
                <button type="submit" class="btn-primary">Criar e abrir</button>
            </form>`;
}

function ligar() {
    appContent.querySelector('.coberturas-page')?.addEventListener('click', (evento) => {
        const ausencia = evento.target.closest('[data-abrir-ausencia]');

        if (ausencia) {
            criar({ titularId: Number(ausencia.dataset.titular), ausenciaId: Number(ausencia.dataset.abrirAusencia) });
            return;
        }

        const cobertura = evento.target.closest('[data-abrir-cobertura]');

        if (cobertura) {
            abrirPorId(Number(cobertura.dataset.abrirCobertura));
            return;
        }

        if (evento.target.closest('#coberturaNovaAvulsa')) {
            const form = document.getElementById('coberturaAvulsaForm');
            form.hidden = !form.hidden;
        }
    });

    document.getElementById('coberturaAvulsaForm')?.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.target);
        criar({
            titularId: Number(dados.get('titularId')),
            dataInicio: dados.get('dataInicio'),
            dataFim: dados.get('dataFim')
        });
    });

    document.getElementById('coberturasFiltros')?.addEventListener('change', (evento) => {
        const campo = evento.target.name;

        if (campo === 'soPendentes') {
            filtros.soPendentes = evento.target.checked;
            redesenharListas();
            return;
        }

        if (campo === 'dataInicio' || campo === 'dataFim') {
            filtros[campo] = evento.target.value;

            if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio <= filtros.dataFim) {
                atualizar();
            }
        }
    });
}

export async function renderCoberturas() {
    if (!appContent) {
        return;
    }

    const hoje = hojeISO();
    filtros.dataInicio = filtros.dataInicio || somarDias(hoje, -30);
    filtros.dataFim = filtros.dataFim || somarDias(hoje, 90);

    appContent.innerHTML = '<div class="coberturas-page"><p class="coberturas-vazio">Carregando...</p></div>';

    try {
        await carregarDados();
    } catch (error) {
        mostrarToast(`Erro ao carregar as coberturas: ${error.message}`, 'error');
    }

    appContent.innerHTML = `
            <div class="coberturas-page">
                <div class="page-header">
                    <div>
                        <h1><i class="fas fa-people-arrows"></i> Coberturas</h1>
                        <p>Quem assume o horario do plantonista que esta fora. Dia util entra na escala e no banco de horas; sabado, domingo e feriado viram plantao.</p>
                    </div>
                    <button type="button" class="btn-primary" id="coberturaNovaAvulsa">
                        <i class="fas fa-plus" aria-hidden="true"></i> Nova cobertura avulsa
                    </button>
                </div>

                ${renderFormAvulsa()}

                <section class="coberturas-secao">
                    <div class="coberturas-secao-topo">
                        <h3><i class="fas fa-bell" aria-hidden="true"></i> Precisam de cobertura</h3>
                        <span class="coberturas-contagem" id="coberturasPrecisamContagem">${precisam.length}</span>
                    </div>
                    <p class="coberturas-sub">Ferias, folga ou ausencia de plantonista, de hoje em diante, ainda sem cobertura.</p>
                    <div id="coberturasPrecisam" class="coberturas-lista">${renderPrecisam()}</div>
                </section>

                <section class="coberturas-secao">
                    <div class="coberturas-secao-topo">
                        <h3><i class="fas fa-list" aria-hidden="true"></i> Coberturas</h3>
                        <form id="coberturasFiltros" class="coberturas-filtros">
                            <label><span>De</span><input type="date" name="dataInicio" value="${escapeHtml(filtros.dataInicio)}"></label>
                            <label><span>Ate</span><input type="date" name="dataFim" value="${escapeHtml(filtros.dataFim)}"></label>
                            <label class="coberturas-check"><input type="checkbox" name="soPendentes"${filtros.soPendentes ? ' checked' : ''}> So com horario descoberto</label>
                        </form>
                    </div>
                    <div id="coberturasLista" class="coberturas-lista">${renderListaCoberturas()}</div>
                </section>
            </div>

            <div id="coberturaEditor" class="cobertura-modal" role="dialog" aria-modal="true" hidden></div>`;

    ligar();

    // Vindo das Pendencias de plantao com uma cobertura escolhida.
    if (estado.coberturaAbrirId) {
        const id = estado.coberturaAbrirId;
        estado.coberturaAbrirId = undefined;
        await abrirPorId(id);
    }
}

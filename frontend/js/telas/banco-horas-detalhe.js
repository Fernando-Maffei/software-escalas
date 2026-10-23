/* ===========================
BANCO DE HORAS: o "i" de cada valor
Mostra de onde veio um saldo: o saldo anterior, cada plantao somado e cada
folga/ausencia descontada, com a data. Antes, para descobrir por que uma
semana descontou, era preciso testar lancamento por lancamento.
=========================== */

import { escapeHtml } from '../lib/html-seguro.js';

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const POPOVER_ID = 'bhDetalhePopover';

function dataCurta(dataISO) {
    const [, mes, dia] = String(dataISO || '').split('-');
    return `${dia}/${mes}`;
}

function diaSemana(dataISO) {
    const data = new Date(`${dataISO}T00:00:00Z`);
    return Number.isNaN(data.getTime()) ? '' : DIAS_SEMANA[data.getUTCDay()];
}

function rotuloPeriodo(item) {
    if (item.dataInicio === item.dataFim) {
        return `${dataCurta(item.dataInicio)} <small>${diaSemana(item.dataInicio)}</small>`;
    }
    return `${dataCurta(item.dataInicio)} a ${dataCurta(item.dataFim)}`;
}

function renderLista(itens, sinal, vazio) {
    if (!itens || itens.length === 0) {
        return `<li class="bh-detalhe-vazio">${vazio}</li>`;
    }
    return itens.map((item) => `
            <li>
                <span class="bh-detalhe-data">${rotuloPeriodo(item)}</span>
                <span class="bh-detalhe-desc">${escapeHtml(item.descricao)}</span>
                <span class="bh-detalhe-valor">${sinal}${escapeHtml(item.formatado)}</span>
            </li>
        `).join('');
}

function somaFormatada(itens) {
    const total = (itens || []).reduce((soma, item) => soma + (Number(item.minutos) || 0), 0);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// conteudo = { titulo, anteriorRotulo, anteriorFormatado, detalhes,
//              resultadoRotulo, resultadoFormatado, rodape }
export function htmlDetalhe(conteudo) {
    const detalhes = conteudo.detalhes || {};
    const creditos = detalhes.creditos || [];
    const descontos = detalhes.descontos || [];

    return `
            <div class="bh-detalhe-titulo">${escapeHtml(conteudo.titulo)}</div>
            ${detalhes.janelaInicio ? `<div class="bh-detalhe-janela">Periodo somado: ${dataCurta(detalhes.janelaInicio)} (${diaSemana(detalhes.janelaInicio)}) a ${dataCurta(detalhes.janelaFim)} (${diaSemana(detalhes.janelaFim)})</div>` : ''}
            <div class="bh-detalhe-linha">
                <span>${escapeHtml(conteudo.anteriorRotulo)}</span>
                <strong>${escapeHtml(conteudo.anteriorFormatado)}</strong>
            </div>
            <div class="bh-detalhe-secao is-credito">Acrescentado <strong>+${somaFormatada(creditos)}</strong></div>
            <ul class="bh-detalhe-lista">${renderLista(creditos, '+', 'Nenhum plantao no periodo')}</ul>
            <div class="bh-detalhe-secao is-desconto">Descontado <strong>-${somaFormatada(descontos)}</strong></div>
            <ul class="bh-detalhe-lista">${renderLista(descontos, '-', 'Nenhuma folga ou ausencia no periodo')}</ul>
            <div class="bh-detalhe-linha bh-detalhe-resultado">
                <span>${escapeHtml(conteudo.resultadoRotulo)}</span>
                <strong>${escapeHtml(conteudo.resultadoFormatado)}</strong>
            </div>
            ${conteudo.rodape ? `<div class="bh-detalhe-rodape">${conteudo.rodape}</div>` : ''}
        `;
}

export function fecharDetalhe() {
    const existente = document.getElementById(POPOVER_ID);
    if (existente) {
        existente.remove();
    }
    document.removeEventListener('mousedown', fecharAoClicarFora, true);
    document.removeEventListener('keydown', fecharComEsc, true);
    window.removeEventListener('resize', fecharDetalhe);
    window.removeEventListener('scroll', fecharDetalhe, true);
}

function fecharAoClicarFora(evento) {
    const popover = document.getElementById(POPOVER_ID);
    if (popover && !popover.contains(evento.target) && !evento.target.closest('.bh-info')) {
        fecharDetalhe();
    }
}

function fecharComEsc(evento) {
    if (evento.key === 'Escape') {
        evento.stopPropagation();
        fecharDetalhe();
    }
}

// Abre o cartao junto do botao "i". `html` pode ser o conteudo pronto ou um
// texto de carregando, trocado depois por atualizarDetalhe.
export function abrirDetalhe(botao, html) {
    fecharDetalhe();

    const popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.className = 'bh-detalhe-popover';
    popover.setAttribute('role', 'dialog');
    popover.innerHTML = html;
    document.body.appendChild(popover);
    posicionar(popover, botao);

    // Registrado depois do clique que abriu, para ele mesmo nao fechar.
    setTimeout(() => {
        document.addEventListener('mousedown', fecharAoClicarFora, true);
        document.addEventListener('keydown', fecharComEsc, true);
        window.addEventListener('resize', fecharDetalhe);
        window.addEventListener('scroll', fecharDetalhe, true);
    }, 0);
}

export function atualizarDetalhe(botao, html) {
    const popover = document.getElementById(POPOVER_ID);
    if (popover) {
        popover.innerHTML = html;
        posicionar(popover, botao);
    }
}

function posicionar(popover, botao) {
    const ancora = botao.getBoundingClientRect();
    const largura = popover.offsetWidth;
    const altura = popover.offsetHeight;
    const margem = 8;

    let left = ancora.left + (ancora.width / 2) - (largura / 2);
    left = Math.max(margem, Math.min(left, window.innerWidth - largura - margem));

    let top = ancora.bottom + 6;
    if (top + altura > window.innerHeight - margem) {
        top = Math.max(margem, ancora.top - altura - 6);
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

export function botaoInfo(atributos, titulo = 'Ver de onde veio este valor') {
    return `<button type="button" class="bh-info" ${atributos} title="${escapeHtml(titulo)}" aria-label="${escapeHtml(titulo)}"><i class="fas fa-circle-info"></i></button>`;
}

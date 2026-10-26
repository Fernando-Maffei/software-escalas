/* =====================================================================
MODAL DE LANCAMENTOS
---------------------------------------------------------------------
Reescrita completa. O arquivo antigo tinha tres rotinas concorrentes
reconfigurando as abas por clonagem de no (configurarAbas,
configurarEventosAbas e um listener de topo), o que derrubava handlers
ja registrados e deixava a modal em estados imprevisiveis. Aqui existe
um unico controlador: estado explicito, eventos delegados registrados
uma vez so e render puro a partir do estado.

Contratos preservados por outros arquivos (nao renomear):
- IDs do formulario, consumidos por core/runtime/plantao-colaboradores/banco-horas-lancamento.js:
 tipoLancamento, colaboradorSelect, periodoTipo, feriadoTipo,
 dataInicio, dataFim, horaInicio, horaFim, feriadoNome,
 camposBancoHorasPessoal, ausenciaSubtipo, descontaBancoHoras,
 descontaBancoHorasHint, observacaoLancamento.
===================================================================== */

import { API } from '../core/api.js';
import { mostrarToast } from '../core/app/horas-e-resumo.js';
import { estado } from '../core/estado.js';
import { temRestricaoDeSetor } from '../core/meus-setores.js';
import { carregarAusencias, carregarColaboradores, carregarFeriadosLocais } from '../core/runtime/dados-e-modais.js';
import { aplicarDefaultsBancoHorasLancamento, preencherBancoHorasLancamento, resetBancoHorasLancamento } from '../core/runtime/plantao-colaboradores/banco-horas-lancamento.js';
import { atualizarTudo, salvarAusencia } from '../core/runtime/plantao-colaboradores/plantao-regua-e-relatorios.js';
import { escapeHtml } from '../lib/html-seguro.js';
import { metaTipoLancamento } from '../lib/tipos-lancamento.js';
import { carregarFeriados as carregarFeriadosNacionais } from './calendar.js';

/* ================= ESTADO ================= */

const state = {
    aba: 'pessoal',          // 'pessoal' | 'feriados'
    escopo: 'mes',           // 'dia' | 'mes'
    dataISO: null,           // dia de referencia (quando veio do calendario)
    busca: '',
    editando: null,          // { tipo: 'pessoal'|'feriado', id }
    carregando: false
};

// Diretorio de nomes que INCLUI desligados. A lista normal
// (GET /colaboradores) esconde Ativo = 0, entao os lancamentos de quem
// foi desligado apareciam como "Desconhecido". Aqui guardamos todos so
// para exibicao; o <select> continua oferecendo apenas os ativos.
const diretorioColaboradores = new Map();
const DIRETORIO_TTL_MS = 60000;
let diretorioCarregadoEm = 0;
let diretorioEmVoo = null;

/* ================= HELPERS DE DATA ================= */

function toISODate(valor) {
    if (!valor) {
        return '';
    }

    if (typeof valor === 'string') {
        return valor.includes('T') ? valor.split('T')[0] : valor.trim();
    }

    const data = valor instanceof Date ? valor : new Date(valor);

    if (Number.isNaN(data.getTime())) {
        return '';
    }

    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function formatarDataBR(valor) {
    const iso = toISODate(valor);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return iso || '--';
    }

    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatarHora(valor) {
    if (!valor) {
        return '';
    }

    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        // Coluna TIME do SQL Server chega como 1970-01-01T<hora>Z.
        const soHora = valor.getUTCFullYear() === 1970
            && valor.getUTCMonth() === 0
            && valor.getUTCDate() === 1;
        const horas = String(soHora ? valor.getUTCHours() : valor.getHours()).padStart(2, '0');
        const minutos = String(soHora ? valor.getUTCMinutes() : valor.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}`;
    }

    const texto = String(valor).trim();
    const iso = texto.match(/T(\d{2}:\d{2})/);

    if (iso) {
        return iso[1];
    }

    const hhmm = texto.match(/^(\d{2}:\d{2})/);
    return hhmm ? hhmm[1] : texto;
}

function diferencaEmDias(inicioISO, fimISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioISO) || !/^\d{4}-\d{2}-\d{2}$/.test(fimISO)) {
        return null;
    }

    const [ai, mi, di] = inicioISO.split('-').map(Number);
    const [af, mf, df] = fimISO.split('-').map(Number);

    // UTC evita que horario de verao/fuso engula um dia na conta.
    const diff = Date.UTC(af, mf - 1, df) - Date.UTC(ai, mi - 1, di);
    return Math.floor(diff / 86400000) + 1;
}

function mesAtual() {
    return estado.mesAtual !== undefined ? estado.mesAtual : new Date().getMonth();
}

function anoAtual() {
    return estado.anoAtual !== undefined ? estado.anoAtual : new Date().getFullYear();
}

function periodoAtivo() {
    if (state.escopo === 'dia' && state.dataISO) {
        return { inicio: state.dataISO, fim: state.dataISO };
    }

    const ano = anoAtual();
    const mes = mesAtual();
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}`;

    return { inicio: `${prefixo}-01`, fim: `${prefixo}-${String(ultimoDia).padStart(2, '0')}` };
}

function rotuloEscopo() {
    if (state.escopo === 'dia' && state.dataISO) {
        return `Dia ${formatarDataBR(state.dataISO)}`;
    }

    const nome = new Date(anoAtual(), mesAtual(), 1)
        .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    return nome.replace(/^\w/, (c) => c.toUpperCase());
}

/* ================= HELPERS DIVERSOS ================= */

function toast(mensagem, tipo = 'success') {
    mostrarToast(mensagem, tipo);
}

function el(id) {
    return document.getElementById(id);
}

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
}

// Subtipos que valem um chip no card. Ficam de fora, de proposito:
// 'comum' (o padrao, nao informa nada) e 'folga'/'ferias' (derivados do
// tipo pelo backend, e o tipo ja tem chip proprio). O rotulo aqui e o
// mesmo que getAusenciaStatusLabel usa no extrato: "medico" e Atestado.
const SUBTIPOS = {
    medico: { icone: 'fa-stethoscope', texto: 'Atestado' },
    particular: { icone: 'fa-user', texto: 'Particular' },
    compensacao: { icone: 'fa-right-left', texto: 'Compensacao' },
    outro: { icone: 'fa-ellipsis', texto: 'Outro' }
};

const ABRANGENCIAS = {
    federal: { icone: 'fa-flag', texto: 'Federal' },
    estadual: { icone: 'fa-map', texto: 'Estadual' },
    municipal: { icone: 'fa-building-columns', texto: 'Municipal' }
};

function metaAbrangencia(tipo) {
    const chave = String(tipo || 'municipal').toLowerCase();
    return ABRANGENCIAS[chave] || ABRANGENCIAS.municipal;
}

// Unico ponto que altera o modo de edicao. Alem do estado interno, publica
// editandoLancamentoId / editandoTipoLancamento em estado: salvarAusencia
// (core/runtime/plantao-colaboradores/) decide por eles entre POST e PUT.
function setEdicao(edicao) {
    state.editando = edicao || null;
    estado.editandoLancamentoId = edicao ? edicao.id : null;
    estado.editandoTipoLancamento = edicao ? edicao.tipo : null;
}

setEdicao(null);

/* ================= DADOS ================= */

// Nomes de TODOS os colaboradores, inclusive desligados. Sem isso, todo
// lancamento de quem saiu da equipe virava um card "Desconhecido". Escopo
// geral: a tela de lancamentos nao passa pelo teto de setor da conta.
export function carregarDiretorioColaboradores(forcar = false) {
    const fresco = Date.now() - diretorioCarregadoEm < DIRETORIO_TTL_MS;

    if (!forcar && fresco && diretorioColaboradores.size > 0) {
        return Promise.resolve(diretorioColaboradores);
    }

    if (diretorioEmVoo) {
        return diretorioEmVoo;
    }

    diretorioEmVoo = (async () => {
        let lista = [];

        try {
            const dados = await API.getColaboradores({ incluirInativos: 1, escopo: 'lancamentos' });
            lista = Array.isArray(dados) ? dados : [];
        } catch (error) {
            // Sem permissao ou backend fora: caimos na lista ja carregada.
            console.warn('[lancamentos] diretorio completo indisponivel:', error.message);
            lista = Array.isArray(estado.colaboradoresLancamentos) ? estado.colaboradoresLancamentos : [];
        }

        diretorioColaboradores.clear();

        lista.forEach((colaborador) => {
            const id = Number(colaborador.Id ?? colaborador.id);

            if (!Number.isFinite(id)) {
                return;
            }

            diretorioColaboradores.set(id, {
                id,
                nome: colaborador.Nome || colaborador.nome || `Colaborador #${id}`,
                nomeCompleto: colaborador.NomeCompleto || colaborador.nomeCompleto || '',
                ativo: !(colaborador.Ativo === 0 || colaborador.Ativo === false),
                setor: colaborador.SetorNome || colaborador.setorNome || ''
            });
        });

        diretorioCarregadoEm = Date.now();
        return diretorioColaboradores;
    })().finally(() => {
        diretorioEmVoo = null;
    });

    return diretorioEmVoo;
}

export function resolverColaborador(id) {
    const numero = Number(id);
    const registro = diretorioColaboradores.get(numero);

    if (registro) {
        return registro;
    }

    const daLista = (estado.colaboradoresLancamentos || [])
        .find((item) => Number(item.Id ?? item.id) === numero);

    if (daLista) {
        return { id: numero, nome: daLista.Nome || daLista.nome, nomeCompleto: daLista.NomeCompleto || '', ativo: true, setor: '' };
    }

    // Registro orfao de verdade: o colaborador foi excluido em definitivo.
    return { id: numero, nome: `Colaborador removido (#${numero})`, ativo: false, orfao: true };
}

async function carregarFeriadosNacionaisDoAno() {
    const ano = anoAtual();

    try {
        const lista = await carregarFeriadosNacionais(ano);
        return Array.isArray(lista) ? lista : [];
    } catch (error) {
        console.warn('[lancamentos] feriados nacionais indisponiveis:', error.message);
    }

    return Array.isArray(estado.feriados) ? estado.feriados : [];
}

async function garantirDados(forcar = false) {
    const tarefas = [carregarDiretorioColaboradores(forcar)];

    if (forcar || !Array.isArray(estado.colaboradoresLancamentos) || estado.colaboradoresLancamentos.length === 0) {
        tarefas.push(carregarColaboradores());
    }

    if (forcar || !Array.isArray(estado.ausenciasLancamentos)) {
        tarefas.push(carregarAusencias());
    }

    if (forcar || !Array.isArray(estado.feriadosLocais)) {
        tarefas.push(carregarFeriadosLocais());
    }

    tarefas.push(carregarFeriadosNacionaisDoAno());

    await Promise.allSettled(tarefas);
}

/* ================= SELECAO DE DADOS PARA A LISTA ================= */

function ausenciasDoPeriodo() {
    const { inicio, fim } = periodoAtivo();
    const termo = normalizarTexto(state.busca);

    return (estado.ausenciasLancamentos || [])
        .map((item) => {
            const inicioItem = toISODate(item.DataInicio ?? item.dataInicio);
            const fimItem = toISODate(item.DataFim ?? item.dataFim) || inicioItem;
            const colaborador = resolverColaborador(item.colaboradorId ?? item.ColaboradorId);

            return {
                id: Number(item.id ?? item.Id),
                tipo: String(item.tipo || item.Tipo || '').toLowerCase(),
                inicio: inicioItem,
                fim: fimItem,
                periodoTipo: item.periodoTipo || item.PeriodoTipo || 'dia_inteiro',
                horaInicio: formatarHora(item.horaInicio ?? item.HoraInicio),
                horaFim: formatarHora(item.horaFim ?? item.HoraFim),
                subtipo: String(item.subtipo || item.Subtipo || '').toLowerCase(),
                // null = coluna ausente no schema ou registro antigo; nesse
                // caso o card omite a linha em vez de afirmar um dos lados.
                descontaBancoHoras: item.descontaBancoHoras ?? item.DescontaBancoHoras ?? null,
                observacao: item.observacao || item.Observacao || '',
                colaborador
            };
        })
        .filter((item) => item.inicio && item.fim && item.fim >= inicio && item.inicio <= fim)
        .filter((item) => !termo
            || normalizarTexto(item.colaborador.nome).includes(termo)
            || normalizarTexto(metaTipoLancamento(item.tipo).texto).includes(termo))
        .sort((a, b) => a.inicio.localeCompare(b.inicio)
            || a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'));
}

// Junta feriados nacionais (BrasilAPI) e os cadastrados no banco. A
// duplicidade relatada nascia aqui: as duas origens viravam cards separados,
// entao um "Independencia do Brasil" municipal criado em 07/09 aparecia ao
// lado do federal do mesmo dia.
//
// A regra e casar por DATA + NOME:
//  - mesma data e mesmo nome  -> uma entrada so, marcada como duplicada
//    (o card oferece a exclusao do cadastro manual, que e o redundante);
//  - mesma data, nomes diferentes -> duas entradas, porque sao eventos
//    distintos de verdade (ex.: aniversario da cidade caindo num feriado
//    nacional). A entrada manual so ganha um aviso informativo.
function feriadosDoPeriodo() {
    const { inicio, fim } = periodoAtivo();
    const termo = normalizarTexto(state.busca);
    const noPeriodo = (data) => Boolean(data) && data >= inicio && data <= fim;

    const nacionais = (Array.isArray(estado.feriados) ? estado.feriados : [])
        .map((item) => ({ data: toISODate(item.date), nome: item.name || 'Feriado nacional' }))
        .filter((item) => noPeriodo(item.data));

    const locais = (Array.isArray(estado.feriadosLocais) ? estado.feriadosLocais : [])
        .map((item) => ({
            data: toISODate(item.Data ?? item.data),
            id: Number(item.Id ?? item.id),
            nome: item.Nome || item.nome || 'Feriado',
            abrangencia: String(item.Tipo || item.tipo || 'municipal').toLowerCase()
        }))
        .filter((item) => noPeriodo(item.data));

    const entradas = [];
    const locaisUsados = new Set();

    nacionais.forEach((nacional) => {
        const indiceGemeo = locais.findIndex((local, indice) => !locaisUsados.has(indice)
            && local.data === nacional.data
            && normalizarTexto(local.nome) === normalizarTexto(nacional.nome));

        const gemeo = indiceGemeo === -1 ? null : locais[indiceGemeo];

        if (gemeo) {
            locaisUsados.add(indiceGemeo);
        }

        entradas.push({
            data: nacional.data,
            nome: nacional.nome,
            nomeNacional: nacional.nome,
            abrangencia: gemeo ? gemeo.abrangencia : 'federal',
            local: gemeo,
            duplicado: Boolean(gemeo),
            tambemNacional: false
        });
    });

    locais.forEach((local, indice) => {
        if (locaisUsados.has(indice)) {
            return;
        }

        const nacionalNoDia = nacionais.find((item) => item.data === local.data);

        entradas.push({
            data: local.data,
            nome: local.nome,
            nomeNacional: nacionalNoDia ? nacionalNoDia.nome : null,
            abrangencia: local.abrangencia,
            local,
            duplicado: false,
            tambemNacional: Boolean(nacionalNoDia)
        });
    });

    return entradas
        .filter((registro) => !termo || normalizarTexto(registro.nome).includes(termo))
        .sort((a, b) => a.data.localeCompare(b.data)
            || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ================= RENDER ================= */

function cardPessoal(item) {
    const meta = metaTipoLancamento(item.tipo);
    const dias = diferencaEmDias(item.inicio, item.fim);
    const porHora = item.periodoTipo === 'horas' && item.horaInicio && item.horaFim;

    const periodo = item.inicio === item.fim
        ? formatarDataBR(item.inicio)
        : `${formatarDataBR(item.inicio)} &rarr; ${formatarDataBR(item.fim)}`;

    const duracao = porHora
        ? `${item.horaInicio} - ${item.horaFim}`
        : (dias === null ? '--' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`);

    const emEdicao = state.editando
        && state.editando.tipo === 'pessoal'
        && Number(state.editando.id) === item.id;

    const chipInativo = item.colaborador.ativo
        ? ''
        : `<span class="lc-chip lc-chip--inativo" title="Colaborador desligado; o lancamento continua no historico">
                   <i class="fas fa-user-slash"></i> ${item.colaborador.orfao ? 'Removido' : 'Desligado'}
               </span>`;

    // 'comum' e o padrao e nao informa nada; 'folga'/'ferias' apenas
    // repetem o tipo, que ja tem chip proprio.
    const subtipoMeta = SUBTIPOS[item.subtipo];
    const chipSubtipo = subtipoMeta
        ? `<span class="lc-chip lc-chip--subtipo"><i class="fas ${subtipoMeta.icone}"></i> ${subtipoMeta.texto}</span>`
        : '';

    // Ferias nunca descontam (o backend zera o debito pelo tipo), entao a
    // linha seria redundante. Nos outros casos ela e a informacao que nao
    // dava para ver sem abrir o lancamento para editar.
    const mostraBanco = item.descontaBancoHoras !== null && item.tipo !== 'ferias';
    const linhaBanco = mostraBanco
        ? `<div><dt>Banco de horas</dt><dd class="${item.descontaBancoHoras ? '' : 'lc-dd--neutro'}">${
            item.descontaBancoHoras ? 'Desconta' : 'Nao desconta'
          }</dd></div>`
        : '';

    return `
            <article class="lc-card${emEdicao ? ' is-editing' : ''}" data-tipo="${escapeHtml(item.tipo)}" data-id="${item.id}">
                <div class="lc-card-top">
                    <span class="lc-card-avatar" aria-hidden="true"><i class="fas ${meta.icone}"></i></span>
                    <div class="lc-card-ident">
                        <h5>${escapeHtml(item.colaborador.nome)}</h5>
                        <div class="lc-card-chips">
                            <span class="lc-chip lc-chip--tipo">${escapeHtml(meta.texto)}</span>
                            ${chipInativo}
                            ${chipSubtipo}
                        </div>
                    </div>
                    <div class="lc-card-acoes">
                        <button type="button" class="lc-icon-btn" data-acao="editar" data-escopo-tipo="pessoal" data-id="${item.id}" title="Editar" aria-label="Editar lancamento de ${escapeHtml(item.colaborador.nome)}">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="lc-icon-btn lc-icon-btn--danger" data-acao="excluir" data-escopo-tipo="pessoal" data-id="${item.id}" title="Excluir" aria-label="Excluir lancamento de ${escapeHtml(item.colaborador.nome)}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <dl class="lc-card-meta">
                    <div><dt>Periodo</dt><dd>${periodo}</dd></div>
                    <div><dt>${porHora ? 'Horario' : 'Duracao'}</dt><dd>${escapeHtml(duracao)}</dd></div>
                    ${porHora && dias !== null && dias > 1 ? `<div><dt>Dias</dt><dd>${dias} dias</dd></div>` : ''}
                    ${linhaBanco}
                </dl>
                ${item.observacao ? `<p class="lc-card-obs"><i class="fas fa-quote-left"></i> ${escapeHtml(item.observacao)}</p>` : ''}
            </article>
        `;
}

function cardFeriado(registro) {
    const abrangenciaChave = String(registro.local ? registro.local.abrangencia : registro.abrangencia).toLowerCase();
    const abrangencia = metaAbrangencia(abrangenciaChave);
    const editavel = Boolean(registro.local);

    const emEdicao = state.editando
        && state.editando.tipo === 'feriado'
        && registro.local
        && Number(state.editando.id) === registro.local.id;

    const chips = [
        `<span class="lc-chip lc-chip--${escapeHtml(abrangenciaChave)}"><i class="fas ${abrangencia.icone}"></i> ${abrangencia.texto}</span>`
    ];

    if (registro.duplicado) {
        chips.push('<span class="lc-chip lc-chip--alerta"><i class="fas fa-triangle-exclamation"></i> Duplicado</span>');
    }

    if (!editavel) {
        chips.push('<span class="lc-chip lc-chip--lock"><i class="fas fa-lock"></i> Oficial</span>');
    }

    const acoes = editavel
        ? `<div class="lc-card-acoes">
                   <button type="button" class="lc-icon-btn" data-acao="editar" data-escopo-tipo="feriado" data-id="${registro.local.id}" title="Editar" aria-label="Editar feriado ${escapeHtml(registro.nome)}">
                       <i class="fas fa-pen"></i>
                   </button>
                   <button type="button" class="lc-icon-btn lc-icon-btn--danger" data-acao="excluir" data-escopo-tipo="feriado" data-id="${registro.local.id}" title="Excluir" aria-label="Excluir feriado ${escapeHtml(registro.nome)}">
                       <i class="fas fa-trash"></i>
                   </button>
               </div>`
        : '';

    let aviso = '';

    if (registro.duplicado) {
        aviso = `<p class="lc-card-aviso">
                         <i class="fas fa-triangle-exclamation"></i>
                         Este feriado ja entra sozinho como nacional. O cadastro manual
                         com o mesmo nome e redundante e pode ser removido.
                     </p>`;
    } else if (registro.tambemNacional) {
        aviso = `<p class="lc-card-obs">
                         <i class="fas fa-circle-info"></i>
                         Cai no mesmo dia do feriado nacional <strong>${escapeHtml(registro.nomeNacional)}</strong>.
                     </p>`;
    }

    return `
            <article class="lc-card lc-card--feriado${emEdicao ? ' is-editing' : ''}${registro.duplicado ? ' is-duplicado' : ''}" data-tipo="feriado">
                <div class="lc-card-top">
                    <span class="lc-card-avatar" aria-hidden="true"><i class="fas ${metaTipoLancamento('feriado').icone}"></i></span>
                    <div class="lc-card-ident">
                        <h5>${escapeHtml(registro.nome)}</h5>
                        <div class="lc-card-chips">${chips.join('')}</div>
                    </div>
                    ${acoes}
                </div>
                <dl class="lc-card-meta">
                    <div><dt>Data</dt><dd>${formatarDataBR(registro.data)}</dd></div>
                </dl>
                ${aviso}
            </article>
        `;
}

function estadoVazio(mensagem, detalhe) {
    return `
            <div class="lc-state">
                <i class="fas fa-calendar-xmark"></i>
                <p>${escapeHtml(mensagem)}</p>
                ${detalhe ? `<small>${escapeHtml(detalhe)}</small>` : ''}
            </div>
        `;
}

function renderLista() {
    const escopoLabel = el('lcEscopoLabel');

    if (escopoLabel) {
        escopoLabel.textContent = rotuloEscopo();
    }

    document.querySelectorAll('#lcScope .lc-scope-btn').forEach((botao) => {
        botao.classList.toggle('is-active', botao.dataset.escopo === state.escopo);
        botao.disabled = botao.dataset.escopo === 'dia' && !state.dataISO;
    });

    const pessoais = ausenciasDoPeriodo();
    const feriados = feriadosDoPeriodo();

    const contadorPessoal = el('lcCountPessoal');
    const contadorFeriados = el('lcCountFeriados');

    if (contadorPessoal) {
        contadorPessoal.textContent = String(pessoais.length);
    }
    if (contadorFeriados) {
        contadorFeriados.textContent = String(feriados.length);
    }

    const listaPessoal = el('listaPessoal');
    const listaFeriados = el('listaFeriados');

    if (listaPessoal) {
        listaPessoal.innerHTML = pessoais.length
            ? pessoais.map(cardPessoal).join('')
            : estadoVazio(
                state.busca ? 'Nenhum lancamento para essa busca' : 'Nenhum lancamento no periodo',
                state.busca ? 'Limpe a busca para ver tudo' : 'Use o formulario ao lado para criar'
            );
    }

    if (listaFeriados) {
        listaFeriados.innerHTML = feriados.length
            ? feriados.map(cardFeriado).join('')
            : estadoVazio(
                state.busca ? 'Nenhum feriado para essa busca' : 'Nenhum feriado no periodo',
                state.busca ? 'Limpe a busca para ver tudo' : 'Feriados nacionais entram automaticamente'
            );
    }

    const duplicados = feriados.filter((item) => item.duplicado).length;
    const avisoDuplicados = el('lcAvisoDuplicados');

    if (avisoDuplicados) {
        avisoDuplicados.classList.toggle('hidden', duplicados === 0);
        avisoDuplicados.innerHTML = duplicados === 0
            ? ''
            : `<i class="fas fa-triangle-exclamation"></i>
                   <span>${duplicados} feriado(s) cadastrados manualmente em datas que ja sao feriado nacional.</span>`;
    }

    const inativos = pessoais.filter((item) => !item.colaborador.ativo).length;
    const avisoInativos = el('lcAvisoInativos');

    if (avisoInativos) {
        avisoInativos.classList.toggle('hidden', inativos === 0);
        avisoInativos.innerHTML = inativos === 0
            ? ''
            : `<i class="fas fa-user-slash"></i>
                   <span>${inativos} lancamento(s) de colaboradores desligados. Continuam valendo no historico do banco de horas.</span>`;
    }
}

function renderAba() {
    document.querySelectorAll('#modalLancamento .tab-btn').forEach((botao) => {
        const ativo = botao.dataset.tab === state.aba;
        botao.classList.toggle('active', ativo);
        botao.setAttribute('aria-selected', ativo ? 'true' : 'false');
    });

    const pessoal = el('listaPessoalContainer');
    const feriados = el('listaFeriadosContainer');

    if (pessoal) {
        pessoal.classList.toggle('active', state.aba === 'pessoal');
    }
    if (feriados) {
        feriados.classList.toggle('active', state.aba === 'feriados');
    }
}

function setCarregando(ligado) {
    state.carregando = ligado;

    const loading = el('loadingLancamentos');

    if (loading) {
        loading.classList.toggle('hidden', !ligado);
    }

    const scroll = document.querySelector('#modalLancamento .lc-list-scroll');

    if (scroll) {
        scroll.classList.toggle('is-loading', ligado);
    }
}

/* ================= FORMULARIO ================= */

function preencherSelectColaboradores(selecionado = '') {
    const select = el('colaboradorSelect');

    if (!select) {
        return;
    }

    const ativos = (estado.colaboradoresLancamentos || [])
        .slice()
        .sort((a, b) => String(a.Nome || a.nome || '')
            .localeCompare(String(b.Nome || b.nome || ''), 'pt-BR'));

    let html = '<option value="">Selecione um colaborador</option>';

    html += ativos.map((item) => {
        const id = item.Id ?? item.id;
        return `<option value="${id}">${escapeHtml(item.Nome || item.nome)}</option>`;
    }).join('');

    // Editar um lancamento de alguem ja desligado precisa da opcao no
    // select, senao o valor nao "cola" e a tela parece travada.
    const idSelecionado = Number(selecionado);

    if (Number.isFinite(idSelecionado) && idSelecionado > 0
        && !ativos.some((item) => Number(item.Id ?? item.id) === idSelecionado)) {
        const registro = resolverColaborador(idSelecionado);
        html += `<option value="${idSelecionado}">${escapeHtml(registro.nome)} (desligado)</option>`;
    }

    select.innerHTML = html;
    select.value = selecionado ? String(selecionado) : '';
}

function aplicarVisibilidadeCampos() {
    const tipo = el('tipoLancamento')?.value || 'folga';
    const ehFeriado = tipo === 'feriado';
    const porHora = el('periodoTipo')?.value === 'horas';

    el('camposPessoal')?.classList.toggle('hidden', ehFeriado);
    el('camposFeriado')?.classList.toggle('hidden', !ehFeriado);
    el('campoNomeFeriado')?.classList.toggle('hidden', !ehFeriado);
    el('camposHora')?.classList.toggle('hidden', ehFeriado || !porHora);
    el('camposBancoHorasPessoal')?.classList.toggle('hidden', ehFeriado);

    // Feriado do cadastro e sempre de um dia so.
    el('lcCampoDataFim')?.classList.toggle('hidden', ehFeriado);

    // Subtipo so faz sentido em Ausencia. Em Folga e Ferias o tipo ja
    // decide o subtipo ('folga'/'ferias'), e core/runtime/ travava o
    // select — que aparecia EM BRANCO, porque esses dois valores nem
    // constam entre as <option>. Campo travado que so ecoa outro campo e
    // ruido: escondemos, e o backend deriva o subtipo a partir do tipo.
    el('lcCampoSubtipo')?.classList.toggle('hidden', ehFeriado || tipo === 'folga' || tipo === 'ferias');
}

function atualizarCabecalhoFormulario() {
    const titulo = el('formTitulo');
    const chip = el('lcEditChip');
    const salvar = el('salvarLancamentoBtn');
    const cancelar = el('cancelarEdicaoLancamentoBtn');
    const pane = el('lcFormPane');
    const editando = Boolean(state.editando);
    const ehFeriado = el('tipoLancamento')?.value === 'feriado';

    if (titulo) {
        const icone = ehFeriado ? 'fa-building-columns' : 'fa-user-clock';
        const texto = editando
            ? (ehFeriado ? 'Editar feriado' : 'Editar lancamento')
            : (ehFeriado ? 'Novo feriado' : 'Novo lancamento');
        titulo.innerHTML = `<i class="fas ${icone}"></i> ${texto}`;
    }

    if (chip) {
        chip.classList.toggle('hidden', !editando);
    }
    if (cancelar) {
        cancelar.classList.toggle('hidden', !editando);
    }
    if (pane) {
        pane.classList.toggle('is-editing', editando);
    }

    if (salvar && salvar.dataset.enviando !== 'true') {
        salvar.innerHTML = editando
            ? '<i class="fas fa-check"></i> Atualizar'
            : '<i class="fas fa-plus"></i> Salvar';
    }
}

function resetarFormularioLancamento(manterTipo = false) {
    const tipoSelect = el('tipoLancamento');
    const tipoAnterior = tipoSelect?.value;

    if (tipoSelect) {
        tipoSelect.value = manterTipo && tipoAnterior
            ? tipoAnterior
            : (state.aba === 'feriados' ? 'feriado' : 'folga');
    }

    preencherSelectColaboradores('');

    const sugestao = state.dataISO || '';

    if (el('dataInicio')) {
        el('dataInicio').value = sugestao;
    }
    if (el('dataFim')) {
        el('dataFim').value = sugestao;
    }
    if (el('horaInicio')) {
        el('horaInicio').value = '';
    }
    if (el('horaFim')) {
        el('horaFim').value = '';
    }
    if (el('periodoTipo')) {
        el('periodoTipo').value = 'dia_inteiro';
    }
    if (el('feriadoNome')) {
        el('feriadoNome').value = '';
    }
    if (el('feriadoTipo')) {
        el('feriadoTipo').value = 'municipal';
    }
    // A observacao so era limpa no "Cancelar edicao": depois de salvar (ou
    // ao reabrir a modal) o texto anterior ficava no campo e ia junto no
    // proximo lancamento.
    if (el('observacaoLancamento')) {
        el('observacaoLancamento').value = '';
    }

    setEdicao(null);

    aplicarVisibilidadeCampos();
    atualizarCabecalhoFormulario();

    // Devolve o painel de banco de horas ao padrao do tipo escolhido
    // (core/runtime/ escuta este change).
    tipoSelect?.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ================= ACOES ================= */

function focarFormulario() {
    const pane = el('lcFormPane');

    if (pane && window.matchMedia('(max-width: 980px)').matches) {
        pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function abrirEdicaoLancamento(tipo, id) {
    if (tipo === 'feriado') {
        // Ids de feriado chegavam como string no HTML antigo e a busca usava
        // ===, entao a edicao nunca achava o registro. Comparamos por Number.
        const alvo = Number(id);
        const item = (estado.feriadosLocais || [])
            .find((registro) => Number(registro.Id ?? registro.id) === alvo);

        if (!item) {
            toast('Feriado nao encontrado. Atualize a lista.', 'error');
            return;
        }

        state.aba = 'feriados';
        renderAba();

        const data = toISODate(item.Data ?? item.data);

        if (el('tipoLancamento')) {
            el('tipoLancamento').value = 'feriado';
        }
        if (el('feriadoNome')) {
            el('feriadoNome').value = item.Nome || item.nome || '';
        }
        if (el('feriadoTipo')) {
            el('feriadoTipo').value = String(item.Tipo || item.tipo || 'municipal').toLowerCase();
        }
        if (el('dataInicio')) {
            el('dataInicio').value = data;
        }
        if (el('dataFim')) {
            el('dataFim').value = data;
        }

        setEdicao({ tipo: 'feriado', id: alvo });

        aplicarVisibilidadeCampos();
        atualizarCabecalhoFormulario();
        el('tipoLancamento')?.dispatchEvent(new Event('change', { bubbles: true }));
        renderLista();
        focarFormulario();
        return;
    }

    const alvo = Number(id);
    const item = (estado.ausenciasLancamentos || [])
        .find((registro) => Number(registro.id ?? registro.Id) === alvo);

    if (!item) {
        toast('Lancamento nao encontrado. Atualize a lista.', 'error');
        return;
    }

    state.aba = 'pessoal';
    renderAba();

    const tipoItem = String(item.tipo || item.Tipo || 'folga').toLowerCase();
    const periodoTipo = item.periodoTipo || item.PeriodoTipo || 'dia_inteiro';

    if (el('tipoLancamento')) {
        el('tipoLancamento').value = tipoItem;
    }

    preencherSelectColaboradores(item.colaboradorId ?? item.ColaboradorId);

    if (el('dataInicio')) {
        el('dataInicio').value = toISODate(item.DataInicio ?? item.dataInicio);
    }
    if (el('dataFim')) {
        el('dataFim').value = toISODate(item.DataFim ?? item.dataFim);
    }
    if (el('periodoTipo')) {
        el('periodoTipo').value = periodoTipo;
    }

    if (periodoTipo === 'horas') {
        if (el('horaInicio')) {
            el('horaInicio').value = formatarHora(item.horaInicio ?? item.HoraInicio);
        }
        if (el('horaFim')) {
            el('horaFim').value = formatarHora(item.horaFim ?? item.HoraFim);
        }
    }

    setEdicao({ tipo: 'pessoal', id: alvo });

    aplicarVisibilidadeCampos();
    atualizarCabecalhoFormulario();
    renderLista();
    focarFormulario();
}

function excluirLancamento(tipo, id) {
    const alvo = Number(id);
    let descricao = '';

    if (tipo === 'feriado') {
        const item = (estado.feriadosLocais || [])
            .find((registro) => Number(registro.Id ?? registro.id) === alvo);

        if (!item) {
            toast('Feriado nao encontrado.', 'error');
            return;
        }

        descricao = `${item.Nome || item.nome} - ${formatarDataBR(item.Data ?? item.data)}`;
    } else {
        const item = (estado.ausenciasLancamentos || [])
            .find((registro) => Number(registro.id ?? registro.Id) === alvo);

        if (!item) {
            toast('Lancamento nao encontrado.', 'error');
            return;
        }

        const colaborador = resolverColaborador(item.colaboradorId ?? item.ColaboradorId);
        descricao = `${colaborador.nome} - ${formatarDataBR(item.DataInicio ?? item.dataInicio)}`;
    }

    // Contrato de core/runtime/dados-e-modais.js: confirmarExclusao() le estes globais.
    estado.exclusaoPendenteId = alvo;
    estado.exclusaoTipo = tipo === 'feriado' ? 'feriado' : 'ausencia';

    const info = el('confirmacaoInfo');

    if (info) {
        info.innerText = descricao;
    }

    const modal = el('modalConfirmacao');

    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

async function salvarFeriadoDoFormulario(dataInicio) {
    const nome = el('feriadoNome')?.value?.trim();
    const abrangencia = el('feriadoTipo')?.value || 'municipal';

    if (!nome) {
        throw new Error('Informe o nome do feriado.');
    }

    return API.salvarFeriado({
        id: state.editando?.tipo === 'feriado' ? state.editando.id : undefined,
        nome,
        data: dataInicio,
        tipo: abrangencia
    });
}

async function salvarLancamento() {
    const botao = el('salvarLancamentoBtn');

    if (botao?.dataset.enviando === 'true') {
        return;
    }

    const tipo = el('tipoLancamento')?.value || 'folga';
    const dataInicio = el('dataInicio')?.value || '';
    const ehFeriado = tipo === 'feriado';
    const dataFim = ehFeriado ? dataInicio : (el('dataFim')?.value || '');

    if (!dataInicio || !dataFim) {
        toast('Preencha as datas.', 'error');
        return;
    }

    if (dataFim < dataInicio) {
        toast('A data final deve ser igual ou posterior a inicial.', 'error');
        return;
    }

    if (botao) {
        botao.dataset.enviando = 'true';
        botao.disabled = true;
        botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        if (ehFeriado) {
            await salvarFeriadoDoFormulario(dataInicio);
        } else {
            // salvarAusencia vem de core/runtime/ e ja monta o payload de
            // banco de horas a partir dos campos do formulario.
            await salvarAusencia(tipo, dataInicio, dataFim);
        }

        toast('Salvo com sucesso!', 'success');
        setEdicao(null);

        // atualizarTudo (core/runtime/) recarrega os dados e ja
        // repinta as listas da modal chamando carregarListagens /
        // carregarListagensComFiltro daqui — nao recarregue de novo.
        await atualizarTudo({ silent: true, source: 'lancamento' });

        // Depois do refresh, para o select pegar a lista atualizada.
        resetarFormularioLancamento(true);
    } catch (error) {
        toast(`Erro ao salvar: ${error.message}`, 'error');
    } finally {
        if (botao) {
            delete botao.dataset.enviando;
            botao.disabled = false;
        }

        atualizarCabecalhoFormulario();
    }
}

// Editar um lancamento tambem repoe os campos de banco de horas do
// formulario (core/runtime/plantao-colaboradores/banco-horas-lancamento.js).
function editarLancamento(tipo, id) {
    abrirEdicaoLancamento(tipo, id);

    if (tipo === 'feriado') {
        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
        return;
    }

    const item = (estado.ausenciasLancamentos || []).find((ausencia) => Number(ausencia.id || ausencia.Id) === Number(id));

    if (!item) {
        return;
    }

    preencherBancoHorasLancamento(item);
}

export function cancelarEdicaoLancamento() {
    fecharEdicaoLancamento();
    resetBancoHorasLancamento();
}

function fecharEdicaoLancamento() {
    setEdicao(null);
    resetarFormularioLancamento(true);
    renderLista();
}

/* ================= CICLO DE VIDA DA MODAL ================= */

async function recarregarLista(forcar = false) {
    setCarregando(true);

    try {
        await garantirDados(forcar);
    } catch (error) {
        console.error('[lancamentos] falha ao carregar dados:', error);
        toast('Nao foi possivel carregar os lancamentos.', 'error');
    } finally {
        setCarregando(false);
    }

    renderAba();
    renderLista();
}

export async function abrirModalLancamento(tipo = 'pessoal', dataISO = null, filtrarPorData = true) {
    const modal = el('modalLancamento');

    if (!modal) {
        return;
    }

    state.aba = tipo === 'feriados' ? 'feriados' : 'pessoal';
    state.dataISO = dataISO ? toISODate(dataISO) : null;
    state.escopo = filtrarPorData && state.dataISO ? 'dia' : 'mes';
    state.busca = '';
    setEdicao(null);

    // Compatibilidade: calendar.js e core/runtime/ leem estes globais
    // para recarregar a modal quando o mes muda ou apos uma exclusao.
    estado.modalFiltroData = state.escopo === 'dia';
    estado.modalDataSelecionada = state.dataISO;

    const busca = el('lcBusca');

    if (busca) {
        busca.value = '';
    }

    modal.classList.remove('hidden');
    modal.classList.add('active');

    renderAba();
    resetarFormularioLancamento();

    // Antes a modal abria e so depois (talvez) os dados chegavam, entao o
    // select de colaborador vinha vazio e editar so funcionava depois de
    // sair da pagina e voltar. Agora esperamos os dados antes de renderizar.
    await recarregarLista();
    preencherSelectColaboradores('');
}

function fecharModalLancamento() {
    const modal = el('modalLancamento');

    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.classList.remove('active');

    setEdicao(null);
    state.busca = '';
    estado.modalDataSelecionada = null;
    estado.modalFiltroData = false;

    resetarFormularioLancamento();
}

function modalAberta() {
    const modal = el('modalLancamento');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

/* ================= EVENTOS (delegados, registrados uma vez) ================= */

document.addEventListener('click', (evento) => {
    const modal = el('modalLancamento');

    if (!modal || !evento.target.closest('#modalLancamento')) {
        return;
    }

    const aba = evento.target.closest('#modalLancamento .tab-btn');

    if (aba) {
        evento.preventDefault();
        state.aba = aba.dataset.tab === 'feriados' ? 'feriados' : 'pessoal';
        renderAba();
        renderLista();

        if (!state.editando) {
            resetarFormularioLancamento();
        }

        return;
    }

    const escopo = evento.target.closest('#lcScope .lc-scope-btn');

    if (escopo) {
        evento.preventDefault();
        state.escopo = escopo.dataset.escopo === 'dia' ? 'dia' : 'mes';
        estado.modalFiltroData = state.escopo === 'dia';
        renderLista();
        return;
    }

    const acao = evento.target.closest('#modalLancamento [data-acao]');

    if (acao) {
        evento.preventDefault();

        const alvoTipo = acao.dataset.escopoTipo;
        const alvoId = acao.dataset.id;

        if (acao.dataset.acao === 'editar') {
            editarLancamento(alvoTipo, alvoId);
        } else if (acao.dataset.acao === 'excluir') {
            excluirLancamento(alvoTipo, alvoId);
        }

        return;
    }

    if (evento.target.closest('#salvarLancamentoBtn')) {
        evento.preventDefault();
        salvarLancamento();
        return;
    }

    if (evento.target.closest('#cancelarEdicaoLancamentoBtn')) {
        evento.preventDefault();
        cancelarEdicaoLancamento();
        return;
    }

    if (evento.target.closest('#fecharModalLancamentoBtn')) {
        evento.preventDefault();
        fecharModalLancamento();
        return;
    }

    // Clique no fundo escuro fecha; clique dentro do painel, nao.
    if (evento.target === modal) {
        fecharModalLancamento();
    }
});

document.addEventListener('change', (evento) => {
    if (evento.target.id === 'tipoLancamento' || evento.target.id === 'periodoTipo') {
        aplicarVisibilidadeCampos();
        atualizarCabecalhoFormulario();
    }
});

document.addEventListener('input', (evento) => {
    if (evento.target.id !== 'lcBusca') {
        return;
    }

    state.busca = evento.target.value || '';
    renderLista();
});

document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || !modalAberta()) {
        return;
    }

    const confirmacao = el('modalConfirmacao');

    if (confirmacao && !confirmacao.classList.contains('hidden')) {
        return;
    }

    fecharModalLancamento();
});

/* ================= COMPATIBILIDADE ================= */

// Assinaturas antigas, ainda chamadas por calendar.js e core/runtime/.
export async function carregarListagens() {
    state.escopo = 'mes';
    estado.modalFiltroData = false;
    await recarregarLista();
}

export async function carregarListagensComFiltro(dataISO, filtrarPorData) {
    if (dataISO) {
        state.dataISO = toISODate(dataISO);
    }

    state.escopo = filtrarPorData && state.dataISO ? 'dia' : 'mes';
    estado.modalFiltroData = state.escopo === 'dia';
    await recarregarLista();
}

// Erro de rede/servidor propaga: carregarColaboradores (core/runtime/dados-e-modais.js)
// chama esta funcao, avisa o usuario e mantem os ultimos dados.
// Traz tambem a lista geral da tela de lancamentos (sem teto de setor); para
// a conta sem teto e a mesma lista, sem segunda requisicao.
export async function buscarColaboradoresComDiretorio() {
    const restrito = temRestricaoDeSetor();
    const [dados, dadosGerais] = await Promise.all([
        API.getColaboradores(),
        restrito ? API.getColaboradores({ escopo: 'lancamentos' }) : null
    ]);
    const lista = Array.isArray(dados) ? dados : [];

    estado.colaboradores = lista;
    // Binding compartilhado declarado em app.js.
    estado.colaboradores = lista;
    estado.colaboradoresLancamentos = restrito
        ? (Array.isArray(dadosGerais) ? dadosGerais : [])
        : lista;

    // O diretorio completo (com desligados) acompanha, respeitando o TTL.
    await carregarDiretorioColaboradores();

    return lista;
}


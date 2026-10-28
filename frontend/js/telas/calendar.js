import { API, buscarFeriadosNacionais } from '../core/api.js';
import { estado } from '../core/estado.js';
import { usuarioEhAdmin } from '../core/permissoes.js';
import { indiceCoberturaPorDia, textoCoberturaDoDia } from '../lib/coberturas.js';
import { escapeHtml } from '../lib/html-seguro.js';
import { iconeTipoLancamento } from '../lib/tipos-lancamento.js';
import { abrirModalLancamento, carregarDiretorioColaboradores, carregarListagens, carregarListagensComFiltro, resolverColaborador as resolverColaboradorLancamento } from './lancamentos.js';

const cacheFeriadosPorAno = new Map();
// Coberturas de plantonista por mes ("2026-11" -> indice de cobertura por dia
// do titular). Some ao entrar na tela, para refletir o que foi editado em
// Coberturas.
const coberturasPorMes = new Map();

// O calendario desenha na hora com o que ja tem; as coberturas do mes chegam
// depois e redesenham, se o mes ainda for o mesmo.
function coberturasDoMes(mes, ano) {
    const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`;

    if (coberturasPorMes.has(chave)) {
        return coberturasPorMes.get(chave);
    }

    coberturasPorMes.set(chave, new Map());
    const fim = new Date(ano, mes + 1, 0).getDate();

    API.getCoberturas({ dataInicio: `${chave}-01`, dataFim: `${chave}-${String(fim).padStart(2, '0')}` })
        .then((resposta) => {
            coberturasPorMes.set(chave, indiceCoberturaPorDia(resposta?.items || []));

            if (estado.mesAtual === mes && estado.anoAtual === ano && document.getElementById('calendar')) {
                gerarCalendario(mes, ano);
            }
        })
        .catch((error) => {
            // Sem as coberturas o calendario continua certo, so sem a marca.
            console.error('[calendario] falha ao carregar coberturas:', error);
        });

    return coberturasPorMes.get(chave);
}
const dataAtual = new Date();

estado.mesAtual = dataAtual.getMonth();
estado.anoAtual = dataAtual.getFullYear();

function formatarDataISO(ano, mes, dia) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function extrairDataISO(valor) {
    if (!valor) {
        return null;
    }

    if (typeof valor === 'string') {
        return valor.includes('T') ? valor.split('T')[0] : valor;
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        return null;
    }

    return formatarDataISO(data.getFullYear(), data.getMonth(), data.getDate());
}

function ensureCalendarDatePicker() {
    let input = document.getElementById('calendarMonthPicker');

    if (input) {
        return input;
    }

    const monthNav = document.querySelector('.month-nav');

    if (!monthNav) {
        return null;
    }

    input = document.createElement('input');
    input.type = 'date';
    input.id = 'calendarMonthPicker';
    input.className = 'calendar-month-picker';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;

    input.addEventListener('change', async () => {
        const valor = input.value;

        if (!valor) {
            return;
        }

        const [anoSelecionado, mesSelecionado] = valor.split('-').map(Number);

        if (!anoSelecionado || !mesSelecionado) {
            return;
        }

        estado.mesAtual = mesSelecionado - 1;
        estado.anoAtual = anoSelecionado;

        await carregarFeriados(estado.anoAtual);
        gerarCalendario(estado.mesAtual, estado.anoAtual);
    });

    monthNav.appendChild(input);
    return input;
}

export async function carregarFeriados(ano) {
    if (cacheFeriadosPorAno.has(ano)) {
        estado.feriados = cacheFeriadosPorAno.get(ano);
        return estado.feriados;
    }

    try {
        estado.feriados = await buscarFeriadosNacionais(ano);
        cacheFeriadosPorAno.set(ano, estado.feriados);
    } catch (erro) {
        console.error('Erro ao carregar feriados nacionais:', erro);
        estado.feriados = [];
    }

    return estado.feriados;
}

function normalizarNomeFeriado(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

// Feriado nacional e feriado cadastrado no banco caiam como duas tags separadas
// na mesma celula, entao um cadastro manual repetindo o nome de um feriado
// nacional aparecia duplicado no calendario. Casamos por data + nome: nomes
// iguais viram uma tag so; nomes diferentes no mesmo dia continuam sendo dois
// eventos legitimos e seguem aparecendo.
function feriadosDoDia(dataISO) {
    const nacionais = estado.feriados.filter((feriado) => feriado.date === dataISO);

    const locais = (estado.feriadosLocais || [])
        .filter((item) => extrairDataISO(item.Data || item.data) === dataISO);

    const usados = new Set();

    const tags = nacionais.map((nacional) => {
        const indice = locais.findIndex((local, posicao) => !usados.has(posicao)
            && normalizarNomeFeriado(local.Nome || local.nome) === normalizarNomeFeriado(nacional.name));

        if (indice !== -1) {
            usados.add(indice);
        }

        const local = indice === -1 ? null : locais[indice];

        return {
            classe: local ? String(local.Tipo || local.tipo || 'municipal').toLowerCase() : 'federal',
            rotulo: `BR ${nacional.name}`,
            titulo: local
                ? `${nacional.name} — feriado nacional. Ha tambem um cadastro manual duplicado nesta data.`
                : `${nacional.name} — feriado nacional`
        };
    });

    locais.forEach((local, posicao) => {
        if (usados.has(posicao)) {
            return;
        }

        const nome = local.Nome || local.nome || 'Feriado';
        const tipo = String(local.Tipo || local.tipo || 'municipal').toLowerCase();

        tags.push({ classe: tipo, rotulo: nome, titulo: `${nome} — feriado ${tipo}` });
    });

    return tags;
}

// Nome de exibicao de um colaborador. GET /colaboradores esconde quem foi
// desligado (Ativo = 0), mas os lancamentos dessa pessoa continuam no banco —
// era dai que vinham as tags "Desconhecido" no calendario. O diretorio completo
// e mantido por lancamentos.js; aqui so consultamos, com fallback.
function nomeColaboradorCalendario(colaboradorId) {
    const registro = resolverColaboradorLancamento(colaboradorId);

    if (registro && registro.nome) {
        return { nome: registro.nome, ativo: registro.ativo !== false };
    }

    const colaborador = (estado.colaboradoresLancamentos || [])
        .find((item) => Number(item.Id ?? item.id) === Number(colaboradorId));

    return colaborador
        ? { nome: colaborador.Nome || colaborador.nome, ativo: true }
        : { nome: `Colaborador #${colaboradorId}`, ativo: false };
}

export function gerarCalendario(mes, ano) {
    const calendar = document.getElementById('calendar');

    if (!calendar) {
        return;
    }

    estado.mesAtual = mes;
    estado.anoAtual = ano;

    calendar.innerHTML = '';

    const coberturas = coberturasDoMes(mes, ano);
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay();

    const monthTitle = document.getElementById('monthTitle');
    if (monthTitle) {
        monthTitle.textContent = primeiroDia.toLocaleString('pt-BR', {
            month: 'long',
            year: 'numeric'
        }).replace(/^\w/, (char) => char.toUpperCase());

        const datePicker = ensureCalendarDatePicker();
        if (datePicker) {
            datePicker.value = formatarDataISO(ano, mes, 1);
        }

        monthTitle.style.cursor = 'pointer';
        monthTitle.title = 'Clique para selecionar uma data';
        monthTitle.onclick = (event) => {
            event.stopPropagation();
            const picker = ensureCalendarDatePicker();

            if (!picker) {
                return;
            }

            picker.value = formatarDataISO(ano, mes, 1);

            if (typeof picker.showPicker === 'function') {
                picker.showPicker();
            } else {
                picker.click();
            }
        };
    }

    for (let index = 0; index < diaSemanaInicio; index += 1) {
        const vazio = document.createElement('div');
        vazio.className = 'empty-day';
        calendar.appendChild(vazio);
    }

    for (let dia = 1; dia <= diasNoMes; dia += 1) {
        const cell = document.createElement('div');
        const dataISO = formatarDataISO(ano, mes, dia);

        cell.classList.add('day');
        cell.innerHTML = `<strong>${dia}</strong>`;

        const hoje = new Date();
        if (
            dia === hoje.getDate() &&
            mes === hoje.getMonth() &&
            ano === hoje.getFullYear()
        ) {
            cell.classList.add('today');
        }

        feriadosDoDia(dataISO).forEach((feriado) => {
            cell.classList.add('holiday');
            const tag = document.createElement('div');
            tag.className = `holiday-tag ${feriado.classe}`;
            tag.innerHTML = `${iconeTipoLancamento('feriado')}<span>${escapeHtml(feriado.rotulo)}</span>`;
            tag.title = feriado.titulo;
            cell.appendChild(tag);
        });

        // Calendario de lancamentos e geral: lista sem o teto de setor.
        const ausenciasDoDia = (estado.ausenciasLancamentos || []).filter((ausencia) => {
            const inicio = extrairDataISO(ausencia.DataInicio || ausencia.dataInicio);
            const fim = extrairDataISO(ausencia.DataFim || ausencia.dataFim);

            return Boolean(inicio && fim && dataISO >= inicio && dataISO <= fim);
        });

        const colaboradoresUnicos = new Map();

        ausenciasDoDia.forEach((ausencia) => {
            const colaboradorId = ausencia.colaboradorId || ausencia.ColaboradorId;
            const { nome, ativo } = nomeColaboradorCalendario(colaboradorId);
            const tipo = String(ausencia.tipo || ausencia.Tipo || '').toLowerCase();

            if (!colaboradoresUnicos.has(nome)) {
                colaboradoresUnicos.set(nome, { nome, tipo, ativo, cobertura: coberturas.get(`${Number(colaboradorId)}|${dataISO}`) || null });
            }
        });

        colaboradoresUnicos.forEach((info) => {
            const tag = document.createElement('div');
            tag.className = `ausencia-tag ${info.tipo}${info.ativo ? '' : ' inativo'}`;
            // Plantonista fora com horario a cobrir: icone de cobertura com a
            // cor da situacao do dia (verde coberto, ambar parcial/pendente).
            const marcaCobertura = info.cobertura
                ? `<i class="fas fa-people-arrows cobertura-marca is-${escapeHtml(info.cobertura.situacao)}" aria-hidden="true"></i>`
                : '';
            tag.innerHTML = `${iconeTipoLancamento(info.tipo)}<span>${escapeHtml(info.nome)}</span>${marcaCobertura}`;

            // Em coluna estreita o nome sai cortado com reticencias: o title
            // mostra inteiro.
            const titulo = info.ativo ? info.nome : `${info.nome} — colaborador desligado`;
            tag.title = info.cobertura ? `${titulo} · ${textoCoberturaDoDia(info.cobertura)}` : titulo;

            cell.appendChild(tag);
        });

        // Usuario comum enxerga o calendario da equipe, mas nao lanca nada:
        // sem o clique, nao ha modal de lancamento que resultaria em 403.
        if (!usuarioEhAdmin()) {
            cell.classList.add('calendario-somente-leitura');
            calendar.appendChild(cell);
            continue;
        }

        cell.addEventListener('click', (event) => {
            event.stopPropagation();

            abrirModalLancamento(cell.classList.contains('holiday') ? 'feriados' : 'pessoal', dataISO, true);
        });

        calendar.appendChild(cell);
    }
}

function gerarDiasSemana() {
    const container = document.querySelector('.weekdays');

    if (!container) {
        return;
    }

    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    container.innerHTML = '';

    dias.forEach((dia) => {
        const div = document.createElement('div');
        div.classList.add('weekday');
        div.textContent = dia;
        container.appendChild(div);
    });
}

async function alterarMes(diferenca) {
    estado.mesAtual += diferenca;

    if (estado.mesAtual < 0) {
        estado.mesAtual = 11;
        estado.anoAtual -= 1;
    } else if (estado.mesAtual > 11) {
        estado.mesAtual = 0;
        estado.anoAtual += 1;
    }

    await carregarFeriados(estado.anoAtual);
    gerarCalendario(estado.mesAtual, estado.anoAtual);

    const modalLancamento = document.getElementById('modalLancamento');
    if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
        if (estado.modalFiltroData && estado.modalDataSelecionada) {
            await carregarListagensComFiltro(estado.modalDataSelecionada, true);
        } else {
            await carregarListagens();
        }
    }
}

function configurarNavegacaoCalendario() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');

    if (prevBtn) {
        prevBtn.onclick = () => alterarMes(-1);
    }

    if (nextBtn) {
        nextBtn.onclick = () => alterarMes(1);
    }
}

export async function inicializarCalendario() {
    coberturasPorMes.clear();

    // O diretorio com desligados precisa estar em memoria antes do primeiro
    // render, senao as ausencias de quem saiu voltam a virar "Desconhecido".
    const diretorio = carregarDiretorioColaboradores();

    await Promise.allSettled([carregarFeriados(estado.anoAtual), diretorio]);

    // O usuario pode ter trocado de tela enquanto os dados chegavam.
    if (!document.getElementById('calendar')) {
        return;
    }

    gerarDiasSemana();
    gerarCalendario(estado.mesAtual, estado.anoAtual);
    configurarNavegacaoCalendario();
}

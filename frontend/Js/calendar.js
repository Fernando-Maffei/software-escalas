let mesAtual;
let anoAtual;
let feriados = [];

const cacheFeriadosPorAno = new Map();
const dataAtual = new Date();

mesAtual = dataAtual.getMonth();
anoAtual = dataAtual.getFullYear();

window.mesAtual = mesAtual;
window.anoAtual = anoAtual;
window.feriados = feriados;
window.gerarCalendario = gerarCalendario;
window.inicializarCalendario = inicializarCalendario;
window.carregarFeriadosNacionais = carregarFeriados;

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

async function carregarFeriados(ano) {
    if (cacheFeriadosPorAno.has(ano)) {
        feriados = cacheFeriadosPorAno.get(ano);
        window.feriados = feriados;
        return feriados;
    }

    try {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);

        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }

        feriados = await response.json();
        cacheFeriadosPorAno.set(ano, feriados);
    } catch (erro) {
        console.error('Erro ao carregar feriados da API:', erro);
        feriados = [];
    }

    window.feriados = feriados;
    return feriados;
}

function gerarCalendario(mes, ano) {
    const calendar = document.getElementById('calendar');

    if (!calendar) {
        return;
    }

    mesAtual = mes;
    anoAtual = ano;
    window.mesAtual = mesAtual;
    window.anoAtual = anoAtual;

    calendar.innerHTML = '';

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

        monthTitle.style.cursor = 'pointer';
        monthTitle.title = 'Clique para navegar entre meses';
        monthTitle.onclick = (event) => {
            event.stopPropagation();

            if (typeof abrirSeletorMes === 'function') {
                abrirSeletorMes();
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

        const feriadoNacional = feriados.find((feriado) => feriado.date === dataISO);
        if (feriadoNacional) {
            cell.classList.add('holiday');
            const tag = document.createElement('div');
            tag.className = 'holiday-tag federal';
            tag.textContent = `BR ${feriadoNacional.name}`;
            cell.appendChild(tag);
        }

        const feriadoLocal = (window.feriadosLocais || []).find((item) => extrairDataISO(item.Data || item.data) === dataISO);
        if (feriadoLocal) {
            cell.classList.add('holiday');
            const tag = document.createElement('div');
            tag.className = `holiday-tag ${feriadoLocal.Tipo || feriadoLocal.tipo || 'municipal'}`;
            tag.textContent = `${feriadoLocal.Nome || feriadoLocal.nome}`;
            cell.appendChild(tag);
        }

        const ausenciasDoDia = (window.ausencias || []).filter((ausencia) => {
            const inicio = extrairDataISO(ausencia.DataInicio || ausencia.dataInicio);
            const fim = extrairDataISO(ausencia.DataFim || ausencia.dataFim);

            return Boolean(inicio && fim && dataISO >= inicio && dataISO <= fim);
        });

        const colaboradoresUnicos = new Map();

        ausenciasDoDia.forEach((ausencia) => {
            const colaboradorId = ausencia.colaboradorId || ausencia.ColaboradorId;
            const colaborador = (window.colaboradores || []).find((item) => item.Id === colaboradorId);
            const nome = colaborador?.Nome || 'Desconhecido';
            const tipo = String(ausencia.tipo || ausencia.Tipo || '').toLowerCase();

            if (!colaboradoresUnicos.has(nome)) {
                colaboradoresUnicos.set(nome, { nome, tipo });
            }
        });

        colaboradoresUnicos.forEach((info) => {
            const tag = document.createElement('div');
            tag.className = `ausencia-tag ${info.tipo}`;
            tag.textContent = info.nome;
            cell.appendChild(tag);
        });

        cell.addEventListener('click', (event) => {
            event.stopPropagation();

            if (typeof window.abrirModalLancamento === 'function') {
                window.abrirModalLancamento(cell.classList.contains('holiday') ? 'feriados' : 'pessoal', dataISO, true);
                return;
            }

            if (typeof window.abrirModalAusencia === 'function') {
                window.abrirModalAusencia(dataISO);
            }
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
    mesAtual += diferenca;

    if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual -= 1;
    } else if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual += 1;
    }

    window.mesAtual = mesAtual;
    window.anoAtual = anoAtual;

    await carregarFeriados(anoAtual);
    gerarCalendario(mesAtual, anoAtual);

    const modalLancamento = document.getElementById('modalLancamento');
    if (modalLancamento && !modalLancamento.classList.contains('hidden') && typeof carregarListagens === 'function') {
        if (window.modalFiltroData && window.modalDataSelecionada && typeof carregarListagensComFiltro === 'function') {
            await carregarListagensComFiltro(window.modalDataSelecionada, true);
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

async function inicializarCalendario() {
    await carregarFeriados(anoAtual);
    gerarDiasSemana();
    gerarCalendario(mesAtual, anoAtual);
    configurarNavegacaoCalendario();
}

import { escapeHtml } from '../../lib/html-seguro.js';
import { aguardarLayoutRelatorioPdf, baixarPdfSemPreview, criarContainerTemporarioRelatorioPdf, criarPdfMultipaginasComCanvas, lockPdfViewportOverflow, renderizarPaginaPdfEmCanvas } from '../../lib/pdf-utils.js';
import { gerarCalendario } from '../../telas/calendar.js';
import { renderDashboard } from '../../telas/dashboard/render.js';
import { abrirEditorNaEscala } from '../../telas/escala-dia-editor.js';
import { buildEscalaMonthOptions, formatDatePtBrEscala, formatDurationEscala, formatTimeRangeEscala, getMonthBoundsEscala, getTimeMinutesEscala, RELATORIO_ESCALA_MODOS, toISODateEscala } from '../../telas/escala-dia-shared.js';
import { atualizarAcoesCabecalhoEscala, obterDataSelecionadaEscala } from '../../telas/escala-dia/acoes-do-dia.js';
import { carregarEscalaDiaEscala } from '../../telas/escala-dia/editor-lateral.js';
import { gerarRelatorioEscala } from '../../telas/escala-relatorio.js';
import { buildColaboradorOptionsEscala, buildSetorOptionsRelatorioEscala, buildTipoOptionsEscala } from '../../telas/escala-relatorio/filtros.js';
import { toggleEscalaReportModeFilters } from '../../telas/escala-relatorio/quadro-mensal.js';
import { API } from '../api.js';
import { gerarLegendaMensal } from '../app/calendario-e-legenda.js';
import { mostrarToast } from '../app/horas-e-resumo.js';
import { gerarOptionsMeses } from '../app/relatorios-export.js';
import { estado } from '../estado.js';
import { carregarColaboradores, carregarPlantoes, carregarSetores } from './dados-e-modais.js';
import { normalizeRuntimeToken } from './normalizacao.js';
import { isColaboradoresScreenVisible } from './plantao-colaboradores/helpers.js';
import { renderListaColaboradores } from './plantao-colaboradores/plantao-editor.js';
import { ehDataPlantaoValida, renderLancamentoPlantao } from './plantao-colaboradores/plantao-regua-e-relatorios.js';
import { gerarRelatorioCompleto } from './relatorio-mensal.js';
import { atributosAcao } from '../../lib/atributos-acao.js';

function getCurrentPageKeyEscala() {
    const hash = (window.location.hash || '#dashboard').replace(/^#/, '').trim();
    return hash || 'dashboard';
}

async function refreshEscalaViewEscala() {
    if (!document.getElementById('timelineBody')) {
        return;
    }

    const selectedDate = obterDataSelecionadaEscala();
    await carregarEscalaDiaEscala(selectedDate);
    atualizarAcoesCabecalhoEscala();

    if (estado.escalaEditorColaboradorId) {
        abrirEditorNaEscala(estado.escalaEditorColaboradorId);
    }
}

function refreshColaboradoresViewEscala() {
    if (!isColaboradoresScreenVisible()) {
        return;
    }

    const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
    const lista = termoBusca
        ? (estado.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
        : (estado.colaboradores || []);

    renderListaColaboradores(lista);
}

function captureRelatoriosStateEscala() {
    const visualization = document.getElementById('relatorioVisualizacao');
    const title = document.getElementById('relatorioTitulo')?.innerText || '';

    return {
        reportVisible: Boolean(visualization && visualization.style.display !== 'none'),
        reportTitle: title,
        escalaMode: document.getElementById('relatorioEscalaModo')?.value || RELATORIO_ESCALA_MODOS.QUADRO_MENSAL,
        escalaMes: document.getElementById('relatorioEscalaMes')?.value || '',
        escalaAno: document.getElementById('relatorioEscalaAno')?.value || '',
        escalaDataInicio: document.getElementById('relatorioEscalaDataInicio')?.value || '',
        escalaDataFim: document.getElementById('relatorioEscalaDataFim')?.value || '',
        escalaSetor: document.getElementById('relatorioEscalaSetor')?.value || '',
        escalaColaborador: document.getElementById('relatorioEscalaColaborador')?.value || '',
        escalaTipo: document.getElementById('relatorioEscalaTipo')?.value || '',
        plantaoDataInicio: document.getElementById('relatorioPlantaoDataInicio')?.value || '',
        plantaoDataFim: document.getElementById('relatorioPlantaoDataFim')?.value || '',
        plantaoColaborador: document.getElementById('relatorioPlantaoColaborador')?.value || '',
        plantaoStatus: document.getElementById('relatorioPlantaoStatus')?.value || 'todos'
    };
}

function restoreRelatoriosStateEscala(snapshot) {
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element && value !== undefined) {
            element.value = value;
        }
    };

    setValue('relatorioEscalaModo', snapshot.escalaMode);
    toggleEscalaReportModeFilters();

    setValue('relatorioEscalaMes', snapshot.escalaMes);
    setValue('relatorioEscalaAno', snapshot.escalaAno);
    setValue('relatorioEscalaDataInicio', snapshot.escalaDataInicio);
    setValue('relatorioEscalaDataFim', snapshot.escalaDataFim);
    setValue('relatorioEscalaSetor', snapshot.escalaSetor);
    setValue('relatorioEscalaColaborador', snapshot.escalaColaborador);
    setValue('relatorioEscalaTipo', snapshot.escalaTipo);
    setValue('relatorioPlantaoDataInicio', snapshot.plantaoDataInicio);
    setValue('relatorioPlantaoDataFim', snapshot.plantaoDataFim);
    setValue('relatorioPlantaoColaborador', snapshot.plantaoColaborador);
    setValue('relatorioPlantaoStatus', snapshot.plantaoStatus);
}

async function refreshRelatoriosViewEscala() {
    if (!document.querySelector('.relatorios-grid')) {
        return;
    }

    const snapshot = captureRelatoriosStateEscala();

    if (!snapshot.reportVisible) {
        return;
    }

    await renderRelatorios();
    restoreRelatoriosStateEscala(snapshot);

    const reportKey = normalizeRuntimeToken(snapshot.reportTitle);

    if (reportKey.includes('plantao')) {
        await gerarRelatorioPlantoes();
        return;
    }

    if (reportKey.includes('escala')) {
        await gerarRelatorioEscala();
        return;
    }

    if (reportKey.includes('mensal') || reportKey.includes('completo')) {
        await gerarRelatorioCompleto();
    }
}

export async function __refreshVisibleViews() {
    if (document.getElementById('calendar')) {
        const mes = estado.mesAtual ?? new Date().getMonth();
        const ano = estado.anoAtual ?? new Date().getFullYear();
        gerarCalendario(mes, ano);
    }

    gerarLegendaMensal();

    const currentPage = getCurrentPageKeyEscala();

    if (currentPage === 'dashboard') {
        await renderDashboard();
        return;
    }

    if (currentPage === 'escala') {
        await refreshEscalaViewEscala();
        return;
    }

    if (currentPage === 'lancamentoPlantao') {
        await renderLancamentoPlantao();
        return;
    }

    if (currentPage === 'colaboradores') {
        refreshColaboradoresViewEscala();
        return;
    }

    if (currentPage === 'relatorios') {
        await refreshRelatoriosViewEscala();
    }
}

function buildPlantaoColaboradorOptions(selectedId = '') {
    return `
            <option value="">Todos os colaboradores</option>
            ${(estado.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtml(item.Nome)}
                </option>
            `).join('')}
        `;
}

function getPlantaoDurationMinutesReport(plantao) {
    const directMinutes = Number(plantao?.duracaoMinutos);

    if (Number.isFinite(directMinutes) && directMinutes > 0) {
        return directMinutes;
    }

    const start = getTimeMinutesEscala(plantao?.horaInicio);
    const end = getTimeMinutesEscala(plantao?.horaFim);

    if (start === null || end === null || end <= start) {
        return 0;
    }

    return end - start;
}

function getPlantaoDurationLabelReport(plantao) {
    const minutes = getPlantaoDurationMinutesReport(plantao);
    return minutes > 0 ? formatDurationEscala(minutes) : '--';
}

function buildPlantaoReportSummary(items) {
    const uniqueCollaborators = new Set();
    const dias = new Set();
    let totalMinutes = 0;
    // Hora extra nao entra no banco: somar tudo num "credito" so daria um
    // numero que nao bate com nenhum saldo. Os dois totais vao separados.
    let bancoMinutes = 0;
    let extraMinutes = 0;

    items.forEach((plantao) => {
        const colaboradoresCount = Array.isArray(plantao.colaboradores) ? plantao.colaboradores.length : 0;
        const durationMinutes = getPlantaoDurationMinutesReport(plantao);
        const horasEquipe = durationMinutes * Math.max(colaboradoresCount, 0);

        (plantao.colaboradores || []).forEach((id) => uniqueCollaborators.add(Number(id)));
        dias.add(plantao.dataISO);
        totalMinutes += durationMinutes;

        if (plantao.tipoCredito === 'extra') {
            extraMinutes += horasEquipe;
        } else {
            bancoMinutes += horasEquipe;
        }
    });

    return {
        // Conta DIAS de plantao: um dia com dois turnos e um plantao so.
        totalPlantoes: dias.size,
        totalColaboradores: uniqueCollaborators.size,
        horasProgramadas: formatDurationEscala(totalMinutes || 0),
        horasBanco: formatDurationEscala(bancoMinutes || 0),
        horasExtra: formatDurationEscala(extraMinutes || 0)
    };
}

function getPlantaoReportFiltersFromUI() {
    return {
        dataInicio: document.getElementById('relatorioPlantaoDataInicio')?.value || '',
        dataFim: document.getElementById('relatorioPlantaoDataFim')?.value || '',
        colaboradorId: document.getElementById('relatorioPlantaoColaborador')?.value || '',
        status: document.getElementById('relatorioPlantaoStatus')?.value || 'todos'
    };
}

async function buildPlantaoReportItems(filters) {
    await carregarColaboradores();

    const payload = await API.getPlantoes({
        from: filters.dataInicio,
        to: filters.dataFim
    });

    return (Array.isArray(payload) ? payload : [])
        .map((item) => ({
            ...item,
            dataISO: toISODateEscala(item.dataISO || item.data_plantao),
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            tipoCredito: String(item.tipoCredito || item.tipo_credito || '').toLowerCase() === 'extra' ? 'extra' : 'banco',
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
            horaInicio: item.horaInicio || item.hora_inicio || null,
            horaFim: item.horaFim || item.hora_fim || null,
            observacao: item.observacao || null,
            duracaoMinutos: Number(item.duracaoMinutos || 0) || null,
            duracaoFormatada: item.duracaoFormatada || null
        }))
        .filter((plantao) => {
            if (!['sabado', 'domingo', 'feriado'].includes(plantao.tipoPlantao) && !ehDataPlantaoValida(plantao.dataISO)) {
                return false;
            }

            if (filters.colaboradorId && !(plantao.colaboradores || []).some((id) => Number(id) === Number(filters.colaboradorId))) {
                return false;
            }

            if (filters.status === 'com_equipe') {
                return (plantao.colaboradores || []).length > 0;
            }

            if (filters.status === 'sem_equipe') {
                return (plantao.colaboradores || []).length === 0;
            }

            return true;
        });
}

function gerarHtmlPdfRelatorioPlantoes(items, filters = {}) {
    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio de Plantoes</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        width: 1480px;
                        padding: 16px;
                        background: #ffffff;
                        color: #0f172a;
                        font-family: Arial, sans-serif;
                    }
                    .pdf-pagina {
                        width: 1448px;
                        min-height: 980px;
                        padding: 18px;
                        background: #ffffff;
                        overflow: visible;
                    }
                    .plantao-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 18px;
                        margin-bottom: 16px;
                        padding-bottom: 12px;
                        border-bottom: 2px solid #dbeafe;
                    }
                    .plantao-export-header h1 {
                        color: #1e3a5f;
                        font-size: 30px;
                        line-height: 1.1;
                    }
                    .plantao-export-header p {
                        color: #64748b;
                        font-size: 13px;
                        font-weight: 700;
                    }
                    .relatorio-total {
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 10px;
                        background: #eef2ff;
                        color: #312e81;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .resumo-cards {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 10px;
                    }
                    .resumo-card-estatistica {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px;
                        border: 1px solid #dbe3ef;
                        border-radius: 10px;
                        background: #f8fafc;
                    }
                    .resumo-card-estatistica i {
                        color: #1d63ed;
                        font-size: 18px;
                    }
                    .resumo-card-estatistica strong {
                        display: block;
                        color: #0f172a;
                        font-size: 18px;
                    }
                    .resumo-card-estatistica span {
                        color: #64748b;
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .relatorio-tabela {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 12px;
                    }
                    .relatorio-tabela th,
                    .relatorio-tabela td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        color: #0f172a;
                        font-size: 12px;
                        line-height: 1.3;
                        text-align: left;
                        vertical-align: top;
                    }
                    .relatorio-tabela th {
                        background: #e2e8f0;
                        color: #0f172a;
                        font-weight: 800;
                    }
                    .evento-tipo {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 999px;
                        font-weight: 700;
                        font-size: 11px;
                    }
                    .badge-folga {
                        background: #dcfce7;
                        color: #166534;
                    }
                    .badge-ausencia {
                        background: #fee2e2;
                        color: #991b1b;
                    }
                    .empty-state {
                        padding: 28px;
                        border: 1px dashed #cbd5e1;
                        border-radius: 12px;
                        color: #64748b;
                        text-align: center;
                        font-size: 16px;
                    }
                </style>
            </head>
            <body>
                <section class="pdf-pagina plantao-export-page">
                    <header class="plantao-export-header">
                        <div>
                            <h1>Relatorio de Plantoes de Sabado</h1>
                            <p>${escapeHtml(formatDatePtBrEscala(filters.dataInicio))} ate ${escapeHtml(formatDatePtBrEscala(filters.dataFim))}</p>
                        </div>
                        <p>Gerado em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    ${renderRelatorioPlantoes(items, filters)}
                </section>
            </body>
            </html>
        `;
}

export async function gerarRelatorioPlantoes() {
    const filters = getPlantaoReportFiltersFromUI();

    if (!filters.dataInicio || !filters.dataFim) {
        mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
        return;
    }

    try {
        const items = await buildPlantaoReportItems(filters);

        document.getElementById('relatorioTitulo').innerText = `Relatorio de Plantoes de Sabado - ${formatDatePtBrEscala(filters.dataInicio)} ate ${formatDatePtBrEscala(filters.dataFim)}`;
        document.getElementById('relatorioConteudo').innerHTML = renderRelatorioPlantoes(items, filters);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    } catch (error) {
        mostrarToast(`Erro ao gerar relatorio de plantoes: ${error.message}`, 'error');
    }
}

export async function exportarRelatorioPlantoes() {
    const filters = getPlantaoReportFiltersFromUI();

    if (!filters.dataInicio || !filters.dataFim) {
        mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
        return;
    }

    if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
        mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
        return;
    }

    let container = null;
    let releaseViewportLock = null;

    try {
        mostrarToast('Gerando PDF de plantoes...', 'warning');

        const items = await buildPlantaoReportItems(filters);
        const html = gerarHtmlPdfRelatorioPlantoes(items, filters);

        releaseViewportLock = lockPdfViewportOverflow();
        container = criarContainerTemporarioRelatorioPdf(html, { width: 1480 });
        await aguardarLayoutRelatorioPdf();

        const canvas = await renderizarPaginaPdfEmCanvas(container, {
            minWidth: 1600,
            minHeight: 1000,
            scale: 1.65,
            maxCanvasSide: 12000,
            maxCanvasPixels: 22000000
        });
        const { pdf } = criarPdfMultipaginasComCanvas(canvas, {
            preferLandscape: true,
            marginMm: 6,
            minScaleMmPerPixel: 0.065,
            imageFormat: 'JPEG',
            imageQuality: 0.94,
            minimumPages: 1,
            maxSourcePageHeight: 1300
        });
        const salvarPdf = baixarPdfSemPreview;
        salvarPdf(pdf, `Relatorio_Plantoes_${filters.dataInicio}_${filters.dataFim}.pdf`);

        mostrarToast('PDF de plantoes gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar relatorio de plantoes:', error);

        mostrarToast(`Erro ao exportar relatorio de plantoes: ${error.message}`, 'error');
    } finally {
        releaseViewportLock?.();
        container?.remove();
    }
}

function renderRelatorioPlantoes(items, filters = {}) {
    if (!items.length) {
        return '<div class="empty-state">Nenhum plantao encontrado no periodo</div>';
    }

    const summary = buildPlantaoReportSummary(items);

    return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtml(formatDatePtBrEscala(filters.dataInicio || items[items.length - 1]?.dataISO))}</strong>
                    ate
                    <strong>${escapeHtml(formatDatePtBrEscala(filters.dataFim || items[0]?.dataISO))}</strong>
                </div>
                <div class="resumo-cards" style="margin-bottom: 18px;">
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-calendar-check"></i>
                        <div>
                            <strong>${summary.totalPlantoes}</strong>
                            <span>Plantoes no periodo</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-users"></i>
                        <div>
                            <strong>${summary.totalColaboradores}</strong>
                            <span>Colaboradores envolvidos</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-clock"></i>
                        <div>
                            <strong>${escapeHtml(summary.horasProgramadas)}</strong>
                            <span>Horas programadas</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-piggy-bank"></i>
                        <div>
                            <strong>${escapeHtml(summary.horasBanco)}</strong>
                            <span>Credito em banco de horas</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-money-bill-wave"></i>
                        <div>
                            <strong>${escapeHtml(summary.horasExtra)}</strong>
                            <span>Horas extras (fora do banco)</span>
                        </div>
                    </div>
                </div>
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Horario</th>
                            <th>Destino</th>
                            <th>Status</th>
                            <th>Colaboradores</th>
                            <th>Observacao</th>
                            <th>Duracao</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...items]
                        .sort((first, second) => (
                            String(second.dataISO).localeCompare(String(first.dataISO))
                            || String(first.horaInicio || '').localeCompare(String(second.horaInicio || ''))
                        ))
                        .map((plantao) => {
                            const colaboradores = (plantao.colaboradores || []).map((id) => {
                                const colaborador = (estado.colaboradores || []).find((item) => Number(item.Id) === Number(id));
                                return colaborador?.Nome || 'Desconhecido';
                            });
                            const statusLabel = colaboradores.length > 0 ? 'Equipe definida' : 'Sem equipe';
                            const statusClass = colaboradores.length > 0 ? 'badge-folga' : 'badge-ausencia';
                            const extra = plantao.tipoCredito === 'extra';

                            return `
                                    <tr>
                                        <td><strong>${escapeHtml(formatDatePtBrEscala(plantao.dataISO))}</strong></td>
                                        <td>${escapeHtml((plantao.tipoPlantao || 'sabado').charAt(0).toUpperCase() + (plantao.tipoPlantao || 'sabado').slice(1))}</td>
                                        <td>${escapeHtml(formatTimeRangeEscala(plantao.horaInicio, plantao.horaFim))}</td>
                                        <td><span class="evento-tipo ${extra ? 'badge-ausencia' : 'badge-folga'}">${extra ? 'Hora extra' : 'Banco de horas'}</span></td>
                                        <td><span class="evento-tipo ${statusClass}">${escapeHtml(statusLabel)}</span></td>
                                        <td>${escapeHtml(colaboradores.join(', ') || '--')}</td>
                                        <td>${escapeHtml(plantao.observacao || '--')}</td>
                                        <td>${escapeHtml(plantao.duracaoFormatada || getPlantaoDurationLabelReport(plantao))}</td>
                                    </tr>
                                `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

export async function renderRelatorios() {
    const appContent = document.getElementById('appContent');

    if (!appContent) {
        return;
    }

    const todayISO = toISODateEscala(new Date());
    const monthBounds = getMonthBoundsEscala(todayISO);
    const todayDate = new Date();
    const currentMonth = todayDate.getMonth();
    const currentMonthNumber = currentMonth + 1;
    const currentYear = todayDate.getFullYear();

    await Promise.allSettled([
        carregarColaboradores(),
        carregarSetores(),
        carregarPlantoes()
    ]);

    appContent.innerHTML = `
            <div class="page-header relatorios-page-header">
                <h1><i class="fas fa-chart-bar"></i> Relatorios</h1>
            </div>

            <!-- Os tres relatorios sao tarefas excludentes: usa-se um de cada
                 vez. Abertos ao mesmo tempo somavam 1253px e obrigavam a
                 rolar sempre. Viraram abas — os tres continuam no DOM (so o
                 inativo fica oculto), para que os handlers existentes sigam
                 encontrando seus campos por id. -->
            <div class="relatorios-abas" role="tablist">
                <button type="button" class="relatorios-aba is-ativa" data-relatorio-aba="mensal" role="tab" aria-selected="true">
                    <i class="fas fa-calendar-alt"></i> Mensal completo
                </button>
                <button type="button" class="relatorios-aba" data-relatorio-aba="escala" role="tab" aria-selected="false">
                    <i class="fas fa-table"></i> Escala
                </button>
                <button type="button" class="relatorios-aba" data-relatorio-aba="plantoes" role="tab" aria-selected="false">
                    <i class="fas fa-calendar-check"></i> Plantoes de sabado
                </button>
            </div>

            <div class="relatorios-grid">
                <div class="relatorio-card is-ativo" data-relatorio-painel="mensal">
                    <div class="relatorio-card-header">
                        <i class="fas fa-calendar-alt"></i>
                        <h2>Relatorio Mensal Completo</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Ferias, folgas, ausencias e feriados do mes selecionado.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-calendar"></i> Mes/Ano</label>
                                <div class="mes-selector">
                                    <select id="relatorioMesCompleto" class="form-control">
                                        ${gerarOptionsMeses(currentMonth)}
                                    </select>
                                    <input type="number" id="relatorioAnoCompleto" class="form-control" value="${currentYear}" min="2020" max="2035">
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button ${atributosAcao('gerarRelatorioCompleto')} class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button ${atributosAcao('exportarRelatorioCompleto')} class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="relatorio-card" data-relatorio-painel="escala">
                    <div class="relatorio-card-header">
                        <i class="fas fa-table"></i>
                        <h2>Relatorio de Escala</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Alterne entre o quadro mensal operacional e a consulta detalhada da escala diaria consolidada.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-layer-group"></i> Visualizacao</label>
                                <select id="relatorioEscalaModo" class="form-control">
                                    <option value="${RELATORIO_ESCALA_MODOS.QUADRO_MENSAL}" selected>Quadro mensal</option>
                                    <option value="${RELATORIO_ESCALA_MODOS.DETALHADO}">Detalhado</option>
                                </select>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-building"></i> Setor</label>
                                <select id="relatorioEscalaSetor" class="form-control">
                                    ${buildSetorOptionsRelatorioEscala()}
                                </select>
                            </div>
                            <div class="relatorio-escala-view is-active" data-escala-report-mode="${RELATORIO_ESCALA_MODOS.QUADRO_MENSAL}">
                                <div class="filtro-group">
                                    <label><i class="fas fa-calendar-alt"></i> Mes/Ano</label>
                                    <div class="mes-selector">
                                        <select id="relatorioEscalaMes" class="form-control">
                                            ${buildEscalaMonthOptions(currentMonthNumber)}
                                        </select>
                                        <input type="number" id="relatorioEscalaAno" class="form-control" value="${currentYear}" min="2020" max="2035">
                                    </div>
                                </div>
                            </div>
                            <div class="relatorio-escala-view" data-escala-report-mode="${RELATORIO_ESCALA_MODOS.DETALHADO}">
                                <div class="filtro-group">
                                    <label><i class="fas fa-calendar-day"></i> Periodo</label>
                                    <div class="periodo-selector">
                                        <input type="date" id="relatorioEscalaDataInicio" class="form-control" value="${escapeHtml(monthBounds.start)}">
                                        <span>ate</span>
                                        <input type="date" id="relatorioEscalaDataFim" class="form-control" value="${escapeHtml(monthBounds.end)}">
                                    </div>
                                </div>
                                <div class="filtro-group">
                                    <label><i class="fas fa-user"></i> Colaborador</label>
                                    <select id="relatorioEscalaColaborador" class="form-control">
                                        ${buildColaboradorOptionsEscala()}
                                    </select>
                                </div>
                                <div class="filtro-group">
                                    <label><i class="fas fa-filter"></i> Tipo</label>
                                    <select id="relatorioEscalaTipo" class="form-control">
                                        ${buildTipoOptionsEscala()}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button ${atributosAcao('gerarRelatorioEscala')} class="btn-primary">
                                <i class="fas fa-search"></i> Visualizar
                            </button>
                            <button ${atributosAcao('exportarRelatorioEscala')} class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="relatorio-card" data-relatorio-painel="plantoes">
                    <div class="relatorio-card-header">
                        <i class="fas fa-calendar-check"></i>
                        <h2>Relatorio de Plantoes de Sabado</h2>
                    </div>
                    <div class="relatorio-card-body">
                        <p class="relatorio-descricao">
                            Consulte plantoes de sabado por periodo, colaborador e status da equipe.
                        </p>
                        <div class="relatorio-filtros">
                            <div class="filtro-group">
                                <label><i class="fas fa-calendar"></i> Periodo</label>
                                <div class="periodo-selector">
                                    <input type="date" id="relatorioPlantaoDataInicio" class="form-control" value="${monthBounds.start}">
                                    <span>ate</span>
                                    <input type="date" id="relatorioPlantaoDataFim" class="form-control" value="${monthBounds.end}">
                                </div>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-user"></i> Colaborador</label>
                                <select id="relatorioPlantaoColaborador" class="form-control">
                                    ${buildPlantaoColaboradorOptions()}
                                </select>
                            </div>
                            <div class="filtro-group">
                                <label><i class="fas fa-filter"></i> Status</label>
                                <select id="relatorioPlantaoStatus" class="form-control">
                                    <option value="todos">Todos</option>
                                    <option value="com_equipe">Com equipe</option>
                                    <option value="sem_equipe">Sem equipe</option>
                                </select>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button ${atributosAcao('gerarRelatorioPlantoes')} class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button ${atributosAcao('exportarRelatorioPlantoes')} class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="relatorioVisualizacao" class="relatorio-visualizacao" style="display: none;">
                <div class="relatorio-visualizacao-header">
                    <h3><i class="fas fa-file-alt"></i> <span id="relatorioTitulo"></span></h3>
                    <button ${atributosAcao('fecharRelatorio')} class="btn-secondary">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
                <div id="relatorioConteudo" class="relatorio-conteudo"></div>
            </div>
        `;

    document.getElementById('relatorioEscalaModo')?.addEventListener('change', toggleEscalaReportModeFilters);
    toggleEscalaReportModeFilters();
    ativarAbasRelatorios();
}

// Alterna qual relatorio esta visivel. Os paineis inativos continuam no
// DOM (apenas ocultos), entao os handlers de gerar/exportar seguem
// encontrando seus campos por getElementById sem nenhuma alteracao.
function ativarAbasRelatorios() {
    const abas = Array.from(document.querySelectorAll('.relatorios-aba'));
    const paineis = Array.from(document.querySelectorAll('[data-relatorio-painel]'));

    if (abas.length === 0 || paineis.length === 0) {
        return;
    }

    const selecionar = (chave) => {
        abas.forEach((aba) => {
            const ativa = aba.dataset.relatorioAba === chave;
            aba.classList.toggle('is-ativa', ativa);
            aba.setAttribute('aria-selected', ativa ? 'true' : 'false');
        });

        paineis.forEach((painel) => {
            painel.classList.toggle('is-ativo', painel.dataset.relatorioPainel === chave);
        });
    };

    abas.forEach((aba) => {
        aba.addEventListener('click', () => selecionar(aba.dataset.relatorioAba));
    });

    selecionar('mensal');
}

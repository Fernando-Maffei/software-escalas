// Relatorio "Domingos e feriados" (aba da tela de Relatorios): a planilha que
// o time mantinha a mao — dias trabalhados, contador por pessoa e o rodizio
// com o ultimo dia de cada um — montada a partir dos plantoes lancados. O
// calculo fica em lib/rodizio-domingos.js; aqui so filtros, tela e PDF.
import { atributosAcao } from '../../lib/atributos-acao.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { aguardarLayoutRelatorioPdf, baixarPdfSemPreview, criarContainerTemporarioRelatorioPdf, criarPdfMultipaginasComCanvas, lockPdfViewportOverflow, renderizarPaginaPdfEmCanvas } from '../../lib/pdf-utils.js';
import { montarRodizioDomingos } from '../../lib/rodizio-domingos.js';
import { formatDatePtBrEscala, formatDurationEscala } from '../../telas/escala-dia-shared.js';
import { API } from '../api.js';
import { mostrarToast } from '../app/horas-e-resumo.js';
import { estado } from '../estado.js';
import { carregarColaboradores } from './dados-e-modais.js';

const TITULO_RELATORIO_DOMINGOS = 'Relatorio de Domingos e Feriados';

// Do comeco do ano ao fim do mes que vem: o rodizio precisa do historico, e
// os domingos ja escalados do proximo mes tambem contam para saber quem vem.
function periodoPadraoDomingos(hoje = new Date()) {
    const ano = hoje.getFullYear();
    const fim = new Date(ano, hoje.getMonth() + 2, 0);
    const doisDigitos = (valor) => String(valor).padStart(2, '0');

    return {
        inicio: `${ano}-01-01`,
        fim: `${fim.getFullYear()}-${doisDigitos(fim.getMonth() + 1)}-${doisDigitos(fim.getDate())}`
    };
}

export function renderPainelRelatorioDomingos(opcoesColaboradorHtml) {
    const periodo = periodoPadraoDomingos();

    return `
            <div class="relatorio-card" data-relatorio-painel="domingos">
                <div class="relatorio-card-header">
                    <i class="fas fa-calendar-week"></i>
                    <h2>${TITULO_RELATORIO_DOMINGOS}</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Quem trabalhou em cada domingo e feriado, quantos fez de plantao e de cobertura de almoco, e o ultimo dia de cada um.
                    </p>
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label for="relatorioDomingosInicio"><i class="fas fa-calendar"></i> Periodo</label>
                            <div class="periodo-selector">
                                <input type="date" id="relatorioDomingosInicio" class="form-control" value="${periodo.inicio}">
                                <span>ate</span>
                                <input type="date" id="relatorioDomingosFim" class="form-control" value="${periodo.fim}" aria-label="Data final">
                            </div>
                        </div>
                        <div class="filtro-group">
                            <label for="relatorioDomingosColaborador"><i class="fas fa-user"></i> Colaborador</label>
                            <select id="relatorioDomingosColaborador" class="form-control">
                                ${opcoesColaboradorHtml}
                            </select>
                        </div>
                    </div>
                    <div class="relatorio-actions">
                        <button ${atributosAcao('gerarRelatorioDomingos')} class="btn-primary">
                            <i class="fas fa-file-alt"></i> Visualizar
                        </button>
                        <button ${atributosAcao('exportarRelatorioDomingos')} class="btn-secondary">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            </div>
        `;
}

function lerFiltrosDomingos() {
    return {
        inicioISO: document.getElementById('relatorioDomingosInicio')?.value || '',
        fimISO: document.getElementById('relatorioDomingosFim')?.value || '',
        colaboradorId: document.getElementById('relatorioDomingosColaborador')?.value || ''
    };
}

async function montarDadosRelatorioDomingos(filtros) {
    await carregarColaboradores();

    const plantoes = await API.getPlantoes({ from: filtros.inicioISO, to: filtros.fimISO });

    return montarRodizioDomingos(Array.isArray(plantoes) ? plantoes : [], estado.colaboradores || [], filtros);
}

function renderTabelaRodizio(pessoas) {
    if (pessoas.length === 0) {
        return '<div class="empty-state">Ninguem trabalhou em domingo ou feriado no periodo.</div>';
    }

    return `
            <div class="relatorio-tabela-scroll relatorio-tabela-scroll--inteira">
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th>Total</th>
                            <th>Plantao</th>
                            <th>Cobertura de almoco</th>
                            <th>Ultimo dia</th>
                            <th>Dia da semana</th>
                            <th>Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pessoas.map((item) => `
                            <tr>
                                <td><strong>${escapeHtml(item.nome)}</strong></td>
                                <td>${item.total}</td>
                                <td>${item.plantao}</td>
                                <td>${item.cobertura}</td>
                                <td>${item.ultimo ? escapeHtml(formatDatePtBrEscala(item.ultimo.dataISO)) : 'Nenhum no periodo'}</td>
                                <td>${item.ultimo ? escapeHtml(item.ultimo.diaSemana) : '--'}</td>
                                <td>${item.ultimo ? escapeHtml(item.ultimo.rotulo) : '--'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderTabelaDias(dias) {
    if (dias.length === 0) {
        return '';
    }

    return `
            <h4>Dias trabalhados</h4>
            <div class="relatorio-tabela-scroll">
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th>Data</th>
                            <th>Dia da semana</th>
                            <th>Tipo</th>
                            <th>Horas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dias.map((dia) => `
                            <tr>
                                <td>${escapeHtml(dia.nome)}</td>
                                <td>${escapeHtml(formatDatePtBrEscala(dia.dataISO))}</td>
                                <td>${escapeHtml(dia.diaSemana)}</td>
                                <td>${escapeHtml(dia.rotulo)}</td>
                                <td>${dia.minutos > 0 ? escapeHtml(formatDurationEscala(dia.minutos)) : '--'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderRelatorioDomingos(relatorio, filtros) {
    const { totais } = relatorio;

    return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtml(formatDatePtBrEscala(filtros.inicioISO))}</strong>
                    ate <strong>${escapeHtml(formatDatePtBrEscala(filtros.fimISO))}</strong>
                    &middot; ${totais.dias} dia(s) &middot; ${totais.plantao} plantao(oes) &middot; ${totais.cobertura} cobertura(s) de almoco
                </div>
                <h4>Rodizio</h4>
                <p class="relatorio-descricao">Quem esta ha mais tempo sem trabalhar domingo ou feriado aparece primeiro.</p>
                ${renderTabelaRodizio(relatorio.pessoas)}
                ${renderTabelaDias(relatorio.dias)}
            </div>
        `;
}

function validarFiltrosDomingos(filtros) {
    if (!filtros.inicioISO || !filtros.fimISO) {
        mostrarToast('Informe a data inicial e a final do relatorio.', 'error');
        return false;
    }

    if (filtros.fimISO < filtros.inicioISO) {
        mostrarToast('A data final precisa ser depois da inicial.', 'error');
        return false;
    }

    return true;
}

export async function gerarRelatorioDomingos() {
    const filtros = lerFiltrosDomingos();

    if (!validarFiltrosDomingos(filtros)) {
        return;
    }

    try {
        const relatorio = await montarDadosRelatorioDomingos(filtros);

        document.getElementById('relatorioTitulo').innerText = `${TITULO_RELATORIO_DOMINGOS} - ${formatDatePtBrEscala(filtros.inicioISO)} ate ${formatDatePtBrEscala(filtros.fimISO)}`;
        document.getElementById('relatorioConteudo').innerHTML = renderRelatorioDomingos(relatorio, filtros);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    } catch (error) {
        mostrarToast(`Erro ao gerar o relatorio: ${error.message}`, 'error');
    }
}

// Mesmo caminho do PDF de plantoes: HTML proprio, com estilos inline,
// renderizado num container fora da tela e fatiado em paginas.
function gerarHtmlPdfRelatorioDomingos(relatorio, filtros) {
    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${TITULO_RELATORIO_DOMINGOS}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { width: 1200px; padding: 16px; background: #ffffff; color: #0f172a; font-family: Arial, sans-serif; }
                    .pdf-pagina { width: 1168px; padding: 18px; background: #ffffff; }
                    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #dbeafe; }
                    h1 { color: #1e3a5f; font-size: 28px; }
                    header p { color: #64748b; font-size: 13px; font-weight: 700; }
                    h4 { margin: 18px 0 8px; color: #1e3a5f; font-size: 16px; }
                    .relatorio-total { margin-bottom: 6px; padding: 10px 12px; border-radius: 10px; background: #eef2ff; color: #312e81; font-size: 14px; }
                    .relatorio-descricao { color: #64748b; font-size: 12px; margin-bottom: 6px; }
                    .relatorio-tabela { width: 100%; border-collapse: collapse; }
                    .relatorio-tabela th, .relatorio-tabela td { border: 1px solid #dbe3ef; padding: 7px 10px; font-size: 12px; text-align: left; }
                    .relatorio-tabela th { background: #e2e8f0; font-weight: 800; }
                    .empty-state { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b; text-align: center; }
                </style>
            </head>
            <body>
                <section class="pdf-pagina">
                    <header>
                        <h1>Domingos e feriados trabalhados</h1>
                        <p>Gerado em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    ${renderRelatorioDomingos(relatorio, filtros)}
                </section>
            </body>
            </html>
        `;
}

export async function exportarRelatorioDomingos() {
    const filtros = lerFiltrosDomingos();

    if (!validarFiltrosDomingos(filtros)) {
        return;
    }

    if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
        mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
        return;
    }

    let container = null;
    let liberarViewport = null;

    try {
        mostrarToast('Gerando PDF de domingos e feriados...', 'warning');

        const relatorio = await montarDadosRelatorioDomingos(filtros);

        liberarViewport = lockPdfViewportOverflow();
        container = criarContainerTemporarioRelatorioPdf(gerarHtmlPdfRelatorioDomingos(relatorio, filtros), { width: 1200 });
        await aguardarLayoutRelatorioPdf();

        const canvas = await renderizarPaginaPdfEmCanvas(container, {
            minWidth: 1250,
            minHeight: 900,
            scale: 1.65,
            maxCanvasSide: 12000,
            maxCanvasPixels: 22000000
        });
        const { pdf } = criarPdfMultipaginasComCanvas(canvas, {
            preferLandscape: false,
            marginMm: 8,
            minScaleMmPerPixel: 0.065,
            imageFormat: 'JPEG',
            imageQuality: 0.94,
            minimumPages: 1,
            maxSourcePageHeight: 1650
        });

        baixarPdfSemPreview(pdf, `Domingos_Feriados_${filtros.inicioISO}_${filtros.fimISO}.pdf`);
        mostrarToast('PDF de domingos e feriados gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar relatorio de domingos e feriados:', error);
        mostrarToast(`Erro ao exportar o relatorio: ${error.message}`, 'error');
    } finally {
        liberarViewport?.();
        container?.remove();
    }
}

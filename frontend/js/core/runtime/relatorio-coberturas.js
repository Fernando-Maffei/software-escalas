// Relatorio "Coberturas" (aba da tela de Relatorios): quem cobriu plantonista
// no periodo, cada horario com quem estava sendo coberto e para onde foram as
// horas (banco ou hora extra), e o que ficou sem ninguem. O calculo fica em
// lib/coberturas.js; aqui so filtros, tela e PDF, no molde do relatorio de
// domingos e feriados.
import { atributosAcao } from '../../lib/atributos-acao.js';
import { montarRelatorioCoberturas, rotuloDia } from '../../lib/coberturas.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { aguardarLayoutRelatorioPdf, baixarPdfSemPreview, criarContainerTemporarioRelatorioPdf, criarPdfMultipaginasComCanvas, lockPdfViewportOverflow, renderizarPaginaPdfEmCanvas } from '../../lib/pdf-utils.js';
import { formatDatePtBrEscala, formatDurationEscala } from '../../telas/escala-dia-shared.js';
import { API } from '../api.js';
import { mostrarToast } from '../app/horas-e-resumo.js';

const TITULO_RELATORIO_COBERTURAS = 'Relatorio de Coberturas';
const ROTULO_DESTINO = { banco: 'Banco de horas', extra: 'Hora extra' };

// O mes corrente inteiro.
function periodoPadraoCoberturas(hoje = new Date()) {
    const doisDigitos = (valor) => String(valor).padStart(2, '0');
    const ano = hoje.getFullYear();
    const mes = doisDigitos(hoje.getMonth() + 1);
    const fim = new Date(ano, hoje.getMonth() + 1, 0).getDate();

    return { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${doisDigitos(fim)}` };
}

export function renderPainelRelatorioCoberturas(opcoesColaboradorHtml) {
    const periodo = periodoPadraoCoberturas();

    return `
            <div class="relatorio-card" data-relatorio-painel="coberturas">
                <div class="relatorio-card-header">
                    <i class="fas fa-people-arrows"></i>
                    <h2>${TITULO_RELATORIO_COBERTURAS}</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Quem cobriu plantonista no periodo, em que horario, cobrindo quem e para onde foram as horas; e o horario que ficou sem ninguem.
                    </p>
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label for="relatorioCoberturasInicio"><i class="fas fa-calendar"></i> Periodo</label>
                            <div class="periodo-selector">
                                <input type="date" id="relatorioCoberturasInicio" class="form-control" value="${periodo.inicio}">
                                <span>ate</span>
                                <input type="date" id="relatorioCoberturasFim" class="form-control" value="${periodo.fim}" aria-label="Data final">
                            </div>
                        </div>
                        <div class="filtro-group">
                            <label for="relatorioCoberturasColaborador"><i class="fas fa-user"></i> Quem cobriu</label>
                            <select id="relatorioCoberturasColaborador" class="form-control">
                                ${opcoesColaboradorHtml}
                            </select>
                        </div>
                    </div>
                    <div class="relatorio-actions">
                        <button ${atributosAcao('gerarRelatorioCoberturas')} class="btn-primary">
                            <i class="fas fa-file-alt"></i> Visualizar
                        </button>
                        <button ${atributosAcao('exportarRelatorioCoberturas')} class="btn-secondary">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            </div>
        `;
}

function lerFiltrosCoberturas() {
    return {
        inicioISO: document.getElementById('relatorioCoberturasInicio')?.value || '',
        fimISO: document.getElementById('relatorioCoberturasFim')?.value || '',
        colaboradorId: document.getElementById('relatorioCoberturasColaborador')?.value || ''
    };
}

function validarFiltrosCoberturas(filtros) {
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

async function montarDadosRelatorioCoberturas(filtros) {
    const resposta = await API.getCoberturas({ dataInicio: filtros.inicioISO, dataFim: filtros.fimISO });

    return montarRelatorioCoberturas(resposta?.items || [], filtros);
}

function duracao(minutos) {
    return minutos > 0 ? formatDurationEscala(minutos) : '--';
}

function renderTabelaPessoas(pessoas) {
    if (pessoas.length === 0) {
        return '<div class="empty-state">Ninguem cobriu plantonista no periodo.</div>';
    }

    return `
            <div class="relatorio-tabela-scroll relatorio-tabela-scroll--inteira">
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Quem cobriu</th>
                            <th>Banco de horas</th>
                            <th>Hora extra</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pessoas.map((pessoa) => `
                            <tr>
                                <td><strong>${escapeHtml(pessoa.nome)}</strong></td>
                                <td>${escapeHtml(duracao(pessoa.minutosBanco))}</td>
                                <td>${escapeHtml(duracao(pessoa.minutosExtra))}</td>
                                <td>${escapeHtml(duracao(pessoa.minutosBanco + pessoa.minutosExtra))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderTabelaHorarios(pessoas) {
    const linhas = pessoas.flatMap((pessoa) => pessoa.trechos.map((trecho) => ({ ...trecho, nome: pessoa.nome })));

    if (linhas.length === 0) {
        return '';
    }

    return `
            <h4>Horarios cobertos</h4>
            <div class="relatorio-tabela-scroll">
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Quem cobriu</th>
                            <th>Dia</th>
                            <th>Horario</th>
                            <th>Cobrindo</th>
                            <th>Destino</th>
                            <th>Horas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas.map((linha) => `
                            <tr>
                                <td>${escapeHtml(linha.nome)}</td>
                                <td>${escapeHtml(rotuloDia(linha.dataISO))}</td>
                                <td>${escapeHtml(`${linha.horaInicio}–${linha.horaFim}`)}</td>
                                <td>${escapeHtml(linha.titularNome)}</td>
                                <td>${escapeHtml(ROTULO_DESTINO[linha.tipoCredito] || '--')}</td>
                                <td>${escapeHtml(duracao(linha.minutos))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderTabelaPendentes(pendentes) {
    if (pendentes.length === 0) {
        return '';
    }

    return `
            <h4>Sem ninguem cobrindo</h4>
            <div class="relatorio-tabela-scroll">
                <table class="relatorio-tabela">
                    <thead>
                        <tr><th>Plantonista</th><th>Dia</th><th>Horario</th><th>Horas</th></tr>
                    </thead>
                    <tbody>
                        ${pendentes.map((linha) => `
                            <tr>
                                <td>${escapeHtml(linha.titularNome)}</td>
                                <td>${escapeHtml(rotuloDia(linha.dataISO))}</td>
                                <td>${escapeHtml(`${linha.horaInicio}–${linha.horaFim}`)}</td>
                                <td>${escapeHtml(duracao(linha.minutos))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderRelatorioCoberturas(relatorio, filtros) {
    const { totais } = relatorio;

    return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtml(formatDatePtBrEscala(filtros.inicioISO))}</strong>
                    ate <strong>${escapeHtml(formatDatePtBrEscala(filtros.fimISO))}</strong>
                    &middot; ${escapeHtml(duracao(totais.banco))} em banco
                    &middot; ${escapeHtml(duracao(totais.extra))} em hora extra
                    ${totais.pendente ? `&middot; ${escapeHtml(duracao(totais.pendente))} sem ninguem` : ''}
                </div>
                ${renderTabelaPessoas(relatorio.pessoas)}
                ${renderTabelaHorarios(relatorio.pessoas)}
                ${renderTabelaPendentes(relatorio.pendentes)}
            </div>
        `;
}

export async function gerarRelatorioCoberturas() {
    const filtros = lerFiltrosCoberturas();

    if (!validarFiltrosCoberturas(filtros)) {
        return;
    }

    try {
        const relatorio = await montarDadosRelatorioCoberturas(filtros);

        document.getElementById('relatorioTitulo').innerText = `${TITULO_RELATORIO_COBERTURAS} - ${formatDatePtBrEscala(filtros.inicioISO)} ate ${formatDatePtBrEscala(filtros.fimISO)}`;
        document.getElementById('relatorioConteudo').innerHTML = renderRelatorioCoberturas(relatorio, filtros);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    } catch (error) {
        mostrarToast(`Erro ao gerar o relatorio: ${error.message}`, 'error');
    }
}

function gerarHtmlPdfRelatorioCoberturas(relatorio, filtros) {
    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${TITULO_RELATORIO_COBERTURAS}</title>
                <style>
                    /* Tudo dentro de .pdf-coberturas: o container do PDF entra na
                       pagina enquanto exporta (ver o relatorio de domingos). */
                    .pdf-coberturas { width: 1168px; padding: 18px; background: #ffffff; color: #0f172a; font-family: Arial, sans-serif; }
                    .pdf-coberturas * { box-sizing: border-box; }
                    .pdf-coberturas header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #dbeafe; }
                    .pdf-coberturas h1 { margin: 0; color: #1e3a5f; font-size: 28px; }
                    .pdf-coberturas header p { margin: 0; color: #64748b; font-size: 13px; font-weight: 700; }
                    .pdf-coberturas h4 { margin: 18px 0 8px; padding: 0 0 6px; border-bottom: 1px solid #dbe3ef; color: #1e3a5f; font-size: 16px; }
                    .pdf-coberturas .relatorio-total { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; background: #eef2ff; color: #312e81; font-size: 14px; }
                    .pdf-coberturas .relatorio-tabela-scroll { max-height: none; overflow: visible; }
                    .pdf-coberturas .relatorio-tabela { width: 100%; border-collapse: collapse; }
                    .pdf-coberturas .relatorio-tabela th,
                    .pdf-coberturas .relatorio-tabela td { position: static; border: 1px solid #dbe3ef; padding: 7px 10px; color: #0f172a; font-size: 12px; text-align: left; box-shadow: none; }
                    .pdf-coberturas .relatorio-tabela th { background: #e2e8f0; font-weight: 800; }
                    .pdf-coberturas .empty-state { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b; text-align: center; }
                </style>
            </head>
            <body>
                <section class="pdf-pagina pdf-coberturas">
                    <header>
                        <h1>Coberturas de plantonista</h1>
                        <p>Gerado em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    ${renderRelatorioCoberturas(relatorio, filtros)}
                </section>
            </body>
            </html>
        `;
}

export async function exportarRelatorioCoberturas() {
    const filtros = lerFiltrosCoberturas();

    if (!validarFiltrosCoberturas(filtros)) {
        return;
    }

    if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
        mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
        return;
    }

    let container = null;
    let liberarViewport = null;

    try {
        mostrarToast('Gerando PDF de coberturas...', 'warning');

        const relatorio = await montarDadosRelatorioCoberturas(filtros);

        liberarViewport = lockPdfViewportOverflow();
        container = criarContainerTemporarioRelatorioPdf(gerarHtmlPdfRelatorioCoberturas(relatorio, filtros), { width: 1200 });
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

        baixarPdfSemPreview(pdf, `Coberturas_${filtros.inicioISO}_${filtros.fimISO}.pdf`);
        mostrarToast('PDF de coberturas gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar relatorio de coberturas:', error);
        mostrarToast(`Erro ao exportar o relatorio: ${error.message}`, 'error');
    } finally {
        liberarViewport?.();
        container?.remove();
    }
}

import { API } from '../core/api.js';
import { mostrarToast } from '../core/app/horas-e-resumo.js';
import { aguardarLayoutRelatorioPdf, baixarPdfSemPreview, criarContainerTemporarioRelatorioPdf, criarPdfMultipaginasComCanvas, renderizarPaginaPdfEmCanvas } from '../lib/pdf-utils.js';
import { formatDatePtBrEscala, MESES_LABELS, RELATORIO_ESCALA_MODOS } from './escala-dia-shared.js';
import { renderMonthlyEscalaReport } from './escala-relatorio/agrupamento-setor.js';
import { getRelatorioEscalaSetorId, getRelatorioEscalaSetorNome } from './escala-relatorio/filtros.js';
import { gerarHtmlPdfRelatorioEscala } from './escala-relatorio/pdf-template.js';
import { getEscalaMonthlyFilters, getEscalaReportMode } from './escala-relatorio/quadro-mensal.js';
import { renderDetailedEscalaReport } from './escala-relatorio/relatorio-detalhado.js';
import { buildEscalaExportSnapshot, medirSobraDaFolhaEscala } from './escala-relatorio/snapshot-export.js';

function ajustarDensidadeFolhasEscala(container) {
    // Da fonte maior para a menor: 11px, 9.5px, 8px.
    const NIVEIS = ['', 'is-dense', 'is-ultra-dense'];
    const folhas = [...(container?.querySelectorAll('.escala-export-month-page') || [])];
    let folhasEstouradas = 0;

    const aplicar = (folha, nivel) => {
        NIVEIS.filter(Boolean).forEach((classe) => folha.classList.remove(classe));

        if (nivel) {
            folha.classList.add(nivel);
        }
    };

    // Testa da MAIOR fonte para a menor e fica na primeira que couber.
    // Antes so encolhia a partir da classe que o gerador tinha escolhido
    // por faixa de linhas — uma folha com espaco de sobra continuava na
    // fonte miuda, sem motivo nenhum.
    const nivelNecessario = folhas.map((folha) => {
        const indice = NIVEIS.findIndex((nivel) => {
            aplicar(folha, nivel);
            return medirSobraDaFolhaEscala(folha) >= 0;
        });

        if (indice === -1) {
            folhasEstouradas += 1;
            return NIVEIS.length - 1;
        }

        return indice;
    });

    // Uma unica densidade para o relatorio inteiro: folhas com tamanhos de
    // letra diferentes, no mesmo documento impresso, parecem defeito. Vale
    // a menor fonte exigida por alguma folha.
    const nivelComum = NIVEIS[Math.max(0, ...nivelNecessario)];
    folhas.forEach((folha) => aplicar(folha, nivelComum));

    return { folhas: folhas.length, folhasEstouradas, densidade: nivelComum || 'normal' };
}

// Mensagem para filtro invalido no modo atual do relatorio, ou null. Filtro
// errado e entrada do usuario: vira aviso na tela, nao erro no console.
function mensagemFiltroInvalidoRelatorioEscala() {
    if (getEscalaReportMode() === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
        return getEscalaMonthlyFilters() ? null : 'Informe um mes e ano validos para o quadro mensal.';
    }

    const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
    const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;

    return dataInicio && dataFim ? null : 'Informe a data inicial e final do relatorio.';
}

export async function gerarRelatorioEscala() {
    const modo = getEscalaReportMode();

    try {
        if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
            const filters = getEscalaMonthlyFilters();

            if (!filters) {
                mostrarToast('Informe um mes e ano validos para o quadro mensal.', 'error');
                return;
            }

            const payload = await API.getEscalaRelatorio({
                dataInicio: filters.dataInicio,
                dataFim: filters.dataFim,
                setorId: filters.setorId || undefined
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];

            document.getElementById('relatorioTitulo').innerText = `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`;
            document.getElementById('relatorioConteudo').innerHTML = renderMonthlyEscalaReport(items, filters);
            document.getElementById('relatorioVisualizacao').style.display = 'block';
            return;
        }

        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const setorId = getRelatorioEscalaSetorId();
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            mostrarToast('Informe a data inicial e final do relatorio.', 'error');
            return;
        }

        const payload = await API.getEscalaRelatorio({
            dataInicio,
            dataFim,
            setorId: setorId || undefined,
            colaboradorId: colaboradorId || undefined,
            tipo: tipo || undefined
        });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        document.getElementById('relatorioTitulo').innerText = `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`;
        document.getElementById('relatorioConteudo').innerHTML = renderDetailedEscalaReport(items, {
            dataInicio,
            dataFim,
            setorId,
            setorNome: getRelatorioEscalaSetorNome(setorId)
        });
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    } catch (error) {
        mostrarToast(`Erro ao gerar relatorio: ${error.message}`, 'error');
    }
}

export async function exportarRelatorioEscala() {
    if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
        mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
        return;
    }

    const filtroInvalido = mensagemFiltroInvalidoRelatorioEscala();

    if (filtroInvalido) {
        mostrarToast(filtroInvalido, 'error');
        return;
    }

    let container = null;
    const releaseViewportLock = null;

    try {
        mostrarToast('Gerando PDF do relatorio de escala...', 'warning');

        const snapshot = await buildEscalaExportSnapshot();
        const html = gerarHtmlPdfRelatorioEscala(snapshot);
        const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;

        container = criarContainerTemporarioRelatorioPdf(html, {
            width: isMonthlyExport ? 1700 : 1480
        });
        await aguardarLayoutRelatorioPdf();

        // Com a folha ja montada e medida, e o unico momento em que da para
        // saber se o conteudo realmente coube na altura da pagina.
        if (isMonthlyExport) {
            const ajuste = ajustarDensidadeFolhasEscala(container);

            if (ajuste.folhasEstouradas > 0) {
                console.warn('[relatorio-escala] ' + ajuste.folhasEstouradas + ' de ' + ajuste.folhas + ' folha(s) nao couberam nem na densidade maxima; o PDF pode sair com linhas cortadas.');
            }

            await aguardarLayoutRelatorioPdf();
        }

        const canvas = await renderizarPaginaPdfEmCanvas(container, {
            minWidth: isMonthlyExport ? 1700 : 1800,
            minHeight: isMonthlyExport ? 1180 : 1200,
            scale: isMonthlyExport ? 1.45 : 1.65,
            maxCanvasSide: isMonthlyExport ? 12000 : 14000,
            maxCanvasPixels: isMonthlyExport ? 22000000 : 24000000
        });
        const { pdf } = criarPdfMultipaginasComCanvas(canvas, {
            preferLandscape: true,
            marginMm: isMonthlyExport ? 5 : 6,
            minScaleMmPerPixel: isMonthlyExport ? 0.075 : 0.065,
            imageFormat: 'JPEG',
            imageQuality: 0.94,
            minimumPages: isMonthlyExport ? 1 : 2,
            maxSourcePageHeight: isMonthlyExport ? 1160 : 1300
        });

        const salvarPdf = baixarPdfSemPreview;
        salvarPdf(pdf, `${snapshot.fileBase}.pdf`);

        mostrarToast('PDF do relatorio de escala gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar relatorio de escala:', error);

        mostrarToast(`Erro ao exportar relatorio de escala: ${error.message}`, 'error');
    } finally {
        releaseViewportLock?.();
        container?.remove();
    }
}

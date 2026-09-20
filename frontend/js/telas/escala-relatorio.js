    window.ajustarDensidadeFolhasEscala = function ajustarDensidadeFolhasEscala(container) {
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
    };

    window.gerarRelatorioEscala = gerarRelatorioEscala = async function gerarRelatorioEscalaAtualizado() {
        const modo = getEscalaReportMode();

        try {
            if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
                const filters = getEscalaMonthlyFilters();

                if (!filters) {
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Informe um mes e ano validos para o quadro mensal.', 'error');
                    }
                    return;
                }

                const payload = await window.API.getEscalaRelatorio({
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
                if (typeof mostrarToast === 'function') {
                    mostrarToast('Informe a data inicial e final do relatorio.', 'error');
                }
                return;
            }

            const payload = await window.API.getEscalaRelatorio({
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
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio: ${error.message}`, 'error');
            }
        }
    };

    window.exportarRelatorioEscala = exportarRelatorioEscala = async function exportarRelatorioEscalaAtualizado() {
        if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
            }
            return;
        }

        let container = null;
        let releaseViewportLock = null;

        try {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Gerando PDF do relatorio de escala...', 'warning');
            }

            const snapshot = await buildEscalaExportSnapshot();
            const html = gerarHtmlPdfRelatorioEscala(snapshot);
            const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;

            if (typeof window.criarContainerTemporarioRelatorioPdf !== 'function'
                || typeof window.aguardarLayoutRelatorioPdf !== 'function'
                || typeof window.renderizarPaginaPdfEmCanvas !== 'function') {
                throw new Error('Os utilitarios de renderizacao do PDF nao estao disponiveis.');
            }

            container = window.criarContainerTemporarioRelatorioPdf(html, {
                width: isMonthlyExport ? 1700 : 1480
            });
            await window.aguardarLayoutRelatorioPdf();

            // Com a folha ja montada e medida, e o unico momento em que da para
            // saber se o conteudo realmente coube na altura da pagina.
            if (isMonthlyExport && typeof window.ajustarDensidadeFolhasEscala === 'function') {
                const ajuste = window.ajustarDensidadeFolhasEscala(container);

                if (ajuste.folhasEstouradas > 0) {
                    console.warn('[relatorio-escala] ' + ajuste.folhasEstouradas + ' de ' + ajuste.folhas + ' folha(s) nao couberam nem na densidade maxima; o PDF pode sair com linhas cortadas.');
                }

                await window.aguardarLayoutRelatorioPdf();
            }

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: isMonthlyExport ? 1700 : 1800,
                minHeight: isMonthlyExport ? 1180 : 1200,
                scale: isMonthlyExport ? 1.45 : 1.65,
                maxCanvasSide: isMonthlyExport ? 12000 : 14000,
                maxCanvasPixels: isMonthlyExport ? 22000000 : 24000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: isMonthlyExport ? 5 : 6,
                minScaleMmPerPixel: isMonthlyExport ? 0.075 : 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: isMonthlyExport ? 1 : 2,
                maxSourcePageHeight: isMonthlyExport ? 1160 : 1300
            });

            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `${snapshot.fileBase}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF do relatorio de escala gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao exportar relatorio de escala:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao exportar relatorio de escala: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };


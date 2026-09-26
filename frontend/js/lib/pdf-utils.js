(function () {
    if (window.__pdfReportUtilsLoaded) {
        return;
    }

    window.__pdfReportUtilsLoaded = true;

    function criarContainerTemporarioRelatorioPdf(html, options = {}) {
        const parser = new DOMParser().parseFromString(html, 'text/html');
        const container = document.createElement('div');
        const estilos = Array.from(parser.querySelectorAll('style'))
            .map((style) => style.outerHTML)
            .join('');
        const containerWidth = Math.max(Number(options.width) || 1500, 1200);

        container.setAttribute('data-relatorio-pdf', 'true');
        container.style.position = 'fixed';
        container.style.left = '-100000px';
        container.style.top = '0';
        container.style.width = `${containerWidth}px`;
        container.style.background = '#ffffff';
        container.style.transform = 'none';
        container.style.transformOrigin = 'top left';
        container.style.pointerEvents = 'none';
        container.style.contain = 'layout paint style';
        container.style.zIndex = '-1';

        container.innerHTML = `${estilos}${parser.body.innerHTML}`;
        document.body.appendChild(container);

        return container;
    }

    async function aguardarLayoutRelatorioPdf() {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        if (document.fonts?.ready) {
            try {
                await document.fonts.ready;
            } catch (error) {
                // Fonte que nao carregou nao impede o PDF: ele sai com a fonte
                // substituta do navegador.
                console.warn('[pdf] fontes nao carregaram; seguindo com a fonte padrao.', error);
            }
        }
    }

    function lockPdfViewportOverflow() {
        const root = document.documentElement;
        const body = document.body;
        const previousState = {
            rootOverflowX: root?.style?.overflowX || '',
            bodyOverflowX: body?.style?.overflowX || ''
        };

        if (root) {
            root.style.overflowX = 'hidden';
        }

        if (body) {
            body.style.overflowX = 'hidden';
        }

        return () => {
            if (root) {
                root.style.overflowX = previousState.rootOverflowX;
            }

            if (body) {
                body.style.overflowX = previousState.bodyOverflowX;
            }
        };
    }

    async function renderizarPaginaPdfEmCanvas(elemento, options = {}) {
        const minWidth = Math.max(Number(options.minWidth) || 1800, 1400);
        const minHeight = Math.max(Number(options.minHeight) || 1200, 1000);
        const configuredScale = Number(options.scale);
        const deviceScale = Number(window.devicePixelRatio) || 1;
        const desiredScale = Number.isFinite(configuredScale) && configuredScale > 0
            ? Math.max(configuredScale, 1)
            : Math.max(Math.min(deviceScale * 1.5, 3), 2.2);
        const sourceWidth = Math.max(Number(elemento.scrollWidth) || minWidth, 1);
        const sourceHeight = Math.max(Number(elemento.scrollHeight) || minHeight, 1);
        const maxCanvasSide = Math.max(Number(options.maxCanvasSide) || 12000, 4000);
        const maxCanvasPixels = Math.max(Number(options.maxCanvasPixels) || 24000000, 6000000);
        const scaleBySide = Math.min(maxCanvasSide / sourceWidth, maxCanvasSide / sourceHeight);
        const scaleByPixels = Math.sqrt(maxCanvasPixels / Math.max(sourceWidth * sourceHeight, 1));
        const renderScale = Math.max(Math.min(desiredScale, scaleBySide, scaleByPixels), 1);

        const canvas = await html2canvas(elemento, {
            scale: renderScale,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: sourceWidth,
            height: sourceHeight,
            windowWidth: Math.max(sourceWidth, minWidth),
            windowHeight: Math.max(sourceHeight, minHeight)
        });

        canvas.__pdfSourceWidth = sourceWidth;
        canvas.__pdfSourceHeight = sourceHeight;
        canvas.__pdfRenderScale = renderScale;

        return canvas;
    }

    const PDF_PAGE_SIZES_MM = [
        { name: 'a4', width: 210, height: 297 },
        { name: 'a3', width: 297, height: 420 },
        { name: 'a2', width: 420, height: 594 },
        { name: 'a1', width: 594, height: 841 },
        { name: 'a0', width: 841, height: 1189 }
    ];

    function resolvePdfOneSheetLayout(canvas, options = {}) {
        const margin = Math.max(Number(options.marginMm) || 6, 0);
        const preferLandscape = options.preferLandscape !== false;
        const minScale = Math.max(Number(options.minScaleMmPerPixel) || 0.075, 0.03);
        const sourceWidth = Math.max(Number(options.sourceWidth || canvas.__pdfSourceWidth || canvas.width), 1);
        const sourceHeight = Math.max(Number(options.sourceHeight || canvas.__pdfSourceHeight || canvas.height), 1);
        const orientations = preferLandscape
            ? ['landscape', 'portrait']
            : ['portrait', 'landscape'];

        for (const size of PDF_PAGE_SIZES_MM) {
            for (const orientation of orientations) {
                const pageWidth = orientation === 'landscape' ? size.height : size.width;
                const pageHeight = orientation === 'landscape' ? size.width : size.height;
                const usableWidth = pageWidth - (margin * 2);
                const usableHeight = pageHeight - (margin * 2);
                const scale = Math.min(usableWidth / sourceWidth, usableHeight / sourceHeight);

                if (scale >= minScale) {
                    return {
                        format: size.name,
                        orientation,
                        pageWidth,
                        pageHeight,
                        margin,
                        sourceWidth,
                        sourceHeight,
                        scale
                    };
                }
            }
        }

        const rawWidth = (sourceWidth * minScale) + (margin * 2);
        const rawHeight = (sourceHeight * minScale) + (margin * 2);
        const orientation = rawWidth >= rawHeight ? 'landscape' : 'portrait';
        const pageWidth = rawWidth;
        const pageHeight = rawHeight;
        const scale = Math.min(
            (pageWidth - (margin * 2)) / sourceWidth,
            (pageHeight - (margin * 2)) / sourceHeight
        );

        return {
            format: [pageWidth, pageHeight],
            orientation,
            pageWidth,
            pageHeight,
            margin,
            sourceWidth,
            sourceHeight,
            scale
        };
    }

    function getPdfCanvasImagePayload(canvas, options = {}) {
        const requestedFormat = String(options.imageFormat || '').trim().toUpperCase();
        const format = requestedFormat === 'PNG' ? 'PNG' : 'JPEG';

        if (format === 'PNG') {
            return {
                data: canvas.toDataURL('image/png'),
                format,
                compression: 'MEDIUM'
            };
        }

        const quality = Math.min(Math.max(Number(options.imageQuality) || 0.94, 0.75), 0.98);

        return {
            data: canvas.toDataURL('image/jpeg', quality),
            format,
            compression: 'FAST'
        };
    }

    function criarPdfUmaFolhaComCanvas(canvas, options = {}) {
        const layout = resolvePdfOneSheetLayout(canvas, options);
        const pdf = new window.jspdf.jsPDF({
            orientation: layout.orientation,
            unit: 'mm',
            format: layout.format,
            compress: true
        });
        const larguraRender = layout.sourceWidth * layout.scale;
        const alturaRender = layout.sourceHeight * layout.scale;
        const posicaoX = (layout.pageWidth - larguraRender) / 2;
        const posicaoY = (layout.pageHeight - alturaRender) / 2;
        const imagePayload = getPdfCanvasImagePayload(canvas, options);

        pdf.addImage(
            imagePayload.data,
            imagePayload.format,
            posicaoX,
            posicaoY,
            larguraRender,
            alturaRender,
            undefined,
            imagePayload.compression
        );

        return {
            pdf,
            layout,
            larguraRender,
            alturaRender
        };
    }

    function recortarCanvasParaPaginaPdf(canvas, startSourceY, pageSourceHeight, sourceWidth, sourceHeight) {
        const renderScale = Math.max(Number(canvas.__pdfRenderScale) || (canvas.height / sourceHeight) || 1, 1);
        const startCanvasY = Math.max(Math.floor(startSourceY * renderScale), 0);
        const canvasSliceHeight = Math.max(
            Math.min(Math.ceil(pageSourceHeight * renderScale), canvas.height - startCanvasY),
            1
        );
        const sliceCanvas = document.createElement('canvas');
        const context = sliceCanvas.getContext('2d');

        sliceCanvas.width = canvas.width;
        sliceCanvas.height = canvasSliceHeight;

        if (context) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            context.drawImage(
                canvas,
                0,
                startCanvasY,
                canvas.width,
                canvasSliceHeight,
                0,
                0,
                canvas.width,
                canvasSliceHeight
            );
        }

        sliceCanvas.__pdfSourceWidth = sourceWidth;
        sliceCanvas.__pdfSourceHeight = Math.min(pageSourceHeight, sourceHeight - startSourceY);
        sliceCanvas.__pdfRenderScale = renderScale;

        return sliceCanvas;
    }

    function dividirCanvasEmPaginasPdf(canvas, options = {}) {
        const sourceWidth = Math.max(Number(canvas.__pdfSourceWidth || canvas.width), 1);
        const sourceHeight = Math.max(Number(canvas.__pdfSourceHeight || canvas.height), 1);
        const minimumPages = Math.max(Number(options.minimumPages) || 1, 1);
        const configuredMaxHeight = Number(options.maxSourcePageHeight);
        const maxSourcePageHeight = Number.isFinite(configuredMaxHeight) && configuredMaxHeight > 0
            ? configuredMaxHeight
            : sourceHeight;
        const pageCountByHeight = Math.max(Math.ceil(sourceHeight / maxSourcePageHeight), 1);
        const pageCount = Math.max(pageCountByHeight, minimumPages);
        const pageSourceHeight = sourceHeight / pageCount;

        return Array.from({ length: pageCount }, (_, pageIndex) => {
            const startSourceY = pageIndex * pageSourceHeight;
            return recortarCanvasParaPaginaPdf(
                canvas,
                startSourceY,
                pageSourceHeight,
                sourceWidth,
                sourceHeight
            );
        });
    }

    function adicionarCanvasAoPdf(pdf, canvas, options = {}) {
        const layout = resolvePdfOneSheetLayout(canvas, options);
        let pdfDoc = pdf;

        if (!pdfDoc) {
            pdfDoc = new window.jspdf.jsPDF({
                orientation: layout.orientation,
                unit: 'mm',
                format: layout.format,
                compress: true
            });
        } else {
            pdfDoc.addPage(layout.format, layout.orientation);
        }

        const larguraRender = layout.sourceWidth * layout.scale;
        const alturaRender = layout.sourceHeight * layout.scale;
        const posicaoX = (layout.pageWidth - larguraRender) / 2;
        const posicaoY = (layout.pageHeight - alturaRender) / 2;
        const imagePayload = getPdfCanvasImagePayload(canvas, options);

        pdfDoc.addImage(
            imagePayload.data,
            imagePayload.format,
            posicaoX,
            posicaoY,
            larguraRender,
            alturaRender,
            undefined,
            imagePayload.compression
        );

        return {
            pdf: pdfDoc,
            layout
        };
    }

    function criarPdfMultipaginasComCanvas(canvas, options = {}) {
        const pageCanvases = dividirCanvasEmPaginasPdf(canvas, options);
        let pdf = null;
        const layouts = [];

        pageCanvases.forEach((pageCanvas) => {
            const result = adicionarCanvasAoPdf(pdf, pageCanvas, options);
            pdf = result.pdf;
            layouts.push(result.layout);
        });

        return {
            pdf,
            pageCount: pageCanvases.length,
            layouts
        };
    }

    function baixarPdfSemPreview(pdf, fileName) {
        const normalizedName = String(fileName || 'relatorio.pdf').trim() || 'relatorio.pdf';
        const finalName = normalizedName.toLowerCase().endsWith('.pdf')
            ? normalizedName
            : `${normalizedName}.pdf`;
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = finalName;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        window.setTimeout(() => {
            URL.revokeObjectURL(url);
            link.remove();
        }, 1000);
    }

    window.baixarPdfSemPreview = baixarPdfSemPreview;
    window.criarContainerTemporarioRelatorioPdf = criarContainerTemporarioRelatorioPdf;
    window.aguardarLayoutRelatorioPdf = aguardarLayoutRelatorioPdf;
    window.lockPdfViewportOverflow = lockPdfViewportOverflow;
    window.renderizarPaginaPdfEmCanvas = renderizarPaginaPdfEmCanvas;
    window.criarPdfUmaFolhaComCanvas = criarPdfUmaFolhaComCanvas;
    window.criarPdfMultipaginasComCanvas = criarPdfMultipaginasComCanvas;
})();

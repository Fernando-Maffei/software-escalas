    function gerarHtmlPdfRelatorioEscala(snapshot) {
        const isMonthlyExport = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL;
        const pageMetrics = isMonthlyExport
            ? {
                bodyWidth: 1660,
                pageWidth: 1660,
                pageHeight: 1160,
                pagePadding: 6,
                gridMinHeight: 1010,
                titleSize: 28,
                sectorHeaderSize: 18,
                dayHeaderSize: 18,
                tableFontSize: 14
            }
            : {
                bodyWidth: 1480,
                pageWidth: 1444,
                pageHeight: 980,
                pagePadding: 10,
                gridMinHeight: 900,
                titleSize: 28,
                sectorHeaderSize: 13,
                dayHeaderSize: 12,
                tableFontSize: 10
            };
        const bodyHtml = snapshot.mode === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL
            ? renderMonthlyEscalaExportPages(snapshot)
            : renderDetailedEscalaExportPages(snapshot);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(snapshot.title)}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        background: #ffffff;
                        color: #0f172a;
                        width: ${pageMetrics.bodyWidth}px;
                        padding: ${isMonthlyExport ? 0 : 16}px;
                    }
                    .pdf-pagina {
                        width: ${pageMetrics.pageWidth}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        height: auto;
                        background: white;
                        padding: ${pageMetrics.pagePadding}px;
                        display: flex;
                        flex-direction: column;
                        overflow: visible;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 24px;
                    }
                    .escala-export-month-page {
                        height: ${pageMetrics.pageHeight}px;
                        min-height: ${pageMetrics.pageHeight}px;
                        overflow: hidden;
                        background: #ffffff;
                        color: #000000;
                    }
                    .escala-export-month-page + .escala-export-month-page {
                        margin-top: 0;
                    }
                    .escala-sheet-title {
                        background: #28577e;
                        border: 2px solid #111111;
                        color: #ffffff;
                        font-size: 42px;
                        font-weight: 900;
                        line-height: 1;
                        padding: 8px 10px 9px;
                        text-align: center;
                        text-transform: uppercase;
                    }
                    .escala-sheet-meta {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 5px 2px 6px;
                        color: #111111;
                        font-size: 14px;
                        font-weight: 700;
                    }
                    .escala-sheet-meta span {
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .escala-sheet-weekdays {
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        gap: 5px;
                        margin-bottom: 5px;
                    }
                    .escala-sheet-weekdays span {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 48px;
                        padding: 4px 6px;
                        background: #28577e;
                        border: 2px solid #ffffff;
                        color: #ffffff;
                        font-size: 17px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-grid {
                        flex: 1;
                        min-height: 0;
                        display: grid;
                        grid-template-columns: repeat(var(--weekday-count, 6), minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 2), auto);
                        column-gap: 8px;
                        row-gap: 14px;
                        align-content: start;
                        align-items: start;
                    }
                    .escala-sheet-day {
                        min-width: 0;
                        min-height: 0;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        background: #f8fafc;
                        border: 1.5px solid #172033;
                        box-shadow: 0 0 0 2px #e2e8f0;
                    }
                    .escala-sheet-day.is-placeholder {
                        border-color: transparent;
                        background: #ffffff;
                        box-shadow: none;
                    }
                    .escala-sheet-day-date {
                        padding: 2px 5px;
                        background: #28577e;
                        border-bottom: 1.5px solid #111111;
                        color: #ffffff;
                        font-size: 15px;
                        font-weight: 900;
                        line-height: 1.05;
                        text-align: center;
                    }
                    .escala-sheet-table {
                        width: 100%;
                        height: auto;
                        flex: 0 0 auto;
                        border-collapse: collapse;
                        table-layout: fixed;
                        background: #ffffff;
                    }
                    .escala-sheet-table th,
                    .escala-sheet-table td {
                        border: 1px solid #2f3a46;
                        color: #000000;
                        font-size: 11px;
                        line-height: 1;
                        padding: 1px 2px;
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-sheet-table th {
                        height: 15px;
                        background: #b7d7f0;
                        font-weight: 900;
                    }
                    .escala-sheet-table td {
                        height: 17px;
                        background: #ffffff;
                        font-weight: 500;
                    }
                    .escala-sheet-table tbody tr:nth-child(even) td {
                        background: #f8fbff;
                    }
                    .escala-sheet-group {
                        background: #eef6fd !important;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-name {
                        background: #ffffff !important;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .escala-sheet-table td.is-destaque {
                        color: #d00000;
                        font-weight: 800;
                    }
                    .escala-sheet-empty {
                        height: 100%;
                        color: #222222 !important;
                        font-size: 13px !important;
                        font-style: italic;
                        font-weight: 700 !important;
                    }
                    .escala-sheet-day.is-empty .escala-sheet-table {
                        height: 100%;
                        flex: 1;
                    }
                    .escala-sheet-day.is-holiday .escala-sheet-empty {
                        color: #000000 !important;
                        font-size: 16px !important;
                        font-style: normal;
                        letter-spacing: 0;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-title {
                        font-size: 36px;
                        padding: 6px 8px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-weekdays span {
                        min-height: 40px;
                        font-size: 14px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-day-date {
                        font-size: 13px;
                        padding: 2px 4px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-grid {
                        row-gap: 10px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th,
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        font-size: 9.5px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table th {
                        height: 13px;
                    }
                    .escala-export-month-page.is-dense .escala-sheet-table td {
                        height: 14px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-title {
                        font-size: 32px;
                        padding: 5px 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-weekdays span {
                        min-height: 34px;
                        font-size: 12px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-day-date {
                        font-size: 11px;
                        padding: 1px 3px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-grid {
                        row-gap: 8px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th,
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        font-size: 8px;
                        line-height: 1;
                        padding: 0 1px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table th {
                        height: 11px;
                    }
                    .escala-export-month-page.is-ultra-dense .escala-sheet-table td {
                        height: 12px;
                    }
                    .escala-export-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 16px;
                        margin-bottom: 8px;
                    }
                    .escala-export-header h1 {
                        font-size: ${pageMetrics.titleSize}px;
                        line-height: 1.08;
                        color: #1e3a5f;
                    }
                    .escala-export-header p {
                        font-size: 12px;
                        color: #64748b;
                        font-weight: 700;
                    }
                    .escala-export-summary {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px 16px;
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 12px;
                        background: #eef2ff;
                        color: #312e81;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .escala-export-summary strong {
                        font-size: 16px;
                    }
                    .escala-export-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px 12px;
                        margin-bottom: 14px;
                        color: #1e3a5f;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .escala-export-meta span {
                        padding: 7px 10px;
                        border-radius: 999px;
                        background: #eff6ff;
                        border: 1px solid #bfdbfe;
                    }
                    .escala-export-holidays {
                        margin-bottom: 14px;
                        padding: 12px;
                        border-radius: 12px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                    }
                    .escala-export-holidays strong {
                        display: block;
                        margin-bottom: 8px;
                        color: #1e3a5f;
                    }
                    .escala-export-holidays ul {
                        list-style: none;
                        display: grid;
                        gap: 6px;
                    }
                    .escala-export-holidays li {
                        display: flex;
                        justify-content: space-between;
                        gap: 12px;
                        font-size: 12px;
                        color: #334155;
                    }
                    .escala-export-holidays li.is-muted {
                        color: #64748b;
                        font-style: italic;
                    }
                    .escala-export-page:not(.escala-export-detailed) .escala-export-summary,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-meta,
                    .escala-export-page:not(.escala-export-detailed) .escala-export-holidays {
                        display: none !important;
                    }
                    .relatorio-setor-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 10px;
                        padding: 9px 12px;
                        border-radius: 8px;
                        background: #f8fafc;
                        border: 1px solid #dbe3ef;
                        color: #1e3a5f;
                        font-size: ${pageMetrics.sectorHeaderSize}px;
                        font-weight: 700;
                    }
                    .relatorio-setor-header strong {
                        color: #475569;
                        font-size: 12px;
                    }
                    .escala-export-grid {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        grid-template-rows: repeat(var(--week-count, 5), minmax(0, 1fr));
                        gap: ${isMonthlyExport ? 8 : 10}px;
                        align-items: stretch;
                        flex: 1;
                        min-height: ${pageMetrics.gridMinHeight}px;
                        height: auto;
                        overflow: visible;
                    }
                    .escala-export-weekdays {
                        display: grid;
                        grid-template-columns: repeat(7, minmax(0, 1fr));
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .escala-export-weekdays span {
                        padding: 6px 8px;
                        border-radius: 8px;
                        background: #24415f;
                        color: #f8fafc;
                        text-align: center;
                        font-size: 13px;
                        font-weight: 800;
                    }
                    .escala-export-grid-calendario .escala-quadro-dia,
                    .escala-export-grid-calendario .escala-quadro-dia-placeholder {
                        height: 100%;
                    }
                    .escala-export-dia,
                    .escala-export-dia-placeholder {
                        min-width: 0;
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: #ffffff;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 9px rgba(15, 23, 42, 0.04);
                    }
                    .escala-export-dia-placeholder {
                        border-style: dashed;
                        background: #f8fbff;
                        opacity: 0.55;
                    }
                    .escala-export-dia.is-empty {
                        background: #fbfdff;
                    }
                    .escala-export-dia-header {
                        padding: 7px 8px;
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 800;
                        line-height: 1.05;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-export-lines {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding: 7px;
                        min-height: 0;
                        overflow: hidden;
                    }
                    .escala-export-line {
                        display: grid;
                        grid-template-columns: minmax(48px, 0.9fr) minmax(0, 1.25fr) minmax(48px, 0.9fr);
                        align-items: center;
                        gap: 4px;
                        min-height: 26px;
                        padding: 4px 5px;
                        border: 1px solid #dbe3ef;
                        border-radius: 7px;
                        background: #f8fbff;
                        color: #1f2937;
                        font-size: 12px;
                        line-height: 1.05;
                    }
                    .escala-export-line strong {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: #111827;
                        font-size: 12px;
                        text-align: center;
                    }
                    .escala-export-time,
                    .escala-export-work {
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        font-weight: 800;
                        text-align: center;
                        color: #334155;
                    }
                    .escala-export-empty {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748b;
                        font-size: 13px;
                        font-style: italic;
                    }
                    .escala-quadro-dia {
                        border: 1px solid #d6e0ea;
                        border-radius: 10px;
                        overflow: hidden;
                        background: white;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
                    }
                    .escala-quadro-dia-placeholder {
                        border: 1px dashed #d6e0ea;
                        border-radius: 10px;
                        background: #f8fbff;
                        opacity: 0.6;
                    }
                    .escala-quadro-dia-header {
                        padding: ${isMonthlyExport ? '8px 10px' : '6px 8px'};
                        background: #e8f0fb;
                        color: #24415f;
                        font-size: ${pageMetrics.dayHeaderSize}px;
                        font-weight: 700;
                        text-align: center;
                        border-bottom: 1px solid #d6e0ea;
                    }
                    .escala-quadro-tabela {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        flex: 1;
                        height: 100%;
                    }
                    .escala-quadro-tabela th,
                    .escala-quadro-tabela td {
                        border: 1px solid #dbe3ef;
                        padding: ${isMonthlyExport ? '5px 6px' : '4px 5px'};
                        font-size: ${pageMetrics.tableFontSize}px;
                        line-height: ${isMonthlyExport ? '1.2' : '1.15'};
                        text-align: center;
                        vertical-align: middle;
                    }
                    .escala-quadro-tabela th {
                        background: #f3f7fb;
                        color: #334155;
                        font-weight: 700;
                    }
                    .escala-quadro-tabela td {
                        background: #ffffff;
                        color: #1f2937;
                    }
                    .escala-quadro-grupo {
                        font-weight: 700;
                        background: #f7fafc !important;
                        color: #334155;
                    }
                    .escala-quadro-sem-escala {
                        padding: 8px 4px !important;
                        color: #64748b;
                        font-style: italic;
                        background: #fbfdff !important;
                    }
                    .escala-export-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .escala-export-table th,
                    .escala-export-table td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        font-size: 12px;
                        line-height: 1.3;
                        vertical-align: top;
                    }
                    .escala-export-table th {
                        background: #e2e8f0;
                        color: #0f172a;
                        font-size: 12px;
                        font-weight: 700;
                        text-align: left;
                    }
                    .escala-export-table td:last-child,
                    .escala-export-table th:last-child {
                        width: 22%;
                    }
                </style>
            </head>
            <body>${bodyHtml}</body>
            </html>
        `;
    }


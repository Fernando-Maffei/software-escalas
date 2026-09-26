(function () {
    if (window.__relatorioMensalFixLoaded) {
        return;
    }

    window.__relatorioMensalFixLoaded = true;

    const MESES_PT_BR = [
        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    function obterDataIsoRelatorio(valor) {
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

        const ano = data.getUTCFullYear();
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(data.getUTCDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function criarDataUtcSegura(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);
        return new Date(Date.UTC(ano, (mes || 1) - 1, dia || 1, 12, 0, 0));
    }

    function formatarDataRelatorio(dataISO) {
        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function montarPeriodoRelatorio(dataInicioISO, dataFimISO) {
        if (!dataInicioISO && !dataFimISO) {
            return '--';
        }

        if (!dataFimISO || dataInicioISO === dataFimISO) {
            return formatarDataRelatorio(dataInicioISO || dataFimISO);
        }

        return `de ${formatarDataRelatorio(dataInicioISO)} ate ${formatarDataRelatorio(dataFimISO)}`;
    }

    function criarMapaEventosPorData(mes, ano) {
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const eventosPorData = {};

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            eventosPorData[dataISO] = {
                feriado: null,
                colaboradores: []
            };
        }

        return eventosPorData;
    }

    function iterateDateRange(startISO, endISO, callback) {
        const current = criarDataUtcSegura(startISO);
        const end = criarDataUtcSegura(endISO);

        while (current <= end) {
            const ano = current.getUTCFullYear();
            const mes = String(current.getUTCMonth() + 1).padStart(2, '0');
            const dia = String(current.getUTCDate()).padStart(2, '0');
            callback(`${ano}-${mes}-${dia}`);
            current.setUTCDate(current.getUTCDate() + 1);
        }
    }

    function ordenarPorDataCampo(items, campo) {
        return [...items].sort((first, second) => {
            const valorA = first[campo] || '';
            const valorB = second[campo] || '';
            return valorA.localeCompare(valorB);
        });
    }

    async function construirDadosRelatorioMensal(mes, ano) {
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const primeiroDia = new Date(ano, mes, 1).getDay();
        const eventosPorData = criarMapaEventosPorData(mes, ano);
        const ferias = [];
        const folgas = [];
        const ausenciasLista = [];
        const feriadosLista = [];
        const primeiroDiaMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
        const ultimoDiaMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diasNoMes).padStart(2, '0')}`;

        function adicionarFeriado(item) {
            const dataISO = obterDataIsoRelatorio(item.data || item.Data || item.date);

            if (!dataISO || !eventosPorData[dataISO]) {
                return;
            }

            if (!eventosPorData[dataISO].feriado) {
                eventosPorData[dataISO].feriado = item.nome || item.Nome || item.name || 'Feriado';
            }

            feriadosLista.push({
                nome: item.nome || item.Nome || item.name || 'Feriado',
                data: dataISO,
                dataFormatada: formatarDataRelatorio(dataISO),
                tipo: item.tipo || item.Tipo || 'federal'
            });
        }

        // carregarFeriadosAPI trata a propria falha (devolve lista vazia e loga).
        if ((!window.feriadosAPI || !Array.isArray(window.feriadosAPI) || window.feriadosAPI.length === 0) && typeof carregarFeriadosAPI === 'function') {
            await carregarFeriadosAPI(ano);
        }

        // Mesmo cuidado que ja existia para feriados, agora para colaboradores
        // e ausencias: o relatorio le das listas globais e descarta em silencio
        // toda ausencia cujo colaborador nao esteja nelas. Se o carregamento
        // inicial tiver falhado (por exemplo sessao expirada), o relatorio saia
        // completo na aparencia, porem sem nenhum colaborador.
        // Os carregadores nao lancam: em falha avisam o usuario e devolvem os
        // ultimos dados (core/runtime/dados-e-modais.js); a checagem abaixo
        // avisa se mesmo assim faltar dado.
        if (!Array.isArray(window.colaboradores) || window.colaboradores.length === 0) {
            await carregarColaboradores();
        }

        if (!Array.isArray(window.ausencias) || window.ausencias.length === 0) {
            await carregarAusencias();
        }

        // Se mesmo apos a tentativa de recarga nao houver colaboradores, avisa
        // em vez de gerar um relatorio vazio que parece correto.
        if ((!Array.isArray(window.colaboradores) || window.colaboradores.length === 0)
            && typeof mostrarToast === 'function') {
            mostrarToast('Nao foi possivel carregar os colaboradores. O relatorio pode sair incompleto.', 'error');
        }

        (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.date);

            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                adicionarFeriado({
                    nome: item.name,
                    data: dataISO,
                    tipo: 'federal'
                });
            }
        });

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.Data || item.data);

            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                adicionarFeriado({
                    nome: item.Nome || item.nome,
                    data: dataISO,
                    tipo: item.Tipo || item.tipo || 'municipal'
                });
            }
        });

        (Array.isArray(window.ausencias) ? window.ausencias : []).forEach((item) => {
            const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
            const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);

            if (!dataInicioISO || !dataFimISO) {
                return;
            }

            if (dataFimISO < primeiroDiaMesISO || dataInicioISO > ultimoDiaMesISO) {
                return;
            }

            const colaboradorId = Number(item.ColaboradorId || item.colaboradorId);
            const colaborador = (window.colaboradores || []).find((entry) => Number(entry.Id) === colaboradorId);

            const tipo = String(item.Tipo || item.tipo || '').toLowerCase();

            // Colaborador ausente da lista global (excluido depois do
            // lancamento, ou lista nao carregada) continua aparecendo no
            // relatorio, identificado, em vez de a linha sumir sem rastro.
            const nomeColaborador = colaborador
                ? (colaborador.Nome || 'Desconhecido')
                : `Colaborador #${colaboradorId} (removido)`;
            const inicioNoMes = dataInicioISO < primeiroDiaMesISO ? primeiroDiaMesISO : dataInicioISO;
            const fimNoMes = dataFimISO > ultimoDiaMesISO ? ultimoDiaMesISO : dataFimISO;

            iterateDateRange(inicioNoMes, fimNoMes, (dataISO) => {
                if (!eventosPorData[dataISO]) {
                    return;
                }

                eventosPorData[dataISO].colaboradores.push({
                    nome: nomeColaborador,
                    tipo
                });
            });

            if (tipo === 'ferias') {
                ferias.push({
                    colaborador: nomeColaborador,
                    dataInicio: dataInicioISO,
                    dataFim: dataFimISO,
                    inicioNoMes,
                    fimNoMes,
                    periodoTexto: montarPeriodoRelatorio(dataInicioISO, dataFimISO),
                    periodoNoMesTexto: montarPeriodoRelatorio(inicioNoMes, fimNoMes)
                });
                return;
            }

            iterateDateRange(inicioNoMes, fimNoMes, (dataISO) => {
                const eventoInfo = {
                    colaborador: nomeColaborador,
                    data: dataISO,
                    dataFormatada: formatarDataRelatorio(dataISO),
                    tipo
                };

                if (tipo === 'folga') {
                    folgas.push(eventoInfo);
                } else if (tipo === 'ausencia') {
                    ausenciasLista.push(eventoInfo);
                }
            });
        });

        return {
            mesNome: MESES_PT_BR[mes],
            ano,
            primeiroDia,
            diasNoMes,
            eventosPorData,
            ferias: ordenarPorDataCampo(ferias, 'dataInicio'),
            folgas: ordenarPorDataCampo(folgas, 'data'),
            ausencias: ordenarPorDataCampo(ausenciasLista, 'data'),
            feriados: ordenarPorDataCampo(feriadosLista, 'data'),
            mes
        };
    }

    function renderResumoTabelaRelatorio(config) {
        const { titulo, items, headers, emptyLabel, rowRenderer, limit = 10 } = config;

        return `
            <div class="resumo-coluna">
                <h4>${titulo} (${items.length})</h4>
                <table class="resumo-tabela">
                    <thead>
                        <tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${items.length > 0 ? `
                            ${items.slice(0, limit).map(rowRenderer).join('')}
                            ${items.length > limit ? `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-light);">... e mais ${items.length - limit} registro(s)</td></tr>` : ''}
                        ` : `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-light);">${emptyLabel}</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;
    }

    function gerarHtmlVisualizacaoRelatorioMensal(dados) {
        const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes } = dados;
        const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;

        let html = `
            <div class="relatorio-calendario">
                <div class="calendario-titulo">
                    <h2>${ano}</h2>
                    <h3>${mesNome.toUpperCase()}</h3>
                </div>

                <table class="calendario-tabela">
                    <thead>
                        <tr>
                            ${diasSemana.map((dia) => `<th>${dia}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
        `;

        for (let i = 0; i < primeiroDia; i += 1) {
            html += '<td class="vazio"></td>';
        }

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga').map((item) => item.nome);
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias').map((item) => item.nome);
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia').map((item) => item.nome);

            html += `<td class="${isFeriado ? 'feriado' : ''}">`;
            html += `<div class="dia-numero">${dia}</div>`;

            if (isFeriado) {
                html += `<div class="dia-feriado" title="${escapeHtml(eventos.feriado)}">📅 ${escapeHtml(eventos.feriado)}</div>`;
            }

            if (folgasDia.length > 0) {
                html += '<div class="dia-folgas">';
                folgasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="folga-tag" title="${escapeHtml(nome)}">🌸 ${escapeHtml(nomeCurto)}</span>`;
                });
                if (folgasDia.length > 3) {
                    html += `<span class="mais-tag">+${folgasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            if (feriasDia.length > 0) {
                html += '<div class="dia-ferias">';
                feriasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="ferias-tag" title="${escapeHtml(nome)}">🏖️ ${escapeHtml(nomeCurto)}</span>`;
                });
                if (feriasDia.length > 3) {
                    html += `<span class="mais-tag">+${feriasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            if (ausenciasDia.length > 0) {
                html += '<div class="dia-ausencias">';
                ausenciasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="ausencia-tag" title="${escapeHtml(nome)}">⚠️ ${escapeHtml(nomeCurto)}</span>`;
                });
                if (ausenciasDia.length > 3) {
                    html += `<span class="mais-tag">+${ausenciasDia.length - 3}</span>`;
                }
                html += '</div>';
            }

            html += '</td>';

            if ((primeiroDia + dia) % 7 === 0) {
                html += '</tr><tr>';
            }
        }

        const totalCelulas = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
        const celulasRestantes = totalCelulas - (primeiroDia + diasNoMes);

        for (let i = 0; i < celulasRestantes; i += 1) {
            html += '<td class="vazio"></td>';
        }

        html += `
                        </tr>
                    </tbody>
                </table>

                <div class="calendario-resumo">
                    ${renderResumoTabelaRelatorio({
                        titulo: '📅 Feriados',
                        items: feriados,
                        headers: ['Feriado', 'Data', 'Tipo'],
                        emptyLabel: 'Nenhum feriado no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtml(item.nome)}</strong></td>
                                <td>${escapeHtml(item.dataFormatada)}</td>
                                <td>${escapeHtml(item.tipo || 'municipal')}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '🏖️ Ferias',
                        items: ferias,
                        headers: ['Colaborador', 'Periodo'],
                        emptyLabel: 'Nenhuma ferias no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtml(item.colaborador)}</strong></td>
                                <td>${escapeHtml(item.periodoTexto)}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '🌸 Folgas',
                        items: folgas,
                        headers: ['Colaborador', 'Data'],
                        emptyLabel: 'Nenhuma folga no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtml(item.colaborador)}</strong></td>
                                <td>${escapeHtml(item.dataFormatada)}</td>
                            </tr>
                        `
                    })}
                    ${renderResumoTabelaRelatorio({
                        titulo: '⚠️ Ausencias',
                        items: ausencias,
                        headers: ['Colaborador', 'Data'],
                        emptyLabel: 'Nenhuma ausencia no periodo',
                        rowRenderer: (item) => `
                            <tr>
                                <td><strong>${escapeHtml(item.colaborador)}</strong></td>
                                <td>${escapeHtml(item.dataFormatada)}</td>
                            </tr>
                        `
                    })}
                </div>

                    <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                    <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
            </div>
        `;

        return html;
    }

    function gerarHtmlPdfRelatorioMensalExpandido(dados) {
        const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes, ferias, folgas, ausencias, feriados } = dados;
        const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio ${mesNome} ${ano}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        background: white;
                        color: #0f172a;
                        width: 1480px;
                        padding: 18px;
                    }
                    .pdf-pagina {
                        width: 1444px;
                        min-height: 970px;
                        padding: 12px 14px 14px;
                        background: white;
                    }
                    .pdf-pagina + .pdf-pagina {
                        margin-top: 32px;
                    }
                    .cabecalho-principal {
                        text-align: center;
                        margin-bottom: 12px;
                    }
                    .cabecalho-principal h1 {
                        color: #1857cc;
                        font-size: 44px;
                        line-height: 1.1;
                        margin-bottom: 4px;
                    }
                    .cabecalho-principal p {
                        color: #475569;
                        font-size: 18px;
                    }
                    .cabecalho-secundario {
                        margin-bottom: 18px;
                    }
                    .cabecalho-secundario h2 {
                        color: #0f172a;
                        font-size: 28px;
                        margin-bottom: 14px;
                    }
                    .resumo-metricas {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 12px;
                    }
                    .metrica-card {
                        padding: 14px 16px;
                        border: 1px solid #dbe3ef;
                        border-radius: 12px;
                        background: #f8fafc;
                    }
                    .metrica-card strong {
                        display: block;
                        font-size: 28px;
                        line-height: 1;
                        margin-bottom: 6px;
                        color: #0f172a;
                    }
                    .metrica-card span {
                        display: block;
                        font-size: 12px;
                        color: #475569;
                    }
                    .calendario-pdf {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                        border: 1px solid #cbd5e1;
                    }
                    .calendario-pdf th {
                        background: #1857cc;
                        color: white;
                        padding: 13px 8px;
                        font-weight: 700;
                        font-size: 16px;
                        border: 1px solid #cbd5e1;
                        text-align: center;
                        width: 14.28%;
                    }
                    .calendario-pdf td {
                        border: 1px solid #cbd5e1;
                        vertical-align: top;
                        height: 148px;
                        padding: 10px;
                        background: white;
                        overflow: hidden;
                    }
                    .calendario-pdf td.vazio {
                        background: #f8fafc;
                    }
                    .calendario-pdf td.domingo {
                        background: #fef3c7;
                    }
                    .calendario-pdf td.feriado {
                        background: #fee2e2;
                    }
                    .dia-numero {
                        font-weight: 700;
                        font-size: 25px;
                        line-height: 1;
                        margin-bottom: 7px;
                        color: #0f172a;
                    }
                    .dia-feriado {
                        font-size: 12px;
                        color: #b91c1c;
                        font-weight: 700;
                        margin-bottom: 8px;
                        line-height: 1.3;
                        background: rgba(255, 255, 255, 0.78);
                        padding: 4px 6px;
                        border-radius: 6px;
                        white-space: normal;
                        overflow: hidden;
                    }
                    .dia-eventos {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                    .evento-tag {
                        font-size: 12px;
                        line-height: 1.25;
                        padding: 6px 7px;
                        border-radius: 6px;
                        white-space: normal;
                        overflow: hidden;
                        font-weight: 700;
                    }
                    .folga-tag {
                        background: #d1fae5;
                        color: #047857;
                        border-left: 3px solid #10b981;
                    }
                    .ferias-tag {
                        background: #dceaff;
                        color: #4338ca;
                        border-left: 3px solid #1d63ed;
                    }
                    .ausencia-tag {
                        background: #fee2e2;
                        color: #b91c1c;
                        border-left: 3px solid #ef4444;
                    }
                    .mais-eventos {
                        font-size: 12px;
                        line-height: 1.2;
                        color: #475569;
                        font-weight: 700;
                        margin-top: 2px;
                    }
                    .legendas-pdf {
                        display: flex;
                        gap: 14px;
                        margin-top: 14px;
                        padding: 12px 14px;
                        background: #f8fafc;
                        border-radius: 10px;
                        flex-wrap: wrap;
                        border: 1px solid #e2e8f0;
                        font-size: 12px;
                    }
                    .legenda-item {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .legenda-cor {
                        width: 14px;
                        height: 14px;
                        border-radius: 4px;
                    }
                    .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                    .legenda-ferias { background: #dceaff; border: 1px solid #1857cc; }
                    .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-domingo { background: #fef3c7; border: 1px solid #d97706; }
                    .nota-pdf {
                        margin-top: 10px;
                        color: #475569;
                        font-size: 11px;
                    }
                    .listas-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 14px;
                    }
                    .lista-card {
                        background: #f8fafc;
                        border-radius: 12px;
                        padding: 12px;
                        border: 1px solid #e2e8f0;
                    }
                    .lista-card h3 {
                        font-size: 15px;
                        font-weight: 700;
                        color: #0f172a;
                        margin-bottom: 10px;
                        padding-bottom: 6px;
                        border-bottom: 1px solid #dbe3ef;
                    }
                    .lista-card table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                    }
                    .lista-card th {
                        text-align: left;
                        padding: 6px;
                        background: #e2e8f0;
                        color: #334155;
                        font-weight: 700;
                        font-size: 10px;
                    }
                    .lista-card td {
                        padding: 5px 6px;
                        border-bottom: 1px solid #e2e8f0;
                        vertical-align: top;
                    }
                    .lista-card tr:last-child td {
                        border-bottom: none;
                    }
                    .empty-message {
                        text-align: center;
                        color: #64748b;
                        font-size: 11px;
                        padding: 16px 8px;
                        font-style: italic;
                    }
                    .resumo-rodape {
                        margin-top: 18px;
                        padding: 14px;
                        background: linear-gradient(135deg, #1857cc 0%, #3730a3 100%);
                        border-radius: 12px;
                        text-align: center;
                        color: white;
                    }
                    .resumo-rodape strong {
                        font-size: 18px;
                    }
                    .resumo-rodape small {
                        display: block;
                        margin-top: 4px;
                        font-size: 12px;
                        opacity: 0.92;
                    }
                </style>
            </head>
            <body>
                <section class="pdf-pagina calendario-pagina">
                    <div class="cabecalho-principal">
                        <h1>Relatorio de ${mesNome} ${ano}</h1>
                        <p>Calendario mensal ampliado para facilitar a leitura dos lancamentos</p>
                    </div>
                    <table class="calendario-pdf">
                        <thead>
                            <tr>
                                ${diasSemana.map((dia) => `<th>${dia}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        let linhaAtual = '<tr>';

        for (let i = 0; i < primeiroDia; i += 1) {
            linhaAtual += '<td class="vazio"></td>';
        }

        for (let dia = 1; dia <= diasNoMes; dia += 1) {
            const dataAtual = new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
            const isDomingo = dataAtual.getUTCDay() === 0;
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga');
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias');
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia');
            const folgasVisiveis = folgasDia.slice(0, 3);
            const feriasVisiveis = feriasDia.slice(0, 3);
            const ausenciasVisiveis = ausenciasDia.slice(0, 3);
            const itensExibidos = folgasVisiveis.length + feriasVisiveis.length + ausenciasVisiveis.length;
            const classesCelula = [];

            if (isDomingo) {
                classesCelula.push('domingo');
            }

            if (isFeriado) {
                classesCelula.push('feriado');
            }

            linhaAtual += `<td class="${classesCelula.join(' ')}">`;
            linhaAtual += `<div class="dia-numero">${dia}</div>`;

            if (isFeriado) {
                const nomeFeriado = eventos.feriado.length > 26 ? `${eventos.feriado.substring(0, 23)}...` : eventos.feriado;
                linhaAtual += `<div class="dia-feriado" title="${escapeHtml(eventos.feriado)}">${escapeHtml(nomeFeriado)}</div>`;
            }

            linhaAtual += '<div class="dia-eventos">';

            folgasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag folga-tag" title="${escapeHtml(item.nome)}">Folga: ${escapeHtml(nome)}</div>`;
            });

            feriasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ferias-tag" title="${escapeHtml(item.nome)}">Ferias: ${escapeHtml(nome)}</div>`;
            });

            ausenciasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ausencia-tag" title="${escapeHtml(item.nome)}">Ausencia: ${escapeHtml(nome)}</div>`;
            });

            if (colaboradoresDia.length > itensExibidos) {
                linhaAtual += `<div class="mais-eventos">+${colaboradoresDia.length - itensExibidos} registro(s)</div>`;
            }

            linhaAtual += '</div>';
            linhaAtual += '</td>';

            if ((primeiroDia + dia) % 7 === 0) {
                linhaAtual += '</tr>';
                html += linhaAtual;
                if (dia < diasNoMes) {
                    linhaAtual = '<tr>';
                }
            }
        }

        if (linhaAtual !== '<tr>' && !linhaAtual.endsWith('</tr>')) {
            const celulasUsadas = (primeiroDia + diasNoMes) % 7;

            if (celulasUsadas > 0) {
                for (let i = celulasUsadas; i < 7; i += 1) {
                    linhaAtual += '<td class="vazio"></td>';
                }
            }

            linhaAtual += '</tr>';
            html += linhaAtual;
        }

        html += `
                        </tbody>
                    </table>

                </section>

                <section class="pdf-pagina resumo-pagina">
                    <div class="cabecalho-secundario">
                        <h2>Resumo do mes</h2>
                        <div class="resumo-metricas">
                            <div class="metrica-card"><strong>${feriados.length}</strong><span>Feriados</span></div>
                            <div class="metrica-card"><strong>${ferias.length}</strong><span>Ferias</span></div>
                            <div class="metrica-card"><strong>${folgas.length}</strong><span>Folgas</span></div>
                            <div class="metrica-card"><strong>${ausencias.length}</strong><span>Ausencias</span></div>
                        </div>
                    </div>

                    <div class="listas-grid">
                        <div class="lista-card">
                            <h3>Feriados</h3>
                            ${feriados.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 56%">Feriado</th><th style="width: 22%">Data</th><th style="width: 22%">Tipo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${feriados.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtml(item.nome)}</td>
                                                <td>${escapeHtml(item.dataFormatada)}</td>
                                                <td>${escapeHtml(item.tipo || 'municipal')}</td>
                                            </tr>
                                        `).join('')}
                                        ${feriados.length > 10 ? `<tr><td colspan="3" style="text-align: center; color: #64748b;">... e mais ${feriados.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhum feriado no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Ferias</h3>
                            ${ferias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 42%">Colaborador</th><th style="width: 58%">Periodo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ferias.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtml(item.colaborador)}</td>
                                                <td>${escapeHtml(item.periodoTexto)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ferias.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ferias.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ferias no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Folgas</h3>
                            ${folgas.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${folgas.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtml(item.colaborador)}</td>
                                                <td>${escapeHtml(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${folgas.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${folgas.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma folga no periodo</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>Ausencias</h3>
                            ${ausencias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ausencias.slice(0, 10).map((item) => `
                                            <tr>
                                                <td>${escapeHtml(item.colaborador)}</td>
                                                <td>${escapeHtml(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ausencias.length > 10 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ausencias.length - 10}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ausencia no periodo</div>'}
                        </div>
                    </div>

                    <div class="resumo-rodape">
                        <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                        <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
                    </div>
                </section>
            </body>
            </html>
        `;

        return html;
    }

    window.gerarRelatorioCalendarioCompleto = gerarRelatorioCalendarioCompleto = async function gerarRelatorioCalendarioCompletoConsolidado(mes, ano) {
        const dados = await construirDadosRelatorioMensal(mes, ano);
        mostrarRelatorioCalendarioCompleto(
            dados.mesNome,
            dados.ano,
            dados.primeiroDia,
            dados.diasNoMes,
            dados.eventosPorData,
            dados.ferias,
            dados.folgas,
            dados.ausencias,
            dados.feriados,
            dados.mes
        );
    };

    window.mostrarRelatorioCalendarioCompleto = mostrarRelatorioCalendarioCompleto = function mostrarRelatorioCalendarioCompletoConsolidado(mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes) {
        const dados = {
            mesNome,
            ano,
            primeiroDia,
            diasNoMes,
            eventosPorData,
            ferias,
            folgas,
            ausencias,
            feriados,
            mes
        };

        document.getElementById('relatorioTitulo').innerText = `Relatorio de ${mesNome} ${ano}`;
        document.getElementById('relatorioConteudo').innerHTML = gerarHtmlVisualizacaoRelatorioMensal(dados);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    };

    window.gerarDadosRelatorioCompleto = gerarDadosRelatorioCompleto = async function gerarDadosRelatorioCompletoConsolidado(mes, ano) {
        return construirDadosRelatorioMensal(mes, ano);
    };

    window.gerarHTMLCompletoPDF = gerarHTMLCompletoPDF = function gerarHTMLCompletoPDFConsolidado(dados) {
        return gerarHtmlPdfRelatorioMensalExpandido(dados);
    };

    window.formatarDataBR = formatarDataBR = function formatarDataBRSeguro(dataISO) {
        return formatarDataRelatorio(obterDataIsoRelatorio(dataISO));
    };

    window.gerarRelatorioCompleto = gerarRelatorioCompleto = async function gerarRelatorioCompletoSeguro() {
        const mes = parseInt(document.getElementById('relatorioMesCompleto').value, 10);
        const ano = parseInt(document.getElementById('relatorioAnoCompleto').value, 10);

        await Promise.all([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarFeriadosLocais === 'function' ? carregarFeriadosLocais() : Promise.resolve([]),
            typeof carregarFeriadosAPI === 'function' ? carregarFeriadosAPI(ano) : Promise.resolve([])
        ]);

        await gerarRelatorioCalendarioCompleto(mes, ano);
    };

    window.gerarRelatorioCalendarioParaExportar = gerarRelatorioCalendarioParaExportar = async function gerarRelatorioCalendarioParaExportarSeguro(mes, ano) {
        return construirDadosRelatorioMensal(mes, ano);
    };

    window.renderizarRelatorioParaExportar = renderizarRelatorioParaExportar = function renderizarRelatorioParaExportarSeguro(dados) {
        return gerarHtmlVisualizacaoRelatorioMensal(dados);
    };

    window.exportarComoPDF = exportarComoPDF = async function exportarComoPDFMaisLegivel(mes, ano) {
        document.querySelector('.exportar-modal-overlay')?.remove();
        let releaseViewportLock = null;

        if (typeof mostrarToast === 'function') {
            mostrarToast('Gerando PDF com layout ampliado...', 'warning');
        }

        let container = null;

        try {
            releaseViewportLock = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;

            if (typeof html2canvas !== 'function' || !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
                throw new Error('Bibliotecas de exportacao nao estao disponiveis.');
            }

            await Promise.all([
                typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
                typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
                typeof carregarFeriadosLocais === 'function' ? carregarFeriadosLocais() : Promise.resolve([])
            ]);

            const dados = await gerarDadosRelatorioCompleto(mes, ano);
            const htmlPDF = gerarHTMLCompletoPDF(dados);

            container = window.criarContainerTemporarioRelatorioPdf(htmlPDF, { width: 1500 });
            await window.aguardarLayoutRelatorioPdf();

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: 1800,
                minHeight: 1200,
                scale: 1.6,
                maxCanvasSide: 12000,
                maxCanvasPixels: 22000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: 6,
                minScaleMmPerPixel: 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: 2,
                maxSourcePageHeight: 1300
            });

            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `Relatorio_${dados.mesNome}_${dados.ano}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao gerar PDF ampliado:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar PDF: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };

    window.coletarDadosParaCSV = coletarDadosParaCSV = function coletarDadosParaCSVSeguro(mes, ano) {
        const dados = {
            mesNome: MESES_PT_BR[mes],
            ano,
            eventos: []
        };

        const mapaEventos = criarMapaEventosPorData(mes, ano);
        const feriadosPorData = new Map();

        (Array.isArray(window.feriadosAPI) ? window.feriadosAPI : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.date);
            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                feriadosPorData.set(dataISO, item.name);
            }
        });

        (Array.isArray(window.feriadosLocais) ? window.feriadosLocais : []).forEach((item) => {
            const dataISO = obterDataIsoRelatorio(item.Data || item.data);
            if (dataISO && dataISO.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}-`)) {
                feriadosPorData.set(dataISO, item.Nome || item.nome || 'Feriado');
            }
        });

        Object.keys(mapaEventos).forEach((dataISO) => {
            const dataUtc = criarDataUtcSegura(dataISO);
            const diaSemana = dataUtc.toLocaleDateString('pt-BR', {
                weekday: 'long',
                timeZone: 'UTC'
            });
            const feriado = feriadosPorData.get(dataISO) || '';
            const ausenciasDoDia = (Array.isArray(window.ausencias) ? window.ausencias : []).filter((item) => {
                const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
                const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);
                return dataInicioISO && dataFimISO && dataISO >= dataInicioISO && dataISO <= dataFimISO;
            });

            if (ausenciasDoDia.length === 0 && !feriado) {
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado: '',
                    tipo: 'normal',
                    colaborador: ''
                });
                return;
            }

            if (feriado) {
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado,
                    tipo: 'feriado',
                    colaborador: ''
                });
            }

            ausenciasDoDia.forEach((item) => {
                const colaborador = (window.colaboradores || []).find((entry) => Number(entry.Id) === Number(item.ColaboradorId || item.colaboradorId));
                dados.eventos.push({
                    data: formatarDataRelatorio(dataISO),
                    diaSemana,
                    feriado,
                    tipo: String(item.Tipo || item.tipo || '').toLowerCase(),
                    colaborador: colaborador?.Nome || 'Desconhecido'
                });
            });
        });

        return dados;
    };

    window.coletarDadosParaJSON = coletarDadosParaJSON = function coletarDadosParaJSONSeguro(mes, ano) {
        const inicioMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
        const fimMesISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(new Date(ano, mes + 1, 0).getDate()).padStart(2, '0')}`;

        return {
            mes: mes + 1,
            ano,
            colaboradores: window.colaboradores || [],
            ausencias: (window.ausencias || []).filter((item) => {
                const dataInicioISO = obterDataIsoRelatorio(item.DataInicio || item.dataInicio);
                const dataFimISO = obterDataIsoRelatorio(item.DataFim || item.dataFim);
                return dataInicioISO && dataFimISO && !(dataFimISO < inicioMesISO || dataInicioISO > fimMesISO);
            })
        };
    };
})();


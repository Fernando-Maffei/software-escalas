    async function buildEscalaExportSnapshot() {
        const modo = getEscalaReportMode();

        if (modo === RELATORIO_ESCALA_MODOS.QUADRO_MENSAL) {
            const filters = getEscalaMonthlyFilters();

            if (!filters) {
                throw new Error('Informe um mes e ano validos para o quadro mensal.');
            }

            const payload = await window.API.getEscalaRelatorio({
                dataInicio: filters.dataInicio,
                dataFim: filters.dataFim,
                setorId: filters.setorId || undefined
            });
            const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
            const boardUtils = window.EscalaReportUtils;

            if (!boardUtils || typeof boardUtils.buildEscalaQuadroMensal !== 'function') {
                throw new Error('Os utilitarios do quadro mensal nao foram carregados.');
            }

            const feriados = await collectEscalaHolidayItems(filters.dataInicio, filters.dataFim);

            const setorGroups = groupEscalaItemsBySetor(items, { includeEmpty: true }).map((group) => {
                const days = boardUtils.buildEscalaQuadroMensal(group.items, {
                    month: filters.month,
                    year: filters.year
                });

                return {
                    ...group,
                    days,
                    calendarWeeks: getEscalaCalendarWeeks(boardUtils, days)
                };
            });
            const days = setorGroups[0]?.days || boardUtils.buildEscalaQuadroMensal([], {
                month: filters.month,
                year: filters.year
            });
            const calendarWeeks = setorGroups[0]?.calendarWeeks || getEscalaCalendarWeeks(boardUtils, days);

            return {
                mode: modo,
                title: `Quadro mensal de Escala - ${MESES_LABELS[filters.month - 1] || filters.month} ${filters.year}${filters.setorId ? ` - Setor: ${filters.setorNome}` : ''}`,
                fileBase: `Escala_Mensal_${filters.year}-${String(filters.month).padStart(2, '0')}${getRelatorioEscalaSetorFileSuffix(filters.setorId)}`,
                filters,
                items,
                feriados,
                stats: buildEscalaExportStats(items, feriados),
                setorGroups,
                days,
                calendarWeeks,
                calendarSlots: calendarWeeks.flat()
            };
        }

        const dataInicio = document.getElementById('relatorioEscalaDataInicio')?.value;
        const dataFim = document.getElementById('relatorioEscalaDataFim')?.value;
        const setorId = getRelatorioEscalaSetorId();
        const colaboradorId = document.getElementById('relatorioEscalaColaborador')?.value || '';
        const tipo = document.getElementById('relatorioEscalaTipo')?.value || '';

        if (!dataInicio || !dataFim) {
            throw new Error('Informe a data inicial e final do relatorio.');
        }

        const payload = await window.API.getEscalaRelatorio({
            dataInicio,
            dataFim,
            setorId: setorId || undefined,
            colaboradorId: colaboradorId || undefined,
            tipo: tipo || undefined
        });
        const items = normalizeEscalaReportItems(Array.isArray(payload?.items) ? payload.items : []);
        const feriados = await collectEscalaHolidayItems(dataInicio, dataFim);
        const setorGroups = groupEscalaItemsBySetor(items);

        return {
            mode: modo,
            title: `Relatorio de Escala - ${formatDatePtBrEscala(dataInicio)} ate ${formatDatePtBrEscala(dataFim)}${setorId ? ` - Setor: ${getRelatorioEscalaSetorNome(setorId)}` : ''}`,
            fileBase: `Escala_Detalhada_${dataInicio}_${dataFim}${getRelatorioEscalaSetorFileSuffix(setorId)}`,
            filters: {
                dataInicio,
                dataFim,
                setorId,
                setorNome: getRelatorioEscalaSetorNome(setorId)
            },
            items,
            setorGroups,
            feriados,
            stats: buildEscalaExportStats(items, feriados)
        };
    }

    function dividirSemanasEmBlocos(weeks, quantidadeDePaginas) {
        const porPagina = Math.ceil(weeks.length / quantidadeDePaginas);
        const blocos = [];

        for (let inicio = 0; inicio < weeks.length; inicio += porPagina) {
            blocos.push(weeks.slice(inicio, inicio + porPagina));
        }

        return blocos;
    }

    // Retorna a primeira divisao (1 folha, depois 2, depois 3...) em que todo
    // bloco cabe na altura da pagina, ou null se nem uma semana isolada couber.
    // Importante caber: .escala-export-month-page tem altura fixa e
    // overflow: hidden, entao o que passa nao "vaza" — some do PDF.
    // Um mes inteiro numa folha so cabe espremendo tudo na menor fonte (8px).
    // Com no maximo tres semanas por folha o mes normal sai em duas, e sobra
    // altura para a folha subir de fonte no ajuste que roda depois.
    const MAX_SEMANAS_POR_FOLHA = 3;

    function escolherBlocosDeSemanasPlantao(weeks) {
        const minimoDePaginas = Math.max(1, Math.ceil(weeks.length / MAX_SEMANAS_POR_FOLHA));

        for (let paginas = minimoDePaginas; paginas <= weeks.length; paginas += 1) {
            const blocos = dividirSemanasEmBlocos(weeks, paginas);
            const cabe = blocos.every((bloco) => (
                getEscalaExportEntryMaxRows(bloco) <= getMonthlyEscalaOnePageMaxRows(bloco.length)
            ));

            if (cabe) {
                return blocos;
            }
        }

        return null;
    }

    // Sobra vertical de uma folha ja renderizada: distancia entre a base da
    // celula de dia mais baixa e o fim da area util da pagina. Negativo = o
    // conteudo passou do fim e sera CORTADO (a pagina tem overflow: hidden).
    function medirSobraDaFolhaEscala(pagina) {
        const celulas = [...pagina.querySelectorAll('.escala-sheet-day:not(.is-placeholder)')];

        if (celulas.length === 0) {
            return 0;
        }

        const retangulo = pagina.getBoundingClientRect();
        const recuoInferior = parseFloat(getComputedStyle(pagina).paddingBottom) || 0;
        const limite = retangulo.bottom - recuoInferior;
        const maisBaixa = Math.max(...celulas.map((celula) => celula.getBoundingClientRect().bottom));

        return limite - maisBaixa;
    }

    // As faixas fixas de densidade (>= 9 linhas vira densa, >= 13 vira
    // ultra-densa) erravam por uma linha em varios pontos: com 12 pessoas num
    // mes de 5 semanas, ou 8 num de 6, a folha estourava e o PDF saia com
    // linhas faltando, sem nenhum aviso. Em vez de calibrar faixa por faixa —
    // que muda com o tamanho dos nomes e com a coluna de almoco — a folha ja
    // montada e medida aqui e vai ficando mais compacta ate caber.

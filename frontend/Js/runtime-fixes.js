(function initRuntimeNormalizationHelpers(root) {
    if (root.__runtimeNormalizationHelpersLoaded) {
        return;
    }

    root.__runtimeNormalizationHelpersLoaded = true;

    root.normalizeRuntimeToken = function normalizeRuntimeToken(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s-]+/g, '_')
            .replace(/_+/g, '_');
    };

    root.normalizeRuntimeAusenciaTipo = function normalizeRuntimeAusenciaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        return 'ausencia';
    };

    root.normalizeRuntimePeriodoTipo = function normalizeRuntimePeriodoTipo(value) {
        const token = root.normalizeRuntimeToken(value);
        return token === 'horas' ? 'horas' : 'dia_inteiro';
    };

    root.normalizeRuntimeEscalaTipo = function normalizeRuntimeEscalaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        if (token.startsWith('plantao')) {
            return 'plantao';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        if (token.startsWith('ajuste')) {
            return 'ajuste';
        }

        return 'normal';
    };
}(window));

(function () {
    if (window.__runtimeFixesLoaded) {
        return;
    }

    window.__runtimeFixesLoaded = true;

    const inflight = new Map();

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function limparExclusaoPendente() {
        window.exclusaoPendenteId = null;
        window.exclusaoTipo = 'ausencia';

        try {
            exclusaoPendenteId = null;
            exclusaoTipo = 'ausencia';
        } catch (error) {
            // ignore
        }
    }

    function obterDataISO(valor) {
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

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function mapAusencia(item) {
        const tipo = window.normalizeRuntimeAusenciaTipo(item.Tipo || item.tipo);
        const periodoTipo = window.normalizeRuntimePeriodoTipo(item.PeriodoTipo || item.periodoTipo || 'dia_inteiro');

        return {
            Id: item.Id,
            ColaboradorId: item.ColaboradorId,
            Tipo: tipo,
            DataInicio: item.DataInicio,
            DataFim: item.DataFim,
            DataCadastro: item.DataCadastro,
            PeriodoTipo: periodoTipo,
            HoraInicio: item.HoraInicio,
            HoraFim: item.HoraFim,
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo,
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim,
            observacao: item.Observacao || item.observacao || null,
            Observacao: item.Observacao || item.observacao || null
        };
    }

    function mapPlantao(item) {
        const dataISO = obterDataISO(item.dataISO || item.data_plantao);

        return {
            ...item,
            dataISO,
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
            horaInicio: item.horaInicio || item.hora_inicio || null,
            horaFim: item.horaFim || item.hora_fim || null,
            observacao: item.observacao || null
        };
    }

    if (typeof carregarColaboradores === 'function') {
        const originalCarregarColaboradores = carregarColaboradores;

        window.carregarColaboradores = carregarColaboradores = function carregarColaboradoresComCache() {
            return withInFlight('colaboradores', async () => {
                const data = await originalCarregarColaboradores();
                const lista = Array.isArray(data) ? data : [];

                try {
                    colaboradores = lista;
                } catch (error) {
                    // ignore
                }

                window.colaboradores = lista;
                return lista;
            });
        };
    }

    window.carregarSetores = carregarSetores = function carregarSetoresComCache() {
        return withInFlight('setores', async () => {
            let lista = [];

            try {
                const data = await window.API.getSetores();
                lista = Array.isArray(data) ? data : [];
            } catch (error) {
                lista = [];
            }

            try {
                setores = lista;
            } catch (error) {
                // ignore
            }

            window.setores = lista;
            return lista;
        });
    };

    window.carregarAusencias = carregarAusencias = function carregarAusenciasComCache() {
        return withInFlight('ausencias', async () => {
            let lista = [];

            try {
                const data = await window.API.getAusencias();
                lista = Array.isArray(data) ? data.map(mapAusencia) : [];
            } catch (error) {
                lista = [];
            }

            try {
                ausencias = lista;
            } catch (error) {
                // ignore
            }

            window.ausencias = lista;
            return lista;
        });
    };

    window.carregarFeriadosLocais = carregarFeriadosLocais = function carregarFeriadosLocaisComCache() {
        return withInFlight('feriadosLocais', async () => {
            let lista = [];

            try {
                const data = await window.API.getFeriados();
                lista = Array.isArray(data) ? data : [];
                localStorage.setItem('feriadosLocais', JSON.stringify(lista));
            } catch (error) {
                try {
                    lista = JSON.parse(localStorage.getItem('feriadosLocais') || '[]');
                } catch (storageError) {
                    lista = [];
                }
            }

            try {
                feriadosLocais = lista;
            } catch (error) {
                // ignore
            }

            window.feriadosLocais = lista;
            return lista;
        });
    };

    window.carregarPlantoes = carregarPlantoes = function carregarPlantoesComCache() {
        return withInFlight('plantoes', async () => {
            let lista = [];

            try {
                const data = await window.API.getPlantoes();
                lista = Array.isArray(data) ? data.map(mapPlantao) : [];
            } catch (error) {
                lista = [];
            }

            try {
                plantoesLancados = lista;
            } catch (error) {
                // ignore
            }

            window.plantoesLancados = lista;
            return lista;
        });
    };

    window.confirmarExclusao = confirmarExclusao = async function confirmarExclusaoPadronizada() {
        const id = window.exclusaoPendenteId;
        const tipo = window.exclusaoTipo || 'ausencia';

        if (!id) {
            fecharModalSeguro('modalConfirmacao');
            return;
        }

        try {
            if (tipo === 'feriado') {
                await window.API.excluirFeriado(id);
            } else {
                await window.API.excluirAusencia(id);
            }

            if (typeof cancelarEdicaoLancamento === 'function') {
                cancelarEdicaoLancamento();
            }

            await atualizarTudo({ silent: true });

            if (typeof mostrarToast === 'function') {
                mostrarToast('Excluído com sucesso!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao excluir: ${error.message}`, 'error');
            }
        } finally {
            limparExclusaoPendente();
            fecharModalSeguro('modalConfirmacao');
        }
    };

    window.configurarModais = configurarModais = function configurarModaisUmaVez() {
        if (window.__modaisConfigurados) {
            return;
        }

        window.__modaisConfigurados = true;

        document.addEventListener('click', (event) => {
            const target = event.target;

            if (target.closest('#btnLancamentoAjuste')) {
                event.preventDefault();
                if (typeof window.abrirModalLancamento === 'function') {
                    window.abrirModalLancamento('pessoal', null, false);
                }
                return;
            }

            if (target.closest('#fecharModalLancamentoBtn')) {
                fecharModalSeguro('modalLancamento');
                return;
            }

            if (target.closest('#fecharModalConfirmacaoBtn') || target.closest('#cancelarExclusaoBtn')) {
                limparExclusaoPendente();
                fecharModalSeguro('modalConfirmacao');
                return;
            }

            if (target.closest('#confirmarExclusaoBtn')) {
                event.preventDefault();
                confirmarExclusao();
                return;
            }

            if (target.closest('#fecharModalHorarioBtn') || target.closest('#fecharModalHorarioBtn2')) {
                fecharModalSeguro('modalHorario');
            }
        });

        window.addEventListener('click', (event) => {
            if (!event.target.classList?.contains('modal')) {
                return;
            }

            if (event.target.id === 'modalConfirmacao') {
                limparExclusaoPendente();
            }

            event.target.classList.add('hidden');
            event.target.classList.remove('active');
        });
    };

    window.configurarObservers = configurarObservers = function configurarObserversEstavel() {
        if (window.__observersConfigurados) {
            return;
        }

        window.__observersConfigurados = true;
    };

    window.atualizarTudo = atualizarTudo = async function atualizarTudoPadronizado(options = {}) {
        const { silent = false } = options;

        try {
            await Promise.allSettled([
                carregarColaboradores(),
                typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
                carregarAusencias(),
                carregarFeriadosLocais(),
                typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
            ]);

            const modalLancamento = document.getElementById('modalLancamento');
            if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
                if (window.modalDataSelecionada && typeof carregarListagensComFiltro === 'function') {
                    await carregarListagensComFiltro(window.modalDataSelecionada, window.modalFiltroData !== false);
                } else if (typeof carregarListagens === 'function') {
                    await carregarListagens();
                }
            }

            if (typeof window.__refreshVisibleViews === 'function') {
                await window.__refreshVisibleViews(options);
            }

            if (!silent && typeof mostrarToast === 'function') {
                mostrarToast('Dados atualizados!', 'success');
            }
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao atualizar dados: ${error.message}`, 'error');
            }
        }
    };
})();


(function () {
    if (window.__relatorioMensalFixLoaded) {
        return;
    }

    window.__relatorioMensalFixLoaded = true;

    const MESES_PT_BR = [
        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    function escapeHtmlRelatorio(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

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

        try {
            if ((!window.feriadosAPI || !Array.isArray(window.feriadosAPI) || window.feriadosAPI.length === 0) && typeof carregarFeriadosAPI === 'function') {
                await carregarFeriadosAPI(ano);
            }
        } catch (error) {
            // ignore
        }

        // Mesmo cuidado que ja existia para feriados, agora para colaboradores
        // e ausencias: o relatorio le das listas globais e descarta em silencio
        // toda ausencia cujo colaborador nao esteja nelas. Se o carregamento
        // inicial tiver falhado (por exemplo sessao expirada), o relatorio saia
        // completo na aparencia, porem sem nenhum colaborador.
        try {
            if (!Array.isArray(window.colaboradores) || window.colaboradores.length === 0) {
                if (typeof carregarColaboradores === 'function') {
                    await carregarColaboradores();
                }
            }
        } catch (error) {
            // Segue adiante: a checagem abaixo avisa se ainda faltar dado.
        }

        try {
            if (!Array.isArray(window.ausencias) || window.ausencias.length === 0) {
                if (typeof carregarAusencias === 'function') {
                    await carregarAusencias();
                }
            }
        } catch (error) {
            // idem
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
                html += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">📅 ${escapeHtmlRelatorio(eventos.feriado)}</div>`;
            }

            if (folgasDia.length > 0) {
                html += '<div class="dia-folgas">';
                folgasDia.slice(0, 3).forEach((nome) => {
                    const nomeCurto = nome.length > 18 ? `${nome.substring(0, 15)}...` : nome;
                    html += `<span class="folga-tag" title="${escapeHtmlRelatorio(nome)}">🌸 ${escapeHtmlRelatorio(nomeCurto)}</span>`;
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
                    html += `<span class="ferias-tag" title="${escapeHtmlRelatorio(nome)}">🏖️ ${escapeHtmlRelatorio(nomeCurto)}</span>`;
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
                    html += `<span class="ausencia-tag" title="${escapeHtmlRelatorio(nome)}">⚠️ ${escapeHtmlRelatorio(nomeCurto)}</span>`;
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
                                <td><strong>${escapeHtmlRelatorio(item.nome)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
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
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
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
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
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
                                <td><strong>${escapeHtmlRelatorio(item.colaborador)}</strong></td>
                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
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

    function gerarHtmlPdfRelatorioMensal(dados) {
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
                    body { font-family: 'Inter', Arial, sans-serif; margin: 15px; background: white; color: #1e293b; width: 1200px; }
                    h1 { color: #0f766e; text-align: center; font-size: 28px; margin-bottom: 5px; }
                    h2 { color: #1e293b; text-align: center; font-size: 20px; text-transform: uppercase; margin-bottom: 15px; }
                    .calendario-pdf { width: 100%; border-collapse: collapse; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); table-layout: fixed; }
                    .calendario-pdf th { background: #0f766e; color: white; padding: 8px; font-weight: 600; font-size: 12px; border: 1px solid #cbd5e1; text-align: center; width: 14.28%; }
                    .calendario-pdf td { border: 1px solid #cbd5e1; vertical-align: top; height: 70px; padding: 4px; font-size: 10px; background: white; overflow: hidden; }
                    .calendario-pdf td.vazio { background: #f8fafc; }
                    .calendario-pdf td.domingo { background-color: #fef9c3 !important; }
                    .calendario-pdf td.feriado { background: #fee2e2; }
                    .dia-numero { font-weight: bold; font-size: 14px; margin-bottom: 2px; color: #1e293b; }
                    .dia-feriado { font-size: 8px; color: #dc2626; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fee2e2; padding: 1px 3px; border-radius: 3px; }
                    .evento-tag { font-size: 7px; padding: 1px 3px; border-radius: 3px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
                    .folga-tag { background: #d1fae5; color: #059669; border-left: 2px solid #10b981; }
                    .ferias-tag { background: #d7f2ee; color: #0b5d56; border-left: 2px solid #0f766e; }
                    .ausencia-tag { background: #fee2e2; color: #dc2626; border-left: 2px solid #ef4444; }
                    .legendas-pdf { display: flex; gap: 15px; margin: 10px 0; padding: 8px 12px; background: #f8fafc; border-radius: 6px; flex-wrap: wrap; border: 1px solid #e2e8f0; font-size: 10px; }
                    .legenda-item { display: flex; align-items: center; gap: 5px; }
                    .legenda-cor { width: 12px; height: 12px; border-radius: 3px; }
                    .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                    .legenda-ferias { background: #d7f2ee; border: 1px solid #0b5d56; }
                    .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                    .legenda-domingo { background: #fef9c3; border: 1px solid #b45309; }
                    .listas-container { margin-top: 15px; }
                    .listas-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                    .lista-card { background: #f8fafc; border-radius: 6px; padding: 10px; border: 1px solid #e2e8f0; }
                    .lista-card h3 { font-size: 13px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 5px; }
                    .lista-card table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    .lista-card th { text-align: left; padding: 3px; background: #e2e8f0; color: #475569; font-weight: 600; font-size: 8px; }
                    .lista-card td { padding: 2px 3px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    .lista-card tr:last-child td { border-bottom: none; }
                    .empty-message { text-align: center; color: #64748b; font-size: 9px; padding: 10px; font-style: italic; }
                    .resumo-rodape { margin-top: 15px; padding: 10px; background: linear-gradient(135deg, #0f766e 0%, #0b5d56 100%); border-radius: 6px; text-align: center; color: white; }
                    .resumo-rodape strong { font-size: 14px; }
                    .resumo-rodape small { display: block; margin-top: 3px; font-size: 10px; opacity: 0.9; }
                </style>
            </head>
            <body>
                <h1>${ano}</h1>
                <h2>${mesNome.toUpperCase()}</h2>
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
            const dataAtual = new Date(ano, mes, dia);
            const isDomingo = dataAtual.getDay() === 0;
            const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const eventos = eventosPorData[dataISO];
            const isFeriado = eventos?.feriado;
            const colaboradoresDia = eventos?.colaboradores || [];
            const folgasDia = colaboradoresDia.filter((item) => item.tipo === 'folga').slice(0, 2);
            const feriasDia = colaboradoresDia.filter((item) => item.tipo === 'ferias').slice(0, 2);
            const ausenciasDia = colaboradoresDia.filter((item) => item.tipo === 'ausencia').slice(0, 2);
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
                const nomeFeriado = eventos.feriado.length > 15 ? `${eventos.feriado.substring(0, 12)}...` : eventos.feriado;
                linhaAtual += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">📅 ${escapeHtmlRelatorio(nomeFeriado)}</div>`;
            }

            folgasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag folga-tag" title="${escapeHtmlRelatorio(item.nome)}">🌸 ${escapeHtmlRelatorio(nome)}</div>`;
            });

            feriasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ferias-tag" title="${escapeHtmlRelatorio(item.nome)}">🏖️ ${escapeHtmlRelatorio(nome)}</div>`;
            });

            ausenciasDia.forEach((item) => {
                const nome = item.nome.length > 10 ? `${item.nome.substring(0, 8)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ausencia-tag" title="${escapeHtmlRelatorio(item.nome)}">⚠️ ${escapeHtmlRelatorio(nome)}</div>`;
            });

            if (colaboradoresDia.length > 2) {
                linhaAtual += `<div style="font-size: 7px; color: #64748b; margin-top: 1px;">+${colaboradoresDia.length - 2}</div>`;
            }

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

                <div class="legendas-pdf">
                    <div class="legenda-item"><span class="legenda-cor legenda-folga"></span><span>Folga (🌸)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-ferias"></span><span>Ferias (🏖️)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-ausencia"></span><span>Ausencia (⚠️)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-feriado"></span><span>Feriado (📅)</span></div>
                    <div class="legenda-item"><span class="legenda-cor legenda-domingo"></span><span>Domingo</span></div>
                </div>

                <div class="listas-container">
                    <div class="listas-grid">
                        <div class="lista-card">
                            <h3>📅 Feriados</h3>
                            ${feriados.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 58%">Feriado</th><th style="width: 22%">Data</th><th style="width: 20%">Tipo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${feriados.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.nome)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
                                            </tr>
                                        `).join('')}
                                        ${feriados.length > 8 ? `<tr><td colspan="3" style="text-align: center; color: #64748b;">... e mais ${feriados.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhum feriado</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>🏖️ Ferias</h3>
                            ${ferias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 42%">Colaborador</th><th style="width: 58%">Periodo</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ferias.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ferias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ferias.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ferias</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>🌸 Folgas</h3>
                            ${folgas.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${folgas.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${folgas.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${folgas.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma folga</div>'}
                        </div>

                        <div class="lista-card">
                            <h3>⚠️ Ausencias</h3>
                            ${ausencias.length > 0 ? `
                                <table>
                                    <thead>
                                        <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                                    </thead>
                                    <tbody>
                                        ${ausencias.slice(0, 8).map((item) => `
                                            <tr>
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                            </tr>
                                        `).join('')}
                                        ${ausencias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ausencias.length - 8}</td></tr>` : ''}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-message">Nenhuma ausencia</div>'}
                        </div>
                    </div>
                </div>

                <div class="resumo-rodape">
                    <strong>Total de lancamentos no mes: ${totalEventos}</strong><br>
                    <small>${feriados.length} feriados, ${ferias.length} ferias, ${folgas.length} folgas, ${ausencias.length} ausencias</small>
                </div>
            </body>
            </html>
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
                        color: #0b5d56;
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
                        background: #0b5d56;
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
                        background: #d7f2ee;
                        color: #4338ca;
                        border-left: 3px solid #0f766e;
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
                    .legenda-ferias { background: #d7f2ee; border: 1px solid #0b5d56; }
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
                        background: linear-gradient(135deg, #0b5d56 0%, #3730a3 100%);
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
                linhaAtual += `<div class="dia-feriado" title="${escapeHtmlRelatorio(eventos.feriado)}">${escapeHtmlRelatorio(nomeFeriado)}</div>`;
            }

            linhaAtual += '<div class="dia-eventos">';

            folgasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag folga-tag" title="${escapeHtmlRelatorio(item.nome)}">Folga: ${escapeHtmlRelatorio(nome)}</div>`;
            });

            feriasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ferias-tag" title="${escapeHtmlRelatorio(item.nome)}">Ferias: ${escapeHtmlRelatorio(nome)}</div>`;
            });

            ausenciasVisiveis.forEach((item) => {
                const nome = item.nome.length > 20 ? `${item.nome.substring(0, 17)}...` : item.nome;
                linhaAtual += `<div class="evento-tag ausencia-tag" title="${escapeHtmlRelatorio(item.nome)}">Ausencia: ${escapeHtmlRelatorio(nome)}</div>`;
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
                                                <td>${escapeHtmlRelatorio(item.nome)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
                                                <td>${escapeHtmlRelatorio(item.tipo || 'municipal')}</td>
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
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.periodoTexto)}</td>
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
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
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
                                                <td>${escapeHtmlRelatorio(item.colaborador)}</td>
                                                <td>${escapeHtmlRelatorio(item.dataFormatada)}</td>
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

(function () {
    if (window.__bancoHorasRuntimeEnhancementsLoaded) {
        return;
    }

    window.__bancoHorasRuntimeEnhancementsLoaded = true;

    const inflight = new Map();
    let disponibilidadeTimer = null;

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function obterDataISO(valor) {
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

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function obterHoraValor(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            const bruto = valor.includes('T') ? valor.split('T')[1] : valor;
            const match = bruto.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
            return match ? `${match[1]}:00` : null;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const isTimeOnlyDate = data.getUTCFullYear() === 1970
            && data.getUTCMonth() === 0
            && data.getUTCDate() === 1;
        const horas = String(isTimeOnlyDate ? data.getUTCHours() : data.getHours()).padStart(2, '0');
        const minutos = String(isTimeOnlyDate ? data.getUTCMinutes() : data.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}:00`;
    }

    function formatarDataPtBr(valor) {
        const dataISO = obterDataISO(valor);

        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function formatarHoraInput(valor) {
        const hora = obterHoraValor(valor);
        return hora ? hora.slice(0, 5) : '';
    }

    function minutosParaTexto(valor, options = {}) {
        const { signed = false } = options;
        const total = Number.isFinite(valor) ? Math.round(valor) : 0;
        const sinal = total < 0 ? '-' : '+';
        const absoluto = Math.abs(total);
        const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
        const minutos = String(absoluto % 60).padStart(2, '0');
        return `${signed ? sinal : ''}${horas}h ${minutos}m`;
    }

    function mapAusencia(item) {
        const descontaBancoHoras = item.DescontaBancoHoras ?? item.descontaBancoHoras;

        return {
            Id: item.Id,
            ColaboradorId: item.ColaboradorId,
            Tipo: item.Tipo,
            DataInicio: item.DataInicio,
            DataFim: item.DataFim,
            DataCadastro: item.DataCadastro,
            PeriodoTipo: item.PeriodoTipo || 'dia_inteiro',
            HoraInicio: item.HoraInicio,
            HoraFim: item.HoraFim,
            Subtipo: item.Subtipo || null,
            DescontaBancoHoras: descontaBancoHoras === null || descontaBancoHoras === undefined
                ? null
                : Boolean(descontaBancoHoras),
            Observacao: item.Observacao || null,
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo: item.Tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo: item.PeriodoTipo || 'dia_inteiro',
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim,
            subtipo: item.Subtipo || null,
            descontaBancoHoras: descontaBancoHoras === null || descontaBancoHoras === undefined
                ? null
                : Boolean(descontaBancoHoras),
            observacao: item.Observacao || null
        };
    }

    function mapPlantao(item) {
        return {
            ...item,
            dataISO: obterDataISO(item.dataISO || item.data_plantao),
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            horaInicio: obterHoraValor(item.horaInicio || item.hora_inicio),
            horaFim: obterHoraValor(item.horaFim || item.hora_fim),
            observacao: item.observacao || null,
            duracaoMinutos: Number.isFinite(item.duracaoMinutos) ? item.duracaoMinutos : null,
            duracaoFormatada: item.duracaoFormatada || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : []
        };
    }

    function mapBancoHorasResumo(item) {
        return {
            colaboradorId: Number(item.colaboradorId),
            nome: item.nome,
            saldoMinutos: Number(item.saldoMinutos || 0),
            saldoFormatado: item.saldoFormatado || minutosParaTexto(item.saldoMinutos || 0, { signed: true }),
            creditosMesMinutos: Number(item.creditosMesMinutos || 0),
            creditosMesFormatado: item.creditosMesFormatado || minutosParaTexto(item.creditosMesMinutos || 0),
            debitosMesMinutos: Number(item.debitosMesMinutos || 0),
            debitosMesFormatado: item.debitosMesFormatado || minutosParaTexto(item.debitosMesMinutos || 0),
            ultimoMovimentoEm: item.ultimoMovimentoEm || null
        };
    }

    function getBancoHorasResumoByColaborador(colaboradorId) {
        return (window.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getPlantaoEditorState() {
        if (!window.__plantaoEditorState) {
            window.__plantaoEditorState = null;
        }

        return window.__plantaoEditorState;
    }

    function setPlantaoEditorState(state) {
        window.__plantaoEditorState = state;
        return state;
    }

    function isColaboradoresScreenVisible() {
        return Boolean(document.getElementById('listaColaboradores'));
    }

    function getAusenciaDefaults(tipo, subtipo = null) {
        if (tipo === 'ferias') {
            return {
                subtipo: 'ferias',
                descontaBancoHoras: false,
                subtipoBloqueado: true,
                descontoBloqueado: true,
                hint: 'Ferias nao descontam do banco de horas.'
            };
        }

        if (tipo === 'folga') {
            return {
                subtipo: 'folga',
                descontaBancoHoras: true,
                subtipoBloqueado: true,
                descontoBloqueado: false,
                hint: 'Folga debita a jornada padrao do colaborador no banco de horas.'
            };
        }

        if (subtipo === 'medico') {
            return {
                subtipo: 'medico',
                descontaBancoHoras: false,
                subtipoBloqueado: false,
                descontoBloqueado: false,
                hint: 'Lancamentos medicos podem ficar sem desconto no banco.'
            };
        }

        return {
            subtipo: subtipo || 'comum',
            descontaBancoHoras: true,
            subtipoBloqueado: false,
            descontoBloqueado: false,
            hint: 'Ausencias e folgas podem gerar debito, salvo quando voce desmarcar o desconto.'
        };
    }

    function aplicarDefaultsBancoHorasLancamento(options = {}) {
        const { force = false, resetManual = false } = options;
        const tipo = document.getElementById('tipoLancamento')?.value;
        const painel = document.getElementById('camposBancoHorasPessoal');
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const hint = document.getElementById('descontaBancoHorasHint');

        if (!painel || !subtipo || !desconto || !hint) {
            return;
        }

        if (resetManual) {
            delete desconto.dataset.manualOverride;
        }

        const isPessoal = tipo && tipo !== 'feriado';
        painel.classList.toggle('hidden', !isPessoal);

        if (!isPessoal) {
            return;
        }

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        const keepManual = desconto.dataset.manualOverride === 'true' && !force;

        if (!subtipo.value || force || defaults.subtipoBloqueado) {
            subtipo.value = defaults.subtipo;
        }

        if (!keepManual) {
            desconto.checked = defaults.descontaBancoHoras;
        }

        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function resetBancoHorasLancamento() {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');

        if (subtipo) {
            subtipo.value = 'comum';
        }

        if (desconto) {
            desconto.checked = true;
            delete desconto.dataset.manualOverride;
        }

        if (observacao) {
            observacao.value = '';
        }

        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }

    function preencherBancoHorasLancamento(item) {
        const subtipo = document.getElementById('ausenciaSubtipo');
        const desconto = document.getElementById('descontaBancoHoras');
        const observacao = document.getElementById('observacaoLancamento');
        const hint = document.getElementById('descontaBancoHorasHint');
        const tipo = document.getElementById('tipoLancamento')?.value || item.tipo || item.Tipo;

        if (!subtipo || !desconto || !observacao || !hint) {
            return;
        }

        subtipo.value = item.subtipo || item.Subtipo || getAusenciaDefaults(tipo).subtipo;
        desconto.checked = item.descontaBancoHoras === null || item.descontaBancoHoras === undefined
            ? getAusenciaDefaults(tipo, subtipo.value).descontaBancoHoras
            : Boolean(item.descontaBancoHoras);
        observacao.value = item.observacao || item.Observacao || '';
        desconto.dataset.manualOverride = 'true';

        const defaults = getAusenciaDefaults(tipo, subtipo.value);
        subtipo.disabled = defaults.subtipoBloqueado;
        desconto.disabled = defaults.descontoBloqueado;
        hint.textContent = defaults.hint;
    }

    function renderResumoBancoHorasAviso() {
        if (!window.bancoHorasStatus || window.bancoHorasStatus.enabled !== false) {
            return '';
        }

        return `
            <div class="banco-horas-alert">
                <i class="fas fa-database"></i>
                <div>
                    <strong>Banco de horas aguardando migracao</strong>
                    <span>${escapeHtml(window.bancoHorasStatus.message || 'Aplique o script SQL para liberar saldo e extrato.')}</span>
                </div>
            </div>
        `;
    }

    function renderCardBancoHoras(colaborador) {
        const resumo = getBancoHorasResumoByColaborador(colaborador.Id);
        const saldoClasse = resumo?.saldoMinutos < 0 ? 'negativo' : 'positivo';
        const saldoTexto = resumo ? resumo.saldoFormatado : '+00h 00m';
        const creditosTexto = resumo ? resumo.creditosMesFormatado : '00h 00m';
        const debitosTexto = resumo ? resumo.debitosMesFormatado : '00h 00m';

        return `
            <div class="banco-horas-card">
                <div class="banco-horas-saldo ${saldoClasse}">
                    <span class="banco-horas-label">Saldo atual</span>
                    <strong>${escapeHtml(saldoTexto)}</strong>
                </div>
                <div class="banco-horas-metrics">
                    <span><i class="fas fa-arrow-up"></i> Creditos do mes: ${escapeHtml(creditosTexto)}</span>
                    <span><i class="fas fa-arrow-down"></i> Debitos do mes: ${escapeHtml(debitosTexto)}</span>
                </div>
                <button type="button" class="btn-secondary btn-banco-horas" data-extrato-colaborador="${colaborador.Id}">
                    <i class="fas fa-receipt"></i> Extrato
                </button>
            </div>
        `;
    }

    function ensureBancoHorasModal() {
        if (document.getElementById('modalBancoHoras')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'modalBancoHoras';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content banco-horas-modal-content">
                <div class="modal-header">
                    <h3 id="modalBancoHorasTitulo"><i class="fas fa-receipt"></i> Banco de horas</h3>
                    <button class="modal-close" id="fecharModalBancoHorasBtn">&times;</button>
                </div>
                <div class="modal-body" id="modalBancoHorasBody">
                    <div class="loading-state">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Carregando extrato...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    function renderExtratoBancoHoras(payload) {
        const body = document.getElementById('modalBancoHorasBody');

        if (!body) {
            return;
        }

        const items = Array.isArray(payload.items) ? payload.items : [];

        if (items.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento encontrado.</p>
                </div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="banco-horas-extrato-list">
                ${items.map((item) => `
                    <article class="banco-horas-movimento ${item.minutos < 0 ? 'debito' : 'credito'}">
                        <header>
                            <div>
                                <strong>${escapeHtml(item.descricao)}</strong>
                                <span>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</span>
                            </div>
                            <div class="banco-horas-movimento-valores">
                                <strong>${escapeHtml(item.minutosFormatado)}</strong>
                                <span>Saldo: ${escapeHtml(item.saldoAcumuladoFormatado)}</span>
                            </div>
                        </header>
                        ${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}
                    </article>
                `).join('')}
            </div>
        `;
    }

    async function abrirExtratoBancoHoras(colaboradorId) {
        ensureBancoHorasModal();
        const modal = document.getElementById('modalBancoHoras');
        const titulo = document.getElementById('modalBancoHorasTitulo');
        const body = document.getElementById('modalBancoHorasBody');
        const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

        if (!modal || !titulo || !body) {
            return;
        }

        titulo.innerHTML = `<i class="fas fa-receipt"></i> Banco de horas - ${escapeHtml(colaborador?.Nome || 'Colaborador')}`;
        body.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-circle-notch fa-spin"></i>
                <p>Carregando extrato...</p>
            </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('active');

        try {
            const payload = await window.API.getBancoHorasExtrato(colaboradorId);
            renderExtratoBancoHoras(payload);
        } catch (error) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${escapeHtml(error.message || 'Nao foi possivel carregar o extrato.')}</p>
                </div>
            `;
        }
    }

    function renderChecklistColaboradoresAvancado(selecionados = [], disponibilidade = []) {
        const listaColaboradores = Array.isArray(window.colaboradores) ? window.colaboradores : [];

        if (listaColaboradores.length === 0) {
            return `
                <div class="empty-msg">
                    <i class="fas fa-users"></i>
                    <p>Nenhum colaborador cadastrado</p>
                </div>
            `;
        }

        const disponibilidadeMap = new Map((disponibilidade || []).map((item) => [Number(item.id), item]));
        let selecionadosDisponiveis = 0;

        const html = listaColaboradores.map((colaborador) => {
            const status = disponibilidadeMap.get(Number(colaborador.Id)) || {
                disponivel: true,
                motivoLabel: null
            };
            const disponivel = status.disponivel !== false;
            const checked = disponivel && selecionados.includes(colaborador.Id);

            if (checked) {
                selecionadosDisponiveis += 1;
            }

            return `
                <label class="colaborador-checkbox ${disponivel ? '' : 'indisponivel'}">
                    <input type="checkbox" value="${colaborador.Id}" ${checked ? 'checked' : ''} ${disponivel ? '' : 'disabled'}>
                    <span class="checkbox-label">
                        <i class="fas fa-user-circle"></i>
                        <span>
                            <strong>${escapeHtml(colaborador.Nome)}</strong>
                            ${disponivel ? '' : `<small class="status-indisponivel">${escapeHtml(status.motivoLabel || 'Indisponivel')}</small>`}
                        </span>
                    </span>
                </label>
            `;
        }).join('');

        return `
            ${html}
            <div class="selecionados-count">
                <i class="fas fa-check-circle"></i>
                <span id="plantaoSelecionadosCount">${selecionadosDisponiveis} colaborador(es) selecionado(s)</span>
            </div>
        `;
    }

    function updatePlantaoSelectionSummary() {
        const contador = document.getElementById('plantaoSelecionadosCount');
        const credito = document.getElementById('plantaoCreditoPreview');

        if (contador) {
            const selecionados = document.querySelectorAll('#checklistColaboradores input:checked').length;
            contador.textContent = `${selecionados} colaborador(es) selecionado(s)`;
        }

        if (credito) {
            const horaInicio = document.getElementById('plantaoHoraInicio')?.value;
            const horaFim = document.getElementById('plantaoHoraFim')?.value;

            if (!horaInicio || !horaFim) {
                credito.textContent = 'Credito por colaborador: informe o horario';
                return;
            }

            const [horaInicioHoras, horaInicioMinutos] = horaInicio.split(':').map(Number);
            const [horaFimHoras, horaFimMinutos] = horaFim.split(':').map(Number);
            const minutos = ((horaFimHoras * 60) + horaFimMinutos) - ((horaInicioHoras * 60) + horaInicioMinutos);

            if (minutos <= 0) {
                credito.textContent = 'Credito por colaborador: horario invalido';
                return;
            }

            credito.textContent = `Credito por colaborador: ${minutosParaTexto(minutos)}`;
        }
    }

    async function carregarDisponibilidadePlantao(state) {
        try {
            const response = await window.API.getPlantaoDisponibilidade(state.dataISO, {
                horaInicio: state.horaInicio || undefined,
                horaFim: state.horaFim || undefined
            });

            state.disponibilidade = Array.isArray(response?.colaboradores) ? response.colaboradores : [];
        } catch (error) {
            state.disponibilidade = (window.colaboradores || []).map((item) => ({
                id: item.Id,
                nome: item.Nome,
                disponivel: true,
                motivoLabel: null
            }));
        }

        const disponiveis = new Set(
            (state.disponibilidade || [])
                .filter((item) => item.disponivel !== false)
                .map((item) => Number(item.id))
        );

        state.selecionados = (state.selecionados || []).filter((item) => disponiveis.has(Number(item)));
        return state;
    }

    function renderPlantaoEditor(state) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        editorPanel.style.display = 'block';
        editorTitle.innerText = `Plantao - ${state.dataFormatada}`;

        editorContent.innerHTML = `
            <div class="editor-plantao">
                <div class="editor-form-grid">
                    <div class="editor-form-group">
                        <label><i class="fas fa-calendar-week"></i> Tipo do plantao</label>
                        <select id="plantaoTipoPlantao" class="form-control">
                            <option value="sabado" selected>Sabado</option>
                        </select>
                        <small class="helper-text">Plantao extra permitido apenas aos sabados.</small>
                    </div>
                    <div class="editor-form-group">
                        <label><i class="fas fa-clock"></i> Horario do plantao</label>
                        <div class="time-inputs plantao-time-inputs">
                            <input type="time" id="plantaoHoraInicio" value="${escapeHtml(formatarHoraInput(state.horaInicio))}">
                            <span>ate</span>
                            <input type="time" id="plantaoHoraFim" value="${escapeHtml(formatarHoraInput(state.horaFim))}">
                        </div>
                        <small class="helper-text">Essas horas viram credito no banco de horas.</small>
                    </div>
                    <div class="editor-form-group">
                        <label><i class="fas fa-wallet"></i> Resumo</label>
                        <div class="plantao-bank-preview">
                            <span id="plantaoCreditoPreview">Credito por colaborador: ${state.horaInicio && state.horaFim ? minutosParaTexto((((Number(state.horaFim.slice(0, 2)) * 60) + Number(state.horaFim.slice(3, 5))) - ((Number(state.horaInicio.slice(0, 2)) * 60) + Number(state.horaInicio.slice(3, 5))))) : 'informe o horario'}</span>
                        </div>
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-align-left"></i> Observacao</label>
                    <textarea id="plantaoObservacao" class="form-control" rows="3" placeholder="Detalhes opcionais para o plantao">${escapeHtml(state.observacao || '')}</textarea>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-users"></i> Selecione os colaboradores</label>
                    <div class="colaboradores-checklist" id="checklistColaboradores">
                        ${renderChecklistColaboradoresAvancado(state.selecionados, state.disponibilidade)}
                    </div>
                </div>

                <div class="editor-actions">
                    <button onclick="salvarPlantao('${state.dataISO}')" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar Plantao
                    </button>
                    <button onclick="fecharPlantaoEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;

        editorContent.querySelectorAll('#checklistColaboradores input[type="checkbox"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updatePlantaoSelectionSummary);
        });

        const horaInicio = document.getElementById('plantaoHoraInicio');
        const horaFim = document.getElementById('plantaoHoraFim');

        [horaInicio, horaFim].forEach((campo) => {
            campo?.addEventListener('input', () => {
                updatePlantaoSelectionSummary();

                if (disponibilidadeTimer) {
                    clearTimeout(disponibilidadeTimer);
                }

                disponibilidadeTimer = setTimeout(async () => {
                    const currentState = getPlantaoEditorState();

                    if (!currentState) {
                        return;
                    }

                    currentState.horaInicio = horaInicio?.value || null;
                    currentState.horaFim = horaFim?.value || null;
                    await carregarDisponibilidadePlantao(currentState);
                    renderPlantaoEditor(currentState);
                    updatePlantaoSelectionSummary();
                }, 250);
            });
        });

        updatePlantaoSelectionSummary();
    }

    window.carregarBancoHorasResumo = carregarBancoHorasResumo = function carregarBancoHorasResumoComCache() {
        return withInFlight('banco-horas-resumo', async () => {
            let items = [];
            let status = { enabled: true, message: null };

            try {
                const payload = await window.API.getBancoHorasResumo();
                items = Array.isArray(payload?.items) ? payload.items.map(mapBancoHorasResumo) : [];
                status = {
                    enabled: payload?.enabled !== false,
                    message: null
                };
            } catch (error) {
                items = [];
                status = {
                    enabled: false,
                    message: error.message || 'Banco de horas indisponivel.'
                };
            }

            window.bancoHorasResumo = items;
            window.bancoHorasStatus = status;
            return { items, status };
        });
    };

    window.renderListaColaboradores = renderListaColaboradores = function renderListaColaboradoresComBancoHoras(lista = window.colaboradores || []) {
            const container = document.getElementById('listaColaboradores');

            if (!container) {
                return;
            }

            if (!lista || lista.length === 0) {
                container.innerHTML = `
                    ${renderResumoBancoHorasAviso()}
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>Nenhum colaborador encontrado</p>
                        <small>Clique em "Novo Colaborador" para adicionar</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                ${renderResumoBancoHorasAviso()}
                ${lista.map((colaborador) => `
                    <article class="colaborador-card" data-colaborador-id="${colaborador.Id}">
                        <div class="colaborador-avatar">
                            ${escapeHtml(colaborador.Nome?.charAt(0) || '?')}
                        </div>
                        <div class="colaborador-info">
                            <h4 class="colaborador-nome">${escapeHtml(colaborador.Nome || 'Sem nome')}</h4>
                            ${colaborador.SetorNome ? `
                                <div class="colaborador-setor-badge">
                                    <i class="fas fa-layer-group"></i> ${escapeHtml(colaborador.SetorNome)}
                                </div>
                            ` : ''}
                            <div class="colaborador-horarios">
                                <span class="horario-tag">
                                    <i class="fas fa-briefcase"></i> ${escapeHtml(formatarHora(colaborador.TrabalhoInicio))} - ${escapeHtml(formatarHora(colaborador.TrabalhoFim))}
                                </span>
                                <span class="horario-tag">
                                    <i class="fas fa-utensils"></i> ${escapeHtml(formatarHora(colaborador.AlmocoInicio))} - ${escapeHtml(formatarHora(colaborador.AlmocoFim))}
                                </span>
                            </div>
                            ${renderCardBancoHoras(colaborador)}
                        </div>
                        <div class="colaborador-edit-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </article>
                `).join('')}
            `;

            container.querySelectorAll('.colaborador-card').forEach((card) => {
                card.addEventListener('click', (event) => {
                    if (event.target.closest('[data-extrato-colaborador]')) {
                        return;
                    }

                    const colaboradorId = Number(card.dataset.colaboradorId);

                    if (typeof window.abrirEditorColaboradores === 'function') {
                        window.abrirEditorColaboradores(colaboradorId);
                    } else if (typeof abrirEditorColaboradores === 'function') {
                        abrirEditorColaboradores(colaboradorId);
                    }
                });
            });

            container.querySelectorAll('[data-extrato-colaborador]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    abrirExtratoBancoHoras(button.dataset.extratoColaborador);
                });
            });
        };

    function buildSetorEditorOptions(selectedId = '') {
        return [
            '<option value="">Selecione...</option>',
            ...((window.setores || []).map((setor) => `
                <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${escapeHtml(setor.nome)}</option>
            `))
        ].join('');
    }

    const JORNADA_SEMANAL_DIAS = [
        { diaSemana: 0, label: 'Domingo' },
        { diaSemana: 1, label: 'Segunda' },
        { diaSemana: 2, label: 'Terca' },
        { diaSemana: 3, label: 'Quarta' },
        { diaSemana: 4, label: 'Quinta' },
        { diaSemana: 5, label: 'Sexta' },
        { diaSemana: 6, label: 'Sabado' }
    ];

    function buildJornadaSemanalDefaultRows() {
        return JORNADA_SEMANAL_DIAS.map((dia) => ({
            diaSemana: dia.diaSemana,
            label: dia.label,
            checked: false,
            trabalhoInicio: '',
            trabalhoFim: '',
            almocoInicio: '',
            almocoFim: ''
        }));
    }

    function mapJornadaSemanalRowsToEditor(items = []) {
        const byDay = new Map();

        (Array.isArray(items) ? items : []).forEach((item) => {
            const day = Number(item.diaSemana ?? item.DiaSemana);

            if (!Number.isInteger(day) || day < 0 || day > 6) {
                return;
            }

            byDay.set(day, {
                trabalhoInicio: formatarHora(item.trabalhoInicio || item.TrabalhoInicio || ''),
                trabalhoFim: formatarHora(item.trabalhoFim || item.TrabalhoFim || ''),
                almocoInicio: formatarHora(item.almocoInicio || item.AlmocoInicio || ''),
                almocoFim: formatarHora(item.almocoFim || item.AlmocoFim || '')
            });
        });

        return buildJornadaSemanalDefaultRows().map((row) => {
            const loaded = byDay.get(row.diaSemana);

            if (!loaded) {
                return row;
            }

            return {
                ...row,
                checked: true,
                ...loaded
            };
        });
    }

    function getJornadaSemanalEditorMeta() {
        if (!window.__jornadaSemanalEditorMeta) {
            window.__jornadaSemanalEditorMeta = {
                colaboradorId: null,
                hasExisting: false,
                touched: false,
                loaded: false
            };
        }

        return window.__jornadaSemanalEditorMeta;
    }

    function setJornadaSemanalEditorTouched(value = true) {
        const meta = getJornadaSemanalEditorMeta();
        meta.touched = Boolean(value);
    }

    function renderJornadaSemanalRows(rows = []) {
        return rows.map((row) => `
            <div class="jornada-semanal-row${row.checked ? ' is-selected' : ''}" data-jornada-row="${row.diaSemana}">
                <label class="jornada-semanal-day-toggle">
                    <input type="checkbox" data-jornada-check="${row.diaSemana}" ${row.checked ? 'checked' : ''}>
                    <span>${escapeHtml(row.label)}</span>
                </label>
                <div class="jornada-semanal-times${row.checked ? '' : ' is-hidden'}" data-jornada-times="${row.diaSemana}">
                    <div class="jornada-time-group">
                        <small>Jornada</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-entrada="${row.diaSemana}" value="${escapeHtml(row.trabalhoInicio || '')}" class="form-control" title="Entrada">
                            <span>ate</span>
                            <input type="time" data-jornada-saida="${row.diaSemana}" value="${escapeHtml(row.trabalhoFim || '')}" class="form-control" title="Saida">
                        </div>
                    </div>
                    <div class="jornada-time-group">
                        <small>Almoco</small>
                        <div class="jornada-time-pair">
                            <input type="time" data-jornada-almoco-inicio="${row.diaSemana}" value="${escapeHtml(row.almocoInicio || '')}" class="form-control" title="Almoco inicio">
                            <span>ate</span>
                            <input type="time" data-jornada-almoco-fim="${row.diaSemana}" value="${escapeHtml(row.almocoFim || '')}" class="form-control" title="Almoco fim">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function buildJornadaSemanalEditorMarkup(rows = [], options = {}) {
        const { showSuggestion = false } = options;

        return `
            <div class="editor-form-group">
                <label><i class="fas fa-calendar-week"></i> Jornada semanal</label>
                <div id="jornadaSemanalSection" class="jornada-semanal-shell">
                    <div class="jornada-semanal-actions">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSegSex">
                            <i class="fas fa-business-time"></i> Selecionar segunda a sexta
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaTodos">
                            <i class="fas fa-layer-group"></i> Selecionar todos
                        </button>
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaCopiarPadrao">
                            <i class="fas fa-copy"></i> Copiar horario padrao para dias selecionados
                        </button>
                    </div>
                    <div class="jornada-semanal-grid" id="jornadaSemanalGrid">
                        ${renderJornadaSemanalRows(rows)}
                    </div>
                    <div id="jornadaSemanalHint" class="helper-text jornada-semanal-hint${showSuggestion ? '' : ' is-hidden'}">
                        Este colaborador ainda nao possui jornada semanal salva. Use o botao abaixo para sugerir o padrao atual sem salvar automaticamente.
                    </div>
                    <div id="jornadaSemanalSuggestionActions" class="jornada-semanal-suggestion-actions${showSuggestion ? '' : ' is-hidden'}">
                        <button type="button" class="btn-secondary btn-jornada-action" id="btnJornadaSugerirPadrao">
                            <i class="fas fa-magic"></i> Sugerir jornada com base no horario padrao
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function toggleJornadaSemanalDayRow(day, checked) {
        const row = document.querySelector(`[data-jornada-row="${day}"]`);
        const times = document.querySelector(`[data-jornada-times="${day}"]`);

        if (row) {
            row.classList.toggle('is-selected', checked);
        }

        if (times) {
            times.classList.toggle('is-hidden', !checked);
        }
    }

    function getHorarioPadraoEditor() {
        return {
            trabalhoInicio: document.getElementById('editorTrabInicio')?.value || '',
            trabalhoFim: document.getElementById('editorTrabFim')?.value || '',
            almocoInicio: document.getElementById('editorAlmInicio')?.value || '',
            almocoFim: document.getElementById('editorAlmFim')?.value || ''
        };
    }

    function copyHorarioPadraoParaJornadaSelecionada() {
        const padrao = getHorarioPadraoEditor();
        const checkedDays = Array.from(document.querySelectorAll('[data-jornada-check]:checked'));

        checkedDays.forEach((checkbox) => {
            const day = checkbox.getAttribute('data-jornada-check');
            const entrada = document.querySelector(`[data-jornada-entrada="${day}"]`);
            const saida = document.querySelector(`[data-jornada-saida="${day}"]`);
            const almocoInicio = document.querySelector(`[data-jornada-almoco-inicio="${day}"]`);
            const almocoFim = document.querySelector(`[data-jornada-almoco-fim="${day}"]`);

            if (entrada) entrada.value = padrao.trabalhoInicio;
            if (saida) saida.value = padrao.trabalhoFim;
            if (almocoInicio) almocoInicio.value = padrao.almocoInicio;
            if (almocoFim) almocoFim.value = padrao.almocoFim;
        });

        if (checkedDays.length > 0) {
            setJornadaSemanalEditorTouched(true);
        }
    }

    function setJornadaSemanalDays(days = []) {
        const daySet = new Set(days.map((day) => Number(day)));

        JORNADA_SEMANAL_DIAS.forEach((dayInfo) => {
            const checkbox = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`);
            const checked = daySet.has(dayInfo.diaSemana);

            if (checkbox) {
                checkbox.checked = checked;
            }

            toggleJornadaSemanalDayRow(dayInfo.diaSemana, checked);
        });

        setJornadaSemanalEditorTouched(true);
    }

    function collectJornadaSemanalPayloadFromEditor() {
        return JORNADA_SEMANAL_DIAS.map((dayInfo) => {
            const checked = document.querySelector(`[data-jornada-check="${dayInfo.diaSemana}"]`)?.checked;

            if (!checked) {
                return null;
            }

            return {
                diaSemana: dayInfo.diaSemana,
                trabalhoInicio: document.querySelector(`[data-jornada-entrada="${dayInfo.diaSemana}"]`)?.value || null,
                trabalhoFim: document.querySelector(`[data-jornada-saida="${dayInfo.diaSemana}"]`)?.value || null,
                almocoInicio: document.querySelector(`[data-jornada-almoco-inicio="${dayInfo.diaSemana}"]`)?.value || null,
                almocoFim: document.querySelector(`[data-jornada-almoco-fim="${dayInfo.diaSemana}"]`)?.value || null
            };
        }).filter(Boolean);
    }

    function bindJornadaSemanalEditorEvents() {
        const section = document.getElementById('jornadaSemanalSection');

        if (!section || section.dataset.bound === 'true') {
            return;
        }

        section.dataset.bound = 'true';

        document.querySelectorAll('[data-jornada-check]').forEach((input) => {
            input.addEventListener('change', () => {
                const day = Number(input.getAttribute('data-jornada-check'));
                toggleJornadaSemanalDayRow(day, input.checked);
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.querySelectorAll(
            '[data-jornada-entrada], [data-jornada-saida], [data-jornada-almoco-inicio], [data-jornada-almoco-fim]'
        ).forEach((input) => {
            input.addEventListener('input', () => {
                setJornadaSemanalEditorTouched(true);
            });
        });

        document.getElementById('btnJornadaSegSex')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
        });

        document.getElementById('btnJornadaTodos')?.addEventListener('click', () => {
            setJornadaSemanalDays([0, 1, 2, 3, 4, 5, 6]);
        });

        document.getElementById('btnJornadaCopiarPadrao')?.addEventListener('click', () => {
            copyHorarioPadraoParaJornadaSelecionada();
        });

        document.getElementById('btnJornadaSugerirPadrao')?.addEventListener('click', () => {
            setJornadaSemanalDays([1, 2, 3, 4, 5]);
            copyHorarioPadraoParaJornadaSelecionada();
        });
    }

    function updateJornadaSemanalSuggestionVisibility(showSuggestion) {
        const hint = document.getElementById('jornadaSemanalHint');
        const actions = document.getElementById('jornadaSemanalSuggestionActions');

        if (hint) {
            hint.classList.toggle('is-hidden', !showSuggestion);
        }

        if (actions) {
            actions.classList.toggle('is-hidden', !showSuggestion);
        }
    }

    async function hydrateJornadaSemanalEditor(colaboradorId) {
        const meta = getJornadaSemanalEditorMeta();
        meta.loaded = false;
        meta.hasExisting = false;

        if (!colaboradorId || !window.API?.getColaboradorJornadaSemanal) {
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(false);
            bindJornadaSemanalEditorEvents();
            return;
        }

        try {
            const payload = await window.API.getColaboradorJornadaSemanal(colaboradorId);
            const rows = mapJornadaSemanalRowsToEditor(payload?.items || []);
            const grid = document.getElementById('jornadaSemanalGrid');

            if (grid) {
                grid.innerHTML = renderJornadaSemanalRows(rows);
            }

            meta.hasExisting = rows.some((item) => item.checked);
            meta.loaded = true;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(!meta.hasExisting);
            bindJornadaSemanalEditorEvents();
        } catch (error) {
            meta.loaded = true;
            meta.hasExisting = false;
            setJornadaSemanalEditorTouched(false);
            updateJornadaSemanalSuggestionVisibility(true);
            bindJornadaSemanalEditorEvents();
        }
    }

    window.abrirEditorColaboradores = abrirEditorColaboradores = async function abrirEditorColaboradoresAtualizado(id) {
        if (
            (!Array.isArray(window.setores) || window.setores.length === 0)
            && typeof carregarSetores === 'function'
        ) {
            await carregarSetores();
        }

        const colaborador = id ? (window.colaboradores || []).find((item) => Number(item.Id) === Number(id)) : null;
        const editorPanel = document.getElementById('colaboradorEditor');
        const editorTitle = document.getElementById('editorTitle');
        const editorContent = document.getElementById('colaboradorEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            return;
        }

        editorPanel.style.display = 'block';
        editorTitle.innerText = colaborador ? 'Editar Colaborador' : 'Novo Colaborador';

        const jornadaMeta = getJornadaSemanalEditorMeta();
        jornadaMeta.colaboradorId = colaborador ? Number(colaborador.Id) : null;
        jornadaMeta.hasExisting = false;
        jornadaMeta.loaded = false;
        jornadaMeta.touched = false;

        editorContent.innerHTML = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" value="${escapeHtml(colaborador?.Nome || '')}" placeholder="Nome completo" class="form-control">
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-layer-group"></i> Setor</label>
                    <div class="setor-inputs">
                        <select id="editorSetorId" class="form-control">
                            ${buildSetorEditorOptions(colaborador?.SetorId || '')}
                        </select>
                        <button type="button" onclick="adicionarSetorRapido()" class="btn-secondary btn-setor-rapido">
                            <i class="fas fa-plus"></i> Novo setor
                        </button>
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Horario de entrada e saida</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" value="${escapeHtml(formatarHora(colaborador?.TrabalhoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorTrabFim" value="${escapeHtml(formatarHora(colaborador?.TrabalhoFim) || '')}" class="form-control">
                    </div>
                </div>

                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Horario de almoco</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" value="${escapeHtml(formatarHora(colaborador?.AlmocoInicio) || '')}" class="form-control">
                        <span>ate</span>
                        <input type="time" id="editorAlmFim" value="${escapeHtml(formatarHora(colaborador?.AlmocoFim) || '')}" class="form-control">
                    </div>
                    <small class="helper-text">Esses horarios definem a base padrao da escala para esse colaborador.</small>
                </div>

                ${typeof buildBancoHorasEditorMarkup === 'function' ? buildBancoHorasEditorMarkup(colaborador) : ''}
                ${buildJornadaSemanalEditorMarkup(buildJornadaSemanalDefaultRows(), { showSuggestion: false })}

                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(${colaborador ? colaborador.Id : 'null'})" class="btn-primary">
                        <i class="fas fa-save"></i> ${colaborador ? 'Atualizar' : 'Salvar'}
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>

                ${colaborador ? `
                    <div class="editor-footer">
                        <button onclick="excluirColaborador(${colaborador.Id})" class="btn-danger" style="width: 100%;">
                            <i class="fas fa-trash"></i> Excluir Colaborador
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        if (colaborador?.Id) {
            hydrateJornadaSemanalEditor(colaborador.Id);
        } else {
            bindJornadaSemanalEditorEvents();
            jornadaMeta.loaded = true;
            updateJornadaSemanalSuggestionVisibility(false);
            setJornadaSemanalEditorTouched(false);
        }
    };

    window.abrirEditorColaborador = abrirEditorColaborador = async function abrirEditorColaboradorAtualizado(id) {
        return window.abrirEditorColaboradores(id);
    };

    window.salvarColaboradorEditor = salvarColaboradorEditor = async function salvarColaboradorEditorComSetor(id) {
        const nome = document.getElementById('editorNome')?.value?.trim();
        const setorId = document.getElementById('editorSetorId')?.value || null;
        const trabalhoInicio = document.getElementById('editorTrabInicio')?.value || null;
        const trabalhoFim = document.getElementById('editorTrabFim')?.value || null;
        const almocoInicio = document.getElementById('editorAlmInicio')?.value || null;
        const almocoFim = document.getElementById('editorAlmFim')?.value || null;
        const bancoHorasSaldoOriginal = (document.getElementById('editorBancoHorasSaldoOriginal')?.value || '').trim() || '+00:00';
        const bancoHorasHabilitado = document.querySelector('.banco-horas-editor-shell')?.dataset?.enabled !== 'false';
        let bancoHorasSaldo = bancoHorasSaldoOriginal;

        if (!nome) {
            mostrarToast('Nome e obrigatorio!', 'error');
            return;
        }

        if (!setorId) {
            mostrarToast('Selecione um setor para o colaborador.', 'warning');
            return;
        }

        if (bancoHorasHabilitado) {
            try {
                bancoHorasSaldo = obterSaldoBancoHorasEditorValue();
            } catch (error) {
                mostrarToast(error.message || 'Revise o saldo do banco de horas.', 'error');
                return;
            }
        }

        try {
            const metodo = id ? 'PUT' : 'POST';
            const url = id
                ? `http://localhost:3000/api/colaboradores/${id}`
                : 'http://localhost:3000/api/colaboradores';
            const jornadaMeta = getJornadaSemanalEditorMeta();
            const jornadaSemanal = collectJornadaSemanalPayloadFromEditor();
            const shouldSendJornadaSemanal = Boolean(
                jornadaMeta.touched
                || (!id && jornadaSemanal.length > 0)
            );
            const invalidJornadaDia = shouldSendJornadaSemanal
                ? jornadaSemanal.find((item) => !item.trabalhoInicio || !item.trabalhoFim)
                : null;
            const body = {
                nome,
                setorId,
                trabalhoInicio,
                trabalhoFim,
                almocoInicio,
                almocoFim
            };

            if (invalidJornadaDia) {
                const dayInfo = JORNADA_SEMANAL_DIAS.find((day) => Number(day.diaSemana) === Number(invalidJornadaDia.diaSemana));
                mostrarToast(`Preencha entrada e saida para ${dayInfo?.label || 'o dia selecionado'}.`, 'warning');
                return;
            }

            if (shouldSendJornadaSemanal) {
                body.jornadaSemanal = jornadaSemanal;
            }

            const response = await fetch(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || data?.message || 'Erro ao salvar');
            }

            const colaboradorId = Number(data?.data?.Id || data?.Id || id);

            if (
                bancoHorasHabilitado
                && bancoHorasSaldo !== bancoHorasSaldoOriginal
                && Number.isFinite(colaboradorId)
                && colaboradorId > 0
                && window.API?.atualizarBancoHorasSaldo
            ) {
                await window.API.atualizarBancoHorasSaldo(colaboradorId, {
                    saldo: bancoHorasSaldo
                });
            }

            await Promise.allSettled([
                typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
                carregarColaboradores(),
                typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
            ]);

            if (typeof renderListaColaboradores === 'function') {
                renderListaColaboradores();
            }

            if (typeof fecharColaboradorEditor === 'function') {
                fecharColaboradorEditor();
            }

            mostrarToast(
                id ? 'Colaborador atualizado!' : 'Colaborador salvo com sucesso!',
                'success'
            );
        } catch (error) {
            console.error('Erro ao salvar:', error);
            mostrarToast(error.message || 'Erro ao salvar colaborador', 'error');
        }
    };

    window.renderColaboradoresPlantao = renderColaboradoresPlantao = function renderColaboradoresPlantaoAvancado(colaboradoresIds) {
        if (!colaboradoresIds || colaboradoresIds.length === 0) {
            return '<span class="sem-colaboradores">Nenhum colaborador selecionado</span>';
        }

        return colaboradoresIds.map((id) => {
            const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));

            if (!colaborador) {
                return '';
            }

            const resumo = getBancoHorasResumoByColaborador(id);

            return `
                <span class="colaborador-tag">
                    <i class="fas fa-user"></i> ${escapeHtml(colaborador.Nome)}
                    ${resumo ? `<small>${escapeHtml(resumo.saldoFormatado)}</small>` : ''}
                </span>
            `;
        }).join('');
    };

    const PLANTAO_SABADOS_ANTERIORES = 8;
    const PLANTAO_SABADOS_POSTERIORES = 10;
    const PLANTAO_SABADOS_PASSO = 8;
    const PLANTAO_MESES_LABELS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    function criarDataLocalPlantao(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-').map(Number);

        if (!ano || !mes || !dia) {
            return new Date();
        }

        return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    }

    function formatarDataPlantaoCard(dataISO) {
        const [ano, mes, dia] = String(dataISO || '').split('-');
        return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
    }

    function formatarMesPlantaoCard(dataISO) {
        const [, mes] = String(dataISO || '').split('-').map(Number);
        return PLANTAO_MESES_LABELS[mes - 1] || '--';
    }

    function ajustarAncoraSabadoPlantao(referenciaISO) {
        const data = criarDataLocalPlantao(obterDataISO(referenciaISO) || obterDataISO(new Date()));

        if (data.getDay() === 0) {
            data.setDate(data.getDate() - 1);
        }

        while (data.getDay() !== 6) {
            data.setDate(data.getDate() + 1);
        }

        return obterDataISO(data);
    }

    function obterAncoraSabadoPlantao() {
        if (!window.__plantaoSabadoAncoraISO) {
            window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(new Date());
        }

        return window.__plantaoSabadoAncoraISO;
    }

    function definirAncoraSabadoPlantao(referenciaISO) {
        window.__plantaoSabadoAncoraISO = ajustarAncoraSabadoPlantao(referenciaISO);
        return window.__plantaoSabadoAncoraISO;
    }

    function mudarPaginaSabadosPlantao(passosEmSemanas) {
        const data = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        data.setDate(data.getDate() + (Number(passosEmSemanas) || 0) * 7);
        definirAncoraSabadoPlantao(obterDataISO(data));
    }

    function construirSabadosVisiveisPlantao() {
        const hojeISO = obterDataISO(new Date());
        const dataAncora = criarDataLocalPlantao(obterAncoraSabadoPlantao());
        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || '');
        const sabados = [];

        for (let deslocamento = PLANTAO_SABADOS_ANTERIORES * -1; deslocamento <= PLANTAO_SABADOS_POSTERIORES; deslocamento += 1) {
            const data = new Date(dataAncora);
            data.setDate(data.getDate() + (deslocamento * 7));

            const dataISO = obterDataISO(data);
            const plantao = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO) || null;

            sabados.push({
                dataISO,
                formatada: formatarDataPlantaoCard(dataISO),
                dia: String(data.getDate()).padStart(2, '0'),
                mes: formatarMesPlantaoCard(dataISO),
                ano: data.getFullYear(),
                plantao,
                temPlantao: Boolean(plantao),
                isPast: dataISO < hojeISO,
                isToday: dataISO === hojeISO,
                isActive: dataFoco === dataISO,
                tipoLabel: 'Sabado'
            });
        }

        return sabados;
    }

    function renderSabadosPlantaoHistorico(items) {
        return items.map((sabado) => `
            <button
                type="button"
                class="sabado-card ${sabado.temPlantao ? 'lancado' : ''} ${sabado.isPast ? 'passado' : ''} ${sabado.isToday ? 'hoje' : ''} ${sabado.isActive ? 'is-active' : ''}"
                data-plantao-sabado="${sabado.dataISO}"
                onclick="abrirPlantaoPorData('${sabado.dataISO}')"
                title="${escapeHtml(sabado.formatada)}${sabado.temPlantao ? ' - Plantao ja lancado' : ''}"
            >
                <div class="sabado-card-badges">
                    ${sabado.temPlantao ? '<span class="badge-plantao">Lancado</span>' : ''}
                    ${sabado.isPast ? '<span class="badge-historico">Historico</span>' : ''}
                </div>
                <div class="sabado-dia">${escapeHtml(sabado.dia)}</div>
                <div class="sabado-mes">${escapeHtml(sabado.mes)}</div>
                <div class="sabado-ano">${escapeHtml(String(sabado.ano))}</div>
                <div class="sabado-tipo">${escapeHtml(sabado.tipoLabel || 'Sabado')}</div>
                <div class="sabado-status">${sabado.temPlantao ? 'Clique para editar' : 'Clique para lancar'}</div>
            </button>
        `).join('');
    }

    function atualizarSabadoSelecionadoPlantao(dataISO) {
        document.querySelectorAll('[data-plantao-sabado]').forEach((element) => {
            element.classList.toggle('is-active', element.getAttribute('data-plantao-sabado') === dataISO);
        });
    }

    async function openPlantaoEditorFromGrid(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized || typeof window.abrirEditorPlantao !== 'function') {
            return;
        }

        await window.abrirEditorPlantao(normalized, formatarDataPlantaoCard(normalized));
    }

    function resolvePlantaoWeekdayEscala(dataISO) {
        const normalized = obterDataISO(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function isPlantaoSabadoEscala(dataISO) {
        return Boolean(obterDataISO(dataISO)) && resolvePlantaoWeekdayEscala(dataISO) === 6;
    }

    window.abrirPlantaoPorData = abrirPlantaoPorData = function abrirPlantaoPorDataAtualizado(dataISO) {
        return openPlantaoEditorFromGrid(dataISO);
    };

    function atualizarResumoPlantaoNaTela() {
        const container = document.getElementById('listaPlantoesLancados');

        if (!container || typeof renderPlantoesLancados !== 'function') {
            return;
        }

        container.innerHTML = renderPlantoesLancados();
    }

    window.renderPlantoesLancados = renderPlantoesLancados = function renderPlantoesLancadosAvancado() {
            if (!window.plantoesLancados || window.plantoesLancados.length === 0) {
                return '<div class="empty-state">Nenhum plantao lancado ainda</div>';
            }

            const ordenados = [...window.plantoesLancados]
                .filter((plantao) => plantao.tipoPlantao === 'sabado' || isPlantaoSabadoEscala(plantao.dataISO))
                .sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));

            if (ordenados.length === 0) {
                return '<div class="empty-state">Nenhum plantao de sabado lancado ainda</div>';
            }

            return ordenados.map((plantao) => `
                <div class="plantao-card">
                    <div class="plantao-header">
                        <div>
                            <div class="plantao-data">${escapeHtml(formatarDataPtBr(plantao.dataISO))}</div>
                            <div class="plantao-meta">
                                <span><i class="fas fa-calendar-week"></i> ${escapeHtml((plantao.tipoPlantao || 'sabado').charAt(0).toUpperCase() + (plantao.tipoPlantao || 'sabado').slice(1))}</span>
                                <span><i class="fas fa-clock"></i> ${escapeHtml(formatarHoraInput(plantao.horaInicio) || '--:--')} - ${escapeHtml(formatarHoraInput(plantao.horaFim) || '--:--')}</span>
                                <span><i class="fas fa-wallet"></i> ${escapeHtml(plantao.duracaoFormatada || (plantao.horaInicio && plantao.horaFim ? minutosParaTexto((((Number(plantao.horaFim.slice(0, 2)) * 60) + Number(plantao.horaFim.slice(3, 5))) - ((Number(plantao.horaInicio.slice(0, 2)) * 60) + Number(plantao.horaInicio.slice(3, 5))))) : 'Horario pendente'))}</span>
                            </div>
                        </div>
                        <div class="plantao-actions">
                            <button onclick="editarPlantao('${plantao.dataISO}')" class="btn-icon-sm edit" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="excluirPlantao('${plantao.dataISO}')" class="btn-icon-sm delete" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${plantao.observacao ? `<p class="plantao-observacao">${escapeHtml(plantao.observacao)}</p>` : ''}
                    <div class="plantao-colaboradores">
                        ${renderColaboradoresPlantao(plantao.colaboradores)}
                    </div>
                </div>
            `).join('');
        };

    window.carregarPlantoesLancadosNaTela = carregarPlantoesLancadosNaTela = function carregarPlantoesLancadosNaTelaAtualizado() {
        atualizarResumoPlantaoNaTela();
    };

    window.renderLancamentoPlantao = renderLancamentoPlantao = async function renderLancamentoPlantaoAtualizado() {
        const appContent = document.getElementById('appContent');

        if (!appContent) {
            return;
        }

        await Promise.allSettled([
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarAusencias === 'function' ? carregarAusencias() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([]),
            typeof carregarBancoHorasResumo === 'function' ? carregarBancoHorasResumo() : Promise.resolve(null)
        ]);

        window.plantoesLancados = (window.plantoesLancados || []).filter((plantao) => isPlantaoSabadoEscala(plantao.dataISO));

        const dataFoco = obterDataISO(window.__plantaoDataFocoISO || getPlantaoEditorState()?.dataISO || '');
        definirAncoraSabadoPlantao(dataFoco || obterAncoraSabadoPlantao());

        const sabados = construirSabadosVisiveisPlantao();
        const primeiraData = sabados[0]?.formatada || '--';
        const ultimaData = sabados[sabados.length - 1]?.formatada || '--';

        appContent.innerHTML = `
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-calendar-plus"></i> Plantoes de sabado</h1>
                    <p>Consulte os plantões de sabado, abra um registro existente para editar e mantenha o mesmo lancamento atualizado.</p>
                </div>
            </div>

            <div class="plantao-layout">
                <div class="sabados-container">
                    <div class="sabados-header">
                        <div>
                            <h3><i class="fas fa-calendar-day"></i> Sabados disponiveis</h3>
                            <p class="sabados-subtitle">Janela atual: ${escapeHtml(primeiraData)} ate ${escapeHtml(ultimaData)}</p>
                        </div>
                        <div class="sabados-nav">
                            <button type="button" class="btn-secondary" id="plantaoAnteriorBtn">
                                <i class="fas fa-arrow-left"></i> Anteriores
                            </button>
                            <button type="button" class="btn-secondary" id="plantaoHojeBtn">
                                <i class="fas fa-bullseye"></i> Atual
                            </button>
                            <button type="button" class="btn-secondary" id="plantaoProximoBtn">
                                Proximos <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>

                    <div class="sabados-grid" id="listaSabados">
                        ${renderSabadosPlantaoHistorico(sabados)}
                    </div>
                </div>

                <div id="plantaoEditor" class="editor-sidebar" style="display: none;">
                    <div class="editor-content">
                        <div class="editor-header">
                            <h3><i class="fas fa-clock"></i> <span id="plantaoDataTitle">Selecione um sabado</span></h3>
                            <button onclick="fecharPlantaoEditor()" class="btn-close-editor">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="plantaoEditorContent" class="editor-form">
                            <div class="editor-empty">
                                <i class="fas fa-hand-pointer"></i>
                                <p>Escolha um sabado para abrir o plantao, revisar a equipe e salvar sem duplicar o lancamento.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="plantoes-lancados-container">
                <div class="plantoes-lancados-header">
                    <div>
                        <h3><i class="fas fa-list"></i> Plantoes lancados</h3>
                        <p class="sabados-subtitle">Edite sabados anteriores diretamente por esta lista quando preferir.</p>
                    </div>
                </div>
                <div id="listaPlantoesLancados" class="plantoes-grid">
                    ${renderPlantoesLancados()}
                </div>
            </div>
        `;

        document.getElementById('plantaoAnteriorBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO * -1);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoHojeBtn')?.addEventListener('click', () => {
            definirAncoraSabadoPlantao(new Date());
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('plantaoProximoBtn')?.addEventListener('click', () => {
            mudarPaginaSabadosPlantao(PLANTAO_SABADOS_PASSO);
            window.__plantaoDataFocoISO = null;
            renderLancamentoPlantao();
        });

        document.getElementById('listaSabados')?.addEventListener('click', async (event) => {
            const trigger = event.target.closest('[data-plantao-sabado]');

            if (!trigger) {
                return;
            }

            const dataISO = trigger.getAttribute('data-plantao-sabado');
            await openPlantaoEditorFromGrid(dataISO);
        });

        if (dataFoco) {
            await openPlantaoEditorFromGrid(dataFoco);
        } else {
            const editorPanel = document.getElementById('plantaoEditor');

            setPlantaoEditorState(null);

            if (editorPanel) {
                editorPanel.style.display = 'none';
            }
        }
    };

    window.abrirEditorPlantao = abrirEditorPlantao = async function abrirEditorPlantaoAvancado(dataISO, dataFormatada) {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorTitle = document.getElementById('plantaoDataTitle');
        const editorContent = document.getElementById('plantaoEditorContent');

        if (!editorPanel || !editorTitle || !editorContent) {
            window.__plantaoDataFocoISO = dataISO;

            if (typeof renderLancamentoPlantao === 'function') {
                await renderLancamentoPlantao();
            }

            return;
        }

        window.__plantaoDataFocoISO = dataISO;
        definirAncoraSabadoPlantao(dataISO);
        atualizarSabadoSelecionadoPlantao(dataISO);

        const existente = (window.plantoesLancados || []).find((item) => item.dataISO === dataISO);

        if (!isPlantaoSabadoEscala(dataISO)) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Plantao agora e lancado somente aos sabados.', 'warning');
            }
            return;
        }

        const state = setPlantaoEditorState({
            dataISO,
            dataFormatada,
            tipoPlantao: 'sabado',
            horaInicio: existente?.horaInicio ? formatarHoraInput(existente.horaInicio) : '',
            horaFim: existente?.horaFim ? formatarHoraInput(existente.horaFim) : '',
            observacao: existente?.observacao || '',
            selecionados: Array.isArray(existente?.colaboradores) ? [...existente.colaboradores] : [],
            disponibilidade: []
        });

        renderPlantaoEditor(state);
        await carregarDisponibilidadePlantao(state);
        renderPlantaoEditor(state);
        atualizarSabadoSelecionadoPlantao(dataISO);
    };

    window.fecharPlantaoEditor = fecharPlantaoEditor = function fecharPlantaoEditorAtualizado() {
        const editorPanel = document.getElementById('plantaoEditor');
        const editorContent = document.getElementById('plantaoEditorContent');

        window.__plantaoDataFocoISO = null;
        setPlantaoEditorState(null);
        atualizarSabadoSelecionadoPlantao(null);

        if (editorContent) {
            editorContent.innerHTML = `
                <div class="editor-empty">
                    <i class="fas fa-hand-pointer"></i>
                    <p>Escolha um sabado para abrir o plantao, revisar a equipe e salvar sem duplicar o lancamento.</p>
                </div>
            `;
        }

        if (editorPanel) {
            editorPanel.style.display = 'none';
        }
    };

    window.salvarPlantao = salvarPlantao = async function salvarPlantaoAvancado(dataISO) {
        const tipoPlantao = 'sabado';
        const horaInicio = document.getElementById('plantaoHoraInicio')?.value;
        const horaFim = document.getElementById('plantaoHoraFim')?.value;
        const observacao = document.getElementById('plantaoObservacao')?.value || '';
        const selecionados = Array.from(document.querySelectorAll('#checklistColaboradores input:checked'))
            .map((checkbox) => Number(checkbox.value));

        if (!horaInicio || !horaFim) {
            mostrarToast('Informe a hora inicial e final do plantao.', 'error');
            return;
        }

        if (horaFim <= horaInicio) {
            mostrarToast('A hora final precisa ser maior que a hora inicial.', 'error');
            return;
        }

        if (selecionados.length === 0) {
            mostrarToast('Selecione pelo menos um colaborador disponivel.', 'error');
            return;
        }

        if (!isPlantaoSabadoEscala(dataISO)) {
            mostrarToast('Plantao agora e lancado somente aos sabados.', 'warning');
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.salvarPlantao({
                dataISO,
                tipoPlantao,
                horaInicio,
                horaFim,
                observacao,
                colaboradores: selecionados
            });

            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao salvo com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao salvar plantao: ${error.message}`, 'error');
        }
    };

    window.excluirPlantao = excluirPlantao = async function excluirPlantaoAvancado(dataISO) {
        if (!window.confirm('Tem certeza que deseja excluir este plantao?')) {
            return;
        }

        try {
            window.__plantaoDataFocoISO = dataISO;
            await window.API.excluirPlantao(dataISO);
            await atualizarTudo({ silent: true, source: 'plantao' });

            mostrarToast('Plantao excluido com sucesso!', 'success');
        } catch (error) {
            mostrarToast(`Erro ao excluir plantao: ${error.message}`, 'error');
        }
    };

    if (typeof editarLancamento === 'function') {
        const originalEditarLancamento = editarLancamento;

        window.editarLancamento = editarLancamento = function editarLancamentoComBancoHoras(tipo, id) {
            originalEditarLancamento(tipo, id);

            if (tipo === 'feriado') {
                aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
                return;
            }

            const item = (window.ausencias || []).find((ausencia) => Number(ausencia.id || ausencia.Id) === Number(id));

            if (!item) {
                return;
            }

            preencherBancoHorasLancamento(item);
        };
    }

    if (typeof cancelarEdicaoLancamento === 'function') {
        const originalCancelarEdicaoLancamento = cancelarEdicaoLancamento;

        window.cancelarEdicaoLancamento = cancelarEdicaoLancamento = function cancelarEdicaoLancamentoComBancoHoras() {
            originalCancelarEdicaoLancamento();
            resetBancoHorasLancamento();
        };
    }

    window.salvarAusencia = salvarAusencia = async function salvarAusenciaComBancoHoras(tipo, dataInicio, dataFim) {
        const colaboradorId = document.getElementById('colaboradorSelect')?.value;
        const periodoTipo = document.getElementById('periodoTipo')?.value || 'dia_inteiro';
        const horaInicio = document.getElementById('horaInicio')?.value || '';
        const horaFim = document.getElementById('horaFim')?.value || '';
        const subtipo = document.getElementById('ausenciaSubtipo')?.value || 'comum';
        const descontaBancoHoras = document.getElementById('descontaBancoHoras')?.checked ?? true;
        const observacao = document.getElementById('observacaoLancamento')?.value || '';

        if (!colaboradorId) {
            throw new Error('Selecione um colaborador.');
        }

        if (periodoTipo === 'horas') {
            if (!horaInicio || !horaFim) {
                throw new Error('Preencha as horas de inicio e fim.');
            }

            if (horaFim <= horaInicio) {
                throw new Error('Hora final deve ser maior que a hora inicial.');
            }
        }

        const dados = {
            id: editandoTipoLancamento === 'pessoal' ? editandoLancamentoId : undefined,
            colaboradorId: Number(colaboradorId),
            tipo,
            dataInicio,
            dataFim,
            periodoTipo,
            subtipo,
            descontaBancoHoras,
            observacao
        };

        if (periodoTipo === 'horas') {
            dados.horaInicio = horaInicio;
            dados.horaFim = horaFim;
        }

        return window.API.salvarAusencia(dados);
    };

    document.addEventListener('click', (event) => {
        if (event.target.closest('#fecharModalBancoHorasBtn')) {
            fecharModalSeguro('modalBancoHoras');
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target.id === 'tipoLancamento') {
            aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
        }

        if (event.target.id === 'ausenciaSubtipo') {
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }

        if (event.target.id === 'descontaBancoHoras') {
            event.target.dataset.manualOverride = 'true';
            aplicarDefaultsBancoHorasLancamento({ resetManual: false });
        }
    });

    const atualizarTudoBase = window.atualizarTudo;

    window.atualizarTudo = atualizarTudo = async function atualizarTudoComBancoHoras(options = {}) {
        if (typeof atualizarTudoBase === 'function') {
            await atualizarTudoBase({ ...options, silent: true });
        }

        await Promise.allSettled([
            carregarBancoHorasResumo()
        ]);

        if (document.getElementById('listaColaboradores') && typeof renderListaColaboradores === 'function') {
            const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
            const lista = termoBusca
                ? (window.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
                : (window.colaboradores || []);

            renderListaColaboradores(lista);
        }

        if (document.getElementById('listaPlantoesLancados') && typeof carregarPlantoesLancadosNaTela === 'function') {
            carregarPlantoesLancadosNaTela();
        }

        if (!options.silent && typeof mostrarToast === 'function') {
            mostrarToast('Dados atualizados!', 'success');
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        carregarBancoHorasResumo()
            .then(() => {
                if (isColaboradoresScreenVisible() && typeof renderListaColaboradores === 'function') {
                    renderListaColaboradores();
                }
            })
            .catch(() => {});
    });

    setTimeout(() => {
        aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
    }, 0);
})();

(function () {
    if (window.__escalaDiaUiFixLoaded) {
        return;
    }

    window.__escalaDiaUiFixLoaded = true;

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

        if (window.__escalaEditorColaboradorId) {
            abrirEditorNaEscala(window.__escalaEditorColaboradorId);
        }
    }

    function refreshColaboradoresViewEscala() {
        if (!isColaboradoresScreenVisible() || typeof renderListaColaboradores !== 'function') {
            return;
        }

        const termoBusca = document.getElementById('searchColaborador')?.value?.trim()?.toLowerCase() || '';
        const lista = termoBusca
            ? (window.colaboradores || []).filter((item) => item.Nome?.toLowerCase().includes(termoBusca))
            : (window.colaboradores || []);

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
        if (typeof toggleEscalaReportModeFilters === 'function') {
            toggleEscalaReportModeFilters();
        }

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

        if (!snapshot.reportVisible || typeof renderRelatorios !== 'function') {
            return;
        }

        await renderRelatorios();
        restoreRelatoriosStateEscala(snapshot);

        const reportKey = window.normalizeRuntimeToken(snapshot.reportTitle);

        if (reportKey.includes('plantao') && typeof gerarRelatorioPlantoes === 'function') {
            await gerarRelatorioPlantoes();
            return;
        }

        if (reportKey.includes('escala') && typeof gerarRelatorioEscala === 'function') {
            await gerarRelatorioEscala();
            return;
        }

        if ((reportKey.includes('mensal') || reportKey.includes('completo')) && typeof gerarRelatorioCompleto === 'function') {
            await gerarRelatorioCompleto();
        }
    }

    window.__refreshVisibleViews = async function refreshVisibleViewsEscala(options = {}) {
        if (document.getElementById('calendar') && typeof gerarCalendario === 'function') {
            const mes = window.mesAtual ?? new Date().getMonth();
            const ano = window.anoAtual ?? new Date().getFullYear();
            gerarCalendario(mes, ano);
        }

        if (typeof gerarLegendaMensal === 'function') {
            gerarLegendaMensal();
        }

        const currentPage = getCurrentPageKeyEscala();

        if (currentPage === 'dashboard' && typeof renderDashboard === 'function') {
            await renderDashboard();
            return;
        }

        if (currentPage === 'escala') {
            await refreshEscalaViewEscala();
            return;
        }

        if (currentPage === 'lancamentoPlantao' && typeof renderLancamentoPlantao === 'function') {
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
    };

    window.editarPlantao = editarPlantao = function editarPlantaoSeguroEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (typeof window.abrirEditorPlantao === 'function') {
            window.abrirEditorPlantao(normalized, formatDatePtBrEscala(normalized));
        }
    };

    function buildPlantaoColaboradorOptions(selectedId = '') {
        return `
            <option value="">Todos os colaboradores</option>
            ${(window.colaboradores || []).map((item) => `
                <option value="${item.Id}" ${String(selectedId) === String(item.Id) ? 'selected' : ''}>
                    ${escapeHtmlEscala(item.Nome)}
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
        let totalMinutes = 0;
        let totalCreditMinutes = 0;

        items.forEach((plantao) => {
            const colaboradoresCount = Array.isArray(plantao.colaboradores) ? plantao.colaboradores.length : 0;
            const durationMinutes = getPlantaoDurationMinutesReport(plantao);

            (plantao.colaboradores || []).forEach((id) => uniqueCollaborators.add(Number(id)));
            totalMinutes += durationMinutes;
            totalCreditMinutes += durationMinutes * Math.max(colaboradoresCount, 0);
        });

        return {
            totalPlantoes: items.length,
            totalColaboradores: uniqueCollaborators.size,
            horasProgramadas: formatDurationEscala(totalMinutes || 0),
            horasCreditadas: formatDurationEscala(totalCreditMinutes || 0)
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
        if (typeof carregarColaboradores === 'function') {
            await carregarColaboradores();
        }

        const payload = await window.API.getPlantoes({
            from: filters.dataInicio,
            to: filters.dataFim
        });

        return (Array.isArray(payload) ? payload : [])
            .map((item) => ({
                ...item,
                dataISO: toISODateEscala(item.dataISO || item.data_plantao),
                tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
                colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
                horaInicio: item.horaInicio || item.hora_inicio || null,
                horaFim: item.horaFim || item.hora_fim || null,
                observacao: item.observacao || null,
                duracaoMinutos: Number(item.duracaoMinutos || 0) || null,
                duracaoFormatada: item.duracaoFormatada || null
            }))
            .filter((plantao) => {
                if (plantao.tipoPlantao !== 'sabado' && !isPlantaoSabadoEscala(plantao.dataISO)) {
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
                        color: #0f766e;
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
                            <p>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio))} ate ${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim))}</p>
                        </div>
                        <p>Gerado em ${escapeHtmlEscala(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    ${renderRelatorioPlantoes(items, filters)}
                </section>
            </body>
            </html>
        `;
    }

    window.gerarRelatorioPlantoes = gerarRelatorioPlantoes = async function gerarRelatorioPlantoesAtualizado() {
        const filters = getPlantaoReportFiltersFromUI();

        if (!filters.dataInicio || !filters.dataFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
            }
            return;
        }

        try {
            const items = await buildPlantaoReportItems(filters);

            document.getElementById('relatorioTitulo').innerText = `Relatorio de Plantoes de Sabado - ${formatDatePtBrEscala(filters.dataInicio)} ate ${formatDatePtBrEscala(filters.dataFim)}`;
            document.getElementById('relatorioConteudo').innerHTML = renderRelatorioPlantoes(items, filters);
            document.getElementById('relatorioVisualizacao').style.display = 'block';
        } catch (error) {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao gerar relatorio de plantoes: ${error.message}`, 'error');
            }
        }
    };

    window.exportarRelatorioPlantoes = exportarRelatorioPlantoes = async function exportarRelatorioPlantoesAtualizado() {
        const filters = getPlantaoReportFiltersFromUI();

        if (!filters.dataInicio || !filters.dataFim) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe a data inicial e final do relatorio de plantoes.', 'error');
            }
            return;
        }

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
                mostrarToast('Gerando PDF de plantoes...', 'warning');
            }

            const items = await buildPlantaoReportItems(filters);
            const html = gerarHtmlPdfRelatorioPlantoes(items, filters);

            releaseViewportLock = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;
            container = window.criarContainerTemporarioRelatorioPdf(html, { width: 1480 });
            await window.aguardarLayoutRelatorioPdf();

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: 1600,
                minHeight: 1000,
                scale: 1.65,
                maxCanvasSide: 12000,
                maxCanvasPixels: 22000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: 6,
                minScaleMmPerPixel: 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: 1,
                maxSourcePageHeight: 1300
            });
            const salvarPdf = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (pdfDoc, nomeArquivo) => pdfDoc.save(nomeArquivo);
            salvarPdf(pdf, `Relatorio_Plantoes_${filters.dataInicio}_${filters.dataFim}.pdf`);

            if (typeof mostrarToast === 'function') {
                mostrarToast('PDF de plantoes gerado com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao exportar relatorio de plantoes:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao exportar relatorio de plantoes: ${error.message}`, 'error');
            }
        } finally {
            releaseViewportLock?.();
            container?.remove();
        }
    };

    window.renderRelatorioPlantoes = renderRelatorioPlantoes = function renderRelatorioPlantoesSeguro(items, filters = {}) {
        if (!items.length) {
            return '<div class="empty-state">Nenhum plantao encontrado no periodo</div>';
        }

        const summary = buildPlantaoReportSummary(items);

        return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Periodo: <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataInicio || items[items.length - 1]?.dataISO))}</strong>
                    ate
                    <strong>${escapeHtmlEscala(formatDatePtBrEscala(filters.dataFim || items[0]?.dataISO))}</strong>
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
                            <strong>${escapeHtmlEscala(summary.horasProgramadas)}</strong>
                            <span>Horas programadas</span>
                        </div>
                    </div>
                    <div class="resumo-card-estatistica">
                        <i class="fas fa-wallet"></i>
                        <div>
                            <strong>${escapeHtmlEscala(summary.horasCreditadas)}</strong>
                            <span>Credito total da equipe</span>
                        </div>
                    </div>
                </div>
                <table class="relatorio-tabela">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Horario</th>
                            <th>Status</th>
                            <th>Colaboradores</th>
                            <th>Observacao</th>
                            <th>Credito</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...items].sort((first, second) => String(second.dataISO).localeCompare(String(first.dataISO))).map((plantao) => {
                            const colaboradores = (plantao.colaboradores || []).map((id) => {
                                const colaborador = (window.colaboradores || []).find((item) => Number(item.Id) === Number(id));
                                return colaborador?.Nome || 'Desconhecido';
                            });
                            const statusLabel = colaboradores.length > 0 ? 'Equipe definida' : 'Sem equipe';
                            const statusClass = colaboradores.length > 0 ? 'badge-folga' : 'badge-ausencia';

                            return `
                                <tr>
                                    <td><strong>${escapeHtmlEscala(formatDatePtBrEscala(plantao.dataISO))}</strong></td>
                                    <td>${escapeHtmlEscala((plantao.tipoPlantao || 'sabado').charAt(0).toUpperCase() + (plantao.tipoPlantao || 'sabado').slice(1))}</td>
                                    <td>${escapeHtmlEscala(formatTimeRangeEscala(plantao.horaInicio, plantao.horaFim))}</td>
                                    <td><span class="evento-tipo ${statusClass}">${escapeHtmlEscala(statusLabel)}</span></td>
                                    <td>${escapeHtmlEscala(colaboradores.join(', ') || '--')}</td>
                                    <td>${escapeHtmlEscala(plantao.observacao || '--')}</td>
                                    <td>${escapeHtmlEscala(plantao.duracaoFormatada || getPlantaoDurationLabelReport(plantao))}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    window.renderRelatorios = renderRelatorios = async function renderRelatoriosAtualizados() {
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
            typeof carregarColaboradores === 'function' ? carregarColaboradores() : Promise.resolve([]),
            typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
            typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([])
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
                                        ${typeof gerarOptionsMeses === 'function' ? gerarOptionsMeses(currentMonth) : ''}
                                    </select>
                                    <input type="number" id="relatorioAnoCompleto" class="form-control" value="${currentYear}" min="2020" max="2035">
                                </div>
                            </div>
                        </div>
                        <div class="relatorio-actions">
                            <button onclick="gerarRelatorioCompleto()" class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioCompleto()" class="btn-secondary">
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
                                        <input type="date" id="relatorioEscalaDataInicio" class="form-control" value="${escapeHtmlEscala(monthBounds.start)}">
                                        <span>ate</span>
                                        <input type="date" id="relatorioEscalaDataFim" class="form-control" value="${escapeHtmlEscala(monthBounds.end)}">
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
                            <button onclick="gerarRelatorioEscala()" class="btn-primary">
                                <i class="fas fa-search"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioEscala()" class="btn-secondary">
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
                            <button onclick="gerarRelatorioPlantoes()" class="btn-primary">
                                <i class="fas fa-file-alt"></i> Visualizar
                            </button>
                            <button onclick="exportarRelatorioPlantoes()" class="btn-secondary">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="relatorioVisualizacao" class="relatorio-visualizacao" style="display: none;">
                <div class="relatorio-visualizacao-header">
                    <h3><i class="fas fa-file-alt"></i> <span id="relatorioTitulo"></span></h3>
                    <button onclick="fecharRelatorio()" class="btn-secondary">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
                <div id="relatorioConteudo" class="relatorio-conteudo"></div>
            </div>
        `;

        document.getElementById('relatorioEscalaModo')?.addEventListener('change', toggleEscalaReportModeFilters);
        toggleEscalaReportModeFilters();
        ativarAbasRelatorios();
    };

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
})();

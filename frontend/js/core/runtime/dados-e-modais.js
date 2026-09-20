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

    // Esta e a UNICA mapAusencia em uso (chamada em carregarAusencias, abaixo)
    // e portanto o que window.ausencias contem. Subtipo e DescontaBancoHoras
    // faltavam aqui: o backend os manda, mas eles morriam nesta funcao. O
    // efeito era duplo — o card do lancamento nao tinha o que exibir, e ao
    // editar uma ausencia medica sem desconto o formulario reabria com o
    // padrao ("Comum", desconto marcado) e o Atualizar gravava esse padrao em
    // cima do que estava salvo, mexendo no saldo do banco de horas.
    function mapAusencia(item) {
        const tipo = window.normalizeRuntimeAusenciaTipo(item.Tipo || item.tipo);
        const periodoTipo = window.normalizeRuntimePeriodoTipo(item.PeriodoTipo || item.periodoTipo || 'dia_inteiro');
        const subtipo = item.Subtipo || item.subtipo || null;

        // Tres estados distintos: true, false e null (coluna ausente no schema
        // ou registro antigo). Boolean() achataria null para false e faria um
        // lancamento antigo parecer "nao desconta".
        const descontaBruto = item.DescontaBancoHoras ?? item.descontaBancoHoras;
        const descontaBancoHoras = descontaBruto === null || descontaBruto === undefined
            ? null
            : Boolean(descontaBruto);

        const observacao = item.Observacao || item.observacao || null;

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
            Subtipo: subtipo,
            DescontaBancoHoras: descontaBancoHoras,
            Observacao: observacao,
            id: item.Id,
            colaboradorId: item.ColaboradorId,
            tipo,
            dataInicio: item.DataInicio,
            dataFim: item.DataFim,
            periodoTipo,
            horaInicio: item.HoraInicio,
            horaFim: item.HoraFim,
            subtipo,
            descontaBancoHoras,
            observacao
        };
    }

    function mapPlantao(item) {
        const dataISO = obterDataISO(item.dataISO || item.data_plantao);

        return {
            ...item,
            dataISO,
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            // Registro antigo (antes da coluna tipo_credito) sempre creditava.
            tipoCredito: String(item.tipoCredito || item.tipo_credito || '').toLowerCase() === 'extra' ? 'extra' : 'banco',
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

    // Tipos de escala: o molde do padrao semanal. Banco ainda sem a migration
    // devolve 409/404 — nesse caso a lista fica vazia e o select de tipo
    // simplesmente nao aparece no editor, em vez de derrubar a tela.
    window.carregarTiposEscala = function carregarTiposEscalaComCache() {
        return withInFlight('tiposEscala', async () => {
            let lista = [];

            try {
                const data = await window.API.getTiposEscala();
                lista = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            } catch (error) {
                lista = [];
            }

            window.tiposEscala = lista;
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

        // Clique duplo em "Sim, excluir" mandava dois DELETE: o segundo voltava
        // 404 e a tela mostrava erro e sucesso ao mesmo tempo.
        if (window.__exclusaoEmAndamento) {
            return;
        }

        window.__exclusaoEmAndamento = true;

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
            window.__exclusaoEmAndamento = false;
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



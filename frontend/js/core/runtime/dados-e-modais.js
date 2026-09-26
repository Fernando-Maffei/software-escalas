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
        exclusaoPendenteId = null;
        exclusaoTipo = 'ausencia';
    }

    // Falha ao carregar uma lista NAO pode virar lista vazia em silencio: a
    // tela mostraria "nenhum colaborador/ausencia" como se fosse verdade. O
    // usuario e avisado (uma vez a cada 30s por recurso, para nao inundar de
    // avisos com o servidor fora) e a tela segue com os ultimos dados que
    // chegaram. 401 fica de fora: a sessao expirada ja leva para o login.
    const INTERVALO_AVISO_FALHA_MS = 30 * 1000;
    const ultimoAvisoFalha = new Map();

    function falhaAoCarregar(recurso, erro, ultimosDados) {
        console.error(`[dados] falha ao carregar ${recurso}:`, erro);

        const anterior = Array.isArray(ultimosDados) ? ultimosDados : [];

        if (erro?.status === 401) {
            return anterior;
        }

        const agora = Date.now();

        if (agora - (ultimoAvisoFalha.get(recurso) || 0) >= INTERVALO_AVISO_FALHA_MS) {
            ultimoAvisoFalha.set(recurso, agora);

            if (typeof mostrarToast === 'function') {
                mostrarToast(
                    anterior.length
                        ? `Nao foi possivel atualizar ${recurso}. Mostrando os ultimos dados carregados.`
                        : `Nao foi possivel carregar ${recurso}. Tente novamente.`,
                    'error'
                );
            }
        }

        return anterior;
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

    // Embrulha o carregador publicado por telas/lancamentos.js (que carrega
    // antes deste arquivo e tambem mantem o diretorio com os desligados).
    if (typeof window.carregarColaboradores === 'function') {
        const originalCarregarColaboradores = window.carregarColaboradores;

        window.carregarColaboradores = function carregarColaboradoresComCache() {
            return withInFlight('colaboradores', async () => {
                let lista;

                try {
                    const data = await originalCarregarColaboradores();
                    lista = Array.isArray(data) ? data : [];
                } catch (error) {
                    lista = falhaAoCarregar('os colaboradores', error, window.colaboradores);
                }

                colaboradores = lista;
                window.colaboradores = lista;
                return lista;
            });
        };
    }

    window.carregarSetores = function carregarSetoresComCache() {
        return withInFlight('setores', async () => {
            let lista;

            try {
                const data = await window.API.getSetores();
                lista = Array.isArray(data) ? data : [];
            } catch (error) {
                lista = falhaAoCarregar('os setores', error, window.setores);
            }

            setores = lista;
            window.setores = lista;
            return lista;
        });
    };

    // Tipos de escala: o molde do padrao semanal. Sem tipos cadastrados a lista
    // fica vazia e o select de tipo simplesmente nao aparece no editor.
    window.carregarTiposEscala = function carregarTiposEscalaComCache() {
        return withInFlight('tiposEscala', async () => {
            let lista;

            try {
                const data = await window.API.getTiposEscala();
                lista = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            } catch (error) {
                lista = falhaAoCarregar('os tipos de escala', error, window.tiposEscala);
            }

            window.tiposEscala = lista;
            return lista;
        });
    };

    window.carregarAusencias = function carregarAusenciasComCache() {
        return withInFlight('ausencias', async () => {
            let lista;

            try {
                const data = await window.API.getAusencias();
                lista = Array.isArray(data) ? data.map(mapAusencia) : [];
            } catch (error) {
                lista = falhaAoCarregar('as ausencias', error, window.ausencias);
            }

            ausencias = lista;
            window.ausencias = lista;
            return lista;
        });
    };

    function lerFeriadosSalvos() {
        try {
            const salvos = JSON.parse(localStorage.getItem('feriadosLocais') || '[]');
            return Array.isArray(salvos) ? salvos : [];
        } catch (erro) {
            // Conteudo corrompido no localStorage: e so um cache, descarta.
            return [];
        }
    }

    window.carregarFeriadosLocais = function carregarFeriadosLocaisComCache() {
        return withInFlight('feriadosLocais', async () => {
            let lista;

            try {
                const data = await window.API.getFeriados();
                lista = Array.isArray(data) ? data : [];
                localStorage.setItem('feriadosLocais', JSON.stringify(lista));
            } catch (error) {
                // Sem servidor, a ultima lista salva neste navegador ainda vale.
                lista = falhaAoCarregar('os feriados', error, lerFeriadosSalvos());
            }

            feriadosLocais = lista;
            window.feriadosLocais = lista;
            return lista;
        });
    };

    window.carregarPlantoes = carregarPlantoes = function carregarPlantoesComCache() {
        return withInFlight('plantoes', async () => {
            let lista;

            try {
                const data = await window.API.getPlantoes();
                lista = Array.isArray(data) ? data.map(mapPlantao) : [];
            } catch (error) {
                lista = falhaAoCarregar('os plantoes', error, window.plantoesLancados);
            }

            plantoesLancados = lista;
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



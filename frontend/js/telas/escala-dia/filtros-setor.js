    // Selecao de setores agora e MULTIPLA: um conjunto de ids. Conjunto vazio =
    // "Todos" (sem filtro). O gestor liga o(s) setor(es) dele e a escala + o %
    // de cobertura passam a considerar so esses.
    function getScaleSectorSelectionEscala() {
        if (!(window.__escalaSectorSelection instanceof Set)) {
            window.__escalaSectorSelection = new Set();

            // Semente com a preferencia "Meus setores" da conta: ao abrir a
            // escala, ela ja vem filtrada pelos setores que o gestor escolheu.
            // So para contas SEM teto de setor — quem tem restricao ve apenas o
            // permitido (imposto no backend) e nao usa o filtro self-service.
            const restrito = typeof window.temRestricaoDeSetor === 'function' && window.temRestricaoDeSetor();

            if (!restrito && typeof window.getMeusSetores === 'function') {
                window.getMeusSetores().forEach((id) => window.__escalaSectorSelection.add(String(id)));
            }
        }
        return window.__escalaSectorSelection;
    }

    function toggleScaleSectorEscala(id) {
        const selecao = getScaleSectorSelectionEscala();

        if (id === 'all' || !id) {
            selecao.clear(); // "Todos" = nenhum filtro
            return selecao;
        }

        const chave = String(id);

        if (selecao.has(chave)) {
            selecao.delete(chave);
        } else {
            selecao.add(chave);
        }

        return selecao;
    }

    function buildScaleSectorFiltersEscala(items = []) {
        const dynamicMap = new Map();

        (window.setores || []).forEach((setor) => {
            dynamicMap.set(String(setor.id), {
                id: String(setor.id),
                nome: setor.nome
            });
        });

        (items || []).forEach((item) => {
            if (item.setorId && item.setorNome && !dynamicMap.has(String(item.setorId))) {
                dynamicMap.set(String(item.setorId), {
                    id: String(item.setorId),
                    nome: item.setorNome
                });
            }
        });

        return [
            { id: 'all', nome: 'Todos' },
            ...Array.from(dynamicMap.values()).sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || '')))
        ];
    }

    function filterScaleItemsBySectorEscala(items = []) {
        const selecao = getScaleSectorSelectionEscala();

        if (selecao.size === 0) {
            return [...items]; // Todos
        }

        return (items || []).filter((item) => selecao.has(String(item.setorId || '')));
    }

    function renderScaleSectorTabsEscala(items = []) {
        const container = document.getElementById('escalaSectorTabs');

        if (!container) {
            return;
        }

        // Conta com teto de setor (definido na config de Usuarios): o que ela ve
        // ja e so o permitido (imposto no backend). Nao faz sentido oferecer
        // abas de setor aqui — some com elas e nao aplica filtro extra.
        if (typeof window.temRestricaoDeSetor === 'function' && window.temRestricaoDeSetor()) {
            getScaleSectorSelectionEscala().clear();
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = '';

        const filters = buildScaleSectorFiltersEscala(items);
        const selecao = getScaleSectorSelectionEscala();

        // A selecao de setor NAO e mais podada aqui.
        //
        // Antes, todo setor ausente do dia atual saia da selecao. Isso fazia o
        // filtro sumir sozinho ao navegar: com "N1" ativo, bastava passar por
        // um dia sem ninguem do N1 para o filtro ser descartado em silencio e
        // nao voltar ao retornar para o dia anterior.
        //
        // O medo original — filtro "fantasma" escondendo todo mundo — e
        // tratado onde de fato importa: quando o filtro zera as linhas, a
        // timeline mostra um estado vazio dizendo que o filtro esta ativo, com
        // um botao para limpa-lo (ver renderScaleRowsEscala).
        //
        // As abas saem de window.setores (todos os cadastrados), nao dos itens
        // do dia, entao um setor selecionado continua visivel para ser
        // desmarcado mesmo sem ninguem escalado nele hoje. Um setor EXCLUIDO do
        // sistema perderia a aba, mas ai o estado vazio com "Limpar filtro"
        // resolve — nao ha como ficar preso.

        container.innerHTML = filters.map((setor) => {
            const ehTodos = setor.id === 'all';
            const ativo = ehTodos ? selecao.size === 0 : selecao.has(String(setor.id));
            return `
            <button
                type="button"
                class="escala-sector-tab ${ativo ? 'is-active' : ''}"
                data-escala-setor="${escapeHtmlEscala(String(setor.id))}"
                aria-pressed="${ativo ? 'true' : 'false'}"
            >
                ${escapeHtmlEscala(setor.nome)}
            </button>`;
        }).join('');

        container.querySelectorAll('[data-escala-setor]').forEach((button) => {
            button.addEventListener('click', () => {
                const selecaoAtual = toggleScaleSectorEscala(button.getAttribute('data-escala-setor'));

                // As abas da escala sao o editor de "Meus setores": o que o
                // gestor liga/desliga aqui vira a preferencia salva da conta e
                // passa a valer tambem no Dashboard e no Plantao.
                if (typeof window.salvarMeusSetores === 'function') {
                    window.salvarMeusSetores([...selecaoAtual]);
                }

                renderScaleSectorTabsEscala(getCurrentScaleState().items || []);
                renderScaleRowsEscala(getCurrentScaleState());
            });
        });
    }


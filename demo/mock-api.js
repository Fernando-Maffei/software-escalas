/* Modo demonstracao: responde as chamadas de API sem backend nem banco.
 *
 * A intercepcao e feita no fetch, e nao trocando os metodos de js/core/api.js.
 * Assim o app roda EXATAMENTE como em producao — mesma tela, mesmo fluxo,
 * mesmas rotas — e so a resposta da rede e que vem de dados ficticios. Se a
 * API mudar, aqui muda junto ou aparece no console, em vez de a demo silenciar.
 *
 * Precisa ser carregado ANTES de js/core/api.js.
 */
(function () {
    'use strict';

    const D = window.DemoDados;
    const fetchOriginal = window.fetch.bind(window);

    function json(dados, status) {
        return Promise.resolve(new Response(JSON.stringify(dados), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        }));
    }

    function isoLocal(data) {
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    function hojeISO() {
        return isoLocal(new Date());
    }

    function parametro(url, nome) {
        return new URL(url, location.origin).searchParams.get(nome);
    }

    // Grade vazia no formato de GET /api/banco-horas-semanal: as ultimas
    // semanas (segunda-feira, mais antiga primeiro) sem nenhuma celula lancada.
    function gradeBancoHorasSemanal() {
        const hoje = new Date();
        const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7));
        const semanas = [];

        for (let i = 3; i >= 0; i -= 1) {
            const data = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() - 7 * i);
            const iso = isoLocal(data);
            semanas.push({
                semanaSegunda: iso,
                label: iso.split('-').reverse().join('/'),
                totalMinutos: 0,
                totalFormatado: '0:00',
                observacao: null,
                celulas: {}
            });
        }

        return {
            periodo: { inicio: semanas[0].semanaSegunda, fim: semanas[semanas.length - 1].semanaSegunda },
            colaboradores: D.COLABORADORES.map((c) => ({ id: c.id, nome: c.nome, setorId: c.setorId })),
            semanas
        };
    }

    // Rotas de leitura que a demo cobre. Escrita e tratada mais abaixo:
    // responde sucesso sem persistir, para os botoes nao darem erro.
    const ROTAS = [
        [/\/api\/setup\/status$/, () => json({ pendente: false, configurado: true })],

        [/\/api\/auth\/me$/, () => json({
            user: {
                id: 1,
                username: 'demonstracao',
                isAdmin: true,
                deveTrocarSenha: false,
                setoresVisiveis: [],
                setoresPermitidos: []
            }
        })],

        [/\/api\/health$/, () => json({ status: 'ok', database: 'demo' })],
        [/\/api\/network\/status$/, () => json({ online: true, hosts: [] })],

        [/\/api\/setores/, () => json(D.SETORES)],

        // Aceita tambem ?incluirInativos=1, que a modal de lancamentos usa para
        // montar o diretorio de nomes (inclusive de quem foi desligado).
        // Mesmo formato da API real: `SELECT c.*, s.Nome AS SetorNome`, entao
        // as chaves vem com a caixa das colunas (Id, Nome, SetorId...).
        [/\/api\/colaboradores(\?.*)?$/, () => json(D.COLABORADORES.map((c) => ({
            Id: c.id,
            Nome: c.nome,
            SetorId: c.setorId,
            SetorNome: (D.SETORES.find((s) => s.id === c.setorId) || {}).nome || null,
            TrabalhoInicio: `${c.inicio}:00`,
            TrabalhoFim: `${c.fim}:00`,
            AlmocoInicio: `${c.almoco}:00`,
            AlmocoFim: null,
            Ativo: true,
            DataDesligamento: null
        })))],

        [/\/api\/escala\/dia\/(\d{4}-\d{2}-\d{2})/, (m) => json({
            dataISO: m[1],
            items: D.escalaDoDia(m[1])
        })],

        // A demo nao tem backend para calcular os nacionais: devolve vazio e o
        // api.js cai na BrasilAPI. Precisa vir antes da rota generica abaixo.
        [/\/api\/feriados\/nacionais/, () => json([])],
        [/\/api\/feriados/, () => json(D.FERIADOS)],
        [/\/api\/ausencias/, () => json([])],
        [/\/api\/plantoes\/disponibilidade/, () => json({ disponiveis: D.COLABORADORES.map((c) => c.id) })],
        [/\/api\/plantoes/, () => json([])],
        [/\/api\/jornada-semanal/, () => json([])],
        [/\/api\/tipos-escala/, () => json({ total: D.TIPOS_ESCALA.length, items: D.TIPOS_ESCALA })],
        // A grade semanal e suas sub-rotas vem ANTES de /api/banco-horas e esta
        // e ancorada: sem isso o prefixo capturava /api/banco-horas-semanal e a
        // tela recebia { itens, resumo } no lugar de { periodo, colaboradores, semanas }.
        [/\/api\/banco-horas-semanal\/verificar/, (m, url) => json({
            data: parametro(url, 'data') || hojeISO(),
            itens: [],
            avisos: []
        })],
        [/\/api\/banco-horas-semanal\/saldos/, (m, url) => json({
            data: parametro(url, 'data') || hojeISO(),
            saldos: []
        })],
        [/\/api\/banco-horas-semanal\/horas-extras/, (m, url) => json({
            disponivel: true,
            inicio: parametro(url, 'inicio') || `${hojeISO().slice(0, 7)}-01`,
            fim: parametro(url, 'fim') || hojeISO(),
            itens: [],
            totalMinutos: 0,
            totalFormatado: '0:00',
            totalColaboradores: 0,
            totalDias: 0,
            avisos: []
        })],
        [/\/api\/banco-horas-semanal(\?.*)?$/, () => json(gradeBancoHorasSemanal())],
        [/\/api\/banco-horas(\/|\?|$)/, () => json({ itens: [], resumo: {} })],
        [/\/api\/usuarios/, () => json([])],

        // O relatorio alimenta a faixa da semana; devolve os 7 dias montados
        // a partir dos mesmos dados da escala diaria.
        [/\/api\/escala\/relatorio/, (m, url) => {
            const inicio = new URL(url, location.origin).searchParams.get('dataInicio');
            const dias = [];

            if (inicio) {
                const [a, mes, d] = inicio.split('-').map(Number);
                for (let i = 0; i < 7; i += 1) {
                    const data = new Date(a, mes - 1, d + i);
                    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
                    dias.push({ dataISO: iso, items: D.escalaDoDia(iso) });
                }
            }

            return json({ dias });
        }]
    ];

    window.fetch = function (entrada, opcoes) {
        const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';

        if (!url.includes('/api/')) {
            return fetchOriginal(entrada, opcoes);
        }

        const metodo = ((opcoes && opcoes.method) || 'GET').toUpperCase();

        if (metodo !== 'GET') {
            // Demo e somente leitura: aceita a acao para a interface seguir seu
            // fluxo normal, mas nada e gravado (a proxima leitura devolve o
            // dado original). O aviso no topo da tela explica isso ao visitante.
            return json({ success: true, demo: true });
        }

        for (const [padrao, resposta] of ROTAS) {
            const achou = url.match(padrao);
            if (achou) {
                return resposta(achou, url);
            }
        }

        console.warn('[demo] rota sem mock:', url);
        return json({ items: [], data: [] });
    };
})();

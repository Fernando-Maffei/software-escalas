/* Modo demonstracao: responde as chamadas de API sem backend nem banco.
 *
 * A intercepcao e feita no fetch, e nao trocando os metodos de Js/api.js.
 * Assim o app roda EXATAMENTE como em producao — mesma tela, mesmo fluxo,
 * mesmas rotas — e so a resposta da rede e que vem de dados ficticios. Se a
 * API mudar, aqui muda junto ou aparece no console, em vez de a demo silenciar.
 *
 * Precisa ser carregado ANTES de Js/api.js.
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

        [/\/api\/colaboradores$/, () => json(D.COLABORADORES.map((c) => ({
            id: c.id,
            nome: c.nome,
            setorId: c.setorId,
            setorNome: (D.SETORES.find((s) => s.id === c.setorId) || {}).nome,
            trabalhoInicio: `${c.inicio}:00`,
            trabalhoFim: `${c.fim}:00`,
            almocoInicio: `${c.almoco}:00`,
            almocoFim: null,
            ativo: true
        })))],

        [/\/api\/escala\/dia\/(\d{4}-\d{2}-\d{2})/, (m) => json({
            dataISO: m[1],
            items: D.escalaDoDia(m[1])
        })],

        [/\/api\/feriados/, () => json(D.FERIADOS)],
        [/\/api\/ausencias/, () => json([])],
        [/\/api\/plantoes\/disponibilidade/, () => json({ disponiveis: D.COLABORADORES.map((c) => c.id) })],
        [/\/api\/plantoes/, () => json([])],
        [/\/api\/jornada-semanal/, () => json([])],
        [/\/api\/banco-horas/, () => json({ itens: [], resumo: {} })],
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

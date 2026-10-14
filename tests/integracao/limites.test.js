const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const { criarColaborador } = require('./fabrica');

async function linhasDeEscalaEm(ano) {
    const [linha] = await consultar(`
        SELECT COUNT(*) AS total
        FROM escala_dia
        WHERE data >= '${ano}-01-01' AND data <= '${ano}-12-31'
    `);
    return linha.total;
}

module.exports = [
    {
        // O relatorio MATERIALIZA a escala do periodo (uma linha por colaborador
        // por dia) e qualquer conta chama a rota. Sem teto, 2020 a 2030
        // digitado por engano gerava centenas de milhares de linhas.
        name: 'relatorio de escala recusa periodo acima de 366 dias sem gerar nada',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const antes = await linhasDeEscalaEm(2041);
            const recusado = await cliente.get('/api/escala/relatorio?dataInicio=2041-01-01&dataFim=2042-01-02');

            assert.equal(recusado.status, 400);
            assert.match(recusado.body.error, /366 dias/);
            assert.equal(await linhasDeEscalaEm(2041), antes);

            esperarSucesso(
                await cliente.get('/api/escala/relatorio?dataInicio=2041-01-01&dataFim=2042-01-01'),
                'periodo no limite'
            );
        }
    },
    {
        // O limite de tentativas era conferido antes do scrypt e a falha so era
        // contada depois: requisicoes em paralelo passavam todas pelo portao.
        name: 'limite de login vale para tentativas simultaneas',
        async run() {
            const usuario = nomeUnico('forca-bruta').replace(/\s+/g, '-');
            const tentativas = await Promise.all(
                Array.from({ length: 12 }, () =>
                    criarCliente().post('/api/auth/login', {
                        username: usuario,
                        password: 'senha-errada-123'
                    })
                )
            );
            const status = tentativas.map((resposta) => resposta.status);

            assert.equal(status.filter((codigo) => codigo === 401).length, 5, `status: ${status.join(',')}`);
            assert.equal(status.filter((codigo) => codigo === 429).length, 7, `status: ${status.join(',')}`);

            // A chave e IP + usuario: o bloqueio nao vaza para outra conta.
            await criarCliente().entrar();
        }
    },
    {
        // T8: a leitura gerava a escala do dia e deixava as linhas gravadas
        // (inclusive pela conta de visualizacao). Agora responde igual e nao
        // grava nada.
        name: 'ler a escala do dia responde com a escala gerada e nao grava linha',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const colaborador = await criarColaborador(cliente);
            const dia = '2045-05-02';

            const resposta = esperarSucesso(await cliente.get(`/api/escala/dia/${dia}`), 'escala do dia');
            const dele = resposta.items.find((item) => item.colaboradorId === colaborador.Id);

            assert.equal(dele?.horaInicio, '08:00:00');
            assert.equal(dele?.tipo, 'normal');

            const [linhas] = await consultar(`SELECT COUNT(*) AS total FROM escala_dia WHERE data = '${dia}'`);
            assert.equal(linhas.total, 0);

            // A escrita continua materializando o dia.
            esperarSucesso(
                await cliente.post('/api/escala/rebuild', {
                    dataInicio: dia,
                    dataFim: dia,
                    colaboradorId: colaborador.Id
                }),
                'reconstruir'
            );
            const [depois] = await consultar(
                `SELECT COUNT(*) AS total FROM escala_dia WHERE data = '${dia}' AND colaborador_id = ${Number(colaborador.Id)}`
            );
            assert.equal(depois.total, 1);
        }
    }
];

const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso } = require('./apoio');
const { DATAS, criarColaborador, lancarAusencia, lancarPlantao } = require('./fabrica');

async function movimentos(colaboradorId) {
    return consultar(`
        SELECT OrigemTipo, Minutos
        FROM BancoHorasMovimentos
        WHERE ColaboradorId = ${colaboradorId}
        ORDER BY Id
    `);
}

module.exports = [
    {
        name: 'ausencia de dia inteiro com desconto debita a jornada no banco de horas',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            // Terca-feira no passado: dia util ja vencido.
            const ausencia = await lancarAusencia(cliente, colaborador.Id, {
                dataInicio: '2026-09-01',
                dataFim: '2026-09-01'
            });

            // 08-17 com 1h de almoco = 8h = 480 min.
            assert.deepEqual(await movimentos(colaborador.Id), [{ OrigemTipo: 'ausencia', Minutos: -480 }]);

            esperarSucesso(await cliente.delete(`/api/ausencias/${ausencia.Id}`), 'excluir ausencia');
            assert.deepEqual(await movimentos(colaborador.Id), []);
        }
    },
    {
        // Regra de negocio: o debito so acontece quando o dia chega.
        name: 'ausencia futura ainda nao debita o banco de horas',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            await lancarAusencia(cliente, colaborador.Id, { dataInicio: DATAS.terca, dataFim: DATAS.terca });

            assert.deepEqual(await movimentos(colaborador.Id), []);
        }
    },
    {
        name: 'plantao em banco credita horas; hora extra nao credita; excluir o dia remove tudo',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const banco = await criarColaborador(cliente);
            const extra = await criarColaborador(cliente);

            const dia = await lancarPlantao(cliente, '2027-02-06', [
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [banco.Id], tipoCredito: 'banco' },
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [extra.Id], tipoCredito: 'extra' }
            ]);

            assert.equal(dia.tipoPlantao, 'sabado');
            assert.equal(dia.lancamentos.length, 2);
            assert.deepEqual(await movimentos(banco.Id), [{ OrigemTipo: 'plantao', Minutos: 240 }]);
            assert.deepEqual(await movimentos(extra.Id), []);

            const lido = esperarSucesso(await cliente.get('/api/plantoes/2027-02-06'), 'ler plantao');
            assert.deepEqual(lido.lancamentos.map((item) => item.tipoCredito).sort(), ['banco', 'extra']);

            esperarSucesso(await cliente.delete('/api/plantoes/2027-02-06'), 'excluir plantao');
            assert.deepEqual(await movimentos(banco.Id), []);
            assert.equal((await cliente.get('/api/plantoes/2027-02-06')).status, 404);
        }
    },
    {
        name: 'plantao recusa colaborador ausente no dia',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            await lancarAusencia(cliente, colaborador.Id, { dataInicio: DATAS.sabado, dataFim: DATAS.sabado });

            const resposta = await cliente.post('/api/plantoes', {
                dataISO: DATAS.sabado,
                lancamentos: [{ horaInicio: '08:00', horaFim: '12:00', colaboradores: [colaborador.Id] }]
            });

            assert.equal(resposta.status, 400);
            assert.match(resposta.body.error, /indisponiveis/);
        }
    },
    {
        name: 'escala do dia e gerada a partir do cadastro',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const escala = esperarSucesso(await cliente.get(`/api/escala/dia/${DATAS.segunda}`), 'escala do dia');
            const linhas = Array.isArray(escala)
                ? escala
                : escala.items || escala.colaboradores || escala.registros || [];
            const minha = linhas.find(
                (linha) => Number(linha.colaboradorId ?? linha.colaborador_id ?? linha.ColaboradorId) === colaborador.Id
            );

            assert.ok(
                minha,
                `colaborador ${colaborador.Id} nao apareceu na escala: ${JSON.stringify(escala).slice(0, 300)}`
            );
        }
    },
    {
        // A13 da auditoria: horario lido do banco chega como Date e o calculo
        // do debito recusava; lancar ausencia por horas no passado dava 400.
        name: 'ausencia por horas no passado e lancada e debita so as horas',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            await lancarAusencia(cliente, colaborador.Id, {
                periodoTipo: 'horas',
                dataInicio: '2026-08-31',
                dataFim: '2026-08-31',
                horaInicio: '08:00',
                horaFim: '10:30'
            });

            assert.deepEqual(await movimentos(colaborador.Id), [{ OrigemTipo: 'ausencia', Minutos: -150 }]);
        }
    }
];

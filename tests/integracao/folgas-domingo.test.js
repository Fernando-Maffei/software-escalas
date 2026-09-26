const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso } = require('./apoio');
const { DATAS, criarColaborador, registrarFolgaDomingo } = require('./fabrica');

async function escalaDoColaborador(colaboradorId) {
    return consultar(`
        SELECT CONVERT(CHAR(10), data, 23) AS data, tipo, origem_tipo
        FROM escala_dia
        WHERE colaborador_id = ${colaboradorId} AND origem_tipo = 'folga_domingo'
        ORDER BY data
    `);
}

module.exports = [
    {
        // A4b da auditoria: os horarios iam como texto para sql.Time e o driver
        // recusava ("Invalid time") — toda folga COM reposicao dava 500.
        name: 'folga de domingo com reposicao e almoco e registrada e gera a escala dos dois dias',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const folga = await registrarFolgaDomingo(cliente, colaborador.Id, {
                reposicaoAlmocoInicio: '12:00',
                reposicaoAlmocoFim: '13:00'
            });

            assert.equal(folga.dataDomingo, DATAS.domingo);
            assert.equal(folga.dataReposicao, DATAS.quinta);
            assert.equal(folga.reposicaoHoraInicio, '08:00:00');
            assert.equal(folga.reposicaoAlmocoFim, '13:00:00');

            const escala = await escalaDoColaborador(colaborador.Id);
            assert.deepEqual(
                escala.map((linha) => linha.data),
                [DATAS.domingo, DATAS.quinta]
            );
        }
    },
    {
        // A4c da auditoria: updateFolgaDomingo nao era exportada, entao editar
        // qualquer folga dava "updateFolgaDomingo is not a function".
        name: 'folga de domingo pode ser editada e a escala acompanha a nova data de reposicao',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const folga = await registrarFolgaDomingo(cliente, colaborador.Id);

            const editada = esperarSucesso(
                await cliente.put(`/api/folgas-domingo/${folga.id}`, { dataReposicao: '2027-01-08' }),
                'editar folga'
            );
            assert.equal(editada.data.dataReposicao, '2027-01-08');

            const escala = await escalaDoColaborador(colaborador.Id);
            assert.deepEqual(
                escala.map((linha) => linha.data),
                [DATAS.domingo, '2027-01-08']
            );
        }
    },
    {
        name: 'excluir a folga de domingo limpa a escala que ela gerou',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const folga = await registrarFolgaDomingo(cliente, colaborador.Id);

            esperarSucesso(await cliente.delete(`/api/folgas-domingo/${folga.id}`), 'excluir folga');

            assert.deepEqual(await escalaDoColaborador(colaborador.Id), []);
            assert.equal((await cliente.get(`/api/folgas-domingo/${folga.id}`)).status, 404);
        }
    },
    {
        name: 'folga de domingo recusa data que nao e domingo',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const resposta = await cliente.post('/api/folgas-domingo', {
                colaboradorId: colaborador.Id,
                dataDomingo: DATAS.segunda
            });

            assert.equal(resposta.status, 400);
        }
    }
];

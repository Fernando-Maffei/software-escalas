const assert = require('node:assert/strict');

const { criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const { criarColaborador, criarSetor, lancarAusencia, lancarPlantao, registrarFolgaDomingo } = require('./fabrica');

// Conta comum que so enxerga um setor, com dados de dois setores no banco.
async function montarCenario() {
    const admin = criarCliente();
    await admin.entrar();

    const setorVisivel = await criarSetor(admin);
    const setorOculto = await criarSetor(admin);
    const visivel = await criarColaborador(admin, { setorId: setorVisivel.Id });
    const oculto = await criarColaborador(admin, { setorId: setorOculto.Id });

    await lancarAusencia(admin, visivel.Id, { dataInicio: '2027-04-06', dataFim: '2027-04-06' });
    await lancarAusencia(admin, oculto.Id, { dataInicio: '2027-04-06', dataFim: '2027-04-06' });
    await lancarPlantao(admin, '2027-04-10', [
        { horaInicio: '08:00', horaFim: '12:00', colaboradores: [visivel.Id] },
        { horaInicio: '13:00', horaFim: '17:00', colaboradores: [oculto.Id] }
    ]);
    await lancarPlantao(admin, '2027-04-17', [{ horaInicio: '08:00', horaFim: '12:00', colaboradores: [oculto.Id] }]);
    await registrarFolgaDomingo(admin, visivel.Id, { dataDomingo: '2027-04-11', dataReposicao: null });
    await registrarFolgaDomingo(admin, oculto.Id, { dataDomingo: '2027-04-11', dataReposicao: null });

    const username = nomeUnico('setorial').replace(/\s+/g, '-');
    const senha = 'Setorial!Teste1';
    const criado = esperarSucesso(await admin.post('/api/usuarios', { username, senha }), 'criar usuario');
    esperarSucesso(
        await admin.put(`/api/usuarios/${criado.usuario.id}`, { setoresPermitidos: [setorVisivel.Id] }),
        'limitar setores'
    );

    const leitor = criarCliente();
    await leitor.entrar(username, senha);

    return { leitor, visivel, oculto };
}

module.exports = [
    {
        // M7 da auditoria: o teto de setores valia so em GET /colaboradores; as
        // demais leituras devolviam dados de todos os setores.
        name: 'conta limitada a um setor nao le dados de colaborador de outro setor',
        async run() {
            const { leitor, visivel, oculto } = await montarCenario();
            const ids = (lista, campo) => new Set(lista.map((item) => Number(item[campo])));

            const ausencias = esperarSucesso(await leitor.get('/api/ausencias?data=2027-04-06'), 'ausencias');
            assert.ok(ids(ausencias, 'ColaboradorId').has(visivel.Id));
            assert.equal(ids(ausencias, 'ColaboradorId').has(oculto.Id), false);
            assert.equal((await leitor.get(`/api/ausencias/colaborador/${oculto.Id}`)).status, 404);

            const dia = esperarSucesso(await leitor.get('/api/plantoes/2027-04-10'), 'plantao do dia');
            assert.deepEqual(
                dia.lancamentos.flatMap((item) => item.colaboradores),
                [visivel.Id]
            );
            assert.equal((await leitor.get('/api/plantoes/2027-04-17')).status, 404);

            const lista = esperarSucesso(await leitor.get('/api/plantoes?from=2027-04-01&to=2027-04-30'), 'plantoes');
            assert.equal(
                lista.some((item) => item.colaboradores.includes(oculto.Id)),
                false
            );

            const disponibilidade = esperarSucesso(
                await leitor.get('/api/plantoes/disponibilidade/2027-04-24'),
                'disp'
            );
            assert.equal(
                disponibilidade.colaboradores.some((item) => item.id === oculto.Id),
                false
            );

            const resumo = esperarSucesso(await leitor.get('/api/banco-horas/resumo'), 'resumo');
            assert.equal(ids(resumo.items, 'colaboradorId').has(oculto.Id), false);
            assert.equal((await leitor.get(`/api/banco-horas/colaborador/${oculto.Id}`)).status, 404);

            assert.equal((await leitor.get(`/api/colaboradores/${oculto.Id}/jornada-semanal`)).status, 404);
            assert.equal((await leitor.get(`/api/jornada-semanal?colaboradorId=${oculto.Id}`)).status, 404);

            const folgas = esperarSucesso(
                await leitor.get('/api/folgas-domingo?dataInicio=2027-04-11&dataFim=2027-04-11'),
                'folgas'
            );
            assert.deepEqual([...ids(folgas.items, 'colaboradorId')], [visivel.Id]);
        }
    }
];

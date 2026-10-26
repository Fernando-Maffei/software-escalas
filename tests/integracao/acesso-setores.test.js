const assert = require('node:assert/strict');

const { criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const { criarColaborador, criarSetor, lancarAusencia, lancarPlantao, registrarFolgaDomingo } = require('./fabrica');

// Conta que so enxerga um setor, com dados de dois setores no banco. Comum
// (so leitura) por padrao; `isAdmin` para testar gravacoes.
async function montarCenario({ isAdmin = false } = {}) {
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
    const criado = esperarSucesso(await admin.post('/api/usuarios', { username, senha, isAdmin }), 'criar usuario');
    esperarSucesso(
        await admin.put(`/api/usuarios/${criado.usuario.id}`, { setoresPermitidos: [setorVisivel.Id] }),
        'limitar setores'
    );

    const leitor = criarCliente();
    await leitor.entrar(username, senha);

    // Admin criado por outra pessoa nasce com senha provisoria (API bloqueada).
    if (isAdmin) {
        esperarSucesso(
            await leitor.post('/api/auth/trocar-senha', { senhaAtual: senha, novaSenha: senha }),
            'trocar senha provisoria'
        );
    }

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
    },
    {
        // A tela de lancamentos do mes e geral: pede ?escopo=lancamentos e ve e
        // lanca para todos os setores. O parametro nao abre as outras leituras.
        name: 'tela de lancamentos ve e lanca para colaborador de outro setor',
        async run() {
            const { leitor, visivel, oculto } = await montarCenario({ isAdmin: true });
            const ids = (lista, campo) => new Set(lista.map((item) => Number(item[campo])));

            const limitada = esperarSucesso(await leitor.get('/api/colaboradores'), 'colaboradores');
            assert.equal(ids(limitada, 'Id').has(oculto.Id), false);

            const geral = esperarSucesso(
                await leitor.get('/api/colaboradores?escopo=lancamentos'),
                'colaboradores geral'
            );
            assert.ok(ids(geral, 'Id').has(visivel.Id));
            assert.ok(ids(geral, 'Id').has(oculto.Id));
            const doOculto = geral.find((item) => Number(item.Id) === oculto.Id);
            assert.equal(doOculto.Nome, oculto.Nome);
            assert.equal('TrabalhoInicio' in doOculto, false, 'escopo geral nao traz o horario do cadastro');

            const diretorio = esperarSucesso(
                await leitor.get('/api/colaboradores?escopo=lancamentos&incluirInativos=1'),
                'diretorio geral'
            );
            assert.ok(ids(diretorio, 'Id').has(oculto.Id));

            const ausenciasGerais = esperarSucesso(
                await leitor.get('/api/ausencias?data=2027-04-06&escopo=lancamentos'),
                'ausencias geral'
            );
            assert.ok(ids(ausenciasGerais, 'ColaboradorId').has(visivel.Id));
            assert.ok(ids(ausenciasGerais, 'ColaboradorId').has(oculto.Id));

            const lancada = esperarSucesso(
                await leitor.post('/api/ausencias', {
                    colaboradorId: oculto.Id,
                    tipo: 'folga',
                    dataInicio: '2027-04-08',
                    dataFim: '2027-04-08',
                    periodoTipo: 'dia_inteiro'
                }),
                'lancar para outro setor'
            ).data;
            esperarSucesso(
                await leitor.put(`/api/ausencias/${lancada.Id}`, {
                    colaboradorId: oculto.Id,
                    tipo: 'folga',
                    dataInicio: '2027-04-09',
                    dataFim: '2027-04-09',
                    periodoTipo: 'dia_inteiro'
                }),
                'editar lancamento de outro setor'
            );
            esperarSucesso(await leitor.delete(`/api/ausencias/${lancada.Id}`), 'excluir lancamento de outro setor');

            // Sem o escopo, e nas telas que seguem limitadas, nada muda.
            const ausencias = esperarSucesso(await leitor.get('/api/ausencias?data=2027-04-06'), 'ausencias');
            assert.equal(ids(ausencias, 'ColaboradorId').has(oculto.Id), false);
            assert.equal((await leitor.get(`/api/colaboradores/${oculto.Id}?escopo=lancamentos`)).status, 404);
            assert.equal((await leitor.get(`/api/ausencias/colaborador/${oculto.Id}?escopo=lancamentos`)).status, 404);
            const resumo = esperarSucesso(await leitor.get('/api/banco-horas/resumo?escopo=lancamentos'), 'resumo');
            assert.equal(ids(resumo.items, 'colaboradorId').has(oculto.Id), false);
            const plantoes = esperarSucesso(
                await leitor.get('/api/plantoes?from=2027-04-01&to=2027-04-30&escopo=lancamentos'),
                'plantoes'
            );
            assert.equal(
                plantoes.some((item) => item.colaboradores.includes(oculto.Id)),
                false
            );
        }
    },
    {
        // O POST reescreve o dia inteiro e o DELETE apaga o dia inteiro. A
        // conta com teto so ve (e manda) a parte dela da equipe: sem preservar
        // o resto, salvar ou excluir o dia apagava o turno do outro setor.
        name: 'conta limitada a um setor salva e exclui o plantao sem apagar o turno de outro setor',
        async run() {
            const { leitor, visivel, oculto } = await montarCenario({ isAdmin: true });
            const admin = criarCliente();
            await admin.entrar();
            const turnosDoDia = async () =>
                esperarSucesso(await admin.get('/api/plantoes/2027-04-10'), 'dia (admin)')
                    .lancamentos.map((item) => [item.horaInicio, item.horaFim, item.colaboradores])
                    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

            const salvo = esperarSucesso(
                await leitor.post('/api/plantoes', {
                    dataISO: '2027-04-10',
                    lancamentos: [{ colaboradorId: visivel.Id, horaInicio: '09:00', horaFim: '12:00' }]
                }),
                'salvar como conta limitada'
            );
            assert.deepEqual(
                salvo.data.lancamentos.flatMap((item) => item.colaboradores),
                [visivel.Id],
                'a resposta nao revela quem a conta nao ve'
            );
            assert.deepEqual(await turnosDoDia(), [
                ['09:00:00', '12:00:00', [visivel.Id]],
                ['13:00:00', '17:00:00', [oculto.Id]]
            ]);

            esperarSucesso(await leitor.delete('/api/plantoes/2027-04-10'), 'excluir como conta limitada');
            assert.deepEqual(await turnosDoDia(), [['13:00:00', '17:00:00', [oculto.Id]]]);
            assert.equal((await leitor.get('/api/plantoes/2027-04-10')).status, 404);

            // Dia so com gente de outro setor: para a conta, nao ha o que excluir.
            assert.equal((await leitor.delete('/api/plantoes/2027-04-17')).status, 404);
            assert.equal(esperarSucesso(await admin.get('/api/plantoes/2027-04-17'), 'dia 17').lancamentos.length, 1);
        }
    }
];

const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso } = require('./apoio');
const {
    DATAS,
    criarColaborador,
    criarSetor,
    criarTipoEscala,
    desligarColaborador,
    lancarAusencia,
    lancarPlantao,
    lancarSaldoSemanal,
    registrarFolgaDomingo
} = require('./fabrica');

// Tabelas que apontam para Colaboradores (por FK ou pelo JSON de plantoes).
async function contarVinculos(colaboradorId) {
    const [linha] = await consultar(`
        SELECT
            (SELECT COUNT(*) FROM Colaboradores WHERE Id = ${colaboradorId}) AS colaborador,
            (SELECT COUNT(*) FROM Ausencias WHERE ColaboradorId = ${colaboradorId}) AS ausencias,
            (SELECT COUNT(*) FROM BancoHorasMovimentos WHERE ColaboradorId = ${colaboradorId}) AS movimentos,
            (SELECT COUNT(*) FROM BancoHorasSemanal WHERE ColaboradorId = ${colaboradorId}) AS semanal,
            (SELECT COUNT(*) FROM escala_dia WHERE colaborador_id = ${colaboradorId}) AS escala,
            (SELECT COUNT(*) FROM ColaboradorJornadaSemanal WHERE ColaboradorId = ${colaboradorId}) AS jornada,
            (SELECT COUNT(*) FROM FolgasDomingo WHERE ColaboradorId = ${colaboradorId}) AS folgas,
            (SELECT COUNT(*) FROM FolgasDomingo WHERE CobertoPorColaboradorId = ${colaboradorId}) AS coberturas
    `);
    return linha;
}

async function colaboradorComHistoricoCompleto(cliente) {
    const colaborador = await criarColaborador(cliente, {
        jornadaSemanal: [1, 2, 3, 4, 5].map((diaSemana) => ({
            diaSemana,
            trabalhoInicio: '08:00',
            trabalhoFim: '17:00',
            almocoInicio: '12:00',
            almocoFim: '13:00'
        }))
    });

    await lancarAusencia(cliente, colaborador.Id);
    await lancarPlantao(cliente, DATAS.sabado, [
        { horaInicio: '08:00', horaFim: '12:00', colaboradores: [colaborador.Id], tipoCredito: 'banco' }
    ]);
    await registrarFolgaDomingo(cliente, colaborador.Id);
    await lancarSaldoSemanal(cliente, colaborador.Id);

    return colaborador;
}

module.exports = [
    {
        name: 'colaborador e criado, lido, alterado e listado com setor e tipo de escala',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const setor = await criarSetor(cliente);
            const tipo = await criarTipoEscala(cliente);
            const criado = await criarColaborador(cliente, { setorId: setor.Id, tipoEscalaId: tipo.id });

            const lido = esperarSucesso(await cliente.get(`/api/colaboradores/${criado.Id}`), 'ler colaborador');
            assert.equal(lido.SetorNome, setor.Nome);
            assert.equal(lido.TipoEscalaId, tipo.id);

            const alterado = esperarSucesso(
                await cliente.put(`/api/colaboradores/${criado.Id}`, { nome: `${criado.Nome} (editado)` }),
                'alterar colaborador'
            );
            assert.equal(alterado.data.Nome, `${criado.Nome} (editado)`);
            // Campos nao enviados continuam como estavam.
            assert.equal(alterado.data.SetorId, setor.Id);

            const lista = esperarSucesso(
                await cliente.get(`/api/colaboradores?setorId=${setor.Id}`),
                'listar por setor'
            );
            assert.deepEqual(
                lista.map((item) => item.Id),
                [criado.Id]
            );
        }
    },
    {
        name: 'colaborador desligado some da lista padrao e volta com incluirInativos',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            await desligarColaborador(cliente, colaborador.Id);

            const ativos = esperarSucesso(await cliente.get('/api/colaboradores'), 'listar ativos');
            const todos = esperarSucesso(await cliente.get('/api/colaboradores?incluirInativos=1'), 'listar todos');

            assert.equal(
                ativos.some((item) => item.Id === colaborador.Id),
                false
            );
            assert.equal(
                todos.some((item) => item.Id === colaborador.Id),
                true
            );
        }
    },
    {
        name: 'exclusao definitiva exige desligamento antes',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const resposta = await cliente.delete(`/api/colaboradores/${colaborador.Id}`);

            assert.equal(resposta.status, 400);
            assert.equal((await contarVinculos(colaborador.Id)).colaborador, 1);
        }
    },
    {
        // C1 da auditoria: a cascata ignorava BancoHorasSemanal e FolgasDomingo
        // e rodava fora de transacao, entao a FK estourava no fim DEPOIS de ja
        // ter apagado ausencias, movimentos, escala e jornada.
        name: 'exclusao definitiva remove o colaborador e todo o historico, inclusive banco semanal e folgas',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await colaboradorComHistoricoCompleto(cliente);
            const antes = await contarVinculos(colaborador.Id);
            assert.ok(antes.semanal > 0 && antes.folgas > 0 && antes.ausencias > 0 && antes.movimentos > 0);

            await desligarColaborador(cliente, colaborador.Id);
            esperarSucesso(await cliente.delete(`/api/colaboradores/${colaborador.Id}`), 'excluir definitivamente');

            const depois = await contarVinculos(colaborador.Id);
            assert.deepEqual(depois, {
                colaborador: 0,
                ausencias: 0,
                movimentos: 0,
                semanal: 0,
                escala: 0,
                jornada: 0,
                folgas: 0,
                coberturas: 0
            });

            const plantoes = await consultar(
                `SELECT colaboradores_ids FROM plantoes WHERE data_plantao = '${DATAS.sabado}'`
            );
            plantoes.forEach((linha) => {
                assert.equal(JSON.parse(linha.colaboradores_ids).includes(colaborador.Id), false);
            });
        }
    },
    {
        // Se qualquer passo da cascata falhar, nada pode ter sido apagado.
        name: 'exclusao definitiva que falha no meio nao apaga nada (transacao)',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await colaboradorComHistoricoCompleto(cliente);
            await desligarColaborador(cliente, colaborador.Id);

            // Uma FK que a rota nao conhece faz o DELETE final falhar de proposito.
            await consultar(`
                CREATE TABLE dbo.TesteVinculoIntegracao (
                    ColaboradorId INT NOT NULL REFERENCES dbo.Colaboradores(Id)
                );
                INSERT INTO dbo.TesteVinculoIntegracao (ColaboradorId) VALUES (${colaborador.Id});
            `);

            try {
                const antes = await contarVinculos(colaborador.Id);
                const resposta = await cliente.delete(`/api/colaboradores/${colaborador.Id}`);

                assert.ok(resposta.status >= 400, `esperava falha, veio ${resposta.status}`);
                assert.deepEqual(await contarVinculos(colaborador.Id), antes);
            } finally {
                await consultar('DROP TABLE dbo.TesteVinculoIntegracao');
            }
        }
    }
];

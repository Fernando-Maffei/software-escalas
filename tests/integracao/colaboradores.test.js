const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const {
    DATAS,
    criarColaborador,
    criarSetor,
    criarTipoEscala,
    desligarColaborador,
    lancarAusencia,
    lancarPlantao,
    lancarSaldoSemanal,
    registrarFolgaDomingo,
    tornarPlantonista
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
        // Nome completo e opcional e nao mexe no Nome que as telas usam.
        name: 'nome completo e gravado, editado, mantido quando nao enviado e limpo com vazio',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const semNomeCompleto = await criarColaborador(cliente, { nome: nomeUnico('Fernando') });
            assert.equal(semNomeCompleto.NomeCompleto, null);

            const criado = await criarColaborador(cliente, {
                nome: nomeUnico('Beto'),
                nomeCompleto: '  Roberto da Silva Santos  '
            });
            assert.equal(criado.NomeCompleto, 'Roberto da Silva Santos');

            const editado = esperarSucesso(
                await cliente.put(`/api/colaboradores/${criado.Id}`, {
                    nomeCompleto: 'Roberto Carlos da Silva Santos'
                }),
                'editar nome completo'
            );
            assert.equal(editado.data.NomeCompleto, 'Roberto Carlos da Silva Santos');
            assert.equal(editado.data.Nome, criado.Nome);

            const outraEdicao = esperarSucesso(
                await cliente.put(`/api/colaboradores/${criado.Id}`, { nome: `${criado.Nome} B` }),
                'editar so o nome'
            );
            assert.equal(outraEdicao.data.NomeCompleto, 'Roberto Carlos da Silva Santos');

            const lido = esperarSucesso(await cliente.get(`/api/colaboradores/${criado.Id}`), 'ler colaborador');
            assert.equal(lido.NomeCompleto, 'Roberto Carlos da Silva Santos');

            // O escopo geral (diretorio da tela de lancamentos e do relatorio
            // de assinaturas) traz o nome completo, mas segue sem o horario.
            const diretorio = esperarSucesso(
                await cliente.get('/api/colaboradores?escopo=lancamentos&incluirInativos=1'),
                'diretorio geral'
            );
            const doDiretorio = diretorio.find((item) => item.Id === criado.Id);
            assert.equal(doDiretorio.NomeCompleto, 'Roberto Carlos da Silva Santos');
            assert.equal('TrabalhoInicio' in doDiretorio, false);

            const limpo = esperarSucesso(
                await cliente.put(`/api/colaboradores/${criado.Id}`, { nomeCompleto: '   ' }),
                'limpar nome completo'
            );
            assert.equal(limpo.data.NomeCompleto, null);

            const longo = await cliente.put(`/api/colaboradores/${criado.Id}`, { nomeCompleto: 'x'.repeat(301) });
            assert.equal(longo.status, 400);
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

            // Sai da equipe; o plantao do dia continua.
            const naEquipe = await consultar(
                `SELECT COUNT(*) AS total FROM PlantaoColaborador WHERE ColaboradorId = ${colaborador.Id}`
            );
            assert.equal(naEquipe[0].total, 0);
            const plantoesDoDia = await consultar(`SELECT id FROM plantoes WHERE data_plantao = '${DATAS.sabado}'`);
            assert.ok(plantoesDoDia.length > 0, 'o plantao do dia nao deveria ter sido apagado');
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
    },
    {
        name: 'cadastro de plantonista: tipo e obrigatorio, valido e descartado quando deixa de ser plantonista',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const semTipo = await cliente.post('/api/colaboradores', { nome: 'Sem Tipo', isPlantonista: true });
            assert.equal(semTipo.status, 400);
            assert.match(semTipo.body.error, /tipo de plantonista/i);

            const invalido = await cliente.post('/api/colaboradores', {
                nome: 'Tipo Invalido',
                isPlantonista: true,
                tipoPlantonista: 'NOITE'
            });
            assert.equal(invalido.status, 400);

            const colaborador = await criarColaborador(cliente, {
                isPlantonista: true,
                tipoPlantonista: 'FINAL_SEMANA'
            });
            const lido = esperarSucesso(await cliente.get(`/api/colaboradores/${colaborador.Id}`), 'ler plantonista');
            assert.equal(lido.IsPlantonista, true);
            assert.equal(lido.TipoPlantonista, 'FINAL_SEMANA');

            // Deixar de ser plantonista apaga o tipo, mesmo que o cliente o reenvie.
            const normal = esperarSucesso(
                await cliente.put(`/api/colaboradores/${colaborador.Id}`, {
                    isPlantonista: false,
                    tipoPlantonista: 'FINAL_SEMANA'
                }),
                'deixar de ser plantonista'
            );
            assert.equal(normal.data.IsPlantonista, false);
            assert.equal(normal.data.TipoPlantonista, null);
        }
    },
    {
        name: 'plantonista de semana sem horario proprio recebe 11:00-22:00; com horario, mantem o dele',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const padrao = await criarColaborador(cliente, {
                trabalhoInicio: null,
                trabalhoFim: null,
                almocoInicio: null,
                almocoFim: null,
                isPlantonista: true,
                tipoPlantonista: 'SEMANA'
            });
            const lido = esperarSucesso(
                await cliente.get(`/api/colaboradores/${padrao.Id}`),
                'ler plantonista de semana'
            );
            assert.match(String(lido.TrabalhoInicio), /11:00/);
            assert.match(String(lido.TrabalhoFim), /22:00/);

            const proprio = await criarColaborador(cliente, { isPlantonista: true, tipoPlantonista: 'SEMANA' });
            const lidoProprio = esperarSucesso(
                await cliente.get(`/api/colaboradores/${proprio.Id}`),
                'ler horario proprio'
            );
            assert.match(String(lidoProprio.TrabalhoInicio), /08:00/);
        }
    },
    {
        name: 'plantonista de final de semana com folga de domingo nao muda de tipo ate remover as folgas',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            const folga = await registrarFolgaDomingo(cliente, colaborador.Id);

            const bloqueado = await cliente.put(`/api/colaboradores/${colaborador.Id}`, { isPlantonista: false });
            assert.equal(bloqueado.status, 409);

            esperarSucesso(await cliente.delete(`/api/folgas-domingo/${folga.id}`), 'remover folga');

            const liberado = await cliente.put(`/api/colaboradores/${colaborador.Id}`, { isPlantonista: false });
            assert.equal(liberado.status, 200);
            assert.equal(liberado.body.data.TipoPlantonista, null);

            await tornarPlantonista(cliente, colaborador.Id, 'SEMANA');
        }
    },
    {
        // T18: a leitura da escala esconde o desligado, entao o gerador achava
        // que as linhas dele eram novas e o MERGE reescrevia o historico (o
        // ajuste manual virava escala padrao) e criava linha em todo dia aberto.
        name: 'gerar a escala nao reescreve nem cria linhas de colaborador desligado',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const colaborador = await criarColaborador(cliente);
            esperarSucesso(
                // Sem almoco: o 12:00-13:00 do cadastro cairia fora do 06:00-10:00.
                await cliente.put(`/api/escala/dia/2043-03-02/colaborador/${colaborador.Id}`, {
                    horaInicio: '06:00',
                    horaFim: '10:00',
                    almocoInicio: null,
                    almocoFim: null
                }),
                'ajuste manual'
            );
            await desligarColaborador(cliente, colaborador.Id);

            esperarSucesso(
                await cliente.get('/api/escala/relatorio?dataInicio=2043-03-01&dataFim=2043-03-31'),
                'gerar o mes'
            );

            const linhas = await consultar(`
                SELECT CONVERT(CHAR(10), data, 23) AS data, CONVERT(CHAR(5), hora_inicio, 108) AS inicio, ajuste_manual
                FROM escala_dia
                WHERE colaborador_id = ${Number(colaborador.Id)} AND data BETWEEN '2043-03-01' AND '2043-03-31'
            `);

            assert.deepEqual(linhas, [{ data: '2043-03-02', inicio: '06:00', ajuste_manual: true }]);
        }
    }
];

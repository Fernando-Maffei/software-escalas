const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PASTA_DADOS, consultar, criarCliente, esperarSucesso } = require('./apoio');
const { TABELAS_BACKUP } = require('../../backend/services/backup/especificacao');
const { executeAutomaticBackup } = require('../../backend/services/backup-scheduler');
const {
    DATAS,
    anotarSemana,
    cadastrarFeriado,
    criarColaborador,
    criarSetor,
    criarTipoEscala,
    desligarColaborador,
    lancarAusencia,
    lancarPlantao,
    lancarSaldoSemanal,
    registrarFolgaDomingo
} = require('./fabrica');

// Todas as tabelas de dados de negocio. Contas e sessoes ficam de fora de
// proposito: nao sao dado de escala e nao voltam numa restauracao.
const TABELAS_DE_NEGOCIO = Object.freeze([
    'Setores',
    'TiposEscala',
    'TipoEscalaDia',
    'Colaboradores',
    'ColaboradorJornadaSemanal',
    'FolgasDomingo',
    'Feriados',
    'Ausencias',
    'plantoes',
    'PlantaoColaborador',
    'BancoHorasMovimentos',
    'BancoHorasSemanal',
    'BancoHorasSemanalNota',
    'escala_dia',
    'AlmocosPersonalizados'
]);

async function fotografarBanco() {
    const foto = {};

    for (const tabela of TABELAS_DE_NEGOCIO) {
        const linhas = await consultar(`SELECT * FROM dbo.[${tabela}]`);
        foto[tabela] = linhas.map((linha) => JSON.stringify(linha)).sort();
    }

    return foto;
}

async function montarCenarioCompleto(cliente) {
    const setor = await criarSetor(cliente);
    const tipo = await criarTipoEscala(cliente);
    const plantonista = await criarColaborador(cliente, {
        setorId: setor.Id,
        tipoEscalaId: tipo.id,
        jornadaSemanal: [0, 1, 2, 3, 6].map((diaSemana) => ({
            diaSemana,
            trabalhoInicio: '07:00',
            trabalhoFim: '19:00',
            almocoInicio: '12:00',
            almocoFim: '13:00'
        }))
    });
    const colega = await criarColaborador(cliente, { setorId: setor.Id });
    const desligado = await criarColaborador(cliente);

    await desligarColaborador(cliente, desligado.Id);
    await cadastrarFeriado(cliente);
    await lancarAusencia(cliente, colega.Id, { observacao: 'Consulta medica' });
    await lancarPlantao(
        cliente,
        DATAS.domingo,
        [{ horaInicio: '08:00', horaFim: '14:00', colaboradores: [colega.Id], tipoCredito: 'extra' }],
        'Cobertura do domingo'
    );
    await lancarPlantao(cliente, DATAS.sabado, [
        { horaInicio: '08:00', horaFim: '12:00', colaboradores: [colega.Id], tipoCredito: 'banco' }
    ]);
    await registrarFolgaDomingo(cliente, plantonista.Id, { observacao: 'Folga do mes' });
    await lancarSaldoSemanal(cliente, colega.Id, '-01:15');
    await anotarSemana(cliente);

    esperarSucesso(
        await cliente.put('/api/escala/almoco-periodo', {
            colaboradorId: colega.Id,
            dataInicio: DATAS.segunda,
            dataFim: DATAS.terca,
            almocoInicio: '12:30',
            almocoFim: '13:30'
        }),
        'almoco personalizado'
    );

    // Garante linhas de escala_dia materializadas para o periodo. A leitura
    // (GET /escala/dia) nao grava mais (T8); quem materializa e a rota de
    // reconstrucao.
    esperarSucesso(
        await cliente.post('/api/escala/rebuild', { dataInicio: DATAS.segunda, dataFim: DATAS.segunda }),
        'gerar escala'
    );
}

module.exports = [
    {
        // Rede contra a classe de bug do C2: tabela ou coluna nova no banco que
        // ninguem lembrou de por no backup. Contas e sessoes ficam de fora de
        // proposito (ver backup/especificacao.js).
        name: 'especificacao do backup cobre todas as tabelas e colunas do banco',
        async run() {
            const colunasDoBanco = await consultar(`
                SELECT c.TABLE_NAME AS tabela, c.COLUMN_NAME AS coluna
                FROM INFORMATION_SCHEMA.COLUMNS c
                JOIN INFORMATION_SCHEMA.TABLES t
                  ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
                WHERE c.TABLE_NAME NOT IN ('Usuarios', 'Sessoes', 'SchemaMigrations')
            `);
            const noBanco = colunasDoBanco.map((linha) => `${linha.tabela}.${linha.coluna}`).sort();
            const naEspecificacao = TABELAS_BACKUP.flatMap((item) =>
                item.colunas.map((coluna) => `${item.tabela}.${coluna.nome}`)
            ).sort();

            assert.deepEqual(naEspecificacao, noBanco);
        }
    },
    {
        // C2 da auditoria: a restauracao zerava tipos de escala e folgas de
        // domingo, perdia TipoEscalaId e o desligamento, transformava todo
        // plantao em sabado/banco e quebrava com banco semanal preenchido.
        name: 'backup seguido de restauracao devolve exatamente os mesmos dados',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            await montarCenarioCompleto(cliente);

            const antes = await fotografarBanco();
            TABELAS_DE_NEGOCIO.forEach((tabela) => {
                assert.ok(antes[tabela].length > 0, `o cenario deveria ter linhas em ${tabela}`);
            });

            const pasta = path.join(PASTA_DADOS, 'backups');
            const gerado = esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/gerar', { directory: pasta }),
                'gerar backup'
            );
            const arquivo = JSON.parse(fs.readFileSync(gerado.result.filePath, 'utf8'));

            esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/restaurar', {
                    backupData: arquivo,
                    fileName: path.basename(gerado.result.filePath)
                }),
                'restaurar backup'
            );

            const depois = await fotografarBanco();
            TABELAS_DE_NEGOCIO.forEach((tabela) => {
                assert.deepEqual(depois[tabela], antes[tabela], `tabela ${tabela} mudou na ida e volta`);
            });
        }
    },
    {
        // A3 da auditoria: o arquivo de backup carregava tokens de sessao
        // validos e hashes de senha.
        name: 'arquivo de backup nao contem sessoes nem credenciais',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const pasta = path.join(PASTA_DADOS, 'backups-credenciais');
            const gerado = esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/gerar', { directory: pasta }),
                'gerar backup'
            );
            const texto = fs.readFileSync(gerado.result.filePath, 'utf8');
            const [sessao] = await consultar('SELECT TOP 1 Token FROM Sessoes');

            assert.ok(sessao, 'o teste precisa de ao menos uma sessao aberta');
            assert.equal(texto.includes(sessao.Token.trim()), false, 'token de sessao vazou no backup');
            assert.equal(/PasswordHash|PasswordSalt/.test(texto), false, 'hash de senha vazou no backup');
        }
    },
    {
        // A5 da auditoria: "Exportar Dados" baixava so colaboradores e ausencias,
        // e importar esse arquivo apagava todo o resto.
        name: 'backup baixado pela tela, importado de volta, devolve os mesmos dados',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            // Reaproveita o cenario do teste anterior (o banco e o mesmo).
            const antes = await fotografarBanco();
            TABELAS_DE_NEGOCIO.forEach((tabela) => {
                assert.ok(antes[tabela].length > 0, `o cenario deveria ter linhas em ${tabela}`);
            });

            const baixado = await cliente.get('/api/configuracao-banco/backup/baixar');

            assert.equal(baixado.status, 200);
            assert.match(String(baixado.headers.get('content-disposition')), /attachment; filename="backup-escalas-/);

            esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/restaurar', {
                    backupData: { ...baixado.body, preferencias: { tema: 'dark' } },
                    fileName: 'baixado.json'
                }),
                'restaurar backup baixado'
            );

            const depois = await fotografarBanco();
            TABELAS_DE_NEGOCIO.forEach((tabela) => {
                assert.deepEqual(depois[tabela], antes[tabela], `tabela ${tabela} mudou na ida e volta`);
            });
        }
    },
    {
        // M17: backups gravados antes de 2026-09-28 (como os que ja estao na
        // pasta de backup) guardam a equipe no JSON plantoes.colaboradores_ids e
        // nao tem PlantaoColaborador. Restaurar um deles devolve a mesma equipe.
        name: 'backup no formato antigo (equipe em JSON) restaura a mesma equipe',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const antes = await fotografarBanco();
            assert.ok(antes.PlantaoColaborador.length > 0, 'o cenario deveria ter equipe de plantao');

            const baixado = await cliente.get('/api/configuracao-banco/backup/baixar');
            const { PlantaoColaborador: vinculos, ...dadosSemLigacao } = baixado.body.data;
            const formatoAntigo = {
                ...baixado.body,
                data: {
                    ...dadosSemLigacao,
                    plantoes: dadosSemLigacao.plantoes.map((plantao) => ({
                        ...plantao,
                        colaboradores_ids: JSON.stringify(
                            vinculos.filter((v) => v.PlantaoId === plantao.id).map((v) => v.ColaboradorId)
                        )
                    }))
                }
            };

            const restaurado = esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/restaurar', {
                    backupData: formatoAntigo,
                    fileName: 'formato-antigo.json'
                }),
                'restaurar backup no formato antigo'
            );
            assert.deepEqual(restaurado.result.avisos, []);

            const depois = await fotografarBanco();
            TABELAS_DE_NEGOCIO.forEach((tabela) => {
                assert.deepEqual(depois[tabela], antes[tabela], `tabela ${tabela} mudou na ida e volta`);
            });
        }
    },
    {
        name: 'usuario comum nao baixa o backup',
        async run() {
            const admin = criarCliente();
            await admin.entrar();
            const username = `leitor-backup-${Date.now().toString(36)}`;
            esperarSucesso(await admin.post('/api/usuarios', { username, senha: 'Leitor!Backup1' }), 'criar usuario');

            const leitor = criarCliente();
            await leitor.entrar(username, 'Leitor!Backup1');

            assert.equal((await leitor.get('/api/configuracao-banco/backup/baixar')).status, 403);
        }
    },
    {
        // O limite de 1 MB vale para a API toda, menos a restauracao de backup.
        name: 'restauracao aceita arquivo acima de 1 MB (chega a validacao, nao e cortada)',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();

            const grande = { data: { Feriados: [{ Id: 1, Data: '2027-03-19', Nome: 'x'.repeat(2 * 1024 * 1024) }] } };
            const resposta = await cliente.post('/api/configuracao-banco/backup/restaurar', { backupData: grande });

            assert.equal(resposta.status, 400);
            assert.match(resposta.body.error, /Nome deve ter no maximo 200/);
        }
    },
    {
        // M10 da auditoria: backups automaticos se acumulavam para sempre. Com
        // retencao N, ficam so os N mais recentes — e o backup manual da mesma
        // pasta nunca e apagado.
        name: 'retencao mantem os N ultimos backups automaticos e preserva o manual',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const pasta = path.join(PASTA_DADOS, 'backups-retencao');
            const config = { directory: pasta, autoBackupEnabled: false, autoBackupOnShutdown: false };

            const invalida = await cliente.post('/api/configuracao-banco/backup/salvar', {
                ...config,
                autoBackupRetencao: -3
            });
            assert.equal(invalida.status, 400);

            esperarSucesso(
                await cliente.post('/api/configuracao-banco/backup/salvar', { ...config, autoBackupRetencao: 2 }),
                'salvar retencao'
            );

            try {
                const manual = esperarSucesso(
                    await cliente.post('/api/configuracao-banco/backup/gerar', { directory: pasta }),
                    'backup manual'
                );

                const automaticos = [];
                for (let i = 0; i < 3; i++) {
                    // o nome tem resolucao de segundo
                    await new Promise((resolver) => setTimeout(resolver, 1100));
                    const resultado = await executeAutomaticBackup('auto-schedule', { force: true });
                    if (!('fileName' in resultado)) {
                        throw new Error(`backup automatico nao gerou arquivo: ${resultado.reason}`);
                    }
                    automaticos.push(resultado.fileName);
                }

                const naPasta = fs.readdirSync(pasta).sort();
                assert.deepEqual(naPasta, [manual.result.fileName, ...automaticos.slice(1)].sort());
            } finally {
                esperarSucesso(
                    await cliente.post('/api/configuracao-banco/backup/salvar', { ...config, autoBackupRetencao: 0 }),
                    'desligar retencao'
                );
            }
        }
    }
];

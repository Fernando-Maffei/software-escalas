const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PASTA_DADOS, consultar, criarCliente, esperarSucesso } = require('./apoio');
const { TABELAS_BACKUP } = require('../../backend/services/backup/especificacao');
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

    // Garante linhas de escala_dia materializadas para o periodo.
    esperarSucesso(await cliente.get(`/api/escala/dia/${DATAS.segunda}`), 'gerar escala');
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
                WHERE c.TABLE_NAME NOT IN ('Usuarios', 'Sessoes')
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
    }
];

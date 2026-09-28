// Controle de versao das migrations (M9) e a tabela de ligacao da equipe do
// plantao (M17), contra o SQL Server de integracao.
const assert = require('node:assert/strict');
const path = require('path');

const { consultar, criarCliente } = require('./apoio');
const { criarColaborador, lancarPlantao } = require('./fabrica');

const RAIZ = path.join(__dirname, '..', '..');
const { conectar } = require(path.join(RAIZ, 'backend', 'db'));
const { ensureApplicationSchema } = require(path.join(RAIZ, 'backend', 'db', 'database-schema'));
const { aplicarMigracoes } = require(path.join(RAIZ, 'backend', 'db', 'migracoes'));

const MIGRACAO_EQUIPE = '2026-09-28-plantao-colaborador.sql';
const logMudo = { log() {}, warn() {} };

async function equipeDoBanco(plantaoId) {
    const linhas = await consultar(
        `SELECT ColaboradorId FROM PlantaoColaborador WHERE PlantaoId = ${Number(plantaoId)} ORDER BY ColaboradorId`
    );
    return linhas.map((linha) => linha.ColaboradorId);
}

async function colunaAntigaExiste() {
    const [linha] = await consultar("SELECT COL_LENGTH('dbo.plantoes', 'colaboradores_ids') AS tamanho");
    return linha.tamanho !== null;
}

module.exports = [
    {
        name: 'migrations ja aplicadas nao rodam de novo na proxima subida',
        async run() {
            const pool = await conectar();
            const resultado = await ensureApplicationSchema(pool);

            assert.deepEqual(resultado.scriptsExecuted, []);
            const registradas = await consultar('SELECT Nome FROM SchemaMigrations');
            assert.ok(registradas.some((linha) => linha.Nome === MIGRACAO_EQUIPE));
            assert.ok(registradas.some((linha) => linha.Nome === '2026-04-27-base-schema.sql'));
        }
    },
    {
        // Mudar migration ja aplicada e erro: ela nao roda de novo, so avisa.
        name: 'migration aplicada cujo arquivo mudou nao roda de novo e gera aviso',
        async run() {
            const pool = await conectar();
            const [original] = await consultar(
                `SELECT Checksum FROM SchemaMigrations WHERE Nome = '${MIGRACAO_EQUIPE}'`
            );
            const avisos = [];

            await consultar(
                `UPDATE SchemaMigrations SET Checksum = REPLICATE('0', 64) WHERE Nome = '${MIGRACAO_EQUIPE}'`
            );
            try {
                const { executadas, alteradas } = await aplicarMigracoes(
                    pool,
                    [path.join(RAIZ, 'database', 'migrations', MIGRACAO_EQUIPE)],
                    { log: { log() {}, warn: (texto) => avisos.push(texto) } }
                );

                assert.deepEqual(executadas, []);
                assert.deepEqual(alteradas, [MIGRACAO_EQUIPE]);
                assert.match(avisos[0], /NAO roda de novo/);
            } finally {
                await consultar(
                    `UPDATE SchemaMigrations SET Checksum = '${original.Checksum}' WHERE Nome = '${MIGRACAO_EQUIPE}'`
                );
            }
        }
    },
    {
        // Banco que existia antes do controle: nenhum registro. Tudo roda uma
        // vez (inclusive a base, que recria a coluna JSON vazia) e a equipe ja
        // gravada na tabela de ligacao nao pode se perder.
        name: 'banco sem registro de migrations roda tudo uma vez, registra e preserva a equipe',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const colaborador = await criarColaborador(cliente);
            const dia = await lancarPlantao(cliente, '2027-03-06', [
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [colaborador.Id], tipoCredito: 'banco' }
            ]);
            const plantaoId = dia.lancamentos[0].id;

            await consultar('DELETE FROM SchemaMigrations');
            const pool = await conectar();
            const resultado = await ensureApplicationSchema(pool);

            assert.ok(resultado.scriptsExecuted.length >= 17);
            assert.deepEqual(await equipeDoBanco(plantaoId), [colaborador.Id]);
            assert.equal(await colunaAntigaExiste(), false);
            assert.deepEqual((await ensureApplicationSchema(pool)).scriptsExecuted, []);
        }
    },
    {
        // O que a migracao do M17 faz na producao: le o JSON de cada plantao,
        // descarta o que nao da para ligar e remove a coluna.
        name: 'migracao da equipe copia o JSON, descarta orfao/invalido/repetido e remove a coluna',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const ana = await criarColaborador(cliente);
            const bia = await criarColaborador(cliente);
            const dia = await lancarPlantao(cliente, '2027-03-13', [
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [ana.Id], tipoCredito: 'banco' },
                { horaInicio: '13:00', horaFim: '17:00', colaboradores: [bia.Id], tipoCredito: 'banco' }
            ]);
            const [primeiro, segundo] = dia.lancamentos.map((lancamento) => lancamento.id);

            // Volta o banco ao formato anterior ao M17.
            await consultar(
                "ALTER TABLE plantoes ADD colaboradores_ids NVARCHAR(MAX) NOT NULL CONSTRAINT DF_plantoes_colaboradores DEFAULT ('[]')"
            );
            await consultar(`DELETE FROM PlantaoColaborador WHERE PlantaoId IN (${primeiro}, ${segundo})`);
            await consultar(
                `UPDATE plantoes SET colaboradores_ids = '[${bia.Id},${ana.Id},${ana.Id},"x",999999]' WHERE id = ${primeiro}`
            );
            await consultar(`UPDATE plantoes SET colaboradores_ids = 'nao e json' WHERE id = ${segundo}`);
            await consultar(`DELETE FROM SchemaMigrations WHERE Nome = '${MIGRACAO_EQUIPE}'`);

            const pool = await conectar();
            const { executadas } = await aplicarMigracoes(
                pool,
                [path.join(RAIZ, 'database', 'migrations', MIGRACAO_EQUIPE)],
                { log: logMudo }
            );

            assert.deepEqual(executadas, [MIGRACAO_EQUIPE]);
            assert.deepEqual(
                await equipeDoBanco(primeiro),
                [ana.Id, bia.Id].sort((a, b) => a - b)
            );
            assert.deepEqual(await equipeDoBanco(segundo), []);
            assert.equal(await colunaAntigaExiste(), false);
        }
    },
    {
        // M17: "plantoes em que a pessoa esta" agora e um filtro SQL na tabela
        // de ligacao (antes: ler todos e filtrar o JSON em JS).
        name: 'extrato de horas extras traz so os plantoes da pessoa (filtro pela tabela de ligacao)',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const pessoa = await criarColaborador(cliente);
            const outra = await criarColaborador(cliente);
            await lancarPlantao(cliente, '2027-03-20', [
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [pessoa.Id], tipoCredito: 'extra' },
                { horaInicio: '13:00', horaFim: '17:00', colaboradores: [outra.Id], tipoCredito: 'extra' }
            ]);

            const resposta = await cliente.get(`/api/banco-horas/colaborador/${pessoa.Id}`);
            assert.equal(resposta.status, 200);
            assert.deepEqual(
                resposta.body.horasExtras.map((item) => [item.dataReferencia, item.horaInicio]),
                [['2027-03-20', '08:00:00']]
            );
        }
    }
];

// T8: as leituras da escala (GET /api/escala/dia e /relatorio) passaram a gerar
// as linhas numa transacao DESCARTADA. A premissa e que a resposta nao depende
// de as leituras anteriores terem gravado ou nao: o gerador sempre refaz as
// linhas automaticas a partir do cadastro, e o que precisa ficar (ajuste
// manual, ausencia, plantao, folga) e gravado pelas rotas de escrita.
//
// Aqui dois mundos fazem a mesma sequencia de leituras e escritas: no A a
// leitura grava (como era), no B ela e desfeita (como e agora). As respostas
// tem que bater uma a uma.
const assert = require('node:assert/strict');

const {
    listEscalaDiaByDate,
    listEscalaReport,
    syncColaboradorDefaultsToEscalaDia,
    upsertManualEscalaDia
} = require('../../backend/services/escala');
const { criarBancoEscalaFalso } = require('./apoio/banco-escala-falso');

const hora = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`);

function cenario() {
    const colaborador = (Id, extra = {}) => ({
        Id,
        Nome: `Pessoa ${Id}`,
        SetorId: (Id % 2) + 1,
        SetorNome: `Setor ${(Id % 2) + 1}`,
        Ativo: true,
        TrabalhoInicio: hora('08:00'),
        TrabalhoFim: hora('17:00'),
        AlmocoInicio: hora('12:00'),
        AlmocoFim: hora('13:00'),
        ...extra
    });

    return {
        colaboradores: [colaborador(1), colaborador(2), colaborador(3), colaborador(4, { AlmocoInicio: null, AlmocoFim: null })],
        jornada: [],
        feriados: ['2026-10-12'],
        escala: []
    };
}

// Sem o que muda a cada gravacao (id e carimbos de data).
function semIdentidade(itens) {
    return itens.map(({ id, criadoEm, atualizadoEm, ...resto }) => resto);
}

function criarMundo(descartarLeituras) {
    const dados = cenario();
    const banco = criarBancoEscalaFalso(dados);

    async function ler(funcao) {
        const antes = descartarLeituras ? banco.instantaneo() : null;
        const resultado = await funcao(banco);

        if (antes) {
            banco.restaurar(antes);
        }

        return semIdentidade(resultado);
    }

    return {
        dados,
        banco,
        lerMes: () => ler((tx) => listEscalaReport(tx, { dataInicio: '2026-10-01', dataFim: '2026-10-31' })),
        lerDia: (dataISO) => ler((tx) => listEscalaDiaByDate(tx, dataISO))
    };
}

// Escritas, iguais nos dois mundos (sempre gravam).
const ESCRITAS = [
    {
        passo: 'troca o horario no cadastro',
        escrever: async ({ dados, banco }) => {
            const pessoa = dados.colaboradores[0];
            pessoa.TrabalhoInicio = hora('09:00');
            pessoa.TrabalhoFim = hora('18:00');
            await syncColaboradorDefaultsToEscalaDia(banco, pessoa);
        }
    },
    {
        passo: 'ajuste manual num dia',
        escrever: ({ banco }) =>
            upsertManualEscalaDia(banco, {
                colaboradorId: 2,
                dataISO: '2026-10-14',
                horaInicio: '06:00',
                horaFim: '10:00',
                almocoInicio: null,
                almocoFim: null
            })
    },
    {
        passo: 'feriado novo',
        escrever: async ({ dados }) => {
            dados.feriados.push('2026-10-20');
        }
    },
    {
        passo: 'desliga uma pessoa',
        escrever: async ({ dados }) => {
            dados.colaboradores[2].Ativo = false;
        }
    },
    {
        passo: 'jornada semanal nova',
        escrever: async ({ dados }) => {
            dados.jornada.push(
                ...[1, 2, 3].map((dia) => ({
                    ColaboradorId: 4,
                    DiaSemana: dia,
                    TrabalhoInicio: hora('13:00'),
                    TrabalhoFim: hora('22:00'),
                    AlmocoInicio: null,
                    AlmocoFim: null,
                    Ativo: true
                }))
            );
        }
    },
    {
        passo: 'reativa a pessoa',
        escrever: async ({ dados }) => {
            dados.colaboradores[2].Ativo = true;
        }
    }
];

module.exports = [
    {
        name: 'leitura descartada da a mesma escala que a leitura gravada, passo a passo',
        async run() {
            const gravando = criarMundo(false);
            const descartando = criarMundo(true);

            async function conferir(passo) {
                assert.deepEqual(await descartando.lerMes(), await gravando.lerMes(), `mes, ${passo}`);
                assert.deepEqual(
                    await descartando.lerDia('2026-10-14'),
                    await gravando.lerDia('2026-10-14'),
                    `dia, ${passo}`
                );
            }

            await conferir('inicio');

            for (const { passo, escrever } of ESCRITAS) {
                await escrever(gravando);
                await escrever(descartando);
                await conferir(passo);
            }
        }
    },
    {
        name: 'leitura descartada nao deixa linha gravada; a escrita continua gravando',
        async run() {
            const mundo = criarMundo(true);

            await mundo.lerMes();
            assert.equal(mundo.banco.tabela().length, 0);

            await ESCRITAS[1].escrever(mundo);
            const linhas = mundo.banco.tabela();
            // A escrita materializa o dia (como antes) e grava o ajuste.
            assert.ok(linhas.some((linha) => linha.colaborador_id === 2 && linha.data === '2026-10-14' && linha.ajuste_manual));
            assert.ok(linhas.every((linha) => linha.data === '2026-10-14'));
        }
    }
];

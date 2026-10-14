const assert = require('node:assert/strict');

const {
    construirJornadaSemanalDoTipo,
    normalizeDiasPayload,
    normalizeTipoEscalaPayload,
    serializeTipoEscala
} = require('../../backend/services/tipos-escala');

const PLANTONISTA = {
    nome: 'Plantonista Sab-Qua',
    dias: [
        { diaSemana: 6, trabalha: true, trabalhoInicio: '13:00', trabalhoFim: '22:00' },
        { diaSemana: 0, trabalha: true, trabalhoInicio: '13:00', trabalhoFim: '22:00' },
        { diaSemana: 1, trabalha: true, trabalhoInicio: '13:00', trabalhoFim: '22:00' },
        { diaSemana: 2, trabalha: true, trabalhoInicio: '13:00', trabalhoFim: '22:00' },
        { diaSemana: 3, trabalha: true, trabalhoInicio: '13:00', trabalhoFim: '22:00' }
    ]
};

module.exports = [
    {
        // O molde e um padrao semanal COMPLETO: dia que o payload nao mandou e
        // folga, nao dia indefinido. Sem isso, o plantonista sab-qua gravaria
        // so cinco linhas e quinta/sexta ficariam sem resposta.
        name: 'normalizeDiasPayload devolve os sete dias, com os omitidos como folga',
        run() {
            const dias = normalizeDiasPayload(PLANTONISTA.dias);

            assert.equal(dias.length, 7);
            assert.deepEqual(dias.map((d) => d.diaSemana), [0, 1, 2, 3, 4, 5, 6]);
            assert.deepEqual(dias.map((d) => d.trabalha), [true, true, true, true, false, false, true]);
        }
    },
    {
        // Guardar horario num dia de folga faz a tela reabrir com horario que
        // ninguem digitou quando o dia e religado.
        name: 'normalizeDiasPayload limpa o horario do dia que nao e trabalhado',
        run() {
            const dias = normalizeDiasPayload([
                { diaSemana: 4, trabalha: false, trabalhoInicio: '08:00', trabalhoFim: '18:00', almocoInicio: '12:00', almocoFim: '13:00' }
            ]);
            const quinta = dias.find((d) => d.diaSemana === 4);

            assert.equal(quinta.trabalha, false);
            assert.equal(quinta.trabalhoInicio, null);
            assert.equal(quinta.trabalhoFim, null);
            assert.equal(quinta.almocoInicio, null);
            assert.equal(quinta.almocoFim, null);
        }
    },
    {
        name: 'normalizeDiasPayload recusa o mesmo dia da semana duas vezes',
        run() {
            assert.throws(
                () => normalizeDiasPayload([
                    { diaSemana: 1, trabalha: true, trabalhoInicio: '08:00', trabalhoFim: '18:00' },
                    { diaSemana: 1, trabalha: true, trabalhoInicio: '09:00', trabalhoFim: '19:00' }
                ]),
                /aparece duas vezes/i
            );
        }
    },
    {
        name: 'normalizeDiasPayload exige inicio e fim no dia marcado como trabalhado',
        run() {
            assert.throws(
                () => normalizeDiasPayload([{ diaSemana: 1, trabalha: true }]),
                /Informe inicio e fim do trabalho/i
            );
        }
    },
    {
        name: 'normalizeTipoEscalaPayload recusa um tipo sem nenhum dia de trabalho',
        run() {
            assert.throws(
                () => normalizeTipoEscalaPayload({ nome: 'Vazio', dias: [] }),
                /pelo menos um dia de trabalho/i
            );
        }
    },
    {
        // 12x36 e um ciclo de 2 dias que desliza pela semana; o modelo atual e
        // indexado por dia-da-semana e nao sabe gerar isso. O banco ja aceita
        // 'dias' no CHECK para nao ter que recriar a restricao depois, mas o
        // codigo precisa recusar, senao o tipo aplicaria errado em silencio.
        name: 'normalizeTipoEscalaPayload recusa ciclo que o gerador ainda nao sabe aplicar',
        run() {
            assert.throws(
                () => normalizeTipoEscalaPayload({ nome: '12x36', cicloTipo: 'dias', dias: PLANTONISTA.dias }),
                /Tipo de ciclo/i
            );
        }
    },
    {
        name: 'normalizeTipoEscalaPayload aceita domingo de folga configuravel e recusa zero',
        run() {
            const ok = normalizeTipoEscalaPayload({ ...PLANTONISTA, domingosFolgaCada: 4, exigeReposicao: true });

            assert.equal(ok.domingosFolgaCada, 4);
            assert.equal(ok.exigeReposicao, true);

            const semRegra = normalizeTipoEscalaPayload({ ...PLANTONISTA, domingosFolgaCada: '' });
            assert.equal(semRegra.domingosFolgaCada, null);

            assert.throws(
                () => normalizeTipoEscalaPayload({ ...PLANTONISTA, domingosFolgaCada: 0 }),
                /Domingos de folga/i
            );
        }
    },
    {
        // Este e o contrato com ColaboradorJornadaSemanal: aplicar o tipo so
        // manda os dias ATIVOS, e replaceColaboradorJornadaSemanal desliga o
        // resto. Mandar dia de folga como ativo faria a jornada exigir horario.
        name: 'construirJornadaSemanalDoTipo manda so os dias trabalhados, como ativos',
        run() {
            const tipo = serializeTipoEscala(
                { Id: 1, Nome: 'Plantonista', CicloTipo: 'semanal', Ativo: 1 },
                normalizeDiasPayload(PLANTONISTA.dias).map((d) => ({
                    DiaSemana: d.diaSemana,
                    Trabalha: d.trabalha,
                    TrabalhoInicio: d.trabalhoInicio,
                    TrabalhoFim: d.trabalhoFim,
                    AlmocoInicio: d.almocoInicio,
                    AlmocoFim: d.almocoFim
                }))
            );

            const jornada = construirJornadaSemanalDoTipo(tipo);

            assert.deepEqual(jornada.map((j) => j.diaSemana), [0, 1, 2, 3, 6]);
            assert.ok(jornada.every((j) => j.ativo === true));
            // HH:MM:SS: e o formato que extractTimeString devolve e que o resto
            // do projeto usa (escala_dia, jornada semanal, plantoes).
            assert.ok(jornada.every((j) => j.trabalhoInicio === '13:00:00' && j.trabalhoFim === '22:00:00'));
        }
    },
    {
        name: 'serializeTipoEscala ordena os dias e normaliza os booleanos do banco',
        run() {
            const tipo = serializeTipoEscala(
                { Id: 7, Nome: '5x2', CicloTipo: 'SEMANAL', Ativo: 1, ExigeReposicao: 0, DomingosFolgaCada: null, Ordem: 2 },
                [
                    { DiaSemana: 5, Trabalha: 1, TrabalhoInicio: '08:00', TrabalhoFim: '18:00' },
                    { DiaSemana: 1, Trabalha: 1, TrabalhoInicio: '08:00', TrabalhoFim: '18:00' }
                ]
            );

            assert.equal(tipo.id, 7);
            assert.equal(tipo.cicloTipo, 'semanal');
            assert.equal(tipo.ativo, true);
            assert.equal(tipo.exigeReposicao, false);
            assert.equal(tipo.domingosFolgaCada, null);
            assert.deepEqual(tipo.dias.map((d) => d.diaSemana), [1, 5]);
        }
    }
];

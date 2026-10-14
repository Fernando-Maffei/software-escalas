const assert = require('node:assert/strict');

const {
    JANELA_PLANTOES_DIAS,
    PRAZO_ATRASO_DIAS,
    classificarEsperaFolga,
    diasEntre,
    hojeISO,
    plantoesSemEquipe,
    textoQuando
} = require('../../frontend/js/lib/pendencias-plantao');

const HOJE = '2026-10-07';
const turno = (dataISO, colaboradores, extras = {}) => ({
    dataISO,
    horaInicio: '08:00:00',
    horaFim: '12:00:00',
    tipoCredito: 'banco',
    colaboradores,
    ...extras
});

module.exports = [
    {
        name: 'diasEntre conta dias do calendario, inclusive na virada de mes e de ano',
        run() {
            assert.equal(diasEntre('2026-10-07', '2026-10-07'), 0);
            assert.equal(diasEntre('2026-10-07', '2026-10-10'), 3);
            assert.equal(diasEntre('2026-10-31', '2026-11-01'), 1);
            assert.equal(diasEntre('2026-12-30', '2027-01-02'), 3);
            assert.equal(diasEntre('2026-10-10', '2026-10-07'), -3);
            // Horario de verao (mudanca de relogio) nao vira um dia a mais ou a menos.
            assert.equal(diasEntre('2026-11-01', '2026-11-08'), 7);
            assert.equal(diasEntre('data ruim', '2026-10-07'), 0);
        }
    },
    {
        name: 'hojeISO usa o calendario local e zera a esquerda',
        run() {
            assert.equal(hojeISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
            assert.equal(hojeISO(new Date(2026, 9, 7, 0, 1)), '2026-10-07');
        }
    },
    {
        name: 'textoQuando fala em passado e futuro, no singular e no plural',
        run() {
            assert.equal(textoQuando(0), 'hoje');
            assert.equal(textoQuando(1), 'ha 1 dia');
            assert.equal(textoQuando(5), 'ha 5 dias');
            assert.equal(textoQuando(-1), 'em 1 dia');
            assert.equal(textoQuando(-25), 'em 25 dias');
        }
    },
    {
        name: 'classificarEsperaFolga: atraso a partir de 15 dias, espera antes disso, futura se o domingo nao chegou',
        run() {
            assert.equal(PRAZO_ATRASO_DIAS, 15);
            assert.equal(classificarEsperaFolga(15), 'atraso');
            assert.equal(classificarEsperaFolga(40), 'atraso');
            assert.equal(classificarEsperaFolga(14), 'espera');
            assert.equal(classificarEsperaFolga(1), 'espera');
            assert.equal(classificarEsperaFolga(0), 'futura');
            assert.equal(classificarEsperaFolga(-9), 'futura');
        }
    },
    {
        name: 'plantoesSemEquipe lista so os dias dos proximos 30 dias em que nenhum turno tem equipe',
        run() {
            const dias = plantoesSemEquipe(
                [
                    turno('2026-10-10', []),
                    turno('2026-10-11', [1, 2]),
                    turno('2026-10-17', undefined),
                    turno('2026-10-03', []), // passado
                    turno('2026-11-07', []), // exatamente 31 dias
                    turno('2026-11-06', []) // exatamente 30 dias: dentro da janela
                ],
                HOJE
            );

            assert.equal(JANELA_PLANTOES_DIAS, 30);
            assert.deepEqual(
                dias.map((dia) => [dia.dataISO, dia.dias]),
                [
                    ['2026-10-10', 3],
                    ['2026-10-17', 10],
                    ['2026-11-06', 30]
                ]
            );
        }
    },
    {
        name: 'plantoesSemEquipe: basta um turno com equipe para o dia estar coberto, e o dia conta uma vez so',
        run() {
            const dias = plantoesSemEquipe(
                [
                    turno('2026-10-10', []),
                    turno('2026-10-10', [7], { horaInicio: '13:00:00', horaFim: '17:00:00' }),
                    turno('2026-10-17', [], { horaInicio: '13:00:00', horaFim: '17:00:00', tipoCredito: 'extra' }),
                    turno('2026-10-17', [], { horaInicio: '08:00:00' })
                ],
                HOJE
            );

            assert.deepEqual(
                dias.map((dia) => dia.dataISO),
                ['2026-10-17']
            );
            // Os turnos do dia vem em ordem de horario.
            assert.deepEqual(
                dias[0].turnos.map((item) => [item.horaInicio, item.tipoCredito]),
                [
                    ['08:00:00', 'banco'],
                    ['13:00:00', 'extra']
                ]
            );
        }
    },
    {
        name: 'plantoesSemEquipe inclui o plantao de hoje e ignora entradas invalidas',
        run() {
            const dias = plantoesSemEquipe(
                [turno(HOJE, []), turno('', []), { colaboradores: [] }, null, turno('lixo', [])],
                HOJE
            );

            assert.deepEqual(
                dias.map((dia) => [dia.dataISO, dia.dias]),
                [[HOJE, 0]]
            );
            assert.deepEqual(plantoesSemEquipe(undefined, HOJE), []);
        }
    }
];

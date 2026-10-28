const assert = require('node:assert/strict');

const { detectarConflitoSubstituto, exigirSubstitutoSemConflito } = require('../../backend/services/cobertura-conflitos');

const trecho = { id: 21, dataISO: '2026-11-03', horaInicio: '19:00:00', horaFim: '22:00:00' };
const base = { trecho, substituto: { nome: 'Joao', ativo: true } };

module.exports = [
    {
        name: 'substituto livre no dia nao tem conflito nem segundo turno',
        run() {
            assert.deepEqual(detectarConflitoSubstituto(base), { conflito: null, segundoTurno: false });
        }
    },
    {
        // Decisao do time: trabalhar 08h-17h e cobrir 19h-22h no mesmo dia vale.
        name: 'expediente proprio separado ou emendado e aceito como segundo turno',
        run() {
            assert.deepEqual(
                detectarConflitoSubstituto({ ...base, expediente: { tipo: 'normal', horaInicio: '08:00:00', horaFim: '17:00:00' } }),
                { conflito: null, segundoTurno: true }
            );
            assert.deepEqual(
                detectarConflitoSubstituto({ ...base, expediente: { tipo: 'normal', horaInicio: '10:00:00', horaFim: '19:00:00' } }),
                { conflito: null, segundoTurno: true }
            );
        }
    },
    {
        name: 'expediente proprio que cruza o trecho e recusado com o horario',
        run() {
            const { conflito } = detectarConflitoSubstituto({
                ...base,
                expediente: { tipo: 'normal', horaInicio: '13:00:00', horaFim: '20:00:00' }
            });

            assert.equal(conflito, 'Nao da para Joao cobrir 03/11/2026 19:00-22:00: ja trabalha das 13:00-20:00 nesse dia.');
        }
    },
    {
        name: 'ferias, folga ou ausencia de dia inteiro barram o trecho',
        run() {
            assert.match(detectarConflitoSubstituto({ ...base, ausencias: [{ Tipo: 'ferias' }] }).conflito, /tem ferias lancadas nesse dia/);
            assert.match(detectarConflitoSubstituto({ ...base, ausencias: [{ tipo: 'folga' }] }).conflito, /uma folga lancada/);
            assert.match(detectarConflitoSubstituto({ ...base, ausencias: [{ Tipo: 'licenca' }] }).conflito, /uma ausencia lancada/);
        }
    },
    {
        name: 'ausencia por horas so barra quando cruza o trecho',
        run() {
            const cruza = { Tipo: 'ausencia', PeriodoTipo: 'horas', HoraInicio: '20:00:00', HoraFim: '21:00:00' };
            const antes = { Tipo: 'ausencia', PeriodoTipo: 'horas', HoraInicio: '08:00:00', HoraFim: '10:00:00' };

            assert.match(detectarConflitoSubstituto({ ...base, ausencias: [cruza] }).conflito, /uma ausencia lancada das 20:00-21:00/);
            assert.equal(detectarConflitoSubstituto({ ...base, ausencias: [antes] }).conflito, null);
        }
    },
    {
        name: 'domingo folgado e folga compensatoria na escala barram o trecho',
        run() {
            assert.match(detectarConflitoSubstituto({ ...base, expediente: { tipo: 'domingo_folgado' } }).conflito, /folga de domingo/);
            assert.match(detectarConflitoSubstituto({ ...base, expediente: { tipo: 'folga_compensatoria' } }).conflito, /folga compensatoria/);
        }
    },
    {
        name: 'cadastro desligado barra o trecho antes de tudo',
        run() {
            const { conflito } = detectarConflitoSubstituto({ ...base, substituto: { nome: 'Joao', ativo: false }, ausencias: [{ Tipo: 'ferias' }] });

            assert.match(conflito, /cadastro esta desligado/);
        }
    },
    {
        name: 'plantao que cruza barra; o turno gerado por este mesmo trecho e ignorado',
        run() {
            const outro = { horaInicio: '18:00:00', horaFim: '20:00:00' };
            const proprio = { horaInicio: '19:00:00', horaFim: '22:00:00', coberturaTrechoId: 21 };

            assert.match(detectarConflitoSubstituto({ ...base, plantoes: [outro] }).conflito, /ja esta no plantao das 18:00-20:00/);
            // O proprio turno nao conta como conflito nem como segundo turno.
            assert.deepEqual(detectarConflitoSubstituto({ ...base, plantoes: [proprio] }), { conflito: null, segundoTurno: false });
            // Trecho ainda nao gravado (sem id) nao reconhece turno nenhum como seu.
            assert.match(
                detectarConflitoSubstituto({ ...base, trecho: { ...trecho, id: undefined }, plantoes: [proprio] }).conflito,
                /ja esta no plantao/
            );
        }
    },
    {
        name: 'plantao separado no mesmo dia e segundo turno',
        run() {
            assert.deepEqual(
                detectarConflitoSubstituto({ ...base, plantoes: [{ horaInicio: '08:00:00', horaFim: '12:00:00' }] }),
                { conflito: null, segundoTurno: true }
            );
        }
    },
    {
        name: 'outro trecho de cobertura que cruza barra; o proprio trecho e ignorado',
        run() {
            assert.match(
                detectarConflitoSubstituto({ ...base, outrosTrechos: [{ id: 30, horaInicio: '21:00:00', horaFim: '23:00:00' }] }).conflito,
                /ja cobre outro horario das 21:00-23:00/
            );
            assert.equal(detectarConflitoSubstituto({ ...base, outrosTrechos: [{ ...trecho }] }).conflito, null);
        }
    },
    {
        name: 'exigirSubstitutoSemConflito lanca 409 com o motivo',
        run() {
            assert.throws(
                () => exigirSubstitutoSemConflito({ ...base, ausencias: [{ Tipo: 'ferias' }] }),
                { statusCode: 409, message: /ferias lancadas/ }
            );
            assert.deepEqual(exigirSubstitutoSemConflito(base), { segundoTurno: false });
        }
    }
];

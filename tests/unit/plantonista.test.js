const assert = require('node:assert/strict');

const { coerceBackupPayload } = require('../../backend/services/backup-service');
const {
    HORARIO_PADRAO_SEMANA,
    aplicarHorarioPadrao,
    lerPlantonista,
    normalizarPlantonista,
    temFolgaDeDomingo
} = require('../../backend/services/plantonista');

const erro400 = (mensagem) => (erro) => erro.statusCode === 400 && mensagem.test(erro.message);

function colaboradorDoBackup(linha) {
    return coerceBackupPayload({ data: { Colaboradores: [{ Id: 1, Nome: 'Ana', ...linha }] } }).data.Colaboradores[0];
}

module.exports = [
    {
        name: 'normalizarPlantonista: sem marcar e colaborador normal, e o tipo enviado e descartado',
        run() {
            assert.deepEqual(normalizarPlantonista({}), { isPlantonista: false, tipoPlantonista: null });
            assert.deepEqual(normalizarPlantonista({ isPlantonista: false }), { isPlantonista: false, tipoPlantonista: null });
            assert.deepEqual(
                normalizarPlantonista({ isPlantonista: false, tipoPlantonista: 'SEMANA' }),
                { isPlantonista: false, tipoPlantonista: null }
            );
        }
    },
    {
        name: 'normalizarPlantonista: plantonista exige tipo valido',
        run() {
            assert.throws(() => normalizarPlantonista({ isPlantonista: true }), erro400(/tipo de plantonista/i));
            assert.throws(() => normalizarPlantonista({ isPlantonista: true, tipoPlantonista: '' }), erro400(/tipo de plantonista/i));
            assert.throws(() => normalizarPlantonista({ isPlantonista: true, tipoPlantonista: 'NOITE' }), erro400(/invalido/i));
            assert.deepEqual(
                normalizarPlantonista({ isPlantonista: true, tipoPlantonista: 'SEMANA' }),
                { isPlantonista: true, tipoPlantonista: 'SEMANA' }
            );
            assert.deepEqual(
                normalizarPlantonista({ isPlantonista: 'sim', tipoPlantonista: 'final_semana' }),
                { isPlantonista: true, tipoPlantonista: 'FINAL_SEMANA' }
            );
        }
    },
    {
        name: 'normalizarPlantonista: na edicao, campo nao enviado mantem o cadastro e deixar de ser plantonista apaga o tipo',
        run() {
            const atual = { IsPlantonista: true, TipoPlantonista: 'FINAL_SEMANA' };

            assert.deepEqual(normalizarPlantonista({ nome: 'So o nome' }, atual), { isPlantonista: true, tipoPlantonista: 'FINAL_SEMANA' });
            assert.deepEqual(
                normalizarPlantonista({ tipoPlantonista: 'SEMANA' }, atual),
                { isPlantonista: true, tipoPlantonista: 'SEMANA' }
            );
            assert.deepEqual(normalizarPlantonista({ isPlantonista: false }, atual), { isPlantonista: false, tipoPlantonista: null });
            // Quem nao era plantonista nao herda tipo nenhum ao ser marcado.
            assert.throws(() => normalizarPlantonista({ isPlantonista: true }, { IsPlantonista: false, TipoPlantonista: null }), erro400(/tipo de plantonista/i));
        }
    },
    {
        name: 'aplicarHorarioPadrao: so o plantonista de semana sem horario recebe 11:00-22:00',
        run() {
            const vazio = { trabalhoInicio: null, trabalhoFim: null };

            assert.deepEqual(aplicarHorarioPadrao('SEMANA', vazio), HORARIO_PADRAO_SEMANA);
            assert.deepEqual(HORARIO_PADRAO_SEMANA, { trabalhoInicio: '11:00', trabalhoFim: '22:00' });
            assert.deepEqual(aplicarHorarioPadrao('SEMANA', { trabalhoInicio: '08:00', trabalhoFim: '17:00' }), {
                trabalhoInicio: '08:00',
                trabalhoFim: '17:00'
            });
            // Horario pela metade e erro do usuario: nao e preenchido por cima.
            assert.deepEqual(aplicarHorarioPadrao('SEMANA', { trabalhoInicio: '09:00', trabalhoFim: null }), {
                trabalhoInicio: '09:00',
                trabalhoFim: null
            });
            assert.deepEqual(aplicarHorarioPadrao('FINAL_SEMANA', vazio), vazio);
            assert.deepEqual(aplicarHorarioPadrao(null, vazio), vazio);
        }
    },
    {
        name: 'temFolgaDeDomingo: so plantonista de final de semana (linha do banco ou payload)',
        run() {
            assert.equal(temFolgaDeDomingo({ IsPlantonista: true, TipoPlantonista: 'FINAL_SEMANA' }), true);
            assert.equal(temFolgaDeDomingo({ isPlantonista: true, tipoPlantonista: 'FINAL_SEMANA' }), true);
            assert.equal(temFolgaDeDomingo({ IsPlantonista: true, TipoPlantonista: 'SEMANA' }), false);
            assert.equal(temFolgaDeDomingo({ IsPlantonista: false, TipoPlantonista: 'FINAL_SEMANA' }), false);
            assert.equal(temFolgaDeDomingo({ Nome: 'Linha antiga, sem os campos' }), false);
            assert.equal(temFolgaDeDomingo(null), false);
        }
    },
    {
        name: 'lerPlantonista ignora o tipo de quem nao e plantonista',
        run() {
            assert.deepEqual(lerPlantonista({ IsPlantonista: false, TipoPlantonista: 'SEMANA' }), {
                isPlantonista: false,
                tipoPlantonista: null
            });
            assert.deepEqual(lerPlantonista(undefined), { isPlantonista: false, tipoPlantonista: null });
        }
    },
    {
        name: 'backup: plantonista e tipo vao e voltam; quem nao e plantonista perde o tipo',
        run() {
            const plantonista = colaboradorDoBackup({ IsPlantonista: true, TipoPlantonista: 'SEMANA' });
            assert.equal(plantonista.IsPlantonista, true);
            assert.equal(plantonista.TipoPlantonista, 'SEMANA');

            const normal = colaboradorDoBackup({ IsPlantonista: false, TipoPlantonista: 'SEMANA' });
            assert.equal(normal.IsPlantonista, false);
            assert.equal(normal.TipoPlantonista, null);

            const nulo = colaboradorDoBackup({ IsPlantonista: null });
            assert.equal(nulo.IsPlantonista, false);
        }
    },
    {
        name: 'backup inconsistente (plantonista sem tipo ou tipo invalido) e recusado com mensagem',
        run() {
            assert.throws(
                () => colaboradorDoBackup({ IsPlantonista: true }),
                erro400(/plantonista sem tipo/i)
            );
            assert.throws(() => colaboradorDoBackup({ IsPlantonista: true, TipoPlantonista: 'NOITE' }), erro400(/invalido/i));
        }
    },
    {
        // O restore deriva os plantonistas so quando NENHUM colaborador traz o campo.
        name: 'backup antigo, sem os campos de plantonista, continua restauravel e fica sem valor para derivar',
        run() {
            const colaborador = colaboradorDoBackup({ TipoEscalaId: 4 });

            assert.equal(colaborador.IsPlantonista, undefined);
            assert.equal(colaborador.TipoPlantonista, undefined);
            assert.equal(colaborador.TipoEscalaId, 4);
        }
    }
];

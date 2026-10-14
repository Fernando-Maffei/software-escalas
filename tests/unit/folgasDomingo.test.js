const assert = require('node:assert/strict');

const { normalizeFolgaDomingoPayload } = require('../../backend/services/folgas-domingo');
const {
    createCoberturaEscalaRecord,
    createDomingoFolgadoEscalaRecord,
    createReposicaoEscalaRecord
} = require('../../backend/services/escala');

// 25/10/2026 e domingo; 29/10 e quinta.
const BASE = {
    colaboradorId: 3,
    dataDomingo: '2026-10-25',
    dataReposicao: '2026-10-29',
    reposicaoHoraInicio: '08:00',
    reposicaoHoraFim: '17:00',
    reposicaoAlmocoInicio: '12:00',
    reposicaoAlmocoFim: '13:00'
};

const MARIA = { Id: 3, Nome: 'Maria', SetorId: 2, SetorNome: 'Suporte N1' };

module.exports = [
    {
        name: 'normalizeFolgaDomingoPayload aceita o evento completo',
        run() {
            const payload = normalizeFolgaDomingoPayload(BASE);

            assert.equal(payload.dataDomingo, '2026-10-25');
            assert.equal(payload.dataReposicao, '2026-10-29');
            assert.equal(payload.reposicaoHoraInicio, '08:00:00');
            assert.equal(payload.reposicaoAlmocoInicio, '12:00:00');
            assert.equal(payload.reposicaoAlmocoFim, '13:00:00');
        }
    },
    {
        // O banco tambem barra (CK_FolgasDomingo_EhDomingo), mas la a mensagem
        // seria um erro de constraint.
        name: 'normalizeFolgaDomingoPayload recusa data que nao e domingo',
        run() {
            assert.throws(
                () => normalizeFolgaDomingoPayload({ ...BASE, dataDomingo: '2026-10-26' }),
                /nao e um domingo/i
            );
        }
    },
    {
        // O dia reposto e um dia que a jornada marca como folga: nao existe
        // horario padrao de onde puxar para montar a linha de escala.
        name: 'normalizeFolgaDomingoPayload exige horario quando ha reposicao',
        run() {
            assert.throws(
                () => normalizeFolgaDomingoPayload({
                    ...BASE,
                    reposicaoHoraInicio: null,
                    reposicaoHoraFim: null
                }),
                /hora inicial e a final da reposicao/i
            );

            assert.throws(
                () => normalizeFolgaDomingoPayload({
                    ...BASE,
                    reposicaoHoraInicio: '17:00',
                    reposicaoHoraFim: '08:00'
                }),
                /hora inicial da reposicao deve ser menor/i
            );
        }
    },
    {
        name: 'normalizeFolgaDomingoPayload aceita folga ainda sem reposicao marcada',
        run() {
            const payload = normalizeFolgaDomingoPayload({
                colaboradorId: 3,
                dataDomingo: '2026-10-25'
            });

            assert.equal(payload.dataReposicao, null);
            // Horario so faz sentido junto da data; sem ela nao fica dado solto.
            assert.equal(payload.reposicaoHoraInicio, null);
            assert.equal(payload.reposicaoAlmocoInicio, null);
        }
    },
    {
        name: 'normalizeFolgaDomingoPayload recusa repor no proprio domingo folgado',
        run() {
            assert.throws(
                () => normalizeFolgaDomingoPayload({ ...BASE, dataReposicao: '2026-10-25' }),
                /nao pode cair no proprio domingo/i
            );
        }
    },
    {
        name: 'createDomingoFolgadoEscalaRecord zera o horario e aponta para a folga',
        run() {
            const registro = createDomingoFolgadoEscalaRecord(MARIA, {
                id: 12,
                dataDomingo: '2026-10-25',
                observacao: 'Escala do mes'
            });

            assert.equal(registro.tipo, 'domingo_folgado');
            assert.equal(registro.dataISO, '2026-10-25');
            assert.equal(registro.horaInicio, null);
            assert.equal(registro.horaFim, null);
            assert.equal(registro.origemTipo, 'folga_domingo');
            assert.equal(registro.origemId, 12);
            assert.match(registro.observacao, /Domingo de folga/);
            assert.match(registro.observacao, /Escala do mes/);
        }
    },
    {
        // A linha da reposicao guarda no texto de qual domingo ela veio: e o
        // vinculo visivel para quem so olha a escala do dia.
        name: 'createReposicaoEscalaRecord leva horario e almoco para os campos normais da escala',
        run() {
            const registro = createReposicaoEscalaRecord(MARIA, {
                id: 12,
                dataDomingo: '2026-10-25',
                dataReposicao: '2026-10-29',
                reposicaoHoraInicio: '08:00',
                reposicaoHoraFim: '17:00',
                reposicaoAlmocoInicio: '12:00',
                reposicaoAlmocoFim: '13:00'
            });

            assert.equal(registro.tipo, 'reposicao');
            assert.equal(registro.dataISO, '2026-10-29');
            assert.equal(registro.horaInicio, '08:00:00');
            assert.equal(registro.horaFim, '17:00:00');
            // almocoInicio/almocoFim sao os MESMOS campos de todo almoco do
            // sistema: e por isso que listagens e relatorios pegam sozinhos.
            assert.equal(registro.almocoInicio, '12:00:00');
            assert.equal(registro.almocoFim, '13:00:00');
            assert.equal(registro.origemTipo, 'folga_domingo');
            assert.match(registro.observacao, /Reposicao do domingo 2026-10-25/);
        }
    },
    {
        name: 'createReposicaoEscalaRecord deixa o almoco nulo quando nao foi lancado',
        run() {
            const registro = createReposicaoEscalaRecord(MARIA, {
                id: 12,
                dataDomingo: '2026-10-25',
                dataReposicao: '2026-10-29',
                reposicaoHoraInicio: '08:00',
                reposicaoHoraFim: '17:00'
            });

            assert.equal(registro.almocoInicio, null);
            assert.equal(registro.almocoFim, null);
        }
    },
    {
        // Mesma regra do resto do sistema: almoco vem aos pares e cabe dentro
        // da jornada (validateWorkSchedule / CK da jornada semanal).
        name: 'normalizeFolgaDomingoPayload valida o almoco da reposicao',
        run() {
            assert.throws(
                () => normalizeFolgaDomingoPayload({ ...BASE, reposicaoAlmocoFim: null }),
                /inicio e o fim do almoco/i
            );

            assert.throws(
                () => normalizeFolgaDomingoPayload({
                    ...BASE,
                    reposicaoAlmocoInicio: '13:00',
                    reposicaoAlmocoFim: '12:00'
                }),
                /inicio do almoco da reposicao deve ser menor/i
            );

            // 07:00 comeca antes da jornada (08:00-17:00).
            assert.throws(
                () => normalizeFolgaDomingoPayload({
                    ...BASE,
                    reposicaoAlmocoInicio: '07:00',
                    reposicaoAlmocoFim: '08:30'
                }),
                /dentro do horario de trabalho/i
            );

            // Almoco sem data de reposicao seria dado solto.
            assert.throws(
                () => normalizeFolgaDomingoPayload({
                    colaboradorId: 3,
                    dataDomingo: '2026-10-25',
                    reposicaoAlmocoInicio: '12:00',
                    reposicaoAlmocoFim: '13:00'
                }),
                /data da reposicao antes de lancar o almoco/i
            );
        }
    },
    {
        // A origem continua sendo o plantao: apagar a folga faz a proxima
        // geracao nao reclassificar, e a linha volta a ser plantao sozinha.
        name: 'createCoberturaEscalaRecord preserva horario e origem do plantao',
        run() {
            const linhaDoPlantao = {
                colaboradorId: 7,
                colaboradorNome: 'Joao',
                dataISO: '2026-10-25',
                horaInicio: '13:00:00',
                horaFim: '22:00:00',
                tipo: 'plantao',
                observacao: 'Turno da tarde',
                origemTipo: 'plantao',
                origemId: 42
            };

            const registro = createCoberturaEscalaRecord(linhaDoPlantao, ['Maria']);

            assert.equal(registro.tipo, 'cobertura');
            assert.equal(registro.horaInicio, '13:00:00');
            assert.equal(registro.horaFim, '22:00:00');
            assert.equal(registro.origemTipo, 'plantao');
            assert.equal(registro.origemId, 42);
            assert.match(registro.observacao, /Cobrindo Maria/);
            assert.match(registro.observacao, /Turno da tarde/);
        }
    },
    {
        // Nao ha mais campo "quem cobriu": quem esta lancado no domingo cobre
        // o posto de TODOS os que folgaram, entao a observacao lista todos.
        name: 'createCoberturaEscalaRecord lista todos os folguistas do domingo',
        run() {
            const linha = { dataISO: '2026-10-25', tipo: 'plantao', observacao: null };

            assert.match(
                createCoberturaEscalaRecord(linha, ['Maria', 'Joao']).observacao,
                /Cobrindo Maria, Joao/
            );

            // Domingo sem nome resolvido (colaborador desligado, por exemplo)
            // ainda marca cobertura, so sem citar ninguem.
            assert.equal(
                createCoberturaEscalaRecord(linha, []).observacao,
                'Cobertura de domingo'
            );
        }
    }
];

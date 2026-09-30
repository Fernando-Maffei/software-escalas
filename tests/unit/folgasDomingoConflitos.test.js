const assert = require('node:assert/strict');

const { detectarConflitoReposicao } = require('../../backend/services/folgas-domingo-conflitos');

const base = { colaboradorNome: 'Marcos', dataReposicao: '2026-10-22' };

module.exports = [
    {
        name: 'reposicao sem ausencia nem ajuste manual nao tem conflito',
        run() {
            assert.equal(detectarConflitoReposicao(base), null);
            assert.equal(detectarConflitoReposicao({ ...base, ausencias: [], temAjusteManual: false }), null);
        }
    },
    {
        name: 'reposicao em dia de ferias e recusada dizendo o motivo e a data',
        run() {
            const mensagem = detectarConflitoReposicao({ ...base, ausencias: [{ Tipo: 'ferias' }] });

            assert.match(mensagem, /22\/10\/2026/);
            assert.match(mensagem, /Marcos tem ferias lancadas/);
            assert.match(mensagem, /Escolha outra data/);
        }
    },
    {
        name: 'reposicao em dia de ausencia ou folga usa o rotulo do tipo',
        run() {
            assert.match(detectarConflitoReposicao({ ...base, ausencias: [{ Tipo: 'ausencia' }] }), /uma ausencia lancada/);
            assert.match(detectarConflitoReposicao({ ...base, ausencias: [{ tipo: 'folga' }] }), /uma folga lancada/);
            // Tipo desconhecido cai no rotulo generico em vez de virar "undefined".
            assert.match(detectarConflitoReposicao({ ...base, ausencias: [{ Tipo: 'licenca' }] }), /uma ausencia lancada/);
        }
    },
    {
        name: 'reposicao sobre ajuste manual e recusada e manda remover o ajuste',
        run() {
            const mensagem = detectarConflitoReposicao({ ...base, temAjusteManual: true });

            assert.match(mensagem, /ajustada a mao/);
            assert.match(mensagem, /Escala do Dia/);
        }
    },
    {
        // A prioridade e fixa: quem nao esta (ferias) vence o ajuste manual,
        // senao a mensagem mandaria remover um ajuste que nem resolveria.
        name: 'ausencia tem prioridade sobre ajuste manual na mensagem',
        run() {
            const mensagem = detectarConflitoReposicao({
                ...base,
                ausencias: [{ Tipo: 'ferias' }],
                temAjusteManual: true
            });

            assert.match(mensagem, /ferias lancadas/);
            assert.doesNotMatch(mensagem, /ajustada a mao/);
        }
    },
    {
        name: 'sem nome do colaborador a mensagem continua legivel',
        run() {
            const mensagem = detectarConflitoReposicao({ dataReposicao: '2026-10-22', ausencias: [{ Tipo: 'ferias' }] });

            assert.match(mensagem, /O colaborador tem ferias lancadas/);
        }
    }
];

const assert = require('assert');

const { createRateLimiter } = require('../../backend/auth/rate-limit');

function comRelogio() {
    let agora = 1000000;
    return {
        now: () => agora,
        avancar: (ms) => { agora += ms; }
    };
}

module.exports = [
    {
        name: 'rate-limit libera enquanto abaixo do limite de tentativas',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 5, now: relogio.now });

            for (let i = 0; i < 4; i += 1) {
                rl.registerFailure('ip|user');
                assert.strictEqual(rl.check('ip|user').blocked, false, `tentativa ${i + 1} nao deveria bloquear`);
            }
        }
    },
    {
        name: 'rate-limit bloqueia ao atingir o limite',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 5, blockMs: 60000, now: relogio.now });

            for (let i = 0; i < 5; i += 1) {
                rl.registerFailure('ip|user');
            }

            const estado = rl.check('ip|user');
            assert.strictEqual(estado.blocked, true);
            assert.ok(estado.retryAfterMs > 0);
        }
    },
    {
        name: 'rate-limit libera de novo depois que o bloqueio expira',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 3, blockMs: 60000, now: relogio.now });

            for (let i = 0; i < 3; i += 1) {
                rl.registerFailure('ip|user');
            }
            assert.strictEqual(rl.check('ip|user').blocked, true);

            relogio.avancar(60001);
            assert.strictEqual(rl.check('ip|user').blocked, false);
        }
    },
    {
        name: 'rate-limit reinicia a contagem apos a janela deslizante',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 3, windowMs: 10000, blockMs: 60000, now: relogio.now });

            // 2 falhas, depois espera a janela passar: nao deve acumular.
            rl.registerFailure('ip|user');
            rl.registerFailure('ip|user');
            relogio.avancar(10001);

            // Mais 2 falhas: como a contagem reiniciou, ainda nao bloqueia.
            rl.registerFailure('ip|user');
            const estado = rl.registerFailure('ip|user');
            assert.strictEqual(estado.blocked, false);
            assert.strictEqual(estado.attempts, 2);
        }
    },
    {
        name: 'rate-limit reset limpa o historico da chave',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 3, now: relogio.now });

            rl.registerFailure('ip|user');
            rl.registerFailure('ip|user');
            rl.reset('ip|user');

            // Apos o reset, precisa de mais 3 falhas para bloquear de novo.
            rl.registerFailure('ip|user');
            rl.registerFailure('ip|user');
            assert.strictEqual(rl.check('ip|user').blocked, false);
        }
    },
    {
        name: 'rate-limit isola chaves diferentes',
        run() {
            const relogio = comRelogio();
            const rl = createRateLimiter({ maxAttempts: 3, now: relogio.now });

            for (let i = 0; i < 3; i += 1) {
                rl.registerFailure('ip1|user');
            }

            assert.strictEqual(rl.check('ip1|user').blocked, true);
            assert.strictEqual(rl.check('ip2|user').blocked, false, 'outra chave nao deveria ser afetada');
        }
    }
];

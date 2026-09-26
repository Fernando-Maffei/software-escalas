// Limitador de tentativas em memoria, para conter forca bruta no login sem
// adicionar dependencia externa. Conta tentativas por chave (IP + usuario)
// numa janela deslizante e bloqueia por um tempo ao estourar o limite.
//
// Escopo: e um processo unico na rede local. Em memoria basta — nao ha varios
// nos para compartilhar estado. Ao reiniciar o servidor a contagem zera, o
// que e aceitavel para o cenario.

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;   // 15 min para acumular tentativas
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;    // 15 min de bloqueio ao estourar
// Acima deste numero de chaves, cada falha nova varre as expiradas. Sem isso,
// chaves que nunca mais voltam (IPs e usuarios aleatorios) ficavam no Map para
// sempre.
const DEFAULT_SWEEP_THRESHOLD = 1000;

function createRateLimiter(options = {}) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const blockMs = options.blockMs ?? DEFAULT_BLOCK_MS;
    const sweepThreshold = options.sweepThreshold ?? DEFAULT_SWEEP_THRESHOLD;
    // Injetavel para os testes controlarem o tempo sem esperar de verdade.
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    const entries = new Map();

    // Expirado por completo: fora da janela e sem bloqueio ativo.
    function isExpired(entry, instant) {
        return entry.blockedUntil <= instant && entry.firstAttempt + windowMs <= instant;
    }

    function getEntry(key) {
        const entry = entries.get(key);

        if (!entry) {
            return null;
        }

        if (isExpired(entry, now())) {
            entries.delete(key);
            return null;
        }

        return entry;
    }

    function sweepExpired() {
        const instant = now();

        for (const [key, entry] of entries) {
            if (isExpired(entry, instant)) {
                entries.delete(key);
            }
        }
    }

    // Chamado ANTES de validar a senha. Retorna { blocked, retryAfterMs }.
    function check(key) {
        const entry = getEntry(key);

        if (entry && entry.blockedUntil > now()) {
            return { blocked: true, retryAfterMs: entry.blockedUntil - now() };
        }

        return { blocked: false, retryAfterMs: 0 };
    }

    // Chamado quando a tentativa FALHA. Incrementa e, ao atingir o limite,
    // arma o bloqueio. Retorna o estado resultante.
    function registerFailure(key) {
        const instant = now();

        if (entries.size >= sweepThreshold) {
            sweepExpired();
        }

        let entry = getEntry(key);

        if (!entry) {
            entry = { count: 0, firstAttempt: instant, blockedUntil: 0 };
            entries.set(key, entry);
        }

        // Janela deslizante: se a primeira tentativa ja saiu da janela,
        // recomeca a contagem a partir de agora.
        if (entry.firstAttempt + windowMs <= instant) {
            entry.count = 0;
            entry.firstAttempt = instant;
        }

        entry.count += 1;

        if (entry.count >= maxAttempts) {
            entry.blockedUntil = instant + blockMs;
        }

        return {
            blocked: entry.blockedUntil > instant,
            retryAfterMs: Math.max(0, entry.blockedUntil - instant),
            attempts: entry.count
        };
    }

    // Chamado quando a tentativa da CERTO: limpa o historico da chave.
    function reset(key) {
        entries.delete(key);
    }

    return {
        check,
        registerFailure,
        reset,
        size: () => entries.size,
        maxAttempts,
        windowMs,
        blockMs
    };
}

module.exports = { createRateLimiter };

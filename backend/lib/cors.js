// Politica de CORS: mesma origem sempre; outras origens so as listadas em
// CORS_ORIGINS. Por padrao toda origem cross-site e recusada, para nao expor a
// sessao autenticada a sites de terceiros.
const { AppError } = require('./errors');

const CORS_ORIGINS_ENV = 'CORS_ORIGINS';

function normalizeCorsOrigin(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return null;
    }

    try {
        const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
        return url.origin;
    } catch (error) {
        return null;
    }
}

function parseCorsOrigins(value) {
    return new Set(
        String(value || '')
            .split(',')
            .map(normalizeCorsOrigin)
            .filter(Boolean)
    );
}

const configuredCorsOrigins = parseCorsOrigins(process.env[CORS_ORIGINS_ENV]);

function getCorsStatus() {
    return {
        mode: configuredCorsOrigins.size > 0 ? 'restricted' : 'same-origin-only',
        allowedOrigins: [...configuredCorsOrigins]
    };
}

function isSameOriginRequest(req, origin) {
    if (!origin) {
        return true;
    }

    try {
        const requestHost = req.get('host');
        return Boolean(requestHost) && new URL(origin).host === requestHost;
    } catch (error) {
        return false;
    }
}

function corsOptionsDelegate(req, callback) {
    // Navegadores modernos enviam o header "Origin" mesmo em requisicoes de
    // mesma origem (ex: POST do proprio front-end). Por isso comparamos o
    // Origin recebido contra o Host da propria requisicao — e nao apenas
    // contra a allowlist — antes de decidir se e uma chamada same-origin.
    // Origens cross-site só são liberadas se estiverem na allowlist explicita
    // de CORS_ORIGINS; por padrao (allowlist vazia) toda origem cross-site e
    // negada, para nao expor a sessao autenticada a sites de terceiros.
    const origin = req.header('Origin') || null;

    if (isSameOriginRequest(req, origin) || configuredCorsOrigins.has(origin)) {
        callback(null, { origin: true, credentials: true });
        return;
    }

    callback(new AppError(403, 'Origem nao autorizada para acessar a API.'));
}

module.exports = {
    corsOptionsDelegate,
    getCorsStatus,
    parseCorsOrigins
};

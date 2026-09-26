// IP de quem fez a requisicao, para o limite de tentativas de login e para a
// tela de rede.
//
// O cabecalho X-Forwarded-For e escrito pelo CLIENTE, entao so vale quando ha
// um proxy reverso de confianca na frente (nginx, IIS, Caddy) — e isso tem que
// ser dito explicitamente em TRUST_PROXY. Sem isso, usar o cabecalho deixava
// qualquer um trocar de "IP" a cada tentativa e nunca cair no bloqueio.
//
// TRUST_PROXY aceita o que o Express aceita em 'trust proxy':
//   (vazio)          nao confia em proxy nenhum (padrao)
//   true             confia em qualquer salto (so com a porta do app fechada)
//   1, 2, ...        quantos saltos de proxy confiar
//   loopback, 10.0.0.0/8, 192.168.1.10   enderecos/sub-redes dos proxies
function parseTrustProxy(valor) {
    const bruto = String(valor ?? '').trim();

    if (!bruto || /^(false|0|nao|não|no)$/i.test(bruto)) {
        return false;
    }

    // Confia em qualquer salto. So faz sentido se a porta do app NAO for
    // alcancavel sem passar pelo proxy.
    if (/^(true|sim|yes)$/i.test(bruto)) {
        return true;
    }

    if (/^\d+$/.test(bruto)) {
        return Number(bruto);
    }

    return bruto
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

// Depende de app.set('trust proxy', ...): com proxy confiavel o Express ja
// resolve req.ip a partir do X-Forwarded-For; sem, req.ip e o socket.
function getClientIp(req) {
    const bruto = req.ip || req.socket?.remoteAddress || '';
    return String(bruto).replace(/^::ffff:/, '');
}

module.exports = {
    getClientIp,
    parseTrustProxy
};

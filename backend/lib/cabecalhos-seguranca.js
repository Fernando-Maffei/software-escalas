// Cabecalhos de seguranca de toda resposta (paginas e API).
//
// Sem dependencia externa (helmet): sao quatro linhas e o que cada uma faz
// fica explicito aqui.
//   - nosniff: o navegador nao "adivinha" tipo de arquivo (um JSON nunca vira
//     script);
//   - frame-ancestors/X-Frame-Options: o sistema nao pode ser embutido em
//     iframe de outro site (clickjacking). 'self' mantem as pre-visualizacoes
//     internas de relatorio funcionando;
//   - Referrer-Policy: URLs internas nao vazam para sites externos (CDN).
// Nao ha Content-Security-Policy de script porque as telas usam onclick
// inline em muitos lugares; isso esta registrado no AUDITORIA.md.
function cabecalhosDeSeguranca(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
}

module.exports = {
    cabecalhosDeSeguranca
};

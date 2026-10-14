// Cabecalhos de seguranca de toda resposta (paginas e API).
//
// Sem dependencia externa (helmet): sao poucas linhas e o que cada uma faz
// fica explicito aqui.
//   - nosniff: o navegador nao "adivinha" tipo de arquivo (um JSON nunca vira
//     script);
//   - frame-ancestors/X-Frame-Options: o sistema nao pode ser embutido em
//     iframe de outro site (clickjacking). 'self' mantem as pre-visualizacoes
//     internas de relatorio funcionando;
//   - Referrer-Policy: URLs internas nao vazam para sites externos (CDN);
//   - Content-Security-Policy de script (abaixo).

// So roda script vindo de arquivo do proprio servidor e das duas bibliotecas
// de PDF, cada uma pelo endereco exato (liberar o cdnjs inteiro deixaria
// carregar qualquer outra biblioteca hospedada la). Isso proibe script em
// atributo (onclick="..."), <script> inline, javascript: e eval — um texto
// injetado na pagina nao roda, mesmo que algum escape falhe. Os botoes de
// template usam data-chamar (frontend/js/lib/atributos-acao.js).
//
// Estilo, fonte, imagem e conexao ficam livres de proposito: a politica cobre
// o que executa codigo, sem arriscar quebrar o visual.
const SCRIPTS_EXTERNOS = Object.freeze([
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
]);

const POLITICA_DE_CONTEUDO = [
    `script-src 'self' ${SCRIPTS_EXTERNOS.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'"
].join('; ');

function cabecalhosDeSeguranca(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', POLITICA_DE_CONTEUDO);
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
}

module.exports = {
    POLITICA_DE_CONTEUDO,
    SCRIPTS_EXTERNOS,
    cabecalhosDeSeguranca
};

// Escape de texto para interpolar em HTML (innerHTML, atributos entre aspas).
//
// Unico para o sistema inteiro: antes havia nove copias com nomes diferentes
// (escapeHtml, escapeHtmlEscala, esc, ...), uma delas sem escapar aspas
// simples, e varias telas antigas interpolavam nome de colaborador direto no
// innerHTML — um nome com HTML executava no navegador de todo mundo.
//
// Modulo ES: o navegador importa, e os testes no Node tambem (require de ESM).

const ENTIDADES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere]);
}

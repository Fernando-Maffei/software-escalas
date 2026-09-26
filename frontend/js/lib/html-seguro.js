// Escape de texto para interpolar em HTML (innerHTML, atributos entre aspas).
//
// Unico para o sistema inteiro: antes havia nove copias com nomes diferentes
// (escapeHtml, escapeHtmlEscala, esc, ...), uma delas sem escapar aspas
// simples, e varias telas antigas interpolavam nome de colaborador direto no
// innerHTML — um nome com HTML executava no navegador de todo mundo.
//
// UMD: no navegador vira o global escapeHtml; no Node (testes) e um modulo.
(function criarHtmlSeguro(raiz, fabrica) {
    const modulo = fabrica();

    if (typeof module === 'object' && module.exports) {
        module.exports = modulo;
        return;
    }

    raiz.escapeHtml = modulo.escapeHtml;
})(typeof globalThis !== 'undefined' ? globalThis : this, function montarHtmlSeguro() {
    const ENTIDADES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere]);
    }

    return { escapeHtml };
});

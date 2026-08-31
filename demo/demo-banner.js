/* Faixa fixa avisando que e demonstracao.
 * Injetada por JS para nao precisar editar o index.html real do sistema. */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const estilo = document.createElement('style');
        estilo.textContent = `
            .demo-aviso {
                position: fixed; inset: auto 0 0 0; z-index: 9999;
                display: flex; align-items: center; justify-content: center;
                gap: 10px; padding: 9px 16px;
                background: #1d4ed8; color: #fff;
                font: 600 13px/1.3 Inter, system-ui, sans-serif;
                text-align: center;
            }
            .demo-aviso strong { font-weight: 800; }
            .demo-aviso span { opacity: 0.9; font-weight: 500; }
            @media (max-width: 700px) { .demo-aviso { font-size: 12px; } }
        `;
        document.head.appendChild(estilo);

        const faixa = document.createElement('div');
        faixa.className = 'demo-aviso';
        faixa.innerHTML = '<strong>Demonstração</strong>'
            + '<span>Dados fictícios, sem banco de dados — alterações não são salvas.</span>';
        document.body.appendChild(faixa);
    });
})();

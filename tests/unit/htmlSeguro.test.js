const assert = require('node:assert/strict');

const { escapeHtml } = require('../../frontend/js/lib/html-seguro');

module.exports = [
    {
        name: 'escapeHtml neutraliza tags, atributos e entidades',
        run() {
            assert.equal(
                escapeHtml('<img src=x onerror="alert(1)">'),
                '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
            );
            assert.equal(escapeHtml("O'Neil & Cia"), 'O&#39;Neil &amp; Cia');
            assert.equal(escapeHtml('&amp;'), '&amp;amp;');
        }
    },
    {
        name: 'escapeHtml trata vazio e numero sem quebrar',
        run() {
            assert.equal(escapeHtml(null), '');
            assert.equal(escapeHtml(undefined), '');
            assert.equal(escapeHtml(0), '0');
            assert.equal(escapeHtml('Joao Silva'), 'Joao Silva');
        }
    }
];

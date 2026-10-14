const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { POLITICA_DE_CONTEUDO, cabecalhosDeSeguranca } = require('../../backend/lib/cabecalhos-seguranca');

const RAIZ = path.join(__dirname, '..', '..');

// O navegador decodifica as entidades do atributo antes de entregar o valor
// ao dataset; aqui o mesmo, para conferir o que a acao recebe.
function lerAtributo(html, nome) {
    const achado = html.match(new RegExp(`${nome}="([^"]*)"`));
    assert.ok(achado, `atributo ${nome} ausente em: ${html}`);
    return achado[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function arquivosDoFrontend(pasta) {
    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
        const caminho = path.join(pasta, entrada.name);
        return entrada.isDirectory() ? arquivosDoFrontend(caminho) : [caminho];
    });
}

module.exports = [
    {
        // T19: o nome ia escapado para HTML dentro de uma string JS num onclick;
        // o navegador desfazia o escape e o nome fechava a string.
        name: 'atributosAcao devolve os argumentos exatos, inclusive nome com aspas e barra',
        async run() {
            const { atributosAcao } = await import('../../frontend/js/lib/atributos-acao.js');
            const nomes = ["Ana'); alert(1); ('", 'Joao "Zé" <b>&amp;</b>', 'barra \\ no fim\\'];

            for (const nome of nomes) {
                const html = `<button ${atributosAcao('abrirDesligarColaborador', 7, nome)}>`;

                assert.doesNotMatch(html, /onclick/);
                assert.equal(lerAtributo(html, 'data-chamar'), 'abrirDesligarColaborador');
                assert.deepEqual(JSON.parse(lerAtributo(html, 'data-args')), [7, nome]);
                // O valor do atributo nao tem aspas cruas: nada sai dele.
                assert.equal((html.match(/"/g) || []).length, 4);
            }

            assert.deepEqual(JSON.parse(lerAtributo(`<b ${atributosAcao('x', null, '2026-10-14')}>`, 'data-args')), [
                null,
                '2026-10-14'
            ]);
            assert.deepEqual(JSON.parse(lerAtributo(`<b ${atributosAcao('fecharEditor')}>`, 'data-args')), []);
        }
    },
    {
        name: 'politica de conteudo proibe script inline e eval e so libera os scripts do proprio servidor e os dois do CDN',
        run() {
            const cabecalhos = {};
            cabecalhosDeSeguranca({}, { setHeader: (nome, valor) => (cabecalhos[nome] = valor) }, () => {});

            const politica = cabecalhos['Content-Security-Policy'];
            assert.equal(politica, POLITICA_DE_CONTEUDO);
            assert.doesNotMatch(politica, /unsafe-inline|unsafe-eval|\*/);

            const scriptSrc = politica.split(';').find((diretiva) => diretiva.trim().startsWith('script-src'));
            assert.deepEqual(scriptSrc.trim().split(/\s+/).slice(1), [
                "'self'",
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
            ]);
            assert.match(politica, /object-src 'none'/);
            assert.match(politica, /frame-ancestors 'self'/);
        }
    },
    {
        name: 'os scripts externos das paginas sao exatamente os liberados na politica',
        run() {
            for (const pagina of ['frontend/index.html', 'demo/index.html']) {
                const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
                const externos = [...html.matchAll(/<script[^>]*\ssrc="(https?:[^"]+)"/g)].map((achado) => achado[1]);

                for (const url of externos) {
                    assert.ok(POLITICA_DE_CONTEUDO.includes(url), `${pagina}: ${url} seria bloqueado pela CSP`);
                }

                assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, `${pagina}: <script> inline seria bloqueado`);
            }
        }
    },
    {
        // A demo publica (Vercel) nao passa pelo Express: a politica vai no
        // vercel.json e precisa ser a mesma.
        name: 'vercel.json manda a mesma politica de conteudo do servidor',
        run() {
            const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
            const valores = vercel.headers
                .flatMap((regra) => regra.headers)
                .filter((cabecalho) => cabecalho.key === 'Content-Security-Policy')
                .map((cabecalho) => cabecalho.value);

            assert.deepEqual(valores, [POLITICA_DE_CONTEUDO]);
        }
    },
    {
        // Barreira: a CSP derruba qualquer on*="..." (o botao para de funcionar
        // em silencio). Botao de template usa atributosAcao.
        name: 'frontend nao tem atributo de evento inline (onclick, onchange...)',
        run() {
            const arquivos = [
                ...arquivosDoFrontend(path.join(RAIZ, 'frontend', 'js')),
                path.join(RAIZ, 'frontend', 'index.html'),
                path.join(RAIZ, 'demo', 'index.html')
            ].filter((arquivo) => /\.(js|html)$/.test(arquivo));
            const achados = [];

            for (const arquivo of arquivos) {
                fs.readFileSync(arquivo, 'utf8')
                    .split('\n')
                    .forEach((linha, indice) => {
                        if (/\son[a-z]+\s*=\s*["']/i.test(linha) && !/^\s*\/\//.test(linha)) {
                            achados.push(`${path.relative(RAIZ, arquivo)}:${indice + 1}`);
                        }
                    });
            }

            assert.deepEqual(achados, []);
        }
    }
];

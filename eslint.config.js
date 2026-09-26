// Linter do projeto (npm run lint).
//
// Backend, testes e scripts sao CommonJS no Node. O frontend nao tem bundler:
// sao <script> classicos que dividem um unico escopo global (ver
// frontend/index.html). Por isso os globais do frontend nao sao "desligados":
// sao CALCULADOS a partir dos proprios arquivos (funcoes e variaveis de topo e
// atribuicoes window.X = ...). Uma referencia a algo que nenhum arquivo
// declara continua sendo erro de no-undef — que e o bug que interessa pegar.
const fs = require('fs');
const path = require('path');

const js = require('@eslint/js');
const espree = require('espree');
const globals = require('globals');

const RAIZ = __dirname;
const PASTAS_FRONT = ['frontend/js', 'demo'];

function listarJs(pasta) {
    if (!fs.existsSync(pasta)) {
        return [];
    }

    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
        const caminho = path.join(pasta, entrada.name);

        if (entrada.isDirectory()) {
            return listarJs(caminho);
        }

        return entrada.name.endsWith('.js') ? [caminho] : [];
    });
}

function nomesDoPadrao(padrao) {
    if (!padrao) {
        return [];
    }

    switch (padrao.type) {
        case 'Identifier':
            return [padrao.name];
        case 'ObjectPattern':
            return padrao.properties.flatMap((prop) =>
                nomesDoPadrao(prop.type === 'RestElement' ? prop.argument : prop.value)
            );
        case 'ArrayPattern':
            return padrao.elements.flatMap(nomesDoPadrao);
        case 'AssignmentPattern':
            return nomesDoPadrao(padrao.left);
        case 'RestElement':
            return nomesDoPadrao(padrao.argument);
        default:
            return [];
    }
}

// Nomes que viram globais no navegador: declaracoes no escopo de topo do
// arquivo (lidas pelo parser, nao por regex — os arquivos divididos do antigo
// runtime-fixes.js tem declaracoes de topo indentadas) e atribuicoes window.X.
function coletarGlobaisDoFront() {
    const nomes = new Set();
    const janela = /\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

    PASTAS_FRONT.flatMap((pasta) => listarJs(path.join(RAIZ, pasta))).forEach((arquivo) => {
        const texto = fs.readFileSync(arquivo, 'utf8');
        const programa = espree.parse(texto, { ecmaVersion: 2023, sourceType: 'script' });

        programa.body.forEach((no) => {
            if (no.type === 'FunctionDeclaration' || no.type === 'ClassDeclaration') {
                nomes.add(no.id.name);
            } else if (no.type === 'VariableDeclaration') {
                no.declarations.forEach((declaracao) => {
                    nomesDoPadrao(declaracao.id).forEach((nome) => nomes.add(nome));
                });
            }
        });

        for (const casamento of texto.matchAll(janela)) {
            nomes.add(casamento[1]);
        }
    });

    return Object.fromEntries([...nomes].map((nome) => [nome, 'writable']));
}

// Bibliotecas carregadas por <script> de CDN em frontend/index.html.
const BIBLIOTECAS_CDN = {
    Chart: 'readonly',
    html2canvas: 'readonly',
    html2pdf: 'readonly',
    jspdf: 'readonly',
    XLSX: 'readonly'
};

const REGRAS_COMUNS = {
    'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-var': 'error',
    'prefer-const': ['error', { destructuring: 'all' }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    curly: ['error', 'all'],
    'no-console': 'off'
};

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'tests/e2e/relatorio/**',
            'tests/e2e/resultados/**',
            'tests/e2e/.auth/**',
            'out/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['backend/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        },
        rules: REGRAS_COMUNS
    },
    {
        files: ['frontend/**/*.js', 'demo/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...BIBLIOTECAS_CDN,
                ...coletarGlobaisDoFront()
            }
        },
        rules: {
            ...REGRAS_COMUNS,
            // Funcoes de topo sao a API publica entre arquivos e de onclick no
            // HTML: "nao usada neste arquivo" nao significa morta.
            'no-unused-vars': [
                'error',
                { vars: 'local', args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }
            ],
            // O linter analisa um arquivo por vez e nao ve que um `let` global
            // (ex.: `colaboradores` em core/app.js) e reatribuido em OUTRO
            // arquivo. Seguir a sugestao de trocar por const quebraria a tela
            // com TypeError em tempo de execucao.
            'prefer-const': 'off',
            // Consequencia direta do escopo global compartilhado: cada arquivo
            // redeclara como global o que ele mesmo define. O no-redeclare de
            // verdade (duas declaracoes no MESMO escopo) segue ativo via
            // builtinGlobals: false.
            'no-redeclare': ['error', { builtinGlobals: false }]
        }
    },
    {
        // Os callbacks de page.evaluate() rodam dentro do navegador.
        files: ['tests/e2e/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser }
        }
    },
    {
        // Testes unitarios importam modulos do frontend que tambem rodam no Node.
        files: ['frontend/js/lib/**/*.js'],
        languageOptions: {
            globals: { ...globals.node }
        }
    }
];

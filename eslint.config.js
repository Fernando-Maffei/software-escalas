// Linter do projeto (npm run lint).
//
// Backend, testes e scripts sao CommonJS no Node. O frontend (frontend/js) e
// feito de modulos ES nativos, sem bundler (entrada: frontend/js/main.js): cada
// arquivo importa o que usa, entao o linter o analisa sozinho e sem nenhum
// global do projeto — um nome que nao e import, local ou API do navegador e
// erro de no-undef, e uma funcao que nada usa nem exporta e erro de
// no-unused-vars. Os scripts da demo (demo/*.js) continuam classicos.
const js = require('@eslint/js');
const globals = require('globals');

// Bibliotecas carregadas por <script> de CDN nos index.html.
const BIBLIOTECAS_CDN = {
    Chart: 'readonly',
    html2canvas: 'readonly',
    html2pdf: 'readonly',
    jspdf: 'readonly',
    XLSX: 'readonly'
};

const REGRAS_COMUNS = {
    // Prefixo _ marca parametro exigido pela assinatura mas nao usado (ex.: o
    // quarto parametro do middleware de erro do Express).
    'no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }
    ],
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
        files: ['frontend/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, ...BIBLIOTECAS_CDN }
        },
        rules: REGRAS_COMUNS
    },
    {
        // Scripts classicos da demo: rodam antes do main.js e so falam com o
        // app por fetch (mock-api) e pelo DOM.
        files: ['demo/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: { ...globals.browser }
        },
        rules: REGRAS_COMUNS
    },
    {
        // Os callbacks de page.evaluate() rodam dentro do navegador.
        files: ['tests/e2e/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser }
        }
    }
];

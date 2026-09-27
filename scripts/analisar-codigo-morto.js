// Procura exports do frontend que nenhum modulo importa
// (npm run analisar:codigo-morto).
//
// O frontend e feito de modulos ES (frontend/js, entrada em main.js). Funcao
// ou variavel de topo que nada usa e nao e exportada o ESLint ja acusa
// (no-unused-vars). O que escapa dele e o export que ninguem importa: o
// linter olha um arquivo por vez e, para ele, exportar ja conta como uso.
// Esta analise junta os imports de todos os modulos e lista esses exports.
// core/acoes-html.js importa as funcoes chamadas por onclick="..." — elas
// contam como usadas por esse import, como qualquer outra.
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const RAIZ = path.join(__dirname, '..');
const PASTA = path.join(RAIZ, 'frontend/js');

function listar(pasta) {
    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
        const caminho = path.join(pasta, e.name);
        if (e.isDirectory()) {
            return listar(caminho);
        }
        return e.name.endsWith('.js') ? [caminho] : [];
    });
}

const arquivos = listar(PASTA);
const exportados = new Map(); // arquivo -> Map(nome -> linha)
const importados = new Map(); // arquivo -> Set(nome) ('*' = namespace)

for (const arquivo of arquivos) {
    const ast = espree.parse(fs.readFileSync(arquivo, 'utf8'), { ecmaVersion: 2023, sourceType: 'module', loc: true });
    const meus = new Map();
    for (const no of ast.body) {
        if (no.type === 'ExportNamedDeclaration') {
            if (no.declaration) {
                const d = no.declaration;
                const nomes = d.declarations ? d.declarations.map((x) => x.id.name) : [d.id.name];
                nomes.forEach((n) => meus.set(n, no.loc.start.line));
            }
            no.specifiers.forEach((s) => meus.set(s.exported.name, no.loc.start.line));
        } else if (no.type === 'ImportDeclaration') {
            const alvo = path.resolve(path.dirname(arquivo), no.source.value);
            if (!importados.has(alvo)) {
                importados.set(alvo, new Set());
            }
            if (!no.specifiers.length) {
                continue; // import so pelo efeito (main.js)
            }
            no.specifiers.forEach((s) => {
                importados.get(alvo).add(s.type === 'ImportNamespaceSpecifier' ? '*' : s.imported.name);
            });
        }
    }
    exportados.set(arquivo, meus);
}

let total = 0;
for (const [arquivo, nomes] of exportados) {
    const usados = importados.get(arquivo) || new Set();
    if (usados.has('*')) {
        continue;
    }
    for (const [nome, linha] of nomes) {
        if (!usados.has(nome)) {
            total++;
            console.log(`${path.relative(RAIZ, arquivo)}:${linha}\t${nome}`);
        }
    }
}
console.log(`\n${total} export(s) que nenhum modulo importa.`);

// Import de algo que o modulo de destino nao exporta: o navegador recusaria
// carregar a pagina inteira (SyntaxError de link).
let quebrados = 0;
for (const [alvo, nomes] of importados) {
    const disponiveis = exportados.get(alvo);
    if (!disponiveis) {
        quebrados++;
        console.log(`IMPORT DE ARQUIVO INEXISTENTE: ${path.relative(RAIZ, alvo)}`);
        continue;
    }
    for (const nome of nomes) {
        if (nome !== '*' && !disponiveis.has(nome)) {
            quebrados++;
            console.log(`IMPORT SEM EXPORT: ${nome} de ${path.relative(RAIZ, alvo)}`);
        }
    }
}

if (total > 0 || quebrados > 0) {
    process.exitCode = 1;
}

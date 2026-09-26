// Procura funcoes GLOBAIS do frontend que nada consegue chamar
// (npm run analisar:codigo-morto).
//
// O frontend nao tem bundler: toda funcao declarada no topo de um arquivo vira
// global, e o linter nao tem como saber se ela ainda e usada. Esta analise
// monta o grafo de chamadas e percorre a partir do que de fato executa:
//   - no: funcao declarada no topo de um arquivo de frontend/js;
//   - aresta: QUALQUER mencao ao nome dentro do corpo de outra funcao global
//     (chamada, window.X, 'X' em string, onclick="X()" em template);
//   - raizes: mencoes no codigo de topo (roda ao carregar), nos dois
//     index.html e nos scripts da demo. Linhas "window.X = X;" nao contam:
//     so re-exportam, o uso de verdade seria um onclick ou uma chamada.
// E conservadora de proposito (mencao em comentario ou string ja conta como
// uso). Limite: nao ve funcoes privadas dentro de IIFE.
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS = (function listar(p) {
    return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => {
        const c = path.join(p, e.name);
        return e.isDirectory() ? listar(c) : e.name.endsWith('.js') ? [c] : [];
    });
})(path.join(RAIZ, 'frontend/js'));
const HTMLS = ['frontend/index.html', 'demo/index.html'].map((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8'));
const DEMO_JS = fs
    .readdirSync(path.join(RAIZ, 'demo'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(RAIZ, 'demo', f), 'utf8'));

const funcoes = new Map(); // nome -> { arquivo, linha, linhas, corpo }
const topo = []; // trechos de codigo de topo (fora de declaracoes de funcao)

for (const arquivo of ARQUIVOS) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    const ast = espree.parse(texto, { ecmaVersion: 2023, sourceType: 'script', range: true, loc: true });
    for (const no of ast.body) {
        if (no.type === 'FunctionDeclaration') {
            const nome = no.id.name;
            const corpo = texto.slice(no.body.range[0], no.body.range[1]);
            if (funcoes.has(nome)) {
                funcoes.get(nome).duplicatas.push(path.relative(RAIZ, arquivo));
            }
            funcoes.set(nome, {
                nome,
                arquivo: path.relative(RAIZ, arquivo),
                linha: no.loc.start.line,
                linhas: no.loc.end.line - no.loc.start.line + 1,
                corpo,
                duplicatas: funcoes.get(nome)?.duplicatas || []
            });
        } else {
            const trecho = texto.slice(no.range[0], no.range[1]);
            // window.X = X; so re-exporta: nao e uso.
            if (!/^window\.([\w$]+)\s*=\s*\1;?$/.test(trecho.trim())) {
                topo.push(trecho);
            }
        }
    }
}

const nomes = [...funcoes.keys()];
function mencionados(texto) {
    const achados = new Set();
    for (const nome of nomes) {
        if (new RegExp(`(^|[^\\w$])${nome.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(texto)) {
            achados.add(nome);
        }
    }
    return achados;
}

const raizes = new Set([
    ...mencionados(topo.join('\n')),
    ...mencionados(HTMLS.join('\n')),
    ...mencionados(DEMO_JS.join('\n'))
]);
const vivos = new Set();
const fila = [...raizes];
while (fila.length) {
    const nome = fila.pop();
    if (vivos.has(nome) || !funcoes.has(nome)) {
        continue;
    }
    vivos.add(nome);
    for (const outro of mencionados(funcoes.get(nome).corpo)) {
        if (outro !== nome && !vivos.has(outro)) {
            fila.push(outro);
        }
    }
}

const mortos = nomes.filter((n) => !vivos.has(n)).map((n) => funcoes.get(n));
mortos.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);
let total = 0;
for (const f of mortos) {
    total += f.linhas;
    console.log(`${f.arquivo}:${f.linha}\t${f.linhas}\t${f.nome}`);
}
console.log(
    `\n${mortos.length} funcoes globais sem caminho a partir das raizes, ${total} linhas (de ${nomes.length} funcoes globais).`
);

// Mesmo nome declarado no topo de dois arquivos: vale o que carregar por
// ultimo, e a outra copia vira codigo morto que parece vivo.
const duplicadas = [...funcoes.values()].filter((f) => f.duplicatas.length > 0);
for (const f of duplicadas) {
    console.log(`DUPLICADA ${f.nome}: ${[f.arquivo, ...f.duplicatas].join(', ')}`);
}

if (mortos.length > 0 || duplicadas.length > 0) {
    process.exitCode = 1;
}

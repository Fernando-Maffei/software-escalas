// Checagem de sintaxe (npm run smoke): roda `node --check` em todo .js do
// projeto. Varre as pastas em vez de listar arquivo por arquivo, entao
// arquivo novo ou movido entra sozinho — a lista manual antiga quebrava a
// cada mudanca de pasta e ja tinha esquecido meus-setores.js.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PASTAS = ['backend', 'frontend', 'demo', 'tests'];
const IGNORAR = new Set(['node_modules', 'relatorio', 'resultados', '.auth']);

function listarJs(pasta) {
    return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
        const caminho = path.join(pasta, entrada.name);

        if (entrada.isDirectory()) {
            return IGNORAR.has(entrada.name) ? [] : listarJs(caminho);
        }

        return entrada.name.endsWith('.js') ? [caminho] : [];
    });
}

const arquivos = [
    ...PASTAS.flatMap((pasta) => listarJs(path.join(RAIZ, pasta))),
    path.join(RAIZ, 'playwright.config.js')
];
const falhas = [];

for (const arquivo of arquivos) {
    const resultado = spawnSync(process.execPath, ['--check', arquivo], { encoding: 'utf8' });

    if (resultado.status !== 0) {
        falhas.push(`${path.relative(RAIZ, arquivo)}\n${resultado.stderr.trim()}`);
    }
}

falhas.forEach((falha) => console.error(`FAIL ${falha}\n`));
console.log(`${arquivos.length - falhas.length}/${arquivos.length} arquivo(s) com sintaxe valida.`);

if (falhas.length) {
    process.exitCode = 1;
}

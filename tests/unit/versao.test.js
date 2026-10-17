const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');

function ler(relativo) {
    return fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
}

const VERSAO = JSON.parse(ler('package.json')).version;

// A versao aparece escrita a mao em varios lugares; ja ficou a tela em 1.6.0
// com o package.json em 1.6.3. Trocar a versao e mexer em todos de uma vez.
module.exports = [
    {
        name: 'versao do menu lateral (app e demo) e do README batem com o package.json',
        async run() {
            for (const pagina of ['frontend/index.html', 'demo/index.html']) {
                const achada = ler(pagina).match(/<span>v(\d+\.\d+\.\d+)<\/span>/);
                assert.ok(achada, `versao nao encontrada no menu de ${pagina}`);
                assert.equal(achada[1], VERSAO, `${pagina} mostra v${achada[1]}`);
            }

            const readme = ler('README.md');
            assert.ok(readme.includes(`badge/versão-${VERSAO}-`), 'selo de versao do README desatualizado');
            assert.ok(readme.includes(`Versão atual: **${VERSAO}**`), '"Versão atual" do README desatualizada');
            assert.equal(JSON.parse(ler('package-lock.json')).version, VERSAO, 'package-lock.json desatualizado');
        }
    }
];

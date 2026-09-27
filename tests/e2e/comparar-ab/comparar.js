// Compara duas gravacoes do roteiro A/B (ver roteiro.js) passo a passo.
// Sai com codigo 1 se houver diferenca.
const path = require('path');
const a = require(path.resolve(process.argv[2]));
const b = require(path.resolve(process.argv[3]));
console.log('passos', a.length, b.length);
let dif = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || {}, y = b[i] || {};
    for (const k of ['nome', 'hash', 'body', 'ativo', 'app', 'modais', 'valores', 'erros']) {
        const s = JSON.stringify(x[k]), t = JSON.stringify(y[k]);
        if (s !== t) {
            dif++;
            console.log(`#${i} ${x.nome} [${k}] DIFERE\n  antigo: ${String(s).slice(0, 400)}\n  novo:   ${String(t).slice(0, 400)}`);
        }
    }
}
console.log('diferencas:', dif);
if (dif > 0) {
    process.exitCode = 1;
}

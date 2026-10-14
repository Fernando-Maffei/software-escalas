// Servidor estatico minimo para o modo demonstracao usado pelo robo de testes.
// A demo espera a raiz do repositorio como raiz do site (como na Vercel):
// "/" vira demo/index.html e os scripts vem de /demo e /frontend. So essas
// duas pastas sao servidas — o resto do repositorio (inclusive .env) nao.
const http = require('http');
const fs = require('fs');
const path = require('path');

// A mesma politica de conteudo do app de verdade: o robo passa pelas telas com
// script em atributo proibido, entao um onclick que volte quebra o teste.
const { POLITICA_DE_CONTEUDO } = require('../../backend/lib/cabecalhos-seguranca');

const RAIZ = path.join(__dirname, '..', '..');
const PASTAS_PERMITIDAS = ['demo', 'frontend'];
const PORTA = Number(process.env.DEMO_PORTA) || 4470;
const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
    let caminho;

    try {
        caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (erro) {
        res.writeHead(400).end();
        return;
    }

    if (caminho === '/') {
        caminho = '/demo/index.html';
    }

    const arquivo = path.normalize(path.join(RAIZ, caminho));
    const relativo = path.relative(RAIZ, arquivo);

    if (relativo.startsWith('..') || !PASTAS_PERMITIDAS.includes(relativo.split(path.sep)[0])) {
        res.writeHead(404).end();
        return;
    }

    fs.readFile(arquivo, (erro, conteudo) => {
        if (erro) {
            res.writeHead(404).end();
            return;
        }

        res.writeHead(200, {
            'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': POLITICA_DE_CONTEUDO
        });
        res.end(conteudo);
    });
}).listen(PORTA, '127.0.0.1', () => {
    console.log(`Demo do robo em http://127.0.0.1:${PORTA}/`);
});

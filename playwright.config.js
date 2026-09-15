// Configuracao do Playwright: robo de testes e roteiros de ponta a ponta.
// Dois alvos, escolhidos com --project:
//   demo   modo demonstracao (demo/): sem backend nem banco, nada e gravado.
//          Pega erro de tela e de JavaScript. Sobe sozinho.
//   teste  instancia Docker ISOLADA (docker-compose.teste.yml, porta 4460),
//          com banco proprio. Pega tambem erro de backend e de SQL. Suba antes
//          com npm run teste:subir.
// A producao (porta 4450) e recusada de proposito: o robo cria, altera e
// exclui registros aleatorios.
const { defineConfig, devices } = require('@playwright/test');
const { ARQUIVO_SESSAO } = require('./e2e/apoio');

const URL_DEMO = `http://127.0.0.1:${Number(process.env.DEMO_PORTA) || 4470}`;
const URL_TESTE = process.env.E2E_URL || 'http://localhost:4460';

if (/:4450(\/|$)/.test(URL_TESTE)) {
    throw new Error('E2E_URL aponta para a porta 4450, que e a PRODUCAO. O robo so roda na instancia de teste (npm run teste:subir, porta 4460).');
}

// Sorteada uma vez aqui, no processo principal, e herdada pelos workers: um
// unico numero no relatorio reproduz a execucao inteira.
if (!process.env.ROBO_SEMENTE) {
    process.env.ROBO_SEMENTE = String(1 + Math.floor(Math.random() * 1e9));
}

module.exports = defineConfig({
    testDir: './e2e',
    outputDir: './e2e/resultados',
    fullyParallel: true,
    // No Windows, 8 navegadores abrindo juntos as vezes falham com "spawn UNKNOWN".
    workers: process.env.CI ? 2 : 4,
    retries: 0,
    reporter: [['list'], ['html', { outputFolder: 'e2e/relatorio', open: 'never' }]],
    use: {
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        acceptDownloads: true
    },
    projects: [
        {
            name: 'demo',
            testMatch: /robo\.spec\.js/,
            use: { baseURL: URL_DEMO }
        },
        {
            name: 'preparar-teste',
            testMatch: /preparar-teste\.setup\.js/,
            use: { baseURL: URL_TESTE }
        },
        {
            name: 'teste',
            testMatch: /(robo|fluxos)\.spec\.js/,
            dependencies: ['preparar-teste'],
            use: { baseURL: URL_TESTE, storageState: ARQUIVO_SESSAO }
        }
    ],
    webServer: {
        command: 'node e2e/servidor-demo.js',
        url: URL_DEMO,
        reuseExistingServer: !process.env.CI
    }
});

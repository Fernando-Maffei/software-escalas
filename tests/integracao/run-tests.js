// Runner dos testes de integracao (npm run test:integracao). Mesmo formato dos
// unitarios — cada arquivo exporta [{ name, run }] — mais o ciclo de vida do
// servidor: sobe uma vez, roda tudo em sequencia (as suites dividem o banco) e
// derruba no fim, mesmo com falha.
const { derrubarServidor, subirServidor } = require('./apoio');

const suites = [
    ...require('./auth.test.js'),
    ...require('./colaboradores.test.js'),
    ...require('./lancamentos.test.js'),
    ...require('./folgas-domingo.test.js'),
    ...require('./acesso-setores.test.js'),
    ...require('./backup.test.js'),
    ...require('./limites.test.js'),
    ...require('./migracoes.test.js')
];

(async () => {
    let passed = 0;
    let failed = 0;

    try {
        await subirServidor();
    } catch (error) {
        console.error('Nao foi possivel subir o servidor de integracao.');
        console.error('O SQL Server de teste esta no ar? npm run integracao:banco:subir');
        console.error(error.stack || error.message);
        await derrubarServidor().catch(() => {});
        process.exitCode = 1;
        return;
    }

    for (const suite of suites) {
        try {
            await suite.run();
            passed += 1;
            console.log(`PASS ${suite.name}`);
        } catch (error) {
            failed += 1;
            console.error(`FAIL ${suite.name}`);
            console.error(error.stack || error.message);
        }
    }

    await derrubarServidor();

    console.log(`\n${passed} teste(s) de integracao passaram, ${failed} falharam.`);

    if (failed > 0) {
        process.exitCode = 1;
    }
})();

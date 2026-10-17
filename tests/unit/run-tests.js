const suites = [
    ...require('./validation.test.js'),
    ...require('./feriadosNacionais.test.js'),
    ...require('./plantoes.test.js'),
    ...require('./bancoHoras.test.js'),
    ...require('./jornadaSemanal.test.js'),
    ...require('./tiposEscala.test.js'),
    ...require('./folgasDomingo.test.js'),
    ...require('./folgasDomingoConflitos.test.js'),
    ...require('./plantonista.test.js'),
    ...require('./pendenciasPlantao.test.js'),
    ...require('./escala.test.js'),
    ...require('./backup.test.js'),
    ...require('./backupRetencao.test.js'),
    ...require('./migracoes.test.js'),
    ...require('./permissoes.test.js'),
    ...require('./auth.test.js'),
    ...require('./servidor.test.js'),
    ...require('./htmlSeguro.test.js'),
    ...require('./horasEmCarteira.test.js'),
    ...require('./rate-limit.test.js'),
    ...require('./backgroundService.test.js'),
    ...require('./escalaGravacaoEmLote.test.js'),
    ...require('./transacoes.test.js'),
    ...require('./escalaLeituraDescartada.test.js'),
    ...require('./csp.test.js'),
    ...require('./versao.test.js')
];

let passed = 0;
let failed = 0;

(async () => {
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

console.log(`\n${passed} teste(s) passaram, ${failed} falharam.`);

if (failed > 0) {
    process.exitCode = 1;
}
})();

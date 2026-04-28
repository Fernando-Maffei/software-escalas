const suites = [
    ...require('./validation.test.js'),
    ...require('./plantoes.test.js'),
    ...require('./bancoHoras.test.js'),
    ...require('./escala.test.js'),
    ...require('./backup.test.js')
];

let passed = 0;
let failed = 0;

for (const suite of suites) {
    try {
        suite.run();
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

const assert = require('node:assert/strict');

const { checksumScript, splitSqlBatches } = require('../../backend/db/migracoes');

module.exports = [
    {
        // O checkout no Windows troca LF por CRLF; um editor pode por BOM. Nada
        // disso pode fazer uma migration aplicada parecer alterada.
        name: 'checksum da migration ignora fim de linha e BOM, mas nao conteudo',
        run() {
            const base = checksumScript('CREATE TABLE x (id INT);\nGO\n');
            assert.equal(checksumScript('CREATE TABLE x (id INT);\r\nGO\r\n'), base);
            assert.equal(checksumScript('\uFEFFCREATE TABLE x (id INT);\nGO\n'), base);
            assert.notEqual(checksumScript('CREATE TABLE x (id BIGINT);\nGO\n'), base);
            assert.match(base, /^[0-9a-f]{64}$/);
        }
    },
    {
        name: 'splitSqlBatches separa os lotes pelo GO sozinho na linha',
        run() {
            assert.deepEqual(splitSqlBatches('SELECT 1;\nGO\n  go  \nSELECT \'GO\';\nGO'), ['SELECT 1;', "SELECT 'GO';"]);
        }
    }
];

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { normalizeAutoBackupRetencao } = require('../../backend/services/backup-config');
const { PADRAO_AUTOMATICO, aplicarRetencao, nomeArquivoBackup } = require('../../backend/services/backup/retencao');

function pastaComArquivos(nomes) {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'retencao-'));
    for (const nome of nomes) {
        fs.writeFileSync(path.join(pasta, nome), '{}');
    }
    return pasta;
}

function listar(pasta) {
    return fs.readdirSync(pasta).sort();
}

module.exports = [
    {
        name: 'retencao mantem os N backups automaticos mais recentes',
        async run() {
            const pasta = pastaComArquivos([
                'backup-escalas-auto-2026-09-01_09-00-00.json',
                'backup-escalas-auto-2026-09-02_09-00-00.json',
                'backup-escalas-auto-2026-09-03_09-00-00.json',
                'backup-escalas-auto-2026-09-04_09-00-00.json'
            ]);

            const resultado = await aplicarRetencao(pasta, 2);

            assert.deepEqual(resultado.removidos, [
                'backup-escalas-auto-2026-09-01_09-00-00.json',
                'backup-escalas-auto-2026-09-02_09-00-00.json'
            ]);
            assert.deepEqual(listar(pasta), [
                'backup-escalas-auto-2026-09-03_09-00-00.json',
                'backup-escalas-auto-2026-09-04_09-00-00.json'
            ]);
        }
    },
    {
        // A pasta pode ter copias que o usuario guarda de proposito: so o que
        // o agendador gravou (nome exato) entra na conta.
        name: 'retencao nunca apaga backup manual, de seguranca ou arquivo alheio',
        async run() {
            const intocaveis = [
                'backup-escalas-2026-08-01_10-00-00.json', // manual e pre-restauracao
                'backup-escalas-auto-2026-08-01_10-00-00.json.bak',
                'backup-escalas-auto-copia.json',
                'minha-planilha.xlsx'
            ];
            const pasta = pastaComArquivos([...intocaveis, 'backup-escalas-auto-2026-09-10_09-00-00.json']);
            fs.mkdirSync(path.join(pasta, 'backup-escalas-auto-2020-01-01_00-00-00.json'));

            await aplicarRetencao(pasta, 1);

            for (const nome of intocaveis) {
                assert.ok(fs.existsSync(path.join(pasta, nome)), `${nome} foi apagado`);
            }
            assert.ok(fs.statSync(path.join(pasta, 'backup-escalas-auto-2020-01-01_00-00-00.json')).isDirectory());
        }
    },
    {
        name: 'retencao 0 (ou invalida) nao apaga nada',
        async run() {
            const nomes = ['backup-escalas-auto-2026-09-01_09-00-00.json', 'backup-escalas-auto-2026-09-02_09-00-00.json'];
            const pasta = pastaComArquivos(nomes);

            for (const manter of [0, -1, 1.5, 'x', undefined]) {
                const resultado = await aplicarRetencao(pasta, manter);
                assert.deepEqual(resultado.removidos, []);
            }
            assert.deepEqual(listar(pasta), nomes);
        }
    },
    {
        name: 'backup automatico ganha nome proprio; o manual continua como antes',
        run() {
            const carimbo = '2026-09-28_12-00-00';
            assert.equal(nomeArquivoBackup(carimbo), 'backup-escalas-2026-09-28_12-00-00.json');
            assert.equal(nomeArquivoBackup(carimbo, { automatico: true }), 'backup-escalas-auto-2026-09-28_12-00-00.json');
            assert.ok(PADRAO_AUTOMATICO.test(nomeArquivoBackup(carimbo, { automatico: true })));
            assert.ok(!PADRAO_AUTOMATICO.test(nomeArquivoBackup(carimbo)));
        }
    },
    {
        name: 'normalizeAutoBackupRetencao aceita 0 a 1000 e recusa o resto',
        run() {
            assert.equal(normalizeAutoBackupRetencao(''), 0);
            assert.equal(normalizeAutoBackupRetencao(undefined), 0);
            assert.equal(normalizeAutoBackupRetencao('56'), 56);
            assert.equal(normalizeAutoBackupRetencao(0), 0);
            for (const invalido of [-1, 1.5, 1001, 'abc']) {
                assert.throws(() => normalizeAutoBackupRetencao(invalido), /backups automaticos manter/);
            }
        }
    }
];

// Gera um backup na hora, sem passar pela tela (e sem login), na pasta de
// backup configurada no app. Usado pelo atualizar-servidor.ps1 antes de trocar
// a versao; serve tambem para rodar na mao, na pasta do app:
//
//   node scripts/backup-agora.js
//
// O arquivo sai com o nome de backup manual (backup-escalas-<data>.json), que
// a retencao dos automaticos nunca apaga.
require('../backend/lib/env-local').carregarEnvLocal();

const { conectar, fecharConexao } = require('../backend/db');
const {
    getBackupSettings,
    buildBackupExecutionSettings,
    saveBackupSettings
} = require('../backend/services/backup-config');
const { createSystemBackup } = require('../backend/services/backup-service');

async function main() {
    const settings = getBackupSettings();

    if (!settings.directory) {
        throw new Error('Nenhuma pasta de backup configurada (Configuracoes > Banco de dados).');
    }

    const pool = await conectar();
    const resultado = await createSystemBackup(pool, {
        directory: settings.directory,
        generatedBy: 'backup-agora'
    });

    saveBackupSettings(buildBackupExecutionSettings(settings, resultado, { trigger: 'manual' }));
    console.log(`Backup gravado: ${resultado.filePath} (${resultado.totalRows} linhas).`);
}

main()
    .catch((erro) => {
        console.error(`Backup falhou: ${erro.message}`);
        process.exitCode = 1;
    })
    .finally(() => fecharConexao());

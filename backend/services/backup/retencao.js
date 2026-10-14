// Retencao dos backups AUTOMATICOS (agendados e de encerramento): mantem os N
// mais recentes e apaga o resto.
//
// So entra na limpeza o que o proprio agendador gravou, reconhecido pelo nome
// (backup-escalas-auto-AAAA-MM-DD_HH-mm-ss.json). Backup manual, o de
// seguranca antes de restaurar e qualquer outro arquivo da pasta nunca sao
// tocados — a pasta pode ser compartilhada com copias que o usuario guarda de
// proposito.
const fs = require('fs');
const path = require('path');

const PREFIXO_MANUAL = 'backup-escalas-';
const PREFIXO_AUTOMATICO = 'backup-escalas-auto-';
const PADRAO_AUTOMATICO = /^backup-escalas-auto-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/;

// Limite de seguranca do campo "manter os ultimos N" (0 = manter todos).
const RETENCAO_MAXIMA = 1000;

function nomeArquivoBackup(carimbo, { automatico = false } = {}) {
    return `${automatico ? PREFIXO_AUTOMATICO : PREFIXO_MANUAL}${carimbo}.json`;
}

// Apaga os backups automaticos alem dos `manter` mais recentes. O carimbo no
// nome e zero-padded (ano primeiro), entao a ordem alfabetica e a cronologica.
// Falha ao apagar um arquivo nao interrompe os demais nem o backup que acabou
// de ser gravado: vai para `falhas`.
async function aplicarRetencao(diretorio, manter) {
    const limite = Number(manter);

    if (!Number.isInteger(limite) || limite <= 0) {
        return { removidos: [], falhas: [] };
    }

    const entradas = await fs.promises.readdir(diretorio, { withFileTypes: true });
    const automaticos = entradas
        .filter((entrada) => entrada.isFile() && PADRAO_AUTOMATICO.test(entrada.name))
        .map((entrada) => entrada.name)
        .sort();

    const excedentes = automaticos.slice(0, Math.max(0, automaticos.length - limite));
    const removidos = [];
    const falhas = [];

    for (const nome of excedentes) {
        try {
            await fs.promises.unlink(path.join(diretorio, nome));
            removidos.push(nome);
        } catch (error) {
            falhas.push({ nome, erro: error.code || error.message });
        }
    }

    return { removidos, falhas };
}

module.exports = {
    PADRAO_AUTOMATICO,
    RETENCAO_MAXIMA,
    aplicarRetencao,
    nomeArquivoBackup
};

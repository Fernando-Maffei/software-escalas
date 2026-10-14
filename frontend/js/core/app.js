import { API } from './api.js';
import { aplicarCoresEscala } from './app/api-e-cores.js';
import { getPaginaFromURL } from './app/calendario-e-legenda.js';
import { aplicarPreferenciasImportadas } from './app/configuracoes-tela.js';
import { mostrarToast } from './app/horas-e-resumo.js';
import { inicializarAplicacaoUmaVez } from './app/inicializacao.js';
import { carregarPagina, paginaCarregadaAtual } from './app/modais-e-navegacao.js';
import { estado } from './estado.js';

export const ESCALA_CORES_STORAGE_KEY = 'escalaCoresPersonalizadas';
export const ESCALA_CORES_PADRAO = [
    {
        key: 'trabalhando',
        label: 'Trabalhando',
        description: 'Faixa de trabalho normal',
        icon: 'briefcase',
        color: '#3f74be',
        cssVar: '--escala-status-trabalhando',
        strongVar: '--escala-status-trabalhando-strong'
    },
    {
        key: 'almoco',
        label: 'Almoco',
        description: 'Intervalo de almoco',
        icon: 'utensils',
        color: '#e0973a',
        cssVar: '--escala-status-almoco',
        strongVar: '--escala-status-almoco-strong'
    },
    {
        key: 'folga',
        label: 'Folga',
        description: 'Dia de folga',
        icon: 'bed',
        color: '#94a3b8',
        cssVar: '--escala-status-folga',
        strongVar: '--escala-status-folga-strong'
    },
    {
        key: 'ferias',
        label: 'Ferias',
        description: 'Periodo de ferias',
        icon: 'umbrella-beach',
        color: '#0d9488',
        cssVar: '--escala-status-ferias',
        strongVar: '--escala-status-ferias-strong'
    },
    {
        key: 'ausencia',
        label: 'Ausencia',
        description: 'Ausencia integral',
        icon: 'user-slash',
        color: '#ef4444',
        cssVar: '--escala-status-ausencia',
        strongVar: '--escala-status-ausencia-strong'
    },
    {
        key: 'ausenciaParcial',
        label: 'Ausencia parcial',
        description: 'Bloqueio por horas',
        icon: 'clock',
        color: '#b83b64',
        cssVar: '--escala-status-ausencia-parcial',
        strongVar: '--escala-status-ausencia-parcial-strong'
    },
    {
        key: 'fora',
        label: 'Fora',
        description: 'Fora do horario',
        icon: 'ban',
        color: '#94a3b8',
        cssVar: '--escala-status-fora',
        strongVar: '--escala-status-fora-strong'
    }
];

// Elemento principal onde o conteúdo será renderizado
export const appContent = document.getElementById("appContent");
estado.appBootstrapPromise = estado.appBootstrapPromise || null;
aplicarCoresEscala();

document.addEventListener("DOMContentLoaded", async () => {
    inicializarAplicacaoUmaVez();
});

export function importarDados() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.onchange = async (e) => {
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const dados = JSON.parse(event.target.result);
                const isLegacyBackup = Array.isArray(dados?.colaboradores) && Array.isArray(dados?.ausencias);
                const isSystemBackup = Boolean(dados?.data && typeof dados.data === 'object');
                const hasTableSnapshot = ['Colaboradores', 'Ausencias', 'Feriados', 'plantoes', 'BancoHorasMovimentos', 'escala_dia']
                    .some((tableName) => Array.isArray(dados?.[tableName]));

                if (!isLegacyBackup && !isSystemBackup && !hasTableSnapshot) {
                    throw new Error('Arquivo invalido. Use um backup JSON gerado pelo sistema.');
                }

                if (!confirm('A importacao ira substituir todos os dados atuais. Deseja continuar?')) {
                    return;
                }

                mostrarToast('Importando backup...', 'warning');

                const response = await API.restaurarBackupSistema({
                    fileName: file.name,
                    backupData: dados
                });

                aplicarPreferenciasImportadas(response?.preferences || dados?.preferencias || {});

                if (response?.safetyBackup?.fileName) {
                    mostrarToast(`Backup importado. O estado anterior foi salvo em "${response.safetyBackup.fileName}".`, 'success');
                } else if (response?.safetyBackupError) {
                    // Restauracao aconteceu, mas sem rede de seguranca: avisa
                    // para o usuario nao supor que ha um ponto de retorno.
                    mostrarToast('Backup importado, mas NAO foi possivel salvar o estado anterior. Verifique a pasta de backup.', 'warning');
                } else {
                    mostrarToast('Backup importado com sucesso! Recarregando a tela...', 'success');
                }

                setTimeout(() => {
                    window.location.reload();
                }, 1400);
            } catch (error) {
                console.error('Erro ao importar:', error);
                mostrarToast(error.message || 'Erro ao importar arquivo', 'error');
            }
        };

        reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}
window.addEventListener('popstate', () => {
    const pagina = getPaginaFromURL();

    if (pagina === paginaCarregadaAtual) {
        return;
    }

    carregarPagina(pagina);
});

import { exportarComoPDF } from '../runtime/relatorio-mensal.js';
import { mostrarToast } from './horas-e-resumo.js';

// Limpa so o que este navegador guarda (tema, cores da escala, filtros, cache
// de feriados) e recarrega. Os dados do sistema ficam no servidor e nao sao
// tocados. Antes o aviso dizia "apagar TODOS os dados do sistema" e pedia para
// digitar RESET — assustava sem motivo e descrevia outra coisa.
export function resetarSistema() {
    const confirmou = confirm(
        'Isso limpa as preferencias salvas neste navegador (tema, cores, filtros).\n\n'
        + 'Os dados do sistema (colaboradores, escalas, lancamentos) NAO sao apagados.\n\n'
        + 'Continuar?'
    );

    if (!confirmou) {
        return;
    }

    localStorage.clear();
    mostrarToast('Preferencias deste navegador restauradas. Recarregando...', 'success');

    setTimeout(() => {
        location.reload();
    }, 1000);
}

export function gerarOptionsMeses(mesSelecionado) {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    let options = '';
    meses.forEach((mes, index) => {
        const selected = index === mesSelecionado ? 'selected' : '';
        options += `<option value="${index}" ${selected}>${mes}</option>`;
    });

    return options;
}

export function fecharRelatorio() {
    document.getElementById('relatorioVisualizacao').style.display = 'none';
}

// ========== FUNÇÕES DE EXPORTAÇÃO ==========
export async function exportarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);

    await exportarComoPDF(mes, ano);
}

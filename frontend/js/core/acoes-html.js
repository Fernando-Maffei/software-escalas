// Funcoes chamadas por atributos onclick="..." dos templates HTML. Um atributo
// on* so enxerga o escopo global, entao estas (e so estas) ficam em window.
// Para trocar um onclick por addEventListener, tire a funcao daqui.
import { abrirDesligarColaborador, salvarColaboradorEditor } from './runtime/plantao-colaboradores/colaboradores-e-jornada.js';
import { adicionarSetorRapido, fecharColaboradorEditor } from './app/colaboradores.js';
import { aplicarAlmocoPeriodoEscala, fecharEditor, salvarEscalaDia } from '../telas/escala-dia-editor.js';
import { atualizarTudo, excluirPlantao, fecharPlantaoEditor, salvarPlantao } from './runtime/plantao-colaboradores/plantao-regua-e-relatorios.js';
import { cancelarEdicaoLancamentoPlantao, confirmarLancamentoPlantao, definirTipoCreditoPlantao, editarLancamentoPlantao, removerLancamentoPlantao } from './runtime/plantao-colaboradores/plantao-editor.js';
import { exportarDados } from './app/configuracoes-tela.js';
import { exportarRelatorioCompleto, fecharRelatorio, resetarSistema } from './app/relatorios-export.js';
import { exportarRelatorioEscala, gerarRelatorioEscala } from '../telas/escala-relatorio.js';
import { exportarRelatorioPlantoes, gerarRelatorioPlantoes } from './runtime/escala-e-relatorios.js';
import { gerarRelatorioCompleto } from './runtime/relatorio-mensal.js';
import { importarDados } from './app.js';

Object.assign(window, {
    abrirDesligarColaborador,
    adicionarSetorRapido,
    aplicarAlmocoPeriodoEscala,
    atualizarTudo,
    cancelarEdicaoLancamentoPlantao,
    confirmarLancamentoPlantao,
    definirTipoCreditoPlantao,
    editarLancamentoPlantao,
    excluirPlantao,
    exportarDados,
    exportarRelatorioCompleto,
    exportarRelatorioEscala,
    exportarRelatorioPlantoes,
    fecharColaboradorEditor,
    fecharEditor,
    fecharPlantaoEditor,
    fecharRelatorio,
    gerarRelatorioCompleto,
    gerarRelatorioEscala,
    gerarRelatorioPlantoes,
    importarDados,
    removerLancamentoPlantao,
    resetarSistema,
    salvarColaboradorEditor,
    salvarEscalaDia,
    salvarPlantao
});

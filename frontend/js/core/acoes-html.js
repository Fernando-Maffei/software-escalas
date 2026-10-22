// Acoes dos botoes montados em template HTML. O template marca o botao com
// atributosAcao('nome', ...args) (lib/atributos-acao.js) e um unico ouvinte de
// clique, registrado aqui, chama a funcao com os argumentos.
//
// Antes eram atributos onclick="nome(args)" e estas funcoes ficavam em window.
// Saiu para a pagina poder proibir script em atributo (CSP) e porque montar a
// chamada em texto deixava o nome do colaborador virar codigo.
import { abrirDesligarColaborador, salvarColaboradorEditor } from './runtime/plantao-colaboradores/colaboradores-e-jornada.js';
import { adicionarSetorRapido, fecharColaboradorEditor } from './app/colaboradores.js';
import { aplicarAlmocoPeriodoEscala, fecharEditor, salvarEscalaDia } from '../telas/escala-dia-editor.js';
import { atualizarTudo, cancelarPlantaoEditor, excluirPlantao, salvarPlantao } from './runtime/plantao-colaboradores/plantao-regua-e-relatorios.js';
import { cancelarEdicaoLancamentoPlantao, confirmarLancamentoPlantao, editarLancamentoPlantao, mostrarObservacaoPlantao, removerLancamentoPlantao } from './runtime/plantao-colaboradores/plantao-editor.js';
import { exportarDados } from './app/configuracoes-tela.js';
import { exportarRelatorioCompleto, fecharRelatorio, resetarSistema } from './app/relatorios-export.js';
import { exportarRelatorioEscala, gerarRelatorioEscala } from '../telas/escala-relatorio.js';
import { exportarRelatorioPlantoes, gerarRelatorioPlantoes } from './runtime/escala-e-relatorios.js';
import { gerarRelatorioCompleto } from './runtime/relatorio-mensal.js';
import { importarDados } from './app.js';

const ACOES = Object.freeze({
    abrirDesligarColaborador,
    adicionarSetorRapido,
    aplicarAlmocoPeriodoEscala,
    atualizarTudo,
    cancelarEdicaoLancamentoPlantao,
    cancelarPlantaoEditor,
    confirmarLancamentoPlantao,
    editarLancamentoPlantao,
    excluirPlantao,
    exportarDados,
    exportarRelatorioCompleto,
    exportarRelatorioEscala,
    exportarRelatorioPlantoes,
    fecharColaboradorEditor,
    fecharEditor,
    fecharRelatorio,
    gerarRelatorioCompleto,
    gerarRelatorioEscala,
    gerarRelatorioPlantoes,
    importarDados,
    mostrarObservacaoPlantao,
    removerLancamentoPlantao,
    resetarSistema,
    salvarColaboradorEditor,
    salvarEscalaDia,
    salvarPlantao
});

// Mesmo momento do onclick para quem importa: o clique no botao (ou num icone
// dentro dele) chega aqui ao borbulhar; nenhum ancestral destes botoes para a
// propagacao.
document.addEventListener('click', (evento) => {
    const alvo = evento.target instanceof Element ? evento.target.closest('[data-chamar]') : null;

    if (!alvo) {
        return;
    }

    // Object.hasOwn: so as acoes registradas ("constructor" viria do prototipo).
    const acao = Object.hasOwn(ACOES, alvo.dataset.chamar) ? ACOES[alvo.dataset.chamar] : null;

    if (typeof acao !== 'function') {
        console.error(`[acoes] acao desconhecida: ${alvo.dataset.chamar}`);
        return;
    }

    acao(...JSON.parse(alvo.dataset.args || '[]'));
});

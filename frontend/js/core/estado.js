// Estado compartilhado entre as telas (dados carregados da API, selecoes e
// caches que mais de um modulo le ou escreve). Antes ficava espalhado em
// window.X e em `let` globais — as vezes os dois ao mesmo tempo, com valores
// diferentes. Estado usado por um modulo so fica dentro dele.
export const estado = {
    colaboradores: [],
    ausencias: [],
    setores: [],
    feriadosLocais: [],
    feriados: [],
    plantoesLancados: undefined,
    tiposEscala: undefined,
    feriadosAPI: undefined,
    mesAtual: new Date().getMonth(),
    anoAtual: new Date().getFullYear(),
    exclusaoPendenteId: undefined,
    exclusaoTipo: undefined,
    editandoLancamentoId: undefined,
    editandoTipoLancamento: undefined,
    usuarioAtual: undefined,
    modalFiltroData: undefined,
    modalDataSelecionada: undefined,
    dataEscalaSelecionada: undefined,
    bancoHorasStatus: undefined,
    bancoHorasSaldoSemanal: undefined,
    bancoHorasResumo: undefined,
    appBootstrapPromise: null,
    plantaoDataFocoISO: undefined,
    plantaoMesISO: undefined,
    plantaoAbrirDataISO: undefined,
    escalaEditorColaboradorId: undefined,
    escalaWeekCache: undefined,
    escalaLunchDrafts: undefined
};

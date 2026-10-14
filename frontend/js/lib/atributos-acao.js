// Liga um botao de template a uma acao de core/acoes-html.js, no lugar de
// onclick="funcao(args)".
//
// Por que nao onclick: (1) a politica de seguranca (CSP) da pagina proibe
// script em atributo; (2) montar a chamada em texto era fragil — um nome com
// aspas, escapado para HTML, voltava a ser aspas quando o navegador lia o
// atributo e fechava a string do JS (dava para rodar codigo pelo nome do
// colaborador). Aqui os argumentos vao como JSON num data-atributo escapado e
// so viram valores de novo no clique, com JSON.parse — nunca codigo.
//
// O atributo e data-chamar (e nao data-acao): data-acao ja e usado pelas telas
// de usuarios e de lancamentos, com ouvintes proprios.
import { escapeHtml } from './html-seguro.js';

export function atributosAcao(nome, ...args) {
    return `data-chamar="${escapeHtml(nome)}" data-args="${escapeHtml(JSON.stringify(args))}"`;
}

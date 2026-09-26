// Preferencia "Meus setores" por usuario: quais setores o gestor ve por
// padrao nas telas (Escala do Dia, Dashboard, Lancar Plantao). E so um filtro
// de visualizacao. Fonte de verdade no backend, atrelada a conta:
//   - leitura: /api/auth/me devolve user.setoresVisiveis
//   - escrita: PUT /api/auth/me/setores { setores: [ids] }
// Aqui fica um cache em memoria + a persistencia (com debounce). Lista vazia
// = ver todos (sem filtro).
(function (root) {
    'use strict';

    const SALVAR_URL = '/api/auth/me/setores';

    // null = ainda nao semeado a partir do usuario logado.
    let estado = null;
    let timerSalvar = null;

    function normalizar(lista) {
        if (!Array.isArray(lista)) {
            return [];
        }

        const vistos = new Set();

        lista.forEach(function (item) {
            if (item === null || item === undefined || typeof item === 'object') {
                return;
            }

            const id = String(item).trim();

            if (id) {
                vistos.add(id);
            }
        });

        return Array.from(vistos);
    }

    // Semente preguicosa: usa o usuario ja carregado por auth.js. Enquanto ele
    // nao existir, devolve vazio (= ver todos) sem "travar" o cache, para que a
    // primeira leitura apos o login pegue a preferencia salva.
    function garantirEstado() {
        if (estado === null) {
            const doUsuario = root.__usuarioAtual && root.__usuarioAtual.setoresVisiveis;

            if (Array.isArray(doUsuario)) {
                estado = normalizar(doUsuario);
            } else {
                return [];
            }
        }

        return estado;
    }

    // Array de ids (string) que o usuario quer ver. Vazio = todos.
    function getMeusSetores() {
        return garantirEstado().slice();
    }

    // Atualiza so o cache local (e o espelho em __usuarioAtual), sem ir ao
    // servidor. Util para refletir na hora o que outra tela ja gravou.
    function setMeusSetoresLocal(lista) {
        estado = normalizar(lista);

        if (root.__usuarioAtual) {
            root.__usuarioAtual.setoresVisiveis = estado.slice();
        }

        return estado.slice();
    }

    // Grava a preferencia: atualiza o cache na hora e persiste no backend com
    // um pequeno debounce (evita uma requisicao por clique quando o gestor
    // liga/desliga varios setores em sequencia).
    function salvarMeusSetores(lista) {
        const atual = setMeusSetoresLocal(lista);

        if (timerSalvar) {
            clearTimeout(timerSalvar);
        }

        timerSalvar = setTimeout(function () {
            fetch(SALVAR_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setores: atual })
            }).catch(function () {
                // Falha de rede nao deve quebrar a navegacao; a preferencia
                // segue valendo em memoria ate a proxima gravacao.
            });
        }, 400);

        return atual;
    }

    // Setores PERMITIDOS (teto imposto, definido pelo admin na tela de
    // Usuarios). Diferente de "Meus setores": este e o limite de acesso, nao
    // uma escolha do usuario. Vazio = sem restricao (ve todos).
    function getSetoresPermitidos() {
        const doUsuario = root.__usuarioAtual && root.__usuarioAtual.setoresPermitidos;
        return normalizar(doUsuario);
    }

    // Conta tem teto de setor definido? Se sim, as telas nao oferecem escolha
    // de setor — o que ela ve ja e so o permitido.
    function temRestricaoDeSetor() {
        return getSetoresPermitidos().length > 0;
    }

    root.getMeusSetores = getMeusSetores;
    root.setMeusSetoresLocal = setMeusSetoresLocal;
    root.salvarMeusSetores = salvarMeusSetores;
    root.getSetoresPermitidos = getSetoresPermitidos;
    root.temRestricaoDeSetor = temRestricaoDeSetor;
}(window));

// Cadastro de conta nova num painel: nome, papel, senha (gerada ou definida)
// e setores permitidos ja na criacao — antes a conta nascia vendo todos os
// setores e o limite so podia ser posto depois.
import { escapeHtml } from '../../lib/html-seguro.js';
import { criarUsuario } from './api.js';
import { ligarCampoSenha, renderCampoSenha } from './campo-senha.js';
import { abrirDialogo, mostrarSenhaGerada } from './dialogos.js';
import { ligarSeletorSetores, lerSeletorSetores, renderSeletorSetores } from './seletor-setores.js';

const USERNAME_VALIDO = /^[\p{L}\p{N}][\p{L}\p{N}._@-]{2,49}$/u;

function renderFormulario(ctx) {
    return `
        <form class="usr-painel-caixa" data-form-novo novalidate aria-labelledby="usrNovoTitulo">
            <header class="usr-painel-cabecalho">
                <span class="usr-avatar" aria-hidden="true"><i class="fas fa-user-plus"></i></span>
                <div class="usr-painel-titulo">
                    <h2 id="usrNovoTitulo">Nova conta</h2>
                    <p class="usr-painel-meta">Quem vai usar e o que pode ver.</p>
                </div>
                <button type="button" class="usr-icone-btn usr-painel-fechar" data-fechar aria-label="Fechar painel" title="Fechar">
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                </button>
            </header>
            <div class="usr-retorno" data-retorno role="alert" hidden></div>
            <div class="usr-painel-corpo">
                <section class="usr-secao">
                    <h3><i class="fas fa-id-badge" aria-hidden="true"></i> Identificacao</h3>
                    <label class="usr-campo">
                        <span>Nome de usuario</span>
                        <input type="text" class="form-control" data-username autocomplete="off" spellcheck="false"
                            maxlength="50" placeholder="ex.: equipe.uti" required>
                        <small>3 a 50 caracteres: letras, numeros e . _ - @ (sem espacos).</small>
                    </label>
                </section>

                <section class="usr-secao">
                    <h3><i class="fas fa-user-gear" aria-hidden="true"></i> Papel</h3>
                    <div class="usr-setores-modo" role="radiogroup" aria-label="Papel da conta">
                        <label class="usr-modo-opcao">
                            <input type="radio" name="usrNovoPapel" value="leitura" checked>
                            <span><strong>Visualizacao</strong><small>Conta compartilhada que so consulta. A senha vale como definida.</small></span>
                        </label>
                        <label class="usr-modo-opcao">
                            <input type="radio" name="usrNovoPapel" value="admin">
                            <span><strong>Administrador</strong><small>Conta pessoal que faz lancamentos. Troca a senha no primeiro acesso.</small></span>
                        </label>
                    </div>
                </section>

                <section class="usr-secao">
                    <h3><i class="fas fa-key" aria-hidden="true"></i> Senha</h3>
                    <div class="usr-setores-modo" role="radiogroup" aria-label="Como definir a senha">
                        <label class="usr-modo-opcao">
                            <input type="radio" name="usrNovoSenhaModo" value="gerar" checked>
                            <span><strong>Gerar automaticamente</strong><small>Mostrada uma unica vez, para voce repassar.</small></span>
                        </label>
                        <label class="usr-modo-opcao">
                            <input type="radio" name="usrNovoSenhaModo" value="definir">
                            <span><strong>Definir agora</strong><small>Voce escolhe a senha.</small></span>
                        </label>
                    </div>
                    <div data-bloco-senha hidden>${renderCampoSenha('Senha')}</div>
                </section>

                <section class="usr-secao" data-secao-setores>
                    <h3><i class="fas fa-shield-halved" aria-hidden="true"></i> Setores permitidos</h3>
                    ${renderSeletorSetores(ctx.setores, [])}
                </section>
            </div>
            <footer class="usr-painel-rodape">
                <button type="button" class="btn-secondary usr-btn" data-fechar>Cancelar</button>
                <button type="submit" class="btn-primary usr-btn" data-criar>
                    <i class="fas fa-user-plus" aria-hidden="true"></i> Criar conta
                </button>
            </footer>
        </form>
    `;
}

function mostrarErro(painel, mensagem) {
    const area = painel.querySelector('[data-retorno]');
    area.className = 'usr-retorno is-erro';
    area.innerHTML = `<i class="fas fa-circle-exclamation" aria-hidden="true"></i> ${escapeHtml(mensagem)}`;
    area.hidden = false;
}

/**
 * @param {{ setores: any[], recarregar: () => Promise<void>, avisar: (mensagem: string, tipo?: string) => void }} ctx
 */
export function abrirPainelNovo(ctx) {
    const painel = abrirDialogo('usr-painel', renderFormulario(ctx));
    const form = painel.querySelector('[data-form-novo]');
    const entradaNome = form.querySelector('[data-username]');
    const blocoSenha = form.querySelector('[data-bloco-senha]');
    const campoSenha = ligarCampoSenha(blocoSenha, () => entradaNome.value);
    let enviando = false;

    ligarSeletorSetores(form.querySelector('[data-secao-setores]'));
    entradaNome.addEventListener('input', () => campoSenha.atualizar());
    entradaNome.focus();

    form.addEventListener('change', (evento) => {
        if (evento.target.name === 'usrNovoSenhaModo') {
            blocoSenha.hidden = evento.target.value !== 'definir';

            if (!blocoSenha.hidden) {
                campoSenha.focar();
            }
        }
    });

    form.addEventListener('click', (evento) => {
        if (evento.target.closest('[data-fechar]')) {
            painel.close();
        }
    });

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();

        if (enviando) {
            return;
        }

        const username = entradaNome.value.trim();
        const isAdmin = form.querySelector('input[name="usrNovoPapel"]:checked')?.value === 'admin';
        const definirSenha = form.querySelector('input[name="usrNovoSenhaModo"]:checked')?.value === 'definir';
        const setores = lerSeletorSetores(form.querySelector('[data-seletor-setores]'));

        if (!USERNAME_VALIDO.test(username)) {
            mostrarErro(painel, 'Nome de usuario: 3 a 50 caracteres, so letras, numeros e . _ - @.');
            entradaNome.focus();
            return;
        }

        if (definirSenha && !campoSenha.atende()) {
            mostrarErro(painel, 'A senha ainda nao atende aos requisitos.');
            campoSenha.focar();
            return;
        }

        if (!setores.valido) {
            mostrarErro(painel, 'Marque ao menos um setor ou escolha "Todos os setores".');
            return;
        }

        enviando = true;
        form.querySelector('[data-criar]').disabled = true;
        const resultado = await criarUsuario({
            username,
            isAdmin,
            senha: definirSenha ? campoSenha.valor() : '',
            setoresPermitidos: setores.ids
        });
        enviando = false;
        form.querySelector('[data-criar]').disabled = false;

        if (!resultado.ok) {
            mostrarErro(painel, resultado.erro);
            return;
        }

        painel.close();
        await ctx.recarregar();
        ctx.avisar(`Conta "${username}" criada.`);

        if (resultado.dados.senhaTemporaria) {
            mostrarSenhaGerada({ username, senha: resultado.dados.senhaTemporaria, isAdmin });
        }
    });
}

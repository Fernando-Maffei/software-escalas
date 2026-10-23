// Painel lateral de uma conta: Acesso (papel e situacao), Setores permitidos,
// Senha e Zona de perigo. Cada acao confirma antes, mostra o resultado no
// proprio painel e recarrega a lista. As regras valem no backend — aqui so
// escondemos o que nem faz sentido oferecer (ex.: desativar a propria conta).
import { escapeHtml } from '../../lib/html-seguro.js';
import { atualizarUsuario, excluirUsuario } from './api.js';
import { ligarCampoSenha, renderCampoSenha } from './campo-senha.js';
import { abrirDialogo, confirmarAcao, mostrarSenhaGerada } from './dialogos.js';
import { formatarData, formatarUltimoAcesso } from './formatacao.js';
import { ehContaPropria, renderAvatar, renderSelos } from './lista.js';
import { ligarSeletorSetores, lerSeletorSetores, renderSeletorSetores } from './seletor-setores.js';

function renderCabecalho(usuario, propria) {
    const acesso = formatarUltimoAcesso(usuario.ultimoLoginAt);

    return `
        ${renderAvatar(usuario)}
        <div class="usr-painel-titulo">
            <h2 id="usrPainelTitulo">${escapeHtml(usuario.username)}${propria ? ' <span class="usr-voce">voce</span>' : ''}</h2>
            <div class="usr-selos">${renderSelos(usuario)}</div>
            <p class="usr-painel-meta">
                Criada em ${escapeHtml(formatarData(usuario.criadoEm))} ·
                <span title="${escapeHtml(acesso.titulo)}">Ultimo acesso: ${escapeHtml(acesso.texto)}</span>
            </p>
        </div>
        <button type="button" class="usr-icone-btn usr-painel-fechar" data-fechar aria-label="Fechar painel" title="Fechar">
            <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
    `;
}

function renderAcesso(usuario, propria) {
    if (propria) {
        return `
            <section class="usr-secao">
                <h3><i class="fas fa-user-gear" aria-hidden="true"></i> Acesso</h3>
                <p class="usr-aviso">Voce nao pode mudar o papel nem desativar a propria conta. Peca a outro administrador.</p>
            </section>
        `;
    }

    return `
        <section class="usr-secao">
            <h3><i class="fas fa-user-gear" aria-hidden="true"></i> Acesso</h3>
            <div class="usr-linha-acao">
                <div>
                    <strong>Papel: ${usuario.isAdmin ? 'Administrador' : 'Visualizacao'}</strong>
                    <small>${usuario.isAdmin
                        ? 'Faz lancamentos e gerencia o sistema.'
                        : 'So consulta; nao grava nada.'}</small>
                </div>
                <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-acao="papel">
                    <i class="fas ${usuario.isAdmin ? 'fa-user-minus' : 'fa-user-shield'}" aria-hidden="true"></i>
                    ${usuario.isAdmin ? 'Tornar visualizacao' : 'Tornar administrador'}
                </button>
            </div>
            <div class="usr-linha-acao">
                <div>
                    <strong>Situacao: ${usuario.ativo ? 'Ativa' : 'Desativada'}</strong>
                    <small>${usuario.ativo
                        ? 'Desativar corta o acesso na hora e mantem a conta para reativar depois.'
                        : 'A conta existe, mas nao consegue entrar.'}</small>
                </div>
                <button type="button" class="btn-secondary usr-btn usr-btn-sm ${usuario.ativo ? 'usr-btn-perigo' : ''}" data-acao="situacao">
                    <i class="fas ${usuario.ativo ? 'fa-user-slash' : 'fa-user-check'}" aria-hidden="true"></i>
                    ${usuario.ativo ? 'Desativar conta' : 'Reativar conta'}
                </button>
            </div>
        </section>
    `;
}

function renderSetores(usuario, ctx) {
    return `
        <section class="usr-secao" data-secao-setores>
            <h3><i class="fas fa-shield-halved" aria-hidden="true"></i> Setores permitidos</h3>
            <p class="usr-aviso">
                Limite de acesso desta conta, valido tambem para administradores. O "Meus setores"
                de cada pessoa so filtra dentro deste limite.
            </p>
            ${renderSeletorSetores(ctx.setores, usuario.setoresPermitidos || [])}
            <div class="usr-secao-rodape">
                <button type="button" class="btn-primary usr-btn usr-btn-sm" data-acao="salvar-setores" disabled>
                    <i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar setores
                </button>
            </div>
        </section>
    `;
}

function renderSenha(usuario, propria) {
    if (propria) {
        return `
            <section class="usr-secao">
                <h3><i class="fas fa-key" aria-hidden="true"></i> Senha</h3>
                <div class="usr-linha-acao">
                    <small>A propria senha e trocada em "Minha senha", que pede a senha atual.</small>
                    <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-acao="minha-senha">
                        <i class="fas fa-key" aria-hidden="true"></i> Minha senha
                    </button>
                </div>
            </section>
        `;
    }

    return `
        <section class="usr-secao">
            <h3><i class="fas fa-key" aria-hidden="true"></i> Senha</h3>
            <p class="usr-aviso">Qualquer troca encerra as sessoes abertas desta conta.</p>
            <div class="usr-botoes">
                <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-acao="gerar-senha">
                    <i class="fas fa-rotate" aria-hidden="true"></i> Gerar nova senha
                </button>
                <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-acao="mostrar-definir" aria-expanded="false">
                    <i class="fas fa-pen" aria-hidden="true"></i> Definir uma senha
                </button>
            </div>
            <div class="usr-definir-senha" data-definir hidden>
                ${renderCampoSenha(`Nova senha para ${usuario.username}`)}
                <div class="usr-secao-rodape">
                    <button type="button" class="btn-primary usr-btn usr-btn-sm" data-acao="salvar-senha">
                        <i class="fas fa-check" aria-hidden="true"></i> Salvar senha
                    </button>
                </div>
            </div>
        </section>
    `;
}

function renderPerigo(propria) {
    if (propria) {
        return '';
    }

    return `
        <section class="usr-secao usr-secao-perigo">
            <h3><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Zona de perigo</h3>
            <div class="usr-linha-acao">
                <small>Excluir apaga a conta de vez. Para so cortar o acesso, prefira desativar.</small>
                <button type="button" class="btn-danger usr-btn usr-btn-sm" data-acao="excluir">
                    <i class="fas fa-trash-can" aria-hidden="true"></i> Excluir conta
                </button>
            </div>
        </section>
    `;
}

function mostrarRetorno(painel, mensagem, tipo = 'sucesso') {
    const area = painel.querySelector('[data-retorno]');
    area.className = `usr-retorno is-${tipo}`;
    area.innerHTML = `<i class="fas ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'}" aria-hidden="true"></i> ${escapeHtml(mensagem)}`;
    area.hidden = false;
}

function confirmacaoDa(acao, usuario) {
    const nome = usuario.username;

    switch (acao) {
        case 'papel':
            return usuario.isAdmin
                ? { titulo: 'Tornar visualizacao?', mensagem: `"${nome}" deixa de ser administrador e passa a so consultar. As sessoes abertas desta conta sao encerradas.`, confirmar: 'Tornar visualizacao', perigo: true }
                : { titulo: 'Tornar administrador?', mensagem: `"${nome}" passa a fazer lancamentos e a gerenciar contas, backup e banco de dados.`, confirmar: 'Tornar administrador' };
        case 'situacao':
            return usuario.ativo
                ? { titulo: 'Desativar conta?', mensagem: `"${nome}" perde o acesso imediatamente. Da para reativar depois.`, confirmar: 'Desativar', perigo: true }
                : { titulo: 'Reativar conta?', mensagem: `"${nome}" volta a conseguir entrar com a senha atual.`, confirmar: 'Reativar' };
        case 'gerar-senha':
            return {
                titulo: 'Gerar nova senha?',
                mensagem: `A senha atual de "${nome}" deixa de valer na hora.${usuario.isAdmin ? '' : ' Numa conta de visualizacao, toda a equipe precisara da senha nova.'}`,
                confirmar: 'Gerar senha',
                perigo: true
            };
        case 'excluir':
            return {
                titulo: 'Excluir conta definitivamente?',
                mensagem: `A conta "${nome}" sera apagada e nao pode ser recuperada.`,
                confirmar: 'Excluir conta',
                perigo: true,
                digitar: nome
            };
        default:
            return null;
    }
}

/**
 * @param {number} id
 * @param {{ usuarioAtual: any, setores: any[], usuarios: any[], recarregar: () => Promise<void>, abrirMinhaSenha: () => void, avisar: (mensagem: string, tipo?: string) => void }} ctx
 */
export function abrirPainelConta(id, ctx) {
    const painel = abrirDialogo(
        'usr-painel',
        `
        <div class="usr-painel-caixa" role="document" aria-labelledby="usrPainelTitulo">
            <header class="usr-painel-cabecalho" data-cabecalho></header>
            <div class="usr-retorno" data-retorno role="status" hidden></div>
            <div class="usr-painel-corpo" data-corpo></div>
        </div>
        `
    );
    let usuario = null;
    let ocupado = false;
    let campoSenha = null;

    function desenhar() {
        usuario = ctx.usuarios.find((item) => Number(item.id) === Number(id));

        if (!usuario) {
            painel.close();
            return;
        }

        const propria = ehContaPropria(usuario, ctx.usuarioAtual);
        painel.querySelector('[data-cabecalho]').innerHTML = renderCabecalho(usuario, propria);
        painel.querySelector('[data-corpo]').innerHTML = [
            renderAcesso(usuario, propria),
            renderSetores(usuario, ctx),
            renderSenha(usuario, propria),
            renderPerigo(propria)
        ].join('');

        const original = JSON.stringify([...(usuario.setoresPermitidos || [])].map(String).sort());
        const salvarSetores = painel.querySelector('[data-acao="salvar-setores"]');
        ligarSeletorSetores(painel.querySelector('[data-secao-setores]'), (estado) => {
            salvarSetores.disabled = !estado.valido || JSON.stringify([...estado.ids].sort()) === original;
        });
        // Conta presa a setor que nao existe mais: ja oferece salvar a limpeza.
        const inicial = lerSeletorSetores(painel.querySelector('[data-seletor-setores]'));
        salvarSetores.disabled = !inicial.valido || JSON.stringify([...inicial.ids].sort()) === original;

        campoSenha = null;

        if (!propria) {
            const bloco = painel.querySelector('[data-definir]');
            campoSenha = ligarCampoSenha(bloco, () => usuario.username);
            bloco.querySelector('[data-senha]').addEventListener('keydown', (evento) => {
                if (evento.key === 'Enter') {
                    evento.preventDefault();
                    painel.querySelector('[data-acao="salvar-senha"]').click();
                }
            });
        }
    }

    async function executar(corpo, mensagemSucesso) {
        ocupado = true;
        painel.querySelectorAll('[data-corpo] button').forEach((botao) => { botao.disabled = true; });
        const resultado = corpo === 'excluir' ? await excluirUsuario(usuario.id) : await atualizarUsuario(usuario.id, corpo);
        ocupado = false;

        if (!resultado.ok) {
            desenhar();
            mostrarRetorno(painel, resultado.erro, 'erro');
            return null;
        }

        await ctx.recarregar();

        if (corpo === 'excluir') {
            painel.close();
            ctx.avisar(resultado.dados.message || 'Conta excluida.');
            return resultado;
        }

        desenhar();
        mostrarRetorno(painel, mensagemSucesso);
        return resultado;
    }

    async function aoClicar(evento) {
        if (evento.target.closest('[data-fechar]')) {
            painel.close();
            return;
        }

        const botao = evento.target.closest('[data-acao]');

        if (!botao || ocupado || !usuario) {
            return;
        }

        const acao = botao.dataset.acao;
        const confirmacao = confirmacaoDa(acao, usuario);

        if (acao === 'minha-senha') {
            painel.close();
            ctx.abrirMinhaSenha();
            return;
        }

        if (acao === 'mostrar-definir') {
            const bloco = painel.querySelector('[data-definir]');
            bloco.hidden = !bloco.hidden;
            botao.setAttribute('aria-expanded', String(!bloco.hidden));

            if (!bloco.hidden) {
                campoSenha.focar();
            }

            return;
        }

        if (confirmacao && !(await confirmarAcao(confirmacao))) {
            return;
        }

        if (acao === 'papel') {
            await executar({ isAdmin: !usuario.isAdmin }, usuario.isAdmin ? 'Agora e uma conta de visualizacao.' : 'Agora e administrador.');
        } else if (acao === 'situacao') {
            await executar({ ativo: !usuario.ativo }, usuario.ativo ? 'Conta desativada.' : 'Conta reativada.');
        } else if (acao === 'salvar-setores') {
            const { ids, valido } = lerSeletorSetores(painel.querySelector('[data-seletor-setores]'));

            if (valido) {
                await executar({ setoresPermitidos: ids }, ids.length ? 'Setores permitidos salvos.' : 'Conta liberada para todos os setores.');
            }
        } else if (acao === 'gerar-senha') {
            const resultado = await executar({ resetarSenha: true }, 'Nova senha gerada; as sessoes abertas foram encerradas.');

            if (resultado?.dados.senhaTemporaria) {
                mostrarSenhaGerada({
                    username: usuario.username,
                    senha: resultado.dados.senhaTemporaria,
                    isAdmin: Boolean(resultado.dados.usuario?.isAdmin)
                });
            }
        } else if (acao === 'salvar-senha') {
            if (!campoSenha.atende()) {
                mostrarRetorno(painel, 'A senha ainda nao atende aos requisitos.', 'erro');
                campoSenha.focar();
                return;
            }

            await executar({ novaSenha: campoSenha.valor() }, 'Senha definida; as sessoes abertas foram encerradas.');
        } else if (acao === 'excluir') {
            await executar('excluir', '');
        }
    }

    painel.addEventListener('click', aoClicar);
    desenhar();
}

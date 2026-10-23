// Tela de Usuarios (menu "Usuarios", admin-only). Monta a barra de busca e
// filtros, a lista de contas e abre os paineis de cadastro e de edicao.
//
// Para nao-admin o item some do menu e o backend nega com 403 de qualquer
// forma — o aviso abaixo e so uma rede de seguranca visual.
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { openTrocarSenhaModal } from '../../core/auth.js';
import { estado } from '../../core/estado.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { listarSetores, listarUsuarios } from './api.js';
import { normalizarSetores } from './formatacao.js';
import { renderFiltros, renderLista } from './lista.js';
import { abrirPainelConta } from './painel-conta.js';
import { abrirPainelNovo } from './painel-novo.js';

async function buscarUsuarioAtual() {
    if (estado.usuarioAtual) {
        return estado.usuarioAtual;
    }

    try {
        const response = await fetch('/api/auth/me');

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        estado.usuarioAtual = data.user || null;
        return estado.usuarioAtual;
    } catch (error) {
        return null;
    }
}

function renderEstrutura() {
    return `
        <div class="usr-barra">
            <label class="usr-busca">
                <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" class="form-control" data-busca placeholder="Buscar conta pelo nome" aria-label="Buscar conta pelo nome" autocomplete="off">
            </label>
            <div class="usr-barra-acoes">
                <button type="button" class="btn-secondary usr-btn" data-minha-senha>
                    <i class="fas fa-key" aria-hidden="true"></i> Minha senha
                </button>
                <button type="button" class="btn-primary usr-btn" data-novo>
                    <i class="fas fa-user-plus" aria-hidden="true"></i> Novo usuario
                </button>
            </div>
        </div>
        <div class="usr-filtros" role="group" aria-label="Filtrar contas" data-filtros></div>
        <div data-lista aria-live="polite"><p class="usr-aviso">Carregando contas...</p></div>
        <details class="usr-ajuda">
            <summary><i class="fas fa-circle-info" aria-hidden="true"></i> Como funcionam as contas</summary>
            <ul>
                <li><strong>Administrador</strong>: conta pessoal, faz lancamentos e gerencia o sistema. A senha
                    definida por outra pessoa e provisoria e o dono troca no primeiro acesso.</li>
                <li><strong>Visualizacao</strong>: conta compartilhada pela equipe, so consulta. A senha vale como
                    definida e quem usa a conta nao pode altera-la.</li>
                <li><strong>Setores permitidos</strong>: limite de acesso de cada conta, imposto pelo servidor.
                    O "Meus setores" de cada pessoa e so uma preferencia de tela dentro desse limite.</li>
                <li>Desativar, trocar a senha ou rebaixar encerra na hora as sessoes abertas da conta. O sistema
                    nunca fica sem um administrador ativo.</li>
            </ul>
        </details>
    `;
}

export async function inicializarUsuariosTela() {
    const container = document.getElementById('usuariosCardConteudo');

    if (!container) {
        return;
    }

    const usuarioAtual = await buscarUsuarioAtual();

    if (!usuarioAtual || !usuarioAtual.isAdmin) {
        container.innerHTML = '<p class="usr-aviso">Apenas administradores podem gerenciar usuarios.</p>';
        return;
    }

    container.innerHTML = renderEstrutura();
    const areaLista = container.querySelector('[data-lista]');
    const areaFiltros = container.querySelector('[data-filtros]');

    const ctx = {
        usuarioAtual,
        setores: [],
        usuarios: [],
        busca: '',
        filtro: 'todos',
        avisar: (mensagem, tipo = 'success') => mostrarToast(mensagem, tipo),
        abrirMinhaSenha: () => openTrocarSenhaModal(),
        recarregar: async () => {
            const resultado = await listarUsuarios();

            if (!resultado.ok) {
                areaLista.innerHTML = `<p class="usr-aviso usr-aviso-erro">${escapeHtml(resultado.erro)}</p>`;
                return;
            }

            ctx.usuarios = resultado.dados.usuarios || [];
            desenhar();
        }
    };

    function desenhar() {
        areaFiltros.innerHTML = renderFiltros(ctx);
        areaLista.innerHTML = renderLista(ctx);
    }

    container.querySelector('[data-busca]').addEventListener('input', (evento) => {
        ctx.busca = evento.target.value;
        areaLista.innerHTML = renderLista(ctx);
    });

    areaFiltros.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-filtro]');

        if (botao) {
            ctx.filtro = botao.dataset.filtro;
            desenhar();
        }
    });

    areaLista.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-editar]');

        if (botao) {
            abrirPainelConta(Number(botao.dataset.editar), ctx);
        }
    });

    container.querySelector('[data-novo]').addEventListener('click', () => abrirPainelNovo(ctx));
    container.querySelector('[data-minha-senha]').addEventListener('click', () => openTrocarSenhaModal());

    // Falha nos setores nao impede gerir contas: o seletor so fica vazio.
    const setores = await listarSetores();
    ctx.setores = setores.ok ? normalizarSetores(setores.lista) : [];
    await ctx.recarregar();
}

/* =====================================================================
JANELA DE UMA COBERTURA (tela Coberturas)
---------------------------------------------------------------------
Mostra os horarios a cobrir agrupados por dia, cada um com quem cobre e
para onde vao as horas. Da para dividir um horario (16h-22h vira 16h-19h
e 19h-22h), remover o que nao precisa de cobertura e atribuir de uma vez
todos os pendentes a uma pessoa.

Nada e gravado ate o Salvar: o PUT manda a lista inteira e o servidor
confere tudo (sobreposicao, credito, agenda do substituto). O seletor de
substituto busca, ao ser aberto, quem pode assumir aquele horario e
mostra os outros apagados com o motivo.
===================================================================== */

import { API } from '../../core/api.js';
import { mostrarToast } from '../../core/app/horas-e-resumo.js';
import { estado } from '../../core/estado.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import {
    ROTULOS_SITUACAO,
    agruparPorDia,
    atribuirPendentes,
    dataBr,
    dividirAoMeio,
    duracaoTrecho,
    horaCurta,
    resumirTrechos,
    rotuloDia,
    rotuloOrigem,
    textoDuracao,
    trechosParaEnvio
} from '../../lib/coberturas.js';

const ROTULOS_DIA = { sabado: 'Sabado · vira plantao', domingo: 'Domingo · vira plantao', feriado: 'Feriado · vira plantao' };

// { cobertura, trechos (copia editavel), observacao, alterado, aoMudar }
let aberta = null;
// "dataISO|inicio|fim" -> Map(id -> { disponivel, motivo, segundoTurno })
const disponibilidades = new Map();

function modal() {
    return document.getElementById('coberturaEditor');
}

function candidatos() {
    return (estado.colaboradores || [])
        .filter((item) => item.Ativo !== false && item.Ativo !== 0 && Number(item.Id) !== aberta.cobertura.titularId)
        .sort((a, b) => String(a.Nome).localeCompare(String(b.Nome), 'pt-BR'));
}

function chaveDisponibilidade(trecho) {
    return `${trecho.dataISO}|${horaCurta(trecho.horaInicio)}|${horaCurta(trecho.horaFim)}`;
}

// "Nao da para Fulano cobrir 09/11/2026 16:30-22:00: ja trabalha ..." -> so o
// motivo: o nome e o horario ja estao na propria linha.
function motivoCurto(motivo) {
    const texto = String(motivo || 'Indisponivel');
    const corte = texto.indexOf(': ');

    return corte >= 0 ? texto.slice(corte + 2) : texto;
}

function opcoesSubstituto(trecho) {
    const disponibilidade = disponibilidades.get(chaveDisponibilidade(trecho));
    const atual = trecho.substitutoId === null || trecho.substitutoId === undefined ? null : Number(trecho.substitutoId);
    const opcoes = ['<option value="">Pendente (ninguem)</option>'];

    if (trecho.substitutoOculto) {
        opcoes.push(`<option value="${atual}" selected>Colaborador de outro setor</option>`);
    }

    for (const colaborador of candidatos()) {
        const id = Number(colaborador.Id);
        const info = disponibilidade?.get(id);
        const bloqueado = info && !info.disponivel && id !== atual;
        const sufixo = info && !info.disponivel ? ` — ${motivoCurto(info.motivo)}` : (info?.segundoTurno ? ' (2º turno)' : '');

        opcoes.push(`<option value="${id}"${id === atual ? ' selected' : ''}${bloqueado ? ' disabled' : ''}>${escapeHtml(colaborador.Nome + sufixo)}</option>`);
    }

    return opcoes.join('');
}

function renderTrecho(trecho, indice) {
    const pendente = trecho.substitutoId === null || trecho.substitutoId === undefined;
    const credito = trecho.tipoCredito || '';

    return `
            <li class="cobertura-trecho${pendente ? ' is-pendente' : ''}" data-indice="${indice}">
                <span class="cobertura-trecho-hora">
                    <input type="time" value="${escapeHtml(horaCurta(trecho.horaInicio))}" data-campo="horaInicio" aria-label="Inicio">
                    <span aria-hidden="true">–</span>
                    <input type="time" value="${escapeHtml(horaCurta(trecho.horaFim))}" data-campo="horaFim" aria-label="Fim">
                </span>
                <select data-campo="substitutoId" aria-label="Quem cobre">${opcoesSubstituto(trecho)}</select>
                <select data-campo="tipoCredito" aria-label="Horas vao para"${pendente ? ' disabled' : ''}>
                    <option value=""${credito ? '' : ' selected'}>Escolha o destino</option>
                    <option value="banco"${credito === 'banco' ? ' selected' : ''}>Banco de horas</option>
                    <option value="extra"${credito === 'extra' ? ' selected' : ''}>Hora extra</option>
                </select>
                <span class="cobertura-trecho-duracao">${escapeHtml(textoDuracao(duracaoTrecho(trecho)))}</span>
                <span class="cobertura-trecho-acoes">
                    <button type="button" class="btn-icon-sm" data-acao-trecho="dividir" title="Dividir este horario" aria-label="Dividir este horario">
                        <i class="fas fa-scissors" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="btn-icon-sm delete" data-acao-trecho="remover" title="Nao precisa de cobertura" aria-label="Remover este horario">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </span>
            </li>`;
}

function renderDias() {
    const dias = agruparPorDia(aberta.trechos);

    if (dias.length === 0) {
        return '<p class="coberturas-vazio">Nenhum horario a cobrir.</p>';
    }

    return dias.map((dia) => `
            <section class="cobertura-dia">
                <h4>${escapeHtml(rotuloDia(dia.dataISO))}${ROTULOS_DIA[dia.tipoDia] ? ` <small>${escapeHtml(ROTULOS_DIA[dia.tipoDia])}</small>` : ''}</h4>
                <ul>${dia.itens.map(({ trecho, indice }) => renderTrecho(trecho, indice)).join('')}</ul>
            </section>`).join('');
}

function textoResumo() {
    const resumo = resumirTrechos(aberta.trechos);
    const partes = [];

    if (resumo.minutosCobertos) {
        partes.push(`${textoDuracao(resumo.minutosCobertos)} cobertas`);
    }

    if (resumo.minutosPendentes) {
        partes.push(`${textoDuracao(resumo.minutosPendentes)} pendentes`);
    }

    return { resumo, texto: partes.join(' · ') || 'Nenhum horario' };
}

function renderResumo() {
    const alvo = document.getElementById('coberturaResumo');

    if (!alvo) {
        return;
    }

    const { resumo, texto } = textoResumo();
    alvo.innerHTML = `<span class="cobertura-chip is-${resumo.situacao}">${escapeHtml(ROTULOS_SITUACAO[resumo.situacao])}</span> ${escapeHtml(texto)}`;
}

function renderCorpo() {
    const corpo = document.getElementById('coberturaDias');

    if (corpo) {
        corpo.innerHTML = renderDias();
    }

    renderResumo();
}

function render() {
    const caixa = modal();
    const { cobertura } = aberta;

    caixa.innerHTML = `
            <div class="cobertura-modal-caixa">
                <div class="cobertura-modal-topo">
                    <div>
                        <h3>Cobertura de ${escapeHtml(cobertura.titularNome || 'colaborador')}</h3>
                        <p>${escapeHtml(dataBr(cobertura.dataInicio))} a ${escapeHtml(dataBr(cobertura.dataFim))} · ${escapeHtml(rotuloOrigem(cobertura))}</p>
                        <p id="coberturaResumo" class="cobertura-resumo"></p>
                    </div>
                    <button type="button" class="btn-icon-sm" data-acao-cobertura="fechar" aria-label="Fechar" title="Fechar (Esc)">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>

                <div class="cobertura-todos">
                    <span>Atribuir os horarios pendentes a</span>
                    <select id="coberturaTodosSubstituto" aria-label="Quem cobre os pendentes">
                        <option value="">Escolha o colaborador</option>
                        ${candidatos().map((item) => `<option value="${Number(item.Id)}">${escapeHtml(item.Nome)}</option>`).join('')}
                    </select>
                    <select id="coberturaTodosCredito" aria-label="Horas vao para">
                        <option value="banco">Banco de horas</option>
                        <option value="extra">Hora extra</option>
                    </select>
                    <button type="button" class="btn-secondary" data-acao-cobertura="atribuir-todos">Aplicar</button>
                </div>

                <div id="coberturaDias" class="cobertura-dias"></div>

                <label class="cobertura-observacao">
                    <span>Observacao</span>
                    <textarea id="coberturaObservacao" rows="2" maxlength="500">${escapeHtml(aberta.observacao || '')}</textarea>
                </label>

                <div class="cobertura-modal-rodape">
                    <button type="button" class="btn-danger" data-acao-cobertura="excluir">Excluir cobertura</button>
                    <span class="cobertura-modal-rodape-espaco"></span>
                    <button type="button" class="btn-secondary" data-acao-cobertura="fechar">Cancelar</button>
                    <button type="button" class="btn-primary" data-acao-cobertura="salvar">Salvar</button>
                </div>
            </div>`;

    caixa.hidden = false;
    renderCorpo();
}

function fechar(perguntar = true) {
    if (perguntar && aberta?.alterado && !window.confirm('Ha alteracoes nesta cobertura que ainda nao foram salvas. Fechar e descartar?')) {
        return;
    }

    aberta = null;
    const caixa = modal();

    if (caixa) {
        caixa.hidden = true;
        caixa.innerHTML = '';
    }
}

async function carregarDisponibilidade(indice) {
    const trecho = aberta?.trechos[indice];

    if (!trecho || !trecho.horaInicio || !trecho.horaFim) {
        return;
    }

    const chave = chaveDisponibilidade(trecho);

    if (disponibilidades.has(chave)) {
        return;
    }

    try {
        const resposta = await API.getDisponibilidadeCobertura({
            dataISO: trecho.dataISO,
            horaInicio: horaCurta(trecho.horaInicio),
            horaFim: horaCurta(trecho.horaFim),
            titularId: aberta.cobertura.titularId,
            coberturaId: aberta.cobertura.id,
            trechoId: trecho.id || undefined
        });

        disponibilidades.set(chave, new Map((resposta.colaboradores || []).map((item) => [Number(item.id), item])));
    } catch (error) {
        // Sem a lista, o seletor segue aberto: o servidor confere ao salvar.
        console.error('[coberturas] falha ao verificar disponibilidade:', error);
        return;
    }

    const select = modal()?.querySelector(`.cobertura-trecho[data-indice="${indice}"] select[data-campo="substitutoId"]`);

    if (select && aberta) {
        select.innerHTML = opcoesSubstituto(aberta.trechos[indice]);
    }
}

function mudarCampo(alvo) {
    const linha = alvo.closest('.cobertura-trecho');

    if (!linha || !aberta) {
        return;
    }

    const indice = Number(linha.dataset.indice);
    const trecho = { ...aberta.trechos[indice] };
    const campo = alvo.dataset.campo;

    if (campo === 'substitutoId') {
        trecho.substitutoId = alvo.value ? Number(alvo.value) : null;
        trecho.substitutoOculto = false;
        trecho.tipoCredito = trecho.substitutoId === null ? null : trecho.tipoCredito;
    } else if (campo === 'tipoCredito') {
        trecho.tipoCredito = alvo.value || null;
    } else if (campo === 'horaInicio' || campo === 'horaFim') {
        trecho[campo] = alvo.value;
    }

    aberta.trechos[indice] = trecho;
    aberta.alterado = true;

    // Trocar quem cobre so mexe nesta linha (habilita o destino); o resto
    // da janela continua como esta, sem perder o foco.
    if (campo === 'substitutoId') {
        linha.classList.toggle('is-pendente', trecho.substitutoId === null);
        linha.querySelector('select[data-campo="tipoCredito"]').disabled = trecho.substitutoId === null;
    }

    if (campo === 'horaInicio' || campo === 'horaFim') {
        linha.querySelector('.cobertura-trecho-duracao').textContent = textoDuracao(duracaoTrecho(trecho));
    }

    renderResumo();
}

function acaoTrecho(acao, indice) {
    if (acao === 'dividir') {
        const metades = dividirAoMeio(aberta.trechos[indice]);

        if (!metades) {
            mostrarToast('Este horario e curto demais para dividir.', 'warning');
            return;
        }

        aberta.trechos.splice(indice, 1, ...metades);
    } else if (acao === 'remover') {
        aberta.trechos.splice(indice, 1);
    }

    aberta.alterado = true;
    renderCorpo();
}

function atribuirTodos() {
    const substitutoId = document.getElementById('coberturaTodosSubstituto')?.value;
    const tipoCredito = document.getElementById('coberturaTodosCredito')?.value || 'banco';

    if (!substitutoId) {
        mostrarToast('Escolha quem cobre os horarios pendentes.', 'warning');
        return;
    }

    aberta.trechos = atribuirPendentes(aberta.trechos, substitutoId, tipoCredito);
    aberta.alterado = true;
    renderCorpo();
}

async function salvar() {
    const sem = aberta.trechos.find((trecho) => trecho.substitutoId !== null && trecho.substitutoId !== undefined && !trecho.tipoCredito);

    if (sem) {
        mostrarToast(`Escolha banco de horas ou hora extra no horario de ${rotuloDia(sem.dataISO)} ${horaCurta(sem.horaInicio)}.`, 'warning');
        return;
    }

    try {
        const resposta = await API.salvarCobertura(aberta.cobertura.id, {
            trechos: trechosParaEnvio(aberta.trechos),
            observacao: document.getElementById('coberturaObservacao')?.value || null
        });

        mostrarToast('Cobertura salva.', 'success');
        const aoMudar = aberta.aoMudar;
        abrirEditorCobertura(resposta.data, aoMudar);
        await aoMudar?.();
    } catch (error) {
        // 409 explica quem nao pode cobrir e por que; 400, o que esta errado.
        mostrarToast(error.message || 'Nao foi possivel salvar a cobertura.', 'error');
    }
}

async function excluir() {
    if (!window.confirm(`Excluir a cobertura de ${aberta.cobertura.titularNome || 'colaborador'}? Os horarios atribuidos deixam de valer na escala, no banco de horas e nos plantoes.`)) {
        return;
    }

    try {
        await API.excluirCobertura(aberta.cobertura.id);
        const aoMudar = aberta.aoMudar;
        fechar(false);
        mostrarToast('Cobertura excluida.', 'success');
        await aoMudar?.();
    } catch (error) {
        mostrarToast(error.message || 'Nao foi possivel excluir a cobertura.', 'error');
    }
}

function ligar(caixa) {
    if (caixa.dataset.ligado === 'sim') {
        return;
    }

    caixa.dataset.ligado = 'sim';

    caixa.addEventListener('click', (evento) => {
        if (!aberta) {
            return;
        }

        if (evento.target === caixa) {
            fechar();
            return;
        }

        const botaoTrecho = evento.target.closest('[data-acao-trecho]');

        if (botaoTrecho) {
            acaoTrecho(botaoTrecho.dataset.acaoTrecho, Number(botaoTrecho.closest('.cobertura-trecho').dataset.indice));
            return;
        }

        const acao = evento.target.closest('[data-acao-cobertura]')?.dataset.acaoCobertura;

        if (acao === 'fechar') {
            fechar();
        } else if (acao === 'atribuir-todos') {
            atribuirTodos();
        } else if (acao === 'salvar') {
            salvar();
        } else if (acao === 'excluir') {
            excluir();
        }
    });

    caixa.addEventListener('change', (evento) => {
        if (evento.target.matches('[data-campo]')) {
            mudarCampo(evento.target);
        }
    });

    caixa.addEventListener('input', (evento) => {
        if (evento.target.id === 'coberturaObservacao' && aberta) {
            aberta.alterado = true;
        }
    });

    // Ao abrir o seletor de quem cobre, busca quem pode assumir o horario.
    caixa.addEventListener('focusin', (evento) => {
        if (evento.target.matches('select[data-campo="substitutoId"]')) {
            carregarDisponibilidade(Number(evento.target.closest('.cobertura-trecho').dataset.indice));
        }
    });

    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && aberta) {
            fechar();
        }
    });
}

// `aoMudar`: chamado depois de salvar ou excluir, para a lista se refazer.
export function abrirEditorCobertura(cobertura, aoMudar = null) {
    const caixa = modal();

    if (!caixa) {
        return;
    }

    aberta = {
        cobertura,
        trechos: (cobertura.trechos || []).map((trecho) => ({ ...trecho })),
        observacao: cobertura.observacao,
        alterado: false,
        aoMudar
    };
    // A agenda pode ter mudado desde a ultima consulta.
    disponibilidades.clear();

    ligar(caixa);
    render();
}

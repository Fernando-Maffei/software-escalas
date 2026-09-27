import { escapeHtml } from '../../../lib/html-seguro.js';
import { API } from '../../api.js';
import { estado } from '../../estado.js';
import { formatarDataPtBr, formatarHoraInput, getBancoHorasResumoByColaborador } from './helpers.js';

function getAusenciaDefaults(tipo, subtipo = null) {
    if (tipo === 'ferias') {
        return {
            subtipo: 'ferias',
            descontaBancoHoras: false,
            subtipoBloqueado: true,
            descontoBloqueado: true,
            hint: 'Ferias nao descontam do banco de horas.'
        };
    }

    if (tipo === 'folga') {
        return {
            subtipo: 'folga',
            descontaBancoHoras: true,
            subtipoBloqueado: true,
            descontoBloqueado: false,
            hint: 'Folga debita a jornada padrao do colaborador no banco de horas.'
        };
    }

    if (subtipo === 'medico') {
        return {
            subtipo: 'medico',
            descontaBancoHoras: false,
            subtipoBloqueado: false,
            descontoBloqueado: false,
            hint: 'Lancamentos medicos podem ficar sem desconto no banco.'
        };
    }

    return {
        subtipo: subtipo || 'comum',
        descontaBancoHoras: true,
        subtipoBloqueado: false,
        descontoBloqueado: false,
        hint: 'Ausencias e folgas podem gerar debito, salvo quando voce desmarcar o desconto.'
    };
}

export function aplicarDefaultsBancoHorasLancamento(options = {}) {
    const { force = false, resetManual = false } = options;
    const tipo = document.getElementById('tipoLancamento')?.value;
    const painel = document.getElementById('camposBancoHorasPessoal');
    const subtipo = document.getElementById('ausenciaSubtipo');
    const desconto = document.getElementById('descontaBancoHoras');
    const hint = document.getElementById('descontaBancoHorasHint');

    if (!painel || !subtipo || !desconto || !hint) {
        return;
    }

    if (resetManual) {
        delete desconto.dataset.manualOverride;
    }

    const isPessoal = tipo && tipo !== 'feriado';
    painel.classList.toggle('hidden', !isPessoal);

    if (!isPessoal) {
        return;
    }

    const defaults = getAusenciaDefaults(tipo, subtipo.value);
    const keepManual = desconto.dataset.manualOverride === 'true' && !force;

    if (!subtipo.value || force || defaults.subtipoBloqueado) {
        subtipo.value = defaults.subtipo;
    }

    if (!keepManual) {
        desconto.checked = defaults.descontaBancoHoras;
    }

    subtipo.disabled = defaults.subtipoBloqueado;
    desconto.disabled = defaults.descontoBloqueado;
    hint.textContent = defaults.hint;
}

export function resetBancoHorasLancamento() {
    const subtipo = document.getElementById('ausenciaSubtipo');
    const desconto = document.getElementById('descontaBancoHoras');
    const observacao = document.getElementById('observacaoLancamento');

    if (subtipo) {
        subtipo.value = 'comum';
    }

    if (desconto) {
        desconto.checked = true;
        delete desconto.dataset.manualOverride;
    }

    if (observacao) {
        observacao.value = '';
    }

    aplicarDefaultsBancoHorasLancamento({ force: true, resetManual: true });
}

export function preencherBancoHorasLancamento(item) {
    const subtipo = document.getElementById('ausenciaSubtipo');
    const desconto = document.getElementById('descontaBancoHoras');
    const observacao = document.getElementById('observacaoLancamento');
    const hint = document.getElementById('descontaBancoHorasHint');
    const tipo = document.getElementById('tipoLancamento')?.value || item.tipo || item.Tipo;

    if (!subtipo || !desconto || !observacao || !hint) {
        return;
    }

    subtipo.value = item.subtipo || item.Subtipo || getAusenciaDefaults(tipo).subtipo;
    desconto.checked = item.descontaBancoHoras === null || item.descontaBancoHoras === undefined
        ? getAusenciaDefaults(tipo, subtipo.value).descontaBancoHoras
        : Boolean(item.descontaBancoHoras);
    observacao.value = item.observacao || item.Observacao || '';
    desconto.dataset.manualOverride = 'true';

    const defaults = getAusenciaDefaults(tipo, subtipo.value);
    subtipo.disabled = defaults.subtipoBloqueado;
    desconto.disabled = defaults.descontoBloqueado;
    hint.textContent = defaults.hint;
}

export function renderResumoBancoHorasAviso() {
    if (!estado.bancoHorasStatus || estado.bancoHorasStatus.enabled !== false) {
        return '';
    }

    return `
            <div class="banco-horas-alert">
                <i class="fas fa-database"></i>
                <div>
                    <strong>Banco de horas aguardando migracao</strong>
                    <span>${escapeHtml(estado.bancoHorasStatus.message || 'Aplique o script SQL para liberar saldo e extrato.')}</span>
                </div>
            </div>
        `;
}

export function renderCardBancoHoras(colaborador) {
    const resumo = getBancoHorasResumoByColaborador(colaborador.Id);
    // Saldo atual vem da grade semanal (mesmo numero da tela Banco de Horas).
    const saldoSemanal = (estado.bancoHorasSaldoSemanal || {})[Number(colaborador.Id)] || null;
    const saldoClasse = (saldoSemanal ? saldoSemanal.minutos : 0) < 0 ? 'negativo' : 'positivo';
    const saldoTexto = saldoSemanal ? saldoSemanal.formatado : '0:00';
    const creditosTexto = resumo ? resumo.creditosMesFormatado : '00h 00m';
    const debitosTexto = resumo ? resumo.debitosMesFormatado : '00h 00m';

    return `
            <div class="banco-horas-card">
                <div class="banco-horas-saldo ${saldoClasse}">
                    <span class="banco-horas-label">Saldo atual</span>
                    <strong>${escapeHtml(saldoTexto)}</strong>
                </div>
                <div class="banco-horas-metrics">
                    <span><i class="fas fa-arrow-up"></i> Creditos do mes: ${escapeHtml(creditosTexto)}</span>
                    <span><i class="fas fa-arrow-down"></i> Debitos do mes: ${escapeHtml(debitosTexto)}</span>
                </div>
                <button type="button" class="btn-secondary btn-banco-horas" data-extrato-colaborador="${colaborador.Id}">
                    <i class="fas fa-receipt"></i> Extrato
                </button>
            </div>
        `;
}

function ensureBancoHorasModal() {
    if (document.getElementById('modalBancoHoras')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'modalBancoHoras';
    modal.className = 'modal hidden';
    modal.innerHTML = `
            <div class="modal-content banco-horas-modal-content">
                <div class="modal-header">
                    <h3 id="modalBancoHorasTitulo"><i class="fas fa-receipt"></i> Banco de horas</h3>
                    <button class="modal-close" id="fecharModalBancoHorasBtn">&times;</button>
                </div>
                <div class="modal-body" id="modalBancoHorasBody">
                    <div class="loading-state">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Carregando extrato...</p>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
}

function renderExtratoBancoHoras(payload) {
    const body = document.getElementById('modalBancoHorasBody');

    if (!body) {
        return;
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const horasExtras = Array.isArray(payload.horasExtras) ? payload.horasExtras : [];

    if (items.length === 0 && horasExtras.length === 0) {
        body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento encontrado.</p>
                </div>
            `;
        return;
    }

    const movimentos = items.length > 0
        ? `
                <div class="banco-horas-extrato-list">
                    ${items.map((item) => `
                        <article class="banco-horas-movimento ${item.minutos < 0 ? 'debito' : 'credito'}">
                            <header>
                                <div>
                                    <strong>${escapeHtml(item.descricao)}</strong>
                                    <span>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</span>
                                </div>
                                <div class="banco-horas-movimento-valores">
                                    <strong>${escapeHtml(item.minutosFormatado)}</strong>
                                    <span>Saldo: ${escapeHtml(item.saldoAcumuladoFormatado)}</span>
                                </div>
                            </header>
                            ${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}
                        </article>
                    `).join('')}
                </div>
            `
        : `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Nenhum movimento no banco de horas.</p>
                </div>
            `;

    // Plantao de hora extra e pago em folha e nao mexe no saldo, entao fica
    // numa secao propria — misturar com os movimentos daria a entender que
    // as horas entraram no banco.
    const extras = horasExtras.length === 0 ? '' : `
            <section class="banco-horas-extras">
                <header class="banco-horas-extras-header">
                    <h4><i class="fas fa-money-bill-wave"></i> Horas extras de plantao</h4>
                    <strong>${escapeHtml(payload.horasExtrasFormatado || '')}</strong>
                </header>
                <p class="banco-horas-extras-aviso">Pagas em folha: nao entram no saldo acima.</p>
                <div class="banco-horas-extras-list">
                    ${horasExtras.map((item) => `
                        <article class="banco-horas-extra">
                            <div>
                                <strong>${escapeHtml(formatarDataPtBr(item.dataReferencia))}</strong>
                                <span>${escapeHtml(formatarHoraInput(item.horaInicio) || '--:--')} - ${escapeHtml(formatarHoraInput(item.horaFim) || '--:--')}</span>
                            </div>
                            <strong class="banco-horas-extra-total">${escapeHtml(item.minutosFormatado)}</strong>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;

    body.innerHTML = movimentos + extras;
}

export async function abrirExtratoBancoHoras(colaboradorId) {
    ensureBancoHorasModal();
    const modal = document.getElementById('modalBancoHoras');
    const titulo = document.getElementById('modalBancoHorasTitulo');
    const body = document.getElementById('modalBancoHorasBody');
    const colaborador = (estado.colaboradores || []).find((item) => Number(item.Id) === Number(colaboradorId));

    if (!modal || !titulo || !body) {
        return;
    }

    titulo.innerHTML = `<i class="fas fa-receipt"></i> Banco de horas - ${escapeHtml(colaborador?.Nome || 'Colaborador')}`;
    body.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-circle-notch fa-spin"></i>
                <p>Carregando extrato...</p>
            </div>
        `;

    modal.classList.remove('hidden');
    modal.classList.add('active');

    try {
        const payload = await API.getBancoHorasExtrato(colaboradorId);
        renderExtratoBancoHoras(payload);
    } catch (error) {
        body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${escapeHtml(error.message || 'Nao foi possivel carregar o extrato.')}</p>
                </div>
            `;
    }
}

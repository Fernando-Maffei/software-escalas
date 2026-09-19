/* PROTOTIPO (branch prototipo/cobertura)
   Modal "Cobertura e compensacoes", aberto pela Escala do Dia.

   - Cobertura: quem cobriu o posto de quem estava de folga (+ marca de hora extra).
   - Compensacao: domingo folgado / folga compensatoria <-> dia da reposicao.

   Toda regra (quem pode cobrir, reposicao em dia de folga, domingo de verdade)
   e validada no servidor na hora de lancar; aqui so montamos o pedido e
   mostramos a resposta. */
(function () {
    'use strict';

    const ID = 'modalCoberturas';
    let mesRef = null; // 'YYYY-MM'

    const esc = (valor) => String(valor ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const toast = (msg, tipo) => typeof window.mostrarToast === 'function' && window.mostrarToast(msg, tipo || 'info');
    const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '--');
    const hhmm = (valor) => {
        const texto = String(valor || '');
        const match = texto.match(/(\d{2}:\d{2})/);
        return match ? match[1] : '';
    };

    function limitesDoMes(ym) {
        const [ano, mes] = ym.split('-').map(Number);
        const ultimo = new Date(ano, mes, 0).getDate();
        return { inicio: `${ym}-01`, fim: `${ym}-${String(ultimo).padStart(2, '0')}` };
    }

    // Sugestao: o ultimo domingo do mes (costuma ser o folgado).
    function ultimoDomingo(ym) {
        const { fim } = limitesDoMes(ym);
        const [ano, mes, dia] = fim.split('-').map(Number);
        const data = new Date(ano, mes - 1, dia, 12);
        data.setDate(data.getDate() - data.getDay());
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    function opcoesColaboradores(selecionado = '') {
        const ativos = (window.colaboradores || [])
            .filter((c) => c.Ativo !== false && c.Ativo !== 0)
            .sort((a, b) => String(a.Nome).localeCompare(String(b.Nome), 'pt-BR'));
        return ['<option value="">Selecione</option>']
            .concat(ativos.map((c) => `<option value="${c.Id}"${String(c.Id) === String(selecionado) ? ' selected' : ''}>${esc(c.Nome)}</option>`))
            .join('');
    }

    function cadastroDe(id) {
        return (window.colaboradores || []).find((c) => Number(c.Id) === Number(id)) || null;
    }

    function fechar() {
        document.getElementById(ID)?.remove();
    }

    async function recarregarEscala() {
        if (typeof window.atualizarTudo === 'function') {
            await window.atualizarTudo({ silent: true, source: 'escala' });
        }
    }

    async function renderLista() {
        const alvo = document.getElementById('cobLista');
        if (!alvo) {
            return;
        }

        alvo.innerHTML = '<div class="bh-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

        try {
            const { inicio, fim } = limitesDoMes(mesRef);
            const dados = await window.API.getCoberturas({ inicio, fim });
            const coberturas = dados.coberturas || [];
            const compensacoes = dados.compensacoes || [];

            alvo.innerHTML = `
                <h4 class="cob-subtitulo"><i class="fas fa-people-arrows"></i> Coberturas do mes (${coberturas.length})</h4>
                ${coberturas.length ? `
                    <table class="banco-horas-tabela bh-tabela-verificar cob-tabela">
                        <thead><tr><th>Dia</th><th>Quem cobriu</th><th>Cobriu</th><th>Horario</th><th>Hora extra</th><th></th></tr></thead>
                        <tbody>${coberturas.map((c) => `
                            <tr data-cobertura="${c.id}">
                                <td>${esc(br(c.dataISO))}</td>
                                <td>${esc(c.colaboradorNome)}</td>
                                <td>${esc(c.cobertoNome)}</td>
                                <td>${esc(hhmm(c.horaInicio))}-${esc(hhmm(c.horaFim))}</td>
                                <td>${c.geraHoraExtra ? '<span class="cob-he">Gerou HE</span>' : '<small>nao</small>'}</td>
                                <td><button type="button" class="btn-icon-sm delete" data-excluir-cobertura="${c.id}" title="Excluir"><i class="fas fa-trash"></i></button></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>` : '<div class="bh-vazio">Nenhuma cobertura neste mes.</div>'}

                <h4 class="cob-subtitulo"><i class="fas fa-arrows-rotate"></i> Compensacoes do mes (${compensacoes.length})</h4>
                ${compensacoes.length ? `
                    <table class="banco-horas-tabela bh-tabela-verificar cob-tabela">
                        <thead><tr><th>Colaborador</th><th>Folga</th><th></th><th>Reposicao</th><th></th></tr></thead>
                        <tbody>${compensacoes.map((c) => `
                            <tr data-compensacao="${c.id}">
                                <td>${esc(c.colaboradorNome)}</td>
                                <td>${esc(br(c.dataFolga))} <small>${c.tipo === 'domingo_folgado' ? 'domingo folgado' : 'folga compensatoria'}</small></td>
                                <td><i class="fas fa-arrow-right-arrow-left"></i></td>
                                <td>${esc(br(c.dataTrabalho))} <small>${esc(hhmm(c.trabalhoInicio))}-${esc(hhmm(c.trabalhoFim))}</small></td>
                                <td><button type="button" class="btn-icon-sm delete" data-excluir-compensacao="${c.id}" title="Excluir"><i class="fas fa-trash"></i></button></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>` : '<div class="bh-vazio">Nenhuma compensacao neste mes.</div>'}
            `;

            alvo.querySelectorAll('[data-excluir-cobertura]').forEach((botao) => botao.addEventListener('click', () => excluir('cobertura', botao.dataset.excluirCobertura)));
            alvo.querySelectorAll('[data-excluir-compensacao]').forEach((botao) => botao.addEventListener('click', () => excluir('compensacao', botao.dataset.excluirCompensacao)));
        } catch (error) {
            alvo.innerHTML = `<div class="bh-erro">${esc(error.message || 'Falha ao carregar.')}</div>`;
        }
    }

    async function excluir(tipo, id) {
        if (!window.confirm(tipo === 'cobertura' ? 'Excluir esta cobertura?' : 'Excluir esta compensacao? O domingo e a reposicao voltam para a escala normal.')) {
            return;
        }

        try {
            if (tipo === 'cobertura') {
                await window.API.excluirCobertura(id);
            } else {
                await window.API.excluirCompensacao(id);
            }
            toast('Excluido.', 'success');
            await renderLista();
            await recarregarEscala();
        } catch (error) {
            toast(error.message || 'Falha ao excluir.', 'error');
        }
    }

    async function enviar(botao, acao) {
        if (botao.disabled) {
            return;
        }

        botao.disabled = true;

        try {
            await acao();
            await renderLista();
            await recarregarEscala();
        } catch (error) {
            toast(error.message || 'Falha ao salvar.', 'error');
        } finally {
            botao.disabled = false;
        }
    }

    function valor(id) {
        return document.getElementById(id)?.value || '';
    }

    function preencherHorario(idColaborador, idInicio, idFim) {
        const cadastro = cadastroDe(valor(idColaborador));
        if (!cadastro) {
            return;
        }
        document.getElementById(idInicio).value = hhmm(cadastro.TrabalhoInicio);
        document.getElementById(idFim).value = hhmm(cadastro.TrabalhoFim);
    }

    async function abrirModalCoberturas(dataISO) {
        fechar();

        if (typeof window.carregarColaboradores === 'function' && !(window.colaboradores || []).length) {
            await window.carregarColaboradores();
        }

        const dia = dataISO || new Date().toISOString().slice(0, 10);
        mesRef = dia.slice(0, 7);

        const overlay = document.createElement('div');
        overlay.id = ID;
        overlay.className = 'bh-modal-overlay';
        overlay.innerHTML = `
            <div class="bh-modal cob-modal">
                <div class="bh-modal-header">
                    <h3><i class="fas fa-people-arrows"></i> Cobertura e compensacoes <small>(prototipo)</small></h3>
                    <button type="button" class="bh-modal-fechar" aria-label="Fechar"><i class="fas fa-times"></i></button>
                </div>
                <div class="bh-modal-body">
                    <div class="cob-formularios">
                        <section class="cob-form">
                            <h4 class="cob-subtitulo"><i class="fas fa-user-shield"></i> Lancar cobertura</h4>
                            <p class="bh-modal-info">Quem cobriu o posto de quem estava de folga. O sistema so marca se gerou hora extra — valor e com a folha.</p>
                            <label>Dia <input type="date" id="cobData" class="form-control" value="${esc(dia)}"></label>
                            <label>Quem cobriu <select id="cobQuem" class="form-control">${opcoesColaboradores()}</select></label>
                            <label>Quem estava de folga <select id="cobCoberto" class="form-control">${opcoesColaboradores()}</select></label>
                            <div class="cob-linha">
                                <label>Inicio <input type="time" id="cobInicio" class="form-control"></label>
                                <label>Fim <input type="time" id="cobFim" class="form-control"></label>
                            </div>
                            <label class="cob-check"><input type="checkbox" id="cobHE" checked> Gerou hora extra</label>
                            <label>Observacao <input type="text" id="cobObs" class="form-control" maxlength="500"></label>
                            <button type="button" class="btn-primary" id="cobSalvar"><i class="fas fa-plus"></i> Lancar cobertura</button>
                        </section>

                        <section class="cob-form">
                            <h4 class="cob-subtitulo"><i class="fas fa-arrows-rotate"></i> Lancar compensacao</h4>
                            <p class="bh-modal-info">O dia de folga fica vinculado ao dia trabalhado em troca (reposicao).</p>
                            <label>Colaborador <select id="compColab" class="form-control">${opcoesColaboradores()}</select></label>
                            <label>Tipo
                                <select id="compTipo" class="form-control">
                                    <option value="domingo_folgado">Domingo folgado</option>
                                    <option value="folga_compensatoria">Folga compensatoria</option>
                                </select>
                            </label>
                            <div class="cob-linha">
                                <label>Dia da folga <input type="date" id="compFolga" class="form-control" value="${esc(ultimoDomingo(mesRef))}"></label>
                                <label>Dia da reposicao <input type="date" id="compTrabalho" class="form-control"></label>
                            </div>
                            <div class="cob-linha">
                                <label>Inicio <input type="time" id="compInicio" class="form-control"></label>
                                <label>Fim <input type="time" id="compFim" class="form-control"></label>
                            </div>
                            <label>Observacao <input type="text" id="compObs" class="form-control" maxlength="500"></label>
                            <button type="button" class="btn-primary" id="compSalvar"><i class="fas fa-plus"></i> Lancar compensacao</button>
                        </section>
                    </div>
                    <div id="cobLista" class="cob-lista"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('.bh-modal-fechar').addEventListener('click', fechar);
        overlay.addEventListener('click', (evento) => { if (evento.target === overlay) { fechar(); } });

        // O horario da cobertura sugere o do posto coberto; o da reposicao, o
        // do proprio colaborador. Os dois continuam editaveis.
        document.getElementById('cobCoberto').addEventListener('change', () => preencherHorario('cobCoberto', 'cobInicio', 'cobFim'));
        document.getElementById('compColab').addEventListener('change', () => preencherHorario('compColab', 'compInicio', 'compFim'));

        const botaoCob = document.getElementById('cobSalvar');
        botaoCob.addEventListener('click', () => enviar(botaoCob, async () => {
            await window.API.salvarCobertura({
                dataISO: valor('cobData'),
                colaboradorId: valor('cobQuem'),
                cobertoColaboradorId: valor('cobCoberto'),
                horaInicio: valor('cobInicio'),
                horaFim: valor('cobFim'),
                geraHoraExtra: document.getElementById('cobHE').checked,
                observacao: valor('cobObs')
            });
            toast('Cobertura lancada.', 'success');
        }));

        const botaoComp = document.getElementById('compSalvar');
        botaoComp.addEventListener('click', () => enviar(botaoComp, async () => {
            await window.API.salvarCompensacao({
                colaboradorId: valor('compColab'),
                tipo: valor('compTipo'),
                dataFolga: valor('compFolga'),
                dataTrabalho: valor('compTrabalho'),
                trabalhoInicio: valor('compInicio') || null,
                trabalhoFim: valor('compFim') || null,
                observacao: valor('compObs')
            });
            toast('Compensacao lancada.', 'success');
        }));

        await renderLista();
    }

    window.abrirModalCoberturas = abrirModalCoberturas;
}());

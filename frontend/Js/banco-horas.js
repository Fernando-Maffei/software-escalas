/* ===========================
   TELA BANCO DE HORAS (grade semanal)
   Colunas = colaboradores, linhas = semanas (segunda-feira).
   O gestor lanca o saldo acumulado de cada um toda segunda.
=========================== */

(function () {
    'use strict';

    let dadosBanco = { colaboradores: [], semanas: [], periodo: null };
    let limiteSemanas = 7; // quantas semanas mostrar (0 = todas)
    let dadosExtras = null; // ultimo relatorio de horas extras gerado (fonte do PDF)

    function toast(mensagem, tipo) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(mensagem, tipo || 'info');
        }
    }

    // ---- helpers de data/hora (espelham o backend) ----
    function toMondayISO(dateISO) {
        const date = new Date(`${dateISO}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        const weekday = date.getUTCDay(); // 0 = domingo
        const shift = weekday === 0 ? -6 : 1 - weekday;
        date.setUTCDate(date.getUTCDate() + shift);
        return date.toISOString().slice(0, 10);
    }

    function hojeMondayISO() {
        return toMondayISO(new Date().toISOString().slice(0, 10));
    }

    function addDiasISO(dateISO, dias) {
        const date = new Date(`${dateISO}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + dias);
        return date.toISOString().slice(0, 10);
    }

    function labelData(dateISO) {
        const [ano, mes, dia] = dateISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    // Aceita "H:MM", "H" (= H:00), com sinal opcional. Vazio => null (limpa).
    // Invalido => undefined.
    function parseRelogio(raw) {
        const texto = String(raw || '').trim();
        if (!texto || texto === '-') {
            return texto === '-' ? undefined : null;
        }
        const match = texto.match(/^([+-])?\s*(\d+)(?::(\d{2}))?$/);
        if (!match) {
            return undefined;
        }
        const minutos = match[3] === undefined ? 0 : Number(match[3]);
        if (minutos >= 60) {
            return undefined;
        }
        const sinal = match[1] === '-' ? -1 : 1;
        return sinal * ((Number(match[2]) * 60) + minutos);
    }

    // Mascara de digitacao: so numeros (e "-" opcional na frente) viram H:MM.
    // Os dois ultimos digitos sao sempre os minutos; o resto, as horas.
    function mascararHora(valor) {
        const texto = String(valor || '');
        const negativo = texto.trim().startsWith('-');
        const digitos = texto.replace(/\D/g, '');
        if (!digitos) {
            return negativo ? '-' : '';
        }
        const corpo = digitos.length <= 2
            ? digitos
            : `${digitos.slice(0, -2)}:${digitos.slice(-2)}`;
        return (negativo ? '-' : '') + corpo;
    }

    // Filtro "Meus setores" (preferencia de UI, servida por meus-setores.js).
    // Vazio = ver todos. O teto duro (setores permitidos) ja veio filtrado do
    // backend. Espelha o comportamento da Escala do Dia / Dashboard.
    function filtrarPorMeusSetores(colaboradores) {
        const lista = Array.isArray(colaboradores) ? colaboradores : [];
        const meus = typeof window.getMeusSetores === 'function' ? window.getMeusSetores() : [];
        if (!meus.length) {
            return lista;
        }
        const permitidos = new Set(meus.map(String));
        return lista.filter((item) => permitidos.has(String(item.setorId ?? '')));
    }

    function formatRelogio(minutos) {
        const safe = Number.isFinite(Number(minutos)) ? Math.round(Number(minutos)) : 0;
        const sinal = safe < 0 ? '-' : '';
        const total = Math.abs(safe);
        const horas = Math.floor(total / 60);
        const resto = total % 60;
        return `${sinal}${horas}:${String(resto).padStart(2, '0')}`;
    }

    function escapeHtml(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ---- render ----
    function render() {
        const appContent = document.getElementById('appContent');
        if (!appContent) {
            return;
        }

        appContent.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-clock"></i> Banco de Horas</h1>
            </div>

            <div class="banco-horas-toolbar">
                <div class="bh-toolbar-info">
                    <i class="fas fa-info-circle"></i>
                    Lance o saldo acumulado de cada colaborador toda segunda-feira.
                    Digite no formato <strong>H:MM</strong> (use <strong>-</strong> para saldo devedor).
                </div>
                <div class="bh-toolbar-actions">
                    <label for="bhNovaSemana">Semana</label>
                    <input type="date" id="bhNovaSemana" class="form-control">
                    <button type="button" id="bhBtnAddSemana" class="btn-primary">
                        <i class="fas fa-plus"></i> Adicionar semana
                    </button>
                    <button type="button" id="bhBtnGerarSemana" class="btn-secondary">
                        <i class="fas fa-wand-magic-sparkles"></i> Gerar semana
                    </button>
                    <select id="bhFiltroSemanas" class="form-control" title="Quantas semanas mostrar">
                        <option value="7">Ultimas 7</option>
                        <option value="15">Ultimas 15</option>
                        <option value="0">Todas</option>
                    </select>
                </div>
            </div>

            <div id="bhTabelaWrap" class="banco-horas-tabela-wrap">
                <div class="bh-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>
            </div>

            <div class="banco-horas-verificar">
                <div class="bh-verificar-header">
                    <h2><i class="fas fa-magnifying-glass-chart"></i> Verificar horas em carteira</h2>
                    <p>Quantas horas cada colaborador teria num dia, descontando ausencias e folgas lancadas.</p>
                </div>
                <div class="bh-verificar-controls">
                    <label for="bhVerificarData">Dia</label>
                    <input type="date" id="bhVerificarData" class="form-control">
                    <button type="button" id="bhBtnVerificar" class="btn-primary">
                        <i class="fas fa-check"></i> Verificar
                    </button>
                </div>
                <div id="bhVerificarResultado" class="bh-verificar-resultado"></div>
            </div>

            <div class="banco-horas-verificar banco-horas-extras-relatorio">
                <div class="bh-verificar-header">
                    <h2><i class="fas fa-money-bill-wave"></i> Relatorio de horas extras</h2>
                    <p>Plantoes lancados como hora extra no periodo. Pagas em folha: nao entram no saldo da grade acima.</p>
                </div>
                <div class="bh-verificar-controls">
                    <label for="bhExtrasInicio">De</label>
                    <input type="date" id="bhExtrasInicio" class="form-control">
                    <label for="bhExtrasFim">Ate</label>
                    <input type="date" id="bhExtrasFim" class="form-control">
                    <label for="bhExtrasColaborador">Colaborador</label>
                    <select id="bhExtrasColaborador" class="form-control">
                        <option value="">Todos os colaboradores</option>
                    </select>
                    <button type="button" id="bhBtnExtras" class="btn-primary">
                        <i class="fas fa-file-alt"></i> Gerar
                    </button>
                    <button type="button" id="bhBtnExtrasPdf" class="btn-secondary" disabled>
                        <i class="fas fa-download"></i> Exportar PDF
                    </button>
                </div>
                <div id="bhExtrasResultado" class="bh-verificar-resultado"></div>
            </div>
        `;

        const inputSemana = document.getElementById('bhNovaSemana');
        if (inputSemana) {
            inputSemana.value = hojeMondayISO();
        }

        const btnAdd = document.getElementById('bhBtnAddSemana');
        if (btnAdd) {
            btnAdd.addEventListener('click', adicionarSemana);
        }

        const btnGerar = document.getElementById('bhBtnGerarSemana');
        if (btnGerar) {
            btnGerar.addEventListener('click', abrirModalGerarSemana);
        }

        const filtroSemanas = document.getElementById('bhFiltroSemanas');
        if (filtroSemanas) {
            filtroSemanas.value = String(limiteSemanas);
            filtroSemanas.addEventListener('change', () => {
                limiteSemanas = Number(filtroSemanas.value) || 0;
                renderTabela();
            });
        }

        const inputVerificar = document.getElementById('bhVerificarData');
        if (inputVerificar) {
            inputVerificar.value = new Date().toISOString().slice(0, 10);
        }

        const btnVerificar = document.getElementById('bhBtnVerificar');
        if (btnVerificar) {
            btnVerificar.addEventListener('click', verificar);
        }

        // Periodo padrao do relatorio de horas extras: o mes corrente, que e o
        // recorte usado no fechamento da folha.
        const extrasInicio = document.getElementById('bhExtrasInicio');
        if (extrasInicio) {
            extrasInicio.value = primeiroDiaDoMesISO();
        }

        const extrasFim = document.getElementById('bhExtrasFim');
        if (extrasFim) {
            extrasFim.value = new Date().toISOString().slice(0, 10);
        }

        const btnExtras = document.getElementById('bhBtnExtras');
        if (btnExtras) {
            btnExtras.addEventListener('click', gerarRelatorioExtras);
        }

        const btnExtrasPdf = document.getElementById('bhBtnExtrasPdf');
        if (btnExtrasPdf) {
            btnExtrasPdf.addEventListener('click', exportarRelatorioExtras);
        }

        dadosExtras = null;
        carregar();
    }

    async function verificar() {
        const input = document.getElementById('bhVerificarData');
        const alvo = document.getElementById('bhVerificarResultado');
        if (!input || !alvo) {
            return;
        }

        const dataISO = input.value;
        if (!dataISO) {
            toast('Escolha um dia para verificar.', 'warning');
            return;
        }

        alvo.innerHTML = '<div class="bh-loading"><i class="fas fa-spinner fa-spin"></i> Calculando...</div>';

        try {
            const resposta = await window.API.verificarBancoHorasSemanal({ data: dataISO });
            renderVerificar(resposta, alvo);
        } catch (error) {
            alvo.innerHTML = `<div class="bh-erro"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(error.message || 'Falha ao verificar.')}</div>`;
        }
    }

    function renderVerificar(resposta, alvo) {
        const itens = filtrarPorMeusSetores(resposta.itens || []);

        if (itens.length === 0) {
            alvo.innerHTML = '<div class="bh-vazio">Nenhum colaborador para verificar.</div>';
            return;
        }

        const linhas = itens.map((item) => {
            if (item.semBase) {
                return `
                    <tr class="bh-sem-base">
                        <td>${escapeHtml(item.nome)}</td>
                        <td colspan="5">Sem lancamento manual ate essa data</td>
                    </tr>
                `;
            }

            const negativo = item.resultadoMinutos < 0;
            const dias = Number(item.sugestaoDias) || 0;
            const sugestao = dias > 0
                ? `<span class="bh-sugestao-ok">${dias} dia${dias === 1 ? '' : 's'} de folga</span>`
                : '<span class="bh-sugestao-nao">Sem folga disponivel</span>';
            return `
                <tr>
                    <td>${escapeHtml(item.nome)}</td>
                    <td>${escapeHtml(item.baseFormatado)} <small>(${escapeHtml(item.semanaBase)})</small></td>
                    <td class="${item.plantaoMinutos > 0 ? 'bh-plantao' : ''}">${item.plantaoMinutos > 0 ? `+${escapeHtml(item.plantaoFormatado)}` : '0:00'}</td>
                    <td class="${item.descontoMinutos > 0 ? 'bh-desconto' : ''}">${item.descontoMinutos > 0 ? `-${escapeHtml(item.descontoFormatado)}` : '0:00'}</td>
                    <td class="bh-resultado ${negativo ? 'negativo' : 'positivo'}">${escapeHtml(item.resultadoFormatado)}</td>
                    <td class="bh-sugestao">${sugestao}</td>
                </tr>
            `;
        }).join('');

        const avisos = (resposta.avisos || []).length > 0
            ? `<div class="bh-avisos"><i class="fas fa-circle-info"></i> ${resposta.avisos.map(escapeHtml).join('<br>')}</div>`
            : '';

        alvo.innerHTML = `
            <div class="bh-verificar-data">Horas em carteira em <strong>${escapeHtml(labelData(resposta.data))}</strong></div>
            <div class="banco-horas-tabela-wrap">
                <table class="banco-horas-tabela bh-tabela-verificar">
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th>Saldo base (semana)</th>
                            <th>Plantao (+)</th>
                            <th>Desconto</th>
                            <th>Em carteira</th>
                            <th>Sugestao</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
            ${avisos}
        `;
    }

    async function carregar() {
        const wrap = document.getElementById('bhTabelaWrap');
        if (!wrap) {
            return;
        }

        try {
            dadosBanco = await window.API.getBancoHorasSemanal();
            renderTabela();
            preencherColaboradoresExtras();
        } catch (error) {
            wrap.innerHTML = `
                <div class="bh-erro">
                    <i class="fas fa-triangle-exclamation"></i>
                    Nao foi possivel carregar o banco de horas. ${escapeHtml(error.message || '')}
                </div>
            `;
        }
    }

    function renderTabela() {
        const wrap = document.getElementById('bhTabelaWrap');
        if (!wrap) {
            return;
        }

        const todos = dadosBanco.colaboradores || [];
        const colaboradores = filtrarPorMeusSetores(todos);
        // Trava de exibicao: so as ultimas N semanas (as mais recentes ficam no
        // fim, ja que a ordem e crescente). limiteSemanas = 0 mostra todas.
        const todasSemanas = dadosBanco.semanas || [];
        const semanas = limiteSemanas > 0 ? todasSemanas.slice(-limiteSemanas) : todasSemanas;
        const ocultas = todasSemanas.length - semanas.length;

        if (todos.length === 0) {
            wrap.innerHTML = `
                <div class="bh-vazio">
                    <i class="fas fa-users"></i>
                    Cadastre colaboradores para lancar o banco de horas.
                </div>
            `;
            return;
        }

        if (colaboradores.length === 0) {
            wrap.innerHTML = `
                <div class="bh-vazio">
                    <i class="fas fa-filter"></i>
                    Nenhum colaborador nos setores selecionados em "Meus setores".
                </div>
            `;
            return;
        }

        const cabecalhoColaboradores = colaboradores
            .map((colaborador) => `<th class="bh-col-colab">${escapeHtml(colaborador.nome)}</th>`)
            .join('');

        const linhas = semanas.map((semana) => {
            let totalMinutos = 0;
            let temAuto = false;

            const celulas = colaboradores.map((colaborador) => {
                const celula = semana.celulas[colaborador.id];
                const valor = celula ? celula.formatado : '';
                if (celula) {
                    totalMinutos += celula.minutos;
                }
                const statusClasse = celula
                    ? (celula.status === 'auto' ? 'is-auto' : 'is-confirmado')
                    : '';
                if (celula && celula.status === 'auto') {
                    temAuto = true;
                }
                return `
                    <td class="bh-td-celula">
                        <input
                            type="text"
                            class="bh-cell ${statusClasse}"
                            inputmode="numeric"
                            placeholder="--:--"
                            value="${escapeHtml(valor)}"
                            data-col="${colaborador.id}"
                            data-semana="${semana.semanaSegunda}">
                    </td>
                `;
            }).join('');

            const confirmarBtn = temAuto
                ? `<button type="button" class="bh-confirmar-semana" data-semana="${semana.semanaSegunda}" title="Confirmar lancamentos automaticos desta semana"><i class="fas fa-check"></i></button>`
                : '';
            const excluirBtn = `<button type="button" class="bh-excluir-semana" data-semana="${semana.semanaSegunda}" title="Excluir esta semana"><i class="fas fa-trash"></i></button>`;

            return `
                <tr data-semana="${semana.semanaSegunda}">
                    <th class="bh-col-semana">
                        <span class="bh-semana-label">${escapeHtml(semana.label)}</span>
                        <span class="bh-semana-acoes">${confirmarBtn}${excluirBtn}</span>
                    </th>
                    ${celulas}
                    <td class="bh-total" data-semana="${semana.semanaSegunda}">${escapeHtml(formatRelogio(totalMinutos))}</td>
                    <td class="bh-td-obs">
                        <input
                            type="text"
                            class="bh-nota"
                            placeholder="Observacao..."
                            value="${escapeHtml(semana.observacao || '')}"
                            data-semana="${semana.semanaSegunda}">
                    </td>
                </tr>
            `;
        }).join('');

        wrap.innerHTML = `
            <table class="banco-horas-tabela">
                <thead>
                    <tr>
                        <th class="bh-col-semana">Semana</th>
                        ${cabecalhoColaboradores}
                        <th class="bh-col-total">Total</th>
                        <th class="bh-col-obs">Observacao</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas || `<tr><td class="bh-vazio-linha" colspan="${colaboradores.length + 3}">Nenhuma semana ainda. Use "Adicionar semana".</td></tr>`}
                </tbody>
            </table>
            ${ocultas > 0 ? `<div class="bh-ocultas">${ocultas} semana(s) mais antiga(s) oculta(s). Use o filtro "Todas" para ver.</div>` : ''}
        `;

        wrap.querySelectorAll('.bh-cell').forEach((input) => {
            input.addEventListener('input', () => {
                input.value = mascararHora(input.value);
            });
            input.addEventListener('change', () => salvarCelula(input));
            input.addEventListener('keydown', (evento) => {
                if (evento.key === 'Enter') {
                    input.blur();
                }
            });
        });

        wrap.querySelectorAll('.bh-nota').forEach((input) => {
            input.addEventListener('change', () => salvarNota(input));
            input.addEventListener('keydown', (evento) => {
                if (evento.key === 'Enter') {
                    input.blur();
                }
            });
        });

        wrap.querySelectorAll('.bh-confirmar-semana').forEach((btn) => {
            btn.addEventListener('click', () => confirmarSemana(btn.dataset.semana));
        });

        wrap.querySelectorAll('.bh-excluir-semana').forEach((btn) => {
            btn.addEventListener('click', () => excluirSemana(btn.dataset.semana));
        });
    }

    async function excluirSemana(semanaISO) {
        const semana = (dadosBanco.semanas || []).find((item) => item.semanaSegunda === semanaISO);
        const rotulo = semana ? semana.label : semanaISO;

        if (!window.confirm(`Excluir a semana de ${rotulo}? Isso apaga os lancamentos de todos os colaboradores nessa semana.`)) {
            return;
        }

        try {
            await window.API.excluirBancoHorasSemana(semanaISO);
            toast('Semana excluida.', 'success');
            if (typeof window.carregarBancoHorasResumo === 'function') {
                window.carregarBancoHorasResumo();
            }
            await carregar();
        } catch (error) {
            toast(error.message || 'Nao foi possivel excluir a semana.', 'error');
        }
    }

    async function salvarNota(input) {
        const semanaISO = input.dataset.semana;
        const texto = input.value.trim();

        input.classList.add('is-saving');

        try {
            await window.API.salvarBancoHorasSemanalNota({
                semana: semanaISO,
                observacao: texto
            });

            const semana = (dadosBanco.semanas || []).find((item) => item.semanaSegunda === semanaISO);
            if (semana) {
                semana.observacao = texto || null;
            }

            input.classList.remove('is-saving');
            input.classList.add('is-saved');
            setTimeout(() => input.classList.remove('is-saved'), 800);
        } catch (error) {
            input.classList.remove('is-saving');
            toast(error.message || 'Nao foi possivel salvar a observacao.', 'error');
        }
    }

    function recalcularTotalLinha(semanaISO) {
        const wrap = document.getElementById('bhTabelaWrap');
        if (!wrap) {
            return;
        }

        let total = 0;
        wrap.querySelectorAll(`.bh-cell[data-semana="${semanaISO}"]`).forEach((input) => {
            const minutos = parseRelogio(input.value);
            if (Number.isFinite(minutos)) {
                total += minutos;
            }
        });

        const totalCell = wrap.querySelector(`.bh-total[data-semana="${semanaISO}"]`);
        if (totalCell) {
            totalCell.textContent = formatRelogio(total);
        }
    }

    async function salvarCelula(input) {
        const colaboradorId = Number(input.dataset.col);
        const semanaISO = input.dataset.semana;
        const raw = input.value.trim();
        const minutos = parseRelogio(raw);

        if (minutos === undefined) {
            toast('Use o formato H:MM (ex: 18:39 ou -2:30).', 'error');
            input.focus();
            return;
        }

        input.classList.add('is-saving');

        try {
            const resposta = await window.API.salvarBancoHorasSemanalCelula({
                colaboradorId,
                semana: semanaISO,
                saldo: raw
            });

            input.value = resposta.removido ? '' : resposta.formatado;
            atualizarModelo(semanaISO, colaboradorId, resposta);
            recalcularTotalLinha(semanaISO);
            // Editar manualmente confirma (verde) e tira o amarelo.
            input.classList.remove('is-auto');
            if (!resposta.removido) {
                input.classList.add('is-confirmado');
            } else {
                input.classList.remove('is-confirmado');
            }
            atualizarBotaoConfirmarSemana(semanaISO);
            input.classList.remove('is-saving');
            input.classList.add('is-saved');
            setTimeout(() => input.classList.remove('is-saved'), 800);

            // Mantem o "Saldo atual" do cadastro do colaborador em sincronia.
            if (typeof window.carregarBancoHorasResumo === 'function') {
                window.carregarBancoHorasResumo();
            }
        } catch (error) {
            input.classList.remove('is-saving');
            toast(error.message || 'Nao foi possivel salvar o lancamento.', 'error');
        }
    }

    function atualizarModelo(semanaISO, colaboradorId, resposta) {
        const semana = (dadosBanco.semanas || []).find((item) => item.semanaSegunda === semanaISO);
        if (!semana) {
            return;
        }

        if (resposta.removido) {
            delete semana.celulas[colaboradorId];
        } else {
            semana.celulas[colaboradorId] = {
                minutos: resposta.minutos,
                formatado: resposta.formatado,
                observacao: resposta.observacao || null,
                status: resposta.status || 'confirmado'
            };
        }
    }

    // Some com o botao "confirmar" da semana quando nao ha mais celula amarela.
    function atualizarBotaoConfirmarSemana(semanaISO) {
        const wrap = document.getElementById('bhTabelaWrap');
        if (!wrap) {
            return;
        }
        const aindaTemAuto = wrap.querySelector(`.bh-cell.is-auto[data-semana="${semanaISO}"]`);
        if (!aindaTemAuto) {
            const btn = wrap.querySelector(`.bh-confirmar-semana[data-semana="${semanaISO}"]`);
            if (btn) {
                btn.remove();
            }
        }
    }

    async function confirmarSemana(semanaISO) {
        try {
            await window.API.confirmarBancoHorasSemana({ semana: semanaISO });
            toast('Semana confirmada.', 'success');
            await carregar();
        } catch (error) {
            toast(error.message || 'Nao foi possivel confirmar a semana.', 'error');
        }
    }

    function adicionarSemana() {
        const input = document.getElementById('bhNovaSemana');
        const bruto = input ? input.value : '';
        if (!bruto) {
            toast('Escolha uma data para a semana.', 'warning');
            return;
        }

        const semanaISO = toMondayISO(bruto);
        if (!semanaISO) {
            toast('Data invalida.', 'error');
            return;
        }

        const jaExiste = (dadosBanco.semanas || []).some((item) => item.semanaSegunda === semanaISO);
        if (jaExiste) {
            toast(`A semana de ${labelData(semanaISO)} ja esta na grade.`, 'info');
            destacarLinha(semanaISO);
            return;
        }

        dadosBanco.semanas.push({
            semanaSegunda: semanaISO,
            label: labelData(semanaISO),
            totalMinutos: 0,
            totalFormatado: '0:00',
            observacao: null,
            celulas: {}
        });

        dadosBanco.semanas.sort((a, b) => (a.semanaSegunda < b.semanaSegunda ? -1 : 1));
        renderTabela();
        destacarLinha(semanaISO);
    }

    function destacarLinha(semanaISO) {
        const wrap = document.getElementById('bhTabelaWrap');
        const linha = wrap ? wrap.querySelector(`tr[data-semana="${semanaISO}"]`) : null;
        if (linha) {
            linha.classList.add('bh-linha-nova');
            linha.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => linha.classList.remove('bh-linha-nova'), 1500);
        }
    }

    // ---- Gerar semana (lancamento automatico) ----
    async function abrirModalGerarSemana() {
        // Mira a proxima semana depois da ultima que ja tem lancamento (modelo
        // "toda segunda gera a proxima"). Assim a semana anterior sempre existe.
        const comDados = (dadosBanco.semanas || [])
            .filter((semana) => semana.celulas && Object.keys(semana.celulas).length > 0)
            .map((semana) => semana.semanaSegunda)
            .sort();

        if (comDados.length === 0) {
            toast('Lance ao menos uma semana antes de gerar a proxima.', 'warning');
            return;
        }

        const alvo = addDiasISO(comDados[comDados.length - 1], 7);

        try {
            const preview = await window.API.gerarBancoHorasSemana({ semana: alvo, aplicar: false });
            renderModalGerar(preview);
        } catch (error) {
            toast(error.message || 'Nao foi possivel calcular a geracao.', 'error');
        }
    }

    function renderModalGerar(preview) {
        fecharModalGerar();

        const comBase = (preview.itens || []).filter((item) => !item.semBase);
        const semBase = (preview.itens || []).filter((item) => item.semBase);
        const bloqueados = comBase.filter((item) => item.jaConfirmado).length;
        const geraveis = comBase.filter((item) => !item.jaConfirmado);

        const linhas = comBase.map((item) => `
            <tr class="${item.jaConfirmado ? 'bh-modal-bloqueado' : ''}">
                <td>${escapeHtml(item.nome)}</td>
                <td>${escapeHtml(item.anteriorFormatado)}</td>
                <td class="bh-plantao">${item.plantaoMinutos > 0 ? `+${escapeHtml(item.plantaoFormatado)}` : '0:00'}</td>
                <td class="bh-desconto">${item.descontoMinutos > 0 ? `-${escapeHtml(item.descontoFormatado)}` : '0:00'}</td>
                <td><strong>${escapeHtml(item.propostoFormatado)}</strong></td>
                <td>${item.jaConfirmado ? '<small>ja confirmado</small>' : '<small>sera gerado</small>'}</td>
            </tr>
        `).join('');

        const overlay = document.createElement('div');
        overlay.id = 'bhModalGerar';
        overlay.className = 'bh-modal-overlay';
        overlay.innerHTML = `
            <div class="bh-modal">
                <div class="bh-modal-header">
                    <h3><i class="fas fa-wand-magic-sparkles"></i> Gerar semana de ${escapeHtml(labelData(preview.semana))}</h3>
                    <button type="button" class="bh-modal-fechar" aria-label="Fechar"><i class="fas fa-times"></i></button>
                </div>
                <div class="bh-modal-body">
                    <p class="bh-modal-info">Cada proposta = saldo da semana anterior + plantoes − folgas/ausencias. Os valores entram em <strong>amarelo</strong> para voce validar.</p>
                    ${comBase.length === 0
                        ? '<div class="bh-vazio">Nenhum colaborador com semana anterior para gerar.</div>'
                        : `<div class="banco-horas-tabela-wrap">
                            <table class="banco-horas-tabela bh-tabela-verificar">
                                <thead><tr>
                                    <th>Colaborador</th><th>Anterior</th><th>Plantao (+)</th><th>Desconto</th><th>Proposto</th><th></th>
                                </tr></thead>
                                <tbody>${linhas}</tbody>
                            </table>
                           </div>`}
                    ${semBase.length > 0 ? `<p class="bh-modal-aviso">${semBase.length} colaborador(es) sem semana anterior foram ignorados.</p>` : ''}
                    ${bloqueados > 0 ? `<p class="bh-modal-aviso">${bloqueados} ja confirmado(s) nao serao sobrescritos.</p>` : ''}
                </div>
                <div class="bh-modal-footer">
                    <button type="button" class="btn-secondary bh-modal-cancelar">Cancelar</button>
                    <button type="button" class="btn-primary bh-modal-confirmar" ${geraveis.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-check"></i> Confirmar geracao (${geraveis.length})
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('.bh-modal-fechar').addEventListener('click', fecharModalGerar);
        overlay.querySelector('.bh-modal-cancelar').addEventListener('click', fecharModalGerar);
        overlay.addEventListener('click', (evento) => {
            if (evento.target === overlay) {
                fecharModalGerar();
            }
        });
        const btnConfirmar = overlay.querySelector('.bh-modal-confirmar');
        if (btnConfirmar) {
            btnConfirmar.addEventListener('click', () => aplicarGeracao(preview.semana));
        }
    }

    async function aplicarGeracao(semanaISO) {
        try {
            const resultado = await window.API.gerarBancoHorasSemana({ semana: semanaISO, aplicar: true });
            fecharModalGerar();
            toast(`${resultado.gravados} lancamento(s) gerado(s) em amarelo para validar.`, 'success');
            await carregar();
            destacarLinha(semanaISO);
        } catch (error) {
            toast(error.message || 'Nao foi possivel gerar a semana.', 'error');
        }
    }

    function fecharModalGerar() {
        const existente = document.getElementById('bhModalGerar');
        if (existente) {
            existente.remove();
        }
    }

    // ---- Relatorio de horas extras ----
    // Hora extra e paga em folha: nao entra na grade acima nem no saldo. Este
    // relatorio e o unico lugar onde essas horas aparecem somadas por pessoa —
    // que e o numero que vai para a folha no fim do mes.
    function primeiroDiaDoMesISO() {
        return `${new Date().toISOString().slice(0, 7)}-01`;
    }

    function preencherColaboradoresExtras() {
        const select = document.getElementById('bhExtrasColaborador');
        if (!select) {
            return;
        }

        const selecionado = select.value;
        const colaboradores = filtrarPorMeusSetores(dadosBanco.colaboradores || []);

        select.innerHTML = `
            <option value="">Todos os colaboradores</option>
            ${colaboradores.map((colaborador) => `
                <option value="${colaborador.id}">${escapeHtml(colaborador.nome)}</option>
            `).join('')}
        `;

        if (selecionado && select.querySelector(`option[value="${selecionado}"]`)) {
            select.value = selecionado;
        }
    }

    function lerFiltrosExtras() {
        return {
            inicio: document.getElementById('bhExtrasInicio')?.value || '',
            fim: document.getElementById('bhExtrasFim')?.value || '',
            colaboradorId: document.getElementById('bhExtrasColaborador')?.value || ''
        };
    }

    function atualizarBotaoPdfExtras() {
        const botao = document.getElementById('bhBtnExtrasPdf');
        if (botao) {
            botao.disabled = !(dadosExtras && (dadosExtras.itens || []).length > 0);
        }
    }

    async function gerarRelatorioExtras() {
        const alvo = document.getElementById('bhExtrasResultado');
        if (!alvo) {
            return;
        }

        const filtros = lerFiltrosExtras();

        if (!filtros.inicio || !filtros.fim) {
            toast('Informe o periodo do relatorio de horas extras.', 'warning');
            return;
        }

        if (filtros.inicio > filtros.fim) {
            toast('A data inicial deve ser anterior a final.', 'error');
            return;
        }

        alvo.innerHTML = '<div class="bh-loading"><i class="fas fa-spinner fa-spin"></i> Gerando...</div>';

        try {
            dadosExtras = await window.API.getBancoHorasExtras(filtros);
            renderExtras(dadosExtras, alvo);
        } catch (error) {
            dadosExtras = null;
            atualizarBotaoPdfExtras();
            alvo.innerHTML = `<div class="bh-erro"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(error.message || 'Falha ao gerar o relatorio.')}</div>`;
        }
    }

    function linhasTabelaExtras(dados) {
        return (dados.itens || []).map((item) => {
            const turnos = (item.plantoes || []).map((plantao) => `
                <tr>
                    <td>${escapeHtml(plantao.dataFormatada || labelData(plantao.dataISO))}</td>
                    <td>${escapeHtml(plantao.tipoPlantao || '--')}</td>
                    <td>${escapeHtml(`${plantao.horaInicio || '--'} as ${plantao.horaFim || '--'}`)}</td>
                    <td class="bh-extras-duracao">${escapeHtml(plantao.minutosFormatado)}</td>
                    <td>${escapeHtml(plantao.observacao || '--')}</td>
                </tr>
            `).join('');

            return `
                <tr class="bh-extras-grupo">
                    <th colspan="3">${escapeHtml(item.nome)}</th>
                    <th class="bh-extras-duracao">${escapeHtml(item.totalFormatado)}</th>
                    <th>${(item.plantoes || []).length} turno(s)</th>
                </tr>
                ${turnos}
            `;
        }).join('');
    }

    function renderExtras(dados, alvo) {
        atualizarBotaoPdfExtras();

        if (dados.disponivel === false) {
            alvo.innerHTML = `<div class="bh-erro"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(dados.mensagem || 'Hora extra indisponivel neste banco.')}</div>`;
            return;
        }

        if ((dados.itens || []).length === 0) {
            alvo.innerHTML = '<div class="bh-vazio"><i class="fas fa-money-bill-wave"></i> Nenhuma hora extra lancada no periodo.</div>';
            return;
        }

        alvo.innerHTML = `
            <div class="bh-verificar-data">
                Horas extras de <strong>${escapeHtml(labelData(dados.inicio))}</strong>
                ate <strong>${escapeHtml(labelData(dados.fim))}</strong>
            </div>
            <div class="bh-extras-cards">
                <div class="bh-extras-card">
                    <span>Total de horas extras</span>
                    <strong>${escapeHtml(dados.totalFormatado)}</strong>
                </div>
                <div class="bh-extras-card">
                    <span>Colaboradores</span>
                    <strong>${dados.totalColaboradores}</strong>
                </div>
                <div class="bh-extras-card">
                    <span>Dias com hora extra</span>
                    <strong>${dados.totalDias}</strong>
                </div>
            </div>
            <div class="banco-horas-tabela-wrap">
                <table class="banco-horas-tabela bh-tabela-extras">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Horario</th>
                            <th>Duracao</th>
                            <th>Observacao</th>
                        </tr>
                    </thead>
                    <tbody>${linhasTabelaExtras(dados)}</tbody>
                </table>
            </div>
            ${(dados.avisos || []).length > 0
                ? `<div class="bh-avisos"><i class="fas fa-circle-info"></i> ${dados.avisos.map(escapeHtml).join('<br>')}</div>`
                : ''}
        `;
    }

    // O container temporario do PDF so aproveita as tags <style> deste HTML,
    // entao ele precisa ser autossuficiente (mesmo padrao do relatorio de
    // plantoes, em runtime-fixes.js).
    function gerarHtmlPdfExtras(dados) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatorio de Horas Extras</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        width: 1480px;
                        padding: 16px;
                        background: #ffffff;
                        color: #0f172a;
                        font-family: Arial, sans-serif;
                    }
                    .pdf-pagina { width: 1448px; min-height: 980px; padding: 18px; background: #ffffff; }
                    .pdf-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 18px;
                        margin-bottom: 16px;
                        padding-bottom: 12px;
                        border-bottom: 2px solid #dbeafe;
                    }
                    .pdf-header h1 { color: #1e3a5f; font-size: 30px; line-height: 1.1; }
                    .pdf-header p { color: #64748b; font-size: 13px; font-weight: 700; }
                    .pdf-aviso {
                        margin-bottom: 14px;
                        padding: 10px 12px;
                        border-radius: 10px;
                        background: #fef3c7;
                        color: #92400e;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .pdf-cards {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 10px;
                        margin-bottom: 14px;
                    }
                    .pdf-card { padding: 12px; border: 1px solid #dbe3ef; border-radius: 10px; background: #f8fafc; }
                    .pdf-card span { display: block; color: #64748b; font-size: 12px; font-weight: 700; }
                    .pdf-card strong { display: block; color: #0f172a; font-size: 20px; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td {
                        border: 1px solid #dbe3ef;
                        padding: 8px 10px;
                        font-size: 12px;
                        line-height: 1.3;
                        text-align: left;
                        vertical-align: top;
                    }
                    thead th { background: #e2e8f0; font-weight: 800; }
                    .grupo th { background: #eef2ff; color: #312e81; font-size: 13px; }
                    .duracao { font-weight: 700; white-space: nowrap; }
                </style>
            </head>
            <body>
                <section class="pdf-pagina">
                    <header class="pdf-header">
                        <div>
                            <h1>Relatorio de Horas Extras</h1>
                            <p>${escapeHtml(labelData(dados.inicio))} ate ${escapeHtml(labelData(dados.fim))}</p>
                        </div>
                        <p>Gerado em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
                    </header>
                    <div class="pdf-aviso">Horas pagas em folha: nao entram no saldo do banco de horas.</div>
                    <div class="pdf-cards">
                        <div class="pdf-card"><span>Total de horas extras</span><strong>${escapeHtml(dados.totalFormatado)}</strong></div>
                        <div class="pdf-card"><span>Colaboradores</span><strong>${dados.totalColaboradores}</strong></div>
                        <div class="pdf-card"><span>Dias com hora extra</span><strong>${dados.totalDias}</strong></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th><th>Tipo</th><th>Horario</th><th>Duracao</th><th>Observacao</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(dados.itens || []).map((item) => `
                                <tr class="grupo">
                                    <th colspan="3">${escapeHtml(item.nome)}</th>
                                    <th class="duracao">${escapeHtml(item.totalFormatado)}</th>
                                    <th>${(item.plantoes || []).length} turno(s)</th>
                                </tr>
                                ${(item.plantoes || []).map((plantao) => `
                                    <tr>
                                        <td>${escapeHtml(plantao.dataFormatada || labelData(plantao.dataISO))}</td>
                                        <td>${escapeHtml(plantao.tipoPlantao || '--')}</td>
                                        <td>${escapeHtml(`${plantao.horaInicio || '--'} as ${plantao.horaFim || '--'}`)}</td>
                                        <td class="duracao">${escapeHtml(plantao.minutosFormatado)}</td>
                                        <td>${escapeHtml(plantao.observacao || '--')}</td>
                                    </tr>
                                `).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </section>
            </body>
            </html>
        `;
    }

    async function exportarRelatorioExtras() {
        if (!dadosExtras || (dadosExtras.itens || []).length === 0) {
            toast('Gere o relatorio antes de exportar.', 'warning');
            return;
        }

        if (typeof html2canvas !== 'function'
            || !window.jspdf
            || typeof window.jspdf.jsPDF !== 'function'
            || typeof window.criarContainerTemporarioRelatorioPdf !== 'function') {
            toast('Bibliotecas de exportacao nao estao disponiveis.', 'error');
            return;
        }

        let container = null;
        let liberarViewport = null;

        try {
            toast('Gerando PDF de horas extras...', 'warning');

            container = window.criarContainerTemporarioRelatorioPdf(gerarHtmlPdfExtras(dadosExtras), { width: 1480 });
            liberarViewport = typeof window.lockPdfViewportOverflow === 'function'
                ? window.lockPdfViewportOverflow()
                : null;
            await window.aguardarLayoutRelatorioPdf();

            const canvas = await window.renderizarPaginaPdfEmCanvas(container, {
                minWidth: 1600,
                minHeight: 1000,
                scale: 1.65,
                maxCanvasSide: 12000,
                maxCanvasPixels: 22000000
            });
            const { pdf } = window.criarPdfMultipaginasComCanvas(canvas, {
                preferLandscape: true,
                marginMm: 6,
                minScaleMmPerPixel: 0.065,
                imageFormat: 'JPEG',
                imageQuality: 0.94,
                minimumPages: 1,
                maxSourcePageHeight: 1300
            });
            const salvar = typeof window.baixarPdfSemPreview === 'function'
                ? window.baixarPdfSemPreview
                : (documento, nome) => documento.save(nome);

            salvar(pdf, `Horas_Extras_${dadosExtras.inicio}_${dadosExtras.fim}.pdf`);
            toast('PDF de horas extras gerado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar horas extras:', error);
            toast(error.message || 'Nao foi possivel exportar o relatorio.', 'error');
        } finally {
            liberarViewport?.();
            container?.remove();
        }
    }

    window.renderBancoHoras = render;
})();

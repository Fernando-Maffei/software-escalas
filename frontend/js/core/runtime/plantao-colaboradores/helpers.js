    const inflight = new Map();
    let disponibilidadeTimer = null;

    function withInFlight(key, task) {
        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = Promise.resolve()
            .then(task)
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function fecharModalSeguro(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('hidden');
        modal.classList.remove('active');
    }

    function obterDataISO(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            return valor.includes('T') ? valor.split('T')[0] : valor;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function obterHoraValor(valor) {
        if (!valor) {
            return null;
        }

        if (typeof valor === 'string') {
            const bruto = valor.includes('T') ? valor.split('T')[1] : valor;
            const match = bruto.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
            return match ? `${match[1]}:00` : null;
        }

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        const isTimeOnlyDate = data.getUTCFullYear() === 1970
            && data.getUTCMonth() === 0
            && data.getUTCDate() === 1;
        const horas = String(isTimeOnlyDate ? data.getUTCHours() : data.getHours()).padStart(2, '0');
        const minutos = String(isTimeOnlyDate ? data.getUTCMinutes() : data.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}:00`;
    }

    function formatarDataPtBr(valor) {
        const dataISO = obterDataISO(valor);

        if (!dataISO) {
            return '--';
        }

        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function formatarHoraInput(valor) {
        const hora = obterHoraValor(valor);
        return hora ? hora.slice(0, 5) : '';
    }

    function minutosParaTexto(valor, options = {}) {
        const { signed = false } = options;
        const total = Number.isFinite(valor) ? Math.round(valor) : 0;
        const sinal = total < 0 ? '-' : '+';
        const absoluto = Math.abs(total);
        const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
        const minutos = String(absoluto % 60).padStart(2, '0');
        return `${signed ? sinal : ''}${horas}h ${minutos}m`;
    }

    function mapPlantao(item) {
        return {
            ...item,
            dataISO: obterDataISO(item.dataISO || item.data_plantao),
            tipoPlantao: item.tipoPlantao || item.tipo_plantao || null,
            tipoCredito: String(item.tipoCredito || item.tipo_credito || '').toLowerCase() === 'extra' ? 'extra' : 'banco',
            horaInicio: obterHoraValor(item.horaInicio || item.hora_inicio),
            horaFim: obterHoraValor(item.horaFim || item.hora_fim),
            observacao: item.observacao || null,
            duracaoMinutos: Number.isFinite(item.duracaoMinutos) ? item.duracaoMinutos : null,
            duracaoFormatada: item.duracaoFormatada || null,
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : []
        };
    }

    function mapBancoHorasResumo(item) {
        return {
            colaboradorId: Number(item.colaboradorId),
            nome: item.nome,
            saldoMinutos: Number(item.saldoMinutos || 0),
            saldoFormatado: item.saldoFormatado || minutosParaTexto(item.saldoMinutos || 0, { signed: true }),
            creditosMesMinutos: Number(item.creditosMesMinutos || 0),
            creditosMesFormatado: item.creditosMesFormatado || minutosParaTexto(item.creditosMesMinutos || 0),
            debitosMesMinutos: Number(item.debitosMesMinutos || 0),
            debitosMesFormatado: item.debitosMesFormatado || minutosParaTexto(item.debitosMesMinutos || 0),
            ultimoMovimentoEm: item.ultimoMovimentoEm || null
        };
    }

    function getBancoHorasResumoByColaborador(colaboradorId) {
        return (window.bancoHorasResumo || []).find((item) => Number(item.colaboradorId) === Number(colaboradorId)) || null;
    }

    function getPlantaoEditorState() {
        if (!window.__plantaoEditorState) {
            window.__plantaoEditorState = null;
        }

        return window.__plantaoEditorState;
    }

    function setPlantaoEditorState(state) {
        window.__plantaoEditorState = state;
        return state;
    }

    function isColaboradoresScreenVisible() {
        return Boolean(document.getElementById('listaColaboradores'));
    }


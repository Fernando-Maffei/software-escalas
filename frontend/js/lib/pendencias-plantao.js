// Regras da aba "Pendencias" da tela de plantoes. Puras (sem DOM, sem API) para
// poderem ser testadas no runner unitario.

// A partir de quantos dias uma folga de domingo sem reposicao passa de "esperando"
// para "atrasada". So muda a cor da etiqueta: nao bloqueia nada.
export const PRAZO_ATRASO_DIAS = 15;

// Janela em que um plantao sem equipe e cobrado: os proximos 30 dias, a mesma
// do painel do Dashboard.
export const JANELA_PLANTOES_DIAS = 30;

const MS_POR_DIA = 86400000;

function partesDaData(dataISO) {
    const partes = String(dataISO || '').slice(0, 10).split('-').map(Number);

    return partes.length === 3 && !partes.some(Number.isNaN) ? partes : null;
}

// Hoje no calendario LOCAL (toISOString usaria UTC e viraria o dia a noite).
export function hojeISO(agora = new Date()) {
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');

    return `${agora.getFullYear()}-${mes}-${dia}`;
}

// Dias do calendario de `deISO` ate `ateISO` (positivo = `ateISO` e depois).
// Meio-dia UTC nos dois lados: horario de verao nao vira um dia a mais ou a menos.
export function diasEntre(deISO, ateISO) {
    const de = partesDaData(deISO);
    const ate = partesDaData(ateISO);

    if (!de || !ate) {
        return 0;
    }

    return Math.round((Date.UTC(ate[0], ate[1] - 1, ate[2], 12) - Date.UTC(de[0], de[1] - 1, de[2], 12)) / MS_POR_DIA);
}

// "ha 5 dias", "hoje", "em 3 dias". `dias` e quanto tempo PASSOU (positivo =
// passado), como em diasEntre(data, hoje).
export function textoQuando(dias) {
    if (dias === 0) {
        return 'hoje';
    }

    const total = Math.abs(dias);

    return `${dias > 0 ? 'ha' : 'em'} ${total} ${total === 1 ? 'dia' : 'dias'}`;
}

// Cor da etiqueta de uma folga esperando reposicao:
//   atraso  -> ha PRAZO_ATRASO_DIAS dias ou mais
//   espera  -> ja passou o domingo, dentro do prazo
//   futura  -> o domingo ainda nem chegou (nao ha o que cobrar)
export function classificarEsperaFolga(diasDesdeODomingo) {
    if (diasDesdeODomingo >= PRAZO_ATRASO_DIAS) {
        return 'atraso';
    }

    return diasDesdeODomingo > 0 ? 'espera' : 'futura';
}

// Dias de plantao dos proximos 30 dias em que NENHUM turno tem colaborador.
// Um dia pode ter varios turnos; basta um turno com equipe para o dia estar
// coberto (mesma regra do Dashboard, que conta dias e nao turnos).
// Devolve do mais proximo para o mais distante.
export function plantoesSemEquipe(plantoes, hoje = hojeISO(), janelaDias = JANELA_PLANTOES_DIAS) {
    const porDia = new Map();

    (Array.isArray(plantoes) ? plantoes : []).forEach((plantao) => {
        const dataISO = String(plantao?.dataISO || plantao?.data_plantao || '').slice(0, 10);
        const dias = diasEntre(hoje, dataISO);

        if (!partesDaData(dataISO) || dias < 0 || dias > janelaDias) {
            return;
        }

        if (!porDia.has(dataISO)) {
            porDia.set(dataISO, { dataISO, dias, comEquipe: false, turnos: [] });
        }

        const dia = porDia.get(dataISO);

        dia.comEquipe = dia.comEquipe || (Array.isArray(plantao.colaboradores) && plantao.colaboradores.length > 0);
        dia.turnos.push({
            horaInicio: plantao.horaInicio ?? null,
            horaFim: plantao.horaFim ?? null,
            tipoCredito: plantao.tipoCredito ?? null
        });
    });

    return [...porDia.values()]
        .filter((dia) => !dia.comEquipe)
        .map(({ dataISO, dias, turnos }) => ({
            dataISO,
            dias,
            turnos: turnos.sort((a, b) => String(a.horaInicio).localeCompare(String(b.horaInicio)))
        }))
        .sort((a, b) => a.dataISO.localeCompare(b.dataISO));
}

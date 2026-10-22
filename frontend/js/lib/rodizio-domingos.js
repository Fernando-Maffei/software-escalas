// Relatorio "Domingos e feriados": quem trabalhou em cada domingo/feriado, o
// contador por pessoa e o rodizio (ultimo dia de cada um). E a planilha que o
// time mantinha a mao, montada a partir dos plantoes lancados. Puro (sem DOM,
// sem API) para poder ser testado no runner unitario.

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'];

const CATEGORIA_PLANTAO = 'plantao';
const CATEGORIA_COBERTURA = 'cobertura';

function diaDaSemana(dataISO) {
    const [ano, mes, dia] = String(dataISO).split('-').map(Number);
    return DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()];
}

function minutosDoHorario(hora) {
    const [h, m] = String(hora || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? (h * 60) + m : null;
}

function duracaoMinutos(plantao) {
    const inicio = minutosDoHorario(plantao.horaInicio);
    const fim = minutosDoHorario(plantao.horaFim);

    return inicio !== null && fim !== null && fim > inicio ? fim - inicio : 0;
}

// O rotulo da coluna "Tipo", como na planilha: o plantao do dia sai como o
// proprio dia (Domingo / Feriado) e a cobertura de almoco sai como tal.
function rotuloCategoriaRodizio(categoria, tipoDia) {
    if (categoria === CATEGORIA_COBERTURA) {
        return 'Cobertura de almoco';
    }

    return tipoDia === 'feriado' ? 'Feriado' : 'Domingo';
}

/**
 * Monta o relatorio a partir dos plantoes (como GET /api/plantoes devolve).
 *
 * - Entram so os dias de DOMINGO e FERIADO dentro de [inicioISO, fimISO];
 *   sabado fica de fora, como na planilha.
 * - Cada pessoa conta UMA vez por dia. Se no mesmo dia ela fez plantao e
 *   cobertura, vale o plantao (e o que define o dia trabalhado).
 * - `pessoas` vem na ordem do rodizio: quem esta ha mais tempo sem trabalhar
 *   domingo/feriado primeiro, e quem nao trabalhou nenhum no periodo antes de
 *   todos. Entram quem trabalhou no periodo e os plantonistas ativos, mesmo
 *   com zero, para o contador mostrar quem ainda nao entrou na roda.
 */
export function montarRodizioDomingos(plantoes, colaboradores, filtros = {}) {
    const { inicioISO = '', fimISO = '' } = filtros;
    const filtroColaborador = filtros.colaboradorId ? Number(filtros.colaboradorId) : null;
    const porId = new Map((colaboradores || []).map((item) => [Number(item.Id ?? item.id), item]));
    const nomeDe = (id) => {
        const colaborador = porId.get(id);
        return colaborador ? (colaborador.Nome ?? colaborador.nome) : `Colaborador #${id}`;
    };

    // chave pessoa|data -> registro do dia
    const diasPorPessoa = new Map();

    for (const plantao of plantoes || []) {
        const dataISO = String(plantao.dataISO || '').slice(0, 10);
        const tipoDia = plantao.tipoPlantao;

        if (!dataISO || (tipoDia !== 'domingo' && tipoDia !== 'feriado')) {
            continue;
        }

        if ((inicioISO && dataISO < inicioISO) || (fimISO && dataISO > fimISO)) {
            continue;
        }

        const categoria = plantao.tipoLancamento === 'cobertura_almoco' ? CATEGORIA_COBERTURA : CATEGORIA_PLANTAO;
        const minutos = duracaoMinutos(plantao);

        for (const bruto of plantao.colaboradores || []) {
            const colaboradorId = Number(bruto);

            if (filtroColaborador !== null && colaboradorId !== filtroColaborador) {
                continue;
            }

            const chave = `${colaboradorId}|${dataISO}`;
            const atual = diasPorPessoa.get(chave);

            if (atual) {
                atual.minutos += minutos;

                if (categoria === CATEGORIA_PLANTAO) {
                    atual.categoria = CATEGORIA_PLANTAO;
                }

                continue;
            }

            diasPorPessoa.set(chave, { colaboradorId, dataISO, tipoDia, categoria, minutos });
        }
    }

    const dias = [...diasPorPessoa.values()]
        .map((dia) => ({
            ...dia,
            nome: nomeDe(dia.colaboradorId),
            diaSemana: diaDaSemana(dia.dataISO),
            rotulo: rotuloCategoriaRodizio(dia.categoria, dia.tipoDia)
        }))
        .sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.nome.localeCompare(b.nome, 'pt-BR'));

    const pessoas = new Map();
    const pessoa = (colaboradorId) => {
        if (!pessoas.has(colaboradorId)) {
            pessoas.set(colaboradorId, {
                colaboradorId,
                nome: nomeDe(colaboradorId),
                total: 0,
                plantao: 0,
                cobertura: 0,
                minutos: 0,
                ultimo: null
            });
        }

        return pessoas.get(colaboradorId);
    };

    for (const dia of dias) {
        const item = pessoa(dia.colaboradorId);
        item.total += 1;
        item[dia.categoria] += 1;
        item.minutos += dia.minutos;
        // `dias` esta em ordem de data: o ultimo visto e o mais recente.
        item.ultimo = { dataISO: dia.dataISO, diaSemana: dia.diaSemana, rotulo: dia.rotulo };
    }

    for (const colaborador of colaboradores || []) {
        const id = Number(colaborador.Id ?? colaborador.id);
        const ativo = colaborador.Ativo !== false && colaborador.Ativo !== 0;
        const plantonista = Boolean(colaborador.IsPlantonista ?? colaborador.isPlantonista);

        if (ativo && plantonista && (filtroColaborador === null || id === filtroColaborador)) {
            pessoa(id);
        }
    }

    const ordemRodizio = (a, b) => {
        if (!a.ultimo || !b.ultimo) {
            return (a.ultimo ? 1 : 0) - (b.ultimo ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR');
        }

        return a.ultimo.dataISO.localeCompare(b.ultimo.dataISO) || a.nome.localeCompare(b.nome, 'pt-BR');
    };

    const listaPessoas = [...pessoas.values()].sort(ordemRodizio);

    return {
        dias,
        pessoas: listaPessoas,
        totais: {
            dias: new Set(dias.map((dia) => dia.dataISO)).size,
            registros: dias.length,
            plantao: dias.filter((dia) => dia.categoria === CATEGORIA_PLANTAO).length,
            cobertura: dias.filter((dia) => dia.categoria === CATEGORIA_COBERTURA).length
        }
    };
}

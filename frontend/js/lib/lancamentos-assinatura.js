// Relatorio "Lancamentos para assinatura": cada lancamento do mes vira uma
// linha (data, colaborador, tipo) com espaco para o colaborador assinar.
// Puro (sem DOM, sem API) para poder ser testado no runner unitario; quem le
// os registros e desenha a tela e core/runtime/relatorio-assinaturas.js.
//
// Uma linha por lancamento, nao por dia: ferias de 15 dias sao uma assinatura
// so, com o periodo (recortado ao mes) na coluna Data. Plantao vira uma linha
// por colaborador da equipe; dois turnos do mesmo tipo no mesmo dia viram uma
// linha com os dois horarios. Tipos diferentes no mesmo dia (plantao e
// cobertura de almoco, folga e plantao) ficam em linhas separadas.

const TIPOS = Object.freeze({
    folga: 'Folga',
    ferias: 'Férias',
    ausencia: 'Ausência',
    folga_domingo: 'Folga de domingo',
    reposicao_domingo: 'Reposição de folga de domingo',
    plantao_sabado: 'Plantão de sábado',
    plantao_domingo: 'Plantão de domingo',
    plantao_feriado: 'Plantão de feriado',
    plantao_cobertura_almoco: 'Cobertura de almoço'
});

// Ordem das linhas de um mesmo colaborador num mesmo dia.
const ORDEM_TIPOS = Object.keys(TIPOS);

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const doisDigitos = (valor) => String(valor).padStart(2, '0');

// mes de 0 (janeiro) a 11, como os seletores de mes do sistema.
export function periodoDoMes(mes, ano) {
    const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const prefixo = `${ano}-${doisDigitos(mes + 1)}`;

    return {
        inicioISO: `${prefixo}-01`,
        fimISO: `${prefixo}-${doisDigitos(ultimoDia)}`,
        rotulo: `${MESES[mes]} de ${ano}`
    };
}

function formatarDataAssinatura(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
}

function textoDoPeriodo(inicioISO, fimISO) {
    if (inicioISO === fimISO) {
        return formatarDataAssinatura(inicioISO);
    }

    return `${formatarDataAssinatura(inicioISO)} a ${formatarDataAssinatura(fimISO)}`;
}

function juntarDetalhes(atual, novo) {
    const partes = [atual, novo].filter(Boolean).join(', ').split(', ');
    return [...new Set(partes)].filter(Boolean).join(', ');
}

/**
 * Monta as linhas do relatorio.
 *
 * @param {object} dados
 * @param {string} dados.inicioISO  primeiro dia do mes (YYYY-MM-DD)
 * @param {string} dados.fimISO     ultimo dia do mes
 * @param {Array<{colaboradorId:number, tipo:string, inicioISO:string, fimISO?:string, detalhe?:string}>} [dados.ausencias]
 *        folga / ferias / ausencia (tipo ja normalizado), detalhe pronto
 *        (subtipo, "Parcial 08:00-12:00")
 * @param {Array<{dataISO:string, tipoLancamento:string, colaboradores:number[], horario?:string}>} [dados.plantoes]
 *        tipoLancamento ja normalizado: sabado / domingo / feriado / cobertura_almoco
 * @param {Array<{colaboradorId:number, dataDomingo:string, dataReposicao?:string, horarioReposicao?:string}>} [dados.folgasDomingo]
 * @param {(id:number) => string} dados.nomeDe  nome a exibir (o completo, quando houver)
 */
export function montarLancamentosAssinatura(dados) {
    const { inicioISO, fimISO, nomeDe } = dados;
    const linhas = new Map();

    const adicionar = ({ colaboradorId, tipo, inicio, fim = inicio, detalhe = '' }) => {
        const id = Number(colaboradorId);

        if (!TIPOS[tipo] || !Number.isFinite(id) || !inicio || fim < inicioISO || inicio > fimISO) {
            return;
        }

        const inicioNoMes = inicio < inicioISO ? inicioISO : inicio;
        const fimNoMes = fim > fimISO ? fimISO : fim;
        const chave = `${inicioNoMes}|${fimNoMes}|${id}|${tipo}`;
        const existente = linhas.get(chave);

        if (existente) {
            existente.detalhe = juntarDetalhes(existente.detalhe, detalhe);
            return;
        }

        linhas.set(chave, {
            colaboradorId: id,
            nome: nomeDe(id),
            inicioISO: inicioNoMes,
            fimISO: fimNoMes,
            data: textoDoPeriodo(inicioNoMes, fimNoMes),
            tipo,
            rotulo: TIPOS[tipo],
            detalhe: detalhe || ''
        });
    };

    (dados.ausencias || []).forEach((item) => {
        adicionar({
            colaboradorId: item.colaboradorId,
            tipo: item.tipo,
            inicio: item.inicioISO,
            fim: item.fimISO || item.inicioISO,
            detalhe: item.detalhe
        });
    });

    (dados.plantoes || []).forEach((plantao) => {
        (plantao.colaboradores || []).forEach((colaboradorId) => {
            adicionar({
                colaboradorId,
                tipo: `plantao_${plantao.tipoLancamento}`,
                inicio: plantao.dataISO,
                detalhe: plantao.horario
            });
        });
    });

    (dados.folgasDomingo || []).forEach((folga) => {
        adicionar({
            colaboradorId: folga.colaboradorId,
            tipo: 'folga_domingo',
            inicio: folga.dataDomingo,
            detalhe: folga.dataReposicao ? `Reposição em ${formatarDataAssinatura(folga.dataReposicao)}` : 'Reposição a definir'
        });

        if (folga.dataReposicao) {
            adicionar({
                colaboradorId: folga.colaboradorId,
                tipo: 'reposicao_domingo',
                inicio: folga.dataReposicao,
                detalhe: [`Domingo ${formatarDataAssinatura(folga.dataDomingo)}`, folga.horarioReposicao].filter(Boolean).join(', ')
            });
        }
    });

    const lista = [...linhas.values()].sort((a, b) => (
        a.inicioISO.localeCompare(b.inicioISO)
        || a.nome.localeCompare(b.nome, 'pt-BR')
        || ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo)
        || a.fimISO.localeCompare(b.fimISO)
    ));

    return {
        linhas: lista,
        totais: {
            lancamentos: lista.length,
            colaboradores: new Set(lista.map((linha) => linha.colaboradorId)).size
        }
    };
}

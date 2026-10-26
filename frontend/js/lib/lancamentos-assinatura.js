// Relatorio "Lancamentos para assinatura": as folhas de escala que o time
// imprime para o colaborador assinar, montadas a partir dos lancamentos do mes.
// Puro (sem DOM, sem API) para poder ser testado no runner unitario; quem le
// os registros e desenha a tela e core/runtime/relatorio-assinaturas.js.
//
// Uma folha por tipo de lancamento, no formato da folha feita a mao:
//
//   Escala de Sabados das 8h as 12h e 9h as 13h de Novembro de 2026
//   07/11/2026 -> Luis, Vinicius, Deborah, Joao Vitor
//   ...
//   Jales, 26 de Outubro de 2026.
//   NOMES COMPLETOS (um por linha, com espaco para assinar)
//
// Nas linhas de data vai o Nome/Apelido; na lista de assinaturas, o nome
// completo (ou o Nome, quando ele nao foi preenchido).
//
// Cada pessoa aparece uma vez por data em cada folha: dois turnos do mesmo
// tipo no mesmo dia nao repetem o nome. Ferias de varios dias sao uma linha
// com o periodo recortado ao mes. Tipos diferentes no mesmo dia (plantao e
// cobertura de almoco, folga e plantao) saem cada um na sua folha.

// Ordem das folhas. `horarioNoTitulo`: o horario do turno vai para o titulo
// ("das 8h as 12h"), como na folha de sabados; nos outros tipos o detalhe
// (subtipo, parcial) vai entre parenteses ao lado do nome.
/** @type {Readonly<Record<string, {rotulo: string, titulo: string, horarioNoTitulo?: boolean}>>} */
const TIPOS = Object.freeze({
    plantao_sabado: { rotulo: 'Plantão de sábado', titulo: 'Escala de Sábados', horarioNoTitulo: true },
    plantao_domingo: { rotulo: 'Plantão de domingo', titulo: 'Escala de Domingos', horarioNoTitulo: true },
    plantao_feriado: { rotulo: 'Plantão de feriado', titulo: 'Escala de Feriados', horarioNoTitulo: true },
    plantao_cobertura_almoco: { rotulo: 'Cobertura de almoço', titulo: 'Escala de Cobertura de Almoço', horarioNoTitulo: true },
    folga: { rotulo: 'Folga', titulo: 'Folgas' },
    ferias: { rotulo: 'Férias', titulo: 'Férias' },
    ausencia: { rotulo: 'Ausência', titulo: 'Ausências' },
    folga_domingo: { rotulo: 'Folga de domingo', titulo: 'Folgas de Domingo' },
    reposicao_domingo: { rotulo: 'Reposição de folga de domingo', titulo: 'Reposições de Folga de Domingo', horarioNoTitulo: true }
});

// Para o filtro "Tipo" da tela: [chave, rotulo].
export const TIPOS_FOLHA_ASSINATURA = Object.freeze(
    Object.entries(TIPOS).map(([chave, tipo]) => Object.freeze([chave, tipo.rotulo]))
);

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

// "26 de Outubro de 2026", como no fecho da folha.
export function dataPorExtenso(data) {
    return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`;
}

function formatarData(dataISO) {
    const [ano, mes, dia] = String(dataISO || '').split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : '--';
}

function textoDoPeriodo(inicioISO, fimISO) {
    if (inicioISO === fimISO) {
        return formatarData(inicioISO);
    }

    return `${formatarData(inicioISO)} a ${formatarData(fimISO)}`;
}

// "08:00-12:00" -> "8h às 12h"; "08:30-12:00" -> "8h30 às 12h".
function horaCurta(hora) {
    const [h, m] = String(hora).split(':');
    return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

function textoDoHorario(faixa) {
    const [inicio, fim] = String(faixa).split('-');
    return `${horaCurta(inicio)} às ${horaCurta(fim)}`;
}

function juntarComE(itens) {
    if (itens.length <= 1) {
        return itens.join('');
    }

    return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

const ehFaixaDeHorario = (valor) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(valor || ''));

// Lancamentos normalizados: um por (periodo, colaborador, tipo).
function coletarLancamentos(dados) {
    const { inicioISO, fimISO } = dados;
    const lancamentos = new Map();

    const adicionar = ({ colaboradorId, tipo, inicio, fim = inicio, horario = '', detalhe = '' }) => {
        const id = Number(colaboradorId);

        if (!TIPOS[tipo] || !Number.isFinite(id) || !inicio || fim < inicioISO || inicio > fimISO) {
            return;
        }

        const inicioNoMes = inicio < inicioISO ? inicioISO : inicio;
        const fimNoMes = fim > fimISO ? fimISO : fim;
        const chave = `${inicioNoMes}|${fimNoMes}|${id}|${tipo}`;

        if (!lancamentos.has(chave)) {
            lancamentos.set(chave, {
                colaboradorId: id,
                tipo,
                inicioISO: inicioNoMes,
                fimISO: fimNoMes,
                horarios: new Set(),
                detalhes: new Set()
            });
        }

        const lancamento = lancamentos.get(chave);

        if (ehFaixaDeHorario(horario)) {
            lancamento.horarios.add(horario);
        }

        if (detalhe) {
            lancamento.detalhes.add(detalhe);
        }
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
                horario: plantao.horario
            });
        });
    });

    (dados.folgasDomingo || []).forEach((folga) => {
        adicionar({
            colaboradorId: folga.colaboradorId,
            tipo: 'folga_domingo',
            inicio: folga.dataDomingo,
            detalhe: folga.dataReposicao ? `reposição em ${formatarData(folga.dataReposicao)}` : 'reposição a definir'
        });

        if (folga.dataReposicao) {
            adicionar({
                colaboradorId: folga.colaboradorId,
                tipo: 'reposicao_domingo',
                inicio: folga.dataReposicao,
                horario: folga.horarioReposicao,
                detalhe: `domingo ${formatarData(folga.dataDomingo)}`
            });
        }
    });

    return [...lancamentos.values()];
}

/**
 * Monta as folhas do relatorio.
 *
 * @param {object} dados
 * @param {string} dados.inicioISO  primeiro dia do mes (YYYY-MM-DD)
 * @param {string} dados.fimISO     ultimo dia do mes
 * @param {string} dados.rotuloMes  "Novembro de 2026"
 * @param {string} [dados.tipo]     so a folha deste tipo (vazio = todas)
 * @param {Array<{colaboradorId:number, tipo:string, inicioISO:string, fimISO?:string, detalhe?:string}>} [dados.ausencias]
 *        folga / ferias / ausencia (tipo ja normalizado), detalhe pronto
 *        (subtipo, "Parcial 08:00-12:00")
 * @param {Array<{dataISO:string, tipoLancamento:string, colaboradores:number[], horario?:string}>} [dados.plantoes]
 *        tipoLancamento ja normalizado: sabado / domingo / feriado / cobertura_almoco;
 *        horario "HH:MM-HH:MM"
 * @param {Array<{colaboradorId:number, dataDomingo:string, dataReposicao?:string, horarioReposicao?:string}>} [dados.folgasDomingo]
 * @param {(id:number) => {apelido:string, nomeCompleto?:string}} dados.nomeDe
 */
export function montarFolhasAssinatura(dados) {
    const lancamentos = coletarLancamentos(dados).filter((item) => !dados.tipo || item.tipo === dados.tipo);
    const nomes = new Map();
    const nomeDe = (id) => {
        if (!nomes.has(id)) {
            const nome = dados.nomeDe(id) || { apelido: '' };
            const apelido = String(nome.apelido || `Colaborador #${id}`);
            nomes.set(id, { apelido, assinatura: String(nome.nomeCompleto || apelido).toLocaleUpperCase('pt-BR') });
        }

        return nomes.get(id);
    };
    const primeiroHorario = (item) => [...item.horarios].sort()[0] || '';

    const folhas = Object.entries(TIPOS).flatMap(([chave, tipo]) => {
        const itens = lancamentos.filter((item) => item.tipo === chave);

        if (itens.length === 0) {
            return [];
        }

        const horarios = [...new Set(itens.flatMap((item) => [...item.horarios]))].sort();
        const textoHorarios = tipo.horarioNoTitulo && horarios.length ? ` das ${juntarComE(horarios.map(textoDoHorario))}` : '';
        const porPeriodo = new Map();

        itens.forEach((item) => {
            const periodo = `${item.inicioISO}|${item.fimISO}`;

            if (!porPeriodo.has(periodo)) {
                porPeriodo.set(periodo, []);
            }

            porPeriodo.get(periodo).push(item);
        });

        const datas = [...porPeriodo.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([periodo, doPeriodo]) => {
                const [inicioISO, fimISO] = periodo.split('|');
                const pessoas = [...doPeriodo].sort((a, b) => (
                    primeiroHorario(a).localeCompare(primeiroHorario(b))
                    || nomeDe(a.colaboradorId).apelido.localeCompare(nomeDe(b.colaboradorId).apelido, 'pt-BR')
                ));

                return {
                    inicioISO,
                    data: textoDoPeriodo(inicioISO, fimISO),
                    nomes: pessoas.map((item) => {
                        const { apelido } = nomeDe(item.colaboradorId);
                        return item.detalhes.size ? `${apelido} (${[...item.detalhes].join(', ')})` : apelido;
                    })
                };
            });

        const assinaturas = [...new Set(itens.map((item) => item.colaboradorId))]
            .map((id) => nomeDe(id).assinatura)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        return [{
            tipo: chave,
            rotulo: tipo.rotulo,
            titulo: `${tipo.titulo}${textoHorarios} de ${dados.rotuloMes}`,
            datas,
            assinaturas
        }];
    });

    return {
        folhas,
        totais: {
            folhas: folhas.length,
            lancamentos: lancamentos.length,
            colaboradores: new Set(lancamentos.map((item) => item.colaboradorId)).size
        }
    };
}

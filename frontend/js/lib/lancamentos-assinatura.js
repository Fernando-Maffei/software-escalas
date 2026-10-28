// Relatorio "Lancamentos para assinatura": as folhas de escala de plantao que
// o time imprime para o colaborador assinar, montadas a partir dos plantoes do
// mes. Puro (sem DOM, sem API) para poder ser testado no runner unitario; quem
// le os registros e desenha a tela e core/runtime/relatorio-assinaturas.js.
//
// Duas folhas, no formato da folha feita a mao:
//
//   Escala de Sabados das 8h as 12h e 9h as 13h de Novembro de 2026
//   07/11/2026 -> Luis, Vinicius, Deborah, Joao Vitor
//   ...
//   Jales, 26 de Outubro de 2026.
//   NOMES COMPLETOS (um por linha, com espaco para assinar)
//
// e a de domingos e feriados, igual. Nas linhas de data vai o Nome/Apelido; na
// lista de assinaturas, o nome completo (ou o Nome, quando ele nao foi
// preenchido). So plantao entra: folga, ferias, ausencia e cobertura de almoco
// ficam de fora.
//
// Alem dos lancamentos, entra o plantonista na JORNADA HABITUAL dele (ver
// jornadasHabituais): quem tem jornada naquele sabado, domingo ou feriado
// aparece na linha da data, marcado "(jornada)", mas nao assina — esta so
// cumprindo o proprio horario. Lancamento ganha da jornada: o plantonista
// lancado num plantao naquele dia assina como hoje.
//
// Cada pessoa aparece uma vez por data: dois turnos no mesmo dia nao repetem o
// nome.

// Ordem das folhas e os tipos de lancamento de plantao de cada uma.
/** @type {Readonly<Record<string, {rotulo: string, titulo: string, tipos: string[]}>>} */
const FOLHAS = Object.freeze({
    sabados: { rotulo: 'Sábados', titulo: 'Escala de Sábados', tipos: ['sabado'] },
    domingos_feriados: { rotulo: 'Domingos e feriados', titulo: 'Escala de Domingos e Feriados', tipos: ['domingo', 'feriado'] }
});

// Para o filtro "Folha" da tela: [chave, rotulo].
export const TIPOS_FOLHA_ASSINATURA = Object.freeze(
    Object.entries(FOLHAS).map(([chave, folha]) => Object.freeze([chave, folha.rotulo]))
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

function folhaDoTipo(tipoLancamento) {
    return Object.keys(FOLHAS).find((chave) => FOLHAS[chave].tipos.includes(tipoLancamento)) || null;
}

const DIAS_SEMANA_UTEIS = [1, 2, 3, 4, 5];

function diaDaSemana(dataISO) {
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay();
}

function proximoDia(dataISO) {
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia + 1, 12)).toISOString().slice(0, 10);
}

const isoDe = (valor) => String(valor || '').slice(0, 10);
const horaDe = (valor) => (String(valor || '').match(/(\d{2}:\d{2})/) || [])[1] || '';

/**
 * Plantonista na jornada habitual em cada sabado, domingo e feriado do
 * periodo, no formato de plantao que montarFolhasAssinatura le. A jornada e a
 * do cadastro: a jornada semanal do dia (ColaboradorJornadaSemanal) ou, para
 * quem nao tem jornada semanal, o horario da ficha de segunda a sexta — a
 * mesma regra da escala do dia. Fica de fora quem nao estava trabalhando:
 * desligado, de ferias/folga/ausencia o dia inteiro ou de folga de domingo.
 *
 * @param {object} dados
 * @param {string} dados.inicioISO
 * @param {string} dados.fimISO
 * @param {Array<object>} dados.colaboradores  Id, IsPlantonista, Ativo, DataDesligamento, TrabalhoInicio, TrabalhoFim
 * @param {Array<object>} [dados.jornadaSemanal]  linhas ATIVAS: colaboradorId, diaSemana, trabalhoInicio, trabalhoFim
 * @param {Array<object>} [dados.ausencias]  ColaboradorId, PeriodoTipo, DataInicio, DataFim
 * @param {Array<object>} [dados.folgasDomingo]  colaboradorId, dataDomingo
 * @param {Iterable<string>} [dados.feriados]  datas ISO
 */
export function jornadasHabituais(dados) {
    const feriados = new Set(dados.feriados || []);
    const jornadaPorColaborador = new Map();

    (dados.jornadaSemanal || []).forEach((linha) => {
        const id = Number(linha.colaboradorId ?? linha.ColaboradorId);

        if (!jornadaPorColaborador.has(id)) {
            jornadaPorColaborador.set(id, new Map());
        }

        jornadaPorColaborador.get(id).set(Number(linha.diaSemana ?? linha.DiaSemana), {
            inicio: horaDe(linha.trabalhoInicio ?? linha.TrabalhoInicio),
            fim: horaDe(linha.trabalhoFim ?? linha.TrabalhoFim)
        });
    });

    const fora = new Set();
    (dados.ausencias || []).forEach((ausencia) => {
        if (String(ausencia.PeriodoTipo ?? ausencia.periodoTipo ?? 'dia_inteiro').toLowerCase() !== 'dia_inteiro') {
            return;
        }

        const id = Number(ausencia.ColaboradorId ?? ausencia.colaboradorId);
        const fim = isoDe(ausencia.DataFim ?? ausencia.dataFim);

        for (let dataISO = isoDe(ausencia.DataInicio ?? ausencia.dataInicio); dataISO && dataISO <= fim; dataISO = proximoDia(dataISO)) {
            fora.add(`${id}|${dataISO}`);
        }
    });
    (dados.folgasDomingo || []).forEach((folga) => {
        fora.add(`${Number(folga.colaboradorId ?? folga.ColaboradorId)}|${isoDe(folga.dataDomingo ?? folga.DataDomingo)}`);
    });

    const plantonistas = (dados.colaboradores || []).filter((item) => item.IsPlantonista || item.isPlantonista);
    const jornadas = [];

    for (let dataISO = dados.inicioISO; dataISO <= dados.fimISO; dataISO = proximoDia(dataISO)) {
        const semana = diaDaSemana(dataISO);
        let tipoLancamento = null;

        if (feriados.has(dataISO)) {
            tipoLancamento = 'feriado';
        } else if (semana === 6) {
            tipoLancamento = 'sabado';
        } else if (semana === 0) {
            tipoLancamento = 'domingo';
        }

        if (!tipoLancamento) {
            continue;
        }

        for (const colaborador of plantonistas) {
            const id = Number(colaborador.Id ?? colaborador.id);
            const ativo = colaborador.Ativo !== false && colaborador.Ativo !== 0;
            const desligamento = isoDe(colaborador.DataDesligamento ?? colaborador.dataDesligamento);

            if ((!ativo && (!desligamento || dataISO >= desligamento)) || fora.has(`${id}|${dataISO}`)) {
                continue;
            }

            const porDia = jornadaPorColaborador.get(id);
            const jornada = porDia
                ? porDia.get(semana)
                : (DIAS_SEMANA_UTEIS.includes(semana)
                    ? { inicio: horaDe(colaborador.TrabalhoInicio), fim: horaDe(colaborador.TrabalhoFim) }
                    : null);

            if (!jornada?.inicio || !jornada?.fim) {
                continue;
            }

            jornadas.push({ dataISO, tipoLancamento, colaboradores: [id], horario: `${jornada.inicio}-${jornada.fim}` });
        }
    }

    return jornadas;
}

// Escalas normalizadas: uma por (folha, data, colaborador), com os horarios
// dos turnos em que a pessoa esta naquele dia. `assina` diz se veio de um
// lancamento (assina) ou so da jornada habitual (nao assina); lancamento
// ganha, por isso os plantoes entram antes das jornadas.
function coletarEscalas(dados) {
    const escalas = new Map();
    const fontes = [
        { registros: dados.plantoes || [], assina: true },
        { registros: dados.jornadas || [], assina: false }
    ];

    fontes.forEach(({ registros, assina }) => registros.forEach((plantao) => {
        const folha = folhaDoTipo(plantao.tipoLancamento);
        const dataISO = plantao.dataISO;

        if (!folha || !dataISO || dataISO < dados.inicioISO || dataISO > dados.fimISO) {
            return;
        }

        (plantao.colaboradores || []).forEach((colaboradorId) => {
            const id = Number(colaboradorId);

            if (!Number.isFinite(id)) {
                return;
            }

            const chave = `${folha}|${dataISO}|${id}`;

            if (!escalas.has(chave)) {
                escalas.set(chave, { folha, dataISO, colaboradorId: id, horarios: new Set(), assina });
            } else if (!assina) {
                // Ja lancado no dia: a jornada nao muda nada.
                return;
            }

            if (ehFaixaDeHorario(plantao.horario)) {
                escalas.get(chave).horarios.add(plantao.horario);
            }
        });
    }));

    return [...escalas.values()];
}

/**
 * Monta as folhas do relatorio.
 *
 * @param {object} dados
 * @param {string} dados.inicioISO  primeiro dia do mes (YYYY-MM-DD)
 * @param {string} dados.fimISO     ultimo dia do mes
 * @param {string} dados.rotuloMes  "Novembro de 2026"
 * @param {string} [dados.folha]    so esta folha (sabados / domingos_feriados; vazio = as duas)
 * @param {Array<{dataISO:string, tipoLancamento:string, colaboradores:number[], horario?:string}>} [dados.plantoes]
 *        tipoLancamento ja normalizado: sabado / domingo / feriado / cobertura_almoco;
 *        horario "HH:MM-HH:MM"
 * @param {Array<{dataISO:string, tipoLancamento:string, colaboradores:number[], horario?:string}>} [dados.jornadas]
 *        plantonista na jornada habitual (jornadasHabituais): aparece, nao assina
 * @param {(id:number) => {apelido:string, nomeCompleto?:string}} dados.nomeDe
 */
export function montarFolhasAssinatura(dados) {
    const escalas = coletarEscalas(dados).filter((item) => !dados.folha || item.folha === dados.folha);
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

    const folhas = Object.entries(FOLHAS).flatMap(([chave, folha]) => {
        const itens = escalas.filter((item) => item.folha === chave);

        if (itens.length === 0) {
            return [];
        }

        const horarios = [...new Set(itens.flatMap((item) => [...item.horarios]))].sort();
        const textoHorarios = horarios.length ? ` das ${juntarComE(horarios.map(textoDoHorario))}` : '';
        const datasISO = [...new Set(itens.map((item) => item.dataISO))].sort();

        const datas = datasISO.map((dataISO) => {
            const pessoas = itens
                .filter((item) => item.dataISO === dataISO)
                .sort((a, b) => (
                    primeiroHorario(a).localeCompare(primeiroHorario(b))
                    || nomeDe(a.colaboradorId).apelido.localeCompare(nomeDe(b.colaboradorId).apelido, 'pt-BR')
                ));

            return {
                dataISO,
                data: formatarData(dataISO),
                nomes: pessoas.map((item) => `${nomeDe(item.colaboradorId).apelido}${item.assina ? '' : ' (jornada)'}`)
            };
        });

        // Assina quem foi lancado em algum dia da folha. Quem so aparece pela
        // jornada vai numa lista a parte, sem linha de assinatura.
        const lancados = new Set(itens.filter((item) => item.assina).map((item) => item.colaboradorId));
        const porNome = (a, b) => a.localeCompare(b, 'pt-BR');
        const assinaturas = [...lancados].map((id) => nomeDe(id).assinatura).sort(porNome);
        const emJornada = [...new Set(itens.filter((item) => !lancados.has(item.colaboradorId)).map((item) => item.colaboradorId))]
            .map((id) => nomeDe(id).assinatura)
            .sort(porNome);

        return [{
            folha: chave,
            rotulo: folha.rotulo,
            titulo: `${folha.titulo}${textoHorarios} de ${dados.rotuloMes}`,
            datas,
            assinaturas,
            emJornada
        }];
    });

    return {
        folhas,
        totais: {
            folhas: folhas.length,
            escalas: escalas.length,
            colaboradores: new Set(escalas.map((item) => item.colaboradorId)).size,
            jornadas: escalas.filter((item) => !item.assina).length
        }
    };
}

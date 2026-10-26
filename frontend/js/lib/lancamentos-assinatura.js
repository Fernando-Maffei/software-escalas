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

// Escalas normalizadas: uma por (folha, data, colaborador), com os horarios
// dos turnos em que a pessoa esta naquele dia.
function coletarEscalas(dados) {
    const escalas = new Map();

    (dados.plantoes || []).forEach((plantao) => {
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
                escalas.set(chave, { folha, dataISO, colaboradorId: id, horarios: new Set() });
            }

            if (ehFaixaDeHorario(plantao.horario)) {
                escalas.get(chave).horarios.add(plantao.horario);
            }
        });
    });

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
                nomes: pessoas.map((item) => nomeDe(item.colaboradorId).apelido)
            };
        });

        const assinaturas = [...new Set(itens.map((item) => item.colaboradorId))]
            .map((id) => nomeDe(id).assinatura)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        return [{
            folha: chave,
            rotulo: folha.rotulo,
            titulo: `${folha.titulo}${textoHorarios} de ${dados.rotuloMes}`,
            datas,
            assinaturas
        }];
    });

    return {
        folhas,
        totais: {
            folhas: folhas.length,
            escalas: escalas.length,
            colaboradores: new Set(escalas.map((item) => item.colaboradorId)).size
        }
    };
}

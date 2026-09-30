// Fabrica de dados para os testes de integracao: cria pela API (como a tela
// faria) cada tipo de registro que o sistema tem, para os testes montarem
// cenarios reais — inclusive os que tocam todas as tabelas filhas de
// Colaboradores.
const { esperarSucesso, nomeUnico } = require('./apoio');

// Datas fixas longe de "hoje", para nao depender do dia em que o teste roda.
const DATAS = Object.freeze({
    sabado: '2027-01-02',
    domingo: '2027-01-03',
    segunda: '2027-01-04',
    terca: '2027-01-05',
    quinta: '2027-01-07'
});

const JORNADA_PADRAO = Object.freeze({
    trabalhoInicio: '08:00',
    trabalhoFim: '17:00',
    almocoInicio: '12:00',
    almocoFim: '13:00'
});

async function criarSetor(cliente, nome = nomeUnico('Setor')) {
    const corpo = esperarSucesso(await cliente.post('/api/setores', { nome }), 'criar setor');
    return corpo.data || corpo;
}

async function criarTipoEscala(cliente) {
    const dias = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        trabalha: diaSemana >= 1 && diaSemana <= 5,
        ...(diaSemana >= 1 && diaSemana <= 5 ? JORNADA_PADRAO : {})
    }));
    const corpo = esperarSucesso(
        await cliente.post('/api/tipos-escala', { nome: nomeUnico('Tipo'), dias, domingosFolgaCada: 3 }),
        'criar tipo de escala'
    );
    return corpo.data || corpo;
}

async function criarColaborador(cliente, extras = {}) {
    const corpo = esperarSucesso(
        await cliente.post('/api/colaboradores', { nome: nomeUnico('Colaborador'), ...JORNADA_PADRAO, ...extras }),
        'criar colaborador'
    );
    return corpo.data;
}

async function lancarAusencia(cliente, colaboradorId, extras = {}) {
    const corpo = esperarSucesso(
        await cliente.post('/api/ausencias', {
            colaboradorId,
            tipo: 'ausencia',
            dataInicio: DATAS.terca,
            dataFim: DATAS.terca,
            periodoTipo: 'dia_inteiro',
            descontaBancoHoras: true,
            ...extras
        }),
        'lancar ausencia'
    );
    return corpo.data;
}

async function lancarPlantao(cliente, dataISO, lancamentos, observacao = null) {
    const corpo = esperarSucesso(
        await cliente.post('/api/plantoes', { dataISO, observacao, lancamentos }),
        `lancar plantao em ${dataISO}`
    );
    return corpo.data;
}

// Folga de domingo e so de plantonista de final de semana (cadastro do
// colaborador): marca a pessoa antes de registrar, como o usuario faria.
async function tornarPlantonista(cliente, colaboradorId, tipoPlantonista = 'FINAL_SEMANA') {
    const corpo = esperarSucesso(
        await cliente.put(`/api/colaboradores/${colaboradorId}`, { isPlantonista: true, tipoPlantonista }),
        'marcar colaborador como plantonista'
    );
    return corpo.data;
}

async function registrarFolgaDomingo(cliente, colaboradorId, extras = {}) {
    await tornarPlantonista(cliente, colaboradorId);

    const corpo = esperarSucesso(
        await cliente.post('/api/folgas-domingo', {
            colaboradorId,
            dataDomingo: DATAS.domingo,
            dataReposicao: DATAS.quinta,
            reposicaoHoraInicio: '08:00',
            reposicaoHoraFim: '17:00',
            ...extras
        }),
        'registrar folga de domingo'
    );
    return corpo.data;
}

async function lancarSaldoSemanal(cliente, colaboradorId, saldo = '+02:30') {
    return esperarSucesso(
        await cliente.put('/api/banco-horas-semanal/celula', { colaboradorId, semana: DATAS.segunda, saldo }),
        'lancar saldo semanal'
    );
}

async function anotarSemana(cliente, observacao = 'Semana de teste') {
    return esperarSucesso(
        await cliente.put('/api/banco-horas-semanal/nota', { semana: DATAS.segunda, observacao }),
        'anotar semana'
    );
}

async function cadastrarFeriado(cliente, data = '2027-03-19') {
    const corpo = esperarSucesso(
        await cliente.post('/api/feriados', { nome: nomeUnico('Feriado'), data, tipo: 'municipal' }),
        'cadastrar feriado'
    );
    return corpo.data || corpo;
}

async function desligarColaborador(cliente, colaboradorId) {
    return esperarSucesso(
        await cliente.put(`/api/colaboradores/${colaboradorId}/desligar`, {}),
        'desligar colaborador'
    );
}

module.exports = {
    DATAS,
    JORNADA_PADRAO,
    anotarSemana,
    cadastrarFeriado,
    criarColaborador,
    criarSetor,
    criarTipoEscala,
    desligarColaborador,
    lancarAusencia,
    lancarPlantao,
    lancarSaldoSemanal,
    registrarFolgaDomingo,
    tornarPlantonista
};

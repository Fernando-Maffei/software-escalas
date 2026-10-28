const assert = require('node:assert/strict');

const { consultar, criarCliente, esperarSucesso, nomeUnico } = require('./apoio');
const { criarColaborador, criarSetor, desligarColaborador, lancarAusencia, tornarPlantonista } = require('./fabrica');

// Ferias de segunda a sexta, longe de "hoje" (01/01/2027 e feriado, fica fora).
const FERIAS = Object.freeze({ dataInicio: '2027-01-04', dataFim: '2027-01-08' });

// Ana e a plantonista de semana (11h-22h) que sai de ferias. Bruno trabalha
// 08h-17h: nao pode cobrir antes das 17h, mas pode emendar depois. Carla
// trabalha 06h-11h e esta livre a partir das 11h.
async function montarCenario(cliente) {
    const ana = await criarColaborador(cliente, {
        trabalhoInicio: '11:00',
        trabalhoFim: '22:00',
        almocoInicio: '16:00',
        almocoFim: '17:00'
    });
    await tornarPlantonista(cliente, ana.Id, 'SEMANA');

    const ferias = await lancarAusencia(cliente, ana.Id, { tipo: 'ferias', ...FERIAS, descontaBancoHoras: false });
    const bruno = await criarColaborador(cliente);
    const carla = await criarColaborador(cliente, {
        trabalhoInicio: '06:00',
        trabalhoFim: '11:00',
        almocoInicio: null,
        almocoFim: null
    });

    return { ana, bruno, carla, feriasId: ferias.Id ?? ferias.id };
}

async function abrirCobertura(cliente, cenario) {
    const corpo = esperarSucesso(
        await cliente.post('/api/coberturas', { titularId: cenario.ana.Id, ausenciaId: cenario.feriasId }),
        'abrir cobertura'
    );
    return corpo.data;
}

function atribuir(trechos, substitutoId, tipoCredito = 'banco') {
    return trechos.map((trecho) => ({ ...trecho, substitutoId, tipoCredito }));
}

module.exports = [
    {
        name: 'cobertura aberta pelas ferias gera um trecho pendente por dia, horario corrido',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);

            const cobertura = await abrirCobertura(cliente, cenario);

            assert.equal(cobertura.dataInicio, FERIAS.dataInicio);
            assert.equal(cobertura.dataFim, FERIAS.dataFim);
            assert.equal(cobertura.ausencia.tipo, 'ferias');
            assert.equal(cobertura.trechos.length, 5);
            assert.ok(
                cobertura.trechos.every(
                    (trecho) =>
                        trecho.horaInicio === '11:00:00' &&
                        trecho.horaFim === '22:00:00' &&
                        trecho.substitutoId === null
                )
            );
            assert.equal(cobertura.resumo.situacao, 'pendente');
            assert.equal(cobertura.resumo.minutosPendentes, 5 * 11 * 60);

            const lida = esperarSucesso(await cliente.get(`/api/coberturas/${cobertura.id}`), 'ler cobertura');
            assert.deepEqual(
                lida.trechos.map((trecho) => trecho.id),
                cobertura.trechos.map((trecho) => trecho.id)
            );
        }
    },
    {
        // Cenario 1 do pedido: uma pessoa assume o periodo inteiro.
        name: 'cobertura integral: substituto com expediente que cruza e recusado; livre cobre tudo',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            const cobertura = await abrirCobertura(cliente, cenario);

            const recusada = await cliente.put(`/api/coberturas/${cobertura.id}`, {
                trechos: atribuir(cobertura.trechos, cenario.bruno.Id)
            });
            assert.equal(recusada.status, 409);
            assert.match(recusada.body.message || recusada.body.error || '', /ja trabalha das 08:00-17:00/);

            const coberta = esperarSucesso(
                await cliente.put(`/api/coberturas/${cobertura.id}`, {
                    trechos: atribuir(cobertura.trechos, cenario.carla.Id)
                }),
                'atribuir tudo a Carla'
            ).data;

            assert.equal(coberta.resumo.situacao, 'coberto');
            // Os ids dos trechos ficam estaveis na edicao.
            assert.deepEqual(
                coberta.trechos.map((trecho) => trecho.id),
                cobertura.trechos.map((trecho) => trecho.id)
            );
            assert.ok(
                coberta.trechos.every(
                    (trecho) => trecho.substitutoId === cenario.carla.Id && trecho.tipoCredito === 'banco'
                )
            );
        }
    },
    {
        // Cenarios 2 e 3: revezamento entre pessoas e um dia dividido.
        name: 'revezamento com horario dividido e segundo turno no mesmo dia fica parcial ate fechar',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            const cobertura = await abrirCobertura(cliente, cenario);
            const [segunda, terca, ...resto] = cobertura.trechos;

            const trechos = [
                { ...segunda, horaFim: '17:00', substitutoId: cenario.carla.Id, tipoCredito: 'extra' },
                // Bruno sai as 17h e emenda: segundo turno, aceito.
                {
                    dataISO: segunda.dataISO,
                    horaInicio: '17:00',
                    horaFim: '22:00',
                    substitutoId: cenario.bruno.Id,
                    tipoCredito: 'banco'
                },
                { ...terca, substitutoId: cenario.carla.Id, tipoCredito: 'banco' },
                ...resto
            ];

            const salva = esperarSucesso(
                await cliente.put(`/api/coberturas/${cobertura.id}`, { trechos }),
                'revezamento'
            ).data;

            assert.equal(salva.trechos.length, 6);
            assert.equal(salva.resumo.situacao, 'parcial');
            assert.deepEqual(
                salva.resumo.dias.slice(0, 3).map((dia) => dia.situacao),
                ['coberto', 'coberto', 'pendente']
            );
            assert.deepEqual(
                salva.trechos
                    .filter((trecho) => trecho.dataISO === segunda.dataISO)
                    .map((trecho) => [trecho.horaInicio, trecho.substitutoNome]),
                [
                    ['11:00:00', cenario.carla.Nome],
                    ['17:00:00', cenario.bruno.Nome]
                ]
            );
        }
    },
    {
        // Fase 2: o trecho de dia util vira trabalho do substituto na escala
        // do dia, credito no banco (destino banco) ou hora extra (destino extra).
        name: 'trecho de dia util aparece na escala do substituto e credita banco ou hora extra',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            const cobertura = await abrirCobertura(cliente, cenario);
            const [segunda, terca, ...resto] = cobertura.trechos;
            const url = `/api/coberturas/${cobertura.id}`;

            esperarSucesso(
                await cliente.put(url, {
                    trechos: [
                        { ...segunda, horaFim: '17:00', substitutoId: cenario.carla.Id, tipoCredito: 'extra' },
                        {
                            dataISO: segunda.dataISO,
                            horaInicio: '17:00',
                            horaFim: '22:00',
                            substitutoId: cenario.bruno.Id,
                            tipoCredito: 'banco'
                        },
                        { ...terca, substitutoId: cenario.carla.Id, tipoCredito: 'banco' },
                        ...resto
                    ]
                }),
                'revezamento'
            );

            // Escala do dia: cada um continua com o proprio expediente e o
            // trecho entra como segundo turno.
            const dia = esperarSucesso(await cliente.get(`/api/escala/dia/${segunda.dataISO}`), 'escala do dia');
            const linha = (colaborador) => dia.items.find((item) => item.colaboradorId === colaborador.Id);
            assert.equal(linha(cenario.bruno).horaInicio, '08:00:00');
            assert.deepEqual(
                linha(cenario.bruno).coberturas.map((item) => [
                    item.horaInicio,
                    item.horaFim,
                    item.tipoCredito,
                    item.titularNome
                ]),
                [['17:00:00', '22:00:00', 'banco', cenario.ana.Nome]]
            );
            assert.deepEqual(
                linha(cenario.carla).coberturas.map((item) => [item.horaInicio, item.horaFim, item.tipoCredito]),
                [['11:00:00', '17:00:00', 'extra']]
            );
            assert.deepEqual(linha(cenario.ana).coberturas, []);

            // O relatorio da escala traz o mesmo segundo turno.
            const relatorio = esperarSucesso(
                await cliente.get(
                    `/api/escala/relatorio?dataInicio=${segunda.dataISO}&dataFim=${segunda.dataISO}&colaboradorId=${cenario.bruno.Id}`
                ),
                'relatorio'
            );
            assert.equal(relatorio.items[0].coberturas.length, 1);

            // Banco: Bruno ganha 5h na segunda, Carla 11h na terca. As 6h da
            // Carla na segunda sao hora extra e ficam fora do saldo.
            const extratoBruno = esperarSucesso(
                await cliente.get(`/api/banco-horas/colaborador/${cenario.bruno.Id}`),
                'extrato Bruno'
            );
            assert.deepEqual(
                extratoBruno.items.filter((item) => item.origemTipo === 'cobertura').map((item) => item.minutos),
                [300]
            );
            const extratoCarla = esperarSucesso(
                await cliente.get(`/api/banco-horas/colaborador/${cenario.carla.Id}`),
                'extrato Carla'
            );
            assert.deepEqual(
                extratoCarla.items.filter((item) => item.origemTipo === 'cobertura').map((item) => item.minutos),
                [660]
            );
            assert.deepEqual(
                extratoCarla.horasExtras.map((item) => [item.origem, item.dataReferencia, item.minutos]),
                [['cobertura', segunda.dataISO, 360]]
            );

            const extras = esperarSucesso(
                await cliente.get(
                    `/api/banco-horas-semanal/horas-extras?inicio=${FERIAS.dataInicio}&fim=${FERIAS.dataFim}&colaboradorId=${cenario.carla.Id}`
                ),
                'relatorio de horas extras'
            );
            assert.equal(extras.totalMinutos, 360);
            assert.equal(extras.itens[0].plantoes[0].origem, 'cobertura');

            // Recalcular o banco do zero refaz o credito da cobertura.
            esperarSucesso(await cliente.post('/api/banco-horas/recalcular', {}), 'recalcular');
            const recalculado = esperarSucesso(
                await cliente.get(`/api/banco-horas/colaborador/${cenario.carla.Id}`),
                'extrato depois do recalculo'
            );
            assert.deepEqual(
                recalculado.items.filter((item) => item.origemTipo === 'cobertura').map((item) => item.minutos),
                [660]
            );

            // Trocar o destino do Bruno para hora extra tira o credito dele.
            const atual = esperarSucesso(await cliente.get(url), 'ler cobertura');
            esperarSucesso(
                await cliente.put(url, {
                    trechos: atual.trechos.map((trecho) =>
                        trecho.substitutoId === cenario.bruno.Id ? { ...trecho, tipoCredito: 'extra' } : trecho
                    )
                }),
                'Bruno em hora extra'
            );
            const semCredito = esperarSucesso(
                await cliente.get(`/api/banco-horas/colaborador/${cenario.bruno.Id}`),
                'extrato Bruno depois'
            );
            assert.equal(semCredito.items.filter((item) => item.origemTipo === 'cobertura').length, 0);

            // Excluir a cobertura apaga o resto e tira o segundo turno da escala.
            esperarSucesso(await cliente.delete(url), 'excluir cobertura');
            const depois = esperarSucesso(
                await cliente.get(`/api/banco-horas/colaborador/${cenario.carla.Id}`),
                'extrato Carla depois'
            );
            assert.equal(depois.items.filter((item) => item.origemTipo === 'cobertura').length, 0);
            assert.equal(depois.horasExtras.length, 0);
            const diaDepois = esperarSucesso(await cliente.get(`/api/escala/dia/${segunda.dataISO}`), 'escala depois');
            assert.deepEqual(diaDepois.items.find((item) => item.colaboradorId === cenario.bruno.Id).coberturas, []);
        }
    },
    {
        name: 'trechos sobrepostos, credito faltando e titular cobrindo a si mesmo sao recusados',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            const cobertura = await abrirCobertura(cliente, cenario);
            const [segunda] = cobertura.trechos;
            const url = `/api/coberturas/${cobertura.id}`;

            const sobreposta = await cliente.put(url, {
                trechos: [
                    { ...segunda, horaFim: '18:00' },
                    { dataISO: segunda.dataISO, horaInicio: '17:00', horaFim: '22:00' }
                ]
            });
            assert.equal(sobreposta.status, 400);

            const semCredito = await cliente.put(url, {
                trechos: [{ ...segunda, substitutoId: cenario.carla.Id, tipoCredito: null }]
            });
            assert.equal(semCredito.status, 400);

            const proprio = await cliente.put(url, {
                trechos: [{ ...segunda, substitutoId: cenario.ana.Id, tipoCredito: 'banco' }]
            });
            assert.equal(proprio.status, 400);

            // Nada disso gravou: continua como abriu.
            const lida = esperarSucesso(await cliente.get(url), 'ler cobertura');
            assert.equal(lida.trechos.length, 5);
            assert.equal(lida.resumo.situacao, 'pendente');
        }
    },
    {
        name: 'substituto de ferias no dia e recusado e aparece indisponivel com o motivo',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            await lancarAusencia(cliente, cenario.carla.Id, {
                tipo: 'ferias',
                dataInicio: '2027-01-05',
                dataFim: '2027-01-05'
            });
            const cobertura = await abrirCobertura(cliente, cenario);
            const [, terca] = cobertura.trechos;

            const recusada = await cliente.put(`/api/coberturas/${cobertura.id}`, {
                trechos: [{ ...terca, substitutoId: cenario.carla.Id, tipoCredito: 'banco' }]
            });
            assert.equal(recusada.status, 409);

            const disponibilidade = esperarSucesso(
                await cliente.get(
                    `/api/coberturas/disponibilidade?dataISO=${terca.dataISO}&horaInicio=11:00&horaFim=22:00&titularId=${cenario.ana.Id}`
                ),
                'disponibilidade'
            );
            const porId = new Map(disponibilidade.colaboradores.map((item) => [item.id, item]));

            assert.equal(porId.has(cenario.ana.Id), false);
            assert.equal(porId.get(cenario.carla.Id).disponivel, false);
            assert.match(porId.get(cenario.carla.Id).motivo, /ferias lancadas/);
            assert.equal(porId.get(cenario.bruno.Id).disponivel, false);
        }
    },
    {
        name: 'cobertura sobreposta do mesmo titular ou fora das ferias e recusada',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            await abrirCobertura(cliente, cenario);

            const repetida = await cliente.post('/api/coberturas', {
                titularId: cenario.ana.Id,
                dataInicio: '2027-01-06',
                dataFim: '2027-01-12'
            });
            assert.equal(repetida.status, 409);

            const outra = await criarColaborador(cliente);
            const ferias = await lancarAusencia(cliente, outra.Id, { tipo: 'ferias', ...FERIAS });
            const fora = await cliente.post('/api/coberturas', {
                titularId: outra.Id,
                ausenciaId: ferias.Id ?? ferias.id,
                dataInicio: '2027-01-04',
                dataFim: '2027-01-15'
            });
            assert.equal(fora.status, 400);
        }
    },
    {
        name: 'cobertura avulsa sem ausencia usa o periodo informado; excluir leva os trechos junto',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);

            const avulsa = esperarSucesso(
                await cliente.post('/api/coberturas', {
                    titularId: cenario.bruno.Id,
                    dataInicio: '2027-01-11',
                    dataFim: '2027-01-12'
                }),
                'cobertura avulsa'
            ).data;

            assert.equal(avulsa.ausenciaId, null);
            assert.deepEqual(
                avulsa.trechos.map((trecho) => [trecho.horaInicio, trecho.horaFim]),
                [
                    ['08:00:00', '17:00:00'],
                    ['08:00:00', '17:00:00']
                ]
            );

            esperarSucesso(await cliente.delete(`/api/coberturas/${avulsa.id}`), 'excluir cobertura');

            const sobra = await consultar(
                `SELECT COUNT(*) AS total FROM CoberturaTrechos WHERE CoberturaId = ${avulsa.id}`
            );
            assert.equal(sobra[0].total, 0);
            assert.equal((await cliente.get(`/api/coberturas/${avulsa.id}`)).status, 404);
        }
    },
    {
        // Mesma regra das outras leituras: a conta com teto de setor ve a
        // cobertura pelo titular, e nao ve o nome de quem cobre de outro setor.
        name: 'conta limitada a um setor so ve cobertura de titular do setor e nao o nome de substituto de fora',
        async run() {
            const admin = criarCliente();
            await admin.entrar();

            const setorVisivel = await criarSetor(admin);
            const setorOculto = await criarSetor(admin);
            const titularVisivel = await criarColaborador(admin, { setorId: setorVisivel.Id });
            const titularOculto = await criarColaborador(admin, { setorId: setorOculto.Id });
            const substitutoOculto = await criarColaborador(admin, {
                setorId: setorOculto.Id,
                trabalhoInicio: '17:00',
                trabalhoFim: '22:00',
                almocoInicio: null,
                almocoFim: null
            });

            const visivel = esperarSucesso(
                await admin.post('/api/coberturas', {
                    titularId: titularVisivel.Id,
                    dataInicio: '2027-02-01',
                    dataFim: '2027-02-01'
                }),
                'cobertura do setor visivel'
            ).data;
            esperarSucesso(
                await admin.put(`/api/coberturas/${visivel.id}`, {
                    trechos: atribuir(visivel.trechos, substitutoOculto.Id)
                }),
                'atribuir substituto de outro setor'
            );
            const oculta = esperarSucesso(
                await admin.post('/api/coberturas', {
                    titularId: titularOculto.Id,
                    dataInicio: '2027-02-01',
                    dataFim: '2027-02-01'
                }),
                'cobertura do setor oculto'
            ).data;

            const username = nomeUnico('setorial').replace(/\s+/g, '-');
            const senha = 'Setorial!Teste1';
            const criado = esperarSucesso(await admin.post('/api/usuarios', { username, senha }), 'criar usuario');
            esperarSucesso(
                await admin.put(`/api/usuarios/${criado.usuario.id}`, { setoresPermitidos: [setorVisivel.Id] }),
                'limitar setores'
            );
            const leitor = criarCliente();
            await leitor.entrar(username, senha);

            const lista = esperarSucesso(
                await leitor.get('/api/coberturas?dataInicio=2027-02-01&dataFim=2027-02-01'),
                'listar'
            );
            const ids = lista.items.map((item) => item.id);
            assert.ok(ids.includes(visivel.id));
            assert.equal(ids.includes(oculta.id), false);
            assert.equal((await leitor.get(`/api/coberturas/${oculta.id}`)).status, 404);

            const lida = esperarSucesso(await leitor.get(`/api/coberturas/${visivel.id}`), 'ler cobertura visivel');
            assert.equal(lida.trechos[0].substitutoOculto, true);
            assert.equal(lida.trechos[0].substitutoNome, null);

            // Usuario comum so le.
            assert.equal((await leitor.delete(`/api/coberturas/${visivel.id}`)).status, 403);
        }
    },
    {
        name: 'exclusao definitiva apaga as coberturas do titular e devolve a pendente o trecho que ele cobria',
        async run() {
            const cliente = criarCliente();
            await cliente.entrar();
            const cenario = await montarCenario(cliente);
            const cobertura = await abrirCobertura(cliente, cenario);
            const [segunda] = cobertura.trechos;

            esperarSucesso(
                await cliente.put(`/api/coberturas/${cobertura.id}`, {
                    trechos: [{ ...segunda, substitutoId: cenario.carla.Id, tipoCredito: 'banco' }]
                }),
                'Carla cobre a segunda'
            );
            const propria = esperarSucesso(
                await cliente.post('/api/coberturas', {
                    titularId: cenario.carla.Id,
                    dataInicio: '2027-01-18',
                    dataFim: '2027-01-18'
                }),
                'cobertura da propria Carla'
            ).data;

            await desligarColaborador(cliente, cenario.carla.Id);
            esperarSucesso(await cliente.delete(`/api/colaboradores/${cenario.carla.Id}`), 'excluir Carla');

            assert.equal((await cliente.get(`/api/coberturas/${propria.id}`)).status, 404);

            const daAna = esperarSucesso(await cliente.get(`/api/coberturas/${cobertura.id}`), 'cobertura da Ana');
            assert.equal(daAna.trechos[0].substitutoId, null);
            assert.equal(daAna.trechos[0].tipoCredito, null);
            assert.equal(daAna.resumo.situacao, 'pendente');
        }
    }
];

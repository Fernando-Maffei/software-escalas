// Prova de equivalencia para refatoracoes grandes do backend ("golden master").
//
//   node tests/integracao/golden-master.js gerar  <arquivo.json>   (antes)
//   node tests/integracao/golden-master.js comparar <arquivo.json> (depois)
//
// Sobe o servidor num banco proprio, executa um roteiro fixo de escritas por
// todas as rotas de dados, le dezenas de endpoints e fotografa todas as
// tabelas. Valores que mudam sozinhos (carimbos de data/hora do momento da
// execucao) sao normalizados; todo o resto tem de bater byte a byte.
//
// Rode "gerar" e "comparar" no mesmo dia: parte das regras depende de hoje
// (ex.: ausencia futura ainda nao debita o banco de horas).
process.env.INTEGRACAO_DB_DATABASE = process.env.INTEGRACAO_DB_DATABASE || 'SoftwareEscalasIntegracaoGolden';

const fs = require('fs');

const { consultar, criarCliente, derrubarServidor, subirServidor } = require('./apoio');

const HOJE = new Date().toISOString().slice(0, 10);
const CHAVES_VOLATEIS =
    /^(criado_?em|atualizado_?em|datacadastro|dataatualizacao|generatedat|timestamp|savedat|restoredat|ultimologinat|createdat|expiresat)$/i;

function normalizar(valor) {
    if (Array.isArray(valor)) {
        return valor.map(normalizar);
    }

    if (valor && typeof valor === 'object') {
        return Object.fromEntries(
            Object.entries(valor).map(([chave, item]) => [
                chave,
                CHAVES_VOLATEIS.test(chave) ? '<volatil>' : normalizar(item)
            ])
        );
    }

    // Carimbo de data/hora do momento da execucao (nao e dado do cenario).
    if (typeof valor === 'string' && valor.startsWith(`${HOJE}T`) && !valor.endsWith('T00:00:00.000Z')) {
        return '<agora>';
    }

    return valor;
}

const TABELAS = [
    'Setores',
    'TiposEscala',
    'TipoEscalaDia',
    'Colaboradores',
    'ColaboradorJornadaSemanal',
    'FolgasDomingo',
    'Feriados',
    'Ausencias',
    'plantoes',
    'BancoHorasMovimentos',
    'BancoHorasSemanal',
    'BancoHorasSemanalNota',
    'escala_dia',
    'AlmocosPersonalizados'
];

const JORNADA = { trabalhoInicio: '08:00', trabalhoFim: '17:00', almocoInicio: '12:00', almocoFim: '13:00' };
const diasUteis = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, ...JORNADA }));

async function roteiro(cliente, registro) {
    const passo = async (metodo, rota, corpo) => {
        const resposta = await cliente[metodo](rota, corpo);
        registro.push({ passo: `${metodo.toUpperCase()} ${rota}`, status: resposta.status, corpo: resposta.body });
        return resposta.body;
    };

    // ---- escritas ----
    const setorA = (await passo('post', '/api/setores', { nome: 'Recepcao' })).data;
    const setorB = (await passo('post', '/api/setores', { nome: 'Enfermagem' })).data;
    const tipo = (
        await passo('post', '/api/tipos-escala', {
            nome: 'Plantonista',
            domingosFolgaCada: 3,
            exigeReposicao: true,
            dias: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
                diaSemana,
                trabalha: ![4, 5].includes(diaSemana),
                ...(![4, 5].includes(diaSemana)
                    ? { trabalhoInicio: '07:00', trabalhoFim: '19:00', almocoInicio: '12:00', almocoFim: '13:00' }
                    : {})
            }))
        })
    ).data;
    await passo('put', `/api/tipos-escala/${tipo.id}`, { observacao: 'Sab a qua' });

    const ana = (
        await passo('post', '/api/colaboradores', {
            nome: 'Ana',
            setorId: setorA.Id,
            ...JORNADA,
            jornadaSemanal: diasUteis
        })
    ).data;
    const beto = (
        await passo('post', '/api/colaboradores', {
            nome: 'Beto',
            setorId: setorB.Id,
            tipoEscalaId: tipo.id,
            ...JORNADA
        })
    ).data;
    const caio = (await passo('post', '/api/colaboradores', { nome: 'Caio', setorId: setorA.Id, ...JORNADA })).data;
    await passo('put', `/api/colaboradores/${caio.Id}`, {
        nome: 'Caio Souza',
        almocoInicio: '12:30',
        almocoFim: '13:30'
    });
    await passo('put', `/api/colaboradores/${ana.Id}/jornada-semanal`, { jornadaSemanal: diasUteis.slice(0, 4) });
    await passo('post', `/api/tipos-escala/${tipo.id}/aplicar/${beto.Id}`, {});

    const feriado = (
        await passo('post', '/api/feriados', { nome: 'Aniversario da cidade', data: '2027-03-19', tipo: 'municipal' })
    ).data;
    await passo('post', '/api/feriados', { nome: 'Padroeiro', data: '2027-06-10', tipo: 'municipal' });
    await passo('put', `/api/feriados/${feriado.Id}`, { nome: 'Aniversario do municipio' });

    await passo('post', '/api/ausencias', {
        colaboradorId: ana.Id,
        tipo: 'ausencia',
        dataInicio: '2026-09-01',
        dataFim: '2026-09-02',
        descontaBancoHoras: true
    });
    const aus = (
        await passo('post', '/api/ausencias', {
            colaboradorId: caio.Id,
            tipo: 'folga',
            dataInicio: '2027-01-05',
            dataFim: '2027-01-05'
        })
    ).data;
    await passo('post', '/api/ausencias', {
        colaboradorId: caio.Id,
        tipo: 'ausencia',
        periodoTipo: 'horas',
        dataInicio: '2026-08-31',
        dataFim: '2026-08-31',
        horaInicio: '08:00',
        horaFim: '10:00',
        observacao: 'Consulta'
    });
    await passo('post', '/api/ausencias', {
        colaboradorId: beto.Id,
        tipo: 'ferias',
        dataInicio: '2027-02-01',
        dataFim: '2027-02-10'
    });
    await passo('put', `/api/ausencias/${aus.Id}`, { observacao: 'Troca de turno' });

    await passo('post', '/api/plantoes', {
        dataISO: '2027-01-02',
        observacao: 'Sabado',
        lancamentos: [
            { horaInicio: '08:00', horaFim: '12:00', colaboradores: [ana.Id], tipoCredito: 'banco' },
            { horaInicio: '13:00', horaFim: '17:00', colaboradores: [caio.Id], tipoCredito: 'extra' }
        ]
    });
    await passo('post', '/api/plantoes', {
        dataISO: '2027-01-03',
        lancamentos: [{ horaInicio: '08:00', horaFim: '14:00', colaboradores: [ana.Id], tipoCredito: 'extra' }]
    });
    await passo('post', '/api/plantoes', {
        dataISO: '2027-03-19',
        lancamentos: [{ horaInicio: '08:00', horaFim: '12:00', colaboradores: [caio.Id] }]
    });
    await passo('post', '/api/plantoes', {
        dataISO: '2027-01-09',
        lancamentos: [{ horaInicio: '08:00', horaFim: '12:00', colaboradores: [beto.Id] }]
    });
    await passo('delete', '/api/plantoes/2027-01-09');

    const folga = (
        await passo('post', '/api/folgas-domingo', {
            colaboradorId: beto.Id,
            dataDomingo: '2027-01-03',
            dataReposicao: '2027-01-07',
            reposicaoHoraInicio: '08:00',
            reposicaoHoraFim: '17:00'
        })
    ).data;
    await passo('put', `/api/folgas-domingo/${folga.id}`, {
        reposicaoAlmocoInicio: '12:00',
        reposicaoAlmocoFim: '13:00'
    });

    await passo('put', `/api/escala/dia/2027-01-04/colaborador/${ana.Id}`, {
        horaInicio: '09:00',
        horaFim: '18:00',
        observacao: 'Ajuste'
    });
    await passo('put', '/api/escala/almoco-periodo', {
        colaboradorId: caio.Id,
        dataInicio: '2027-01-04',
        dataFim: '2027-01-06',
        almocoInicio: '11:30',
        almocoFim: '12:30'
    });
    await passo('put', '/api/escala/dia/2027-01-06/almocos/cadastro', {});
    await passo('post', '/api/escala/rebuild', { mes: 1, ano: 2027 });

    await passo('put', `/api/banco-horas/colaborador/${caio.Id}/saldo`, {
        saldo: '+03:15',
        observacao: 'Saldo inicial'
    });
    await passo('post', '/api/banco-horas/recalcular', {});

    await passo('put', '/api/banco-horas-semanal/celula', {
        colaboradorId: ana.Id,
        semana: '2026-08-31',
        saldo: '+01:00'
    });
    await passo('put', '/api/banco-horas-semanal/nota', { semana: '2026-08-31', observacao: 'Fechamento' });
    await passo('post', '/api/banco-horas-semanal/gerar-semana', { semana: '2026-09-07', aplicar: false });
    await passo('post', '/api/banco-horas-semanal/gerar-semana', { semana: '2026-09-07', aplicar: true });
    await passo('put', '/api/banco-horas-semanal/confirmar-semana', { semana: '2026-09-07' });

    await passo('put', `/api/colaboradores/${caio.Id}/desligar`, { dataDesligamento: '2026-09-15' });

    // ---- leituras ----
    const leituras = [
        '/api/colaboradores',
        '/api/colaboradores?incluirInativos=1',
        '/api/colaboradores?search=a',
        `/api/colaboradores?setorId=${setorA.Id}`,
        `/api/colaboradores/${ana.Id}`,
        `/api/colaboradores/${beto.Id}/jornada-semanal`,
        '/api/ausencias',
        `/api/ausencias?colaboradorId=${caio.Id}`,
        '/api/ausencias?tipo=ferias',
        '/api/ausencias?data=2026-09-01',
        '/api/ausencias?dataInicio=2027-01-01&dataFim=2027-12-31',
        `/api/ausencias/colaborador/${ana.Id}`,
        '/api/feriados',
        '/api/feriados/ano/2027',
        '/api/feriados/mes/2027/3',
        '/api/feriados/nacionais/2027',
        `/api/feriados/${feriado.Id}`,
        '/api/plantoes',
        '/api/plantoes?from=2027-01-01&to=2027-01-31',
        '/api/plantoes?tipoPlantao=domingo',
        '/api/plantoes/disponibilidade/2027-01-02',
        '/api/plantoes/disponibilidade/2027-01-02?horaInicio=08:00&horaFim=12:00',
        '/api/plantoes/2027-01-02',
        '/api/plantoes/2027-03-19',
        '/api/escala/dia/2027-01-02',
        '/api/escala/dia/2027-01-03',
        '/api/escala/dia/2027-01-04',
        '/api/escala/dia/2027-01-07',
        `/api/escala/dia/2027-01-04?setorId=${setorA.Id}`,
        '/api/escala/dia/2026-09-01',
        '/api/escala/relatorio?dataInicio=2027-01-01&dataFim=2027-01-10',
        `/api/escala/relatorio?dataInicio=2027-01-01&dataFim=2027-01-10&colaboradorId=${ana.Id}`,
        '/api/escala/relatorio?dataInicio=2027-01-01&dataFim=2027-01-10&tipo=plantao',
        '/api/banco-horas/status',
        '/api/banco-horas/resumo',
        `/api/banco-horas/colaborador/${ana.Id}`,
        `/api/banco-horas/colaborador/${caio.Id}`,
        '/api/banco-horas-semanal?inicio=2026-08-31&fim=2026-09-14',
        '/api/banco-horas-semanal/verificar?data=2026-09-07',
        '/api/banco-horas-semanal/saldos',
        '/api/banco-horas-semanal/horas-extras?inicio=2027-01-01&fim=2027-01-31',
        '/api/folgas-domingo',
        `/api/folgas-domingo/${folga.id}`,
        '/api/setores',
        '/api/setores?includeInactive=1',
        '/api/tipos-escala',
        `/api/tipos-escala/${tipo.id}`,
        '/api/jornada-semanal'
    ];

    for (const rota of leituras) {
        await passo('get', rota);
    }

    await passo('delete', '/api/banco-horas-semanal/semana/2026-09-07');
    await passo('delete', `/api/ausencias/${aus.Id}`);
}

(async () => {
    const [acao, arquivo] = process.argv.slice(2);

    if (!['gerar', 'comparar'].includes(acao) || !arquivo) {
        throw new Error('Uso: node tests/integracao/golden-master.js <gerar|comparar> <arquivo.json>');
    }

    await subirServidor();
    const cliente = criarCliente();
    await cliente.entrar();

    const registro = [];

    try {
        await roteiro(cliente, registro);

        const tabelas = {};
        for (const tabela of TABELAS) {
            tabelas[tabela] = await consultar(`SELECT * FROM dbo.[${tabela}] ORDER BY 1`);
        }

        const foto = normalizar({ respostas: registro, tabelas });
        const texto = JSON.stringify(foto, null, 1);

        if (acao === 'gerar') {
            fs.writeFileSync(arquivo, texto);
            console.log(`Golden master gravado: ${registro.length} passos, ${TABELAS.length} tabelas.`);
            return;
        }

        const esperado = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        const diferencas = [];

        foto.respostas.forEach((item, indice) => {
            const antes = esperado.respostas[indice];
            if (JSON.stringify(item) !== JSON.stringify(antes)) {
                diferencas.push(`passo ${indice + 1} (${item.passo}) mudou`);
            }
        });

        TABELAS.forEach((tabela) => {
            if (JSON.stringify(foto.tabelas[tabela]) !== JSON.stringify(esperado.tabelas[tabela])) {
                diferencas.push(`tabela ${tabela} mudou`);
            }
        });

        if (esperado.respostas.length !== foto.respostas.length) {
            diferencas.push(`numero de passos mudou: ${esperado.respostas.length} -> ${foto.respostas.length}`);
        }

        if (diferencas.length) {
            fs.writeFileSync(`${arquivo}.atual.json`, texto);
            console.error(diferencas.join('\n'));
            console.error(`\nFoto atual em ${arquivo}.atual.json para comparar.`);
            process.exitCode = 1;
            return;
        }

        console.log(`Equivalente: ${registro.length} passos e ${TABELAS.length} tabelas identicos ao golden master.`);
    } finally {
        await derrubarServidor();
    }
})().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
});

// Sobe o app de verdade na porta 4480 contra o banco de integracao, ja com
// dados de exemplo, para conferir telas no navegador sem tocar na producao
// (4450) nem depender da demo (que nao tem backend).
//
//   npm run integracao:banco:subir   (uma vez)
//   npm run integracao:servidor      e abra http://127.0.0.1:4480
//
// Login: admin / Admin!Integracao1. O banco e recriado a cada subida.
// Alguns nomes trazem HTML de proposito: se aparecerem como texto (e nao
// como imagem/alerta), o escape das telas esta funcionando.
const { ADMIN, criarCliente, subirServidor } = require('./apoio');
const {
    DATAS,
    cadastrarFeriado,
    criarColaborador,
    criarSetor,
    criarTipoEscala,
    lancarAusencia,
    lancarPlantao,
    registrarFolgaDomingo
} = require('./fabrica');

const PORTA = Number(process.env.INTEGRACAO_PORTA) || 4480;
const NOME_COM_HTML = '<img src=x onerror="window.__xss=1">Maria';

(async () => {
    const controlador = await subirServidor({ porta: PORTA });
    const cliente = criarCliente();
    await cliente.entrar();

    const setor = await criarSetor(cliente, '<b>Setor</b> Recepcao');
    const tipo = await criarTipoEscala(cliente);
    const maria = await criarColaborador(cliente, { nome: NOME_COM_HTML, setorId: setor.Id, tipoEscalaId: tipo.id });
    const joao = await criarColaborador(cliente, { nome: 'Joao Silva', setorId: setor.Id });

    await cadastrarFeriado(cliente);
    await lancarAusencia(cliente, joao.Id, { dataInicio: DATAS.terca, dataFim: DATAS.terca, observacao: '<script>x</script>' });
    await lancarPlantao(cliente, DATAS.sabado, [
        { horaInicio: '08:00', horaFim: '12:00', colaboradores: [maria.Id, joao.Id], tipoCredito: 'banco' }
    ]);
    await registrarFolgaDomingo(cliente, maria.Id);

    console.log(`\nApp de teste em ${controlador.url} — login ${ADMIN.username} / ${ADMIN.password}`);
})().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
});

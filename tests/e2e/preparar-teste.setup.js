// Prepara a instancia de TESTE antes do robo e dos roteiros: espera o app
// ficar pronto, entra como admin, carrega os dados de exemplo (setores,
// colaboradores e feriados) e guarda a sessao para os testes reaproveitarem.
const fs = require('fs');
const path = require('path');
const { test: setup, expect } = require('@playwright/test');
const { ARQUIVO_SESSAO, entrar } = require('./apoio');

setup('preparar instancia de teste', async ({ request }) => {
    setup.setTimeout(5 * 60 * 1000);

    // No primeiro boot o SQL Server leva ~1 minuto e o app ainda aplica o
    // schema; ate la o login responde 503 (ou nem conecta).
    let status = 0;

    await expect.poll(async () => {
        try {
            status = (await entrar(request)).status();
        } catch (erro) {
            status = 0;
        }

        return status !== 0 && status !== 503;
    }, {
        message: 'A instancia de teste nao ficou pronta. Ela esta no ar? npm run teste:subir (porta 4460).',
        timeout: 4 * 60 * 1000,
        intervals: [3000]
    }).toBe(true);

    expect(status, 'Login do admin de teste recusado. A instancia foi criada com outra ADMIN_PASSWORD? Recrie com npm run teste:derrubar e npm run teste:subir.').toBe(200);

    const exemplos = await request.post('/api/configuracao-banco/carregar-exemplos');
    expect(exemplos.ok(), `Falha ao carregar os dados de exemplo: ${await exemplos.text()}`).toBeTruthy();

    fs.mkdirSync(path.dirname(ARQUIVO_SESSAO), { recursive: true });
    await request.storageState({ path: ARQUIVO_SESSAO });
});

// Sobe ou derruba o SQL Server descartavel dos testes de integracao.
//
//   npm run integracao:banco:subir      cria o container e espera aceitar conexao
//   npm run integracao:banco:derrubar   apaga o container (e os dados dele)
//
// Container, porta e senha sao proprios: nao conflita com a producao
// (escalas-db na 1433) nem com a instancia do robo (docker-compose.teste.yml).
// A porta fica presa a 127.0.0.1, entao o banco nao aparece na rede.
const { spawnSync } = require('child_process');

const CONTAINER = 'escalas-integracao-db';
const PORTA = process.env.INTEGRACAO_DB_PORT || '14339';
const SENHA = process.env.INTEGRACAO_DB_PASSWORD || 'Integracao!Escalas2026';
const IMAGEM = 'mcr.microsoft.com/mssql/server:2022-CU27-GDR1-ubuntu-22.04';
const ESPERA_MAXIMA_MS = 120 * 1000;

function docker(args, opcoes = {}) {
    return spawnSync('docker', args, { encoding: 'utf8', ...opcoes });
}

function containerExiste() {
    const resultado = docker(['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}']);

    if (resultado.error) {
        throw new Error(`Docker indisponivel: ${resultado.error.message}`);
    }

    return resultado.stdout.trim() === CONTAINER;
}

function bancoAceitaConexao() {
    const resultado = docker([
        'exec',
        CONTAINER,
        '/opt/mssql-tools18/bin/sqlcmd',
        '-C',
        '-S',
        'localhost',
        '-U',
        'sa',
        '-P',
        SENHA,
        '-Q',
        'SELECT 1'
    ]);

    return resultado.status === 0;
}

async function subir() {
    if (containerExiste()) {
        docker(['start', CONTAINER]);
    } else {
        const resultado = docker(
            [
                'run',
                '-d',
                '--name',
                CONTAINER,
                '-e',
                'ACCEPT_EULA=Y',
                '-e',
                `MSSQL_SA_PASSWORD=${SENHA}`,
                '-e',
                'MSSQL_PID=Express',
                '-p',
                `127.0.0.1:${PORTA}:1433`,
                IMAGEM
            ],
            { stdio: 'inherit' }
        );

        if (resultado.status !== 0) {
            throw new Error('Nao foi possivel criar o container do banco de integracao.');
        }
    }

    const inicio = Date.now();

    while (!bancoAceitaConexao()) {
        if (Date.now() - inicio > ESPERA_MAXIMA_MS) {
            throw new Error('O SQL Server de integracao nao ficou pronto em 2 minutos.');
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`SQL Server de integracao pronto em 127.0.0.1:${PORTA} (container ${CONTAINER}).`);
}

function derrubar() {
    if (!containerExiste()) {
        console.log('Nada a derrubar: o container de integracao nao existe.');
        return;
    }

    docker(['rm', '-f', CONTAINER], { stdio: 'inherit' });
}

const acao = process.argv[2];

(async () => {
    if (acao === 'subir') {
        await subir();
    } else if (acao === 'derrubar') {
        derrubar();
    } else {
        throw new Error('Uso: node scripts/banco-integracao.js <subir|derrubar>');
    }
})().catch((erro) => {
    console.error(erro.message);
    process.exitCode = 1;
});

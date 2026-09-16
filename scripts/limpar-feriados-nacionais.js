// Remove da tabela Feriados as linhas que o sistema agora calcula sozinho.
//
// Os feriados nacionais eram gravados no banco pelo script de dados de exemplo.
// Desde que o backend passou a calcula-los (backend/utils/feriados-nacionais.js),
// essas linhas nao servem para nada e ainda fazem o mesmo dia aparecer duas
// vezes na tela. Este script apaga so elas.
//
// Uso (por padrao NAO apaga nada, apenas lista):
//   node scripts/limpar-feriados-nacionais.js
//   node scripts/limpar-feriados-nacionais.js --aplicar
//
// A conexao vem das mesmas variaveis de ambiente/config do servidor, entao o
// jeito mais simples e rodar dentro do container do app:
//   docker exec escalas-app node scripts/limpar-feriados-nacionais.js
//
// FACA BACKUP ANTES DE USAR --aplicar. A exclusao nao tem desfazer.

const { sql, conectar, fecharConexao } = require('../backend/db');
const { nomeFeriadoNacional } = require('../backend/utils/feriados-nacionais');

function normalizarNome(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function toISO(valor) {
    if (valor instanceof Date) {
        return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, '0')}-${String(valor.getUTCDate()).padStart(2, '0')}`;
    }

    return String(valor ?? '').slice(0, 10);
}

function formatarBR(iso) {
    const [ano, mes, dia] = String(iso).split('-');
    return `${dia}/${mes}/${ano}`;
}

// Classifica cada linha do banco que cai num feriado nacional:
//   'apagar'    -> e o proprio feriado nacional (mesmo nome, ou Tipo 'nacional')
//   'conferir'  -> nome diferente do nacional: pode ser um feriado municipal
//                  legitimo cadastrado no mesmo dia, entao nao mexemos.
function classificar(linha) {
    const dataISO = toISO(linha.Data);
    const nacional = nomeFeriadoNacional(dataISO);

    if (!nacional) {
        return null;
    }

    const tipo = String(linha.Tipo || '').trim().toLowerCase();
    const mesmoNome = normalizarNome(linha.Nome) === normalizarNome(nacional);
    const acao = (mesmoNome || tipo === 'nacional' || tipo === 'federal') ? 'apagar' : 'conferir';

    return {
        id: Number(linha.Id),
        dataISO,
        nome: linha.Nome,
        tipo: linha.Tipo,
        nacional,
        acao
    };
}

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    const pool = await conectar();

    const { recordset } = await pool.request()
        .query('SELECT Id, Data, Nome, Tipo FROM Feriados ORDER BY Data, Id');

    const analisadas = recordset
        .map(classificar)
        .filter(Boolean);

    const paraApagar = analisadas.filter((item) => item.acao === 'apagar');
    const paraConferir = analisadas.filter((item) => item.acao === 'conferir');

    console.log(`Tabela Feriados: ${recordset.length} linha(s).`);
    console.log(`Em data de feriado nacional: ${analisadas.length}.\n`);

    if (paraApagar.length === 0) {
        console.log('Nenhuma linha de feriado nacional para remover — o banco ja esta limpo.');
    } else {
        console.log(`${aplicar ? 'Apagando' : 'Seriam apagadas'} ${paraApagar.length} linha(s):`);
        paraApagar.forEach((item) => {
            console.log(`  #${item.id}  ${formatarBR(item.dataISO)}  ${item.nome}  [${item.tipo}]`);
        });
    }

    if (paraConferir.length > 0) {
        console.log(`\nMantidas por seguranca (${paraConferir.length}) — nome diferente do feriado nacional do dia, pode ser feriado municipal proprio. Apague pela tela de Feriados se nao servirem:`);
        paraConferir.forEach((item) => {
            console.log(`  #${item.id}  ${formatarBR(item.dataISO)}  ${item.nome}  [${item.tipo}]  (nacional do dia: ${item.nacional})`);
        });
    }

    if (!aplicar) {
        console.log('\nNada foi alterado. Faca backup e rode de novo com --aplicar para apagar.');
        return;
    }

    if (paraApagar.length === 0) {
        return;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        for (const item of paraApagar) {
            await transaction.request()
                .input('id', sql.Int, item.id)
                .query('DELETE FROM Feriados WHERE Id = @id');
        }

        await transaction.commit();
        console.log(`\n${paraApagar.length} linha(s) apagada(s).`);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

main()
    .catch((error) => {
        console.error('\nFalhou:', error.message || error);
        process.exitCode = 1;
    })
    .finally(() => fecharConexao().catch(() => {}));

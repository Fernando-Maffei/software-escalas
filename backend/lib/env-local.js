// Le o arquivo .env da raiz do projeto quando o servidor roda direto na
// maquina (npm start, servico do Windows). No Docker quem entrega as variaveis
// e o compose, e o .env nem entra na imagem.
const fs = require('fs');
const path = require('path');

const CAMINHO_ENV = path.join(__dirname, '..', '..', '.env');

// Variavel ja definida no ambiente vence a do arquivo (process.loadEnvFile nao
// sobrescreve), entao o servico ou o terminal continuam mandando.
function carregarEnvLocal(caminho = CAMINHO_ENV) {
    if (!fs.existsSync(caminho)) {
        return false;
    }

    process.loadEnvFile(caminho);
    return true;
}

module.exports = {
    CAMINHO_ENV,
    carregarEnvLocal
};

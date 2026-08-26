// Estado de prontidao do schema do banco, compartilhado entre o boot do
// servidor (server.js) e as rotas que verificam/criam as tabelas
// (configuracao-banco.js).
//
// Por que existir: o schema pode falhar em ser aplicado na inicializacao (banco
// fora do ar, ou um arquivo de migration ausente na imagem — caso classico do
// Docker, onde ./database e assado na imagem e nao espelhado como ./backend).
// Antes, essa falha era engolida num catch e o servidor subia "ok", mas o
// login quebrava com um erro cru de SQL ("Invalid object name 'Sessoes'").
// Agora o boot marca schemaReady=false nesse caso e um portao responde 503 com
// uma mensagem acionavel, em vez de vazar o erro do banco.
//
// Comeca false: so vira true quando ensureApplicationSchema conclui sem erro,
// seja no boot ou ao salvar/verificar a conexao pela tela de configuracao.

let schemaReady = false;

function isSchemaReady() {
    return schemaReady;
}

function setSchemaReady(value) {
    schemaReady = Boolean(value);
}

module.exports = {
    isSchemaReady,
    setSchemaReady
};

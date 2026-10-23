const assert = require('node:assert/strict');

const {
    contarUsuarios,
    filtrarUsuarios,
    formatarUltimoAcesso,
    inicialDoNome,
    normalizarSetores,
    requisitosSenha,
    resumirSetores
} = require('../../frontend/js/telas/usuarios/formatacao.js');

const USUARIOS = [
    { id: 1, username: 'fernando', ativo: true, isAdmin: true },
    { id: 2, username: 'Equipe.UTI', ativo: true, isAdmin: false },
    { id: 3, username: 'joão', ativo: false, isAdmin: false }
];

module.exports = [
    {
        name: 'tela de usuarios: busca ignora maiusculas e acentos e combina com o filtro',
        run() {
            assert.deepEqual(filtrarUsuarios(USUARIOS, { busca: 'uti' }).map((u) => u.id), [2]);
            assert.deepEqual(filtrarUsuarios(USUARIOS, { busca: 'JOAO' }).map((u) => u.id), [3]);
            assert.deepEqual(filtrarUsuarios(USUARIOS, { filtro: 'inativos' }).map((u) => u.id), [3]);
            assert.deepEqual(filtrarUsuarios(USUARIOS, { filtro: 'admins', busca: 'equipe' }), []);
            assert.equal(filtrarUsuarios(USUARIOS, { filtro: 'desconhecido' }).length, 3);
            assert.deepEqual(contarUsuarios(USUARIOS), { todos: 3, ativos: 2, inativos: 1, admins: 1 });
        }
    },
    {
        name: 'tela de usuarios: resumo de setores mostra todos, nomes, excedente e setor removido',
        run() {
            const setores = normalizarSetores([{ Id: 1, Nome: 'Recepcao' }, { id: 2, nome: 'UTI' }, { Id: 3, Nome: 'Raio-X' }, { Nome: 'sem id' }]);
            assert.equal(setores.length, 3);

            assert.equal(resumirSetores([], setores).texto, 'Todos os setores');
            assert.equal(resumirSetores([], setores).restrito, false);
            assert.equal(resumirSetores(['2'], setores).texto, 'UTI');
            assert.equal(resumirSetores([1, 2, 3], setores).texto, 'Recepcao, UTI +1');
            assert.equal(resumirSetores([1, 2, 3], setores).completo, 'Recepcao, UTI, Raio-X');
            assert.equal(resumirSetores(['99'], setores).texto, 'setor removido');
        }
    },
    {
        name: 'tela de usuarios: ultimo acesso em texto relativo, com a data no titulo',
        run() {
            const agora = new Date('2026-10-23T12:00:00');
            const antes = (ms) => new Date(agora.getTime() - ms).toISOString();

            assert.equal(formatarUltimoAcesso(null, agora).texto, 'Nunca entrou');
            assert.equal(formatarUltimoAcesso('lixo', agora).texto, '—');
            assert.equal(formatarUltimoAcesso(antes(10 * 1000), agora).texto, 'Agora ha pouco');
            assert.equal(formatarUltimoAcesso(antes(60 * 1000), agora).texto, 'Ha 1 minuto');
            assert.equal(formatarUltimoAcesso(antes(3 * 3600 * 1000), agora).texto, 'Ha 3 horas');
            assert.equal(formatarUltimoAcesso(antes(30 * 3600 * 1000), agora).texto, 'Ontem');
            assert.equal(formatarUltimoAcesso(antes(5 * 86400 * 1000), agora).texto, 'Ha 5 dias');
            assert.match(formatarUltimoAcesso(antes(3600 * 1000), agora).titulo, /23\/10\/2026/);
        }
    },
    {
        name: 'tela de usuarios: inicial do avatar e requisitos de senha ao vivo',
        run() {
            assert.equal(inicialDoNome('ana'), 'A');
            assert.equal(inicialDoNome('  élio'), 'É');
            assert.equal(inicialDoNome(''), '?');

            assert.deepEqual(requisitosSenha('curta', 'ana').map((r) => r.ok), [false, false, true]);
            assert.deepEqual(requisitosSenha('Plantao!2026', 'ana').map((r) => r.ok), [true, true, true]);
            assert.deepEqual(requisitosSenha('fernando!2026', 'Fernando').map((r) => r.ok), [true, true, false]);
        }
    }
];

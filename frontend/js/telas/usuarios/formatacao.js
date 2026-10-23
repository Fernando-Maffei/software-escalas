// Regras puras da tela de Usuarios: textos de data, resumo de setores, busca
// e contagens. Sem DOM, para os testes no Node importarem direto.

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

function dataHoraCompleta(data) {
    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// "ha 5 minutos", "ontem", "ha 12 dias"... com a data completa no titulo.
export function formatarUltimoAcesso(valor, agora = new Date()) {
    if (!valor) {
        return { texto: 'Nunca entrou', titulo: 'Esta conta ainda nao fez login' };
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        return { texto: '—', titulo: '' };
    }

    const titulo = dataHoraCompleta(data);
    const passado = agora.getTime() - data.getTime();

    if (passado < MINUTO) {
        return { texto: 'Agora ha pouco', titulo };
    }

    if (passado < HORA) {
        const minutos = Math.floor(passado / MINUTO);
        return { texto: `Ha ${minutos} minuto${minutos === 1 ? '' : 's'}`, titulo };
    }

    if (passado < DIA) {
        const horas = Math.floor(passado / HORA);
        return { texto: `Ha ${horas} hora${horas === 1 ? '' : 's'}`, titulo };
    }

    const dias = Math.floor(passado / DIA);

    if (dias === 1) {
        return { texto: 'Ontem', titulo };
    }

    if (dias < 30) {
        return { texto: `Ha ${dias} dias`, titulo };
    }

    return { texto: data.toLocaleDateString('pt-BR'), titulo };
}

export function formatarData(valor) {
    const data = valor ? new Date(valor) : null;
    return data && !Number.isNaN(data.getTime()) ? data.toLocaleDateString('pt-BR') : '—';
}

// Setores no formato da API (/api/setores devolve Id/Nome ou id/nome).
export function normalizarSetores(lista) {
    return (Array.isArray(lista) ? lista : [])
        .map((setor) => ({ id: String(setor?.id ?? setor?.Id ?? ''), nome: String(setor?.nome ?? setor?.Nome ?? '') }))
        .filter((setor) => setor.id);
}

// Texto curto dos setores permitidos de uma conta. Id que nao existe mais
// entre os setores aparece como "setor removido": a conta continua presa a
// ele no backend, e o admin precisa ver isso para corrigir.
export function resumirSetores(permitidos, setores, maximo = 2) {
    const ids = (permitidos || []).map(String);

    if (!ids.length) {
        return { restrito: false, texto: 'Todos os setores', completo: 'Sem restricao: ve todos os setores' };
    }

    const porId = new Map(setores.map((setor) => [setor.id, setor.nome]));
    const nomes = ids.map((id) => porId.get(id) || 'setor removido');
    const visiveis = nomes.slice(0, maximo).join(', ');
    const resto = nomes.length - maximo;

    return {
        restrito: true,
        texto: resto > 0 ? `${visiveis} +${resto}` : visiveis,
        completo: nomes.join(', ')
    };
}

function semAcento(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const FILTROS = Object.freeze({
    todos: () => true,
    ativos: (usuario) => usuario.ativo,
    inativos: (usuario) => !usuario.ativo,
    admins: (usuario) => usuario.isAdmin
});

export function filtrarUsuarios(usuarios, { busca = '', filtro = 'todos' } = {}) {
    const termo = semAcento(busca).trim();
    const passaFiltro = FILTROS[filtro] || FILTROS.todos;

    return usuarios.filter((usuario) => passaFiltro(usuario) && (!termo || semAcento(usuario.username).includes(termo)));
}

export function contarUsuarios(usuarios) {
    return {
        todos: usuarios.length,
        ativos: usuarios.filter(FILTROS.ativos).length,
        inativos: usuarios.filter(FILTROS.inativos).length,
        admins: usuarios.filter(FILTROS.admins).length
    };
}

export function inicialDoNome(username) {
    const primeiro = Array.from(String(username || '').trim())[0];
    return primeiro ? primeiro.toUpperCase() : '?';
}

// Espelho das regras de backend/auth/regras-conta.js, so para a dica ao vivo
// enquanto se digita. Quem decide e o backend.
export function requisitosSenha(senha, username = '') {
    const valor = String(senha || '');
    const nome = String(username || '').trim().toLowerCase();

    return [
        { ok: valor.length >= 8, texto: 'Pelo menos 8 caracteres' },
        { ok: /\p{L}/u.test(valor) && /[^\p{L}\s]/u.test(valor), texto: 'Letras e tambem numeros ou simbolos' },
        { ok: !(nome.length >= 3 && valor.toLowerCase().includes(nome)), texto: 'Sem o nome de usuario' }
    ];
}

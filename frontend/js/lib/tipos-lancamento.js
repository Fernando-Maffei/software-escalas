// Icone e rotulo de cada tipo de lancamento, num lugar so. Lancamentos,
// calendario, legenda do mes, relatorio mensal, Escala do Dia e Dashboard
// usam este mapa: antes cada tela tinha o seu (folga era xicara, folha ou a
// florzinha de emoji, conforme a tela).
//
// Icones do Font Awesome, a biblioteca que o resto do sistema ja usa.
const TIPOS_LANCAMENTO = {
    folga: { icone: 'fa-mug-hot', texto: 'Folga' },
    ferias: { icone: 'fa-umbrella-beach', texto: 'Ferias' },
    ausencia: { icone: 'fa-calendar-xmark', texto: 'Ausencia' },
    feriado: { icone: 'fa-calendar-day', texto: 'Feriado' },
    plantao: { icone: 'fa-clock', texto: 'Plantao' }
};

const TIPO_DESCONHECIDO = { icone: 'fa-calendar', texto: 'Lancamento' };

export function metaTipoLancamento(tipo) {
    return TIPOS_LANCAMENTO[String(tipo || '').toLowerCase()] || TIPO_DESCONHECIDO;
}

// `<i>` pronto para entrar em template. Decorativo: o texto ao lado (ou o
// title da etiqueta) e quem diz o tipo para leitor de tela.
export function iconeTipoLancamento(tipo) {
    return `<i class="fas ${metaTipoLancamento(tipo).icone} tipo-icone" aria-hidden="true"></i>`;
}

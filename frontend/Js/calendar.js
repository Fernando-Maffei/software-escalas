let mesAtual;
let anoAtual;
let feriados = [];

// Inicializar com a data atual
const dataAtual = new Date();
mesAtual = dataAtual.getMonth();
anoAtual = dataAtual.getFullYear();

// EXPOR PARA O ESCOPO GLOBAL
window.mesAtual = mesAtual;
window.anoAtual = anoAtual;
window.gerarCalendario = gerarCalendario;
window.inicializarCalendario = inicializarCalendario;

async function carregarFeriados(ano) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    feriados = await response.json();
    console.log(`Feriados da API carregados para ${ano}:`, feriados.length);
  } catch (erro) {
    console.error("Erro ao carregar feriados da API:", erro);
    feriados = [];
  }
}

/* ================================
  CALENDÁRIO MENSAL
================================ */
function gerarCalendario(mes, ano) {
  const calendar = document.getElementById("calendar");
  if (!calendar) {
    console.error("Elemento calendar não encontrado!");
    return;
  }
  
  calendar.innerHTML = "";

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);

  const diasNoMes = ultimoDia.getDate();
  const diaSemanaInicio = primeiroDia.getDay();

  const monthTitle = document.getElementById("monthTitle");
  if (monthTitle) {
    monthTitle.innerText = primeiroDia.toLocaleString("pt-BR", { 
      month: "long", 
      year: "numeric" 
    }).replace(/^\w/, c => c.toUpperCase());
    
    monthTitle.style.cursor = 'pointer';
    monthTitle.title = 'Clique para navegar entre meses';
    
    const newMonthTitle = monthTitle.cloneNode(true);
    monthTitle.parentNode.replaceChild(newMonthTitle, monthTitle);
    
    newMonthTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof abrirSeletorMes === 'function') {
        abrirSeletorMes();
      }
    });
  }

  // Dias vazios do mês anterior
  for (let i = 0; i < diaSemanaInicio; i++) {
    const vazio = document.createElement("div");
    vazio.className = "empty-day";
    calendar.appendChild(vazio);
  }

  // Dias do mês atual
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const cell = document.createElement("div");
    cell.classList.add("day");

    const hoje = new Date();
    if (
      dia === hoje.getDate() &&
      mes === hoje.getMonth() &&
      ano === hoje.getFullYear()
    ) {
      cell.classList.add("today");
    }

    const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    cell.innerHTML = `<strong>${dia}</strong>`;

    // ===== FERIADOS DA API =====
    if (feriados && feriados.length > 0) {
      const feriadoDoDia = feriados.find(f => f.date === dataISO);
      if (feriadoDoDia) {
        cell.classList.add("holiday");
        const tagFeriado = document.createElement("div");
        tagFeriado.className = "holiday-tag federal";
        tagFeriado.innerHTML = `🇧🇷 ${feriadoDoDia.name}`;
        cell.appendChild(tagFeriado);
      }
    }

    // ===== FERIADOS LOCAIS =====
    if (window.feriadosLocais && window.feriadosLocais.length > 0) {
      // 🔥 CORREÇÃO: Comparar strings diretamente, sem usar new Date()
      const feriadoLocal = window.feriadosLocais.find(f => {
        if (!f.Data) return false;
        
        // Extrair a data como string (YYYY-MM-DD)
        let dataFeriadoStr = f.Data;
        if (dataFeriadoStr.includes('T')) {
          dataFeriadoStr = dataFeriadoStr.split('T')[0];
        }
        
        // Comparar strings diretamente
        return dataFeriadoStr === dataISO;
      });
      
      if (feriadoLocal) {
        cell.classList.add("holiday");
        const tagFeriado = document.createElement("div");
        tagFeriado.className = `holiday-tag ${feriadoLocal.Tipo || 'municipal'}`;
        
        const icone = feriadoLocal.Tipo === 'estadual' ? '🏛️' : '🏛️';
        tagFeriado.innerHTML = `${icone} ${feriadoLocal.Nome}`;
        cell.appendChild(tagFeriado);
      }
    }

    // ===== AUSÊNCIAS =====
    if (window.ausencias && window.ausencias.length > 0 && 
        window.colaboradores && window.colaboradores.length > 0) {
      
      const dataAlvo = new Date(ano, mes, dia);
      dataAlvo.setHours(0, 0, 0, 0);
      
      const ausenciasDoDia = window.ausencias.filter(a => {
          const dataInicioStr = (a.DataInicio || a.dataInicio || '').split('T')[0];
          const dataFimStr = (a.DataFim || a.dataFim || '').split('T')[0];
          
          if (!dataInicioStr || !dataFimStr) return false;
          
          // Comparar strings (YYYY-MM-DD) - isso ignora timezone
          return dataISO >= dataInicioStr && dataISO <= dataFimStr;
      });

      const colaboradoresUnicos = new Map();
      
      ausenciasDoDia.forEach(a => {
          const colaboradorId = a.colaboradorId || a.ColaboradorId;
          const colaborador = window.colaboradores?.find(c => c.Id === colaboradorId);
          const nome = colaborador?.Nome || "Desconhecido";
          const tipo = (a.tipo || a.Tipo || '').toLowerCase();
          
          if (!colaboradoresUnicos.has(nome)) {
              colaboradoresUnicos.set(nome, { nome, tipo });
          }
      });

      colaboradoresUnicos.forEach((info, nome) => {
          const tag = document.createElement("div");
          tag.className = `ausencia-tag ${info.tipo}`;
          
          let icone = '📅';
          if (info.tipo === 'folga') icone = '🌸';
          else if (info.tipo === 'ferias') icone = '🏖️';
          else if (info.tipo === 'ausencia') icone = '⚠️';
          
          tag.innerHTML = `${icone} ${nome}`;
          cell.appendChild(tag);
      });
    }

    // Evento de clique
    cell.addEventListener("click", (e) => {
    e.stopPropagation();
    
    // Verifica se é um feriado
    const temFeriado = cell.classList.contains('holiday');
    
    if (temFeriado && typeof window.abrirModalLancamento === 'function') {
        // Abre diretamente o modal na aba de feriados com a data selecionada
        // E PASSA true para filtrar APENAS este dia
        window.abrirModalLancamento('feriados', dataISO, true);
    } else if (typeof window.abrirModalLancamento === 'function') {
        // Abre na aba pessoal para os outros dias
        // E PASSA true para filtrar APENAS este dia
        window.abrirModalLancamento('pessoal', dataISO, true);
    } else if (typeof window.abrirModalAusencia === 'function') {
        // Fallback para funções antigas
        window.abrirModalAusencia(dataISO);
    }
    });

    calendar.appendChild(cell);
  }
  
  console.log(`Calendário gerado para ${mes+1}/${ano}`);
}

/* ================================
   DIAS DA SEMANA
================================ */
function gerarDiasSemana() {
  const container = document.querySelector(".weekdays");
  if (!container) return;

  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  container.innerHTML = "";

  dias.forEach(dia => {
    const div = document.createElement("div");
    div.classList.add("weekday");
    div.textContent = dia;
    container.appendChild(div);
  });
}

/* ================================
   INICIALIZAÇÃO
================================ */
async function inicializarCalendario() {
  console.log("Inicializando calendário...");
  
  const dataAtual = new Date();
  
  if (mesAtual === undefined || anoAtual === undefined) {
    mesAtual = dataAtual.getMonth();
    anoAtual = dataAtual.getFullYear();
  }

  await carregarFeriados(anoAtual);
  
  console.log("Feriados locais disponíveis:", window.feriadosLocais?.length || 0);

  gerarDiasSemana();
  gerarCalendario(mesAtual, anoAtual);
  configurarNavegacaoCalendario();
}

function configurarNavegacaoCalendario() {
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  
  if (prevBtn) {
    const newPrevBtn = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    
    newPrevBtn.addEventListener("click", async () => {
      console.log("Mês anterior");
      mesAtual--;
      if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
      }
      await carregarFeriados(anoAtual);
      gerarCalendario(mesAtual, anoAtual);
    });
  }

  if (nextBtn) {
    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    newNextBtn.addEventListener("click", async () => {
      console.log("Próximo mês");
      mesAtual++;
      if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
      }
      await carregarFeriados(anoAtual);
      gerarCalendario(mesAtual, anoAtual);
    });
  }
}

// No final do arquivo calendar.js, adicione:
window.mesAtual = mesAtual;
window.anoAtual = anoAtual;

// calendar.js - Função configurarNavegacaoCalendario (substitua pela versão abaixo)

function configurarNavegacaoCalendario() {
    const prevBtn = document.getElementById("prevMonth");
    const nextBtn = document.getElementById("nextMonth");
    
    if (prevBtn) {
        // Remover eventos antigos para evitar duplicação
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        
        newPrevBtn.addEventListener("click", async () => {
            console.log("📅 Mês anterior");
            mesAtual--;
            if (mesAtual < 0) {
                mesAtual = 11;
                anoAtual--;
            }
            
            // ATUALIZAR VARIÁVEIS GLOBAIS
            window.mesAtual = mesAtual;
            window.anoAtual = anoAtual;
            
            console.log(`📅 Mês alterado para: ${mesAtual + 1}/${anoAtual}`);
            
            await carregarFeriados(anoAtual);
            gerarCalendario(mesAtual, anoAtual);
            
            // Se o modal de lançamentos estiver aberto, recarregar as listagens
            const modalLancamento = document.getElementById("modalLancamento");
            if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
                console.log("🔄 Modal aberto, recarregando listagens...");
                if (typeof carregarListagens === 'function') {
                    await carregarListagens();
                }
            }
        });
    }

    if (nextBtn) {
        // Remover eventos antigos para evitar duplicação
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        
        newNextBtn.addEventListener("click", async () => {
            console.log("📅 Próximo mês");
            mesAtual++;
            if (mesAtual > 11) {
                mesAtual = 0;
                anoAtual++;
            }
            
            // ATUALIZAR VARIÁVEIS GLOBAIS
            window.mesAtual = mesAtual;
            window.anoAtual = anoAtual;
            
            console.log(`📅 Mês alterado para: ${mesAtual + 1}/${anoAtual}`);
            
            await carregarFeriados(anoAtual);
            gerarCalendario(mesAtual, anoAtual);
            
            // Se o modal de lançamentos estiver aberto, recarregar as listagens
            const modalLancamento = document.getElementById("modalLancamento");
            if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
                console.log("🔄 Modal aberto, recarregando listagens...");
                if (typeof carregarListagens === 'function') {
                    await carregarListagens();
                }
            }
        });
    }
}
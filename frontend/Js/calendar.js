let mesAtual;
let anoAtual;
let feriados = [];


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
  const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo

  const monthTitle = document.getElementById("monthTitle");
  if (monthTitle) {
    monthTitle.innerText = primeiroDia.toLocaleString("pt-BR", { 
      month: "long", 
      year: "numeric" 
    }).replace(/^\w/, c => c.toUpperCase());
    
    monthTitle.style.cursor = 'pointer';
    monthTitle.title = 'Clique para navegar entre meses';
    
    // Remove evento antigo para não duplicar
    const newMonthTitle = monthTitle.cloneNode(true);
    monthTitle.parentNode.replaceChild(newMonthTitle, monthTitle);
    
    newMonthTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof abrirSeletorMes === 'function') {
        abrirSeletorMes();
      } else {
        console.warn("Função abrirSeletorMes não encontrada");
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

    // Criar data no formato ISO
    const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    cell.innerHTML = `<strong>${dia}</strong>`;

    // ===== FERIADOS =====
    // Verifica feriados da API (nacionais)
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

    // 🔥 CORREÇÃO: Usar window.feriadosLocais em vez de feriadosLocais
    if (window.feriadosLocais && window.feriadosLocais.length > 0) {
      const feriadoLocal = window.feriadosLocais.find(f => {
        if (!f.Data) return false;
        // Converte a data do banco para string ISO
        const dataFeriado = new Date(f.Data);
        const dataFeriadoStr = `${dataFeriado.getFullYear()}-${String(dataFeriado.getMonth() + 1).padStart(2, '0')}-${String(dataFeriado.getDate()).padStart(2, '0')}`;
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
          const dataInicioStr = a.DataInicio || a.dataInicio;
          const dataFimStr = a.DataFim || a.dataFim;
          
          if (!dataInicioStr || !dataFimStr) return false;
          
          const dataInicio = new Date(dataInicioStr.split('T')[0] + 'T00:00:00');
          const dataFim = new Date(dataFimStr.split('T')[0] + 'T00:00:00');
          
          dataInicio.setHours(0, 0, 0, 0);
          dataFim.setHours(0, 0, 0, 0);
          
          return dataAlvo >= dataInicio && dataAlvo <= dataFim;
      });

      // Agrupa por colaborador para não repetir nomes
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

    // Adiciona evento de clique para abrir o modal
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.abrirModalAusencia === 'function') {
        window.abrirModalAusencia(dataISO);
      } else {
        console.warn("Função abrirModalAusencia não encontrada");
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

  // Carregar feriados da API
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

let mesAtual;
let anoAtual;
let feriados = [];

async function carregarFeriados(ano) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    feriados = await response.json();
  } catch (erro) {
    console.error("Erro ao carregar feriados:", erro);
    feriados = [];
  }
}

/* ================================
  CALENDÁRIO MENSAL
================================ */
function gerarCalendario(mes, ano) {
  const calendar = document.getElementById("calendar");
  if (!calendar) return;
  
  calendar.innerHTML = "";

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);

  const diasNoMes = ultimoDia.getDate();
  const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo, 1 = Segunda, etc.

  const monthTitle = document.getElementById("monthTitle");
  if (monthTitle) {
    monthTitle.innerText = primeiroDia.toLocaleString("pt-BR", { 
      month: "long", 
      year: "numeric" 
    }).replace(/^\w/, c => c.toUpperCase());
    
    // 🔥 Adiciona evento de clique no título
    monthTitle.style.cursor = 'pointer';
    monthTitle.title = 'Clique para navegar entre meses';
    
    // Remove evento antigo para não duplicar
    const newMonthTitle = monthTitle.cloneNode(true);
    monthTitle.parentNode.replaceChild(newMonthTitle, monthTitle);
    
    newMonthTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirSeletorMes();
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

    // Criar data no formato ISO sem problemas de fuso
    const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    cell.innerHTML = `<strong>${dia}</strong>`;

    // Verifica feriados
    const feriadoDoDia = feriados?.find(f => f.date === dataISO);
    if (feriadoDoDia) {
      cell.classList.add("holiday");
      const tagFeriado = document.createElement("div");
      tagFeriado.className = "holiday-tag";
      tagFeriado.innerText = feriadoDoDia.name;
      cell.appendChild(tagFeriado);
    }

    // Verifica ausências do dia
    if (typeof ausencias !== 'undefined' && ausencias.length > 0 && colaboradores.length > 0) {
      // Criar data alvo para comparação
      const dataAlvo = new Date(ano, mes, dia);
      dataAlvo.setHours(0, 0, 0, 0);
      
      const ausenciasDoDia = ausencias.filter(a => {
          const dataInicioStr = a.DataInicio || a.dataInicio;
          const dataFimStr = a.DataFim || a.dataFim;
          
          if (!dataInicioStr || !dataFimStr) return false;
          
          // Extrair apenas a data
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
          const colaborador = colaboradores?.find(c => c.Id === colaboradorId);
          const nome = colaborador?.Nome || "Desconhecido";
          
          if (!colaboradoresUnicos.has(nome)) {
              colaboradoresUnicos.set(nome, a);
          }
      });

      colaboradoresUnicos.forEach((a, nome) => {
          const tag = document.createElement("div");
          tag.className = `ausencia-tag ${a.tipo || 'ausencia'}`;
          tag.innerText = nome;
          cell.appendChild(tag);
      });
    }

    // Adiciona evento de clique para abrir o modal
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof abrirModalAusencia === 'function') {
        abrirModalAusencia(dataISO);
      }
    });

    calendar.appendChild(cell);
  }
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
  
  // Se já existe um mês/ano definido, mantém, senão usa o atual
  if (mesAtual === undefined || anoAtual === undefined) {
    mesAtual = dataAtual.getMonth();
    anoAtual = dataAtual.getFullYear();
  }

  gerarDiasSemana();
  await carregarFeriados(anoAtual);
  gerarCalendario(mesAtual, anoAtual);

  // Configurar botões de navegação
  configurarNavegacaoCalendario();
}

function configurarNavegacaoCalendario() {
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  
  // Remove eventos antigos para não duplicar
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
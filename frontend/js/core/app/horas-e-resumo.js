function calcularHorasTrabalhadas(colaborador, dataSelecionada, ausenciasDoDia) {
    // Horário base do colaborador
    const trabInicio = obterHoraNumerica(colaborador.TrabalhoInicio);
    const trabFim = obterHoraNumerica(colaborador.TrabalhoFim);
    const almInicio = obterHoraNumerica(colaborador.AlmocoInicio);
    const almFim = obterHoraNumerica(colaborador.AlmocoFim);
    
    // Se não tem horário definido
    if (trabInicio === null || trabFim === null) return 0;
    
    // Duração total do expediente (em horas)
    let horasTrabalho = trabFim - trabInicio;
    
    // Subtrair almoço se existir
    if (almInicio !== null && almFim !== null) {
        horasTrabalho -= (almFim - almInicio);
    }
    
    // Verificar ausências
    if (ausenciasDoDia.length > 0) {
        const ausencia = ausenciasDoDia[0];
        const tipoAusencia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        const periodoTipo = ausencia.periodoTipo || ausencia.PeriodoTipo || 'dia_inteiro';
        
        // Ausência dia inteiro
        if (periodoTipo === 'dia_inteiro') {
            return 0;
        }
        
        // Ausência parcial (horas específicas)
        if (periodoTipo === 'horas') {
            const horaInicioAusencia = obterHoraNumerica(ausencia.horaInicio || ausencia.HoraInicio);
            const horaFimAusencia = obterHoraNumerica(ausencia.horaFim || ausencia.HoraFim);
            
            if (horaInicioAusencia !== null && horaFimAusencia !== null) {
                // Calcular interseção entre horário de trabalho e ausência
                const inicioAusencia = Math.max(trabInicio, horaInicioAusencia);
                const fimAusencia = Math.min(trabFim, horaFimAusencia);
                
                if (fimAusencia > inicioAusencia) {
                    const horasAusentes = fimAusencia - inicioAusencia;
                    
                    // Ajustar se a ausência cobre parte do almoço
                    if (almInicio !== null && almFim !== null) {
                        const inicioAlmocoAusencia = Math.max(almInicio, horaInicioAusencia);
                        const fimAlmocoAusencia = Math.min(almFim, horaFimAusencia);
                        
                        if (fimAlmocoAusencia > inicioAlmocoAusencia) {
                            // A ausência já cobre parte do almoço, não precisa subtrair novamente
                            horasTrabalho -= horasAusentes;
                        } else {
                            horasTrabalho -= horasAusentes;
                        }
                    } else {
                        horasTrabalho -= horasAusentes;
                    }
                }
            }
        }
    }
    
    // Garantir que não fique negativo
    return Math.max(0, horasTrabalho);
}

/* ===========================
   UTILITÁRIOS
=========================== */
function formatarHora(hora) {
    if (!hora) return "";

    if (hora instanceof Date && !isNaN(hora.getTime())) {
        const isTimeOnlyDate = hora.getUTCFullYear() === 1970
            && hora.getUTCMonth() === 0
            && hora.getUTCDate() === 1;
        const h = String(isTimeOnlyDate ? hora.getUTCHours() : hora.getHours()).padStart(2, "0");
        const m = String(isTimeOnlyDate ? hora.getUTCMinutes() : hora.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }

    const raw = String(hora).trim();

    if (!raw) {
        return "";
    }

    const isoMatch = raw.match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?/);
    if (isoMatch) {
        return isoMatch[1];
    }

    const timeMatch = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (timeMatch) {
        return timeMatch[1];
    }

    return "";
}

function obterHoraNumerica(hora) {
    if (!hora) return null;
    
    const horaStr = formatarHora(hora);
    if (!horaStr) return null;
    
    const partes = horaStr.split(":");
    if (partes.length < 1) return null;
    
    return parseInt(partes[0]);
}

// Função para mostrar toast
function mostrarToast(mensagem, tipo = "success") {
    console.log(`Toast: ${mensagem} (${tipo})`);
    
    // Cria o container se não existir
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    
    let icone = "fa-info-circle";
    if (tipo === "success") icone = "fa-check-circle";
    else if (tipo === "error") icone = "fa-exclamation-circle";
    else if (tipo === "warning") icone = "fa-exclamation-triangle";
    
    toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
    
    container.appendChild(toast);
    
    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => {
            if (toast.parentNode === container) {
                toast.remove();
            }
            
            // Remove container se estiver vazio
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3000);
}

// Função para debug - mostra o estado atual
function debugAusencias() {
    console.log("=== DEBUG AUSÊNCIAS ===");
    console.log("Data selecionada:", dataSelecionada);
    console.log("Todas ausências:", ausencias);
    console.log("Colaboradores:", colaboradores);
    
    if (dataSelecionada) {
        const filtradas = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            const dataAlvo = new Date(dataSelecionada);
            
            dataInicio.setHours(0,0,0,0);
            dataFim.setHours(0,0,0,0);
            dataAlvo.setHours(0,0,0,0);
            
            return dataAlvo >= dataInicio && dataAlvo <= dataFim;
        });
        console.log("Filtradas pelo dia:", filtradas);
    }
}

function gerarResumoHorarios() {
    const resumoGrid = document.getElementById('resumoGrid');
    if (!resumoGrid) return;

    if (!colaboradores || colaboradores.length === 0) {
        resumoGrid.innerHTML = '<div class="resumo-empty">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const dataObj = new Date(dataSelecionada + 'T12:00:00');

    // Cria array para contar colaboradores por hora
    const contagemPorHora = [];

    for (let hora = 7; hora <= 18; hora++) {
        contagemPorHora.push({
            hora: hora,
            trabalhando: 0,
            almoco: 0,
            folga: 0,
            ferias: 0,
            ausente: 0,
            fora: 0
        });
    }

    // Conta colaboradores em cada hora considerando ausências
    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(0, 0, 0, 0);
            const dataComp = new Date(dataSelecionada);
            dataComp.setHours(0, 0, 0, 0);
            
            return dataComp >= dataInicio && dataComp <= dataFim;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }

        for (let hora = 7; hora <= 18; hora++) {
            const index = hora - 7;
            
            // Verificar ausência dia inteiro
            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                contagemPorHora[index].ferias++;
                continue;
            }
            else if ((tipoAusenciaDia === 'folga' || tipoAusenciaDia === 'ausencia') && !horasAusencia) {
                contagemPorHora[index].folga++;
                continue;
            }
            
            // Verificar ausência parcial
            if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                contagemPorHora[index].ausente++;
                continue;
            }
            
            // Verificar horário normal
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;
            
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim && !noAlmoco;

            if (noAlmoco) {
                contagemPorHora[index].almoco++;
            } else if (noTrabalho) {
                contagemPorHora[index].trabalhando++;
            } else {
                contagemPorHora[index].fora++;
            }
        }
    });

    // Gerar o HTML do resumo
    let html = '';
    
    contagemPorHora.forEach(item => {
        const total = item.trabalhando + item.almoco + item.folga + item.ferias + item.ausente + item.fora;
        
        html += `
            <div class="resumo-card">
                <div class="resumo-hora">${item.hora}:00</div>
                <div class="resumo-barras">
                    <div class="resumo-barra-container">
                        <div class="resumo-barra trabalhando" style="width: ${(item.trabalhando / total) * 100}%" title="Trabalhando: ${item.trabalhando}"></div>
                        <div class="resumo-barra almoco" style="width: ${(item.almoco / total) * 100}%" title="Almoço: ${item.almoco}"></div>
                        <div class="resumo-barra folga" style="width: ${(item.folga / total) * 100}%" title="Folga: ${item.folga}"></div>
                        <div class="resumo-barra ferias" style="width: ${(item.ferias / total) * 100}%" title="Férias: ${item.ferias}"></div>
                        <div class="resumo-barra ausente" style="width: ${(item.ausente / total) * 100}%" title="Ausente: ${item.ausente}"></div>
                        <div class="resumo-barra fora" style="width: ${(item.fora / total) * 100}%" title="Fora: ${item.fora}"></div>
                    </div>
                </div>
                <div class="resumo-numeros">
                    <span class="resumo-num trabalhando-num" title="Trabalhando"><i class="fas fa-briefcase"></i> ${item.trabalhando}</span>
                    <span class="resumo-num almoco-num" title="Almoço"><i class="fas fa-utensils"></i> ${item.almoco}</span>
                    <span class="resumo-num folga-num" title="Folga"><i class="fas fa-leaf"></i> ${item.folga}</span>
                    <span class="resumo-num ferias-num" title="Férias"><i class="fas fa-umbrella-beach"></i> ${item.ferias}</span>
                    <span class="resumo-num ausente-num" title="Ausente"><i class="fas fa-exclamation-triangle"></i> ${item.ausente}</span>
                    <span class="resumo-num fora-num" title="Fora"><i class="fas fa-clock"></i> ${item.fora}</span>
                </div>
            </div>
        `;
    });

    resumoGrid.innerHTML = html;
}

function abrirSeletorMes() {
    // Remove seletor existente se houver
    const overlayExistente = document.querySelector('.month-selector-overlay');
    if (overlayExistente) {
        overlayExistente.remove();
    }

    // Cria o overlay
    const overlay = document.createElement('div');
    overlay.className = 'month-selector-overlay';
    
    // Lista de meses em português
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    // Gera os botões dos meses
    let mesesHTML = '';
    meses.forEach((mes, index) => {
        const activeClass = index === mesAtual ? 'active' : '';
        mesesHTML += `
            <button class="month-btn ${activeClass}" data-mes="${index}">
                ${mes.substring(0, 3)}
            </button>
        `;
    });
    
    overlay.innerHTML = `
        <div class="month-selector-modal">
            <div class="month-selector-header">
                <h3><i class="fas fa-calendar-alt"></i> Navegar</h3>
                <button class="month-selector-close" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="year-selector">
                <button class="year-btn" id="prevYearBtn">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="current-year" id="currentYearDisplay">${anoAtual}</span>
                <button class="year-btn" id="nextYearBtn">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="months-grid">
                ${mesesHTML}
            </div>
            
            <div class="month-selector-actions">
                <button class="btn-primary" id="irParaDataBtn">
                    <i class="fas fa-check"></i> Ir para
                </button>
                <button class="btn-secondary" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Configurar eventos
    const yearDisplay = document.getElementById('currentYearDisplay');
    let anoSelecionado = anoAtual;
    
    // Botão ano anterior
    document.getElementById('prevYearBtn').addEventListener('click', () => {
        anoSelecionado--;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão próximo ano
    document.getElementById('nextYearBtn').addEventListener('click', () => {
        anoSelecionado++;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão "Ir para"
    document.getElementById('irParaDataBtn').addEventListener('click', async () => {
        const mesSelecionado = document.querySelector('.month-btn.active')?.dataset.mes;
        
        if (mesSelecionado !== undefined) {
            const novoMes = parseInt(mesSelecionado);
            
            // Atualiza mês e ano
            mesAtual = novoMes;
            anoAtual = anoSelecionado;
            
            // Recarrega feriados para o novo ano
            await carregarFeriados(anoAtual);
            
            // Atualiza o calendário
            gerarCalendario(mesAtual, anoAtual);
            
            // Fecha o modal
            overlay.remove();
        }
    });
    
    // Evento para os botões de mês
    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active de todos
            document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
            // Adiciona active no clicado
            this.classList.add('active');
        });
    });
    
    // Fecha ao clicar no overlay (fora do modal)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// Tela de Usuarios (antes era uma aba dentro de Configuracoes; virou item
// proprio no menu, admin-only). O conteudo em si e montado por
// inicializarUsuariosTela() em configuracoes-usuarios.js, que popula o
// #usuariosCardConteudo. A visibilidade e navegacao ja sao filtradas por
// permissoes.js (o item some e a rota cai no calendario para nao-admin).
function renderUsuarios() {
    if (!appContent) {
        return;
    }

    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-users-cog"></i> Usuários</h1>
            <p>Contas e acessos ao sistema</p>
        </div>

        <div class="configuracoes-grid">
            <div class="config-card config-card-wide" data-config-section="usuarios">
                <div class="config-card-body" id="usuariosCardConteudo">
                    <p class="config-descricao">Carregando usuarios...</p>
                </div>
            </div>
        </div>
    `;

    if (typeof window.inicializarUsuariosTela === 'function') {
        window.inicializarUsuariosTela();
    }
}


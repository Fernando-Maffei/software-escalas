
// app.js - Função carregarAusencias (já deve estar assim, mas vamos verificar)

async function carregarAusencias() {
    try {
        console.log("📥 Carregando ausências do backend...");
        const response = await fetch('http://localhost:3000/api/ausencias');
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("📦 Dados brutos recebidos:", data);
        
        // Mapear para o formato esperado pelo frontend
        window.ausencias = data.map(a => {
            // Log para debug
            console.log(`🔍 Processando ausência ID ${a.Id}:`, {
                PeriodoTipo: a.PeriodoTipo,
                HoraInicio: a.HoraInicio
            });
            
            return {
                // Formato com maiúsculas
                Id: a.Id,
                ColaboradorId: a.ColaboradorId,
                Tipo: a.Tipo,
                DataInicio: a.DataInicio,
                DataFim: a.DataFim,
                PeriodoTipo: a.PeriodoTipo || 'dia_inteiro',
                HoraInicio: a.HoraInicio,
                HoraFim: a.HoraFim,
                DataCadastro: a.DataCadastro,
                
                // Formato com minúsculas
                id: a.Id,
                colaboradorId: a.ColaboradorId,
                tipo: a.Tipo,
                dataInicio: a.DataInicio,
                dataFim: a.DataFim,
                periodoTipo: a.PeriodoTipo || 'dia_inteiro',
                horaInicio: a.HoraInicio,
                horaFim: a.HoraFim
            };
        });
        
        console.log(`✅ Ausências carregadas e mapeadas: ${window.ausencias.length}`);
        
        // Verificar especificamente as com horas
        const comHoras = window.ausencias.filter(a => a.periodoTipo === 'horas' || a.horaInicio);
        console.log(`⏰ Ausências com horas: ${comHoras.length}`, comHoras);
        
        return window.ausencias;
        
    } catch (error) {
        console.error("❌ Erro ao carregar ausências:", error);
        window.ausencias = [];
        mostrarToast("Erro ao carregar ausências", "error");
        return [];
    }
}

/* ===========================
   TELA ESCALA DO DIA
=========================== */
function configurarSidebarEditor() {
    const sidebar = document.getElementById('sidebarEditor');
    const toggleBtn = document.getElementById('toggleEditor');
    const toggleIcon = document.getElementById('toggleIcon');

    if (!sidebar || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Muda o ícone conforme estado
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.className = 'fas fa-chevron-left';
        } else {
            toggleIcon.className = 'fas fa-chevron-right';
        }
    });
}

function gerarTimelineVisualComAusencias() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    body.innerHTML = "";

    if (!colaboradores || colaboradores.length === 0) {
        body.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const diaSemana = getDiaSemana(dataSelecionada);
    
    console.log(`📅 Gerando escala para: ${dataSelecionada} - Dia da semana: ${diaSemana} (0=Dom, 6=Sáb)`);

    // 🔥 CONDIÇÃO 1: Se for DOMINGO (diaSemana === 0)
    if (diaSemana === 0) {
        // Criar linha de mensagem
        const row = document.createElement("div");
        row.classList.add("timeline-row", "mensagem-row");
        
        // Nome da coluna
        let html = `<div class="timeline-name mensagem-nome">
            <i class="fas fa-sun"></i>
            <span>DOMINGO</span>
        </div>`;
        
        // Coluna de total vazia
        html += `<div class="timeline-cell total-cell"></div>`;
        
        // Mensagem centralizada
        html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
            <div class="mensagem-conteudo">
                <i class="fas fa-calendar-times"></i>
                <h3>Não há expediente aos domingos</h3>
                <p>Nenhum colaborador trabalha neste dia</p>
            </div>
        </div>`;
        
        row.innerHTML = html;
        body.appendChild(row);
        
        // Esconder o resumo
        const resumoContainer = document.getElementById('resumoContainer');
        if (resumoContainer) {
            resumoContainer.style.display = 'none';
        }
        
        return;
    } 

    // 🔥 CONDIÇÃO 2: Se for SÁBADO (diaSemana === 6)
    let colaboradoresFiltrados = colaboradores;
    let plantaoDoDia = null; // 🔥 DEFINIR A VARIÁVEL FORA DO IF
    
    if (diaSemana === 6) {
        plantaoDoDia = buscarPlantaoDoDia(dataSelecionada); // 🔥 AGORA É ACESSÍVEL FORA
        
        if (plantaoDoDia && plantaoDoDia.length > 0) {
            console.log("📋 Colaboradores no plantão:", plantaoDoDia);
            
            // Filtrar apenas os colaboradores que estão no plantão
            colaboradoresFiltrados = colaboradores.filter(c => 
                plantaoDoDia.includes(c.Id)
            );
            
            console.log(`✅ Mostrando apenas ${colaboradoresFiltrados.length} colaboradores do plantão`);
            
            // Se não houver colaboradores no plantão, mostrar mensagem
            if (colaboradoresFiltrados.length === 0) {
                const row = document.createElement("div");
                row.classList.add("timeline-row", "mensagem-row");
                
                let html = `<div class="timeline-name mensagem-nome">
                    <i class="fas fa-calendar-check"></i>
                    <span>PLANTÃO</span>
                </div>`;
                
                html += `<div class="timeline-cell total-cell"></div>`;
                
                html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
                    <div class="mensagem-conteudo">
                        <i class="fas fa-users-slash"></i>
                        <h3>Nenhum colaborador no plantão</h3>
                        <p>Este sábado não tem plantão lançado</p>
                    </div>
                </div>`;
                
                row.innerHTML = html;
                body.appendChild(row);
                
                adicionarLinhaTotalizador();
                gerarResumoHorarios();
                return;
            }
        } else {
            // Sábado sem plantão
            const row = document.createElement("div");
            row.classList.add("timeline-row", "mensagem-row");
            
            let html = `<div class="timeline-name mensagem-nome">
                <i class="fas fa-calendar-check"></i>
                <span>SÁBADO</span>
            </div>`;
            
            html += `<div class="timeline-cell total-cell"></div>`;
            
            html += `<div class="timeline-cell mensagem-cell" style="grid-column: span 12;">
                <div class="mensagem-conteudo">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Nenhum plantão lançado</h3>
                    <p>Este sábado não tem plantão cadastrado</p>
                </div>
            </div>`;
            
            row.innerHTML = html;
            body.appendChild(row);
            
            adicionarLinhaTotalizador();
            gerarResumoHorarios();
            return;
        }
    }

    // Usar a lista filtrada (todos os colaboradores ou apenas os do plantão)
    colaboradoresFiltrados.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicioStr = (a.DataInicio || a.dataInicio || '').split('T')[0];
            const dataFimStr = (a.DataFim || a.dataFim || '').split('T')[0];
            
            return dataSelecionada >= dataInicioStr && dataSelecionada <= dataFimStr;
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
        
        // 🔥 AGORA plantaoDoDia ESTÁ ACESSÍVEL AQUI
        const estaNoPlantao = diaSemana === 6 ? (plantaoDoDia?.includes(c.Id) || false) : false;
        
        const horasTrabalhadas = calcularHorasTrabalhadas(c, dataSelecionada, ausenciasDoDia);
        
        const horasFormatadas = horasTrabalhadas % 1 === 0 
            ? `${horasTrabalhadas}h` 
            : `${horasTrabalhadas.toFixed(1)}h`;

        const row = document.createElement("div");
        row.classList.add("timeline-row");
        
        if (diaSemana === 6 && estaNoPlantao) {
            row.classList.add("plantao-row");
        }
        
        row.setAttribute('data-colaborador-id', c.Id);

        // Nome do colaborador
        let html = `<div class="timeline-name" onclick="abrirEditorNaEscala(${c.Id})">
            <i class="fas fa-user"></i> 
            <span>${c.Nome || 'Sem nome'}</span>`;
        
        if (diaSemana === 6 && estaNoPlantao) {
            html += `<span class="plantao-badge"><i class="fas fa-calendar-check"></i> Plantão</span>`;
        }
        
        html += `<i class="fas fa-pen edit-indicator"></i>
        </div>`;

        // Coluna de total de horas
        let totalClass = 'total-cell';
        let totalTooltip = `${horasFormatadas} trabalhadas`;

        if (horasTrabalhadas === 0) {
            totalClass += ' total-zero';
            if (tipoAusenciaDia === 'ferias') totalTooltip = 'Férias - 0h';
            else if (tipoAusenciaDia === 'folga') totalTooltip = 'Folga - 0h';
            else if (tipoAusenciaDia === 'ausencia') totalTooltip = 'Ausente - 0h';
            else totalTooltip = 'Não trabalha hoje - 0h';
        } else if (horasTrabalhadas < (trabFim - trabInicio - ((almFim - almInicio) || 0))) {
            totalClass += ' total-parcial';
            totalTooltip = `Parcial: ${horasFormatadas} (esperado ${(trabFim - trabInicio - ((almFim - almInicio) || 0)).toFixed(1)}h)`;
        }

        html += `<div class="timeline-cell ${totalClass}" title="${totalTooltip}">
            <span class="total-valor">${horasFormatadas}</span>
        </div>`;

        // Gerar células para cada hora
        for (let hora = 7; hora <= 18; hora++) {
            let classe = "fora-expediente";
            let tooltip = `${hora}:00 - `;
            let status = "Fora do expediente";

            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                classe = "ferias";
                status = "Férias (dia inteiro)";
            } 
            else if (tipoAusenciaDia === 'folga' && !horasAusencia) {
                classe = "folga";
                status = "Folga (dia inteiro)";
            }
            else if (tipoAusenciaDia === 'ausencia' && !horasAusencia) {
                classe = "folga";
                status = "Ausente (dia inteiro)";
            }
            else {
                const noTrabalho = trabInicio !== null && trabFim !== null && 
                                  hora >= trabInicio && hora < trabFim;
                
                const noAlmoco = almInicio !== null && almFim !== null && 
                                hora >= almInicio && hora < almFim;

                if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                    classe = "ausencia-parcial";
                    status = `Ausente (${hora}:00-${horasAusencia.fim}:00)`;
                }
                else if (noAlmoco) {
                    classe = "almoco";
                    status = "Horário de almoço";
                }
                else if (noTrabalho) {
                    classe = "trabalhando";
                    status = "Trabalhando";
                }
            }

            tooltip += status;
            html += `<div class="timeline-cell ${classe}" title="${tooltip}"></div>`;
        }

        row.innerHTML = html;
        body.appendChild(row);
    });

    adicionarLinhaTotalizador();
    gerarResumoHorarios();
}


function adicionarLinhaTotalizador() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    // Remover linha anterior
    const linhaAnterior = document.getElementById('linha-total-timeline');
    if (linhaAnterior) linhaAnterior.remove();

    // Array para contar quantos estão trabalhando em cada hora
    const trabalhandoPorHora = [];
    for (let hora = 7; hora <= 18; hora++) {
        trabalhandoPorHora.push({
            hora: hora,
            contagem: 0
        });
    }

    // Coletar dados - contar apenas quem está trabalhando
    document.querySelectorAll('.timeline-row').forEach(row => {
        if (row.id === 'linha-total-timeline') return;
        
        const cells = row.querySelectorAll('.timeline-cell:not(.total-cell)');
        cells.forEach((cell, index) => {
            if (index < trabalhandoPorHora.length) {
                if (cell.classList.contains('trabalhando')) {
                    trabalhandoPorHora[index].contagem++;
                }
            }
        });
    });

    // Criar linha de total
    const totalRow = document.createElement("div");
    totalRow.id = 'linha-total-timeline';
    totalRow.classList.add("timeline-row", "total-row");

    // Nome da linha (ocupa primeira coluna)
    let html = `<div class="timeline-name total-nome">
        <i class="fas fa-users"></i>
        <span><strong>TRABALHANDO</strong></span>
    </div>`;

    // Coluna de total (segunda coluna) - VAZIA ou com informação
    html += `<div class="timeline-cell total-cell" title="Total de colaboradores"></div>`;

    // Colunas por hora (12 colunas)
    trabalhandoPorHora.forEach(item => {
        html += `
            <div class="timeline-cell total-cell" 
                 title="${item.hora}:00 - ${item.contagem} trabalhando"
                 onclick="mostrarDetalhesHora(${item.hora})"
                 style="cursor: pointer;">
                <span class="total-valor">${item.contagem}</span>
            </div>
        `;
    });

    totalRow.innerHTML = html;
    body.appendChild(totalRow);
}

function formatarHoraNumerica(horas) {
    if (horas === null || horas === undefined) return '';
    return `${Math.floor(horas).toString().padStart(2, '0')}:00`;
}

// app.js - Função gerarHeaderTimeline corrigida

function gerarHeaderTimeline() {
    const header = document.getElementById("timelineHeader");
    if (!header) return;

    // Limpar header
    header.innerHTML = '';
    
    // Coluna do colaborador
    header.innerHTML += '<div class="timeline-name-header">Colaborador</div>';
    
    // Coluna de total de horas
    header.innerHTML += '<div class="hora-header total-header" title="Total de horas trabalhadas no dia">Total</div>';

    // Colunas das horas
    for (let hora = 7; hora <= 18; hora++) {
        header.innerHTML += `
            <div class="hora-header">
                <span>${hora}:00</span>
            </div>
        `;
    }
    
    console.log("✅ Header da timeline gerado com coluna de total");
}

// app.js - Função para calcular horas trabalhadas no dia



function testarAtualizacao() {
    console.log("Testando atualização...");
    atualizarTudo();
}

// No app.js, adicione esta função
function atualizarCalendario() {
    if (document.getElementById("calendar")) {
        // Atualizar a variável global no calendar.js
        if (typeof window.feriadosLocais !== 'undefined') {
            window.feriadosLocais = feriadosLocais;
        }
        
        // Chamar a função de gerar calendário
        if (typeof gerarCalendario === 'function') {
            gerarCalendario(mesAtual, anoAtual);
        }
    }
}

function toggleCamposHora(select) {
    const camposHora = document.getElementById('camposHora');
    if (select.value === 'horas') {
        camposHora.classList.remove('hidden');
    } else {
        camposHora.classList.add('hidden');
    }
}


// ========== FUNÇÃO PARA CARREGAR OS FERIADOS NACIONAIS ==========
// A lista vem do servidor (que a calcula); a BrasilAPI ficou como reserva
// dentro de buscarFeriadosNacionais, em api.js.
async function carregarFeriadosAPI(ano) {
    try {
        feriadosAPI = await window.buscarFeriadosNacionais(ano);
        window.feriadosAPI = feriadosAPI; // Disponibilizar globalmente
        console.log(`✅ Feriados nacionais carregados: ${feriadosAPI.length}`);
        return feriadosAPI;
    } catch (error) {
        console.error("❌ Erro ao carregar feriados nacionais:", error);
        feriadosAPI = [];
        window.feriadosAPI = [];
        return [];
    }
}


// ================= FUNÇÃO PARA MOSTRAR DETALHES DA HORA =================
function mostrarDetalhesHora(hora) {
    console.log(`Mostrando detalhes da hora ${hora}:00`);
    
    // Coletar colaboradores que estão trabalhando nesta hora
    const colaboradoresTrabalhando = [];
    const colaboradoresAlmoco = [];
    const colaboradoresFolga = [];
    const colaboradoresFerias = [];
    const colaboradoresAusentes = [];
    
    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    
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
        
        // Verificar status do colaborador nesta hora
        if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
            colaboradoresFerias.push(c.Nome);
        }
        else if ((tipoAusenciaDia === 'folga' || tipoAusenciaDia === 'ausencia') && !horasAusencia) {
            colaboradoresFolga.push(c.Nome);
        }
        else {
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim;
            
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;

            if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                colaboradoresAusentes.push(c.Nome);
            }
            else if (noAlmoco) {
                colaboradoresAlmoco.push(c.Nome);
            }
            else if (noTrabalho) {
                colaboradoresTrabalhando.push(c.Nome);
            }
        }
    });
    
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'modal detalhes-hora-modal';
    modal.id = 'detalhesHoraModal';
    
    modal.innerHTML = `
        <div class="modal-content modal-small">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);">
                <h3 style="color: white;"><i class="fas fa-clock"></i> ${hora}:00 - Detalhamento</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()" style="color: white;">&times;</button>
            </div>
            
            <div class="modal-body" style="max-height: 500px; overflow-y: auto; padding: 20px;">
                ${colaboradoresTrabalhando.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-briefcase"></i> Trabalhando (${colaboradoresTrabalhando.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresTrabalhando.map(nome => `
                                <div style="background: var(--primary-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--primary);">
                                    <i class="fas fa-user" style="color: var(--primary); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresAlmoco.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--warning); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-utensils"></i> Almoço (${colaboradoresAlmoco.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresAlmoco.map(nome => `
                                <div style="background: var(--warning-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--warning);">
                                    <i class="fas fa-user" style="color: var(--warning); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresFolga.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: #94a3b8; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-leaf"></i> Folga (${colaboradoresFolga.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresFolga.map(nome => `
                                <div style="background: #f1f5f9; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #94a3b8;">
                                    <i class="fas fa-user" style="color: #64748b; margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresFerias.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: #0d9488; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-umbrella-beach"></i> Férias (${colaboradoresFerias.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresFerias.map(nome => `
                                <div style="background: #dbeafe; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #0d9488;">
                                    <i class="fas fa-user" style="color: #1d63ed; margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresAusentes.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--danger); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-exclamation-triangle"></i> Ausente (${colaboradoresAusentes.length})
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${colaboradoresAusentes.map(nome => `
                                <div style="background: var(--danger-soft); padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--danger);">
                                    <i class="fas fa-user" style="color: var(--danger); margin-right: 8px;"></i> ${nome}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${colaboradoresTrabalhando.length === 0 && colaboradoresAlmoco.length === 0 && 
                  colaboradoresFolga.length === 0 && colaboradoresFerias.length === 0 && 
                  colaboradoresAusentes.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--text-light);">
                        <i class="fas fa-clock" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                        <p>Nenhum colaborador com status registrado para esta hora</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="modal-actions" style="padding: 16px 20px; border-top: 1px solid var(--border);">
                <button onclick="this.closest('.modal').remove()" class="btn-primary" style="width: 100%;">
                    <i class="fas fa-check"></i> Fechar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Mostrar modal
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}


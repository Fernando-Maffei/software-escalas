// frontend/js/api-novo.js
const API = {
    // baseURL não precisa mais
    
    // ===== COLABORADORES =====
    async getColaboradores() {
        const { data, error } = await supabaseClient
            .from('colaboradores')
            .select('*')
            .order('nome')
        
        if (error) throw error
        return data
    },
    
    async salvarColaborador(data) {
        if (data.id) {
            // Atualizar
            const { data: result, error } = await supabaseClient
                .from('colaboradores')
                .update({
                    nome: data.nome,
                    trabalho_inicio: data.trabalhoInicio,
                    trabalho_fim: data.trabalhoFim,
                    almoco_inicio: data.almocoInicio,
                    almoco_fim: data.almocoFim
                })
                .eq('id', data.id)
                .select()
            
            if (error) throw error
            return result[0]
        } else {
            // Criar novo
            const { data: result, error } = await supabaseClient
                .from('colaboradores')
                .insert([{
                    nome: data.nome,
                    trabalho_inicio: data.trabalhoInicio,
                    trabalho_fim: data.trabalhoFim,
                    almoco_inicio: data.almocoInicio,
                    almoco_fim: data.almocoFim
                }])
                .select()
            
            if (error) throw error
            return result[0]
        }
    },
    
    async excluirColaborador(id) {
        const { error } = await supabaseClient
            .from('colaboradores')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        return true
    },
    
    // ===== AUSÊNCIAS =====
    async getAusencias() {
        const { data, error } = await supabaseClient
            .from('ausencias')
            .select(`
                *,
                colaboradores (
                    id,
                    nome
                )
            `)
            .order('data_inicio', { ascending: false })
        
        if (error) throw error
        
        // Mapear para o formato esperado pelo app.js
        return data.map(a => ({
            Id: a.id,
            ColaboradorId: a.colaborador_id,
            Tipo: a.tipo,
            DataInicio: a.data_inicio,
            DataFim: a.data_fim,
            PeriodoTipo: a.periodo_tipo,
            HoraInicio: a.hora_inicio,
            HoraFim: a.hora_fim,
            // Manter formato antigo para compatibilidade
            id: a.id,
            colaboradorId: a.colaborador_id,
            tipo: a.tipo,
            dataInicio: a.data_inicio,
            dataFim: a.data_fim,
            periodoTipo: a.periodo_tipo,
            horaInicio: a.hora_inicio,
            horaFim: a.hora_fim
        }))
    },
    
    async salvarAusencia(data) {
        const dadosFormatados = {
            colaborador_id: data.colaboradorId || data.colaborador_id,
            tipo: data.tipo,
            data_inicio: data.dataInicio,
            data_fim: data.dataFim,
            periodo_tipo: data.periodoTipo || 'dia_inteiro',
            hora_inicio: data.horaInicio || null,
            hora_fim: data.horaFim || null
        }
        
        if (data.id) {
            // Atualizar
            const { data: result, error } = await supabaseClient
                .from('ausencias')
                .update(dadosFormatados)
                .eq('id', data.id)
                .select()
            
            if (error) throw error
            return result[0]
        } else {
            // Criar novo
            const { data: result, error } = await supabaseClient
                .from('ausencias')
                .insert([dadosFormatados])
                .select()
            
            if (error) throw error
            return result[0]
        }
    },
    
    async excluirAusencia(id) {
        const { error } = await supabaseClient
            .from('ausencias')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        return true
    },
    
    // ===== FERIADOS =====
    async getFeriados() {
        const { data, error } = await supabaseClient
            .from('feriados')
            .select('*')
            .order('data')
        
        if (error) throw error
        
        // Mapear para formato esperado
        return data.map(f => ({
            Id: f.id,
            Nome: f.nome,
            Data: f.data,
            Tipo: f.tipo,
            id: f.id,
            nome: f.nome,
            data: f.data,
            tipo: f.tipo
        }))
    },
    
    async salvarFeriado(data) {
        const dadosFormatados = {
            nome: data.nome || data.Nome,
            data: data.data || data.Data,
            tipo: data.tipo || data.Tipo || 'municipal'
        }
        
        if (data.id || data.Id) {
            const id = data.id || data.Id
            const { data: result, error } = await supabaseClient
                .from('feriados')
                .update(dadosFormatados)
                .eq('id', id)
                .select()
            
            if (error) throw error
            return result[0]
        } else {
            const { data: result, error } = await supabaseClient
                .from('feriados')
                .insert([dadosFormatados])
                .select()
            
            if (error) throw error
            return result[0]
        }
    },
    
    async excluirFeriado(id) {
        const { error } = await supabaseClient
            .from('feriados')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        return true
    },
    
    // ===== PLANTÕES =====
    async getPlantoes() {
        const { data: plantoes, error } = await supabaseClient
            .from('plantoes')
            .select(`
                *,
                plantao_colaboradores (
                    colaborador_id
                )
            `)
            .order('data_plantao', { ascending: false })
        
        if (error) throw error
        
        return plantoes.map(p => ({
            id: p.id,
            dataISO: p.data_plantao,
            colaboradores: p.plantao_colaboradores.map(pc => pc.colaborador_id)
        }))
    },
    
    async salvarPlantao(data) {
        // Verificar se já existe plantão para esta data
        const { data: existente } = await supabaseClient
            .from('plantoes')
            .select('id')
            .eq('data_plantao', data.dataISO)
            .maybeSingle()
        
        if (existente) {
            // Atualizar existente
            await supabaseClient
                .from('plantao_colaboradores')
                .delete()
                .eq('plantao_id', existente.id)
            
            if (data.colaboradores.length > 0) {
                const insercoes = data.colaboradores.map(colabId => ({
                    plantao_id: existente.id,
                    colaborador_id: colabId
                }))
                
                await supabaseClient
                    .from('plantao_colaboradores')
                    .insert(insercoes)
            }
            
            return { id: existente.id, dataISO: data.dataISO }
        } else {
            // Criar novo plantão
            const { data: novoPlantao, error } = await supabaseClient
                .from('plantoes')
                .insert([{ data_plantao: data.dataISO }])
                .select()
            
            if (error) throw error
            
            if (data.colaboradores.length > 0) {
                const insercoes = data.colaboradores.map(colabId => ({
                    plantao_id: novoPlantao[0].id,
                    colaborador_id: colabId
                }))
                
                await supabaseClient
                    .from('plantao_colaboradores')
                    .insert(insercoes)
            }
            
            return { id: novoPlantao[0].id, dataISO: data.dataISO }
        }
    },
    
    async excluirPlantao(dataISO) {
        const { data: plantao } = await supabaseClient
            .from('plantoes')
            .select('id')
            .eq('data_plantao', dataISO)
            .maybeSingle()
        
        if (plantao) {
            await supabaseClient
                .from('plantoes')
                .delete()
                .eq('id', plantao.id)
        }
        
        return true
    }
}

window.API = API
console.log('✅ Nova API carregada (Supabase)')
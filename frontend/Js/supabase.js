// js/supabase.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://seu-projeto.supabase.co'
const supabaseKey = 'sb_publishable_f65yJGD8TvqpUpNKAanyog_oZSgd...' // SUA CHAVE PUBLISHABLE

export const supabase = createClient(supabaseUrl, supabaseKey)

// ================= COLABORADORES =================
export async function getColaboradores() {
    const { data, error } = await supabase
        .from('colaboradores')
        .select('*')
        .order('nome')
    
    if (error) throw error
    return data
}

export async function salvarColaborador(colaborador) {
    if (colaborador.id) {
        const { data, error } = await supabase
            .from('colaboradores')
            .update({
                nome: colaborador.nome,
                trabalho_inicio: colaborador.trabalhoInicio,
                trabalho_fim: colaborador.trabalhoFim,
                almoco_inicio: colaborador.almocoInicio,
                almoco_fim: colaborador.almocoFim
            })
            .eq('id', colaborador.id)
            .select()
        
        if (error) throw error
        return data[0]
    } else {
        const { data, error } = await supabase
            .from('colaboradores')
            .insert([{
                nome: colaborador.nome,
                trabalho_inicio: colaborador.trabalhoInicio,
                trabalho_fim: colaborador.trabalhoFim,
                almoco_inicio: colaborador.almocoInicio,
                almoco_fim: colaborador.almocoFim
            }])
            .select()
        
        if (error) throw error
        return data[0]
    }
}

export async function excluirColaborador(id) {
    const { error } = await supabase
        .from('colaboradores')
        .delete()
        .eq('id', id)
    
    if (error) throw error
    return true
}

// ================= AUSÊNCIAS =================
export async function getAusencias() {
    const { data, error } = await supabase
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
    return data
}

export async function salvarAusencia(ausencia) {
    const dadosFormatados = {
        colaborador_id: ausencia.colaboradorId,
        tipo: ausencia.tipo,
        data_inicio: ausencia.dataInicio,
        data_fim: ausencia.dataFim,
        periodo_tipo: ausencia.periodoTipo || 'dia_inteiro',
        hora_inicio: ausencia.horaInicio || null,
        hora_fim: ausencia.horaFim || null
    }
    
    if (ausencia.id) {
        const { data, error } = await supabase
            .from('ausencias')
            .update(dadosFormatados)
            .eq('id', ausencia.id)
            .select()
        
        if (error) throw error
        return data[0]
    } else {
        const { data, error } = await supabase
            .from('ausencias')
            .insert([dadosFormatados])
            .select()
        
        if (error) throw error
        return data[0]
    }
}

export async function excluirAusencia(id) {
    const { error } = await supabase
        .from('ausencias')
        .delete()
        .eq('id', id)
    
    if (error) throw error
    return true
}

// ================= FERIADOS =================
export async function getFeriados() {
    const { data, error } = await supabase
        .from('feriados')
        .select('*')
        .order('data')
    
    if (error) throw error
    return data
}

export async function salvarFeriado(feriado) {
    const dadosFormatados = {
        nome: feriado.nome || feriado.Nome,
        data: feriado.data || feriado.Data,
        tipo: feriado.tipo || feriado.Tipo || 'municipal'
    }
    
    if (feriado.id || feriado.Id) {
        const id = feriado.id || feriado.Id
        const { data, error } = await supabase
            .from('feriados')
            .update(dadosFormatados)
            .eq('id', id)
            .select()
        
        if (error) throw error
        return data[0]
    } else {
        const { data, error } = await supabase
            .from('feriados')
            .insert([dadosFormatados])
            .select()
        
        if (error) throw error
        return data[0]
    }
}

export async function excluirFeriado(id) {
    const { error } = await supabase
        .from('feriados')
        .delete()
        .eq('id', id)
    
    if (error) throw error
    return true
}

// ================= PLANTÕES =================
export async function getPlantoes() {
    const { data: plantoes, error } = await supabase
        .from('plantoes')
        .select(`
            *,
            plantao_colaboradores (
                colaborador_id
            )
        `)
        .order('data_plantao', { ascending: false })
    
    if (error) throw error
    
    // Formatar para o padrão esperado pelo frontend
    return plantoes.map(p => ({
        id: p.id,
        dataISO: p.data_plantao,
        colaboradores: p.plantao_colaboradores.map(pc => pc.colaborador_id)
    }))
}

export async function salvarPlantao(plantao) {
    // Verificar se já existe plantão para esta data
    const { data: existente } = await supabase
        .from('plantoes')
        .select('id')
        .eq('data_plantao', plantao.dataISO)
        .maybeSingle()
    
    if (existente) {
        // Atualizar existente
        const { error: deleteError } = await supabase
            .from('plantao_colaboradores')
            .delete()
            .eq('plantao_id', existente.id)
        
        if (deleteError) throw deleteError
        
        const insercoes = plantao.colaboradores.map(colabId => ({
            plantao_id: existente.id,
            colaborador_id: colabId
        }))
        
        if (insercoes.length > 0) {
            const { error } = await supabase
                .from('plantao_colaboradores')
                .insert(insercoes)
            
            if (error) throw error
        }
        
        return { id: existente.id, dataISO: plantao.dataISO }
    } else {
        // Criar novo
        const { data: novoPlantao, error } = await supabase
            .from('plantoes')
            .insert([{ data_plantao: plantao.dataISO }])
            .select()
        
        if (error) throw error
        
        if (plantao.colaboradores.length > 0) {
            const insercoes = plantao.colaboradores.map(colabId => ({
                plantao_id: novoPlantao[0].id,
                colaborador_id: colabId
            }))
            
            const { error: insertError } = await supabase
                .from('plantao_colaboradores')
                .insert(insercoes)
            
            if (insertError) throw insertError
        }
        
        return { id: novoPlantao[0].id, dataISO: plantao.dataISO }
    }
}

export async function excluirPlantao(dataISO) {
    const { data: plantao } = await supabase
        .from('plantoes')
        .select('id')
        .eq('data_plantao', dataISO)
        .maybeSingle()
    
    if (plantao) {
        const { error } = await supabase
            .from('plantoes')
            .delete()
            .eq('id', plantao.id)
        
        if (error) throw error
    }
    
    return true
}
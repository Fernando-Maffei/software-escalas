// frontend/Js/supabase.js
// Versão sem import/export - cria variável global

const SUPABASE_URL = 'https://seu-projeto.supabase.co' // COLOQUE SUA URL AQUI
const SUPABASE_KEY = 'sb_publishable_f65yJGD8TvqpUpNKAanyog_oZSgd...' // SUA CHAVE AQUI

// Criar cliente Supabase e disponibilizar globalmente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

console.log('✅ Supabase client inicializado globalmente')
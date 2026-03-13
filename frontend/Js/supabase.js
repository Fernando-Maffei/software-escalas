// frontend/Js/supabase.js

const SUPABASE_URL = 'https://esazzdvufhbbdxjlezfr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_f65yJGDBTvqpUpNKAanyog_oZSgdz7B'

// Criar cliente Supabase e disponibilizar globalmente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

console.log('✅ Supabase client inicializado globalmente')
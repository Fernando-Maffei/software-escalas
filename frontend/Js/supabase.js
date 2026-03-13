// frontend/Js/supabase.js

const SUPABASE_URL = 'https://esazzvdufhbbdxjlezfr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_f65yJGDBTvqpUpNKAanyog_oZSgdz7B'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

console.log('✅ Supabase client inicializado globalmente')
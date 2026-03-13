// frontend/Js/supabase.js

const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co' 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzYXp6dmR1ZmhiYmR4amxlemZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDEwNDksImV4cCI6MjA4ODk3NzA0OX0.FYGw8QOEw2ug2hTAhSn-pmIJHlbgrCcuv0bmWWkSRCU'

// Criar cliente Supabase e disponibilizar globalmente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

console.log('✅ Supabase client inicializado globalmente')
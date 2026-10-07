import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  document.body.innerHTML =
    '<p style="padding:24px;font-family:sans-serif">Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Revisa el README.</p>'
  throw new Error('Variables de entorno de Supabase no configuradas')
}

export const supabase = createClient(url, key)

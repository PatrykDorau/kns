// Funkcja serwerowa Supabase „meta”: statystyki ASB ← Facebook / Meta.
//   POST /functions/v1/meta  { city }  + Authorization: Bearer <token logowania>
// Sprawdza, czy pytający ma rangę ASB (is_asb() jego tokenem), czyta identyfikatory strony i konta reklamowego miasta
// oraz token Meta wklejony w aplikacji (zamknięta tabela asb_fb_secrets — czyta ją tylko ta funkcja, kluczem serwisowym)
// i oddaje dane z Meta. Tokenu nigdy nie odsyła. Zapisuje przeglądarka tej osoby (zwykłe reguły dostępu).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchMeta } from './logic.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Tylko POST.' }, 405)
  const auth = req.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: 'Zaloguj się.' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: ok } = await user.rpc('is_asb')
  if (ok !== true) return json({ error: 'Tylko dla ASB.' }, 403)
  const { city = 'Poznań' } = await req.json().catch(() => ({}))
  const { data: cfg } = await user.from('asb_stat_cities').select('fb_page,fb_ad_account').eq('id', city).maybeSingle()
  if (!cfg?.fb_page && !cfg?.fb_ad_account) return json({ error: 'Wpisz identyfikator strony albo konta reklamowego w Ustawieniach.', setup: true }, 400)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: sec } = await admin.from('asb_fb_secrets').select('token').eq('city', city).maybeSingle()
  if (!sec?.token) return json({ error: 'Wklej token Meta w Ustawieniach.', setup: true }, 400)
  try {
    return json(await fetchMeta(cfg, sec.token))
  } catch {
    return json({ error: 'Nie udało się połączyć z Facebookiem.' }, 502)
  }
})

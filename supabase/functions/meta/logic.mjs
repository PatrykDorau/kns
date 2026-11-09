// Pobieranie danych z Meta (Graph API) dla statystyk ASB — czysta logika bez Deno/Node, testowana w tests/test-meta.mjs.
// Używa jej funkcja serwerowa supabase/functions/meta/index.ts (token Meta czyta tylko ona, z zamkniętej tabeli).

// typy akcji Meta → cel i wynik w statystykach
const ACT = { rsvp: ['rsvp', 'event_responses', 'onsite_conversion.event_response'], msg: ['onsite_conversion.messaging_conversation_started_7d'], like: ['like', 'onsite_conversion.page_like'], eng: ['post_engagement'] }
const act = (actions, types) => { for (const t of types) { const a = (actions || []).find(x => x.action_type === t); if (a) return Math.round(Number(a.value) || 0) } return null }

// jeden wiersz insights (poziom reklamy) → wpis reklamy
export function mapInsight(r) {
  const obj = String(r.objective || '').toUpperCase(), a = r.actions || []
  const rsvp = act(a, ACT.rsvp), msg = act(a, ACT.msg), like = act(a, ACT.like), eng = act(a, ACT.eng)
  let goal = 'aktywnosc', results = eng
  if (obj.includes('EVENT') || (rsvp && !obj.includes('MESSAG'))) { goal = 'reakcje'; results = rsvp }
  else if (obj.includes('MESSAG') || (msg != null && !rsvp)) { goal = 'rozmowy'; results = msg }
  else if (obj.includes('PAGE_LIKES') || (obj.includes('ENGAGEMENT') && like && !eng)) { goal = 'polubienia'; results = like }
  else if (obj.includes('TRAFFIC') || obj.includes('AWARENESS') || obj.includes('REACH')) { goal = 'inne'; results = null }
  const n = v => (v == null || v === '' ? null : Math.round(Number(v)))
  return {
    fb_id: String(r.ad_id), name: String(r.ad_name || '').slice(0, 140), campaign: String(r.campaign_name || '').slice(0, 140),
    date: r.date_start || null, goal, spent: r.spend == null ? null : Math.round(Number(r.spend) * 100) / 100,
    impressions: n(r.impressions), reach: n(r.reach), results, link_clicks: n(r.inline_link_clicks), activity: eng,
  }
}
export function mapEvent(e) {
  return { id: String(e.id), name: String(e.name || '').slice(0, 200), start_time: e.start_time || null, place: String(e.place?.name || '').slice(0, 120), attending: e.attending_count ?? null, interested: e.interested_count ?? null }
}

// błąd Meta → zrozumiały komunikat (bez tokenu)
function metaError(body, status) {
  const e = body?.error || {}
  if (e.code === 190) return 'Token Meta wygasł albo jest nieprawidłowy — wklej nowy w Ustawieniach.'
  if (e.code === 10 || e.code === 200 || e.code === 100) return (e.message || 'Brak uprawnień') + ' (sprawdź uprawnienia tokenu i identyfikatory).'
  return e.message || 'Meta: ' + status
}
async function getJson(fetchFn, url) {
  const res = await fetchFn(url), body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(metaError(body, res.status))
  return body
}
async function getAll(fetchFn, url, max = 10) {
  const out = []
  for (let i = 0; url && i < max; i++) { const b = await getJson(fetchFn, url); out.push(...(b.data || [])); url = b.paging?.next || '' }
  return out
}

// cfg: { fb_page, fb_ad_account }; zwraca { ads, events, followers, igFollowers, warnings }
export async function fetchMeta(cfg, token, fetchFn = fetch, version = 'v23.0') {
  const G = 'https://graph.facebook.com/' + version + '/', tk = '&access_token=' + encodeURIComponent(token)
  const out = { ads: [], events: [], followers: null, igFollowers: null, warnings: [] }
  if (cfg.fb_ad_account) {
    const acct = /^act_/.test(cfg.fb_ad_account) ? cfg.fb_ad_account : 'act_' + String(cfg.fb_ad_account).replace(/\D/g, '')
    const fields = 'ad_id,ad_name,campaign_name,objective,spend,impressions,reach,inline_link_clicks,actions,date_start'
    try { out.ads = (await getAll(fetchFn, G + acct + '/insights?level=ad&date_preset=maximum&time_increment=all_days&limit=200&fields=' + fields + tk)).map(mapInsight) }
    catch (e) { out.warnings.push('Reklamy: ' + e.message) }
  }
  if (cfg.fb_page) {
    const page = encodeURIComponent(cfg.fb_page)
    try {
      const p = await getJson(fetchFn, G + page + '?fields=followers_count,fan_count,access_token,instagram_business_account{followers_count}' + tk)
      out.followers = p.followers_count ?? p.fan_count ?? null
      out.igFollowers = p.instagram_business_account?.followers_count ?? null
      const ptk = '&access_token=' + encodeURIComponent(p.access_token || token)
      try { out.events = (await getAll(fetchFn, G + page + '/events?fields=id,name,start_time,place{name},attending_count,interested_count&limit=100' + ptk, 5)).map(mapEvent) }
      catch (e) { out.warnings.push('Wydarzenia: ' + e.message) }
    } catch (e) { out.warnings.push('Strona: ' + e.message) }
  }
  return out
}

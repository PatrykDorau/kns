// Codziennie rano (Netlify Scheduled Functions): przypomnienia dla prowadzących spotkania ASB (3 dni przed) — wpis
// w dzwonku robi baza (asb_leader_reminders), a ta funkcja wysyła świeże wpisy od bazy na telefony (inbox_push_due).
// Bez tajnych kluczy: obie funkcje bazy są bezpieczne do wywołania przez każdego (nic nie dublują).
import { vapidKeys, sendPush } from './push.mjs'

export const config = { schedule: '0 7 * * *' } // 7:00 UTC = 8:00/9:00 w Polsce

const SUPABASE = { url: 'https://igkjlgdpvgdeqfqctnnf.supabase.co', key: 'sb_publishable_Ji4v_zRY2OGsMRAWwiis-g_x6WAYCPI' }
const rpc = async name => {
  const res = await fetch(SUPABASE.url + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!res.ok) throw new Error(name + ': ' + res.status + ' ' + (await res.text()))
  return res.json()
}

export default async function handler() {
  const reminders = await rpc('asb_leader_reminders')
  // cele wsparcia: w dniach 1–7 prośba o potwierdzenie poprzedniego miesiąca (raz w miesiącu)
  const pledges = await rpc('pledge_reminders').catch(e => { console.error(e.message); return 0 })
  let sent = 0
  const privateKey = process.env.VAPID_PRIVATE
  if (privateKey) {
    const keys = vapidKeys(privateKey)
    const rows = await rpc('inbox_push_due')
    await Promise.all(rows.map(async r => {
      try {
        const status = await sendPush(r.subscription, { title: String(r.title || 'KNS Nabo').slice(0, 120), body: String(r.body || '').slice(0, 300), url: String(r.url || './').slice(0, 300) }, keys)
        if (status < 300) sent++
      } catch { /* jeden telefon nie psuje reszty */ }
    }))
  }
  console.log('przypomnienia ASB:', reminders, '· cele:', pledges, '· na telefony:', sent)
  return new Response(JSON.stringify({ reminders, pledges, sent }), { headers: { 'Content-Type': 'application/json' } })
}

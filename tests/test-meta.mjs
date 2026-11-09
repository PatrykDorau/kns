// Test: pobieranie z Meta dla statystyk ASB (supabase/functions/meta/logic.mjs) — bez prawdziwych usług. node tests/test-meta.mjs
import assert from 'node:assert/strict'
import { mapInsight, mapEvent, fetchMeta } from '../supabase/functions/meta/logic.mjs'

const ev = mapInsight({ ad_id: '1', ad_name: 'Okultyzm', objective: 'OUTCOME_ENGAGEMENT', spend: '124.28', impressions: '14324', reach: '3995', inline_link_clicks: '138', date_start: '2026-10-08', actions: [{ action_type: 'rsvp', value: '47' }, { action_type: 'post_engagement', value: '141' }] })
assert.deepEqual([ev.goal, ev.results, ev.spent, ev.impressions, ev.activity, ev.date], ['reakcje', 47, 124.28, 14324, 141, '2026-10-08'])
const msg = mapInsight({ ad_id: '2', objective: 'OUTCOME_ENGAGEMENT', spend: '125.72', actions: [{ action_type: 'post_engagement', value: '1230' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '0' }] })
assert.equal(msg.goal, 'rozmowy'); assert.equal(msg.results, 0)
assert.deepEqual([mapInsight({ ad_id: '3', objective: 'POST_ENGAGEMENT', actions: [{ action_type: 'post_engagement', value: '778' }] }).goal], ['aktywnosc'])
assert.equal(mapInsight({ ad_id: '4', objective: 'PAGE_LIKES', actions: [{ action_type: 'like', value: '9' }] }).goal, 'polubienia')
assert.deepEqual(mapEvent({ id: 9, name: 'X', place: { name: 'Pireus' }, attending_count: 12, interested_count: 40 }), { id: '9', name: 'X', start_time: null, place: 'Pireus', attending: 12, interested: 40 })

const r = (b, s = 200) => new Response(JSON.stringify(b), { status: s })
const fake = async url => {
  url = String(url)
  if (url.includes('act_555/insights')) return r({ data: [{ ad_id: '1', ad_name: 'A', objective: 'OUTCOME_ENGAGEMENT', spend: '10', actions: [{ action_type: 'rsvp', value: '5' }] }], paging: { next: url.includes('after=') ? '' : url + '&after=x' } })
  if (url.includes('/123/events')) { assert.ok(url.includes('access_token=PAGETOK')); return r({ data: [{ id: 'e1', name: 'Ev', attending_count: 3 }] }) }
  if (url.includes('/123?fields')) return r({ followers_count: 321, access_token: 'PAGETOK', instagram_business_account: { followers_count: 210 } })
  throw new Error('nieoczekiwany adres')
}
const res = await fetchMeta({ fb_page: '123', fb_ad_account: '555' }, 'SECRET', fake)
assert.equal(res.ads.length, 2) // dwie strony wyników
assert.equal(res.followers, 321); assert.equal(res.igFollowers, 210); assert.equal(res.events[0].attending, 3); assert.deepEqual(res.warnings, [])
assert.ok(!JSON.stringify(res).includes('SECRET') && !JSON.stringify(res).includes('PAGETOK'), 'tokeny nie wychodzą')
// wygasły token → zrozumiała uwaga, reszta nie pada
const bad = await fetchMeta({ fb_ad_account: '555' }, 'X', async () => r({ error: { code: 190, message: 'Session has expired' } }, 400))
assert.match(bad.warnings[0], /wygasł/)
console.log('meta: OK')

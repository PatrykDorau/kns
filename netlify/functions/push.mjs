// Powiadomienia na telefon (Web Push) dla strony nabożeństw — funkcja Netlify, bez dodatkowych bibliotek.
//   GET  /api/push → { publicKey }  — klucz publiczny, którym telefon zapisuje się na powiadomienia
//   POST /api/push → wysyła powiadomienie do podanych telefonów (wywołuje skrypt przypomnienia z Google);
//                    body: { secret, title, body, url, subscriptions: [{ id, subscription }] } → { sent, gone: [id] }
// Zmienne środowiskowe w Netlify (Project configuration → Environment variables):
//   VAPID_PRIVATE — klucz prywatny (z: node skrypty/klucze-powiadomien.cjs)
//   PUSH_SECRET   — hasło, które zna tylko skrypt przypomnienia
import crypto from 'node:crypto'

export const config = { path: '/api/push' }

const b64u = buf => Buffer.from(buf).toString('base64url')
const unb64u = s => Buffer.from(String(s || ''), 'base64url')
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// Para kluczy VAPID z samego klucza prywatnego (32 bajty) — publiczny wyliczany.
export function vapidKeys(privateB64) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(unb64u(privateB64))
  const pub = ecdh.getPublicKey()
  const jwk = { kty: 'EC', crv: 'P-256', d: b64u(ecdh.getPrivateKey()), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }
  return { privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), publicRaw: pub }
}

// Nagłówek autoryzacji VAPID (RFC 8292): JWT podpisany ES256 dla serwera powiadomień przeglądarki.
export function vapidAuth(endpoint, keys, subject = 'https://kns-nabozenstwa.netlify.app') {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${b64u(keys.publicRaw)}`
}

// Szyfrowanie treści (RFC 8291, aes128gcm) — tylko ten telefon może ją odczytać.
export function encrypt(subscription, text) {
  const uaPublic = unb64u(subscription.keys.p256dh)
  const auth = unb64u(subscription.keys.auth)
  const ecdh = crypto.createECDH('prime256v1')
  const asPublic = ecdh.generateKeys()
  const shared = ecdh.computeSecret(uaPublic)
  const salt = crypto.randomBytes(16)
  const hkdf = (ikm, s, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, len))
  const ikm = hkdf(shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32)
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header.writeUInt8(asPublic.length, 20)
  return Buffer.concat([header, asPublic, body])
}

export async function sendPush(subscription, payload, keys) {
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: { TTL: String(2 * 86400), Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidAuth(subscription.endpoint, keys) },
    body: encrypt(subscription, JSON.stringify(payload)),
  })
  return res.status
}

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }

export default async function handler(req) {
  const privateKey = process.env.VAPID_PRIVATE
  if (!privateKey) return json({ error: 'Powiadomienia nie są skonfigurowane (brak VAPID_PRIVATE).' }, 503)
  const keys = vapidKeys(privateKey)
  if (req.method === 'GET') return json({ publicKey: b64u(keys.publicRaw) })
  if (req.method !== 'POST') return json({ error: 'Nieobsługiwana metoda.' }, 405)

  let data
  try { data = await req.json() } catch { return json({ error: 'Niepoprawne dane.' }, 400) }
  if (!process.env.PUSH_SECRET || !same(data.secret, process.env.PUSH_SECRET)) return json({ error: 'Brak dostępu.' }, 403)
  const payload = { title: String(data.title || 'Nabożeństwa'), body: String(data.body || ''), url: String(data.url || '/') }
  let sent = 0
  const gone = []
  await Promise.all((data.subscriptions || []).map(async ({ id, subscription }) => {
    try {
      const status = await sendPush(subscription, payload, keys)
      if (status === 404 || status === 410) gone.push(id) // telefon wypisał się albo usunął aplikację
      else if (status < 300) sent++
    } catch { /* jeden telefon nie psuje reszty */ }
  }))
  return json({ sent, gone })
}

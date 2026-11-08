// Filmy z kanału YouTube (strona „Posłuchaj” i nagranie kazania na Starcie) — bez klucza API: adres kanału (…/@nazwa,
// …/channel/UC…, sam identyfikator UC…) → identyfikator kanału → kanał RSS YouTube → ostatnie filmy.
//   GET /api/najnowsze?yt=<adres kanału> → { video, title, published, channel } — najnowszy film, który ma już
//     wyświetlenia (zaplanowana transmisja ma 0 wyświetleń i nie jest jeszcze nagraniem — pomijana, chyba że nic innego nie ma)
//   GET /api/najnowsze?yt=<adres kanału>&all=1 → { items: [{ video, title, published, views }], channel } — ostatnie filmy
//     (strona startowa szuka wśród nich nagrania konkretnej niedzieli: po temacie kazania, a potem po dacie)
// Wynik trzymany w pamięci podręcznej (CDN) przez 30 minut, więc YouTube nie jest pytany przy każdym wejściu.
export const config = { path: '/api/najnowsze' }

const json = (data, status = 200, cache = true) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': cache ? 'public, max-age=600, s-maxage=1800' : 'no-store' },
})
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'pl,en;q=0.8', Cookie: 'CONSENT=YES+1; SOCS=CAI' }

export async function channelId(url) {
  const u = String(url || '').trim()
  const m = u.match(/(?:^|channel\/)(UC[\w-]{22})(?:$|[/?])/)
  if (m) return m[1]
  if (!/^https:\/\/(www\.|m\.)?youtube\.com\/(@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+)/.test(u)) return null
  const res = await fetch(u.replace('://m.', '://www.'), { headers: UA })
  if (!res.ok) return null
  const html = await res.text()
  const found = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/)
  return found ? found[1] : null
}

const unescape = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

// wszystkie filmy z kanału RSS (od najnowszego); views — liczba wyświetleń (0 = jeszcze się nie odbył / świeżo dodany)
export function itemsFromFeed(xml) {
  return String(xml).split('<entry>').slice(1).map(entry => {
    const pick = re => (entry.match(re) || [])[1] || ''
    const video = pick(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)
    return video ? { video, title: unescape(pick(/<title>([^<]*)<\/title>/)), published: pick(/<published>([^<]*)<\/published>/), views: +pick(/<media:statistics views="(\d+)"/) || 0 } : null
  }).filter(Boolean)
}
export function latestFromFeed(xml) {
  const items = itemsFromFeed(xml)
  const it = items.find(x => x.views > 0) || items[0]
  return it ? { video: it.video, title: it.title, published: it.published } : null
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams
  try {
    const channel = await channelId(q.get('yt') || '')
    if (!channel) return json({ error: 'Nie rozpoznano kanału YouTube.' }, 404, false)
    const feed = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + channel, { headers: UA })
    if (!feed.ok) return json({ error: 'YouTube nie odpowiedział.', channel }, 502, false)
    const xml = await feed.text()
    if (q.get('all')) return json({ items: itemsFromFeed(xml), channel })
    const latest = latestFromFeed(xml)
    return latest ? json({ ...latest, channel }) : json({ error: 'Kanał nie ma jeszcze filmów.', channel }, 404, false)
  } catch {
    return json({ error: 'Nie udało się sprawdzić kanału.' }, 502, false)
  }
}

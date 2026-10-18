<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { access, copyLink, downloadQr, calendarRequest, canUse, churchAnnouncements, churchEvents, churchTypes, countdown, loadSeenAnns, markSeenAnns, nearestService, planAlert, plannerRequest, role, services, today, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'
import { videoInfo } from '../mobile/church.js'

// Strona startowa (wzór: pulpit z powitaniem, pasem kart i tygodniem): najbliższe nabożeństwo i komunikaty
// rady w pasie przewijanym w bok, pod spodem ogłoszenia (newsletter) i tydzień dzień po dniu.

const active = a => a.audience !== 'council' && (!a.until || a.until >= today())
const newest = (a, b) => (b.date || 0) - (a.date || 0)
const notices = computed(() => churchAnnouncements.value.filter(a => a.important && active(a)).sort(newest))
const pinnedFirst = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || newest(a, b)
// Start: 6 najnowszych ogłoszeń, reszta w „Wszystkie” (z liczbą i ile z nich nowych).
const newsAll = computed(() => churchAnnouncements.value.filter(a => !a.important && active(a)).sort(pinnedFirst))
const news = computed(() => newsAll.value.slice(0, 6))
const more = computed(() => { const rest = newsAll.value.slice(6); return { n: rest.length, fresh: rest.filter(isNew).length } })
// „Wszystkie”: komunikaty rady i ogłoszenia razem (jak na stronie).
const allAnns = computed(() => churchAnnouncements.value.filter(active).sort(pinnedFirst))
const listOpen = ref(false)

const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const asDate = date => new Date(date + 'T12:00')
const typeOf = id => churchTypes.value.find(t => t.id === id) || { name: 'Inne', color: '#8f98a8' }
const items = computed(() => [
  ...services.value.map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo' })),
  ...churchEvents.value.map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', title: e.title || typeOf(e.type).name })),
])
// Tydzień: dziś i 6 kolejnych dni, każdy z własną listą.
const week = computed(() => Array.from({ length: 7 }, (_, i) => {
  const date = localDate(new Date(asDate(today()).getTime() + i * 86400000))
  return { date, wd: asDate(date).toLocaleDateString('pl', { weekday: 'short' }).replace('.', ''), n: asDate(date).getDate(),
    items: items.value.filter(it => it.date === date).sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00')) }
}))
const weekRange = computed(() => {
  const f = d => asDate(d).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '')
  return f(week.value[0].date) + ' – ' + f(week.value[6].date)
})
const shortDate = t => (t ? new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '') : '')
const svc = computed(() => nearestService.value && nearestService.value.date >= today() ? nearestService.value : null)
const svcWhen = computed(() => (svc.value ? asDate(svc.value.date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + (svc.value.time || DEFAULT_TIME) : ''))
const until = computed(() => {
  const c = countdown.value
  if (!c) return ''
  if (c.live) return 'W trakcie'
  return c.days ? `za ${c.days} ${c.days === 1 ? 'dzień' : 'dni'} ${+c.hours} godz` : `za ${+c.hours} godz ${+c.minutes} min`
})
// Ogłoszenie w okienku: grafika, treść i film (wgrany gra od razu; YouTube/Vimeo — w przeglądarce).
const shown = ref(null)
// „Nowe”: ogłoszenie z ostatnich 30 dni, którego ta osoba jeszcze nie otworzyła — pamięta konto (strona, telefon
// i komputer razem); bez połączenia — ten komputer.
const seen = ref((() => { try { return JSON.parse(localStorage.getItem('kns-seen-anns') || '[]') } catch { return [] } })())
const isNew = a => !seen.value.includes(a.id) && Date.now() - (+a.date || 0) < 30 * 864e5
const newCount = computed(() => notices.value.filter(isNew).length)
const keepSeen = () => { try { localStorage.setItem('kns-seen-anns', JSON.stringify(seen.value.slice(-300))) } catch { /* bez zapisu */ } }
function openNotice(a) {
  shown.value = a
  if (seen.value.includes(a.id)) return
  seen.value = [...seen.value, a.id]
  keepSeen()
  markSeenAnns([a.id])
}
onMounted(async () => {
  const res = await loadSeenAnns()
  if (!res?.ids) return
  const local = seen.value.filter(id => !res.ids.includes(id) && churchAnnouncements.value.some(a => a.id === id))
  seen.value = [...new Set([...res.ids, ...seen.value])]
  keepSeen()
  if (local.length) markSeenAnns(local)
})
const vid = computed(() => videoInfo(shown.value?.video))
const copied = ref(false)
async function share(id) { if (await copyLink('ogloszenie', id)) { copied.value = true; setTimeout(() => { copied.value = false }, 2500) } }
function openService(id) { if (canUse('planner')) { plannerRequest.value = { id }; role.value = 'planner' } else openCalendar({ kind: 'service', id }) }
function openCalendar(req = null) { if (canUse('calendar')) { calendarRequest.value = req; role.value = 'calendar' } }
function planNew() { plannerRequest.value = { date: '' }; role.value = 'planner' }
function openItem(it) { it.kind === 'service' ? openService(it.id) : openCalendar({ kind: it.kind, id: it.id, date: it.date }) }
</script>

<template>
  <!-- Góra: najbliższe nabożeństwo i panel komunikatów rady zboru (lista, „Nowe”). Style: mobile/home.css. -->
  <div class="kh-top2" :class="{ solo: !notices.length }">
    <article v-if="!svc" class="kh-svc kh-svc-empty">
      <span class="kh-tag"><Icon name="calendar" />Najbliższe nabożeństwo</span>
      <b>Jeszcze nie zaplanowane</b>
      <span class="kh-body">Następne nabożeństwo czeka na wypełnienie{{ canUse('planner') ? ' — dodaj datę, kazanie i pieśni.' : '.' }}</span>
      <span class="kh-foot"><button v-if="canUse('planner')" class="kh-link" @click="planNew"><Icon name="plus" />Zaplanuj</button></span>
    </article>
    <button v-if="svc" class="kh-svc" @click="openService(svc.id)">
      <span class="kh-tag"><Icon name="calendar" />Najbliższe nabożeństwo</span>
      <b>{{ svcWhen }}</b>
      <span class="kh-body">{{ [svc.sermonTitle, svc.passage].filter(Boolean).join(' · ') || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> — {{ svc.speaker }}</template></span>
      <span class="kh-foot"><span class="kh-until" :class="{ live: countdown?.live }">{{ until }}</span>{{ svc.place || DEFAULT_PLACE }}<em v-if="planAlert && canUse('planner')" class="kh-pill bad">Braki</em></span>
    </button>
    <section v-if="notices.length" class="kh-panel">
      <div class="kh-panel-h"><h2>Komunikaty rady zboru</h2><span v-if="notices.length" class="kh-count">{{ notices.length }}</span><span v-if="newCount" class="kh-muted">{{ newCount }} {{ newCount === 1 ? 'nowy' : 'nowe' }}</span></div>
      <div v-if="notices.length" class="kh-notes">
        <button v-for="a in notices" :key="a.id" class="kh-note" :class="{ fresh: isNew(a) }" @click="openNotice(a)">
          <img v-if="a.image" class="kh-note-ic" :src="a.image" alt="" loading="lazy">
          <span v-else class="kh-note-ic"><Icon name="info" /></span>
          <span class="kh-note-text">
            <b><span style="overflow:hidden;text-overflow:ellipsis">{{ a.title }}</span><em v-if="isNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></b>
            <span class="kh-note-body">{{ a.text }}</span>
            <small>{{ shortDate(a.date) }}<template v-if="a.until"> · ważne do {{ asDate(a.until).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}</template></small>
          </span>
          <Icon name="right" />
        </button>
      </div>
      <p v-else class="kh-none">Brak aktualnych komunikatów.</p>
    </section>
  </div>

  <div class="kh-panels">
    <section class="kh-panel">
      <div class="kh-panel-h"><h2>Ogłoszenia</h2><span class="kh-muted">z newslettera</span><span class="kh-spacer"></span><button v-if="allAnns.length" class="kh-link" @click="listOpen = true">Wszystkie</button></div>
      <div v-if="news.length" class="kh-anns">
        <article v-for="a in news" :key="a.id" class="kh-ann kh-clickable" :class="{ fresh: isNew(a) }" @click="openNotice(a)">
          <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
          <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
          <span class="kh-ann-text"><b><Icon v-if="a.pinned" name="pin" class="kh-pin" /><span class="kh-ann-t">{{ a.title }}</span><em v-if="isNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
          <small>{{ shortDate(a.date) }}</small>
        </article>
      </div>
      <button v-if="more.n" class="kh-more" @click="listOpen = true">Jeszcze {{ more.n }} {{ more.n === 1 ? 'ogłoszenie' : more.n < 5 ? 'ogłoszenia' : 'ogłoszeń' }}<em v-if="more.fresh" class="kh-new">{{ more.fresh }} {{ more.fresh === 1 ? 'nowe' : 'nowych' }}</em><Icon name="right" /></button>
      <p v-else class="kh-none">Nie ma nowych ogłoszeń. Dodaje się je w aplikacji na telefon (Więcej → Ogłoszenia).</p>
    </section>

    <section class="kh-panel">
      <div class="kh-panel-h"><h2>Tydzień</h2><span class="kh-muted">{{ weekRange }}</span><span class="kh-spacer"></span><button class="kh-link" @click="openCalendar()">Kalendarz</button></div>
      <div class="kh-week">
        <div v-for="d in week" :key="d.date" class="kh-day" :class="{ today: d.date === today() }">
          <span class="kh-wd">{{ d.wd }}</span>
          <span class="kh-n">{{ d.n }}</span>
          <button v-for="it in d.items" :key="it.kind + it.id" class="kh-ev" :style="{ '--c': typeOf(it.type).color }" :title="(it.time ? it.time + ' ' : '') + it.title" @click="openItem(it)">
            <small v-if="it.time">{{ it.time }}</small>{{ it.title.replace(/^Nabożeństwo: .*/, 'Nabożeństwo') }}
          </button>
        </div>
      </div>
    </section>
  </div>

  <div v-if="listOpen && !shown" class="kh-modal" role="dialog" aria-modal="true" @click.self="listOpen = false" @keydown.esc="listOpen = false">
    <div class="kh-modal-box">
      <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="listOpen = false"><Icon name="x" /></button>
      <h2>Wszystkie ogłoszenia</h2>
      <div class="kh-anns">
        <article v-for="a in allAnns" :key="a.id" class="kh-ann kh-clickable" :class="{ fresh: isNew(a) }" @click="openNotice(a)">
          <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
          <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
          <span class="kh-ann-text"><b><Icon v-if="a.pinned" name="pin" class="kh-pin" />{{ a.title }}<em v-if="a.important" class="kh-film">Rada zboru</em><em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
          <small>{{ shortDate(a.date) }}</small>
        </article>
      </div>
    </div>
  </div>

  <div v-if="shown" class="kh-modal" role="dialog" aria-modal="true" @click.self="shown = null" @keydown.esc="shown = null">
    <div class="kh-modal-box">
      <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="shown = null"><Icon name="x" /></button>
      <img v-if="shown.image" class="kh-modal-img" :src="shown.image" alt="">
      <h2>{{ shown.title }}</h2>
      <p class="kh-modal-text">{{ shown.text }}</p>
      <video v-if="vid?.kind === 'file'" :src="vid.src" controls preload="metadata"></video>
      <a v-else-if="vid" class="kh-yt" :href="vid.link" target="_blank" rel="noopener">
        <img v-if="vid.thumb" :src="vid.thumb" alt="">
        <span>▶ Obejrzyj film ({{ vid.kind === 'youtube' ? 'YouTube' : 'Vimeo' }}) — otworzy się w przeglądarce</span>
      </a>
      <a v-if="shown.link" class="kh-modal-link" :href="shown.link" target="_blank" rel="noopener">{{ shown.linkText || 'Otwórz link' }} ›</a>
      <span class="kh-share-row">
        <button class="kh-link kh-share" title="Kopiuj link — po zalogowaniu otworzy to ogłoszenie" @click="share(shown.id)"><Icon name="link" />{{ copied ? 'Skopiowano link' : 'Kopiuj link do ogłoszenia' }}</button>
        <button class="kh-link kh-share" title="Pobiera kod QR z linkiem — np. na grafikę" @click="downloadQr('ogloszenie', shown.id, shown.title)"><Icon name="qr" />Kod QR</button>
        <a v-if="access.edit" class="kh-link kh-share" :href="'https://kns-nabo.netlify.app/ogloszenie/' + encodeURIComponent(shown.id) + '/edycja'" target="_blank" rel="noopener" title="Ogłoszenia edytuje się na stronie kns-nabo (otworzy się w przeglądarce)"><Icon name="pencil" />Edytuj</a>
      </span>
    </div>
  </div>
</template>

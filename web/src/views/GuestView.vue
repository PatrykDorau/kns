<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import { redrawBackdrop } from '@/utils/backdrop'

// Strona dla gości (bez logowania). Najpierw rysuje się góra z krzyżem (ta sama co w tle aplikacji) — ekran wczytywania;
// gdy się narysuje, pojawia się nazwa kościoła i dwa przyciski: „Zaloguj się” i „Odkryj nas”. „Odkryj nas” (albo
// przewinięcie w dół) podnosi cały ekran razem z górą do góry, a spod niego wyjeżdża strona dla gości:
// najbliższe nabożeństwo, wydarzenia, ogłoszenia, kazania i zaproszenie do logowania dla zboru.
export default defineComponent({
  setup() {
    const app = useApp()
    const svc = computed(() => (app.pub.value?.services || []).find(s => s.date >= app.todayStr.value) || null)
    const svcDate = computed(() => svc.value?.date || app.nextSundayDate || '')
    const svcTime = computed(() => svc.value?.time || app.DEFAULT_TIME)
    const svcPlace = computed(() => svc.value?.place || app.DEFAULT_PLACE)
    const when = computed(() => (svcDate.value ? app.pretty(svcDate.value) : 'w niedzielę'))
    const cd = computed(() => app.countdown.value)
    const cdText = computed(() => {
      const c = cd.value
      if (!c) return ''
      if (c.live) return 'Trwa teraz'
      return 'Za ' + [c.days ? c.days + (c.days === 1 ? ' dzień' : ' dni') : '', +c.hours + ' godz', +c.minutes + ' min'].filter(Boolean).join(' ')
    })
    // co się dzieje: wydarzenia publiczne i nabożeństwa; bez danych z bazy — najbliższe niedziele
    const events = computed(() => {
      const list = (app.pubItems.value || []).filter(it => it.date >= app.todayStr.value)
      if (list.length) return list.slice(0, 6)
      const out = [], d = new Date(svcDate.value + 'T12:00')
      for (let i = 0; i < 4; i++, d.setDate(d.getDate() + 7)) {
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
        out.push({ key: 'n' + iso, date: iso, time: svcTime.value, place: svcPlace.value, title: 'Nabożeństwo', sub: '', color: 'var(--accent)' })
      }
      return out
    })
    const anns = computed(() => (app.pub.value?.announcements || []).slice(0, 4))
    // „Dodaj do kalendarza” — plik .ics z najbliższym nabożeństwem
    function addToCalendar() {
      const d = svcDate.value.replace(/-/g, ''), t = svcTime.value.replace(':', '')
      const end = String(+t.slice(0, 2) + 2).padStart(2, '0') + t.slice(2)
      const title = 'Nabożeństwo — Kościół Na Skale' + (svc.value?.sermonTitle ? ': ' + svc.value.sermonTitle : '')
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KNS//PL', 'BEGIN:VEVENT', 'UID:' + d + '@kns-nabo', 'DTSTART;TZID=Europe/Warsaw:' + d + 'T' + t + '00',
        'DTEND;TZID=Europe/Warsaw:' + d + 'T' + end + '00', 'SUMMARY:' + title, 'LOCATION:' + svcPlace.value, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'nabozenstwo-kns.ics'; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }

    // etapy: rysowanie góry → tytuł i przyciski → otwarta strona (ekran odjechał do góry)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ready = ref(false), open = ref(false)
    const page = ref(null)
    let timer = 0
    const body = document.body.classList
    body.add('guest-page')
    function show() { clearTimeout(timer); ready.value = true; body.add('guest-ready') }
    function discover() {
      if (!ready.value) { show(); return }
      open.value = true; body.add('guest-open')
      window.scrollTo(0, 0)
      setTimeout(() => page.value?.querySelector('h2')?.focus({ preventScroll: true }), still ? 0 : 900)
    }
    function back() {
      window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
      setTimeout(() => { open.value = false; body.remove('guest-open') }, still ? 0 : 250)
    }
    // przewinięcie / przesunięcie palcem w górę na pierwszym ekranie — jak „Odkryj nas”
    function wheel(e) { if (!open.value && e.deltaY > 12) discover() }
    let touchY = 0
    const touchStart = e => { touchY = e.touches[0].clientY }
    const touchMove = e => { if (!open.value && touchY - e.touches[0].clientY > 50) discover() }
    const key = e => { if (!open.value && ['ArrowDown', 'PageDown', ' '].includes(e.key) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); discover() } }
    onMounted(() => {
      // góra z tła rysuje się od nowa, szybciej — to ekran wczytywania (też przy „ogranicz ruch”: sama kreska, nic się nie przesuwa)
      timer = window.setTimeout(show, redrawBackdrop(0.42) + 150)
    })
    onBeforeUnmount(() => { clearTimeout(timer); body.remove('guest-page', 'guest-ready', 'guest-open') })
    // „N” w nazwie to pigułka z grafiką (ilustracje kościoła przenikają się co kilka sekund), litera wycięta w środku
    const PILL = ['/swit.svg', '/jezioro.svg', '/pole.svg', '/noc.svg']
    const pill = ref(0)
    const pillTimer = window.setInterval(() => { if (!document.hidden && !open.value) pill.value = (pill.value + 1) % PILL.length }, 4200)
    onBeforeUnmount(() => clearInterval(pillTimer))
    return { ...app, PILL, pill, svc, svcDate, svcTime, svcPlace, when, cdText, events, anns, addToCalendar, ready, open, page, show, discover, back, wheel, touchStart, touchMove, key }
  },
})
</script>

<template>
  <div class="gx" :class="{ ready, open }" @keydown="key">
    <!-- pierwszy ekran: góra się rysuje, potem nazwa i przyciski -->
    <div class="gx-intro" :aria-hidden="open" :inert="open" @click="!ready && show()" @wheel.passive="wheel" @touchstart.passive="touchStart" @touchmove.passive="touchMove">
      <div class="gx-intro-in">
        <p class="gx-chips gx-in" style="--i: 0">
          <span v-if="cdText" class="gx-chip"><i class="gx-dot" :class="{ live: cdText === 'Trwa teraz' }"></i>{{ cdText }}</span>
          <span class="gx-chip">Niedziela {{ svcTime }}</span>
          <span class="gx-chip">{{ svcPlace }}</span>
        </p>
        <h1 class="gx-title" aria-label="Kościół Na Skale">
          <span class="gx-in gx-dim" style="--i: 1" aria-hidden="true">Kościół</span>
          <span class="gx-in gx-line2" style="--i: 2" aria-hidden="true"><svg class="gx-n" viewBox="0 0 128 80"><defs><mask id="gx-n-cut"><rect width="128" height="80" rx="40" fill="#fff" /><text x="64" y="71" text-anchor="middle">N</text></mask></defs><g mask="url(#gx-n-cut)"><rect width="128" height="80" fill="#2a2826" /><image v-for="(src, i) in PILL" :key="src" :href="src" width="128" height="80" preserveAspectRatio="xMidYMid slice" :class="{ on: i === pill }" /></g></svg>a Skale</span>
        </h1>
        <p class="gx-lead gx-in" style="--i: 3">Wspólnota, która co niedzielę spotyka się, żeby słuchać Boga i być razem. Przyjdź taki, jaki jesteś.</p>
        <div class="gx-actions gx-in" style="--i: 4">
          <button class="gx-btn gx-accent" @click="loginView = true">Zaloguj się</button>
          <button class="gx-btn gx-dark" @click="discover">Odkryj nas <span aria-hidden="true">↓</span></button>
        </div>
      </div>
    </div>

    <!-- strona dla gości: wyjeżdża spod pierwszego ekranu -->
    <div ref="page" class="gx-page" :aria-hidden="!open" :inert="!open">
      <nav class="gx-bar" aria-label="Strona">
        <button class="gx-logo" title="Wróć na początek" @click="back">Kościół <b>Na Skale</b></button>
        <span class="gx-bar-links">
          <a href="#nabozenstwo">Nabożeństwo</a><a href="#wydarzenia">Wydarzenia</a><a v-if="listenYt || listenSp" href="#posluchaj">Posłuchaj</a>
        </span>
        <button class="gx-btn gx-accent gx-sm" @click="loginView = true">Zaloguj się</button>
      </nav>

      <section id="nabozenstwo" class="gx-sec">
        <h2 class="gx-h" tabindex="-1"><span class="gx-dim">Niedziela, {{ svcTime }}</span>{{ svcPlace }}</h2>
        <p class="gx-sub">Nabożeństwo z uwielbieniem i kazaniem. Przyjdź sam, z rodziną albo z przyjaciółmi — nikt nie musi niczego umieć ani wiedzieć.</p>
        <div class="gx-svc">
          <div class="gx-panel gx-cd">
            <small>Najbliższe nabożeństwo</small>
            <b>{{ cdText || when }}</b>
            <span>{{ when }}, {{ svcTime }}</span>
            <div class="gx-row">
              <a v-if="mapLink(svcPlace)" class="gx-btn gx-light" :href="mapLink(svcPlace)" target="_blank" rel="noopener">Jak dojechać</a>
              <button class="gx-btn gx-dark" @click="addToCalendar">Dodaj do kalendarza</button>
            </div>
          </div>
          <dl class="gx-facts">
            <div v-if="svc?.sermonTitle" class="gx-panel"><dt>Kazanie</dt><dd>{{ svc.sermonTitle }}</dd></div>
            <div v-if="svc?.passage" class="gx-panel"><dt>Fragment</dt><dd>{{ svc.passage }}</dd></div>
            <div v-if="svc?.speaker" class="gx-panel"><dt>Mówi</dt><dd>{{ svc.speaker }}</dd></div>
            <div class="gx-panel"><dt>Ile trwa</dt><dd>około dwóch godzin</dd></div>
            <div class="gx-panel"><dt>Dzieci</dt><dd>są mile widziane</dd></div>
            <div class="gx-panel"><dt>Gdzie</dt><dd>{{ svcPlace }}</dd></div>
          </dl>
        </div>
      </section>

      <section id="wydarzenia" class="gx-sec">
        <h2 class="gx-h"><span class="gx-dim">Co się</span>u nas dzieje</h2>
        <p class="gx-sub">Spotkania otwarte dla każdego — przyjdź, nawet jeśli jeszcze nikogo nie znasz.</p>
        <ol class="gx-evs">
          <li v-for="e in events" :key="e.key" class="gx-ev gx-panel" :style="{ '--c': e.color }">
            <span class="gx-ev-date"><b>{{ day(e.date) }}</b>{{ month(e.date) }}</span>
            <span class="gx-ev-body"><b>{{ e.title }}</b><small>{{ wd(e.date) }}{{ e.time ? ', ' + e.time : '' }}{{ e.place ? ' · ' + e.place : '' }}</small><span v-if="e.sub">{{ e.sub }}</span></span>
          </li>
        </ol>
        <div v-if="anns.length" class="gx-anns">
          <article v-for="a in anns" :key="a.id" class="gx-ann gx-panel">
            <img v-if="a.image" :src="a.image" :alt="a.title" loading="lazy">
            <h3>{{ a.title }}</h3>
            <p>{{ a.text }}</p>
          </article>
        </div>
      </section>

      <section v-if="listenYt || listenSp" id="posluchaj" class="gx-sec">
        <h2 class="gx-h"><span class="gx-dim">Kazania,</span>kiedy chcesz</h2>
        <p class="gx-sub">{{ listenLatest ? 'Najnowsze: ' + listenLatest.title : 'Nagrania nabożeństw i kazań — w domu, w drodze, na spacerze.' }}</p>
        <div v-if="listenYt" class="gx-video"><iframe :src="listenYt" title="Najnowsze kazanie — YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
        <div class="gx-row gx-center">
          <a v-if="listen.youtubeMore || listen.youtube" class="gx-btn gx-light" :href="listen.youtubeMore || listen.youtube" target="_blank" rel="noopener">YouTube</a>
          <a v-if="listen.spotify" class="gx-btn gx-dark" :href="listen.spotify" target="_blank" rel="noopener">Spotify</a>
        </div>
      </section>

      <section class="gx-sec gx-quote">
        <h2 class="gx-h"><span class="gx-dim">Kto słucha Jezusa,</span>buduje dom na skale</h2>
        <p class="gx-sub">Pada deszcz, wieje wiatr, a dom stoi — bo stoi na skale. Stąd nasza nazwa. Według Ewangelii Mateusza 7,24–25.</p>
      </section>

      <section class="gx-sec gx-join">
        <div class="gx-panel">
          <h2 class="gx-h gx-h-sm"><span class="gx-dim">Należysz</span>do zboru?</h2>
          <p class="gx-sub">Ogłoszenia, służby i grafik, notatki z kazań i lista modlitewna są w aplikacji. Nowe konto zatwierdza administrator kościoła.</p>
          <button class="gx-btn gx-accent" @click="loginView = true">Zaloguj się</button>
        </div>
      </section>

      <footer class="gx-foot">
        <span>Kościół Na Skale · niedziela {{ svcTime }}, {{ svcPlace }}</span>
        <button @click="back">Na początek ↑</button>
      </footer>
    </div>
  </div>
</template>

<style>
/* strona gościa na całą szerokość okna — bez marginesów aplikacji; góra z tła jaśniejsza i niżej (pod tytułem) */
body.guest-page { padding: 0 !important; }
body.guest-page #app { max-width: none; padding-bottom: 0; }
body.guest-page #app > .gx { max-width: none !important; margin: 0 !important; }
body.guest-page:not(.guest-open) { overflow: hidden; }
body.guest-page .kns-backdrop { height: 62svh; opacity: .55; transform: translateY(var(--gx-mid, 2svh)); transition: transform 1.1s cubic-bezier(.65, 0, .25, 1), opacity .95s; }
/* gdy góra się narysuje — zjeżdża niżej i robi miejsce na nazwę */
body.guest-ready .kns-backdrop { transform: translateY(var(--gx-low, 25svh)); }
body.guest-open .kns-backdrop { transform: translateY(-100svh); opacity: 0; }
@media (max-width: 760px) { body.guest-page { --gx-low: 6svh; --gx-mid: -14svh; } body.guest-page .kns-backdrop { height: 46svh; } }
@media (prefers-reduced-motion: reduce) {
  body.guest-page .kns-backdrop, body.guest-ready .kns-backdrop { transition: opacity .4s; transform: translateY(var(--gx-low, 25svh)); }
  body.guest-page .kns-backdrop path { animation-name: kb-draw !important; animation-fill-mode: forwards !important; stroke-dashoffset: 1; }
  body.guest-open .kns-backdrop { transform: translateY(var(--gx-low, 25svh)); }
}
</style>

<style scoped>
.gx { --ease: cubic-bezier(.7, 0, .2, 1); --m: clamp(16px, 4vw, 48px); position: relative; color: var(--text); }
.gx-dim { color: #8c8985; font-weight: 400; }

/* przyciski — pigułki jak w aplikacji */
.gx-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 24px; border: 0; border-radius: 999px; font: 600 16px/1 var(--display); white-space: nowrap; text-decoration: none; cursor: pointer; transition: transform .15s, background .15s, box-shadow .2s; }
.gx-btn:active { transform: scale(.97); }
.gx .gx-accent { background: var(--accent); color: #1a1208; box-shadow: 0 0 0 1px rgba(246, 168, 54, .4), 0 8px 40px rgba(246, 168, 54, .32); }
.gx .gx-accent:hover { background: #f8b752; box-shadow: 0 0 0 1px rgba(246, 168, 54, .5), 0 8px 48px rgba(246, 168, 54, .45); }
.gx .gx-dark { background: #1c1b1a; color: #fff; }
.gx .gx-dark:hover { background: #262422; }
.gx-panel .gx-dark { background: #2a2826; }
.gx-panel .gx-dark:hover { background: #34312e; }
.gx .gx-light { background: #fff; color: #0e0d0c; }
.gx .gx-light:hover { background: #e9e7e4; }
.gx-sm { min-height: 40px; padding: 0 18px; font-size: 15px; }

/* ---------- pierwszy ekran ---------- */
.gx-intro { position: fixed; inset: 0; z-index: 5; display: flex; justify-content: center; padding: 0 var(--m); transition: transform .95s var(--ease); }
.gx.open .gx-intro { transform: translateY(-100%); }
.gx-intro-in { display: flex; flex-direction: column; align-items: center; text-align: center; margin-top: max(9svh, 56px); max-width: 900px; }
.gx-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 28px; }
.gx-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #1c1b1a; font: 500 14px/1 var(--display); color: #d9d6d2; font-variant-numeric: tabular-nums; }
.gx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.gx-dot.live { background: #e5484d; animation: gx-pulse 1.4s ease-in-out infinite; }
@keyframes gx-pulse { 50% { opacity: .35; } }
/* nazwa: „Kościół” lekko i szaro, „Na Skale” ciężko i biało — „N” jako pigułka z grafiką na wysokość wersalików */
.gx-title { display: flex; flex-direction: column; align-items: center; margin: 0; font: 600 clamp(58px, 9.6vw, 144px)/.94 var(--display); letter-spacing: -.055em; font-feature-settings: "ss01", "cv11"; }
.gx-title .gx-dim { letter-spacing: -.045em; }
.gx-line2 { display: inline-flex; align-items: baseline; }
.gx-n { width: 1.163em; height: .727em; margin-right: .035em; flex: none; align-self: baseline; transform: translateY(.005em); overflow: visible; }
.gx-n text { font: 600 86px/1 var(--display); letter-spacing: 0; fill: #000; }
.gx-n image { opacity: 0; transition: opacity 1.4s ease; transform-origin: 50% 50%; }
.gx-n image.on { opacity: 1; animation: gx-drift 8s ease-in-out infinite alternate; }
@keyframes gx-drift { from { transform: scale(1.05); } to { transform: scale(1.22) translate(-4px, 2px); } }
@media (prefers-reduced-motion: reduce) { .gx-n image.on { animation: none; } }
.gx-lead { margin: 26px 0 0; max-width: 36ch; font-size: 18px; line-height: 1.5; color: #c4c1bd; text-wrap: balance; }
.gx-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 34px; }
/* wejście po narysowaniu góry: po kolei, z lekkim rozmyciem */
.gx-in { opacity: 0; transform: translateY(18px); filter: blur(8px); transition: opacity .8s ease, transform .9s cubic-bezier(.2, .7, .2, 1), filter .8s ease; transition-delay: calc(var(--i) * 110ms); }
.gx.ready .gx-in { opacity: 1; transform: none; filter: none; }

/* ---------- strona dla gości ---------- */
/* arkusz z treścią: jedzie od dołu razem z pierwszym ekranem, który odjeżdża do góry */
.gx-page { position: relative; z-index: 6; min-height: 100svh; background: var(--bg); border-radius: 28px 28px 0 0; visibility: hidden; transform: translateY(100svh); pointer-events: none; transition: transform .95s var(--ease), border-radius .95s var(--ease), visibility 0s .95s; }
.gx.open .gx-page { visibility: visible; transform: none; border-radius: 0; pointer-events: auto; transition: transform .95s var(--ease), border-radius .95s var(--ease); }
.gx-bar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px var(--m); background: rgba(14, 13, 12, .82); backdrop-filter: blur(14px); }
.gx-logo { border: 0; background: none; padding: 6px 0; color: #8c8985; font: 600 18px/1 var(--display); letter-spacing: -.02em; cursor: pointer; }
.gx-logo b { color: #fff; font-weight: 600; }
.gx-bar-links { display: flex; gap: 6px; padding: 5px; border-radius: 999px; background: #1c1b1a; }
.gx-bar-links a { padding: 9px 14px; border-radius: 999px; color: #d9d6d2; font: 500 14px/1 var(--display); text-decoration: none; }
.gx-bar-links a:hover { background: #2a2826; color: #fff; }

.gx-sec { max-width: 1080px; margin: 0 auto; padding: clamp(80px, 12vw, 150px) var(--m) 0; scroll-margin-top: 40px; text-align: center; }
.gx-h { display: flex; flex-direction: column; margin: 0; font: 600 clamp(40px, 6vw, 76px)/1 var(--display); letter-spacing: -.045em; outline: none; text-wrap: balance; }
.gx-h-sm { font-size: clamp(34px, 4.4vw, 56px); }
.gx-sub { max-width: 52ch; margin: 22px auto 0; font-size: 18px; line-height: 1.55; color: #c4c1bd; text-wrap: pretty; }
.gx-panel { border-radius: 22px; background: #181716; }
.gx-row { display: flex; flex-wrap: wrap; gap: 10px; }
.gx-center { justify-content: center; margin-top: 28px; }

.gx-svc { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; margin-top: 56px; text-align: left; }
.gx-cd { display: flex; flex-direction: column; gap: 10px; padding: 32px; }
.gx-cd small { color: #8c8985; font-size: 15px; }
.gx-cd b { font: 600 clamp(28px, 2.8vw, 38px)/1.1 var(--display); letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
.gx-cd span { color: #c4c1bd; font-size: 17px; }
.gx-cd .gx-row { margin-top: auto; padding-top: 26px; }
.gx-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
.gx-facts div { padding: 22px 24px; }
.gx-facts div:last-child:nth-child(odd) { grid-column: span 2; }
.gx-facts dt { color: #8c8985; font-size: 14px; }
.gx-facts dd { margin: 6px 0 0; font: 600 18px/1.3 var(--display); }

.gx-evs { list-style: none; display: flex; flex-direction: column; gap: 10px; max-width: 760px; margin: 56px auto 0; padding: 0; text-align: left; }
.gx-ev { display: grid; grid-template-columns: 110px 1fr; gap: 20px; align-items: center; padding: 20px 26px; }
.gx-ev-date { display: flex; align-items: baseline; gap: 6px; color: var(--c, var(--accent)); font: 600 18px/1 var(--display); }
.gx-ev-date b { font: 650 48px/1 var(--display); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.gx-ev-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.gx-ev-body b { font: 600 20px/1.25 var(--display); }
.gx-ev-body small { color: #a9a6a2; font-size: 15px; }
.gx-ev-body span { color: #c4c1bd; font-size: 15px; }
.gx-anns { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 40px; text-align: left; }
.gx-ann { overflow: hidden; padding-bottom: 22px; }
.gx-ann img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.gx-ann h3 { margin: 18px 22px 0; font: 600 20px/1.25 var(--display); }
.gx-ann p { margin: 8px 22px 0; color: #c4c1bd; font-size: 16px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }

.gx-video { margin-top: 48px; border-radius: 22px; overflow: hidden; background: #181716; aspect-ratio: 16 / 9; }
.gx-video iframe { display: block; width: 100%; height: 100%; border: 0; }

.gx-join .gx-panel { display: flex; flex-direction: column; align-items: center; padding: clamp(40px, 6vw, 72px) var(--m); background: radial-gradient(600px 280px at 50% 120%, rgba(246, 168, 54, .16), transparent 70%), #181716; }
.gx-join .gx-btn { margin-top: 30px; }
.gx-foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; max-width: 1080px; margin: 0 auto; padding: 70px var(--m) 40px; color: #8c8985; font-size: 14px; }
.gx-foot button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 6px 0; }
.gx-foot button:hover { color: #fff; }

/* telefon */
@media (max-width: 760px) {
  .gx-intro-in { margin-top: max(7svh, 40px); }
  .gx-chips { margin-bottom: 22px; }
  .gx-chip { font-size: 13px; padding: 7px 12px; }
  .gx-title { font-size: clamp(52px, 16vw, 80px); }
  .gx-lead { font-size: 17px; margin-top: 20px; }
  .gx-actions { width: 100%; flex-direction: column; margin-top: 28px; }
  .gx-actions .gx-btn { width: 100%; }
  .gx-bar-links { display: none; }
  .gx-svc, .gx-facts { grid-template-columns: 1fr; }
  .gx-facts { grid-template-columns: 1fr 1fr; }
  .gx-cd { padding: 26px 22px; }
  .gx-ev { grid-template-columns: 74px 1fr; gap: 14px; padding: 16px 18px; }
  .gx-ev-date { flex-direction: column; gap: 2px; font-size: 15px; }
  .gx-ev-date b { font-size: 36px; }
  .gx-ev-body b { font-size: 18px; }
}
/* ograniczony ruch: bez przesuwania — ekrany się przenikają */
@media (prefers-reduced-motion: reduce) {
  .gx-in { transform: none; filter: none; transition: opacity .5s ease calc(var(--i) * 80ms); }
  .gx-intro { transition: opacity .4s ease; }
  .gx.open .gx-intro { transform: none; opacity: 0; pointer-events: none; }
  .gx-page, .gx.open .gx-page { transform: none; opacity: 0; transition: opacity .4s ease .1s; }
  .gx.open .gx-page { opacity: 1; }
}
</style>

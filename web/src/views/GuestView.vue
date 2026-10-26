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
    // bez animacji (ustawienie „ogranicz ruch”) — bez czekania: góra od razu narysowana, nazwa od razu widoczna
    const ready = ref(still), open = ref(false)
    if (still) document.body.classList.add('guest-ready')
    const page = ref(null)
    let timer = 0
    const body = document.body.classList
    body.add('guest-page')
    function show() { clearTimeout(timer); ready.value = true; body.add('guest-ready') }
    let switchedAt = 0 // przerwa po przejściu — rozpęd kółka/palca nie przełącza od razu z powrotem
    const settled = () => performance.now() - switchedAt > 700
    function discover() {
      if (!ready.value) { show(); return }
      switchedAt = performance.now()
      open.value = true; body.add('guest-open')
      window.scrollTo(0, 0); topAt = performance.now()
      setTimeout(() => page.value?.querySelector('h2')?.focus({ preventScroll: true }), still ? 0 : 900)
    }
    function back() {
      switchedAt = performance.now()
      window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
      setTimeout(() => { open.value = false; body.remove('guest-open', 'hdr-hide'); window.scrollTo(0, 0) }, still ? 0 : 250)
    }
    // przewinięcie / przesunięcie palcem w górę na pierwszym ekranie — jak „Odkryj nas”
    function wheel(e) { if (!open.value && e.deltaY > 12 && settled()) discover() }
    let touchY = 0
    const touchStart = e => { touchY = e.touches[0].clientY }
    const touchMove = e => { if (!open.value && touchY - e.touches[0].clientY > 50 && settled()) discover() }
    // na samej górze treści przewinięcie / przeciągnięcie w górę wraca na ekran startowy
    // (tylko gdy strona już chwilę stała na górze — żeby rozpęd przewijania nie wyrzucał na start)
    let topAt = 0
    const onScroll = () => { topAt = scrollY <= 0 ? (topAt || performance.now()) : 0 }
    const atTop = () => open.value && scrollY <= 0 && topAt && performance.now() - topAt > 350 && settled()
    const pageWheel = e => { if (e.deltaY < -12 && atTop()) back() }
    let pageTouch = null
    const pageTouchStart = e => { pageTouch = atTop() ? e.touches[0].clientY : null }
    const pageTouchMove = e => { if (pageTouch != null && e.touches[0].clientY - pageTouch > 70) { pageTouch = null; back() } }
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('wheel', pageWheel, { passive: true })
    addEventListener('touchstart', pageTouchStart, { passive: true })
    addEventListener('touchmove', pageTouchMove, { passive: true })
    onBeforeUnmount(() => { removeEventListener('scroll', onScroll); removeEventListener('wheel', pageWheel); removeEventListener('touchstart', pageTouchStart); removeEventListener('touchmove', pageTouchMove) })
    const key = e => { if (!open.value && ['ArrowDown', 'PageDown', ' '].includes(e.key) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); discover() } }
    onMounted(() => {
      if (still) return
      // góra z tła rysuje się od nowa, szybciej — to ekran wczytywania
      timer = window.setTimeout(show, redrawBackdrop(0.42) + 150)
    })
    onBeforeUnmount(() => { clearTimeout(timer); body.remove('guest-page', 'guest-ready', 'guest-open') })
    return { ...app, svc, svcDate, svcTime, svcPlace, when, cdText, events, anns, addToCalendar, ready, open, page, show, discover, back, wheel, touchStart, touchMove, key }
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
          <span class="gx-in" style="--i: 2" aria-hidden="true">Na Skale</span>
        </h1>
        <blockquote class="gx-lead gx-in" style="--i: 3">Rzecz ma się tak, jak z ciałem. Jest jedno, lecz członków ma wiele. Wszystkie jego członki, mimo że ich wiele, stanowią jedno ciało. Podobnie z Chrystusem.<cite>1 Kor 12,12</cite></blockquote>
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
          <a href="#nabozenstwo">Nabożeństwo</a><a href="#kim-jestesmy">Kim jesteśmy</a><a href="#wydarzenia">Wydarzenia</a><a v-if="listenYt || listenSp" href="#posluchaj">Posłuchaj</a>
        </span>
        <button class="gx-btn gx-accent gx-sm" @click="loginView = true">Zaloguj się</button>
      </nav>

      <section id="nabozenstwo" class="gx-sec">
        <h2 class="gx-h" tabindex="-1"><span class="gx-dim">Niedziela, {{ svcTime }}</span>{{ svcPlace }}</h2>
        <p class="gx-sub">Nabożeństwo z uwielbieniem i kazaniem. Przyjdź sam, z rodziną albo z przyjaciółmi — nikt nie musi niczego umieć ani wiedzieć.</p>
        <div v-if="svc?.sermonTitle || svc?.speaker" class="gx-sermon">
          <small>{{ when }} — kazanie</small>
          <b v-if="svc.sermonTitle">„{{ svc.sermonTitle }}”</b>
          <span v-if="svc.speaker || svc.passage">{{ [svc.speaker, svc.passage].filter(Boolean).join(' · ') }}</span>
        </div>
        <div class="gx-row gx-center">
          <a v-if="mapLink(svcPlace)" class="gx-btn gx-light" :href="mapLink(svcPlace)" target="_blank" rel="noopener">Jak dojechać</a>
          <button class="gx-btn gx-dark" @click="addToCalendar">Dodaj do kalendarza</button>
        </div>
      </section>

      <!-- kim jesteśmy: cztery wartości (ikony kreską jak góra) i kilka zdań o kościele -->
      <section id="kim-jestesmy" class="gx-sec gx-who">
        <div class="gx-who-text">
          <h2 class="gx-h">Kim jesteśmy?</h2>
          <p class="gx-sub">Kościół Na Skale to społeczność, której tożsamość opiera się na Bogu Ojcu, Jezusie Chrystusie i Duchu Świętym.</p>
          <p class="gx-who-p">Jesteśmy chrześcijanami, <a href="https://baptysci.pl" target="_blank" rel="noopener">baptystami</a>, i razem tworzymy kościół — wspólnotę wierzących ludzi. Spotykamy się, żeby poznawać Boga w Jego Słowie, wspierać się w codziennym życiu i głosić Ewangelię, która jedynie ma moc zbawić. Chcemy budować Kościół, który działa razem.</p>
        </div>
        <ul class="gx-values">
          <li class="gx-panel"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 54 C14 41 7 32 7 22 a12 12 0 0 1 25-5 a12 12 0 0 1 25 5 c0 10-7 19-25 32z" /><path d="M32 22v20M25 29h14" /></svg>Kochać Boga</li>
          <li class="gx-panel"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 22c-6 2-9 9-8 17 1 9 4 17 10 18 6 1 8-5 7-11-1-5 2-8 4-12 2-5 0-11-5-12-3-1-6-1-8 0z" /><circle cx="25" cy="12" r="3.2" /><circle cx="32.5" cy="9.5" r="2.6" /><circle cx="38.5" cy="11" r="2.2" /><circle cx="43" cy="14.5" r="1.9" /><circle cx="45.5" cy="19.5" r="1.6" /></svg>Naśladować Jezusa</li>
          <li class="gx-panel"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="30" r="9" /><path d="M32 13v-5M44 18l3.5-3.5M20 18l-3.5-3.5M49 30h5M10 30h5" /><circle cx="17" cy="38" r="6" /><circle cx="47" cy="38" r="6" /><path d="M6 56c1-6 5-10 11-10s10 4 11 10M36 56c1-6 5-10 11-10s10 4 11 10" /></svg>Kochać ludzi</li>
          <li class="gx-panel"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 18c-5 0-7 4-7 9 0 4-9 8-9 17 0 8 7 13 16 13s16-5 16-13c0-9-9-13-9-17 0-5-2-9-7-9z" /><path d="M32 18c0-4 1-8 4-11" /><path d="M36 10c4-4 11-4 14-1-3 4-10 5-14 1z" /><path d="M27 34c-3 4-4 9-2 14M34 32c0 6 1 12 4 17" /></svg>Czynić uczniami</li>
        </ul>
        <figure class="gx-mission gx-panel">
          <figcaption>Nasza misja</figcaption>
          <blockquote>Idźcie tedy i czyńcie uczniami wszystkie narody, chrzcząc je w imię Ojca i Syna, i Ducha Świętego, ucząc je przestrzegać wszystkiego, co wam przykazałem.</blockquote>
          <cite>Mt 28,19–20</cite>
        </figure>
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
/* strona gościa na całą szerokość okna — bez marginesów aplikacji */
body.guest-page { padding: 0 !important; }
body.guest-page #app { max-width: none; padding-bottom: 0; }
body.guest-page #app > .gx { max-width: none !important; margin: 0 !important; }
body.guest-page:not(.guest-open), html:has(body.guest-page:not(.guest-open)) { overflow: hidden; }
body.guest-page.hdr-hide .gx-bar { transform: translateY(-100%); }
/* pierwszy ekran: góra rysuje się na cały ekran w tle; po narysowaniu przygasa, a na niej pojawia się nazwa */
body.guest-page .kns-backdrop { height: 94svh; opacity: .6; transition: transform .95s cubic-bezier(.7, 0, .2, 1), opacity 1.2s ease, height .95s cubic-bezier(.7, 0, .2, 1); }
body.guest-ready .kns-backdrop { opacity: .3; }
/* po „Odkryj nas” góra zostaje w tle pod treścią (jak w aplikacji) */
body.guest-open .kns-backdrop { height: min(80vh, 760px); opacity: .22; }
@media (max-width: 760px) { body.guest-page .kns-backdrop { height: 86svh; } body.guest-open .kns-backdrop { height: 64vh; } }
@media (prefers-reduced-motion: reduce) { body.guest-page .kns-backdrop { transition: none; } }
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
.gx-intro { position: fixed; inset: 0; z-index: 5; display: flex; justify-content: center; align-items: center; padding: 0 var(--m); transition: transform .95s var(--ease); }
.gx.open .gx-intro { transform: translateY(-100%); }
.gx-intro-in { display: flex; flex-direction: column; align-items: center; text-align: center; margin-top: -4svh; max-width: 900px; }
.gx-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 28px; }
.gx-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #1c1b1a; font: 500 14px/1 var(--display); color: #d9d6d2; font-variant-numeric: tabular-nums; }
.gx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.gx-dot.live { background: #e5484d; animation: gx-pulse 1.4s ease-in-out infinite; }
@keyframes gx-pulse { 50% { opacity: .35; } }
/* nazwa: „Kościół” lekko i szaro, „Na Skale” ciężko i biało */
.gx-title { display: flex; flex-direction: column; align-items: center; margin: 0; font: 600 clamp(58px, 9.6vw, 144px)/.94 var(--display); letter-spacing: -.055em; font-feature-settings: "ss01", "cv11"; }
.gx-title .gx-dim { letter-spacing: -.045em; }
.gx-lead cite { display: block; margin-top: 12px; color: var(--accent); font: normal 600 15px/1 var(--display); }
.gx-lead { margin: 26px 0 0; max-width: 44ch; font-size: 18px; line-height: 1.5; color: #c4c1bd; text-wrap: balance; }
.gx-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 34px; }
/* wejście po narysowaniu góry: po kolei, z lekkim rozmyciem */
.gx-in { opacity: 0; transform: translateY(18px); filter: blur(8px); transition: opacity .8s ease, transform .9s cubic-bezier(.2, .7, .2, 1), filter .8s ease; transition-delay: calc(var(--i) * 110ms); }
.gx.ready .gx-in { opacity: 1; transform: none; filter: none; }

/* ---------- strona dla gości ---------- */
/* arkusz z treścią: jedzie od dołu razem z pierwszym ekranem, który odjeżdża do góry */
.gx-page { position: relative; z-index: 6; min-height: 100svh; background: transparent; border-radius: 28px 28px 0 0; visibility: hidden; transform: translateY(100svh); pointer-events: none; transition: transform .95s var(--ease), border-radius .95s var(--ease), visibility 0s .95s; }
.gx.open .gx-page { visibility: visible; transform: none; border-radius: 0; pointer-events: auto; transition: transform .95s var(--ease), border-radius .95s var(--ease); }
/* pasek: chowa się przy przewijaniu w dół, wraca przy przewijaniu w górę (hdr-hide — utils/autoHideHeader.ts) */
.gx-bar { transition: transform .3s ease; }
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


.gx-sermon { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 680px; margin: 44px auto 0; padding: 28px 32px; border-radius: 22px; background: #181716; }
.gx-sermon small { color: #8c8985; font-size: 15px; }
.gx-sermon b { font: 600 clamp(24px, 2.6vw, 32px)/1.2 var(--display); letter-spacing: -.025em; text-wrap: balance; }
.gx-sermon span { color: #c4c1bd; font-size: 17px; }
/* kim jesteśmy: tekst po lewej, cztery wartości 2×2 po prawej, misja pod spodem */
.gx-who { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 64px; align-items: center; text-align: left; }
.gx-who .gx-sub { margin-left: 0; }
.gx-who-p { margin: 18px 0 0; max-width: 52ch; color: #c4c1bd; font-size: 17px; line-height: 1.6; }
.gx-who-p a { color: var(--accent) !important; text-underline-offset: 3px; }
.gx-values { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; padding: 0; }
.gx-values li { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 24px; font: 600 18px/1.2 var(--display); letter-spacing: -.01em; }
.gx-values svg { width: 52px; height: 52px; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.gx-mission { grid-column: 1 / -1; display: grid; grid-template-columns: 160px 1fr; gap: 6px 32px; margin: 52px 0 0; padding: 30px 32px; }
.gx-mission figcaption { color: var(--accent); font: 600 15px/1.5 var(--display); }
.gx-mission blockquote { margin: 0; font: 500 clamp(19px, 1.7vw, 23px)/1.45 var(--display); letter-spacing: -.01em; text-wrap: pretty; }
.gx-mission cite { grid-column: 2; color: #8c8985; font: normal 500 15px/1 var(--display); }
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
  .gx-intro-in { margin-top: 0; }
  .gx-chips { margin-bottom: 22px; }
  .gx-chip { font-size: 13px; padding: 7px 12px; }
  .gx-title { font-size: clamp(52px, 16vw, 80px); }
  .gx-lead { font-size: 17px; margin-top: 20px; }
  .gx-actions { width: 100%; flex-direction: column; margin-top: 28px; }
  .gx-actions .gx-btn { width: 100%; }
  .gx-bar-links { display: none; }
  .gx-who { grid-template-columns: 1fr; gap: 12px; }
  .gx-who-text { margin-bottom: 28px; }
  .gx-values li { padding: 20px; font-size: 16px; }
  .gx-values svg { width: 44px; height: 44px; }
  .gx-mission { grid-template-columns: 1fr; margin-top: 28px; padding: 24px 22px; }
  .gx-mission cite { grid-column: 1; margin-top: 6px; }
  .gx-sermon { padding: 22px; }
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

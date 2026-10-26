<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import SermonNotes from '@/components/SermonNotes.vue'
import CardDeck from '@/components/CardDeck.vue'

// HomeView
export default defineComponent({
  components: { SermonNotes, CardDeck },
  setup() {
    const app = useApp()
    // „Dla Ciebie”: grafik i dyspozycyjność w moich służbach, ankiety bez mojej odpowiedzi, modlitwa dnia/tygodnia
    const mine = reactive({ av: [], surveys: [], focus: [], loaded: false })
    async function loadMine() {
      if (!app.api.enabled || !app.ready.value) return
      const [av, sv, fc] = await Promise.all(['availability', 'surveys', 'prayerFocus'].map(a => app.api.call(a).catch(() => null)))
      mine.av = av || []; mine.surveys = sv?.list || (Array.isArray(sv) ? sv : []); mine.focus = fc || []; mine.loaded = true
    }
    onMounted(loadMine)
    watch(app.ready, r => { if (r && !mine.loaded) loadMine() })
    const today = () => app.todayStr.value
    const soon = d => d >= today() && (new Date(d + 'T12:00').getTime() - new Date(today() + 'T12:00').getTime()) / 864e5 <= 14
    // moje niedziele w grafiku (najbliższe 2 tygodnie)
    const myDuties = computed(() => {
      const out = []
      for (const m of mine.av) for (const [d, ids] of Object.entries(m.plan || {})) if (soon(d) && (ids || []).includes(m.you)) out.push({ day: d, name: m.name })
      return out.sort((a, b) => a.day.localeCompare(b.day))
    })
    // służby, w których brakuje mojej dyspozycyjności na najbliższe 4 niedziele
    const avMissing = computed(() => mine.av.filter(m => m.member).map(m => ({ name: m.name, n: (m.days || []).slice(0, 4).filter(d => !m.mine?.[d]).length })).filter(x => x.n))
    const roleOn = d => [...new Set(myDuties.value.filter(x => x.day === d).map(x => x.name))]
    const dutyDay = d => (d === today() ? 'dziś' : app.pretty(d).replace(/ \d{4}$/, ''))
    const forYou = computed(() => {
      const out = [], byDay = {}
      for (const x of myDuties.value) (byDay[x.day] ||= []).push(x.name)
      for (const [d, names] of Object.entries(byDay)) out.push({ key: 'g' + d, icon: 'serve', title: [...new Set(names)].join(', '), sub: 'Jesteś w grafiku · ' + dutyDay(d), go: () => app.openServe('mine') })
      for (const x of avMissing.value) out.push({ key: 'a' + x.name, icon: 'calendar', title: x.name, sub: 'Podaj dyspozycyjność · ' + (x.n === 1 ? 'brakuje 1 niedzieli' : 'brakuje ' + x.n + ' niedziel'), go: () => app.openServe('mine') })
      for (const v of (app.votes.list || []).filter(x => x.status === 'voting' && !x.voted)) out.push({ key: 'v' + v.id, icon: 'check', title: 'Głosowanie: ' + v.title, sub: 'oddaj tajny głos', go: () => app.goToVote(v) })
      for (const sv of mine.surveys.filter(x => x.status === 'open' && !x.answered)) out.push({ key: 's' + sv.id, icon: 'list', title: 'Ankieta: ' + sv.title, sub: sv.closes ? 'odpowiedz do ' + app.shortDate(sv.closes) : 'czeka na Twoją odpowiedź', go: () => { app.openAnns(); app.annTab.value = 'survey'; app.surveyOpen.value = sv.id } })
      if (app.goalDue.value) out.push({ key: 'goal', icon: 'money', title: 'Cele wsparcia: ' + app.monthName(app.goalDue.value.month).split(' ')[0], sub: 'podaj kwotę i rozdziel ' + app.goals.status.percent + '% do ' + app.monthEnd.value, go: () => app.openGoals() })
      if (app.canReview.value && app.reviewItems.value.length) out.push({ key: 'rev', icon: 'megaphone', title: 'Do zatwierdzenia: ' + app.reviewItems.value.length, sub: 'zgłoszenia czekają na decyzję', go: () => document.querySelector('.kh-web .kh-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })
      return out
    })
    const focus = computed(() => mine.focus.find(f => f.scope === 'day') || mine.focus[0] || null)
    const nextAsb = computed(() => (app.asbPubUpcoming.value || [])[0] || null)
    const recording = computed(() => (app.listenLatest.value?.video ? 'https://www.youtube.com/watch?v=' + app.listenLatest.value.video : ''))
    const streamLink = computed(() => app.listen.value.youtubeMore || app.listen.value.youtube || '')
    // ogłoszenia: lista albo karty (to samo ustawienie co w zakładce Ogłoszenia)
    const annMode = ref((() => { try { return localStorage.getItem('kns-ann-mode') === 'cards' ? 'cards' : 'list' } catch { return 'list' } })())
    watch(annMode, v => { try { localStorage.setItem('kns-ann-mode', v) } catch { /* bez zapamiętania */ } })
    const deckCards = computed(() => app.boardNews.value.map(a => ({ key: a.id, title: a.title, image: a.image || '', color: 'var(--accent)', tag: app.annIsNew(a) ? 'Nowe' : app.AUDIENCE[a.audience] || 'Ogłoszenie', sub: a.text || app.shortDate(a.date) })))
    const openCard = c => { const a = app.boardNews.value.find(x => x.id === c.key); if (a) app.openAnn(a) }
    // „Kazanie”: trwające nabożeństwo (albo to z pytaniami do kazania), a poza tym ostatnie
    const sermonService = computed(() => (app.countdown.value?.live && app.nextService.value) || app.notesService.value || app.lastSermon.value || null)
    // miesiąc w dopełniaczu („listopada”) do biletu
    const monthOf = d => app.asDate(d).toLocaleDateString('pl', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, '')
    // powiększenie zdjęcia
    const lb = ref(null), lbPaused = ref(false)
    const hasThoughts = computed(() => !!(app.lastSermon.value && app.thoughtList(app.lastSermon.value).length))
    const hasPhotos = computed(() => !!(app.heroIsPhoto.value && app.HERO_ART.value.length))
    // relacja: dalej co 5 s (koniec — zamknij), wstecz na pierwszym — zostaje; przytrzymanie wstrzymuje
    let lbTimer = 0
    function lbStep(d) {
      const n = app.HERO_ART.value.length, v = lb.value + d
      lb.value = v >= n ? null : Math.max(0, v)
    }
    const STORY_MS = 5000
    function lbArm() { clearTimeout(lbTimer); if (lb.value !== null && !lbPaused.value) lbTimer = window.setTimeout(() => lbStep(1), STORY_MS) }
    watch([lb, lbPaused], ([v], [old]) => {
      lbArm()
      if (v !== null && old === null) setTimeout(() => document.querySelector('.hm-story')?.focus(), 0)
      document.body.classList.toggle('locked', v !== null)
    })
    const toNotes = () => document.querySelector('.kh-web .sermon-notes, .kh-web .hm-last')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // służby i cele do kolumny „Wspólnota” — gdyby pierwsze wczytanie (zaraz po zalogowaniu) wróciło puste
    onMounted(() => setTimeout(() => { if (app.api.enabled && app.ready.value) { if (!app.serve.list.length && !app.serve.busy) app.loadServe(); if (!app.goals.list.length && !app.goals.busy) app.loadGoals() } }, 2500))
    return { ...app, forYou, focus, nextAsb, recording, streamLink, roleOn, annMode, deckCards, openCard, toNotes, sermonService, monthOf, lb, lbStep, lbPaused, hasThoughts, hasPhotos }
  },
})
</script>

<template>
  <!-- Strona startowa (komputer i telefon): powitanie, skróty, myśli z kazania, „Dla Ciebie”, nabożeństwo i ponumerowane sekcje. -->
  <div class="kh kh-web">
    <div class="kh-hello hm-hello">
      <h1><span class="hm-dim">{{ greeting }}{{ firstName ? ',' : '' }}</span> {{ firstName || '' }}</h1>
      <p>Oto co dzieje się w kościele.</p>
    </div>

    <!-- telefon: najczęstsze rzeczy pod kciukiem -->
    <nav class="hm-quick" aria-label="Skróty">
      <button v-if="sermonService" @click="open(sermonService)"><svg class="i"><use href="#book"/></svg>Kazanie</button>
      <button @click="openPray"><svg class="i"><use href="#heart"/></svg>Modlitwa</button>
      <button @click="openAnns"><svg class="i"><use href="#megaphone"/></svg>Ogłoszenia</button>
      <button @click="openServe('mine')"><svg class="i"><use href="#serve"/></svg>Grafik</button>
    </nav>

    <SermonNotes v-if="notesService" :service="notesService" />

    <!-- ostatnia niedziela: myśli z kazania (na samej górze, żeby każdy szybko je dostał) i mozaika zdjęć -->
    <section v-if="hasThoughts || hasPhotos" class="kh-panel hm-last" :class="{ 'kh-thoughts': hasThoughts, 'has-ph': hasPhotos }">
      <div class="hm-last-text">
        <div class="kh-panel-h"><h2>{{ hasThoughts ? 'Myśli z kazania' : 'Ostatnia niedziela' }}</h2><span class="kh-muted">{{ shortDate(hasThoughts ? lastSermon.date : photos?.date || '') }}</span><span class="kh-spacer"></span><button v-if="hasThoughts && canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
        <template v-if="hasThoughts">
          <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> · {{ lastSermon.speaker }}</template></p>
          <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
        </template>
        <p v-else class="kh-th-sermon">Zdjęcia z nabożeństwa. Kliknij, żeby obejrzeć wszystkie.</p>
        <a v-if="recording" class="hm-pill" :href="recording" target="_blank" rel="noopener"><svg class="i"><use href="#play"/></svg>Nagranie kazania</a>
      </div>
      <div v-if="hasPhotos" class="hm-mosaic" :class="'n' + Math.min(HERO_ART.length, 3)">
        <button v-for="(u, i) in HERO_ART.slice(0, 3)" :key="u" class="hm-ph" :aria-label="'Zdjęcie ' + (i + 1) + ' z ' + HERO_ART.length" @click="lb = i">
          <img :src="u" alt="" loading="lazy">
          <span v-if="i === 2 && HERO_ART.length > 3" class="hm-more">+{{ HERO_ART.length - 3 }}</span>
        </button>
      </div>
    </section>
    <!-- zdjęcia na cały ekran jak relacja: pasek postępu, same przechodzą dalej; stuknięcie w lewą/prawą część — wstecz/dalej -->
    <div v-if="lb !== null" class="hm-story" role="dialog" aria-modal="true" aria-label="Zdjęcia z ostatniego nabożeństwa" tabindex="-1" @keydown.esc="lb = null" @keydown.left="lbStep(-1)" @keydown.right="lbStep(1)">
      <div class="hm-st-bars"><i v-for="(u, i) in HERO_ART" :key="u" :class="{ done: i < lb }"><b v-if="i === lb" :key="'b' + lb" :class="{ run: !lbPaused }"></b></i></div>
      <div class="hm-st-top"><b>Ostatnia niedziela</b><small v-if="photos?.date">{{ shortDate(photos.date) }}</small><button class="hm-st-x" aria-label="Zamknij" @click="lb = null"><svg class="i"><use href="#x"/></svg></button></div>
      <img :src="HERO_ART[lb]" alt="" @pointerdown="lbPaused = true" @pointerup="lbPaused = false" @pointerleave="lbPaused = false">
      <button class="hm-st-tap prev" aria-label="Poprzednie zdjęcie" @click="lbStep(-1)"></button>
      <button class="hm-st-tap next" aria-label="Następne zdjęcie" @click="lbStep(1)"></button>
    </div>

    <!-- 1. Dla Ciebie: to, co czeka właśnie na tę osobę -->
    <section v-if="api.enabled" class="hm-sec hm-for">
      <h3 class="hw-h"><span class="hw-step">1</span>Dla Ciebie<small v-if="forYou.length">{{ forYou.length }}</small></h3>
      <div v-if="forYou.length" class="hm-for-list">
        <button v-for="it in forYou" :key="it.key" class="hm-for-it" @click="it.go()">
          <span class="hm-for-ic"><svg class="i"><use :href="'#' + it.icon"/></svg></span>
          <span class="hw-row-text"><b>{{ it.title }}</b><small>{{ it.sub }}</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
      </div>
      <p v-else class="hm-calm">Nic na Ciebie nie czeka. Dobrego tygodnia!</p>
    </section>

    <!-- komunikaty rady: baner -->
    <button v-for="a in importantAnns" :key="a.id" class="hw-banner" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
      <span class="hw-banner-ic"><svg class="i"><use href="#megaphone"/></svg></span>
      <span class="hw-banner-text"><small>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em></small><b>{{ a.title }}</b><span>{{ a.text }}</span></span>
      <span class="hw-go">Czytaj<svg class="i"><use href="#chev"/></svg></span>
    </button>

    <!-- 2. najbliższe nabożeństwo: przed (rola, skróty), w trakcie (transmisja, notatki) -->
    <section class="hm-sec">
      <h3 class="hw-h"><span class="hw-step">2</span>{{ countdown?.live ? 'Teraz' : 'Najbliższe nabożeństwo' }}</h3>
      <!-- bilet: data w odcinku, obok temat i szczegóły -->
      <article v-if="nextService" class="hm-ticket" :class="{ live: countdown?.live }">
        <div class="hm-stub">
          <small>{{ asDate(nextService.date).toLocaleDateString('pl', { weekday: 'long' }) }}</small>
          <b>{{ asDate(nextService.date).getDate() }}</b>
          <span>{{ monthOf(nextService.date) }}</span>
          <em>{{ nextService.time || DEFAULT_TIME }}</em>
        </div>
        <div class="hm-tk-body">
          <span class="hm-tk-kick"><i v-if="countdown?.live" class="hm-dot"></i>{{ countdown?.live ? 'Trwa teraz' : 'Najbliższe nabożeństwo · ' + untilText }}</span>
          <h3>{{ nextService.sermonTitle || 'Nabożeństwo' }}</h3>
          <p>{{ [nextService.passage, nextService.speaker, nextService.place || DEFAULT_PLACE].filter(Boolean).join(' · ') }}</p>
          <p v-if="canEdit" class="hm-prep" :class="missing(nextService).length ? 'bad' : 'ok'">{{ missing(nextService).length ? 'Brakuje: ' + missing(nextService).join(', ') : 'Przygotowanie: komplet' }}</p>
          <div class="hm-acts">
            <a v-if="countdown?.live && streamLink" class="button primary" :href="streamLink" target="_blank" rel="noopener"><svg class="i"><use href="#play"/></svg>Oglądaj transmisję</a>
            <button v-if="countdown?.live && notesService" class="hm-pill" @click="toNotes"><svg class="i"><use href="#book"/></svg>Notatki i pytania</button>
            <button class="hm-pill" @click="open(nextService)">{{ canEdit && missing(nextService).length ? 'Uzupełnij nabożeństwo' : 'Zobacz nabożeństwo' }}<svg class="i"><use href="#chev"/></svg></button>
            <span v-if="roleOn(nextService.date).length" class="hm-role"><svg class="i"><use href="#serve"/></svg>Twoja służba: <b>{{ roleOn(nextService.date).join(', ') }}</b></span>
          </div>
        </div>
      </article>
      <article v-else-if="canEdit" class="hm-ticket">
        <div class="hm-stub">
          <small>niedziela</small>
          <b>{{ asDate(planSunday).getDate() }}</b>
          <span>{{ monthOf(planSunday) }}</span>
          <em>{{ DEFAULT_TIME }}</em>
        </div>
        <div class="hm-tk-body">
          <span class="hm-tk-kick">Jeszcze nie zaplanowane</span>
          <h3>Następne nabożeństwo</h3>
          <p>Dodaj datę, kazanie i pieśni.</p>
          <div class="hm-acts"><button class="hm-pill" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Zaplanuj na {{ shortDate(planSunday) }}</button></div>
        </div>
      </article>
      <!-- bez zaplanowanego nabożeństwa (członek) -->
      <div v-else class="hm-none-svc">
        <b>Niedziela, {{ shortDate(planSunday) }}, {{ DEFAULT_TIME }}</b>
        <span>{{ DEFAULT_PLACE }} · szczegóły pojawią się wkrótce</span>
      </div>
    </section>

    <section v-if="reviewItems.length" class="kh-panel kh-review">
      <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
      <div class="kh-anns">
        <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
          <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
          <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
          <small class="kh-wait">czeka</small>
        </button>
      </div>
    </section>

    <!-- 3–5: ogłoszenia, tydzień, wspólnota -->
    <div class="hw-cols">
      <section class="hw-col">
        <h3 class="hw-h"><span class="hw-step">3</span>Ogłoszenia<small v-if="newAnnCount" class="hm-new">{{ newAnnCount }} {{ newAnnCount === 1 ? 'nowe' : 'nowych' }}</small>
          <span class="hm-seg" role="group" aria-label="Widok ogłoszeń"><button :class="{ on: annMode === 'list' }" :aria-pressed="annMode === 'list'" title="Lista" @click="annMode = 'list'"><svg class="i"><use href="#list"/></svg></button><button :class="{ on: annMode === 'cards' }" :aria-pressed="annMode === 'cards'" title="Karty" @click="annMode = 'cards'"><svg class="i"><use href="#image"/></svg></button></span>
        </h3>
        <div v-if="annMode === 'cards' && boardNews.length" class="hm-deck"><CardDeck :cards="deckCards" label="Ogłoszenia" @open="openCard" /></div>
        <template v-else>
          <button v-for="a in boardNews.slice(0, 5)" :key="a.id" class="hw-row" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
            <img v-if="a.image" class="hw-thumb" :src="a.image" alt="" loading="lazy"><span v-else class="hw-thumb hm-thumb"><svg class="i"><use :href="a.video ? '#play' : '#megaphone'"/></svg></span>
            <span class="hw-row-text"><b>{{ a.title }}</b><small>{{ shortDate(a.date) }}</small></span>
            <em v-if="annIsNew(a)" class="hm-new-tag">Nowe</em>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
        </template>
        <p v-if="!boardNews.length" class="hw-none">Nie ma nowych ogłoszeń.</p>
        <button class="hw-link" @click="openAnns">Wszystkie ogłoszenia<template v-if="boardMore.n"> ({{ boardAll.length }})</template><svg class="i"><use href="#chev"/></svg></button>
      </section>
      <section class="hw-col">
        <h3 class="hw-h"><span class="hw-step">4</span>Ten tydzień<small>{{ weekRange }}</small></h3>
        <template v-for="d in weekDays" :key="d.date">
          <button v-for="it in d.items" :key="it.kind + it.id" class="hw-row hw-ev" :class="{ today: d.date === todayStr }" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
            <span class="hw-day"><small>{{ d.date === todayStr ? 'dziś' : d.wd }}</small><b>{{ d.n }}</b></span>
            <span class="hw-row-text"><b>{{ it.kind === 'service' ? 'Nabożeństwo' : it.title }}</b><small><i></i>{{ it.time || 'cały dzień' }} · {{ typeOf(it.type).name }}</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
        </template>
        <p v-if="!weekDays.some(d => d.items.length)" class="hw-none">Spokojny tydzień, nic nie zaplanowano.</p>
        <div class="hw-links">
          <button class="hw-link" @click="openCalendar">Kalendarz<svg class="i"><use href="#chev"/></svg></button>
          <button v-if="canSubmit" class="hw-link" title="Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza, wszyscy zobaczą zaproszenie." @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>Zaproś na swoje wydarzenie</button>
        </div>
      </section>
      <section v-if="api.enabled" class="hw-col">
        <h3 class="hw-h"><span class="hw-step">5</span>Wspólnota</h3>
        <button v-if="focus" class="hm-focus" @click="openPray">
          <small>{{ focus.scope === 'week' ? 'Modlitwa na ten tydzień' : 'Modlitwa na dziś' }}</small>
          <span>{{ focus.text }}</span>
        </button>
        <button v-for="g in goals.list.filter(x => !x.closed).slice(0, 1)" :key="g.id" class="hw-row hw-goal" @click="openGoals(g.id)">
          <span class="hw-row-text"><b>{{ g.title }}</b><span class="hw-bar"><i :style="{ width: goalPct(g) + '%' }"></i></span><small>{{ zl(g.confirmed) }} z {{ zl(g.target) }} · {{ goalPct(g) }}%</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <button v-for="m in seekingAll.slice(0, 2)" :key="m.id" class="hw-row" @click="openMinistry(m)">
          <span class="hw-thumb"><svg class="i"><use href="#serve"/></svg></span>
          <span class="hw-row-text"><b>{{ m.name }}</b><small>szuka chętnych{{ m.mine === 'active' ? ' · służysz tu' : m.mine === 'pending' ? ' · zgłoszono' : '' }}</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <button v-if="nextAsb" class="hw-row" @click="openAsbMeeting(nextAsb.id)">
          <span class="hw-day"><small>ASB</small><b>{{ asDate(nextAsb.date).getDate() }}</b></span>
          <span class="hw-row-text"><b>{{ nextAsb.topic || 'Spotkanie ASB' }}</b><small>{{ [wd(nextAsb.date), nextAsb.time, nextAsb.place].filter(Boolean).join(' · ') }}</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <div class="hw-links">
          <button class="hw-link" @click="openGoals()">Cele wsparcia<svg class="i"><use href="#chev"/></svg></button>
          <button class="hw-link" @click="openServe">Zaangażuj się<svg class="i"><use href="#chev"/></svg></button>
        </div>
      </section>
    </div>
  </div>

  <div class="phone-home">
  <div class="hello">
    <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
    <p>Oto co dzieje się w kościele.</p>
  </div>
  <button v-if="goalDue" class="goal-banner" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span><b>Cele wsparcia — {{ monthName(goalDue.month) }}</b><small>Podaj wpłaconą dziesięcinę i rozdziel {{ goals.status.percent }}% na cele — miesiąc zamknie się sam {{ monthEnd }}.</small></span><svg class="i chev"><use href="#chev"/></svg></button>
  <SermonNotes v-if="notesService" :service="notesService" />
  <section v-if="lastSermon && thoughtList(lastSermon).length" class="kh-panel kh-thoughts phone-thoughts">
    <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ shortDate(lastSermon.date) }}</span><span class="kh-spacer"></span><button v-if="canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
    <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> — {{ lastSermon.speaker }}</template></p>
    <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
  </section>
  <section v-if="reviewItems.length" class="kh-panel kh-review phone-thoughts">
    <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
    <div class="kh-anns">
      <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
        <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
        <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
        <small class="kh-wait">czeka</small>
      </button>
    </div>
  </section>

  <div class="start-top">
    <button v-if="nextService" class="hero" :class="{ live: countdown?.live }" @click="open(nextService)">
      <span class="hero-top">
        <span v-if="countdown?.live" class="cd-live"><i class="cd-dot"></i>W TRAKCIE</span>
        <span v-else class="hero-cd">Najbliższe nabożeństwo · {{ untilText }}</span>
      </span>
      <b class="hero-when">{{ pretty(nextService.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) }}, {{ nextService.time || DEFAULT_TIME }}</b>
      <span class="hero-place">{{ nextService.place || DEFAULT_PLACE }}</span>
      <span v-if="nextService.sermonTitle || nextService.passage" class="hero-sermon">{{ [nextService.sermonTitle, nextService.passage].filter(Boolean).join(' · ') }}<template v-if="nextService.speaker"> — {{ nextService.speaker }}</template></span>
      <span v-if="canEdit" class="chips">
        <span v-if="!missing(nextService).length" class="chip good"><svg class="i"><use href="#check"/></svg>Komplet</span>
        <span v-for="m in missing(nextService)" :key="m" class="chip"><svg class="i"><use href="#warn"/></svg>brak: {{ m }}</span>
      </span>
    </button>
    <div v-else-if="canEdit" class="hero empty-hero">
      <b>Nie ma zaplanowanego nabożeństwa</b>
      <span class="hero-place">Na niedzielę {{ pretty(planSunday).replace(/^niedziela, /, '') }} nic jeszcze nie ma.</span>
      <button class="primary" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Utwórz nabożeństwo</button>
    </div>

    <div v-if="importantAnns.length" class="notices" :class="{ single: importantAnns.length === 1 }" aria-label="Komunikaty rady zboru">
      <button v-for="a in importantAnns" :key="a.id" class="notice" @click="openAnn(a)">
        <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
        <span class="notice-tag"><svg class="i"><use href="#megaphone"/></svg>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></span>
        <b>{{ a.title }}</b>
        <span class="notice-text">{{ a.text }}</span>
      </button>
    </div>
  </div>

  <div class="start-panels">
    <section class="sp-week">
      <div class="section"><h2>Ten tydzień</h2><button class="ghost" @click="openCalendar">Kalendarz</button></div>
      <!-- telefon: lista -->
      <p v-if="!weekItems.length" class="note week-list-only">W najbliższych dniach nic nie zaplanowano.</p>
      <div v-else class="week week-list-only">
        <button v-for="it in weekItems" :key="it.kind + it.id" class="week-row" @click="openItem(it)">
          <span class="week-day" :class="{ today: it.date === todayStr }">{{ dayLabel(it.date) }}</span>
          <i class="week-dot" :style="{ background: typeOf(it.type).color }"></i>
          <span class="week-title">{{ it.title }}</span>
          <span class="week-time">{{ it.time }}</span>
        </button>
      </div>
      <div v-if="canSubmit" class="invite invite-week"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
    </section>


    <section class="sp-news">
      <div class="section"><h2>Z newslettera</h2><button class="ghost" @click="openAnns">{{ canAnnounce ? 'Wszystkie / dodaj' : 'Wszystkie' }}</button></div>
      <p v-if="!homeAnns.length" class="note">Nie ma nowych ogłoszeń.</p>
      <div v-else class="news-grid">
        <button v-for="a in homeAnns" :key="a.id" class="news-card" @click="openAnn(a)">
          <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
          <b><svg v-if="a.pinned" class="i kh-pin"><use href="#pin"/></svg>{{ a.title }}<em v-if="a.video" class="kh-film">▶ Film</em></b>
          <span>{{ a.text }}</span>
          <small>{{ shortDate(a.date) }}</small>
        </button>
      </div>
    </section>
  </div>
  </div>
</template>

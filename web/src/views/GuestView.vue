<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import CardDeck from '@/components/CardDeck.vue'

// Strona dla gości (bez logowania): najbliższe nabożeństwo z odliczaniem, kalendarz nadchodzących wydarzeń publicznych,
// talia wydarzeń i ogłoszeń; „Odkryj nas” (PublicListen) pod spodem. Logowanie — osobny, prosty ekran (przycisk u góry).
export default defineComponent({
  components: { CardDeck },
  setup() {
    const app = useApp()
    // najbliższe nabożeństwo z bazy (public_preview), a bez danych — odliczanie do niedzieli
    const svc = computed(() => (app.pub.value?.services || []).find(s => s.date >= app.todayStr.value) || null)
    const svcWhen = computed(() => (svc.value ? app.pretty(svc.value.date) + ', ' + (svc.value.time || app.DEFAULT_TIME) : app.countdown.value?.when || ''))
    const svcPlace = computed(() => svc.value?.place || app.countdown.value?.place || app.DEFAULT_PLACE)
    // kalendarz: kolejne tygodnie z wydarzeniami (bez najbliższego nabożeństwa — jest wyżej)
    const agenda = computed(() => {
      const groups = []
      for (const it of app.pubItems.value) {
        if (it.date < app.todayStr.value) continue
        const key = it.date.slice(0, 7)
        let g = groups.find(x => x.key === key)
        if (!g) groups.push(g = { key, name: new Date(it.date + 'T12:00').toLocaleDateString('pl', { month: 'long', year: 'numeric' }), items: [] })
        g.items.push(it)
      }
      return groups.slice(0, 3)
    })
    return { ...app, svc, svcWhen, svcPlace, agenda }
  },
})
</script>

<template>
  <div class="guest">
    <header class="guest-top">
      <img src="znak.png" alt="">
      <b>Kościół Na Skale</b>
      <span class="guest-sp"></span>
      <button class="primary small" @click="loginView = true">Zaloguj się</button>
    </header>

    <!-- najbliższe nabożeństwo -->
    <section class="guest-svc" aria-label="Najbliższe nabożeństwo">
      <small class="guest-kicker">{{ countdown?.live ? 'Trwa teraz' : 'Najbliższe nabożeństwo' }}</small>
      <h1>{{ svc?.sermonTitle || 'Nabożeństwo' }}</h1>
      <p v-if="svc && (svc.passage || svc.speaker)" class="guest-sub">{{ [svc.passage, svc.speaker].filter(Boolean).join(' — ') }}</p>
      <div v-if="countdown && !countdown.live" class="guest-cd" aria-label="Do nabożeństwa">
        <span v-if="countdown.days"><b>{{ countdown.days }}</b><small>{{ countdown.days === 1 ? 'dzień' : 'dni' }}</small></span>
        <span><b>{{ countdown.hours }}</b><small>godz</small></span><span><b>{{ countdown.minutes }}</b><small>min</small></span><span><b>{{ countdown.seconds }}</b><small>s</small></span>
      </div>
      <p class="guest-when">{{ svcWhen }} · {{ svcPlace }}</p>
      <a v-if="mapLink(svcPlace)" class="button small" :href="mapLink(svcPlace)" target="_blank" rel="noopener"><svg class="i"><use href="#pin"/></svg>Jak dojechać</a>
    </section>

    <!-- wydarzenia i ogłoszenia jako talia -->
    <section v-if="guestDeck" class="guest-deck" aria-label="Co się u nas dzieje">
      <h2 class="guest-h">Co się u nas dzieje</h2>
      <nav v-if="guestCats.length > 1" class="deck-words" aria-label="Kategoria">
        <button v-for="c in guestCats" :key="c.id" :class="{ on: guestDeck.id === c.id }" :aria-pressed="guestDeck.id === c.id" @click="guestCat = c.id">{{ c.name }}</button>
      </nav>
      <CardDeck :key="guestDeck.id" :cards="guestDeck.cards" :label="guestDeck.name" />
    </section>

    <!-- kalendarz -->
    <section class="guest-cal" aria-label="Kalendarz">
      <h2 class="guest-h">Kalendarz</h2>
      <p v-if="!agenda.length" class="note">Na razie nie ma zaplanowanych wydarzeń dla wszystkich.</p>
      <div v-for="g in agenda" :key="g.key" class="guest-month">
        <h3>{{ g.name }}</h3>
        <div v-for="it in g.items" :key="it.key" class="ev guest-ev" :style="{ '--c': it.color }">
          <span class="when"><small>{{ wd(it.date) }}</small><b>{{ day(it.date) }}</b><small>{{ month(it.date) }}</small></span>
          <span class="body"><b>{{ it.title }}</b><small>{{ it.time || 'cały dzień' }}<template v-if="it.place"> · {{ it.place }}</template></small><small v-if="it.sub" class="guest-ev-sub">{{ it.sub }}</small></span>
        </div>
      </div>
    </section>
  </div>
</template>

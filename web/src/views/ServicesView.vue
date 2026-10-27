<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import StatsPanel from '@/components/StatsPanel.vue'

// Nabożeństwa: zaplanowane (od najbliższego), wolne niedziele z „Zaplanuj”, dowolny inny termin i minione.
export default defineComponent({
  components: { StatsPanel },
  setup() {
    const app = useApp()
    const otherDate = ref('')
    const pastAll = ref(false) // minione widać od razu (ostatnie 8); „Starsze” — do 40
    const upcoming = computed(() => app.services.value.filter(s => s.date >= app.todayStr.value).sort((a, b) => a.date.localeCompare(b.date)))
    const past = computed(() => app.services.value.filter(s => s.date < app.todayStr.value).sort((a, b) => b.date.localeCompare(a.date)).slice(0, pastAll.value ? 40 : 8))
    const pastMore = computed(() => !pastAll.value && app.services.value.filter(s => s.date < app.todayStr.value).length > 8)
    // najbliższe 4 niedziele bez nabożeństwa (dalsze — „Inny termin”)
    const freeSundays = computed(() => {
      const out = [], d = new Date(app.planSunday.value + 'T12:00')
      for (let i = 0; i < 26 && out.length < 4; i++, d.setDate(d.getDate() + 7)) {
        const day = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
        if (!app.services.value.some(s => s.date === day)) out.push(day)
      }
      return out
    })
    const svcTab = ref('list') // „Nabożeństwa” / „Statystyki” (pieśni i kazania)
    return { ...app, otherDate, pastAll, pastMore, upcoming, past, freeSundays, svcTab }
  },
})
</script>

<template>
  <div class="serve-tabs" role="tablist">
    <button role="tab" :aria-selected="svcTab === 'list'" @click="svcTab = 'list'"><svg class="i"><use href="#book"/></svg>Nabożeństwa</button>
    <button role="tab" :aria-selected="svcTab === 'stats'" @click="svcTab = 'stats'"><svg class="i"><use href="#list"/></svg>Statystyki</button>
  </div>
  <StatsPanel v-if="svcTab === 'stats'" />
  <template v-else>
  <div class="section"><h2>Zaplanowane</h2></div>
  <p v-if="!upcoming.length" class="note">Nie ma jeszcze zaplanowanych nabożeństw.</p>
  <button v-for="s in upcoming" :key="s.id" class="ev svc-row" :class="{ next: s.id === nextService?.id }" @click="open(s)">
    <span class="when"><small>{{ wd(s.date) }}</small><b>{{ day(s.date) }}</b><small>{{ month(s.date) }}</small></span>
    <span class="body">
      <b>{{ s.sermonTitle || 'Nabożeństwo' }}</b>
      <small>{{ s.time || DEFAULT_TIME }}<template v-if="s.passage"> · {{ s.passage }}</template><template v-if="s.speaker"> · {{ s.speaker }}</template></small>
      <span v-if="canEdit && missing(s).length" class="tag svc-miss">brakuje: {{ missing(s).join(', ') }}</span>
      <span v-else-if="canEdit" class="tag svc-ok">komplet</span>
    </span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>

  <template v-if="canEdit">
    <div class="section"><h2>Zaplanuj</h2></div>
    <div class="svc-free">
      <button v-for="d in freeSundays" :key="d" class="svc-free-day" :title="'Zaplanuj nabożeństwo: ' + pretty(d)" @click="create(d)"><small>{{ wd(d) }}</small><b>{{ day(d) }}</b><small>{{ month(d) }}</small></button>
    </div>
    <div class="svc-other">
      <label for="svcOther">Inny termin</label>
      <div class="row">
        <input id="svcOther" v-model="otherDate" type="date" :min="todayStr">
        <button class="primary" :disabled="!otherDate || services.some(s => s.date === otherDate)" @click="create(otherDate)"><svg class="i"><use href="#plus"/></svg>Utwórz</button>
      </div>
      <p v-if="otherDate && services.some(s => s.date === otherDate)" class="note">Na ten dzień nabożeństwo już jest — otwórz je z listy.</p>
    </div>
  </template>

  <template v-if="past.length">
    <div class="section"><h2>Minione</h2></div>
    <button v-for="s in past" :key="s.id" class="ev svc-row past" @click="open(s)">
      <span class="when"><small>{{ wd(s.date) }}</small><b>{{ day(s.date) }}</b><small>{{ month(s.date) }}</small></span>
      <span class="body"><b>{{ s.sermonTitle || 'Nabożeństwo' }}</b><small>{{ [s.passage, s.speaker].filter(Boolean).join(' · ') }}</small></span>
      <svg class="i chev"><use href="#chev"/></svg>
    </button>
    <button v-if="pastMore" class="ghost svc-more" @click="pastAll = true">Starsze nabożeństwa<svg class="i"><use href="#down"/></svg></button>
  </template>
  </template>
</template>

<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, ref } from 'vue'
import { useApp } from '@/composables/useApp'

// Nabożeństwa: zaplanowane (od najbliższego), wolne niedziele z „Zaplanuj”, dowolny inny termin i minione.
export default defineComponent({
  setup() {
    const app = useApp()
    const otherDate = ref('')
    const showPast = ref(false)
    const upcoming = computed(() => app.services.value.filter(s => s.date >= app.todayStr.value).sort((a, b) => a.date.localeCompare(b.date)))
    const past = computed(() => app.services.value.filter(s => s.date < app.todayStr.value).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20))
    // najbliższe 8 niedziel bez nabożeństwa
    const freeSundays = computed(() => {
      const out = [], d = new Date(app.planSunday.value + 'T12:00')
      for (let i = 0; i < 26 && out.length < 8; i++, d.setDate(d.getDate() + 7)) {
        const day = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
        if (!app.services.value.some(s => s.date === day)) out.push(day)
      }
      return out
    })
    return { ...app, otherDate, showPast, upcoming, past, freeSundays }
  },
})
</script>

<template>
  <div class="section"><h2>Zaplanowane</h2></div>
  <p v-if="!upcoming.length" class="note">Nie ma jeszcze zaplanowanych nabożeństw.</p>
  <button v-for="s in upcoming" :key="s.id" class="ev svc-row" :class="{ next: s.id === nextService?.id }" @click="open(s)">
    <span class="when"><small>{{ wd(s.date) }}</small><b>{{ day(s.date) }}</b><small>{{ month(s.date) }}</small></span>
    <span class="body">
      <b>{{ s.sermonTitle || 'Nabożeństwo' }}</b>
      <small>{{ s.time || DEFAULT_TIME }}<template v-if="s.passage"> · {{ s.passage }}</template><template v-if="s.speaker"> · {{ s.speaker }}</template></small>
      <span v-if="missing(s).length" class="tag svc-miss">brakuje: {{ missing(s).join(', ') }}</span>
      <span v-else class="tag svc-ok">komplet</span>
    </span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>

  <template v-if="canEdit">
    <div class="section"><h2>Zaplanuj</h2></div>
    <div class="svc-free">
      <button v-for="d in freeSundays" :key="d" class="chipbtn" @click="create(d)"><svg class="i"><use href="#plus"/></svg>{{ wd(d) }} {{ shortDate(d) }}</button>
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
    <div class="section"><h2>Minione</h2><button class="ghost" @click="showPast = !showPast">{{ showPast ? 'Ukryj' : 'Pokaż' }}</button></div>
    <template v-if="showPast">
      <button v-for="s in past" :key="s.id" class="ev svc-row past" @click="open(s)">
        <span class="when"><small>{{ wd(s.date) }}</small><b>{{ day(s.date) }}</b><small>{{ month(s.date) }}</small></span>
        <span class="body"><b>{{ s.sermonTitle || 'Nabożeństwo' }}</b><small>{{ [s.passage, s.speaker].filter(Boolean).join(' · ') }}</small></span>
        <svg class="i chev"><use href="#chev"/></svg>
      </button>
    </template>
  </template>
</template>

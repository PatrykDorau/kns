<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import KnsSky from '@/components/KnsSky.vue'

// Tydzień jak horyzont (znak strony startowej): nad rzędem dni góra KNS, zza której wschodzi słońce z logo —
// tym wyżej, im bliżej do najbliższego nabożeństwa (tydzień przed — schowane za górą, w dniu nabożeństwa — nad
// szczytem). Pod spodem 7 dni od dziś: kropki — wydarzenia, pomarańczowy — dzień nabożeństwa; klik otwiera wydarzenie.
// Słońce to jedyny kolor na stronie startowej (dane: czas do nabożeństwa).
export default defineComponent({
  components: { KnsSky },
  setup() {
    const app = useApp()
    const svc = computed(() => app.nextService.value)
    const col = computed(() => (svc.value ? app.weekDays.value.findIndex(d => d.date === svc.value.date) : -1))
    const hoursLeft = computed(() => (svc.value ? (app.startsAt(svc.value) - app.now.value) / 3600000 : 0))
    const rise = computed(() => (svc.value ? Math.max(0, Math.min(1, 1 - hoursLeft.value / 168)) : 0))
    const caption = computed(() => {
      if (!svc.value || col.value < 0) return 'Nabożeństwo — po tym tygodniu'
      const h = hoursLeft.value
      if (h <= 0) return 'Nabożeństwo trwa'
      if (h < 1) return 'Nabożeństwo za ' + Math.max(1, Math.round(h * 60)) + ' min'
      if (h < 24) return 'Nabożeństwo dziś o ' + (svc.value.time || '')
      const days = Math.round(h / 24)
      return 'Nabożeństwo za ' + days + (days === 1 ? ' dzień' : ' dni') + ' · ' + (svc.value.time || '')
    })
    const pick = d => { const it = d.items.find(x => x.kind === 'service') || d.items[0]; if (it) app.openItem(it) }
    return { ...app, svc, col, rise, caption, pick }
  },
})
</script>

<template>
  <section class="wh" aria-label="Ten tydzień">
    <KnsSky class="wh-sky" :rise="rise" />
    <div class="wh-days">
      <button v-for="(d, i) in weekDays" :key="d.date" class="wh-day" :class="{ today: i === 0, svc: i === col, has: d.items.length }" :disabled="!d.items.length"
              :aria-label="d.wd + ' ' + d.n + (d.items.length ? ': ' + d.items.map(x => x.kind === 'service' ? 'Nabożeństwo' : x.title).join(', ') : ': nic')" @click="pick(d)">
        <small>{{ i === 0 ? 'dziś' : d.wd }}</small>
        <b>{{ d.n }}</b>
        <span class="wh-dots"><i v-for="(it, k) in d.items.slice(0, 3)" :key="k" :class="{ s: it.kind === 'service' }"></i></span>
      </button>
    </div>
    <p class="wh-cap"><b>{{ caption }}</b><span v-if="svc && svc.place"> · {{ svc.place }}</span></p>
  </section>
</template>

<style scoped>
.wh { margin: 0 0 22px; }
.wh-sky { margin: 0 -16px; }
.wh-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.wh-day { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 0; padding: 8px 0 6px; border: 0; border-radius: 12px; background: none !important; color: var(--faint); }
.wh-day:disabled { opacity: 1; cursor: default; }
.wh-day small { font-size: 12px; }
.wh-day b { font-size: 20px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.wh-day.today b, .wh-day.today small { color: var(--text); }
.wh-day.svc b { color: var(--accent-text); }
@media (hover: hover) { .wh-day.has:hover b { color: var(--text); } }
.wh-dots { display: flex; gap: 3px; height: 6px; }
.wh-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); }
.wh-dots i.s { background: var(--accent); }
.wh-cap { margin: 6px 0 0; font-size: 15px; color: var(--muted); }
.wh-cap b { color: var(--text); font-weight: 600; }
@media (min-width: 1024px) { .wh-sky { margin: 0; } .wh-day b { font-size: 24px; } .wh-cap { font-size: 16px; } }
</style>

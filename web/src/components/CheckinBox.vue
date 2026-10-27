<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Meldowanie na spotkaniu („Trwa teraz” i strona spotkania). Spotkanie członkowskie — z kodem, który rada podaje
// na sali; rada i administrator widzą ten kod tutaj. compact — w okienku „Trwa teraz” (bez wycofania).
export default defineComponent({
  props: { ev: { type: Object, required: true }, compact: Boolean },
  setup() { return useApp() },
})
</script>

<template>
  <p v-if="attendance[ev.id]?.code" class="ci-code">Kod spotkania: <b>{{ attendance[ev.id].code }}</b><small>podaj go obecnym (np. na rzutniku) — bez niego nie da się zameldować</small>
    <button v-if="attendance[ev.id].blocked" class="small" type="button" @click="codeReset(ev)">Odblokuj meldowanie ({{ attendance[ev.id].blocked }} {{ attendance[ev.id].blocked === 1 ? 'osoba' : 'osoby' }} po błędnych kodach)</button></p>
  <template v-if="canCheckIn(ev)">
    <form v-if="!attendance[ev.id]?.me" class="ci-row" @submit.prevent="checkIn(ev)">
      <input v-if="needsCode(ev)" v-model="checkinCode[ev.id]" class="ci-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Kod z sali" aria-label="Kod spotkania">
      <button class="primary" type="submit" :disabled="checkinBusy || (needsCode(ev) && String(checkinCode[ev.id] || '').trim().length < 4)"><svg class="i"><use href="#check"/></svg>{{ checkinBusy ? 'Melduję…' : 'Zamelduj się' }}</button>
    </form>
    <span v-else-if="compact" class="le-in"><svg class="i"><use href="#check"/></svg>Jesteś zameldowany(a)</span>
    <button v-else class="ghost" type="button" :disabled="checkinBusy" @click="checkIn(ev, false)">Wycofaj zameldowanie</button>
    <small v-if="checkinMsg[ev.id]" class="error ci-msg" role="alert">{{ checkinMsg[ev.id] }}</small>
  </template>
</template>

<style scoped>
.ci-code { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--panel2); }
.ci-code b { font-size: 28px; letter-spacing: .25em; font-variant-numeric: tabular-nums; color: var(--accent-text); }
.ci-code small { color: var(--muted); font-size: 12.5px; }
.ci-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0; }
.ci-input { width: 120px; margin: 0; text-align: center; font-size: 18px; letter-spacing: .3em; font-variant-numeric: tabular-nums; }
.ci-msg { flex-basis: 100%; }
</style>

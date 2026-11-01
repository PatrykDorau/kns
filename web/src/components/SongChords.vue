<script setup lang="ts">
import { computed, ref } from 'vue'
import { lineKey, setChord, tokens, usedChords } from '@/services/chords'

// Akordy pieśni: stuknięcie w słowo otwiera wybór akordu, który stanie nad tym słowem.
const props = defineProps<{ song: { chords?: Record<string, Record<string, string>> }, parts: { name: string, chorus: boolean, lines: string[] }[], disabled?: boolean }>()
const COMMON = ['C', 'D', 'Dm', 'E', 'Em', 'F', 'G', 'A', 'Am', 'H', 'Hm', 'B']
const pick = ref<{ line: string, pos: number, word: string, chord: string } | null>(null)
const typed = ref('')
const used = computed(() => usedChords(props.song.chords || {}))
const rest = computed(() => COMMON.filter(c => !used.value.includes(c)))
const marks = (line: string) => props.song.chords?.[lineKey(line)] || {}
function open(line: string, t: { pos: number, text: string, chord: string }) { if (props.disabled) return; pick.value = { line, pos: t.pos, word: t.text, chord: t.chord }; typed.value = t.chord }
function apply(chord: string) {
  if (!props.song.chords) props.song.chords = {}
  setChord(props.song.chords, pick.value.line, pick.value.pos, chord.trim())
  pick.value = null
}
</script>

<template>
  <div class="ch">
    <p v-if="!parts.length" class="note">Najpierw dodaj tekst pieśni.</p>
    <p v-else class="note">Stuknij słowo, nad którym ma być akord. Akordy widać tylko w aplikacji, na rzutnik nie trafiają. Zmiana treści linijki usuwa jej akordy.</p>
    <section v-for="(p, i) in parts" :key="i" class="ch-part" :class="{ chorus: p.chorus }">
      <small>{{ p.name }}</small>
      <p v-for="(l, k) in p.lines" :key="k" class="ch-line">
        <button v-for="t in tokens(l, marks(l))" :key="t.pos" type="button" class="ch-word" :class="{ on: t.chord }" :disabled="disabled" :aria-label="(t.chord ? 'Akord ' + t.chord + ' nad słowem ' : 'Dodaj akord nad słowem ') + t.text" @click="open(l, t)"><b>{{ t.chord || '+' }}</b><span>{{ t.text }}</span></button>
      </p>
    </section>

    <div v-if="pick" class="np-overlay ch-over" @click.self="pick = null">
      <div class="ch-sheet" role="dialog" aria-modal="true" :aria-label="'Akord nad słowem ' + pick.word">
        <b>Akord nad „{{ pick.word }}”</b>
        <div v-if="used.length" class="ch-chips"><small>W tej pieśni</small><button v-for="c in used" :key="c" type="button" @click="apply(c)">{{ c }}</button></div>
        <div class="ch-chips"><small>Częste</small><button v-for="c in rest" :key="c" type="button" @click="apply(c)">{{ c }}</button></div>
        <form class="ch-own" @submit.prevent="apply(typed)">
          <input v-model="typed" maxlength="12" placeholder="Inny, np. Fis7" aria-label="Własny akord" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button type="submit" class="primary" :disabled="!typed.trim()">Wstaw</button>
        </form>
        <div class="ch-acts">
          <button v-if="pick.chord" type="button" class="ghost" @click="apply('')"><svg class="i"><use href="#trash"/></svg>Usuń akord</button>
          <button type="button" class="ghost" @click="pick = null">Anuluj</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ch-part { margin: 0 0 12px; padding: 12px 14px; border-radius: 16px; background: var(--panel); }
.ch-part.chorus { background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
.ch-part > small { display: block; margin-bottom: 6px; color: var(--muted); font-size: 13px; }
.ch-line { display: flex; flex-wrap: wrap; column-gap: 6px; margin: 0 0 6px; }
.ch-word { display: inline-flex; flex-direction: column; align-items: flex-start; min-height: 48px; padding: 2px 4px; border: 0; border-radius: 8px; background: none !important; color: var(--text); font-size: 17px; font-weight: 400; line-height: 1.3; }
.ch-word b { min-height: 18px; color: var(--faint); font-size: 13px; font-weight: 500; line-height: 18px; }
.ch-word.on b { color: var(--accent-text); font-size: 14px; font-weight: 700; }
.ch-word:not(:disabled):active { background: var(--panel2) !important; }
.ch-over { z-index: 70; }
.ch-sheet { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 520px; padding: 18px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: var(--panel); }
.ch-sheet > b { font-size: 17px; }
.ch-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ch-chips small { flex: 0 0 100%; color: var(--muted); font-size: 13px; }
.ch-chips button { min-width: 52px; min-height: 44px; padding: 6px 12px; border-radius: 12px; background: var(--panel2) !important; font-size: 16px; font-weight: 600; }
.ch-own { display: flex; gap: 8px; }
.ch-own input { flex: 1; min-width: 0; }
.ch-acts { display: flex; justify-content: flex-end; gap: 8px; }
.ch-acts .ghost { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; }
.ch-acts svg.i { width: 16px; height: 16px; }
</style>

<script setup lang="ts">
import { ask } from '@/utils/ask'
import { nextTick, ref, watch } from 'vue'

// Tekst pieśni jako lista slajdów (zwrotki, refren…): każdy slajd osobno, ze skrótem klawisza na rzutniku.
// Zapis zostaje ten sam co dotąd (wspólny z aplikacją na komputer): slajdy oddzielone pustą linią,
// skrót na początku slajdu, np. „[R] ”. Wklejony tekst z pustymi liniami sam dzieli się na slajdy.
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

interface Slide { id: number; key: string; text: string }
const SHORTCUT = /^\[([^\]\s]{1,3})\][ \t]*/
let nextId = 1
const parse = (t: string): Slide[] => String(t || '').split(/\n[ \t]*\n/).map(v => v.replace(/^\n+|\s+$/g, '')).filter(v => v.trim()).map(v => {
  const m = SHORTCUT.exec(v)
  return { id: nextId++, key: m ? m[1] : '', text: (m ? v.slice(m[0].length) : v).replace(/^\n/, '') }
})
const serialize = (list: Slide[]) => list.filter(s => s.text.trim()).map(s => (s.key.trim() ? `[${s.key.trim()}] ` : '') + s.text.trim().replace(/\n[ \t]*\n+/g, '\n')).join('\n\n')

const slides = ref<Slide[]>(parse(props.modelValue))
const raw = ref(false) // edycja całego tekstu naraz (np. wklejenie pieśni)
watch(() => props.modelValue, v => { if (v !== serialize(slides.value)) slides.value = parse(v) })
const push = () => emit('update:modelValue', serialize(slides.value))

const SUGGEST = [['', 'bez skrótu'], ['R', 'refren'], ['B', 'bridge'], ['P', 'przejście'], ['K', 'koniec']]
const lines = (s: Slide) => s.text.split('\n').filter(l => l.trim()).length
const label = (s: Slide, i: number) => ({ R: 'Refren', B: 'Bridge', P: 'Przejście', K: 'Zakończenie' })[s.key.toUpperCase()] || (s.key ? 'Slajd ' + s.key : 'Slajd ' + (i + 1))

function focusAt(i: number) { nextTick(() => (document.querySelectorAll('.song-slides .ss-text')[i] as HTMLTextAreaElement)?.focus()) }
function add(at = slides.value.length, copy?: Slide) {
  slides.value.splice(at, 0, { id: nextId++, key: copy?.key || '', text: copy?.text || '' })
  push(); focusAt(at)
}
async function remove(i: number) {
  if (slides.value[i].text.trim() && !(await ask('Usunąć ten slajd?'))) return
  slides.value.splice(i, 1); push()
}
function move(i: number, d: number) {
  const j = i + d, list = slides.value
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]; push()
}
// po wyjściu z pola: pusta linia w środku slajdu dzieli go na kilka (np. wklejona cała pieśń)
function splitOnBlur(i: number) {
  const s = slides.value[i]
  if (!/\n[ \t]*\n/.test(s.text.trim())) return
  const parts = parse(s.text)
  if (parts.length > 1) { parts[0].key = s.key; slides.value.splice(i, 1, ...parts); push() }
}
const rows = (s: Slide) => Math.max(2, s.text.split('\n').length + 1)
const rawText = ref('')
function toggleRaw() {
  if (!raw.value) rawText.value = serialize(slides.value)
  else { slides.value = parse(rawText.value); push() }
  raw.value = !raw.value
}
watch(rawText, v => { if (raw.value) emit('update:modelValue', v) })
</script>

<template>
  <div class="song-slides" :class="{ disabled }">
    <div class="ss-top">
      <span class="ss-count">{{ slides.length }} {{ slides.length === 1 ? 'slajd' : slides.length < 5 && slides.length > 1 ? 'slajdy' : 'slajdów' }}</span>
      <button type="button" class="ghost ss-mode" :disabled="disabled" @click="toggleRaw">{{ raw ? 'Edytuj slajdami' : 'Edytuj jako tekst' }}</button>
    </div>
    <template v-if="raw">
      <textarea v-model="rawText" class="songtext" spellcheck="false" :disabled="disabled" placeholder="Pierwsza zwrotka…&#10;&#10;[R] Refren…"></textarea>
      <p class="note">Pusta linia oddziela slajdy; skrót na początku slajdu, np. <b>[R]</b>.</p>
    </template>
    <template v-else>
      <div v-for="(s, i) in slides" :key="s.id" class="ss-card" :class="{ long: lines(s) > 6 }">
        <div class="ss-head">
          <span class="ss-n">{{ i + 1 }}</span>
          <b class="ss-name">{{ label(s, i) }}</b>
          <label class="ss-key" title="Skrót klawisza na rzutniku (np. R — refren)">
            <span>skrót</span>
            <input v-model="s.key" maxlength="3" list="ss-keys" :disabled="disabled" :aria-label="'Skrót slajdu ' + (i + 1)" autocomplete="off" @input="push">
          </label>
          <span class="ss-tools">
            <button type="button" class="icon" :disabled="disabled || i === 0" title="Wyżej" aria-label="Przesuń wyżej" @click="move(i, -1)"><svg class="i"><use href="#up"/></svg></button>
            <button type="button" class="icon" :disabled="disabled || i === slides.length - 1" title="Niżej" aria-label="Przesuń niżej" @click="move(i, 1)"><svg class="i"><use href="#down"/></svg></button>
            <button type="button" class="icon" :disabled="disabled" title="Powtórz ten slajd (np. refren) poniżej" aria-label="Powtórz slajd" @click="add(i + 1, s)"><svg class="i"><use href="#plus"/></svg></button>
            <button type="button" class="icon" :disabled="disabled" title="Usuń slajd" aria-label="Usuń slajd" @click="remove(i)"><svg class="i"><use href="#x"/></svg></button>
          </span>
        </div>
        <textarea v-model="s.text" class="ss-text" :rows="rows(s)" spellcheck="false" :disabled="disabled" :placeholder="i === 0 ? 'Pierwsza zwrotka — każda linijka w osobnym wierszu' : 'Tekst slajdu'" @input="push" @blur="splitOnBlur(i)"></textarea>
        <small class="ss-info">{{ lines(s) }} {{ lines(s) === 1 ? 'linijka' : lines(s) < 5 && lines(s) > 1 ? 'linijki' : 'linijek' }}<template v-if="lines(s) > 6"> · długi slajd — rzutnik zmniejszy tekst (rozważ podział)</template></small>
      </div>
      <button type="button" class="ss-add" :disabled="disabled" @click="add()"><svg class="i"><use href="#plus"/></svg>Dodaj slajd</button>
      <datalist id="ss-keys"><option v-for="[k, n] in SUGGEST.slice(1)" :key="k" :value="k">{{ n }}</option></datalist>
    </template>
  </div>
</template>

<style scoped>
.song-slides { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
.ss-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ss-count { color: var(--muted); font-size: 13px; font-weight: 600; }
.ss-mode { min-height: 34px; padding: 4px 12px; font-size: 13px; }
.ss-card { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.ss-card.long { border-color: rgba(232, 163, 61, .45); }
.ss-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ss-n { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-weight: 800; font-size: 13px; }
.ss-name { flex: 1; min-width: 80px; font-size: 14px; }
.ss-key { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; }
.ss-key input { width: 52px !important; min-width: 0; height: 32px; padding: 0 8px; text-align: center; text-transform: uppercase; font-weight: 700; }
.ss-tools { display: inline-flex; gap: 2px; }
.ss-tools .icon { min-height: 32px; width: 32px; padding: 0; }
.ss-text { width: 100%; min-height: 0; resize: vertical; font: inherit; line-height: 1.5; }
.ss-info { color: var(--muted); font-size: 12px; }
.ss-card.long .ss-info { color: var(--accent); }
.ss-add { align-self: flex-start; }
</style>

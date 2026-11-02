<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { parseRef, passage, refLabel, sup, toSlides } from '@/services/bible'
import { bible, bible2, importBible, loadBible, nearestService, settings } from '@/stores'
import { setVerse, studio, verseOff, verseToProgram } from '@/services/studio'
import { VERSE_DEFAULT } from '@/services/studio/cards'
import PresetPicker from './PresetPicker.vue'

// Werset na wizji: odnośnik i przekład → slajdy po 1–2 wersety → podgląd → „Na wizję”. Gdy fragment jest już na wizji,
// strzałki przełączają od razu (jak slajdy na rzutniku); „Zdejmij” — od razu.
const refText = ref(nearestService.value?.passage?.trim() || '')
const per = ref(1), at = ref(0), which = ref(settings.verseBible || 0), error = ref(''), ready = ref(false)
onMounted(async () => { await loadBible(); ready.value = true; if (which.value && !bible2.value) which.value = 0 })
onBeforeUnmount(() => setVerse(null)) // schowany panel zdejmuje werset z podglądu, wizja zostaje
watch(which, v => { settings.verseBible = v })
const book = computed(() => (which.value ? bible2.value : bible.value))
const parsed = computed(() => parseRef(refText.value))
const verses = computed(() => (parsed.value && book.value ? passage(book.value, parsed.value) : []))
// na boku mieści się więcej, a każdy werset zaczyna się od nowej linii
const look = computed(() => ({ ...VERSE_DEFAULT, ...settings.verseLook }))
const side = computed(() => look.value.place !== 'bottom')
const slides = computed(() => (verses.value.length ? toSlides(parsed.value.book, verses.value, per.value, look.value.place === 'bottom' ? 320 : look.value.place === 'window' ? 500 : 900) : []))
const payload = computed(() => {
  const s = slides.value[at.value]
  return s ? { text: s.verses.map(v => sup(v.verse) + ' ' + v.text).join(side.value ? '\n' : ' '), ref: refLabel(parsed.value.book, s.verses), tr: book.value.name, look: look.value } : null
})
const hint = computed(() => {
  if (!refText.value.trim()) return ''
  if (!parsed.value) return 'Wpisz np. J 3,16–21, 1 Kor 13,4-7 albo Ps 23.'
  return book.value && !verses.value.length ? 'W tym przekładzie nie ma takiego fragmentu.' : ''
})
const onAir = computed(() => !!studio.program.verse)
const sent = computed(() => JSON.stringify(studio.program.verse || null) === JSON.stringify(payload.value))
let moved = false
watch([refText, per, which], () => { at.value = 0 })
// podgląd idzie za wyborem; na wizji zmienia się tylko slajd tego samego fragmentu
watch(payload, v => { setVerse(v, !!v && onAir.value && moved); moved = false }, { immediate: true })

function go(d: number) { moved = true; at.value = Math.max(0, Math.min(slides.value.length - 1, at.value + d)) }
async function load(slot: 0 | 1) {
  error.value = ''
  try { if (await importBible(slot)) which.value = slot } catch (e) { error.value = e.message }
}
</script>

<template>
  <section class="verse-panel" aria-label="Werset na wizji">
    <PresetPicker kind="verse" />
    <div class="verse-row">
      <label class="searchbox"><Icon name="book" /><input v-model="refText" placeholder="np. J 3,16–21" aria-label="Fragment Biblii"></label>
      <select v-if="bible && bible2" v-model.number="which" aria-label="Przekład">
        <option :value="0">{{ bible.name }}</option>
        <option :value="1">{{ bible2.name }}</option>
      </select>
      <select v-model.number="per" aria-label="Wersetów naraz">
        <option :value="1">Po 1 wersecie</option>
        <option :value="2">Po 2 wersety</option>
        <option :value="3">Po 3 wersety</option>
        <option :value="5">Po 5 wersetów</option>
      </select>
    </div>
    <p v-if="ready && !bible" class="desk-help">Najpierw wczytaj plik Biblii (OpenSong albo Zefania XML). <button class="small" @click="load(0)"><Icon name="import" />Wybierz plik…</button></p>
    <p v-if="hint" class="note bad">{{ hint }}</p>
    <p v-if="error" class="note bad">{{ error }}</p>
    <blockquote v-if="payload">{{ payload.text }}<cite>{{ payload.ref }} · {{ payload.tr }}</cite></blockquote>
    <div class="verse-row">
      <button class="iconbtn" :disabled="at <= 0" title="Poprzedni" aria-label="Poprzedni werset" @click="go(-1)"><Icon name="left" /></button>
      <small v-if="slides.length" class="muted">{{ at + 1 }} / {{ slides.length }}</small>
      <button class="iconbtn" :disabled="at >= slides.length - 1" title="Następny" aria-label="Następny werset" @click="go(1)"><Icon name="right" /></button>
      <span class="spacer"></span>
      <button v-if="bible && !bible2" class="small" title="Plik zostaje na tym komputerze" @click="load(1)"><Icon name="import" />Dodaj drugi przekład…</button>
      <button class="desk-send" :class="{ ready: payload && !sent }" :disabled="!payload || sent" @click="verseToProgram"><Icon name="play" />Na wizję</button>
      <button class="desk-x" :disabled="!onAir" title="Zdejmij z wizji" aria-label="Zdejmij werset" @click="verseOff"><Icon name="x" /></button>
    </div>
  </section>
</template>

<style scoped>
.verse-panel { display: grid; gap: 8px; margin-top: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel2); }
.verse-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.verse-row .searchbox { flex: 1 1 200px; }
.verse-row select { max-width: 220px; }
blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--accent); font-size: 15px; line-height: 1.45; }
cite { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; font-style: normal; }
</style>

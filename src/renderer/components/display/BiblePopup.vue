<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { BOOKS, parseRef, passage, toSlides } from '@/services/bible'
import { activeService, addPassage, bible, bible2, bibleOpen, importBible, loadBible, nearestService } from '@/stores'

// Biblia na rzutniku: odnośnik → podgląd slajdów → pętla w materiałach (przełączana strzałkami).
const refText = ref('')
const perSlide = ref(2)
const error = ref('')
const loading = ref(true)
const input = ref(null)
const which = ref(0) // 0 — główny przekład, 1 — drugi
const book = computed(() => (which.value && bible2.value ? bible2.value : bible.value))
onMounted(async () => {
  await loadBible()
  loading.value = false
  input.value?.focus()
})

const servicePassage = computed(() => (activeService.value || nearestService.value)?.passage?.trim() || '')
const parsed = computed(() => parseRef(refText.value))
const verses = computed(() => (parsed.value && book.value ? passage(book.value, parsed.value) : []))
const slides = computed(() => (verses.value.length ? toSlides(parsed.value.book, verses.value, perSlide.value) : []))
const hint = computed(() => {
  if (!refText.value.trim()) return ''
  if (!parsed.value) return 'Nie rozpoznaję odnośnika — wpisz np. J 3,16–21, 1 Kor 13,4-7 albo Ps 23.'
  if (!verses.value.length) return `W tej Biblii nie ma fragmentu ${BOOKS[parsed.value.book][0]} ${parsed.value.parts[0].chapter}.`
  return ''
})

async function pickFile(slot: 0 | 1 = 0) {
  error.value = ''
  try { if (await importBible(slot)) which.value = slot } catch (e) { error.value = e.message }
}
function add() {
  const res = addPassage(refText.value, perSlide.value, null, book.value)
  if (res.error) error.value = res.error
  else bibleOpen.value = false
}
</script>

<template>
  <div class="overlay" @click.self="bibleOpen = false" @keydown.esc.stop="bibleOpen = false">
    <div class="modal bible-modal" role="dialog" aria-modal="true" aria-label="Biblia">
      <div class="modal-head">
        <h3>Biblia</h3>
        <select v-if="bible && bible2" v-model.number="which" aria-label="Przekład">
          <option :value="0">{{ bible.name }}</option>
          <option :value="1">{{ bible2.name }}</option>
        </select>
        <span v-else-if="bible" class="note bname">{{ bible.name }}</span>
        <span class="spacer"></span>
        <button v-if="bible" class="small" title="Wczytaj inny plik w miejsce wybranego przekładu" @click="pickFile(which ? 1 : 0)">Zmień przekład…</button>
        <button v-if="bible && !bible2" class="small" title="Drugi przekład do wyboru obok pierwszego" @click="pickFile(1)">Dodaj drugi…</button>
        <button class="iconbtn" aria-label="Zamknij" @click="bibleOpen = false"><Icon name="x" /></button>
      </div>

      <p v-if="loading" class="note">Wczytuję…</p>
      <template v-else-if="!bible">
        <p>Najpierw wczytaj plik Biblii — wystarczy raz na tym komputerze.</p>
        <p class="note">Obsługiwane są Biblie z <b>OpenSong</b> (folder „OpenSong Data” → „Bibles”) i pliki w formacie <b>Zefania XML</b>. Wybierz przekład, którego używacie w kościele.</p>
        <button class="primary" @click="pickFile(0)"><Icon name="import" />Wybierz plik Biblii…</button>
      </template>
      <template v-else>
        <div class="bible-ref">
          <label class="searchbox">
            <Icon name="book" />
            <input ref="input" v-model="refText" type="text" placeholder="np. J 3,16–21" aria-label="Fragment Biblii" @keydown.enter="slides.length && add()">
          </label>
          <select v-model.number="perSlide" title="Ile wersetów na jednym slajdzie" aria-label="Wersetów na slajd">
            <option :value="1">1 werset na slajd</option>
            <option :value="2">2 wersety na slajd</option>
            <option :value="3">3 wersety na slajd</option>
          </select>
        </div>
        <button v-if="servicePassage && servicePassage !== refText" class="small svc-pass" @click="refText = servicePassage"><Icon name="calendar" />Fragment z nabożeństwa: {{ servicePassage }}</button>
        <p v-if="hint" class="note bad">{{ hint }}</p>
        <ol v-if="slides.length" class="bible-slides">
          <li v-for="(s, i) in slides" :key="i"><span class="bnum">{{ i + 1 }}</span><span>{{ s.text }}</span></li>
        </ol>
      </template>
      <p v-if="error" class="note bad">{{ error }}</p>

      <div class="modal-foot">
        <span class="note">{{ slides.length ? `Wersetów: ${verses.length} · slajdów: ${slides.length}` : '' }}</span>
        <span class="spacer"></span>
        <button @click="bibleOpen = false">Anuluj</button>
        <button class="primary" :disabled="!slides.length" @click="add"><Icon name="plus" />Dodaj do Biblioteki</button>
      </div>
    </div>
  </div>
</template>

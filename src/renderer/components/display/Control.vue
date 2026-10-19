<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Stage from '@/components/display/Stage.vue'
import Icon from '@/components/common/Icon.vue'
import Brand from '@/components/common/Brand.vue'
import MaterialsPanel from '@/components/display/MaterialsPanel.vue'
import SongsPanel from '@/components/display/SongsPanel.vue'
import Inspector from '@/components/display/Inspector.vue'
import AppSettings from '@/components/display/AppSettings.vue'
import SongManager from '@/components/display/SongManager.vue'
import TextPopup from '@/components/display/TextPopup.vue'
import ServiceImport from '@/components/display/ServiceImport.vue'
import BiblePopup from '@/components/display/BiblePopup.vue'
import {
  bibleOpen, view, addFiles, api, busy, canGo, displayId, displays, followStep, frozen, frozenLabel, goLive, jumpToKey, role, loopPlaying, loopStep, selectedStep, stepLoop, hidden, init, label, liveId, liveIsVideo,
  managerOpen, mirroring, notice, output, selected, selectedId, selectedIndex, selectedView, previewVideo, selectedFrozen, sendText, serviceList, serviceModal, startRename, stepBy, tab, textPopup, toggleFrozen, toggleHidden,
  textDirty, toggleOutput, verses, video, volume,
} from '@/stores'

const previewStage = ref(null)
const showSettings = ref(false)
// Wysokość elementów pod dużym podglądem: nagłówek, przyciski i skróty (220), pasek filmu, „wyślij zmiany”, następny slajd.
const reserve = computed(() => `calc(${170 + (bar.value ? 56 : 0) + (textDirty.value ? 56 : 0) + (nextView.value ? 34 : 0)}px${nextView.value ? ' + var(--mini)' : ''})`)
// Następny slajd pieśni albo pętli — mały podgląd pod przyciskami, żeby wiedzieć, co będzie dalej.
const nextView = computed(() => {
  const it = selected.value
  if (!it || !canGo.value) return null
  if (it.type === 'song') return selectedIndex.value + 1 < verses(it).length ? view(it, selectedIndex.value + 1) : null
  if (it.type === 'scene') {
    const all = selectedView.value?.slides || []
    return all.length > 1 ? { ...all[(selectedStep.value + 1) % all.length], fadeMs: 0 } : null
  }
  return null
})
const dragging = ref(false)
const seekValue = ref(null) // ustawione tylko w trakcie przeciągania suwaka

const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const displayLabel = d => `${d.label} — ${d.width}×${d.height}${d.current ? ' (ten ekran)' : ''}`

/* ---------- film na rzutniku ---------- */
// Jeden pasek pod podglądem steruje filmem: tym na rzutniku, a gdy nic nie jest
// wyświetlane — filmem w podglądzie (zawsze bez dźwięku, bo głośniki są wspólne z salą).
const onPreviewVideo = v => { previewVideo.value = { time: v.currentTime, duration: isFinite(v.duration) ? v.duration : 0, paused: v.paused } }
watch([selectedId, selectedIndex], () => { previewVideo.value = null })
// Odtwarzany podgląd pętli sam przechodzi dalej — zapamiętujemy, gdzie jest, żeby po zatrzymaniu został na tym slajdzie.
function onPreviewStep(n) {
  previewVideo.value = null
  if (loopPlaying.value) loopStep.value = n
}
const selectedLive = computed(() => !!selected.value && selected.value.id === liveId.value)
const bar = computed(() => (liveIsVideo.value ? video.value : selectedLive.value ? null : previewVideo.value))

function togglePlay() {
  // Film zatrzymany przez „Zamroź” lub „Ukryj”: przycisk odtwarzania znosi ten stan, żeby
  // nakładka nie została na ekranie, gdy film już leci na rzutniku.
  if (liveIsVideo.value && (frozen.value || hidden.value)) {
    frozen.value = hidden.value = false
    return api.videoCmd({ type: 'play' })
  }
  if (liveIsVideo.value) return api.videoCmd({ type: 'toggle' })
  const v = previewStage.value?.video
  if (v) v.paused ? v.play().catch(() => {}) : v.pause()
}
const seekPos = () => seekValue.value ?? (bar.value.duration ? Math.round((bar.value.time / bar.value.duration) * 1000) : 0)
function seekCommit(e: Event) {
  const time = (+(e.target as HTMLInputElement).value / 1000) * bar.value.duration
  if (liveIsVideo.value) api.videoCmd({ type: 'seek', value: time })
  else if (previewStage.value?.video) previewStage.value.video.currentTime = time
  seekValue.value = null
}
// Gdy wybrany film jest na żywo, podgląd idzie za rzutnikiem — jeden wspólny czas.
watch([video, mirroring], () => {
  const v = previewStage.value?.video
  if (!mirroring.value || !v) return
  if (Math.abs(v.currentTime - video.value.time) > 0.3) v.currentTime = video.value.time
  if (video.value.paused !== v.paused) video.value.paused ? v.pause() : v.play().catch(() => {})
}, { flush: 'post' })

/* ---------- przeciąganie plików ---------- */
let dragDepth = 0
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
function onDragEnter(e) { if (hasFiles(e)) { dragDepth++; dragging.value = true } }
function onDragLeave(e) { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; dragging.value = false } }
function onDragOver(e) { if (hasFiles(e)) e.preventDefault() }
function onDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  // Gdy wybrana jest pętla, upuszczone pliki stają się jej slajdami.
  addFiles([...e.dataTransfer.files].map(f => api.pathForFile(f)), selected.value?.type === 'scene' ? selected.value : null)
}

/* ---------- klawiatura ---------- */
function onKey(e) {
  if (showSettings.value || managerOpen.value || textPopup.value || serviceModal.value || bibleOpen.value || e.target.closest?.('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=color])') || e.ctrlKey || e.altKey || e.metaKey) return
  const onButton = !!e.target.closest?.('button, input')
  if (e.key === 'Enter' && !onButton) { e.preventDefault(); goLive() }
  else if (e.key === 'Escape') toggleHidden(true)
  else if (e.key === 'h' || e.key === 'H') toggleHidden()
  else if (e.key === 'f' || e.key === 'F') toggleFrozen()
  else if (e.key === 'F2' && selected.value && selected.value.type !== 'song') startRename(selected.value)
  else if (e.key === ' ' && !onButton && bar.value) { e.preventDefault(); togglePlay() }
  // Slajdy pieśni: strzałki w dół / w górę; PageDown / PageUp wysyłają też piloty do prezentacji.
  else if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); stepBy(1) }
  else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); stepBy(-1) }
  // Pozostałe pojedyncze klawisze: skrót [x] slajdu pieśni albo cyfra = numer slajdu.
  else if (e.key.length === 1 && jumpToKey(e.key)) e.preventDefault()
}

const listeners = { keydown: onKey, dragenter: onDragEnter, dragleave: onDragLeave, dragover: onDragOver, drop: onDrop }
onMounted(() => {
  for (const [name, fn] of Object.entries(listeners)) window.addEventListener(name, fn)
})
onBeforeUnmount(() => { for (const [name, fn] of Object.entries(listeners)) window.removeEventListener(name, fn) })
</script>

<template>
  <div class="app" :class="{ drag: dragging }">
    <header>
      <button class="iconbtn" title="Zmień służbę" aria-label="Zmień służbę" @click="role = null"><Icon name="left" /></button>
      <Brand />
      <h1>Rzutnik</h1>
      <span class="spacer"></span>
      <label v-if="displays.length > 1" class="screen">
        Wyświetlaj na
        <select v-model="displayId" :disabled="output.open" title="Ekran (rzutnik), na którym pojawi się obraz">
          <option v-for="d in displays" :key="d.id" :value="d.id">{{ displayLabel(d) }}</option>
        </select>
      </label>
      <button class="power" :class="{ on: output.open, waiting: output.waiting }" @click="toggleOutput"
              :title="output.open || output.waiting ? 'Zamyka okno z obrazem na wybranym ekranie' : 'Otwiera okno z obrazem na wybranym ekranie'">
        <span class="dot"></span>
        {{ output.waiting ? 'Czekam na rzutnik… (anuluj)' : output.open ? 'Zakończ wyświetlanie' : 'Rozpocznij wyświetlanie' }}
      </button>
      <button class="iconbtn" title="Ustawienia aplikacji" aria-label="Ustawienia aplikacji" @click="showSettings = true"><Icon name="gear" /></button>
    </header>

    <p v-if="output.waiting" class="warn">
      <Icon name="missing" />
      <span>Rzutnik został odłączony. Obraz wróci sam, gdy tylko ekran pojawi się ponownie.</span>
    </p>
    <p v-else-if="displays.length < 2" class="warn">
      <Icon name="missing" />
      <span>Windows widzi tylko jeden ekran. Podłącz rzutnik i naciśnij <kbd>Win</kbd> + <kbd>P</kbd> → <b>Rozszerz</b>.
      Do tego czasu obraz otworzy się w zwykłym oknie.</span>
    </p>

    <main>
      <section>
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'materials'" @click="tab = 'materials'"><Icon name="image" />Materiały</button>
          <button role="tab" :aria-selected="tab === 'songs'" @click="tab = 'songs'"><Icon name="music" />Pieśni<span v-if="serviceList.length" class="pill">{{ serviceList.length }}</span></button>
        </div>
        <MaterialsPanel v-if="tab === 'materials'" />
        <SongsPanel v-else />
      </section>

      <!-- Duży podgląd zostawia miejsce na wszystko, co jest pod nim (przyciski, film, następny slajd). -->
      <section class="center" :style="{ '--reserve': reserve }">
        <h2>Podgląd<span v-if="selected" class="h2name"> · {{ label(selected) }}</span></h2>
        <div class="frame">
          <div class="preview" :class="{ hiddenlive: liveId && hidden, frozenlive: liveId && frozen }">
            <div v-if="liveId && (hidden || frozen)" class="state" role="status">
              <span v-if="hidden"><Icon name="eyeoff" />UKRYTE <small>na rzutniku nic nie widać · <kbd>H</kbd> pokaż</small></span>
              <span v-if="frozen"><Icon name="freeze" />ZAMROŻONE <small>rzutnik stoi na: {{ frozenLabel }}</small></span>
            </div>
            <div v-if="!selected" class="placeholder">Wybierz coś z listy po lewej</div>
            <div v-else-if="selected.missing" class="placeholder">Nie znaleziono pliku:<br>{{ selected.path }}</div>
            <div v-else-if="!canGo" class="placeholder">{{ selected.type === 'song' ? 'Pieśń nie ma jeszcze tekstu' : 'Pętla jest pusta — dodaj slajdy po prawej' }}</div>
            <Stage v-else ref="previewStage" instant :item="selectedView" :mirror="mirroring" :follow-step="followStep" @video="onPreviewVideo" @step="onPreviewStep" />
          </div>
        </div>

        <div v-if="bar" class="bar vctl">
          <button class="iconbtn solid" :title="bar.paused ? 'Odtwórz' : 'Pauza'" :aria-label="bar.paused ? 'Odtwórz' : 'Pauza'" @click="togglePlay">
            <Icon :name="bar.paused ? 'play' : 'pause'" />
          </button>
          <input class="seek" type="range" min="0" max="1000" :value="seekPos()" aria-label="Pozycja filmu"
                 @input="seekValue = +($event.target as HTMLInputElement).value" @change="seekCommit">
          <span class="time">{{ fmt(bar.time) }} / {{ fmt(bar.duration) }}</span>
          <Icon name="volume" />
          <input v-model.number="volume" class="vol" type="range" min="0" max="1" step="0.05" aria-label="Głośność na rzutniku" title="Głośność na rzutniku">
          <span class="time">{{ Math.round(volume * 100) }}%</span>
        </div>

        <div v-if="textDirty" class="bar pending">
          <span>Zmiany w tekście nie są jeszcze na rzutniku.</span>
          <button class="primary" @click="sendText"><Icon name="check" />Wyślij zmiany</button>
        </div>

        <div class="bar">
          <button class="go" :disabled="!canGo" @click="goLive"><Icon name="monitor" />Wyświetl</button>
          <template v-if="selected?.type === 'song' && canGo">
            <button class="iconbtn solid" title="Poprzedni slajd (strzałka w lewo lub w górę)" aria-label="Poprzedni slajd" :disabled="selectedIndex === 0" @click="stepBy(-1)"><Icon name="left" /></button>
            <span class="time">{{ selectedIndex + 1 }} / {{ verses(selected).length }}</span>
            <button class="iconbtn solid" title="Następny slajd (strzałka w prawo lub w dół)" aria-label="Następny slajd" :disabled="selectedIndex >= verses(selected).length - 1" @click="stepBy(1)"><Icon name="right" /></button>
          </template>
          <template v-if="selected?.type === 'scene' && canGo">
            <button class="iconbtn solid" title="Poprzedni slajd (strzałka w lewo lub w górę)" aria-label="Poprzedni slajd" @click="stepLoop(-1)"><Icon name="left" /></button>
            <span class="time">{{ selectedStep + 1 }} / {{ selectedView.slides.length }}</span>
            <button class="iconbtn solid" title="Następny slajd (strzałka w prawo lub w dół)" aria-label="Następny slajd" @click="stepLoop(1)"><Icon name="right" /></button>
            <button v-if="selected.id !== liveId" :aria-pressed="loopPlaying" title="Odtwarza pętlę tylko w podglądzie" @click="loopPlaying = !loopPlaying">
              <Icon :name="loopPlaying ? 'pause' : 'play'" />{{ loopPlaying ? 'Zatrzymaj podgląd' : 'Odtwórz podgląd' }}
            </button>
          </template>
          <button v-if="liveId" :class="{ active: hidden }" :aria-pressed="hidden" title="Chowa obraz na rzutniku (H)" @click="toggleHidden()"><Icon name="eyeoff" />{{ hidden ? 'Pokaż' : 'Ukryj' }}</button>
          <button v-if="liveId && (!liveIsVideo || frozen)" :class="{ ice: selectedFrozen }" :aria-pressed="selectedFrozen"
                  :title="selectedFrozen ? 'Odmraża rzutnik (F)' : 'Zatrzymuje rzutnik na tym, co jest teraz wyświetlane (F)'" @click="toggleFrozen">
            <Icon name="freeze" />{{ selectedFrozen ? 'Odmroź' : 'Zamroź' }}
          </button>
          <span class="notice" role="status">{{ busy || notice }}</span>
        </div>

        <div v-if="nextView" class="nextslide">
          <span class="nl">Następny slajd</span>
          <div class="mini"><Stage :item="nextView" /></div>
        </div>

        <p class="keys">
          <span><kbd>Enter</kbd> wyświetl</span><span><kbd>H</kbd> ukryj</span><span><kbd>F</kbd> zamroź</span>
          <span><kbd>←</kbd><kbd>→</kbd> slajd</span><span><kbd>1</kbd>–<kbd>9</kbd> slajd pieśni</span><span><kbd>Spacja</kbd> pauza filmu</span>
        </p>
      </section>

      <section class="props fixed-head">
        <h2>Ustawienia</h2>
        <div class="props-body"><Inspector /></div>
      </section>
    </main>

    <AppSettings v-if="showSettings" @close="showSettings = false" />
    <SongManager v-if="managerOpen" />
    <TextPopup v-if="textPopup" />
    <ServiceImport v-if="serviceModal" />
    <BiblePopup v-if="bibleOpen" />
  </div>
</template>

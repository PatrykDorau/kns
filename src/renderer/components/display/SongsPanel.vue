<script setup lang="ts">
import { ask } from '@/utils/ask'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import NewSongDialog from '@/components/display/NewSongDialog.vue'
import {
  activeService, addToService, clearService, firstLine, prettyDate, serviceModal, frozenAt, goLive, hidden, liveId, managerOpen, moveInService, removeFromService, search, selectedId,
  serviceList, serviceResults, songs, verses,
} from '@/stores'

// Zakładka „Pieśni” to lista na najbliższe nabożeństwo. Cała baza (dodawanie, import, edycja)
// jest w osobnym oknie „Baza pieśni”.
const confirmClear = ref(false)
const newSong = ref(false) // okno „Nowa pieśń”
// „+” przy „Na to nabożeństwo”: lista pieśni z bazy do dodania (bez wpisywania) — wpisanie zawęża; nowa pieśń na końcu listy
const browse = ref(false)
const finder = ref<HTMLInputElement | null>(null)
function openBrowse() { browse.value = true; nextTick(() => finder.value?.focus()) }
function closeBrowse() { browse.value = false; search.service = '' }
// kliknięcie poza polem i listą zamyka listę
const finderBox = ref<HTMLElement | null>(null)
const outside = (e: MouseEvent) => { if (!finderBox.value?.contains(e.target as Node)) closeBrowse() }
const listOpen = computed(() => browse.value || !!search.service.trim())
watch(listOpen, on => { if (on) document.addEventListener('mousedown', outside); else document.removeEventListener('mousedown', outside) })
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
const inService = computed(() => new Set(serviceList.value.map(e => e.song.id)))
const browseList = computed(() => songs.value.filter(x => !inService.value.has(x.id)).sort((a, b) => ((+a.number || 1e9) - (+b.number || 1e9)) || a.title.localeCompare(b.title, 'pl')))
const shownResults = computed(() => (search.service.trim() ? serviceResults.value : browse.value ? browseList.value : []))
// Tryb zaznaczania: zdejmowanie wielu pieśni z listy naraz (pieśni zostają w bazie).
const picking = ref(false)
const picked = ref(new Set())
function togglePick(key) {
  const set = new Set(picked.value)
  set.has(key) ? set.delete(key) : set.add(key)
  picked.value = set
}
const allPicked = () => serviceList.value.length > 0 && serviceList.value.every(e => picked.value.has(e.key))
function pickAll() { picked.value = allPicked() ? new Set() : new Set(serviceList.value.map(e => e.key)) }
function stopPicking() { picking.value = false; picked.value = new Set() }
async function removePicked() {
  const n = serviceList.value.filter(e => picked.value.has(e.key)).length
  if (!n || !(await ask(n === 1 ? 'Zdjąć zaznaczoną pieśń z listy na to nabożeństwo? (Zostaje w bazie pieśni.)' : `Zdjąć zaznaczone pieśni (${n}) z listy na to nabożeństwo? (Zostają w bazie pieśni.)`))) return
  // od końca, żeby numery pozostałych pozycji się nie przesuwały
  for (let i = serviceList.value.length - 1; i >= 0; i--) if (picked.value.has(serviceList.value[i].key)) removeFromService(i)
  stopPicking()
}
async function removeOne(i, entry) {
  if ((await ask('Zdjąć „' + (entry.song?.title || 'tę pieśń') + '” z listy na to nabożeństwo? (Zostaje w bazie pieśni.)'))) removeFromService(i)
}
const dragFrom = ref(null)
const dragTo = ref(null)
function drop(i) {
  if (dragFrom.value != null && dragFrom.value !== i) moveInService(dragFrom.value, i)
  dragFrom.value = dragTo.value = null
}
const title = song => (song.number ? song.number + '. ' : '') + (song.title || 'Bez tytułu')
</script>

<template>
  <div class="svc-line">
    <span v-if="activeService" :title="activeService.sermonTitle">{{ prettyDate(activeService.date) }}<template v-if="activeService.sermonTitle"> · {{ activeService.sermonTitle }}</template></span>
    <span v-else>Nie wczytano nabożeństwa</span>
    <button class="small" @click="serviceModal = true">Wczytaj nabożeństwo</button>
  </div>
  <div ref="finderBox" class="finder">
    <label class="searchbox">
      <Icon name="search" />
      <input ref="finder" v-model="search.service" type="search" placeholder="Dodaj pieśń: numer, tytuł lub fragment" aria-label="Wyszukaj pieśń do dodania"
             @keydown.enter.prevent="shownResults[0] && addToService(shownResults[0])" @keydown.esc.stop="closeBrowse">
    </label>
    <ul v-if="search.service.trim() || browse" class="results browse-results">
      <li v-if="browse && !search.service.trim()" class="none browse-h"><span>Kliknij pieśń, żeby dodać ją na to nabożeństwo — albo wpisz numer lub tytuł.</span><button class="iconbtn" aria-label="Zamknij listę" @click="closeBrowse"><Icon name="x" /></button></li>
      <li v-if="!shownResults.length" class="none">{{ songs.length ? (search.service.trim() ? 'Nie ma takiej pieśni w bazie.' : 'Wszystkie pieśni z bazy są już na liście.') : 'Baza pieśni jest pusta — otwórz ją i zaimportuj pieśni.' }}</li>
      <li v-for="song in shownResults" :key="song.id">
        <button @click="addToService(song)"><Icon name="plus" /><span class="meta"><span class="name">{{ title(song) }}</span><span class="kind">{{ firstLine(song) }}</span></span></button>
      </li>
      <li class="none"><button class="small" @click="newSong = true; closeBrowse()"><Icon name="plus" />Nowa pieśń (spoza bazy)</button></li>
    </ul>
  </div>

  <div class="service-head">
    <h2>Na to nabożeństwo</h2>
    <button class="iconbtn" :class="{ on: browse }" title="Dodaj pieśń z bazy na to nabożeństwo" aria-label="Dodaj pieśń na to nabożeństwo" @click="browse ? closeBrowse() : openBrowse()"><Icon name="plus" /></button>
    <template v-if="serviceList.length">
      <template v-if="confirmClear">
        <button class="del-yes small" title="Usuwa wszystkie pieśni z listy (zostają w bazie)" @click="clearService(); confirmClear = false">Wyczyścić?</button>
        <button class="small" @click="confirmClear = false">Nie</button>
      </template>
      <template v-else>
        <button class="iconbtn" :class="{ on: picking }" :aria-pressed="picking" :title="picking ? 'Gotowe — koniec zaznaczania' : 'Zaznacz kilka pieśni naraz'" :aria-label="picking ? 'Gotowe' : 'Zaznacz kilka pieśni'" @click="picking ? stopPicking() : (picking = true)"><Icon :name="picking ? 'check' : 'select'" /></button>
        <button class="iconbtn" title="Wyczyść listę — usuwa pieśni z listy, nie z bazy" aria-label="Wyczyść listę" @click="confirmClear = true"><Icon name="trash" /></button>
      </template>
    </template>
  </div>

  <div v-if="picking && serviceList.length" class="bulk">
    <button class="small" @click="pickAll">{{ allPicked() ? 'Odznacz wszystkie' : 'Zaznacz wszystkie' }}</button>
    <span class="spacer"></span>
    <button class="small" :disabled="!picked.size" title="Pieśni zostają w bazie" @click="removePicked"><Icon name="x" />Zdejmij zaznaczone ({{ picked.size }})</button>
  </div>

  <ul class="list">
    <li v-if="!serviceList.length" class="empty">
      <Icon name="music" />
      Lista jest pusta.<br>Wyszukaj pieśń powyżej i kliknij ją, żeby dodać do nabożeństwa.
    </li>
    <li v-for="(entry, i) in serviceList" :key="entry.key" class="row song" draggable="true"
        :class="{ selected: entry.song.id === selectedId, live: entry.song.id === liveId, frozen: frozenAt?.id === entry.song.id, dragging: dragFrom === i, over: dragTo === i && dragFrom !== null && dragFrom !== i }"
        @dragstart="dragFrom = i" @dragend="dragFrom = dragTo = null"
        @dragover="dragFrom !== null && ($event.preventDefault(), dragTo = i)" @drop="dragFrom !== null && ($event.preventDefault(), drop(i))">
      <input v-if="picking" class="pickbox" type="checkbox" :checked="picked.has(entry.key)" :aria-label="'Zaznacz: ' + entry.song.title" @change="togglePick(entry.key)">
      <button class="pick" @click="selectedId = entry.song.id" @dblclick="goLive">
        <span class="num">{{ i + 1 }}</span>
        <span class="meta">
          <span class="name">{{ title(entry.song) }}</span>
          <span class="kind">Slajdów: {{ verses(entry.song).length }}</span>
        </span>
        <span v-if="entry.song.id === liveId || frozenAt?.id === entry.song.id" class="badges">
          <span v-if="entry.song.id === liveId" class="badge" :class="{ off: hidden }"><span v-if="!hidden" class="livedot"></span>{{ hidden ? 'UKRYTE' : 'NA ŻYWO' }}</span>
          <span v-if="frozenAt?.id === entry.song.id" class="badge ice"><Icon name="freeze" />ZAMROŻONE</span>
        </span>
      </button>
      <span class="actions">
        <button class="iconbtn" title="Zdejmij z listy (pieśń zostaje w bazie)" :aria-label="'Zdejmij z listy: ' + entry.song.title" @click="removeOne(i, entry)"><Icon name="x" /></button>
      </span>
    </li>
  </ul>

  <NewSongDialog v-if="newSong" @close="newSong = false" />
  <button class="wide browse" @click="managerOpen = true"><Icon name="pencil" />Baza pieśni ({{ songs.length }})</button>
</template>

<style scoped>
.browse-results { max-height: 360px; overflow: hidden auto; }
/* pasek przewijania w środku ramki (z odstępem od zaokrąglonych rogów) */
.browse-results::-webkit-scrollbar { width: 12px; }
.browse-results::-webkit-scrollbar-track { margin: 10px 0; background: transparent; }
.browse-results::-webkit-scrollbar-thumb { border: 4px solid transparent; border-radius: 8px; background: var(--line) padding-box; }
.browse-results::-webkit-scrollbar-thumb:hover { background: var(--muted) padding-box; }
.browse-results::-webkit-scrollbar-button { display: none; height: 0; }
.browse-h { display: flex; align-items: center; gap: 8px; }
.browse-h span { flex: 1; }
.results .browse-h button { flex: none; width: 30px; height: 30px; padding: 0; justify-content: center; background: transparent; }
.browse-results li.browse-h + li button { background: transparent; }
</style>

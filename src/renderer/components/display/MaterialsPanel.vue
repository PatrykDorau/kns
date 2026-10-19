<script setup lang="ts">
import { ref } from 'vue'
import { focusEl } from '@/utils/dom'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import {
  bibleOpen, addLoop, addCountdown, addText, addAnnouncements, currentAnnouncements, projectorGraphics, commitRename, confirmId, frozenAt, goLive, hidden, kindLabel, label, liveId, moveItem, pickDeck, pickFiles, remove,
  renameValue, renamingId, search, selectedId, startRename, visibleItems,
} from '@/stores'

// Tryb zaznaczania: pola wyboru przy wierszach i jedno usunięcie dla wielu naraz.
const picking = ref(false)
const picked = ref(new Set())
const confirmBulk = ref(false)
function togglePick(id) {
  const set = new Set(picked.value)
  set.has(id) ? set.delete(id) : set.add(id)
  picked.value = set
  confirmBulk.value = false
}
const allPicked = () => visibleItems.value.length > 0 && visibleItems.value.every(it => picked.value.has(it.id))
function pickAll() { picked.value = allPicked() ? new Set() : new Set(visibleItems.value.map(it => it.id)) }
function stopPicking() { picking.value = false; picked.value = new Set(); confirmBulk.value = false }
function removePicked() {
  for (const it of visibleItems.value.filter(x => picked.value.has(x.id))) remove(it)
  stopPicking()
}

const focusRename = el => { if (el && document.activeElement !== el) { el.focus(); el.select() } }

// Kolejność na liście zmienia się przeciąganiem (gdy lista nie jest przefiltrowana).
const dragId = ref(null)
const overId = ref(null)
function drop(it) {
  if (dragId.value && dragId.value !== it.id) moveItem(dragId.value, it.id)
  dragId.value = overId.value = null
}
</script>

<template>
  <div class="add four">
    <button @click="pickFiles(null)"><Icon name="image" />Zdjęcie / film</button>
    <button title="PowerPoint lub PDF — każdy slajd osobno, przełączane ręcznie" @click="pickDeck"><Icon name="slides" />Prezentacja</button>
    <button @click="addText"><Icon name="text" />Tekst</button>
    <button title="Odliczanie do nabożeństwa albo przez podaną liczbę minut" @click="addCountdown"><Icon name="timer" />Odliczanie</button>
    <button title="Fragment Biblii jako slajdy, np. J 3,16–21" @click="bibleOpen = true"><Icon name="book" />Biblia</button>
    <button @click="addLoop"><Icon name="loop" />Pętla</button>
    <button :disabled="!projectorGraphics.length" :title="projectorGraphics.length ? 'Grafiki ogłoszeń i wydarzeń zaznaczonych „Pokaż na nabożeństwie” (' + projectorGraphics.length + ') jako pętla — przed i po nabożeństwie' : 'Brak grafik do pokazania — w ogłoszeniu (telefon albo strona) dodaj grafikę i zaznacz „Pokaż na nabożeństwie”'" @click="addAnnouncements"><Icon name="info" />Ogłoszenia<span v-if="projectorGraphics.length" class="pill">{{ projectorGraphics.length }}</span></button>
  </div>
  <div class="searchrow">
    <label class="searchbox">
      <Icon name="search" />
      <input v-model="search.materials" type="search" placeholder="Szukaj w materiałach" aria-label="Szukaj w materiałach">
    </label>
    <button class="small" :aria-pressed="picking" title="Zaznaczanie wielu materiałów naraz" :disabled="!visibleItems.length" @click="picking ? stopPicking() : (picking = true)">{{ picking ? 'Gotowe' : 'Zaznacz' }}</button>
  </div>
  <div v-if="picking" class="bulk">
    <button class="small" @click="pickAll">{{ allPicked() ? 'Odznacz wszystkie' : 'Zaznacz wszystkie' }}</button>
    <span class="spacer"></span>
    <template v-if="confirmBulk">
      <button class="small del-yes" @click="removePicked">Tak, usuń {{ picked.size }}</button>
      <button class="small" @click="confirmBulk = false">Nie</button>
    </template>
    <button v-else class="small" :disabled="!picked.size" @click="confirmBulk = true"><Icon name="trash" />Usuń zaznaczone ({{ picked.size }})</button>
  </div>
  <ul class="list">
    <li v-if="!visibleItems.length" class="empty">
      <template v-if="search.materials">Nic nie pasuje do „{{ search.materials }}”.</template>
      <template v-else><Icon name="plus" />Dodaj zdjęcie, film, PDF, prezentację albo tekst.<br>Pliki możesz też przeciągnąć na to okno.</template>
    </li>
    <li v-for="it in visibleItems" :key="it.id" class="row"
        :class="{ selected: it.id === selectedId, live: it.id === liveId, frozen: frozenAt?.id === it.id, dragging: dragId === it.id, over: overId === it.id && dragId && dragId !== it.id }"
        :draggable="!search.materials && renamingId !== it.id"
        @dragstart="dragId = it.id" @dragend="dragId = overId = null"
        @dragover="dragId && ($event.preventDefault(), overId = it.id)" @drop="dragId && ($event.preventDefault(), drop(it))">
      <input v-if="picking" class="pickbox" type="checkbox" :checked="picked.has(it.id)" :aria-label="'Zaznacz: ' + label(it)" @change="togglePick(it.id)">
      <div v-if="renamingId === it.id" class="pick">
        <Thumb :item="it" />
        <input :ref="focusRename" v-model="renameValue" class="rename" aria-label="Nazwa"
               @keydown.enter.prevent="commitRename(it)" @keydown.esc.prevent="renamingId = null" @blur="commitRename(it)">
      </div>
      <button v-else class="pick" @click="selectedId = it.id" @dblclick="goLive">
        <Thumb :item="it" />
        <span class="meta">
          <span class="name">{{ label(it) }}</span>
          <span class="kind" :class="{ missing: it.missing }">{{ kindLabel(it) }}</span>
        </span>
        <span v-if="it.id === liveId || frozenAt?.id === it.id" class="badges">
          <span v-if="it.id === liveId" class="badge" :class="{ off: hidden }"><span v-if="!hidden" class="livedot"></span>{{ hidden ? 'UKRYTE' : 'NA ŻYWO' }}</span>
          <span v-if="frozenAt?.id === it.id" class="badge ice"><Icon name="freeze" />ZAMROŻONE</span>
        </span>
      </button>
      <span v-if="confirmId === it.id" class="confirm">
        <button class="del-yes" :ref="focusEl" @click="remove(it)" @keydown.esc.stop="confirmId = null">Usuń</button>
        <button @click="confirmId = null">Nie</button>
      </span>
      <span v-else class="actions">
        <button class="iconbtn" :class="{ on: renamingId === it.id }" :title="renamingId === it.id ? 'Zapisz nazwę' : 'Zmień nazwę (F2)'" :aria-label="'Zmień nazwę: ' + label(it)" :aria-pressed="renamingId === it.id"
                @mousedown.prevent @click="renamingId === it.id ? commitRename(it) : startRename(it)"><Icon name="pencil" /></button>
        <button class="iconbtn danger" title="Usuń" :aria-label="'Usuń: ' + label(it)" @click="confirmId = it.id"><Icon name="trash" /></button>
      </span>
    </li>
  </ul>
</template>

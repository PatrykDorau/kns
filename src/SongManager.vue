<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  addToService, api, applySongChanges, managerOpen, matchSongs, pickSongs, plannerTarget, role, search, selectedId, settings,
  songs, sortSongs, tab, uid, verseKey, verses,
} from './store.js'

// Baza pieśni działa na wersji roboczej: nic nie trafia do prawdziwej bazy (ani na rzutnik, ani na
// dysk wspólny), dopóki nie kliknie się „Zapisz”. „Cofnij” wycofuje ostatnią czynność.
const LIMIT = 300
const copy = list => list.map(({ id, number, title, text }) => ({ id, type: 'song', number: number || '', title, text }))
let base = copy(songs.value) // stan bazy w chwili otwarcia / ostatniego zapisu
const draft = ref(copy(songs.value))
const history = ref([])
const rev = ref(0) // numer stanu wersji roboczej; równy savedRev = nic do zapisania
const savedRev = ref(0)
let counter = 0
let editing = null // pieśń, której edycja właśnie trwa (jedna seria zmian = jeden krok cofania)
const dirty = computed(() => rev.value !== savedRev.value)

const currentId = ref(selectedId.value)
const current = computed(() => draft.value.find(s => s.id === currentId.value) || null)
const checked = ref(new Set())
const confirm = ref('') // 'one' | 'many' | 'close'
const message = ref('')

const sorted = computed(() => sortSongs(draft.value))
const matches = computed(() => matchSongs(search.songs, sorted.value))
const visible = computed(() => matches.value.slice(0, LIMIT))
const firstLine = song => song.text.trim().split('\n')[0] || '—'
const allChecked = computed(() => visible.value.length > 0 && visible.value.every(s => checked.value.has(s.id)))

watch(currentId, () => { confirm.value = ''; editing = null })

/* ---------- czynności i cofanie ---------- */
function record(entry) {
  history.value.push({ ...entry, prev: rev.value })
  rev.value = ++counter
  message.value = ''
}
// Wywoływane tuż przed zmianą pola: zapamiętuje stan pieśni sprzed serii poprawek.
function touch() {
  const song = current.value
  if (editing === song.id) return
  editing = song.id
  record({ type: 'edit', id: song.id, before: { number: song.number, title: song.title, text: song.text } })
}
function add(list) {
  draft.value.push(...list)
  record({ type: 'add', ids: list.map(s => s.id) })
  editing = null
}
function removeSongs(list) {
  const entries = list.map(song => ({ at: draft.value.indexOf(song), song: { ...song } })).sort((a, b) => b.at - a.at)
  for (const e of entries) draft.value.splice(e.at, 1)
  record({ type: 'remove', entries })
  editing = null
}
function undo() {
  const last = history.value.pop()
  if (!last) return
  editing = null
  confirm.value = ''
  if (last.type === 'edit') {
    const song = draft.value.find(s => s.id === last.id)
    if (song) Object.assign(song, last.before)
    currentId.value = last.id
  } else if (last.type === 'add') {
    draft.value = draft.value.filter(s => !last.ids.includes(s.id))
  } else {
    for (const e of [...last.entries].sort((a, b) => a.at - b.at)) draft.value.splice(Math.min(e.at, draft.value.length), 0, e.song)
    currentId.value = last.entries.at(-1).song.id
  }
  rev.value = last.prev
  message.value = 'Cofnięto ostatnią czynność.'
}

function save() {
  const before = new Map(base.map(s => [s.id, s]))
  const now = new Map(draft.value.map(s => [s.id, s]))
  const added = draft.value.filter(s => !before.has(s.id))
  const removed = base.filter(s => !now.has(s.id)).map(s => s.id)
  const edited = draft.value.filter(s => { const b = before.get(s.id); return b && (b.number !== s.number || b.title !== s.title || b.text !== s.text) })
  applySongChanges({ added: copy(added), removed, edited: copy(edited) })
  // Po zapisie wersja robocza zaczyna od aktualnej bazy (razem z tym, co w międzyczasie przyszło z dysku wspólnego).
  base = copy(songs.value)
  draft.value = copy(songs.value)
  savedRev.value = rev.value
  editing = null
  message.value = `Zapisano: dodane ${added.length}, zmienione ${edited.length}, usunięte ${removed.length}.`
}

function close() {
  if (dirty.value) confirm.value = 'close'
  else managerOpen.value = false
}

/* ---------- przyciski ---------- */
function toggle(id) {
  const set = new Set(checked.value)
  set.has(id) ? set.delete(id) : set.add(id)
  checked.value = set
}
function toggleAll() { checked.value = allChecked.value ? new Set() : new Set(visible.value.map(s => s.id)) }

function create() {
  const song = { id: uid(), type: 'song', number: '', title: '', text: '' }
  add([song])
  search.songs = ''
  currentId.value = song.id
}
function duplicate() {
  const song = { ...current.value, id: uid(), title: current.value.title + ' (kopia)' }
  add([song])
  currentId.value = song.id
}
function removeCurrent() {
  const at = visible.value.indexOf(current.value)
  const next = visible.value[at + 1] || visible.value[at - 1]
  removeSongs([current.value])
  currentId.value = next?.id ?? null
  confirm.value = ''
}
function removeChecked() {
  const ids = checked.value
  removeSongs(draft.value.filter(s => ids.has(s.id)))
  message.value = `Usunięto pieśni: ${ids.size}. Zapisz, żeby zatwierdzić, albo cofnij.`
  checked.value = new Set()
  confirm.value = ''
}
async function runImport(folder) {
  const res = await pickSongs(folder)
  if (res.songs.length) add(res.songs)
  if (res.songs.length || res.skipped) {
    message.value = `Wczytano pieśni: ${res.songs.length}.` + (res.skipped ? ` Pominięto plików: ${res.skipped} (nierozpoznany format).` : '') + ' Zapisz, żeby dodać je do bazy.'
  }
}
async function exportAll() {
  const res = await api.exportSongs(draft.value.map(({ number, title, text }) => ({ number, title, text })))
  if (res?.file) message.value = 'Zapisano plik: ' + res.file
}

// Organizacja nabożeństw: pieśń z bazy trafia do właśnie edytowanego nabożeństwa.
function addToPlan() {
  const { id, title, number } = current.value
  plannerTarget.value.songs.push({ key: uid(), songId: id, title, number })
  message.value = 'Dodano do nabożeństwa: ' + title
}
function addToSetlist() {
  addToService(songs.value.find(s => s.id === current.value.id))
  message.value = 'Dodano do nabożeństwa: ' + current.value.title
}
// Zamyka bazę i ustawia pieśń w głównym oknie, gotową do wyświetlenia.
function use() {
  tab.value = 'songs'
  selectedId.value = currentId.value
  managerOpen.value = false
}
</script>

<template>
  <div class="overlay" @click.self="close" @keydown.esc="close">
    <div class="modal manager" role="dialog" aria-modal="true" aria-label="Baza pieśni">
      <div class="modal-head">
        <h3>Baza pieśni <span class="pill">{{ draft.length }}</span></h3>
        <span v-if="dirty" class="unsaved">Niezapisane zmiany</span>
        <span class="spacer"></span>
        <button :disabled="!history.length" title="Wycofuje ostatnią czynność" @click="undo"><Icon name="undo" />Cofnij</button>
        <button class="primary" :disabled="!dirty" title="Zapisuje zmiany w bazie pieśni" @click="save"><Icon name="check" />Zapisz</button>
        <button class="iconbtn" aria-label="Zamknij" @click="close"><Icon name="x" /></button>
      </div>

      <div v-if="confirm === 'close'" class="danger-bar inner" role="alert">
        <Icon name="missing" />
        <span>Masz niezapisane zmiany w bazie pieśni.</span>
        <button @click="save(); managerOpen = false">Zapisz i zamknij</button>
        <button class="plain" @click="managerOpen = false">Odrzuć zmiany</button>
        <button class="plain" @click="confirm = ''">Wróć</button>
      </div>

      <div class="mgr-tools">
        <label class="searchbox">
          <Icon name="search" />
          <input v-model="search.songs" :ref="el => el && !el.dataset.f && (el.dataset.f = 1, el.focus())" type="search"
                 placeholder="Numer, tytuł albo fragment tekstu" aria-label="Szukaj pieśni">
        </label>
        <button @click="create"><Icon name="plus" />Nowa</button>
        <button @click="runImport(false)"><Icon name="import" />Import plików</button>
        <button @click="runImport(true)"><Icon name="folder" />Import folderu</button>
        <button :disabled="!draft.length" title="Zapisuje całą bazę do jednego pliku, który można potem zaimportować" @click="exportAll"><Icon name="up" />Eksport</button>
      </div>

      <div class="mgr-body">
        <!-- lista -->
        <div class="mgr-list">
          <div class="mgr-row mgr-headrow">
            <input type="checkbox" :checked="allChecked" aria-label="Zaznacz wszystkie widoczne" @change="toggleAll">
            <button class="sort" :aria-pressed="settings.songSort === 'number'" title="Sortuj po numerze" @click="settings.songSort = 'number'">Nr<Icon :name="settings.songSort === 'number' ? 'down' : 'sort'" /></button>
            <button class="sort" :aria-pressed="settings.songSort === 'title'" title="Sortuj po tytule" @click="settings.songSort = 'title'">Tytuł<Icon :name="settings.songSort === 'title' ? 'down' : 'sort'" /></button>
            <span>Początek tekstu</span><span class="r">Slajdy</span>
          </div>
          <div class="mgr-scroll">
            <p v-if="!visible.length" class="empty">{{ draft.length ? 'Nic nie pasuje do wyszukiwania.' : 'Baza jest pusta — zaimportuj pieśni albo dodaj nową.' }}</p>
            <div v-for="song in visible" :key="song.id" class="mgr-row" :class="{ selected: song.id === currentId }" @click="currentId = song.id">
              <input type="checkbox" :checked="checked.has(song.id)" :aria-label="'Zaznacz: ' + song.title" @click.stop @change="toggle(song.id)">
              <span class="n">{{ song.number }}</span>
              <button class="t" @click.stop="currentId = song.id">{{ song.title || 'Bez tytułu' }}</button>
              <span class="f">{{ firstLine(song) }}</span>
              <span class="r">{{ verses(song).length }}</span>
            </div>
          </div>
          <div class="mgr-foot">
            <span>{{ matches.length > visible.length ? `Pokazano ${visible.length} z ${matches.length} — zawęź wyszukiwanie` : `Pieśni: ${matches.length}` }}</span>
            <template v-if="checked.size">
              <template v-if="confirm === 'many'">
                <button class="del-yes" @click="removeChecked">Tak, usuń {{ checked.size }}</button>
                <button @click="confirm = ''">Nie</button>
              </template>
              <button v-else @click="confirm = 'many'"><Icon name="trash" />Usuń zaznaczone ({{ checked.size }})</button>
            </template>
          </div>
        </div>

        <!-- edycja -->
        <div class="mgr-edit">
          <p v-if="!current" class="empty">Kliknij pieśń na liście, żeby ją obejrzeć i poprawić.</p>
          <template v-else>
            <div class="row-num">
              <div><label for="mNum">Numer</label><input id="mNum" v-model="current.number" type="text" inputmode="numeric" @beforeinput="touch" @blur="editing = null"></div>
              <div><label for="mTitle">Tytuł</label><input id="mTitle" v-model="current.title" type="text" @beforeinput="touch" @blur="editing = null"></div>
            </div>
            <div class="mgr-cols">
              <div class="col">
                <label for="mText">Tekst (pusta linia = nowy slajd, [2] na początku = skrót)</label>
                <textarea id="mText" v-model="current.text" spellcheck="false" @beforeinput="touch" @blur="editing = null"></textarea>
              </div>
              <div class="col">
                <label>Podział na slajdy: {{ verses(current).length }}</label>
                <ol class="mgr-slides">
                  <li v-for="(v, i) in verses(current)" :key="i"><span class="vnum" :class="{ key: verseKey(current, i) !== String(i + 1) }">{{ verseKey(current, i) }}</span>{{ v }}</li>
                </ol>
              </div>
            </div>
            <div class="btnrow">
              <template v-if="role === 'display'">
                <button :disabled="dirty" :title="dirty ? 'Najpierw zapisz zmiany' : ''" @click="addToSetlist"><Icon name="plus" />Dodaj do nabożeństwa</button>
                <button :disabled="dirty" :title="dirty ? 'Najpierw zapisz zmiany' : ''" @click="use">Pokaż w podglądzie</button>
              </template>
              <button v-else-if="plannerTarget" :disabled="dirty" :title="dirty ? 'Najpierw zapisz zmiany' : ''" @click="addToPlan"><Icon name="plus" />Dodaj do tego nabożeństwa</button>
              <button @click="duplicate">Duplikuj</button>
              <span class="spacer"></span>
              <template v-if="confirm === 'one'">
                <button class="del-yes" @click="removeCurrent">Usuń</button>
                <button @click="confirm = ''">Nie</button>
              </template>
              <button v-else @click="confirm = 'one'"><Icon name="trash" />Usuń pieśń</button>
            </div>
            <p class="note">Zmiany trafiają do bazy dopiero po kliknięciu „Zapisz”. Do tego czasu można je cofać.</p>
          </template>
        </div>
      </div>
      <p v-if="message" class="url">{{ message }}</p>
    </div>
  </div>
</template>

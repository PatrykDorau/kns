<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import SyncButton from './SyncButton.vue'
import SongManager from './SongManager.vue'
import Brand from './Brand.vue'
import {
  attachToService, detachFromService, exportService, findSongs, firstLine, importService, managerOpen, missingInfo, plannerTarget, selectedId, verses, nearestService, newService, planAlert, planReady, prettyDate, today,
  removeService, role, services, settings, songs, sortedServices, uid,
} from './store.js'

// Organizacja nabożeństw: plan, z którego korzystają potem rzutnik i stream.
const currentId = ref(nearestService.value?.id ?? null)
const current = computed(() => services.value.find(s => s.id === currentId.value) || null)
watch(current, svc => { plannerTarget.value = svc }, { immediate: true })
const clash = computed(() => current.value && services.value.some(s => s !== current.value && s.date === current.value.date))
const when = t => (t ? new Date(t).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')
const songOf = entry => songs.value.find(s => s.id === entry.songId)
// Podgląd i edycja pieśni: otwiera bazę pieśni od razu na wskazanej.
function openSong(songId) {
  if (songId) selectedId.value = songId
  managerOpen.value = true
}
const query = ref('')
const results = computed(() => findSongs(query.value))
const confirmDelete = ref(false)
const message = ref('')

const KIND = { image: 'Zdjęcie', video: 'Film', pdf: 'PDF', pptx: 'Prezentacja' }
const songTitle = s => (s.number ? s.number + '. ' : '') + s.title
const inBase = entry => songs.value.some(s => s.id === entry.songId)

function create(date) {
  currentId.value = newService(typeof date === 'string' ? date : undefined).id
  message.value = ''
}
// Alarm prowadzi prosto do rzeczy: tworzy brakujące nabożeństwo albo otwiera to niekompletne.
function fixAlert() {
  if (planAlert.value.service) currentId.value = planAlert.value.service.id
  else create(planAlert.value.date)
}
const blank = key => !String(current.value[key] || '').trim()
function addSong(song) {
  current.value.songs.push({ key: uid(), songId: song.id, title: song.title, number: song.number })
  query.value = ''
}
function move(list, from, to) { list.splice(to, 0, ...list.splice(from, 1)) }
function remove() {
  removeService(current.value)
  currentId.value = sortedServices.value[0]?.id ?? null
  confirmDelete.value = false
}
async function exportIt() {
  const res = await exportService(current.value)
  if (res.dir) message.value = 'Zapisano folder: ' + res.dir
}
async function importIt() {
  const res = await importService()
  if (res.error) message.value = res.error
  else if (res.service) { currentId.value = res.service.id; message.value = 'Wczytano nabożeństwo z folderu.' }
}
</script>

<template>
  <div class="app">
    <header>
      <button class="iconbtn" title="Zmień służbę" aria-label="Zmień służbę" @click="role = null"><Icon name="left" /></button>
      <Brand />
      <h1>Organizacja nabożeństw</h1>
      <span class="spacer"></span>
      <SyncButton status />
      <span v-if="!settings.sharedDir" class="note">Bez folderu wspólnego — tylko ten komputer</span>
      <button title="Przeglądanie i edycja wszystkich pieśni" @click="openSong(null)"><Icon name="music" />Baza pieśni</button>
      <button title="Wczytuje nabożeństwo zapisane na innym komputerze" @click="importIt"><Icon name="import" />Wczytaj z folderu</button>
      <button class="primary" @click="create"><Icon name="plus" />Nowe nabożeństwo</button>
    </header>

    <div v-if="planAlert" class="danger-bar" role="alert">
      <Icon name="missing" />
      <span><b>Uwaga:</b> {{ planAlert.text }}</span>
      <button @click="fixAlert">{{ planAlert.service ? 'Uzupełnij' : 'Utwórz nabożeństwo na tę niedzielę' }}</button>
    </div>

    <div v-else-if="planReady" class="danger-bar ok-bar" role="status">
      <Icon name="check" />
      <span><b>Gotowe:</b> {{ planReady.text }}</span>
      <button @click="currentId = planReady.service.id">Pokaż</button>
    </div>

    <main class="planner">
      <section>
        <h2>Nabożeństwa</h2>
        <ul class="list">
          <li v-if="!services.length" class="empty"><Icon name="calendar" />Nie ma jeszcze żadnego nabożeństwa.<br>Kliknij „Nowe nabożeństwo”.</li>
          <li v-for="svc in sortedServices" :key="svc.id" class="row" :class="{ selected: svc.id === currentId, danger: svc.date >= today() && missingInfo(svc).length }">
            <button class="pick" @click="currentId = svc.id; confirmDelete = false">
              <span class="meta">
                <span class="name">{{ prettyDate(svc.date) }}</span>
                <span class="kind">{{ svc.sermonTitle || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> · {{ svc.speaker }}</template></span>
              </span>
              <span v-if="svc.date >= today() && missingInfo(svc).length" class="badge bad" :title="'Brakuje: ' + missingInfo(svc).join(', ')"><Icon name="missing" />BRAKI</span>
              <span v-else-if="svc.id === nearestService?.id" class="badge next">NAJBLIŻSZE</span>
            </button>
          </li>
        </ul>
      </section>

      <section class="props form">
        <div v-if="!current" class="empty">Wybierz nabożeństwo z listy albo utwórz nowe.</div>
        <template v-else>
          <h2>Nabożeństwo</h2>
          <div class="grid2">
            <div><label for="pDate">Data *</label><input id="pDate" v-model="current.date" type="date"></div>
            <div><label for="pSpeaker">Mówca *</label><input id="pSpeaker" v-model="current.speaker" type="text" :class="{ invalid: blank('speaker') }"></div>
            <div><label for="pTitle">Tytuł kazania *</label><input id="pTitle" v-model="current.sermonTitle" type="text" :class="{ invalid: blank('sermonTitle') }"></div>
            <div><label for="pPassage">Fragment *</label><input id="pPassage" v-model="current.passage" type="text" placeholder="np. J 3,16–21" :class="{ invalid: blank('passage') }"></div>
          </div>

          <p v-if="clash" class="note bad">Na ten dzień jest już inne nabożeństwo — przy synchronizacji zostaną połączone w jedno.</p>
          <p class="note">* pola wymagane — bez nich nabożeństwo jest oznaczone jako niekompletne.</p>
          <p v-if="current.createdBy || current.updatedBy" class="note">
            <template v-if="current.createdBy">Utworzył(a): <b>{{ current.createdBy }}</b></template>
            <template v-if="current.updatedBy"><template v-if="current.createdBy"> · </template>ostatnia zmiana: <b>{{ current.updatedBy }}</b><template v-if="current.updated">, {{ when(current.updated) }}</template></template>
          </p>

          <label for="pBand">Skład zespołu (opcjonalnie)</label>
          <textarea id="pBand" v-model="current.band" class="short" placeholder="np. Ania — wokal, Marek — gitara…"></textarea>

          <h2 class="sub" :class="{ bad: !current.songs.length }">Pieśni *</h2>
          <div class="finder">
            <label class="searchbox">
              <Icon name="search" />
              <input v-model="query" type="search" placeholder="Numer, tytuł lub fragment tekstu pieśni" aria-label="Wyszukaj pieśń"
                     @keydown.enter.prevent="results[0] && addSong(results[0])" @keydown.esc.stop="query = ''">
            </label>
            <ul v-if="query.trim()" class="results">
              <li v-if="!results.length" class="none">{{ songs.length ? 'Nie ma takiej pieśni w bazie.' : 'Baza pieśni jest pusta — uzupełnia ją służba rzutnika.' }}</li>
              <li v-for="song in results" :key="song.id">
                <button @click="addSong(song)"><Icon name="plus" /><span class="meta"><span class="name">{{ songTitle(song) }}</span><span class="kind">{{ firstLine(song) }}</span></span></button>
              </li>
            </ul>
          </div>
          <div v-if="!current.songs.length" class="empty slim bad">Nabożeństwo musi mieć pieśni — wyszukaj je powyżej.</div>
          <ol v-else class="members wide-rows">
            <li v-for="(entry, i) in current.songs" :key="entry.key">
              <span class="num">{{ i + 1 }}</span>
              <span class="meta">
                <span class="name">{{ songTitle(entry) }}</span>
                <span v-if="songOf(entry)" class="kind">{{ firstLine(songOf(entry)) }} · slajdów: {{ verses(songOf(entry)).length }}</span>
                <span v-else class="kind warnText">Tej pieśni nie ma już w bazie</span>
              </span>
              <button v-if="songOf(entry)" class="iconbtn" title="Podgląd i edycja pieśni" aria-label="Podgląd i edycja pieśni" @click="openSong(entry.songId)"><Icon name="pencil" /></button>
              <button class="iconbtn" :disabled="i === 0" title="Wyżej" aria-label="Przesuń wyżej" @click="move(current.songs, i, i - 1)"><Icon name="up" /></button>
              <button class="iconbtn" :disabled="i === current.songs.length - 1" title="Niżej" aria-label="Przesuń niżej" @click="move(current.songs, i, i + 1)"><Icon name="down" /></button>
              <button class="iconbtn danger" title="Usuń z nabożeństwa" aria-label="Usuń z nabożeństwa" @click="current.songs.splice(i, 1)"><Icon name="x" /></button>
            </li>
          </ol>

          <h2 class="sub">Załączniki dla rzutnika</h2>
          <p class="note">Np. prezentacja kaznodziei (PowerPoint lub PDF), zdjęcia, filmy. Służba rzutnika dostanie je razem z pieśniami.</p>
          <ol v-if="current.files.length" class="members wide-rows">
            <li v-for="(f, i) in current.files" :key="f.key">
              <span class="num">{{ KIND[f.type] || 'Plik' }}</span>
              <span class="name">{{ f.name }}</span>
              <button class="iconbtn danger" title="Usuń załącznik" aria-label="Usuń załącznik" @click="detachFromService(current, i)"><Icon name="x" /></button>
            </li>
          </ol>
          <button class="attach" @click="attachToService(current)"><Icon name="plus" />Dodaj załącznik</button>

          <label for="pNotes">Dodatkowe informacje — co szczególnego dzieje się na nabożeństwie</label>
          <textarea id="pNotes" v-model="current.notes" placeholder="np. chrzest po kazaniu, błogosławieństwo dzieci, rocznica…"></textarea>

          <div class="btnrow end">
            <button title="Zapisuje nabożeństwo jako folder do przeniesienia na inny komputer" @click="exportIt"><Icon name="folder" />Zapisz jako folder</button>
            <span class="spacer"></span>
            <template v-if="confirmDelete">
              <button class="del-yes" @click="remove">Usuń nabożeństwo</button>
              <button @click="confirmDelete = false">Nie</button>
            </template>
            <button v-else @click="confirmDelete = true"><Icon name="trash" />Usuń</button>
          </div>
          <p class="note">Zmiany zapisują się same{{ settings.sharedDir ? ' i trafiają do folderu wspólnego — inne komputery zobaczą je po chwili.' : '. Inne komputery zobaczą je dopiero po ustawieniu folderu wspólnego (ekran wyboru służby).' }}</p>
          <p v-if="message" class="url">{{ message }}</p>
        </template>
      </section>
    </main>

    <SongManager v-if="managerOpen" />
  </div>
</template>

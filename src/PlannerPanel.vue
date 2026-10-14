<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import SyncButton from './SyncButton.vue'
import SongManager from './SongManager.vue'
import Brand from './Brand.vue'
import {
  attachToService, exportService, findSongs, firstLine, importService, managerOpen, missingInfo, plannerTarget, selectedId, verses, nearestService, newService, planAlert, planReady, prettyDate, today,
  removeService, role, services, settings, songs, sortedServices, syncShared, uid,
} from './store.js'

// Organizacja nabożeństw: plan, z którego korzystają potem rzutnik i stream.
// Zmiany robi się na kopii roboczej; do nabożeństwa (i do innych komputerów) trafiają dopiero po „Zapisz”.
const copy = svc => JSON.parse(JSON.stringify(svc))
const currentId = ref(null)
const current = ref(null) // kopia robocza
const base = ref(null) // stan nabożeństwa w chwili otwarcia — do wykrywania zmian innych osób
const isNew = ref(false)
const original = computed(() => services.value.find(s => s.id === currentId.value) || null)
const dirty = computed(() => !!current.value && (isNew.value || JSON.stringify(current.value) !== JSON.stringify(base.value)))
watch(current, svc => { plannerTarget.value = svc }, { immediate: true })

function load(svc, fresh = false) {
  currentId.value = svc?.id ?? null
  current.value = svc ? copy(svc) : null
  base.value = svc ? copy(svc) : null
  isNew.value = fresh
  confirmDelete.value = false
  message.value = ''
  conflict.value = null
}
// Zmiana nabożeństwa albo wyjście z niezapisanymi zmianami wymaga potwierdzenia.
const leaveOk = () => !dirty.value || confirm('Masz niezapisane zmiany w tym nabożeństwie. Porzucić je?')
function select(svc) { if (svc.id !== currentId.value && leaveOk()) load(svc) }
function back() { if (leaveOk()) role.value = null }
// Gdy nikt tu niczego nie zmienia, kopia robocza nadąża za zmianami z innych komputerów.
watch(original, svc => {
  if (!svc && current.value && !isNew.value) { load(sortedServices.value[0]); return }
  if (svc && !dirty.value && JSON.stringify(svc) !== JSON.stringify(base.value)) load(svc)
}, { deep: true })
const remoteChanged = computed(() => !!original.value && !!base.value && (original.value.updated || 0) > (base.value.updated || 0))

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
const saving = ref(false)

const KIND = { image: 'Zdjęcie', video: 'Film', pdf: 'PDF', pptx: 'Prezentacja' }
const songTitle = s => (s.number ? s.number + '. ' : '') + s.title
const clash = computed(() => current.value && services.value.some(s => s.id !== current.value.id && s.date === current.value.date))
const when = t => (t ? new Date(t).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '')

function create(date) {
  if (!leaveOk()) return
  const day = typeof date === 'string' ? date : today()
  const existing = services.value.find(s => s.date === day)
  if (existing) { load(existing); message.value = 'Na ten dzień jest już nabożeństwo — otwarto je.'; return }
  load(newService(day, false), true)
}
// Alarm prowadzi prosto do rzeczy: tworzy brakujące nabożeństwo albo otwiera to niekompletne.
function fixAlert() {
  if (planAlert.value.service) select(planAlert.value.service)
  else create(planAlert.value.date)
}
const blank = key => !String(current.value[key] || '').trim()
function addSong(song) {
  current.value.songs.push({ key: uid(), songId: song.id, title: song.title, number: song.number })
  query.value = ''
}
function move(list, from, to) { list.splice(to, 0, ...list.splice(from, 1)) }
function remove() {
  if (original.value) removeService(original.value)
  load(sortedServices.value[0])
}
function discard() { if (confirm('Porzucić zmiany i wrócić do zapisanej wersji?')) load(isNew.value ? sortedServices.value[0] : original.value) }

/* ---------- zapis z wykrywaniem zmian innych osób ---------- */
// Porównanie: co ktoś zmienił od otwarcia (jego wersja), a co jest u mnie — pokazywane przed nadpisaniem.
const FIELDS = [['date', 'Data', v => prettyDate(v)], ['sermonTitle', 'Tytuł kazania'], ['passage', 'Fragment'], ['speaker', 'Mówca'], ['band', 'Skład zespołu'],
  ['songs', 'Pieśni', v => v.map(songTitle).join('\n')], ['files', 'Załączniki', v => v.map(x => x.name).join('\n')], ['notes', 'Dodatkowe informacje']]
const show = (field, svc) => { const [key, , fmt] = field; const v = svc[key] ?? ''; return (fmt ? fmt(v) : String(v)) || '—' }
const conflict = ref(null) // { theirs, rows: [{ label, theirs, mine, lost }] }
function compare(theirs) {
  const rows = []
  for (const field of FIELDS) {
    const t = show(field, theirs), m = show(field, current.value), b = show(field, base.value)
    if (t === m) continue
    rows.push({ label: field[1], theirs: t, mine: m, lost: t !== b }) // lost — jego zmiana zniknie po nadpisaniu
  }
  return rows
}
async function save() {
  if (clash.value && !confirm('Na ten dzień jest już inne nabożeństwo. Zapisać mimo to? Zostaną połączone w jedno.')) return
  saving.value = true
  try {
    // Najpierw świeży stan z folderu wspólnego — żeby zobaczyć zmiany zrobione w międzyczasie.
    if (settings.sharedDir) await syncShared()
    const theirs = original.value
    if (!isNew.value && theirs && (theirs.updated || 0) > (base.value.updated || 0)) {
      const rows = compare(theirs)
      if (rows.length) { conflict.value = { theirs: copy(theirs), rows }; return }
    }
    await commit()
  } finally { saving.value = false }
}
async function commit() {
  conflict.value = null
  const draft = copy(current.value)
  // Zapis jest nowszy od wszystkiego, co już jest w folderze wspólnym — inaczej synchronizacja przywróciłaby tamtą wersję.
  draft.updated = Math.max(Date.now(), (original.value?.updated || 0) + 1)
  if (isNew.value || !original.value) services.value.push(draft)
  else Object.assign(original.value, draft)
  load(original.value || services.value.find(s => s.id === draft.id))
  if (settings.sharedDir) { await syncShared(); message.value = 'Zapisano i wysłano do folderu wspólnego.' }
  else message.value = 'Zapisano.'
}
async function overwrite() { saving.value = true; try { await commit() } finally { saving.value = false } }
function takeTheirs() { load(original.value); message.value = 'Wczytano najnowszą wersję.' }

// Zamknięcie okna z niezapisanymi zmianami.
const beforeUnload = e => { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

async function exportIt() {
  const res = await exportService(current.value)
  if (res.dir) message.value = 'Zapisano folder: ' + res.dir
}
async function importIt() {
  if (!leaveOk()) return
  const res = await importService()
  if (res.error) message.value = res.error
  else if (res.service) { load(res.service); message.value = 'Wczytano nabożeństwo z folderu.' }
}

load(nearestService.value)
</script>

<template>
  <div class="app">
    <header>
      <button class="iconbtn" title="Zmień służbę" aria-label="Zmień służbę" @click="back"><Icon name="left" /></button>
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
      <button @click="select(planReady.service)">Pokaż</button>
    </div>

    <main class="planner">
      <section>
        <h2>Nabożeństwa</h2>
        <ul class="list">
          <li v-if="isNew && current" class="row selected"><button class="pick"><span class="meta"><span class="name">{{ prettyDate(current.date) }}</span><span class="kind">Nowe — jeszcze niezapisane</span></span></button></li>
          <li v-if="!services.length && !isNew" class="empty"><Icon name="calendar" />Nie ma jeszcze żadnego nabożeństwa.<br>Kliknij „Nowe nabożeństwo”.</li>
          <!-- Nadchodzące: czerwona obwódka (braki) albo zielona (komplet), z ikonką w rogu; minione — przygaszone. -->
          <li v-for="svc in sortedServices" :key="svc.id" class="row"
              :class="{ selected: svc.id === currentId, danger: svc.date >= today() && missingInfo(svc).length, good: svc.date >= today() && !missingInfo(svc).length, past: svc.date < today() }">
            <span v-if="svc.date >= today()" class="corner" :class="missingInfo(svc).length ? 'bad' : 'ok'" aria-hidden="true"><Icon :name="missingInfo(svc).length ? 'missing' : 'check'" /></span>
            <button class="pick" @click="select(svc)">
              <span class="meta">
                <span class="name">{{ prettyDate(svc.date) }}</span>
                <span class="kind">{{ svc.sermonTitle || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> · {{ svc.speaker }}</template></span>
              </span>
              <span class="tags">
                <span v-if="svc.id === nearestService?.id && svc.date >= today()" class="badge next">NAJBLIŻSZE</span>
                <span v-if="svc.date >= today() && missingInfo(svc).length" class="badge bad" :title="'Brakuje: ' + missingInfo(svc).join(', ')"><Icon name="missing" />BRAKI: {{ missingInfo(svc).join(', ') }}</span>
                <span v-if="svc.date < today()" class="badge past">MINIONE</span>
              </span>
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
                <span class="name">{{ entry.title }}<span v-if="entry.number" class="nr">nr {{ entry.number }}</span></span>
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
              <button class="iconbtn danger" title="Usuń załącznik" aria-label="Usuń załącznik" @click="current.files.splice(i, 1)"><Icon name="x" /></button>
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
            <button v-else-if="!isNew" @click="confirmDelete = true"><Icon name="trash" />Usuń</button>
          </div>
          <p v-if="message" class="url">{{ message }}</p>

          <!-- Zapis: nic nie zapisuje się samo. -->
          <div class="savebar" :class="{ dirty }">
            <span v-if="remoteChanged && dirty" class="bad"><Icon name="missing" />Ktoś zmienił to nabożeństwo, odkąd je otworzyłeś — przy zapisie zobaczysz różnice.</span>
            <span v-else-if="dirty">Niezapisane zmiany{{ settings.sharedDir ? ' — inne komputery i telefony zobaczą je po zapisaniu.' : '.' }}</span>
            <span v-else class="ok"><Icon name="check" />Zapisane<template v-if="current.updatedBy"> · ostatnio: {{ current.updatedBy }}, {{ when(current.updated) }}</template></span>
            <span class="spacer"></span>
            <button v-if="dirty" :disabled="saving" @click="discard">Porzuć zmiany</button>
            <button class="primary" :disabled="!dirty || saving" @click="save"><Icon name="check" />{{ saving ? 'Zapisuję…' : 'Zapisz' }}</button>
          </div>
        </template>
      </section>
    </main>

    <SongManager v-if="managerOpen" />

    <!-- Ktoś zapisał to nabożeństwo w międzyczasie: porównanie przed nadpisaniem. -->
    <div v-if="conflict" class="overlay">
      <div class="modal conflict" role="dialog" aria-modal="true" aria-label="Ktoś zmienił to nabożeństwo">
        <div class="modal-head">
          <h3>Ktoś zmienił to nabożeństwo w międzyczasie</h3>
          <button class="iconbtn" aria-label="Zamknij" @click="conflict = null"><Icon name="x" /></button>
        </div>
        <p class="note">Zapisał(a): <b>{{ conflict.theirs.updatedBy || 'inne urządzenie' }}</b><template v-if="conflict.theirs.updated">, {{ when(conflict.theirs.updated) }}</template>.
          Na czerwono — jego zmiany, które znikną, jeśli zapiszesz swoją wersję.</p>
        <table class="diff">
          <thead><tr><th></th><th>Jego wersja (zapisana)</th><th>Twoja wersja</th></tr></thead>
          <tbody>
            <tr v-for="row in conflict.rows" :key="row.label" :class="{ lost: row.lost }">
              <th>{{ row.label }}</th><td>{{ row.theirs }}</td><td>{{ row.mine }}</td>
            </tr>
          </tbody>
        </table>
        <div class="btnrow end">
          <button @click="conflict = null">Anuluj</button>
          <button @click="takeTheirs">Weź jego wersję (porzuć moje)</button>
          <button class="del-yes" :disabled="saving" @click="overwrite">Nadpisz moją wersją</button>
        </div>
      </div>
    </div>
  </div>
</template>

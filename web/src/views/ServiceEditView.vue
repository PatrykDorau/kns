<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// edycja
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <!-- podgląd nabożeństwa (bez prawa edycji) -->
  <article v-if="!canEdit || !svcEditing" class="ann-view svc-view">
    <div class="dv-hero">
      <div class="ann-tags"><span class="ann-tag pin">Nabożeństwo</span><span v-if="canEdit" class="ann-tag" :class="missing(current).length ? 'dv-bad' : 'dv-ok'">{{ missing(current).length ? 'Braki: ' + missing(current).length : 'Komplet' }}</span></div>
      <h2 class="ann-view-title">{{ pretty(current.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) }}</h2>
      <div class="facts">
        <span class="fact"><svg class="i"><use href="#calendar"/></svg><span><small>Godzina</small><b>{{ current.time || DEFAULT_TIME }}</b></span></span>
        <a class="fact" :href="mapLink(current.place || DEFAULT_PLACE)" target="_blank" rel="noopener"><svg class="i"><use href="#pin"/></svg><span><small>Miejsce · mapa</small><b>{{ current.place || DEFAULT_PLACE }}</b></span></a>
        <span v-if="current.speaker" class="fact"><svg class="i"><use href="#mic"/></svg><span><small>Kazanie</small><b>{{ current.speaker }}</b></span></span>
      </div>
    </div>
    <div class="dv-grid">
    <div class="dv-main">
    <template v-if="(current.program || []).length">
      <h3 class="view-h">Harmonogram</h3>
      <program-editor :items="current.program" :start="current.time || DEFAULT_TIME" readonly :sermon="{ title: current.sermonTitle, passage: current.passage, speaker: current.speaker }">
        <template #item="{ item }"><span v-if="songSlots.includes(item.key)" class="view-songs"><span v-for="e in songsIn(item.key)" :key="e.key">♪ {{ songTitle(e) }}</span></span></template>
      </program-editor>
    </template>
    <template v-else-if="current.songs.length">
      <h3 class="view-h">Pieśni</h3>
      <span class="view-songs"><span v-for="e in current.songs" :key="e.key">♪ {{ songTitle(e) }}</span></span>
    </template>
    </div>
    <aside class="dv-side">
      <p v-if="canEdit && missing(current).length" class="pending-note"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ missing(current).join(', ') }}</p>
      <div v-if="current.sermonTitle || current.passage || current.speaker" class="view-card">
        <small>Kazanie</small>
        <b>{{ current.sermonTitle || 'Bez tytułu' }}</b>
        <span>{{ [current.passage, current.speaker].filter(Boolean).join(' — ') }}</span>
        <ul v-if="thoughtList(current).length" class="kh-th-list"><li v-for="(t, i) in thoughtList(current)" :key="i">{{ t }}</li></ul>
      </div>
      <div v-if="current.band" class="dv-card">
        <small class="dv-card-h">Zespół</small>
        <ul v-if="(current.bandList || []).length" class="dv-people"><li v-for="b in current.bandList" :key="b.key"><span class="dv-av">{{ initials({ name: b.name, email: b.name }) }}</span><span><b>{{ b.name }}</b><small v-if="b.instrument">{{ b.instrument }}</small></span></li></ul>
        <div v-else class="ann-view-text">{{ current.band }}</div>
      </div>
      <div v-if="current.notes" class="dv-card"><small class="dv-card-h">Informacje</small><div class="ann-view-text">{{ current.notes }}</div></div>
      <button v-if="canEdit" class="ann-edit-btn" :class="{ primary: missing(current).length }" @click="svcEditing = true"><svg class="i"><use href="#pencil"/></svg>{{ missing(current).length ? 'Uzupełnij nabożeństwo' : 'Edytuj nabożeństwo' }}</button>
    </aside>
    </div>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  </article>
  <template v-else>
  <fieldset class="plain" :disabled="!canEdit">
  <div class="row">
    <div><label for="date">Data <span class="req">*</span></label><input id="date" v-model="current.date" type="date"></div>
    <div><label for="time">Godzina</label><input id="time" v-model="current.time" type="time"></div>
  </div>
  <label for="place">Miejsce</label>
  <input id="place" v-model="current.place" autocomplete="off">
  </fieldset>

  <!-- Harmonogram: kazanie i pieśni uzupełnia się w punktach programu. -->
  <label>Harmonogram nabożeństwa</label>
  <program-editor :items="current.program" :start="current.time || DEFAULT_TIME" :readonly="!canEdit" :template="typeOf('nabozenstwo').program"
                  :sermon="{ title: current.sermonTitle, passage: current.passage, speaker: current.speaker }" @fill="fillProgram(current, 'nabozenstwo')">
    <template #item="{ item }">
      <div v-if="item.key === sermonSlot" class="pg-extra">
        <template v-if="canEdit">
          <div class="row">
            <div><label>Mówca <span class="req">*</span></label><input v-model="current.speaker" :class="{ invalid: !current.speaker.trim() }" autocomplete="off"></div>
            <div><label>Fragment <span class="req">*</span></label><input v-model="current.passage" :class="{ invalid: !current.passage.trim() }" placeholder="np. J 3,16–21" autocomplete="off"></div>
          </div>
          <label>Tytuł kazania <span class="req">*</span></label>
          <input v-model="current.sermonTitle" :class="{ invalid: !current.sermonTitle.trim() }" autocomplete="off">
          <label>Myśli z kazania</label>
          <thoughts-editor v-model="current.thoughts"></thoughts-editor>
        </template>
        <p v-else class="pg-sermon">{{ [current.sermonTitle, current.passage, current.speaker].filter(Boolean).join(' · ') || 'Kazanie nie jest jeszcze uzupełnione.' }}</p>
      </div>
      <div v-else-if="songSlots.includes(item.key)" class="pg-extra">
        <div v-for="entry in songsIn(item.key)" :key="entry.key" class="song">
          <span class="pos"><svg class="i"><use href="#music"/></svg></span>
          <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
          <template v-if="canEdit">
            <button class="icon" aria-label="Wyżej" @click="moveIn(item.key, entry, -1)"><svg class="i"><use href="#up"/></svg></button>
            <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="removeSong(entry)"><svg class="i"><use href="#x"/></svg></button>
          </template>
        </div>
        <p v-if="!songsIn(item.key).length && !canEdit" class="pg-sermon">Pieśni nie są jeszcze wybrane.</p>
        <button v-if="canEdit" type="button" class="pg-addsong" @click="pickSongsFor(item.key)"><svg class="i"><use href="#plus"/></svg>Dodaj pieśń</button>
      </div>
    </template>
  </program-editor>
  <fieldset class="plain" :disabled="!canEdit">
  <!-- Bez punktu „Kazanie” w programie — pola kazania tutaj. -->
  <template v-if="!sermonSlot">
    <div class="row">
      <div><label for="speaker">Mówca <span class="req">*</span></label><input id="speaker" v-model="current.speaker" :class="{ invalid: !current.speaker.trim() }" autocomplete="off"></div>
      <div><label for="passage">Fragment <span class="req">*</span></label><input id="passage" v-model="current.passage" :class="{ invalid: !current.passage.trim() }" placeholder="np. J 3,16–21" autocomplete="off"></div>
    </div>
    <label for="title">Tytuł kazania <span class="req">*</span></label>
    <input id="title" v-model="current.sermonTitle" :class="{ invalid: !current.sermonTitle.trim() }" autocomplete="off">
    <label>Myśli z kazania</label>
    <thoughts-editor v-model="current.thoughts"></thoughts-editor>
  </template>

  <!-- Wybór pieśni (do punktu uwielbienia albo — bez takiego punktu — do całego nabożeństwa). -->
  <div v-if="songSheet" class="sheet">
    <div class="head">
      <button class="ghost" aria-label="Zamknij" @click="songSheet = false"><svg class="i"><use href="#back"/></svg></button>
      <b>Dodaj pieśń</b>
      <button class="primary" @click="songSheet = false">Gotowe</button>
    </div>
    <div class="searchbox">
      <svg class="i"><use href="#search"/></svg>
      <input v-model="query" type="search" :placeholder="`Szukaj: numer, tytuł, tekst (${songs.length})`" autocomplete="off">
    </div>
    <div class="found">
      <button v-for="song in results" :key="song.id" :class="{ chosen: chosen(song) }" :aria-pressed="!!chosen(song)" @click="addSong(song, songSheetSlot)">
        <span class="ph">{{ song.number || '♪' }}</span>
        <span class="meta"><b>{{ song.title }}</b><small>{{ lines(song.text) }}</small></span>
        <span v-if="chosen(song)" class="chosen-mark"><svg class="i"><use href="#check"/></svg>Wybrana</span>
        <svg v-else class="i"><use href="#plus"/></svg>
      </button>
    </div>
  </div>

  <!-- Pieśni wybiera się tylko w punktach „Uwielbienie” harmonogramu. -->
  <template v-if="!songSlots.length">
  <label>Pieśni <span class="req">*</span></label>
  <p class="note" style="margin-top:0">Pieśni dodaje się w harmonogramie — w punkcie „Uwielbienie”. Dodaj taki punkt (albo wstaw program z szablonu), żeby wybrać pieśni.</p>
  <div v-if="current.songs.length" class="songs">
    <div v-for="(entry, i) in current.songs" :key="entry.key" class="song">
      <span class="pos">{{ i + 1 }}</span>
      <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
      <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="current.songs.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
    </div>
  </div>
  </template>

  <label>Skład zespołu</label>
  <div class="band">
    <div v-for="(b, i) in current.bandList" :key="b.key" class="band-row">
      <b>{{ b.name }}</b>
      <select v-model="b.instrument" class="field" :class="{ empty: !b.instrument }" :aria-label="'Instrument — ' + b.name" :data-band="b.key">
        <option value="">Wybierz instrument…</option>
        <option v-for="x in INSTRUMENTS" :key="x" :value="x">{{ x }}</option>
        <option v-if="b.instrument && !INSTRUMENTS.includes(b.instrument)" :value="b.instrument">{{ b.instrument }}</option>
      </select>
      <button type="button" class="icon" :aria-label="'Usuń ' + b.name + ' ze składu'" title="Usuń ze składu" @click="current.bandList.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
    </div>
    <button type="button" class="songsbtn" @click="openBandPick"><svg class="i"><use href="#plus"/></svg>Dodaj osobę<svg class="i chev"><use href="#chev"/></svg></button>
  </div>
  <label for="notes">Dodatkowe informacje</label>
  <textarea id="notes" v-model="current.notes" placeholder="np. chrzest po kazaniu, błogosławieństwo dzieci, rocznica…"></textarea>
  <label>Załączniki dla rzutnika</label>
  <p class="note" style="margin-top:0">Np. prezentacja kaznodziei, PDF, zdjęcia, filmy. Rzutnik dostanie je razem z pieśniami.</p>
  <div v-for="(f, i) in current.files" :key="f.key" class="song file">
    <span class="pos">{{ KIND[f.type] || 'Plik' }}</span>
    <div class="meta"><b>{{ f.name }}</b></div>
    <button class="icon" :disabled="!!uploading" aria-label="Usuń załącznik" @click="current.files.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
  </div>
  <template v-if="uploading">
    <p class="note" style="margin-bottom:0">{{ uploading }}</p>
    <div class="progress"><i :style="{ width: Math.round(progress * 100) + '%' }"></i></div>
  </template>
  <div class="attach">
    <button :disabled="!!uploading || offline" @click="$refs.phoneFile.click()"><svg class="i"><use href="#clip"/></svg>Z urządzenia</button>
    <button :disabled="!!uploading || offline" @click="openPicker"><svg class="i"><use href="#drive"/></svg>Z Dysku Google</button>
  </div>
  <input ref="phoneFile" type="file" multiple :accept="ACCEPT" hidden @change="fromPhone">
  <p v-if="current.createdBy || current.updatedBy" class="note who">
    <template v-if="current.createdBy">Utworzył(a): {{ current.createdBy }}</template>
    <template v-if="current.updatedBy"><br>Ostatnia zmiana: {{ current.updatedBy }}<template v-if="current.updated">, {{ new Date(current.updated).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</template></template>
  </p>


  <!-- wybór pliku z Dysku Google -->
  <div v-if="picker" class="sheet">
    <div class="head">
      <button class="ghost" @click="picker = false"><svg class="i"><use href="#back"/></svg></button>
      <b>Plik z Dysku Google</b>
    </div>
    <div class="searchbox">
      <svg class="i"><use href="#search"/></svg>
      <input v-model="pickQuery" type="search" placeholder="Nazwa pliku" autocomplete="off" @input="searchSoon">
    </div>
    <div class="found">
      <p v-if="pickBusy" class="note">Szukam…</p>
      <p v-else-if="!pickFound.length" class="note">Nic nie znaleziono. Szukane są zdjęcia, filmy, PDF i prezentacje (także Prezentacje Google).</p>
      <button v-for="f in pickFound" :key="f.id" @click="fromDrive(f)">
        <img v-if="f.thumbnailLink" :src="f.thumbnailLink" alt="" referrerpolicy="no-referrer">
        <span v-else class="ph">{{ KIND[fileType(f.mimeType, f.name)] }}</span>
        <span class="meta"><b>{{ f.name }}</b><small>{{ KIND[fileType(f.mimeType, f.name)] }}<template v-if="f.modifiedTime"> · {{ new Date(f.modifiedTime).toLocaleDateString('pl') }}</template></small></span>
      </button>
    </div>
  </div>

  </fieldset>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div v-if="canEdit" class="bar">
    <button v-if="confirmDelete" class="danger" :disabled="busy" @click="remove">Na pewno usuń</button>
    <button v-else :disabled="busy" aria-label="Usuń nabożeństwo" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    <button class="primary" :disabled="busy || !dirty" @click="save">
      <svg v-if="!dirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : dirty ? 'Zapisz' : 'Zapisane' }}
    </button>
  </div>
  </template>
</template>

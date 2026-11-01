<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { computed, defineComponent, nextTick, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import { addMinutes, categoryName } from '@/services/church'
import FormSection from '@/components/FormSection.vue'
import SermonNotes from '@/components/SermonNotes.vue'

const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`
const SERMON_GAPS = ['tytuł kazania', 'fragment', 'mówca']

// edycja: sekcje ze streszczeniem; od razu otwarte te z brakami (na dużym ekranie wszystkie)
export default defineComponent({
  components: { FormSection, SermonNotes },
  setup() {
    const app = useApp(), { current, svcEditing, services, missing, pretty, DEFAULT_TIME, DEFAULT_PLACE, songsIn } = app
    const secs = ref({})
    function reset() {
      const c = current.value
      if (!c || !svcEditing.value) return
      const wide = matchMedia('(min-width: 900px)').matches, gaps = missing(c), isNew = !services.value.some(x => x.id === c.id)
      secs.value = { when: wide || isNew, sermon: wide || gaps.some(g => SERMON_GAPS.includes(g)), songs: wide || gaps.includes('pieśni'), program: wide, band: wide, more: wide }
    }
    watch(() => [current.value?.id, svcEditing.value], reset, { immediate: true })
    const toggle = id => { secs.value[id] = !secs.value[id] }
    // tapnięcie w brak: otwiera sekcję i podjeżdża do niej
    async function jump(id) {
      secs.value[id] = true
      await nextTick()
      document.getElementById('sec-' + id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    const gapSec = g => (g === 'pieśni' ? 'songs' : 'sermon')
    const day = computed(() => (current.value ? pretty(current.value.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) : ''))
    const summary = computed(() => {
      const c = current.value
      if (!c) return {}
      const n = c.songs.length, band = c.bandList || [], extra = [c.notes?.trim() && 'Notatka', c.files?.length && plural(c.files.length, 'załącznik', 'załączniki', 'załączników')].filter(Boolean)
      return {
        when: [c.time || DEFAULT_TIME, c.place || DEFAULT_PLACE].join(' · '),
        sermon: [c.sermonTitle, c.passage, c.speaker].filter(x => String(x || '').trim()).join(' · ') || 'Jeszcze nieuzupełnione',
        songs: n ? plural(n, 'pieśń', 'pieśni', 'pieśni') : 'Nie wybrano',
        program: c.program.length ? plural(c.program.length, 'punkt', 'punkty', 'punktów') : 'Program nie jest ułożony',
        band: band.length ? band.map(b => b.name).join(', ') : 'Nikt nie jest dodany',
        more: extra.join(' · ') || 'Notatka i pliki dla rzutnika',
      }
    })
    const bad = computed(() => { const gaps = current.value ? missing(current.value) : []; return { sermon: gaps.filter(g => SERMON_GAPS.includes(g)).length, songs: gaps.includes('pieśni') ? 1 : 0 } })
    const slotName = key => { const p = current.value.program.find(x => x.key === key); return p ? [addMinutes(current.value.time || DEFAULT_TIME, p.offset), p.title || categoryName(p)].join(' · ') : '' }
    return { ...app, secs, toggle, jump, gapSec, day, summary, bad, slotName, songsIn }
  },
})
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
      <p v-if="canEdit && missing(current).length" class="pending-note"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ missing(current).join(', ') }}</p>
      <button v-if="canEdit" class="ann-edit-btn" :class="{ primary: missing(current).length }" @click="svcEditing = true"><svg class="i"><use href="#pencil"/></svg>{{ missing(current).length ? 'Uzupełnij nabożeństwo' : 'Edytuj nabożeństwo' }}</button>
    </div>
    <div class="dv-grid">
    <div class="dv-main">
    <!-- notatki z kazania (pytania od kaznodziei) — tylko na tym urządzeniu -->
    <SermonNotes v-if="current.questions" :service="current" />
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
    </aside>
    </div>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  </article>
  <template v-else>
  <div class="se">
  <div class="se-top">
    <h2>{{ day }}</h2>
    <p v-if="missing(current).length" class="se-gaps"><span><svg class="i"><use href="#warn"/></svg>Brakuje</span><button v-for="g in missing(current)" :key="g" type="button" @click="jump(gapSec(g))">{{ g }}</button></p>
    <p v-else class="se-full"><svg class="i"><use href="#check"/></svg>Wszystko uzupełnione</p>
  </div>

  <FormSection id="when" icon="calendar" title="Termin i miejsce" :summary="summary.when" :open="secs.when" @toggle="toggle('when')">
    <div class="row">
      <div><label for="date">Data <span class="req">*</span></label><input id="date" v-model="current.date" type="date"></div>
      <div><label for="time">Godzina</label><input id="time" v-model="current.time" type="time"></div>
    </div>
    <label for="place">Miejsce</label>
    <input id="place" v-model="current.place" autocomplete="off">
  </FormSection>

  <FormSection id="sermon" icon="book" title="Kazanie" :summary="summary.sermon" :bad="bad.sermon" :open="secs.sermon" @toggle="toggle('sermon')">
    <label for="speaker">Mówca <span class="req">*</span></label>
    <input id="speaker" v-model="current.speaker" :class="{ invalid: !current.speaker.trim() }" autocomplete="off">
    <label for="title">Tytuł <span class="req">*</span></label>
    <input id="title" v-model="current.sermonTitle" :class="{ invalid: !current.sermonTitle.trim() }" autocomplete="off">
    <label for="passage">Fragment <span class="req">*</span></label>
    <input id="passage" v-model="current.passage" :class="{ invalid: !current.passage.trim() }" placeholder="np. J 3,16–21" autocomplete="off">
    <details class="se-more">
      <summary>Myśli i pytania do notatek<svg class="i"><use href="#down"/></svg></summary>
      <label>Myśli z kazania</label>
      <thoughts-editor v-model="current.thoughts"></thoughts-editor>
      <label>Pytania do notatek</label>
      <thoughts-editor v-model="current.questions" placeholder="Pytanie, np. Co Bóg mówi mi przez ten fragment?" add-label="Dodaj pytanie" remove-label="Usuń pytanie" hint="Pytania, na które słuchacze mogą odpowiadać w swoich notatkach w trakcie kazania (widoczne od godziny przed nabożeństwem)."></thoughts-editor>
    </details>
  </FormSection>

  <FormSection id="songs" icon="music" title="Pieśni" :summary="summary.songs" :bad="bad.songs" :open="secs.songs" @toggle="toggle('songs')">
    <template v-if="songSlots.length">
      <div v-for="key in songSlots" :key="key" class="se-slot">
        <small v-if="songSlots.length > 1">{{ slotName(key) }}</small>
        <div v-for="entry in songsIn(key)" :key="entry.key" class="song">
          <span class="pos"><svg class="i"><use href="#music"/></svg></span>
          <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
          <button class="icon" aria-label="Wyżej" @click="moveIn(key, entry, -1)"><svg class="i"><use href="#up"/></svg></button>
          <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="removeSong(entry)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <button type="button" class="pg-addsong" @click="pickSongsFor(key)"><svg class="i"><use href="#plus"/></svg>Dodaj pieśń</button>
      </div>
    </template>
    <template v-else>
      <p class="note" style="margin-top:0">Pieśni dodaje się do punktu „Uwielbienie”. Dodaj taki punkt w harmonogramie albo wstaw program z szablonu.</p>
      <div v-if="current.songs.length" class="songs">
        <div v-for="(entry, i) in current.songs" :key="entry.key" class="song">
          <span class="pos">{{ i + 1 }}</span>
          <div class="meta"><b>{{ songTitle(entry) }}</b><small :class="{ missing: !inBase(entry) }">{{ firstLine(entry) }}</small></div>
          <button class="icon" aria-label="Usuń pieśń z nabożeństwa" @click="current.songs.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
        </div>
      </div>
    </template>
  </FormSection>

  <FormSection id="program" icon="list" title="Harmonogram" :summary="summary.program" :open="secs.program" @toggle="toggle('program')">
    <program-editor :items="current.program" :start="current.time || DEFAULT_TIME" :template="typeOf('nabozenstwo').program"
                    :sermon="{ title: current.sermonTitle, passage: current.passage, speaker: current.speaker }" @fill="fillProgram(current, 'nabozenstwo')"></program-editor>
  </FormSection>

  <FormSection id="band" icon="users" title="Zespół" :summary="summary.band" :open="secs.band" @toggle="toggle('band')">
    <div class="band">
      <div v-for="(b, i) in current.bandList" :key="b.key" class="band-row">
        <b>{{ b.name }}</b>
        <UiSelect v-model="b.instrument" :label="'Instrument — ' + b.name" placeholder="Wybierz instrument…" :data-band="b.key" :options="[...INSTRUMENTS.map(x => ({ value: x, label: x })), ...(b.instrument && !INSTRUMENTS.includes(b.instrument) ? [{ value: b.instrument, label: b.instrument }] : [])]" />
        <button type="button" class="icon" :aria-label="'Usuń ' + b.name + ' ze składu'" title="Usuń ze składu" @click="current.bandList.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
      </div>
      <button type="button" class="songsbtn" @click="openBandPick"><svg class="i"><use href="#plus"/></svg>Dodaj osobę<svg class="i chev"><use href="#chev"/></svg></button>
    </div>
  </FormSection>

  <FormSection id="more" icon="clip" title="Informacje i pliki" :summary="summary.more" :open="secs.more" @toggle="toggle('more')">
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
      <button :disabled="!!uploading || offline" @click="pickPhoneFile($refs.phoneFile)"><svg class="i"><use href="#clip"/></svg>Z urządzenia</button>
      <button :disabled="!!uploading || offline" @click="openPicker"><svg class="i"><use href="#drive"/></svg>Z Dysku Google</button>
    </div>
    <input ref="phoneFile" type="file" multiple :accept="ACCEPT" hidden @change="fromPhone">
  </FormSection>

  <p v-if="current.createdBy || current.updatedBy" class="note who">
    <template v-if="current.createdBy">Utworzył(a): {{ current.createdBy }}</template>
    <template v-if="current.updatedBy"><br>Ostatnia zmiana: {{ current.updatedBy }}<template v-if="current.updated">, {{ new Date(current.updated).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</template></template>
  </p>
  <div v-if="services.some(x => x.id === current.id)" class="se-del">
    <button v-if="confirmDelete" class="danger" :disabled="busy" @click="remove">Na pewno usuń</button>
    <button v-else type="button" class="ghost" :disabled="busy" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg>Usuń nabożeństwo</button>
  </div>
  </div>

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

  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div class="bar" :class="{ idle: !dirty && !busy }">
    <button class="primary" :disabled="busy || !dirty" @click="save">
      <svg v-if="!dirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : dirty ? 'Zapisz' : 'Zapisane' }}
    </button>
  </div>
  </template>
</template>

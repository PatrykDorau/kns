<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { label, uid } from '@/stores'
import { BANNER_DEFAULT } from '@/services/studio/cards'
import { useDesk } from '@/composables/stream/useStreamDesk'
import TextColor from './TextColor.vue'
import PhotoPicker from './PhotoPicker.vue'

// Baner w presecie: gotowe wzory i własne ustawienia (styl, kolor, napisy, kod QR), do tego kolejka.
const props = defineProps<{ preset: { banner: any, queue: any[], cycle: boolean, sec: number } }>()
const b = props.preset.banner, set = props.preset
for (const [k, v] of Object.entries(BANNER_DEFAULT)) if (b[k] === undefined) b[k] = v // nowe pola po aktualizacji
const { mediaList } = useDesk()
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
const PLACES = [['bottom', 'Na dole', 'Na środku przy dolnej krawędzi'], ['corner', 'W rogu', 'W prawym dolnym rogu, mała'], ['full', 'Cały kadr', 'Na cały obraz; PNG z przezroczystością zostawia kamerę widoczną']] as const
const picName = q => label(images.value.find(it => it.id === q.pic) || { title: 'Grafika' })
const STYLES = [['rock', 'Ciemny pas', 'Ciemny pas u dołu z logo i wielkim napisem'], ['edit', 'Jasny pas', 'Kremowy pas z elegancką typografią'], ['frame', 'Ramka', 'Zaokrąglony baner w kolorze przez całą szerokość'], ['band', 'Pasek', 'Ciemny pasek u dołu przechodzący w obraz, z logo'], ['card', 'Karta', 'Jasna karta w prawym dolnym rogu — zasłania mniej'], ['image', 'Grafika', 'Gotowa grafika z Biblioteki zamiast napisów']] as const
const QRS = [['all', 'Wszystkie (wsparcie, YouTube, Spotify)'], ['bank', 'Wsparcie (przelew / BLIK)'], ['youtube', 'YouTube'], ['spotify', 'Spotify'], ['link', 'Własny link'], ['none', 'Bez kodu']] as const
const PRESETS = [
  ['Podziękowanie', { title: 'Dziękujemy, że byliście z nami!', sub: BANNER_DEFAULT.sub, note: '', qr: 'all' }],
  ['Wsparcie', { title: 'Buduj razem z nami', sub: 'Twoje wsparcie ma znaczenie', note: '', qr: 'bank' }],
  ['YouTube', { title: 'Subskrybuj nasz kanał', sub: 'Kazania i transmisje co tydzień', note: '', qr: 'youtube' }],
  ['Podcast', { title: 'Słuchaj kazań w drodze', sub: 'Kazania jako podcast na Spotify', note: '', qr: 'spotify' }],
] as const
// Kolejka: kilka banerów przełączanych w kółko (np. najpierw BLIK, potem sociale). Kliknięty baner z kolejki
// wczytuje się do edycji powyżej — zmiany od razu zapisują się w nim.
const editing = ref('')
const copyB = () => JSON.parse(JSON.stringify({ ink: b.ink, outline: b.outline, pic: b.pic, place: b.place, style: b.style, color: b.color, title: b.title, sub: b.sub, note: b.note, qr: b.qr, link: b.link }))
watch(b, () => { const q = set.queue.find(x => x.id === editing.value); if (q) Object.assign(q, copyB()) }, { deep: true })
function addToQueue() { const item = { id: uid(), ...copyB() }; set.queue.push(item); editing.value = item.id }
function editQueued(item) { editing.value = item.id; Object.assign(b, { ...BANNER_DEFAULT, ...item, id: undefined }); delete (b as any).id }
function dropQueued(item) { set.queue = set.queue.filter(x => x !== item); if (editing.value === item.id) editing.value = '' }
function moveQueued(i, d) { const l = set.queue, [x] = l.splice(i, 1); l.splice(i + d, 0, x) }
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Baner">
    <div v-if="b.style !== 'image'" class="desk-opt-group">
      <small class="muted">Wzór</small>
      <button v-for="[name, p] in PRESETS" :key="name" class="small" @click="Object.assign(b, p)">{{ name }}</button>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Styl</small>
      <button v-for="[id, name, tip] in STYLES" :key="id" :class="{ on: b.style === id }" :aria-pressed="b.style === id" :title="tip" @click="b.style = id">{{ name }}</button>
      <label v-if="b.style !== 'image'" class="desk-color" title="Kolor banera"><input v-model="b.color" type="color" aria-label="Kolor banera"></label>
      <button v-for="c in b.style === 'image' ? [] : ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: b.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="b.color = c"></button>
    </div>
    <template v-if="b.style === 'image'">
      <div class="desk-opt-group">
        <small class="muted">Grafika</small>
        <select v-model="b.pic" aria-label="Grafika banera">
          <option value="">— wybierz grafikę —</option>
          <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
        </select>
        <PhotoPicker v-model="b.pic" text="Z Materiałów lub dysku…" />
      </div>
      <div class="desk-opt-group">
        <small class="muted">Miejsce</small>
        <button v-for="[id, name, tip] in PLACES" :key="id" :class="{ on: b.place === id }" :aria-pressed="b.place === id" :title="tip" @click="b.place = id">{{ name }}</button>
      </div>
      <p class="desk-help">Grafika jest widoczna w całości. Długi poziomy pas najlepiej wygląda na dole, a PNG z przezroczystością zostawia obraz pod spodem.</p>
    </template>
    <template v-else>
    <TextColor :look="b" />
    <div class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="b.title" maxlength="60"></label>
      <label>Podpis <input v-model="b.sub" maxlength="80"></label>
      <label>Dopisek <input v-model="b.note" maxlength="120"></label>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Kod QR</small>
      <select v-model="b.qr" aria-label="Kod QR">
        <option v-for="[id, name] in QRS" :key="id" :value="id">{{ name }}</option>
      </select>
      <input v-if="b.qr === 'link'" v-model="b.link" type="url" aria-label="Link do kodu QR" style="min-width: 260px">
      <button class="small" title="Przywróć domyślny baner" @click="Object.assign(b, BANNER_DEFAULT)">Domyślny</button>
    </div>
    <p class="desk-help">Puste pole nic nie pokazuje. {nabożeństwo} wstawia najbliższe nabożeństwo, {opis kodu} — podpis do kodu QR.</p>
    </template>
    <div class="desk-opt-group desk-bn-queue">
      <small class="muted">Kolejka</small>
      <button v-for="(q, i) in set.queue" :key="q.id" class="small bn-q" :class="{ on: editing === q.id }" :title="'Edytuj: ' + (q.style === 'image' ? picName(q) : q.title)" @click="editQueued(q)">
        <i :style="{ background: q.color }"></i>{{ i + 1 }}. {{ q.style === 'image' ? picName(q) : q.title || 'Baner' }}
      </button>
      <template v-if="editing && set.queue.some(x => x.id === editing)">
        <button class="small" title="Wcześniej" :disabled="set.queue.findIndex(x => x.id === editing) === 0" @click="moveQueued(set.queue.findIndex(x => x.id === editing), -1)">↑</button>
        <button class="small" title="Usuń z kolejki" @click="dropQueued(set.queue.find(x => x.id === editing))">Usuń</button>
        <button class="small" title="Edytuj osobny baner (spoza kolejki)" @click="editing = ''">Gotowe</button>
      </template>
      <button v-else class="small" title="Zapisz ten baner w kolejce — kilka banerów może się zmieniać w kółko" @click="addToQueue">+ Do kolejki</button>
      <label v-if="set.queue.length > 1" class="check bn-cycle"><input v-model="set.cycle" type="checkbox">W kółko co
        <input v-model.number="set.sec" type="number" min="4" max="120" step="1" aria-label="Sekund na baner" style="width: 60px"> s</label>
    </div>
  </div>
</template>

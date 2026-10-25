<script setup lang="ts">
import { ref, watch } from 'vue'
import { settings, uid } from '@/stores'
import { BANNER_DEFAULT } from '@/services/studio/cards'

// Baner na kamerze: gotowe wzory i własne ustawienia (styl, kolor, napisy, kod QR). Zapisywane na tym komputerze.
if (!settings.banner) settings.banner = { ...BANNER_DEFAULT }
const b = settings.banner
const STYLES = [['frame', 'Ramka', 'Zaokrąglony baner w kolorze przez całą szerokość'], ['band', 'Pasek', 'Ciemny pasek u dołu przechodzący w obraz, z logo'], ['card', 'Karta', 'Jasna karta w prawym dolnym rogu — zasłania mniej']] as const
const QRS = [['all', 'Wszystkie (wsparcie, YouTube, Spotify)'], ['bank', 'Wsparcie (przelew / BLIK)'], ['youtube', 'YouTube'], ['spotify', 'Spotify'], ['link', 'Własny link'], ['none', 'Bez kodu']] as const
const PRESETS = [
  ['Podziękowanie', { title: 'Dziękujemy, że byliście z nami!', sub: '', note: '', qr: 'all' }],
  ['Wsparcie', { title: 'Buduj razem z nami', sub: 'Twoje wsparcie ma znaczenie', note: '', qr: 'bank' }],
  ['YouTube', { title: 'Subskrybuj nasz kanał', sub: 'Kazania i transmisje co tydzień', note: '', qr: 'youtube' }],
  ['Podcast', { title: 'Słuchaj kazań w drodze', sub: 'Kazania jako podcast na Spotify', note: '', qr: 'spotify' }],
] as const
// Kolejka: kilka banerów przełączanych w kółko (np. najpierw BLIK, potem sociale). Kliknięty baner z kolejki
// wczytuje się do edycji powyżej — zmiany od razu zapisują się w nim.
if (!settings.bannerQueue) settings.bannerQueue = []
if (!settings.bannerSec) settings.bannerSec = 10
const editing = ref('')
const copyB = () => JSON.parse(JSON.stringify({ style: b.style, color: b.color, title: b.title, sub: b.sub, note: b.note, qr: b.qr, link: b.link }))
watch(b, () => { const q = settings.bannerQueue.find(x => x.id === editing.value); if (q) Object.assign(q, copyB()) }, { deep: true })
function addToQueue() { const item = { id: uid(), ...copyB() }; settings.bannerQueue.push(item); editing.value = item.id }
function editQueued(item) { editing.value = item.id; Object.assign(b, { ...BANNER_DEFAULT, ...item, id: undefined }); delete b.id }
function dropQueued(item) { settings.bannerQueue = settings.bannerQueue.filter(x => x !== item); if (editing.value === item.id) editing.value = '' }
function moveQueued(i, d) { const l = settings.bannerQueue, [x] = l.splice(i, 1); l.splice(i + d, 0, x) }
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Baner">
    <div class="desk-opt-group">
      <small class="muted">Wzór</small>
      <button v-for="[name, p] in PRESETS" :key="name" class="small" @click="Object.assign(b, p)">{{ name }}</button>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Styl</small>
      <button v-for="[id, name, tip] in STYLES" :key="id" :class="{ on: b.style === id }" :aria-pressed="b.style === id" :title="tip" @click="b.style = id">{{ name }}</button>
      <label class="desk-color" title="Kolor banera"><input v-model="b.color" type="color" aria-label="Kolor banera"></label>
      <button v-for="c in ['#f6a836', '#f5e532', '#e5484d', '#4f8ef7', '#ffffff']" :key="c" class="desk-swatch" :class="{ on: b.color === c }" :style="{ background: c }" :title="c" :aria-label="'Kolor ' + c" @click="b.color = c"></button>
    </div>
    <div class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="b.title" maxlength="60" placeholder="np. Buduj razem z nami"></label>
      <label>Podpis <input v-model="b.sub" maxlength="80" placeholder="puste — najbliższe nabożeństwo"></label>
      <label>Dopisek <input v-model="b.note" maxlength="120" placeholder="puste — sam się dobierze do kodu"></label>
    </div>
    <div class="desk-opt-group">
      <small class="muted">Kod QR</small>
      <select v-model="b.qr" aria-label="Kod QR">
        <option v-for="[id, name] in QRS" :key="id" :value="id">{{ name }}</option>
      </select>
      <input v-if="b.qr === 'link'" v-model="b.link" type="url" placeholder="https://…" aria-label="Link do kodu QR" style="min-width: 260px">
      <button class="small" title="Przywróć domyślny baner" @click="Object.assign(b, BANNER_DEFAULT)">Domyślny</button>
    </div>
    <div class="desk-opt-group desk-bn-queue">
      <small class="muted">Kolejka</small>
      <button v-for="(q, i) in settings.bannerQueue" :key="q.id" class="small bn-q" :class="{ on: editing === q.id }" :title="'Edytuj: ' + q.title" @click="editQueued(q)">
        <i :style="{ background: q.color }"></i>{{ i + 1 }}. {{ q.title || 'Baner' }}
      </button>
      <template v-if="editing && settings.bannerQueue.some(x => x.id === editing)">
        <button class="small" title="Wcześniej" :disabled="settings.bannerQueue.findIndex(x => x.id === editing) === 0" @click="moveQueued(settings.bannerQueue.findIndex(x => x.id === editing), -1)">↑</button>
        <button class="small" title="Usuń z kolejki" @click="dropQueued(settings.bannerQueue.find(x => x.id === editing))">Usuń</button>
        <button class="small" title="Edytuj osobny baner (spoza kolejki)" @click="editing = ''">Gotowe</button>
      </template>
      <button v-else class="small" title="Zapisz ten baner w kolejce — kilka banerów może się zmieniać w kółko" @click="addToQueue">+ Do kolejki</button>
      <label v-if="settings.bannerQueue.length > 1" class="check bn-cycle"><input v-model="settings.bannerCycle" type="checkbox">W kółko co
        <input v-model.number="settings.bannerSec" type="number" min="4" max="120" step="1" aria-label="Sekund na baner" style="width: 60px"> s</label>
    </div>
  </div>
</template>

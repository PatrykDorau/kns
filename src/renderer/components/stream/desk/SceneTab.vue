<script setup lang="ts">
import { computed } from 'vue'
import Thumb from '@/components/common/Thumb.vue'
import { label, settings } from '@/stores'
import { remote as remoteScreen } from '@/services/screenShare'
import { ANN_MEDIA, addCountdown, setCountdown, studio } from '@/services/studio'
import { END_DEFAULT } from '@/services/studio/cards'
import LookBg from './LookBg.vue'
import PresetBar from './PresetBar.vue'
import CountdownLook from './CountdownLook.vue'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { fetchAllProjFiles, projFiles } from '@/services/projectorMirror'

// Ustawienia sceny w podglądzie (stale pod przyciskami scen) (odliczanie, kamera w okienku, okienko z materiałem).
const { mediaList, pvFull, deskTab, addMediaFiles } = useDesk()

const SCENE_HELP = {
  camera: 'Obraz z kamery (ATEM po USB). Napisy, pasek mówcy, modlitwa, PIP (materiał w okienku), grafika i baner — niżej, w „Nakładkach”.',
  projector: 'Obraz z rzutnika (przez sieć z laptopa przy rzutniku). Kamerę w okienku włączysz niżej, w „Nakładkach”.',
  countdown: 'Plansza przed nabożeństwem: zegar, ogłoszenia w środku (które i jak często — zakładka „Ogłoszenia”), na końcu „Zaraz zaczynamy”.',
  media: 'Materiał z Biblioteki na cały ekran — wybierz go niżej w Bibliotece („Na ekran”).',
  end: 'Podziękowanie z kodami QR (wsparcie, YouTube, Spotify) — dane do wsparcia w „Plansza końcowa” w prawej kolumnie.',
}
const clock = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
const countdownInfo = computed(() => (studio.left ? 'zostało ' + clock(studio.left) : 'na planszy: „Zaraz zaczynamy”') + (studio.countdownTo ? '' : ' · do nabożeństwa'))
// wygląd odliczania (zapisany w ustawieniach tego komputera)
// wygląd końca
if (!settings.endLook) settings.endLook = { ...END_DEFAULT }
const en = settings.endLook
const readEnd = () => en
const writeEnd = d => { Object.assign(en, END_DEFAULT, d) }
const END_LAYOUTS = [['cards', 'Karta z kafelkami', 'Jak grafiki ogłoszeń: karta, pod napisem kody QR obok siebie'], ['side', 'Napis obok kodów', 'Po lewej podziękowanie i najbliższe nabożeństwo, po prawej kody QR'], ['center', 'Duży napis', 'Duże podziękowanie na środku, kody QR małe u dołu'], ['image', 'Sama grafika', 'Tylko wybrana grafika (np. przygotowana plansza) na cały ekran']] as const
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
// grafika z dysku: dodaje do Biblioteki i od razu wybiera
async function addPic() { const before = new Set(mediaList.value.map(x => x.id)); if (await addMediaFiles()) { const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id)); if (n) en.pic = n.id } }
// rzutnik przysłał pliki, a w trakcie transmisji pobranie to decyzja operatora
const waiting = computed(() => projFiles.list.filter(f => f.state === 'new'))
const waitMb = computed(() => Math.round(waiting.value.reduce((s, f) => s + f.size, 0) / 1e6))
// co widać na scenie „Rzutnik”
const projectorNote = computed(() => remoteScreen.state === 'on' ? '● obraz z rzutnika przez sieć'
  : studio.projector.kind !== 'none' ? (studio.projector.remote ? '● Rzutnik na innym komputerze' : '● Rzutnik na tym komputerze')
  : remoteScreen.state === 'connecting' ? 'Obraz z rzutnika przez sieć: ' + (remoteScreen.error || remoteScreen.step)
  : settings.studioLocalProjector ? 'Rzutnik w tej aplikacji nic teraz nie pokazuje.'
  : settings.streamLyrics === 'remote' ? 'Rzutnik na innym komputerze nic nie wysyła — tam w Ustawieniach aplikacji włącz „Udostępniaj obraz rzutnika”.'
  : 'Rzutnik na tym komputerze nic teraz nie pokazuje. Rzutnik na innym laptopie: Ustawienia nadawania → Napisy pieśni → „Rzutnik na innym komputerze”.')
</script>

<template>
  <p class="desk-help">{{ SCENE_HELP[studio.preview.scene] }}</p>
  <div v-if="studio.preview.scene === 'countdown' || studio.program.scene === 'countdown'" class="desk-opt-group" role="group" aria-label="Odliczanie">
    <small class="muted">{{ studio.preview.scene === 'countdown' ? 'Zegar' : 'Zegar na wizji' }}</small>
    <button :class="{ on: !studio.countdownTo }" title="Odliczanie do godziny nabożeństwa" @click="setCountdown(0)">do nabożeństwa</button>
    <button v-for="m in [5, 10, 15]" :key="m" @click="setCountdown(m)">{{ m }} min</button>
    <button title="Dodaj minutę" @click="addCountdown(1)">+1</button>
    <small class="desk-left-time">{{ countdownInfo }}</small>
    <label class="check" title="Po zerze 3 s „Zaraz zaczynamy”, potem sama przełącza na Kamerę"><input v-model="settings.studioAutoCamera" type="checkbox"> po zerze Kamera</label>
  </div>
  <!-- wygląd odliczania: układ, zegar, kolor, tło, treść, napisy -->
  <CountdownLook v-if="studio.preview.scene === 'countdown'" />
  <!-- wygląd końca: tło, układ, napis i podpis -->
  <div v-if="studio.preview.scene === 'end'" class="desk-cd" role="group" aria-label="Wygląd końca">
    <PresetBar kind="end" :read="readEnd" :write="writeEnd" />
    <div class="desk-opt-group">
      <small class="muted">Układ</small>
      <button v-for="[id, name, tip] in END_LAYOUTS" :key="id" :class="{ on: en.layout === id }" :aria-pressed="en.layout === id" :title="tip" @click="en.layout = id">{{ name }}</button>
    </div>
    <div v-if="en.layout === 'image'" class="desk-opt-group">
      <small class="muted">Grafika</small>
      <select v-model="en.pic" aria-label="Grafika na Koniec">
        <option value="">— wybierz grafikę —</option>
        <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
      </select>
      <button class="small" title="Grafika z dysku — trafi też do Biblioteki" @click="addPic">Z dysku…</button>
    </div>
    <LookBg v-if="en.layout !== 'image'" :look="en" />
    <div v-if="en.layout !== 'image'" class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="en.title" maxlength="60" :placeholder="END_DEFAULT.title"></label>
      <label>Podpis <input v-model="en.sub" maxlength="90" placeholder="np. Błogosławionego tygodnia!"></label>
      <button class="small" title="Przywróć domyślny wygląd" @click="Object.assign(en, END_DEFAULT)">Domyślny</button>
    </div>
  </div>
  <p v-if="studio.preview.scene === 'projector'" class="desk-ov-note" :class="remoteScreen.state === 'on' || studio.projector.kind !== 'none' ? 'ok' : 'muted'">{{ projectorNote }}</p>
  <div v-if="studio.preview.scene === 'projector' && (waiting.length || projFiles.sending)" class="desk-opt-group" role="status">
    <small v-if="projFiles.sending" class="muted">Rzutnik wysyła: {{ projFiles.sending.label }}<template v-if="projFiles.sending.left > 1"> (i {{ projFiles.sending.left - 1 }} więcej)</template></small>
    <template v-if="waiting.length">
      <span>Rzutnik przesłał {{ waiting.length }} {{ waiting.length === 1 ? 'plik' : 'pliki' }}<template v-if="waitMb"> ({{ waitMb }} MB)</template> — pobranie zajmie internet transmisji.</span>
      <button @click="fetchAllProjFiles">Pobierz</button>
      <button @click="deskTab = 'proj'">Zobacz listę</button>
    </template>
  </div>
  <div v-if="studio.preview.scene === 'media'" class="desk-opt-group">
    <template v-if="studio.preview.media === ANN_MEDIA"><b>Ogłoszenia w pętli</b><button @click="deskTab = 'slides'">Które ogłoszenia…</button><button @click="deskTab = 'media'">Zmień</button></template>
    <template v-else-if="pvFull"><Thumb :item="pvFull" /><b>{{ label(pvFull) }}</b><button @click="deskTab = 'media'">Zmień</button></template>
    <button v-else class="primary" @click="deskTab = 'media'">Wybierz materiał</button>
  </div>
</template>

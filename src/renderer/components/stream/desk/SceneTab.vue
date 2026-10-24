<script setup lang="ts">
import { computed } from 'vue'
import Thumb from '@/components/common/Thumb.vue'
import { label, settings } from '@/stores'
import { remote as remoteScreen } from '@/services/screenShare'
import { addCountdown, setCountdown, setMediaPos, setOverlayMode, showMediaOverlay, studio } from '@/services/studio'
import { END_DEFAULT } from '@/services/studio/cards'
import LookBg from './LookBg.vue'
import CountdownLook from './CountdownLook.vue'
import { CORNERS, useDesk } from '@/composables/stream/useStreamDesk'
import { mediaKind } from '@/composables/stream/useStudioMedia'

// Ustawienia sceny w podglądzie (stale pod przyciskami scen) (odliczanie, kamera w okienku, okienko z materiałem).
const { mediaList, pvFull, deskTab } = useDesk()

const SCENE_HELP = {
  camera: 'Obraz z kamery (ATEM po USB) — z okienkiem, do którego wrzucisz materiał z Biblioteki. Napisy i pasek mówcy — niżej, w „Nakładkach”.',
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
const END_LAYOUTS = [['cards', 'Karta z kafelkami', 'Jak grafiki ogłoszeń: karta, pod napisem kody QR obok siebie'], ['side', 'Napis obok kodów', 'Po lewej podziękowanie i najbliższe nabożeństwo, po prawej kody QR'], ['center', 'Duży napis', 'Duże podziękowanie na środku, kody QR małe u dołu']] as const
function cornerMedia(id: string) { if (id) { showMediaOverlay(id); setOverlayMode('corner') } else setOverlayMode('off') }
// co widać na scenie „Rzutnik”
const projectorNote = computed(() => remoteScreen.state === 'on' ? '● obraz z rzutnika przez sieć'
  : studio.projector.kind !== 'none' ? '● Rzutnik na tym komputerze'
  : remoteScreen.state === 'connecting' ? 'Obraz z rzutnika przez sieć: ' + (remoteScreen.error || remoteScreen.step)
  : settings.studioLocalProjector ? 'Rzutnik w tej aplikacji nic teraz nie pokazuje.'
  : settings.streamLyrics === 'remote' ? 'Rzutnik na innym komputerze nic nie wysyła — tam w Ustawieniach aplikacji włącz „Udostępniaj obraz rzutnika”.'
  : 'Rzutnik na tym komputerze nic teraz nie pokazuje. Rzutnik na innym laptopie: Ustawienia nadawania → Napisy pieśni → „Rzutnik na innym komputerze”.')
</script>

<template>
  <p class="desk-help">{{ SCENE_HELP[studio.preview.scene] }}</p>
  <div v-if="studio.preview.scene === 'countdown' || studio.program.scene === 'countdown'" class="desk-opt-group" role="group" aria-label="Odliczanie">
    <small class="muted">Zegar</small>
    <button :class="{ on: !studio.countdownTo }" title="Odliczanie do godziny nabożeństwa" @click="setCountdown(0)">do nabożeństwa</button>
    <button v-for="m in [5, 10, 15]" :key="m" @click="setCountdown(m)">{{ m }} min</button>
    <button title="Dodaj minutę" @click="addCountdown(1)">+1</button>
    <small class="desk-left-time">{{ countdownInfo }}</small>
    <label class="check" title="Po zerze 3 s „Zaraz zaczynamy”, potem sama przełącza na Kamerę"><input v-model="settings.studioAutoCamera" type="checkbox"> po zerze Kamera</label>
  </div>
  <!-- wygląd odliczania: układ, zegar, kolor, tło, treść, napisy -->
  <CountdownLook v-if="studio.preview.scene === 'countdown' || studio.program.scene === 'countdown'" />
  <!-- wygląd końca: tło, układ, napis i podpis -->
  <div v-if="studio.preview.scene === 'end' || studio.program.scene === 'end'" class="desk-cd" role="group" aria-label="Wygląd końca">
    <LookBg :look="en" />
    <div class="desk-opt-group">
      <small class="muted">Układ</small>
      <button v-for="[id, name, tip] in END_LAYOUTS" :key="id" :class="{ on: en.layout === id }" :aria-pressed="en.layout === id" :title="tip" @click="en.layout = id">{{ name }}</button>
    </div>
    <div class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="en.title" maxlength="60" :placeholder="END_DEFAULT.title"></label>
      <label>Podpis <input v-model="en.sub" maxlength="90" placeholder="np. Błogosławionego tygodnia!"></label>
      <button class="small" title="Przywróć domyślny wygląd" @click="Object.assign(en, END_DEFAULT)">Domyślny</button>
    </div>
  </div>
  <!-- Kamera: okienko z materiałem z Biblioteki (zdjęcie, film, prezentacja, napis) -->
  <div v-if="studio.preview.scene === 'camera'" class="desk-opt-group" role="group" aria-label="Okienko z materiałem">
    <small class="muted">Okienko</small>
    <select :value="studio.preview.ovl === 'corner' ? studio.preview.omedia : ''" aria-label="Materiał w okienku" @change="cornerMedia(($event.target as HTMLSelectElement).value)">
      <option value="">— bez okienka —</option>
      <option v-for="it in mediaList" :key="it.id" :value="it.id">{{ label(it) }} ({{ mediaKind(it).toLowerCase() }})</option>
    </select>
    <template v-if="studio.preview.ovl === 'corner'">
      <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.mpos.corner === id }" :title="lbl" :aria-label="lbl" @click="setMediaPos({ corner: id })">{{ arrow }}</button>
      <button :class="{ on: studio.preview.mpos.size !== 'large' }" @click="setMediaPos({ size: 'small' })">Małe</button>
      <button :class="{ on: studio.preview.mpos.size === 'large' }" @click="setMediaPos({ size: 'large' })">Duże</button>
    </template>
    <button class="small" title="Dodaj pliki albo napis" @click="deskTab = 'media'">Biblioteka…</button>
  </div>
  <p v-if="studio.preview.scene === 'projector'" class="desk-ov-note" :class="remoteScreen.state === 'on' || studio.projector.kind !== 'none' ? 'ok' : 'muted'">{{ projectorNote }}</p>
  <div v-if="studio.preview.scene === 'media'" class="desk-opt-group">
    <template v-if="pvFull"><Thumb :item="pvFull" /><b>{{ label(pvFull) }}</b><button @click="deskTab = 'media'">Zmień</button></template>
    <button v-else class="primary" @click="deskTab = 'media'">Wybierz materiał</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import { label, settings } from '@/stores'
import { remote as remoteScreen } from '@/services/screenShare'
import { addCountdown, setCountdown, setMediaPos, setOverlayMode, showMediaOverlay, studio } from '@/services/studio'
import { CORNERS, useDesk } from '@/composables/stream/useStreamDesk'
import { mediaKind } from '@/composables/stream/useStudioMedia'

// Zakładka „Scena”: opis i ustawienia sceny w podglądzie (odliczanie, kamera w okienku, okienko z materiałem).
const { mediaList, pvFull, deskTab, pip } = useDesk()

const SCENE_HELP = {
  camera: 'Obraz z kamery (ATEM po USB) — z okienkiem, do którego wrzucisz materiał z Mediów. Napisy i pasek mówcy — wyżej, w „Nakładkach”.',
  projector: 'Obraz z rzutnika (przez sieć z laptopa przy rzutniku) — z kamerą w okienku, gdy włączysz.',
  countdown: 'Plansza przed nabożeństwem: zegar, ogłoszenia w środku, na końcu „Zaraz zaczynamy”.',
  announcements: 'Ogłoszenia w pętli — które i jak często: zakładka „Ogłoszenia”.',
  media: 'Materiał z biblioteki na cały ekran — wybierz go w zakładce „Media”.',
  end: 'Podziękowanie z kodami QR (wsparcie, YouTube, Spotify) — dane w „Plansza końcowa” w prawej kolumnie.',
}
const clock = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
const countdownInfo = computed(() => (studio.left ? 'zostało ' + clock(studio.left) : 'na planszy: „Zaraz zaczynamy”') + (studio.countdownTo ? '' : ' · do nabożeństwa'))
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
  <div v-if="studio.preview.scene === 'projector'" class="desk-opt-group" role="group" aria-label="Okienko z kamerą">
    <button :class="{ on: studio.preview.pip.on, live: studio.program.scene === 'projector' && studio.program.pip.on }" :aria-pressed="!!studio.preview.pip.on" @click="pip({ on: !studio.preview.pip.on })"><Icon name="camera" />Kamera w okienku {{ studio.preview.pip.on ? 'wł.' : 'wył.' }}</button>
    <template v-if="studio.preview.pip.on">
      <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.pip.corner === id }" :title="lbl" :aria-label="lbl" @click="pip({ corner: id })">{{ arrow }}</button>
      <button :class="{ on: studio.preview.pip.size !== 'large' }" @click="pip({ size: 'small' })">Małe</button>
      <button :class="{ on: studio.preview.pip.size === 'large' }" @click="pip({ size: 'large' })">Duże</button>
    </template>
  </div>
  <!-- Kamera: okienko z materiałem z Mediów (zdjęcie, film, prezentacja, napis) -->
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
    <button class="small" title="Dodaj pliki albo napis" @click="deskTab = 'media'">Media…</button>
  </div>
  <p v-if="studio.preview.scene === 'projector'" class="desk-ov-note" :class="remoteScreen.state === 'on' || studio.projector.kind !== 'none' ? 'ok' : 'muted'">{{ projectorNote }}</p>
  <div v-if="studio.preview.scene === 'media'" class="desk-opt-group">
    <template v-if="pvFull"><Thumb :item="pvFull" /><b>{{ label(pvFull) }}</b><button @click="deskTab = 'media'">Zmień</button></template>
    <button v-else class="primary" @click="deskTab = 'media'">Wybierz materiał</button>
  </div>
</template>

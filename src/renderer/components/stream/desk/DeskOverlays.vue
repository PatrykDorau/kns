<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import { label, settings } from '@/stores'
import { ANN_MEDIA, OVERLAYS, PROJ_MEDIA, mediaPipToProgram, pipToProgram, previewOverlay, setEndOverlay, setLowerThird, setMediaPos, setOverlayMode, setPrayer, showMediaOverlay, studio, toggleLyrics } from '@/services/studio'
import { answerLive, confirmLive, ovlAsk } from '@/composables/stream/ovlAsk'
import { CORNERS, useDesk } from '@/composables/stream/useStreamDesk'
import { mediaKind } from '@/composables/stream/useStudioMedia'
import PresetPicker from './PresetPicker.vue'

// Nakładki: zawsze pod ręką (napisy, pasek mówcy, modlitwa, PIP z materiałem, grafika na cały kadr, PIP z kamerą, baner).
// Napis na cały kadr — od razu na wizję, po potwierdzeniu; wyłączenie — od razu.
// Pasek mówcy, modlitwa i baner — pod przyciskiem wybór presetu i własne „Na wizję”; wyłączenie — od razu.
// PIP (kamera, materiał) — najpierw na podgląd (zielony), na wizję przyciskiem „Na wizję” przy PIP (z potwierdzeniem).
// Na wizji — czerwone z kropką. Napisy pieśni — od razu, bez pytania.
const { pvOver, pgOver, mediaList, deskTab, pip } = useDesk()
// każda nakładka tylko na scenach, na których ją widać (PIP z kamerą — na każdej poza Kamerą)
const on = (k: keyof typeof OVERLAYS) => OVERLAYS[k].includes(studio.preview.scene)
const air = (k: keyof typeof OVERLAYS) => OVERLAYS[k].includes(studio.program.scene)
const anyOverlay = computed(() => Object.keys(OVERLAYS).some(k => on(k as keyof typeof OVERLAYS)))
const pvCorner = computed(() => studio.preview.ovl === 'corner' ? pvOver.value : null)
const pgCorner = computed(() => studio.program.ovl === 'corner' && air('media') ? pgOver.value : null)
const pvFullOvl = computed(() => studio.preview.ovl === 'full' ? pvOver.value : null)
const pgFullOvl = computed(() => studio.program.ovl === 'full' && air('media') ? pgOver.value : null)
// włącz (z pytaniem) / wyłącz (od razu)
// włączona (na wizji albo czeka na podglądzie) — wyłącz od razu; inaczej: na podgląd + pytanie „Wysłać na wizję?”
function flip(now: boolean, what: string, set: (v: boolean) => void, key: 'lowerThird' | 'prayer' | 'endOvl') {
  if (now) { if (ovlAsk.value?.what === what) ovlAsk.value = null; set(false); return }
  previewOverlay(key, true)
  confirmLive(what, () => set(true), () => previewOverlay(key, false))
}
// nakładka z presetami: włączenie otwiera wybór na podglądzie, wyłączenie zdejmuje od razu
function toggleOverlay(now: boolean, set: (v: boolean) => void, key: 'lowerThird' | 'prayer' | 'endOvl') { if (now) set(false); else if (studio.direct) set(true); else previewOverlay(key, true) }
const ltOn = computed(() => studio.program.lowerThird || studio.preview.lowerThird)
const prOn = computed(() => !!(studio.program.prayer || studio.preview.prayer))
const bnOn = computed(() => !!(studio.program.endOvl || studio.preview.endOvl))
// PIP na podglądzie inny niż na wizji — można wysłać
const pipPending = computed(() => !!studio.preview.pip.on && (!studio.program.pip.on || studio.program.pip.corner !== studio.preview.pip.corner || studio.program.pip.size !== studio.preview.pip.size))
const mpipPending = computed(() => !!pvCorner.value && (studio.program.ovl !== 'corner' || studio.program.omedia !== studio.preview.omedia || studio.program.mpos.corner !== studio.preview.mpos.corner || studio.program.mpos.size !== studio.preview.mpos.size))
function cornerMedia(id: string) { if (id) { showMediaOverlay(id); setOverlayMode('corner') } else setOverlayMode('off') }
</script>

<template>
  <div v-if="anyOverlay" class="desk-ovl">
    <small class="desk-lbl">Nakładki</small>
    <span v-if="ovlAsk" class="ovl-ask" role="alertdialog" aria-label="Potwierdź"><Icon name="info" /><span>Na podglądzie: <b>{{ ovlAsk.what }}</b> — dopasuj i wyślij na wizję?</span><button class="primary small" @click="answerLive(true)">Tak, na wizję</button><button class="small" @click="answerLive(false)">Nie</button></span>
    <button v-if="on('lyrics')" class="ovl-btn" :class="{ live: studio.program.lyricsOn && air('lyrics'), on: studio.program.lyricsOn }" :aria-pressed="studio.program.lyricsOn"
            title="Napisy pieśni — włączają się i wyłączają od razu na wizji (Kamera, Rzutnik, Materiał)" @click="toggleLyrics"><Icon name="music" />Napisy</button>
    <button v-if="on('lowerThird')" class="ovl-btn" :class="{ on: studio.preview.lowerThird, live: studio.program.lowerThird && air('lowerThird') }" :aria-pressed="studio.preview.lowerThird"
            title="Pasek z mówcą — wybierz preset i wyślij na wizję; wyłączenie od razu" @click="toggleOverlay(ltOn, setLowerThird, 'lowerThird')"><Icon name="text" />Pasek mówcy</button>
    <button v-if="on('prayer')" class="ovl-btn" :class="{ on: studio.preview.prayer, live: studio.program.prayer && air('prayer') }" :aria-pressed="!!studio.preview.prayer"
            title="Czas modlitwy: napis u dołu obrazu — wybierz preset i wyślij na wizję; wyłączenie od razu" @click="toggleOverlay(prOn, setPrayer, 'prayer')"><Icon name="heart" />Modlitwa</button>
    <!-- PIP: materiał z Biblioteki w okienku w rogu -->
    <span v-if="on('media')" class="desk-ovl-media" :class="{ on: pvCorner, live: pgCorner }">
      <Icon name="layers" /><b class="desk-ovl-tag">PIP</b>
      <select :value="pvCorner ? studio.preview.omedia : ''" aria-label="Materiał w okienku PIP" @change="cornerMedia(($event.target as HTMLSelectElement).value)">
        <option value="">— bez PIP —</option>
        <option :value="PROJ_MEDIA">Rzutnik (to, co teraz pokazuje)</option>
        <option :value="ANN_MEDIA">Ogłoszenia w pętli</option>
        <option v-for="it in mediaList" :key="it.id" :value="it.id">{{ label(it) }} ({{ mediaKind(it).toLowerCase() }})</option>
      </select>
      <template v-if="pvCorner">
        <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.mpos.corner === id }" :title="lbl" :aria-label="lbl" @click="setMediaPos({ corner: id })">{{ arrow }}</button>
        <button class="desk-corner" :title="studio.preview.mpos.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="setMediaPos({ size: studio.preview.mpos.size === 'large' ? 'small' : 'large' })">{{ studio.preview.mpos.size === 'large' ? 'L' : 'S' }}</button>
        <button class="desk-send" :class="{ ready: mpipPending }" :disabled="!mpipPending" :title="mpipPending ? 'Ten PIP na wizję (reszta wizji bez zmian)' : 'Ten PIP jest już na wizji'" @click="confirmLive('PIP: ' + (pvCorner ? label(pvCorner) : ''), mediaPipToProgram)"><Icon name="play" />Na wizję</button>
        <button class="desk-x" title="Zdejmij PIP" aria-label="Zdejmij PIP" @click="setOverlayMode('off')"><Icon name="x" /></button>
      </template>
      <button v-if="!mediaList.length" class="desk-ovl-add" @click="deskTab = 'media'">Biblioteka…</button>
    </span>
    <!-- grafika albo napis na całym kadrze -->
    <span v-if="on('media') && pvFullOvl" class="desk-ovl-media" :class="{ on: pvFullOvl, live: pgFullOvl }">
      <template v-if="pvFullOvl">
        <Thumb :item="pvFullOvl" />
        <span class="desk-ovl-name" :title="label(pvFullOvl)">{{ label(pvFullOvl) }}</span>
        <button class="desk-corner" title="Do okienka PIP w rogu" @click="setOverlayMode('corner')">PIP</button>
        <button class="desk-x" title="Zdejmij nakładkę" aria-label="Zdejmij nakładkę" @click="setOverlayMode('off')"><Icon name="x" /></button>
      </template>
    </span>
    <!-- PIP: kamera w okienku (sceny inne niż Kamera) -->
    <span v-if="on('pip')" class="desk-ovl-media" :class="{ on: studio.preview.pip.on, live: studio.program.pip.on && air('pip') }">
      <button class="ovl-btn" :class="{ on: studio.preview.pip.on, live: studio.program.pip.on && air('pip') }" :aria-pressed="!!studio.preview.pip.on" title="Obraz z kamery (ATEM) w okienku — najpierw na podgląd, na wizję przyciskiem „Na wizję” obok; wyłączenie od razu" @click="pip({ on: !(studio.program.pip.on || studio.preview.pip.on) })"><Icon name="camera" />PIP kamera</button>
      <template v-if="studio.preview.pip.on">
        <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.pip.corner === id }" :title="lbl" :aria-label="lbl" @click="pip({ corner: id })">{{ arrow }}</button>
        <button class="desk-corner" :title="studio.preview.pip.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="pip({ size: studio.preview.pip.size === 'large' ? 'small' : 'large' })">{{ studio.preview.pip.size === 'large' ? 'L' : 'S' }}</button>
        <button class="desk-send" :class="{ ready: pipPending }" :disabled="!pipPending" :title="pipPending ? 'PIP z kamerą na wizję (reszta wizji bez zmian)' : 'Ten PIP jest już na wizji'" @click="confirmLive('PIP kamera', pipToProgram)"><Icon name="play" />Na wizję</button>
      </template>
    </span>
    <button v-if="on('end')" class="ovl-btn" :class="{ on: studio.preview.endOvl, live: studio.program.endOvl && air('end') }" :aria-pressed="!!studio.preview.endOvl" title="Baner na obrazie z kamery: napis i kod QR — wybierz preset i wyślij na wizję; wyłączenie od razu" @click="toggleOverlay(bnOn, setEndOverlay, 'endOvl')"><Icon name="qr" />Baner</button>
  </div>
  <PresetPicker v-if="anyOverlay && on('lowerThird') && studio.preview.lowerThird" kind="lower" />
  <PresetPicker v-if="anyOverlay && on('prayer') && studio.preview.prayer" kind="prayer" />
  <PresetPicker v-if="anyOverlay && on('end') && studio.preview.endOvl" kind="banner" />
</template>

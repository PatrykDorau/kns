<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import { label, settings } from '@/stores'
import { OVERLAYS, setMediaPos, setOverlayMode, showMediaOverlay, studio, toggleEndOverlay, toggleLowerThird, toggleLyrics, togglePrayer } from '@/services/studio'
import { CORNERS, useDesk } from '@/composables/stream/useStreamDesk'
import { mediaKind } from '@/composables/stream/useStudioMedia'
import BannerSettings from './BannerSettings.vue'

// Nakładki: zawsze pod ręką (napisy, pasek mówcy, modlitwa, PIP z materiałem, grafika na cały kadr, PIP z kamerą, baner).
// Włączona na podglądzie — zielona, na wizji — czerwona z kropką.
const { pvOver, pgOver, mediaList, deskTab, pip } = useDesk()
// każda nakładka tylko na scenach, na których ją widać (PIP z kamerą — na każdej poza Kamerą)
const on = (k: keyof typeof OVERLAYS) => OVERLAYS[k].includes(studio.preview.scene)
const air = (k: keyof typeof OVERLAYS) => OVERLAYS[k].includes(studio.program.scene)
const anyOverlay = computed(() => Object.keys(OVERLAYS).some(k => on(k as keyof typeof OVERLAYS)))
const pvCorner = computed(() => studio.preview.ovl === 'corner' ? pvOver.value : null)
const pgCorner = computed(() => studio.program.ovl === 'corner' && air('media') ? pgOver.value : null)
const pvFullOvl = computed(() => studio.preview.ovl === 'full' ? pvOver.value : null)
const pgFullOvl = computed(() => studio.program.ovl === 'full' && air('media') ? pgOver.value : null)
function cornerMedia(id: string) { if (id) { showMediaOverlay(id); setOverlayMode('corner') } else setOverlayMode('off') }
if (settings.prayerText === undefined) settings.prayerText = 'Zachęcamy do modlitwy'
</script>

<template>
  <div v-if="anyOverlay" class="desk-ovl">
    <small class="desk-lbl">Nakładki</small>
    <button v-if="on('lyrics')" class="ovl-btn" :class="{ live: studio.program.lyricsOn && air('lyrics'), on: studio.program.lyricsOn }" :aria-pressed="studio.program.lyricsOn"
            title="Napisy pieśni — włączają się i wyłączają od razu na wizji (Kamera, Rzutnik, Materiał)" @click="toggleLyrics"><Icon name="music" />Napisy</button>
    <button v-if="on('lowerThird')" class="ovl-btn" :class="{ on: studio.preview.lowerThird, live: studio.program.lowerThird && air('lowerThird') }" :aria-pressed="studio.preview.lowerThird"
            title="Pasek z mówcą — najpierw na podglądzie, na wizję po „Na wizję”" @click="toggleLowerThird"><Icon name="text" />Pasek mówcy</button>
    <button v-if="on('prayer')" class="ovl-btn" :class="{ on: studio.preview.prayer, live: studio.program.prayer && air('prayer') }" :aria-pressed="!!studio.preview.prayer"
            title="Czas modlitwy: spokojny napis u dołu obrazu (tekst ustawisz obok, gdy włączone)" @click="togglePrayer"><Icon name="heart" />Modlitwa</button>
    <!-- PIP: materiał z Biblioteki w okienku w rogu -->
    <span v-if="on('media')" class="desk-ovl-media" :class="{ on: pvCorner, live: pgCorner }">
      <Icon name="layers" /><b class="desk-ovl-tag">PIP</b>
      <select :value="pvCorner ? studio.preview.omedia : ''" aria-label="Materiał w okienku PIP" @change="cornerMedia(($event.target as HTMLSelectElement).value)">
        <option value="">— bez PIP —</option>
        <option v-for="it in mediaList" :key="it.id" :value="it.id">{{ label(it) }} ({{ mediaKind(it).toLowerCase() }})</option>
      </select>
      <template v-if="pvCorner">
        <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.mpos.corner === id }" :title="lbl" :aria-label="lbl" @click="setMediaPos({ corner: id })">{{ arrow }}</button>
        <button class="desk-corner" :title="studio.preview.mpos.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="setMediaPos({ size: studio.preview.mpos.size === 'large' ? 'small' : 'large' })">{{ studio.preview.mpos.size === 'large' ? 'L' : 'S' }}</button>
        <button class="desk-corner" title="Na cały kadr (grafika PNG z przezroczystym tłem)" @click="setOverlayMode('full')">⛶</button>
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
      <button class="ovl-btn" :class="{ on: studio.preview.pip.on, live: studio.program.pip.on && air('pip') }" :aria-pressed="!!studio.preview.pip.on" title="Obraz z kamery (ATEM) w okienku na tej scenie — najpierw na podglądzie, na wizję po „Na wizję”" @click="pip({ on: !studio.preview.pip.on })"><Icon name="camera" />PIP kamera</button>
      <template v-if="studio.preview.pip.on">
        <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.pip.corner === id }" :title="lbl" :aria-label="lbl" @click="pip({ corner: id })">{{ arrow }}</button>
        <button class="desk-corner" :title="studio.preview.pip.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="pip({ size: studio.preview.pip.size === 'large' ? 'small' : 'large' })">{{ studio.preview.pip.size === 'large' ? 'L' : 'S' }}</button>
      </template>
    </span>
    <button v-if="on('end')" class="ovl-btn" :class="{ on: studio.preview.endOvl, live: studio.program.endOvl && air('end') }" :aria-pressed="!!studio.preview.endOvl" title="Baner na obrazie z kamery: napis i kod QR (podziękowanie, wsparcie, YouTube…) — wygląd ustawisz pod spodem. Najpierw na podglądzie, na wizję po „Na wizję”" @click="toggleEndOverlay"><Icon name="qr" />Baner</button>
  </div>
  <div v-if="anyOverlay && on('prayer') && studio.preview.prayer" class="desk-cd desk-banner" role="group" aria-label="Modlitwa">
    <div class="desk-opt-group desk-cd-text">
    <label>Napis modlitwy <input v-model="settings.prayerText" maxlength="80" placeholder="Zachęcamy do modlitwy"></label>
    <label>Podpis <input v-model="settings.prayerSub" maxlength="100" placeholder="np. Możesz podejść do przodu — modlimy się za ciebie"></label>
      <label title="Link do strony, gdzie można zostawić prośbę o modlitwę — na nakładce pokaże się kod QR">Kod QR (link) <input v-model="settings.prayerLink" type="url" placeholder="https://… strona z prośbami (puste — bez kodu)"></label>
      <label v-if="settings.prayerLink">Podpis kodu <input v-model="settings.prayerLinkLabel" maxlength="30" placeholder="Prośby modlitewne"></label>
    </div>
  </div>
  <BannerSettings v-if="anyOverlay && on('end') && studio.preview.endOvl" />
</template>

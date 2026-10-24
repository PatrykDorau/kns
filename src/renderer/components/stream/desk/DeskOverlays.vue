<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import { label } from '@/stores'
import { OVERLAYS, setMediaPos, setOverlayMode, studio, toggleEndOverlay, toggleLowerThird, toggleLyrics } from '@/services/studio'
import { CORNERS, useDesk } from '@/composables/stream/useStreamDesk'

// Nakładki: zawsze pod ręką (napisy, pasek mówcy, grafika/napis, kamera w okienku).
const { pvOver, pgOver, deskTab, pip } = useDesk()
// każda nakładka tylko na scenach, na których ją widać (kamera w okienku — na każdej poza Kamerą)
const on = (k: keyof typeof OVERLAYS) => OVERLAYS[k].includes(studio.preview.scene)
const anyOverlay = computed(() => on('lyrics') || on('lowerThird') || on('media') || on('end') || on('pip'))
const endLive = computed(() => !!studio.program.endOvl && OVERLAYS.end.includes(studio.program.scene))
const pipLive = computed(() => !!studio.program.pip.on && OVERLAYS.pip.includes(studio.program.scene))
</script>

<template>
  <div v-if="anyOverlay" class="desk-ovl">
    <small class="desk-lbl">Nakładki</small>
    <button v-if="on('lyrics')" :class="{ on: studio.program.lyricsOn, live: studio.program.lyricsOn, idle: !OVERLAYS.lyrics.includes(studio.program.scene) }" :aria-pressed="studio.program.lyricsOn"
            :title="'Napisy pieśni — włączają się i wyłączają od razu na wizji. Sceny: Kamera, Rzutnik, Rzutnik + kamera, Media' + (OVERLAYS.lyrics.includes(studio.program.scene) ? '' : ' (na tej scenie wizji ich nie ma)')" @click="toggleLyrics"><Icon name="music" />Napisy {{ studio.program.lyricsOn ? 'wł.' : 'wył.' }}</button>
    <button v-if="on('lowerThird')" :class="{ on: studio.preview.lowerThird, live: studio.program.lowerThird, idle: !OVERLAYS.lowerThird.includes(studio.preview.scene) }" :aria-pressed="studio.preview.lowerThird"
            :title="'Pasek z mówcą — najpierw na podglądzie, na wizję po „Na wizję”. Sceny: Kamera, Rzutnik + kamera, Media' + (OVERLAYS.lowerThird.includes(studio.preview.scene) ? '' : ' (na tej scenie go nie ma)')" @click="toggleLowerThird"><Icon name="text" />Pasek mówcy</button>
    <span v-if="on('media')" class="desk-ovl-media" :class="{ on: pvOver, live: pgOver }">
      <template v-if="pvOver">
        <Thumb :item="pvOver" />
        <span class="desk-ovl-name" :title="label(pvOver)">{{ label(pvOver) }}</span>
        <span class="desk-seg" role="group" aria-label="Gdzie">
          <button :class="{ on: studio.preview.ovl === 'corner' }" title="Okienko w rogu" @click="setOverlayMode('corner')">W rogu</button>
          <button :class="{ on: studio.preview.ovl === 'full' }" title="Na całym kadrze — grafika PNG z przezroczystym tłem albo napis bez tła" @click="setOverlayMode('full')">Cały kadr</button>
        </span>
        <template v-if="studio.preview.ovl === 'corner'">
          <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.mpos.corner === id }" :title="lbl" :aria-label="lbl" @click="setMediaPos({ corner: id })">{{ arrow }}</button>
          <button class="desk-corner" :title="studio.preview.mpos.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="setMediaPos({ size: studio.preview.mpos.size === 'large' ? 'small' : 'large' })">{{ studio.preview.mpos.size === 'large' ? 'L' : 'S' }}</button>
        </template>
        <button class="desk-x" title="Zdejmij nakładkę" aria-label="Zdejmij nakładkę" @click="setOverlayMode('off')"><Icon name="x" /></button>
      </template>
      <button v-else class="desk-ovl-add" title="Grafika, logo albo napis na obrazie z kamery/rzutnika" @click="deskTab = 'media'"><Icon name="image" />Grafika / napis…</button>
    </span>
    <button v-if="on('end')" :class="{ on: studio.preview.endOvl, live: endLive }" :aria-pressed="!!studio.preview.endOvl" title="Plansza końcowa na obrazie z kamery: podziękowanie, najbliższe nabożeństwo i kody QR w pasku u dołu (napis i podpis — w ustawieniach sceny Koniec). Najpierw na podglądzie, na wizję po „Na wizję”" @click="toggleEndOverlay"><Icon name="qr" />Koniec</button>
    <span v-if="on('pip')" class="desk-ovl-media" :class="{ on: studio.preview.pip.on, live: pipLive }">
      <button :class="{ on: studio.preview.pip.on, live: pipLive }" :aria-pressed="!!studio.preview.pip.on" title="Obraz z kamery (ATEM) w okienku na tej scenie — najpierw na podglądzie, na wizję po „Na wizję”" @click="pip({ on: !studio.preview.pip.on })"><Icon name="camera" />Kamera w okienku</button>
      <template v-if="studio.preview.pip.on">
        <button v-for="[id, arrow, lbl] in CORNERS" :key="id" class="desk-corner" :class="{ on: studio.preview.pip.corner === id }" :title="lbl" :aria-label="lbl" @click="pip({ corner: id })">{{ arrow }}</button>
        <button class="desk-corner" :title="studio.preview.pip.size === 'large' ? 'Mniejsze okienko' : 'Większe okienko'" @click="pip({ size: studio.preview.pip.size === 'large' ? 'small' : 'large' })">{{ studio.preview.pip.size === 'large' ? 'L' : 'S' }}</button>
      </template>
    </span>
  </div>
</template>

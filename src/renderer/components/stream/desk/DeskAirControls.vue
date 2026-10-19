<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { label } from '@/stores'
import { mediaCtl, studio } from '@/services/studio'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { mmss } from '@/composables/stream/useStudioMedia'

// Na wizji: film i prezentacja — sterowanie działa od razu (slajdy, odtwarzanie, pozycja, pętla, głośność).
const { airCtl } = useDesk()
</script>

<template>
  <div v-for="c in airCtl" :key="c.item.id" class="desk-media-ctl">
    <b class="live-dot">● Na wizji</b><span class="desk-air-name">{{ label(c.item) }}</span>
    <template v-if="c.slide.deckOf">
      <button class="small" title="Poprzedni slajd" @click="mediaCtl('slide', { id: c.item.id, d: -1 })">◀</button>
      <span>slajd {{ c.slide.slideNo }} z {{ c.slide.slideCount }}</span>
      <button class="small" title="Następny slajd" @click="mediaCtl('slide', { id: c.item.id, d: 1 })">▶</button>
      <label class="check" title="Slajdy zmieniają się same"><input type="checkbox" :checked="!!c.item.mAuto" @change="c.item.mAuto = ($event.target as HTMLInputElement).checked"> same co
        <select :value="c.item.mSec || 8" @change="c.item.mSec = +($event.target as HTMLSelectElement).value"><option v-for="v in [4, 6, 8, 10, 15, 20, 30]" :key="v" :value="v">{{ v }} s</option></select></label>
    </template>
    <template v-if="c.slide.type === 'video'">
      <button class="small" @click="mediaCtl('play')"><Icon :name="studio.mplay.playing ? 'pause' : 'play'" />{{ studio.mplay.playing ? 'Pauza' : 'Graj' }}</button>
      <button class="small" title="Od początku" @click="mediaCtl('restart')"><Icon name="undo" /></button>
      <input class="desk-media-seek" type="range" min="0" :max="studio.mplay.duration || 1" step="0.5" :value="studio.mplay.time" aria-label="Pozycja filmu" @change="mediaCtl('seek', +($event.target as HTMLInputElement).value)">
      <small class="muted">{{ mmss(studio.mplay.time) }} / {{ mmss(studio.mplay.duration) }}</small>
      <label class="check"><input type="checkbox" :checked="studio.mplay.loop" @change="mediaCtl('loop')"> pętla</label>
      <label class="desk-media-vol" title="Głośność filmu w transmisji"><Icon name="volume" /><input type="range" min="0" max="1" step="0.05" :value="studio.mplay.volume" @input="mediaCtl('volume', ($event.target as HTMLInputElement).value)"></label>
    </template>
  </div>
</template>

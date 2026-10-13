<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { itemById } from './store.js'

// Miniatura elementu: zdjęcie, pierwsza klatka filmu, próbka tekstu; pętla i prezentacja
// pokazują swój pierwszy slajd ze znaczkiem pętli.
const props = defineProps({ item: Object })
const url = it => 'media://local/' + encodeURIComponent(it.path)

const isLoop = computed(() => props.item?.type === 'scene')
// To, co faktycznie rysujemy: dla pętli jej pierwszy dostępny slajd.
const shown = computed(() => {
  if (!isLoop.value) return props.item
  for (const e of props.item.entries || []) {
    const it = itemById(e.ref)
    if (it && !it.missing) return it
  }
  return null
})
</script>

<template>
  <span class="thumb">
    <Icon v-if="isLoop && !shown" name="loop" />
    <Icon v-else-if="!shown || shown.missing" name="missing" />
    <img v-else-if="shown.type === 'image'" :src="url(shown)" alt="" draggable="false">
    <!-- #t=0.1 każe przeglądarce narysować pierwszą klatkę bez odtwarzania -->
    <video v-else-if="shown.type === 'video'" :src="url(shown) + '#t=0.1'" preload="metadata" muted tabindex="-1"></video>
    <span v-else-if="shown.type === 'text'" class="thumb-text" :style="{ background: shown.bg, color: shown.color }">Aa</span>
    <span v-if="isLoop && shown" class="thumb-play loopmark"><Icon name="loop" /></span>
    <span v-else-if="shown?.type === 'video' && !shown.missing" class="thumb-play"><Icon name="play" /></span>
  </span>
</template>

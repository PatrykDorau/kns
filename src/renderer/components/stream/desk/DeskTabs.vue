<script setup lang="ts">
import { computed } from 'vue'
import { slideCandidates, studio } from '@/services/studio'
import { SCENE_NAME, useDesk } from '@/composables/stream/useStreamDesk'
import SceneTab from './SceneTab.vue'
import MediaTab from './MediaTab.vue'
import SlidesTab from './SlidesTab.vue'

// Zakładki pod scenami: ustawienia wybranej sceny, media, ogłoszenia.
const { deskTab, mediaList } = useDesk()
const slideList = computed(() => slideCandidates())
const shownSlides = computed(() => slideList.value.filter(x => !studio.hidden.includes(x.id)).length)
</script>

<template>
  <div class="desk-tabs" role="tablist" aria-label="Ustawienia">
    <button role="tab" :aria-selected="deskTab === 'scene'" :class="{ on: deskTab === 'scene' }" @click="deskTab = 'scene'">Scena: {{ SCENE_NAME[studio.preview.scene] }}</button>
    <button role="tab" :aria-selected="deskTab === 'media'" :class="{ on: deskTab === 'media' }" @click="deskTab = 'media'">Media <em>{{ mediaList.length }}</em></button>
    <button role="tab" :aria-selected="deskTab === 'slides'" :class="{ on: deskTab === 'slides' }" @click="deskTab = 'slides'">Ogłoszenia <em>{{ shownSlides }}/{{ slideList.length }}</em></button>
  </div>
  <div class="desk-panel" role="tabpanel">
    <SceneTab v-if="deskTab === 'scene'" />
    <MediaTab v-else-if="deskTab === 'media'" />
    <SlidesTab v-else :slides="slideList" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { music, slideCandidates, studio } from '@/services/studio'
import { projFiles } from '@/services/projectorMirror'
import { useDesk } from '@/composables/stream/useStreamDesk'
import MediaTab from './MediaTab.vue'
import SlidesTab from './SlidesTab.vue'
import MusicPanel from './MusicPanel.vue'
import MusicEq from './MusicEq.vue'
import ProjectorFiles from './ProjectorFiles.vue'

// Źródła (pod scenami): Biblioteka (zdjęcia, filmy, prezentacje, napisy — na ekran albo jako nakładka),
// Ogłoszenia (pętla w odliczaniu) i Muzyka (podkład na każdej scenie).
const { deskTab, mediaList } = useDesk()
const slideList = computed(() => slideCandidates())
const projWaiting = computed(() => projFiles.list.filter(f => f.state !== 'done').length) // czeka albo właśnie się pobiera
const shownSlides = computed(() => slideList.value.filter(x => !studio.hidden.includes(x.id)).length)
</script>

<template>
  <section class="desk-sources" aria-label="Źródła">
    <div class="desk-tabs" role="tablist" aria-label="Źródła">
      <button role="tab" :aria-selected="deskTab === 'media'" :class="{ on: deskTab === 'media' }" @click="deskTab = 'media'"><Icon name="image" />Biblioteka <em>{{ mediaList.length }}</em></button>
      <button role="tab" :aria-selected="deskTab === 'proj'" :class="{ on: deskTab === 'proj' }" @click="deskTab = 'proj'"><Icon name="monitor" />Z rzutnika <em :class="{ live: projWaiting }">{{ projWaiting || projFiles.list.length }}</em></button>
      <button role="tab" :aria-selected="deskTab === 'slides'" :class="{ on: deskTab === 'slides' }" @click="deskTab = 'slides'"><Icon name="slides" />Ogłoszenia <em>{{ shownSlides }}/{{ slideList.length }}</em></button>
      <button role="tab" :aria-selected="deskTab === 'music'" :class="{ on: deskTab === 'music' }" @click="deskTab = 'music'"><MusicEq v-if="music.playing" /><Icon v-else name="music" />Muzyka <em v-if="music.playing" class="live">gra</em><em v-else>{{ settings.musicList.length }}</em></button>
    </div>
    <div class="desk-panel" role="tabpanel">
      <MediaTab v-if="deskTab === 'media'" />
      <ProjectorFiles v-else-if="deskTab === 'proj'" />
      <SlidesTab v-else-if="deskTab === 'slides'" :slides="slideList" />
      <MusicPanel v-else />
    </div>
  </section>
</template>

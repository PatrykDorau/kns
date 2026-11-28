<script setup lang="ts">
import { computed } from 'vue'
import { settings } from '@/stores'
import { music } from '@/services/studio'
import { mmss } from '@/composables/stream/useStudioMedia'
import MusicEq from './MusicEq.vue'

// Co teraz gra i zegar utworu — osobno, żeby tykanie (kilka razy na sekundę) nie przerysowywało całej listy utworów.
const nowName = computed(() => settings.musicList.find(x => x.id === music.current)?.name || 'Nic nie gra')
</script>

<template>
  <span class="desk-music-now"><MusicEq v-if="music.playing" />{{ nowName }}<small v-if="music.current && music.duration"> · {{ mmss(music.time) }} / {{ mmss(music.duration) }}</small></span>
</template>

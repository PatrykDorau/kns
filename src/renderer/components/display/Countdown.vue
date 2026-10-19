<script setup lang="ts">
import { countdown } from '@/stores'

// Odliczanie do najbliższego nabożeństwa: dni, godziny, minuty, sekundy, a pod spodem kiedy i gdzie.
defineProps({ compact: Boolean })
const two = n => String(n).padStart(2, '0')
</script>

<template>
  <div v-if="countdown" class="countdown" :class="{ compact, live: countdown.live }" role="timer" aria-live="off">
    <span v-if="countdown.live" class="cd-live"><i class="cd-dot"></i>W TRAKCIE</span>
    <span v-else class="cd-label">Do nabożeństwa</span>
    <span v-if="!countdown.live" class="cd-digits">
      <template v-if="countdown.days"><b>{{ countdown.days }}</b><small>{{ countdown.days === 1 ? 'dzień' : 'dni' }}</small></template>
      <b>{{ two(countdown.hours) }}</b><small>godz</small>
      <b>{{ two(countdown.minutes) }}</b><small>min</small>
      <b>{{ two(countdown.seconds) }}</b><small>s</small>
    </span>
    <span class="cd-when">{{ countdown.when }} · {{ countdown.place }}</span>
  </div>
</template>

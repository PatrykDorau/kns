<script setup lang="ts">
import { SCENES, setScene, studio } from '@/services/studio'

// Przyciski scen transmisji: zaznaczona — na podglądzie, z czerwonym paskiem — na wizji.
</script>

<template>
  <div class="desk-scenes" role="group" aria-label="Sceny transmisji">
    <small class="desk-lbl desk-scenes-lbl">Sceny</small>
    <button v-for="[id, name] in SCENES" :key="id" :class="{ on: studio.preview.scene === id, live: studio.program.scene === id }" :aria-pressed="studio.preview.scene === id" :title="studio.program.scene === id ? 'Na wizji' : ''" @click="setScene(id)">{{ name }}</button>
  </div>
</template>

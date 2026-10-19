<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/components/common/Icon.vue'

// Logo wspólnoty: pełne (ekran wyboru służby) albo sam znak (nagłówki paneli).
// Pliki leżą w folderze public: logo.png i znak.png. Gdy ich nie ma, zostaje ikona zastępcza.
defineProps({ full: Boolean })
const failed = ref(false)
</script>

<template>
  <img v-if="!failed" :class="full ? 'brand-full' : 'brand-mark'" :src="full ? './logo.png' : './znak.png'" alt="Logo" @error="failed = true">
  <span v-else class="logo" :class="{ big: full }"><Icon name="monitor" /></span>
</template>

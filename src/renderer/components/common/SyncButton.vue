<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { settings, sharedStatus, syncShared, syncing } from '@/stores'

// Ręczna synchronizacja z folderem wspólnym (poza tym aplikacja robi to sama co kilkanaście sekund).
defineProps({ status: Boolean })
</script>

<template>
  <button v-if="settings.sharedDir" class="sync" :class="{ busy: syncing }" :disabled="syncing"
          title="Pobiera zmiany z folderu wspólnego i wysyła własne" @click="syncShared">
    <Icon name="loop" />{{ syncing ? 'Synchronizuję…' : 'Synchronizuj' }}
  </button>
  <span v-if="status && settings.sharedDir && sharedStatus" class="sync-status">{{ sharedStatus }}</span>
</template>

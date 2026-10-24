<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// lista szablonów
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p class="note" style="margin-top:0">Szablon podpowiada godzinę, miejsce i program nowego wydarzenia danego rodzaju. Zmiany widzą wszyscy.</p>
  <button v-for="t in types" :key="t.id" class="ev" :style="{ '--c': t.color }" @click="openType(t)">
    <span class="body"><b>{{ t.name }}</b><small>{{ t.time || 'bez godziny' }}<template v-if="t.place"> · {{ t.place }}</template> · punktów programu: {{ t.program.length }}</small></span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>
  <button class="primary page-action" style="width:100%;margin-top:6px" @click="newType"><svg class="i"><use href="#plus"/></svg>Nowy rodzaj wydarzenia</button>
</template>

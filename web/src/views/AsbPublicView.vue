<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// ASB: grafik spotkań studenckich (dawniej arkusz „ASB | GRAFIK”) i osobno lista pomysłów
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p class="listen-intro">Terminarz spotkań studenckich (ASB). Grafik z prowadzącymi i notatkami widzą osoby z rangą ASB.</p>
  <div v-if="asb.busy && !asb.pub.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 5" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="asb.error" class="error">{{ asb.error }}</p>
  <p v-else-if="!asbPubUpcoming.length" class="note">Na razie nie ma zaplanowanych spotkań.</p>
  <template v-for="g in asbPubGroups" :key="g.month">
    <h2 class="mn-sec">{{ g.month }}</h2>
    <div v-for="m in g.list" :key="m.id" class="asb-row" :class="['k-' + m.kind, { past: m.date < todayStr }]">
      <span class="asb-date"><small>{{ wd(m.date) }}</small><b>{{ day(m.date) }}</b><small>{{ month(m.date) }}</small></span>
      <span class="asb-body">
        <span v-if="m.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(m.kind) }}</span>
        <b>{{ m.topic || 'Spotkanie ASB' }}</b>
        <small v-if="m.time || m.place">{{ [m.time, m.place].filter(Boolean).join(' · ') }}</small>
      </span>
    </div>
  </template>
</template>

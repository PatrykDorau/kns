<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Strona dla gości: terminarz ASB (spotkania studenckie; bez spotkań wewnętrznych, prowadzących i notatek)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<section id="asb-terminarz" class="public">
  <div class="section"><h2>ASB — spotkania studenckie</h2></div>
  <p class="listen-intro">Terminy, tematy i miejsca najbliższych spotkań studenckich.</p>
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
  <button v-if="!asb.pubAll && asbPubShown.length < asbPubUpcoming.length" class="ghost asb-pub-more" @click="asb.pubAll = true">Cały terminarz ({{ asbPubUpcoming.length }})</button>
</section>
</template>

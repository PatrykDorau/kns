<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Dolny pasek: główne części aplikacji (chowa się przy edycji, żeby nie zasłaniał „Zapisz”).
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<nav class="tabbar" aria-label="Części aplikacji">
  <button :class="{ on: !calView && !moreView && !songView && !peopleView && !serveView && !profileView }" :aria-current="!calView && !moreView && !songView && !peopleView && !serveView ? 'page' : null" @click="showServices"><svg class="i"><use href="#church"/></svg>Start</button>
  <button :class="{ on: calView }" :aria-current="calView ? 'page' : null" @click="openCalendar"><svg class="i"><use href="#calendar"/></svg>Kalendarz</button>
  <button :class="{ on: serveView }" :aria-current="serveView ? 'page' : null" @click="openServe"><svg class="i"><use href="#serve"/></svg>Zaangażuj się</button>
  <button :class="{ on: moreView || songView || peopleView }" :aria-current="moreView || songView || peopleView ? 'page' : null" @click="openMore"><svg class="i"><use href="#menu"/></svg>Więcej<span v-if="canManage && pendingCount" class="count">{{ pendingCount }}</span></button>
</nav>
</template>

<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// „Trwa teraz”: wydarzenie, które właśnie się odbywa — szybkie zameldowanie (spotkania), głosowania podpięte
// pod to spotkanie i przejście do szczegółów. Na stronie startowej, zawsze na górze.
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <section v-if="liveEvent" class="live-ev" :style="{ '--c': typeOf(liveEvent.type).color }" aria-label="Trwa teraz">
    <div class="le-top">
      <span class="le-pulse" aria-hidden="true"></span><small class="le-tag">Trwa teraz</small>
      <span class="kh-spacer"></span>
      <small v-if="attendance[liveEvent.id]" class="le-count"><svg class="i"><use href="#users"/></svg>{{ attendance[liveEvent.id].count }} z {{ attendance[liveEvent.id].members }} członków</small>
    </div>
    <b class="le-title">{{ liveEvent.title || typeOf(liveEvent.type).name }}</b>
    <small class="le-meta">{{ typeOf(liveEvent.type).name }}<template v-if="liveEvent.time"> · {{ liveEvent.time }}</template><template v-if="liveEvent.place"> · {{ liveEvent.place }}</template></small>
    <div class="le-act">
      <template v-if="canCheckIn(liveEvent)">
        <button v-if="!attendance[liveEvent.id]?.me" class="primary" :disabled="checkinBusy" @click="checkIn(liveEvent)"><svg class="i"><use href="#check"/></svg>{{ checkinBusy ? 'Melduję…' : 'Zamelduj się' }}</button>
        <span v-else class="le-in"><svg class="i"><use href="#check"/></svg>Jesteś zameldowany(a)</span>
      </template>
      <button v-for="v in liveVotes" :key="v.id" :class="{ primary: v.status === 'voting' && !canCheckIn(liveEvent) }" @click="goToVote(v)">
        <svg class="i"><use href="#list"/></svg>{{ v.status === 'voting' ? 'Głosuj: ' : '' }}{{ v.title }}
      </button>
      <button class="ghost" @click="openEvent(liveEvent)">Szczegóły<svg class="i"><use href="#chev"/></svg></button>
    </div>
  </section>
</template>

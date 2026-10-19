<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'

// „Trwa teraz”: małe okienko w rogu (na każdej stronie) z wydarzeniem, które właśnie się odbywa — po rozwinięciu
// szybkie zameldowanie (spotkania), głosowania podpięte pod to spotkanie i szczegóły. Zamknięte (×) nie wraca
// przy tym wydarzeniu (zapamiętane na urządzeniu).
const KEY = 'kns-live-closed'
export default defineComponent({
  setup() {
    const app = useApp()
    const open = ref(false)
    const closedId = ref((() => { try { return localStorage.getItem(KEY) || '' } catch { return '' } })())
    function close() {
      closedId.value = app.liveEvent.value?.id || ''
      try { localStorage.setItem(KEY, closedId.value) } catch { /* bez zapamiętania */ }
    }
    watch(() => app.liveEvent.value?.id, () => { open.value = false })
    return { ...app, open, closedId, close }
  },
})
</script>

<template>
  <Transition name="le-pop">
    <section v-if="liveEvent && closedId !== liveEvent.id" class="live-ev" :class="{ open }" :style="{ '--c': typeOf(liveEvent.type).color }" aria-label="Trwa teraz">
      <div class="le-top">
        <button class="le-head" :aria-expanded="open" @click="open = !open">
          <span class="le-pulse" aria-hidden="true"></span>
          <span class="le-head-text"><small class="le-tag">Trwa teraz</small><b class="le-title">{{ liveEvent.title || typeOf(liveEvent.type).name }}</b></span>
          <svg class="i le-chev"><use href="#up"/></svg>
        </button>
        <button class="icon le-x" title="Zamknij — przy tym wydarzeniu już się nie pokaże" aria-label="Zamknij okienko „Trwa teraz”" @click="close"><svg class="i"><use href="#x"/></svg></button>
      </div>
      <div v-if="open" class="le-body">
        <small class="le-meta">{{ typeOf(liveEvent.type).name }}<template v-if="liveEvent.time"> · {{ liveEvent.time }}</template><template v-if="liveEvent.place"> · {{ liveEvent.place }}</template></small>
        <small v-if="attendance[liveEvent.id]" class="le-count"><svg class="i"><use href="#users"/></svg>{{ attendance[liveEvent.id].count }} z {{ attendance[liveEvent.id].members }} członków</small>
        <div class="le-act">
          <template v-if="canCheckIn(liveEvent)">
            <button v-if="!attendance[liveEvent.id]?.me" class="primary" :disabled="checkinBusy" @click="checkIn(liveEvent)"><svg class="i"><use href="#check"/></svg>{{ checkinBusy ? 'Melduję…' : 'Zamelduj się' }}</button>
            <span v-else class="le-in"><svg class="i"><use href="#check"/></svg>Jesteś zameldowany(a)</span>
          </template>
          <button v-for="v in liveVotes" :key="v.id" :class="{ primary: v.status === 'voting' && !canCheckIn(liveEvent) }" @click="goToVote(v); open = false">
            <svg class="i"><use href="#list"/></svg>{{ v.status === 'voting' ? 'Głosuj: ' : '' }}{{ v.title }}
          </button>
          <button class="ghost" @click="openEvent(liveEvent); open = false">Szczegóły<svg class="i"><use href="#chev"/></svg></button>
        </div>
      </div>
    </section>
  </Transition>
</template>

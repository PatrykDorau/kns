<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import { useSwipe } from '@/utils/swipe'

// kalendarz życia kościoła
export default defineComponent({
  setup() {
    const app = useApp()
    // miesiąc idzie za palcem; strzałki — to samo przejście
    return { ...app, ...useSwipe(() => app.shiftMonth(1), () => app.shiftMonth(-1), { target: '.cal-grid' }) }
  },
})
</script>

<template>
  <!-- wyszukiwanie i filtry na górze, pod nimi miesiąc (przesunięcie palcem w lewo/prawo zmienia miesiąc) i od razu wydarzenia -->
  <div class="cal-filters">
  <div class="ann-search cal-search"><svg class="i"><use href="#search"/></svg><input v-model="calQuery" type="search" placeholder="Szukaj wydarzenia: nazwa, miejsce, rodzaj…" aria-label="Szukaj wydarzenia" autocomplete="off"></div>
  <div class="cal-presets" role="group" aria-label="Zestawy">
    <button v-for="p in CAL_PRESETS" :key="p.id" class="chipbtn" :class="{ on: calPreset === p.id }" :aria-pressed="calPreset === p.id" @click="setCalPreset(p)">{{ p.name }}</button>
  </div>
  <details class="cal-types">
  <summary><svg class="i"><use href="#chev"/></svg>Rodzaje wydarzeń<span v-if="calSel.length" class="pill">{{ calSel.length }}</span></summary>
  <div class="filters" role="group" aria-label="Pokazywane rodzaje wydarzeń">
    <button v-for="t in types" :key="t.id" class="filter" :class="{ on: calSel.includes(t.id) }" :aria-pressed="calSel.includes(t.id)" @click="toggleType(t.id)"><i :style="{ background: t.color }"></i>{{ t.name }}</button>
  </div>
  </details>
  </div>
  <div class="cal-month" @touchstart.passive="swipeStart" @touchmove.passive="swipeMove" @touchend="swipeEnd">
  <div class="cal-head">
    <button class="icon" aria-label="Poprzedni miesiąc" @click="swipeTo(1, () => shiftMonth(-1), $refs.grid)"><svg class="i"><use href="#back"/></svg></button>
    <b>{{ monthLabel }}</b>
    <button class="icon" aria-label="Następny miesiąc" @click="swipeTo(-1, () => shiftMonth(1), $refs.grid)"><svg class="i"><use href="#chev"/></svg></button>
  </div>
  <div ref="grid" class="cal-grid">
    <span v-for="d in WEEK" :key="d" class="wd">{{ d }}</span>
    <button v-for="c in calDays" :key="c.date" class="cal-day" :class="{ out: !c.inMonth, today: c.date === todayStr, sel: c.date === selDay }"
            :aria-label="pretty(c.date) + (c.items.length ? ', wydarzeń: ' + c.items.length : '')" :aria-pressed="c.date === selDay" @click="selDay = selDay === c.date ? '' : c.date">
      {{ c.day }}
      <span class="cal-dots"><i v-for="(it, k) in c.items.slice(0, 4)" :key="k" :style="{ background: typeOf(it.type).color }"></i></span>
    </button>
  </div>
  </div>
  <div class="cal-list">
  <div class="section"><h2>{{ selDay ? pretty(selDay) : 'Najbliższe' }}</h2><button v-if="selDay" class="ghost" @click="selDay = ''">Wszystkie</button></div>
  <Transition name="cal-swap" mode="out-in">
  <div :key="selDay || 'all'" class="cal-agenda">
  <p v-if="!agenda.length" class="note">{{ selDay ? 'Tego dnia nic nie zaplanowano.' : calQuery.trim() ? 'Nic nie znaleziono dla „' + calQuery.trim() + '”.' : calSel.length ? 'Brak nadchodzących wydarzeń tego rodzaju.' : 'Na najbliższe tygodnie nic nie zaplanowano.' }}</p>
  <button v-for="it in agenda" :key="it.kind + it.id" class="ev" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
    <span class="when"><small>{{ wd(it.date) }}</small><b>{{ day(it.date) }}</b><small>{{ month(it.date) }}</small></span>
    <span class="body"><b>{{ it.title }}</b><small>{{ it.time || 'cały dzień' }}<template v-if="it.place"> · {{ it.place }}</template></small><span class="tag">{{ typeOf(it.type).name }}</span></span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>
  </div>
  </Transition>
  </div>
  <div v-if="canSubmit" class="invite invite-cal"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
  <div class="cal-actions">
    <!-- nowe wydarzenie: przycisk w karcie zaproszenia powyżej -->
    <button v-if="drive.backend === 'supabase' || drive.demo" @click="openGcal"><svg class="i"><use href="#calendar"/></svg>Dodaj do swojego kalendarza</button>
    <button v-if="canEdit" @click="openTemplates">Szablony</button>
  </div>
</template>

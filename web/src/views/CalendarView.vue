<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// kalendarz życia kościoła
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="cal-head">
    <button class="icon" aria-label="Poprzedni miesiąc" @click="shiftMonth(-1)"><svg class="i"><use href="#back"/></svg></button>
    <b>{{ monthLabel }}</b>
    <button class="icon" aria-label="Następny miesiąc" @click="shiftMonth(1)"><svg class="i"><use href="#chev"/></svg></button>
  </div>
  <div class="cal-grid">
    <span v-for="d in WEEK" :key="d" class="wd">{{ d }}</span>
    <button v-for="c in calDays" :key="c.date" class="cal-day" :class="{ out: !c.inMonth, today: c.date === todayStr, sel: c.date === selDay }"
            :aria-label="pretty(c.date) + (c.items.length ? ', wydarzeń: ' + c.items.length : '')" :aria-pressed="c.date === selDay" @click="selDay = selDay === c.date ? '' : c.date">
      {{ c.day }}
      <span class="cal-dots"><i v-for="(it, k) in c.items.slice(0, 4)" :key="k" :style="{ background: typeOf(it.type).color }"></i></span>
    </button>
  </div>
  <div class="filters" role="group" aria-label="Pokazywane rodzaje wydarzeń">
    <button v-for="t in types" :key="t.id" class="filter" :class="{ on: !hidden.includes(t.id) }" :aria-pressed="!hidden.includes(t.id)" @click="toggleType(t.id)"><i :style="{ background: t.color }"></i>{{ t.name }}</button>
  </div>
  <div v-if="canSubmit" class="invite invite-cal"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
  <div class="cal-actions">
    <!-- nowe wydarzenie: przycisk w karcie zaproszenia powyżej -->
    <button v-if="drive.backend === 'supabase' || drive.demo" @click="openGcal"><svg class="i"><use href="#calendar"/></svg>Dodaj do swojego kalendarza</button>
    <button v-if="canEdit" @click="openTemplates">Szablony</button>
  </div>
  <div class="section"><h2>{{ selDay ? pretty(selDay) : 'Najbliższe' }}</h2><button v-if="selDay" class="ghost" @click="selDay = ''">Wszystkie</button></div>
  <p v-if="!agenda.length" class="note">{{ selDay ? 'Tego dnia nic nie zaplanowano.' : 'Na najbliższe tygodnie nic nie zaplanowano.' }}</p>
  <button v-for="it in agenda" :key="it.kind + it.id" class="ev" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
    <span class="when"><small>{{ wd(it.date) }}</small><b>{{ day(it.date) }}</b><small>{{ month(it.date) }}</small></span>
    <span class="body"><b>{{ it.title }}</b><small>{{ it.time || 'cały dzień' }}<template v-if="it.place"> · {{ it.place }}</template></small><span class="tag">{{ typeOf(it.type).name }}</span></span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>
  <!-- wybór rodzaju nowego wydarzenia -->
  <div v-if="pickType" class="sheet">
    <div class="head">
      <button class="ghost" aria-label="Zamknij" @click="pickType = false"><svg class="i"><use href="#back"/></svg></button>
      <b>{{ canEdit || canReview ? 'Nowe wydarzenie' : 'Zgłoś wydarzenie' }}{{ selDay ? ' — ' + pretty(selDay) : '' }}</b>
    </div>
    <div class="typepick">
      <button v-for="t in types.filter(t => canEdit || canReview || !['nabozenstwo', 'rada', 'czlonkowskie'].includes(t.id))" :key="t.id" @click="newEvent(t.id)"><i :style="{ background: t.color }"></i>{{ t.name }}<small>{{ t.time }}</small></button>
    </div>
  </div>
</template>

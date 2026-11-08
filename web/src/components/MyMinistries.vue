<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import AvailabilityPanel, { av } from '@/components/AvailabilityPanel.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import DutyInvites from '@/components/DutyInvites.vue'
import AsbView from '@/views/AsbView.vue'
import AsbPublicView from '@/views/AsbPublicView.vue'

// „Moja służba” jako strona służby (wzór: Avenit): na górze przełącznik służb (gdy jest ich kilka), nagłówek z dużą
// ikoną, nazwą i liderem, pod nim zakładki: Grafik (tabela niedziele × role), Dyspozycyjność, Członkowie, Informacje,
// Pliki (i Spotkania dla ASB). Wybrana służba i zakładka zapamiętane na tym urządzeniu.
const TABS = [['grafik', 'Grafik', 'calendar'], ['dyspo', 'Dyspozycyjność', 'check'], ['ludzie', 'Członkowie', 'users'], ['info', 'Informacje', 'info'], ['pliki', 'Pliki', 'file']]
const KEY = 'kns-sluzba'
export default defineComponent({
  components: { AvailabilityPanel, ScheduleTable, DutyInvites, AsbView, AsbPublicView },
  setup() {
    const app = useApp()
    const mine = computed(() => app.serve.list.filter(m => m.mine === 'active' || m.leader || (m.id === 'asb' && app.canAsb.value)))
    const edit = reactive({}) // id służby → tekst w edycji
    const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()
    const st = reactive({ id: saved.id || '', tab: saved.tab || 'grafik' })
    watch(() => [st.id, st.tab], () => { try { localStorage.setItem(KEY, JSON.stringify({ id: st.id, tab: st.tab })) } catch { /* bez zapamiętania */ } })
    const m = computed(() => mine.value.find(x => x.id === st.id) || mine.value[0] || null)
    onMounted(() => { app.loadProtocols(true) })
    const tabs = computed(() => { // ASB ma własny, wewnętrzny grafik spotkań (zamiast niedzielnej tabeli i dyspozycyjności)
      if (m.value?.id === 'asb') return TABS.filter(x => x[0] !== 'dyspo')
      return TABS.filter(x => x[0] !== 'grafik' || app.modOn('grafik')) })
    // grafik ASB — dane spotkań wczytywane przy wejściu w zakładkę
    watch(() => [m.value?.id, st.tab], () => { if (m.value?.id === 'asb' && st.tab === 'grafik' && !app.asb.meetings.length && !app.asb.busy) app.loadAsb() }, { immediate: true })
    const tab = computed(() => (tabs.value.some(t => t[0] === st.tab) ? st.tab : tabs.value[0][0]))
    // role osób z najbliższych niedziel (z grafiku) — przy nazwisku na liście członków
    const board = computed(() => av.list.find(x => x.id === m.value?.id))
    function rolesOf(id) {
      const b = board.value
      if (!b) return []
      return [...new Set(Object.values(b.detail || {}).map(day => day[id]?.role).filter(Boolean))]
    }
    function nextOf(id) {
      const b = board.value
      const d = b?.days.find(x => (b.plan?.[x] || []).includes(id))
      return d ? new Date(d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' }) : ''
    }
    const team = computed(() => {
      const x = m.value
      if (!x) return []
      const leaders = new Set((x.leaders || []).map(l => l.id))
      if (x.lead) return x.people.map(p => ({ ...p, leader: leaders.has(p.id) }))
      return (board.value?.people || []).length ? board.value.people.map(p => ({ id: p.id, name: p.name, leader: leaders.has(p.id) })) : (x.members || []).map((n, i) => ({ id: 'n' + i, name: n }))
    })
    const initials = n => String(n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const pick = id => { st.id = id }
    return { ...app, mine, edit, st, m, tabs, tab, team, rolesOf, nextOf, initials, pick }
  },
})
</script>

<template>
  <DutyInvites v-if="modOn('grafik')" />
  <p v-if="!mine.length" class="note">Nie należysz jeszcze do żadnej służby — zgłoś się w „Wszystkie służby”.</p>
  <template v-if="m">
    <!-- kilka służb: przełącznik -->
    <div v-if="mine.length > 1" class="ms-pick" role="tablist" aria-label="Służby">
      <button v-for="x in mine" :key="x.id" role="tab" class="filter" :class="{ on: x.id === m.id }" :aria-selected="x.id === m.id" @click="pick(x.id)">{{ x.name }}</button>
    </div>

    <!-- nagłówek służby -->
    <header class="ms-head">
      <span class="ms-ic"><svg class="i"><use href="#serve"/></svg></span>
      <div class="ms-title">
        <h2>{{ m.name }}<i>.</i></h2>
        <small><template v-if="m.leaders?.length">Lider: {{ m.leaders.map(l => l.name).join(', ') }}</template><template v-if="m.leader"> · prowadzisz tę służbę</template></small>
      </div>
      <div class="ms-acts">
        <button v-if="m.leader || (m.lead && canMsg)" class="small" title="Wiadomość do całej służby" @click="openMsg({ ministries: [m.id] })"><svg class="i"><use href="#megaphone"/></svg><span>Wiadomość</span></button>
        <button v-if="m.lead" class="icon" title="Edytuj służbę" aria-label="Edytuj służbę" @click="editMinistry(m)"><svg class="i"><use href="#pencil"/></svg></button>
      </div>
    </header>

    <!-- zakładki -->
    <nav class="ms-tabs" role="tablist" aria-label="Części służby">
      <button v-for="t in tabs" :key="t[0]" role="tab" :class="{ on: tab === t[0] }" :aria-selected="tab === t[0]" @click="st.tab = t[0]">
        <svg class="i"><use :href="'#' + t[2]"/></svg>{{ t[1] }}<small v-if="t[0] === 'ludzie' && m.pending?.length" class="ms-badge">{{ m.pending.length }}</small>
      </button>
    </nav>

    <section class="ms-body card">
      <template v-if="tab === 'grafik' && m.id === 'asb'"><AsbView v-if="canAsb" /><AsbPublicView v-else /></template>
      <ScheduleTable v-else-if="tab === 'grafik'" :key="'g' + m.id" :ministry="m.id" />

      <AvailabilityPanel v-else-if="tab === 'dyspo'" :key="'d' + m.id" :ministry="m.id" avail-only />

      <template v-else-if="tab === 'ludzie'">
        <div class="ms-bar"><h3>Członkowie służby<small>{{ team.length }}</small></h3><button v-if="m.lead" class="small primary" :disabled="busy" @click="openAddPerson(m)"><svg class="i"><use href="#plus"/></svg>Dodaj członka</button></div>
        <div v-if="m.pending?.length" class="ms-pending">
          <small>Zgłoszenia do akceptacji</small>
          <div v-for="p in m.pending" :key="p.id" class="ms-row">
            <span class="ms-av">{{ initials(p.name) }}</span><span class="ms-who"><b>{{ p.name }}</b><small v-if="p.grupa">{{ p.grupa }}</small></span>
            <button class="small" :disabled="busy" @click="decideMinistry(m, p, false)">Odrzuć</button><button class="small primary" :disabled="busy" @click="decideMinistry(m, p, true)">Akceptuj</button>
          </div>
        </div>
        <p v-if="!team.length" class="note">Nikt jeszcze nie służy.</p>
        <div v-for="p in team" :key="p.id" class="ms-row">
          <span class="ms-av" :class="{ lead: p.leader }">{{ initials(p.name) }}</span>
          <span class="ms-who"><b>{{ p.name }}<em v-if="p.leader" class="ms-tag">lider</em></b><small><template v-if="rolesOf(p.id).length">{{ rolesOf(p.id).join(' · ') }}</template><template v-if="nextOf(p.id)">{{ rolesOf(p.id).length ? ' · ' : '' }}najbliżej {{ nextOf(p.id) }}</template></small></span>
          <button v-if="m.lead && !p.leader && !String(p.id).startsWith('n')" class="icon" :disabled="busy" :aria-label="'Usuń ' + p.name + ' ze służby'" title="Usuń ze służby" @click="removeFromMinistry(m, p)"><svg class="i"><use href="#x"/></svg></button>
        </div>
      </template>

      <template v-else-if="tab === 'info'">
        <div class="ms-bar"><h3>Informacje dla służby</h3><button v-if="m.lead && edit[m.id] === undefined" class="small" @click="edit[m.id] = m.internal || ''"><svg class="i"><use href="#pencil"/></svg>{{ m.internal ? 'Zmień' : 'Dodaj' }}</button></div>
        <template v-if="edit[m.id] !== undefined">
          <textarea v-model="edit[m.id]" rows="6" maxlength="5000" placeholder="np. kto ma klucze, gdzie są kable, zasady, kontakty"></textarea>
          <div class="row"><button class="primary small" :disabled="busy" @click="saveMinistryInternal(m, edit[m.id]); delete edit[m.id]">Zapisz</button><button class="small" @click="delete edit[m.id]">Anuluj</button></div>
        </template>
        <p v-else-if="m.internal" class="ms-text">{{ m.internal }}</p>
        <p v-else class="note">{{ m.lead ? 'Dodaj to, co każdy w służbie powinien wiedzieć: klucze, kable, zasady, kontakty.' : 'Lider nie dodał jeszcze informacji.' }}</p>
      </template>

      <template v-else-if="tab === 'pliki'">
        <div class="ms-bar"><h3>Pliki służby<small>{{ ministryFiles(m.id).length }}</small></h3><button v-if="m.lead" class="small primary" @click="newMinistryFile(m)"><svg class="i"><use href="#plus"/></svg>Dodaj plik</button></div>
        <p v-if="!ministryFiles(m.id).length" class="note">Nie ma jeszcze plików tylko dla tej służby.</p>
        <button v-for="p in ministryFiles(m.id)" :key="p.id" class="mm-file" @click="openProto(p)"><svg class="i"><use href="#file"/></svg><span><b>{{ p.title }}</b><small>{{ p.link ? 'link · Google Dysk' : p.fileName }}</small></span><svg class="i chev"><use href="#chev"/></svg></button>
      </template>

      <template v-else-if="tab === 'asb'">
        <p class="note">Grafik spotkań studenckich i lista pomysłów.</p>
        <button class="primary" @click="openAsb">{{ canAsb ? 'Grafik spotkań' : 'Terminarz spotkań' }}<svg class="i"><use href="#chev"/></svg></button>
      </template>
    </section>
  </template>
</template>

<style scoped>
.ms-pick { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 14px; scrollbar-width: none; }
.ms-pick button { flex: none; }
.ms-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
.ms-ic { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: var(--text); color: var(--accent); }
.ms-ic svg.i { width: 26px; height: 26px; }
.ms-title { flex: 1; min-width: 0; }
.ms-title h2 { margin: 0; font: 600 clamp(22px, 4vw, 30px)/1.1 var(--display); letter-spacing: -.02em; overflow-wrap: anywhere; }
.ms-title h2 i { font-style: normal; color: var(--accent); }
.ms-title small { color: var(--muted); font-size: 13.5px; }
.ms-acts { display: flex; gap: 6px; align-items: center; }
@media (max-width: 520px) { .ms-acts .small span { display: none; } }
.ms-tabs { display: flex; gap: 2px; overflow-x: auto; margin-bottom: 12px; border-bottom: 1px solid var(--line); scrollbar-width: none; }
.ms-tabs button { flex: none; display: inline-flex; align-items: center; gap: 7px; min-height: 42px; padding: 0 12px !important; border: 0 !important; border-radius: 0 !important; background: none !important;
  color: var(--muted) !important; font-weight: 500 !important; box-shadow: inset 0 -2px 0 transparent !important; }
.ms-tabs button svg.i { width: 16px; height: 16px; }
.ms-tabs button.on { color: var(--text) !important; font-weight: 600 !important; box-shadow: inset 0 -2px 0 var(--accent) !important; }
.ms-badge { padding: 0 6px; border-radius: 999px; background: var(--accent); color: #2a1906; font-size: 11px; font-weight: 700; line-height: 18px; }
.ms-body { display: block !important; padding: 16px !important; }
.ms-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.ms-bar h3 { margin: 0; font-size: 17px; display: flex; align-items: baseline; gap: 8px; }
.ms-bar h3 small { color: var(--muted); font-weight: 500; font-size: 14px; }
.ms-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); }
.ms-av { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--panel2); color: var(--muted); font-size: 13px; font-weight: 600; }
.ms-av.lead { background: var(--accent); color: #2a1906; }
.ms-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ms-who b { font-size: 15px; display: flex; align-items: center; gap: 8px; }
.ms-who small { color: var(--muted); font-size: 13px; }
.ms-tag { font-style: normal; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-text); font-size: 11.5px; font-weight: 600; }
.ms-pending { margin-bottom: 12px; padding: 10px 12px; border-radius: 14px; background: var(--accent-soft); }
.ms-pending > small { color: var(--accent-text); font-weight: 600; font-size: 13px; }
.ms-pending .ms-row { border-top: 0; }
.ms-text { margin: 0; white-space: pre-wrap; line-height: 1.55; }
.mm-file { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 8px 12px; margin-bottom: 6px; border-radius: 12px; text-align: left; justify-content: flex-start; }
.mm-file > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mm-file small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-file .i { flex: none; width: 18px; height: 18px; }
</style>

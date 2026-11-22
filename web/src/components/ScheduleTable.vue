<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { av, loadAv, bumpAv } from '@/components/AvailabilityPanel.vue'

// Grafik służby jako tabela (wzór: Avenit): wiersz = niedziela, kolumny = role służby, w komórce osoby ze stanem
// zaproszenia (✓ przyjął, ⏱ czeka, ✕ nie może, ○ nie wysłano), na końcu wiersza podsumowanie. Lider stuka komórkę
// i wybiera osoby (z ich dyspozycyjnością na ten dzień); „Powiadom (N)” wysyła zaproszenia nowym osobom.
// Bez ról — jedna kolumna „Skład”. Dane wspólne z dyspozycyjnością (AvailabilityPanel: av, loadAv).
const STATE = { new: ['○', 'jeszcze nie wysłano'], sent: ['⏱', 'czeka na odpowiedź'], yes: ['✓', 'przyjął(a)'], no: ['✕', 'nie może'] }
const AVAIL = { yes: ['✓', 'może'], no: ['✕', 'nie może'], maybe: ['?', 'nie wie'] }
export default defineComponent({
  props: { ministry: { type: String, required: true } },
  setup(props) {
    const app = useApp()
    const st = reactive({ pick: null, busy: false, roles: null, all: false })
    onMounted(() => { if (!av.list.length) loadAv(app) })
    const m = computed(() => av.list.find(x => x.id === props.ministry))
    const roles = computed(() => m.value?.roles || [])
    const info = (d, id) => m.value?.detail?.[d]?.[id] || { state: 'new', role: '' }
    const people = d => (m.value?.plan?.[d] || []).map(id => ({ id, name: id === m.value.you ? 'Ty' : m.value.people.find(p => p.id === id)?.name || '?', me: id === m.value.you, ...info(d, id) }))
    // kolumny: role służby + „Bez roli”, gdy ktoś jej nie ma; bez ról — jedna kolumna
    const cols = computed(() => {
      if (!roles.value.length) return [{ key: '', name: 'Skład' }]
      const out = roles.value.map(r => ({ key: r, name: r }))
      const loose = (m.value?.days || []).some(d => people(d).some(x => !roles.value.includes(x.role)))
      if (loose || m.value?.lead) out.push({ key: '\u0000', name: 'Bez roli' })
      return out
    })
    const inCol = (d, c) => people(d).filter(x => (c.key === '' ? true : c.key === '\u0000' ? !roles.value.includes(x.role) : x.role === c.key))
    // lider (i członek przy otwartych zapisach): wszystkie najbliższe niedziele; członek — tylko ułożone (albo wszystkie po „Pokaż”)
    const days = computed(() => {
      const x = m.value
      if (!x) return []
      return x.lead || st.all || canSelf.value ? x.days : x.days.filter(d => (x.plan?.[d] || []).length)
    })
    // podpowiedzi dla lidera: kto zaznaczył „mogę” (albo „nie wiem”) na ten dzień, a nie jest jeszcze w grafiku
    const volunteers = d => (m.value?.people || []).filter(p => !(m.value.plan?.[d] || []).includes(p.id) && ['yes', 'maybe'].includes(p.states?.[d]))
      .sort((a, b) => (a.states[d] === 'yes' ? 0 : 1) - (b.states[d] === 'yes' ? 0 : 1) || a.name.localeCompare(b.name, 'pl'))
    // kolumna z podpowiedziami: „Skład” albo „Bez roli”
    const hintCol = c => c.key === '' || c.key === '\u0000'
    const colRole = c => (c.key === '' || c.key === '\u0000' ? '' : c.key)
    async function addVolunteer(d, c, p) {
      st.busy = true; av.error = ''
      bumpAv()
      try {
        await app.api.call('scheduleToggle', { id: m.value.id, day: d, person: p.id })
        if (colRole(c)) await app.api.call('scheduleRole', { id: m.value.id, day: d, person: p.id, role: colRole(c) })
        await loadAv(app)
      } catch (e) { av.error = e.message; loadAv(app) } finally { st.busy = false }
    }
    // samodzielne zapisy (ustawienie służby): członek sam dopisuje się na niedzielę (od razu „przyjął”) i sam się wypisuje
    const canSelf = computed(() => !!(m.value?.self && m.value?.member))
    const amIn = d => (m.value?.plan?.[d] || []).includes(m.value?.you)
    async function selfJoin(d, c, join) {
      st.busy = true; av.error = ''
      bumpAv()
      try { await app.api.call('scheduleSelf', { id: m.value.id, day: d, join, role: colRole(c) }); await loadAv(app); app.showToast(join ? 'Zapisano Cię na ' + dayName(d) + '.' : 'Wypisano Cię z ' + dayName(d) + '.') }
      catch (e) { av.error = e.message; loadAv(app) } finally { st.busy = false }
    }
    // Twoja najbliższa służba w tej służbie (pole koloru nad tabelą)
    const myNext = computed(() => {
      const x = m.value; if (!x) return null
      const d = x.days.find(d => (x.plan?.[d] || []).includes(x.you) && info(d, x.you).state !== 'no')
      if (!d) return null
      const me = info(d, x.you), others = people(d).filter(p => !p.me).map(p => p.name)
      return { d, role: me.role, state: me.state, others }
    })
    const dayNum = d => new Date(d + 'T12:00').getDate()
    async function setSelf(on) {
      st.busy = true
      try { await app.api.call('ministrySelf', { id: m.value.id, on }); await loadAv(app) } catch (e) { av.error = e.message } finally { st.busy = false }
    }
    const tally = d => { const t = { yes: 0, sent: 0, no: 0, new: 0 }; for (const x of people(d)) t[x.state]++; return t }
    const unsent = computed(() => (m.value?.days || []).reduce((n, d) => n + people(d).filter(x => x.state === 'new').length, 0))
    const dayName = d => new Date(d + 'T12:00').toLocaleDateString('pl', { day: '2-digit', month: '2-digit' })
    const dayLong = d => new Date(d + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
    const isNext = d => d === m.value?.days?.[0]
    // wybór osób w komórce
    const open = (d, c) => { if (m.value?.lead) st.pick = { d, c } }
    const pickList = computed(() => {
      if (!st.pick || !m.value) return []
      const { d } = st.pick
      return m.value.people.map(p => {
        const here = (m.value.plan?.[d] || []).includes(p.id)
        return { ...p, here, role: here ? info(d, p.id).role : '', state: here ? info(d, p.id).state : '', avail: p.states?.[d] || '' }
      }).sort((a, b) => ({ yes: 0, maybe: 1, '': 2, no: 3 }[a.avail] - { yes: 0, maybe: 1, '': 2, no: 3 }[b.avail]) || a.name.localeCompare(b.name))
    })
    const pickRole = computed(() => (st.pick?.c.key === '\u0000' || !st.pick ? '' : st.pick.c.key))
    async function choose(p) {
      const x = m.value, { d } = st.pick, role = pickRole.value
      st.busy = true; av.error = ''
      bumpAv()
      try {
        if (p.here && (p.role === role || (!roles.value.length))) {
          await app.api.call('scheduleToggle', { id: x.id, day: d, person: p.id }) // zdejmij z grafiku
        } else {
          if (!p.here) await app.api.call('scheduleToggle', { id: x.id, day: d, person: p.id })
          if (role || p.here) await app.api.call('scheduleRole', { id: x.id, day: d, person: p.id, role })
        }
        await loadAv(app)
      } catch (e) { av.error = e.message; loadAv(app) } finally { st.busy = false }
    }
    async function publish() {
      st.busy = true
      try { const n = await app.api.call('schedulePublish', { id: m.value.id }); app.showToast(n ? 'Zaproszenia wysłane (' + n + ' os.).' : 'Nie ma nowych osób do zaproszenia.'); await loadAv(app) }
      catch (e) { av.error = e.message } finally { st.busy = false }
    }
    async function saveRoles() {
      const list = st.roles.split(',').map(x => x.trim()).filter(Boolean)
      try { await app.api.call('ministryRoles', { id: m.value.id, roles: list }); st.roles = null; await loadAv(app) } catch (e) { av.error = e.message }
    }
    return { myNext, dayNum, volunteers, hintCol, addVolunteer, canSelf, amIn, selfJoin, setSelf, av, st, m, roles, cols, inCol, days, tally, unsent, dayName, dayLong, isNext, open, pickList, pickRole, choose, publish, saveRoles, STATE, AVAIL }
  },
})
</script>

<template>
  <div v-if="m" class="sg">
    <div class="sg-top">
      <p class="sg-legend"><span><i class="st-yes">✓</i> przyjął</span><span><i class="st-sent">⏱</i> czeka</span><span><i class="st-no">✕</i> nie może</span><span v-if="m.lead"><i>○</i> nie wysłano</span></p>
      <span class="sg-sp"></span>
      <button v-if="m.lead" class="small sg-self" :class="{ on: m.self }" role="switch" :aria-checked="!!m.self" :disabled="st.busy" title="Członkowie służby sami dopisują się na niedziele (od razu potwierdzone); dostajesz powiadomienie o każdym zapisie" @click="setSelf(!m.self)"><svg class="i"><use :href="m.self ? '#check' : '#users'"/></svg>{{ m.self ? 'Zapisy otwarte' : 'Otwórz zapisy' }}</button>
      <button v-if="m.lead" class="small" @click="st.roles = roles.join(', ')"><svg class="i"><use href="#pencil"/></svg>Role</button>
      <button v-if="m.lead" class="small sg-notify" :class="{ on: unsent }" :disabled="st.busy || !unsent" title="Nowe osoby z grafiku dostaną zaproszenie: Przyjmuję / Nie mogę" @click="publish"><svg class="i"><use href="#megaphone"/></svg>Powiadom{{ unsent ? ' (' + unsent + ')' : '' }}</button>
    </div>
    <div v-if="st.roles !== null" class="sg-roles">
      <input v-model="st.roles" placeholder="Role po przecinku, np. Wokal, Gitara, Bas, Perkusja" aria-label="Role w służbie, po przecinku" @keydown.enter="saveRoles">
      <button class="primary small" @click="saveRoles">Zapisz</button><button class="small" @click="st.roles = null">Anuluj</button>
    </div>
    <p v-if="av.error" class="error">{{ av.error }}</p>

    <div v-if="myNext" class="mo-next sg-mine">
      <span class="mo-next-d"><small>{{ new Date(myNext.d + 'T12:00').toLocaleDateString('pl', { weekday: 'short' }) }}</small><b>{{ dayNum(myNext.d) }}</b><small>{{ new Date(myNext.d + 'T12:00').toLocaleDateString('pl', { month: 'short' }) }}</small></span>
      <span class="mo-next-b"><small>Twoja najbliższa służba{{ myNext.role ? ' · ' + myNext.role : '' }}</small><b>{{ { yes: 'Przyjęte', sent: 'Czeka na Twoją odpowiedź', new: 'Wpisany(a) — zaproszenie jeszcze nie wysłane' }[myNext.state] }}</b><span>{{ myNext.others.length ? 'z: ' + myNext.others.join(', ') : 'na razie sam(a)' }}</span></span>
    </div>
    <p v-if="!days.length" class="note">Grafik nie jest jeszcze ułożony.<button v-if="!m.lead" class="ghost small" @click="st.all = true">Pokaż niedziele</button></p>
    <div v-else class="sg-wrap">
      <table class="sg-table">
        <thead><tr><th class="sg-d">Data</th><th v-for="c in cols" :key="c.key">{{ c.name }}</th><th class="sg-s">Status</th></tr></thead>
        <tbody>
          <tr v-for="d in days" :key="d" :class="{ next: isNext(d) }">
            <th class="sg-d" :title="dayLong(d)"><b>{{ dayName(d) }}</b><small>{{ isNext(d) ? 'najbliższa' : 'niedziela' }}</small></th>
            <td v-for="c in cols" :key="c.key" :class="{ edit: m.lead }" @click="open(d, c)">
              <span v-for="x in inCol(d, c)" :key="x.id" class="sg-pill" :class="['st-' + x.state, { me: x.me }]" :title="STATE[x.state][1]"><i>{{ STATE[x.state][0] }}</i>{{ x.name }}<em v-if="c.key === '\u0000' && x.role">{{ x.role }}</em><button v-if="x.me && canSelf && !m.lead && x.state === 'yes'" class="sg-x" :disabled="st.busy" :aria-label="'Wypisz się z ' + dayName(d)" @click.stop="selfJoin(d, c, false)">×</button></span>
              <span v-if="m.lead && !inCol(d, c).length && !(hintCol(c) && volunteers(d).length)" class="sg-add" aria-hidden="true">+</span>
              <!-- podpowiedzi: zgłosili się na ten dzień (dyspozycyjność „mogę”) — stuknij, żeby dodać -->
              <template v-if="m.lead && hintCol(c)"><button v-for="p in volunteers(d)" :key="'v' + p.id" class="sg-hintp" :class="'av-' + p.states[d]" :disabled="st.busy" :title="(p.states[d] === 'yes' ? 'Może' : 'Nie wie') + ' — dodaj do grafiku'" @click.stop="addVolunteer(d, c, p)">+ {{ p.name }}<i v-if="p.states[d] === 'maybe'">?</i></button></template>
              <button v-if="canSelf && !m.lead && !amIn(d) && (roles.length ? c.key !== '\u0000' : true)" class="sg-join" :disabled="st.busy" @click.stop="selfJoin(d, c, true)">+ Zapisz się</button>
            </td>
            <td class="sg-s"><span v-if="tally(d).yes" class="st-yes">✓{{ tally(d).yes }}</span><span v-if="tally(d).sent" class="st-sent">⏱{{ tally(d).sent }}</span><span v-if="tally(d).no" class="st-no">✕{{ tally(d).no }}</span><span v-if="m.lead && tally(d).new" class="st-new">○{{ tally(d).new }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="m.lead" class="sg-hint">Stuknij komórkę, żeby wybrać osoby, albo przerywaną podpowiedź „+ imię” — to osoby, które zaznaczyły, że mogą. {{ m.self ? 'Zapisy są otwarte: członkowie dopisują się też sami.' : '„Otwórz zapisy” — członkowie dopiszą się sami.' }} Zaproszenia wychodzą dopiero po „Powiadom”.</p>
    <p v-else-if="canSelf" class="sg-hint">Zapisy są otwarte — dopisz się na niedzielę{{ roles.length ? ' w swojej roli' : '' }}. Lider dostanie powiadomienie. Wypisujesz się krzyżykiem przy swoim imieniu.</p>

    <!-- lider: wybór osób do komórki (z dyspozycyjnością na ten dzień) -->
    <Teleport to="body">
    <div v-if="st.pick" class="np-overlay sg-overlay" @click.self="st.pick = null">
      <div class="np-panel sg-panel" role="dialog" :aria-label="'Kto: ' + st.pick.c.name">
        <div class="np-head"><b>{{ st.pick.c.name }} · {{ dayLong(st.pick.d) }}</b><button class="icon" aria-label="Zamknij" @click="st.pick = null"><svg class="i"><use href="#x"/></svg></button></div>
        <p v-if="!pickList.length" class="note">W tej służbie nikt jeszcze nie służy — dodaj osoby w zakładce „Członkowie”.</p>
        <button v-for="p in pickList" :key="p.id" class="sg-opt" :class="{ on: p.here && (p.role === pickRole || !roles.length), other: p.here && p.role !== pickRole && roles.length }" :disabled="st.busy" @click="choose(p)">
          <span class="sg-av" :class="'av-' + (p.avail || 'none')" :title="AVAIL[p.avail]?.[1] || 'nie odpowiedział(a)'">{{ AVAIL[p.avail]?.[0] || '–' }}</span>
          <span class="sg-on"><b>{{ p.name }}</b><small>{{ p.here ? (p.role && p.role !== pickRole ? 'już w grafiku: ' + p.role + ' — stuknij, żeby przenieść' : 'w grafiku · ' + STATE[p.state][1]) : AVAIL[p.avail]?.[1] || 'nie podał(a) dyspozycyjności' }}</small></span>
          <svg v-if="p.here && (p.role === pickRole || !roles.length)" class="i"><use href="#check"/></svg>
        </button>
        <div class="np-foot"><button class="primary" @click="st.pick = null">Gotowe</button></div>
      </div>
    </div>
    </Teleport>
  </div>
  <p v-else class="note">Wczytywanie grafiku…</p>
</template>

<style scoped>
.sg-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.sg-sp { flex: 1; }
.sg-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; color: var(--muted); font-size: 12.5px; }
.sg-legend i { font-style: normal; font-weight: 700; }
.sg-notify.on { background: var(--accent) !important; color: #2a1906 !important; font-weight: 600 !important; }
.sg-roles { display: flex; gap: 8px; margin-bottom: 10px; }
.sg-roles input { flex: 1; min-width: 0; }
.sg-wrap { overflow-x: auto; border-radius: 16px; background: var(--panel); -webkit-overflow-scrolling: touch; }
.sg-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.sg-table th, .sg-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
.sg-table thead th { color: var(--muted); font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--panel2); }
.sg-table tbody tr:last-child > * { border-bottom: 0; }
.sg-d { position: sticky; left: 0; z-index: 1; background: var(--panel); min-width: 74px; }
thead .sg-d { background: var(--panel2); }
.sg-d b { display: block; font-size: 15px; font-variant-numeric: tabular-nums; }
.sg-d small { color: var(--muted); font-size: 11.5px; font-weight: 400; }
tr.next .sg-d b { color: var(--accent-text); }
.sg-table td { min-width: 120px; }
.sg-table td.edit { cursor: pointer; }
@media (hover: hover) { .sg-table td.edit:hover { background: var(--tint); } }
.sg-pill { display: inline-flex; align-items: center; gap: 5px; margin: 2px 4px 2px 0; padding: 3px 9px 3px 4px; border-radius: 999px; background: var(--panel2); color: var(--text) !important; font-size: 13px; font-weight: 500; white-space: nowrap; }
.sg-pill i { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-style: normal; font-size: 10px; font-weight: 700; background: var(--panel3); color: var(--muted); }
.sg-pill em { font-style: normal; color: var(--muted); }
.sg-pill.me { box-shadow: inset 0 0 0 1.5px var(--accent); }
.sg-pill.st-yes i { background: var(--ok-soft); color: var(--ok-text); }
.sg-pill.st-sent i { background: var(--accent-soft); color: var(--accent-text); }
.sg-pill.st-no { text-decoration: line-through; color: var(--muted) !important; }
.sg-pill.st-no i { background: var(--bad-soft); color: var(--bad-text); }
.sg-add { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 1.5px dashed var(--panel3); color: var(--muted); font-weight: 600; }
.sg-s { white-space: nowrap; font-size: 13px; font-weight: 600; }
.sg-s span { margin-right: 8px; }
.sg-s .st-yes { color: var(--ok-text) !important; } .sg-s .st-sent { color: var(--accent-text); } .sg-s .st-no { color: var(--bad-text); } .sg-s .st-new { color: var(--muted); }
.sg-hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.sg-self.on { background: var(--ok-soft) !important; color: var(--ok-text) !important; font-weight: 600 !important; }
.sg-hintp { display: inline-flex; align-items: center; gap: 3px; margin: 2px 4px 2px 0; min-height: 28px !important; padding: 2px 10px !important; border-radius: 999px !important; border: 1.5px dashed var(--ok) !important; background: transparent !important; color: var(--ok-text) !important; font-size: 13px; font-weight: 600 !important; white-space: nowrap; }
.sg-hintp.av-maybe { border-color: var(--accent) !important; color: var(--accent-text) !important; }
.sg-hintp i { font-style: normal; opacity: .8; }
@media (hover: hover) { .sg-hintp:hover:not(:disabled) { background: var(--ok-soft) !important; } }
.sg-join { margin: 2px 0; min-height: 30px !important; padding: 2px 12px !important; border-radius: 999px !important; background: var(--accent) !important; color: #2a1906 !important; border: 0 !important; font-size: 13px; font-weight: 700 !important; white-space: nowrap; }
.sg-x { display: inline-grid; place-items: center; width: 20px; height: 20px; min-height: 0 !important; margin-left: 2px; padding: 0 !important; border-radius: 50% !important; border: 0 !important; background: var(--panel3) !important; color: var(--text) !important; font-size: 14px; line-height: 1; }
.sg-panel { display: flex; flex-direction: column; gap: 6px; max-height: 80vh; overflow-y: auto; }
.sg-opt { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 54px; padding: 8px 12px !important; border-radius: 14px !important; text-align: left; justify-content: flex-start; background: var(--panel) !important; border: 0 !important; }
.sg-opt.on { box-shadow: inset 0 0 0 2px var(--ok) !important; }
.sg-opt.other { opacity: .75; }
.sg-opt > svg.i { flex: none; width: 20px; height: 20px; color: var(--ok-text); }
.sg-on { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sg-on small { color: var(--muted); font-size: 12.5px; }
.sg-av { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--panel2); color: var(--muted); font-weight: 700; font-size: 13px; }
.sg-av.av-yes { background: var(--ok-soft); color: var(--ok-text); }
.sg-av.av-no { background: var(--bad-soft); color: var(--bad-text); }
.sg-av.av-maybe { background: var(--accent-soft); color: var(--accent-text); }
</style>

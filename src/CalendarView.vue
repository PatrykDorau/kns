<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Brand from './Brand.vue'
import SyncButton from './SyncButton.vue'
import ProgramEditor from './ProgramEditor.vue'
import NotifyPicker from './NotifyPicker.vue'
import { addMinutes, category, programFrom } from '../mobile/church.js'
import { access, notifyPeople, calendarRequest, canUse, churchEvents, churchTypes, me, plannerRequest, removeChurchEvent, role, saveChurchEvent, services, today, uid, DEFAULT_TIME, DEFAULT_PLACE } from './store.js'

// Kalendarz życia kościoła: nabożeństwa i inne wydarzenia. Wydarzenia zmieniają osoby z prawem edycji;
// nabożeństwo otwiera się w Organizacji nabożeństw (tam są pieśni, załączniki i program).
const localDate = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const asDate = date => new Date(date + 'T12:00')
const pretty = date => asDate(date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
const typeOf = id => churchTypes.value.find(t => t.id === id) || { id, name: 'Inne', color: '#8f98a8', program: [] }
const eventTypes = computed(() => churchTypes.value.filter(t => t.id !== 'nabozenstwo'))
const canEdit = computed(() => access.edit)

const items = computed(() => [
  ...services.value.filter(s => s.date).map(s => ({ kind: 'service', id: s.id, type: 'nabozenstwo', date: s.date, time: s.time || DEFAULT_TIME, place: s.place || DEFAULT_PLACE, title: s.sermonTitle ? 'Nabożeństwo: ' + s.sermonTitle : 'Nabożeństwo', ref: s })),
  ...churchEvents.value.filter(e => e.date).map(e => ({ kind: 'event', id: e.id, type: e.type, date: e.date, time: e.time || '', place: e.place || '', title: e.title || typeOf(e.type).name, ref: e })),
].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00'))))

const month = ref(today().slice(0, 7))
const day = ref(today())
const label = computed(() => asDate(month.value + '-01').toLocaleDateString('pl', { month: 'long', year: 'numeric' }))
function shift(by) { const d = asDate(month.value + '-01'); d.setMonth(d.getMonth() + by); month.value = localDate(d).slice(0, 7) }
const WEEK = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd']
const days = computed(() => {
  const first = asDate(month.value + '-01')
  const d = new Date(first); d.setDate(1 - ((first.getDay() + 6) % 7))
  const out = []
  do {
    for (let i = 0; i < 7; i++) {
      const date = localDate(d)
      out.push({ date, n: d.getDate(), inMonth: date.startsWith(month.value), items: items.value.filter(it => it.date === date) })
      d.setDate(d.getDate() + 1)
    }
  } while (localDate(d).startsWith(month.value))
  return out
})
const dayItems = computed(() => items.value.filter(it => it.date === day.value))

// Wybrane: nabożeństwo (podgląd) albo wydarzenie (edycja na kopii roboczej).
const picked = ref(null) // { kind, id }
const draft = ref(null)
let saved = ''
const isNew = ref(false)
const message = ref('')
const notifyIds = ref([]) // odbiorcy powiadomienia po zapisaniu
const busy = ref(false)
const dirty = computed(() => !!draft.value && (isNew.value || JSON.stringify(draft.value) !== saved))
const pickedService = computed(() => picked.value?.kind === 'service' ? services.value.find(s => s.id === picked.value.id) : null)
const leaveOk = () => !dirty.value || confirm('Masz niezapisane zmiany w wydarzeniu. Porzucić je?')

function pick(it) {
  if (!leaveOk()) return
  message.value = ''
  picked.value = { kind: it.kind, id: it.id }
  day.value = it.date; month.value = it.date.slice(0, 7)
  if (it.kind === 'event') {
    draft.value = { type: 'inne', title: '', time: '', place: '', description: '', program: [], ...JSON.parse(JSON.stringify(it.ref)) }
    draft.value.program = (draft.value.program || []).map(p => ({ key: uid(), person: '', note: '', ...p }))
    saved = JSON.stringify(draft.value); isNew.value = false
  } else draft.value = null
}
function newEvent() {
  if (!leaveOk()) return
  const t = eventTypes.value[0] || typeOf('inne')
  draft.value = { id: uid(), type: t.id, title: t.name, date: day.value || today(), time: t.time || '', place: t.place || '', description: '', program: programFrom(t, uid), createdBy: me() }
  saved = ''; isNew.value = true; picked.value = { kind: 'event', id: draft.value.id }; message.value = ''
}
function newService() {
  if (!leaveOk()) return
  plannerRequest.value = { date: day.value && day.value >= today() ? day.value : null }
  role.value = 'planner'
}
function openInPlanner() { plannerRequest.value = { id: picked.value.id }; role.value = 'planner' }
let lastType = ''
function typeChanged() {
  const ev = draft.value, old = typeOf(lastType), t = typeOf(ev.type)
  if (!ev.title.trim() || ev.title === old.name) ev.title = t.name
  if (!ev.place || ev.place === old.place) ev.place = t.place || ''
  if (!ev.time || ev.time === old.time) ev.time = t.time || ''
  if (!ev.program.length) ev.program = programFrom(t, uid)
  lastType = ev.type
}
function fillProgram() {
  if (draft.value.program.length && !confirm('Zastąpić obecny program programem z szablonu?')) return
  draft.value.program = programFrom(typeOf(draft.value.type), uid)
}
const isPublic = computed({
  get: () => (draft.value?.public === undefined ? !['czlonkowskie', 'rada'].includes(draft.value?.type) : !!draft.value.public),
  set: v => { draft.value.public = v },
})
async function save() {
  busy.value = true; message.value = ''
  try {
    const base = isNew.value ? 0 : JSON.parse(saved).updated || 0
    const ev = { ...JSON.parse(JSON.stringify(draft.value)), title: draft.value.title.trim(), updated: Date.now(), updatedBy: me() }
    ev.program = ev.program.map(({ offset, category: c, title, person, note, key }) => ({ key, offset, category: c, title: title || '', person: person || '', note: note || '' }))
    const res = await saveChurchEvent(ev, base)
    if (res.error) { message.value = res.error; return }
    draft.value = { ...ev }; saved = JSON.stringify(draft.value); isNew.value = false
    message.value = 'Zapisano — telefony i inne komputery widzą zmianę od razu.'
    if (notifyIds.value.length) {
      const when = asDate(ev.date).toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' }) + (ev.time ? ', ' + ev.time : '')
      const r = await notifyPeople(notifyIds.value, { title: ev.title || typeOf(ev.type).name, body: [when, ev.place].filter(Boolean).join(' · '), url: './?wydarzenie=' + encodeURIComponent(ev.id) })
      if (r.error) message.value += ' Powiadomienie nie wyszło: ' + r.error
      else { message.value += r.sent ? ` Powiadomienie wysłane (${r.sent} ${r.sent === 1 ? 'telefon' : 'telefony'}).` : ' Nikt z wybranych nie ma włączonych powiadomień.'; notifyIds.value = [] }
    }
  } finally { busy.value = false }
}
async function remove() {
  if (!confirm('Usunąć to wydarzenie z kalendarza?')) return
  busy.value = true
  try {
    const res = await removeChurchEvent(draft.value.id)
    if (res.error) { message.value = res.error; return }
    draft.value = null; picked.value = null; isNew.value = false
  } finally { busy.value = false }
}
function back() { if (leaveOk()) role.value = null }
const programLine = (svc, p) => addMinutes(svc.time || DEFAULT_TIME, p.offset) + ' ' + category(p.category).name + (p.title ? ' — ' + p.title : '')

onMounted(() => {
  const req = calendarRequest.value
  calendarRequest.value = null
  if (!req) return
  const it = items.value.find(x => x.kind === req.kind && x.id === req.id)
  if (it) pick(it)
  else if (req.date) { day.value = req.date; month.value = req.date.slice(0, 7) }
})
</script>

<template>
  <div class="app">
    <header>
      <button class="iconbtn" title="Strona startowa" aria-label="Strona startowa" @click="back"><Icon name="left" /></button>
      <Brand />
      <h1>Kalendarz</h1>
      <span class="spacer"></span>
      <SyncButton status />
      <template v-if="canEdit">
        <button @click="newEvent"><Icon name="plus" />Nowe wydarzenie</button>
        <button v-if="canUse('planner')" class="primary" @click="newService"><Icon name="plus" />Nowe nabożeństwo</button>
      </template>
    </header>

    <main class="cal-page">
      <section class="cal-month">
        <div class="cm-head">
          <button class="iconbtn" title="Poprzedni miesiąc" aria-label="Poprzedni miesiąc" @click="shift(-1)"><Icon name="left" /></button>
          <b>{{ label }}</b>
          <button class="iconbtn" title="Następny miesiąc" aria-label="Następny miesiąc" @click="shift(1)"><Icon name="right" /></button>
          <button class="small" @click="month = today().slice(0, 7); day = today()">Dziś</button>
        </div>
        <div class="cm-grid">
          <span v-for="w in WEEK" :key="w" class="cm-wd">{{ w }}</span>
          <button v-for="c in days" :key="c.date" class="cm-day" :class="{ out: !c.inMonth, today: c.date === today(), sel: c.date === day }" :aria-label="pretty(c.date)" :aria-pressed="c.date === day" @click="day = c.date">
            <span class="cm-n">{{ c.n }}</span>
            <span v-for="it in c.items.slice(0, 3)" :key="it.kind + it.id" class="cm-ev" :style="{ '--c': typeOf(it.type).color }">{{ it.time }} {{ it.title }}</span>
            <span v-if="c.items.length > 3" class="cm-more">+{{ c.items.length - 3 }}</span>
          </button>
        </div>
        <h2 class="cm-dayh">{{ pretty(day) }}</h2>
        <p v-if="!dayItems.length" class="note">Tego dnia nic nie zaplanowano.</p>
        <button v-for="it in dayItems" :key="it.kind + it.id" class="cm-item" :class="{ sel: picked && picked.kind === it.kind && picked.id === it.id }" :style="{ '--c': typeOf(it.type).color }" @click="pick(it)">
          <b>{{ it.time || '—' }}</b><span>{{ it.title }}<small>{{ typeOf(it.type).name }}<template v-if="it.place"> · {{ it.place }}</template></small></span>
        </button>
      </section>

      <section class="props form cal-side">
        <div v-if="pickedService" class="cal-detail">
          <h2>Nabożeństwo</h2>
          <p class="big">{{ pretty(pickedService.date) }}, {{ pickedService.time || DEFAULT_TIME }} · {{ pickedService.place || DEFAULT_PLACE }}</p>
          <p v-if="pickedService.sermonTitle || pickedService.passage">{{ [pickedService.sermonTitle, pickedService.passage].filter(Boolean).join(' · ') }}<template v-if="pickedService.speaker"> — {{ pickedService.speaker }}</template></p>
          <ol v-if="pickedService.program?.length" class="tl">
            <li v-for="p in [...pickedService.program].sort((a, b) => a.offset - b.offset)" :key="p.key">{{ programLine(pickedService, p) }}</li>
          </ol>
          <p class="note">Pieśni: {{ pickedService.songs.length }} · załączniki: {{ pickedService.files.length }}</p>
          <button v-if="canUse('planner')" class="primary" @click="openInPlanner"><Icon name="pencil" />Otwórz w Organizacji nabożeństw</button>
        </div>

        <template v-else-if="draft">
          <h2>{{ isNew ? 'Nowe wydarzenie' : 'Wydarzenie' }}</h2>
          <p v-if="!canEdit" class="note">Tylko podgląd — wydarzenia zmieniają osoby z prawem edycji.</p>
          <fieldset class="plainset" :disabled="!canEdit">
            <div class="grid2">
              <div><label for="evType">Rodzaj</label>
                <select id="evType" v-model="draft.type" @focus="lastType = draft.type" @change="typeChanged"><option v-for="t in eventTypes" :key="t.id" :value="t.id">{{ t.name }}</option></select></div>
              <div><label for="evTitle">Nazwa *</label><input id="evTitle" v-model="draft.title" type="text" :class="{ invalid: !draft.title.trim() }"></div>
              <div><label for="evDate">Data *</label><input id="evDate" v-model="draft.date" type="date"></div>
              <div><label for="evTime">Godzina</label><input id="evTime" v-model="draft.time" type="time"></div>
            </div>
            <label for="evPlace">Miejsce</label><input id="evPlace" v-model="draft.place" type="text">
            <label for="evDesc">Opis</label><textarea id="evDesc" v-model="draft.description" class="short" placeholder="Co, dla kogo, co przygotować…"></textarea>
            <label class="checkrow"><input v-model="isPublic" type="checkbox">Widoczne dla gości (bez konta)</label>
            <h2 class="sub">Program</h2>
            <ProgramEditor :items="draft.program" :start="draft.time || '00:00'" :template="typeOf(draft.type).program || []" @fill="fillProgram" />
          </fieldset>
          <NotifyPicker v-if="canEdit" v-model="notifyIds" />
          <p v-if="message" class="url">{{ message }}</p>
          <div v-if="canEdit" class="btnrow end">
            <button v-if="!isNew" :disabled="busy" @click="remove"><Icon name="trash" />Usuń</button>
            <span class="spacer"></span>
            <button class="primary" :disabled="busy || (!dirty && !notifyIds.length) || !draft.title.trim() || !draft.date" @click="save"><Icon name="check" />{{ busy ? 'Zapisuję…' : dirty ? 'Zapisz' : notifyIds.length ? 'Wyślij powiadomienie' : 'Zapisane' }}</button>
          </div>
        </template>

        <div v-else class="empty">Wybierz dzień i wydarzenie w kalendarzu{{ canEdit ? ' albo dodaj nowe' : '' }}.</div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.cal-page { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(360px, 1fr); gap: 16px; padding: 0 16px 16px; min-height: 0; flex: 1; }
.cal-month { overflow-y: auto; padding: 14px; border-radius: var(--radius); background: var(--panel); display: flex; flex-direction: column; gap: 8px; }
.cm-head { display: flex; align-items: center; gap: 8px; }
.cm-head b { font-size: 17px; text-transform: capitalize; min-width: 180px; text-align: center; }
.cm-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.cm-wd { text-align: center; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; padding: 2px 0; }
.cm-day { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 2px; min-height: 86px; padding: 6px; border-radius: 10px; background: var(--panel2); border-color: transparent; text-align: left; overflow: hidden; }
.cm-day.out { opacity: .45; }
.cm-day.today { border-color: var(--accent); }
.cm-day.sel { box-shadow: inset 0 0 0 2px var(--accent); }
.cm-n { font-weight: 700; font-size: 13px; }
.cm-ev { font-size: 11px; padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--c) 22%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-more { font-size: 11px; color: var(--muted); }
.cm-dayh { margin: 10px 0 0; font-size: 14px; }
.cm-dayh::first-letter, .cal-detail .big::first-letter { text-transform: uppercase; }
.cm-item { justify-content: flex-start; gap: 12px; text-align: left; border-left: 4px solid var(--c); background: var(--panel2); }
.cm-item.sel { outline: 2px solid var(--accent); }
.cm-item b { width: 48px; flex: none; }
.cm-item span { display: flex; flex-direction: column; }
.cm-item small { color: var(--muted); font-size: 12px; }
.cal-side { overflow-y: auto; }
.cal-detail .big { font-size: 16px; }
.tl { padding-left: 18px; margin: 6px 0; }
.plainset { border: 0; padding: 0; margin: 0; min-width: 0; }
.checkrow { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.checkrow input { width: auto; }
</style>

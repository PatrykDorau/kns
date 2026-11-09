<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Moduły (wzór: Avenit): administrator włącza i wyłącza części aplikacji i decyduje, kto je widzi — wybrane służby,
// role albo konkretne osoby (wystarczy spełnić jedno). Druga zakładka: role w aplikacji (wszystkie oprócz Administratora):
// nazwa, uprawnienia, nowe role, usuwanie własnych. Dostęp edytuje się w oknie — lista się nie rozsuwa i nie skacze.
const FLAGS = [
  { key: 'edit', name: 'Edycja treści', desc: 'Nabożeństwa, pieśni, wydarzenia, ogłoszenia' },
  { key: 'council', name: 'Rada zboru', desc: 'Protokoły i ogłoszenia rady, komunikaty' },
  { key: 'protocols', name: 'Protokoły', desc: 'Pisze protokoły spotkań członkowskich' },
  { key: 'approve', name: 'Zatwierdzanie', desc: 'Zatwierdza wpisy i zgłoszenia innych' },
]
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ tab: 'mods', busy: '', error: '', acc: null, role: null, peopleQ: '', modPeople: [], peopleLoaded: false })
    onMounted(() => {
      if (!app.serve.list.length && !app.serve.busy) app.loadServe()
      if (!app.people.value.length) app.loadPeople()
    })
    const groups = computed(() => {
      const by = {}
      for (const m of app.MODULES) (by[m.group] ||= []).push(m)
      return Object.entries(by).map(([name, list]) => ({ name, list }))
    })
    const isOff = id => (app.modules.value.off || []).includes(id)
    const onCount = computed(() => app.MODULES.filter(m => !isOff(m.id)).length)
    const ministries = computed(() => app.serve.list.map(m => ({ id: m.id, name: m.name })))
    const roles = computed(() => app.ranks.value.filter(r => r.id !== 'admin'))
    const active = computed(() => app.people.value.filter(p => p.status === 'active'))
    // podpis dostępu w wierszu modułu: „Wszyscy” albo „2 służby · 1 rola · 3 osoby”
    const plural = (n, a, b, c) => n + ' ' + (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c)
    function accessLabel(id) {
      const v = app.modules.value, parts = []
      const s = (v.only?.[id] || []).length, r = (v.ranks?.[id] || []).length, p = v.people?.[id] || 0
      if (s) parts.push(plural(s, 'służba', 'służby', 'służb'))
      if (r) parts.push(plural(r, 'rola', 'role', 'ról'))
      if (p) parts.push(plural(p, 'osoba', 'osoby', 'osób'))
      return parts.length ? parts.join(' · ') : 'Wszyscy'
    }
    async function run(key, fn) {
      st.busy = key; st.error = ''
      try { await fn(); return true } catch (e) { st.error = e.message; return false } finally { st.busy = '' }
    }
    const toggle = m => run(m.id, () => app.setModule(m.id, isOff(m.id)))

    // ---- okno dostępu ----
    async function openAccess(m) {
      const v = app.modules.value
      st.acc = { m, ministries: [...(v.only?.[m.id] || [])], roles: [...(v.ranks?.[m.id] || [])], emails: [], loading: true }
      st.peopleQ = ''
      try {
        if (!st.peopleLoaded) { st.modPeople = await app.api.call('modulePeople'); st.peopleLoaded = true }
        if (st.acc) st.acc.emails = st.modPeople.filter(x => x.module === m.id).map(x => x.email)
      } catch (e) { st.error = e.message } finally { if (st.acc) st.acc.loading = false }
    }
    const flip = (list, x) => { const i = list.indexOf(x); if (i < 0) list.push(x); else list.splice(i, 1) }
    const nameOf = e => active.value.find(p => p.email === e)?.name || st.modPeople.find(x => x.email === e)?.name || e
    const peopleHits = computed(() => {
      const q = st.peopleQ.trim().toLowerCase()
      if (!q || !st.acc) return []
      return active.value.filter(p => !st.acc.emails.includes(p.email) && ((p.name || '') + ' ' + p.email).toLowerCase().includes(q)).slice(0, 6)
    })
    const accEmpty = computed(() => st.acc && !st.acc.ministries.length && !st.acc.roles.length && !st.acc.emails.length)
    async function saveAccess() {
      const a = st.acc
      const done = await run('acc', () => app.setModuleAccess(a.m.id, { ministries: a.ministries, roles: a.roles, emails: a.emails }))
      if (done) {
        st.modPeople = [...st.modPeople.filter(x => x.module !== a.m.id), ...a.emails.map(e => ({ module: a.m.id, email: e, name: nameOf(e) }))]
        st.acc = null
      }
    }

    // ---- role ----
    const count = id => app.people.value.filter(p => p.status === 'active' && (p.roles || []).includes(id)).length
    const openRole = r => { st.role = r ? { id: r.id, name: r.name, builtin: r.builtin, edit: !!r.edit, council: !!r.council, protocols: !!r.protocols, approve: !!r.approve } : { id: '', name: '', builtin: false, edit: false, council: false, protocols: false, approve: false } }
    async function saveRole() { if (await run('role', () => app.saveRank(st.role))) st.role = null }
    async function removeRole() {
      const r = st.role, n = count(r.id)
      if (!(await ask(n ? `Rola „${r.name}” zniknie u ${plural(n, 'osoby', 'osób', 'osób')}. Uprawnienia z innych ról zostają.` : `Usunąć rolę „${r.name}”?`, { title: 'Usunąć rolę?', ok: 'Usuń', danger: true }))) return
      if (await run('role', () => app.deleteRank(r))) st.role = null
    }
    return { ...app, st, FLAGS, groups, onCount, isOff, ministries, roles, accessLabel, toggle, openAccess, flip, nameOf, peopleHits, accEmpty, saveAccess, count, openRole, saveRole, removeRole }
  },
})
</script>

<template>
  <div class="seg md-tabs" role="tablist" aria-label="Moduły i role">
    <button role="tab" :aria-selected="st.tab === 'mods'" :class="{ on: st.tab === 'mods' }" @click="st.tab = 'mods'">Moduły</button>
    <button role="tab" :aria-selected="st.tab === 'roles'" :class="{ on: st.tab === 'roles' }" @click="st.tab = 'roles'">Role</button>
  </div>
  <p v-if="st.error && !st.acc && !st.role" class="error">{{ st.error }}</p>

  <template v-if="st.tab === 'mods'">
    <p class="md-lead">Włączasz tylko to, czego kościół używa, i decydujesz, kto to widzi: wybrane służby, role albo konkretne osoby. Wyłączona część znika z menu, z dolnego paska i ze Startu, a dane zostają. Start, Osoby i Moduły działają zawsze. Administratorzy widzą wszystko, co włączone. <b>Włączonych: {{ onCount }} z {{ MODULES.length }}.</b></p>
    <section v-for="g in groups" :key="g.name" class="md-group">
      <h3 class="md-h">{{ g.name }}</h3>
      <div class="md-grid">
        <article v-for="m in g.list" :key="m.id" class="md-row" :class="{ on: !isOff(m.id) }">
          <span class="md-ic"><svg class="i"><use :href="'#' + m.icon"/></svg></span>
          <span class="md-txt">
            <b>{{ m.name }}</b>
            <small>{{ m.desc }}</small>
            <button class="md-acc" :class="{ limited: modLimited(m.id) }" :disabled="isOff(m.id)" :aria-label="'Kto widzi: ' + m.name + ' — ' + accessLabel(m.id)" @click="openAccess(m)">
              <svg class="i"><use :href="modLimited(m.id) ? '#eye' : '#users'"/></svg>{{ isOff(m.id) ? 'Wyłączony' : accessLabel(m.id) }}<svg class="i md-chev"><use href="#chev"/></svg>
            </button>
          </span>
          <button class="md-sw" role="switch" :aria-checked="!isOff(m.id)" :aria-label="(isOff(m.id) ? 'Włącz: ' : 'Wyłącz: ') + m.name" :disabled="st.busy === m.id" @click="toggle(m)"><i></i></button>
        </article>
      </div>
    </section>
  </template>

  <template v-else>
    <div class="md-rhead">
      <p class="md-lead">Role decydują, co kto może w aplikacji. Nadajesz je osobom w zakładce „Osoby”. Rolę „Administrator” zmienia się tylko w bazie, a wbudowanych ról nie można usunąć — aplikacja z nich korzysta.</p>
      <button class="primary" @click="openRole(null)"><svg class="i"><use href="#plus"/></svg>Nowa rola</button>
    </div>
    <div class="md-roles">
      <button v-for="r in roles" :key="r.id" class="md-role" @click="openRole(r)">
        <span class="md-rname"><b>{{ r.name }}</b><small>{{ count(r.id) ? count(r.id) + ' os.' : 'nikt' }}<template v-if="r.builtin"> · wbudowana</template></small></span>
        <span class="md-flags">
          <span v-for="f in FLAGS.filter(f => r[f.key])" :key="f.key" class="md-flag">{{ f.name }}</span>
          <span v-if="!FLAGS.some(f => r[f.key])" class="md-flag none">Bez dodatkowych uprawnień</span>
        </span>
        <svg class="i md-chev"><use href="#pencil"/></svg>
      </button>
    </div>
  </template>

  <!-- okno: kto widzi moduł -->
  <Teleport to="body">
    <div v-if="st.acc" class="np-overlay" @click.self="st.acc = null" @keydown.esc="st.acc = null">
      <div class="np-panel md-dlg" role="dialog" aria-modal="true" :aria-label="'Kto widzi: ' + st.acc.m.name">
        <div class="md-dhead"><b>Kto widzi: {{ st.acc.m.name }}</b><button class="icon" aria-label="Zamknij" @click="st.acc = null"><svg class="i"><use href="#x"/></svg></button></div>
        <p class="md-dnote">{{ accEmpty ? 'Teraz: wszyscy. Zaznacz służby, role albo osoby, żeby ograniczyć.' : 'Widzi każdy, kto spełnia choć jedno: należy do zaznaczonej służby, ma zaznaczoną rolę albo jest na liście osób.' }}</p>
        <div class="md-dbody">
          <h4>Służby</h4>
          <div class="md-chips">
            <button v-for="x in ministries" :key="x.id" class="filter" :class="{ on: st.acc.ministries.includes(x.id) }" :aria-pressed="st.acc.ministries.includes(x.id)" @click="flip(st.acc.ministries, x.id)">{{ x.name }}</button>
            <small v-if="!ministries.length" class="md-note">Wczytuję służby…</small>
          </div>
          <h4>Role</h4>
          <div class="md-chips">
            <button v-for="r in roles" :key="r.id" class="filter" :class="{ on: st.acc.roles.includes(r.id) }" :aria-pressed="st.acc.roles.includes(r.id)" @click="flip(st.acc.roles, r.id)">{{ r.name }}</button>
          </div>
          <h4>Osoby</h4>
          <div class="md-chips">
            <span v-for="e in st.acc.emails" :key="e" class="md-person">{{ nameOf(e) }}<button class="icon" :aria-label="'Usuń: ' + nameOf(e)" @click="flip(st.acc.emails, e)"><svg class="i"><use href="#x"/></svg></button></span>
            <small v-if="st.acc.loading" class="md-note">Wczytuję…</small>
          </div>
          <div class="md-search">
            <input v-model="st.peopleQ" placeholder="Dodaj osobę — wpisz imię albo adres" aria-label="Szukaj osoby" autocomplete="off">
            <div v-if="peopleHits.length" class="md-hits">
              <button v-for="p in peopleHits" :key="p.email" @click="st.acc.emails.push(p.email); st.peopleQ = ''"><b>{{ p.name || p.email }}</b><small>{{ p.email }}</small></button>
            </div>
          </div>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="md-dfoot">
          <button :disabled="accEmpty" @click="st.acc.ministries = []; st.acc.roles = []; st.acc.emails = []">Wszyscy</button>
          <span></span>
          <button @click="st.acc = null">Anuluj</button>
          <button class="primary" :disabled="st.busy === 'acc' || st.acc.loading" @click="saveAccess">Zapisz</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- okno: rola -->
  <Teleport to="body">
    <div v-if="st.role" class="np-overlay" @click.self="st.role = null" @keydown.esc="st.role = null">
      <div class="np-panel md-dlg" role="dialog" aria-modal="true" :aria-label="st.role.id ? 'Rola: ' + st.role.name : 'Nowa rola'">
        <div class="md-dhead"><b>{{ st.role.id ? 'Rola' : 'Nowa rola' }}</b><button class="icon" aria-label="Zamknij" @click="st.role = null"><svg class="i"><use href="#x"/></svg></button></div>
        <div class="md-dbody">
          <label class="md-field">Nazwa<input v-model="st.role.name" placeholder="np. Młodzieżówka" maxlength="60" autocomplete="off" @keydown.enter="st.role.name.trim() && saveRole()"></label>
          <h4>Uprawnienia</h4>
          <label v-for="f in FLAGS" :key="f.key" class="md-check"><input v-model="st.role[f.key]" type="checkbox"><span><b>{{ f.name }}</b><small>{{ f.desc }}</small></span></label>
          <p class="md-note">Role bez uprawnień też się przydają: można do nich przypisać moduły, wysłać wiadomość albo filtrować osoby.</p>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="md-dfoot">
          <button v-if="st.role.id && !st.role.builtin" class="danger" :disabled="st.busy === 'role'" @click="removeRole"><svg class="i"><use href="#trash"/></svg>Usuń</button>
          <span></span>
          <button @click="st.role = null">Anuluj</button>
          <button class="primary" :disabled="st.busy === 'role' || !st.role.name.trim()" @click="saveRole">Zapisz</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.md-tabs { max-width: 320px; }
.md-lead { margin: 0 0 16px; color: var(--muted); font-size: 15px; line-height: 1.5; max-width: 72ch; }
.md-lead b { color: var(--text); font-weight: 600; }
.md-group { margin-bottom: 20px; }
.md-h { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--muted); }
/* równe kafelki: stała wysokość wiersza w siatce, opis w dwóch linijkach, dostęp zawsze w tym samym miejscu */
.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
.md-row { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: start; padding: 14px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); transition: border-color .2s, background-color .2s; }
.md-row.on { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.md-ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--panel2); color: var(--muted); transition: background-color .2s, color .2s; }
.md-row.on .md-ic { background: var(--accent); color: #2a1906; }
.md-ic svg.i { width: 20px; height: 20px; }
.md-txt { min-width: 0; display: flex; flex-direction: column; gap: 3px; height: 100%; }
.md-txt b { font-size: 15px; font-weight: 600; line-height: 1.3; }
.md-txt small { color: var(--muted); font-size: 12.5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.8em; }
.md-acc { align-self: flex-start; margin-top: auto; display: inline-flex; align-items: center; gap: 6px; min-height: 30px !important; padding: 0 8px 0 10px !important; border: 0 !important; border-radius: 999px !important; background: var(--panel2) !important; color: var(--muted) !important; font-size: 12.5px; font-weight: 500 !important; white-space: nowrap; max-width: 100%; }
.md-acc svg.i { width: 14px; height: 14px; flex: none; }
.md-acc.limited { color: var(--accent-text) !important; background: color-mix(in srgb, var(--accent) 14%, var(--panel2)) !important; }
.md-acc:disabled { opacity: .6; }
@media (hover: hover) { .md-acc:hover:not(:disabled) { background: var(--panel3) !important; color: var(--text) !important; } }
.md-sw { position: relative; width: 44px !important; height: 26px; min-height: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 999px !important; background: var(--panel3) !important; transition: background-color .2s; }
.md-sw i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .2s; }
.md-row.on .md-sw { background: var(--ok) !important; }
.md-row.on .md-sw i { transform: translateX(18px); }
.md-chev { width: 14px; height: 14px; color: var(--muted); }

.md-rhead { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; margin-bottom: 4px; }
.md-rhead .md-lead { flex: 1 1 420px; }
.md-rhead > button { flex: none; }
.md-roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
.md-role { display: grid !important; grid-template-columns: 1fr auto; grid-template-rows: auto 1fr; gap: 8px 12px; align-items: start; justify-content: stretch !important; padding: 14px !important; min-height: 0 !important; border-radius: 18px !important; background: var(--panel) !important; border: 1px solid var(--line) !important; text-align: left; color: var(--text) !important; font-weight: 400 !important; box-shadow: none !important; }
@media (hover: hover) { .md-role:hover { border-color: color-mix(in srgb, var(--accent) 45%, transparent) !important; } }
.md-rname { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.md-rname b { font-size: 15px; font-weight: 600; }
.md-rname small { color: var(--muted); font-size: 12.5px; }
.md-role .md-chev { grid-column: 2; grid-row: 1; }
.md-flags { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-self: end; }
.md-flag { padding: 3px 9px; border-radius: 999px; background: var(--panel2); font-size: 12px; color: var(--text); }
.md-flag.none { color: var(--muted); }

.md-dlg { gap: 10px; }
.md-dhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.md-dhead b { font-size: 17px; }
.md-dnote { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.45; }
.md-dbody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
.md-dbody h4 { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.md-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.md-chips .filter { border: 1px solid var(--line) !important; color: var(--text) !important; background: transparent !important; }
.md-chips .filter.on { background: var(--accent) !important; border-color: var(--accent) !important; color: #2a1906 !important; font-weight: 600; }
@media (hover: hover) { .md-chips .filter:not(.on):hover { background: var(--panel2) !important; } }
.md-note { color: var(--muted); font-size: 12.5px; line-height: 1.4; margin: 0; }
.md-person { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 12px; min-height: 32px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 16%, var(--panel2)); font-size: 13px; }
.md-person .icon { width: 28px !important; height: 28px !important; min-height: 0 !important; padding: 0 !important; }
.md-person svg.i { width: 14px; height: 14px; }
.md-search { position: relative; }
.md-search input { width: 100%; }
.md-hits { display: flex; flex-direction: column; margin-top: 4px; border-radius: 12px; background: var(--panel2); overflow: hidden; }
.md-hits button { display: flex !important; flex-direction: column; align-items: flex-start !important; gap: 0; padding: 8px 12px !important; border: 0 !important; border-radius: 0 !important; background: none !important; color: var(--text) !important; font-weight: 400 !important; text-align: left; min-height: 0 !important; }
.md-hits button small { color: var(--muted); font-size: 12px; }
@media (hover: hover) { .md-hits button:hover { background: var(--panel3) !important; } }
.md-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
.md-check { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 12px; background: var(--panel2); cursor: pointer; }
.md-check input { margin-top: 3px; accent-color: var(--accent); width: 18px; height: 18px; flex: none; }
.md-check span { display: flex; flex-direction: column; gap: 1px; }
.md-check b { font-size: 14px; font-weight: 600; }
.md-check small { color: var(--muted); font-size: 12.5px; }
.md-dfoot { display: flex; gap: 8px; align-items: center; padding-top: 4px; }
.md-dfoot > span { flex: 1; }
</style>

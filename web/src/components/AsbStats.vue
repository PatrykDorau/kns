<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Statystyki ASB (dawniej arkusz „ASB | Statystyki”, zakładka „Dashboard Poznań”): większe wydarzenia z frekwencją
// i jakością danych, nowe osoby, źródła dotarcia, koszty w kategoriach i reklamy Meta. Zasady z arkusza:
// obecności to uczestnictwa (nie różne osoby), zapisy ≠ obecność, pusta kwota = koszt nieznany (nie 0 zł),
// brak frekwencji ≠ 0 osób, reakcja na reklamę ≠ przyjście. Okres: rok akademicki od września.
const COSTS = [
  { key: 'cost_room', name: 'Sala / wynajem' }, { key: 'cost_posters', name: 'Plakaty' }, { key: 'cost_flyers', name: 'Ulotki' },
  { key: 'cost_food', name: 'Jedzenie' }, { key: 'cost_transport', name: 'Transport' }, { key: 'cost_decor', name: 'Dekoracje' },
  { key: 'cost_other', name: 'Pozostałe' }, { key: 'cost_promo', name: 'Promocja poza Meta' },
]
const SRC = [
  { key: 'src_friends', name: 'Znajomi' }, { key: 'src_social', name: 'Social media' }, { key: 'src_posters', name: 'Plakaty' },
  { key: 'src_regular', name: 'Stali / bywalcy' }, { key: 'src_other', name: 'Inne' },
]
const QUALITY = { potwierdzona: 'Potwierdzona', szacunek: 'Szacunek', brak: 'Brak danych' }
const COST_ST = { pelne: 'Pełne', czesciowe: 'Częściowe', nieznane: 'Nieznane' }
const BASIS = { zapisy: 'Formularz zapisów', ankieta: 'Ankieta obecnych', relacja: 'Relacja organizatorów', '': 'Brak' }
const GOALS = { reakcje: 'Reakcje na wydarzenie', rozmowy: 'Rozpoczęte rozmowy', aktywnosc: 'Aktywność posta', polubienia: 'Polubienia strony', inne: 'Inny cel' }
const NUM_EV = ['signups', 'attendance', 'att_min', 'att_max', 'new_people', ...SRC.map(s => s.key)]
const NUM_AD = ['impressions', 'reach', 'results', 'link_clicks', 'activity']

export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ busy: false, error: '', events: [], ads: [], cities: [], city: 'Poznań', season: '', tab: 'sum', ev: null, ad: null, cfg: null, saving: false })
    async function load() {
      st.busy = true; st.error = ''
      try {
        const r = await app.api.call('asbStats')
        st.events = r.events; st.ads = r.ads; st.cities = r.cities
        const cs = cityList.value
        if (!cs.includes(st.city)) st.city = cs[0] || 'Poznań'
      } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    onMounted(load)
    const cityList = computed(() => [...new Set([...st.events.map(e => e.city), ...st.cities.map(c => c.id)])].filter(Boolean).sort())
    const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 9 ? y + '/' + (y + 1) : (y - 1) + '/' + y }
    const seasons = computed(() => [...new Set(st.events.filter(e => e.city === st.city && e.date).map(e => seasonOf(e.date)))].sort().reverse())
    const inPeriod = d => !st.season || (d && seasonOf(d) === st.season)
    const events = computed(() => st.events.filter(e => e.city === st.city && inPeriod(e.date)).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
    const evById = computed(() => Object.fromEntries(st.events.map(e => [e.id, e])))
    const ads = computed(() => st.ads.filter(a => a.city === st.city && inPeriod(evById.value[a.event_id]?.date || a.date)))
    const cfg = computed(() => st.cities.find(c => c.id === st.city) || { id: st.city, regular_goal: 50, actions: [] })

    // ---- liczenie ----
    const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
    const metaOf = e => sum(st.ads.filter(a => a.event_id === e.id), a => a.spent)
    const hasMeta = e => st.ads.some(a => a.event_id === e.id && a.spent != null)
    // znany koszt wydarzenia: kategorie + Meta; „nieznane” bez żadnej kwoty — brak liczby (nie 0 zł)
    const evCost = e => {
      const known = COSTS.filter(c => e[c.key] != null)
      if (!known.length && !hasMeta(e) && e.cost_status === 'nieznane') return null
      if (!known.length && !hasMeta(e)) return null
      return sum(known, c => e[c.key]) + metaOf(e)
    }
    const attLo = e => (e.attendance ?? e.att_min ?? null)
    const attHi = e => (e.attendance ?? e.att_max ?? e.att_min ?? null)
    const perHead = e => { const c = evCost(e), a = e.attendance; return c != null && a && e.cost_status !== 'nieznane' ? c / a : null }
    const pln = v => v == null ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
    const int = v => v == null ? '—' : Number(v).toLocaleString('pl-PL')
    const pct = v => (v * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%'
    const range = (lo, hi) => (lo === hi ? int(lo) : '~' + int(lo) + '–' + int(hi))
    const dmy = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : 'bez daty'

    const kpi = computed(() => {
      const ev = events.value, ad = ads.value
      const unassigned = ad.filter(a => !a.event_id || !evById.value[a.event_id])
      const meta = sum(ad, a => a.spent)
      const known = sum(ev, e => evCost(e)) + sum(unassigned, a => a.spent)
      const promo = meta + sum(ev, e => (e.cost_posters || 0) + (e.cost_flyers || 0) + (e.cost_promo || 0))
      const withAtt = ev.filter(e => attLo(e) != null)
      const lo = sum(withAtt, attLo), hi = sum(withAtt, attHi)
      const imp = sum(ad, a => a.impressions), clicks = sum(ad, a => a.link_clicks)
      const react = ad.filter(a => a.goal === 'reakcje' && a.results)
      const reactN = sum(react, a => a.results), reactSpent = sum(react, a => a.spent)
      return {
        n: ev.length, noAtt: ev.length - withAtt.length, lo, hi, known, promo, meta, newPeople: sum(ev, e => e.new_people),
        imp, clicks, ctr: imp ? clicks / imp : null, cpc: clicks ? meta / clicks : null, cpm: imp ? meta / imp * 1000 : null,
        reactN, reactCost: reactN ? reactSpent / reactN : null,
      }
    })
    // źródła: deklaracje z formularzy zapisów (jeśli są w okresie) — inaczej wszystkie
    const srcEvents = computed(() => { const z = events.value.filter(e => e.src_basis === 'zapisy' && SRC.some(s => e[s.key] != null)); return z.length ? z : events.value })
    const sources = computed(() => SRC.map(s => ({ ...s, n: sum(events.value, e => e[s.key]) })))
    const regular = computed(() => {
      // mianownik: każdy zapis to jedna deklaracja (także bez podanego źródła) — jak w arkuszu (52 z 84)
      const list = srcEvents.value, all = sum(list, e => Math.max(SRC.reduce((t, s) => t + (e[s.key] || 0), 0), e.src_basis === 'zapisy' ? e.signups || 0 : 0)), reg = sum(list, e => e.src_regular)
      const basis = list.length && list.every(e => e.src_basis === 'zapisy') ? 'w zapisach' : 'we wszystkich deklaracjach'
      return { all, reg, share: all ? reg / all : null, goal: (cfg.value.regular_goal ?? 50) / 100, basis }
    })
    const costCats = computed(() => {
      const ev = events.value, rows = [{ name: 'Reklamy Meta', v: kpi.value.meta }]
      for (const c of COSTS) rows.push({ name: c.name, v: sum(ev, e => e[c.key]) })
      return rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v)
    })
    const short = n => (n.length > 34 ? n.slice(0, 32) + '…' : n)
    const attRows = computed(() => events.value.map(e => ({ e, lo: attLo(e), hi: attHi(e), su: e.signups })))
    const attMax = computed(() => Math.max(1, ...attRows.value.map(r => Math.max(r.hi || 0, r.su || 0))))
    const headRows = computed(() => events.value.map(e => ({ e, v: perHead(e) })).filter(r => r.v != null))
    const headMax = computed(() => Math.max(1, ...headRows.value.map(r => r.v)))
    const ranking = computed(() => ads.value.filter(a => a.goal === 'reakcje' && a.results && a.spent != null).map(a => ({ a, v: a.spent / a.results })).sort((x, y) => x.v - y.v))
    const max = list => Math.max(1, ...list.map(r => r.v ?? r.n ?? 0))
    const w = (v, m) => (v ? Math.max(1.5, (v / m) * 100) : 0) + '%'

    // ---- edycja ----
    const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const blankEv = () => ({ id: '', city: st.city, date: '', name: '', kind: 'Ewangelizacja', place: '', signups: null, attendance: null, att_min: null, att_max: null, quality: 'potwierdzona', new_people: null, src_basis: 'zapisy', cost_status: 'czesciowe', note: '', ...Object.fromEntries([...SRC, ...COSTS].map(x => [x.key, null])) })
    const openEv = e => { st.ev = { ...(e || blankEv()) }; st.error = '' }
    const blankAd = () => ({ id: '', city: st.city, event_id: null, date: '', name: '', goal: 'reakcje', spent: null, impressions: null, reach: null, results: null, link_clicks: null, activity: null, note: '' })
    const openAd = a => { st.ad = { ...(a || blankAd()) }; st.error = '' }
    const toNum = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
    async function save(kind) {
      const isEv = kind === 'ev', row = { ...(isEv ? st.ev : st.ad) }
      if (!row.name.trim()) { st.error = 'Podaj nazwę.'; return }
      for (const k of isEv ? [...NUM_EV, ...COSTS.map(c => c.key)] : [...NUM_AD, 'spent']) row[k] = toNum(row[k])
      row.date = row.date || null
      if (!row.id) row.id = uid(isEv ? 'E' : 'AD')
      if (!isEv && !row.event_id) row.event_id = null
      st.saving = true; st.error = ''
      try {
        await app.api.call(isEv ? 'asbStatSave' : 'asbAdSave', row)
        const list = isEv ? st.events : st.ads, i = list.findIndex(x => x.id === row.id)
        if (i >= 0) list.splice(i, 1, row); else list.push(row)
        if (isEv) st.ev = null; else st.ad = null
      } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    async function remove(kind) {
      const isEv = kind === 'ev', row = isEv ? st.ev : st.ad
      const n = isEv ? st.ads.filter(a => a.event_id === row.id).length : 0
      if (!(await ask(isEv ? `Wydarzenie „${row.name}” zniknie ze statystyk.${n ? ' Reklamy zostaną, bez przypisania.' : ''}` : `Reklama „${row.name}” zniknie ze statystyk.`, { title: 'Usunąć?', ok: 'Usuń', danger: true }))) return
      st.saving = true
      try {
        await app.api.call(isEv ? 'asbStatDelete' : 'asbAdDelete', { id: row.id })
        if (isEv) { st.events = st.events.filter(x => x.id !== row.id); st.ads.forEach(a => { if (a.event_id === row.id) a.event_id = null }); st.ev = null }
        else { st.ads = st.ads.filter(x => x.id !== row.id); st.ad = null }
      } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    const openCfg = () => { st.cfg = { id: st.city, regular_goal: cfg.value.regular_goal ?? 50, actions: (cfg.value.actions || []).map(a => ({ ...a })) } }
    async function saveCfg() {
      const c = { ...st.cfg, regular_goal: Math.min(100, Math.max(0, Number(st.cfg.regular_goal) || 0)), actions: st.cfg.actions.filter(a => (a.title || '').trim() || (a.text || '').trim()) }
      st.saving = true; st.error = ''
      try {
        await app.api.call('asbCitySave', c)
        const i = st.cities.findIndex(x => x.id === c.id)
        if (i >= 0) st.cities.splice(i, 1, c); else st.cities.push(c)
        st.cfg = null
      } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    const moveAct = (i, d) => { const a = st.cfg.actions, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]] }
    const newCity = () => { const n = prompt('Nazwa miasta (np. Gdańsk)'); if (n?.trim()) { st.city = n.trim(); st.season = '' } }
    const evOptions = computed(() => st.events.filter(e => e.city === st.city).sort((a, b) => (b.date || '').localeCompare(a.date || '')))

    return { ...app, st, COSTS, SRC, QUALITY, COST_ST, BASIS, GOALS, load, cityList, seasons, events, ads, cfg, kpi, sources, regular, costCats, attRows, attMax, headRows, headMax, ranking, max, w, short,
      evCost, perHead, metaOf, attLo, attHi, pln, int, pct, range, dmy, openEv, openAd, save, remove, openCfg, saveCfg, moveAct, newCity, evOptions, evById }
  },
})
</script>

<template>
  <div class="as-bar">
    <div class="as-chips" role="group" aria-label="Okres">
      <button class="filter" :class="{ on: !st.season }" @click="st.season = ''">Cały okres</button>
      <button v-for="s in seasons" :key="s" class="filter" :class="{ on: st.season === s }" @click="st.season = s">{{ s }}</button>
    </div>
    <div class="as-chips" role="group" aria-label="Miasto">
      <button v-for="c in cityList" :key="c" class="filter" :class="{ on: st.city === c }" @click="st.city = c; st.season = ''">{{ c }}</button>
      <button class="filter" title="Dodaj miasto" aria-label="Dodaj miasto" @click="newCity"><svg class="i"><use href="#plus"/></svg></button>
    </div>
  </div>
  <div class="seg as-tabs" role="tablist" aria-label="Statystyki">
    <button v-for="t in [['sum', 'Podsumowanie'], ['events', 'Wydarzenia'], ['ads', 'Reklamy'], ['acts', 'Działania']]" :key="t[0]" role="tab" :aria-selected="st.tab === t[0]" :class="{ on: st.tab === t[0] }" @click="st.tab = t[0]">{{ t[1] }}</button>
  </div>
  <div v-if="st.busy && !st.events.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 5" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="st.error && !st.ev && !st.ad && !st.cfg" class="error">{{ st.error }}</p>

  <!-- ===== podsumowanie ===== -->
  <template v-else-if="st.tab === 'sum'">
    <p v-if="!events.length" class="note">Brak wydarzeń w tym okresie. Dodaj pierwsze w zakładce „Wydarzenia”.</p>
    <template v-else>
      <div class="as-kpis">
        <div class="as-kpi"><small>Większe wydarzenia</small><b>{{ kpi.n }}</b><span>okazje do głoszenia i relacji</span></div>
        <div class="as-kpi"><small>Obecności</small><b>{{ range(kpi.lo, kpi.hi) }}</b><span>uczestnictwa, nie różne osoby<template v-if="kpi.noAtt"> · {{ kpi.noAtt }} bez liczby</template></span></div>
        <div class="as-kpi"><small>Znane wydatki</small><b>{{ pln(kpi.known) }}</b><span>z rejestru — nie cała służba ASB</span></div>
        <div class="as-kpi"><small>Promocja</small><b>{{ pln(kpi.promo) }}</b><span>Meta, druk i inna promocja</span></div>
      </div>

      <div class="as-grid">
        <section class="as-card as-wide">
          <h3>Ile osób uczestniczyło?</h3>
          <p class="as-sub">Obecni na tle zapisów. Kreskowany pasek — przedział, gdy nie ma dokładnej liczby.</p>
          <div class="as-legend"><span><i class="k-att"></i>Obecni</span><span><i class="k-su"></i>Zapisy</span></div>
          <div class="as-bars">
            <div v-for="r in attRows" :key="r.e.id" class="as-brow" :title="r.e.name + ' · ' + dmy(r.e.date) + ' · obecni ' + (r.lo == null ? 'brak danych' : range(r.lo, r.hi)) + (r.su != null ? ' · zapisy ' + r.su : '') + ' · ' + QUALITY[r.e.quality]">
              <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }} · {{ QUALITY[r.e.quality] }}</small></span>
              <span class="as-track">
                <i v-if="r.su" class="as-su" :style="{ width: w(r.su, attMax) }"></i>
                <i v-if="r.lo != null" class="as-att" :class="{ est: r.e.quality !== 'potwierdzona', rng: r.lo !== r.hi }" :style="{ width: w(r.hi, attMax) }"></i>
              </span>
              <span class="as-val">{{ r.lo == null ? '—' : range(r.lo, r.hi) }}</span>
            </div>
          </div>
        </section>

        <section class="as-card">
          <h3>Na co przeznaczyliśmy środki?</h3>
          <p class="as-sub">Znane koszty wydarzeń według kategorii. Brak kwoty nie oznacza zera.</p>
          <div class="as-bars">
            <div v-for="c in costCats" :key="c.name" class="as-brow" :title="c.name + ': ' + pln(c.v)">
              <span class="as-lab"><b>{{ c.name }}</b></span>
              <span class="as-track"><i class="as-att" :style="{ width: w(c.v, max(costCats)) }"></i></span>
              <span class="as-val">{{ pln(c.v) }}</span>
            </div>
          </div>
        </section>

        <section class="as-card">
          <h3>Skąd przychodzą ludzie?</h3>
          <p class="as-sub">Deklarowane źródła z zapisów, ankiet i relacji — wskazanie kanału nie dowodzi, że to on przyprowadził.</p>
          <div class="as-bars">
            <div v-for="s in sources" :key="s.key" class="as-brow" :title="s.name + ': ' + s.n">
              <span class="as-lab"><b>{{ s.name }}</b></span>
              <span class="as-track"><i class="as-att" :class="{ muted: s.key === 'src_regular' }" :style="{ width: w(s.n, max(sources)) }"></i></span>
              <span class="as-val">{{ int(s.n) }}</span>
            </div>
          </div>
          <div v-if="regular.share != null" class="as-goal" :class="{ ok: regular.share <= regular.goal }">
            <div class="as-goal-top"><b>{{ pct(regular.share) }}</b><span>stali/bywalcy {{ regular.basis }} · {{ regular.reg }} z {{ regular.all }}</span></div>
            <div class="as-goal-track"><i :style="{ width: Math.min(100, regular.share * 100) + '%' }"></i><em :style="{ left: regular.goal * 100 + '%' }" :title="'Cel: najwyżej ' + pct(regular.goal)"></em></div>
            <small>Cel: najwyżej {{ pct(regular.goal) }}<template v-if="regular.share > regular.goal"> · brakuje {{ ((regular.share - regular.goal) * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) }} p.p.</template><template v-else> · osiągnięty</template></small>
          </div>
        </section>

        <section class="as-card">
          <h3>Koszt na jedną obecność</h3>
          <p class="as-sub">Znany koszt ÷ obecni. Porównanie wydatków, nie wartości spotkania ani człowieka.</p>
          <p v-if="!headRows.length" class="note">Brak wydarzeń z kosztem i frekwencją.</p>
          <div class="as-bars">
            <div v-for="r in headRows" :key="r.e.id" class="as-brow" :title="r.e.name + ': ' + pln(evCost(r.e)) + ' / ' + r.e.attendance + ' os.'">
              <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }}</small></span>
              <span class="as-track"><i class="as-att" :class="{ est: r.e.quality !== 'potwierdzona' }" :style="{ width: w(r.v, headMax) }"></i></span>
              <span class="as-val">{{ pln(r.v) }}</span>
            </div>
          </div>
        </section>

        <section class="as-card">
          <h3>Jak docieramy do studentów?</h3>
          <p class="as-sub">Cztery osobne miary reklam Meta — nie jedna ścieżka tych samych osób.</p>
          <div class="as-mini">
            <div><small>Wyświetlenia</small><b>{{ int(kpi.imp) }}</b></div>
            <div><small>Kliknięcia linków</small><b>{{ int(kpi.clicks) }}</b></div>
            <div><small>Kliknięcia / wyświetlenia</small><b>{{ kpi.ctr == null ? '—' : (kpi.ctr * 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + '%' }}</b></div>
            <div><small>Koszt kliknięcia</small><b>{{ pln(kpi.cpc) }}</b></div>
            <div><small>Koszt 1000 wyświetleń</small><b>{{ pln(kpi.cpm) }}</b></div>
            <div><small>Reakcje na wydarzenia</small><b>{{ int(kpi.reactN) }}<template v-if="kpi.reactCost != null"> · {{ pln(kpi.reactCost) }}</template></b></div>
          </div>
        </section>

        <section class="as-card">
          <h3>Ranking kampanii Meta</h3>
          <p class="as-sub">Koszt jednej reakcji na wydarzenie — niżej taniej. Reakcja to nie przyjście.</p>
          <p v-if="!ranking.length" class="note">Brak kampanii z celem „reakcje na wydarzenie”.</p>
          <ol class="as-rank">
            <li v-for="(r, i) in ranking" :key="r.a.id" :title="r.a.name + ' · ' + r.a.results + ' reakcji · ' + pln(r.a.spent)"><span>{{ i + 1 }}.</span><b>{{ short(evById[r.a.event_id]?.name || r.a.name) }}</b><em>{{ pln(r.v) }}</em></li>
          </ol>
        </section>
      </div>

      <section v-if="(cfg.actions || []).length" class="as-card as-acts-view">
        <h3>Co zmienić, by lepiej służyć?</h3>
        <ol><li v-for="(a, i) in cfg.actions" :key="i"><b>{{ a.title }}</b><span v-if="a.text">{{ a.text }}</span></li></ol>
      </section>
      <p class="as-meth">Obecności to uczestnictwa, nie liczba różnych osób ani potwierdzonych wysłuchań Ewangelii. Zapisy to nie obecność. Pusta kwota — koszt nieznany, pusta frekwencja — brak danych. Nowe osoby: {{ int(kpi.newPeople) }} rozpoznanych uczestnictw.</p>
    </template>
  </template>

  <!-- ===== wydarzenia ===== -->
  <template v-else-if="st.tab === 'events'">
    <div class="as-head"><p class="as-sub">Większe wydarzenia (np. ewangelizacyjne). Zwykłych cotygodniowych spotkań tu nie wpisujemy.</p><button class="primary" @click="openEv(null)"><svg class="i"><use href="#plus"/></svg>Wydarzenie</button></div>
    <p v-if="!events.length" class="note">Brak wydarzeń w tym okresie.</p>
    <div class="as-list">
      <button v-for="e in [...events].reverse()" :key="e.id" class="as-item" @click="openEv(e)">
        <span class="as-date">{{ dmy(e.date) }}</span>
        <span class="as-main"><b>{{ e.name }}</b><small>{{ [e.place, e.kind].filter(Boolean).join(' · ') }}</small></span>
        <span class="as-nums">
          <span><small>Obecni</small><b>{{ attLo(e) == null ? '—' : range(attLo(e), attHi(e)) }}</b><i :class="'q-' + e.quality">{{ QUALITY[e.quality] }}</i></span>
          <span><small>Koszt</small><b>{{ pln(evCost(e)) }}</b><i>{{ perHead(e) != null ? pln(perHead(e)) + '/os.' : COST_ST[e.cost_status] }}</i></span>
        </span>
      </button>
    </div>
  </template>

  <!-- ===== reklamy ===== -->
  <template v-else-if="st.tab === 'ads'">
    <div class="as-head"><p class="as-sub">Jedna reklama Meta = jeden wpis. Przepisuj faktyczny wydatek, nie planowany budżet.</p><button class="primary" @click="openAd(null)"><svg class="i"><use href="#plus"/></svg>Reklama</button></div>
    <p v-if="!ads.length" class="note">Brak reklam w tym okresie.</p>
    <div class="as-list">
      <button v-for="a in [...ads].reverse()" :key="a.id" class="as-item" @click="openAd(a)">
        <span class="as-date">{{ dmy(a.date) }}</span>
        <span class="as-main"><b>{{ a.name }}</b><small>{{ GOALS[a.goal] }}<template v-if="evById[a.event_id]"> · {{ evById[a.event_id].name }}</template></small></span>
        <span class="as-nums">
          <span><small>Wydano</small><b>{{ pln(a.spent) }}</b><i>{{ int(a.impressions) }} wyśw.</i></span>
          <span><small>Wynik</small><b>{{ int(a.results) }}</b><i>{{ a.results && a.spent != null ? pln(a.spent / a.results) + '/wynik' : int(a.link_clicks) + ' klik.' }}</i></span>
        </span>
      </button>
    </div>
  </template>

  <!-- ===== działania ===== -->
  <template v-else>
    <div class="as-head"><p class="as-sub">Cel udziału stałych bywalców w zapisach i działania na kolejne wydarzenia — widać je w podsumowaniu.</p><button class="primary" @click="openCfg"><svg class="i"><use href="#pencil"/></svg>Zmień</button></div>
    <section class="as-card">
      <h3>Cel: najwyżej {{ cfg.regular_goal ?? 50 }}% stałych/bywalców w zapisach</h3>
      <p class="as-sub">Reszta deklaracji (znajomi, social media, plakaty, inne) — co najmniej {{ 100 - (cfg.regular_goal ?? 50) }}%. To struktura zapisów, nie odsetek nowych osób.</p>
    </section>
    <section class="as-card as-acts-view">
      <h3>Działania</h3>
      <p v-if="!(cfg.actions || []).length" class="note">Jeszcze nic — dopisz wnioski po ostatnich wydarzeniach.</p>
      <ol><li v-for="(a, i) in cfg.actions" :key="i"><b>{{ a.title }}</b><span v-if="a.text">{{ a.text }}</span></li></ol>
    </section>
  </template>

  <!-- ===== okno: wydarzenie ===== -->
  <Teleport to="body">
    <div v-if="st.ev" class="np-overlay" @click.self="st.ev = null" @keydown.esc="st.ev = null">
      <div class="np-panel as-dlg" role="dialog" aria-modal="true" :aria-label="st.ev.id ? 'Wydarzenie' : 'Nowe wydarzenie'">
        <div class="as-dhead"><b>{{ st.ev.id ? 'Wydarzenie' : 'Nowe wydarzenie' }}</b><button class="icon" aria-label="Zamknij" @click="st.ev = null"><svg class="i"><use href="#x"/></svg></button></div>
        <div class="as-dbody">
          <label class="as-f wide">Nazwa<input v-model="st.ev.name" maxlength="140" autocomplete="off"></label>
          <label class="as-f">Data<input v-model="st.ev.date" type="date"></label>
          <label class="as-f">Miejsce<input v-model="st.ev.place" maxlength="80" autocomplete="off"></label>
          <label class="as-f">Rodzaj<input v-model="st.ev.kind" maxlength="40" autocomplete="off"></label>
          <h4>Frekwencja</h4>
          <label class="as-f">Zapisy<input v-model="st.ev.signups" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Obecni<input v-model="st.ev.attendance" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Jakość<select v-model="st.ev.quality"><option v-for="(v, k) in QUALITY" :key="k" :value="k">{{ v }}</option></select></label>
          <label class="as-f">Nowe osoby<input v-model="st.ev.new_people" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Gdy brak liczby: od<input v-model="st.ev.att_min" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">do<input v-model="st.ev.att_max" type="number" min="0" inputmode="numeric"></label>
          <h4>Źródła dotarcia (deklaracje)</h4>
          <label v-for="s in SRC" :key="s.key" class="as-f">{{ s.name }}<input v-model="st.ev[s.key]" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Skąd dane<select v-model="st.ev.src_basis"><option v-for="(v, k) in BASIS" :key="k" :value="k">{{ v }}</option></select></label>
          <h4>Koszty [zł] — puste = nieznane, nie 0</h4>
          <label v-for="c in COSTS" :key="c.key" class="as-f">{{ c.name }}<input v-model="st.ev[c.key]" type="number" min="0" step="0.01" inputmode="decimal"></label>
          <label class="as-f">Kompletność<select v-model="st.ev.cost_status"><option v-for="(v, k) in COST_ST" :key="k" :value="k">{{ v }}</option></select></label>
          <p v-if="st.ev.id && metaOf(st.ev)" class="as-sub wide">Reklamy Meta przypisane do wydarzenia: {{ pln(metaOf(st.ev)) }} — doliczane same, nie wpisuj ich tutaj.</p>
          <label class="as-f wide">Uwagi<textarea v-model="st.ev.note" rows="3" maxlength="2000"></textarea></label>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="as-dfoot">
          <button v-if="st.ev.id && evById[st.ev.id]" class="danger" :disabled="st.saving" @click="remove('ev')"><svg class="i"><use href="#trash"/></svg>Usuń</button>
          <span></span>
          <button @click="st.ev = null">Anuluj</button>
          <button class="primary" :disabled="st.saving || !st.ev.name.trim()" @click="save('ev')">Zapisz</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ===== okno: reklama ===== -->
  <Teleport to="body">
    <div v-if="st.ad" class="np-overlay" @click.self="st.ad = null" @keydown.esc="st.ad = null">
      <div class="np-panel as-dlg" role="dialog" aria-modal="true" :aria-label="st.ad.id ? 'Reklama' : 'Nowa reklama'">
        <div class="as-dhead"><b>{{ st.ad.id ? 'Reklama Meta' : 'Nowa reklama Meta' }}</b><button class="icon" aria-label="Zamknij" @click="st.ad = null"><svg class="i"><use href="#x"/></svg></button></div>
        <div class="as-dbody">
          <label class="as-f wide">Nazwa<input v-model="st.ad.name" maxlength="140" autocomplete="off"></label>
          <label class="as-f">Data uruchomienia<input v-model="st.ad.date" type="date"></label>
          <label class="as-f">Cel kampanii<select v-model="st.ad.goal"><option v-for="(v, k) in GOALS" :key="k" :value="k">{{ v }}</option></select></label>
          <label class="as-f wide">Wydarzenie<select v-model="st.ad.event_id"><option :value="null">— bez przypisania —</option><option v-for="e in evOptions" :key="e.id" :value="e.id">{{ dmy(e.date) }} · {{ e.name }}</option></select></label>
          <label class="as-f">Wydano [zł]<input v-model="st.ad.spent" type="number" min="0" step="0.01" inputmode="decimal"></label>
          <label class="as-f">Wynik (wg celu)<input v-model="st.ad.results" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Wyświetlenia<input v-model="st.ad.impressions" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Zasięg<input v-model="st.ad.reach" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Kliknięcia linku<input v-model="st.ad.link_clicks" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Aktywność posta<input v-model="st.ad.activity" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f wide">Uwagi<textarea v-model="st.ad.note" rows="3" maxlength="2000"></textarea></label>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="as-dfoot">
          <button v-if="st.ad.id" class="danger" :disabled="st.saving" @click="remove('ad')"><svg class="i"><use href="#trash"/></svg>Usuń</button>
          <span></span>
          <button @click="st.ad = null">Anuluj</button>
          <button class="primary" :disabled="st.saving || !st.ad.name.trim()" @click="save('ad')">Zapisz</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ===== okno: cel i działania ===== -->
  <Teleport to="body">
    <div v-if="st.cfg" class="np-overlay" @click.self="st.cfg = null" @keydown.esc="st.cfg = null">
      <div class="np-panel as-dlg" role="dialog" aria-modal="true" aria-label="Cel i działania">
        <div class="as-dhead"><b>Cel i działania · {{ st.cfg.id }}</b><button class="icon" aria-label="Zamknij" @click="st.cfg = null"><svg class="i"><use href="#x"/></svg></button></div>
        <div class="as-dbody">
          <label class="as-f wide">Najwyżej tyle % stałych/bywalców w zapisach<input v-model="st.cfg.regular_goal" type="number" min="0" max="100" inputmode="numeric"></label>
          <h4>Działania na kolejne wydarzenia</h4>
          <div v-for="(a, i) in st.cfg.actions" :key="i" class="as-act wide">
            <input v-model="a.title" placeholder="Krótko, np. Osobiste zaproszenia" maxlength="80" :aria-label="'Działanie ' + (i + 1)">
            <textarea v-model="a.text" rows="2" placeholder="Co konkretnie robimy" maxlength="600" :aria-label="'Opis działania ' + (i + 1)"></textarea>
            <div class="as-act-btns">
              <button class="icon" aria-label="W górę" :disabled="!i" @click="moveAct(i, -1)"><svg class="i"><use href="#up"/></svg></button>
              <button class="icon" aria-label="W dół" :disabled="i === st.cfg.actions.length - 1" @click="moveAct(i, 1)"><svg class="i"><use href="#down"/></svg></button>
              <button class="icon" aria-label="Usuń działanie" @click="st.cfg.actions.splice(i, 1)"><svg class="i"><use href="#trash"/></svg></button>
            </div>
          </div>
          <button class="wide" @click="st.cfg.actions.push({ title: '', text: '' })"><svg class="i"><use href="#plus"/></svg>Dodaj działanie</button>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="as-dfoot"><span></span><button @click="st.cfg = null">Anuluj</button><button class="primary" :disabled="st.saving" @click="saveCfg">Zapisz</button></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.as-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; margin-bottom: 10px; }
.as-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.as-tabs { max-width: 520px; }
.as-tabs button { min-width: 0; padding: 6px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-sub { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.as-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.as-kpi { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); }
.as-kpi small { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.as-kpi b { font-size: clamp(24px, 4vw, 30px); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; line-height: 1.15; }
.as-kpi span { color: var(--muted); font-size: 12.5px; }
.as-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 12px; }
.as-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.as-card h3 { margin: 0; font-size: 15.5px; font-weight: 650; }
.as-wide { grid-column: 1 / -1; }
.as-legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--muted); }
.as-legend span { display: inline-flex; align-items: center; gap: 6px; }
.as-legend i { width: 12px; height: 12px; border-radius: 3px; }
.k-att { background: var(--accent); }
.k-su { background: color-mix(in srgb, var(--accent) 28%, var(--panel2)); }
.as-bars { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.as-brow { display: grid; grid-template-columns: minmax(110px, 34%) 1fr auto; gap: 10px; align-items: center; min-height: 34px; padding: 2px 4px; border-radius: 8px; }
@media (hover: hover) { .as-brow:hover { background: var(--panel2); } }
.as-lab { display: flex; flex-direction: column; min-width: 0; }
.as-lab b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-lab small { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-track { position: relative; height: 14px; }
.as-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 0 4px 4px 0; }
.as-att { background: var(--accent); }
.as-att.muted { background: color-mix(in srgb, var(--accent) 45%, var(--panel3)); }
.as-att.est { background: repeating-linear-gradient(135deg, var(--accent) 0 5px, color-mix(in srgb, var(--accent) 60%, var(--panel)) 5px 8px); }
.as-su { background: color-mix(in srgb, var(--accent) 28%, var(--panel2)); }
.as-val { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; min-width: 64px; }
.as-goal { margin-top: 8px; padding: 12px; border-radius: 14px; background: var(--panel2); display: flex; flex-direction: column; gap: 6px; }
.as-goal-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.as-goal-top b { font-size: 22px; font-variant-numeric: tabular-nums; }
.as-goal-top span, .as-goal small { color: var(--muted); font-size: 12.5px; }
.as-goal-track { position: relative; height: 10px; border-radius: 999px; background: var(--panel3); }
.as-goal-track i { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--warn, #d9822b); }
.as-goal.ok .as-goal-track i { background: var(--ok); }
.as-goal-track em { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--text); border-radius: 1px; }
.as-mini { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.as-mini div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--panel2); }
.as-mini small { color: var(--muted); font-size: 12px; }
.as-mini b { font-size: 17px; font-variant-numeric: tabular-nums; }
.as-rank { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.as-rank li { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; min-height: 32px; padding: 0 6px; border-radius: 8px; font-size: 13.5px; }
.as-rank li:nth-child(odd) { background: var(--panel2); }
.as-rank span { color: var(--muted); font-variant-numeric: tabular-nums; }
.as-rank b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-rank em { font-style: normal; font-weight: 600; font-variant-numeric: tabular-nums; }
.as-acts-view { margin-top: 12px; }
.as-acts-view ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 10px; }
.as-acts-view li b { display: block; font-size: 14px; }
.as-acts-view li span { color: var(--muted); font-size: 13.5px; line-height: 1.45; }
.as-meth { margin: 14px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; max-width: 90ch; }
.as-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
.as-head .as-sub { flex: 1 1 300px; }
.as-list { display: flex; flex-direction: column; gap: 8px; }
.as-item { display: grid !important; grid-template-columns: 92px 1fr auto; gap: 12px; align-items: center; justify-content: stretch !important; padding: 12px 14px !important; min-height: 0 !important; border-radius: 16px !important; background: var(--panel) !important; border: 1px solid var(--line) !important; color: var(--text) !important; font-weight: 400 !important; text-align: left; box-shadow: none !important; }
@media (hover: hover) { .as-item:hover { border-color: color-mix(in srgb, var(--accent) 45%, transparent) !important; } }
.as-date { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.as-main { display: flex; flex-direction: column; min-width: 0; }
.as-main b { font-size: 14.5px; font-weight: 600; }
.as-main small { color: var(--muted); font-size: 12.5px; }
.as-nums { display: flex; gap: 18px; }
.as-nums > span { display: flex; flex-direction: column; align-items: flex-end; min-width: 92px; }
.as-nums small { color: var(--muted); font-size: 11.5px; }
.as-nums b { font-size: 14px; font-variant-numeric: tabular-nums; }
.as-nums i { font-style: normal; color: var(--muted); font-size: 11.5px; }
.as-nums i.q-szacunek { color: var(--accent-text); }
.as-nums i.q-brak { color: var(--danger, #c44); }
@media (max-width: 1100px) { .as-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .as-item { grid-template-columns: 1fr; gap: 6px; }
  .as-nums { justify-content: flex-start; }
  .as-nums > span { align-items: flex-start; }
  .as-brow { grid-template-columns: 1fr auto; gap: 2px 10px; padding: 4px 2px; }
  .as-brow .as-lab { grid-column: 1 / -1; flex-direction: row; gap: 6px; align-items: baseline; }
  .as-tabs button { font-size: 13px; }
}
.as-dlg { gap: 10px; }
@media (min-width: 720px) { .as-dlg { width: min(680px, 100%) !important; } }
.as-dhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.as-dhead b { font-size: 17px; }
.as-dbody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 10px; align-content: start; padding: 2px; }
.as-dbody h4 { grid-column: 1 / -1; margin: 6px 0 -2px; font-size: 13px; font-weight: 600; color: var(--muted); }
.as-dbody .wide { grid-column: 1 / -1; }
.as-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); min-width: 0; }
.as-f input, .as-f select, .as-f textarea { width: 100%; }
.as-act { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 10px; border-radius: 12px; background: var(--panel2); }
.as-act textarea { grid-column: 1; }
.as-act-btns { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 2px; }
.as-dfoot { display: flex; gap: 8px; align-items: center; }
.as-dfoot > span { flex: 1; }
</style>

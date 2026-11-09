<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'
import ColChart from '@/components/ColChart.vue'
import AsbSurveys, { SOURCE_OPTS } from '@/components/AsbSurveys.vue'

// Statystyki ASB — osobna strona w menu (dawniej arkusz „ASB | Statystyki”, zakładka „Dashboard Poznań”).
// Większe wydarzenia z frekwencją i jakością danych, nowe osoby, źródła dotarcia, koszty w kategoriach, reklamy Meta,
// a do tego: trend zwykłych spotkań z grafiku ASB, wpływ ewangelizacji (3 zwykłe spotkania przed i po), porównanie lat,
// wydarzenia i obserwujący z Facebooka (pobierane przez /api/meta). Zasady z arkusza: obecności to uczestnictwa (nie
// różne osoby), zapisy ≠ obecność, pusta kwota = koszt nieznany (nie 0 zł), brak frekwencji ≠ 0 osób, reakcja ≠ przyjście.
const COSTS = [
  { key: 'cost_room', name: 'Sala / wynajem' }, { key: 'cost_posters', name: 'Plakaty' }, { key: 'cost_flyers', name: 'Ulotki' },
  { key: 'cost_food', name: 'Jedzenie' }, { key: 'cost_transport', name: 'Transport' }, { key: 'cost_decor', name: 'Dekoracje' },
  { key: 'cost_other', name: 'Pozostałe' }, { key: 'cost_promo', name: 'Promocja poza Meta' },
]
const OTHER = ['cost_food', 'cost_transport', 'cost_decor', 'cost_other', 'cost_promo']
const SRC = [
  { key: 'src_friends', name: 'Znajomi' }, { key: 'src_social', name: 'Social media' }, { key: 'src_posters', name: 'Plakaty' },
  { key: 'src_regular', name: 'Stali / bywalcy' }, { key: 'src_other', name: 'Inne' },
]
const QUALITY = { potwierdzona: 'Potwierdzona', szacunek: 'Szacunek', brak: 'Brak danych' }
const COST_ST = { pelne: 'Pełne', czesciowe: 'Częściowe', nieznane: 'Nieznane' }
const BASIS = { zapisy: 'Formularz zapisów', ankieta: 'Ankieta obecnych', relacja: 'Relacja organizatorów', '': 'Brak' }
const GOALS = { reakcje: 'Reakcje na wydarzenie', rozmowy: 'Rozpoczęte rozmowy', aktywnosc: 'Aktywność posta', polubienia: 'Polubienia strony', klikniecia: 'Kliknięcia linku', odwiedziny: 'Odwiedziny strony / profilu', inne: 'Inny cel' }
// zasady analizy z arkusza (M01–M10) — pokazywane w Ustawieniach, żeby każdy czytał liczby tak samo
const METHOD = [
  ['Zakres', 'Koszty obejmują zarejestrowane większe wydarzenia, nie całą działalność ASB. Unikamy określenia „koszty całego ASB”.'],
  ['Frekwencja', 'Zapisy ≠ obecność. Suma obecności to uczestnictwa, nie różne osoby. Osobę obecną przez część spotkania liczymy jako 1; pojedyncze spotkanie zaokrąglamy w górę, średnich nie.'],
  ['Wpływ ewangelizacji', 'Porównujemy 2–3 zwykłe spotkania przed i po akcji, z datami i liczbą obserwacji. Bez okien obejmujących kolejną ewangelizację; wynik przed/po sam nie dowodzi efektu.'],
  ['Trend i sezonowość', 'Osobno średnie zwykłych spotkań, trend semestru i lata akademickie. Brak danych ≠ 0. Jeden sezon nie potwierdza cyklu.'],
  ['Powroty nowych', 'Suma frekwencji nie mówi, kto wrócił. Przy zwykłych spotkaniach notujmy anonimowo: pierwsza wizyta, powrót po akcji, stały uczestnik.'],
  ['Źródła', 'Odpowiedzi z zapisów to nie to samo co ankieta obecnych. Wskazanie Facebooka nie dowodzi płatnej reklamy. Rozdzielamy organiczne social, płatne Meta i zaproszenia.'],
  ['Promocja', 'Koszt promocji na deklarację kanału to nie koszt pozyskania obecnej osoby.'],
  ['Druk', 'Nie dzielimy kosztu druku przez liczbę wskazań plakatu; nakład 400/500 to model podziału planu, nie potwierdzony druk.'],
  ['Braki', 'Potwierdzona, szacunek i brak danych to różne jakości. Nieznany koszt ≠ 0 zł, brak frekwencji ≠ 0 osób — luki zostają otwarte i opisane.'],
  ['Kolejne akcje', 'Po wydarzeniu: frekwencja, nowe osoby, źródła, koszt oraz 1., 2. i 3. zwykłe spotkanie po akcji — bez automatycznych wniosków o przyczynie.'],
]
const TABS = [['sum', 'Przegląd'], ['att', 'Frekwencja'], ['cost', 'Koszty'], ['promo', 'Promocja'], ['events', 'Wydarzenia'], ['ads', 'Reklamy'], ['surveys', 'Ankiety'], ['set', 'Ustawienia']]
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
const NUM_EV = ['signups', 'attendance', 'att_min', 'att_max', 'new_people', 'new_repeat', 'print_posters', 'print_flyers', ...SRC.map(s => s.key)]
const NUM_AD = ['impressions', 'reach', 'results', 'link_clicks', 'activity']

export default defineComponent({
  components: { ColChart, AsbSurveys },
  setup() {
    const app = useApp()
    const st = reactive({ busy: false, error: '', events: [], ads: [], cities: [], fbEvents: [], meetings: [], city: 'Poznań', season: '', tab: 'sum',
      ev: null, ad: null, cfg: null, fbCfg: null, saving: false, fb: { busy: false, msg: '', error: '', setup: false }, adFilter: '', tokenIn: '', surveys: [], answers: [], evTab: 'dane' })
    // ankiety z kodem QR (osobno — błąd tutaj nie psuje statystyk)
    async function loadSurveys() { try { const r = await app.api.call('asbSurveys'); st.surveys = r.surveys; st.answers = r.answers } catch { /* dodatek */ } }
    // „Skąd się dowiedziałeś?” z ankiet podpiętych pod wydarzenie → podpowiedź liczb w źródłach dotarcia
    function surveySrc(eventId) {
      const out = { n: 0, counts: Object.fromEntries(SOURCE_OPTS.map(o => [o[0], 0])) }
      if (!eventId) return out
      for (const sv of st.surveys.filter(x => x.event_id === eventId)) {
        const q = (sv.questions || []).find(x => x.type === 'source'); if (!q) continue
        for (const a of st.answers.filter(x => x.survey === sv.id)) { const v = a.answers?.[q.id]; if (v && v in out.counts) { out.counts[v]++; out.n++ } }
      }
      return out
    }
    function useSurveySrc() {
      const r = surveySrc(st.ev?.id); if (!r.n) return
      for (const [k, n] of Object.entries(r.counts)) st.ev[k] = n
      if (!st.ev.src_basis || st.ev.src_basis === 'zapisy' && st.ev.signups == null) st.ev.src_basis = 'ankieta'
    }
    async function load() {
      st.busy = true; st.error = ''
      try {
        const r = await app.api.call('asbStats')
        Object.assign(st, { events: r.events, ads: r.ads, cities: r.cities, fbEvents: r.fbEvents || [], meetings: r.meetings || [] })
        loadSurveys()
        const cs = cityList.value
        if (!cs.includes(st.city)) st.city = cs[0] || 'Poznań'
        st.fbCfg = null
      } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    onMounted(load)
    const today = new Date().toISOString().slice(0, 10)
    const cityList = computed(() => [...new Set([...st.events.map(e => e.city), ...st.cities.map(c => c.id)])].filter(Boolean).sort())
    const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 9 ? y + '/' + (y + 1) : (y - 1) + '/' + y }
    const seasons = computed(() => [...new Set(st.events.filter(e => e.city === st.city && e.date).map(e => seasonOf(e.date)))].sort().reverse())
    const inPeriod = d => !st.season || (d && seasonOf(d) === st.season)
    const cityEvents = computed(() => st.events.filter(e => e.city === st.city).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
    const events = computed(() => cityEvents.value.filter(e => inPeriod(e.date)))
    const evById = computed(() => Object.fromEntries(st.events.map(e => [e.id, e])))
    const adDate = a => evById.value[a.event_id]?.date || a.date
    const ads = computed(() => st.ads.filter(a => a.city === st.city && inPeriod(adDate(a))))
    const cfg = computed(() => st.cities.find(c => c.id === st.city) || { id: st.city, regular_goal: 50, actions: [], fb_page: '', fb_ad_account: '', grafik: false })
    // zwykłe spotkania z grafiku ASB (gdy miasto ma włączone „grafik”)
    const regular = computed(() => (cfg.value.grafik ? st.meetings.filter(m => m.kind === 'cykliczne' && m.date && m.attendance != null && m.date <= today) : []))

    // ---- liczenie ----
    const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
    const avg = list => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null)
    const metaOf = e => sum(st.ads.filter(a => a.event_id === e.id), a => a.spent)
    const hasMeta = e => st.ads.some(a => a.event_id === e.id && a.spent != null)
    const evCost = e => {
      const known = COSTS.filter(c => e[c.key] != null)
      if (!known.length && !hasMeta(e)) return null
      return sum(known, c => e[c.key]) + metaOf(e)
    }
    const otherOf = e => (OTHER.some(k => e[k] != null) ? OTHER.reduce((s, k) => s + (e[k] || 0), 0) : null)
    const attLo = e => (e.attendance ?? e.att_min ?? null)
    const attHi = e => (e.attendance ?? e.att_max ?? e.att_min ?? null)
    const perHead = e => { const c = evCost(e), a = e.attendance; return c != null && a && e.cost_status !== 'nieznane' ? c / a : null }
    const pln = v => v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
    const pln0 = v => v == null ? '—' : Math.round(v).toLocaleString('pl-PL') + ' zł'
    const int = v => v == null ? '—' : Number(v).toLocaleString('pl-PL')
    const dec = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pl-PL', { maximumFractionDigits: d })
    const pct = v => v == null ? '—' : (v * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%'
    const range = (lo, hi) => (lo === hi ? int(lo) : '~' + int(lo) + '–' + int(hi))
    const dmy = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : 'bez daty'
    const dm = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) : ''

    function totals(ev, ad) {
      const unassigned = ad.filter(a => !a.event_id || !evById.value[a.event_id])
      const meta = sum(ad, a => a.spent)
      const known = sum(ev, e => evCost(e)) + sum(unassigned, a => a.spent)
      const promo = meta + sum(ev, e => (e.cost_posters || 0) + (e.cost_flyers || 0) + (e.cost_promo || 0))
      const withAtt = ev.filter(e => attLo(e) != null)
      const lo = sum(withAtt, attLo), hi = sum(withAtt, attHi)
      const heads = ev.filter(e => perHead(e) != null)
      return { n: ev.length, noAtt: ev.length - withAtt.length, lo, hi, known, promo, meta, newPeople: sum(ev, e => e.new_people),
        avgAtt: withAtt.length ? lo / withAtt.length : null, perHead: heads.length ? sum(heads, evCost) / sum(heads, e => e.attendance) : null }
    }
    const kpi = computed(() => {
      const t = totals(events.value, ads.value), ad = ads.value
      const imp = sum(ad, a => a.impressions), clicks = sum(ad, a => a.link_clicks)
      const react = ad.filter(a => a.goal === 'reakcje' && a.results)
      const reactN = sum(react, a => a.results), reactSpent = sum(react, a => a.spent)
      // koszt na nową osobę (szac., jak w arkuszu): koszty wydarzeń z rozpoznanymi nowymi ÷ różne nowe osoby
      const withNew = events.value.filter(e => e.new_people > 0 && evCost(e) != null)
      const newUnique = sum(withNew, e => e.new_people) - sum(withNew, e => e.new_repeat)
      return { ...t, newUnique, newCost: newUnique > 0 ? sum(withNew, evCost) / newUnique : null, imp, clicks, reach: sum(ad, a => a.reach), ctr: imp ? clicks / imp : null, cpc: clicks ? t.meta / clicks : null, cpm: imp ? t.meta / imp * 1000 : null, reactN, reactCost: reactN ? reactSpent / reactN : null }
    })
    const srcEvents = computed(() => { const z = events.value.filter(e => e.src_basis === 'zapisy' && SRC.some(s => e[s.key] != null)); return z.length ? z : events.value })
    const sources = computed(() => SRC.map(s => ({ ...s, n: sum(events.value, e => e[s.key]) })))
    const regularShare = computed(() => {
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
    const short = (n, l = 34) => (n.length > l ? n.slice(0, l - 2) + '…' : n)
    const attRows = computed(() => events.value.map(e => ({ e, lo: attLo(e), hi: attHi(e), su: e.signups })))
    const attMax = computed(() => Math.max(1, ...attRows.value.map(r => Math.max(r.hi || 0, r.su || 0))))
    const headRows = computed(() => events.value.map(e => ({ e, v: perHead(e) })).filter(r => r.v != null))
    const headMax = computed(() => Math.max(1, ...headRows.value.map(r => r.v)))
    const ranking = computed(() => ads.value.filter(a => a.goal === 'reakcje' && a.results && a.spent != null).map(a => ({ a, v: a.spent / a.results })).sort((x, y) => x.v - y.v))
    const max = list => Math.max(1, ...list.map(r => r.v ?? r.n ?? 0))
    const w = (v, m) => (v ? Math.max(1.5, (v / m) * 100) : 0) + '%'

    // trend zwykłych spotkań: średnia frekwencja w miesiącu + liczba większych wydarzeń w tym miesiącu
    const trend = computed(() => {
      const by = {}
      for (const m of regular.value) if (inPeriod(m.date)) (by[m.date.slice(0, 7)] ||= { list: [], ev: 0 }).list.push(m.attendance)
      for (const e of events.value) if (e.date && by[e.date.slice(0, 7)]) by[e.date.slice(0, 7)].ev++
      return Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k, label: MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4), v: avg(v.list), n: v.list.length, ev: v.ev }))
    })
    const trendMax = computed(() => Math.max(1, ...trend.value.map(t => t.v)))
    const regAvg = computed(() => { const l = regular.value.filter(m => inPeriod(m.date)).map(m => m.attendance); return avg(l) })
    // wpływ ewangelizacji: do 3 zwykłych spotkań przed i po, bez przechodzenia przez sąsiednie wydarzenie
    const impact = computed(() => {
      const all = cityEvents.value.filter(e => e.date), reg = regular.value
      return events.value.filter(e => e.date && e.date <= today).map(e => {
        const i = all.findIndex(x => x.id === e.id), prev = all[i - 1]?.date || '0000', next = all[i + 1]?.date || '9999'
        const before = reg.filter(m => m.date < e.date && m.date > prev).slice(-3), after = reg.filter(m => m.date > e.date && m.date < next).slice(0, 3)
        const b = avg(before.map(m => m.attendance)), a = avg(after.map(m => m.attendance))
        return { e, before, after, b, a, diff: b != null && a != null ? a - b : null }
      }).filter(r => r.before.length || r.after.length)
    })
    // porównanie lat akademickich (zawsze wszystkie lata miasta)
    const seasonRows = computed(() => [...seasons.value].reverse().map(s => {
      const ev = cityEvents.value.filter(e => e.date && seasonOf(e.date) === s), ad = st.ads.filter(a => a.city === st.city && adDate(a) && seasonOf(adDate(a)) === s)
      const t = totals(ev, ad), reg = regular.value.filter(m => seasonOf(m.date) === s)
      return { s, ...t, reg: avg(reg.map(m => m.attendance)), regN: reg.length }
    }))
    const goalRows = computed(() => Object.entries(GOALS).map(([k, name]) => {
      const l = ads.value.filter(a => a.goal === k), v = sum(l, a => a.spent), imp = sum(l, a => a.impressions), clicks = sum(l, a => a.link_clicks)
      return { name, v, n: l.length, imp, clicks, results: sum(l, a => a.results), cpc: clicks ? v / clicks : null, cpm: imp ? v / imp * 1000 : null }
    }).filter(r => r.n))
    // wskaźniki każdej reklamy: koszt kliknięcia, kliknięcia/wyświetlenia, koszt 1000 wyświetleń, koszt wyniku
    const adRows = computed(() => [...ads.value].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(a => ({ a,
      cpc: a.link_clicks ? a.spent / a.link_clicks : null, ctr: a.impressions ? (a.link_clicks || 0) / a.impressions : null,
      cpm: a.impressions ? a.spent / a.impressions * 1000 : null, cpr: a.results ? a.spent / a.results : null })))
    // miejsca emisji — częściowe odczyty Meta (nie wydatki, nie unikalny zasięg)
    const placements = computed(() => {
      const by = {}
      for (const a of ads.value) for (const [k, v] of Object.entries(a.placements || {})) by[k] = (by[k] || 0) + (Number(v) || 0)
      return Object.entries(by).map(([name, v]) => ({ name, v })).sort((x, y) => y.v - x.v)
    })
    // źródła na każdym wydarzeniu z kategorią „nieznane” (podstawa: zapisy albo obecni)
    const srcRows = computed(() => events.value.map(e => {
      const zap = e.src_basis === 'zapisy', base = zap ? e.signups : attLo(e)
      const known = SRC.reduce((t, x) => t + (e[x.key] || 0), 0)
      return { e, zap, base, vals: SRC.map(x => e[x.key]), unknown: base != null ? Math.max(0, base - known) : null }
    }).filter(r => r.base != null || r.vals.some(v => v != null)))
    // zapisy a obecni (wydarzenia z formularzem zapisów)
    const signupRows = computed(() => events.value.filter(e => e.signups != null).map(e => ({ e, reg: e.src_regular || 0, other: Math.max(0, e.signups - (e.src_regular || 0)) })))
    // druk: ilości i koszt jednej sztuki tam, gdzie znane są oba
    const print = computed(() => {
      const ev = events.value, pp = ev.filter(e => e.print_posters && e.cost_posters != null), pf = ev.filter(e => e.print_flyers && e.cost_flyers != null)
      return { posters: sum(ev, e => e.print_posters), flyers: sum(ev, e => e.print_flyers), costPosters: sum(ev, e => e.cost_posters), costFlyers: sum(ev, e => e.cost_flyers),
        perPoster: pp.length ? sum(pp, e => e.cost_posters) / sum(pp, e => e.print_posters) : null, perFlyer: pf.length ? sum(pf, e => e.cost_flyers) / sum(pf, e => e.print_flyers) : null,
        posterTraces: sum(ev, e => e.src_posters) }
    })
    // spotkanie po spotkaniu: zwykłe spotkania (grafik) i większe wydarzenia, z trendem liniowym każdej serii
    const timeline = computed(() => {
      const pts = [...regular.value.filter(m => inPeriod(m.date)).map(m => ({ date: m.date, v: m.attendance, ev: false, label: m.topic || 'Spotkanie' })),
        ...events.value.filter(e => e.date && e.date <= today && attLo(e) != null).map(e => ({ date: e.date, v: attHi(e), ev: true, label: e.name }))].sort((a, b) => a.date.localeCompare(b.date))
      const fit = list => { // nachylenie na kolejny pomiar (najmniejsze kwadraty po indeksie)
        const n = list.length; if (n < 3) return null
        const mx = (n - 1) / 2, my = list.reduce((t, q) => t + q.v, 0) / n
        let num = 0, den = 0
        list.forEach((q, i) => { num += (i - mx) * (q.v - my); den += (i - mx) ** 2 })
        return num / den
      }
      const reg = pts.filter(q => !q.ev), evs = pts.filter(q => q.ev)
      return { pts, max: Math.max(1, ...pts.map(q => q.v)), slopeReg: fit(reg), slopeEv: fit(evs), nReg: reg.length, nEv: evs.length }
    })
    const printRows = computed(() => events.value.map(e => ({ e, meta: metaOf(e), print: (e.cost_posters || 0) + (e.cost_flyers || 0) })).filter(r => r.meta || r.print))
    const printMax = computed(() => Math.max(1, ...printRows.value.map(r => Math.max(r.meta, r.print))))
    // Facebook: wydarzenia ze strony z deklaracjami i (jeśli powiązane) faktyczną frekwencją
    const fbRows = computed(() => st.fbEvents.filter(f => f.city === st.city && inPeriod((f.start_time || '').slice(0, 10))).map(f => {
      const d = (f.start_time || '').slice(0, 10)
      const e = cityEvents.value.find(x => x.fb_event_id === f.id) || cityEvents.value.find(x => x.date === d)
      return { f, d, e }
    }).sort((a, b) => b.d.localeCompare(a.d)))
    // do uzupełnienia: ewangelizacje z grafiku, które już były, a nie ma ich w statystykach
    const pending = computed(() => (cfg.value.grafik ? st.meetings.filter(m => m.kind === 'ewangelizacyjne' && m.date && m.date <= today && !cityEvents.value.some(e => e.meeting_id === m.id || e.date === m.date)) : []))
    const upcoming = computed(() => (cfg.value.grafik ? st.meetings.filter(m => m.kind === 'ewangelizacyjne' && m.date > today).slice(0, 2) : []))
    const unassigned = computed(() => ads.value.filter(a => !a.event_id || !evById.value[a.event_id]))
    const adsShown = computed(() => [...(st.adFilter === 'bez' ? unassigned.value : ads.value)].reverse())

    // ---- edycja ----
    const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const blankEv = () => ({ id: '', city: st.city, date: '', name: '', kind: 'Ewangelizacja', place: '', signups: null, attendance: null, att_min: null, att_max: null, quality: 'potwierdzona', new_people: null, src_basis: 'zapisy', cost_status: 'czesciowe', note: '', fb_event_id: null, meeting_id: null, cycle: '', print_posters: null, print_flyers: null, new_repeat: null, ...Object.fromEntries([...SRC, ...COSTS].map(x => [x.key, null])) })
    const openEv = (e, tab = 'dane') => { st.ev = { ...(e || blankEv()) }; st.evTab = e ? tab : 'dane'; st.error = '' }
    const fromMeeting = m => { openEv(null); Object.assign(st.ev, { name: m.topic || 'Spotkanie ewangelizacyjne', date: m.date, place: m.place || '', attendance: m.attendance ?? null, meeting_id: m.id }) }
    const fromFb = f => { openEv(null); Object.assign(st.ev, { name: f.name, date: (f.start_time || '').slice(0, 10), place: f.place || '', fb_event_id: f.id }) }
    function pickMeeting(id) {
      const m = st.meetings.find(x => x.id === id); st.ev.meeting_id = id || null
      if (m) { if (!st.ev.date) st.ev.date = m.date; if (!st.ev.place) st.ev.place = m.place || ''; if (st.ev.attendance == null && m.attendance != null) st.ev.attendance = m.attendance; if (!st.ev.name) st.ev.name = m.topic }
    }
    const blankAd = () => ({ id: '', city: st.city, event_id: null, date: '', name: '', goal: 'reakcje', spent: null, impressions: null, reach: null, results: null, link_clicks: null, activity: null, note: '' })
    const openAd = a => { st.ad = { ...(a || blankAd()) }; st.error = '' }
    const toNum = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
    async function save(kind) {
      const isEv = kind === 'ev', row = { ...(isEv ? st.ev : st.ad) }
      if (!row.name.trim()) { st.error = 'Podaj nazwę.'; return }
      for (const k of isEv ? [...NUM_EV, ...COSTS.map(c => c.key)] : [...NUM_AD, 'spent']) row[k] = toNum(row[k])
      row.date = row.date || null
      if (!row.id) row.id = uid(isEv ? 'E' : 'AD')
      if (isEv) { row.fb_event_id = row.fb_event_id || null; row.meeting_id = row.meeting_id || null } else row.event_id = row.event_id || null
      st.saving = true; st.error = ''
      try {
        await app.api.call(isEv ? 'asbStatSave' : 'asbAdSave', row)
        const list = isEv ? st.events : st.ads, i = list.findIndex(x => x.id === row.id)
        if (i >= 0) list.splice(i, 1, { ...list[i], ...row }); else list.push(row)
        if (isEv) st.ev = null; else st.ad = null
      } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    async function remove(kind) {
      const isEv = kind === 'ev', row = isEv ? st.ev : st.ad
      const n = isEv ? st.ads.filter(a => a.event_id === row.id).length : 0
      if (!(await ask(isEv ? `Wydarzenie „${row.name}” zniknie ze statystyk.${n ? ' Reklamy zostaną, bez przypisania.' : ''}` : `Reklama „${row.name}” zniknie ze statystyk.${row.fb_id ? ' Wróci przy następnym pobraniu z Facebooka.' : ''}`, { title: 'Usunąć?', ok: 'Usuń', danger: true }))) return
      st.saving = true
      try {
        await app.api.call(isEv ? 'asbStatDelete' : 'asbAdDelete', { id: row.id })
        if (isEv) { st.events = st.events.filter(x => x.id !== row.id); st.ads.forEach(a => { if (a.event_id === row.id) a.event_id = null }); st.ev = null }
        else { st.ads = st.ads.filter(x => x.id !== row.id); st.ad = null }
      } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    const openCfg = () => { st.cfg = { id: st.city, regular_goal: cfg.value.regular_goal ?? 50, actions: (cfg.value.actions || []).map(a => ({ ...a })) } }
    function putCity(c) { const i = st.cities.findIndex(x => x.id === c.id); if (i >= 0) st.cities.splice(i, 1, { ...st.cities[i], ...c }); else st.cities.push({ ...cfg.value, ...c }) }
    async function saveCfg() {
      const c = { ...st.cfg, regular_goal: Math.min(100, Math.max(0, Number(st.cfg.regular_goal) || 0)), actions: st.cfg.actions.filter(a => (a.title || '').trim() || (a.text || '').trim()) }
      st.saving = true; st.error = ''
      try { await app.api.call('asbCitySave', c); putCity(c); st.cfg = null } catch (e) { st.error = e.message } finally { st.saving = false }
    }
    const moveAct = (i, d) => { const a = st.cfg.actions, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]] }
    const newCity = () => { const n = prompt('Nazwa miasta (np. Gdańsk)'); if (n?.trim()) { st.city = n.trim(); st.season = ''; st.fbCfg = null } }
    const evOptions = computed(() => [...cityEvents.value].reverse())
    const fbOptions = computed(() => st.fbEvents.filter(f => f.city === st.city).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || '')))
    const meetingOptions = computed(() => st.meetings.filter(m => m.date && m.kind !== 'wewnetrzne').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80))

    // ---- Facebook ----
    const fbForm = computed(() => st.fbCfg || (st.fbCfg = { fb_page: cfg.value.fb_page || '', fb_ad_account: cfg.value.fb_ad_account || '', grafik: !!cfg.value.grafik }))
    // zapis identyfikatorów i (jeśli wklejony) tokenu — token idzie do zamkniętej tabeli, wraca tylko jego końcówka
    async function saveFb() {
      st.saving = true; st.error = ''; st.fb.msg = ''; st.fb.error = ''
      try {
        const c = { id: st.city, ...fbForm.value }
        await app.api.call('asbCityFb', c); putCity(c)
        if (st.tokenIn.trim()) { const hint = await app.api.call('asbFbToken', { city: st.city, token: st.tokenIn }); putCity({ id: st.city, fb_token_hint: hint, fb_token_set: new Date().toISOString() }); st.tokenIn = '' }
        st.fb.msg = 'Zapisano.'
      } catch (e) { st.fb.error = e.message } finally { st.saving = false }
    }
    async function clearToken() {
      if (!(await ask('Pobieranie z Facebooka przestanie działać, dopóki ktoś nie wklei nowego tokenu.', { title: 'Usunąć token Meta?', ok: 'Usuń', danger: true }))) return
      st.saving = true; st.fb.error = ''
      try { await app.api.call('asbFbToken', { city: st.city, token: '' }); putCity({ id: st.city, fb_token_hint: '', fb_token_set: null }); st.fb.msg = 'Token usunięty.' } catch (e) { st.fb.error = e.message } finally { st.saving = false }
    }
    // propozycja przypisania nowej reklamy: najbliższe wydarzenie miasta 0–30 dni po jej starcie
    function guessEvent(d) {
      if (!d) return null
      const t = new Date(d).getTime()
      return cityEvents.value.find(e => e.date && new Date(e.date).getTime() >= t && new Date(e.date).getTime() - t <= 30 * 864e5)?.id || null
    }
    async function fbSync() {
      st.fb = { busy: true, msg: '', error: '', setup: false }
      try {
        const r = await app.api.call('asbFbFetch', { city: st.city })
        const mine = st.ads.filter(a => a.city === st.city), used = new Set(), updates = [], inserts = []
        for (const ad of r.ads || []) {
          // ta sama reklama: po identyfikatorze Meta, a dla wpisanych ręcznie — po kwocie i dacie (±7 dni)
          const near = a => !ad.date || !a.date || Math.abs(new Date(a.date).getTime() - new Date(ad.date).getTime()) <= 7 * 864e5
          const old = mine.find(a => a.fb_id === ad.fb_id) || mine.find(a => !a.fb_id && !used.has(a.id) && a.spent != null && ad.spent != null && Math.abs(a.spent - ad.spent) < 0.02 && near(a))
          if (old) { used.add(old.id); updates.push({ id: old.id, row: { fb_id: ad.fb_id, campaign: ad.campaign, spent: ad.spent, impressions: ad.impressions, reach: ad.reach, link_clicks: ad.link_clicks, activity: ad.activity, ...(ad.results != null ? { results: ad.results } : {}) } }) }
          else inserts.push({ ...ad, id: 'FB-' + ad.fb_id, city: st.city, event_id: guessEvent(ad.date), note: '' })
        }
        await app.api.call('asbFbStore', { city: st.city, updates, inserts, events: r.events || [], followers: r.followers, igFollowers: r.igFollowers })
        await load()
        st.fb.msg = `Pobrano z Facebooka — reklamy: ${(r.ads || []).length} (nowe: ${inserts.length}), wydarzenia: ${(r.events || []).length}.` + (r.warnings?.length ? ' Uwagi: ' + r.warnings.join(' · ') : '')
      } catch (e) { st.fb.error = e.message; st.fb.setup = !!e.setup } finally { st.fb.busy = false }
    }
    const ago = t => { if (!t) return 'jeszcze nie'; const d = new Date(t); return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) }

    return { ...app, SOURCE_OPTS, loadSurveys, surveySrc, useSurveySrc, METHOD, adRows, placements, srcRows, signupRows, print, timeline, st, COSTS, SRC, QUALITY, COST_ST, BASIS, GOALS, TABS, load, cityList, seasons, events, ads, cfg, kpi, sources, regularShare, costCats, attRows, attMax, headRows, headMax, ranking, max, w, short,
      trend, trendMax, regAvg, impact, seasonRows, goalRows, printRows, printMax, fbRows, pending, upcoming, unassigned, adsShown, regular,
      evCost, otherOf, perHead, metaOf, attLo, attHi, pln, pln0, int, dec, pct, range, dmy, dm, openEv, openAd, fromMeeting, fromFb, pickMeeting, save, remove, openCfg, saveCfg, moveAct, newCity,
      evOptions, fbOptions, meetingOptions, evById, fbForm, saveFb, clearToken, fbSync, ago }
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
      <button v-for="c in cityList" :key="c" class="filter" :class="{ on: st.city === c }" @click="st.city = c; st.season = ''; st.fbCfg = null">{{ c }}</button>
      <button class="filter" title="Dodaj miasto" aria-label="Dodaj miasto" @click="newCity"><svg class="i"><use href="#plus"/></svg></button>
    </div>
  </div>
  <div class="seg as-tabs" role="tablist" aria-label="Statystyki ASB">
    <button v-for="t in TABS" :key="t[0]" role="tab" :aria-selected="st.tab === t[0]" :class="{ on: st.tab === t[0] }" @click="st.tab = t[0]; $event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })">{{ t[1] }}<i v-if="t[0] === 'events' && pending.length" class="as-dot">{{ pending.length }}</i><i v-if="t[0] === 'ads' && unassigned.length" class="as-dot">{{ unassigned.length }}</i></button>
  </div>
  <div v-if="st.busy && !st.events.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 5" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="st.error && !st.ev && !st.ad && !st.cfg" class="error">{{ st.error }}</p>

  <!-- ===== przegląd ===== -->
  <template v-else-if="st.tab === 'sum'">
    <p v-if="!events.length" class="note">Brak wydarzeń w tym okresie. Dodaj pierwsze w zakładce „Wydarzenia”.</p>
    <template v-else>
      <div class="as-kpis">
        <div class="as-kpi"><small>Większe wydarzenia</small><b>{{ kpi.n }}</b><span>okazje do głoszenia i relacji</span></div>
        <div class="as-kpi"><small>Obecności</small><b>{{ range(kpi.lo, kpi.hi) }}</b><span>śr. {{ dec(kpi.avgAtt) }} na wydarzenie<template v-if="kpi.noAtt"> · {{ kpi.noAtt }} bez liczby</template></span></div>
        <div class="as-kpi"><small>Znane wydatki</small><b>{{ pln0(kpi.known) }}</b><span>{{ kpi.perHead != null ? pln(kpi.perHead) + ' na obecność' : 'z rejestru' }}</span></div>
        <div class="as-kpi"><small>Promocja</small><b>{{ pln0(kpi.promo) }}</b><span>w tym Meta {{ pln0(kpi.meta) }}</span></div>
        <div class="as-kpi"><small>Nowe osoby</small><b>{{ int(kpi.newPeople) }}</b><span>{{ kpi.newCost != null ? 'szac. ' + pln(kpi.newCost) + ' na nową osobę' : 'rozpoznane uczestnictwa' }}</span></div>
        <div class="as-kpi"><small>Stali / bywalcy</small><b>{{ pct(regularShare.share) }}</b><span>cel: najwyżej {{ pct(regularShare.goal) }}</span></div>
        <div class="as-kpi"><small>Zwykłe spotkania</small><b>{{ regAvg == null ? '—' : dec(regAvg) }}</b><span>{{ cfg.grafik ? 'średnio osób (grafik ASB)' : 'włącz grafik w Ustawieniach' }}</span></div>
        <div class="as-kpi"><small>Facebook</small><b>{{ cfg.fb_followers != null ? int(cfg.fb_followers) : '—' }}</b><span>{{ cfg.fb_followers != null ? 'obserwujących' + (cfg.ig_followers != null ? ' · IG ' + int(cfg.ig_followers) : '') : 'połącz w Ustawieniach' }}</span></div>
      </div>

      <div v-if="pending.length || upcoming.length || unassigned.length" class="as-todo">
        <button v-for="m in pending" :key="m.id" @click="fromMeeting(m)"><svg class="i"><use href="#alert"/></svg><span><b>Uzupełnij: {{ m.topic || 'ewangelizacja' }}</b><small>{{ dmy(m.date) }} · z grafiku — dodaj frekwencję, źródła i koszty</small></span></button>
        <button v-if="unassigned.length" @click="st.tab = 'ads'; st.adFilter = 'bez'"><svg class="i"><use href="#link"/></svg><span><b>Reklamy bez wydarzenia: {{ unassigned.length }}</b><small>przypisz, żeby koszt trafił do właściwego spotkania</small></span></button>
        <div v-for="m in upcoming" :key="m.id" class="as-next"><svg class="i"><use href="#calendar"/></svg><span><b>Przed nami: {{ m.topic || 'ewangelizacja' }}</b><small>{{ dmy(m.date) }} · zaplanuj zaproszenia, promocję i kontakt po spotkaniu</small></span></div>
      </div>

      <div class="as-grid">
        <section class="as-card as-wide">
          <h3>Ile osób uczestniczyło?</h3>
          <p class="as-sub">Obecni na tle zapisów. Kreskowany pasek — szacunek albo przedział, gdy nie ma dokładnej liczby. Kliknij, żeby otworzyć wydarzenie.</p>
          <div class="as-legend"><span><i class="k-att"></i>Obecni</span><span><i class="k-su"></i>Zapisy</span></div>
          <div class="as-bars">
            <div v-for="r in attRows" :key="r.e.id" class="as-brow as-click" :title="r.e.name + ' · ' + dmy(r.e.date) + ' · obecni ' + (r.lo == null ? 'brak danych' : range(r.lo, r.hi)) + (r.su != null ? ' · zapisy ' + r.su : '') + ' · ' + QUALITY[r.e.quality]" @click="openEv(r.e)">
              <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }} · {{ QUALITY[r.e.quality] }}</small></span>
              <span class="as-track">
                <i v-if="r.su" class="as-su" :style="{ width: w(r.su, attMax) }"></i>
                <i v-if="r.lo != null" class="as-att" :class="{ est: r.e.quality !== 'potwierdzona' }" :style="{ width: w(r.hi, attMax) }"></i>
              </span>
              <span class="as-val">{{ r.lo == null ? '—' : range(r.lo, r.hi) }}</span>
            </div>
          </div>
        </section>
        <section class="as-card">
          <h3>Skąd przychodzą ludzie?</h3>
          <p class="as-sub">Deklarowane źródła — wskazanie kanału nie dowodzi, że to on przyprowadził.</p>
          <div class="as-bars">
            <div v-for="s in sources" :key="s.key" class="as-brow" :title="s.name + ': ' + s.n">
              <span class="as-lab"><b>{{ s.name }}</b></span>
              <span class="as-track"><i class="as-att" :class="{ muted: s.key === 'src_regular' }" :style="{ width: w(s.n, max(sources)) }"></i></span>
              <span class="as-val">{{ int(s.n) }}</span>
            </div>
          </div>
          <div v-if="regularShare.share != null" class="as-goal" :class="{ ok: regularShare.share <= regularShare.goal }">
            <div class="as-goal-top"><b>{{ pct(regularShare.share) }}</b><span>stali/bywalcy {{ regularShare.basis }} · {{ regularShare.reg }} z {{ regularShare.all }}</span></div>
            <div class="as-goal-track"><i :style="{ width: Math.min(100, regularShare.share * 100) + '%' }"></i><em :style="{ left: regularShare.goal * 100 + '%' }" :title="'Cel: najwyżej ' + pct(regularShare.goal)"></em></div>
            <small>Cel: najwyżej {{ pct(regularShare.goal) }}<template v-if="regularShare.share > regularShare.goal"> · brakuje {{ dec((regularShare.share - regularShare.goal) * 100) }} p.p.</template><template v-else> · osiągnięty</template></small>
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
      <p class="as-meth">Obecności to uczestnictwa, nie liczba różnych osób ani potwierdzonych wysłuchań Ewangelii. Zapisy to nie obecność. Pusta kwota — koszt nieznany, pusta frekwencja — brak danych. Koszty dotyczą wpisanych wydarzeń, nie całej służby ASB.</p>
    </template>
  </template>

  <!-- ===== frekwencja ===== -->
  <template v-else-if="st.tab === 'att'">
    <div class="as-grid">
      <section class="as-card as-wide">
        <h3>Spotkanie po spotkaniu</h3>
        <p class="as-sub">Każdy pomiar osobno: zwykłe spotkania z grafiku i większe wydarzenia. Oś to kolejność spotkań, nie czas — przerwy (np. wakacje) nie są zerami.</p>
        <div class="as-legend"><span><i class="k-reg"></i>Zwykłe spotkania ({{ timeline.nReg }})</span><span><i class="k-att"></i>Większe wydarzenia ({{ timeline.nEv }})</span></div>
        <p v-if="!timeline.pts.length" class="note">Brak pomiarów w tym okresie.</p>
        <ColChart v-else :items="timeline.pts.map(q => ({ label: dm(q.date), v: q.v, hi: q.ev, title: dmy(q.date) + ' · ' + q.label + ' · ' + q.v + ' os.' }))" :height="240" unit="os." label="Frekwencja kolejnych spotkań" />
        <p v-if="timeline.slopeReg != null || timeline.slopeEv != null" class="as-sub">Trend: zwykłe spotkania {{ timeline.slopeReg == null ? '—' : (timeline.slopeReg >= 0 ? '+' : '') + dec(timeline.slopeReg, 2) + ' os. na kolejne spotkanie' }}<template v-if="timeline.slopeEv != null"> · większe wydarzenia {{ (timeline.slopeEv >= 0 ? '+' : '') + dec(timeline.slopeEv, 2) }} os. na kolejne wydarzenie</template>. Linia trendu to uproszczenie, nie prognoza.</p>
      </section>
      <section v-if="signupRows.length" class="as-card">
        <h3>Zapisy a obecni</h3>
        <p class="as-sub">Wydarzenia z formularzem zapisów: ilu zapisanych to stali bywalcy, a ile osób faktycznie przyszło. Sumy zdarzeń, nie różnych osób.</p>
        <div class="as-legend"><span><i class="k-reg"></i>Zapisy: stali</span><span><i class="k-su"></i>Zapisy: pozostali</span><span><i class="k-att"></i>Obecni</span></div>
        <div class="as-bars">
          <div v-for="r in signupRows" :key="r.e.id" class="as-brow" :title="r.e.name + ' · zapisy ' + r.e.signups + ' (stali ' + r.reg + ') · obecni ' + (r.e.attendance ?? '—')">
            <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }}</small></span>
            <span class="as-track2"><span class="as-stack"><i class="as-reg" :style="{ width: w(r.reg, attMax) }"></i><i class="as-su" :style="{ width: w(r.other, attMax) }"></i></span><i class="as-att" :style="{ width: w(r.e.attendance, attMax) }"></i></span>
            <span class="as-val">{{ r.e.signups }}<small>{{ r.e.attendance ?? '—' }} obecnych</small></span>
          </div>
        </div>
        <p class="as-sub"><b>Razem:</b> {{ signupRows.reduce((t, r) => t + r.e.signups, 0) }} zapisów, {{ signupRows.reduce((t, r) => t + (r.e.attendance || 0), 0) }} obecnych.</p>
      </section>
      <section class="as-card" :class="{ 'as-wide': !signupRows.length }">
        <h3>Źródła na wydarzeniach</h3>
        <p class="as-sub">Deklaracje na każdym wydarzeniu. „Nieznane” to osoby (zapisane albo obecne) bez podanego źródła — brak informacji, nie brak uczestników.</p>
        <div class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Wydarzenie</th><th>Podstawa</th><th v-for="x in SRC" :key="x.key">{{ x.name }}</th><th>Nieznane</th></tr></thead>
            <tbody>
              <tr v-for="r in srcRows" :key="r.e.id" class="as-click" @click="openEv(r.e)">
                <td><b>{{ short(r.e.name, 30) }}</b><small>{{ dmy(r.e.date) }}</small></td>
                <td>{{ r.zap ? 'zapisy' : 'obecni' }} · {{ int(r.base) }}</td>
                <td v-for="(v, i) in r.vals" :key="i">{{ v == null ? '—' : v }}</td>
                <td class="as-unk">{{ r.unknown == null ? '—' : r.unknown }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="as-card as-wide">
        <h3>Zwykłe spotkania — średnia frekwencja w miesiącu</h3>
        <p class="as-sub">Cotygodniowe spotkania z grafiku ASB. Kropka przy liczbie — w tym miesiącu było większe wydarzenie. Brak danych to nie 0 osób.</p>
        <p v-if="!cfg.grafik" class="note">Włącz w Ustawieniach „frekwencja zwykłych spotkań z grafiku ASB”, żeby zobaczyć trend.</p>
        <p v-else-if="!trend.length" class="note">W grafiku nie ma jeszcze wpisanej frekwencji zwykłych spotkań w tym okresie.</p>
        <ColChart v-else :items="trend.map(t => ({ label: t.label, v: t.v, hi: true, mark: !!t.ev, title: t.label + ': średnio ' + dec(t.v) + ' os. z ' + t.n + ' spotkań' + (t.ev ? ' · większe wydarzenia: ' + t.ev : '') }))" unit="os." label="Średnia frekwencja zwykłych spotkań w miesiącach" />
      </section>
      <section class="as-card as-wide">
        <h3>Wpływ ewangelizacji na zwykłe spotkania</h3>
        <p class="as-sub">Średnia z maksymalnie 3 zwykłych spotkań przed i po wydarzeniu (bez przechodzenia przez sąsiednie wydarzenie). To obserwacja, nie dowód przyczyny — porównuj z trendem semestru.</p>
        <p v-if="!impact.length" class="note">Brak zwykłych spotkań z frekwencją wokół wydarzeń{{ cfg.grafik ? '' : ' — włącz grafik w Ustawieniach' }}.</p>
        <div v-else class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Wydarzenie</th><th>Przed</th><th>Po</th><th>Różnica</th></tr></thead>
            <tbody>
              <tr v-for="r in impact" :key="r.e.id">
                <td><b>{{ short(r.e.name, 40) }}</b><small>{{ dmy(r.e.date) }} · obecni {{ attLo(r.e) == null ? '—' : range(attLo(r.e), attHi(r.e)) }}</small></td>
                <td :title="r.before.map(m => dm(m.date) + ': ' + m.attendance).join(', ')">{{ dec(r.b) }}<small>{{ r.before.length }} spotk.</small></td>
                <td :title="r.after.map(m => dm(m.date) + ': ' + m.attendance).join(', ')">{{ dec(r.a) }}<small>{{ r.after.length }} spotk.</small></td>
                <td :class="{ up: r.diff > 0, down: r.diff < 0 }">{{ r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + dec(r.diff) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="as-card as-wide">
        <h3>Porównanie lat akademickich</h3>
        <p class="as-sub">Rok akademicki od września. Wszystkie lata miasta, niezależnie od wybranego okresu.</p>
        <div class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Rok</th><th>Wydarzenia</th><th>Obecności</th><th>Śr. na wydarzenie</th><th>Nowe osoby</th><th>Znane wydatki</th><th>Na obecność</th><th>Zwykłe spotkania</th></tr></thead>
            <tbody>
              <tr v-for="r in seasonRows" :key="r.s">
                <td><b>{{ r.s }}</b></td><td>{{ r.n }}</td><td>{{ range(r.lo, r.hi) }}</td><td>{{ dec(r.avgAtt) }}</td><td>{{ int(r.newPeople) }}</td><td>{{ pln0(r.known) }}</td><td>{{ pln(r.perHead) }}</td>
                <td>{{ r.reg == null ? '—' : dec(r.reg) }}<small v-if="r.regN">{{ r.regN }} spotk.</small></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </template>

  <!-- ===== koszty ===== -->
  <template v-else-if="st.tab === 'cost'">
    <div class="as-grid">
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
        <h3>Koszt na jedną obecność</h3>
        <p class="as-sub">Znany koszt ÷ obecni. Porównanie wydatków, nie wartości spotkania ani człowieka.</p>
        <p v-if="!headRows.length" class="note">Brak wydarzeń z kosztem i frekwencją.</p>
        <div class="as-bars">
          <div v-for="r in headRows" :key="r.e.id" class="as-brow as-click" :title="r.e.name + ': ' + pln(evCost(r.e)) + ' / ' + r.e.attendance + ' os.'" @click="openEv(r.e)">
            <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }}</small></span>
            <span class="as-track"><i class="as-att" :class="{ est: r.e.quality !== 'potwierdzona' }" :style="{ width: w(r.v, headMax) }"></i></span>
            <span class="as-val">{{ pln(r.v) }}</span>
          </div>
        </div>
      </section>
      <section class="as-card as-wide">
        <h3>Meta czy druk? Wydatki na promocję wydarzeń</h3>
        <p class="as-sub">Reklamy Meta przypisane do wydarzenia i druk (plakaty + ulotki).</p>
        <div class="as-legend"><span><i class="k-att"></i>Meta</span><span><i class="k-print"></i>Druk</span></div>
        <div class="as-bars">
          <div v-for="r in printRows" :key="r.e.id" class="as-brow" :title="r.e.name + ' · Meta ' + pln(r.meta) + ' · druk ' + pln(r.print)">
            <span class="as-lab"><b>{{ short(r.e.name) }}</b><small>{{ dmy(r.e.date) }}</small></span>
            <span class="as-track2"><i class="as-att" :style="{ width: w(r.meta, printMax) }"></i><i class="as-print" :style="{ width: w(r.print, printMax) }"></i></span>
            <span class="as-val">{{ pln0(r.meta) }}<small>{{ pln0(r.print) }}</small></span>
          </div>
        </div>
      </section>
      <section class="as-card as-wide">
        <h3>Koszty wydarzeń</h3>
        <div class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Wydarzenie</th><th>Sala</th><th>Druk</th><th>Meta</th><th>Inne</th><th>Razem</th><th>Na obecność</th><th>Meta / obecny</th><th>Kompletność</th></tr></thead>
            <tbody>
              <tr v-for="e in events" :key="e.id" class="as-click" @click="openEv(e)">
                <td><b>{{ short(e.name, 40) }}</b><small>{{ dmy(e.date) }}</small></td>
                <td>{{ pln0(e.cost_room) }}</td>
                <td>{{ e.cost_posters == null && e.cost_flyers == null ? '—' : pln0((e.cost_posters || 0) + (e.cost_flyers || 0)) }}</td>
                <td>{{ metaOf(e) ? pln0(metaOf(e)) : '—' }}</td>
                <td>{{ pln0(otherOf(e)) }}</td>
                <td><b>{{ pln(evCost(e)) }}</b></td>
                <td>{{ pln(perHead(e)) }}</td>
                <td>{{ metaOf(e) && e.attendance ? pln(metaOf(e) / e.attendance) : '—' }}</td>
                <td>{{ COST_ST[e.cost_status] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="as-sub">Meta na obecnego to nie koszt pozyskania — nie wiemy, kto przyszedł dzięki reklamie.</p>
      </section>
      <section class="as-card">
        <h3>Druk — ilości i koszty</h3>
        <p class="as-sub">Ilości to plan albo model podziału nakładu cyklu, nie potwierdzony druk ani rozdanie.</p>
        <div class="as-mini">
          <div><small>Plakaty</small><b>{{ int(print.posters || null) }} szt.</b><span class="as-mini-s">{{ pln(print.costPosters) }}</span></div>
          <div><small>Ulotki</small><b>{{ int(print.flyers || null) }} szt.</b><span class="as-mini-s">{{ pln(print.costFlyers) }}</span></div>
          <div><small>Koszt 1 plakatu</small><b>{{ pln(print.perPoster) }}</b></div>
          <div><small>Koszt 1 ulotki</small><b>{{ pln(print.perFlyer) }}</b></div>
          <div><small>Wskazania „plakat”</small><b>{{ int(print.posterTraces) }}</b><span class="as-mini-s">ze źródeł o różnych podstawach</span></div>
        </div>
      </section>
    </div>
  </template>

  <!-- ===== promocja ===== -->
  <template v-else-if="st.tab === 'promo'">
    <div class="as-grid">
      <section class="as-card">
        <h3>Jak docieramy do studentów?</h3>
        <p class="as-sub">Osobne miary reklam Meta — nie jedna ścieżka tych samych osób.</p>
        <div class="as-mini">
          <div><small>Wyświetlenia</small><b>{{ int(kpi.imp) }}</b></div>
          <div><small>Zasięg (suma reklam)</small><b>{{ int(kpi.reach) }}</b></div>
          <div><small>Kliknięcia linków</small><b>{{ int(kpi.clicks) }}</b></div>
          <div><small>Kliknięcia / wyświetlenia</small><b>{{ kpi.ctr == null ? '—' : dec(kpi.ctr * 100, 2) + '%' }}</b></div>
          <div><small>Koszt kliknięcia</small><b>{{ pln(kpi.cpc) }}</b></div>
          <div><small>Koszt 1000 wyświetleń</small><b>{{ pln(kpi.cpm) }}</b></div>
          <div><small>Reakcje na wydarzenia</small><b>{{ int(kpi.reactN) }}</b></div>
          <div><small>Średni koszt reakcji</small><b>{{ pln(kpi.reactCost) }}</b></div>
        </div>
      </section>
      <section class="as-card">
        <h3>Lejek obserwacyjny</h3>
        <p class="as-sub">Różne grupy i podstawy pomiaru — kolejne poziomy to nie te same osoby.</p>
        <div class="as-funnel">
          <div><b>{{ int(kpi.imp) }}</b><span>wyświetleń reklam</span></div>
          <div><b>{{ int(kpi.clicks) }}</b><span>kliknięć w link</span></div>
          <div><b>{{ int(sources.find(s => s.key === 'src_social').n) }}</b><span>deklaracji „social media”</span></div>
          <div><b>{{ range(kpi.lo, kpi.hi) }}</b><span>obecności na wydarzeniach</span></div>
        </div>
      </section>
      <section class="as-card as-wide">
        <h3>Reklamy — wskaźniki</h3>
        <p class="as-sub">Koszt kliknięcia (CPC), kliknięcia na wyświetlenia (CTR), koszt 1000 wyświetleń (CPM) i koszt wyniku. Wyniki różnych celów to różne jednostki.</p>
        <div class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Reklama</th><th>Wydano</th><th>Wyświetlenia</th><th>Zasięg</th><th>Kliknięcia</th><th>CTR</th><th>CPC</th><th>CPM</th><th>Wynik</th><th>Koszt wyniku</th></tr></thead>
            <tbody>
              <tr v-for="r in adRows" :key="r.a.id" class="as-click" @click="openAd(r.a)">
                <td><b>{{ short(r.a.name, 40) }}</b><small>{{ dmy(r.a.date) }} · {{ GOALS[r.a.goal] }}</small></td>
                <td>{{ pln(r.a.spent) }}</td><td>{{ int(r.a.impressions) }}</td><td>{{ int(r.a.reach) }}</td><td>{{ int(r.a.link_clicks) }}</td>
                <td>{{ r.ctr == null ? '—' : dec(r.ctr * 100, 2) + '%' }}</td><td>{{ pln(r.cpc) }}</td><td>{{ pln(r.cpm) }}</td>
                <td>{{ int(r.a.results) }}</td><td>{{ pln(r.cpr) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-if="placements.length" class="as-card">
        <h3>Miejsca emisji (częściowe)</h3>
        <p class="as-sub">Odczyty dostępne tylko dla części reklam — to nie wydatki ani unikalny zasięg; nie dzielą kosztu na Facebook i Instagram.</p>
        <div class="as-bars">
          <div v-for="pl in placements" :key="pl.name" class="as-brow" :title="pl.name + ': ' + pl.v">
            <span class="as-lab"><b>{{ pl.name }}</b></span>
            <span class="as-track"><i class="as-att muted" :style="{ width: w(pl.v, max(placements)) }"></i></span>
            <span class="as-val">{{ int(pl.v) }}</span>
          </div>
        </div>
      </section>
      <section class="as-card">
        <h3>Na co wydano budżet Meta?</h3>
        <p class="as-sub">Według celu kampanii. Cel to powód wydatku, nie osiągnięta frekwencja.</p>
        <div class="as-bars">
          <div v-for="g in goalRows" :key="g.name" class="as-brow" :title="g.name + ': ' + pln(g.v) + ' · ' + g.n + ' reklam'">
            <span class="as-lab"><b>{{ g.name }}</b><small>reklam: {{ g.n }}</small></span>
            <span class="as-track"><i class="as-att" :style="{ width: w(g.v, max(goalRows)) }"></i></span>
            <span class="as-val">{{ pln(g.v) }}<small>{{ g.cpc != null ? 'CPC ' + pln(g.cpc) : '' }}{{ g.cpm != null ? ' · CPM ' + pln(g.cpm) : '' }}</small></span>
          </div>
        </div>
      </section>
      <section class="as-card">
        <h3>Ranking kampanii Meta</h3>
        <p class="as-sub">Koszt jednej reakcji na wydarzenie — niżej taniej.</p>
        <p v-if="!ranking.length" class="note">Brak kampanii z celem „reakcje na wydarzenie”.</p>
        <ol class="as-rank">
          <li v-for="(r, i) in ranking" :key="r.a.id" :title="r.a.name + ' · ' + r.a.results + ' reakcji · ' + pln(r.a.spent)"><span>{{ i + 1 }}.</span><b>{{ short(evById[r.a.event_id]?.name || r.a.name) }}</b><em>{{ pln(r.v) }}</em></li>
        </ol>
      </section>
      <section class="as-card as-wide">
        <h3>Wydarzenia na Facebooku — deklaracje a frekwencja</h3>
        <p class="as-sub">„Wezmę udział” i „zainteresowani” ze strony na Facebooku obok faktycznej frekwencji. Deklaracja to nie obecność.</p>
        <p v-if="!fbRows.length" class="note">{{ cfg.fb_synced ? 'Brak wydarzeń z Facebooka w tym okresie.' : 'Połącz stronę na Facebooku w Ustawieniach i pobierz dane.' }}</p>
        <div v-else class="as-table-wrap">
          <table class="as-table">
            <thead><tr><th>Wydarzenie na Facebooku</th><th>Wezmę udział</th><th>Zainteresowani</th><th>Obecni</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in fbRows" :key="r.f.id">
                <td><b>{{ short(r.f.name, 44) }}</b><small>{{ dmy(r.d) }}<template v-if="r.f.place"> · {{ r.f.place }}</template></small></td>
                <td>{{ int(r.f.attending) }}</td><td>{{ int(r.f.interested) }}</td>
                <td>{{ r.e && attLo(r.e) != null ? range(attLo(r.e), attHi(r.e)) : '—' }}</td>
                <td><button v-if="!r.e" class="as-mini-btn" @click="fromFb(r.f)">Dodaj do statystyk</button><button v-else class="as-mini-btn" @click="openEv(r.e)">Otwórz</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </template>

  <!-- ===== wydarzenia ===== -->
  <template v-else-if="st.tab === 'events'">
    <div class="as-head"><p class="as-sub">Większe wydarzenia (np. ewangelizacyjne). Zwykłych cotygodniowych spotkań tu nie wpisujemy — ich frekwencja jest w grafiku ASB.</p><button class="primary" @click="openEv(null)"><svg class="i"><use href="#plus"/></svg>Wydarzenie</button></div>
    <div v-if="pending.length" class="as-todo">
      <button v-for="m in pending" :key="m.id" @click="fromMeeting(m)"><svg class="i"><use href="#alert"/></svg><span><b>Z grafiku: {{ m.topic || 'ewangelizacja' }}</b><small>{{ dmy(m.date) }} · dodaj do statystyk</small></span></button>
    </div>
    <p v-if="!events.length" class="note">Brak wydarzeń w tym okresie.</p>
    <div class="as-list">
      <button v-for="e in [...events].reverse()" :key="e.id" class="as-item" @click="openEv(e)">
        <span class="as-date">{{ dmy(e.date) }}</span>
        <span class="as-main"><b>{{ e.name }}</b><small>{{ [e.place, e.kind].filter(Boolean).join(' · ') }}<template v-if="e.fb_event_id"> · Facebook</template><template v-if="e.meeting_id"> · grafik</template></small></span>
        <span class="as-nums">
          <span><small>Obecni</small><b>{{ attLo(e) == null ? '—' : range(attLo(e), attHi(e)) }}</b><i :class="'q-' + e.quality">{{ QUALITY[e.quality] }}</i></span>
          <span><small>Koszt</small><b>{{ pln(evCost(e)) }}</b><i>{{ perHead(e) != null ? pln(perHead(e)) + '/os.' : COST_ST[e.cost_status] }}</i></span>
        </span>
      </button>
    </div>
  </template>

  <!-- ===== reklamy ===== -->
  <template v-else-if="st.tab === 'ads'">
    <div class="as-head">
      <p class="as-sub">Jedna reklama Meta = jeden wpis. Pobrane z Facebooka aktualizują się same; przypisanie do wydarzenia i uwagi zostają.</p>
      <div class="as-head-btns">
        <button :disabled="st.fb.busy" @click="fbSync"><svg class="i"><use href="#refresh"/></svg>{{ st.fb.busy ? 'Pobieram…' : 'Pobierz z Facebooka' }}</button>
        <button class="primary" @click="openAd(null)"><svg class="i"><use href="#plus"/></svg>Reklama</button>
      </div>
    </div>
    <p v-if="st.fb.msg" class="as-ok">{{ st.fb.msg }}</p>
    <p v-if="st.fb.error" class="error">{{ st.fb.error }}<template v-if="st.fb.setup"> Zobacz zakładkę „Ustawienia”.</template></p>
    <div class="as-chips as-filter">
      <button class="filter" :class="{ on: !st.adFilter }" @click="st.adFilter = ''">Wszystkie ({{ ads.length }})</button>
      <button class="filter" :class="{ on: st.adFilter === 'bez' }" @click="st.adFilter = 'bez'">Bez wydarzenia ({{ unassigned.length }})</button>
    </div>
    <p v-if="!adsShown.length" class="note">Brak reklam.</p>
    <div class="as-list">
      <button v-for="a in adsShown" :key="a.id" class="as-item" @click="openAd(a)">
        <span class="as-date">{{ dmy(a.date) }}</span>
        <span class="as-main"><b>{{ a.name }}</b><small>{{ GOALS[a.goal] }} · {{ evById[a.event_id] ? evById[a.event_id].name : 'bez wydarzenia' }}<template v-if="a.fb_id"> · Facebook</template></small></span>
        <span class="as-nums">
          <span><small>Wydano</small><b>{{ pln(a.spent) }}</b><i>{{ int(a.impressions) }} wyśw.</i></span>
          <span><small>Wynik</small><b>{{ int(a.results) }}</b><i>{{ a.results && a.spent != null ? pln(a.spent / a.results) + '/wynik' : int(a.link_clicks) + ' klik.' }}</i></span>
        </span>
      </button>
    </div>
  </template>

  <!-- ===== ankiety ===== -->
  <template v-else-if="st.tab === 'surveys'">
    <AsbSurveys :surveys="st.surveys" :answers="st.answers" :events="st.events" :city="st.city" @changed="loadSurveys" />
  </template>

  <!-- ===== ustawienia ===== -->
  <template v-else>
    <div class="as-grid">
      <section class="as-card">
        <div class="as-card-head"><h3>Cel i działania · {{ st.city }}</h3><button @click="openCfg"><svg class="i"><use href="#pencil"/></svg>Zmień</button></div>
        <p class="as-sub">Cel: najwyżej {{ cfg.regular_goal ?? 50 }}% deklaracji „stali/bywalcy” w zapisach. To struktura zapisów, nie odsetek nowych osób.</p>
        <p v-if="!(cfg.actions || []).length" class="note">Brak działań — dopisz wnioski po ostatnich wydarzeniach.</p>
        <ol class="as-acts-ol"><li v-for="(a, i) in cfg.actions" :key="i">{{ a.title }}</li></ol>
      </section>
      <section class="as-card as-wide">
        <h3>Jak czytać liczby — zasady analizy</h3>
        <ol class="as-method"><li v-for="(m, i) in METHOD" :key="i"><b>{{ m[0] }}.</b> {{ m[1] }}</li></ol>
      </section>
      <section class="as-card">
        <h3>Facebook, Instagram i grafik · {{ st.city }}</h3>
        <p class="as-sub">Reklamy, obserwujący i wydarzenia ze strony pobierane przyciskiem — trafiają do statystyk tego miasta. Ostatnio: {{ ago(cfg.fb_synced) }}.</p>
        <label class="as-f">Strona na Facebooku — identyfikator<input v-model="fbForm.fb_page" placeholder="np. 100064…" autocomplete="off"></label>
        <label class="as-f">Konto reklamowe — identyfikator<input v-model="fbForm.fb_ad_account" placeholder="np. act_1234567890" autocomplete="off"></label>
        <label class="as-f">Token dostępu Meta<input v-model="st.tokenIn" type="password" autocomplete="new-password" spellcheck="false" :placeholder="cfg.fb_token_hint ? 'Zapisany (' + cfg.fb_token_hint + ') — wklej nowy, żeby zmienić' : 'Wklej token'"></label>
        <p class="as-sub">{{ cfg.fb_token_hint ? 'Token zapisany ' + ago(cfg.fb_token_set) + '. ' : '' }}Token trafia do zamkniętej części bazy: nikt w aplikacji go nie odczyta, widać tylko 4 ostatnie znaki. Używa go wyłącznie serwer przy pobieraniu.<button v-if="cfg.fb_token_hint" class="as-link" :disabled="st.saving" @click="clearToken">Usuń token</button></p>
        <label class="as-check"><input v-model="fbForm.grafik" type="checkbox"><span>Frekwencja zwykłych spotkań z grafiku ASB należy do tego miasta (trend, wpływ ewangelizacji, ewangelizacje do uzupełnienia)</span></label>
        <div class="as-row-btns">
          <button :disabled="st.saving" @click="saveFb">Zapisz</button>
          <button class="primary" :disabled="st.fb.busy || (!cfg.fb_page && !cfg.fb_ad_account) || !cfg.fb_token_hint" @click="fbSync"><svg class="i"><use href="#refresh"/></svg>{{ st.fb.busy ? 'Pobieram…' : 'Pobierz teraz' }}</button>
        </div>
        <p v-if="st.fb.msg" class="as-ok">{{ st.fb.msg }}</p>
        <p v-if="st.fb.error" class="error">{{ st.fb.error }}</p>
        <details class="as-help" :open="st.fb.setup">
          <summary>Jak połączyć (jednorazowo, administrator strony)</summary>
          <ol>
            <li>W <b>Meta Business Suite → Ustawienia firmy</b> sprawdź, że strona ASB i konto reklamowe należą do firmy (Business Managera).</li>
            <li><b>Użytkownicy → Użytkownicy systemowi</b>: dodaj użytkownika (rola Administrator) i przypisz mu stronę oraz konto reklamowe.</li>
            <li>W <b>developers.facebook.com</b> utwórz aplikację typu „Business” połączoną z firmą. U użytkownika systemowego wybierz <b>Wygeneruj token</b>: ta aplikacja, uprawnienia <code>ads_read</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>read_insights</code>, ważność „Nigdy”.</li>
            <li>Wklej token w pole „Token dostępu Meta” powyżej. Wpisz też identyfikator strony (Strona → Informacje → Przejrzystość strony) i konta reklamowego (Menedżer reklam, liczba po <code>act=</code> w adresie, z przedrostkiem <code>act_</code>). Zapisz i kliknij „Pobierz teraz”.</li>
            <li>Token z narzędzia „Graph API Explorer” też zadziała, ale wygasa po kilku godzinach — wtedy aplikacja poprosi o nowy.</li>
          </ol>
        </details>
      </section>
    </div>
  </template>

  <!-- ===== okno: wydarzenie ===== -->
  <Teleport to="body">
    <div v-if="st.ev" class="np-overlay" @click.self="st.ev = null" @keydown.esc="st.ev = null">
      <div class="np-panel as-dlg" role="dialog" aria-modal="true" :aria-label="st.ev.id ? 'Wydarzenie' : 'Nowe wydarzenie'">
        <div class="as-dhead"><b>{{ st.ev.id ? 'Wydarzenie' : 'Nowe wydarzenie' }}</b><button class="icon" aria-label="Zamknij" @click="st.ev = null"><svg class="i"><use href="#x"/></svg></button></div>
        <div v-if="st.ev.id && evById[st.ev.id]" class="seg as-evtabs" role="tablist" aria-label="Wydarzenie">
          <button role="tab" :aria-selected="st.evTab === 'dane'" :class="{ on: st.evTab === 'dane' }" @click="st.evTab = 'dane'">Dane</button>
          <button role="tab" :aria-selected="st.evTab === 'ankieta'" :class="{ on: st.evTab === 'ankieta' }" @click="st.evTab = 'ankieta'">Ankieta<template v-if="st.answers.some(a => st.surveys.some(x => x.id === a.survey && x.event_id === st.ev.id))"> ({{ st.answers.filter(a => st.surveys.some(x => x.id === a.survey && x.event_id === st.ev.id)).length }})</template></button>
        </div>
        <div v-if="st.evTab === 'ankieta' && st.ev.id" class="as-dbody as-dbody-sv">
          <AsbSurveys :surveys="st.surveys" :answers="st.answers" :events="st.events" :city="st.city" :event-id="st.ev.id" @changed="loadSurveys" />
        </div>
        <div v-show="st.evTab !== 'ankieta' || !st.ev.id" class="as-dbody">
          <label class="as-f wide">Nazwa<input v-model="st.ev.name" maxlength="140" autocomplete="off"></label>
          <label class="as-f">Data<input v-model="st.ev.date" type="date"></label>
          <label class="as-f">Miejsce<input v-model="st.ev.place" maxlength="80" autocomplete="off"></label>
          <label class="as-f">Rodzaj<input v-model="st.ev.kind" maxlength="40" autocomplete="off"></label>
          <label class="as-f wide">Spotkanie w grafiku ASB<select class="field" :value="st.ev.meeting_id || ''" @change="pickMeeting($event.target.value)"><option value="">— brak —</option><option v-for="m in meetingOptions" :key="m.id" :value="m.id">{{ dmy(m.date) }} · {{ m.topic || m.kind }}</option></select></label>
          <label v-if="fbOptions.length" class="as-f wide">Wydarzenie na Facebooku<select class="field" v-model="st.ev.fb_event_id"><option :value="null">— brak —</option><option v-for="f in fbOptions" :key="f.id" :value="f.id">{{ dmy((f.start_time || '').slice(0, 10)) }} · {{ f.name }}</option></select></label>
          <h4>Frekwencja</h4>
          <label class="as-f">Zapisy<input v-model="st.ev.signups" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Obecni<input v-model="st.ev.attendance" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Jakość<select class="field" v-model="st.ev.quality"><option v-for="(v, k) in QUALITY" :key="k" :value="k">{{ v }}</option></select></label>
          <label class="as-f">Nowe osoby<input v-model="st.ev.new_people" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f" title="Ile razy te same nowe osoby przyszły ponownie w tym cyklu — odejmowane przy liczeniu różnych osób">Powtórne wizyty nowych<input v-model="st.ev.new_repeat" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Gdy brak liczby: od<input v-model="st.ev.att_min" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">do<input v-model="st.ev.att_max" type="number" min="0" inputmode="numeric"></label>
          <h4>Źródła dotarcia (deklaracje)</h4>
          <div v-if="surveySrc(st.ev.id).n" class="as-svhint wide">
            <span><b>Z ankiety ({{ surveySrc(st.ev.id).n }} odp.):</b> {{ SOURCE_OPTS.filter(o => surveySrc(st.ev.id).counts[o[0]]).map(o => o[1] + ' ' + surveySrc(st.ev.id).counts[o[0]]).join(' · ') || 'brak' }}</span>
            <button @click="useSurveySrc">Wpisz z ankiety</button>
          </div>
          <label v-for="s in SRC" :key="s.key" class="as-f">{{ s.name }}<input v-model="st.ev[s.key]" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Skąd dane<select class="field" v-model="st.ev.src_basis"><option v-for="(v, k) in BASIS" :key="k" :value="k">{{ v }}</option></select></label>
          <h4>Koszty [zł] — puste = nieznane, nie 0</h4>
          <label v-for="c in COSTS" :key="c.key" class="as-f">{{ c.name }}<input v-model="st.ev[c.key]" type="number" min="0" step="0.01" inputmode="decimal"></label>
          <label class="as-f">Plakaty [szt]<input v-model="st.ev.print_posters" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Ulotki [szt]<input v-model="st.ev.print_flyers" type="number" min="0" inputmode="numeric"></label>
          <label class="as-f">Cykl (koszty wspólne)<input v-model="st.ev.cycle" maxlength="60" placeholder="np. Kwiecień 2025" autocomplete="off"></label>
          <label class="as-f">Kompletność<select class="field" v-model="st.ev.cost_status"><option v-for="(v, k) in COST_ST" :key="k" :value="k">{{ v }}</option></select></label>
          <p v-if="st.ev.id && metaOf(st.ev)" class="as-sub wide">Reklamy Meta przypisane do wydarzenia: {{ pln(metaOf(st.ev)) }} — doliczane same, nie wpisuj ich tutaj.</p>
          <label class="as-f wide">Uwagi<textarea v-model="st.ev.note" rows="3" maxlength="2000"></textarea></label>
        </div>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="as-dfoot">
          <button v-if="st.ev.id && evById[st.ev.id] && st.evTab !== 'ankieta'" class="danger" :disabled="st.saving" @click="remove('ev')"><svg class="i"><use href="#trash"/></svg>Usuń</button>
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
        <p v-if="st.ad.fb_id" class="as-sub">Pobrana z Facebooka{{ st.ad.campaign ? ' · kampania „' + st.ad.campaign + '”' : '' }}. Liczby nadpisze następne pobranie — tu zmieniaj przypisanie, cel i uwagi.</p>
        <div class="as-dbody">
          <label class="as-f wide">Nazwa<input v-model="st.ad.name" maxlength="140" autocomplete="off"></label>
          <label class="as-f">Data uruchomienia<input v-model="st.ad.date" type="date"></label>
          <label class="as-f span2">Cel kampanii<select class="field" v-model="st.ad.goal"><option v-for="(v, k) in GOALS" :key="k" :value="k">{{ v }}</option></select></label>
          <label class="as-f wide">Wydarzenie<select class="field" v-model="st.ad.event_id"><option :value="null">— bez przypisania —</option><option v-for="e in evOptions" :key="e.id" :value="e.id">{{ dmy(e.date) }} · {{ e.name }}</option></select></label>
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
.as-chips .filter { border: 1px solid var(--line) !important; color: var(--text) !important; background: transparent !important; }
.as-chips .filter.on { background: var(--accent) !important; border-color: var(--accent) !important; color: #2a1906 !important; font-weight: 600; }
@media (hover: hover) { .as-chips .filter:not(.on):hover { background: var(--panel2) !important; } }
.as-tabs { overflow-x: auto; scrollbar-width: none; }
.as-tabs::-webkit-scrollbar { display: none; }
.as-tabs button { flex: 1 0 auto; min-width: 0; padding: 6px 12px; white-space: nowrap; }
.as-dot { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #2a1906; font-size: 11px; font-style: normal; font-weight: 700; }
.as-sub { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.as-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.as-kpi { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.as-kpi small { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.as-kpi b { font-size: clamp(22px, 3.4vw, 28px); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-kpi span { color: var(--muted); font-size: 12.5px; }
.as-todo { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.as-todo > button, .as-next { display: flex !important; align-items: center; justify-content: flex-start !important; gap: 12px; padding: 10px 14px !important; min-height: 0 !important; border-radius: 14px !important; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent) !important; background: color-mix(in srgb, var(--accent) 8%, var(--panel)) !important; color: var(--text) !important; font-weight: 400 !important; text-align: left; box-shadow: none !important; }
.as-next { border-color: var(--line) !important; background: var(--panel) !important; }
.as-todo svg.i { flex: none; width: 18px; height: 18px; color: var(--accent-text); }
.as-todo span { display: flex; flex-direction: column; }
.as-todo b { font-size: 14px; }
.as-todo small { color: var(--muted); font-size: 12.5px; }
.as-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 12px; }
.as-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.as-card h3 { margin: 0; font-size: 15.5px; font-weight: 650; }
.as-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.as-wide { grid-column: 1 / -1; }
.as-legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--muted); }
.as-legend span { display: inline-flex; align-items: center; gap: 6px; }
.as-legend i { width: 12px; height: 12px; border-radius: 3px; }
.k-att { background: var(--accent); }
.k-su { background: color-mix(in srgb, var(--accent) 28%, var(--panel2)); }
.k-print { background: var(--muted); }
.k-reg, .as-reg { background: color-mix(in srgb, var(--text) 45%, var(--panel3)); }
.as-stack { display: flex; height: 8px; }
.as-stack i { display: block; height: 8px; }
.as-stack i:last-child { border-radius: 0 4px 4px 0; }
.as-tl { display: flex; align-items: flex-end; gap: 3px; height: 180px; padding-top: 6px; overflow-x: auto; }
.as-tl-c { flex: 1 0 8px; min-width: 8px; height: 100%; padding: 0 !important; border: 0 !important; background: none; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; border-radius: 4px; }
@media (hover: hover) { .as-tl-c:hover { background: var(--panel2); } }
.as-tl-b { display: block; flex: none; width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--text) 45%, var(--panel3)); }
.as-tl-c.ev .as-tl-b { background: var(--accent); }
.as-unk { color: var(--muted); }
.as-mini-s { color: var(--muted); font-size: 12px; }
.as-method { margin: 0; padding-left: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 8px 24px; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
.as-method b { color: var(--text); }
.as-bars { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.as-brow { display: grid; grid-template-columns: minmax(110px, 34%) 1fr auto; gap: 10px; align-items: center; min-height: 34px; padding: 2px 4px; border-radius: 8px; }
.as-click { cursor: pointer; }
@media (hover: hover) { .as-brow:hover { background: var(--panel2); } }
.as-lab { display: flex; flex-direction: column; min-width: 0; }
.as-lab b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-lab small { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-track { position: relative; height: 14px; }
/* wspólna oś zerowa — wszystkie słupki startują z tej samej linii */
.as-track::before, .as-track2::before { content: ''; position: absolute; left: 0; top: -4px; bottom: -4px; width: 1px; background: color-mix(in srgb, var(--muted) 55%, transparent); }
.as-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 0 4px 4px 0; }
.as-track2 { position: relative; display: flex; flex-direction: column; gap: 2px; }
.as-track2 i { display: block; height: 8px; border-radius: 0 4px 4px 0; }
.as-print { background: var(--muted); }
.as-att { background: var(--accent); }
.as-att.muted { background: color-mix(in srgb, var(--accent) 45%, var(--panel3)); }
.as-att.est { background: repeating-linear-gradient(135deg, var(--accent) 0 5px, color-mix(in srgb, var(--accent) 60%, var(--panel)) 5px 8px); }
.as-su { background: color-mix(in srgb, var(--accent) 28%, var(--panel2)); }
.as-val { display: flex; flex-direction: column; align-items: flex-end; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; min-width: 64px; }
.as-val small { color: var(--muted); font-weight: 500; font-size: 11.5px; }
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
.as-funnel { display: flex; flex-direction: column; gap: 6px; }
.as-funnel div { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border-radius: 12px; background: var(--panel2); }
.as-funnel div:nth-child(2) { margin-left: 6%; }
.as-funnel div:nth-child(3) { margin-left: 12%; }
.as-funnel div:nth-child(4) { margin-left: 18%; }
.as-funnel b { font-size: 18px; font-variant-numeric: tabular-nums; min-width: 84px; }
.as-funnel span { color: var(--muted); font-size: 13px; }
.as-rank { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.as-rank li { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; min-height: 32px; padding: 0 6px; border-radius: 8px; font-size: 13.5px; }
.as-rank li:nth-child(odd) { background: var(--panel2); }
.as-rank span { color: var(--muted); font-variant-numeric: tabular-nums; }
.as-rank b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-rank em { font-style: normal; font-weight: 600; font-variant-numeric: tabular-nums; }
.as-cols { display: flex; gap: 6px; align-items: stretch; height: 200px; overflow-x: auto; padding-top: 4px; }
.as-col { flex: 1 0 34px; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 34px; }
.as-cval { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.as-cev { font-style: normal; color: var(--accent-text); margin-left: 2px; }
.as-cbar { flex: 1; width: 70%; max-width: 40px; display: flex; align-items: flex-end; }
.as-cbar i { display: block; width: 100%; border-radius: 4px 4px 0 0; background: var(--accent); }
.as-clab { font-size: 11px; color: var(--muted); white-space: nowrap; }
.as-table-wrap { overflow-x: auto; margin: 0 -4px; }
.as-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.as-table th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.as-table td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; }
.as-table td:first-child { white-space: normal; min-width: 160px; }
.as-table td b { font-weight: 600; }
.as-table td small { display: block; color: var(--muted); font-size: 11.5px; }
.as-table td.up { color: var(--ok); font-weight: 600; }
.as-table td.down { color: var(--warn, #d9822b); font-weight: 600; }
@media (hover: hover) { .as-table tr.as-click:hover td { background: var(--panel2); } }
.as-mini-btn { min-height: 28px !important; padding: 0 10px !important; font-size: 12.5px; }
.as-acts-view { margin-top: 12px; }
.as-acts-view ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 10px; }
.as-acts-view li b { display: block; font-size: 14px; }
.as-acts-view li span { color: var(--muted); font-size: 13.5px; line-height: 1.45; }
.as-acts-ol { margin: 0; padding-left: 20px; font-size: 13.5px; display: flex; flex-direction: column; gap: 4px; }
.as-meth { margin: 14px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; max-width: 90ch; }
.as-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
.as-head .as-sub { flex: 1 1 300px; }
.as-head-btns, .as-row-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.as-filter { margin-bottom: 10px; }
.as-ok { margin: 0 0 10px; color: var(--ok); font-size: 13.5px; }
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
.as-link { display: inline !important; min-height: 0 !important; padding: 0 0 0 6px !important; border: 0 !important; background: none !important; color: var(--danger, #e5534b) !important; font-size: 13px; font-weight: 600 !important; text-decoration: underline; box-shadow: none !important; }
.as-evtabs { max-width: 320px; margin: 0; }
.as-dbody.as-dbody-sv { display: block; }
.as-svhint { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 12%, var(--panel2)); font-size: 13px; }
.as-svhint button { min-height: 34px !important; padding: 0 12px !important; font-size: 13px; }
.as-check { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; cursor: pointer; }
.as-check input { margin-top: 2px; width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
.as-help { margin-top: 6px; padding: 10px 12px; border-radius: 12px; background: var(--panel2); font-size: 13px; line-height: 1.5; }
.as-help summary { cursor: pointer; font-weight: 600; }
.as-help ol { margin: 8px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: var(--muted); }
.as-help b, .as-help code { color: var(--text); }
@media (max-width: 1100px) { .as-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .as-item { grid-template-columns: 1fr; gap: 6px; }
  .as-nums { justify-content: flex-start; }
  .as-nums > span { align-items: flex-start; }
  .as-brow { grid-template-columns: 1fr auto; gap: 2px 10px; padding: 4px 2px; }
  .as-brow .as-lab { grid-column: 1 / -1; flex-direction: row; gap: 6px; align-items: baseline; }
  .as-tabs button { font-size: 13px; padding: 6px 10px; }
  .as-kpi { padding: 12px; }
}
.as-dlg { gap: 10px; }
@media (min-width: 720px) { .as-dlg { width: min(680px, 100%) !important; } }
.as-dhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.as-dhead b { font-size: 17px; }
.as-dbody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr)); gap: 10px; align-content: start; padding: 2px; }
.as-dbody h4 { grid-column: 1 / -1; margin: 6px 0 -2px; font-size: 13px; font-weight: 600; color: var(--muted); }
.as-dbody .wide { grid-column: 1 / -1; }
@media (min-width: 600px) { .as-dbody .span2 { grid-column: span 2; } }
.as-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); min-width: 0; }
.as-f input, .as-f select, .as-f textarea { width: 100%; }
.as-f input, .as-f select { min-height: 48px; font-size: 15px; color: var(--text); }
.as-f textarea { font-size: 15px; color: var(--text); }
.as-act { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 10px; border-radius: 12px; background: var(--panel2); }
.as-act textarea { grid-column: 1; }
.as-act-btns { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 2px; }
.as-dfoot { display: flex; gap: 8px; align-items: center; }
.as-dfoot > span { flex: 1; }
</style>

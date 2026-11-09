<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'
import MAP from '@/data/mapa-kns.json'

// Mapa KNS (wzór: plakat „Mapa KNS Poznań / Okolice Poznania”): złote kontury osiedli Poznania i gmin wokół, a w nich
// podpisy osób z kościoła. Tylko osiedle albo miejscowość — bez adresów. Widzą zalogowani członkowie (baza: kns_map).
// Przybliżanie kółkiem / dwoma palcami / przyciskami, przesuwanie przeciągnięciem; kliknięcie obszaru — lista osób.
// Przełącznik „Grupki domowe”: ta sama mapa z grupkami (kns_groups) — dzień i godzina, prowadzący, uczestnicy.
export default defineComponent({
  setup() {
    const app = useApp()
    const svg = ref(null)
    const st = reactive({ mode: 'ludzie', groups: [], gedit: null, open: '', hover: '', busy: true, error: '', list: [], view: 'pz', q: '', sel: '', me: null, edit: null, saving: false })
    const z = reactive({ k: 1, x: 0, y: 0 })
    async function load() {
      st.busy = true; st.error = ''
      try {
        const [list, groups] = await Promise.all([app.api.call('mapLoad'), app.api.call('groupsLoad').catch(() => [])])
        st.list = list; st.groups = (groups || []).map(g => ({ ...g, label: g.name }))
      } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    onMounted(load)
    const geo = computed(() => (st.view === 'pz' ? MAP.poznan : MAP.okolice))
    const areas = computed(() => geo.value.areas)
    const G = computed(() => st.mode === 'grupki')
    const items = computed(() => (G.value ? st.groups : st.list))
    const byArea = computed(() => { const m = {}; for (const e of items.value) (m[e.area] ||= []).push(e); for (const k in m) m[k].sort((a, b) => a.label.localeCompare(b.label, 'pl')); return m })
    const pzCount = computed(() => items.value.filter(e => e.area.startsWith('pz:')).length)
    const mine = computed(() => st.list.find(e => e.mine) || null)
    const q = computed(() => st.q.trim().toLowerCase())
    const hits = computed(() => (q.value ? items.value.filter(e => (e.label + ' ' + e.place + ' ' + e.area.slice(3) + ' ' + (e.leaders || []).map(l => l.name).join(' ')).toLowerCase().includes(q.value)) : []))
    const hitAreas = computed(() => new Set(hits.value.map(e => e.area)))
    const selArea = computed(() => areas.value.find(a => a.id === st.sel) || null)
    const selList = computed(() => byArea.value[st.sel] || [])
    const areaName = id => id.slice(3)
    const few = n => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
    const plural = n => (G.value ? (n === 1 ? 'grupka' : few(n) ? 'grupki' : 'grupek') : n === 1 ? 'wpis' : few(n) ? 'wpisy' : 'wpisów')
    const osob = n => (n === 1 ? 'osoba' : few(n) ? 'osoby' : 'osób')
    const myGroup = computed(() => st.groups.find(g => g.mine) || null)
    const hoverArea = computed(() => areas.value.find(a => a.id === st.hover) || null)
    // ramka kształtu klikniętego obszaru (z liczb w ścieżce) — do powiększonego podglądu
    const selBox = computed(() => {
      const a = selArea.value; if (!a) return '0 0 1 1'
      const n = a.d.match(/-?\d+(?:\.\d+)?/g).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1)
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], pad = Math.max(x1 - x0, y1 - y0) * 0.06
      return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(v => +v.toFixed(1)).join(' ')
    })

    // ---- etykiety: do 3 podpisów pod nazwą obszaru, reszta jako „+N”; przy przybliżeniu więcej ----
    const maxLabels = computed(() => (z.k >= 2.5 ? 12 : z.k >= 1.6 ? 6 : 3))
    // napisy o stałej wielkości na ekranie (ok. 12 px) — w jednostkach mapy zależnie od szerokości i przybliżenia
    const pxW = ref(700)
    let ro = null
    onMounted(() => { ro = new ResizeObserver(e => { pxW.value = Math.max(200, e[0].contentRect.width) }); if (svg.value) ro.observe(svg.value) })
    onBeforeUnmount(() => ro?.disconnect())
    const ppu = computed(() => pxW.value / (geo.value.w / z.k)) // pikseli ekranu na jednostkę mapy
    const fs = computed(() => 12 / ppu.value)
    const bubbles = computed(() => {
      const r = 11 / ppu.value, gap = 3 / ppu.value
      const list = areas.value.filter(a => byArea.value[a.id]).map(a => ({ id: a.id, a, n: byArea.value[a.id].length, x: a.cx, y: a.cy, r }))
      for (let it = 0; it < 60; it++) {
        let movedAny = false
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const p = list[i], q = list[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = 2 * r + gap
          if (d < min) { const push = (min - d) / 2, ux = dx / d, uy = dy / d; p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push; movedAny = true }
        }
        if (!movedAny) break
      }
      return list
    })
    // ile podpisów zmieści się w obszarze (0 — za mały, wtedy kółko z liczbą)
    function lines(a) {
      const list = byArea.value[a.id]; if (!list) return 0
      const px = a.s * ppu.value; if (px < 70) return 0
      return Math.max(1, Math.min(list.length, Math.floor((px * 0.8) / 15) - 1))
    }

    // ---- przybliżanie i przesuwanie ----
    const vb = computed(() => { const g = geo.value, w = g.w / z.k, h = g.h / z.k; return [z.x, z.y, w, h].map(v => +v.toFixed(1)).join(' ') })
    const clamp = () => { const g = geo.value; z.k = Math.min(6, Math.max(1, z.k)); z.x = Math.min(g.w - g.w / z.k, Math.max(0, z.x)); z.y = Math.min(g.h - g.h / z.k, Math.max(0, z.y)) }
    function zoomAt(f, px = 0.5, py = 0.5) {
      const g = geo.value, w0 = g.w / z.k, h0 = g.h / z.k
      z.k *= f; const w1 = g.w / Math.min(6, Math.max(1, z.k)), h1 = g.h / Math.min(6, Math.max(1, z.k))
      z.x += (w0 - w1) * px; z.y += (h0 - h1) * py; clamp()
    }
    const reset = () => { z.k = 1; z.x = 0; z.y = 0 }
    function rel(e) { const r = svg.value.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }
    function wheel(e) { if (!e.ctrlKey && z.k === 1 && e.deltaY > 0) return; e.preventDefault(); const [px, py] = rel(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py) }
    const ptrs = new Map(); let pinch = 0, moved = false, start = [0, 0]
    // przechwycenie wskaźnika dopiero przy przeciąganiu — inaczej kliknięcie trafia w całe SVG, a nie w osiedle
    function down(e) { ptrs.set(e.pointerId, [e.clientX, e.clientY]); start = [e.clientX, e.clientY]; moved = false; if (ptrs.size === 2) { const [p, q2] = [...ptrs.values()]; pinch = Math.hypot(p[0] - q2[0], p[1] - q2[1]) } }
    function move(e) {
      if (!ptrs.has(e.pointerId)) return
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY])
      const r = svg.value.getBoundingClientRect(), g = geo.value
      if (ptrs.size === 2) {
        const [p, q2] = [...ptrs.values()], d = Math.hypot(p[0] - q2[0], p[1] - q2[1])
        if (pinch) { const cx = ((p[0] + q2[0]) / 2 - r.left) / r.width, cy = ((p[1] + q2[1]) / 2 - r.top) / r.height; zoomAt(d / pinch, cx, cy) }
        pinch = d; moved = true; return
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1]
      if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) { moved = true; try { svg.value.setPointerCapture(e.pointerId) } catch {} }
      if (z.k > 1) { z.x -= dx / r.width * (g.w / z.k); z.y -= dy / r.height * (g.h / z.k); clamp() }
    }
    function up(e) { ptrs.delete(e.pointerId); try { svg.value.releasePointerCapture(e.pointerId) } catch {} if (ptrs.size < 2) pinch = 0 }
    const side = ref(null)
    function pick(a) {
      if (moved) return
      st.sel = st.sel === a.id ? '' : a.id
      st.hover = ''
      // telefon: podgląd jest pod mapą — przewiń do niego
      if (st.sel && innerWidth < 900) setTimeout(() => side.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    function setView(v) { st.view = v; st.sel = ''; reset() }
    function setMode(m) { st.mode = m; st.sel = ''; st.q = ''; st.open = '' }
    function goPoznan() { if (!moved) setView('pz') }
    function focus(e) {
      const v = e.area.startsWith('pz:') ? 'pz' : 'ok'; if (st.view !== v) setView(v)
      st.sel = e.area; if (e.leaders) st.open = e.id; const a = geo.value.areas.find(x => x.id === e.area)
      if (a) { z.k = 2.2; const g = geo.value; z.x = a.cx - g.w / z.k / 2; z.y = a.cy - g.h / z.k / 2; clamp() }
    }

    // ---- mój wpis / poprawki administratora ----
    const OPTIONS = computed(() => [
      { group: 'Poznań — osiedla', items: MAP.poznan.areas.map(a => a.id).sort((x, y) => x.localeCompare(y, 'pl')) },
      { group: 'Okolice Poznania — gminy', items: MAP.okolice.areas.map(a => a.id).sort((x, y) => x.localeCompare(y, 'pl')) },
    ])
    function openMe() {
      const m = mine.value, name = app.me.value?.name || ''
      st.edit = m ? { id: m.id, label: m.label, area: m.area, place: m.place, own: true } : { id: '', label: name, area: '', place: '', own: true }
      st.error = ''
    }
    const openEdit = e => { st.edit = { id: e.id, label: e.label, area: e.area, place: e.place, own: e.mine }; st.error = '' }
    async function save() {
      const e = st.edit
      if (e.label.trim().length < 2) { st.error = 'Wpisz podpis, np. „Ania i Bartek Nowak”.'; return }
      if (!e.area) { st.error = 'Wybierz osiedle albo gminę.'; return }
      st.saving = true; st.error = ''
      try {
        if (e.own) await app.api.call('mapMe', { label: e.label, area: e.area, place: e.place })
        else await app.api.call('mapUpdate', e)
        st.edit = null; await load(); focus({ area: e.area })
      } catch (x) { st.error = x.message } finally { st.saving = false }
    }
    async function remove() {
      const e = st.edit
      if (!(await ask(e.own ? 'Twój wpis zniknie z Mapy KNS. Możesz dodać się ponownie w każdej chwili.' : `Wpis „${e.label}” zniknie z Mapy KNS.`, { title: 'Usunąć z mapy?', ok: 'Usuń', danger: true }))) return
      st.saving = true
      try { await app.api.call('mapDelete', { id: e.id }); st.edit = null; await load() } catch (x) { st.error = x.message } finally { st.saving = false }
    }
    // ---- grupki domowe ----
    function openGroup(g) {
      st.error = ''
      st.gedit = g ? { id: g.id, name: g.name, area: g.area, place: g.place, day: g.day, time: g.time, leaders: g.leaders.map(l => l.id), people: [...new Map([...g.leaders, ...g.members].map(x => [x.id, x])).values()] }
        : { id: '', name: '', area: st.sel || '', place: '', day: '', time: '', leaders: [], people: [] }
    }
    const toggleLeader = id => { const l = st.gedit.leaders; const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.push(id) }
    async function saveGroup() {
      const e = st.gedit
      if (e.name.trim().length < 2) { st.error = 'Wpisz nazwę grupki.'; return }
      if (!e.area) { st.error = 'Wybierz osiedle albo gminę.'; return }
      if (e.id && !e.leaders.length) { st.error = 'Zaznacz co najmniej jednego prowadzącego.'; return }
      st.saving = true; st.error = ''
      try {
        const id = await app.api.call('groupSave', { ...e, leaders: e.id ? e.leaders : null })
        st.gedit = null; await load(); focus({ area: e.area, id, leaders: [] })
      } catch (x) { st.error = x.message } finally { st.saving = false }
    }
    async function removeGroup() {
      const e = st.gedit
      if (!(await ask(`Grupka „${e.name}” zniknie z mapy, a jej uczestnikom wyczyści się pole „Grupka” w profilu.`, { title: 'Usunąć grupkę?', ok: 'Usuń', danger: true }))) return
      st.saving = true
      try { await app.api.call('groupDelete', { id: e.id }); st.gedit = null; await load() } catch (x) { st.error = x.message } finally { st.saving = false }
    }
    async function join(g, on) {
      if (on && myGroup.value && myGroup.value.id !== g.id && !(await ask(`Teraz w profilu masz grupkę „${myGroup.value.name}”. Zmienić na „${g.name}”?`, { title: 'Zmienić grupkę?', ok: 'Zmień' }))) return
      st.error = ''
      try { await app.api.call('groupJoin', { id: g.id, join: on }); await load() } catch (x) { st.error = x.message }
    }
    const when = g => [g.day, g.time].filter(Boolean).join(', ')
    return { ...app, MAP, G, items, osob, myGroup, setMode, openGroup, toggleLeader, saveGroup, removeGroup, join, when, ppu, lines, bubbles, plural, hoverArea, selBox, side, st, z, geo, areas, byArea, pzCount, mine, hits, hitAreas, selArea, selList, areaName, maxLabels, fs, svg, vb, zoomAt, reset, wheel, down, move, up, pick, setView, goPoznan, focus, OPTIONS, openMe, openEdit, save, remove }
  },
})
</script>

<template>
  <div class="seg km-mode" role="tablist" aria-label="Co pokazać na mapie">
    <button role="tab" :aria-selected="!G" :class="{ on: !G }" @click="setMode('ludzie')">Lokalizacja</button>
    <button role="tab" :aria-selected="G" :class="{ on: G }" @click="setMode('grupki')">Grupki domowe</button>
  </div>
  <div class="km-top">
    <div class="seg km-tabs" role="tablist" aria-label="Mapa">
      <button role="tab" :aria-selected="st.view === 'pz'" :class="{ on: st.view === 'pz' }" @click="setView('pz')">Poznań</button>
      <button role="tab" :aria-selected="st.view === 'ok'" :class="{ on: st.view === 'ok' }" @click="setView('ok')">Okolice Poznania</button>
    </div>
    <input v-model="st.q" class="km-search" type="search" :placeholder="G ? 'Szukaj grupki, prowadzącego albo osiedla' : 'Szukaj osoby albo osiedla'" aria-label="Szukaj na mapie" autocomplete="off">
    <button v-if="G" class="primary" @click="openGroup(null)"><svg class="i"><use href="#plus"/></svg>Dodaj grupkę</button>
    <button v-else class="primary" @click="openMe"><svg class="i"><use href="#pin"/></svg>{{ mine ? 'Mój wpis' : 'Dodaj mnie' }}</button>
  </div>
  <div v-if="st.q && hits.length" class="km-hits">
    <button v-for="e in hits.slice(0, 8)" :key="e.id" @click="focus(e); st.q = ''"><b>{{ e.label }}</b><small>{{ areaName(e.area) }}{{ e.place && e.place !== areaName(e.area) ? ' · ' + e.place : '' }}</small></button>
  </div>
  <p v-else-if="st.q" class="note">{{ G ? 'Nie ma takiej grupki.' : 'Nikogo takiego na mapie.' }}</p>
  <p v-if="st.error && !st.edit && !st.gedit" class="error">{{ st.error }}</p>

  <div class="km-wrap">
    <div class="km-card">
      <div class="km-badge"><span>{{ G ? 'Grupki domowe' : 'Mapa KNS' }}</span><b>{{ st.view === 'pz' ? 'Poznań' : 'Okolice Poznania' }}</b></div>
      <div class="km-zoom">
        <button class="icon" aria-label="Przybliż" @click="zoomAt(1.4)"><svg class="i"><use href="#plus"/></svg></button>
        <button class="icon" aria-label="Oddal" :disabled="z.k <= 1" @click="zoomAt(1 / 1.4)">−</button>
        <button v-if="z.k > 1" class="icon" aria-label="Cała mapa" @click="reset"><svg class="i"><use href="#refresh"/></svg></button>
      </div>
      <svg ref="svg" class="km-svg" :viewBox="vb" role="img" :aria-label="'Mapa KNS — ' + (st.view === 'pz' ? 'osiedla Poznania' : 'okolice Poznania')"
        @wheel="wheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
        <g v-if="st.view === 'ok'" class="km-pz" @click="goPoznan">
          <path :d="geo.poznan.d" />
          <text :x="geo.poznan.cx" :y="geo.poznan.cy" :font-size="fs * 1.9" text-anchor="middle" class="km-pz-t">Poznań</text>
          <text :x="geo.poznan.cx" :y="geo.poznan.cy + fs * 1.6" :font-size="fs" text-anchor="middle" class="km-pz-s">{{ pzCount }} {{ G ? plural(pzCount) : 'wpisów' }} · kliknij</text>
        </g>
        <path v-for="a in areas" :key="a.id" :d="a.d" class="km-area" :class="{ sel: st.sel === a.id, hit: hitAreas.has(a.id), has: byArea[a.id] }" @click="pick(a)" @pointerenter="e => e.pointerType === 'mouse' && (st.hover = a.id)" @mouseleave="st.hover = ''" />
        <!-- kółka z liczbą osób (rozsunięte, żeby się nie nakładały) — jedyne oznaczenia na mapie -->
        <g v-for="b in bubbles" :key="'b' + b.id" class="km-bub" :class="{ sel: st.sel === b.id }" @click="pick(b.a)" @pointerenter="e => e.pointerType === 'mouse' && (st.hover = b.id)" @mouseleave="st.hover = ''">
          <circle :cx="b.x" :cy="b.y" :r="b.r" />
          <text :x="b.x" :y="b.y + b.r * 0.34" :font-size="b.r * 0.95" text-anchor="middle">{{ b.n }}</text>
        </g>
      </svg>
      <div v-if="hoverArea && hoverArea.id !== st.sel" class="km-tip">{{ hoverArea.name }}<small>{{ (byArea[hoverArea.id] || []).length ? (byArea[hoverArea.id] || []).length + ' ' + plural((byArea[hoverArea.id] || []).length) : (G ? 'brak grupki' : 'nikogo jeszcze') }}</small></div>
      <small class="km-attr">Granice: © OpenStreetMap · tylko osiedle lub miejscowość, bez adresów</small>
    </div>

    <aside ref="side" class="km-side">
      <template v-if="selArea">
        <div class="km-side-h"><b>{{ selArea.name }}</b><button class="icon" aria-label="Zamknij" @click="st.sel = ''"><svg class="i"><use href="#x"/></svg></button></div>
        <div :key="selArea.id" class="km-pull">
          <svg :viewBox="selBox" class="km-pull-svg" role="img" :aria-label="'Kształt: ' + selArea.name"><path :d="selArea.d" /></svg>
        </div>
        <small class="km-pull-n">{{ selList.length ? selList.length + ' ' + plural(selList.length) + ' · ' : '' }}{{ st.view === 'pz' ? 'osiedle Poznania' : 'gmina' }}</small>
        <template v-if="G">
          <p v-if="!selList.length" class="note">Tu jeszcze nie ma grupki. Prowadzisz grupkę w tej okolicy? „Dodaj grupkę” u góry.</p>
          <div v-for="g in selList" :key="g.id" class="km-grp" :class="{ me: g.mine, open: st.open === g.id }">
            <button class="km-grp-h" :aria-expanded="st.open === g.id" @click="st.open = st.open === g.id ? '' : g.id">
              <span><b>{{ g.name }}</b><small>{{ [when(g), g.place && g.place !== selArea.name ? g.place : ''].filter(Boolean).join(' · ') || 'termin do ustalenia' }}</small></span>
              <em>{{ g.members.length }}</em>
            </button>
            <div v-if="st.open === g.id" class="km-grp-b">
              <small class="km-grp-l">Prowadzą</small>
              <p class="km-grp-who">{{ g.leaders.map(l => l.name).join(', ') || '—' }}</p>
              <small class="km-grp-l">Uczestnicy · {{ g.members.length }} {{ osob(g.members.length) }}</small>
              <ul class="km-grp-m"><li v-for="m in g.members" :key="m.id">{{ m.name }}</li></ul>
              <p v-if="!g.members.length" class="note">Nikt jeszcze nie zaznaczył, że tu chodzi.</p>
              <div class="km-grp-a">
                <button v-if="!g.mine" @click="join(g, true)"><svg class="i"><use href="#check"/></svg>Chodzę tu</button>
                <button v-else @click="join(g, false)">Już nie chodzę</button>
                <button v-if="g.can" @click="openGroup(g)"><svg class="i"><use href="#pencil"/></svg>Zmień</button>
              </div>
            </div>
          </div>
        </template>
        <p v-else-if="!selList.length" class="note">Na razie nikogo — może Ty? „Dodaj mnie” u góry.</p>
        <ul v-if="!G" class="km-people">
          <li v-for="e in selList" :key="e.id" :class="{ me: e.mine }">
            <span><b>{{ e.label }}</b><small v-if="e.place && e.place !== selArea.name">{{ e.place }}</small></span>
            <button v-if="e.mine || canManage" class="icon" :aria-label="'Zmień: ' + e.label" @click="openEdit(e)"><svg class="i"><use href="#pencil"/></svg></button>
          </li>
        </ul>
      </template>
      <template v-else>
        <template v-if="G">
          <b class="km-side-t">{{ st.groups.length }} {{ plural(st.groups.length) }} na mapie</b>
          <p class="note">Kliknij kółko albo osiedle, żeby zobaczyć grupki w okolicy — kiedy się spotykają, kto prowadzi i kto chodzi.</p>
          <p v-if="myGroup" class="note">Twoja grupka: <b>{{ myGroup.name }}</b>. <button class="linkish" @click="focus(myGroup)">Pokaż na mapie</button></p>
          <p v-else class="note">Chodzisz do grupki? Znajdź ją i kliknij „Chodzę tu”. Prowadzisz? „Dodaj grupkę”.</p>
          <p v-if="st.busy" class="note">Wczytuję…</p>
        </template>
        <template v-else>
        <b class="km-side-t">{{ st.list.length }} wpisów na mapie</b>
        <p class="note">Kliknij osiedle albo gminę, żeby zobaczyć, kto mieszka w okolicy. Przybliżasz kółkiem myszy, dwoma palcami albo przyciskami +/−.</p>
        <p class="note">Na mapie jest tylko podpis i osiedle albo miejscowość — bez adresów. Swój wpis zmienisz albo usuniesz przyciskiem „{{ mine ? 'Mój wpis' : 'Dodaj mnie' }}”.</p>
        <p v-if="st.busy" class="note">Wczytuję…</p>
        </template>
      </template>
    </aside>
  </div>

  <Teleport to="body">
    <div v-if="st.edit" class="np-overlay" @click.self="st.edit = null" @keydown.esc="st.edit = null">
      <div class="np-panel km-dlg" role="dialog" aria-modal="true" aria-label="Wpis na Mapie KNS">
        <div class="km-dh"><b>{{ st.edit.own ? (st.edit.id ? 'Mój wpis na mapie' : 'Dodaj mnie do mapy') : 'Wpis na mapie' }}</b><button class="icon" aria-label="Zamknij" @click="st.edit = null"><svg class="i"><use href="#x"/></svg></button></div>
        <label class="km-f">Podpis na mapie<input v-model="st.edit.label" maxlength="80" placeholder="np. Ania i Bartek Nowak" autocomplete="off"></label>
        <label class="km-f">Osiedle albo gmina<select v-model="st.edit.area" class="field"><option value="" disabled>— wybierz —</option><optgroup v-for="g in OPTIONS" :key="g.group" :label="g.group"><option v-for="id in g.items" :key="id" :value="id">{{ areaName(id) }}</option></optgroup></select></label>
        <label class="km-f">Miejscowość albo część osiedla (opcjonalnie)<input v-model="st.edit.place" maxlength="80" placeholder="np. Plewiska, Strzeszyn Grecki" autocomplete="off"></label>
        <p class="note">Nie podawaj ulicy ani numeru — mapa pokazuje tylko okolicę. Wpis widzą zalogowani członkowie kościoła.</p>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="km-df">
          <button v-if="st.edit.id" class="danger" :disabled="st.saving" @click="remove"><svg class="i"><use href="#trash"/></svg>Usuń z mapy</button>
          <span></span>
          <button @click="st.edit = null">Anuluj</button>
          <button class="primary" :disabled="st.saving" @click="save">Zapisz</button>
        </div>
      </div>
    </div>
    <div v-if="st.gedit" class="np-overlay" @click.self="st.gedit = null" @keydown.esc="st.gedit = null">
      <div class="np-panel km-dlg" role="dialog" aria-modal="true" aria-label="Grupka domowa">
        <div class="km-dh"><b>{{ st.gedit.id ? 'Grupka domowa' : 'Nowa grupka domowa' }}</b><button class="icon" aria-label="Zamknij" @click="st.gedit = null"><svg class="i"><use href="#x"/></svg></button></div>
        <label class="km-f">Nazwa grupki<input v-model="st.gedit.name" maxlength="60" placeholder="np. Grupka Wilda" autocomplete="off"></label>
        <label class="km-f">Osiedle albo gmina<select v-model="st.gedit.area" class="field"><option value="" disabled>— wybierz —</option><optgroup v-for="g in OPTIONS" :key="g.group" :label="g.group"><option v-for="id in g.items" :key="id" :value="id">{{ areaName(id) }}</option></optgroup></select></label>
        <div class="km-row">
          <label class="km-f">Dzień<input v-model="st.gedit.day" maxlength="40" list="km-days" placeholder="np. wtorek" autocomplete="off"></label>
          <label class="km-f">Godzina<input v-model="st.gedit.time" maxlength="20" placeholder="np. 19:00" autocomplete="off"></label>
        </div>
        <datalist id="km-days"><option v-for="d in ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela', 'co drugi tydzień']" :key="d" :value="d"></option></datalist>
        <label class="km-f">Miejscowość albo część osiedla (opcjonalnie)<input v-model="st.gedit.place" maxlength="80" placeholder="np. Plewiska, Strzeszyn Grecki" autocomplete="off"></label>
        <div v-if="st.gedit.id" class="km-f">Prowadzący (spośród uczestników)
          <div class="km-chips">
            <button v-for="x in st.gedit.people" :key="x.id" type="button" :class="{ on: st.gedit.leaders.includes(x.id) }" :aria-pressed="st.gedit.leaders.includes(x.id)" @click="toggleLeader(x.id)">{{ x.name }}</button>
          </div>
        </div>
        <p class="note">{{ st.gedit.id ? 'Współprowadzącego dopiszesz, gdy najpierw kliknie przy grupce „Chodzę tu”.' : 'Zostaniesz prowadzącym. Nie podawaj adresu — mapa pokazuje tylko okolicę; szczegóły przekaż osobiście.' }}</p>
        <p v-if="st.error" class="error">{{ st.error }}</p>
        <div class="km-df">
          <button v-if="st.gedit.id" class="danger" :disabled="st.saving" @click="removeGroup"><svg class="i"><use href="#trash"/></svg>Usuń grupkę</button>
          <span></span>
          <button @click="st.gedit = null">Anuluj</button>
          <button class="primary" :disabled="st.saving" @click="saveGroup">Zapisz</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.km-mode { margin: 0 0 10px; max-width: 340px; }
.km-grp { border-radius: 14px; background: var(--panel2); overflow: hidden; }
.km-grp.me { outline: 2px solid var(--km-gold); }
.km-grp-h { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; }
.km-grp-h:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.km-grp-h span { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.km-grp-h b { font-size: 15px; font-weight: 800; font-style: italic; color: var(--km-gold); }
.km-grp.me .km-grp-h b { color: var(--km-me); }
.km-grp-h small { color: var(--muted); font-size: 12.5px; }
.km-grp-h em { font-style: normal; font-weight: 800; font-size: 13px; min-width: 26px; height: 26px; border-radius: 13px; display: grid; place-items: center; background: var(--km-gold); color: #2a1906; }
.km-grp-b { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 4px; }
.km-grp-l { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; margin-top: 4px; }
.km-grp-who { margin: 0; font-weight: 650; }
.km-grp-m { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; }
.km-grp-m li { padding: 3px 9px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); font-size: 13px; }
.km-grp-a { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.km-grp-a button { min-height: 38px; }
.km-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.km-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.km-chips button { min-height: 36px !important; padding: 4px 12px !important; border-radius: 999px !important; font-size: 13.5px; color: var(--text); }
.km-chips button.on { background: var(--km-gold) !important; border-color: var(--km-gold) !important; color: #2a1906 !important; font-weight: 700; }
.linkish { all: unset; color: var(--accent-text); text-decoration: underline; cursor: pointer; }
.km-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.km-tabs { margin: 0; flex: 0 1 340px; }
.km-search { flex: 1 1 200px; min-height: 44px; margin: 0; }
.km-hits { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.km-hits button { display: inline-flex !important; flex-direction: column; align-items: flex-start !important; gap: 0; min-height: 0 !important; padding: 6px 12px !important; border-radius: 12px !important; text-align: left; }
.km-hits small { color: var(--muted); font-size: 12px; font-weight: 400; }
.km-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 12px; align-items: start; }
@media (max-width: 900px) { .km-wrap { grid-template-columns: 1fr; } }
.km-card { position: relative; border-radius: 20px; background: var(--km-bg); border: 1px solid var(--line); overflow: hidden; }
.km-badge { position: absolute; left: 0; top: 0; z-index: 1; padding: 14px 26px 16px 18px; border-radius: 0 0 40px 0; background: var(--km-gold); color: #fff; pointer-events: none; display: flex; flex-direction: column; line-height: 1.05; }
.km-badge span { font-size: 15px; font-weight: 500; }
.km-badge b { font-size: 22px; font-weight: 800; font-style: italic; text-transform: uppercase; letter-spacing: .01em; }
.km-zoom { position: absolute; right: 10px; top: 10px; z-index: 1; display: flex; flex-direction: column; gap: 4px; }
.km-zoom .icon { width: 38px !important; height: 38px !important; min-height: 0 !important; padding: 0 !important; border-radius: 12px !important; background: var(--panel) !important; border: 1px solid var(--line) !important; font-size: 20px; }
.km-svg { display: block; width: 100%; height: auto; aspect-ratio: auto; max-height: 78vh; touch-action: none; cursor: grab; user-select: none; }
.km-svg:active { cursor: grabbing; }
.km-area { fill: var(--km-fill); stroke: var(--km-line); stroke-width: 1.2; vector-effect: non-scaling-stroke; transition: fill .15s; cursor: pointer; }
.km-area.has { fill: var(--km-fill-has); }
.km-area.hit { fill: color-mix(in srgb, var(--km-gold) 30%, var(--km-fill)); }
.km-area.sel { fill: color-mix(in srgb, var(--km-gold) 42%, var(--km-fill)); stroke: var(--km-gold); stroke-width: 2.2; }
@media (hover: hover) { .km-area:hover { fill: color-mix(in srgb, var(--km-gold) 22%, var(--km-fill)); } }
.km-pz path { fill: var(--km-blob); stroke: none; cursor: pointer; }
.km-pz-t { fill: #fff; font-weight: 800; pointer-events: none; }
.km-pz-s { fill: #fff; opacity: .85; pointer-events: none; }
.km-lab { cursor: pointer; }
.km-name { fill: var(--km-name); font-weight: 500; }
.km-person { fill: var(--km-gold); font-weight: 800; font-style: italic; paint-order: stroke; stroke: var(--km-halo); stroke-width: 3.2px; stroke-linejoin: round; }
.km-person.me { fill: var(--km-me); }
.km-person.hit { fill: var(--accent-text); }
.km-bub { cursor: pointer; }
.km-bub.sel circle { fill: var(--km-me); }
.km-tip { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 1; display: flex; flex-direction: column; align-items: center; padding: 6px 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 6px 20px rgba(0, 0, 0, .18); font-size: 13.5px; font-weight: 650; pointer-events: none; white-space: nowrap; }
.km-tip small { color: var(--muted); font-size: 12px; font-weight: 400; }
.km-pull { display: grid; place-items: center; padding: 10px; border-radius: 16px; background: var(--km-bg); border: 1px solid var(--line); animation: km-pull .32s cubic-bezier(.2, .8, .2, 1); }
@keyframes km-pull { from { opacity: 0; transform: scale(.82) translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .km-pull { animation: none; } }
.km-pull-svg { width: 100%; max-height: 220px; }
.km-pull-svg path { fill: color-mix(in srgb, var(--km-gold) 20%, var(--km-fill)); stroke: var(--km-gold); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.km-pull-n { color: var(--muted); font-size: 12.5px; }
.km-bub circle { fill: var(--km-gold); stroke: var(--km-halo); stroke-width: 2px; vector-effect: non-scaling-stroke; }
.km-bub text { fill: #2a1906; font-weight: 800; }
.km-more { fill: var(--km-name); font-weight: 700; paint-order: stroke; stroke: var(--km-halo); stroke-width: 3px; }
.km-attr { display: block; padding: 6px 12px 8px; color: var(--muted); font-size: 11px; }
.km-side { position: sticky; top: 12px; padding: 14px 16px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.km-side-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.km-side-h b, .km-side-t { font-size: 16px; }
.km-people { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 60vh; overflow-y: auto; }
.km-people li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: var(--panel2); }
.km-people li.me { outline: 2px solid var(--km-gold); }
.km-people li span { flex: 1; display: flex; flex-direction: column; }
.km-people b { font-size: 15px; font-weight: 800; font-style: italic; color: var(--km-gold); }
.km-people li.me b { color: var(--km-me); }
.km-people small { color: var(--muted); font-size: 12.5px; }
.km-people .icon { width: 34px !important; height: 34px !important; min-height: 0 !important; padding: 0 !important; }
.km-dlg { gap: 10px; }
.km-dh { display: flex; align-items: center; justify-content: space-between; }
.km-dh b { font-size: 17px; }
.km-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
.km-f input, .km-f select { min-height: 48px; font-size: 15px; color: var(--text); }
.km-df { display: flex; gap: 8px; align-items: center; }
.km-df > span { flex: 1; }
</style>

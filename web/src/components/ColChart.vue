<script setup lang="ts">
// Wykres kolumnowy (SVG): wspólna linia bazowa, siatka z podziałką osi Y, wartości nad słupkami, etykiety osi X
// (przerzedzane, gdy się nie mieszczą) i podpowiedź po najechaniu. Szerokość z kontenera — piksel w piksel, bez skalowania tekstu.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Item = { label: string; v: number | null; hi?: boolean; title?: string; mark?: boolean }
const props = withDefaults(defineProps<{ items: Item[]; height?: number; unit?: string; values?: boolean; label?: string }>(), { height: 220, unit: '', values: true, label: '' })

const box = ref<HTMLElement | null>(null)
const width = ref(600)
let ro: ResizeObserver | null = null
onMounted(() => { if (!box.value) return; width.value = box.value.clientWidth || 600; ro = new ResizeObserver(e => { width.value = Math.max(240, Math.round(e[0].contentRect.width)) }); ro.observe(box.value) })
onBeforeUnmount(() => ro?.disconnect())

const PAD = { l: 30, r: 6, t: 18, b: 26 }
// „ładna” górna granica osi i krok siatki (1, 2, 5 × 10^n)
const scale = computed(() => {
  const max = Math.max(1, ...props.items.map(i => i.v || 0))
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
  return { top: Math.ceil(max / step) * step, step }
})
const plotW = computed(() => width.value - PAD.l - PAD.r)
const plotH = computed(() => props.height - PAD.t - PAD.b)
const slot = computed(() => plotW.value / Math.max(1, props.items.length))
const barW = computed(() => Math.max(3, Math.min(40, slot.value * 0.62)))
const y = (v: number) => PAD.t + plotH.value - (v / scale.value.top) * plotH.value
const ticks = computed(() => { const out = []; for (let v = 0; v <= scale.value.top + 1e-9; v += scale.value.step) out.push(+v.toFixed(6)); return out })
// co która etykieta osi X się mieści (ok. 44 px na etykietę)
const every = computed(() => Math.max(1, Math.ceil(44 / slot.value)))
const bars = computed(() => props.items.map((it, i) => {
  const cx = PAD.l + slot.value * i + slot.value / 2, v = it.v ?? 0
  return { ...it, i, cx, x: cx - barW.value / 2, y: y(v), h: Math.max(it.v ? 1.5 : 0, PAD.t + plotH.value - y(v)) }
}))
const showVals = computed(() => props.values && slot.value >= 20)
const fmt = (v: number | null) => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pl-PL'))
const hover = ref(-1)
</script>

<template>
  <div ref="box" class="cc">
    <svg :width="width" :height="height" role="img" :aria-label="label || items.map(i => i.label + ' ' + fmt(i.v)).join(', ')">
      <g class="cc-grid">
        <template v-for="t in ticks" :key="t">
          <line :x1="PAD.l" :x2="width - PAD.r" :y1="y(t)" :y2="y(t)" :class="{ base: t === 0 }" />
          <text :x="PAD.l - 6" :y="y(t) + 4" text-anchor="end">{{ t.toLocaleString('pl-PL') }}</text>
        </template>
      </g>
      <g>
        <g v-for="b in bars" :key="b.i" class="cc-bar" :class="{ hi: b.hi, dim: hover >= 0 && hover !== b.i }" @mouseenter="hover = b.i" @mouseleave="hover = -1">
          <rect class="cc-hit" :x="b.cx - slot / 2" :y="PAD.t" :width="slot" :height="plotH" />
          <path v-if="b.h > 0" :d="`M${b.x},${b.y + b.h} V${b.y + Math.min(4, b.h)} Q${b.x},${b.y} ${b.x + Math.min(4, barW / 2)},${b.y} H${b.x + barW - Math.min(4, barW / 2)} Q${b.x + barW},${b.y} ${b.x + barW},${b.y + Math.min(4, b.h)} V${b.y + b.h} Z`" />
          <text v-if="showVals && b.v != null" class="cc-val" :x="b.cx" :y="b.y - 5" text-anchor="middle">{{ fmt(b.v) }}<tspan v-if="b.mark" class="cc-mark"> •</tspan></text>
          <text v-if="b.i % every === 0" class="cc-x" :x="b.cx" :y="height - 8" text-anchor="middle">{{ b.label }}</text>
          <title>{{ b.title || b.label + ': ' + fmt(b.v) + (unit ? ' ' + unit : '') }}</title>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.cc { width: 100%; min-width: 0; }
.cc svg { display: block; overflow: visible; }
.cc-grid line { stroke: var(--line); stroke-width: 1; shape-rendering: crispEdges; }
.cc-grid line.base { stroke: color-mix(in srgb, var(--muted) 60%, transparent); }
.cc-grid text, .cc-x { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.cc-bar path { fill: color-mix(in srgb, var(--text) 42%, var(--panel3)); transition: opacity .15s; }
.cc-bar.hi path { fill: var(--accent); }
.cc-bar.dim path { opacity: .45; }
.cc-hit { fill: transparent; }
.cc-val { fill: var(--text); font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cc-mark { fill: var(--accent-text); }
</style>

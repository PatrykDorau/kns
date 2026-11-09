<script setup lang="ts">
// Frekwencja spotkanie po spotkaniu (SVG): słupki — większe wydarzenia (ewangelizacje), linia z punktami — zwykłe
// spotkania, przerywane linie trendu obu serii (najmniejsze kwadraty po kolejności pomiaru). Oś X to kolejność spotkań.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Pt = { label: string; v: number; ev: boolean; title?: string }
const props = withDefaults(defineProps<{ points: Pt[]; height?: number; label?: string }>(), { height: 310, label: "" })
const box = ref<HTMLElement | null>(null)
const width = ref(700)
let ro: ResizeObserver | null = null
onMounted(() => { if (!box.value) return; width.value = box.value.clientWidth || 700; ro = new ResizeObserver(e => { width.value = Math.max(260, Math.round(e[0].contentRect.width)) }); ro.observe(box.value) })
onBeforeUnmount(() => ro?.disconnect())

const PAD = { l: 34, r: 8, t: 14, b: 86 }
const scale = computed(() => {
  const max = Math.max(1, ...props.points.map(p => p.v))
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
  return { top: Math.ceil(max / step) * step, step }
})
const plotW = computed(() => width.value - PAD.l - PAD.r)
const plotH = computed(() => props.height - PAD.t - PAD.b)
const slot = computed(() => plotW.value / Math.max(1, props.points.length))
const barW = computed(() => Math.max(4, Math.min(30, slot.value * 0.66)))
const x = (i: number) => PAD.l + slot.value * i + slot.value / 2
const y = (v: number) => PAD.t + plotH.value - (v / scale.value.top) * plotH.value
const ticks = computed(() => { const out = []; for (let v = 0; v <= scale.value.top + 1e-9; v += scale.value.step) out.push(+v.toFixed(6)); return out })
const regular = computed(() => props.points.map((p, i) => ({ ...p, i })).filter(p => !p.ev))
const events = computed(() => props.points.map((p, i) => ({ ...p, i })).filter(p => p.ev))
const linePath = computed(() => regular.value.map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' '))
// trend liniowy po indeksie pomiaru na całej szerokości wykresu
function fit(list: { i: number; v: number }[]) {
  if (list.length < 3) return null
  const n = list.length, mx = list.reduce((s, p) => s + p.i, 0) / n, my = list.reduce((s, p) => s + p.v, 0) / n
  let num = 0, den = 0
  for (const p of list) { num += (p.i - mx) * (p.v - my); den += (p.i - mx) ** 2 }
  if (!den) return null
  const b = num / den, a = my - b * mx, last = props.points.length - 1
  const clampY = (v: number) => y(Math.max(0, Math.min(scale.value.top, v)))
  return { d: `M${x(0)},${clampY(a)} L${x(last)},${clampY(a + b * last)}` }
}
const trendReg = computed(() => fit(regular.value))
const trendEv = computed(() => fit(events.value))
const every = computed(() => Math.max(1, Math.ceil(16 / slot.value)))
const hover = ref(-1)
</script>

<template>
  <div ref="box" class="cb">
    <svg :width="width" :height="height" role="img" :aria-label="label || 'Frekwencja kolejnych spotkań'">
      <g class="cb-grid">
        <template v-for="t in ticks" :key="t">
          <line :x1="PAD.l" :x2="width - PAD.r" :y1="y(t)" :y2="y(t)" :class="{ base: t === 0 }" />
          <text :x="PAD.l - 6" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
        </template>
        <text :x="10" :y="PAD.t + plotH / 2" text-anchor="middle" :transform="`rotate(-90 10 ${PAD.t + plotH / 2})`">osób</text>
      </g>
      <g v-for="p in events" :key="'e' + p.i" class="cb-bar" :class="{ dim: hover >= 0 && hover !== p.i }">
        <path :d="`M${x(p.i) - barW / 2},${y(0)} V${y(p.v) + 3} Q${x(p.i) - barW / 2},${y(p.v)} ${x(p.i) - barW / 2 + 3},${y(p.v)} H${x(p.i) + barW / 2 - 3} Q${x(p.i) + barW / 2},${y(p.v)} ${x(p.i) + barW / 2},${y(p.v) + 3} V${y(0)} Z`" />
      </g>
      <path v-if="trendEv" :d="trendEv.d" class="cb-trend ev" />
      <path v-if="trendReg" :d="trendReg.d" class="cb-trend reg" />
      <path v-if="regular.length > 1" :d="linePath" class="cb-line" />
      <circle v-for="p in regular" :key="'r' + p.i" :cx="x(p.i)" :cy="y(p.v)" :r="hover === p.i ? 5 : 3.5" class="cb-dot" />
      <g v-for="(p, i) in points" :key="'h' + i" @mouseenter="hover = i" @mouseleave="hover = -1">
        <rect :x="x(i) - slot / 2" :y="PAD.t" :width="slot" :height="plotH" class="cb-hit" />
        <title>{{ p.title || p.label + ': ' + p.v }}</title>
      </g>
      <g class="cb-x">
        <text v-for="(p, i) in points" v-show="i % every === 0" :key="'x' + i" :transform="`translate(${x(i)},${y(0) + 8}) rotate(-45)`" text-anchor="end">{{ p.label }}</text>
      </g>
    </svg>
    <div class="cb-legend">
      <span><i class="k-ev"></i>Ewangelizacja · frekwencja</span>
      <span><i class="k-reg"></i>Zwykłe spotkanie · frekwencja</span>
      <span><i class="k-tr"></i>Trend · zwykłe spotkania</span>
      <span><i class="k-tr ev"></i>Trend · ewangelizacje</span>
    </div>
  </div>
</template>

<style scoped>
.cb { width: 100%; min-width: 0; }
.cb svg { display: block; overflow: visible; }
.cb-grid line { stroke: var(--line); shape-rendering: crispEdges; }
.cb-grid line.base { stroke: color-mix(in srgb, var(--muted) 60%, transparent); }
.cb-grid text, .cb-x text { fill: var(--muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.cb-bar path { fill: var(--c2); transition: opacity .15s; }
.cb-bar.dim path { opacity: .45; }
.cb-line { fill: none; stroke: var(--c1); stroke-width: 2; stroke-linejoin: round; }
.cb-dot { fill: var(--c1); stroke: var(--panel); stroke-width: 2; transition: r .15s; }
.cb-trend { fill: none; stroke-width: 1.6; stroke-dasharray: 6 5; }
.cb-trend.reg { stroke: color-mix(in srgb, var(--c1) 75%, var(--text)); }
.cb-trend.ev { stroke: color-mix(in srgb, var(--c2) 80%, var(--text)); }
.cb-hit { fill: transparent; }
.cb-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; font-size: 12.5px; color: var(--muted); }
.cb-legend span { display: inline-flex; align-items: center; gap: 6px; }
.cb-legend i { width: 14px; height: 10px; border-radius: 2px; }
.k-ev { background: var(--c2); }
.k-reg { height: 3px !important; background: var(--c1); }
.k-tr { height: 0 !important; border-top: 2px dashed color-mix(in srgb, var(--c1) 75%, var(--text)); }
.k-tr.ev { border-top-color: color-mix(in srgb, var(--c2) 80%, var(--text)); }
</style>

<script setup lang="ts">
// Wykres pierścieniowy (SVG) z legendą: kolory w stałej kolejności (nie według wielkości), suma w środku,
// wartość i udział przy każdej pozycji, podpowiedź po najechaniu.
import { computed, ref } from 'vue'

type Item = { label: string; v: number }
const props = withDefaults(defineProps<{ items: Item[]; total?: string; unit?: string; fmt?: (v: number) => string; label?: string }>(), { total: '', unit: '', label: '' })
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
const R = 70, W = 26, C = 2 * Math.PI * R
const sum = computed(() => props.items.reduce((s, i) => s + (i.v || 0), 0))
const f = (v: number) => (props.fmt ? props.fmt(v) : v.toLocaleString('pl-PL') + (props.unit ? ' ' + props.unit : ''))
// odcinki z 2-pikselową przerwą między nimi
const arcs = computed(() => {
  let acc = 0
  return props.items.map((it, i) => {
    const len = sum.value ? (it.v / sum.value) * C : 0, gap = props.items.filter(x => x.v > 0).length > 1 ? 2 : 0
    const a = { ...it, i, color: COLORS[i % COLORS.length], dash: Math.max(0, len - gap) + ' ' + (C - Math.max(0, len - gap)), off: -acc, share: sum.value ? it.v / sum.value : 0 }
    acc += len
    return a
  })
})
const hover = ref(-1)
</script>

<template>
  <div class="dn">
    <svg viewBox="0 0 180 180" class="dn-svg" role="img" :aria-label="label || items.map(i => i.label + ' ' + f(i.v)).join(', ')">
      <circle cx="90" cy="90" :r="R" fill="none" class="dn-track" :stroke-width="W" />
      <circle v-for="a in arcs.filter(x => x.v > 0)" :key="a.i" cx="90" cy="90" :r="R" fill="none" :stroke="a.color" :stroke-width="hover === a.i ? W + 6 : W"
        :stroke-dasharray="a.dash" :stroke-dashoffset="a.off" transform="rotate(-90 90 90)" class="dn-arc" :class="{ dim: hover >= 0 && hover !== a.i }"
        @mouseenter="hover = a.i" @mouseleave="hover = -1"><title>{{ a.label }}: {{ f(a.v) }} ({{ Math.round(a.share * 100) }}%)</title></circle>
      <text x="90" y="86" text-anchor="middle" class="dn-total">{{ total || f(sum) }}</text>
      <text x="90" y="104" text-anchor="middle" class="dn-sub">razem</text>
    </svg>
    <ul class="dn-legend">
      <li v-for="a in arcs" :key="a.i" :class="{ dim: hover >= 0 && hover !== a.i }" @mouseenter="hover = a.i" @mouseleave="hover = -1">
        <i :style="{ background: a.color }"></i><span>{{ a.label }}</span><b>{{ f(a.v) }}</b><small>{{ Math.round(a.share * 100) }}%</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dn { display: grid; grid-template-columns: minmax(140px, 190px) 1fr; gap: 18px; align-items: center; }
@media (max-width: 520px) { .dn { grid-template-columns: 1fr; justify-items: center; } .dn-legend { width: 100%; } }
.dn-svg { width: 100%; max-width: 190px; overflow: visible; }
.dn-track { stroke: var(--panel2); }
.dn-arc { transition: stroke-width .15s, opacity .15s; cursor: default; }
.dn-arc.dim { opacity: .4; }
.dn-total { fill: var(--text); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dn-sub { fill: var(--muted); font-size: 11px; }
.dn-legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.dn-legend li { display: grid; grid-template-columns: 12px 1fr auto 40px; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 8px; font-size: 13.5px; transition: opacity .15s; }
.dn-legend li.dim { opacity: .45; }
.dn-legend i { width: 12px; height: 12px; border-radius: 3px; }
.dn-legend b { font-weight: 600; font-variant-numeric: tabular-nums; }
.dn-legend small { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
</style>

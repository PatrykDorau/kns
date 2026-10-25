<script setup lang="ts">
import { computed } from 'vue'

// Niebo z góry KNS (znak kościoła, animowany): góra z logo rysuje się kreską, potem wypełnia się i dostaje krzyż;
// zza niej wschodzi słońce z logo na wysokość „rise” (0 — schowane za górą, 1 — nad szczytem); dalsze pasma
// wolno dryfują, w ciemnym motywie mrugają gwiazdy. Bez ruchu, gdy system prosi o ograniczenie animacji.
const props = withDefaults(defineProps<{ rise?: number, big?: boolean }>(), { rise: 1, big: false })
const sunY = computed(() => Math.round(410 - Math.max(0, Math.min(1, props.rise)) * 260)) // 410 — za górą, 150 — nad szczytem (192)
const STARS = Array.from({ length: 26 }, (_, i) => {
  let s = i * 9301 + 49297; const r = () => ((s = (s * 233280 + 49297) % 233280) / 233280)
  return { x: Math.round(r() * 1600), y: Math.round(20 + r() * 170), d: (r() * 6).toFixed(1), t: (3 + r() * 4).toFixed(1), r: r() > 0.8 ? 2.2 : 1.4 }
})
</script>

<template>
  <div class="ks" :class="{ big }" aria-hidden="true">
    <svg class="ks-back" viewBox="0 0 1600 360" preserveAspectRatio="xMidYMax slice">
      <g class="ks-stars"><circle v-for="(s, i) in STARS" :key="i" :cx="s.x" :cy="s.y" :r="s.r" :style="{ animationDelay: s.d + 's', animationDuration: s.t + 's' }" /></g>
      <g class="ks-far"><path d="M-60 360 L64 103 L116 200 L157 161 L280 360ZM536 360 L425 144 L378 226 L341 192 L230 360ZM1040 360 L1164 90 L1216 192 L1257 150 L1380 360ZM1670 360 L1546 130 L1495 217 L1453 182 L1330 360Z" /></g>
      <g class="ks-near"><path d="M-120 360 L54 36 L126 159 L184 108 L357 360ZM625 360 L488 103 L431 200 L386 161 L250 360ZM1409 360 L1260 63 L1198 175 L1148 129 L1000 360ZM1300 360 L1457 90 L1523 192 L1575 150 L1731 360Z" /></g>
    </svg>
    <svg class="ks-peak" viewBox="360 100 880 362">
      <circle class="ks-sun" cx="800.4" :cy="sunY" r="58" />
      <path class="ks-fill" d="M552 462 L800.4 192 L903.6 294.3 L986.4 252.5 L1233 462Z" />
      <path class="ks-ridge" pathLength="1" d="M552 462 L800.4 192 L903.6 294.3 L986.4 252.5 L1233 462" />
      <path class="ks-cross" pathLength="1" d="M800.4 192V140M784 156H816.8" />
    </svg>
    <span class="ks-line"></span>
  </div>
</template>

<style scoped>
.ks { position: relative; height: 170px; overflow: hidden; }
.ks.big { height: 46vh; min-height: 260px; max-height: 460px; }
.ks-back { position: absolute; inset: 0; width: 100%; height: 100%; }
.ks-stars circle { fill: var(--text); opacity: .3; animation: ks-twinkle 5s ease-in-out infinite; }
:global(html[data-theme="light"]) .ks-stars { display: none; }
.ks-far path { fill: var(--text); opacity: .035; }
.ks-near path { fill: var(--text); opacity: .055; }
:global(html[data-theme="light"]) .ks-far path { opacity: .05; }
:global(html[data-theme="light"]) .ks-near path { opacity: .08; }
.ks-far { animation: ks-drift 70s ease-in-out infinite alternate; }
.ks-near { animation: ks-drift 46s ease-in-out infinite alternate-reverse; }
.ks-peak { position: absolute; bottom: 0; left: 50%; width: 330px; height: auto; transform: translateX(-50%); overflow: visible; }
.ks.big .ks-peak { width: min(720px, 120vw); }
.ks-fill { fill: var(--bg); animation: ks-fade 1s ease 1.6s both; }
.ks-ridge { fill: none; stroke: var(--text); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; animation: ks-draw 2.2s cubic-bezier(.6, .1, .2, 1) .2s both; }
.ks-cross { fill: none; stroke: var(--text); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 1; animation: ks-draw .7s ease-out 2.3s both; }
.ks-sun { fill: var(--accent); transform-box: fill-box; transform-origin: center; animation: ks-rise 2.2s cubic-bezier(.2, .8, .2, 1) .5s both; transition: cy .8s; }
.ks-line { position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--muted); opacity: .45; }
@keyframes ks-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes ks-fade { from { opacity: 0; } }
@keyframes ks-rise { from { transform: translateY(260px); } }
@keyframes ks-drift { from { transform: translateX(-30px); } to { transform: translateX(30px); } }
@keyframes ks-twinkle { 50% { opacity: .8; } }
@media (min-width: 1024px) { .ks:not(.big) { height: 240px; } .ks:not(.big) .ks-peak { width: 560px; } }
@media (prefers-reduced-motion: reduce) { .ks-far, .ks-near, .ks-stars circle, .ks-fill, .ks-ridge, .ks-cross, .ks-sun { animation: none !important; } }
</style>

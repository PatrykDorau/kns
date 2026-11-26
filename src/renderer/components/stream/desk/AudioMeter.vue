<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { setGain, studio } from '@/services/studio'

// Dźwięk transmisji pod wizją: duży miernik jak w mikserze (zielony do −18 dB, żółty do −6, czerwony do 0),
// kreska szczytu z ostatnich 1,5 s, napis PRZESTER (świeci 3 s po każdym przesterowaniu), źródło dźwięku
// i suwak wzmocnienia wejścia — działa także w trakcie transmisji.
const FLOOR = -60
const pos = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100))
const now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 250)
onBeforeUnmount(() => clearInterval(tick))
const clip = computed(() => now.value - studio.clipAt < 3000)
const level = computed(() => (clip.value ? 'clip' : studio.audioPeak > -6 ? 'hot' : studio.audioDb < -50 ? 'low' : 'ok'))
const status = computed(() => ({ clip: 'PRZESTER — ścisz', hot: 'głośno', low: settings.studioAudio ? 'cisza' : 'bez dźwięku', ok: 'dobrze' }[level.value]))
const MARKS = [-48, -36, -24, -18, -12, -6, 0]

const gain = computed(() => settings.studioGain || 0)
</script>

<template>
  <div class="am" :class="'am-' + level" role="group" aria-label="Dźwięk transmisji">
    <span class="am-src" :title="'Źródło dźwięku: ' + (settings.studioAudio || 'brak')"><Icon name="volume" /><b>{{ settings.studioAudio || 'bez dźwięku' }}</b></span>
    <div class="am-bar" role="meter" :aria-valuenow="Math.round(studio.audioDb)" aria-valuemin="-60" aria-valuemax="0" aria-label="Poziom dźwięku w dB">
      <div class="am-track">
        <i class="am-fill" :style="{ clipPath: 'inset(0 ' + (100 - pos(studio.audioDb)) + '% 0 0)' }"></i>
        <i class="am-peak" :style="{ left: pos(studio.audioPeak) + '%' }"></i>
      </div>
      <div class="am-scale" aria-hidden="true"><span v-for="m in MARKS" :key="m" :style="{ left: pos(m) + '%' }">{{ m }}</span></div>
    </div>
    <b class="am-state">{{ status }}</b>
    <label class="am-gain" title="Wzmocnienie dźwięku z miksera. Przester — przesuń w lewo (lepiej ściszyć na mikserze). Za cicho — w prawo.">
      <span>Wzmocnienie <em>{{ gain > 0 ? '+' : '' }}{{ gain }} dB</em></span>
      <input type="range" min="-24" max="24" step="1" :value="gain" aria-label="Wzmocnienie dźwięku w dB" @input="setGain(+($event.target as HTMLInputElement).value)" @dblclick="setGain(0)">
    </label>
  </div>
</template>

<style scoped>
.am { display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'src state' 'bar bar' 'gain gain'; align-items: center; gap: 6px 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel2); }
.am-src { grid-area: src; display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }
.am-src b { overflow: hidden; color: var(--text); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.am-bar { grid-area: bar; min-width: 0; }
.am-track { position: relative; height: 18px; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--text) 10%, var(--bg)); }
/* kolory stref na całej szerokości, odsłaniane do poziomu: −60…−18 zielony, −18…−6 żółty, −6…0 czerwony */
.am-fill { position: absolute; inset: 0; background: linear-gradient(90deg, #2fbf71 0 70%, #e5c33b 70% 90%, #e5484d 90% 100%); transition: clip-path 70ms linear; }
.am-peak { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1px; background: var(--text); transition: left 120ms linear; }
.am-scale { position: relative; height: 14px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
.am-scale span { position: absolute; top: 1px; transform: translateX(-50%); }
.am-scale span:last-child { transform: translateX(-100%); }
.am-state { grid-area: state; min-width: 92px; padding: 4px 8px; border-radius: 6px; font-size: 12px; text-align: center; background: color-mix(in srgb, #2fbf71 18%, transparent); color: #2fbf71; }
.am-hot .am-state { background: color-mix(in srgb, #e5c33b 20%, transparent); color: #d9a400; }
.am-low .am-state { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--muted); }
.am-clip { border-color: #e5484d; box-shadow: 0 0 0 1px #e5484d inset; }
.am-clip .am-state { background: #e5484d; color: #fff; animation: am-blink 0.6s steps(2) infinite; }
@keyframes am-blink { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .am-clip .am-state { animation: none; } .am-fill, .am-peak { transition: none; } }
.am-gain { grid-area: gain; display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
.am-gain em { color: var(--text); font-style: normal; font-variant-numeric: tabular-nums; }
.am-gain input { flex: 1; min-width: 0; accent-color: var(--accent); }
</style>

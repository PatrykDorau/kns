<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { settings } from '@/stores'
import { differs, music, previewCanvas, reconnectCamera, setFps, stopMusic, studio, studioCanvas, take } from '@/services/studio'
import { api } from '@/stores'
import Icon from '@/components/common/Icon.vue'
import MusicEq from './MusicEq.vue'
import AudioMeter from './AudioMeter.vue'
import { SCENE_NAME } from '@/composables/stream/useStreamDesk'

// Studio: podgląd i wizja (płótna rysowane przez moduł studio) i „Na wizję”; „Od razu na wizję” — w Ustawieniach nadawania.
const stageEl = ref<HTMLElement | null>(null)
const pvEl = ref<HTMLElement | null>(null)
watch(stageEl, el => { if (el) { setFps(settings.streamFps); el.appendChild(studioCanvas()) } }, { flush: 'post' })
watch(pvEl, el => { if (el) el.appendChild(previewCanvas()) }, { flush: 'post' })

const pending = computed(() => !studio.direct && differs())

// Kamera na wizji: z ATEM po sieci — nazwa wejścia, które mikser ma na wyjściu (np. „Sony”); bez tego — urządzenie USB.
const atem = ref<any>(null)
let offAtem: (() => void) | null = null
onMounted(async () => { offAtem = api.onAtemState?.(s => { atem.value = s }) || null; atem.value = (await api.atemState?.().catch(() => null)) || null })
onBeforeUnmount(() => offAtem?.())
const camName = computed(() => {
  const a = atem.value, inp = a?.connected && a.inputs?.find(i => i.id === a.program)
  if (inp) return 'ATEM: ' + (inp.long || inp.name || 'wejście ' + inp.id)
  return studio.cameraLabel || ''
})
const camTip = computed(() => studio.cameraLabel ? 'Obraz z: ' + studio.cameraLabel + (atem.value?.connected ? ' — na wyjściu miksera: ' + camName.value.replace('ATEM: ', '') : ' (połącz ATEM w ustawieniach, żeby widzieć, która kamera jest na wyjściu miksera)') : 'Kamera nie daje obrazu — kliknij, żeby połączyć od nowa')

// Rozmiar podglądu i wizji: S/M/L; L wypełnia kolumnę tak, żeby wszystko (z dźwiękiem) mieściło się bez przewijania.
const col = ref<HTMLElement | null>(null), fitW = ref(0)
const SIZES = [['s', 'S', 0.62], ['m', 'M', 0.8], ['l', 'L', 1]] as const
function fit() {
  const c = col.value
  if (!c || !c.clientHeight) return
  const scrs = [...c.querySelectorAll<HTMLElement>('.mons-slot .mon-scr')]
  if (!scrs.length) return
  const used = scrs.reduce((a, e) => a + e.offsetHeight, 0), rest = c.scrollHeight - used
  const per = Math.max(90, (c.clientHeight - rest - 4) / scrs.length)
  const w = Math.floor(per * 16 / 9)
  if (Math.abs(w - fitW.value) > 2) fitW.value = w
}
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(() => requestAnimationFrame(fit)); if (col.value) ro.observe(col.value); setTimeout(fit, 200) })
onBeforeUnmount(() => ro?.disconnect())
watch(() => [studio.direct, settings.monSize], () => requestAnimationFrame(fit))
const monW = computed(() => { const k = SIZES.find(s => s[0] === (settings.monSize || 'l'))?.[2] || 1; return fitW.value ? Math.round(fitW.value * k) + 'px' : '' })
const musicName = computed(() => settings.musicList.find(x => x.id === music.current)?.name || '')

// Przewinięte niżej (ustawienia, biblioteka): podgląd i wizja przypinają się pomniejszone u góry, przy prawej krawędzi
// pulpitu — wciąż widać, co idzie na YouTube. Miejsce po nich zostaje (bez skoku treści); przewinięcie w górę — wracają.
const slot = ref<HTMLElement | null>(null)
const docked = ref(false), slotH = ref(0), dockAt = ref({ top: 0, right: 0, width: 0 })
let io: IntersectionObserver | null = null, scroller: HTMLElement | null = null
const scrollParent = (el: HTMLElement | null) => { for (let e = el?.parentElement; e; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e; return null }
function place() {
  const box = slot.value?.getBoundingClientRect(), top = scroller?.getBoundingClientRect().top ?? 0
  if (!box) return
  dockAt.value = { top: Math.max(0, top) + 8, right: Math.max(8, innerWidth - box.right), width: Math.min(box.width * 0.6, studio.direct ? 280 : 470) }
}
onMounted(() => {
  scroller = scrollParent(slot.value)
  io = new IntersectionObserver(([e]) => {
    const above = e.boundingClientRect.top < (e.rootBounds?.top ?? 0)
    const want = above && e.intersectionRatio < 0.35 && settings.deskLayout !== 'cols' // w kolumnie i tak zawsze widać
    if (want && !docked.value) { slotH.value = slot.value?.offsetHeight || 0; place() }
    docked.value = want
  }, { root: scroller, threshold: [0, 0.35, 0.6, 1] })
  if (slot.value) io.observe(slot.value)
  addEventListener('resize', place)
})
onBeforeUnmount(() => { io?.disconnect(); removeEventListener('resize', place) })
</script>

<template>
  <!-- podgląd, wizja i „Na wizję” razem — w układzie „kolumna” to lewa kolumna -->
  <div ref="col" class="desk-mons-col" :style="monW ? { '--mon-w': monW } : null">
  <div class="mons-size" role="group" aria-label="Rozmiar podglądu i wizji"><span>Rozmiar</span><button v-for="[id, name] in SIZES" :key="id" :class="{ on: (settings.monSize || 'l') === id }" :aria-pressed="(settings.monSize || 'l') === id" @click="settings.monSize = id">{{ name }}</button></div>
  <div ref="slot" class="mons-slot" :style="docked ? { height: slotH + 'px' } : null">
  <div class="studio-mons" :class="{ single: studio.direct, docked }" :style="docked ? { top: dockAt.top + 'px', right: dockAt.right + 'px', width: dockAt.width + 'px' } : null">
    <figure v-if="!studio.direct" class="mon pvw">
      <figcaption>Podgląd <small>{{ SCENE_NAME[studio.preview.scene] }}</small></figcaption>
      <div class="mon-scr"><div ref="pvEl" class="studio-host"></div></div>
    </figure>
    <figure class="mon pgm">
      <figcaption>Na wizji <small>{{ SCENE_NAME[studio.program.scene] }}</small><button class="mon-cam" :class="{ none: !studio.cameraLabel }" :title="camTip" @click="!studio.cameraLabel && reconnectCamera()"><Icon name="camera" />{{ camName || 'brak obrazu — połącz' }}</button><span v-if="music.playing" class="desk-mon-music" :title="'Na transmisji gra: ' + musicName"><MusicEq />muzyka</span></figcaption>
      <div class="mon-scr"><div ref="stageEl" class="studio-host"></div></div>
    </figure>
    <!-- przypięte: „Na wizję” pod ręką -->
    <div v-if="docked && !studio.direct" class="mons-dock-bar">
      <button class="desk-take-btn" :class="{ ready: pending }" :disabled="!pending" @click="take">Na wizję ▸</button>
      <button class="small" title="Przewiń do góry" @click="slot?.scrollIntoView({ behavior: 'smooth', block: 'start' })">↑</button>
    </div>
  </div>
  </div>
  <div class="desk-take">
    <button class="desk-take-btn" :class="{ ready: pending }" :disabled="studio.direct || !pending" title="Podgląd przechodzi na wizję (płynnie) — klawisz Spacja" @click="take">Na wizję ▸ <kbd class="take-key">Spacja</kbd></button>
    <small class="muted">{{ studio.direct ? 'Zmiany idą od razu na wizję' : pending ? 'Podgląd różni się od wizji — sprawdź i kliknij „Na wizję”' : 'Podgląd = wizja' }}</small>
    <span class="spacer"></span>
    <span v-if="music.playing" class="desk-music-pill" :title="'Podkład: ' + musicName"><MusicEq /><span>{{ musicName }}</span><button class="small" @click="stopMusic(3)">Wycisz</button></span>
  </div>
  <!-- dźwięk transmisji: zawsze na widoku, obok obrazu -->
  <AudioMeter />
  </div>
</template>

<style scoped>
.mons-size { display: flex; align-items: center; gap: 2px; margin: -4px 0 6px; font-size: 11px; color: var(--muted); }
.mons-size span { margin-right: 6px; }
.mons-size button { min-width: 26px; padding: 2px 6px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--muted); font-size: 11px; font-weight: 700; }
.mons-size button.on { border-color: var(--accent); color: var(--text); }
.mon-cam { border: 0; cursor: default; display: inline-flex; align-items: center; gap: 4px; max-width: 45%; margin-left: 8px; padding: 1px 8px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); font-size: 11px; font-weight: 600; letter-spacing: 0; text-transform: none; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.mon-cam :deep(svg) { width: 13px; height: 13px; flex: none; }
.mon-cam.none { cursor: pointer; background: color-mix(in srgb, #e5484d 22%, transparent); color: #ff8a8d; }
</style>

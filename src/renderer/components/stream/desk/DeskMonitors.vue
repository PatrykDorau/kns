<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { settings } from '@/stores'
import { SCENES, differs, music, previewCanvas, setDirect, setFps, setScene, stopMusic, studio, studioCanvas, take } from '@/services/studio'
import Icon from '@/components/common/Icon.vue'
import MusicEq from './MusicEq.vue'
import { SCENE_NAME } from '@/composables/stream/useStreamDesk'

// Studio: podgląd i wizja (płótna rysowane przez moduł studio), „Na wizję” i przyciski scen.
const stageEl = ref<HTMLElement | null>(null)
const pvEl = ref<HTMLElement | null>(null)
watch(stageEl, el => { if (el) { setFps(settings.streamFps); el.appendChild(studioCanvas()) } }, { flush: 'post' })
watch(pvEl, el => { if (el) el.appendChild(previewCanvas()) }, { flush: 'post' })

const pending = computed(() => !studio.direct && differs())
const musicName = computed(() => settings.musicList.find(x => x.id === music.current)?.name || '')
function direct(v: boolean) { settings.studioDirect = v; setDirect(v) }

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
  <div class="desk-mons-col">
  <div ref="slot" class="mons-slot" :style="docked ? { height: slotH + 'px' } : null">
  <div class="studio-mons" :class="{ single: studio.direct, docked }" :style="docked ? { top: dockAt.top + 'px', right: dockAt.right + 'px', width: dockAt.width + 'px' } : null">
    <figure v-if="!studio.direct" class="mon pvw">
      <figcaption>Podgląd <small>{{ SCENE_NAME[studio.preview.scene] }}</small></figcaption>
      <div class="mon-scr"><div ref="pvEl" class="studio-host"></div></div>
    </figure>
    <figure class="mon pgm">
      <figcaption>Na wizji <small>{{ SCENE_NAME[studio.program.scene] }}</small><span v-if="music.playing" class="desk-mon-music" :title="'Na transmisji gra: ' + musicName"><MusicEq />muzyka</span></figcaption>
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
    <button class="desk-take-btn" :class="{ ready: pending }" :disabled="studio.direct || !pending" title="Podgląd przechodzi na wizję (płynnie)" @click="take">Na wizję ▸</button>
    <small class="muted">{{ studio.direct ? 'Zmiany idą od razu na wizję' : pending ? 'Podgląd różni się od wizji — sprawdź i kliknij „Na wizję”' : 'Podgląd = wizja' }}</small>
    <span class="spacer"></span>
    <span v-if="music.playing" class="desk-music-pill" :title="'Podkład: ' + musicName"><MusicEq /><span>{{ musicName }}</span><button class="small" @click="stopMusic(3)">Wycisz</button></span>
    <label class="check" title="Bez podglądu: kliknięcie sceny albo nakładki od razu zmienia obraz na YouTube"><input :checked="studio.direct" type="checkbox" @change="direct(($event.target as HTMLInputElement).checked)"> Od razu na wizję</label>
  </div>
  </div>
  <div class="desk-scenes" role="group" aria-label="Sceny transmisji">
    <small class="desk-lbl desk-scenes-lbl">Sceny</small>
    <button v-for="[id, name] in SCENES" :key="id" :class="{ on: studio.preview.scene === id, live: studio.program.scene === id }" :aria-pressed="studio.preview.scene === id" :title="studio.program.scene === id ? 'Na wizji' : ''" @click="setScene(id)">{{ name }}</button>
  </div>
</template>

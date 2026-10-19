<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { settings } from '@/stores'
import { SCENES, differs, previewCanvas, setDirect, setFps, setScene, studio, studioCanvas, take } from '@/services/studio'
import { SCENE_NAME } from '@/composables/stream/useStreamDesk'

// Studio: podgląd i wizja (płótna rysowane przez moduł studio), „Na wizję” i przyciski scen.
const stageEl = ref<HTMLElement | null>(null)
const pvEl = ref<HTMLElement | null>(null)
watch(stageEl, el => { if (el) { setFps(settings.streamFps); el.appendChild(studioCanvas()) } }, { flush: 'post' })
watch(pvEl, el => { if (el) el.appendChild(previewCanvas()) }, { flush: 'post' })

const pending = computed(() => !studio.direct && differs())
function direct(v: boolean) { settings.studioDirect = v; setDirect(v) }
</script>

<template>
  <div class="studio-mons" :class="{ single: studio.direct }">
    <figure v-if="!studio.direct" class="mon pvw">
      <figcaption>Podgląd <small>{{ SCENE_NAME[studio.preview.scene] }}</small></figcaption>
      <div class="mon-scr"><div ref="pvEl" class="studio-host"></div></div>
    </figure>
    <figure class="mon pgm">
      <figcaption>Na wizji <small>{{ SCENE_NAME[studio.program.scene] }}</small></figcaption>
      <div class="mon-scr"><div ref="stageEl" class="studio-host"></div></div>
    </figure>
  </div>
  <div class="desk-take">
    <button class="desk-take-btn" :class="{ ready: pending }" :disabled="studio.direct || !pending" title="Podgląd przechodzi na wizję (płynnie)" @click="take">Na wizję ▸</button>
    <small class="muted">{{ studio.direct ? 'Zmiany idą od razu na wizję' : pending ? 'Podgląd różni się od wizji — sprawdź i kliknij „Na wizję”' : 'Podgląd = wizja' }}</small>
    <span class="spacer"></span>
    <label class="check" title="Bez podglądu: kliknięcie sceny albo nakładki od razu zmienia obraz na YouTube"><input :checked="studio.direct" type="checkbox" @change="direct(($event.target as HTMLInputElement).checked)"> Od razu na wizję</label>
  </div>
  <div class="desk-scenes" role="group" aria-label="Sceny transmisji">
    <button v-for="[id, name] in SCENES" :key="id" :class="{ on: studio.preview.scene === id, live: studio.program.scene === id }" :aria-pressed="studio.preview.scene === id" :title="studio.program.scene === id ? 'Na wizji' : ''" @click="setScene(id)">{{ name }}</button>
  </div>
</template>

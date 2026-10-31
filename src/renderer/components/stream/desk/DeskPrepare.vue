<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings, uid } from '@/stores'
import { ask } from '@/utils/ask'
import { H, W } from '@/services/studio/state'
import { drawPreset } from '@/services/studio/scenes'
import { PRESET_KINDS, blankPreset, dropPreset, ensurePresets, presetEdited, presetsOf } from '@/services/studio/presets'
import { useDesk } from '@/composables/stream/useStreamDesk'
import type { Preset } from '@/types'
import BannerSettings from './BannerSettings.vue'
import CountdownLook from './CountdownLook.vue'
import EndLook from './EndLook.vue'
import LowerLook from './LowerLook.vue'
import PrayerLook from './PrayerLook.vue'

// Przygotowanie: tu powstają presety (cały wygląd plansz i nakładek) — w Studio zostaje już tylko ich wybór.
const { prepKind, prepId } = useDesk()
ensurePresets()
const list = computed(() => presetsOf(prepKind.value))
const preset = computed<Preset | null>(() => list.value.find(p => p.id === prepId.value) || list.value[0] || null)
function add() { const p = blankPreset(prepKind.value); settings.studioPresets.push(p); prepId.value = p.id }
function duplicate() { const p = preset.value, c = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + ' (kopia)' }; settings.studioPresets.push(c); prepId.value = c.id }
async function remove() { if (await ask('Usunąć preset „' + preset.value.name + '”?')) { dropPreset(preset.value); prepId.value = '' } }
watch(() => JSON.stringify(preset.value?.data), () => { if (preset.value) presetEdited(preset.value) })

// duży podgląd presetu: własne płótno, niezależne od podglądu i wizji
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
function draw(t: number) {
  const c = canvas.value, p = preset.value
  if (c && p) {
    const ctx = c.getContext('2d')
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0)
    drawPreset(ctx, p.kind, p.data, t, true)
  }
  frame = requestAnimationFrame(draw)
}
onMounted(() => { frame = requestAnimationFrame(draw) })
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="prep">
    <nav class="prep-kinds" aria-label="Rodzaj presetu">
      <button v-for="[id, name, tip] in PRESET_KINDS" :key="id" :class="{ on: prepKind === id }" :aria-pressed="prepKind === id" :title="tip" @click="prepKind = id; prepId = ''">{{ name }} <em>{{ presetsOf(id).length }}</em></button>
    </nav>
    <div class="prep-body">
      <aside class="prep-list" aria-label="Presety">
        <button v-for="p in list" :key="p.id" :class="{ on: preset?.id === p.id }" :aria-pressed="preset?.id === p.id" @click="prepId = p.id"><b>{{ p.name }}</b><small v-if="p.desc">{{ p.desc }}</small></button>
        <button class="prep-add" @click="add"><Icon name="plus" />Nowy preset</button>
      </aside>
      <div v-if="preset" class="prep-main">
        <canvas ref="canvas" class="prep-canvas" width="960" height="540" aria-label="Podgląd presetu"></canvas>
        <div class="prep-head">
          <label>Nazwa <input v-model="preset.name" maxlength="30" placeholder="np. Zbiórka na remont"></label>
          <label>Opis <input v-model="preset.desc" maxlength="60" placeholder="np. Po kazaniu, przelew i BLIK"></label>
          <button class="small" @click="duplicate"><Icon name="copy" />Duplikuj</button>
          <button class="small" @click="remove"><Icon name="trash" />Usuń</button>
        </div>
        <CountdownLook v-if="preset.kind === 'cd'" :key="preset.id" :cd="preset.data" />
        <EndLook v-else-if="preset.kind === 'end'" :key="preset.id" :en="preset.data" />
        <BannerSettings v-else-if="preset.kind === 'banner'" :key="preset.id" :preset="preset.data" />
        <LowerLook v-else-if="preset.kind === 'lower'" :key="preset.id" :look="preset.data" />
        <PrayerLook v-else :key="preset.id" :look="preset.data" />
      </div>
      <p v-else class="desk-help">Dodaj pierwszy preset.</p>
    </div>
  </div>
</template>

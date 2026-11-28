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
import { applyLooks, looksFromDrive, looksFromFile, looksToDrive, looksToFile } from '@/services/studio/looksSync'
import BannerSettings from './BannerSettings.vue'
import CountdownLook from './CountdownLook.vue'
import EndLook from './EndLook.vue'
import LifeLook from './LifeLook.vue'
import LowerLook from './LowerLook.vue'
import PrayerLook from './PrayerLook.vue'
import VerseLook from './VerseLook.vue'

// Przygotowanie: tu powstają presety (cały wygląd plansz i nakładek) — w Studio zostaje już tylko ich wybór.
const { prepKind, prepId } = useDesk()
ensurePresets()
const list = computed(() => presetsOf(prepKind.value))
const preset = computed<Preset | null>(() => list.value.find(p => p.id === prepId.value) || list.value[0] || null)
function add() { const p = blankPreset(prepKind.value); settings.studioPresets.push(p); prepId.value = p.id }
function duplicate() { const p = preset.value, c = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + ' (kopia)' }; settings.studioPresets.push(c); prepId.value = c.id }
async function remove() { if (await ask('Usunąć preset „' + preset.value.name + '”?')) { dropPreset(preset.value); prepId.value = '' } }
watch(() => JSON.stringify(preset.value?.data), () => { if (preset.value) presetEdited(preset.value) })

// Przeniesienie wyglądów na inny komputer: Dysk Google (to samo konto) albo plik.
const sync = ref(''), syncBad = ref(false), syncBusy = ref(false)
const say = (t: string, bad = false) => { sync.value = t; syncBad.value = bad }
async function toDrive() {
  syncBusy.value = true; const r = await looksToDrive(); syncBusy.value = false
  say(r.error || 'Wysłane na Dysk (' + settings.studioPresets.length + ' presetów). Na drugim komputerze: „Pobierz z Dysku”.', !!r.error)
}
async function take(pack, from: string) {
  if (!(await ask('Zastąpić wyglądy na tym komputerze tymi ' + from + '? Obecne presety (' + settings.studioPresets.length + ') zostaną nadpisane.'))) return
  const r = applyLooks(pack)
  prepId.value = ''
  say(r.error || 'Wczytano ' + r.count + ' presetów. Grafiki z Biblioteki muszą być też na tym komputerze.', !!r.error)
}
async function fromDrive() {
  syncBusy.value = true; const r = await looksFromDrive(); syncBusy.value = false
  if (r.error) return say(r.error, true)
  take(r.pack, 'z Dysku (zapisane ' + new Date(r.at).toLocaleString('pl', { dateStyle: 'short', timeStyle: 'short' }) + ')')
}
async function fromFile() { const r = await looksFromFile(); if (r.error) say(r.error, true); else if (r.pack) take(r.pack, 'z pliku') }

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
    <div class="prep-sync" role="group" aria-label="Przeniesienie wyglądów na inny komputer">
      <span><b>Wyglądy na inny komputer</b><small>Ustaw w domu, przenieś na laptop w kościele (to samo konto Google).</small></span>
      <button class="small" :disabled="syncBusy" @click="toDrive"><Icon name="export" />Wyślij na Dysk</button>
      <button class="small" :disabled="syncBusy" @click="fromDrive"><Icon name="import" />Pobierz z Dysku</button>
      <button class="small" title="Zapisz plik z wyglądami (np. na pendrive)" @click="looksToFile"><Icon name="export" />Do pliku</button>
      <button class="small" title="Wczytaj plik z wyglądami" @click="fromFile"><Icon name="import" />Z pliku</button>
      <p v-if="sync" class="prep-sync-note" :class="{ bad: syncBad }">{{ sync }}</p>
    </div>
    <nav class="prep-kinds" aria-label="Rodzaj presetu">
      <button v-for="[id, name, tip] in PRESET_KINDS" :key="id" :class="{ on: prepKind === id }" :aria-pressed="prepKind === id" :title="tip" @click="prepKind = id; prepId = ''">{{ name }} <em>{{ presetsOf(id).length }}</em></button>
    </nav>
    <div class="prep-body">
      <aside class="prep-list" aria-label="Presety">
        <button v-for="p in list" :key="p.id" :class="{ on: preset?.id === p.id }" :aria-pressed="preset?.id === p.id" @click="prepId = p.id"><b>{{ p.name }}</b><small v-if="p.desc">{{ p.desc }}</small></button>
        <button class="prep-add" @click="add"><Icon name="plus" />Nowy preset</button>
      </aside>
      <div v-if="preset" class="prep-main">
        <!-- podgląd przypięty u góry: przy przewijaniu ustawień zawsze widać efekt -->
        <div class="prep-preview"><canvas ref="canvas" class="prep-canvas" width="960" height="540" aria-label="Podgląd presetu"></canvas></div>
        <div class="prep-head">
          <label>Nazwa <input v-model="preset.name" maxlength="30" placeholder="np. Zbiórka na remont"></label>
          <label>Opis <input v-model="preset.desc" maxlength="60" placeholder="np. Po kazaniu, przelew i BLIK"></label>
          <button class="small" @click="duplicate"><Icon name="copy" />Duplikuj</button>
          <button class="small" @click="remove"><Icon name="trash" />Usuń</button>
        </div>
        <CountdownLook v-if="preset.kind === 'cd'" :key="preset.id" :cd="preset.data" />
        <EndLook v-else-if="preset.kind === 'end'" :key="preset.id" :en="preset.data" />
        <BannerSettings v-else-if="preset.kind === 'banner'" :key="preset.id" :preset="preset.data" />
        <LifeLook v-else-if="preset.kind === 'life'" :key="preset.id" :look="preset.data" />
        <LowerLook v-else-if="preset.kind === 'lower'" :key="preset.id" :look="preset.data" />
        <VerseLook v-else-if="preset.kind === 'verse'" :key="preset.id" :look="preset.data" />
        <PrayerLook v-else :key="preset.id" :look="preset.data" />
      </div>
      <p v-else class="desk-help">Dodaj pierwszy preset.</p>
    </div>
  </div>
</template>

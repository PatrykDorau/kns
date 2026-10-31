<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { bannerPending, differs, lowerPending, prayerPending, studio, take } from '@/services/studio'
import { bannerSet } from '@/services/studio/cards'
import { ensurePresets, pickPreset, presetThumb, presetsOf, sendOverlay, stepBanner } from '@/services/studio/presets'
import { useDesk } from '@/composables/stream/useStreamDesk'
import type { Preset, PresetKind } from '@/types'

// Studio: wybór gotowego presetu — miniatura, nazwa, opis. Kliknięcie: na podgląd; na wizję przyciskiem na wybranym kafelku.
// Plansze idą na wizję jak główne „Na wizję”, nakładki (baner, modlitwa) — same, bez zmiany reszty wizji.
const props = defineProps<{ kind: PresetKind }>()
const { deskMode, prepKind, prepId } = useDesk()
ensurePresets()
const list = computed(() => presetsOf(props.kind))
const chosen = computed(() => settings.presetOn?.[props.kind] || '')
const overlay = computed(() => props.kind !== 'cd' && props.kind !== 'end')
const onAir = computed(() => ({ cd: studio.program.scene === 'countdown', end: studio.program.scene === 'end', banner: !!studio.program.endOvl, prayer: !!studio.program.prayer, lower: !!studio.program.lowerThird })[props.kind])
const isAir = (id: string) => onAir.value && studio.airPreset[props.kind] === id
const pending = computed(() => {
  if (!overlay.value) return !studio.direct && differs()
  if (props.kind === 'lower') return !!studio.preview.lowerThird && (!studio.program.lowerThird || lowerPending())
  return props.kind === 'banner' ? !!studio.preview.endOvl && (!studio.program.endOvl || bannerPending()) : !!studio.preview.prayer && (!studio.program.prayer || prayerPending())
})
function send() { if (overlay.value) sendOverlay(props.kind); else take() }
// kolejka banerów: podgląd stoi na jednym, strzałkami widać kolejne
const queueLen = computed(() => (props.kind === 'banner' ? bannerSet().list.length : 0))
const queueAt = computed(() => (studio.bannerPv % queueLen.value + queueLen.value) % queueLen.value + 1)

// miniatury: odświeżane po zmianie presetów i raz po wczytaniu grafik
const thumbs = ref<Record<string, string>>({})
const redraw = () => { thumbs.value = Object.fromEntries(list.value.map(p => [p.id, presetThumb(p)])) }
watch(() => JSON.stringify(list.value), redraw, { immediate: true })
const late = window.setTimeout(redraw, 1500)
onBeforeUnmount(() => clearTimeout(late))
function open(p: Preset | null) { prepKind.value = props.kind; prepId.value = p?.id || ''; deskMode.value = 'prep' }
</script>

<template>
  <div class="pz" role="group" aria-label="Presety">
    <div v-for="p in list" :key="p.id" class="pz-card" :class="{ on: chosen === p.id, live: isAir(p.id) }">
      <button class="pz-main" :aria-pressed="chosen === p.id" :title="'Na podgląd: ' + p.name" @click="pickPreset(p)">
        <span class="pz-pic"><img v-if="thumbs[p.id]" :src="thumbs[p.id]" alt=""></span>
        <span class="pz-meta">
          <b>{{ p.name }}</b>
          <small v-if="p.desc">{{ p.desc }}</small>
          <em v-if="isAir(p.id)" class="live">Na wizji</em>
          <em v-else-if="chosen === p.id" class="pv">Na podglądzie</em>
        </span>
      </button>
      <button class="pz-edit" :title="'Edytuj: ' + p.name" :aria-label="'Edytuj preset ' + p.name" @click="open(p)"><Icon name="pencil" /></button>
      <div v-if="chosen === p.id && (queueLen > 1 || pending)" class="pz-acts">
        <span v-if="queueLen > 1" class="pz-queue">
          <button class="small" title="Poprzedni baner w kolejce" aria-label="Poprzedni baner" @click="stepBanner(-1)"><Icon name="left" /></button>
          <span role="status">{{ queueAt }} / {{ queueLen }}</span>
          <button class="small" title="Następny baner w kolejce" aria-label="Następny baner" @click="stepBanner(1)"><Icon name="right" /></button>
        </span>
        <button v-if="pending" class="desk-send ready" :title="overlay ? 'Ten preset na wizję (reszta wizji bez zmian)' : 'Podgląd na wizję'" @click="send"><Icon name="play" />Na wizję</button>
      </div>
    </div>
    <button class="pz-card pz-new" title="Nowe presety tworzysz w „Przygotowaniu”" @click="open(null)"><span class="pz-pic"><Icon name="plus" /></span><span class="pz-meta"><b>Przygotuj preset</b><small>Otwiera Przygotowanie</small></span></button>
  </div>
</template>

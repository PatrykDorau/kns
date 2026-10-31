<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { bannerPending, prayerPending, studio } from '@/services/studio'
import { ensurePresets, pickPreset, presetThumb, presetsOf, sendOverlay } from '@/services/studio/presets'
import { useDesk } from '@/composables/stream/useStreamDesk'
import type { PresetKind } from '@/types'

// Studio: wybór gotowego presetu — miniatura, nazwa, opis. Kliknięcie: na podgląd; na wizję przyciskiem.
// Plansze idą na wizję głównym „Na wizję”, nakładki (baner, modlitwa) — własnym, bez zmiany reszty wizji.
const props = defineProps<{ kind: PresetKind }>()
const { deskMode, prepKind } = useDesk()
ensurePresets()
const list = computed(() => presetsOf(props.kind))
const chosen = computed(() => settings.presetOn?.[props.kind] || '')
const overlay = computed(() => props.kind === 'banner' || props.kind === 'prayer')
const onAir = computed(() => ({ cd: studio.program.scene === 'countdown', end: studio.program.scene === 'end', banner: !!studio.program.endOvl, prayer: !!studio.program.prayer })[props.kind])
const isAir = (id: string) => onAir.value && studio.airPreset[props.kind] === id
const pending = computed(() => (props.kind === 'banner' ? !!studio.preview.endOvl && (!studio.program.endOvl || bannerPending()) : !!studio.preview.prayer && (!studio.program.prayer || prayerPending())))

// miniatury: odświeżane po zmianie presetów i raz po wczytaniu grafik
const thumbs = ref<Record<string, string>>({})
const redraw = () => { thumbs.value = Object.fromEntries(list.value.map(p => [p.id, presetThumb(p)])) }
watch(() => JSON.stringify(list.value), redraw, { immediate: true })
const late = window.setTimeout(redraw, 1500)
onBeforeUnmount(() => clearTimeout(late))
function create() { prepKind.value = props.kind; deskMode.value = 'prep' }
</script>

<template>
  <div class="pz" role="group" aria-label="Presety">
    <button v-for="p in list" :key="p.id" class="pz-card" :class="{ on: chosen === p.id, live: isAir(p.id) }" :aria-pressed="chosen === p.id" :title="'Na podgląd: ' + p.name" @click="pickPreset(p)">
      <span class="pz-pic"><img v-if="thumbs[p.id]" :src="thumbs[p.id]" alt=""></span>
      <span class="pz-meta">
        <b>{{ p.name }}</b>
        <small v-if="p.desc">{{ p.desc }}</small>
        <em v-if="isAir(p.id)" class="live">Na wizji</em>
        <em v-else-if="chosen === p.id" class="pv">Na podglądzie</em>
      </span>
    </button>
    <button class="pz-card pz-new" title="Nowe presety tworzysz w „Przygotowaniu”" @click="create"><span class="pz-pic"><Icon name="plus" /></span><span class="pz-meta"><b>Przygotuj preset</b><small>Otwiera Przygotowanie</small></span></button>
  </div>
  <div v-if="overlay" class="pz-send">
    <button class="desk-send" :class="{ ready: pending }" :disabled="!pending" :title="pending ? 'Ten preset na wizję (reszta wizji bez zmian)' : 'Ten preset jest już na wizji'" @click="sendOverlay(kind)"><Icon name="play" />Na wizję</button>
  </div>
</template>

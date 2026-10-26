<script setup lang="ts">
import { settings } from '@/stores'
import { studio } from '@/services/studio'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { DH_ICON } from '@/composables/stream/useStreamHealth'

// Stan transmisji: ogólna ocena, wysyłanie (wykres), opóźnienie, klatki, internet, YouTube, dźwięk
// (miernik i zmiana źródła w trakcie); na dole podpowiedź przy najważniejszym problemie.
// vertical — w prawej kolumnie, jedna pod drugą; da się zwinąć do samej oceny (settings.healthFolded).
// rail — w zwiniętej kolumnie pod przyciskami: ikonka i wartość (opis w podpowiedzi); alert — sama podpowiedź o problemie.
const props = defineProps<{ vertical?: boolean, rail?: boolean, alert?: boolean }>()
const { live, health, liveBc, engine, studioDevices, devices, chooseAudio, switchSimpleAudio, rateHistory, sparkPoints, sparkTarget } = useDesk()
</script>

<template>
  <p v-if="props.alert" v-show="health.alert" class="dh-alert dh-alert-solo" :class="health.alert?.cls" role="status"><svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>{{ health.alert?.text }}</p>
  <div v-else-if="props.rail" class="dh-rail" :class="'dh-' + health.level" role="group" aria-label="Stan transmisji">
    <span class="dh-rail-sum" :title="health.title + (liveBc?.viewers != null ? ' · ' + liveBc.viewers + ' ogląda' : '')"><i class="dh-led"></i><small>{{ live.time || '…' }}</small><small v-if="liveBc?.viewers != null">{{ liveBc.viewers }} ogl.</small></span>
    <span v-for="c in health.chips" :key="c.id" class="dh-rail-cell" :class="'s-' + (c.cls || 'none')" :title="c.label + ': ' + c.value + (c.tip ? ' — ' + c.tip : '')">
      <svg class="dh-ic" viewBox="0 0 24 24" aria-hidden="true"><path v-for="(d, k) in DH_ICON[c.id]" :key="k" :d="d" /></svg>
      <i v-if="c.id === 'audio' && engine === 'studio'" class="dh-meter" aria-hidden="true"><i :style="{ width: Math.max(0, Math.min(100, (studio.audioDb + 60) / 60 * 100)) + '%' }"></i></i>
      <b>{{ c.value }}</b>
    </span>
  </div>
  <div v-else class="dh" :class="['dh-' + health.level, { 'dh-vert': props.vertical, 'dh-folded': props.vertical && settings.healthFolded }]">
    <div class="dh-row">
      <div class="dh-sum">
        <i class="dh-led"></i>
        <span><b>{{ health.title }}</b><small>{{ live.time || 'łączę…' }}{{ liveBc?.viewers != null ? ' · ' + liveBc.viewers + ' ogląda' : '' }}</small></span>
        <button v-if="props.vertical" class="icon dh-fold" :aria-expanded="!settings.healthFolded" :title="settings.healthFolded ? 'Pokaż statystyki transmisji' : 'Zwiń statystyki'" :aria-label="settings.healthFolded ? 'Pokaż statystyki' : 'Zwiń statystyki'" @click="settings.healthFolded = !settings.healthFolded">{{ settings.healthFolded ? '▾' : '▴' }}</button>
      </div>
      <div v-for="c in props.vertical && settings.healthFolded ? [] : health.chips" :key="c.id" class="dh-cell" :class="['s-' + (c.cls || 'none'), 'dh-' + c.id]" :title="c.tip">
        <svg class="dh-ic" viewBox="0 0 24 24" aria-hidden="true"><path v-for="(d, k) in DH_ICON[c.id]" :key="k" :d="d" /></svg>
        <!-- dźwięk: poziom, stan i wybór źródła (zmiana także w trakcie transmisji) -->
        <span v-if="c.id === 'audio'" class="dh-txt">
          <small>Dźwięk · <em>{{ c.value }}</em></small>
          <select v-if="engine === 'studio'" :value="settings.studioAudio" aria-label="Źródło dźwięku" title="Źródło dźwięku — zmiana w trakcie bez przerwy" @change="chooseAudio(($event.target as HTMLSelectElement).value)"><option value="">bez dźwięku</option><option v-for="d in studioDevices.audio" :key="d.deviceId" :value="d.label">{{ d.label || 'Mikrofon' }}</option></select>
          <select v-else :value="settings.streamAudio" aria-label="Źródło dźwięku" title="Źródło dźwięku — zmiana w trakcie przerywa nadawanie na 1–2 s" @change="switchSimpleAudio($event)"><option value="">bez dźwięku</option><option v-for="d in devices.audio" :key="d" :value="d">{{ d }}</option></select>
          <i v-if="engine === 'studio'" class="dh-meter" aria-hidden="true"><i :style="{ width: Math.max(0, Math.min(100, (studio.audioDb + 60) / 60 * 100)) + '%' }"></i></i>
        </span>
        <span v-else class="dh-txt"><small>{{ c.label }}</small><b>{{ c.value }}</b></span>
        <svg v-if="c.id === 'rate' && rateHistory.length > 1" class="dh-spark" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="60" :y1="sparkTarget" :y2="sparkTarget" class="dh-target" />
          <polygon :points="'0,20 ' + sparkPoints + ' 60,20'" /><polyline :points="sparkPoints" />
        </svg>
      </div>
    </div>
    <p v-if="health.alert" class="dh-alert" :class="health.alert.cls" role="status"><svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>{{ health.alert.text }}</p>
  </div>
</template>

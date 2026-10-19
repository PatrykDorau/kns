<script setup lang="ts">
import { toRef } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { studio } from '@/services/studio'
import { provideDesk } from '@/composables/stream/useStreamDesk'
import type { Service } from '@/types'
import DeskHealth from './desk/DeskHealth.vue'
import DeskMonitors from './desk/DeskMonitors.vue'
import DeskOverlays from './desk/DeskOverlays.vue'
import DeskTabs from './desk/DeskTabs.vue'
import DeskAirControls from './desk/DeskAirControls.vue'
import DeskAtem from './desk/DeskAtem.vue'
import DeskYouTube from './desk/DeskYouTube.vue'
import DeskSettings from './desk/DeskSettings.vue'

// Pulpit streamu: po lewej obraz (podgląd i wizja ze scenami, nakładkami i mediami — albo kamery w trybie prostym)
// i ATEM; po prawej YouTube i ustawienia nadawania. Stan i działania — composables/stream (useDesk w częściach).
const props = withDefaults(defineProps<{ service?: Service | null }>(), { service: null })
const { live, liveOn, engine, unrail } = provideDesk(toRef(props, 'service'))
</script>

<template>
  <div class="desk">
    <div class="desk-main">
      <div class="desk-left">
      <!-- Podgląd: przed startem obraz z kamer (ATEM po USB), w trakcie — dokładnie to, co widzą widzowie -->
      <section class="desk-stage">
        <div class="desk-stage-head">
          <h2>{{ liveOn ? 'To widzą widzowie' : 'Podgląd' }}</h2>
          <b v-if="liveOn" class="desk-onair" :class="live.running ? 'live' : 'wait'">{{ live.running ? '● NA ŻYWO' : 'Łączę z YouTube…' }}</b>
          <span v-if="liveOn && live.time" class="desk-clock">{{ live.time }}</span>
          <span class="spacer"></span>
          <slot v-if="!liveOn && engine !== 'studio'" name="tools" />
          <small v-else class="muted">{{ live.encoder }}</small>
        </div>
        <DeskHealth v-if="liveOn" />
        <template v-if="engine === 'studio'">
          <DeskMonitors />
          <DeskOverlays />
          <DeskTabs />
          <DeskAirControls />
        </template>
        <div v-else class="desk-screen">
          <img v-if="liveOn && live.previewUrl" class="desk-preview" :src="live.previewUrl" alt="Podgląd — to widzą widzowie">
          <slot v-else name="preview" />
        </div>
        <p v-if="engine === 'studio' && studio.error" class="note bad">{{ studio.error }}</p>
      </section>
      <DeskAtem />
      </div>

      <!-- Prawa kolumna: YouTube, ustawienia nadawania i (ze Stream) sygnały dla kamerzysty — sekcje zwijane -->
      <div class="desk-right" :class="{ rail: settings.railFolded }">
      <!-- zwinięta kolumna: same ikonki (transmisja, sygnały, nabożeństwo) — podgląd i wizja na całą szerokość -->
      <nav v-if="settings.railFolded" class="desk-rail" aria-label="Zwinięta kolumna">
        <button class="rail-btn rail-toggle" title="Rozwiń kolumnę" aria-label="Rozwiń kolumnę" @click="settings.railFolded = false"><Icon name="left" /></button>
        <button class="rail-btn" :class="{ live: liveOn }" :title="liveOn ? 'YouTube — NA ŻYWO' : 'YouTube'" aria-label="YouTube" @click="unrail('yt')"><Icon name="play" /><i v-if="liveOn" class="rail-dot"></i></button>
        <slot name="rail" :open="unrail" />
      </nav>
      <template v-else>
      <button class="rail-fold" title="Zwiń kolumnę do ikonek — więcej miejsca na podgląd i wizję" @click="settings.railFolded = true"><Icon name="right" />Zwiń kolumnę</button>
      <DeskYouTube />
      <DeskSettings />
      <slot name="side" />
      </template>
      </div>
    </div>

  </div>
</template>

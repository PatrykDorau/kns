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
import DeskScenes from './desk/DeskScenes.vue'
import DeskTabs from './desk/DeskTabs.vue'
import DeskPrepare from './desk/DeskPrepare.vue'
import SceneTab from './desk/SceneTab.vue'
import DeskAirControls from './desk/DeskAirControls.vue'
import DeskAtem from './desk/DeskAtem.vue'
import DeskYouTube from './desk/DeskYouTube.vue'
import DeskSettings from './desk/DeskSettings.vue'

// Pulpit streamu: po lewej obraz (podgląd i wizja ze scenami, nakładkami i mediami — albo kamery w trybie prostym)
// i ATEM; po prawej YouTube i ustawienia nadawania. Stan i działania — composables/stream (useDesk w częściach).
const props = withDefaults(defineProps<{ service?: Service | null }>(), { service: null })
const { live, liveOn, engine, unrail, deskMode } = provideDesk(toRef(props, 'service'))
</script>

<template>
  <div class="desk" :class="{ cols: settings.deskLayout === 'cols' && engine === 'studio' }">
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
          <button v-if="engine === 'studio'" class="small desk-layout-btn" :title="settings.deskLayout === 'cols' ? 'Układ: podgląd i wizja nad ustawieniami' : 'Układ: podgląd i wizja w kolumnie po lewej, ustawienia obok'" @click="settings.deskLayout = settings.deskLayout === 'cols' ? 'classic' : 'cols'"><Icon name="grid" />{{ settings.deskLayout === 'cols' ? 'Układ: kolumna' : 'Układ: klasyczny' }}</button>
        </div>
        <!-- statystyki: w prawej kolumnie; gdy zwinięta — pod jej przyciskami, a tu tylko podpowiedź o problemie -->
        <DeskHealth v-if="liveOn && settings.railFolded" alert />
        <template v-if="engine === 'studio'">
          <!-- 1. podgląd i wizja, „Na wizję”, sceny; 2. ustawienia wybranej sceny; 3. nakładki; 4. co gra na wizji; 5. źródła -->
          <DeskMonitors />
          <!-- reszta pulpitu; w układzie „kolumna” przewija się sama, podgląd i wizja stoją obok -->
          <div class="desk-stage-rest">
            <!-- Studio: tylko wybór gotowych rzeczy; Przygotowanie: cała konfiguracja plansz i nakładek -->
            <div class="desk-mode" role="tablist" aria-label="Tryb pulpitu">
              <button role="tab" :aria-selected="deskMode === 'live'" :class="{ on: deskMode === 'live' }" @click="deskMode = 'live'">Studio</button>
              <button role="tab" :aria-selected="deskMode === 'prep'" :class="{ on: deskMode === 'prep' }" @click="deskMode = 'prep'">Przygotowanie</button>
            </div>
            <DeskPrepare v-if="deskMode === 'prep'" />
            <template v-else>
            <DeskScenes />
            <div class="desk-scene-panel"><SceneTab /></div>
            <DeskOverlays />
            <DeskAirControls />
            <DeskTabs />
            </template>
            <p v-if="studio.error" class="note bad">{{ studio.error }}</p>
          </div>
        </template>
        <div v-else class="desk-screen">
          <img v-if="liveOn && live.previewUrl" class="desk-preview" :src="live.previewUrl" alt="Podgląd — to widzą widzowie">
          <slot v-else name="preview" />
        </div>
      </section>
      </div>

      <!-- Prawa kolumna: YouTube, ustawienia nadawania i (ze Stream) sygnały dla kamerzysty — sekcje zwijane -->
      <div class="desk-right" :class="{ rail: settings.railFolded }">
      <!-- zwinięta kolumna: same ikonki (transmisja, sygnały, nabożeństwo) — podgląd i wizja na całą szerokość -->
      <!-- zwinięta: przycisk rozwinięcia (z kropką „na żywo”) i tylko sygnały 1 2 3; zwijanie i rozwijanie z animacją -->
      <Transition name="rail-swap" mode="out-in">
      <nav v-if="settings.railFolded" key="rail" class="desk-rail" aria-label="Zwinięta kolumna">
        <button class="rail-btn rail-toggle" :class="{ live: liveOn }" :title="liveOn ? 'Rozwiń kolumnę — transmisja NA ŻYWO' : 'Rozwiń kolumnę'" aria-label="Rozwiń kolumnę" @click="settings.railFolded = false"><Icon name="left" /><i v-if="liveOn" class="rail-dot"></i></button>
        <slot name="rail" :open="unrail" />
        <DeskHealth v-if="liveOn" rail />
      </nav>
      <div v-else key="full" class="desk-right-full">
      <button class="rail-fold" title="Zwiń kolumnę — więcej miejsca na podgląd i wizję" aria-label="Zwiń kolumnę" @click="settings.railFolded = true"><Icon name="right" /></button>
      <DeskHealth v-if="liveOn" vertical />
      <DeskYouTube />
      <DeskSettings />
      <DeskAtem />
      <slot name="side" />
      </div>
      </Transition>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { useDesk } from '@/composables/stream/useStreamDesk'
import EndCardSettings from './EndCardSettings.vue'
import YtBroadcasts from './YtBroadcasts.vue'
import YtStreamKey from './YtStreamKey.vue'

// YouTube: kanał i stan sygnału, zaplanowane transmisje i klucz. Start nadawania jest w DeskStart.
const { yt, ytBusy, ytError, signal, loadYt, ytLogin, ytLogout, liveOn, engine } = useDesk()
</script>

<template>
  <section class="desk-ctrl" :class="{ folded: settings.ytFolded }">
    <div class="desk-head">
      <button class="desk-fold" :aria-expanded="!settings.ytFolded" :title="settings.ytFolded ? 'Rozwiń' : 'Zwiń'" @click="settings.ytFolded = !settings.ytFolded"><Icon :name="settings.ytFolded ? 'right' : 'down'" /></button>
      <h2 class="desk-fold-title" @click="settings.ytFolded = !settings.ytFolded">YouTube</h2>
      <small v-if="yt.loggedIn" class="muted">{{ yt.channel }}</small>
      <span v-if="yt.loggedIn && signal.text" class="desk-badge" :class="signal.cls">{{ signal.text }}</span>
      <span class="spacer"></span>
      <button v-if="yt.loggedIn" class="small" :disabled="ytBusy" title="Odśwież" aria-label="Odśwież" @click="loadYt"><Icon name="refresh" /></button>
      <button v-if="yt.loggedIn && !liveOn" class="small" :disabled="ytBusy" title="Odłącz od kanału YouTube" aria-label="Odłącz od kanału YouTube" @click="ytLogout"><Icon name="logout" /></button>
    </div>
    <p v-if="ytError" class="note bad">{{ ytError }}</p>
    <template v-if="!yt.loggedIn">
      <p class="note">Połącz aplikację z kanałem kościoła — w przeglądarce wybierz konto (albo konto marki) kanału.</p>
      <button class="primary desk-yt-login" :disabled="ytBusy" @click="ytLogin"><Icon name="play" />{{ ytBusy ? 'Czekam na logowanie w przeglądarce…' : 'Połącz z YouTube' }}</button>
    </template>
    <template v-else-if="!settings.ytFolded">
      <EndCardSettings v-if="engine === 'studio'" />
      <YtBroadcasts />
      <YtStreamKey />
    </template>
  </section>
</template>

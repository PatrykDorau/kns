<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { PRIVACY, when } from '@/composables/stream/useYouTube'
import EndCardSettings from './EndCardSettings.vue'
import YtBroadcasts from './YtBroadcasts.vue'
import YtStreamKey from './YtStreamKey.vue'

// YouTube: kanał i stan sygnału, wybór transmisji, gotowość, start i koniec nadawania.
const {
  yt, ytBusy, ytError, signal, loadYt, ytLogin, ytLogout, upcoming, chosenId, newTitle, nextTitle, privacy,
  live, liveOn, liveError, liveBroadcast, goLive, stopLive, engine, readiness, openCfg, lyricsInfo,
} = useDesk()
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
    <!-- zwinięte: zostaje tylko start albo koniec transmisji -->
    <template v-if="settings.ytFolded && yt.loggedIn">
      <button v-if="liveOn" class="desk-stop" @click="stopLive">■ Zakończ transmisję</button>
      <template v-else>
        <label v-if="upcoming.length" class="desk-field">Transmisja
          <select v-model="chosenId">
            <option v-for="b in upcoming" :key="b.id" :value="b.id">{{ b.title }}{{ when(b) ? ' — ' + when(b) : '' }}</option>
            <option value="new">Nowa: „{{ newTitle }}”</option>
          </select>
        </label>
        <button class="desk-golive" :disabled="ytBusy || (engine === 'simple' && !settings.streamVideo)" @click="goLive"><i></i>Rozpocznij: {{ nextTitle }}</button>
      </template>
    </template>
    <template v-else-if="!yt.loggedIn">
      <p class="note">Połącz aplikację z kanałem kościoła — w przeglądarce wybierz konto (albo konto marki) kanału.</p>
      <button class="primary desk-yt-login" :disabled="ytBusy" @click="ytLogin"><Icon name="play" />{{ ytBusy ? 'Czekam na logowanie w przeglądarce…' : 'Połącz z YouTube' }}</button>
    </template>
    <template v-else>
      <template v-if="!liveOn">
        <label class="desk-field">Transmisja
          <select v-model="chosenId">
            <option v-for="b in upcoming" :key="b.id" :value="b.id">{{ b.title }}{{ when(b) ? ' — ' + when(b) : '' }} · {{ PRIVACY[b.privacy] || b.privacy }}</option>
            <option value="new">Nowa: „{{ newTitle }}”</option>
          </select>
        </label>
        <label v-if="chosenId === 'new'" class="desk-field">Widoczność
          <select v-model="privacy"><option value="public">Publiczna</option><option value="unlisted">Niepubliczna</option><option value="private">Prywatna</option></select>
        </label>
        <div class="desk-ready" aria-label="Gotowość">
          <button v-for="r in readiness" :key="r.k" :title="'Ustawienia nadawania — ' + r.k" @click="openCfg"><i :class="r.cls"></i><b>{{ r.k }}</b><span>{{ r.v }}</span></button>
        </div>
        <button class="desk-golive" :disabled="ytBusy || (engine === 'simple' && !settings.streamVideo)" @click="goLive"><i></i>Rozpocznij: {{ nextTitle }}</button>
        <p v-if="liveError" class="note bad">{{ liveError }}</p>
      </template>
      <template v-else>
        <p class="desk-title">„{{ liveBroadcast?.title || nextTitle }}”</p>
        <p v-if="live.error" class="note bad">{{ live.error }}</p>
        <small class="muted desk-sub">Napisy: {{ lyricsInfo }}</small>
        <button class="desk-stop" @click="stopLive">■ Zakończ transmisję</button>
      </template>

      <EndCardSettings v-if="engine === 'studio'" />
      <YtBroadcasts />
      <YtStreamKey />
    </template>
  </section>
</template>

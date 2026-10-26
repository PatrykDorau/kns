<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { lyricsKey } from '@/services/lyricsFeed'
import { remote as remoteScreen } from '@/services/screenShare'
import { setDirect, studio } from '@/services/studio'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { ago } from '@/composables/stream/useProjectorList'

// Ustawienia nadawania: obraz i dźwięk, rzutnik i napisy, jakość — dostępne też przed połączeniem z YouTube.
const {
  liveOn, engine, studioDevices, devices, loadDevices, chooseCamera, chooseAudio, autoKbps, lyricsInfo,
  otherProjectors, pickedProjector, pickProjector, refreshProjectors, manualKey,
} = useDesk()
function chooseProjector(id: string) { if (id) pickProjector(id); else manualKey.value = true }
function direct(v: boolean) { settings.studioDirect = v; setDirect(v) }
</script>

<template>
  <section id="desk-cfg" class="desk-ctrl desk-cfg" :class="{ folded: settings.cfgFolded }">
    <div class="desk-head">
      <button class="desk-fold" :aria-expanded="!settings.cfgFolded" :title="settings.cfgFolded ? 'Rozwiń' : 'Zwiń'" @click="settings.cfgFolded = !settings.cfgFolded"><Icon :name="settings.cfgFolded ? 'right' : 'down'" /></button>
      <h2 class="desk-fold-title" @click="settings.cfgFolded = !settings.cfgFolded">Ustawienia nadawania</h2>
      <span v-if="liveOn" class="st-pill wait" title="W trakcie transmisji część ustawień jest zablokowana">w trakcie</span>
    </div>
    <template v-if="!settings.cfgFolded">
      <!-- obraz i dźwięk -->
      <div class="st-card">
        <div class="st-card-h"><span class="ic"><Icon name="camera" /></span><span><b>Obraz i dźwięk</b><small>{{ engine === 'studio' ? 'Studio: sceny i nakładki składa aplikacja (karta graficzna).' : 'Prosty: sam obraz z ATEM z napisami.' }}</small></span></div>
        <div class="st-stack">
          <span class="st-lbl">Tryb</span>
          <div class="st-seg" role="group" aria-label="Tryb">
            <button :class="{ on: settings.streamEngine !== 'simple' }" :disabled="liveOn || studio.hardware === false" @click="settings.streamEngine = 'studio'">Studio</button>
            <button :class="{ on: settings.streamEngine === 'simple' }" :disabled="liveOn" @click="settings.streamEngine = 'simple'">Prosty</button>
          </div>
        </div>
        <div class="st-grid2">
          <template v-if="engine === 'studio'">
            <label>Kamera<select :value="settings.studioCamera" :disabled="liveOn" @change="chooseCamera(($event.target as HTMLSelectElement).value)"><option v-if="!studioDevices.video.length" value="">— brak —</option><option v-for="d in studioDevices.video" :key="d.deviceId" :value="d.label">{{ d.label || 'Kamera' }}</option></select></label>
            <label>Dźwięk<select :value="settings.studioAudio" :disabled="liveOn" @change="chooseAudio(($event.target as HTMLSelectElement).value)"><option value="">bez dźwięku</option><option v-for="d in studioDevices.audio" :key="d.deviceId" :value="d.label">{{ d.label || 'Mikrofon' }}</option></select></label>
          </template>
          <template v-else>
            <label>Obraz<select v-model="settings.streamVideo" :disabled="liveOn"><option v-if="!devices.video.length && !devices.screens.length" value="">— brak —</option><option v-for="d in devices.video" :key="d" :value="d">{{ d }}</option><optgroup v-if="devices.screens.length" label="Ekran (na próbę, bez ATEM)"><option v-for="d in devices.screens" :key="d.value" :value="d.value">{{ d.label }}</option></optgroup></select></label>
            <label>Dźwięk<select v-model="settings.streamAudio" :disabled="liveOn"><option value="">bez dźwięku</option><option v-for="d in devices.audio" :key="d" :value="d">{{ d }}</option></select></label>
          </template>
        </div>
        <div v-if="engine === 'studio'" class="st-row">
          <span class="st-txt"><b>Od razu na wizję</b><small>Bez podglądu: kliknięcie sceny albo nakładki od razu zmienia obraz na YouTube.</small></span>
          <input :checked="studio.direct" class="sw" type="checkbox" aria-label="Od razu na wizję" @change="direct(($event.target as HTMLInputElement).checked)">
        </div>
        <p v-if="liveOn" class="st-hint" style="padding-bottom:10px">Źródło dźwięku zmienisz w trakcie na pasku stanu nad podglądem.</p>
        <p v-if="engine === 'simple' && !devices.video.length && !String(settings.streamVideo).startsWith('screen:')" class="note bad">Nie widzę obrazu z ATEM — podłącz mikser po USB-C i <button class="linkbtn" @click="loadDevices">odśwież listę</button>.</p>
      </div>

      <!-- rzutnik i napisy -->
      <div class="st-card">
        <div class="st-card-h"><span class="ic"><Icon name="monitor" /></span><span><b>Rzutnik i napisy</b><small>Skąd scena „Rzutnik” bierze obraz i skąd przychodzą napisy pieśni.</small></span></div>
        <div class="st-stack">
          <span class="st-lbl">Rzutnik jest</span>
          <div class="st-seg" role="group" aria-label="Gdzie jest rzutnik">
            <button :class="{ on: settings.streamLyrics === 'remote' }" @click="settings.streamLyrics = 'remote'">Inny laptop</button>
            <button :class="{ on: settings.streamLyrics === 'local' }" @click="settings.streamLyrics = 'local'">Ta aplikacja</button>
            <button :class="{ on: settings.streamLyrics === 'off' }" @click="settings.streamLyrics = 'off'">Brak</button>
          </div>
        </div>
        <template v-if="settings.streamLyrics === 'remote'">
          <div class="st-stack">
            <span class="st-lbl">Laptop z rzutnikiem</span>
            <div class="st-copy">
              <select :value="pickedProjector" aria-label="Laptop z rzutnikiem" style="flex:1;min-width:0" @change="chooseProjector(($event.target as HTMLSelectElement).value)">
                <option v-if="!otherProjectors.length" value="">— nie widzę rzutnika —</option>
                <option v-for="p in otherProjectors" :key="p.id" :value="p.id">{{ p.name }}{{ p.id === settings.deviceId ? ' (ten komputer)' : '' }} · {{ p.screen ? 'obraz i napisy' : 'napisy' }} · {{ ago(p.updated) }}</option>
                <option value="">Wklej adres ręcznie…</option>
              </select>
              <button class="small" title="Odśwież listę" aria-label="Odśwież listę rzutników" @click="refreshProjectors"><Icon name="refresh" /></button>
            </div>
            <!-- pole na adres: wybrane „Wklej adres ręcznie…” albo żaden rzutnik z listy nie jest wybrany -->
            <template v-if="manualKey || !pickedProjector">
              <span class="st-lbl">Adres rzutnika (napisy i obraz)</span>
              <input v-model="settings.streamLyricsKey" class="desk-lyr" placeholder="Wklej adres skopiowany z laptopa przy rzutniku" aria-label="Adres rzutnika">
              <span class="st-hint">To adres, przez który laptop przy rzutniku wysyła napisy pieśni (i obraz rzutnika). Na tamtym laptopie: Ustawienia aplikacji → Dla streamu → „Adres tego rzutnika” → Kopiuj. Zwykle nie trzeba — laptop sam pojawia się na liście powyżej.</span>
            </template>
            <span v-if="!otherProjectors.length" class="st-hint">Na laptopie przy rzutniku: Ustawienia aplikacji → Dla streamu → włącz „Obraz rzutnika” albo „Napisy pieśni”.</span>
          </div>
          <div class="st-row">
            <span class="st-txt"><b>Obraz rzutnika</b><small>Scena „Rzutnik” pokazuje ekran laptopa z rzutnikiem.</small></span>
            <input v-model="settings.screenRemote" class="sw" type="checkbox" aria-label="Obraz rzutnika przez sieć">
          </div>
          <div v-if="settings.screenRemote" class="st-row sub">
            <span :class="['st-pill', remoteScreen.state === 'on' ? 'ok' : remoteScreen.error ? 'bad' : 'wait']">{{ !lyricsKey ? 'Wybierz laptop z rzutnikiem' : remoteScreen.state === 'on' ? 'Obraz dociera' : remoteScreen.error || remoteScreen.step || 'Łączę…' }}</span>
          </div>
        </template>
        <div v-else-if="settings.streamLyrics === 'local'" class="st-row">
          <span class="st-txt"><b>Obraz z Rzutnika w tej aplikacji</b><small>Gdy rzutnik i stream są na jednym komputerze (albo do testów).</small></span>
          <input v-model="settings.studioLocalProjector" class="sw" type="checkbox" aria-label="Obraz z Rzutnika w tej aplikacji">
        </div>
        <div class="st-row sub"><span class="st-txt"><small>Napisy: {{ lyricsInfo }}</small></span></div>
      </div>

      <!-- jakość -->
      <div class="st-card">
        <div class="st-card-h"><span class="ic"><Icon name="chart" /></span><span><b>Jakość</b><small>Internet w kościele musi wysyłać ok. 1,5× przepływności (speedtest.net → „Upload”).</small></span></div>
        <div class="st-grid2">
          <label>Rozdzielczość<select v-model="settings.streamQuality" :disabled="liveOn"><option value="1080">1080p</option><option value="720">720p (słabszy internet)</option></select></label>
          <label title="Tyle, ile wysyła ATEM: ATEM Software Control → Ustawienia → Standard wideo (np. 1080p50 → 50)">Klatki na sekundę<select v-model.number="settings.streamFps" :disabled="liveOn"><option :value="25">25</option><option :value="30">30</option><option :value="50">50</option><option :value="60">60</option></select></label>
        </div>
        <div class="st-stack">
          <label>Przepływność</label>
          <select v-model.number="settings.streamKbps" :disabled="liveOn"><option :value="0">automatycznie ({{ (autoKbps / 1000).toLocaleString('pl') }} Mb/s)</option><option v-for="v in [3000, 4500, 6000, 8000, 10000, 12000]" :key="v" :value="v">{{ (v / 1000).toLocaleString('pl') }} Mb/s</option></select>
          <span class="st-hint">YouTube zaleca dla 1080p 4,5–9 Mb/s. Klatki ustaw jak w ATEM. Przy „słabym sygnale” — zmniejsz.</span>
        </div>
      </div>
    </template>
  </section>
</template>

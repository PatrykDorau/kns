<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { addMusic, music, nextMusic, playMusic, removeMusic, setMusicVolume, stopMusic, toggleMusic } from '@/services/studio'
import { mmss } from '@/composables/stream/useStudioMedia'

const nowName = computed(() => settings.musicList.find(x => x.id === music.current)?.name || 'Nic nie gra')
// Podkład muzyczny na transmisji (np. własne nagrania KNS Music — z YouTube Studio: Treści → ⋮ → Pobierz).
// Gra tylko na transmisji, z własną głośnością; „Wycisz” — płynnie w 3 s.
</script>

<template>
  <section class="desk-music" aria-label="Podkład muzyczny">
    <div class="desk-music-h">
      <b><Icon name="music" />Podkład muzyczny</b>
      <button class="small" title="MP3, M4A, WAV albo MP4 (sam dźwięk) — pliki kopiują się do aplikacji" @click="addMusic"><Icon name="plus" />Dodaj muzykę</button>
    </div>
    <p v-if="!settings.musicList.length" class="desk-help">Muzyka w tle transmisji, np. na planszy końcowej. Własne utwory z kanału YouTube pobierzesz w YouTube Studio (Treści → ⋮ → Pobierz) i dodasz tutaj. Gra tylko na transmisji — nie w nagłośnieniu sali.</p>
    <template v-else>
      <div class="desk-music-ctl">
        <button class="iconbtn solid" :title="music.playing ? 'Pauza (płynnie)' : 'Odtwórz'" :aria-label="music.playing ? 'Pauza' : 'Odtwórz'" @click="toggleMusic"><Icon :name="music.playing ? 'pause' : 'play'" /></button>
        <button class="iconbtn" title="Następny utwór" aria-label="Następny utwór" @click="nextMusic"><Icon name="right" /></button>
        <button class="small" :disabled="!music.playing" title="Płynne wyciszenie (3 s) i zatrzymanie" @click="stopMusic(3)">Wycisz</button>
        <span class="desk-music-now">{{ nowName }}<small v-if="music.current && music.duration"> · {{ mmss(music.time) }} / {{ mmss(music.duration) }}</small></span>
      </div>
      <label class="desk-music-vol"><Icon name="volume" /><input type="range" min="0" max="1" step="0.01" :value="settings.musicVolume" aria-label="Głośność podkładu" @input="setMusicVolume(+($event.target as HTMLInputElement).value)"><small>{{ Math.round(settings.musicVolume * 100) }}%</small></label>
      <label class="check"><input v-model="settings.musicLoop" type="checkbox"> Po utworze następny (w kółko)</label>
      <ul class="desk-music-list">
        <li v-for="t in settings.musicList" :key="t.id" :class="{ on: music.current === t.id, playing: music.current === t.id && music.playing }">
          <button class="desk-music-play" :title="'Odtwórz: ' + t.name" @click="playMusic(t.id)"><Icon :name="music.current === t.id && music.playing ? 'volume' : 'play'" /><span>{{ t.name }}</span></button>
          <button class="iconbtn" title="Usuń z listy" :aria-label="'Usuń: ' + t.name" @click="removeMusic(t.id)"><Icon name="trash" /></button>
        </li>
      </ul>
      <p v-if="music.error" class="note bad">{{ music.error }}</p>
    </template>
  </section>
</template>

<style scoped>
.desk-music { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line, #333); }
.desk-music-h { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.desk-music-h b { flex: 1; display: flex; align-items: center; gap: 6px; }
.desk-music-ctl { display: flex; align-items: center; gap: 6px; margin: 4px 0 6px; }
.desk-music-now { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.desk-music-now small { opacity: .7; font-weight: 400; }
.desk-music-vol { display: flex; align-items: center; gap: 8px; }
.desk-music-vol input { flex: 1; }
.desk-music-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.desk-music-list li { display: flex; align-items: center; gap: 4px; border-radius: 10px; }
.desk-music-list li.on { background: var(--panel3, rgba(255,255,255,.06)); }
.desk-music-play { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; justify-content: flex-start; border: 0; background: transparent; text-align: left; }
.desk-music-play span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desk-music-list li.playing .desk-music-play { color: var(--accent, #f2a53c); }
</style>

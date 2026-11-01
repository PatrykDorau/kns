<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { api, settings } from '@/stores'
import { addMusic, addPlaylist, findMusicLinks, music, nextMusic, playAllMusic, playMusic, removeMusic, setMusicVolume, stopMusic, toggleMusic, trackInfo, ytLink } from '@/services/studio'
import MusicEq from './MusicEq.vue'
import { mmss } from '@/composables/stream/useStudioMedia'

const nowName = computed(() => settings.musicList.find(x => x.id === music.current)?.name || 'Nic nie gra')
// Podkład muzyczny na transmisji (np. własne nagrania KNS Music — z YouTube Studio: Treści → ⋮ → Pobierz).
// Gra tylko na transmisji, z własną głośnością; „Wycisz” — płynnie w 3 s.
const editing = ref('') // utwór z rozwiniętymi polami do plakietki
const linkNote = ref(''), linkBusy = ref(false)
// playlista z YouTube: wybrana z kanału albo z wklejonego linku
const ytOpen = ref(false), ytLists = ref<{ id: string; title: string; count: number }[]>([]), ytPick = ref(''), ytNote = ref(''), ytBusy = ref(false)
async function openYt() {
  ytOpen.value = !ytOpen.value; ytNote.value = ''
  if (!ytOpen.value || ytLists.value.length) return
  const r = await api.ytPlaylists()
  if (r.error) ytNote.value = r.error; else ytLists.value = r.playlists
}
async function addYt() {
  ytBusy.value = true; ytNote.value = ''
  const r = await addPlaylist(ytPick.value)
  ytBusy.value = false
  ytNote.value = r.error || `Dodano ${r.added} z ${r.all} utworów.`
  if (!r.error) ytPick.value = ''
}
async function findLinks() {
  linkBusy.value = true; linkNote.value = ''
  const r = await findMusicLinks()
  linkBusy.value = false
  linkNote.value = r.error || (r.missing ? `Znaleziono ${r.found} z ${r.missing}.${r.found < r.missing ? ' Pozostałym wklej link ręcznie (ołówek przy utworze).' : ''}` : 'Wszystkie utwory mają już link.')
}
</script>

<template>
  <section class="desk-music" aria-label="Podkład muzyczny">
    <div class="desk-music-h">
      <b><MusicEq v-if="music.playing" /><Icon v-else name="music" />Podkład muzyczny</b>
      <button class="small" title="MP3, M4A, WAV albo MP4 (sam dźwięk) — pliki kopiują się do aplikacji" @click="addMusic"><Icon name="plus" />Dodaj muzykę</button>
      <button class="small" :class="{ on: ytOpen }" :aria-expanded="ytOpen" title="Utwory z playlisty grają wprost z YouTube — potrzebny dobry internet" @click="openYt"><Icon name="video" />Z YouTube</button>
    </div>
    <div v-if="ytOpen" class="desk-music-yt">
      <select v-if="ytLists.length" aria-label="Playlista kanału" @change="ytPick = ($event.target as HTMLSelectElement).value">
        <option value="">Playlista kanału…</option>
        <option v-for="p in ytLists" :key="p.id" :value="p.id">{{ p.title }} ({{ p.count }})</option>
      </select>
      <input v-model.trim="ytPick" placeholder="albo wklej link do playlisty" inputmode="url" aria-label="Link do playlisty">
      <button class="small primary" :disabled="ytBusy || !ytPick" @click="addYt">{{ ytBusy ? 'Dodaję…' : 'Dodaj' }}</button>
      <p v-if="ytNote" class="desk-help">{{ ytNote }}</p>
    </div>
    <p class="desk-help">Gra na każdej scenie, tylko na transmisji (nie w nagłośnieniu sali) — np. przy odliczaniu albo na planszy końcowej.</p>
    <p v-if="!settings.musicList.length" class="desk-help"> Własne utwory z kanału YouTube pobierzesz w YouTube Studio (Treści → ⋮ → Pobierz) i dodasz tutaj.</p>
    <template v-else>
      <div class="desk-music-ctl">
        <button class="primary small" :class="{ on: music.all && music.playing }" title="Gra całą listę po kolei (albo losowo) — na końcu cisza, chyba że „W kółko”" @click="playAllMusic"><Icon name="play" />Odtwórz wszystkie ({{ settings.musicList.length }})</button>
        <button class="iconbtn solid" :title="music.playing ? 'Pauza (płynnie)' : 'Odtwórz'" :aria-label="music.playing ? 'Pauza' : 'Odtwórz'" @click="toggleMusic"><Icon :name="music.playing ? 'pause' : 'play'" /></button>
        <button class="iconbtn" title="Następny utwór" aria-label="Następny utwór" @click="nextMusic"><Icon name="right" /></button>
        <button class="small" :disabled="!music.playing" title="Płynne wyciszenie (3 s) i zatrzymanie" @click="stopMusic(3)">Wycisz</button>
        <span class="desk-music-now"><MusicEq v-if="music.playing" />{{ nowName }}<small v-if="music.current && music.duration"> · {{ mmss(music.time) }} / {{ mmss(music.duration) }}</small></span>
      </div>
      <label class="desk-music-vol"><Icon name="volume" /><input type="range" min="0" max="1" step="0.01" :value="settings.musicVolume" aria-label="Głośność podkładu" @input="setMusicVolume(+($event.target as HTMLInputElement).value)"><small>{{ Math.round(settings.musicVolume * 100) }}%</small></label>
      <div class="desk-music-opts">
        <label class="check"><input v-model="settings.musicLoop" type="checkbox"> W kółko</label>
        <label class="check"><input v-model="settings.musicShuffle" type="checkbox"> Losowo</label>
        <small v-if="music.all && music.playing" class="muted">gra cała lista</small>
        <label class="check" title="Gdy ktoś mówi do mikrofonu, podkład cichnie do 25% i wraca po 1,5 s ciszy"><input v-model="settings.musicDuck" type="checkbox"> Ściszaj pod mową</label>
        <label v-if="settings.musicDuck" class="desk-music-duck" title="Im bardziej w lewo, tym cichszy głos ścisza muzykę">Czułość<input type="range" min="-55" max="-20" step="1" :value="-(settings.musicDuckDb ?? -38) - 75" aria-label="Czułość ściszania" @input="settings.musicDuckDb = -75 - +($event.target as HTMLInputElement).value"></label>
        <small v-if="music.ducked" class="desk-music-ducked">ściszone</small>
        <button class="small desk-music-find" :disabled="linkBusy" title="Szuka utworów bez linku wśród filmów kanału YouTube — link to kod QR na plakietce" @click="findLinks"><Icon name="qr" />{{ linkBusy ? 'Szukam…' : 'Znajdź linki na kanale' }}</button>
      </div>
      <p v-if="linkNote" class="desk-help">{{ linkNote }}</p>
      <ul class="desk-music-list">
        <li v-for="t in settings.musicList" :key="t.id" :class="{ on: music.current === t.id, playing: music.current === t.id && music.playing }">
          <button class="desk-music-play" :title="'Odtwórz: ' + t.name" @click="playMusic(t.id)"><MusicEq v-if="music.current === t.id && music.playing" /><Icon v-else name="play" /><span>{{ t.name }}</span></button>
          <Icon v-if="t.yt" name="video" class="desk-music-qr" title="Gra z YouTube" />
          <Icon v-if="t.link" name="qr" class="desk-music-qr" title="Ma link — kod QR na plakietce" />
          <button class="iconbtn" :class="{ on: editing === t.id }" title="Tytuł, wykonawca i link na plakietkę" :aria-label="'Plakietka: ' + t.name" :aria-expanded="editing === t.id" @click="editing = editing === t.id ? '' : t.id"><Icon name="pencil" /></button>
          <button class="iconbtn" title="Usuń z listy" :aria-label="'Usuń: ' + t.name" @click="removeMusic(t.id)"><Icon name="trash" /></button>
          <div v-if="editing === t.id" class="desk-music-edit">
            <label>Tytuł<input v-model="t.title" :placeholder="trackInfo({ name: t.name, yt: t.yt }).title"></label>
            <label>Wykonawca<input v-model="t.artist" :placeholder="trackInfo({ name: t.name, yt: t.yt }).artist"></label>
            <label>Link na YouTube<input :value="t.link" placeholder="https://youtu.be/…" inputmode="url" @change="t.link = ytLink(($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = t.link"></label>
          </div>
        </li>
      </ul>
      <p v-if="music.error" class="note bad">{{ music.error }}</p>
    </template>
  </section>
</template>

<style scoped>
.desk-music { margin: 0; }
.desk-music-h { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.desk-music-h b { flex: 1; display: flex; align-items: center; gap: 6px; }
.desk-music-ctl { display: flex; align-items: center; gap: 6px; margin: 4px 0 6px; }
.desk-music-now { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.desk-music-now small { opacity: .7; font-weight: 400; }
.desk-music-opts { display: flex; align-items: center; gap: 14px; margin: 4px 0; }
.desk-music-now { display: flex; align-items: center; gap: 8px; }
.desk-music-vol { display: flex; align-items: center; gap: 8px; }
.desk-music-vol input { flex: 1; }
.desk-music-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.desk-music-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; border-radius: 10px; }
.desk-music-yt { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; margin: 4px 0 8px; }
.desk-music-yt p { grid-column: 1 / -1; margin: 0; }
.desk-music-qr { width: 15px; height: 15px; flex: none; opacity: .7; }
.desk-music-find { margin-left: auto; }
.desk-music-duck { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.desk-music-duck input { width: 90px; }
.desk-music-ducked { color: var(--accent); font-weight: 600; }
.desk-music-edit { flex-basis: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; padding: 6px 8px 10px; }
.desk-music-edit label { display: grid; gap: 3px; font-size: 12px; color: var(--muted); }
.desk-music-edit label:last-child { grid-column: 1 / -1; }
.desk-music-list li.on { background: var(--panel3, rgba(255,255,255,.06)); }
.desk-music-play { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; justify-content: flex-start; border: 0; background: transparent; text-align: left; }
.desk-music-play span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desk-music-list li.playing .desk-music-play { color: var(--accent, #f2a53c); }
</style>

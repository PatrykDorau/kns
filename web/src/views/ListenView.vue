<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// ListenView
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p class="listen-intro">Chciałbyś poznać bliżej to, czym żyjemy? Kazania i uwielbienie — do obejrzenia i posłuchania.</p>
  <div class="listen-grid">
    <section v-if="listenYt || isChannelLink(listen.youtube)" class="listen-card">
      <div class="lc-head"><b>YouTube</b><a v-if="listen.youtubeMore || listen.youtube" class="lc-more" :href="listen.youtubeMore || listen.youtube" target="_blank" rel="noopener">więcej</a></div>
      <p v-if="listenLatest" class="lc-title">Najnowsze: {{ listenLatest.title }}</p>
      <div v-if="listenYt" class="lc-video"><iframe :src="listenYt" title="YouTube — Kościół Na Skale" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
    </section>
    <section v-if="listenSp" class="listen-card">
      <div class="lc-head"><b>Spotify</b><a class="lc-more" :href="listen.spotify" target="_blank" rel="noopener">więcej</a></div>
      <iframe class="lc-spotify" :src="listenSp" title="Spotify — Kościół Na Skale" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
    </section>
  </div>
  <div v-if="listen.musicYoutube || listen.musicSpotify" class="listen-music">
    <b>KNS Music</b>
    <a v-if="listen.musicYoutube" class="button" :href="listen.musicYoutube" target="_blank" rel="noopener">YouTube</a>
    <a v-if="listen.musicSpotify" class="button" :href="listen.musicSpotify" target="_blank" rel="noopener">Spotify</a>
  </div>
  <p v-if="!listenYt && !listenSp" class="note">{{ canManage ? 'Wklej poniżej linki do kanału YouTube i podcastu na Spotify.' : 'Wkrótce tutaj kazania z YouTube i Spotify.' }}</p>
  <details v-if="canManage" class="listen-set" :open="!listenYt && !listenSp">
    <summary>Ustaw linki (administrator)</summary>
    <label for="lsYt">YouTube — adres kanału</label>
    <input id="lsYt" v-model="listenEdit.youtube" placeholder="np. https://www.youtube.com/@koscionaskale" autocomplete="off">
    <p class="note" style="margin:4px 0 0">Adres kanału — strona sama pokazuje zawsze najnowsze kazanie. Można też wkleić konkretny film albo playlistę.</p>
    <label for="lsSp">Spotify — link do podcastu (zawsze najnowszy odcinek)</label>
    <input id="lsSp" v-model="listenEdit.spotify" placeholder="np. https://open.spotify.com/show/…" autocomplete="off">
    <label for="lsMy">KNS Music — YouTube (kanał albo playlista)</label>
    <input id="lsMy" v-model="listenEdit.musicYoutube" placeholder="np. https://www.youtube.com/@knsmusic" autocomplete="off">
    <label for="lsMs">KNS Music — Spotify (artysta albo playlista)</label>
    <input id="lsMs" v-model="listenEdit.musicSpotify" placeholder="np. https://open.spotify.com/artist/…" autocomplete="off">
    <p v-if="listenEdit.youtube && !youtubeEmbed(listenEdit.youtube) && !/youtube\.com\/(@|c\/|user\/)/.test(listenEdit.youtube)" class="error">To nie wygląda na link YouTube — wklej adres kanału, film albo playlistę.</p>
    <p v-if="listenEdit.spotify && !spotifyEmbed(listenEdit.spotify)" class="error">To nie wygląda na link Spotify (open.spotify.com/show/…).</p>
    <button class="primary" style="margin-top:12px" :disabled="busy" @click="saveListen">Zapisz linki</button>
  </details>
</template>

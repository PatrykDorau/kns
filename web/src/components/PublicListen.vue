<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Strona dla gości (bez konta albo przed zatwierdzeniem): tylko „Posłuchaj — odkryj nas”.
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<section class="public">
  <div class="section"><h2>Posłuchaj — odkryj nas</h2></div>
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
</section>
</template>

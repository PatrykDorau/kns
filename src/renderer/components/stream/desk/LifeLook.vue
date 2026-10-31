<script setup lang="ts">
import LookBg from './LookBg.vue'
import TextColor from './TextColor.vue'

// Scena „Życie kościoła” w presecie: tło ramki, napisy, co pokazać obok kamery i kod QR.
defineProps<{ look: any }>()
const QRS = [['bank', 'Wsparcie (przelew / BLIK)'], ['youtube', 'YouTube'], ['spotify', 'Spotify'], ['link', 'Własny link'], ['none', 'Bez kodu']] as const
</script>

<template>
  <div class="desk-cd" role="group" aria-label="Ramka">
    <div class="desk-opt-group">
      <small class="muted">Układ</small>
      <button :class="{ on: look.layout !== 'frame' }" title="Kamera na całą wysokość, ogłoszenia jadą z prawej i nachodzą na obraz" @click="look.layout = 'side'">Boczny</button>
      <button :class="{ on: look.layout === 'frame' }" title="Kamera w oknie, ogłoszenia obok, u dołu pas z wydarzeniami" @click="look.layout = 'frame'">Ramka</button>
    </div>
    <LookBg :look="look" />
    <TextColor :look="look" />
    <div class="desk-opt-group desk-cd-text">
      <label>Napis <input v-model="look.title" maxlength="50"></label>
      <label>Nazwa <input v-model="look.brand" maxlength="40"></label>
    </div>
    <div class="desk-opt-group">
      <label class="check"><input v-model="look.ann" type="checkbox"> Ogłoszenia</label>
      <label class="check" title="Tylko wydarzenia zaznaczone „Pokaż na nabożeństwie” i dostępne dla wszystkich"><input v-model="look.events" type="checkbox"> Najbliższe wydarzenia</label>
      <small class="muted">Kod QR</small>
      <select v-model="look.qr" aria-label="Kod QR">
        <option v-for="[id, name] in QRS" :key="id" :value="id">{{ name }}</option>
      </select>
      <input v-if="look.qr === 'link'" v-model="look.link" type="url" aria-label="Link do kodu QR" style="min-width: 260px">
    </div>
    <p class="desk-help">Puste pole nic nie pokazuje. Ogłoszenia wybierasz w zakładce „Ogłoszenia”. Wydarzenia: tylko zaznaczone „Pokaż na nabożeństwie” i dostępne dla wszystkich.</p>
  </div>
</template>

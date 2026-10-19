<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// baza pieśni: lista
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="searchbox">
    <svg class="i"><use href="#search"/></svg>
    <input v-model="songQuery" type="search" :placeholder="`Szukaj: numer, tytuł, tekst (${songs.length})`" autocomplete="off">
  </div>
  <button v-if="canEdit" class="primary" style="width:100%;margin-top:12px" @click="newSong"><svg class="i"><use href="#plus"/></svg>Nowa pieśń</button>
  <div class="songs">
    <p v-if="!songResults.length" class="note">{{ songs.length ? 'Nie ma takiej pieśni.' : 'Baza pieśni jest pusta.' }}</p>
    <button v-for="s in songResults" :key="s.id" class="song pickable" @click="openSong(s)">
      <span class="pos">{{ s.number || '♪' }}</span>
      <span class="meta"><b>{{ s.title }}</b><small>{{ lines(s.text) }}</small></span>
      <svg class="i chev"><use href="#chev"/></svg>
    </button>
  </div>
</template>

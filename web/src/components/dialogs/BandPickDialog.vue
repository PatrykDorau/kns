<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Skład zespołu: wybór osoby ze służby muzycznej (instrument wybiera się potem w wierszu)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay band-pick" @click.self="bandPick.open = false">
  <div class="np-panel" role="dialog" aria-label="Dodaj osobę do składu">
    <div class="np-head"><b>Dodaj osobę do składu</b><button class="icon" aria-label="Zamknij" @click="bandPick.open = false"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="searchbox"><svg class="i"><use href="#search"/></svg><input v-model="bandPick.query" type="search" placeholder="Szukaj albo wpisz imię i nazwisko" autocomplete="off" @keydown.enter="bandPickFree"></div>
    <div class="np-list">
      <div v-if="bandPick.busy" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
      <p v-else-if="bandPick.error" class="error">{{ bandPick.error }}</p>
      <button v-for="p in bandPickList" :key="p.id" type="button" @click="bandAdd(p.name)"><svg class="i"><use href="#user"/></svg>{{ p.name }}</button>
      <p v-if="!bandPick.busy && !bandPick.people.length && !bandPick.error" class="note">Nie znalazłem służby muzycznej z osobami (nazwa z „muzy”, „uwielb” albo „zesp”). Wpisz imię i nazwisko wyżej.</p>
      <button v-if="bandPick.query.trim() && !bandPickList.some(p => p.name.toLowerCase() === bandPick.query.trim().toLowerCase())" type="button" @click="bandPickFree"><svg class="i"><use href="#plus"/></svg>Dodaj „{{ bandPick.query.trim() }}”</button>
    </div>
  </div>
</div>
</template>

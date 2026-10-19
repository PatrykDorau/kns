<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Dodawanie osoby do służby (lider)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="addTo = null">
  <div class="np-panel" role="dialog" :aria-label="'Dodaj osobę: ' + addTo.name">
    <div class="np-head"><b>Dodaj do: {{ addTo.name }}</b><button class="icon" aria-label="Zamknij" @click="addTo = null"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="searchbox"><svg class="i"><use href="#search"/></svg><input v-model="addQuery" type="search" placeholder="Szukaj osoby albo grupki" autocomplete="off"></div>
    <div class="np-list">
      <p v-if="!addCandidates.length" class="note">{{ addPeople.length ? 'Nikogo takiego nie ma (albo już służy).' : 'Wczytuję…' }}</p>
      <button v-for="p in addCandidates" :key="p.id" class="inbox-item" :disabled="busy" @click="addPerson(p)">
        <span class="inbox-text"><b>{{ p.name }}</b><span v-if="p.grupa">{{ p.grupa }}</span></span>
        <svg class="i"><use href="#plus"/></svg>
      </button>
    </div>
  </div>
</div>
</template>

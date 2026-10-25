<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Szeroki ekran: stały boczny pasek — wszystkie części aplikacji, konto na dole.
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<aside class="side" aria-label="Nawigacja">
  <div class="side-top">
    <button class="side-brand" title="Strona startowa" @click="navTo('home')"><img src="znak.png" alt=""><span><b>Kościół Na Skale</b></span></button>
    <button v-if="api.enabled" class="side-ib" :class="{ on: inboxOpen }" title="Powiadomienia" aria-label="Powiadomienia" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="side-dot">{{ unread }}</span></button>
    <button class="side-ib" :class="{ spin: busy }" :disabled="busy" title="Odśwież" aria-label="Odśwież" @click="reload()"><svg class="i"><use href="#refresh"/></svg></button>
  </div>
  <nav class="side-nav">
    <template v-for="grp in sideNav" :key="grp.title">
      <small v-if="grp.title" class="side-sec">{{ grp.title }}</small>
      <button v-for="it in grp.items" :key="it.id" class="side-it" :class="{ on: navOn(it.id) }" :aria-current="navOn(it.id) ? 'page' : null" @click="navTo(it.id)">
        <svg class="i"><use :href="'#' + it.icon"/></svg><span>{{ it.name }}</span><small v-if="it.beta" class="beta-tag" title="Funkcja eksperymentalna — może się jeszcze zmienić">beta</small><em v-if="it.badge" class="side-badge">{{ it.badge }}</em>
      </button>
    </template>
  </nav>
  <div v-if="desktop && !inApp && canCamera && desktopApp.url" class="side-app">
    <b>Rzutnik i Stream</b><small>aplikacja na komputer</small>
    <a class="button" :href="desktopApp.url"><svg class="i"><use href="#download"/></svg>Pobierz</a>
  </div>
  <div v-if="me" class="side-me">
    <button class="side-me-btn" :class="{ on: profileView }" title="Mój profil" @click="navTo('profile')">
      <span class="kh-av">{{ initials(me) }}</span>
      <span class="side-me-text"><b>{{ me.name || me.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
      <svg v-if="needsName" class="i kh-warn" aria-label="Uzupełnij imię i nazwisko"><use href="#warn"/></svg>
    </button>
    <button class="side-ib theme-btn" :title="theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'" :aria-label="theme === 'dark' ? 'Włącz tryb jasny' : 'Włącz tryb ciemny'" @click="toggleTheme"><svg class="i"><use :href="theme === 'dark' ? '#sun' : '#moon'"/></svg></button>
    <button class="side-ib" title="Wyloguj" aria-label="Wyloguj" @click="logout"><svg class="i"><use href="#logout"/></svg></button>
  </div>
</aside>
</template>

<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Szeroki ekran: pasek konta na górze każdego widoku (jak w aplikacji na komputer).
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="kh kh-bar">
    <div class="kh-top">
      <button class="kh-brand" title="Strona startowa" @click="showServices(); closeAll()"><img class="kh-mark" src="znak.png" alt=""><span class="kh-name">Kościół Na Skale</span></button>
      <span class="kh-spacer"></span>
      <button v-if="api.enabled" class="kh-ib" title="Powiadomienia" aria-label="Powiadomienia" :class="{ on: inboxOpen }" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="kh-count">{{ unread }}</span></button>
      <button class="kh-ib" :class="{ spin: busy }" :disabled="busy" title="Odśwież" aria-label="Odśwież" @click="reload()"><svg class="i"><use href="#refresh"/></svg></button>
      <button class="kh-ib" title="Więcej: pieśni, ogłoszenia, protokoły, osoby…" aria-label="Więcej" :class="{ on: moreView }" @click="openMore"><svg class="i"><use href="#menu"/></svg><span v-if="canManage && pendingCount" class="kh-count">{{ pendingCount }}</span></button>
      <span v-if="me" class="kh-me kh-me-btn" role="button" tabindex="0" title="Mój profil" @click="openProfile" @keydown.enter="openProfile">
        <span class="kh-av">{{ initials(me) }}</span>
        <span class="kh-me-text"><b>{{ me.name || me.email }}</b><small>{{ myRanks || 'Członek' }}</small></span>
        <svg v-if="needsName" class="i kh-warn" aria-label="Uzupełnij imię i nazwisko"><title>Uzupełnij imię i nazwisko w profilu</title><use href="#warn"/></svg>
      </span>
      <button v-if="me" class="kh-ib" title="Wyloguj" aria-label="Wyloguj" @click="logout"><svg class="i"><use href="#logout"/></svg></button>
    </div>
</div>
</template>

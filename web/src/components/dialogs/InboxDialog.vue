<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Powiadomienia w aplikacji (zawsze włączone; telefon i e-mail — dodatkowo, w ustawieniach)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="inboxOpen = false">
  <div class="np-panel" role="dialog" aria-label="Powiadomienia">
    <div class="np-head"><b>Powiadomienia</b><button class="icon" aria-label="Zamknij" @click="inboxOpen = false"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="np-list">
      <p v-if="!inbox.length" class="note">Nie masz powiadomień. Tutaj pojawią się zgłoszenia do zatwierdzenia, zgłoszenia do służby i wiadomości od liderów.</p>
      <button v-for="n in inbox" :key="n.id" class="inbox-item" :class="{ unread: !n.read }" @click="openNotice(n)">
        <span class="inbox-dot"></span>
        <span class="inbox-text"><b>{{ n.title }}</b><span v-if="n.body">{{ n.body }}</span></span>
        <small>{{ agoText(n.created) }}</small>
      </button>
    </div>
    <div v-if="unread" class="np-foot"><button class="ghost" @click="readAll">Oznacz wszystkie jako przeczytane</button></div>
  </div>
</div>
</template>

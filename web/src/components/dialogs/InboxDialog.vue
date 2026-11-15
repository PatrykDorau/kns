<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Powiadomienia w aplikacji (zawsze włączone; telefon i e-mail — dodatkowo, w ustawieniach).
// Kliknięcie przenosi do miejsca, którego dotyczy powiadomienie (strzałka); zwykła wiadomość — tylko przeczytana.
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="inboxOpen = false">
  <div class="np-panel inbox-panel" role="dialog" aria-label="Powiadomienia">
    <div class="np-head">
      <b>Powiadomienia<small v-if="unread" class="inbox-count">{{ unread }}</small></b>
      <button v-if="unread" class="inbox-readall" title="Oznacz wszystkie jako przeczytane" aria-label="Oznacz wszystkie jako przeczytane" @click="readAll"><svg class="i"><use href="#check"/></svg>Przeczytane</button>
      <button class="icon" aria-label="Zamknij" @click="inboxOpen = false"><svg class="i"><use href="#x"/></svg></button>
    </div>
    <div class="np-list">
      <p v-if="!inbox.length" class="note">Nie masz powiadomień. Tutaj pojawią się zgłoszenia do zatwierdzenia, zgłoszenia do służby i wiadomości od liderów.</p>
      <button v-for="n in inbox" :key="n.id" class="inbox-item" :class="{ unread: !n.read, link: noticeTarget(n) && noticeTarget(n) !== '/' }" @click="openNotice(n)">
        <span class="inbox-dot"></span>
        <span class="inbox-text"><b>{{ n.title }}</b><span v-if="n.body">{{ n.body }}</span></span>
        <span class="inbox-side"><small>{{ agoText(n.created) }}</small><svg v-if="noticeTarget(n) && noticeTarget(n) !== '/'" class="i inbox-go"><use href="#chev"/></svg></span>
      </button>
    </div>
  </div>
</div>
</template>

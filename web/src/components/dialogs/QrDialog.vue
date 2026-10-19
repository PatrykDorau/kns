<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Kod QR do wydarzenia / ogłoszenia: podgląd, pobranie PNG
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="qr = null">
  <div class="np-panel qr-panel" role="dialog" aria-label="Kod QR">
    <div class="np-head"><b>Kod QR</b><button class="icon" aria-label="Zamknij" @click="qr = null"><svg class="i"><use href="#x"/></svg></button></div>
    <p class="note" style="margin-top:0">{{ qr.title }} — po zeskanowaniu otworzy się {{ qr.kind === 'wydarzenie' ? 'to wydarzenie' : 'to ogłoszenie' }} (po zalogowaniu).</p>
    <img v-if="qr.png" class="qr-img" :src="qr.png" alt="Kod QR">
    <p v-else class="note">{{ qr.error || 'Przygotowuję…' }}</p>
    <small class="qr-url">{{ qr.url }}</small>
    <div class="np-foot qr-actions">
      <button @click="shareLink(qr.kind, qr.id, qr.title)"><svg class="i"><use href="#link"/></svg>Kopiuj link</button>
      <a v-if="qr.png" class="button primary" :href="qr.png" :download="qr.file"><svg class="i"><use href="#download"/></svg>Pobierz PNG</a>
    </div>
  </div>
</div>
</template>

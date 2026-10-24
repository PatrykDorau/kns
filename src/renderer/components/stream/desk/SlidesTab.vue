<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { showSlide, studio, upcomingService } from '@/services/studio'

// Zakładka „Ogłoszenia”: pętla ogłoszeń w odliczaniu — które są w pętli, co ile sekund, pokaż teraz.
defineProps<{ slides: { id: string; title: string; image?: string; text?: string; service?: boolean }[] }>()
function toggleSlide(id: string) { const h = new Set(settings.studioHidden || []); h.has(id) ? h.delete(id) : h.add(id); settings.studioHidden = [...h] }
</script>

<template>
  <div class="desk-slide-bar">
    <label>Zmiana co <select v-model.number="settings.studioSlideSec"><option v-for="v in [5, 8, 10, 15, 20]" :key="v" :value="v">{{ v }} s</option></select></label>
    <small class="muted">Kliknij grafikę — pokaże się teraz. Oko — w pętli albo pominięte. Tylko „dla wszystkich” z „Pokaż na nabożeństwie”.</small>
  </div>
  <div class="desk-slide-grid">
    <div v-for="sl in slides" :key="sl.id" class="desk-slide" :class="{ off: studio.hidden.includes(sl.id), now: studio.slideId === sl.id && !studio.hidden.includes(sl.id) }">
      <button class="desk-slide-pic" :disabled="studio.hidden.includes(sl.id)" :title="'Pokaż teraz: ' + sl.title" @click="showSlide(sl.id)">
        <img v-if="sl.image" :src="sl.image" alt="" loading="lazy">
        <span v-else class="desk-slide-txt"><b>{{ sl.title }}</b><small v-if="sl.text">{{ sl.text }}</small><small v-if="sl.service">{{ upcomingService() ? 'data, miejsce i kazanie' : '⚠ brak zaplanowanego — uzupełnij w Organizacji' }}</small></span>
        <em v-if="studio.slideId === sl.id && !studio.hidden.includes(sl.id)">TERAZ</em>
      </button>
      <span class="desk-slide-name">{{ sl.title }}</span>
      <button class="desk-slide-eye" :title="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" :aria-label="studio.hidden.includes(sl.id) ? 'Włącz do pętli' : 'Pomiń w pętli'" @click="toggleSlide(sl.id)"><Icon :name="studio.hidden.includes(sl.id) ? 'eyeoff' : 'eye'" /></button>
    </div>
  </div>
  <p class="note">Inne ogłoszenia dodasz albo wyłączysz w Ogłoszeniach („Pokaż na nabożeństwie”, „Dla wszystkich”). Lista zmienia się sama.</p>
</template>

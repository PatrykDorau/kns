<script setup lang="ts">
// Nakładka „Modlitwa” w presecie: napis, podpis i kod QR do próśb modlitewnych.
defineProps<{ look: { style?: string, head: string, text: string, sub: string, link: string, label: string } }>()
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Modlitwa">
    <div class="desk-opt-group">
      <small class="muted">Styl</small>
      <button :class="{ on: look.style !== 'edit' }" @click="look.style = 'rock'">Skała</button>
      <button :class="{ on: look.style === 'edit' }" @click="look.style = 'edit'">Czysty</button>
    </div>
    <div class="desk-opt-group desk-cd-text">
      <label>Nagłówek <input v-model="look.head" maxlength="40"></label>
      <label>Napis modlitwy <input v-model="look.text" maxlength="80"></label>
      <label>Podpis <input v-model="look.sub" maxlength="100"></label>
      <label title="Link do strony, gdzie można zostawić prośbę o modlitwę — na nakładce pokaże się kod QR">Kod QR (link) <input v-model="look.link" type="url"></label>
      <label v-if="look.link">Podpis kodu <input v-model="look.label" maxlength="30"></label>
    </div>
  </div>
</template>

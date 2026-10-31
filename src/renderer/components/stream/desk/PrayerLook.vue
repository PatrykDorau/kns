<script setup lang="ts">
// Nakładka „Modlitwa” w presecie: napis, podpis i kod QR do próśb modlitewnych.
defineProps<{ look: { text: string, sub: string, link: string, label: string } }>()
</script>

<template>
  <div class="desk-cd desk-banner" role="group" aria-label="Modlitwa">
    <div class="desk-opt-group desk-cd-text">
      <label>Napis modlitwy <input v-model="look.text" maxlength="80" placeholder="Zachęcamy do modlitwy"></label>
      <label>Podpis <input v-model="look.sub" maxlength="100" placeholder="np. Możesz podejść do przodu — modlimy się za ciebie"></label>
      <label title="Link do strony, gdzie można zostawić prośbę o modlitwę — na nakładce pokaże się kod QR">Kod QR (link) <input v-model="look.link" type="url" placeholder="https://… strona z prośbami (puste — bez kodu)"></label>
      <label v-if="look.link">Podpis kodu <input v-model="look.label" maxlength="30" placeholder="Prośby modlitewne"></label>
    </div>
  </div>
</template>

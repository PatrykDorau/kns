<script setup lang="ts">
// Mała ikonka „gra muzyka” — trzy podskakujące słupki (korektor).
</script>

<template>
  <span class="music-eq" role="img" aria-label="Gra muzyka" title="Na transmisji gra muzyka"><i></i><i></i><i></i></span>
</template>

<style scoped>
.music-eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 14px; height: 13px; flex: none; }
.music-eq i { flex: 1; height: 100%; border-radius: 1px; background: #3ccf73; transform-origin: bottom; animation: eq 0.9s ease-in-out infinite; }
.music-eq i:nth-child(2) { animation-delay: -0.3s; animation-duration: 0.7s; }
.music-eq i:nth-child(3) { animation-delay: -0.55s; animation-duration: 1.1s; }
@keyframes eq { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .music-eq i { animation: none; transform: scaleY(0.7); } }
</style>

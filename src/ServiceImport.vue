<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'
import SyncButton from './SyncButton.vue'
import { applyService, importService, nearestService, prettyDate, serviceModal, settings, sortedServices } from './store.js'

// Rzutnik: wczytanie zaplanowanego nabożeństwa — pieśni i załączniki ładują się same.
const message = ref('')
const busyId = ref(null)

async function load(svc) {
  busyId.value = svc.id
  try { await applyService(svc) } finally { busyId.value = null }
}
async function fromFolder() {
  const res = await importService()
  if (res.error) message.value = res.error
  else if (res.service) await load(res.service)
}
</script>

<template>
  <div class="overlay" @click.self="serviceModal = false" @keydown.esc.stop="serviceModal = false">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Wczytaj nabożeństwo">
      <div class="modal-head">
        <h3>Wczytaj nabożeństwo</h3>
        <button class="iconbtn" aria-label="Zamknij" @click="serviceModal = false"><Icon name="x" /></button>
      </div>
      <p class="note">Lista pieśni zostanie zastąpiona pieśniami z nabożeństwa, a załączniki (np. prezentacja kaznodziei) trafią do materiałów.</p>

      <div v-if="!sortedServices.length" class="empty">Nie ma zaplanowanych nabożeństw. Tworzy je służba „Organizacja nabożeństw”.</div>
      <ul class="svc-list">
        <li v-for="svc in sortedServices" :key="svc.id" :class="{ next: svc.id === nearestService?.id }">
          <span class="meta">
            <span class="name">{{ prettyDate(svc.date) }}<span v-if="svc.id === nearestService?.id" class="badge next">NAJBLIŻSZE</span></span>
            <span class="kind">{{ svc.sermonTitle || 'Bez tytułu kazania' }}<template v-if="svc.speaker"> · {{ svc.speaker }}</template></span>
            <span class="kind">Pieśni: {{ svc.songs.length }} · Załączniki: {{ svc.files.length }}</span>
          </span>
          <button :class="{ primary: svc.id === nearestService?.id }" :disabled="busyId !== null" @click="load(svc)">
            {{ busyId === svc.id ? 'Wczytuję…' : svc.id === settings.activeService ? 'Wczytaj ponownie' : 'Wczytaj' }}
          </button>
        </li>
      </ul>

      <div class="btnrow">
        <button title="Nabożeństwo zapisane jako folder na innym komputerze" :disabled="busyId !== null" @click="fromFolder"><Icon name="folder" />Wczytaj z folderu…</button>
        <SyncButton status />
        <span class="spacer"></span>
        <button @click="serviceModal = false">Pomiń</button>
      </div>
      <p v-if="message" class="url">{{ message }}</p>
    </div>
  </div>
</template>

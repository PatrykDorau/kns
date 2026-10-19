<script setup>
import { computed, ref } from 'vue'
import Icon from '../common/Icon.vue'
import SyncButton from '../common/SyncButton.vue'
import { applyService, importService, missingInfo, nearestService, relDay, serviceModal, services, settings, today } from '../../stores/store.js'

// Rzutnik: wczytanie zaplanowanego nabożeństwa — pieśni i załączniki ładują się same.
const message = ref('')
const busyId = ref(null)
const showPast = ref(false)

// Nadchodzące od najbliższego; wcześniejsze schowane, od najnowszego.
const upcoming = computed(() => services.value.filter(s => s.date >= today()).sort((a, b) => a.date.localeCompare(b.date)))
const past = computed(() => services.value.filter(s => s.date < today()).sort((a, b) => b.date.localeCompare(a.date)))
const list = computed(() => (showPast.value ? [...upcoming.value, ...past.value] : upcoming.value))
const asDate = d => new Date(d + 'T12:00')
const day = d => asDate(d).getDate()
const month = d => asDate(d).toLocaleDateString('pl', { month: 'short' }).replace('.', '')
const weekday = d => asDate(d).toLocaleDateString('pl', { weekday: 'long' })
const wd = d => asDate(d).toLocaleDateString('pl', { weekday: 'short' }).replace('.', '')

async function load(svc, parts) {
  busyId.value = svc.id
  try { await applyService(svc, parts) } finally { busyId.value = null }
}
async function fromFolder() {
  const res = await importService()
  if (res.error) message.value = res.error
  else if (res.service) await load(res.service)
}
</script>

<template>
  <div class="overlay" @click.self="serviceModal = false" @keydown.esc.stop="serviceModal = false">
    <div class="modal svc-modal" role="dialog" aria-modal="true" aria-label="Wczytaj nabożeństwo">
      <div class="modal-head">
        <h3>Wczytaj nabożeństwo</h3>
        <span class="spacer"></span>
        <SyncButton />
        <button class="iconbtn" aria-label="Zamknij" @click="serviceModal = false"><Icon name="x" /></button>
      </div>
      <p class="note">Pieśni z nabożeństwa zastąpią obecną listę pieśni, a załączniki (np. prezentacja kaznodziei) trafią do materiałów. Można też wczytać tylko jedno z nich.</p>

      <div v-if="!list.length" class="empty">
        {{ past.length ? 'Nie ma nadchodzących nabożeństw.' : 'Nie ma zaplanowanych nabożeństw. Tworzy je służba „Organizacja nabożeństw”.' }}
      </div>
      <ul class="svc-list">
        <li v-for="svc in list" :key="svc.id" :class="{ next: svc.id === nearestService?.id && svc.date >= today(), active: svc.id === settings.activeService, past: svc.date < today() }">
          <span class="date"><small class="wd">{{ wd(svc.date) }}</small><b>{{ day(svc.date) }}</b><small>{{ month(svc.date) }}</small></span>
          <span class="meta">
            <span class="title">{{ svc.sermonTitle || 'Bez tytułu kazania' }}</span>
            <span class="kind">{{ weekday(svc.date) }}<template v-if="svc.speaker"> · {{ svc.speaker }}</template><template v-if="svc.passage"> · {{ svc.passage }}</template></span>
            <span class="chips">
              <span v-if="svc.id === settings.activeService" class="badge loaded"><Icon name="check" />WCZYTANE</span>
              <span v-else-if="svc.id === nearestService?.id && svc.date >= today()" class="badge next">NAJBLIŻSZE</span>
              <span v-if="svc.date >= today() && missingInfo(svc).length" class="badge bad" :title="'Brakuje: ' + missingInfo(svc).join(', ')"><Icon name="missing" />BRAKI</span>
              <span class="chip rel" :class="{ soon: svc.date >= today() }">{{ relDay(svc.date) }}</span>
              <span class="chip"><Icon name="music" />{{ svc.songs.length }}</span>
              <span class="chip"><Icon name="image" />{{ svc.files.length }}</span>
            </span>
          </span>
          <span class="loadbox">
            <button :class="{ primary: svc.id === nearestService?.id && svc.id !== settings.activeService }" :disabled="busyId !== null" title="Pieśni i załączniki" @click="load(svc)">
              <span v-if="busyId === svc.id" class="spinner" aria-hidden="true"></span>
              {{ busyId === svc.id ? 'Wczytuję…' : svc.id === settings.activeService ? 'Wczytaj ponownie' : 'Wczytaj wszystko' }}
            </button>
            <span class="only">
              <button :disabled="busyId !== null || !svc.songs.length" title="Tylko pieśni — materiały zostają bez zmian" @click="load(svc, { songs: true })"><Icon name="music" />Pieśni</button>
              <button :disabled="busyId !== null || !svc.files.length" title="Tylko załączniki — lista pieśni zostaje bez zmian" @click="load(svc, { files: true })"><Icon name="image" />Materiały</button>
            </span>
          </span>
        </li>
      </ul>
      <button v-if="past.length" class="more" @click="showPast = !showPast">{{ showPast ? 'Ukryj wcześniejsze' : `Pokaż wcześniejsze (${past.length})` }}</button>

      <p v-if="message" class="url">{{ message }}</p>
      <div class="modal-foot">
        <button class="ghostbtn" title="Nabożeństwo zapisane jako folder na innym komputerze" :disabled="busyId !== null" @click="fromFolder"><Icon name="folder" />Wczytaj z folderu…</button>
        <span class="spacer"></span>
        <button @click="serviceModal = false">Pomiń</button>
      </div>
    </div>
  </div>
</template>

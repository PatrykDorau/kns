<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// osoby i rangi (administrator)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div v-if="peopleBusy && !people.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
  <template v-for="group in peopleGroups" :key="group.id">
    <div class="section"><h2>{{ group.title }} · {{ group.list.length }}</h2></div>
    <div v-for="p in group.list" :key="p.email" class="person" :class="p.status">
      <div class="p-head">
        <span class="avatar">{{ initials(p) }}</span>
        <span class="meta"><b>{{ p.name || p.email }}</b><small>{{ p.email }}<template v-if="p.status === 'pending' && p.requested"> · {{ ago(p.requested) }}</template></small></span>
      </div>
      <div v-if="p.status !== 'rejected'" class="ranks" role="group" :aria-label="'Rangi: ' + (p.name || p.email)">
        <button v-for="r in ranks" :key="r.id" class="rank" :class="{ on: p.draft.includes(r.id) }" :aria-pressed="p.draft.includes(r.id)" :disabled="p.busy" @click="toggleRank(p, r.id)">{{ r.name }}</button>
      </div>
      <p v-if="p.error" class="p-error">{{ p.error }}</p>
      <div class="p-actions">
        <template v-if="p.status === 'pending'">
          <button :disabled="p.busy" @click="setPerson(p, 'rejected')">Odrzuć</button>
          <button class="primary" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Zatwierdź' }}</button>
        </template>
        <button v-else-if="p.status === 'rejected'" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Przywróć dostęp' }}</button>
        <template v-else>
          <button v-if="p.email !== me?.email" class="ghost" :disabled="p.busy" @click="setPerson(p, 'rejected')">Odbierz dostęp</button>
          <button class="primary" :disabled="p.busy || !rolesChanged(p)" @click="setPerson(p)">{{ p.busy ? 'Zapisuję…' : rolesChanged(p) ? 'Zapisz rangi' : 'Zapisane' }}</button>
        </template>
      </div>
    </div>
  </template>
  <div v-if="drive.backend === 'supabase'" class="newsletter migrate">
    <span class="pc-icon"><svg class="i"><use href="#drive"/></svg></span>
    <div class="pc-text"><b>Dane z Dysku Google</b><p>Jednorazowo: nabożeństwa, pieśni, kalendarz, szablony, ogłoszenia i protokoły z plików na Dysku do bazy. To, co w bazie jest nowsze, zostaje.</p>
      <p v-if="migrated" class="pc-saved">{{ migrated }}</p></div>
    <button :disabled="!!migrating" @click="migrate">{{ migrating || 'Przenieś' }}</button>
  </div>
  <p v-if="drive.backend !== 'supabase'" class="note" style="margin-top:18px">Zatwierdzenie od razu udostępnia foldery na Dysku Google: wszyscy widzą folder aplikacji i protokoły ze spotkań członkowskich;
    lider, organizator, technika, rada i pastor mogą zmieniać nabożeństwa i pieśni; protokolant pisze protokoły; rada i pastor mają folder rady.</p>
</template>

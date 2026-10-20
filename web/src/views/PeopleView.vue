<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// osoby i rangi (administrator)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <!-- wyszukiwanie osób i filtr rangi -->
  <div class="people-tools">
    <div class="ann-search"><svg class="i"><use href="#search"/></svg><input v-model="peopleUi.query" type="search" placeholder="Szukaj osoby: imię, nazwisko, e-mail…" aria-label="Szukaj osoby" autocomplete="off"></div>
    <UiSelect v-model="peopleUi.rank" compact label="Filtr rangi" :options="[{ value: '', label: 'Wszystkie rangi' }, ...ranks.map(r => ({ value: r.id, label: r.name }))]" />
  </div>
  <div v-if="peopleBusy && !people.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="people.length && !peopleGroups.length" class="note">Nikt nie pasuje do wyszukiwania.</p>
  <template v-for="group in peopleGroups" :key="group.id">
    <div class="section"><h2>{{ group.title }} · {{ group.list.length }}</h2></div>
    <div v-for="p in group.list" :key="p.email" class="person" :class="[p.status, { open: peopleUi.open === p.email }]">
      <div class="p-head">
        <span class="avatar">{{ initials(p) }}</span>
        <span class="meta"><b>{{ p.name || p.email }}</b><small>{{ p.email }}<template v-if="p.status === 'pending' && p.requested"> · {{ ago(p.requested) }}</template></small></span>
        <button v-if="p.status !== 'rejected'" class="p-ranks-btn" :aria-expanded="peopleUi.open === p.email" @click="openRanks(p)"><svg class="i"><use href="#pencil"/></svg>{{ peopleUi.open === p.email ? 'Zwiń' : 'Rangi' }}</button>
      </div>
      <!-- przypisane rangi (zawsze widoczne) -->
      <div v-if="p.status !== 'rejected'" class="p-tags">
        <span v-for="id in p.draft" :key="id" class="ann-tag pin">{{ rankName(id) }}</span>
        <span v-if="!p.draft.length" class="muted" style="font-size:13px">bez rangi</span>
      </div>
      <!-- edycja rang: wyszukiwanie i lista z polami wyboru (wygodne także przy wielu rangach) -->
      <div v-if="peopleUi.open === p.email" class="p-rank-edit" role="group" :aria-label="'Rangi: ' + (p.name || p.email)">
        <div class="ann-search"><svg class="i"><use href="#search"/></svg><input v-model="peopleUi.rankQuery" type="search" placeholder="Szukaj rangi…" aria-label="Szukaj rangi" autocomplete="off"></div>
        <div class="p-rank-list">
          <label v-for="r in ranksShown" :key="r.id" class="p-rank" :class="{ on: p.draft.includes(r.id) }">
            <input type="checkbox" :checked="p.draft.includes(r.id)" :disabled="p.busy" @change="toggleRank(p, r.id)"><span>{{ r.name }}</span>
          </label>
          <p v-if="!ranksShown.length" class="note">Brak rangi „{{ peopleUi.rankQuery }}”.</p>
        </div>
      </div>
      <p v-if="p.error" class="p-error">{{ p.error }}</p>
      <div v-if="p.status === 'pending' || p.status === 'rejected' || peopleUi.open === p.email || rolesChanged(p)" class="p-actions">
        <template v-if="p.status === 'pending'">
          <button :disabled="p.busy" @click="setPerson(p, 'rejected')">Odrzuć</button>
          <button class="primary" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Zatwierdź' }}</button>
        </template>
        <button v-else-if="p.status === 'rejected'" :disabled="p.busy" @click="setPerson(p, 'active')">{{ p.busy ? 'Zapisuję…' : 'Przywróć dostęp' }}</button>
        <template v-else>
          <button v-if="p.email !== me?.email" class="ghost" :disabled="p.busy" @click="setPerson(p, 'rejected')">Odbierz dostęp</button>
          <button v-if="rolesChanged(p)" :disabled="p.busy" @click="cancelRanks(p)">Anuluj</button>
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

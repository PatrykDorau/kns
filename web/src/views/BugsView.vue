<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import StoragePanel from '@/components/StoragePanel.vue'

// Zgłoszenia: administrator i deweloperzy — backlog (status, kto się zajmuje, notatka); pozostali — swoje zgłoszenia.
// druga zakładka (backlog): miejsce na dane — baza i pliki, sprzątanie nieużywanych
export default defineComponent({ components: { StoragePanel }, setup: () => ({ ...useApp(), bugTab: ref('bugs') }) })
</script>

<template>
  <div v-if="bugs.backlog" class="serve-tabs" role="tablist">
    <button role="tab" :aria-selected="bugTab === 'bugs'" @click="bugTab = 'bugs'"><svg class="i"><use href="#alert"/></svg>Zgłoszenia</button>
    <button role="tab" :aria-selected="bugTab === 'space'" @click="bugTab = 'space'"><svg class="i"><use href="#list"/></svg>Miejsce na dane</button>
  </div>
  <StoragePanel v-if="bugs.backlog && bugTab === 'space'" />
  <template v-else>
  <p class="note" style="margin-top:0">{{ bugs.backlog ? 'Błędy i pomysły zgłoszone w aplikacji — ustaw, kto się zajmuje i jaki jest stan. Zgłaszający dostaje powiadomienie, gdy zgłoszenie jest zrobione albo odrzucone.' : 'Twoje zgłoszenia i ich stan.' }}</p>
  <button class="primary" style="width:100%;margin-bottom:12px" @click="reportBug"><svg class="i"><use href="#plus"/></svg>Zgłoś błąd albo pomysł</button>
  <div class="chips bug-filter" role="group" aria-label="Filtr zgłoszeń">
    <button class="chipbtn" :class="{ on: bugs.filter === 'open' }" @click="bugs.filter = 'open'">Otwarte · {{ bugCounts.open }}</button>
    <button class="chipbtn" :class="{ on: bugs.filter === 'done' }" @click="bugs.filter = 'done'">Zrobione · {{ bugCounts.done }}</button>
    <button v-if="bugs.backlog" class="chipbtn" :class="{ on: bugs.filter === 'mine' }" @click="bugs.filter = 'mine'">Moje</button>
    <button class="chipbtn" :class="{ on: bugs.filter === 'all' }" @click="bugs.filter = 'all'">Wszystkie</button>
  </div>
  <div v-if="bugs.busy && !bugs.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="bugs.error" class="error">{{ bugs.error }}</p>
  <p v-else-if="!bugsShown.length" class="note">Brak zgłoszeń w tym widoku.</p>
  <article v-for="b in bugsShown" :key="b.id" class="bug" :class="b.status">
    <button class="bug-head" :aria-expanded="bugs.open === b.id" @click="bugs.open = bugs.open === b.id ? 0 : b.id">
      <span class="bug-status" :class="b.status">{{ BUG_STATUS[b.status] }}</span>
      <b>{{ b.title }}</b>
      <small>{{ b.reporter || '—' }} · {{ new Date(b.created).toLocaleDateString('pl', { day: 'numeric', month: 'short' }) }}<template v-if="b.assigneeName"> · zajmuje się: {{ b.assigneeName }}</template></small>
    </button>
    <div v-if="bugs.open === b.id" class="bug-body">
      <p v-if="b.body" class="bug-text">{{ b.body }}</p>
      <p class="bug-meta"><template v-if="b.page">Miejsce: <code>{{ b.page }}</code></template><template v-if="b.device"><br>Urządzenie: {{ b.device }}</template></p>
      <p v-if="b.note && !bugs.backlog" class="bug-note">{{ b.note }}</p>
      <template v-if="bugs.backlog">
        <div class="bug-ctl">
          <label>Stan<UiSelect :model-value="b.status" label="Stan" :options="Object.entries(BUG_STATUS).map(([value, label]) => ({ value, label }))" @update:model-value="v => updateBug(b, { status: v })" /></label>
          <label>Kto się zajmuje<UiSelect :model-value="b.assignee || ''" label="Kto się zajmuje" :options="[{ value: '', label: '— nikt —' }, ...bugs.people.map(p => ({ value: p.id, label: p.name }))]" @update:model-value="v => v ? updateBug(b, { assignee: v }) : updateBug(b, { unassign: true })" /></label>
        </div>
        <label :for="'bn' + b.id">Notatka (widzi ją zgłaszający przy zakończeniu)</label>
        <textarea :id="'bn' + b.id" :value="b.note" rows="2" @change="updateBug(b, { note: ($event.target as HTMLTextAreaElement).value })"></textarea>
      </template>
    </div>
  </article>
  </template>
</template>

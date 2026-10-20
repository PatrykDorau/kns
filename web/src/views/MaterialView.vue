<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import MinistryPicker from '@/components/MinistryPicker.vue'

// materiał (protokół, instrukcja, plik pomocniczy): podgląd (otwarcie pliku) albo edycja
export default defineComponent({ components: { MinistryPicker }, setup: () => useApp() })
</script>

<template>
  <article v-if="!protoEditing" class="ann-view">
    <div class="ann-tags">
      <span class="ann-tag mat-tag" :class="'t-' + matType(currentProto)">{{ MAT_TYPES[matType(currentProto)] }}</span>
      <span class="ann-tag" :class="{ imp: currentProto.kind === 'rada' }">{{ (currentProto.ministries || []).length ? 'Tylko: ' + ministryNames(currentProto.ministries) : VISIBILITY[currentProto.kind] }}</span>
      <span v-if="currentProto.eventId && eventTitle(currentProto.eventId)" class="ann-tag">{{ eventTitle(currentProto.eventId) }}</span>
    </div>
    <h2 class="ann-view-title">{{ currentProto.title }}</h2>
    <p class="ann-view-meta">{{ pretty(currentProto.date) }}<template v-if="currentProto.updatedBy"> · dodał(a) {{ currentProto.updatedBy }}</template></p>
    <div v-if="currentProto.note" class="ann-view-text">{{ currentProto.note }}</div>
    <a v-if="protoUrl" class="button ann-link" :href="protoUrl" target="_blank" rel="noopener"><svg class="i"><use href="#file"/></svg>Otwórz plik<small class="proto-fname">{{ currentProto.fileName }}</small><svg class="i chev"><use href="#chev"/></svg></a>
    <p v-else-if="currentProto.file" class="note">Przygotowuję plik…</p>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <button v-if="protoEditable" class="ann-edit-btn" @click="protoEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
  </article>
  <template v-else>
    <label for="prType">Rodzaj</label>
    <UiSelect id="prType" v-model="currentProto.type" label="Rodzaj" :options="[...(canWriteProto('czlonkowskie') || hasCouncil ? [{ value: 'protokol', label: 'Protokół spotkania' }] : []), { value: 'instrukcja', label: 'Instrukcja (np. obsługa rzutnika)' }, { value: 'plik', label: 'Plik pomocniczy' }]" @change="protoTypeChanged" />
    <label>Plik <span class="req">*</span></label>
    <div class="proto-file">
      <svg class="i"><use href="#list"/></svg>
      <span>{{ protoFile ? protoFile.name : currentProto.fileName || 'Nie wybrano pliku (PDF, Word, PowerPoint, Excel, zdjęcie)' }}</span>
      <button type="button" :disabled="busy" @click="$refs.protoFileIn.click()">{{ currentProto.file || protoFile ? 'Zmień' : 'Wybierz plik' }}</button>
    </div>
    <input ref="protoFileIn" type="file" accept=".pdf,.doc,.docx,.odt,.txt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,image/*" hidden @change="pickProtoFile">
    <label for="prTitle">Tytuł <span class="req">*</span></label>
    <input id="prTitle" v-model="currentProto.title" :class="{ invalid: !currentProto.title.trim() }" autocomplete="off">
    <label for="prDate">{{ currentProto.type === 'protokol' ? 'Data spotkania' : 'Data' }}</label>
    <input id="prDate" v-model="currentProto.date" type="date">
    <label for="prKind">Kto widzi</label>
    <UiSelect id="prKind" :model-value="currentProto.kind === 'rada' ? 'rada' : 'all'" label="Kto widzi" :options="[{ value: 'all', label: (currentProto.ministries || []).length ? 'Wybrane służby (poniżej)' : 'Wszyscy członkowie' }, ...(hasCouncil ? [{ value: 'rada', label: 'Tylko rada zboru' }] : [])]" @update:model-value="v => { protoAudience(v); if (v === 'rada') currentProto.ministries = [] }" />
    <MinistryPicker v-if="currentProto.kind !== 'rada'" :model-value="currentProto.ministries || []" @update:model-value="v => currentProto.ministries = v" />
    <label v-if="currentProto.type === 'protokol'" for="prEvent">Spotkanie (opcjonalnie)</label>
    <UiSelect v-if="currentProto.type === 'protokol'" id="prEvent" v-model="currentProto.eventId" label="Spotkanie" :options="[{ value: '', label: '— bez spotkania (tylko biblioteka) —' }, ...meetingEvents.filter(e => currentProto.kind === 'rada' || e.type !== 'rada').map(e => ({ value: e.id, label: (e.title || typeOf(e.type).name) + ' · ' + shortDate(e.date) }))]" />
    <label for="prNote">Notatka (opcjonalnie)</label>
    <textarea id="prNote" v-model="currentProto.note" :placeholder="currentProto.type === 'protokol' ? 'np. najważniejsze ustalenia' : 'np. do czego służy, dla kogo'"></textarea>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <div class="bar">
      <template v-if="protoSavedOnce">
        <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeProto">Na pewno usuń</button>
        <button v-else :disabled="busy" aria-label="Usuń materiał" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
      </template>
      <button class="primary" :disabled="busy || !protoDirty || !currentProto.title.trim() || (!currentProto.file && !protoFile)" @click="saveProto()">
        <svg v-if="!protoDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : protoDirty ? 'Zapisz' : 'Zapisane' }}
      </button>
    </div>
  </template>
</template>

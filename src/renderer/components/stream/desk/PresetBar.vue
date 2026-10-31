<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings, uid } from '@/stores'
import { ask } from '@/utils/ask'

// Presety wyglądu (Odliczanie, Koniec, Baner): przygotowane przed nabożeństwem, w trakcie — jedno kliknięcie.
// Kliknięty preset trafia na podgląd, na wizję jak zwykle przyciskiem „Na wizję”. Zapisywane na tym komputerze.
const props = defineProps<{ kind: 'cd' | 'end' | 'banner', read: () => unknown, write: (data: any) => void }>()
const copy = (x: unknown) => JSON.parse(JSON.stringify(x))
if (!settings.studioPresets) settings.studioPresets = []
const list = computed(() => settings.studioPresets.filter(p => p.kind === props.kind))
const current = computed(() => JSON.stringify(props.read()))
const name = ref('')
function save() {
  const n = name.value.trim()
  if (!n) return
  const same = list.value.find(p => p.name === n) // ta sama nazwa — nadpisuje
  if (same) same.data = copy(props.read())
  else settings.studioPresets.push({ id: uid(), kind: props.kind, name: n, data: copy(props.read()) })
  name.value = ''
}
async function drop(p) { if (await ask('Usunąć preset „' + p.name + '”?')) settings.studioPresets = settings.studioPresets.filter(x => x !== p) }
</script>

<template>
  <div class="desk-opt-group desk-presets" role="group" aria-label="Presety">
    <small class="muted">Presety</small>
    <span v-for="p in list" :key="p.id" class="desk-preset" :class="{ on: JSON.stringify(p.data) === current }">
      <button class="small" :aria-pressed="JSON.stringify(p.data) === current" :title="'Wczytaj na podgląd: ' + p.name" @click="write(copy(p.data))">{{ p.name }}</button>
      <button class="desk-preset-x" :aria-label="'Usuń preset ' + p.name" title="Usuń preset" @click="drop(p)"><Icon name="x" /></button>
    </span>
    <label class="desk-preset-new"><input v-model="name" maxlength="30" placeholder="Nazwa nowego presetu" aria-label="Nazwa nowego presetu" @keydown.enter="save"></label>
    <button class="small" :disabled="!name.trim()" title="Zapisz obecny wygląd jako preset" @click="save">Zapisz</button>
  </div>
</template>

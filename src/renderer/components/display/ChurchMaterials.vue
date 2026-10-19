<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { addFiles, api, busy, cloud, flash, items, selectedId } from '@/stores'

// „Materiały” z aplikacji kns-nabo (protokoły, instrukcje, pliki pomocnicze z bazy): zdjęcia, PDF, PowerPoint i filmy
// jednym kliknięciem trafiają do Biblioteki — w Rzutniku (od razu zaznaczone) i w Stream (panel Media).
const props = defineProps<{ action?: string }>()
const emit = defineEmits<{ added: [] }>()
type Mat = { id: string; title: string; type: string; date: string; file: string; fileName: string }
const list = ref<Mat[]>([])
const error = ref('')
const loading = ref(false)
const query = ref('')
const TYPE = { protokol: 'Protokół', instrukcja: 'Instrukcja', plik: 'Plik' }
const SHOWABLE = /\.(pdf|pptx?|jpe?g|png|webp|gif|mp4|webm|mov)$/i
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
const shown = computed(() => {
  const q = plain(query.value.trim())
  return list.value.filter(m => !q || plain([m.title, m.fileName, TYPE[m.type] || ''].join(' ')).includes(q))
})
const sourceOf = (m: Mat) => 'material:' + m.id + ':' + m.file
const inLibrary = (m: Mat) => items.value.some(i => i.source === sourceOf(m))

async function load() {
  if (!cloud) { error.value = 'Brak połączenia z bazą danych.'; return }
  loading.value = true; error.value = ''
  try { list.value = (await cloud.materials()).filter(m => SHOWABLE.test(m.fileName || m.file)) }
  catch (e) { error.value = e.message || String(e) } finally { loading.value = false }
}
onMounted(load)

async function add(m: Mat) {
  const have = items.value.find(i => i.source === sourceOf(m))
  if (have) { selectedId.value = have.id; emit('added'); return }
  busy.value = 'Pobieram „' + (m.fileName || m.title) + '”…'
  try {
    const url = await cloud.materialUrl(m.file)
    const got = await api.fetchFile(url, m.fileName || m.title)
    if (got?.error) throw new Error(got.error)
    const before = items.value.length
    await addFiles([got.path])
    const added = items.value.slice(before)
    for (const it of added) { it.source = sourceOf(m); if (!it.hidden && m.title) it.name = m.title }
    const first = added.find(i => !i.hidden)
    if (first) selectedId.value = first.id
    emit('added')
  } catch (e) { flash(e.message || String(e)) } finally { busy.value = '' }
}
</script>

<template>
  <div class="searchrow">
    <label class="searchbox"><Icon name="search" /><input v-model="query" type="search" placeholder="Szukaj w materiałach z aplikacji" aria-label="Szukaj w materiałach z aplikacji"></label>
    <button class="small" :disabled="loading" title="Wczytaj listę od nowa" @click="load"><Icon name="refresh" /></button>
  </div>
  <p class="note">Pliki z „Materiałów” w aplikacji (zdjęcia, PDF, PowerPoint, filmy). Kliknięcie dodaje plik do Biblioteki.</p>
  <p v-if="error" class="note bad">{{ error }}</p>
  <p v-else-if="loading && !list.length" class="note">Wczytuję…</p>
  <p v-else-if="!shown.length" class="note">{{ query ? 'Nic nie znaleziono.' : 'Brak plików do pokazania.' }}</p>
  <ul class="mats">
    <li v-for="m in shown" :key="m.id">
      <span class="mats-txt"><b>{{ m.title || m.fileName }}</b><small>{{ TYPE[m.type] || 'Plik' }}<template v-if="m.date"> · {{ m.date }}</template> · {{ m.fileName }}</small></span>
      <button class="small" :disabled="!!busy" @click="add(m)"><Icon :name="inLibrary(m) ? 'check' : 'plus'" />{{ inLibrary(m) ? 'W bibliotece' : props.action || 'Do biblioteki' }}</button>
    </li>
  </ul>
</template>

<style scoped>
.mats { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.mats li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line, #333); border-radius: 10px; }
.mats-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mats-txt b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mats-txt small { opacity: .7; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mats li button { flex: none; }
</style>

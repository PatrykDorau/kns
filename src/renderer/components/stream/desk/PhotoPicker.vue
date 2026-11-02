<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { cloud, label } from '@/stores'
import { mediaSlide, mediaUrl } from '@/services/studio/media'
import { libraryItem, materialToLibrary, type Material } from '@/services/materials'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Wybór zdjęcia z miniaturami, jedno okno dla Materiałów z aplikacji, Biblioteki i dysku. Zdjęcie z Materiałów
// pobiera się do Biblioteki Streamu przy kliknięciu; pick podaje id z Biblioteki i tytuł.
const props = defineProps<{ modelValue?: string; text?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string]; pick: [id: string, title: string] }>()
const { mediaList, addMediaFiles } = useDesk()
const IMAGE = /\.(jpe?g|png|webp|gif)$/i
const open = ref(false), tab = ref<'mats' | 'lib'>('mats'), query = ref(''), error = ref(''), busy = ref(''), loading = ref(false)
const mats = ref<(Material & { thumb?: string })[]>([])
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
const src = (id: string) => { const it = id ? mediaSlide(id) : null; return it?.type === 'image' ? mediaUrl(it.path) : '' }
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
const hit = (s: string) => !query.value.trim() || plain(s).includes(plain(query.value.trim()))
const shownMats = computed(() => mats.value.filter(m => hit(m.title + ' ' + m.fileName)))
const shownLib = computed(() => images.value.filter(it => hit(label(it))))

async function show() {
  open.value = true; error.value = ''; query.value = ''
  if (!cloud) { tab.value = 'lib'; return }
  loading.value = true
  try {
    const list = (await cloud.materials()).filter(m => IMAGE.test(m.fileName || m.file))
    mats.value = list
    if (!list.length) tab.value = 'lib'
    // miniatury dochodzą po kolei, lista jest już widoczna
    list.forEach(async (m, i) => { const thumb = await cloud.materialUrl(m.file).catch(() => ''); mats.value[i] = { ...mats.value[i], thumb } })
  } catch (e) { error.value = e.message || String(e); tab.value = 'lib' } finally { loading.value = false }
}
function choose(id: string, title: string) { emit('update:modelValue', id); emit('pick', id, title); open.value = false }
async function pickMaterial(m: Material) {
  busy.value = m.id; error.value = ''
  try {
    const it = await materialToLibrary(m, 'stream')
    if (it) choose(it.id, m.title)
  } catch (e) { error.value = e.message || String(e) } finally { busy.value = '' }
}
async function fromDisk() {
  const before = new Set(mediaList.value.map(x => x.id))
  if (!(await addMediaFiles())) return
  const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id))
  if (n) choose(n.id, label(n))
}
</script>

<template>
  <span class="pp-open">
    <img v-if="src(modelValue)" :src="src(modelValue)" alt="" class="pp-now">
    <button class="small" :disabled="disabled" @click="show"><Icon name="image" />{{ text || (src(modelValue) ? 'Zmień zdjęcie…' : 'Wybierz zdjęcie…') }}</button>
  </span>
  <Teleport to="body">
    <div v-if="open" class="overlay pp-layer" @click.self="open = false" @keydown.esc.stop="open = false">
      <div class="modal pp" role="dialog" aria-modal="true" aria-label="Wybór zdjęcia">
        <div class="modal-head">
          <h3>Wybierz zdjęcie</h3>
          <button class="iconbtn" aria-label="Zamknij" @click="open = false"><Icon name="x" /></button>
        </div>
        <div class="pp-bar">
          <div class="desk-mode" role="tablist" aria-label="Skąd zdjęcie">
            <button role="tab" :aria-selected="tab === 'mats'" :class="{ on: tab === 'mats' }" @click="tab = 'mats'">Materiały ({{ mats.length }})</button>
            <button role="tab" :aria-selected="tab === 'lib'" :class="{ on: tab === 'lib' }" @click="tab = 'lib'">Biblioteka ({{ images.length }})</button>
          </div>
          <label class="searchbox"><Icon name="search" /><input v-model="query" type="search" placeholder="Szukaj" aria-label="Szukaj zdjęcia"></label>
          <button class="small" title="Zdjęcie z dysku — trafi też do Biblioteki" @click="fromDisk"><Icon name="import" />Z dysku…</button>
        </div>
        <p v-if="error" class="note bad">{{ error }}</p>
        <div class="pp-grid">
          <template v-if="tab === 'mats'">
            <button v-for="m in shownMats" :key="m.id" class="pp-card" :class="{ on: libraryItem(m, 'stream')?.id === modelValue && modelValue }" :disabled="!!busy" @click="pickMaterial(m)">
              <span class="pp-pic"><img v-if="m.thumb" :src="m.thumb" alt="" loading="lazy"></span>
              <small>{{ busy === m.id ? 'Pobieram…' : m.title || m.fileName }}</small>
            </button>
          </template>
          <template v-else>
            <button v-for="it in shownLib" :key="it.id" class="pp-card" :class="{ on: it.id === modelValue }" @click="choose(it.id, label(it))">
              <span class="pp-pic"><img :src="src(it.id)" alt="" loading="lazy"></span>
              <small>{{ label(it) }}</small>
            </button>
          </template>
        </div>
        <p v-if="loading && tab === 'mats'" class="note">Wczytuję…</p>
        <p v-else-if="tab === 'mats' && !shownMats.length" class="note">{{ query ? 'Nic nie pasuje.' : 'W Materiałach nie ma zdjęć.' }}</p>
        <p v-else-if="tab === 'lib' && !shownLib.length" class="note">{{ query ? 'Nic nie pasuje.' : 'W Bibliotece nie ma zdjęć.' }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pp-open { display: inline-flex; align-items: center; gap: 8px; }
.pp-now { width: 34px; height: 34px; border-radius: 6px; object-fit: contain; background: rgba(255, 255, 255, .06); }
.pp-layer { z-index: 950; } /* nad prawą kolumną pulpitu */
.pp { width: min(860px, 100%); display: flex; flex-direction: column; gap: 12px; }
.pp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pp-bar .searchbox { flex: 1 1 180px; }
.pp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; min-height: 180px; overflow-y: auto; align-content: start; }
.pp-card { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; justify-items: stretch; gap: 6px; padding: 6px; min-height: 0; border: 2px solid transparent; border-radius: 10px; background: var(--panel2); text-align: left; }
.pp-card.on { border-color: var(--accent); }
.pp-pic { display: block; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: rgba(255, 255, 255, .05); }
.pp-pic img { width: 100%; height: 100%; object-fit: contain; }
.pp-card small { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.25; }
</style>

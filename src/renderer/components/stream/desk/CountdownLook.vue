<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { label } from '@/stores'
import { CD_DEFAULT } from '@/services/studio/cards'
import { LAYOUTS, TIMERS, layoutThumb } from '@/services/studio/countdown'
import { useDesk } from '@/composables/stream/useStreamDesk'
import LookBg from './LookBg.vue'

// Wygląd odliczania w presecie: układ (miniatury z bieżącym wyglądem), styl zegara, kolor, tło, treść w środku, napisy.
const props = defineProps<{ cd: any }>()
const cd = props.cd
for (const [k, v] of Object.entries(CD_DEFAULT)) if (cd[k] === undefined) cd[k] = v // nowe pola po aktualizacji
const { mediaList, addMediaFiles } = useDesk()
// zdjęcie z dysku do układu „Dzielony”: dodaje do Biblioteki i od razu wybiera
async function addPhoto() { const before = new Set(mediaList.value.map(x => x.id)); if (await addMediaFiles()) { const n = mediaList.value.find(x => x.type === 'image' && !before.has(x.id)); if (n) cd.photo = n.id } }
const images = computed(() => mediaList.value.filter(it => it.type === 'image'))
// miniatury układów — odświeżane chwilę po zmianie wyglądu (i raz po wczytaniu grafik)
const thumbs = ref<Record<string, string>>({})
let timer = 0
const redraw = () => { clearTimeout(timer); timer = window.setTimeout(() => { thumbs.value = Object.fromEntries(LAYOUTS.map(([id]) => [id, layoutThumb(cd, id)])) }, 250) }
watch(() => JSON.stringify(cd), redraw, { immediate: true })
const late = window.setTimeout(redraw, 2000)
onBeforeUnmount(() => { clearTimeout(timer); clearTimeout(late) })
const content = computed(() => ['top', 'split', 'poster', 'bar'].includes(cd.layout)) // układy z ogłoszeniami w środku
const subLabel = computed(() => content.value && cd.show === 'text' ? 'Napis w środku' : 'Podpis')
</script>

<template>
  <div class="desk-cd" role="group" aria-label="Wygląd odliczania">
    <div class="desk-layouts" role="group" aria-label="Układ">
      <button v-for="[id, name, tip] in LAYOUTS" :key="id" class="desk-layout" :class="{ on: cd.layout === id }" :aria-pressed="cd.layout === id" :title="tip" @click="cd.layout = id">
        <img v-if="thumbs[id]" :src="thumbs[id]" alt=""><span v-else class="desk-layout-ph"></span>{{ name }}
      </button>
    </div>
    <div v-if="cd.layout !== 'bar'" class="desk-opt-group">
      <small class="muted">Zegar</small>
      <button v-for="[id, name] in TIMERS" :key="id" :class="{ on: cd.timer === id }" :aria-pressed="cd.timer === id" @click="cd.timer = id">{{ name }}</button>
      <label class="desk-color" title="Kolor akcentu (zegar, ramka, paski)"><input v-model="cd.accent" type="color" aria-label="Kolor akcentu"></label>
      <button class="small" title="Pomarańczowy kościoła" @click="cd.accent = CD_DEFAULT.accent">kolor kościoła</button>
    </div>
    <div v-else class="desk-opt-group">
      <small class="muted">Kolor</small>
      <label class="desk-color" title="Kolor akcentu (zegar, pasek)"><input v-model="cd.accent" type="color" aria-label="Kolor akcentu"></label>
      <button class="small" @click="cd.accent = CD_DEFAULT.accent">kolor kościoła</button>
    </div>
    <LookBg :look="cd" />
    <div v-if="content" class="desk-opt-group">
      <small class="muted">W środku</small>
      <button :class="{ on: cd.show !== 'text' }" title="Ogłoszenia w pętli (które — zakładka „Ogłoszenia” niżej)" @click="cd.show = 'ann'">Ogłoszenia</button>
      <button :class="{ on: cd.show === 'text' }" title="Własny duży napis zamiast ogłoszeń" @click="cd.show = 'text'">Napis</button>
      <template v-if="cd.layout === 'split'">
        <small class="muted">Z lewej</small>
        <select v-model="cd.photo" aria-label="Co z lewej">
          <optgroup label="Gotowe">
            <option value="">Góry</option>
            <option value="@sketch">Szkic</option>
            <option value="@paper">Papier</option>
            <option value="@accent">Kolor akcentu</option>
          </optgroup>
          <optgroup v-if="images.length" label="Grafiki z Biblioteki">
            <option v-for="it in images" :key="it.id" :value="it.id">{{ label(it) }}</option>
          </optgroup>
        </select>
        <button class="small" title="Zdjęcie z dysku — trafi też do Biblioteki" @click="addPhoto">Z dysku…</button>
      </template>
    </div>
    <div class="desk-opt-group desk-cd-text">
      <label>Napis przy zegarze <input v-model="cd.title" maxlength="40" placeholder="ZACZYNAMY ZA"></label>
      <label>{{ subLabel }} <input v-model="cd.sub" maxlength="90" :placeholder="content && cd.show === 'text' ? 'np. Dołącz do grupy młodzieżowej' : 'np. Kawa po nabożeństwie w holu'"></label>
      <button class="small" title="Przywróć domyślny wygląd" @click="Object.assign(cd, CD_DEFAULT)">Domyślny</button>
    </div>
  </div>
</template>

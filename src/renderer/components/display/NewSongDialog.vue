<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { addToService, applySongChanges, songs, uid, verses } from '@/stores'
import { focusOnce } from '@/utils/dom'

// Nowa pieśń prosto z Rzutnika (bez otwierania bazy pieśni): numer, tytuł, tekst z podglądem slajdów.
// Po zapisie trafia do bazy (i na inne komputery) oraz od razu na listę tego nabożeństwa.
const emit = defineEmits<{ close: [] }>()
const number = ref(''), title = ref(''), text = ref(''), toService = ref(true)
const preview = computed(() => verses({ text: text.value }))
const taken = computed(() => number.value.trim() && songs.value.find(s => String(s.number).trim() === number.value.trim()))
function save() {
  if (!title.value.trim()) return
  const song = { id: uid(), type: 'song' as const, number: number.value.trim(), title: title.value.trim(), text: text.value.trim() }
  applySongChanges({ added: [song], removed: [], edited: [] })
  if (toService.value) addToService(song)
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <div class="modal textpop" role="dialog" aria-modal="true" aria-label="Nowa pieśń">
      <div class="modal-head">
        <h3>Nowa pieśń</h3>
        <button class="iconbtn" aria-label="Zamknij" @click="emit('close')"><Icon name="x" /></button>
      </div>
      <div class="ns-row">
        <label class="ns-num">Numer<input v-model="number" inputmode="numeric" autocomplete="off"></label>
        <label class="ns-title">Tytuł<input v-model="title" :ref="focusOnce" autocomplete="off" @keydown.enter.prevent="($refs.nsText as HTMLTextAreaElement)?.focus()"></label>
      </div>
      <p v-if="taken" class="note bad">Numer {{ number }} ma już pieśń „{{ taken.title }}”.</p>
      <div class="mgr-cols">
        <div class="col">
          <label for="nsText">Tekst (pusta linia = nowy slajd; skrót na początku slajdu, np. [R])</label>
          <textarea id="nsText" ref="nsText" v-model="text" spellcheck="false" placeholder="Pierwsza zwrotka…&#10;&#10;[R] Refren…"></textarea>
        </div>
        <div class="col">
          <label>Podział na slajdy: {{ preview.length }}</label>
          <ol class="mgr-slides"><li v-for="(v, i) in preview" :key="i"><span class="vnum">{{ i + 1 }}</span>{{ v }}</li></ol>
        </div>
      </div>
      <div class="btnrow">
        <label class="check"><input v-model="toService" type="checkbox"> Dodaj od razu na to nabożeństwo</label>
        <span class="spacer"></span>
        <button @click="emit('close')">Anuluj</button>
        <button class="primary" :disabled="!title.trim()" @click="save"><Icon name="check" />Zapisz pieśń</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ns-row { display: flex; gap: 10px; margin-bottom: 8px; }
.ns-row label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
.ns-num { flex: 0 0 96px; }
.ns-title { flex: 1; }
</style>

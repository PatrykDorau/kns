<script setup>
import { nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'

// Myśli z kazania: każda myśl w osobnym polu (zapis jak na telefonie: jedna myśl w linii).
const model = defineModel({ type: String, default: '' })
const split = t => (t ? String(t).split('\n') : [])
const lines = ref(split(model.value))
// zmiana z zewnątrz (inne nabożeństwo, wczytanie) — puste pole w trakcie pisania zostaje
watch(model, v => { if (lines.value.join('\n') !== (v || '')) lines.value = split(v) })
const box = ref(null)
const push = () => { model.value = lines.value.join('\n') }
function set(i, v) { lines.value[i] = v.replace(/\n/g, ' '); push() }
function add(at) {
  lines.value.splice(at, 0, ''); push()
  nextTick(() => box.value?.querySelectorAll('input')[at]?.focus())
}
function remove(i) { lines.value.splice(i, 1); push() }
</script>

<template>
  <div ref="box" class="thoughts-ed">
    <div v-for="(t, i) in lines" :key="i" class="th-line">
      <span class="th-n">{{ i + 1 }}</span>
      <input :value="t" type="text" placeholder="Myśl z kazania" @input="set(i, $event.target.value)" @keydown.enter.prevent="add(i + 1)">
      <button class="iconbtn danger" title="Usuń myśl" aria-label="Usuń myśl" @click="remove(i)"><Icon name="x" /></button>
    </div>
    <div class="btnrow">
      <button @click="add(lines.length)"><Icon name="plus" />Dodaj myśl</button>
      <span class="note">Pokażą się na stronie startowej po nabożeństwie — do następnego nabożeństwa.</span>
    </div>
  </div>
</template>

<style scoped>
.thoughts-ed { display: flex; flex-direction: column; gap: 6px; }
.th-line { display: grid; grid-template-columns: 24px 1fr auto; gap: 6px; align-items: center; }
.th-line input { min-width: 0; }
.th-n { text-align: center; opacity: .6; font-size: 13px; }
.btnrow { align-items: center; }
.btnrow .note { margin: 0; }
</style>

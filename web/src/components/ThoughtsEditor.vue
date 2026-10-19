<script lang="ts">
// @ts-nocheck — przeniesione z index.html
import { defineComponent, nextTick, ref, watch } from 'vue'
export default defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const split = t => (t ? String(t).split('\n') : [])
    const lines = ref(split(props.modelValue))
    // zmiana z zewnątrz (inne nabożeństwo, wczytanie) — puste pole w trakcie pisania zostaje
    watch(() => props.modelValue, v => { if (lines.value.join('\n') !== (v || '')) lines.value = split(v) })
    const push = () => emit('update:modelValue', lines.value.join('\n'))
    const set = (i, v) => { lines.value[i] = v.replace(/\n/g, ' '); push() }
    function add(at) {
      lines.value.splice(at, 0, ''); push()
      nextTick(() => document.querySelectorAll('.thoughts-ed .th-line input')[at]?.focus())
    }
    const remove = i => { lines.value.splice(i, 1); push() }
    return { lines, set, add, remove }
  },
})
</script>

<template>
  <div class="thoughts-ed">
    <div v-for="(t, i) in lines" :key="i" class="th-line">
      <span class="th-n">{{ i + 1 }}</span>
      <input :value="t" placeholder="Myśl z kazania" autocomplete="off" @input="set(i, $event.target.value)" @keydown.enter.prevent="add(i + 1)">
      <button class="icon" type="button" aria-label="Usuń myśl" @click="remove(i)"><svg class="i"><use href="#x"/></svg></button>
    </div>
    <button type="button" class="pg-addsong" @click="add(lines.length)"><svg class="i"><use href="#plus"/></svg>Dodaj myśl</button>
    <p class="note">Pokażą się na stronie startowej po nabożeństwie — do następnego nabożeństwa.</p>
  </div>
</template>

<script lang="ts">
// @ts-nocheck — przeniesione z index.html
// Lista linijek (myśli z kazania, pytania do notatek): każda w osobnym polu, Enter dodaje następną. W modelu — tekst z liniami.
import { defineComponent, nextTick, ref, watch } from 'vue'
export default defineComponent({
  props: {
    modelValue: String,
    placeholder: { type: String, default: 'Myśl z kazania' },
    addLabel: { type: String, default: 'Dodaj myśl' },
    removeLabel: { type: String, default: 'Usuń myśl' },
    hint: { type: String, default: 'Pokażą się na stronie głównej po nabożeństwie.' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const split = t => (t ? String(t).split('\n') : [])
    const lines = ref(split(props.modelValue))
    const root = ref(null)
    // zmiana z zewnątrz (inne nabożeństwo, wczytanie) — puste pole w trakcie pisania zostaje
    watch(() => props.modelValue, v => { if (lines.value.join('\n') !== (v || '')) lines.value = split(v) })
    const push = () => emit('update:modelValue', lines.value.join('\n'))
    const set = (i, v) => { lines.value[i] = v.replace(/\n/g, ' '); push() }
    function add(at) {
      lines.value.splice(at, 0, ''); push()
      nextTick(() => root.value?.querySelectorAll('.th-line input')[at]?.focus())
    }
    const remove = i => { lines.value.splice(i, 1); push() }
    return { lines, root, set, add, remove }
  },
})
</script>

<template>
  <div ref="root" class="thoughts-ed">
    <div v-for="(t, i) in lines" :key="i" class="th-line">
      <span class="th-n">{{ i + 1 }}</span>
      <input :value="t" :placeholder="placeholder" autocomplete="off" @input="set(i, $event.target.value)" @keydown.enter.prevent="add(i + 1)">
      <button class="icon" type="button" :aria-label="removeLabel" @click="remove(i)"><svg class="i"><use href="#x"/></svg></button>
    </div>
    <button type="button" class="pg-addsong" @click="add(lines.length)"><svg class="i"><use href="#plus"/></svg>{{ addLabel }}</button>
    <p v-if="hint" class="note">{{ hint }}</p>
  </div>
</template>

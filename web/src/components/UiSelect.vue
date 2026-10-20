<script setup lang="ts">
// Lista wyboru w stylu aplikacji (zamiast systemowego <select>): v-model, opcje [{ value, label, disabled? }],
// klawiatura (strzałki, Enter, Esc, pierwsza litera), lista otwiera się w górę, gdy pod polem brakuje miejsca.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

type Opt = { value: unknown; label: string; disabled?: boolean }
const props = withDefaults(defineProps<{ modelValue?: unknown; options: Opt[]; placeholder?: string; label?: string; id?: string; disabled?: boolean; compact?: boolean }>(),
  { modelValue: undefined, placeholder: 'Wybierz…', label: '', id: undefined, disabled: false, compact: false })
const emit = defineEmits<{ 'update:modelValue': [v: unknown]; change: [v: unknown] }>()
const open = ref(false)
const up = ref(false)
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const current = computed(() => props.options.find(o => o.value === props.modelValue))

function show() {
  if (props.disabled) return
  const r = root.value!.getBoundingClientRect()
  up.value = innerHeight - r.bottom < 260 && r.top > innerHeight - r.bottom
  active.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue))
  open.value = true
  nextTick(() => (list.value?.children[active.value] as HTMLElement)?.scrollIntoView({ block: 'nearest' }))
  document.addEventListener('pointerdown', outside, true)
}
function hide() { open.value = false; document.removeEventListener('pointerdown', outside, true) }
function outside(e: Event) { if (!root.value?.contains(e.target as Node)) hide() }
function pick(o: Opt) {
  if (o.disabled) return
  hide()
  if (o.value !== props.modelValue) { emit('update:modelValue', o.value); emit('change', o.value) }
}
function move(d: number) {
  const n = props.options.length
  for (let i = 1; i <= n; i++) { const k = (active.value + d * i + n) % n; if (!props.options[k].disabled) { active.value = k; break } }
  nextTick(() => (list.value?.children[active.value] as HTMLElement)?.scrollIntoView({ block: 'nearest' }))
}
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open.value) show(); else move(e.key === 'ArrowDown' ? 1 : -1) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open.value) pick(props.options[active.value]); else show() }
  else if (e.key === 'Escape' && open.value) { e.preventDefault(); e.stopPropagation(); hide() }
  else if (e.key === 'Tab') hide()
  else if (e.key.length === 1 && open.value) {
    const k = props.options.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase()))
    if (k >= 0) { active.value = k; nextTick(() => (list.value?.children[k] as HTMLElement)?.scrollIntoView({ block: 'nearest' })) }
  }
}
onBeforeUnmount(hide)
</script>

<template>
  <div ref="root" class="uisel" :class="{ open, compact, disabled }">
    <button :id="id" type="button" class="uisel-btn" :disabled="disabled" :aria-label="label || undefined" aria-haspopup="listbox" :aria-expanded="open" @click="open ? hide() : show()" @keydown="key">
      <span :class="{ ph: !current }">{{ current ? current.label : placeholder }}</span>
      <svg class="i uisel-chev"><use href="#down"/></svg>
    </button>
    <ul v-if="open" ref="list" class="uisel-list" :class="{ up }" role="listbox" :aria-label="label || undefined">
      <li v-for="(o, i) in options" :key="String(o.value)" role="option" :aria-selected="o.value === modelValue" :aria-disabled="o.disabled || undefined"
          :class="{ on: o.value === modelValue, act: i === active, dis: o.disabled }" @pointerenter="active = i" @click="pick(o)">
        <span>{{ o.label }}</span><svg v-if="o.value === modelValue" class="i"><use href="#check"/></svg>
      </li>
    </ul>
  </div>
</template>

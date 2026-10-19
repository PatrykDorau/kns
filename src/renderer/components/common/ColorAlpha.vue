<script setup>
import { computed } from 'vue'

// Kolor z przezroczystością: próbka koloru + suwak krycia. Wartość zapisywana jako #rrggbbaa
// (stare wartości #rrggbb — pełne krycie; 'transparent' i brak — całkiem przezroczyste).
const props = defineProps({ model: Object, field: { type: String, default: 'bg' }, label: String, disabled: Boolean, empty: { type: String, default: '#00000000' } })
const value = computed(() => {
  const v = props.model[props.field]
  if (!v || v === 'transparent') return props.empty
  return /^#[0-9a-f]{6}$/i.test(v) ? v + 'ff' : v
})
const rgb = computed(() => value.value.slice(0, 7))
const alpha = computed(() => parseInt(value.value.slice(7, 9) || 'ff', 16) / 255)
const hex2 = a => Math.round(a * 255).toString(16).padStart(2, '0')
function setRgb(v) { props.model[props.field] = v + hex2(alpha.value) }
function setAlpha(a) { props.model[props.field] = rgb.value + hex2(a) }
</script>

<template>
  <div class="coloralpha" :class="{ off: disabled }">
    <label>{{ label }}</label>
    <div class="ca-row">
      <span class="ca-swatch"><input :value="rgb" type="color" :aria-label="label" :disabled="disabled" @input="setRgb($event.target.value)"><i :style="{ background: value }"></i></span>
      <input :value="alpha" type="range" min="0" max="1" step="0.05" :aria-label="label + ' — krycie'" :disabled="disabled" @input="setAlpha(+$event.target.value)">
      <span class="ca-val">{{ Math.round(alpha * 100) }}%</span>
    </div>
  </div>
</template>

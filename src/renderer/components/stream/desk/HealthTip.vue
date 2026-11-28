<script setup lang="ts">
import { computed } from 'vue'
import type { HealthChip } from '@/composables/stream/useStreamHealth'

// Dymek nad komórką stanu transmisji: opis i (przy klatkach) z czego biorą się zgubione klatki.
// Treść odświeża się co sekundę, ale dymek stoi w miejscu — nie znika i nie miga jak systemowy „title”.
const props = defineProps<{ chip: HealthChip | null, at: { x: number, y: number, side: 'left' | 'below' } | null }>()
const style = computed(() => {
  const a = props.at
  if (!a) return {}
  return a.side === 'left' ? { top: Math.max(8, a.y) + 'px', right: (innerWidth - a.x + 10) + 'px' } : { top: a.y + 8 + 'px', left: Math.max(8, Math.min(a.x - 160, innerWidth - 340)) + 'px' }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="chip && at" class="dh-tip" :class="'s-' + (chip.cls || 'none')" :style="style" role="tooltip">
      <b>{{ chip.label }}: {{ chip.value }}</b>
      <p v-if="chip.tip">{{ chip.tip }}</p>
      <ul v-if="chip.reasons?.length">
        <li v-for="r in chip.reasons" :key="r.label"><span><em>{{ r.n.toLocaleString('pl') }}</em> {{ r.label }}</span><small v-if="r.hint">{{ r.hint }}</small></li>
      </ul>
      <p v-else-if="chip.id === 'fps'" class="dh-tip-ok">Żadna klatka nie zginęła.</p>
    </div>
  </Teleport>
</template>

<style scoped>
.dh-tip { position: fixed; z-index: 200; width: 320px; max-width: calc(100vw - 16px); padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--text); box-shadow: 0 12px 32px rgba(0, 0, 0, .45); font-size: 12.5px; line-height: 1.4; pointer-events: none; }
.dh-tip b { display: block; margin-bottom: 4px; font-size: 13px; }
.dh-tip p { margin: 0 0 4px; color: var(--muted); }
.dh-tip ul { display: grid; gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.dh-tip li { display: grid; gap: 1px; }
.dh-tip li em { display: inline-block; min-width: 34px; margin-right: 4px; color: #e5a93b; font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; }
.dh-tip li small { padding-left: 38px; color: var(--muted); }
.dh-tip-ok { color: #3ccf73 !important; }
.dh-tip.s-bad { border-color: #e5484d; }
.dh-tip.s-warn { border-color: #e5a93b; }
</style>

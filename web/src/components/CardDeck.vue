<script setup lang="ts">
// Talia kart: przechylone karty jedna na drugiej; górną przeciąga się palcem/myszą (albo strzałkami) — odlatuje na spód talii.
// Karta: zdjęcie (albo kolor i pierwsza litera), znaczek, tytuł, podpis. Kliknięcie górnej karty — „open”.
import { computed, nextTick, ref } from 'vue'
import { animate } from 'motion'

// action — przycisk pod talią dla tej karty (np. „Biorę”); '' — bez przycisku; brak — wspólny z „action” talii
export interface DeckCard { key: string; title: string; sub?: string; tag?: string; image?: string; color?: string; action?: string }
const props = withDefaults(defineProps<{ cards: DeckCard[]; label?: string; action?: string; busy?: boolean }>(), { label: 'Talia kart', action: '', busy: false })
const emit = defineEmits<{ open: [card: DeckCard, index: number]; action: [card: DeckCard, index: number] }>()

// karta na wierzchu zapamiętana po kluczu — gdy lista zmieni kolejność (np. ogłoszenie przestało być „nowe”), talia nie przeskakuje
const topKey = ref('')
const n = computed(() => props.cards.length)
const top = computed({
  get: () => Math.max(0, props.cards.findIndex(c => c.key === topKey.value)),
  set: i => { topKey.value = props.cards[i]?.key || '' },
})
// widoczne: górna i trzy pod nią (od spodu, żeby górna była ostatnia w DOM — na wierzchu)
const shown = computed(() => Array.from({ length: Math.min(4, n.value) }, (_, d) => ({ d, i: (top.value + d) % n.value, c: props.cards[(top.value + d) % n.value] })).reverse())
const TILT = [0, -5, 4, -3]
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

// górna karta — zawsze aktualna (po przełożeniu na spód górną staje się inna karta)
const stack = ref<HTMLElement | null>(null)
const topCard = () => stack.value?.querySelector('.deck-card.top') as HTMLElement | null
let drag: { x: number; y: number; dx: number; id: number; moved: boolean; el: HTMLElement } | null = null
let flying = false
function down(e: PointerEvent) {
  if (e.button || flying) return
  drag = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, moved: false, el: e.currentTarget as HTMLElement }
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* wskaźnik już zniknął */ }
}
function move(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  drag.dx = e.clientX - drag.x
  if (Math.abs(drag.dx) > 6) drag.moved = true
  drag.el.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`
}
function up(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const { dx, moved, el } = drag
  drag = null
  if (!moved) { el.style.transform = ''; const c = props.cards[top.value]; if (c) emit('open', c, top.value); return }
  if (Math.abs(dx) > 90) fling(dx > 0 ? 1 : -1)
  else if (still) el.style.transform = ''
  else animate(el, { transform: 'translateX(0px) rotate(0deg)' }, { type: 'spring', stiffness: 500, damping: 32 }).then(() => { el.style.transform = '' })
}
// górna karta odlatuje w bok i wraca na spód; wstecz — ostatnia karta wraca na wierzch
async function fling(dir: number) {
  const el = topCard()
  if (n.value < 2) { if (el) el.style.transform = ''; return }
  if (flying) return
  flying = true
  try {
    if (el && !still) await animate(el, { transform: `translateX(${dir * 420}px) rotate(${dir * 24}deg)`, opacity: 0 }, { duration: 0.28, ease: 'easeIn' })
    top.value = (top.value + 1) % n.value
    await nextTick()
    // karta wraca na spód talii — bez śladów przeciągania i odlotu
    if (el) { el.getAnimations?.().forEach(a => a.cancel()); el.style.transform = ''; el.style.opacity = '' }
  } finally { flying = false }
}
function back() { if (n.value > 1) top.value = (top.value - 1 + n.value) % n.value }
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') { e.preventDefault(); fling(1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const c = props.cards[top.value]; if (c) emit('open', c, top.value) }
}
const initial = (c: DeckCard) => (c.title || '?').trim()[0]?.toUpperCase()
</script>

<template>
  <div class="deck" :aria-label="label" role="group">
    <div ref="stack" class="deck-stack" tabindex="0" :aria-label="n ? `${label}: ${cards[top]?.title} (${top + 1} z ${n}). Strzałki — następna i poprzednia, Enter — otwórz.` : label" @keydown="key">
      <article v-for="s in shown" :key="s.c.key" class="deck-card" :class="{ top: s.d === 0 }"
               :style="{ '--d': s.d, '--tilt': TILT[s.d] + 'deg', '--c': s.c.color || 'var(--accent)' }"
               @pointerdown="s.d === 0 && down($event)" @pointermove="move" @pointerup="up" @pointercancel="up">
        <img v-if="s.c.image" class="deck-img" :src="s.c.image" alt="" draggable="false" loading="lazy">
        <span v-else class="deck-ph" aria-hidden="true">{{ initial(s.c) }}</span>
        <span class="deck-text">
          <span v-if="s.c.tag" class="deck-tag">{{ s.c.tag }}</span>
          <b>{{ s.c.title }}</b>
          <small v-if="s.c.sub">{{ s.c.sub }}</small>
        </span>
      </article>
      <p v-if="!n" class="deck-empty"><slot name="empty">Nic tu jeszcze nie ma.</slot></p>
    </div>
    <div v-if="n" class="deck-nav">
      <button class="ghost deck-btn" :disabled="n < 2" aria-label="Poprzednia" @click="back"><svg class="i"><use href="#back"/></svg></button>
      <span class="deck-count">{{ top + 1 }} / {{ n }}</span>
      <button v-if="cards[top]?.action ?? action" class="primary deck-act" :disabled="busy" @click="emit('action', cards[top], top)">{{ cards[top]?.action ?? action }}</button>
      <button class="ghost deck-btn" :disabled="n < 2" aria-label="Następna" @click="fling(1)"><svg class="i"><use href="#chev"/></svg></button>
    </div>
  </div>
</template>

<style scoped>
.deck { display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; overflow-x: clip; padding: 14px 0; } /* odlatująca karta nie poszerza strony */
.deck-stack { position: relative; width: min(340px, 82vw); aspect-ratio: 4 / 5; outline: none; touch-action: pan-y; }
.deck-stack:focus-visible { outline: 2px solid var(--accent); outline-offset: 10px; border-radius: 24px; }
.deck-card { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; border-radius: 24px; background: var(--panel2, #1f1f1f);
  transform: rotate(var(--tilt)) translateY(calc(var(--d) * 6px)) scale(calc(1 - var(--d) * .035)); transition: transform .35s cubic-bezier(.2, .8, .2, 1);
  user-select: none; -webkit-user-select: none; box-shadow: 0 18px 40px rgba(0, 0, 0, .35); }
.deck-card.top { cursor: grab; transition: none; }
.deck-card.top:active { cursor: grabbing; }
.deck-img { flex: 1; min-height: 0; width: 100%; object-fit: cover; pointer-events: none; }
.deck-ph { flex: 1; display: grid; place-items: center; background: var(--c); color: rgba(0, 0, 0, .55); font: 700 120px/1 var(--display); letter-spacing: -.04em; }
.deck-text { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 18px; background: var(--panel2, #1f1f1f); }
.deck-text b { font: 650 19px/1.2 var(--display); color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.deck-text small { color: var(--muted); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.deck-tag { align-self: flex-start; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); font-size: 11.5px; font-weight: 650; }
.deck-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; border-radius: 24px; border: 1px dashed var(--line); color: var(--muted); text-align: center; padding: 20px; }
.deck-nav { display: flex; align-items: center; gap: 12px; }
.deck-btn { width: 44px; height: 44px; padding: 0; border-radius: 50%; justify-content: center; }
.deck-btn:first-child svg { transform: none; }
.deck-count { min-width: 54px; text-align: center; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.deck-act { min-height: 44px; padding: 0 22px; border-radius: 999px; }
@media (prefers-reduced-motion: reduce) { .deck-card { transition: none; } }
</style>

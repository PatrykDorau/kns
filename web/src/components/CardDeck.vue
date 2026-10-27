<script setup lang="ts">
// Talia kart: przechylone karty jedna na drugiej; górną przeciąga się palcem/myszą (albo strzałkami) — odlatuje na spód talii.
// Karta: zdjęcie (albo kolor i pierwsza litera), znaczek, tytuł, podpis. Kliknięcie górnej karty — „open”.
import { computed, ref } from 'vue'
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

// Przeciąganie: górna karta idzie za palcem (bez przejścia). Odlot: talia od razu przesuwa się o kartę (karta spod spodu
// płynnie się prostuje), a odlatującą kartę rysuje jej kopia nad talią — nic nie znika w połowie ruchu i nic nie przeskakuje.
const stack = ref<HTMLElement | null>(null)
const dragging = ref(false)
let drag: { x: number; dx: number; id: number; moved: boolean; el: HTMLElement } | null = null
const fly = ref<{ c: DeckCard; dir: number; fx: number; fr: number; id: number } | null>(null)
const entering = ref('') // karta, która wraca na wierzch („wstecz”) — wjeżdża z boku
let flyId = 0
function down(e: PointerEvent) {
  if (e.button) return
  drag = { x: e.clientX, dx: 0, id: e.pointerId, moved: false, el: e.currentTarget as HTMLElement }
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* wskaźnik już zniknął */ }
}
function move(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  drag.dx = e.clientX - drag.x
  if (Math.abs(drag.dx) > 6) { drag.moved = true; dragging.value = true }
  if (drag.moved) drag.el.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`
}
function up(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const { dx, moved, el } = drag
  drag = null
  if (!moved) { const c = props.cards[top.value]; if (c) emit('open', c, top.value); return }
  if (Math.abs(dx) > 90) { el.style.transform = ''; dragging.value = false; fling(dx > 0 ? 1 : -1, dx); return }
  dragging.value = false
  if (still) { el.style.transform = ''; return }
  animate(el, { transform: 'translateX(0px) rotate(0deg)' }, { type: 'spring', stiffness: 500, damping: 32 }).then(() => { if (!dragging.value) el.style.transform = '' })
}
// górna karta odlatuje w bok (kopia) i trafia na spód; od razu górną staje się następna
function fling(dir: number, fromX = 0) {
  if (n.value < 2) return
  const c = props.cards[top.value]
  if (!still) fly.value = { c, dir, fx: fromX, fr: fromX / 18, id: ++flyId }
  entering.value = ''
  top.value = (top.value + 1) % n.value
}
const flyDone = (id: number) => { if (fly.value?.id === id) fly.value = null }
function back() {
  if (n.value < 2) return
  top.value = (top.value - 1 + n.value) % n.value
  if (!still) entering.value = props.cards[top.value].key
}
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
      <article v-for="s in shown" :key="s.c.key" class="deck-card" :class="{ top: s.d === 0, dragging: s.d === 0 && dragging, 'deck-in': s.d === 0 && entering === s.c.key }"
               :style="{ '--d': s.d, '--tilt': TILT[s.d] + 'deg', '--c': s.c.color || 'var(--accent)' }"
               @pointerdown="s.d === 0 && down($event)" @pointermove="move" @pointerup="up" @pointercancel="up" @animationend="entering = ''">
        <img v-if="s.c.image" class="deck-img" :src="s.c.image" alt="" draggable="false" loading="lazy">
        <span v-else class="deck-ph" aria-hidden="true">{{ initial(s.c) }}</span>
        <span class="deck-text">
          <span v-if="s.c.tag" class="deck-tag">{{ s.c.tag }}</span>
          <b>{{ s.c.title }}</b>
          <small v-if="s.c.sub">{{ s.c.sub }}</small>
        </span>
      </article>
      <!-- odlatująca karta (kopia nad talią) -->
      <article v-if="fly" :key="'fly' + fly.id" class="deck-card deck-fly" aria-hidden="true"
               :style="{ '--c': fly.c.color || 'var(--accent)', '--dir': fly.dir, '--fx': fly.fx + 'px', '--fr': fly.fr + 'deg' }" @animationend="flyDone(fly.id)">
        <img v-if="fly.c.image" class="deck-img" :src="fly.c.image" alt="" draggable="false">
        <span v-else class="deck-ph">{{ initial(fly.c) }}</span>
        <span class="deck-text"><span v-if="fly.c.tag" class="deck-tag">{{ fly.c.tag }}</span><b>{{ fly.c.title }}</b><small v-if="fly.c.sub">{{ fly.c.sub }}</small></span>
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
.deck { display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; padding: 14px 0; }
.deck-stack { position: relative; width: min(340px, 82vw); aspect-ratio: 4 / 5; outline: none; touch-action: pan-y; }
.deck-stack:focus-visible { outline: 2px solid var(--accent); outline-offset: 10px; border-radius: 24px; }
.deck-card { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; border-radius: 24px; background: var(--panel2, #1f1f1f);
  transform: rotate(var(--tilt)) translateY(calc(var(--d) * 6px)) scale(calc(1 - var(--d) * .035)); transition: transform .35s cubic-bezier(.2, .8, .2, 1);
  user-select: none; -webkit-user-select: none; box-shadow: 0 18px 40px rgba(0, 0, 0, .35); }
.deck-card.top { cursor: grab; z-index: 2; }
.deck-card.dragging { transition: none; }
.deck-fly { z-index: 3; pointer-events: none; animation: deck-fly .42s cubic-bezier(.4, 0, .9, .6) forwards; }
@keyframes deck-fly {
  from { transform: translateX(var(--fx)) rotate(var(--fr)); opacity: 1; }
  to { transform: translateX(calc(var(--dir) * 130%)) translateY(4%) rotate(calc(var(--dir) * 22deg)); opacity: 0; }
}
.deck-in { animation: deck-in .38s cubic-bezier(.2, .8, .2, 1); }
@keyframes deck-in { from { transform: translateX(-120%) rotate(-18deg); opacity: 0; } }
.deck-card.top:active { cursor: grabbing; }
.deck-img { flex: 1; min-height: 0; width: 100%; object-fit: cover; pointer-events: none; }
.deck-ph { flex: 1; display: grid; place-items: center; background: var(--c); color: rgba(0, 0, 0, .55); font: 700 120px/1 var(--display); letter-spacing: -.04em; }
.deck-text { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 18px; background: var(--panel2, #1f1f1f); }
.deck-text b { font: 650 19px/1.2 var(--display); color: var(--text); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* jedna linia — długi tytuł płynie (utils/marquee.ts) */
.deck-text small { color: var(--muted); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.deck-tag { align-self: flex-start; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); font-size: 11.5px; font-weight: 650; }
.deck-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; border-radius: 24px; border: 1px dashed var(--line); color: var(--muted); text-align: center; padding: 20px; }
.deck-nav { display: flex; align-items: center; gap: 12px; }
.deck-btn { width: 44px; height: 44px; padding: 0; border-radius: 50%; justify-content: center; }
.deck-btn:first-child svg { transform: none; }
.deck-count { min-width: 54px; text-align: center; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.deck-act { min-height: 44px; padding: 0 22px; border-radius: 999px; }
@media (prefers-reduced-motion: reduce) { .deck-card { transition: none; } .deck-fly, .deck-in { animation: none; } }
</style>

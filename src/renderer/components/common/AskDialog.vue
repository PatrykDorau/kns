<script setup lang="ts">
import { answer, askState } from '@/utils/ask'
import { focusOnce } from '@/utils/dom'

// Okno potwierdzenia (utils/ask.ts) zamiast systemowego confirm() — Enter = tak, Esc = anuluj.
</script>

<template>
  <Transition name="ask-fade">
    <div v-if="askState.open" class="ask-overlay" @click.self="answer(false)" @keydown.esc.stop="answer(false)">
      <div class="ask-panel" role="alertdialog" aria-modal="true" :aria-label="askState.title || 'Potwierdzenie'">
        <b v-if="askState.title" class="ask-title">{{ askState.title }}</b>
        <p class="ask-text">{{ askState.text }}</p>
        <div class="ask-btns">
          <button @click="answer(false)">{{ askState.cancel }}</button>
          <button :ref="focusOnce" :class="askState.danger ? 'danger' : 'primary'" @click="answer(true)">{{ askState.ok }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ask-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(5, 6, 8, .6); backdrop-filter: blur(3px); }
.ask-panel { width: min(440px, 100%); padding: 20px 20px 16px; border-radius: 18px; border: 1px solid var(--line, #333); background: var(--panel, #1c1d21); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, .8); }
.ask-title { display: block; margin-bottom: 6px; font-size: 16px; }
.ask-text { margin: 0 0 16px; white-space: pre-line; line-height: 1.5; }
.ask-btns { display: flex; justify-content: flex-end; gap: 8px; }
.ask-btns button { min-width: 96px; }
.ask-fade-enter-active, .ask-fade-leave-active { transition: opacity .15s; }
.ask-fade-enter-from, .ask-fade-leave-to { opacity: 0; }
</style>

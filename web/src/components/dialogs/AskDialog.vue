<script setup lang="ts">
import { answer, askState } from '@/utils/ask'
import { focusOnce } from '@/utils/dom'

// Okno potwierdzenia (utils/ask.ts) — w stylu aplikacji, Enter = tak, Esc = anuluj.
</script>

<template>
  <Transition name="ask-fade">
    <div v-if="askState.open" class="np-overlay ask-overlay" @click.self="answer(false)" @keydown.esc="answer(false)">
      <div class="np-panel ask-panel" role="alertdialog" aria-modal="true" :aria-label="askState.title || 'Potwierdzenie'">
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

<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { label, textPopup, verseKey, verses } from '@/stores'
import { focusOnce } from '@/utils/dom'

// Duże okno do wygodnej edycji tekstu (pieśni albo zwykłego slajdu z tekstem).
const close = () => { textPopup.value = null }
</script>

<template>
  <div class="overlay" @click.self="close" @keydown.esc.stop="close">
    <div class="modal textpop" role="dialog" aria-modal="true" aria-label="Edycja tekstu">
      <div class="modal-head">
        <h3>{{ label(textPopup) }}</h3>
        <button class="iconbtn" aria-label="Zamknij" @click="close"><Icon name="x" /></button>
      </div>
      <div class="mgr-cols">
        <div class="col">
          <label for="popText">{{ textPopup.type === 'song' ? 'Tekst (pusta linia = nowy slajd)' : 'Treść' }}</label>
          <textarea id="popText" v-model="textPopup.text" :ref="focusOnce" spellcheck="false"></textarea>
        </div>
        <div v-if="textPopup.type === 'song'" class="col">
          <label>Podział na slajdy: {{ verses(textPopup).length }}</label>
          <ol class="mgr-slides">
            <li v-for="(v, i) in verses(textPopup)" :key="i"><span class="vnum" :class="{ key: verseKey(textPopup, i) !== String(i + 1) }">{{ verseKey(textPopup, i) }}</span>{{ v }}</li>
          </ol>
        </div>
      </div>
      <div class="btnrow">
        <span class="note">Zmiany zapisują się same.</span>
        <span class="spacer"></span>
        <button class="primary" @click="close"><Icon name="check" />Gotowe</button>
      </div>
    </div>
  </div>
</template>

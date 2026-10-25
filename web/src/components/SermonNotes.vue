<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

// Notatki z kazania (#52): pytania od kaznodziei (w organizacji nabożeństwa), pod każdym pole na własną notatkę
// i jedno na resztę. Notatki zostają tylko na tym telefonie/komputerze (localStorage) — nie idą do bazy.
const props = defineProps<{ service: { id: string, sermonTitle?: string, passage?: string, speaker?: string, questions?: string }, compact?: boolean }>()
const qs = computed(() => String(props.service?.questions || '').split('\n').map(q => q.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean))
const key = computed(() => 'kns-notes-' + props.service?.id)
const notes = reactive<Record<string, string>>({})
const load = () => { for (const k of Object.keys(notes)) delete notes[k]; try { Object.assign(notes, JSON.parse(localStorage.getItem(key.value) || '{}')) } catch { /* bez zapisanych notatek */ } }
watch(key, load, { immediate: true })
let timer = 0
watch(notes, () => { clearTimeout(timer); timer = window.setTimeout(() => { try { localStorage.setItem(key.value, JSON.stringify(notes)) } catch { /* pełna pamięć albo tryb prywatny */ } }, 300) }, { deep: true })
const filled = computed(() => Object.values(notes).filter(v => String(v || '').trim()).length)
</script>

<template>
  <section v-if="qs.length" class="sermon-notes" :class="{ compact }">
    <div class="sn-head">
      <svg class="i"><use href="#pencil"/></svg>
      <span><b>Notatki z kazania</b><small>{{ [service.sermonTitle, service.passage].filter(Boolean).join(' · ') || 'Pytania od kaznodziei' }}</small></span>
    </div>
    <label v-for="(q, i) in qs" :key="i" class="sn-q">
      <span class="sn-n">{{ i + 1 }}</span><span class="sn-text">{{ q }}</span>
      <textarea v-model="notes['q' + i]" rows="2" placeholder="Twoja notatka…"></textarea>
    </label>
    <label class="sn-q">
      <span class="sn-text">Inne myśli</span>
      <textarea v-model="notes.free" rows="2" placeholder="Co zapamiętasz z kazania?"></textarea>
    </label>
    <small class="sn-foot"><svg class="i"><use href="#info"/></svg>Notatki są tylko na tym urządzeniu{{ filled ? ' · zapisane' : '' }}.</small>
  </section>
</template>

<style scoped>
.sermon-notes { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; padding: 14px; border-radius: 18px; border: 1px solid var(--line); background: var(--panel); }
.sn-head { display: flex; align-items: center; gap: 10px; }
.sn-head > .i { width: 20px; height: 20px; color: var(--accent-text); flex: none; }
.sn-head span { display: flex; flex-direction: column; min-width: 0; }
.sn-head small { color: var(--muted); font-size: 13px; }
.sn-q { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: start; margin: 0; }
.sn-n { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-size: 12px; font-weight: 800; }
.sn-text { font-weight: 600; line-height: 1.4; }
.sn-q > .sn-text:first-child { grid-column: 1 / -1; }
.sn-q textarea { grid-column: 1 / -1; min-height: 64px; font-size: 15px; }
.sn-foot { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.sn-foot .i { width: 13px; height: 13px; }
</style>

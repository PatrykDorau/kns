<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import { calendarRequest, canUse, loadInbox, readInbox, role } from './store.js'

// Powiadomienia w aplikacji (dzwonek) — te same co na telefonie: zgłoszenia do zatwierdzenia, zgłoszenia do służby,
// wiadomości od liderów. Zawsze włączone; telefon i e-mail to dodatkowe kanały ustawiane na telefonie.
const list = ref([])
const open = ref(false)
const unread = computed(() => list.value.filter(n => !n.read).length)
async function load() { const r = await loadInbox(); if (!r.error) list.value = r.list }
let timer
onMounted(() => { load(); timer = setInterval(load, 60000) })
onUnmounted(() => clearInterval(timer))
function toggle() { open.value = !open.value; if (open.value) load() }
function markRead(items) {
  const ids = items.filter(n => !n.read).map(n => n.id)
  items.forEach(n => { n.read = true })
  if (ids.length) readInbox(ids)
}
const ago = t => {
  const min = Math.round((Date.now() - new Date(t).getTime()) / 60000)
  if (min < 1) return 'teraz'
  if (min < 60) return min + ' min'
  if (min < 24 * 60) return Math.round(min / 60) + ' godz'
  return new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '')
}
// Wydarzenie otwiera kalendarz; resztę (ogłoszenia do zatwierdzenia, służby) — strona w przeglądarce.
function go(n) {
  markRead([n]); open.value = false
  const q = new URL(n.url || './', 'https://kns-nabo.netlify.app/').searchParams
  if (q.get('wydarzenie') && canUse('calendar')) { calendarRequest.value = { kind: 'event', id: q.get('wydarzenie') }; role.value = 'calendar' }
  else if (n.url) window.open('https://kns-nabo.netlify.app/' + n.url.replace(/^\.\//, ''), '_blank')
}
</script>

<template>
  <button class="kh-ib" :class="{ on: open }" title="Powiadomienia" aria-label="Powiadomienia" @click="toggle"><Icon name="bell" /><span v-if="unread" class="kh-count">{{ unread }}</span></button>
  <div v-if="open" class="kh-modal" role="dialog" aria-modal="true" @click.self="open = false" @keydown.esc="open = false">
    <div class="kh-modal-box inbox">
      <button class="kh-ib kh-close" title="Zamknij" aria-label="Zamknij" @click="open = false"><Icon name="x" /></button>
      <h2>Powiadomienia</h2>
      <p v-if="!list.length" class="kh-muted">Nie masz powiadomień. Tutaj pojawią się zgłoszenia do zatwierdzenia, zgłoszenia do służby i wiadomości od liderów.</p>
      <button v-for="n in list" :key="n.id" class="inbox-item" :class="{ unread: !n.read }" @click="go(n)">
        <span class="inbox-dot"></span>
        <span class="inbox-text"><b>{{ n.title }}</b><span v-if="n.body">{{ n.body }}</span></span>
        <small>{{ ago(n.created) }}</small>
      </button>
      <button v-if="unread" class="small inbox-all" @click="markRead(list)">Oznacz wszystkie jako przeczytane</button>
    </div>
  </div>
</template>

<style scoped>
.inbox { max-height: 80vh; overflow: auto; }
.inbox-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 12px 8px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, .08); border-radius: 0; background: none; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.inbox-item:hover { background: rgba(255, 255, 255, .04); }
.inbox-dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; }
.inbox-item.unread .inbox-dot { background: var(--accent, #f2a53c); }
.inbox-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.inbox-text span { opacity: .65; font-size: 13px; }
.inbox-item:not(.unread) b { font-weight: 500; }
.inbox-item small { flex: none; opacity: .6; font-size: 12px; }
.inbox-all { margin-top: 12px; align-self: flex-end; }
</style>

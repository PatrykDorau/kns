<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings } from '@/stores'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Czat na żywo (widzi go tylko realizator, nie ma go na wizji): okienko nad pulpitem — przesuwa się za nagłówek, rozmiar
// za róg, miejsce zostaje zapamiętane — albo „przypięty”: stała kolumna obok pulpitu (docked). Odpowiedź idzie jako
// połączony kanał YouTube.
const props = defineProps<{ docked?: boolean }>()
const { chat, chatBroadcast, yt, send } = useDesk()
const draft = ref(''), sending = ref(false), sendErr = ref('')
async function submit() {
  if (!draft.value.trim() || sending.value) return
  sending.value = true; sendErr.value = ''
  const r = await send(draft.value)
  sending.value = false
  if (r.error) sendErr.value = r.error; else { draft.value = ''; toEnd(true) }
}
const box = ref<HTMLElement>(), list = ref<HTMLElement>()
const pos = ref({ x: 0, y: 84, w: 380, h: 520, ...settings.chatPos })
if (!settings.chatPos) pos.value.x = Math.max(16, innerWidth - pos.value.w - 340)
const margin = 16
function keepOnScreen() {
  const p = pos.value
  p.x = Math.round(Math.max(margin - p.w + 120, Math.min(p.x, innerWidth - 120)))
  p.y = Math.round(Math.max(0, Math.min(p.y, innerHeight - 48)))
}
function remember() { settings.chatPos = { ...pos.value } }

let grab: { x: number, y: number } | null = null
function down(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  grab = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!grab) return
  pos.value.x = e.clientX - grab.x; pos.value.y = e.clientY - grab.y
  keepOnScreen()
}
function up() { if (grab) { grab = null; remember() } }
// rozmiar zmieniony za róg okienka
const sizes = new ResizeObserver(() => {
  if (!box.value) return
  const { offsetWidth: w, offsetHeight: h } = box.value
  if (w !== pos.value.w || h !== pos.value.h) { pos.value.w = w; pos.value.h = h; remember() }
})
watch(box, (el, old) => { if (old) sizes.unobserve(old); if (el) sizes.observe(el) })
onMounted(() => { keepOnScreen(); addEventListener('resize', keepOnScreen) })
onBeforeUnmount(() => { removeEventListener('resize', keepOnScreen); sizes.disconnect() })

// nowe wiadomości przewijają listę, chyba że ktoś czyta starsze
function toEnd(force = false) {
  const el = list.value
  if (!el) return
  const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  nextTick(() => { if (atEnd || force) el.scrollTop = el.scrollHeight })
}
watch(() => chat.messages.length, () => toEnd())
watch(() => chat.open, open => { if (open) nextTick(() => { keepOnScreen(); toEnd(true) }) })

const clock = (at: string) => (at ? new Date(at).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }) : '')
const note = computed(() => {
  if (chat.error) return chat.error
  if (!yt.value.loggedIn) return 'Połącz aplikację z kanałem YouTube — panel YouTube po prawej.'
  if (!chatBroadcast.value) return 'Czat pojawi się, gdy będzie zaplanowana albo trwająca transmisja.'
  if (chat.ended) return 'Czat tej transmisji się zakończył.'
  return chat.messages.length ? '' : 'Na razie nikt nie napisał.'
})
</script>

<template>
  <Teleport to="body" :disabled="props.docked">
    <div v-if="chat.open" ref="box" class="livechat" :class="{ docked: props.docked }" role="dialog" aria-label="Czat na żywo" :style="props.docked ? null : { left: pos.x + 'px', top: pos.y + 'px', width: pos.w + 'px', height: pos.h + 'px' }">
      <header @pointerdown="!props.docked && down($event)" @pointermove="move" @pointerup="up" @pointercancel="up">
        <Icon name="chat" />
        <div><b>Czat na żywo</b><small v-if="chatBroadcast">{{ chatBroadcast.title }}</small></div>
        <button class="iconbtn" :title="props.docked ? 'Odepnij — pływające okienko' : 'Przypnij obok pulpitu — zawsze widoczny'" :aria-label="props.docked ? 'Odepnij czat' : 'Przypnij czat'" @click="settings.chatDock = !props.docked"><Icon :name="props.docked ? 'expand' : 'pin'" /></button>
        <button class="iconbtn" title="Schowaj czat" aria-label="Schowaj czat" @click="chat.open = false"><Icon name="x" /></button>
      </header>
      <ol ref="list" aria-live="polite">
        <li v-for="m in chat.messages" :key="m.id" :class="{ owner: m.owner, mod: m.mod }">
          <span><b>{{ m.author }}</b><time>{{ clock(m.at) }}</time></span>
          <p>{{ m.text }}</p>
        </li>
      </ol>
      <p v-if="note" class="livechat-note" :class="{ bad: chat.error }">{{ note }}</p>
      <form v-if="chatBroadcast && !chat.ended && yt.loggedIn" class="livechat-send" @submit.prevent="submit">
        <input v-model="draft" maxlength="200" :placeholder="'Odpowiedz jako ' + (yt.channel || 'kanał')" aria-label="Wiadomość na czat" :disabled="sending">
        <button class="primary small" :disabled="!draft.trim() || sending">{{ sending ? '…' : 'Wyślij' }}</button>
      </form>
      <p v-if="sendErr" class="livechat-note bad">{{ sendErr }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.livechat { position: fixed; z-index: 900; display: flex; flex-direction: column; min-width: 280px; min-height: 240px; max-width: 90vw; max-height: 90vh; overflow: hidden; resize: both; border: 1px solid rgba(255, 255, 255, .2); border-radius: 12px; background: var(--panel2); box-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 22px 60px rgba(0, 0, 0, .7); }
header { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--line); background: var(--panel3); cursor: grab; touch-action: none; user-select: none; }
header:active { cursor: grabbing; }
header div { flex: 1; min-width: 0; display: grid; }
header small { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
ol { flex: 1; min-height: 0; margin: 0; padding: 8px 14px; overflow-y: auto; list-style: none; }
li { padding: 7px 0; border-bottom: 1px solid var(--line); }
li:last-child { border-bottom: 0; }
li span { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
li b { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
li.owner b, li.mod b { color: var(--accent); }
time { flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
li p { margin: 2px 0 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.4; }
.livechat.docked { position: relative; z-index: 1; width: auto; height: 100%; min-width: 0; min-height: 0; max-width: none; max-height: none; resize: none; box-shadow: none; border-color: var(--line); }
.livechat.docked header { cursor: default; }
.livechat-send { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); background: var(--panel3); }
.livechat-send input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); }
.livechat-note { margin: 0; padding: 10px 14px; color: var(--muted); }
.livechat-note.bad { color: var(--bad, #e5484d); }
</style>

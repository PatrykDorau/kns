// Czat na żywo dla pulpitu streamu: wiadomości z trwającej transmisji i licznik nieodczytanych. Czat płynie też przy
// schowanym okienku, żeby licznik działał. Limit YouTube to 10 000 jednostek dziennie, a jedno pytanie kosztuje 5,
// więc pytamy rzadziej, niż pozwala YouTube: przy otwartym okienku co 10 s, przy schowanym co 20 s.
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { api } from '@/stores'
import type { YouTube } from './useYouTube'

export interface ChatMessage { id: string; at: string; text: string; author: string; owner: boolean; mod: boolean }

const OPEN_MS = 10000, HIDDEN_MS = 20000, RETRY_MS = 30000, QUOTA_MS = 300000, KEEP = 500

export function useLiveChat({ yt, chosen }: Pick<YouTube, 'yt' | 'chosen'>) {
  const chat = reactive({ open: false, messages: [] as ChatMessage[], unread: 0, error: '', ended: false })
  // trwająca transmisja; zaplanowana (poczekalnia) tylko przy otwartym okienku, żeby nie zużywać limitu przez cały dzień
  const chatBroadcast = computed(() => (yt.value.broadcasts || []).find(b => b.chatId && ['live', 'liveStarting'].includes(b.status)) || (chat.open && chosen.value?.chatId ? chosen.value : null))
  let timer = 0, page = '', chatId = '', run = 0

  async function pull() {
    clearTimeout(timer)
    const id = chatBroadcast.value?.chatId
    if (!id) return
    if (id !== chatId) { chatId = id; page = ''; chat.messages = []; chat.unread = 0; chat.ended = false }
    const mine = ++run
    const res = await api.ytChat({ chatId: id, page })
    if (mine !== run) return // w międzyczasie ruszyło nowsze pytanie
    if (res?.error) {
      chat.error = res.error
      timer = window.setTimeout(pull, /limit/i.test(res.error) ? QUOTA_MS : RETRY_MS)
      return
    }
    chat.error = ''
    page = res.page
    chat.ended = res.ended
    const known = new Set(chat.messages.map(m => m.id))
    const fresh = res.messages.filter(m => !known.has(m.id))
    chat.messages = [...chat.messages, ...fresh].filter(m => !res.removed.includes(m.id)).slice(-KEEP)
    if (!chat.open) chat.unread += fresh.filter(m => !m.owner).length
    if (!res.ended) timer = window.setTimeout(pull, Math.max(res.wait, chat.open ? OPEN_MS : HIDDEN_MS))
  }
  watch(() => chatBroadcast.value?.chatId, pull, { immediate: true })
  // otwarcie: wszystko przeczytane i od razu świeże wiadomości
  watch(() => chat.open, open => { if (open) { chat.unread = 0; pull() } })
  onBeforeUnmount(() => { clearTimeout(timer); run++ })

  return { chat, chatBroadcast }
}

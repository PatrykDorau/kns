import { ask } from '@/utils/ask'
// ATEM przez sieć: która kamera na wizji i w podglądzie, CUT/AUTO, transmisja prosto z miksera.
// Mikser zostaje sprzętowy — aplikacja tylko nim steruje (kabel sieciowy, opcjonalnie).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, settings } from '@/stores'
import type { AtemInput, AtemState } from '@/types'

export function useAtem() {
  const atem = ref<AtemState>({ connected: false, address: '', inputs: [], program: null, preview: null, streaming: '', recording: '' })
  const address = ref(settings.atemAddress || '')
  const atemError = ref('')
  const connecting = computed(() => !!atem.value.address && !atem.value.connected)
  const cameras = computed(() => atem.value.inputs.filter(i => i.camera))
  const others = computed(() => atem.value.inputs.filter(i => !i.camera && i.id === 0)) // czerń — „wyjście awaryjne”

  async function connect() {
    atemError.value = ''
    const ip = address.value.trim()
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { atemError.value = 'Wpisz adres IP miksera, np. 192.168.1.240 (ATEM Software Control → Ustawienia → Sieć).'; return }
    settings.atemAddress = ip
    atem.value = await api.atemConnect(ip)
  }
  async function disconnect() { settings.atemAddress = ''; atem.value = await api.atemDisconnect() }
  async function run(name: string, arg?: unknown) {
    const res = await api.atemRun(name, arg)
    atemError.value = res?.error || ''
  }
  // Kliknięcie kamery: od razu na wizję (Cut) albo do podglądu (zielony), potem CUT/AUTO.
  function pick(input: AtemInput) { run(settings.atemDirect ? 'program' : 'preview', input.id) }
  async function stopAtemStream() { if ((await ask('Zatrzymać transmisję z ATEM?'))) run('streaming', false) }

  let off: (() => void) | null = null
  onMounted(async () => {
    off = api.onAtemState?.(s => { atem.value = s })
    const st = await api.atemState?.()
    if (st) atem.value = st
    if (settings.atemAddress && !st?.address) connect()
  })
  onBeforeUnmount(() => off?.())

  return { atem, address, atemError, connecting, cameras, others, connect, disconnect, run, pick, stopAtemStream }
}

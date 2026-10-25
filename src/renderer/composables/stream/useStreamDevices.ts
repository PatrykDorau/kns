// Skąd obraz i dźwięk: tryb studio (kamera i dźwięk z przeglądarki — ATEM po USB) albo prosty (urządzenia FFmpeg).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, settings } from '@/stores'
import { checkHardware, listCameras, setAudio, setCamera, studio } from '@/services/studio'

interface MediaDevice { deviceId: string; label: string }

export function useStreamDevices() {
  // studio — obraz składa i koduje aplikacja (karta graficzna); prosty — gdy karta nie koduje H.264 albo tak wybrano
  const engine = computed(() => (settings.streamEngine === 'simple' || studio.hardware === false ? 'simple' : 'studio'))
  const studioDevices = ref<{ video: MediaDevice[]; audio: MediaDevice[] }>({ video: [], audio: [] })
  const devices = ref<{ video: string[]; audio: string[]; screens: { value: string; label: string }[] }>({ video: [], audio: [], screens: [] })

  async function loadStudioDevices() {
    studioDevices.value = await listCameras()
    const pick = (list: MediaDevice[], saved: string) => list.find(d => d.label === saved) || list.find(d => /blackmagic|atem/i.test(d.label)) || null
    // awaryjnie pierwsza prawdziwa kamera — nie wirtualna kamera OBS (bez działającego OBS nie daje obrazu)
    const cam = pick(studioDevices.value.video, settings.studioCamera) || studioDevices.value.video.find(d => !/obs|virtual/i.test(d.label)) || studioDevices.value.video[0]
    // zapamiętany wybór (np. ATEM) zostaje, nawet gdy chwilowo go nie ma — po podłączeniu wróci sam
    if (cam) { if (!settings.studioCamera || cam.label === settings.studioCamera || /blackmagic|atem/i.test(cam.label)) settings.studioCamera = cam.label; setCamera(cam.deviceId) }
    const mic = pick(studioDevices.value.audio, settings.studioAudio)
    if (mic) { settings.studioAudio = mic.label; setAudio(mic.deviceId) }
  }
  function chooseCamera(label: string) { settings.studioCamera = label; const d = studioDevices.value.video.find(x => x.label === label); setCamera(d?.deviceId || '') }
  function chooseAudio(label: string) { settings.studioAudio = label; const d = studioDevices.value.audio.find(x => x.label === label); setAudio(d?.deviceId || '') }

  async function loadDevices() {
    devices.value = { screens: [], ...((await api.streamDevices?.()) || { video: [], audio: [] }) }
    // ATEM po USB to „Blackmagic Design” — wybierany sam
    const bm = (list: string[]) => list.find(n => /blackmagic|atem/i.test(n)) || ''
    const all = [...devices.value.video, ...devices.value.screens.map(s => s.value)]
    if (!all.includes(settings.streamVideo)) settings.streamVideo = bm(devices.value.video) || devices.value.video[0] || ''
    if (settings.streamAudio && !devices.value.audio.includes(settings.streamAudio)) settings.streamAudio = ''
    if (!settings.streamAudio) settings.streamAudio = bm(devices.value.audio)
  }

  // podłączenie/odłączenie urządzenia: gdy pojawiła się zapamiętana kamera (np. ATEM po włożeniu kabla) — przełącz na nią;
  // działającej kamery nie ruszamy
  async function onDeviceChange() {
    const list = await listCameras()
    studioDevices.value = list
    const saved = list.video.find(d => d.label === settings.studioCamera) || list.video.find(d => /blackmagic|atem/i.test(d.label))
    if (saved && saved.deviceId !== studio.camera) setCamera(saved.deviceId)
  }
  onMounted(async () => {
    loadDevices()
    await checkHardware()
    loadStudioDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  })
  onBeforeUnmount(() => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange))

  return { engine, studioDevices, devices, loadDevices, loadStudioDevices, chooseCamera, chooseAudio }
}
export type StreamDevices = ReturnType<typeof useStreamDevices>

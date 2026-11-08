<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, onUnmounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { broadcast, makeTransport, testTone } from '@/services/tlumacz'

// Tłumaczenie na żywo (wzór: Avenit, bez serwera mediów): tłumacz wybiera język i mikrofon, klika „Nadawaj”,
// a słuchacze skanują kod QR z plakatu (strona /sluchaj.html, bez konta) i słuchają w słuchawkach na telefonie.
// Dźwięk idzie prosto z tej przeglądarki do każdego telefonu — dobrze do ok. 15 słuchaczy na jednego tłumacza.
const LANGS = [['EN', 'English'], ['UK', 'Українська'], ['RU', 'Русский'], ['DE', 'Deutsch'], ['ES', 'Español']]
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ info: null, live: [], lang: 'EN', name: 'English', mic: '', mics: [], on: null, listeners: 0, error: '', busy: false, level: 0, qr: '' })
    const listenUrl = location.origin + '/sluchaj.html'
    let tx = null, stream = null, tone = null, ping = 0, meter = 0, actx = null
    async function load() {
      try {
        st.info = await app.api.call('tlInfo')
        st.live = await app.api.call('tlLive')
        const devs = await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || []
        st.mics = devs.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, name: d.label || 'Mikrofon ' + (d.deviceId || '').slice(0, 4) }))
      } catch (e) { st.error = e.message }
    }
    onMounted(load)
    const pickLang = ([code, name]) => { st.lang = code; st.name = name }
    // wskaźnik poziomu mikrofonu — tłumacz widzi, że dźwięk idzie
    function watchLevel(s) {
      actx = new AudioContext(); const an = actx.createAnalyser(); an.fftSize = 512
      actx.createMediaStreamSource(s).connect(an)
      const buf = new Float32Array(an.fftSize)
      meter = setInterval(() => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); st.level = Math.min(1, m * 1.6) }, 120)
    }
    async function start() {
      st.busy = true; st.error = ''
      try {
        if (st.mic === 'tone') { tone = testTone(); stream = tone.stream }
        else stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: st.mic ? { exact: st.mic } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        const id = await app.api.call('tlStart', { lang: st.lang, name: st.name })
        const t = makeTransport(app.api.client, id)
        await t.ready
        tx = broadcast(t, stream, n => { st.listeners = n })
        st.on = { id, lang: st.lang, name: st.name }
        watchLevel(stream)
        ping = setInterval(() => app.api.call('tlPing', { id, listeners: st.listeners }).catch(() => null), 15000)
        app.api.call('tlPing', { id, listeners: 0 }).catch(() => null)
        if (!st.mics.some(m => m.name && !m.name.startsWith('Mikrofon '))) load() // po zgodzie na mikrofon widać nazwy urządzeń
      } catch (e) {
        st.error = e.name === 'NotAllowedError' ? 'Przeglądarka nie ma dostępu do mikrofonu — zezwól w ustawieniach strony.' : e.message
        cleanup()
      } finally { st.busy = false }
    }
    function cleanup() {
      clearInterval(ping); clearInterval(meter); st.level = 0
      tx?.stop(); tx = null
      stream?.getTracks().forEach(t => t.stop()); stream = null
      tone?.stop(); tone = null
      actx?.close().catch(() => null); actx = null
    }
    async function stop() {
      const id = st.on?.id
      cleanup(); st.on = null; st.listeners = 0
      if (id) await app.api.call('tlStop', { id }).catch(() => null)
      load()
    }
    // zamknięcie karty w trakcie — kanał znika z listy słuchaczy
    const bye = () => { if (st.on) app.api.call('tlStop', { id: st.on.id }).catch(() => null) }
    addEventListener('pagehide', bye)
    onUnmounted(() => { removeEventListener('pagehide', bye); if (st.on) stop() })
    async function poster() {
      try { await app.loadQrLib(); st.qr = app.qrPng(listenUrl) } catch (e) { st.error = e.message }
    }
    const printPoster = () => {
      const w = open('', '_blank')
      if (!w) return
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Tłumaczenie na żywo</title><style>body{font:20px system-ui,sans-serif;text-align:center;padding:40px}h1{font-size:44px;margin:0 0 8px}img{width:70%;max-width:520px}p{color:#444}</style>
        <h1>Tłumaczenie na żywo</h1><p>Live translation · Переклад наживо</p><img src="${st.qr}" alt="QR"><p>Zeskanuj telefonem, wybierz język i słuchaj w słuchawkach.<br>Scan, choose your language, listen with headphones.</p><p><b>${listenUrl.replace(/^https?:\/\//, '')}</b></p>
        <script>onload=()=>print()<\/script>`)
      w.document.close()
    }
    const toggleMinistry = (m, on) => app.api.call('tlMinistry', { id: m.id, on }).then(load).catch(e => { st.error = e.message })
    const others = computed(() => st.live.filter(x => x.id !== st.on?.id))
    return { ...app, st, LANGS, pickLang, start, stop, poster, printPoster, listenUrl, toggleMinistry, others }
  },
})
</script>

<template>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <template v-if="st.info">
    <!-- nadawanie -->
    <section v-if="st.on" class="tl-live">
      <small><i class="tl-dot"></i>Nadajesz · {{ st.on.lang }} — {{ st.on.name }}</small>
      <b>{{ st.listeners }}</b><span>{{ st.listeners === 1 ? 'słuchacz' : 'słuchaczy' }}</span>
      <div class="tl-meter" aria-hidden="true"><span :style="{ width: Math.round(st.level * 100) + '%' }"></span></div>
      <button class="tl-stop" @click="stop"><svg class="i"><use href="#x"/></svg>Zakończ tłumaczenie</button>
    </section>

    <section v-else-if="st.info.can" class="tl-sec card">
      <h3 class="hw-h">Nadawaj tłumaczenie</h3>
      <div class="tl-langs" role="group" aria-label="Język">
        <button v-for="l in LANGS" :key="l[0]" class="filter" :class="{ on: st.lang === l[0] }" @click="pickLang(l)"><b>{{ l[0] }}</b> {{ l[1] }}</button>
      </div>
      <div class="tl-fields">
        <label>Kod języka<input v-model="st.lang" maxlength="3" @input="st.lang = st.lang.toUpperCase()"></label>
        <label>Nazwa dla słuchaczy<input v-model="st.name" maxlength="40"></label>
      </div>
      <label class="tl-mic">Źródło dźwięku
        <select v-model="st.mic"><option value="">Domyślny mikrofon</option><option v-for="m in st.mics" :key="m.id" :value="m.id">{{ m.name }}</option><option value="tone">Ton testowy (sprawdzenie słuchaczy)</option></select>
      </label>
      <button class="primary tl-go" :disabled="st.busy || !/^[A-Za-z]{2,3}$/.test(st.lang)" @click="start"><svg class="i"><use href="#mic"/></svg>{{ st.busy ? 'Łączę…' : 'Nadawaj' }}</button>
      <p class="note">Dźwięk idzie prosto z tego urządzenia do telefonów słuchaczy — dobrze do ok. 15 osób na jednego tłumacza. Nie zamykaj tej strony w trakcie. Użyj słuchawek z mikrofonem albo mikrofonu przy ustach.</p>
    </section>
    <p v-else class="note">Nadawać mogą tłumacze (członkowie służby tłumaczy) i liderzy. Słuchać może każdy — przez kod QR poniżej.</p>

    <section v-if="others.length" class="tl-sec">
      <h3 class="hw-h">Teraz na żywo</h3>
      <p v-for="c in others" :key="c.id" class="tl-chan"><b>{{ c.lang }}</b><span>{{ c.name }}</span><small>{{ c.listeners }} słuch.</small></p>
    </section>

    <!-- dla słuchaczy: kod QR i plakat -->
    <section class="tl-sec card">
      <h3 class="hw-h">Dla słuchaczy</h3>
      <p class="note">Słuchacz skanuje kod, wybiera język i słucha w słuchawkach — bez konta i bez instalowania. Adres: <a :href="listenUrl" target="_blank" rel="noopener">{{ listenUrl.replace(/^https?:\/\//, '') }}</a></p>
      <img v-if="st.qr" class="tl-qr" :src="st.qr" alt="Kod QR do słuchania tłumaczenia">
      <div class="row">
        <button v-if="!st.qr" @click="poster"><svg class="i"><use href="#qr"/></svg>Pokaż kod QR</button>
        <button v-else class="primary" @click="printPoster"><svg class="i"><use href="#download"/></svg>Drukuj plakat</button>
      </div>
    </section>

    <details v-if="st.info.manage" class="tl-sec tl-admin">
      <summary>Kto może nadawać: która służba to tłumacze?</summary>
      <label v-for="m in st.info.ministries" :key="m.id" class="check"><input type="checkbox" :checked="m.on" @change="toggleMinistry(m, $event.target.checked)">{{ m.name }}</label>
    </details>
  </template>
  <p v-else-if="!st.error" class="note">Wczytywanie…</p>
</template>

<style scoped>
.tl-sec { margin-bottom: 16px; }
.card.tl-sec { padding: 16px !important; display: grid !important; gap: 12px; }
.tl-langs { display: flex; flex-wrap: wrap; gap: 6px; }
.tl-fields { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
.tl-fields label, .tl-mic { display: grid; gap: 4px; color: var(--muted); font-size: 13px; }
.tl-fields input, .tl-mic select { font-size: 15px; color: var(--text); padding-left: 12px !important; min-height: 44px; }
.tl-go { min-height: 52px; font-size: 16px; }
.tl-live { display: grid; justify-items: center; gap: 4px; padding: 24px 16px; margin-bottom: 16px; border-radius: 24px; background: var(--panel); text-align: center; box-shadow: inset 0 0 0 2px var(--bad); }
.tl-live small { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--bad-text); }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bad); animation: tl-pulse 1.4s ease-in-out infinite; }
@keyframes tl-pulse { 50% { opacity: .3; } }
.tl-live b { font: 700 64px/1 var(--display); font-variant-numeric: tabular-nums; }
.tl-live span { color: var(--muted); }
.tl-meter { width: min(320px, 100%); height: 8px; margin: 10px 0; border-radius: 4px; background: var(--panel2); overflow: hidden; }
.tl-meter span { display: block; height: 100%; background: var(--ok); transition: width .1s linear; }
.tl-stop { background: var(--bad) !important; color: #fff !important; min-height: 48px; padding: 0 20px; font-weight: 600 !important; }
.tl-chan { display: flex; align-items: center; gap: 12px; margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--panel); }
.tl-chan b { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--accent); color: #2a1906; }
.tl-chan span { flex: 1; }
.tl-chan small { color: var(--muted); }
.tl-qr { width: min(260px, 70%); justify-self: center; border-radius: 12px; }
.tl-admin summary { cursor: pointer; color: var(--muted); font-size: 14px; margin-bottom: 8px; }
</style>

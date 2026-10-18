<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { api, prettyDate, serviceTime, servicePlace, settings } from './store.js'

// Pulpit streamu: ATEM przez sieć (która kamera na wizji, podgląd, Cut/Auto) i YouTube (stały klucz, transmisje
// z tytułem i opisem z nabożeństwa). Mikser zostaje sprzętowy — aplikacja tylko nim steruje.
const props = defineProps({ service: { type: Object, default: null } })

/* ---------- ATEM ---------- */
const atem = ref({ connected: false, address: '', inputs: [], program: null, preview: null, streaming: '', recording: '' })
const address = ref(settings.atemAddress || '')
const atemError = ref('')
const connecting = computed(() => !!atem.value.address && !atem.value.connected)
const cameras = computed(() => atem.value.inputs.filter(i => i.camera))
const others = computed(() => atem.value.inputs.filter(i => !i.camera && i.id === 0)) // czerń — „wyjście awaryjne”
let off = null
onMounted(async () => {
  off = api.onAtemState?.(s => { atem.value = s })
  const st = await api.atemState?.()
  if (st) atem.value = st
  if (settings.atemAddress && !st?.address) connect()
  loadYt()
})
onBeforeUnmount(() => { off?.(); clearInterval(ytTimer) })
async function connect() {
  atemError.value = ''
  const ip = address.value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { atemError.value = 'Wpisz adres IP miksera, np. 192.168.1.240 (ATEM Software Control → Ustawienia → Sieć).'; return }
  settings.atemAddress = ip
  atem.value = await api.atemConnect(ip)
}
async function disconnect() { settings.atemAddress = ''; atem.value = await api.atemDisconnect() }
async function run(name, arg) {
  const res = await api.atemRun(name, arg)
  atemError.value = res?.error || ''
}
// Kliknięcie kamery: od razu na wizję (Cut) albo do podglądu (zielony), potem CUT/AUTO.
function pick(input) { run(settings.atemDirect ? 'program' : 'preview', input.id) }
const STREAM_LABEL = { idle: 'gotowy', connecting: 'łączy się…', streaming: 'NADAJE', stopping: 'kończy…' }

/* ---------- YouTube ---------- */
const yt = ref({ loggedIn: false })
const ytBusy = ref(false), ytError = ref(''), showKey = ref(false), copied = ref('')
let ytTimer = 0
async function loadYt() {
  const res = await api.ytOverview?.()
  if (!res) return
  if (res.error) {
    // zalogowane, ale YouTube zgłosił błąd (np. chwilowy po swojej stronie) — kanał zostaje, a komunikat mówi, co się nie udało
    ytError.value = res.error
    const st = res.needLogin ? { loggedIn: false } : await api.ytStatus()
    yt.value = { ...yt.value, ...st }
    clearInterval(ytTimer)
    if (st.loggedIn) ytTimer = setInterval(loadYt, 30000)
    return
  }
  ytError.value = ''
  yt.value = res
  clearInterval(ytTimer)
  if (res.loggedIn) ytTimer = setInterval(loadYt, 15000) // stan sygnału i transmisji
}
async function ytDo(job) {
  ytBusy.value = true; ytError.value = ''
  try {
    const res = await job()
    if (res?.error) ytError.value = res.error
    await loadYt()
    return res
  } finally { ytBusy.value = false }
}
const ytLogin = () => ytDo(() => api.ytLogin())
const ytLogout = () => { if (confirm('Odłączyć aplikację od kanału YouTube?')) ytDo(() => api.ytLogout()) }
async function copy(name, text) { await navigator.clipboard.writeText(text); copied.value = name; setTimeout(() => { if (copied.value === name) copied.value = '' }, 1500) }

// Tytuł i opis transmisji z nabożeństwa (jak dotychczasowe filmy: „Tytuł | Fragment | Mówca”).
const ytTitle = svc => [svc.sermonTitle, svc.passage, svc.speaker].map(x => (x || '').trim()).filter(Boolean).join(' | ') || 'Nabożeństwo ' + new Date(svc.date + 'T12:00').toLocaleDateString('pl')
function ytDescription(svc) {
  const lines = [`Nabożeństwo Kościoła Na Skale — ${prettyDate(svc.date)}, ${serviceTime(svc)}, ${servicePlace(svc)}.`]
  if (svc.sermonTitle || svc.passage) lines.push('', 'Kazanie: ' + [svc.sermonTitle, svc.passage && `(${svc.passage})`].filter(Boolean).join(' ') + (svc.speaker ? ' — ' + svc.speaker : ''))
  if (svc.songs?.length) lines.push('', 'Pieśni:', ...svc.songs.map((e, i) => `${i + 1}. ${e.title}`))
  if (svc.band) lines.push('', 'Zespół: ' + svc.band)
  return lines.join('\n')
}
const ytStart = svc => new Date(`${svc.date}T${serviceTime(svc)}`).toISOString()
// Transmisja na wybrane nabożeństwo: ta, która startuje tego dnia.
const forService = computed(() => (props.service && yt.value.broadcasts || []).find(b => b.start?.slice(0, 10) === props.service.date) || null)
const privacy = ref(settings.ytPrivacy || 'public')
watch(privacy, v => { settings.ytPrivacy = v })
async function createForService() {
  const svc = props.service
  if (!svc) return
  await ytDo(() => api.ytCreate({ title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: privacy.value }))
}
async function refreshFromService(b) {
  const svc = props.service
  if (svc) await ytDo(() => api.ytUpdate({ id: b.id, title: ytTitle(svc), description: ytDescription(svc), start: ytStart(svc), privacy: b.privacy }))
}
async function endBroadcast(b) { if (confirm('Zakończyć transmisję „' + b.title + '”? Widzowie zobaczą jej koniec.')) await ytDo(() => api.ytEnd(b.id)) }
const B_STATUS = { created: 'Zaplanowana', ready: 'Gotowa — czeka na obraz', testStarting: 'Test…', testing: 'Test', liveStarting: 'Startuje…', live: 'NA ŻYWO' }
const PRIVACY = { public: 'publiczna', unlisted: 'niepubliczna', private: 'prywatna' }
const HEALTH = { good: 'dobry', ok: 'w porządku', bad: 'słaby', noData: 'brak danych' }
const signal = computed(() => {
  const s = yt.value.stream
  if (!s) return { text: '', cls: '' }
  if (s.status !== 'active') return { text: 'brak sygnału', cls: 'idle' }
  return { text: 'sygnał ' + (HEALTH[s.health] || s.health), cls: s.health === 'bad' ? 'bad' : 'ok' }
})
function stopAtemStream() { if (confirm('Zatrzymać transmisję z ATEM?')) run('streaming', false) }
const sendKeyToAtem = () => run('streamService', { url: yt.value.stream.url, key: yt.value.stream.key })
</script>

<template>
  <div class="desk">
    <!-- ATEM -->
    <div class="desk-box">
      <div class="desk-head">
        <h2>ATEM</h2>
        <span class="desk-dot" :class="atem.connected ? 'ok' : connecting ? 'wait' : 'off'"></span>
        <small class="muted">{{ atem.connected ? (atem.model || 'połączono') + ' · ' + atem.address : connecting ? 'łączę z ' + atem.address + '…' : 'niepołączony' }}</small>
        <span class="spacer"></span>
        <template v-if="atem.connected || connecting">
          <label class="check" title="Kliknięcie kamery od razu wysyła ją na wizję (bez podglądu)"><input v-model="settings.atemDirect" type="checkbox"> Od razu na wizję</label>
          <button class="small" @click="disconnect">Rozłącz</button>
        </template>
        <template v-else>
          <input v-model="address" class="desk-ip" placeholder="np. 192.168.10.240" aria-label="Adres IP miksera ATEM" inputmode="decimal" @keydown.enter="connect">
          <button class="small primary" @click="connect">Połącz</button>
        </template>
      </div>
      <p v-if="atemError" class="note bad">{{ atemError }}</p>
      <details v-if="!atem.connected" class="desk-help">
        <summary>Opcjonalnie: przełączanie kamer z aplikacji — jak podłączyć</summary>
        <p>Do samego streamu przez OBS to niepotrzebne. Kabel sieciowy daje tylko klikanie kamer tutaj i podgląd, która jest na wizji (USB-C dalej wysyła obraz). Wystarczy krótki kabel sieciowy prosto między mikserem a laptopem; ustawia się to raz:</p>
        <ol>
          <li>Kabel sieciowy: gniazdo <b>ETHERNET</b> w ATEM ↔ gniazdo sieciowe laptopa (albo przejściówka USB → Ethernet).</li>
          <li><b>ATEM Setup</b> (mikser podłączony po USB): Configure → Network → adres stały <b>192.168.10.240</b>, maska 255.255.255.0 → Save.</li>
          <li>Windows: Ustawienia → Sieć i internet → Ethernet → Przypisanie IP → Edytuj → Ręcznie → IPv4: adres <b>192.168.10.10</b>, maska 255.255.255.0 (bramy nie wpisuj — internet dalej przez Wi-Fi).</li>
          <li>Tutaj wpisz <b>192.168.10.240</b> → Połącz.</li>
        </ol>
      </details>
      <p v-if="connecting" class="note">Nie widzę miksera — sprawdź kabel sieciowy i adresy IP (mikser i laptop w tej samej podsieci, np. 192.168.10.x). Łączę się ponownie co kilka sekund.</p>
      <template v-if="atem.connected">
        <div class="desk-cams" role="group" aria-label="Kamery w mikserze">
          <button v-for="i in cameras" :key="i.id" class="desk-cam" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }"
                  :aria-pressed="atem.program === i.id" :title="(atem.program === i.id ? 'Na wizji' : atem.preview === i.id ? 'W podglądzie' : settings.atemDirect ? 'Kliknij — na wizję' : 'Kliknij — do podglądu') + ' · ' + i.name" @click="pick(i)">
            <b>{{ i.short || i.id }}</b><span>{{ i.name }}</span>
            <em v-if="atem.program === i.id">NA WIZJI</em><em v-else-if="atem.preview === i.id">PODGLĄD</em>
          </button>
          <button v-for="i in others" :key="i.id" class="desk-cam black" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }" @click="pick(i)"><b>{{ i.short || 'BLK' }}</b><span>Czerń</span></button>
          <div class="desk-trans">
            <button class="desk-cut" title="Natychmiastowe przełączenie podglądu na wizję" @click="run('cut')">CUT</button>
            <button class="desk-auto" title="Płynne przejście podglądu na wizję" @click="run('auto')">AUTO</button>
          </div>
        </div>
        <p class="note desk-status">
          Transmisja w ATEM: <b :class="{ live: atem.streaming === 'streaming' }">{{ STREAM_LABEL[atem.streaming] || '—' }}</b>
          <template v-if="atem.recording"> · nagrywanie: <b :class="{ live: atem.recording === 'recording' }">{{ atem.recording === 'recording' ? 'NAGRYWA' : atem.recording === 'stopping' ? 'kończy…' : 'nie' }}</b></template>
        </p>
      </template>
    </div>

    <!-- YouTube -->
    <div class="desk-box">
      <div class="desk-head">
        <h2>YouTube</h2>
        <small v-if="yt.loggedIn" class="muted">{{ yt.channel }}</small>
        <span v-if="yt.loggedIn && signal.text" class="desk-badge" :class="signal.cls">{{ signal.text }}</span>
        <span class="spacer"></span>
        <button v-if="yt.loggedIn" class="small" :disabled="ytBusy" title="Odśwież" @click="loadYt"><Icon name="refresh" /></button>
        <button v-if="yt.loggedIn" class="small" :disabled="ytBusy" @click="ytLogout">Odłącz</button>
      </div>
      <p v-if="ytError" class="note bad">{{ ytError }}</p>
      <template v-if="!yt.loggedIn">
        <p class="note">Połącz aplikację z kanałem kościoła — w przeglądarce wybierz konto (albo konto marki) kanału. Potem transmisję na niedzielę tworzy się jednym przyciskiem, z tytułem i opisem z nabożeństwa.</p>
        <button class="primary desk-yt-login" :disabled="ytBusy" @click="ytLogin"><Icon name="play" />{{ ytBusy ? 'Czekam na logowanie w przeglądarce…' : 'Połącz z YouTube' }}</button>
      </template>
      <template v-else>
        <div v-if="yt.stream" class="desk-key">
          <span><small class="muted">Serwer</small><code>{{ yt.stream.url }}</code></span>
          <button class="small" @click="copy('url', yt.stream.url)"><Icon :name="copied === 'url' ? 'check' : 'copy'" /></button>
          <span><small class="muted">Stały klucz (ten sam co tydzień)</small><code>{{ showKey ? yt.stream.key : '••••-••••-••••-••••' }}</code></span>
          <button class="small" :title="showKey ? 'Ukryj klucz' : 'Pokaż klucz'" @click="showKey = !showKey"><Icon :name="showKey ? 'eyeoff' : 'search'" /></button>
          <button class="small" @click="copy('key', yt.stream.key)"><Icon :name="copied === 'key' ? 'check' : 'copy'" />{{ copied === 'key' ? 'Skopiowano' : 'Kopiuj klucz' }}</button>
        </div>
        <div v-if="yt.stream && atem.connected" class="btnrow">
          <button class="small" title="Ustawia w ATEM serwer i klucz YouTube (transmisja prosto z miksera, bez OBS)" @click="sendKeyToAtem">Wyślij klucz do ATEM</button>
          <button v-if="atem.streaming !== 'streaming'" class="small" @click="run('streaming', true)">Start transmisji z ATEM</button>
          <button v-else class="small danger" @click="stopAtemStream">Stop transmisji z ATEM</button>
        </div>
        <p class="note">Klucz wklej raz w OBS (Ustawienia → Transmisja → YouTube → klucz) albo wyślij do ATEM. Transmisja sama startuje, gdy przyjdzie obraz, i sama się kończy po zatrzymaniu.</p>

        <div class="desk-list">
          <div v-for="b in yt.broadcasts" :key="b.id" class="desk-bc" :class="{ live: b.status === 'live' }">
            <span class="desk-bc-text">
              <b>{{ b.title }}</b>
              <small>{{ b.start ? new Date(b.start).toLocaleString('pl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }} · {{ PRIVACY[b.privacy] || b.privacy }} · <em>{{ B_STATUS[b.status] || b.status }}</em></small>
            </span>
            <button class="small" title="Kopiuj link do transmisji" @click="copy(b.id, b.url)"><Icon :name="copied === b.id ? 'check' : 'link'" /></button>
            <button v-if="service && b === forService && b.status !== 'live'" class="small" :disabled="ytBusy" title="Ustaw tytuł i opis z wybranego nabożeństwa" @click="refreshFromService(b)">Z nabożeństwa</button>
            <button v-if="['live', 'testing', 'liveStarting'].includes(b.status)" class="small danger" :disabled="ytBusy" @click="endBroadcast(b)">Zakończ</button>
          </div>
          <p v-if="!(yt.broadcasts || []).length" class="note">Nie ma zaplanowanych transmisji.</p>
        </div>
        <div v-if="service && !forService" class="desk-new">
          <span><b>{{ ytTitle(service) }}</b><small class="muted">{{ prettyDate(service.date) }}, {{ serviceTime(service) }}</small></span>
          <select v-model="privacy" aria-label="Widoczność transmisji"><option value="public">Publiczna</option><option value="unlisted">Niepubliczna</option><option value="private">Prywatna</option></select>
          <button class="primary small" :disabled="ytBusy" @click="createForService"><Icon name="plus" />Utwórz transmisję</button>
        </div>
      </template>
    </div>
  </div>
</template>

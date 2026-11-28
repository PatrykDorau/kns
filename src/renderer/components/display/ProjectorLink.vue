<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { api, settings } from '@/stores'

// Połączenie z rzutnikiem Epson (np. EB-770F) przez iProjection: sprawdzenie sieci krok po kroku i połączenie ręczne
// po adresie IP — omija wyszukiwanie rzutnika w sieci, które najczęściej zawodzi (router blokuje rozgłaszanie).
type Res = { error?: string, ip?: string, wifi?: { ssid: string, signal: number | null }, addresses?: { name: string, ip: string, mask: string }[], sameSubnet?: boolean, ping?: { ok: boolean, ms: number | null }, ports?: { epson: boolean, escvp: boolean, pjlink: boolean, web: boolean }, power?: string }
const ip = ref(settings.projectorIp || '')
const res = ref<Res | null>(null), busy = ref(false), opened = ref('')
async function check() {
  busy.value = true; opened.value = ''
  settings.projectorIp = ip.value.trim()
  res.value = await api.projCheck?.(ip.value.trim()).catch(e => ({ error: e.message }))
  busy.value = false
}
async function openIp() {
  settings.projectorIp = ip.value.trim()
  const r = await api.projIProjection?.(ip.value.trim())
  opened.value = r?.error ? r.error + (r.copied ? ' Adres jest w schowku.' : '') : 'Adres ' + ip.value.trim() + ' jest w schowku. W iProjection: tryb zaawansowany → „Wyszukiwanie ręczne” → Ctrl+V → OK.'
}
// wynik: co jest nie tak i co zrobić (od najważniejszego)
const verdict = computed(() => {
  const r = res.value
  if (!r) return null
  if (r.error) return { cls: 'bad', head: 'Brak adresu', text: r.error }
  const me = r.addresses?.map(a => a.ip).join(', ') || 'brak'
  if (!r.addresses?.length) return { cls: 'bad', head: 'Laptop nie jest w żadnej sieci', text: 'Połącz laptop z Wi-Fi (tą samą siecią co rzutnik) albo kablem.' }
  if (!r.sameSubnet) return { cls: 'bad', head: 'Laptop i rzutnik są w różnych sieciach', text: 'Laptop: ' + (r.wifi?.ssid ? 'Wi-Fi „' + r.wifi.ssid + '”, ' : '') + 'adres ' + me + '; rzutnik: ' + r.ip + '. Połącz laptop z tą samą siecią co rzutnik (jej nazwa jest na ekranie rzutnika) — nie z siecią dla gości. Albo sprawdź, czy adres rzutnika jest aktualny.' }
  if (r.ports?.epson) return { cls: 'ok', head: 'Rzutnik gotowy do połączenia', text: 'Kliknij „Połącz w iProjection”. W programie wybierz tryb zaawansowany → „Wyszukiwanie ręczne”, wklej adres (Ctrl+V) i OK.' + (r.power === 'wyłączony' ? ' Uwaga: rzutnik zgłasza, że jest wyłączony — włącz go pilotem.' : '') }
  if (r.ping?.ok || r.ports?.escvp || r.ports?.pjlink || r.ports?.web) return { cls: 'warn', head: 'Rzutnik odpowiada, ale projekcja przez sieć nie', text: 'Rzutnik jest w sieci, ale usługa iProjection nie odpowiada. Na rzutniku włącz źródło LAN (pilot: przycisk LAN albo Źródło → LAN) i sprawdź w menu Sieć, że projekcja sieciowa jest włączona. W trybie oszczędnym rzutnik po wyłączeniu nie przyjmuje połączeń — włącz go.' }
  return { cls: 'bad', head: 'Rzutnik nie odpowiada', text: 'Laptop jest w tej samej sieci, ale rzutnik milczy. Sprawdź, czy rzutnik jest włączony i pokazuje ekran sieci (źródło LAN). Jeśli tak — router blokuje połączenia między urządzeniami (tzw. izolacja klientów / AP isolation, częsta w sieciach dla gości): wyłącz ją w routerze albo połącz rzutnik i laptop kablem sieciowym.' }
})
const yes = (b?: boolean) => (b ? 'tak' : 'nie')
</script>

<template>
  <h4>Połączenie z rzutnikiem</h4>
  <p class="st-help">Gdy iProjection nie znajduje rzutnika, połącz się ręcznie po adresie IP — omija to wyszukiwanie, które najczęściej zawodzi. Adres widać na ekranie rzutnika, gdy nie ma obrazu (ekran sieci), albo w menu rzutnika: Sieć.</p>
  <div class="st-card">
    <div class="st-stack">
      <label class="st-lbl" for="proj-ip">Adres IP rzutnika</label>
      <div class="pl-row">
        <input id="proj-ip" v-model="ip" inputmode="decimal" placeholder="np. 192.168.1.50" @keydown.enter="check">
        <button class="small" :disabled="busy" @click="check"><Icon name="refresh" />{{ busy ? 'Sprawdzam…' : 'Sprawdź połączenie' }}</button>
        <button class="primary small" :disabled="!ip.trim()" title="Kopiuje adres do schowka i otwiera Epson iProjection" @click="openIp"><Icon name="monitor" />Połącz w iProjection</button>
      </div>
      <p v-if="opened" class="st-hint">{{ opened }}</p>
    </div>
    <div v-if="verdict" class="pl-verdict" :class="verdict.cls" role="status">
      <b>{{ verdict.head }}</b>
      <p>{{ verdict.text }}</p>
    </div>
    <ul v-if="res && !res.error" class="pl-facts">
      <li><span>Wi-Fi laptopa</span><b>{{ res.wifi?.ssid ? res.wifi.ssid + (res.wifi.signal != null ? ' · sygnał ' + res.wifi.signal + '%' : '') : 'brak (kabel albo brak sieci)' }}</b></li>
      <li><span>Adres laptopa</span><b>{{ res.addresses?.map(a => a.ip).join(', ') || '—' }}</b></li>
      <li><span>Ta sama sieć co rzutnik</span><b :class="res.sameSubnet ? 'ok' : 'bad'">{{ yes(res.sameSubnet) }}</b></li>
      <li><span>Rzutnik odpowiada (ping)</span><b :class="res.ping?.ok ? 'ok' : 'bad'">{{ res.ping?.ok ? 'tak' + (res.ping.ms != null ? ' · ' + res.ping.ms + ' ms' : '') : 'nie' }}</b></li>
      <li><span>Projekcja Epson (iProjection)</span><b :class="res.ports?.epson ? 'ok' : 'bad'">{{ yes(res.ports?.epson) }}</b></li>
      <li v-if="res.power"><span>Zasilanie (PJLink)</span><b>{{ res.power === 'hasło' ? 'wymaga hasła PJLink' : res.power }}</b></li>
    </ul>
  </div>
  <div class="st-card pl-tips">
    <b>Żeby łączyło się za każdym razem</b>
    <ul>
      <li><b>Stały adres rzutnika</b> — w routerze zarezerwuj adres dla rzutnika (rezerwacja DHCP) albo w menu rzutnika (Sieć → ustawienia sieci) wpisz adres ręcznie. Wtedy połączenie ręczne zawsze trafia.</li>
      <li><b>„Rzutnik jest używany przez inne urządzenie”</b> — podłączony jest jeszcze inny komputer albo telefon. Rozłącz go w jego iProjection albo wyłącz i włącz rzutnik.</li>
      <li><b>Najpewniej</b> — kabel HDMI. Prawie tak samo pewnie: kabel sieciowy od laptopa do gniazda LAN rzutnika (bez Wi-Fi), połączenie ręczne po adresie.</li>
    </ul>
  </div>
</template>

<style scoped>
.pl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.pl-row input { flex: 1 1 160px; min-width: 0; }
.pl-verdict { display: block; margin: 10px 0 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
.pl-verdict b { display: block; }
.pl-verdict p { margin: 4px 0 0; line-height: 1.45; }
.pl-verdict.ok { border-color: #2fbf71; background: color-mix(in srgb, #2fbf71 10%, transparent); }
.pl-verdict.warn { border-color: #e5a93b; background: color-mix(in srgb, #e5a93b 10%, transparent); }
.pl-verdict.bad { border-color: #e5484d; background: color-mix(in srgb, #e5484d 10%, transparent); }
.pl-facts { display: grid; gap: 4px; margin: 8px 0 2px; padding: 0; list-style: none; font-size: 13px; }
.pl-facts li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.pl-facts li span { color: var(--muted); }
.pl-facts .ok { color: #3ccf73; }
.pl-facts .bad { color: #ff6b6f; }
.pl-tips ul { display: grid; gap: 6px; margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.45; }
</style>

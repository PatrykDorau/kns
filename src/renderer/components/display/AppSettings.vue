<script setup lang="ts">
import { ask } from '@/utils/ask'
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { api, flush, output, overlayUrl, remoteUrl, settings, uid } from '@/stores'
import { share } from '@/services/screenShare'
import { focusOnce } from '@/utils/dom'

const emit = defineEmits(['close'])
const message = ref('')
// zakładki ustawień
const TABS = [['stream', 'link', 'Dla streamu'], ['display', 'monitor', 'Obraz i pliki'], ['remote', 'gear', 'Pilot w telefonie'], ['backup', 'folder', 'Kopia biblioteki']]
const tab = ref('stream')
// Adres napisów z wybraną pozycją i rozmiarem (parametry czyta sama strona).
const lyricsQuery = () => {
  const q = new URLSearchParams()
  if (settings.lyricsPos && settings.lyricsPos !== 'dol') q.set('pozycja', settings.lyricsPos)
  if (settings.lyricsSize && settings.lyricsSize !== 6) q.set('rozmiar', String(settings.lyricsSize))
  if (settings.lyricsBar) q.set('pasek', '1')
  return q
}
// Przez internet: strona na kns-nabo z kluczem tego komputera (OBS na laptopie od streamu, w dowolnej sieci).
const onlineLink = computed(() => {
  const q = lyricsQuery()
  q.set('k', settings.lyricsKey)
  return 'https://kns-nabo.netlify.app/napisy?' + q
})
async function newLyricsKey() {
  if ((await ask('Nowy klucz — stary adres w OBS przestanie działać i trzeba będzie wkleić nowy. Kontynuować?'))) settings.lyricsKey = uid() + uid() + uid()
}
const lyricsLink = computed(() => {
  if (!overlayUrl.value) return ''
  const q = new URLSearchParams()
  if (settings.lyricsPos && settings.lyricsPos !== 'dol') q.set('pozycja', settings.lyricsPos)
  if (settings.lyricsSize && settings.lyricsSize !== 6) q.set('rozmiar', String(settings.lyricsSize))
  if (settings.lyricsBar) q.set('pasek', '1')
  return overlayUrl.value + (q.toString() ? '?' + q : '')
})
const copied = ref<string | false>(false)
async function copyLyrics(text) { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = false }, 1500) }

async function exportBackup() {
  await flush()
  const res = await api.exportBackup()
  if (res.dir) message.value = 'Kopia zapisana w: ' + res.dir
}
async function importBackup() {
  await flush()
  const res = await api.importBackup()
  if (res.error) message.value = res.error
  // Dane na dysku zostały podmienione — wczytujemy aplikację od nowa.
  else if (res.ok) location.reload()
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal st-modal" role="dialog" aria-modal="true" aria-label="Ustawienia aplikacji">
      <div class="modal-head">
        <h3>Ustawienia aplikacji</h3>
        <button class="iconbtn" aria-label="Zamknij" :ref="focusOnce" @click="emit('close')"><Icon name="x" /></button>
      </div>
      <div class="st-body">
        <nav class="st-nav" aria-label="Części ustawień">
          <button v-for="[id, ic, name] in TABS" :key="id" :class="{ on: tab === id }" :aria-current="tab === id ? 'page' : null" @click="tab = id"><Icon :name="ic" />{{ name }}</button>
        </nav>

        <div class="st-pane">
          <!-- Dla streamu: obraz rzutnika i napisy na laptop ze streamem / OBS -->
          <template v-if="tab === 'stream'">
            <h4>Dla streamu</h4>
            <p class="st-help">Laptop ze streamem dostaje stąd obraz rzutnika i napisy pieśni — przez internet, w dowolnej sieci. W Stream ten komputer pojawi się na liście sam.</p>
            <div class="st-card">
              <div class="st-row">
                <span class="st-txt"><b>Materiały dla Streamu (zalecane)</b><small>Stream pokazuje to samo co rzutnik — zdjęcia, filmy, prezentacje, teksty i pieśni — z własnej kopii, w pełnej jakości. Pliki idą w tle przez Dysk Google, potem przez internet tylko „co pokazać”. Lżejsze i pewniejsze niż obraz ekranu; film na Streamie bez dźwięku (dźwięk z konsoli).</small></span>
                <input v-model="settings.mirrorStream" class="sw" type="checkbox" aria-label="Materiały dla Streamu">
              </div>
              <div class="st-row">
                <span class="st-txt"><b>Obraz rzutnika</b><small>Cały ekran rzutnika (PowerPoint, strona, wszystko) — tylko na to, czego nie ma w materiałach. Bez dźwięku. W Stream: scena „Rzutnik”.</small></span>
                <input v-model="settings.screenShare" class="sw" type="checkbox" aria-label="Udostępniaj obraz rzutnika">
              </div>
              <div v-if="settings.screenShare" class="st-row sub">
                <span :class="['st-pill', share.error ? 'bad' : share.viewers ? 'ok' : 'wait']">{{ share.error || (!output.open ? 'Obraz ruszy po „Rozpocznij wyświetlanie”' : share.viewers ? 'Stream odbiera obraz' + (share.viewers > 1 ? ' (' + share.viewers + ')' : '') : 'Czekam na laptop ze streamem') }}</span>
              </div>
              <div class="st-row">
                <span class="st-txt"><b>Napisy pieśni</b><small>Bieżąca zwrotka — na transmisję w Stream albo do OBS (adres poniżej).</small></span>
                <input v-model="settings.lyricsOnline" class="sw" type="checkbox" aria-label="Napisy przez internet">
              </div>
              <div v-if="settings.lyricsOnline || settings.screenShare || settings.mirrorStream" class="st-stack">
                <span class="st-lbl">Adres tego rzutnika (dla OBS albo do wklejenia ręcznie)</span>
                <div class="st-copy"><input :value="onlineLink" readonly aria-label="Adres napisów" @focus="($event.target as HTMLInputElement).select()"><button class="small" @click="copyLyrics(onlineLink)"><Icon :name="copied === onlineLink ? 'check' : 'copy'" />{{ copied === onlineLink ? 'Skopiowano' : 'Kopiuj' }}</button><button class="small" title="Nowy adres — stary przestanie działać (Stream przejdzie na nowy sam)" @click="newLyricsKey">Nowy klucz</button></div>
                <span class="st-hint">Kto zna adres, widzi napisy (a z udostępnianiem — także obraz rzutnika). Nie publikuj go.</span>
              </div>
            </div>

            <div class="st-card">
              <div class="st-card-h"><span class="ic"><Icon name="monitor" /></span><span><b>Napisy w OBS</b><small>Przezroczyste tło z cieniem — źródło „Przeglądarka” nad kamerą.</small></span></div>
              <div class="st-row">
                <span class="st-txt"><b>Bez internetu</b><small>OBS na tym komputerze albo w tej samej sieci Wi-Fi.</small></span>
                <input v-model="settings.lyrics" class="sw" type="checkbox" aria-label="Napisy w tej samej sieci">
              </div>
              <div v-if="settings.lyrics && overlayUrl" class="st-stack">
                <div class="st-copy"><input :value="lyricsLink" readonly aria-label="Adres napisów w sieci lokalnej" @focus="($event.target as HTMLInputElement).select()"><button class="small" @click="copyLyrics(lyricsLink)"><Icon :name="copied === lyricsLink ? 'check' : 'copy'" />{{ copied === lyricsLink ? 'Skopiowano' : 'Kopiuj' }}</button></div>
              </div>
              <template v-if="settings.lyricsOnline || (settings.lyrics && overlayUrl)">
                <div class="st-grid2">
                  <label>Pozycja<select v-model="settings.lyricsPos"><option value="dol">na dole</option><option value="srodek">na środku</option><option value="gora">na górze</option></select></label>
                  <label>Rozmiar<select v-model.number="settings.lyricsSize"><option :value="4">mały</option><option :value="6">średni</option><option :value="8">duży</option></select></label>
                </div>
                <div class="st-row">
                  <span class="st-txt"><b>Ciemny pasek pod tekstem</b><small>Lepiej czytelne na jasnym obrazie.</small></span>
                  <input v-model="settings.lyricsBar" class="sw" type="checkbox" aria-label="Ciemny pasek pod tekstem">
                </div>
              </template>
              <details class="st-help">
                <summary>Jak dodać w OBS</summary>
                <ol><li>Źródła → + → „Przeglądarka”.</li><li>Wklej adres, szerokość 1920, wysokość 1080.</li><li>Ustaw to źródło nad kamerą. „Ukryj” w Rzutniku chowa też napisy.</li><li>Po zmianie pozycji lub rozmiaru wklej adres ponownie.</li></ol>
              </details>
            </div>
            <!-- napisy w częściach: rzutnik — cała zwrotka, stream — po kilka linijek -->
            <div class="st-card">
              <div class="st-card-h"><span class="ic"><Icon name="text" /></span><span><b>Napisy na streamie w częściach</b><small>Rzutnik pokazuje całą zwrotkę, a na streamie (i w OBS) napisy idą po kilka linijek — np. 5 linijek jako 3 + 2.</small></span></div>
              <div class="st-grid2">
                <label>Najwyżej linijek naraz<select v-model.number="settings.streamLines"><option :value="0">cała zwrotka</option><option :value="2">2</option><option :value="3">3</option><option :value="4">4</option></select></label>
                <label>Następna część<select v-model="settings.streamPartMode" :disabled="!settings.streamLines"><option value="keys">strzałką (rzutnik stoi)</option><option value="auto">sama, po czasie</option></select></label>
              </div>
              <div v-if="settings.streamLines && settings.streamPartMode === 'auto'" class="st-stack">
                <label>Czas na linijkę<select v-model.number="settings.streamLineSec"><option v-for="s in [3, 4, 5, 6, 8]" :key="s" :value="s">{{ s }} s</option></select></label>
              </div>
              <p v-if="settings.streamLines" class="st-hint" style="padding:0 14px 12px">{{ settings.streamPartMode === 'auto' ? 'Druga część pojawia się sama po czasie zależnym od liczby linijek pierwszej; strzałka jak zwykle przechodzi do następnej zwrotki.' : 'Strzałka w dół najpierw zmienia tylko napisy na streamie (rzutnik zostaje na całej zwrotce), kolejna — przechodzi do następnej zwrotki.' }}</p>
            </div>
          </template>

          <!-- Obraz: przejścia i pliki -->
          <template v-else-if="tab === 'display'">
            <h4>Obraz i pliki</h4>
            <p class="st-help">Jak rzutnik zmienia obraz i gdzie trzyma pliki z Biblioteki.</p>
            <div class="st-card">
              <div class="st-row">
                <span class="st-txt"><b>Płynne przenikanie</b><small>Przy zmianie obrazu. Pętle mają własne ustawienie przejścia.</small></span>
                <input class="sw" type="checkbox" :checked="settings.fadeMs > 0" aria-label="Płynne przenikanie" @change="settings.fadeMs = ($event.target as HTMLInputElement).checked ? 350 : 0">
              </div>
              <div v-if="settings.fadeMs > 0" class="st-stack">
                <label for="gFade">Czas przejścia: {{ (settings.fadeMs / 1000).toLocaleString('pl') }} s</label>
                <input id="gFade" v-model.number="settings.fadeMs" type="range" min="100" max="3000" step="50">
              </div>
              <div class="st-row">
                <span class="st-txt"><b>Kopiuj pliki do aplikacji</b><small>Pliki w Bibliotece nie znikną po wyjęciu pendrive’a. Dotyczy plików dodawanych od teraz.</small></span>
                <input v-model="settings.copyFiles" class="sw" type="checkbox" aria-label="Kopiuj dodawane pliki">
              </div>
            </div>
          </template>

          <!-- Pilot w telefonie -->
          <template v-else-if="tab === 'remote'">
            <h4>Pilot w telefonie</h4>
            <p class="st-help">Przyciski „Dalej”, „Wstecz” i „Ukryj” na telefonie — w tej samej sieci Wi-Fi.</p>
            <div class="st-card">
              <div class="st-row">
                <span class="st-txt"><b>Sterowanie z telefonu</b><small>Każdy, kto zna adres, może sterować obrazem.</small></span>
                <input v-model="settings.remote" class="sw" type="checkbox" aria-label="Sterowanie z telefonu">
              </div>
              <div v-if="remoteUrl" class="st-stack">
                <span class="st-lbl">Otwórz w telefonie</span>
                <div class="st-copy"><input :value="remoteUrl" readonly aria-label="Adres pilota" @focus="($event.target as HTMLInputElement).select()"><button class="small" @click="copyLyrics(remoteUrl)"><Icon :name="copied === remoteUrl ? 'check' : 'copy'" />{{ copied === remoteUrl ? 'Skopiowano' : 'Kopiuj' }}</button></div>
              </div>
            </div>
          </template>

          <!-- Kopia biblioteki -->
          <template v-else>
            <h4>Kopia biblioteki</h4>
            <p class="st-help">Folder z Biblioteką, pieśniami i ustawieniami — do przeniesienia na inny komputer.</p>
            <div class="st-card">
              <div class="st-row"><span class="st-txt"><b>Zapisz kopię</b><small>Wybierz folder (np. pendrive).</small></span><button @click="exportBackup"><Icon name="folder" />Zapisz…</button></div>
              <div class="st-row"><span class="st-txt"><b>Wczytaj kopię</b><small>Zastępuje bibliotekę na tym komputerze.</small></span><button @click="importBackup"><Icon name="import" />Wczytaj…</button></div>
            </div>
            <p v-if="message" class="st-pill ok">{{ message }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

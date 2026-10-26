<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import TextStyle from '@/components/display/TextStyle.vue'
import ColorAlpha from '@/components/common/ColorAlpha.vue'
import qrcode from 'qrcode-generator'
import { openPilot, pilot } from '@/services/preacherPilot'
import {
  lyricsParts, songIndex, streamPart,
  COUNTDOWN, liveId, nextServiceStart, sendText, KIND, entrySlide, frozenAt, itemById, items, label, pickFiles, removeEntry, selected, selectedIndex, selectedStep, setLoopStep, setVerse, settings, textPopup, uid, verseKey, verses,
} from '@/stores'

const startLabel = computed(() => new Date(nextServiceStart.value).toLocaleString('pl', { weekday: 'long', hour: '2-digit', minute: '2-digit' }))
// „Za N minut” liczy się od kliknięcia; wyświetlany tekst od razu dostaje nowy czas.
function startCountdown() {
  selected.value.target = Date.now() + Math.max(1, +selected.value.minutes || 5) * 60000
  if (selected.value.id === liveId.value) sendText()
}
// pilot kaznodziei: kod QR z kluczem tej sesji (przy prezentacji)
const pilotOpen = ref(false)
const pilotQr = computed(() => { if (!pilot.url) return ''; const q = qrcode(0, 'M'); q.addData(pilot.url); q.make(); return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) })
const phoneOn = computed(() => pilot.phones && Date.now() - pilot.seen < 120000)
function showPilot() { openPilot(); pilotOpen.value = !pilotOpen.value }
// adres pilota do wysłania (np. komunikatorem), gdy kaznodzieja nie skanuje kodu
const pilotCopied = ref(false)
function copyPilot() { navigator.clipboard.writeText(pilot.url).then(() => { pilotCopied.value = true; setTimeout(() => { pilotCopied.value = false }, 2000) }).catch(() => {}) }
const loopCandidates = computed(() => items.value.filter(i => i.type !== 'scene' && !i.hidden && !i.lib))
const secondsLabel = ms => (ms / 1000).toLocaleString('pl', { maximumFractionDigits: 2 }) + ' s'

function addToLoop(e: Event) {
  const pick = e.target as HTMLSelectElement
  if (pick.value) selected.value.entries.push({ key: uid(), ref: pick.value, seconds: null })
  pick.value = ''
}
function moveEntry(from, to) {
  const list = selected.value.entries
  list.splice(to, 0, ...list.splice(from, 1))
}
// Strona internetowa: adres (bez „https://” dopisuje się sam), przewijanie ekranami.
function setUrl(e: Event) {
  let u = (e.target as HTMLInputElement).value.trim()
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u
  if (u === selected.value.url) return
  selected.value.url = u; selected.value.scroll = 0; selected.value.webMax = undefined
  if (!selected.value.name) try { selected.value.name = new URL(u).hostname.replace(/^www\./, '') } catch { /* zły adres */ }
}
function scrollWeb(d: number) {
  const it = selected.value, max = it.webMax ?? Infinity
  it.scroll = Math.max(0, Math.min(max, (it.scroll || 0) + d))
}
// Układanie slajdów przeciąganiem.
const dragFrom = ref(null)
const dragTo = ref(null)
function dropEntry(i) {
  if (dragFrom.value != null && dragFrom.value !== i) moveEntry(dragFrom.value, i)
  dragFrom.value = dragTo.value = null
}
</script>

<template>
  <div v-if="!selected" class="empty">Wybierz element z listy.</div>

  <!-- tekst -->
  <template v-else-if="selected.type === 'text'">
    <div class="labelrow">
      <label for="tText">Treść</label>
      <button class="small" title="Otwórz tekst w dużym oknie" @click="textPopup = selected"><Icon name="expand" />Powiększ</button>
    </div>
    <textarea id="tText" v-model="selected.text" placeholder="Wpisz tekst…"></textarea>
    <div v-if="selected.text.includes(COUNTDOWN)" class="cd-box">
      <label for="cdMode">Odliczanie do</label>
      <select id="cdMode" v-model="selected.countMode">
        <option value="service">najbliższego nabożeństwa{{ nextServiceStart ? ' (' + startLabel + ')' : '' }}</option>
        <option value="minutes">za podaną liczbę minut</option>
      </select>
      <div v-if="selected.countMode === 'minutes'" class="row2">
        <div><label for="cdMin">Minut</label><input id="cdMin" v-model.number="selected.minutes" type="number" min="1" max="600"></div>
        <div><label>&nbsp;</label><button class="wide" @click="startCountdown"><Icon name="play" />{{ selected.target ? 'Od nowa' : 'Start' }}</button></div>
      </div>
      <p v-if="selected.countMode === 'service' && !nextServiceStart" class="note bad">Nie ma zaplanowanego nabożeństwa — odliczanie pokaże kreski.</p>
      <label for="cdEnd">Tekst po zakończeniu</label>
      <input id="cdEnd" v-model="selected.endText" type="text" placeholder="np. Zaraz zaczynamy!">
    </div>
    <p v-else class="note">Wpisz <b>{{ COUNTDOWN }}</b> w treść, żeby pokazać odliczanie czasu.</p>
    <TextStyle :model="selected" />
  </template>

  <!-- pieśń -->
  <template v-else-if="selected.type === 'song'">
    <div class="row-num">
      <div><label for="sNum">Numer</label><input id="sNum" v-model="selected.number" type="text" inputmode="numeric"></div>
      <div><label for="sTitle">Tytuł</label><input id="sTitle" v-model="selected.title" type="text"></div>
    </div>
    <label>Slajdy — kliknij, aby pokazać</label>
    <ol class="verses">
      <li v-for="(v, i) in verses(selected)" :key="i">
        <button :class="{ current: i === selectedIndex, ice: frozenAt?.id === selected.id && frozenAt.index === i }" @click="setVerse(i)">
          <span class="vnum" :class="{ key: verseKey(selected, i) !== String(i + 1) }">{{ verseKey(selected, i) }}</span>{{ v }}<em v-if="selected.id === liveId && i === songIndex && lyricsParts.length > 1" class="vpart" title="Ta część zwrotki jest teraz w napisach na streamie">stream {{ streamPart + 1 }}/{{ lyricsParts.length }}</em>
          <span v-if="frozenAt?.id === selected.id && frozenAt.index === i" class="badge ice" title="Ten slajd widać teraz na zamrożonym rzutniku"><Icon name="freeze" />NA RZUTNIKU</span>
        </button>
      </li>
    </ol>
    <div class="labelrow">
      <label for="sText">Tekst (pusta linia = nowy slajd, [2] na początku = skrót)</label>
      <button class="small" title="Otwórz tekst w dużym oknie" @click="textPopup = selected"><Icon name="expand" />Powiększ</button>
    </div>
    <textarea id="sText" v-model="selected.text" placeholder="Pierwsza zwrotka…&#10;&#10;Refren…"></textarea>
    <details>
      <summary>Wygląd wszystkich pieśni</summary>
      <TextStyle :model="settings.songStyle" />
    </details>
  </template>

  <!-- pętla -->
  <template v-else-if="selected.type === 'scene'">
    <button class="primary wide" @click="pickFiles(selected)"><Icon name="plus" />Dodaj slajdy</button>
    <!-- prezentacja: pilot w telefonie kaznodziei (kod QR) -->
    <div v-if="selected.auto === false" class="pilot-box">
      <button class="wide" @click="showPilot"><Icon name="qr" />{{ pilotOpen ? 'Schowaj kod pilota' : 'Pilot dla kaznodziei (kod QR)' }}</button>
      <template v-if="pilotOpen">
        <div class="pilot-qr" v-html="pilotQr"></div>
        <div class="pilot-url"><input :value="pilot.url" readonly aria-label="Adres pilota" @focus="($event.target as HTMLInputElement).select()"><button class="small" @click="copyPilot">{{ pilotCopied ? 'Skopiowano' : 'Kopiuj' }}</button></div>
        <p class="note">Kaznodzieja skanuje kod telefonem i sam przełącza slajdy — także z innej sieci (wystarczy internet). Kod działa do zamknięcia aplikacji. Najpierw wyświetl prezentację na rzutniku.</p>
        <p class="note" :class="{ ok: phoneOn }">{{ phoneOn ? 'Telefon połączony.' : 'Telefon jeszcze się nie połączył.' }}</p>
      </template>
    </div>
    <div v-if="!selected.entries.length" class="empty">Wybierz kilka zdjęć, filmów, PDF lub prezentacji naraz albo przeciągnij je na okno.</div>
    <ol v-else class="members">
      <li v-for="(e, i) in selected.entries" :key="e.key" draggable="true" title="Kliknij, aby zobaczyć ten slajd"
          @click="entrySlide(selected, i) >= 0 && setLoopStep(entrySlide(selected, i))"
          :class="{ current: entrySlide(selected, i) === selectedStep, ice: frozenAt?.id === selected.id && entrySlide(selected, i) === frozenAt.step % (selected.entries.length || 1), dragging: dragFrom === i, over: dragTo === i && dragFrom !== null && dragFrom !== i }"
          @dragstart="dragFrom = i" @dragend="dragFrom = dragTo = null"
          @dragover.prevent="dragTo = i" @drop.prevent="dropEntry(i)">
        <Thumb :item="itemById(e.ref)" />
        <span class="name">{{ label(itemById(e.ref)) }}</span>
        <input v-if="itemById(e.ref)?.type !== 'video'" v-model.number="e.seconds" class="secs" type="number" @click.stop min="1" max="3600"
               :placeholder="selected.seconds == null ? undefined : String(selected.seconds)" title="Czas tego slajdu w sekundach (puste = domyślny)" aria-label="Czas slajdu w sekundach">
        <button class="iconbtn" :disabled="i === 0" title="Wyżej" aria-label="Przesuń wyżej" @click.stop="moveEntry(i, i - 1)"><Icon name="up" /></button>
        <button class="iconbtn" :disabled="i === selected.entries.length - 1" title="Niżej" aria-label="Przesuń niżej" @click.stop="moveEntry(i, i + 1)"><Icon name="down" /></button>
        <button class="iconbtn danger" title="Usuń z pętli" aria-label="Usuń z pętli" @click.stop="removeEntry(selected, i)"><Icon name="x" /></button>
      </li>
    </ol>

    <label for="lSec">Czas slajdu: {{ selected.seconds }} s</label>
    <input id="lSec" v-model.number="selected.seconds" type="range" min="1" max="60" step="1">
    <p class="note">Inny czas dla pojedynczego slajdu wpisz w polu przy nim. Filmy grają do końca.</p>

    <label class="check"><input type="checkbox" :checked="selected.auto !== false" @change="selected.auto = ($event.target as HTMLInputElement).checked"> Przełączaj slajdy automatycznie</label>
    <p class="note">Prezentacje importują się z wyłączonym automatem. Po wyłączeniu pętla czeka — slajdy zmieniasz strzałkami pod podglądem, klawiszami <kbd>↓</kbd> <kbd>↑</kbd> albo klikając slajd na liście.</p>

    <label for="lTrans">Przejście między slajdami</label>
    <select id="lTrans" v-model="selected.transition">
      <option value="fade">Przenikanie</option>
      <option value="none">Brak (ostre cięcie)</option>
    </select>
    <template v-if="selected.transition !== 'none'">
      <label for="lFade">Czas przejścia: {{ secondsLabel(selected.fadeMs) }}</label>
      <input id="lFade" v-model.number="selected.fadeMs" type="range" min="100" max="3000" step="50">
    </template>

    <label for="lVol">Głośność filmów: {{ Math.round(selected.volume * 100) }}%</label>
    <input id="lVol" v-model.number="selected.volume" type="range" min="0" max="1" step="0.05">

    <template v-if="loopCandidates.length">
      <label for="lAdd">Dodaj z Biblioteki</label>
      <select id="lAdd" @change="addToLoop">
        <option value="">Wybierz…</option>
        <option v-for="c in loopCandidates" :key="c.id" :value="c.id" :disabled="c.missing">{{ KIND[c.type] }}: {{ label(c) }}</option>
      </select>
    </template>
  </template>

  <!-- strona internetowa -->
  <template v-else-if="selected.type === 'web'">
    <label for="wUrl">Adres strony</label>
    <input id="wUrl" style="width:100%" :value="selected.url" type="text" inputmode="url" placeholder="np. https://www.biblia.info.pl" spellcheck="false" @change="setUrl($event)" @keydown.enter="setUrl($event)">
    <p class="note">Strona otwiera się w osobnym, zamkniętym oknie (bez dostępu do komputera). Na rzutniku i w podglądzie wygląda tak samo; przewija się przyciskami poniżej. Niektóre strony wymagają logowania albo pokazują zgodę na pliki cookie — wtedy lepiej zrzut ekranu.</p>
    <label>Przewijanie</label>
    <div class="row2 web-scroll">
      <button title="Na samą górę" @click="scrollWeb(-Infinity)">Na górę</button>
      <button title="Ekran w górę" @click="scrollWeb(-800)"><Icon name="up" />Wyżej</button>
      <button title="Ekran w dół" @click="scrollWeb(800)"><Icon name="down" />Niżej</button>
    </div>
    <input type="range" min="0" :max="Math.max(selected.webMax || 0, selected.scroll || 0)" step="10" :value="selected.scroll || 0" aria-label="Przewinięcie strony" @input="selected.scroll = +($event.target as HTMLInputElement).value">
    <label for="wZoom">Powiększenie</label>
    <select id="wZoom" v-model.number="selected.zoom">
      <option v-for="z in [0.75, 1, 1.25, 1.5, 1.75, 2]" :key="z" :value="z">{{ Math.round(z * 100) }}%</option>
    </select>
  </template>

  <!-- zdjęcie / film -->
  <template v-else>
    <label for="mFit">Dopasowanie</label>
    <select id="mFit" v-model="selected.fit">
      <option value="contain">Cały obraz (z pasami)</option>
      <option value="cover">Wypełnij ekran (przycina)</option>
    </select>
    <ColorAlpha v-if="selected.fit !== 'cover'" :model="selected" label="Tło obok obrazu (pasy)" empty="#000000ff" />
    <p v-if="selected.fit !== 'cover'" class="note">Czarny = rzutnik w tym miejscu nie świeci — na ścianie widać tylko obraz. Przezroczyste (0%) pokaże pulpit Windows z ekranu rzutnika.</p>
    <label v-if="selected.type === 'video'" class="check">
      <input v-model="selected.loop" type="checkbox"> Odtwarzaj w kółko
    </label>
  </template>
</template>

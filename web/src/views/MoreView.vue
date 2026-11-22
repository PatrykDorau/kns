<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent, reactive, watch } from 'vue'
import { useApp } from '@/composables/useApp'

// MoreView
const TAB_IDS = ['home', 'cal', 'serve'] // są w dolnym pasku
// rodzaj kanału po adresie — ikona i podpis
const KIND = url => (/whatsapp\.com|wa\.me/i.test(url) ? 'WhatsApp' : /facebook\.com|fb\.com|fb\.me/i.test(url) ? 'Facebook' : /instagram\.com/i.test(url) ? 'Instagram' : /youtube\.com|youtu\.be/i.test(url) ? 'YouTube' : /spotify\.com/i.test(url) ? 'Spotify' : 'Strona')
const ICON = { WhatsApp: 'mail', Facebook: 'users', Instagram: 'image', YouTube: 'play', Spotify: 'music', Strona: 'globe' }
export default defineComponent({
  setup() {
    const app = useApp()
    // Kanały KNS (grupy WhatsApp, Facebook, strona www) — tylko dla zalogowanych członków; zmienia zarządzający
    const ln = reactive({ list: [], edit: null, busy: false, error: '' })
    async function loadLinks() { try { ln.list = await app.api.call('linksLoad') } catch { ln.list = [] } }
    watch(() => app.ready.value && app.api.enabled, on => { if (on) loadLinks() }, { immediate: true })
    const openLink = l => window.open(l.url, '_blank', 'noopener')
    function editLinks() { ln.error = ''; ln.edit = ln.list.map(l => ({ ...l })); if (!ln.edit.length) ln.edit.push({ name: '', url: '', note: '' }) }
    const move = (i, d) => { const e = ln.edit, j = i + d; if (j < 0 || j >= e.length) return; [e[i], e[j]] = [e[j], e[i]] }
    async function saveLinks() {
      const items = ln.edit.filter(l => l.name.trim() || l.url.trim()).map(l => ({ ...l, url: l.url.trim() && !/^https?:\/\//i.test(l.url.trim()) ? 'https://' + l.url.trim() : l.url.trim().replace(/^http:/i, 'https:') }))
      ln.busy = true; ln.error = ''
      try { await app.api.call('linksSave', { items }); ln.edit = null; await loadLinks() } catch (e) { ln.error = e.message } finally { ln.busy = false }
    }
    return { ...app, TAB_IDS, ln, openLink, editLinks, move, saveLinks, KIND, ICON }
  },
})
</script>

<template>
  <!-- ja: imię jako duży nagłówek (Monolit), stuknięcie — mój profil -->
  <button v-if="api.enabled && me" class="mo-me" @click="openProfile"><span><b>{{ (me.name || me.email || '').split(' ')[0] }}</b><small>{{ [myRanks, me.grupa].filter(Boolean).join(' · ') || 'Uzupełnij profil' }}</small></span><span class="mo-me-go">Profil</span></button>
  <!-- kanały KNS: z aplikacji do grup WhatsApp, na Facebooka i stronę — tylko dla zalogowanych -->
  <template v-if="api.enabled && (ln.list.length || canManage)">
    <div class="more-sec ln-h"><h2 class="more-sec">Kanały KNS</h2><button v-if="canManage" class="ghost" @click="editLinks"><svg class="i"><use href="#pencil"/></svg>{{ ln.list.length ? 'Zmień' : 'Dodaj linki' }}</button></div>
    <nav v-if="ln.list.length" class="more-list ln-field" aria-label="Kanały KNS">
      <button v-for="l in ln.list" :key="l.id" @click="openLink(l)"><svg class="i"><use :href="'#' + ICON[KIND(l.url)]"/></svg><span>{{ l.name }}<small class="ln-note">{{ [KIND(l.url), l.note].filter(Boolean).join(' · ') }}</small></span><small></small><svg class="i chev"><use href="#link"/></svg></button>
    </nav>
    <p v-else class="note">Dodaj linki do grup WhatsApp (członkowie, kobiety…), Facebooka i strony KNS — członkowie dotrą do nich z aplikacji. Linki widzą tylko zalogowani.</p>
  </template>
  <!-- te same grupy i pozycje co w bocznym pasku na komputerze (bez tych z dolnego paska) -->
  <template v-for="grp in sideNav" :key="grp.title">
    <template v-if="grp.items.some(it => !TAB_IDS.includes(it.id))">
      <h2 v-if="grp.title" class="more-sec">{{ grp.title }}</h2>
      <nav class="more-list" :aria-label="grp.title || 'Więcej'">
        <button v-for="it in grp.items.filter(it => !TAB_IDS.includes(it.id))" :key="it.id" @click="navFromMore(it.id)"><svg class="i"><use :href="'#' + it.icon"/></svg><span>{{ it.name }}<small v-if="it.beta" class="beta-tag">beta</small></span><small v-if="it.badge" class="count-pill">{{ it.badge }}</small><small v-else></small><svg class="i chev"><use href="#chev"/></svg></button>
      </nav>
    </template>
  </template>
  <Teleport to="body">
    <div v-if="ln.edit" class="np-overlay" @click.self="ln.edit = null" @keydown.esc="ln.edit = null">
      <div class="np-panel ln-dlg" role="dialog" aria-modal="true" aria-label="Kanały KNS">
        <div class="ln-dh"><b>Kanały KNS</b><button class="icon" aria-label="Zamknij" @click="ln.edit = null"><svg class="i"><use href="#x"/></svg></button></div>
        <p class="note">Link do grupy WhatsApp skopiujesz w WhatsAppie: grupa → „Zaproś przez link”. Widzą je tylko zalogowani członkowie.</p>
        <div v-for="(l, i) in ln.edit" :key="i" class="ln-row">
          <input v-model="l.name" maxlength="60" placeholder="Nazwa, np. WhatsApp — kobiety" aria-label="Nazwa" autocomplete="off">
          <input v-model="l.url" maxlength="500" type="url" inputmode="url" placeholder="https://chat.whatsapp.com/…" aria-label="Link" autocomplete="off">
          <input v-model="l.note" maxlength="120" placeholder="Opis (opcjonalnie), np. ogłoszenia dla członków" aria-label="Opis" autocomplete="off">
          <div class="ln-ra">
            <button class="icon" aria-label="Wyżej" :disabled="i === 0" @click="move(i, -1)"><svg class="i"><use href="#up"/></svg></button>
            <button class="icon" aria-label="Niżej" :disabled="i === ln.edit.length - 1" @click="move(i, 1)"><svg class="i"><use href="#down"/></svg></button>
            <button class="icon" aria-label="Usuń link" @click="ln.edit.splice(i, 1)"><svg class="i"><use href="#trash"/></svg></button>
          </div>
        </div>
        <button v-if="ln.edit.length < 30" @click="ln.edit.push({ name: '', url: '', note: '' })"><svg class="i"><use href="#plus"/></svg>Dodaj link</button>
        <p v-if="ln.error" class="error">{{ ln.error }}</p>
        <div class="ln-df"><button @click="ln.edit = null">Anuluj</button><button class="primary" :disabled="ln.busy" @click="saveLinks">{{ ln.busy ? 'Zapisuję…' : 'Zapisz' }}</button></div>
      </div>
    </div>
  </Teleport>
  <h2 class="more-sec">Inne</h2>
  <nav class="more-list" aria-label="Inne">
    <button v-if="api.enabled && modOn('bugs') && (canManage || !(modules.navOff || []).includes('bugs'))" @click="reportBug"><svg class="i"><use href="#alert"/></svg><span>Zgłoś błąd albo pomysł</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
    <button class="theme-btn" @click="toggleTheme"><svg class="i"><use :href="theme === 'dark' ? '#sun' : '#moon'"/></svg><span>{{ theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny' }}</span><small></small><svg class="i chev"><use href="#chev"/></svg></button>
  </nav>
  <div v-if="desktop" class="getapp more-getapp">
    <img src="icon-192.png" alt="">
    <span class="ga-text"><b>Aplikacja na komputer — dla służby technicznej</b><small>{{ desktopApp.error || 'Rzutnik, stream i organizacja nabożeństw · Windows' + (desktopApp.version ? ' · wersja ' + desktopApp.version : '') + (desktopApp.size ? ' · ' + desktopApp.size + ', ' + desktopApp.installed : '') }}</small></span>
    <a v-if="desktopApp.url" class="button primary" :href="desktopApp.url"><svg class="i"><use href="#download"/></svg>Pobierz</a>
  </div>
  <div v-if="push.supported && !api.enabled" class="push-card" :class="{ on: push.on }">
    <div class="pc-head">
      <span class="pc-icon"><svg class="i"><use href="#bell"/></svg></span>
      <div class="pc-text">
        <b>{{ push.on ? 'Powiadomienia włączone' : 'Powiadomienia o brakach' }}</b>
        <p v-if="push.on">Dostaniesz powiadomienie, gdy na najbliższą niedzielę czegoś brakuje.</p>
        <p v-else-if="push.otherBrowser">Ta przeglądarka ({{ push.otherBrowser }}) nie obsługuje powiadomień. Otwórz stronę w <b>Chrome</b> i zainstaluj aplikację stamtąd (menu ⋮ → „Zainstaluj aplikację”).</p>
        <p v-else-if="push.needsInstall">Na iPhonie najpierw zainstaluj aplikację (przycisk „Pobierz” wyżej) i otwórz ją z ekranu głównego.</p>
        <p v-else-if="push.denied">Powiadomienia są zablokowane w ustawieniach telefonu dla tej strony — odblokuj je tam i spróbuj ponownie.</p>
        <p v-else>Przypomnienie, gdy na niedzielę czegoś brakuje. Dzień i godzinę wybierzesz po włączeniu.</p>
      </div>
    </div>
    <div v-if="push.on" class="pc-when">
      <span class="pc-label">Kiedy przypominać</span>
      <div class="pc-row">
        <UiSelect v-model="push.day" compact label="Dzień przypomnienia" :disabled="push.busy" :options="DAYS.map((name, i) => ({ value: i, label: name }))" @change="saveSchedule" />
        <span>o</span>
        <UiSelect v-model="push.hour" compact label="Godzina przypomnienia" :disabled="push.busy" :options="HOURS.map(h => ({ value: h, label: h + ':00' }))" @change="saveSchedule" />
      </div>
      <small v-if="push.saved" class="pc-saved">Zapisano ✓</small>
    </div>
    <p v-if="push.error" class="pc-error">{{ push.error }}</p>
    <p v-else-if="push.slow" class="pc-slow">{{ push.slow }}</p>
    <div v-if="push.on" class="pc-actions two">
      <button :disabled="push.busy" title="Wysyła powiadomienie na ten telefon, żeby zobaczyć, jak wygląda" @click="testPush">{{ push.busy ? 'Wysyłam…' : 'Wyślij próbne powiadomienie' }}</button>
      <button :disabled="push.busy" @click="disablePush">Wyłącz</button>
    </div>
    <div v-else-if="push.otherBrowser" class="pc-actions"><a class="button primary" :href="chromeLink">Otwórz w Chrome</a></div>
    <div v-else-if="!push.needsInstall" class="pc-actions"><button class="primary" :disabled="push.busy" @click="enablePush">{{ push.busy ? 'Włączam…' : 'Włącz powiadomienia' }}</button></div>
  </div>
  <button v-if="api.enabled && me" class="songsbtn" @click="openProfile"><svg class="i" :class="{ 'kh-warn': needsName }"><use :href="needsName ? '#warn' : '#user'"/></svg>Mój profil — {{ needsName ? 'uzupełnij imię i nazwisko' : me.name }}{{ me.grupa ? ' · ' + me.grupa : '' }}<svg class="i chev"><use href="#chev"/></svg></button>
  <button v-if="realManage || viewAs" class="songsbtn" @click="setViewAs(!viewAs)"><svg class="i"><use href="#eye"/></svg>{{ viewAs ? 'Wróć do widoku administratora' : 'Zobacz aplikację jako członek' }}<svg class="i chev"><use href="#chev"/></svg></button>
  <div class="account">
    <svg class="i"><use href="#user"/></svg><span>{{ me?.email || drive.account() || 'Zalogowano' }}<template v-if="myRanks"> · <span class="roles">{{ myRanks }}</span></template></span>
    <button v-if="!drive.demo" class="ghost" @click="logout"><svg class="i"><use href="#logout"/></svg>Wyloguj</button>
    <small class="acc-ver">wersja {{ version }}</small>
  </div>
</template>

<style scoped>
.ln-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; }
.ln-h h2 { margin: 0; }
.ln-h .ghost { min-height: 36px; padding: 4px 10px; font-size: 14px; }
.ln-note { display: block; color: var(--muted); font-size: 13px !important; }
.ln-dlg { gap: 10px; max-height: 88vh; overflow-y: auto; }
.ln-dh { display: flex; align-items: center; justify-content: space-between; }
.ln-dh b { font-size: 17px; }
.ln-row { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 14px; background: var(--panel2); }
.ln-row input { min-height: 44px; font-size: 15px; }
.ln-ra { display: flex; gap: 6px; justify-content: flex-end; }
.ln-ra .icon { width: 38px !important; height: 38px !important; min-height: 0 !important; padding: 0 !important; }
.ln-df { display: flex; gap: 8px; justify-content: flex-end; }
</style>

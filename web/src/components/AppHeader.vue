<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// AppHeader
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<header>
  <img src="znak.png" alt="">
  <h1>{{ current ? (svcEditing && canEdit ? 'Edycja nabożeństwa' : 'Nabożeństwo') : currentAnn ? (annEditing ? (annSavedOnce ? 'Edycja ogłoszenia' : 'Nowe ogłoszenie') : 'Ogłoszenie') : annView ? 'Ogłoszenia' : currentProto ? (protoEditing ? (protoSavedOnce ? 'Edycja materiału' : 'Nowy materiał') : MAT_TYPES[matType(currentProto)]) : currentEvent ? (eventEditing && eventEditable ? (eventSavedOnce ? 'Edycja wydarzenia' : 'Nowe wydarzenie') : 'Wydarzenie') : protoView ? 'Materiały' : tplType ? (tplType.name || 'Nowy rodzaj') : tplView ? 'Szablony' : calView ? 'Kalendarz' : song ? (song.isNew ? 'Nowa pieśń' : 'Pieśń') : songView ? 'Baza pieśni' : peopleView ? 'Osoby' : gcalView ? 'Kalendarz Google' : profileView ? 'Mój profil' : serveView ? 'Zaangażuj się' : listenView ? 'Posłuchaj' : asbView ? 'ASB' : goalsView ? 'Cele wsparcia' : votesView ? 'Głosowania' : svcListView ? 'Nabożeństwa' : bugsView ? 'Zgłoszenia' : moreView ? 'Więcej' : 'Kościół Na Skale' }}</h1>
  <button v-if="current" class="ghost back" @click="back"><svg class="i"><use href="#back"/></svg>{{ svcEditing && services.some(x => x.id === current.id) ? 'Podgląd' : cameFromCal() ? 'Kalendarz' : 'Lista' }}</button>
  <button v-else-if="currentAnn" class="ghost back" @click="closeAnn"><svg class="i"><use href="#back"/></svg>{{ annView ? 'Ogłoszenia' : 'Wstecz' }}</button>
  <button v-else-if="annView" class="ghost back to-start" @click="annView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
  <button v-else-if="currentProto" class="ghost back" @click="closeProto"><svg class="i"><use href="#back"/></svg>{{ currentEvent ? 'Wydarzenie' : protoView ? 'Materiały' : 'Wstecz' }}</button>
  <button v-else-if="currentEvent" class="ghost back" @click="closeEvent"><svg class="i"><use href="#back"/></svg>{{ eventEditing && eventSavedOnce ? 'Podgląd' : 'Kalendarz' }}</button>
  <button v-else-if="tplType" class="ghost back" @click="closeType"><svg class="i"><use href="#back"/></svg>Szablony</button>
  <button v-else-if="tplView" class="ghost back to-start" @click="tplView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
  <button v-else-if="protoView" class="ghost back to-start" @click="protoView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
  <button v-else-if="song" class="ghost back" @click="closeSong"><svg class="i"><use href="#back"/></svg>Pieśni</button>
  <button v-else-if="profileView" class="ghost back to-start" @click="profileView = false"><svg class="i"><use href="#back"/></svg>Wstecz</button>
  <button v-else-if="serveView || listenView || asbView || goalsView || votesView || bugsView || svcListView" class="ghost wide-only back to-start" @click="showServices"><svg class="i"><use href="#back"/></svg>Start</button>
  <button v-else-if="gcalView" class="ghost back" @click="gcalView = false; calView = true"><svg class="i"><use href="#back"/></svg>Kalendarz</button>
  <button v-else-if="songView || peopleView" class="ghost back to-start" @click="songView = false; peopleView = false"><svg class="i"><use href="#back"/></svg>Więcej</button>
  <template v-else>
    <button v-if="ready && (calView || moreView)" class="ghost wide-only back to-start" @click="showServices"><svg class="i"><use href="#back"/></svg>Start</button>
    <button v-if="ready" class="ghost" :class="{ 'narrow-only': !peopleView }" :disabled="busy || peopleBusy" aria-label="Odśwież" title="Odśwież" @click="peopleView ? loadPeople() : reload()"><svg class="i"><use href="#refresh"/></svg></button>
  </template>
  <button v-if="ready && api.enabled && !current && !currentEvent && !currentAnn && !currentProto && !song && !tplType" class="ghost bell narrow-only" aria-label="Powiadomienia" title="Powiadomienia" @click="openInbox"><svg class="i"><use href="#bell"/></svg><span v-if="unread" class="count">{{ unread }}</span></button>
  <button v-if="shareTarget && shareTarget[0] !== 'nabozenstwo'" class="ghost share-btn" title="Kod QR — do pobrania i wstawienia na grafikę" aria-label="Kod QR" @click="openQr(...shareTarget)"><svg class="i"><use href="#qr"/></svg><span>QR</span></button>
  <button v-if="shareTarget" class="ghost share-btn" title="Kopiuj link — można go komuś wysłać" aria-label="Kopiuj link" @click="shareLink(...shareTarget)"><svg class="i"><use href="#link"/></svg><span>Link</span></button>
</header>
</template>

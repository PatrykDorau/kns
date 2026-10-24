<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import Giveaways from '@/components/Giveaways.vue'

// wszystkie ogłoszenia; druga zakładka — wydawka (rzeczy za darmo)
export default defineComponent({ components: { Giveaways }, setup: () => useApp() })
</script>

<template>
  <div v-if="api.enabled" class="serve-tabs" role="tablist">
    <button role="tab" :aria-selected="annTab === 'ann'" @click="annTab = 'ann'; giftOpen = ''"><svg class="i"><use href="#megaphone"/></svg>Ogłoszenia</button>
    <button role="tab" :aria-selected="annTab === 'gift'" @click="annTab = 'gift'"><svg class="i"><use href="#gift"/></svg>Wydawka</button>
  </div>
  <Giveaways v-if="annTab === 'gift'" />
  <template v-else>
  <div v-if="canAnnounce" class="ann-new-row">
    <button class="primary" @click="newAnn"><svg class="i"><use href="#plus"/></svg>Nowe ogłoszenie</button>
    <button v-if="canEdit && drive.uploadImage" :disabled="bulk.busy" title="Wybierz grafikę — otworzy się nowe ogłoszenie z nią (do uzupełnienia i zapisania)" @click="$refs.annBulk.click()"><svg class="i"><use href="#image"/></svg>{{ bulk.busy ? 'Wgrywam grafikę…' : 'Z grafiki' }}</button>
    <input ref="annBulk" type="file" accept="image/*" hidden @change="annFromImages">
  </div>
  <div v-if="announcements.length" class="ann-search">
    <svg class="i"><use href="#search"/></svg>
    <input v-model="annQuery" type="search" placeholder="Szukaj w ogłoszeniach…" aria-label="Szukaj w ogłoszeniach" autocomplete="off"
           @focus="annHintsOpen = true" @input="annHintsOpen = true" @blur="annHintsOpen = false" @keydown.esc="annHintsOpen = false">
    <ul v-if="annHintsOpen && annHints.length" class="ann-hints" role="listbox">
      <li v-for="a in annHints" :key="a.id"><button type="button" @mousedown.prevent="pickHint(a)">
        <span><template v-for="(p, i) in hintParts(a.title)" :key="i"><mark v-if="p.hit">{{ p.s }}</mark><template v-else>{{ p.s }}</template></template></span>
        <small>{{ isActive(a) ? shortDate(a.date) : 'archiwum' }}</small>
      </button></li>
    </ul>
  </div>
  <p v-if="!activeAnns.length" class="note">Nie ma aktualnych ogłoszeń.</p>
  <p v-else-if="annQuery.trim() && !shownActiveAnns.length && !shownOldAnns.length" class="note">Nic nie znaleziono dla „{{ annQuery.trim() }}”.</p>
  <div class="wide-list ann-list">
  <button v-for="a in shownActiveAnns" :key="a.id" class="ann" :class="{ important: a.important, fresh: annIsNew(a) }" @click="openAnn(a)">
    <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
    <span class="ann-tags"><span v-if="annIsNew(a)" class="ann-tag kh-new">Nowe</span><span v-if="a.pinned" class="ann-tag pin"><svg class="i"><use href="#pin"/></svg>Przypięte</span><span v-if="a.video" class="ann-tag vid">▶ Film</span><span v-if="a.important" class="ann-tag imp"><svg class="i"><use href="#alert"/></svg>Komunikat rady</span><span class="ann-tag">{{ AUDIENCE[a.audience] }}</span><span v-if="a.until" class="ann-tag">do {{ shortDate(a.until) }}</span></span>
    <b>{{ a.title }}</b>
    <span class="ann-body">{{ a.text }}</span>
  </button>
  </div>
  <template v-if="shownOldAnns.length">
    <div class="section"><h2>Archiwum · {{ shownOldAnns.length }}</h2></div>
    <button v-for="a in shownOldAnns" :key="a.id" class="ann old" @click="openAnn(a)">
      <span class="ann-tags"><span class="ann-tag">{{ AUDIENCE[a.audience] }}</span><span class="ann-tag">do {{ shortDate(a.until) }}</span></span>
      <b>{{ a.title }}</b>
    </button>
  </template>
  </template>
</template>

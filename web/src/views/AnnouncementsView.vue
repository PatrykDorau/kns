<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { computed, defineComponent, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import Giveaways from '@/components/Giveaways.vue'
import CardDeck from '@/components/CardDeck.vue'
import Surveys from '@/components/Surveys.vue'

// wszystkie ogłoszenia (lista albo talia kart — zapamiętane na tym urządzeniu); kolejne zakładki — wydawka (rzeczy za darmo) i ankiety
const AUD_COLOR = { public: '#f2a65a', members: '#7cc4a4', council: '#c79bf2' }
const AUD_WORD = { public: 'Publiczne', members: 'Członkowie', council: 'Rada' }
const remembered = () => { try { return localStorage.getItem('kns-ann-mode') === 'cards' ? 'cards' : 'list' } catch { return 'list' } }
export default defineComponent({
  components: { Giveaways, CardDeck, Surveys },
  setup() {
    const app = useApp()
    const annMode = ref(remembered())
    watch(annMode, v => { try { localStorage.setItem('kns-ann-mode', v) } catch { /* bez zapamiętania */ } })
    const deckAud = ref('') // filtr talii: '' — wszystkie, albo public / members / council
    const deckAuds = computed(() => [['', 'Wszystkie'], ...Object.entries(AUD_WORD).filter(([k]) => app.shownActiveAnns.value.some(a => a.audience === k))])
    const deckCards = computed(() => app.shownActiveAnns.value.filter(a => !deckAud.value || a.audience === deckAud.value).map(a => ({
      key: a.id, title: a.title, image: a.image || '', color: a.important ? 'var(--accent)' : AUD_COLOR[a.audience],
      tag: a.important ? 'Komunikat rady' : app.annIsNew(a) ? 'Nowe' : app.AUDIENCE[a.audience], sub: a.text || app.shortDate(a.date),
    })))
    const openCard = c => { const a = app.shownActiveAnns.value.find(x => x.id === c.key); if (a) app.openAnn(a) }
    return { ...app, annMode, deckAud, deckAuds, deckCards, openCard }
  },
})
</script>

<template>
  <div v-if="api.enabled" class="serve-tabs ann-tabs" role="tablist">
    <button role="tab" :aria-selected="annTab === 'ann'" @click="annTab = 'ann'; giftOpen = ''; surveyOpen = ''"><svg class="i"><use href="#megaphone"/></svg>Ogłoszenia</button>
    <button role="tab" :aria-selected="annTab === 'gift'" @click="annTab = 'gift'; surveyOpen = ''"><svg class="i"><use href="#gift"/></svg>Wydawka</button>
    <button role="tab" :aria-selected="annTab === 'survey'" @click="annTab = 'survey'; giftOpen = ''"><svg class="i"><use href="#check"/></svg>Ankiety</button>
  </div>
  <Giveaways v-if="annTab === 'gift'" />
  <Surveys v-else-if="annTab === 'survey'" />
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
  <div v-if="activeAnns.length" class="seg ann-mode" role="group" aria-label="Widok ogłoszeń">
    <button :class="{ on: annMode === 'list' }" :aria-pressed="annMode === 'list'" @click="annMode = 'list'"><svg class="i"><use href="#list"/></svg>Lista</button>
    <button :class="{ on: annMode === 'cards' }" :aria-pressed="annMode === 'cards'" @click="annMode = 'cards'"><svg class="i"><use href="#image"/></svg>Karty</button>
  </div>
  <p v-if="!activeAnns.length" class="note">Nie ma aktualnych ogłoszeń.</p>
  <p v-else-if="annQuery.trim() && !shownActiveAnns.length && !shownOldAnns.length" class="note">Nic nie znaleziono dla „{{ annQuery.trim() }}”.</p>
  <div v-if="annMode === 'cards' && shownActiveAnns.length" class="ann-deck">
    <CardDeck :cards="deckCards" label="Ogłoszenia" @open="openCard"><template #empty>Brak ogłoszeń dla tej grupy.</template></CardDeck>
    <nav v-if="deckAuds.length > 2" class="deck-words" aria-label="Dla kogo">
      <button v-for="[k, name] in deckAuds" :key="k" :class="{ on: deckAud === k }" :aria-pressed="deckAud === k" @click="deckAud = k">{{ name }}</button>
    </nav>
  </div>
  <div v-else class="wide-list ann-list">
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

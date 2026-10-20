<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Wydawka (zakładka w „Ogłoszeniach”): członkowie oddają rzeczy za darmo. Pierwsze osoby (tyle, ile sztuk) biorą,
// kolejne są na liście rezerwowej — gdy ktoś zrezygnuje, następny dostaje powiadomienie. Oddający widzi zapisanych,
// zaznacza „wydane” albo skreśla osobę. Lista → szczegóły rzeczy (giftOpen w adresie: /wydawka/<id>).
const gv = reactive({ list: [], busy: false, loaded: false, error: '', edit: null, note: '' })
export default defineComponent({
  setup() {
    const app = useApp()
    const cur = computed(() => gv.list.find(g => g.id === app.giftOpen.value))
    async function load() {
      try { gv.list = (await app.api.call('giveaways')) || []; gv.error = '' } catch (e) { gv.error = e.message || String(e) } finally { gv.loaded = true }
    }
    onMounted(load)
    const run = async (fn, msg = '') => {
      gv.busy = true
      try { await fn(); await load(); if (msg) app.showToast(msg) } catch (e) { gv.error = e.message || String(e) } finally { gv.busy = false }
    }
    const open = g => { app.giftOpen.value = g.id; gv.edit = null; gv.note = ''; scrollTo(0, 0) }
    const back = () => { app.giftOpen.value = ''; gv.edit = null; scrollTo(0, 0) }
    const newGift = () => { gv.edit = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', description: '', image: '', place: '', qty: 1, closed: false, _new: true }; scrollTo(0, 0) }
    const editGift = g => { gv.edit = { id: g.id, title: g.title, description: g.description, image: g.image, place: g.place, qty: g.qty, closed: g.closed }; scrollTo(0, 0) }
    const save = () => run(async () => {
      const e = gv.edit
      await app.api.call('giveawaySave', e)
      gv.edit = null
      if (e._new) app.giftOpen.value = e.id
    }, 'Zapisano.')
    const remove = async g => { if (await ask('Usunąć „' + g.title + '” z wydawki razem z listą chętnych?', { ok: 'Usuń', danger: true })) run(async () => { await app.api.call('giveawayDelete', { id: g.id }); back() }, 'Usunięto.') }
    const close = g => run(() => app.api.call('giveawaySave', { ...g, closed: !g.closed }), g.closed ? 'Wydawka znów otwarta.' : 'Wydawka zamknięta.')
    const claim = g => run(async () => { const pos = await app.api.call('giveawayClaim', { id: g.id, note: gv.note }); gv.note = ''; app.showToast(pos <= g.qty ? 'Zapisano — umów się z oddającym.' : 'Jesteś na liście rezerwowej (' + (pos - g.qty) + '.).') })
    const unclaim = async g => { if (await ask('Zrezygnować z „' + g.title + '”? Twoje miejsce dostanie następna osoba.', { ok: 'Rezygnuję' })) run(() => app.api.call('giveawayUnclaim', { id: g.id }), 'Zrezygnowano.') }
    const drop = async (g, p) => { if (await ask('Skreślić ' + p.name + '? Dostanie powiadomienie, a rzecz przejdzie na następną osobę z listy.', { ok: 'Skreśl', danger: true })) run(() => app.api.call('giveawayDrop', { id: g.id, who: p.id }), 'Skreślono.') }
    const given = (g, p) => run(() => app.api.call('giveawayGiven', { id: g.id, who: p.id, val: !p.given }))
    function pickImage(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !gv.edit) return
      gv.busy = true
      app.shrinkImage(file, 1600).then(b => app.drive.uploadImage(b)).then(u => { if (gv.edit) gv.edit.image = u }, er => { gv.error = er.message || String(er) }).finally(() => { gv.busy = false })
    }
    // stan rzeczy dla mnie i dla wszystkich
    const free = g => Math.max(0, g.qty - g.count)
    const status = g => g.closed ? 'Wydane' : free(g) > 0 ? (g.qty > 1 ? 'Wolne: ' + free(g) + ' z ' + g.qty : 'Wolne') : 'Zarezerwowane' + (g.count > g.qty ? ' · rezerwa ' + (g.count - g.qty) : '')
    const myState = g => g.myGiven ? 'Odebrane' : g.myPos == null ? '' : g.myPos <= g.qty ? 'Bierzesz' : 'Rezerwa nr ' + (g.myPos - g.qty)
    return { ...app, gv, cur, open, back, newGift, editGift, save, remove, close, claim, unclaim, drop, given, pickImage, free, status, myState }
  },
})
</script>

<template>
  <!-- formularz: oddaję -->
  <section v-if="gv.edit" class="gift-form">
    <h2>{{ gv.edit._new ? 'Oddam za darmo' : 'Zmiana' }}</h2>
    <label for="gfTitle">Co oddajesz <span class="req">*</span></label>
    <input id="gfTitle" v-model="gv.edit.title" maxlength="120" placeholder="np. Wózek dziecięcy, Książki, Szafka" autocomplete="off" :class="{ invalid: !gv.edit.title.trim() }">
    <label for="gfDesc">Opis</label>
    <textarea id="gfDesc" v-model="gv.edit.description" maxlength="2000" placeholder="stan, wymiary, co jeszcze warto wiedzieć"></textarea>
    <div class="gift-form-row">
      <span><label for="gfPlace">Gdzie i kiedy odebrać</label><input id="gfPlace" v-model="gv.edit.place" maxlength="200" placeholder="np. Wrzeszcz, po nabożeństwie" autocomplete="off"></span>
      <span><label for="gfQty">Ile sztuk</label><input id="gfQty" v-model.number="gv.edit.qty" type="number" min="1" max="99" inputmode="numeric"></span>
    </div>
    <label>Zdjęcie (opcjonalnie)</label>
    <img v-if="gv.edit.image" class="ann-img edit" :src="gv.edit.image" alt="">
    <div v-if="drive.uploadImage" class="row">
      <button type="button" :disabled="gv.busy" @click="$refs.giftImg.click()"><svg class="i"><use href="#image"/></svg>{{ gv.busy ? 'Wysyłam…' : gv.edit.image ? 'Zmień zdjęcie' : 'Dodaj zdjęcie' }}</button>
      <button v-if="gv.edit.image" type="button" @click="gv.edit.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń zdjęcie</button>
    </div>
    <input ref="giftImg" type="file" accept="image/*" hidden @change="pickImage">
    <ImageLinkInput @pick="u => gv.edit.image = u" />
    <p v-if="gv.error" class="error">{{ gv.error }}</p>
    <div class="bar">
      <button class="primary" :disabled="gv.busy || !gv.edit.title.trim() || !(gv.edit.qty >= 1)" @click="save">{{ gv.edit._new ? 'Dodaj do wydawki' : 'Zapisz' }}</button>
      <button :disabled="gv.busy" @click="gv.edit = null">Anuluj</button>
    </div>
  </section>

  <!-- szczegóły rzeczy -->
  <template v-else-if="giftOpen">
    <button class="ghost small goal-back" @click="back"><svg class="i"><use href="#back"/></svg>Cała wydawka</button>
    <div v-if="!cur && !gv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div class="skel skel-row"></div></div>
    <p v-else-if="!cur" class="note">Tej rzeczy już nie ma w wydawce.</p>
    <article v-else class="gift-detail" :class="{ closed: cur.closed }">
      <img v-if="cur.image" class="gift-img" :src="cur.image" alt="">
      <div class="ann-tags"><span class="ann-tag" :class="{ pin: !cur.closed && free(cur) > 0 }">{{ status(cur) }}</span><span v-if="myState(cur)" class="ann-tag pin">{{ myState(cur) }}</span></div>
      <h2 class="ann-view-title">{{ cur.title }}</h2>
      <p class="ann-view-meta">Oddaje {{ cur.mine ? 'Ty' : cur.owner }}<template v-if="cur.qty > 1"> · {{ cur.qty }} szt.</template></p>
      <p v-if="cur.place" class="gift-place"><svg class="i"><use href="#pin"/></svg>{{ cur.place }}</p>
      <div v-if="cur.description" class="ann-view-text">{{ cur.description }}</div>
      <p v-if="gv.error" class="error">{{ gv.error }}</p>

      <!-- ja: biorę / rezerwa / rezygnuję -->
      <div v-if="!cur.mine" class="gift-me">
        <template v-if="cur.myGiven"><p class="note goal-locked"><svg class="i"><use href="#check"/></svg><span>Odebrane — dziękujemy, że korzystasz z wydawki.</span></p></template>
        <template v-else-if="cur.myPos">
          <p class="note goal-locked"><svg class="i"><use :href="cur.myPos <= cur.qty ? '#check' : '#heart'"/></svg><span v-if="cur.myPos <= cur.qty">To dla Ciebie — umów się z <b>{{ cur.owner }}</b> na odbiór.</span><span v-else>Jesteś <b>{{ cur.myPos - cur.qty }}.</b> na liście rezerwowej. Dostaniesz powiadomienie, gdy przyjdzie Twoja kolej.</span></p>
          <button :disabled="gv.busy || cur.closed" @click="unclaim(cur)">Rezygnuję</button>
        </template>
        <template v-else-if="!cur.closed">
          <label for="gfNote">Wiadomość do oddającego (opcjonalnie)</label>
          <input id="gfNote" v-model="gv.note" maxlength="300" placeholder="np. mogę odebrać w niedzielę" autocomplete="off">
          <button class="primary" :disabled="gv.busy" @click="claim(cur)"><svg class="i"><use href="#gift"/></svg>{{ free(cur) > 0 ? 'Biorę' : 'Zapisz mnie na rezerwę' }}</button>
        </template>
        <p v-else class="note">Wszystko już wydane.</p>
      </div>

      <!-- oddający: kto się zapisał -->
      <div v-if="cur.canEdit" class="gift-claims">
        <small class="mm-lbl">Zapisani{{ cur.claims.length ? ' · ' + cur.claims.length : '' }}</small>
        <p v-if="!cur.claims.length" class="note">Nikt się jeszcze nie zapisał.</p>
        <div v-for="(p, k) in cur.claims" :key="p.id" class="gift-person" :class="{ reserve: k >= cur.qty }">
          <span><b>{{ p.name }}</b><small>{{ p.given ? 'wydane' : k < cur.qty ? 'bierze' : 'rezerwa ' + (k - cur.qty + 1) }}<template v-if="p.note"> · „{{ p.note }}”</template></small></span>
          <button v-if="k < cur.qty || p.given" class="small" :class="{ primary: !p.given }" :disabled="gv.busy" @click="given(cur, p)">{{ p.given ? 'Cofnij' : 'Wydane' }}</button>
          <button v-if="!p.given" class="icon" :disabled="gv.busy" :aria-label="'Skreśl ' + p.name" title="Skreśl" @click="drop(cur, p)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <div class="gift-admin">
          <button class="small" @click="editGift(cur)"><svg class="i"><use href="#pencil"/></svg>Zmień</button>
          <button class="small" :disabled="gv.busy" @click="close(cur)">{{ cur.closed ? 'Otwórz ponownie' : 'Zamknij wydawkę' }}</button>
          <button class="small danger" :disabled="gv.busy" @click="remove(cur)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
        </div>
      </div>
    </article>
  </template>

  <!-- lista -->
  <template v-else>
    <div class="gift-intro">
      <p>Masz coś, co komuś się przyda? Oddaj za darmo. Pierwsza osoba bierze, kolejne czekają na liście rezerwowej.</p>
      <button class="primary" @click="newGift"><svg class="i"><use href="#plus"/></svg>Oddam coś</button>
    </div>
    <p v-if="gv.error" class="error">{{ gv.error }}</p>
    <div v-if="!gv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!gv.list.length" class="note">Na razie nikt nic nie oddaje.</p>
    <div class="goal-list">
      <button v-for="g in gv.list" :key="g.id" class="goal-card gift-card" :class="{ closed: g.closed }" @click="open(g)">
        <img v-if="g.image" class="gcard-img" :src="g.image" alt="" loading="lazy">
        <span v-else class="gcard-img gcard-ic"><svg class="i"><use href="#gift"/></svg></span>
        <span class="gcard-body">
          <span class="gcard-h"><b>{{ g.title }}</b><small>{{ g.mine ? 'oddajesz Ty' : g.owner }}<template v-if="g.place"> · {{ g.place }}</template></small></span>
          <span class="ann-tags"><span class="ann-tag" :class="{ pin: !g.closed && free(g) > 0 }">{{ status(g) }}</span><span v-if="myState(g)" class="ann-tag pin">{{ myState(g) }}</span><span v-if="g.mine && g.count" class="ann-tag pin">zapisani: {{ g.count }}</span></span>
        </span>
        <svg class="i chev"><use href="#chev"/></svg>
      </button>
    </div>
  </template>
</template>

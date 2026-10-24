<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Wydawka (zakładka w „Ogłoszeniach”): członkowie oddają rzeczy za darmo. Jedna wydawka (tytuł, opis, gdzie odebrać)
// ma kilka przedmiotów, każdy ze zdjęciem i liczbą sztuk. Na każdy przedmiot osobna kolejka: pierwsze osoby (tyle, ile
// sztuk) biorą, kolejne są na liście rezerwowej. Oddający widzi zapisanych, zaznacza „wydane” albo skreśla osobę.
// Po zamknięciu wydawki (ręcznie albo gdy wszystko wydane) zdjęcia przedmiotów usuwają się same.
const gv = reactive({ list: [], busy: false, loaded: false, error: '', edit: null, note: '', imgBusy: '' })
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const own = u => /\/ogloszenia\//.test(u || '') // zdjęcie wgrane do nas (z linku — zostaje u źródła)
export default defineComponent({
  setup() {
    const app = useApp()
    const cur = computed(() => gv.list.find(g => g.id === app.giftOpen.value))
    const removeImages = urls => { for (const u of urls) if (own(u)) app.drive.removeImage?.(u) }
    // zamknięte wydawki: zdjęcia usuwane (robi to oddający albo osoba z prawem edycji, gdy zobaczy zamkniętą wydawkę)
    let sweeping = false
    async function sweepClosed() {
      if (sweeping) return
      const todo = gv.list.filter(g => g.canEdit && g.closed && g.items.some(i => i.image))
      if (!todo.length) return
      sweeping = true
      try {
        for (const g of todo) {
          removeImages(g.items.map(i => i.image))
          await app.api.call('giveawaySave', { ...g, items: g.items.map(i => ({ ...i, image: '' })) })
        }
        await load(false)
      } catch { /* następnym razem */ } finally { sweeping = false }
    }
    async function load(sweep = true) {
      try { gv.list = (await app.api.call('giveaways')) || []; gv.error = '' } catch (e) { gv.error = e.message || String(e) } finally { gv.loaded = true }
      if (sweep) sweepClosed()
    }
    onMounted(load)
    const run = async (fn, msg = '') => {
      gv.busy = true
      try { await fn(); await load(); if (msg) app.showToast(msg) } catch (e) { gv.error = e.message || String(e) } finally { gv.busy = false }
    }
    const open = g => { app.giftOpen.value = g.id; gv.edit = null; gv.note = ''; scrollTo(0, 0) }
    const back = () => { app.giftOpen.value = ''; gv.edit = null; scrollTo(0, 0) }
    const blankItem = () => ({ id: '', key: newId('k'), title: '', image: '', qty: 1 })
    const newGift = () => { gv.edit = { id: newId('w'), title: '', description: '', place: '', closed: false, items: [blankItem()], _new: true, _old: [] }; scrollTo(0, 0) }
    const editGift = g => { gv.edit = { id: g.id, title: g.title, description: g.description, place: g.place, closed: g.closed, items: g.items.map(i => ({ id: i.id, key: i.id, title: i.title, image: i.image, qty: i.qty })), _old: g.items.map(i => i.image) }; scrollTo(0, 0) }
    const addItem = () => gv.edit.items.push(blankItem())
    const removeItem = async it => {
      if (it.id && !(await ask('Usunąć „' + (it.title || 'ten przedmiot') + '” z wydawki? Zapisane na niego osoby znikną z listy.', { ok: 'Usuń', danger: true }))) return
      gv.edit.items = gv.edit.items.filter(x => x !== it)
    }
    const valid = computed(() => !!gv.edit && !!gv.edit.title.trim() && gv.edit.items.length > 0 && gv.edit.items.every(i => i.qty >= 1))
    const save = () => run(async () => {
      const e = gv.edit
      await app.api.call('giveawaySave', e)
      // podmienione albo usunięte zdjęcia — kasujemy stare pliki
      const now = new Set(e.items.map(i => i.image))
      removeImages((e._old || []).filter(u => !now.has(u)))
      gv.edit = null
      if (e._new) app.giftOpen.value = e.id
    }, 'Zapisano.')
    const remove = async g => {
      if (await ask('Usunąć wydawkę „' + g.title + '” razem z przedmiotami, zdjęciami i listą chętnych?', { ok: 'Usuń', danger: true }))
        run(async () => { await app.api.call('giveawayDelete', { id: g.id }); removeImages(g.items.map(i => i.image)); back() }, 'Usunięto.')
    }
    const close = async g => {
      if (!g.closed && !(await ask('Zamknąć wydawkę? Nowych zapisów już nie będzie, a zdjęcia przedmiotów zostaną usunięte.', { ok: 'Zamknij' }))) return
      run(() => app.api.call('giveawaySave', { ...g, closed: !g.closed }), g.closed ? 'Wydawka znów otwarta.' : 'Wydawka zamknięta.')
    }
    const claim = it => run(async () => {
      const pos = await app.api.call('giveawayClaim', { item: it.id, note: gv.note })
      gv.note = ''
      app.showToast(pos <= it.qty ? '„' + it.title + '” — zapisano. Umów się z oddającym.' : 'Jesteś na liście rezerwowej (' + (pos - it.qty) + '.).')
    })
    const unclaim = async it => { if (await ask('Zrezygnować z „' + it.title + '”? Twoje miejsce dostanie następna osoba.', { ok: 'Rezygnuję' })) run(() => app.api.call('giveawayUnclaim', { item: it.id }), 'Zrezygnowano.') }
    const drop = async (it, p) => { if (await ask('Skreślić ' + p.name + ' przy „' + it.title + '”? Dostanie powiadomienie, a rzecz przejdzie na następną osobę z listy.', { ok: 'Skreśl', danger: true })) run(() => app.api.call('giveawayDrop', { item: it.id, who: p.id }), 'Skreślono.') }
    const given = (it, p) => run(() => app.api.call('giveawayGiven', { item: it.id, who: p.id, val: !p.given }))
    function pickImage(e, it) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      gv.imgBusy = it.key
      app.shrinkImage(file, 1600).then(b => app.drive.uploadImage(b)).then(u => {
        if (own(it.image) && !(gv.edit?._old || []).includes(it.image)) removeImages([it.image]) // wgrane przed chwilą i podmienione
        it.image = u
      }, er => { gv.error = er.message || String(er) }).finally(() => { gv.imgBusy = '' })
    }
    // stan przedmiotu dla wszystkich i dla mnie
    const free = it => Math.max(0, it.qty - it.count)
    const status = (g, it) => it.given >= it.qty ? 'Wydane' : g.closed ? 'Zakończone' : free(it) > 0 ? (it.qty > 1 ? 'Wolne: ' + free(it) + ' z ' + it.qty : 'Wolne') : 'Zarezerwowane' + (it.count > it.qty ? ' · rezerwa ' + (it.count - it.qty) : '')
    const myState = it => it.myGiven ? 'Odebrane' : it.myPos == null ? '' : it.myPos <= it.qty ? 'Bierzesz' : 'Rezerwa nr ' + (it.myPos - it.qty)
    // podsumowanie wydawki na liście
    const cover = g => g.items.find(i => i.image)?.image || ''
    const freeAll = g => g.closed ? 0 : g.items.reduce((n, i) => n + free(i), 0)
    const mineAll = g => g.items.map(myState).filter(Boolean)
    const claimsAll = g => g.items.reduce((n, i) => n + i.count, 0)
    const itemsWord = n => n === 1 ? 'przedmiot' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'przedmioty' : 'przedmiotów'
    return { ...app, gv, cur, open, back, newGift, editGift, addItem, removeItem, valid, save, remove, close, claim, unclaim, drop, given, pickImage, free, status, myState, cover, freeAll, mineAll, claimsAll, itemsWord }
  },
})
</script>

<template>
  <!-- formularz: oddaję -->
  <section v-if="gv.edit" class="gift-form">
    <h2>{{ gv.edit._new ? 'Oddam za darmo' : 'Zmiana wydawki' }}</h2>
    <div class="form-sec">
      <h3>Wydawka</h3>
      <label for="gfTitle">Tytuł <span class="req">*</span></label>
      <input id="gfTitle" v-model="gv.edit.title" maxlength="120" placeholder="np. Rzeczy po przeprowadzce, Ubranka dla dzieci" autocomplete="off" :class="{ invalid: !gv.edit.title.trim() }">
      <label for="gfDesc">Opis (opcjonalnie)</label>
      <textarea id="gfDesc" v-model="gv.edit.description" maxlength="2000" class="short" placeholder="stan, skąd, co jeszcze warto wiedzieć"></textarea>
      <label for="gfPlace">Gdzie i kiedy odebrać</label>
      <input id="gfPlace" v-model="gv.edit.place" maxlength="200" placeholder="np. Wrzeszcz, po nabożeństwie" autocomplete="off">
    </div>

    <div class="form-sec">
      <h3>Przedmioty · {{ gv.edit.items.length }}</h3>
      <p class="form-hint"><svg class="i"><use href="#info"/></svg><span>Każdy przedmiot może mieć zdjęcie — z telefonu albo link z Dysku Google. Zdjęcia usuną się same po zamknięciu wydawki.</span></p>
      <div v-for="(it, k) in gv.edit.items" :key="it.key" class="gift-item-edit">
        <div class="gie-photo">
          <img v-if="it.image" :src="it.image" alt="">
          <button v-else type="button" class="gie-add" :disabled="!!gv.imgBusy" :aria-label="'Dodaj zdjęcie przedmiotu ' + (k + 1)" @click="$refs['img' + it.key][0].click()"><svg class="i"><use href="#image"/></svg><small>{{ gv.imgBusy === it.key ? 'Wysyłam…' : 'Zdjęcie' }}</small></button>
          <input :ref="'img' + it.key" type="file" accept="image/*" hidden @change="pickImage($event, it)">
        </div>
        <div class="gie-body">
          <input v-model="it.title" maxlength="120" :placeholder="k === 0 ? 'Nazwa, np. Wózek dziecięcy' : 'Nazwa przedmiotu'" :aria-label="'Nazwa przedmiotu ' + (k + 1)" autocomplete="off">
          <div class="gie-row">
            <label class="gie-qty-l" :for="'q' + it.key">Sztuk</label>
            <input :id="'q' + it.key" v-model.number="it.qty" class="gie-qty" type="number" min="1" max="99" inputmode="numeric">
            <span class="gie-spacer"></span>
            <button type="button" class="small" :disabled="gv.edit.items.length < 2" :aria-label="'Usuń przedmiot ' + (k + 1)" @click="removeItem(it)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
          </div>
          <div v-if="it.image" class="gie-row">
            <button type="button" class="small" :disabled="!!gv.imgBusy" @click="$refs['img' + it.key][0].click()">Zmień zdjęcie</button>
            <button type="button" class="small" @click="it.image = ''">Usuń zdjęcie</button>
          </div>
          <ImageLinkInput v-else compact @pick="u => it.image = u" />
        </div>
      </div>
      <button type="button" class="ghost" :disabled="gv.edit.items.length >= 30" @click="addItem"><svg class="i"><use href="#plus"/></svg>Dodaj przedmiot</button>
    </div>
    <p v-if="gv.error" class="error">{{ gv.error }}</p>
    <div class="bar">
      <button class="primary" :disabled="gv.busy || !!gv.imgBusy || !valid" @click="save">{{ gv.edit._new ? 'Dodaj do wydawki' : 'Zapisz' }}</button>
      <button :disabled="gv.busy" @click="gv.edit = null">Anuluj</button>
    </div>
  </section>

  <!-- szczegóły wydawki -->
  <template v-else-if="giftOpen">
    <button class="ghost small goal-back" @click="back"><svg class="i"><use href="#back"/></svg>Cała wydawka</button>
    <div v-if="!cur && !gv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div class="skel skel-row"></div></div>
    <p v-else-if="!cur" class="note">Tej wydawki już nie ma.</p>
    <template v-else>
      <article class="gift-detail" :class="{ closed: cur.closed }">
        <div class="ann-tags"><span class="ann-tag" :class="{ pin: freeAll(cur) > 0 }">{{ cur.closed ? 'Zakończona' : freeAll(cur) > 0 ? 'Wolne: ' + freeAll(cur) : 'Wszystko zarezerwowane' }}</span><span class="ann-tag">{{ cur.items.length }} {{ itemsWord(cur.items.length) }}</span></div>
        <h2 class="ann-view-title">{{ cur.title }}</h2>
        <p class="ann-view-meta">Oddaje {{ cur.mine ? 'Ty' : cur.owner }}</p>
        <p v-if="cur.place" class="gift-place"><svg class="i"><use href="#pin"/></svg>{{ cur.place }}</p>
        <div v-if="cur.description" class="ann-view-text">{{ cur.description }}</div>
        <template v-if="!cur.mine && !cur.closed">
          <label for="gfNote">Wiadomość do oddającego (opcjonalnie)</label>
          <input id="gfNote" v-model="gv.note" maxlength="300" placeholder="np. mogę odebrać w niedzielę" autocomplete="off">
        </template>
        <p v-if="gv.error" class="error">{{ gv.error }}</p>
      </article>

      <div class="gift-items">
        <article v-for="it in cur.items" :key="it.id" class="gift-item" :class="{ done: cur.closed || it.given >= it.qty }">
          <img v-if="it.image" class="gift-item-img" :src="it.image" alt="" loading="lazy">
          <div class="gift-item-body">
            <div class="gift-item-h"><b>{{ it.title }}</b><small v-if="it.qty > 1">{{ it.qty }} szt.</small></div>
            <div class="ann-tags"><span class="ann-tag" :class="{ pin: !cur.closed && free(it) > 0 }">{{ status(cur, it) }}</span><span v-if="myState(it)" class="ann-tag pin">{{ myState(it) }}</span></div>
            <!-- ja: biorę / rezerwa / rezygnuję -->
            <template v-if="!cur.mine">
              <p v-if="it.myGiven" class="gift-me-note">Odebrane — dziękujemy!</p>
              <template v-else-if="it.myPos">
                <p class="gift-me-note">{{ it.myPos <= it.qty ? 'To dla Ciebie — umów się z ' + cur.owner + ' na odbiór.' : 'Jesteś ' + (it.myPos - it.qty) + '. na liście rezerwowej — dostaniesz powiadomienie, gdy przyjdzie Twoja kolej.' }}</p>
                <button class="small" :disabled="gv.busy || cur.closed" @click="unclaim(it)">Rezygnuję</button>
              </template>
              <button v-else-if="!cur.closed && it.given < it.qty" class="small" :class="{ primary: free(it) > 0 }" :disabled="gv.busy" @click="claim(it)"><svg class="i"><use href="#gift"/></svg>{{ free(it) > 0 ? 'Biorę' : 'Na rezerwę' }}</button>
            </template>
            <!-- oddający: kto się zapisał na ten przedmiot -->
            <div v-if="cur.canEdit && it.claims" class="gift-claims">
              <small v-if="!it.claims.length" class="muted">Nikt się jeszcze nie zapisał.</small>
              <div v-for="(p, k) in it.claims" :key="p.id" class="gift-person" :class="{ reserve: k >= it.qty }">
                <span><b>{{ p.name }}</b><small>{{ p.given ? 'wydane' : k < it.qty ? 'bierze' : 'rezerwa ' + (k - it.qty + 1) }}<template v-if="p.note"> · „{{ p.note }}”</template></small></span>
                <button v-if="k < it.qty || p.given" class="small" :class="{ primary: !p.given }" :disabled="gv.busy" @click="given(it, p)">{{ p.given ? 'Cofnij' : 'Wydane' }}</button>
                <button v-if="!p.given" class="icon" :disabled="gv.busy" :aria-label="'Skreśl ' + p.name" title="Skreśl" @click="drop(it, p)"><svg class="i"><use href="#x"/></svg></button>
              </div>
            </div>
          </div>
        </article>
      </div>
      <div v-if="cur.canEdit" class="gift-admin">
        <button class="small" @click="editGift(cur)"><svg class="i"><use href="#pencil"/></svg>Zmień</button>
        <button class="small" :disabled="gv.busy" @click="close(cur)">{{ cur.closed ? 'Otwórz ponownie' : 'Zamknij wydawkę' }}</button>
        <button class="small danger" :disabled="gv.busy" @click="remove(cur)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
      </div>
    </template>
  </template>

  <!-- lista -->
  <template v-else>
    <div class="gift-intro">
      <p>Masz coś, co komuś się przyda? Oddaj za darmo — jedną rzecz albo kilka naraz, każdą ze zdjęciem. Pierwsza osoba bierze, kolejne czekają na liście rezerwowej.</p>
      <button class="primary" @click="newGift"><svg class="i"><use href="#plus"/></svg>Oddam coś</button>
    </div>
    <p v-if="gv.error" class="error">{{ gv.error }}</p>
    <div v-if="!gv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!gv.list.length" class="note">Na razie nikt nic nie oddaje.</p>
    <div class="goal-list">
      <button v-for="g in gv.list" :key="g.id" class="goal-card gift-card" :class="{ closed: g.closed }" @click="open(g)">
        <img v-if="cover(g)" class="gcard-img" :src="cover(g)" alt="" loading="lazy">
        <span v-else class="gcard-img gcard-ic"><svg class="i"><use href="#gift"/></svg></span>
        <span class="gcard-body">
          <span class="gcard-h"><b>{{ g.title }}</b><small>{{ g.mine ? 'oddajesz Ty' : g.owner }} · {{ g.items.length }} {{ itemsWord(g.items.length) }}<template v-if="g.place"> · {{ g.place }}</template></small></span>
          <span class="ann-tags"><span class="ann-tag" :class="{ pin: freeAll(g) > 0 }">{{ g.closed ? 'Zakończona' : freeAll(g) > 0 ? 'Wolne: ' + freeAll(g) : 'Wszystko zarezerwowane' }}</span><span v-for="s in mineAll(g).slice(0, 2)" :key="s" class="ann-tag pin">{{ s }}</span><span v-if="g.mine && claimsAll(g)" class="ann-tag pin">zapisani: {{ claimsAll(g) }}</span></span>
        </span>
        <svg class="i chev"><use href="#chev"/></svg>
      </button>
    </div>
  </template>
</template>

<style scoped>
.gift-items { display: grid; gap: 10px; margin-top: 12px; }
@media (min-width: 900px) { .gift-items { grid-template-columns: 1fr 1fr; } }
.gift-item { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
.gift-item.done { opacity: .7; }
.gift-item-img { width: 100%; max-height: 260px; object-fit: contain; background: var(--panel2); }
.gift-item-body { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; align-items: flex-start; }
.gift-item-h { display: flex; align-items: baseline; gap: 8px; }
.gift-item-h b { font-size: 16px; }
.gift-item-h small { color: var(--muted); }
.gift-item .ann-tags { margin: 0; }
.gift-me-note { margin: 0; color: var(--muted); font-size: 13.5px; }
.gift-item .gift-claims { width: 100%; margin-top: 2px; padding-top: 8px; border-top: 1px solid var(--line); gap: 0; }
.gift-detail .ann-view-text { margin-bottom: 4px; }
.gift-detail label { margin-top: 12px; }
.gift-admin { margin-top: 12px; }
.gift-item-edit { display: flex; gap: 12px; padding: 12px; margin-bottom: 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel2); }
.gie-photo { flex: none; width: 72px; height: 72px; border-radius: 12px; overflow: hidden; background: var(--panel); }
.gie-photo img { width: 100%; height: 100%; object-fit: cover; }
.gie-add { width: 100%; height: 100%; min-height: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 1px dashed var(--line); border-radius: 12px; background: transparent; color: var(--muted); }
.gie-add .i { width: 22px; height: 22px; color: var(--accent-text); }
.gie-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.gie-row { display: flex; gap: 6px; align-items: center; }
.gie-row > input:first-child { flex: 1; min-width: 0; }
.gie-qty { flex: none; width: 70px; text-align: center; }
.gie-qty-l { margin: 0 !important; color: var(--muted); font-size: 13px; }
.gie-spacer { flex: 1; }
.gie-body :deep(.img-link) { margin-top: 0; }
</style>

<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Modlitwa (zakładka w „Ogłoszeniach”): prośba o modlitwę — z podpisem albo anonimowo, z kontaktem dla prowadzących,
// za zgodą — także na liście zboru. Członkowie widzą prośby pokazane zborowi i swoje, „Modlę się” liczy modlących się.
// Prowadzący (pastor, rada, administrator) widzą wszystkie i decydują, które pokazać (modlitwa.sql).
const pr = reactive({ focus: [], focusEdit: null, list: [], leader: false, loaded: false, busy: false, error: '', form: { text: '', name: '', contact: '', share: false }, sent: false, open: false })
export default defineComponent({
  setup() {
    const app = useApp()
    async function load() {
      try {
        const [r, f] = await Promise.all([app.api.call('prayers'), app.api.call('prayerFocus').catch(() => [])])
        pr.list = r?.list || []; pr.leader = !!r?.leader; pr.focus = f || []; pr.error = ''
      }
      catch (e) { pr.error = e.message || String(e) } finally { pr.loaded = true }
    }
    onMounted(() => { if (!pr.form.name) pr.form.name = (app.me.value?.name || '').split(/\s+/)[0] || ''; load() })
    const run = async (fn, msg = '') => {
      pr.busy = true
      try { await fn(); await load(); if (msg) app.showToast(msg) } catch (e) { pr.error = e.message || String(e) } finally { pr.busy = false }
    }
    const send = () => run(async () => {
      await app.api.call('prayerAdd', { ...pr.form })
      pr.form.text = ''; pr.form.contact = ''; pr.sent = true; pr.open = false
    }, 'Prośba zapisana — będziemy się modlić.')
    const pray = q => run(() => app.api.call('prayerPray', { id: q.id }))
    const setStatus = (q, st) => run(() => app.api.call('prayerStatus', { id: q.id, status: st }), st === 'shown' ? 'Prośba jest na liście zboru.' : st === 'done' ? 'Prośba zakończona.' : 'Prośba tylko dla prowadzących.')
    const remove = async q => { if (await ask('Usunąć tę prośbę? Tego nie da się cofnąć.', { ok: 'Usuń', danger: true })) run(() => app.api.call('prayerRemove', { id: q.id }), 'Usunięto.') }
    // modlitwa na dziś / na ten tydzień (starszy)
    const newFocus = scope => { pr.focusEdit = { scope, text: pr.focus.find(f => f.scope === scope)?.text || '' } }
    const saveFocus = () => run(async () => { await app.api.call('prayerFocusSet', { ...pr.focusEdit }); pr.focusEdit = null }, 'Modlitwa zapisana — widać ją na górze zakładki.')
    const removeFocus = async f => { if (await ask('Usunąć modlitwę ' + (f.scope === 'day' ? 'na dziś' : 'na ten tydzień') + '?', { ok: 'Usuń', danger: true })) run(() => app.api.call('prayerFocusRemove', { id: f.id })) }
    const until = d => new Date(String(d).slice(0, 10) + 'T12:00').toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
    const STATUS = { new: 'nowa', shown: 'na liście zboru', private: 'tylko prowadzący', done: 'zakończona' }
    const ago = t => new Date(t).toLocaleDateString('pl', { day: 'numeric', month: 'short' })
    return { ...app, pr, send, pray, setStatus, remove, STATUS, ago, newFocus, saveFocus, removeFocus, until }
  },
})
</script>

<template>
  <!-- modlitwa na dziś / na ten tydzień — od starszego, na górze -->
  <section v-for="f in pr.focus" :key="f.id" class="pr-focus" :class="f.scope">
    <small class="pr-focus-k"><svg class="i"><use href="#heart"/></svg>{{ f.scope === 'day' ? 'Modlitwa na dziś' : 'Modlitwa na ten tydzień' }}</small>
    <p class="pr-focus-t">{{ f.text }}</p>
    <small class="pr-focus-by">{{ f.author }}{{ f.scope === 'week' ? ' · do ' + until(f.ends) : '' }}</small>
    <div v-if="pr.leader" class="pr-act"><button class="small" @click="newFocus(f.scope)"><svg class="i"><use href="#pencil"/></svg>Zmień</button><button class="small danger" :aria-label="'Usuń modlitwę'" @click="removeFocus(f)"><svg class="i"><use href="#trash"/></svg></button></div>
  </section>
  <div v-if="pr.leader && !pr.focusEdit" class="pr-focus-add">
    <button v-if="!pr.focus.some(f => f.scope === 'day')" class="small" @click="newFocus('day')"><svg class="i"><use href="#plus"/></svg>Modlitwa na dziś</button>
    <button v-if="!pr.focus.some(f => f.scope === 'week')" class="small" @click="newFocus('week')"><svg class="i"><use href="#plus"/></svg>Modlitwa na ten tydzień</button>
  </div>
  <section v-if="pr.focusEdit" class="form-sec pr-focus-form">
    <h3>{{ pr.focusEdit.scope === 'day' ? 'Modlitwa na dziś' : 'Modlitwa na ten tydzień' }}</h3>
    <div class="seg" role="group" aria-label="Na kiedy">
      <button :class="{ on: pr.focusEdit.scope === 'day' }" @click="pr.focusEdit.scope = 'day'">Na dziś</button>
      <button :class="{ on: pr.focusEdit.scope === 'week' }" @click="pr.focusEdit.scope = 'week'">Na ten tydzień</button>
    </div>
    <textarea v-model="pr.focusEdit.text" class="short" maxlength="2000" placeholder="np. Módlmy się o chorych w zborze i o rodziny, które przeżywają trudny czas…" aria-label="Treść modlitwy"></textarea>
    <small class="muted">Zobaczą ją wszyscy członkowie na górze zakładki „Modlitwa” — {{ pr.focusEdit.scope === 'day' ? 'do końca dnia' : 'do niedzieli' }}.</small>
    <div class="bar"><button class="primary" :disabled="pr.busy || pr.focusEdit.text.trim().length < 3" @click="saveFocus">Zapisz</button><button :disabled="pr.busy" @click="pr.focusEdit = null">Anuluj</button></div>
  </section>

  <!-- nowa prośba: formularz dopiero po kliknięciu -->
  <div v-if="!pr.open" class="pr-add"><button class="primary" @click="pr.open = true"><svg class="i"><use href="#plus"/></svg>Dodaj prośbę modlitewną</button></div>
  <section v-else class="pr-form form-sec">
    <h3>Prośba o modlitwę</h3>
    <p class="form-hint"><svg class="i"><use href="#heart"/></svg><span>Napisz, w czym możemy się za Ciebie modlić. Prośbę przeczytają pastor i rada zboru{{ pr.form.share ? ' — i zobaczy ją cały zbór' : '' }}.</span></p>
    <textarea v-model="pr.form.text" class="short" maxlength="1500" placeholder="np. o zdrowie dla mamy, o nową pracę…" aria-label="Treść prośby"></textarea>
    <div class="row">
      <div><label for="prName">Podpis <small class="muted">(puste — anonimowo)</small></label><input id="prName" v-model="pr.form.name" maxlength="80" autocomplete="given-name"></div>
      <div><label for="prContact">Kontakt <small class="muted">(opcjonalnie, tylko dla prowadzących)</small></label><input id="prContact" v-model="pr.form.contact" maxlength="120" placeholder="telefon albo e-mail" autocomplete="tel"></div>
    </div>
    <label class="check"><input v-model="pr.form.share" type="checkbox">Mogą się za mnie modlić wszyscy — pokaż prośbę na liście zboru</label>
    <p v-if="pr.error" class="error">{{ pr.error }}</p>
    <div class="bar"><button class="primary" :disabled="pr.busy || pr.form.text.trim().length < 3" @click="send"><svg class="i"><use href="#heart"/></svg>Wyślij prośbę</button><button :disabled="pr.busy" @click="pr.open = false">Anuluj</button></div>
  </section>

  <p v-if="!pr.open && pr.error" class="error">{{ pr.error }}</p>
  <!-- lista -->
  <div class="section"><h2>{{ pr.leader ? 'Prośby' : 'Lista modlitewna' }}</h2></div>
  <div v-if="!pr.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="!pr.list.length" class="note">{{ pr.leader ? 'Nie ma jeszcze próśb.' : 'Na liście zboru nie ma teraz próśb.' }}</p>
  <div class="wide-list pr-list">
    <article v-for="q in pr.list" :key="q.id" class="ann pr-item" :class="{ old: q.status === 'done', fresh: pr.leader && q.status === 'new' }">
      <span class="ann-tags">
        <span v-if="pr.leader || q.mine" class="ann-tag" :class="{ pin: q.status === 'shown', 'kh-new': q.status === 'new' }">{{ STATUS[q.status] }}</span>
        <span v-if="q.mine" class="ann-tag pin">Twoja</span>
        <span v-if="pr.leader && q.share && q.status !== 'shown'" class="ann-tag">zgoda na listę zboru</span>
        <span class="ann-tag">{{ ago(q.created) }}</span>
      </span>
      <p class="pr-text">{{ q.text }}</p>
      <small class="pr-by">{{ q.name || 'anonimowo' }}<template v-if="pr.leader && q.from && q.from !== q.name"> · konto: {{ q.from }}</template><template v-if="pr.leader && q.contact"> · kontakt: <b>{{ q.contact }}</b></template></small>
      <div class="pr-act">
        <button class="small" :class="{ primary: q.iPrayed }" :aria-pressed="q.iPrayed" :disabled="pr.busy" @click="pray(q)"><svg class="i"><use href="#heart"/></svg>{{ q.iPrayed ? 'Modlę się' : 'Będę się modlić' }}<template v-if="q.prayed"> · {{ q.prayed }}</template></button>
        <template v-if="pr.leader">
          <button v-if="q.share && q.status !== 'shown'" class="small" :disabled="pr.busy" @click="setStatus(q, 'shown')">Pokaż zborowi</button>
          <button v-if="q.status === 'shown' || q.status === 'new'" class="small" :disabled="pr.busy" @click="setStatus(q, 'private')">Tylko prowadzący</button>
        </template>
        <button v-if="(pr.leader || q.mine) && q.status !== 'done'" class="small" :disabled="pr.busy" @click="setStatus(q, 'done')"><svg class="i"><use href="#check"/></svg>Zakończ</button>
        <button v-if="pr.leader || q.mine" class="small danger" :disabled="pr.busy" :aria-label="'Usuń prośbę'" @click="remove(q)"><svg class="i"><use href="#trash"/></svg></button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.pr-form textarea { margin-top: 10px; }
.pr-add { margin: 4px 0 16px; }
.pr-text { margin: 6px 0 2px; white-space: pre-wrap; font-size: 15.5px; line-height: 1.5; }
.pr-by { color: var(--muted); font-size: 13px; }
.pr-act { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.pr-item { cursor: default; }
.pr-focus { display: flex; flex-direction: column; gap: 6px; margin: 0 0 12px; padding: 18px 18px 16px; border-radius: 20px; background: var(--panel); border-left: 3px solid var(--accent); }
.pr-focus.week { border-left-color: #c79bf2; }
.pr-focus-k { display: flex; align-items: center; gap: 6px; color: var(--accent-text, var(--accent)); font-size: 12.5px; font-weight: 650; }
.pr-focus.week .pr-focus-k { color: #c79bf2; }
.pr-focus-t { margin: 0; font: 600 19px/1.4 var(--display); letter-spacing: -.01em; white-space: pre-wrap; }
.pr-focus-by { color: var(--muted); font-size: 13px; }
.pr-focus-add { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.pr-focus-form textarea { margin: 10px 0 6px; }
</style>

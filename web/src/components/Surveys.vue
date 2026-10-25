<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'
import UiSelect from '@/components/UiSelect.vue'

// Ankiety (zakładka w „Ogłoszeniach”): pastor, rada albo administrator tworzy ankietę dla grupy (wszyscy, rangi, służby);
// adresaci dostają powiadomienie i wypełniają (do zamknięcia można poprawić). Prowadzący widzi zestawienie odpowiedzi
// i kto jeszcze nie odpowiedział; ankieta anonimowa — bez imion przy odpowiedziach.
const TYPES = [{ value: 'one', label: 'Jeden wybór' }, { value: 'many', label: 'Kilka wyborów' }, { value: 'scale', label: 'Skala 1–5' }, { value: 'text', label: 'Odpowiedź opisowa' }]
const sv = reactive({ list: [], canCreate: false, loaded: false, busy: false, error: '', edit: null, draft: {}, results: null, groups: null })
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const blankQ = () => ({ id: newId('q'), type: 'one', label: '', options: ['', ''], required: true })

export default defineComponent({
  components: { UiSelect },
  setup() {
    const app = useApp()
    const cur = computed(() => sv.list.find(s => s.id === app.surveyOpen.value))
    async function load() {
      try { const r = await app.api.call('surveys'); sv.list = r?.list || []; sv.canCreate = !!r?.canCreate; sv.error = '' }
      catch (e) { sv.error = e.message || String(e) } finally { sv.loaded = true }
    }
    onMounted(load)
    const run = async (fn, msg = '') => {
      sv.busy = true
      try { await fn(); await load(); if (msg) app.showToast(msg) } catch (e) { sv.error = e.message || String(e) } finally { sv.busy = false }
    }
    // otwarta ankieta: szkic odpowiedzi (moje dotychczasowe) i — dla prowadzących — wyniki
    watch(cur, s => {
      sv.results = null
      if (!s) return
      sv.draft = JSON.parse(JSON.stringify(s.myAnswers || {}))
      for (const q of s.questions) if (q.type === 'many' && !Array.isArray(sv.draft[q.id])) sv.draft[q.id] = []
      if (s.canManage) app.api.call('surveyResults', { id: s.id }).then(r => { if (cur.value?.id === s.id) sv.results = r }, () => {})
    }, { immediate: true })
    const open = s => { app.surveyOpen.value = s.id; sv.edit = null; scrollTo(0, 0) }
    const back = () => { app.surveyOpen.value = ''; sv.edit = null; scrollTo(0, 0) }

    // tworzenie / zmiana
    async function loadGroups() { if (!sv.groups) try { sv.groups = await app.api.call('broadcastOptions') } catch { sv.groups = { ranks: [], ministries: [] } } }
    const newSurvey = () => { loadGroups(); sv.edit = { id: newId('a'), title: '', description: '', everyone: true, ranks: [], ministries: [], anonymous: false, closes: '', questions: [blankQ()], _new: true }; scrollTo(0, 0) }
    const editSurvey = s => {
      loadGroups()
      sv.edit = { id: s.id, title: s.title, description: s.description, everyone: s.everyone, ranks: [...s.ranks], ministries: [...s.ministries], anonymous: s.anonymous, closes: s.closes || '',
        questions: JSON.parse(JSON.stringify(s.questions)).map(q => ({ ...q, options: q.options || ['', ''] })), _locked: s.count > 0 }
      scrollTo(0, 0)
    }
    const toggle = (key, id) => { const l = sv.edit[key]; const i = l.indexOf(id); i < 0 ? l.push(id) : l.splice(i, 1) }
    const moveQ = (k, d) => { const l = sv.edit.questions; const [q] = l.splice(k, 1); l.splice(k + d, 0, q) }
    const choice = q => q.type === 'one' || q.type === 'many'
    const valid = computed(() => {
      const e = sv.edit
      return !!e && !!e.title.trim() && (e.everyone || e.ranks.length + e.ministries.length > 0) && e.questions.length > 0
        && e.questions.every(q => q.label.trim() && (!choice(q) || q.options.filter(o => o.trim()).length >= 2))
    })
    const save = () => run(async () => {
      const e = sv.edit
      await app.api.call('surveySave', { id: e.id, title: e.title.trim(), description: e.description.trim(), everyone: e.everyone, ranks: e.everyone ? [] : e.ranks, ministries: e.everyone ? [] : e.ministries,
        anonymous: e.anonymous, closes: e.closes || '', questions: e.questions.map(q => ({ id: q.id, type: q.type, label: q.label.trim(), required: !!q.required, ...(choice(q) ? { options: q.options.map(o => o.trim()).filter(Boolean) } : {}) })) })
      const fresh = e._new
      sv.edit = null
      if (fresh) app.surveyOpen.value = e.id
    }, sv.edit?._new ? 'Ankieta wysłana — adresaci dostali powiadomienie.' : 'Zapisano.')

    // wypełnianie
    const answered = q => { const v = sv.draft[q.id]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '' }
    const canSend = computed(() => cur.value && cur.value.questions.every(q => !q.required || answered(q)))
    const pickMany = (q, i) => { const l = sv.draft[q.id]; const k = l.indexOf(i); k < 0 ? l.push(i) : l.splice(k, 1) }
    const send = () => run(async () => {
      const answers = {}
      for (const q of cur.value.questions) if (answered(q)) answers[q.id] = typeof sv.draft[q.id] === 'string' ? sv.draft[q.id].trim() : sv.draft[q.id]
      await app.api.call('surveyAnswer', { id: cur.value.id, answers })
    }, 'Dziękujemy! Odpowiedź zapisana.')

    // prowadzenie
    const setStatus = s => run(() => app.api.call('surveyStatus', { id: s.id, status: s.status === 'open' ? 'closed' : 'open' }), s.status === 'open' ? 'Ankieta zamknięta.' : 'Ankieta znów otwarta.')
    const remove = async s => { if (await ask('Usunąć ankietę „' + s.title + '” razem z odpowiedziami? Tego nie da się cofnąć.', { ok: 'Usuń', danger: true })) run(async () => { await app.api.call('surveyRemove', { id: s.id }); back() }, 'Ankieta usunięta.') }

    // zestawienie jednego pytania
    function summary(q) {
      const rs = (sv.results?.responses || []).map(r => ({ v: r.answers?.[q.id], name: r.name })).filter(r => r.v !== undefined && r.v !== null && r.v !== '' && !(Array.isArray(r.v) && !r.v.length))
      if (q.type === 'text') return { n: rs.length, texts: rs.map(r => ({ text: r.v, name: r.name })) }
      if (q.type === 'scale') {
        const bars = [1, 2, 3, 4, 5].map(k => ({ label: String(k), n: rs.filter(r => r.v === k).length }))
        return { n: rs.length, avg: rs.length ? (rs.reduce((a, r) => a + r.v, 0) / rs.length).toFixed(1).replace('.', ',') : '', bars, max: Math.max(1, ...bars.map(b => b.n)) }
      }
      const bars = (q.options || []).map((o, i) => ({ label: o, n: rs.filter(r => (Array.isArray(r.v) ? r.v.includes(i) : r.v === i)).length, who: rs.filter(r => (Array.isArray(r.v) ? r.v.includes(i) : r.v === i)).map(r => r.name).filter(Boolean) }))
      return { n: rs.length, bars, max: Math.max(1, ...bars.map(b => b.n)) }
    }
    const audience = s => (s.everyone ? 'wszyscy członkowie' : [...(s.ranks || []).map(r => sv.groups?.ranks?.find(x => x.id === r)?.name || r), ...(s.ministries || []).map(m => 'służba ' + (sv.groups?.ministries?.find(x => x.id === m)?.name || m))].join(', '))
    const when = d => (d ? new Date(d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'long' }) : '')
    return { ...app, sv, TYPES, cur, open, back, newSurvey, editSurvey, toggle, moveQ, choice, valid, save, answered, canSend, pickMany, send, setStatus, remove, summary, audience, when, blankQ }
  },
})
</script>

<template>
  <!-- formularz: nowa / zmiana ankiety -->
  <section v-if="sv.edit" class="sv-form">
    <h2>{{ sv.edit._new ? 'Nowa ankieta' : 'Zmiana ankiety' }}</h2>
    <div class="form-sec">
      <label for="svTitle">Tytuł <span class="req">*</span></label>
      <input id="svTitle" v-model="sv.edit.title" maxlength="160" placeholder="np. Ewaluacja grup domowych" autocomplete="off" :class="{ invalid: !sv.edit.title.trim() }">
      <label for="svDesc">Wstęp (opcjonalnie)</label>
      <textarea id="svDesc" v-model="sv.edit.description" maxlength="4000" class="short" placeholder="po co ta ankieta i ile zajmie"></textarea>
      <label for="svCloses">Do kiedy (opcjonalnie)</label>
      <input id="svCloses" v-model="sv.edit.closes" type="date">
      <label class="check"><input v-model="sv.edit.anonymous" type="checkbox" :disabled="sv.edit._locked">Anonimowa — wyniki bez imion</label>
    </div>
    <div class="form-sec">
      <h3>Kto wypełnia</h3>
      <label class="check"><input v-model="sv.edit.everyone" type="checkbox">Wszyscy zatwierdzeni członkowie</label>
      <div v-if="!sv.edit.everyone" class="chips">
        <p v-if="!sv.groups" class="note">Wczytuję grupy…</p>
        <button v-for="r in sv.groups?.ranks || []" :key="'r' + r.id" type="button" class="chipbtn" :class="{ on: sv.edit.ranks.includes(r.id) }" :aria-pressed="sv.edit.ranks.includes(r.id)" @click="toggle('ranks', r.id)">{{ r.name }} · {{ r.count }}</button>
        <button v-for="m in sv.groups?.ministries || []" :key="'m' + m.id" type="button" class="chipbtn" :class="{ on: sv.edit.ministries.includes(m.id) }" :aria-pressed="sv.edit.ministries.includes(m.id)" @click="toggle('ministries', m.id)">Służba: {{ m.name }} · {{ m.count }}</button>
      </div>
    </div>
    <div class="form-sec">
      <h3>Pytania · {{ sv.edit.questions.length }}</h3>
      <p v-if="sv.edit._locked" class="form-hint"><svg class="i"><use href="#info"/></svg><span>Ktoś już odpowiedział — pytań nie można zmienić (tytuł, wstęp i termin — tak).</span></p>
      <div v-for="(q, k) in sv.edit.questions" :key="q.id" class="sv-q-edit">
        <div class="sv-q-top">
          <b>{{ k + 1 }}.</b>
          <input v-model="q.label" maxlength="300" placeholder="Treść pytania" :aria-label="'Pytanie ' + (k + 1)" :disabled="sv.edit._locked" autocomplete="off">
        </div>
        <div class="sv-q-row">
          <UiSelect v-model="q.type" :options="TYPES" compact :disabled="sv.edit._locked" :label="'Rodzaj pytania ' + (k + 1)" />
          <label class="check sv-req"><input v-model="q.required" type="checkbox" :disabled="sv.edit._locked">wymagane</label>
          <span class="gie-spacer"></span>
          <button type="button" class="iconbtn" :disabled="sv.edit._locked || k === 0" :aria-label="'Wyżej: pytanie ' + (k + 1)" @click="moveQ(k, -1)">↑</button>
          <button type="button" class="iconbtn" :disabled="sv.edit._locked || k === sv.edit.questions.length - 1" :aria-label="'Niżej: pytanie ' + (k + 1)" @click="moveQ(k, 1)">↓</button>
          <button type="button" class="small" :disabled="sv.edit._locked || sv.edit.questions.length < 2" :aria-label="'Usuń pytanie ' + (k + 1)" @click="sv.edit.questions.splice(k, 1)"><svg class="i"><use href="#trash"/></svg></button>
        </div>
        <div v-if="choice(q)" class="sv-opts">
          <div v-for="(o, i) in q.options" :key="i" class="sv-opt">
            <input v-model="q.options[i]" maxlength="200" :placeholder="'Odpowiedź ' + (i + 1)" :disabled="sv.edit._locked" autocomplete="off">
            <button type="button" class="iconbtn" :disabled="sv.edit._locked || q.options.length < 3" aria-label="Usuń odpowiedź" @click="q.options.splice(i, 1)">×</button>
          </div>
          <button type="button" class="ghost small" :disabled="sv.edit._locked || q.options.length >= 20" @click="q.options.push('')"><svg class="i"><use href="#plus"/></svg>Odpowiedź</button>
        </div>
      </div>
      <button type="button" class="ghost" :disabled="sv.edit._locked || sv.edit.questions.length >= 40" @click="sv.edit.questions.push(blankQ())"><svg class="i"><use href="#plus"/></svg>Dodaj pytanie</button>
    </div>
    <p v-if="sv.error" class="error">{{ sv.error }}</p>
    <div class="bar">
      <button class="primary" :disabled="sv.busy || !valid" @click="save">{{ sv.edit._new ? 'Wyślij ankietę' : 'Zapisz' }}</button>
      <button :disabled="sv.busy" @click="sv.edit = null">Anuluj</button>
    </div>
  </section>

  <!-- jedna ankieta: wypełnianie i (dla prowadzących) wyniki -->
  <template v-else-if="surveyOpen">
    <button class="ghost small goal-back" @click="back"><svg class="i"><use href="#back"/></svg>Wszystkie ankiety</button>
    <div v-if="!cur && !sv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div class="skel skel-row"></div></div>
    <p v-else-if="!cur" class="note">Tej ankiety już nie ma albo jest dla innej grupy.</p>
    <article v-else class="sv-detail">
      <span class="ann-tags"><span class="ann-tag" :class="{ pin: cur.status === 'open' }">{{ cur.status === 'open' ? (cur.closes ? 'do ' + when(cur.closes) : 'otwarta') : 'zamknięta' }}</span><span v-if="cur.anonymous" class="ann-tag">anonimowa</span><span v-if="cur.answered" class="ann-tag pin">wypełniona</span></span>
      <h2 class="sv-title">{{ cur.title }}</h2>
      <p class="muted sv-by">{{ cur.author }}<template v-if="cur.canManage"> · dla: {{ audience(cur) }}</template></p>
      <p v-if="cur.description" class="sv-desc">{{ cur.description }}</p>

      <form v-if="cur.forMe && cur.status === 'open'" class="sv-fill" @submit.prevent="send">
        <fieldset v-for="(q, k) in cur.questions" :key="q.id" class="sv-q">
          <legend>{{ k + 1 }}. {{ q.label }}<span v-if="q.required" class="req"> *</span></legend>
          <textarea v-if="q.type === 'text'" v-model="sv.draft[q.id]" class="short" maxlength="2000" :aria-label="q.label"></textarea>
          <div v-else-if="q.type === 'scale'" class="sv-scale" role="radiogroup" :aria-label="q.label">
            <button v-for="n in 5" :key="n" type="button" role="radio" :aria-checked="sv.draft[q.id] === n" :class="{ on: sv.draft[q.id] === n }" @click="sv.draft[q.id] = n">{{ n }}</button>
            <small class="muted">1 — wcale, 5 — bardzo</small>
          </div>
          <template v-else>
            <label v-for="(o, i) in q.options" :key="i" class="check sv-choice">
              <input v-if="q.type === 'one'" type="radio" :name="q.id" :checked="sv.draft[q.id] === i" @change="sv.draft[q.id] = i">
              <input v-else type="checkbox" :checked="(sv.draft[q.id] || []).includes(i)" @change="pickMany(q, i)">{{ o }}
            </label>
          </template>
        </fieldset>
        <p v-if="sv.error" class="error">{{ sv.error }}</p>
        <div class="bar"><button class="primary" type="submit" :disabled="sv.busy || !canSend">{{ cur.answered ? 'Popraw odpowiedź' : 'Wyślij odpowiedź' }}</button></div>
      </form>
      <p v-else-if="cur.forMe" class="note">Ankieta jest zamknięta{{ cur.answered ? ' — Twoja odpowiedź została zapisana.' : '.' }}</p>

      <!-- wyniki -->
      <section v-if="cur.canManage" class="sv-results">
        <h3 class="sv-res-h">Wyniki · odpowiedzi {{ cur.count }} z {{ cur.targets }}</h3>
        <div v-if="!sv.results" class="skel-list" aria-busy="true"><div class="skel skel-row"></div></div>
        <template v-else>
          <div v-for="(q, k) in cur.questions" :key="q.id" class="sv-res-q">
            <b>{{ k + 1 }}. {{ q.label }}</b>
            <template v-if="q.type === 'text'">
              <p v-if="!summary(q).n" class="muted">Brak odpowiedzi.</p>
              <blockquote v-for="(t, i) in summary(q).texts" :key="i" class="sv-quote">{{ t.text }}<small v-if="t.name"> — {{ t.name }}</small></blockquote>
            </template>
            <template v-else>
              <p v-if="q.type === 'scale' && summary(q).n" class="muted">Średnio {{ summary(q).avg }} z 5</p>
              <div v-for="b in summary(q).bars" :key="b.label" class="sv-bar" :title="b.who?.length ? b.who.join(', ') : ''">
                <span class="sv-bar-l">{{ b.label }}</span>
                <span class="sv-bar-t"><i :style="{ width: (b.n / summary(q).max) * 100 + '%' }"></i></span>
                <span class="sv-bar-n">{{ b.n }}</span>
              </div>
            </template>
          </div>
          <p v-if="sv.results.missing.length" class="muted sv-missing">Jeszcze nie odpowiedzieli ({{ sv.results.missing.length }}): {{ sv.results.missing.join(', ') }}</p>
        </template>
        <div class="gift-admin">
          <button class="small" @click="editSurvey(cur)"><svg class="i"><use href="#pencil"/></svg>Zmień</button>
          <button class="small" :disabled="sv.busy" @click="setStatus(cur)">{{ cur.status === 'open' ? 'Zamknij ankietę' : 'Otwórz ponownie' }}</button>
          <button class="small danger" :disabled="sv.busy" @click="remove(cur)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
        </div>
      </section>
    </article>
  </template>

  <!-- lista -->
  <template v-else>
    <div v-if="sv.canCreate" class="ann-new-row"><button class="primary" @click="newSurvey"><svg class="i"><use href="#plus"/></svg>Nowa ankieta</button></div>
    <p v-if="sv.error" class="error">{{ sv.error }}</p>
    <div v-if="!sv.loaded" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!sv.list.length" class="note">{{ sv.canCreate ? 'Nie ma jeszcze ankiet — utwórz pierwszą i wybierz, kto ma ją wypełnić.' : 'Nie ma ankiet do wypełnienia.' }}</p>
    <div class="wide-list ann-list">
      <button v-for="s in sv.list" :key="s.id" class="ann" :class="{ fresh: s.forMe && !s.answered && s.status === 'open', old: s.status !== 'open' }" @click="open(s)">
        <span class="ann-tags">
          <span v-if="s.forMe && !s.answered && s.status === 'open'" class="ann-tag kh-new">Do wypełnienia</span>
          <span v-else-if="s.answered" class="ann-tag pin">Wypełniona</span>
          <span class="ann-tag">{{ s.status === 'open' ? (s.closes ? 'do ' + when(s.closes) : 'otwarta') : 'zamknięta' }}</span>
          <span v-if="s.canManage" class="ann-tag">odpowiedzi {{ s.count }}/{{ s.targets }}</span>
        </span>
        <b>{{ s.title }}</b>
        <span v-if="s.description" class="ann-body">{{ s.description }}</span>
      </button>
    </div>
  </template>
</template>

<style scoped>
.sv-q-edit { display: flex; flex-direction: column; gap: 8px; padding: 12px; margin-bottom: 10px; border-radius: 14px; background: var(--panel2); }
.sv-q-top { display: flex; align-items: center; gap: 8px; }
.sv-q-top input { flex: 1; min-width: 0; }
.sv-q-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sv-q-row :deep(.ui-select) { min-width: 180px; }
.sv-req { font-size: 14px; }
.sv-opts { display: flex; flex-direction: column; gap: 6px; padding-left: 22px; }
.sv-opt { display: flex; gap: 6px; }
.sv-opt input { flex: 1; min-width: 0; }
.sv-detail { display: flex; flex-direction: column; gap: 8px; }
.sv-title { margin: 4px 0 0; font: 650 26px/1.15 var(--display); letter-spacing: -.02em; }
.sv-by { margin: 0; font-size: 13.5px; }
.sv-desc { margin: 4px 0 0; white-space: pre-wrap; }
.sv-fill { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
.sv-q { margin: 0; padding: 14px 16px; border: 0; border-radius: 16px; background: var(--panel); display: flex; flex-direction: column; gap: 8px; }
.sv-q legend { float: left; width: 100%; padding: 0; margin-bottom: 4px; font-weight: 650; font-size: 15.5px; }
.sv-choice { font-size: 15px; }
.sv-scale { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sv-scale button { width: 44px; height: 44px; padding: 0; justify-content: center; border-radius: 12px; font-weight: 650; }
.sv-scale button.on { background: var(--text); color: var(--bg); }
.sv-scale small { width: 100%; }
.sv-results { margin-top: 18px; display: flex; flex-direction: column; gap: 14px; }
.sv-res-h { margin: 0; font-size: 15px; }
.sv-res-q { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 16px; background: var(--panel); }
.sv-res-q p { margin: 0; font-size: 13.5px; }
.sv-bar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(80px, 2fr) 28px; align-items: center; gap: 10px; font-size: 14px; }
.sv-bar-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-bar-t { height: 10px; border-radius: 5px; background: var(--panel2); overflow: hidden; }
.sv-bar-t i { display: block; height: 100%; border-radius: 5px; background: var(--accent); }
.sv-bar-n { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
.sv-quote { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--panel2); white-space: pre-wrap; font-size: 14px; }
.sv-quote small { color: var(--muted); }
.sv-missing { margin: 0; font-size: 13.5px; }
.gie-spacer { flex: 1; }
</style>

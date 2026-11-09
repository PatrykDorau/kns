<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, reactive, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Ankiety ASB z kodem QR: „Skąd się dowiedziałeś?” (wbudowane, zasila źródła dotarcia w statystykach) + własne pytania
// (otwarte, jednokrotnego i wielokrotnego wyboru). Goście wypełniają bez logowania na /ankieta?t=<token>.
// Tryby: lista wszystkich ankiet miasta (zakładka „Ankiety”) albo ankiety jednego wydarzenia (zakładka w oknie wydarzenia).
export const SOURCE_OPTS = [['src_friends', 'Znajomi / zaproszenie'], ['src_social', 'Social media'], ['src_posters', 'Plakat / ulotka'], ['src_regular', 'Przychodzę regularnie'], ['src_other', 'Inaczej']]
const TYPES = { open: 'Otwarte', one: 'Jeden wybór', many: 'Wiele wyborów' }
const SOURCE_Q = () => ({ id: 'zrodlo', type: 'source', text: 'Skąd się dowiedziałeś(-aś) o spotkaniu?' })

export default defineComponent({
  props: { surveys: { type: Array, default: () => [] }, answers: { type: Array, default: () => [] }, events: { type: Array, default: () => [] }, city: { type: String, default: 'Poznań' }, eventId: { type: String, default: '' } },
  emits: ['changed'],
  setup(props, { emit }) {
    const app = useApp()
    const st = reactive({ edit: null, open: '', saving: false, error: '', qr: {}, copied: '' })
    const list = computed(() => props.surveys.filter(s => (props.eventId ? s.event_id === props.eventId : s.city === props.city)))
    const answersOf = id => props.answers.filter(a => a.survey === id)
    const evName = id => props.events.find(e => e.id === id)?.name || ''
    const link = s => location.origin + '/ankieta?t=' + s.token
    const uid = () => 'S-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    // w trybie wydarzenia od razu rozwinięta jedyna ankieta
    watch(list, l => { if (props.eventId && l.length === 1 && !st.open) st.open = l[0].id }, { immediate: true })

    function openEdit(s = null) {
      const ev = props.events.find(e => e.id === props.eventId)
      st.edit = s
        ? { ...s, questions: s.questions.map(q => ({ ...q, optionsText: (q.options || []).join('\n') })), hasSource: s.questions.some(q => q.type === 'source') }
        : { _new: true, id: uid(), city: props.city, event_id: props.eventId || null, title: ev ? ev.name : '', intro: '', open: true, hasSource: true,
            questions: [SOURCE_Q(), { id: 'q' + Date.now().toString(36), type: 'one', text: 'Czy jesteś na ASB pierwszy raz?', optionsText: 'Tak\nNie' }] }
      st.error = ''
    }
    const addQ = type => st.edit.questions.push({ id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), type, text: '', optionsText: type === 'open' ? '' : '' })
    const moveQ = (i, d) => { const q = st.edit.questions, j = i + d; if (j < 0 || j >= q.length) return; [q[i], q[j]] = [q[j], q[i]] }
    function toggleSource() {
      const q = st.edit.questions, i = q.findIndex(x => x.type === 'source')
      if (st.edit.hasSource && i < 0) q.unshift(SOURCE_Q()); if (!st.edit.hasSource && i >= 0) q.splice(i, 1)
    }
    async function save() {
      const e = st.edit
      if (!e.title.trim()) { st.error = 'Podaj tytuł ankiety.'; return }
      const questions = []
      for (const q of e.questions) {
        if (q.type === 'source') { questions.push({ id: q.id, type: 'source', text: q.text.trim() || SOURCE_Q().text }); continue }
        if (!q.text.trim()) continue
        const options = q.type === 'open' ? [] : [...new Set(String(q.optionsText || '').split('\n').map(x => x.trim()).filter(Boolean))].slice(0, 20)
        if (q.type !== 'open' && options.length < 2) { st.error = `Pytanie „${q.text.trim()}” potrzebuje co najmniej 2 odpowiedzi (każda w osobnej linii).`; return }
        questions.push({ id: q.id, type: q.type, text: q.text.trim().slice(0, 300), ...(options.length ? { options } : {}) })
      }
      if (!questions.length) { st.error = 'Dodaj przynajmniej jedno pytanie.'; return }
      st.saving = true; st.error = ''
      try {
        await app.api.call('asbSurveySave', { ...e, title: e.title.trim(), intro: e.intro.trim(), questions })
        st.open = e.id; st.edit = null; emit('changed')
      } catch (x) { st.error = x.message } finally { st.saving = false }
    }
    async function setOpen(s, open) { try { await app.api.call('asbSurveySave', { ...s, open }); emit('changed') } catch (x) { st.error = x.message } }
    async function remove(s) {
      const n = answersOf(s.id).length
      if (!(await ask(`Ankieta „${s.title}”${n ? ' i ' + n + ' odpowiedzi' : ''} znikną. Kod QR przestanie działać.`, { title: 'Usunąć ankietę?', ok: 'Usuń', danger: true }))) return
      try { await app.api.call('asbSurveyDelete', { id: s.id }); st.open = ''; emit('changed') } catch (x) { st.error = x.message }
    }
    async function qr(s) {
      if (st.qr[s.id]) return
      try { await app.loadQrLib(); st.qr[s.id] = app.qrPng(link(s)) } catch (x) { st.error = x.message }
    }
    watch(() => st.open, id => { const s = props.surveys.find(x => x.id === id); if (s) qr(s) }, { immediate: true })
    async function copy(s) { try { await navigator.clipboard.writeText(link(s)); st.copied = s.id; setTimeout(() => { st.copied = '' }, 1800) } catch { st.error = 'Nie udało się skopiować — zaznacz link ręcznie.' } }

    // wyniki pytania: wybory — liczby i procenty, otwarte — lista odpowiedzi
    function results(s, q) {
      const vals = answersOf(s.id).map(a => a.answers?.[q.id]).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length))
      if (q.type === 'open') return { n: vals.length, texts: vals.map(String) }
      const opts = q.type === 'source' ? SOURCE_OPTS : (q.options || []).map(o => [o, o])
      const counts = opts.map(([k, label]) => ({ k, label, n: vals.filter(v => (Array.isArray(v) ? v.includes(k) : v === k)).length }))
      return { n: vals.length, counts, max: Math.max(1, ...counts.map(c => c.n)) }
    }
    function csv(s) {
      const qs = s.questions, rows = [['Data', ...qs.map(q => q.text)]]
      const lab = (q, v) => (q.type === 'source' ? SOURCE_OPTS.find(o => o[0] === v)?.[1] || v : v)
      for (const a of answersOf(s.id)) rows.push([new Date(a.created).toLocaleString('pl-PL'), ...qs.map(q => { const v = a.answers?.[q.id]; return v == null ? '' : Array.isArray(v) ? v.map(x => lab(q, x)).join('; ') : lab(q, v) })])
      const text = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n')
      const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); el.download = 'ankieta-' + (s.title || 'asb').toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-') + '.csv'; el.click()
    }
    const dmy = d => (d ? new Date(d).toLocaleDateString('pl-PL') : '')
    const evOptions = computed(() => props.events.filter(e => e.city === props.city).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    return { st, TYPES, list, answersOf, evName, link, openEdit, addQ, moveQ, toggleSource, save, setOpen, remove, copy, results, csv, dmy, evOptions }
  },
})
</script>

<template>
  <div class="sv">
    <div class="sv-head">
      <p class="sv-sub">{{ eventId ? 'Ankieta tego wydarzenia: kod QR do wyświetlenia na spotkaniu albo wydruku. Odpowiedzi „Skąd się dowiedziałeś?” podpowiadają źródła w zakładce „Dane”.' : 'Kod QR z pytaniem „Skąd się dowiedziałeś?” i własnymi pytaniami. Wypełnia się bez logowania; ankietę można podpiąć pod wydarzenie.' }}</p>
      <button class="primary" @click="openEdit()"><svg class="i"><use href="#plus"/></svg>{{ eventId ? 'Ankieta dla wydarzenia' : 'Nowa ankieta' }}</button>
    </div>
    <p v-if="st.error && !st.edit" class="error">{{ st.error }}</p>
    <p v-if="!list.length" class="note">{{ eventId ? 'To wydarzenie nie ma jeszcze ankiety.' : 'Nie ma jeszcze ankiet.' }}</p>

    <article v-for="s in list" :key="s.id" class="sv-item" :class="{ open: st.open === s.id }">
      <button class="sv-row" :aria-expanded="st.open === s.id" @click="st.open = st.open === s.id ? '' : s.id">
        <span class="sv-main"><b>{{ s.title }}</b><small>{{ [evName(s.event_id), dmy(s.created)].filter(Boolean).join(' · ') }}</small></span>
        <span class="sv-pill" :class="{ off: !s.open }">{{ s.open ? 'Zbiera odpowiedzi' : 'Zamknięta' }}</span>
        <span class="sv-n"><b>{{ answersOf(s.id).length }}</b><small>odp.</small></span>
        <svg class="i sv-chev"><use href="#down"/></svg>
      </button>
      <div v-if="st.open === s.id" class="sv-body">
        <div class="sv-share">
          <img v-if="st.qr[s.id]" :src="st.qr[s.id]" alt="Kod QR do ankiety" class="sv-qr">
          <div class="sv-share-txt">
            <small>Link do ankiety</small>
            <code>{{ link(s) }}</code>
            <div class="sv-btns">
              <button @click="copy(s)"><svg class="i"><use href="#link"/></svg>{{ st.copied === s.id ? 'Skopiowano' : 'Kopiuj link' }}</button>
              <a v-if="st.qr[s.id]" class="btn" :href="st.qr[s.id]" :download="'qr-ankieta.png'"><svg class="i"><use href="#download"/></svg>Kod QR (PNG)</a>
              <button :disabled="!answersOf(s.id).length" @click="csv(s)"><svg class="i"><use href="#file"/></svg>CSV</button>
            </div>
            <div class="sv-btns">
              <button @click="setOpen(s, !s.open)">{{ s.open ? 'Zamknij ankietę' : 'Otwórz ponownie' }}</button>
              <button @click="openEdit(s)"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
              <button class="danger" @click="remove(s)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
            </div>
          </div>
        </div>
        <div class="sv-results">
          <section v-for="q in s.questions" :key="q.id" class="sv-q">
            <h4>{{ q.text }}<small>{{ results(s, q).n }} odp.</small></h4>
            <template v-if="q.type === 'open'">
              <p v-if="!results(s, q).texts.length" class="note">Brak odpowiedzi.</p>
              <ul class="sv-open"><li v-for="(t, i) in results(s, q).texts" :key="i">{{ t }}</li></ul>
            </template>
            <div v-else class="sv-bars">
              <div v-for="c in results(s, q).counts" :key="c.k" class="sv-bar" :title="c.label + ': ' + c.n">
                <span>{{ c.label }}</span>
                <span class="sv-track"><i :style="{ width: (c.n ? Math.max(2, c.n / results(s, q).max * 100) : 0) + '%' }"></i></span>
                <b>{{ c.n }}<small v-if="results(s, q).n"> · {{ Math.round(c.n / results(s, q).n * 100) }}%</small></b>
              </div>
            </div>
          </section>
        </div>
      </div>
    </article>

    <Teleport to="body">
      <div v-if="st.edit" class="np-overlay" @click.self="st.edit = null" @keydown.esc="st.edit = null">
        <div class="np-panel sv-dlg" role="dialog" aria-modal="true" :aria-label="st.edit._new ? 'Nowa ankieta' : 'Ankieta'">
          <div class="sv-dhead"><b>{{ st.edit._new ? 'Nowa ankieta' : 'Ankieta' }}</b><button class="icon" aria-label="Zamknij" @click="st.edit = null"><svg class="i"><use href="#x"/></svg></button></div>
          <div class="sv-dbody">
            <label class="sv-f">Tytuł (widzi go wypełniający)<input v-model="st.edit.title" maxlength="120" placeholder="np. Od okultysty do pastora" autocomplete="off"></label>
            <label class="sv-f">Wstęp (opcjonalnie)<textarea v-model="st.edit.intro" rows="2" maxlength="600" placeholder="np. Dzięki, że jesteś! Trzy krótkie pytania."></textarea></label>
            <label v-if="!eventId" class="sv-f">Wydarzenie w statystykach<select v-model="st.edit.event_id" class="field"><option :value="null">— bez wydarzenia —</option><option v-for="e in evOptions" :key="e.id" :value="e.id">{{ e.date ? e.date.slice(8, 10) + '.' + e.date.slice(5, 7) + '.' + e.date.slice(0, 4) + ' · ' : '' }}{{ e.name }}</option></select></label>
            <label class="sv-check"><input v-model="st.edit.hasSource" type="checkbox" @change="toggleSource"><span><b>Pytanie „Skąd się dowiedziałeś?”</b><small>Stałe odpowiedzi (znajomi, social media, plakat, regularnie, inaczej) — podpowiadają źródła dotarcia w statystykach wydarzenia.</small></span></label>
            <h4>Pytania</h4>
            <div v-for="(q, i) in st.edit.questions" :key="q.id" class="sv-qe" :class="{ src: q.type === 'source' }">
              <div class="sv-qe-top">
                <input v-model="q.text" :placeholder="q.type === 'source' ? 'Skąd się dowiedziałeś(-aś) o spotkaniu?' : 'Treść pytania'" maxlength="300" :aria-label="'Pytanie ' + (i + 1)">
                <select v-if="q.type !== 'source'" v-model="q.type" class="field" aria-label="Rodzaj pytania"><option v-for="(v, k) in TYPES" :key="k" :value="k">{{ v }}</option></select>
                <span v-else class="sv-tag">Źródło dotarcia</span>
              </div>
              <textarea v-if="q.type === 'one' || q.type === 'many'" v-model="q.optionsText" rows="3" placeholder="Odpowiedzi — każda w osobnej linii" aria-label="Odpowiedzi do wyboru"></textarea>
              <div class="sv-qe-btns">
                <button class="icon" aria-label="W górę" :disabled="!i" @click="moveQ(i, -1)"><svg class="i"><use href="#up"/></svg></button>
                <button class="icon" aria-label="W dół" :disabled="i === st.edit.questions.length - 1" @click="moveQ(i, 1)"><svg class="i"><use href="#down"/></svg></button>
                <button v-if="q.type !== 'source'" class="icon" aria-label="Usuń pytanie" @click="st.edit.questions.splice(i, 1)"><svg class="i"><use href="#trash"/></svg></button>
              </div>
            </div>
            <div class="sv-add">
              <button @click="addQ('open')"><svg class="i"><use href="#plus"/></svg>Pytanie otwarte</button>
              <button @click="addQ('one')"><svg class="i"><use href="#plus"/></svg>Jeden wybór</button>
              <button @click="addQ('many')"><svg class="i"><use href="#plus"/></svg>Wiele wyborów</button>
            </div>
            <p v-if="!st.edit._new && answersOf(st.edit.id).length" class="sv-sub">Ankieta ma już odpowiedzi — zmiana treści pytań nie zmienia tego, co ktoś już zaznaczył.</p>
          </div>
          <p v-if="st.error" class="error">{{ st.error }}</p>
          <div class="sv-dfoot"><span></span><button @click="st.edit = null">Anuluj</button><button class="primary" :disabled="st.saving" @click="save">{{ st.edit._new ? 'Utwórz i pokaż kod QR' : 'Zapisz' }}</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sv { display: flex; flex-direction: column; gap: 10px; }
.sv-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.sv-sub { flex: 1 1 300px; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.sv-item { border-radius: 16px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.sv-item.open { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.sv-row { display: flex !important; align-items: center; gap: 12px; width: 100%; padding: 12px 14px !important; min-height: 0 !important; border: 0 !important; border-radius: 0 !important; background: none !important; color: var(--text) !important; font-weight: 400 !important; text-align: left; box-shadow: none !important; justify-content: flex-start !important; }
.sv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sv-main b { font-size: 14.5px; font-weight: 600; }
.sv-main small { color: var(--muted); font-size: 12.5px; }
.sv-pill { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
.sv-pill.off { background: var(--panel2); color: var(--muted); }
.sv-n { flex: none; display: flex; flex-direction: column; align-items: flex-end; min-width: 44px; }
.sv-n b { font-size: 17px; font-variant-numeric: tabular-nums; }
.sv-n small { color: var(--muted); font-size: 11px; }
.sv-chev { width: 16px; height: 16px; color: var(--muted); transition: transform .2s; }
.sv-row[aria-expanded=true] .sv-chev { transform: rotate(180deg); }
.sv-body { padding: 4px 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.sv-share { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; padding: 12px; border-radius: 14px; background: var(--panel2); }
.sv-qr { width: 132px; height: 132px; border-radius: 10px; background: #fff; flex: none; }
.sv-share-txt { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.sv-share-txt small { color: var(--muted); font-size: 12px; }
.sv-share-txt code { font-size: 12.5px; word-break: break-all; color: var(--text); }
.sv-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-btns button, .sv-btns .btn { min-height: 36px !important; padding: 0 12px !important; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.sv-btns .btn { border-radius: 999px; border: 1px solid var(--line); color: var(--text); text-decoration: none; }
.sv-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.sv-q h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; display: flex; gap: 8px; align-items: baseline; justify-content: space-between; }
.sv-q h4 small { color: var(--muted); font-weight: 400; font-size: 12px; flex: none; }
.sv-bars { display: flex; flex-direction: column; gap: 6px; }
.sv-bar { display: grid; grid-template-columns: minmax(90px, 40%) 1fr auto; gap: 8px; align-items: center; font-size: 13px; }
.sv-bar > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sv-track { position: relative; height: 12px; }
.sv-track::before { content: ''; position: absolute; left: 0; top: -3px; bottom: -3px; width: 1px; background: color-mix(in srgb, var(--muted) 55%, transparent); }
.sv-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 0 4px 4px 0; background: var(--accent); }
.sv-bar b { font-variant-numeric: tabular-nums; min-width: 54px; text-align: right; }
.sv-bar b small { color: var(--muted); font-weight: 400; }
.sv-open { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.sv-open li { padding: 8px 10px; border-radius: 10px; background: var(--panel2); font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; }
.sv-dlg { gap: 10px; }
@media (min-width: 720px) { .sv-dlg { width: min(640px, 100%) !important; } }
.sv-dhead { display: flex; align-items: center; justify-content: space-between; }
.sv-dhead b { font-size: 17px; }
.sv-dbody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 10px; padding: 2px; }
.sv-dbody h4 { margin: 6px 0 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.sv-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
.sv-f input, .sv-f textarea, .sv-f select { width: 100%; font-size: 15px; color: var(--text); }
.sv-f input, .sv-f select { min-height: 48px; }
.sv-check { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--panel2); cursor: pointer; }
.sv-check input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
.sv-check span { display: flex; flex-direction: column; gap: 2px; }
.sv-check b { font-size: 14px; }
.sv-check small { color: var(--muted); font-size: 12.5px; }
.sv-qe { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 10px; border-radius: 12px; background: var(--panel2); }
.sv-qe.src { border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
.sv-qe-top { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-qe-top input { flex: 1 1 220px; min-height: 44px; font-size: 15px; }
.sv-qe-top select { flex: 0 0 150px; height: 44px; }
.sv-qe textarea { grid-column: 1; font-size: 14px; }
.sv-qe-btns { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 2px; }
.sv-tag { align-self: center; padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent-text); font-size: 12px; font-weight: 600; }
.sv-add { display: flex; gap: 6px; flex-wrap: wrap; }
.sv-add button { min-height: 38px !important; font-size: 13px; }
.sv-dfoot { display: flex; gap: 8px; align-items: center; }
.sv-dfoot > span { flex: 1; }
@media (max-width: 560px) { .sv-pill { display: none; } }
</style>

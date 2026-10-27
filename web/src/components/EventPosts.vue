<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, reactive, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Wpisy pod wydarzeniem (wydarzenia-wpisy.sql): aktualności dla uczestników — dodaje twórca, osoby zarządzające
// i osoby z prawem edycji; czytają wszyscy, którzy widzą wydarzenie. Twórca dodaje osoby zarządzające.
export default defineComponent({
  props: { ev: { type: Object, required: true } },
  setup(props) {
    const app = useApp()
    const st = reactive({ loaded: false, canPost: false, canManage: false, managers: [], posts: [], text: '', busy: false, error: '', pick: false, people: [], query: '' })
    async function load() {
      try {
        const r = await app.api.call('eventFeed', { id: props.ev.id })
        Object.assign(st, { canPost: !!r?.canPost, canManage: !!r?.canManage, managers: r?.managers || [], posts: r?.posts || [], error: '' })
      } catch (e) { st.error = e.message || String(e) } finally { st.loaded = true }
    }
    watch(() => props.ev.id, id => { st.loaded = false; st.posts = []; st.pick = false; if (id) load() }, { immediate: true })
    const run = async (fn, msg = '') => {
      st.busy = true; st.error = ''
      try { await fn(); await load(); if (msg) app.showToast(msg) } catch (e) { st.error = e.message || String(e) } finally { st.busy = false }
    }
    const add = () => run(async () => { await app.api.call('eventPostAdd', { id: props.ev.id, text: st.text }); st.text = '' }, 'Wpis dodany.')
    const remove = async p => { if (await ask('Usunąć ten wpis?', { ok: 'Usuń', danger: true })) run(() => app.api.call('eventPostRemove', { id: p.id }), 'Usunięto wpis.') }
    async function openPick() {
      st.pick = !st.pick; st.query = ''
      if (st.pick && !st.people.length) try { st.people = await app.api.call('eventManagerCandidates', { id: props.ev.id }) } catch (e) { st.error = e.message }
    }
    const setManager = (p, on) => run(() => app.api.call('eventManagerSet', { id: props.ev.id, person: p.id, on }), on ? p.name + ' zarządza wydarzeniem.' : '')
    const shown = () => {
      const q = st.query.trim().toLowerCase(), have = new Set(st.managers.map(m => m.id))
      return st.people.filter(p => !have.has(p.id) && (!q || p.name.toLowerCase().includes(q))).slice(0, 8)
    }
    const when = t => new Date(t).toLocaleString('pl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return { st, add, remove, openPick, setManager, shown, when }
  },
})
</script>

<template>
  <section v-if="st.loaded && (st.posts.length || st.canPost)" class="evp">
    <h3 class="view-h">Wpisy</h3>
    <form v-if="st.canPost" class="evp-new" @submit.prevent="add">
      <textarea v-model="st.text" class="short" maxlength="4000" placeholder="Napisz wpis dla uczestników — np. zmiana godziny, co zabrać, zdjęcia po wydarzeniu…" aria-label="Treść wpisu"></textarea>
      <div class="bar"><button class="primary" type="submit" :disabled="st.busy || st.text.trim().length < 2"><svg class="i"><use href="#plus"/></svg>Dodaj wpis</button></div>
    </form>
    <p v-if="!st.posts.length" class="note">Nie ma jeszcze wpisów. Zapisani na wydarzenie dostaną każdy nowy wpis do skrzynki.</p>
    <article v-for="p in st.posts" :key="p.id" class="evp-post">
      <p class="evp-text">{{ p.text }}</p>
      <small class="evp-meta">{{ p.author }} · {{ when(p.created) }}
        <button v-if="p.mine || st.canManage" class="linkbtn" type="button" :disabled="st.busy" @click="remove(p)">Usuń</button></small>
    </article>

    <!-- osoby zarządzające: widzą je twórca, zarządzający i edytorzy; dodaje twórca -->
    <div v-if="st.canPost" class="evp-managers">
      <small class="muted">Zarządzają (mogą dodawać wpisy):</small>
      <span v-if="!st.managers.length" class="muted">tylko twórca</span>
      <span v-for="m in st.managers" :key="m.id" class="ev-person">{{ m.name }}<button v-if="st.canManage" type="button" :aria-label="'Usuń ' + m.name" @click="setManager(m, false)"><svg class="i"><use href="#x"/></svg></button></span>
      <button v-if="st.canManage" class="small" type="button" @click="openPick"><svg class="i"><use href="#plus"/></svg>Dodaj osobę</button>
    </div>
    <div v-if="st.pick" class="evp-pick">
      <input v-model="st.query" type="search" placeholder="Szukaj osoby" aria-label="Szukaj osoby" autocomplete="off">
      <button v-for="p in shown()" :key="p.id" class="small" type="button" :disabled="st.busy" @click="setManager(p, true)">{{ p.name }}</button>
    </div>
    <p v-if="st.error" class="error">{{ st.error }}</p>
  </section>
</template>

<style scoped>
.evp { display: flex; flex-direction: column; gap: 10px; }
.evp-new textarea { margin: 0; }
.evp-new .bar { margin-top: 8px; }
.evp-post { padding: 12px 14px; border-radius: 14px; background: var(--panel2); }
.evp-text { margin: 0; white-space: pre-wrap; line-height: 1.5; }
.evp-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--muted); font-size: 12.5px; }
.evp-managers, .evp-pick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.evp-pick input { flex: 1 1 100%; margin: 0; }
</style>

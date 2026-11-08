<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive, ref } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Projekty i zadania (wzór: Avenit): tablica całego kościoła i każdej mojej służby. Zadania pogrupowane według
// statusu, przy każdym osoba, termin i priorytet. Lider (albo prawo edycji przy tablicy kościoła) dodaje i zmienia,
// osoba przypisana zmienia status jednym kliknięciem.
const STATUS = [['todo', 'Do zrobienia'], ['doing', 'W trakcie'], ['blocked', 'Zablokowane'], ['done', 'Zrobione']]
const PRIO = { low: 'Niski', normal: 'Zwykły', high: 'Pilne' }
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ boards: [], board: '', busy: false, error: '', only: false })
    const form = ref(null) // edytowane / nowe zadanie
    async function load() {
      try { st.boards = (await app.api.call('tasks')) || []; if (!st.boards.some(b => b.id === st.board)) st.board = st.boards[0]?.id ?? '' } catch (e) { st.error = e.message }
    }
    onMounted(load)
    const board = computed(() => st.boards.find(b => b.id === st.board))
    const groups = computed(() => STATUS.map(([id, name]) => ({ id, name, tasks: (board.value?.tasks || []).filter(t => t.status === id && (!st.only || t.mine)) })).filter(g => g.tasks.length || g.id !== 'blocked'))
    const open = b => (b.tasks || []).filter(t => t.status !== 'done').length
    const today = () => app.todayStr.value
    const dueLabel = d => {
      if (!d) return ''
      const n = Math.round((new Date(d + 'T12:00').getTime() - new Date(today() + 'T12:00').getTime()) / 864e5)
      return n < 0 ? 'po terminie · ' + app.shortDate(d) : n === 0 ? 'dziś' : n === 1 ? 'jutro' : app.shortDate(d)
    }
    const late = t => t.due && t.status !== 'done' && t.due < today()
    function edit(t) { form.value = t ? { ...t } : { id: '', title: '', notes: '', status: 'todo', priority: 'normal', assignee: '', due: '' } }
    async function save() {
      st.busy = true; st.error = ''
      try { await app.api.call('taskSave', { ...form.value, board: st.board }); form.value = null; await load(); app.loadMyTasks() } catch (e) { st.error = e.message } finally { st.busy = false }
    }
    async function setStatus(t, s) {
      const before = t.status; t.status = s
      try { await app.api.call('taskStatus', { id: t.id, status: s }); app.loadMyTasks() } catch (e) { t.status = before; st.error = e.message }
    }
    async function remove() {
      if (!(await ask('Usunąć zadanie „' + form.value.title + '”?', { ok: 'Usuń', danger: true }))) return
      try { await app.api.call('taskDelete', { id: form.value.id }); form.value = null; await load() } catch (e) { st.error = e.message }
    }
    const canStatus = t => board.value?.edit || t.mine
    return { ...app, st, board, groups, open, dueLabel, late, form, edit, save, setStatus, remove, canStatus, STATUS, PRIO }
  },
})
</script>

<template>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <div class="tk-boards" role="tablist" aria-label="Tablice">
    <button v-for="b in st.boards" :key="b.id" role="tab" class="filter" :class="{ on: st.board === b.id }" :aria-selected="st.board === b.id" @click="st.board = b.id; form = null">
      {{ b.name }}<small v-if="open(b)">{{ open(b) }}</small>
    </button>
  </div>

  <template v-if="board">
    <div class="tk-bar">
      <label class="tk-only"><input v-model="st.only" type="checkbox"> Tylko moje</label>
      <button v-if="board.edit && !form" class="primary small" @click="edit(null)"><svg class="i"><use href="#plus"/></svg>Nowe zadanie</button>
    </div>

    <!-- formularz: nowe albo edycja -->
    <form v-if="form" class="tk-form card" @submit.prevent="save">
      <input v-model="form.title" maxlength="200" placeholder="Co jest do zrobienia?" aria-label="Zadanie" required>
      <div class="tk-fields">
        <label>Osoba<select v-model="form.assignee"><option value="">nikt</option><option v-for="p in board.people" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>Termin<input v-model="form.due" type="date"></label>
        <label>Priorytet<select v-model="form.priority"><option v-for="(n, k) in PRIO" :key="k" :value="k">{{ n }}</option></select></label>
        <label>Status<select v-model="form.status"><option v-for="[k, n] in STATUS" :key="k" :value="k">{{ n }}</option></select></label>
      </div>
      <textarea v-model="form.notes" rows="3" maxlength="4000" placeholder="Szczegóły (opcjonalnie)"></textarea>
      <div class="row">
        <button class="primary" :disabled="st.busy || !form.title.trim()">{{ form.id ? 'Zapisz' : 'Dodaj zadanie' }}</button>
        <button type="button" @click="form = null">Anuluj</button>
        <button v-if="form.id" type="button" class="ghost tk-del" @click="remove">Usuń</button>
      </div>
    </form>

    <section v-for="g in groups" :key="g.id" class="tk-group" :class="'g-' + g.id">
      <h3 class="tk-h"><i></i>{{ g.name }}<small>{{ g.tasks.length }}</small></h3>
      <p v-if="!g.tasks.length" class="tk-empty">{{ g.id === 'todo' ? 'Nic do zrobienia.' : '—' }}</p>
      <div v-for="t in g.tasks" :key="t.id" class="tk-row" :class="{ mine: t.mine }">
        <button class="tk-check" :class="{ on: t.status === 'done' }" :disabled="!canStatus(t)" :aria-label="t.status === 'done' ? 'Oznacz jako niezrobione' : 'Oznacz jako zrobione'" @click="setStatus(t, t.status === 'done' ? 'todo' : 'done')"><svg class="i"><use href="#check"/></svg></button>
        <button class="tk-main" :disabled="!board.edit" @click="edit(t)">
          <b>{{ t.title }}</b>
          <span class="tk-meta">
            <em v-if="t.priority === 'high'" class="tk-prio">Pilne</em>
            <span v-if="t.who" class="tk-who"><i>{{ t.who.split(' ').map(w => w[0]).join('').slice(0, 2) }}</i>{{ t.mine ? 'Ty' : t.who }}</span>
            <span v-if="t.due" :class="{ 'tk-late': late(t) }">{{ dueLabel(t.due) }}</span>
            <span v-if="t.notes" class="tk-note">{{ t.notes.split('\n')[0] }}</span>
          </span>
        </button>
        <select v-if="canStatus(t) && t.status !== 'done'" class="tk-st" :value="t.status" aria-label="Status" @change="setStatus(t, $event.target.value)">
          <option v-for="[k, n] in STATUS" :key="k" :value="k">{{ n }}</option>
        </select>
      </div>
    </section>
  </template>
  <p v-else-if="!st.error" class="note">Wczytywanie…</p>
</template>

<style scoped>
.tk-boards { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 12px; scrollbar-width: none; }
.tk-boards button { flex: none; display: inline-flex; gap: 6px; align-items: center; }
.tk-boards small { padding: 0 6px; border-radius: 999px; background: var(--accent); color: #2a1906; font-size: 11px; font-weight: 700; line-height: 18px; }
.tk-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.tk-only { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; white-space: nowrap; }
.tk-fields select, .tk-fields input, .tk-st { padding-left: 12px !important; font-size: 15px; color: var(--text); min-height: 42px; }
.tk-form { display: grid !important; gap: 10px; padding: 16px !important; margin-bottom: 14px; }
.tk-form > input { font-size: 17px; font-weight: 600; }
.tk-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.tk-fields label { display: grid; gap: 4px; color: var(--muted); font-size: 13px; }
.tk-del { margin-left: auto; color: var(--bad-text) !important; }
.tk-group { margin-bottom: 18px; }
.tk-h { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 15px; }
.tk-h i { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.g-doing .tk-h i { background: var(--accent); }
.g-blocked .tk-h i { background: var(--bad); }
.g-done .tk-h i { background: var(--ok); }
.tk-h small { color: var(--muted); font-weight: 500; }
.tk-empty { margin: 0 0 6px; color: var(--muted); font-size: 14px; }
.tk-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px; border-radius: 16px; background: var(--panel); }
.tk-row.mine { box-shadow: inset 3px 0 0 var(--accent) !important; }
.tk-check { flex: none; display: grid; place-items: center; width: 28px; height: 28px; min-height: 0 !important; padding: 0 !important; border-radius: 50% !important; border: 2px solid var(--panel3) !important; background: none !important; color: transparent; }
.tk-check.on { background: var(--ok) !important; border-color: var(--ok) !important; color: #0e2416; }
.tk-check svg.i { width: 15px; height: 15px; }
.tk-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 4px 0 !important; min-height: 0 !important; background: none !important; border: 0 !important; text-align: left; border-radius: 0 !important; }
.tk-main:disabled { opacity: 1; cursor: default; }
.tk-main b { font-size: 15px; font-weight: 600; }
.g-done .tk-main b { text-decoration: line-through; color: var(--muted); }
.tk-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--muted); font-size: 13px; }
.tk-who { display: inline-flex; align-items: center; gap: 5px; }
.tk-who i { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--panel2); font-style: normal; font-size: 10px; font-weight: 700; }
.tk-prio { font-style: normal; padding: 1px 8px; border-radius: 999px; background: var(--bad-soft); color: var(--bad-text); font-weight: 600; }
.tk-late { color: var(--bad-text); font-weight: 600; }
.tk-note { max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-st { flex: none; width: auto; min-height: 34px !important; font-size: 13px; padding-top: 4px !important; padding-bottom: 4px !important; }
@media (max-width: 600px) { .tk-st { max-width: 118px; } }
</style>

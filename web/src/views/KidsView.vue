<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, onUnmounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import { ask } from '@/utils/ask'

// Meldowanie dzieci (wzór: Avenit, bez drukarki). Rodzic: swoje dzieci, meldunek do sali i kod odbioru na ekranie.
// Nauczyciel szkółki: dzisiejsze sale z alergiami i wydawanie dziecka po kodzie. Administrator: która służba to szkółka.
export default defineComponent({
  setup() {
    const app = useApp()
    const st = reactive({ me: null, board: [], error: '', busy: false, pick: {}, room: '', form: null, code: '', picked: '', rooms: null })
    async function load() {
      st.error = ''
      try {
        st.me = await app.api.call('kids')
        if (!st.room) st.room = st.me.rooms?.[0] || ''
        if (st.me.teacher) st.board = (await app.api.call('kidsBoard')) || []
      } catch (e) { st.error = e.message }
    }
    onMounted(load)
    // nauczyciel: lista odświeża się co 20 s (meldunki przychodzą z telefonów rodziców)
    const timer = setInterval(() => { if (st.me?.teacher && !document.hidden) app.api.call('kidsBoard').then(b => { st.board = b || [] }).catch(() => null) }, 20000)
    onUnmounted(() => clearInterval(timer))
    const run = async (fn, after = load) => { st.busy = true; st.error = ''; try { await fn(); await after() } catch (e) { st.error = e.message } finally { st.busy = false } }
    const kids = computed(() => st.me?.kids || [])
    const inRoom = computed(() => kids.value.filter(k => k.today && !k.today.out))
    const myCode = computed(() => inRoom.value[0]?.today.code || '')
    const chosen = computed(() => kids.value.filter(k => st.pick[k.id] && !(k.today && !k.today.out)).map(k => k.id))
    const age = b => (b ? new Date().getFullYear() - b + ' l.' : '')
    const checkin = () => run(async () => { await app.api.call('kidCheckin', { kids: chosen.value, room: st.room }); st.pick = {} })
    const edit = k => { st.form = k ? { ...k, born: k.born || '' } : { id: '', name: '', born: '', allergies: '', notes: '' } }
    const save = () => run(async () => { await app.api.call('kidSave', st.form); st.form = null })
    const remove = async () => { if (await ask('Usunąć ' + st.form.name + ' z listy dzieci?', { ok: 'Usuń', danger: true })) run(async () => { await app.api.call('kidDelete', { id: st.form.id }); st.form = null }) }
    const pickup = () => run(async () => { st.picked = ''; const names = await app.api.call('kidPickup', { code: st.code }); st.picked = names; st.code = '' })
    const rooms = computed(() => [...new Set(st.board.map(k => k.room || 'Bez sali'))].map(r => ({ name: r, kids: st.board.filter(k => (k.room || 'Bez sali') === r) })))
    const present = computed(() => st.board.filter(k => !k.out).length)
    const saveRooms = () => run(async () => { await app.api.call('kidsRooms', { rooms: st.rooms.split(',').map(x => x.trim()).filter(Boolean) }); st.rooms = null })
    const setKidsMinistry = (m, on) => run(() => app.api.call('kidsMinistry', { id: m.id, on }))
    return { ...app, st, kids, inRoom, myCode, chosen, age, checkin, edit, save, remove, pickup, rooms, present, saveRooms, setKidsMinistry }
  },
})
</script>

<template>
  <p v-if="st.error" class="error">{{ st.error }}</p>
  <template v-if="st.me">
    <!-- rodzic: kod odbioru, gdy dzieci są w sali -->
    <section v-if="myCode" class="kd-code" aria-live="polite">
      <small>Kod odbioru · pokaż go przy odbiorze</small>
      <b>{{ myCode.split('').join(' ') }}</b>
      <span>{{ inRoom.map(k => k.name + (k.today.room ? ' — ' + k.today.room : '')).join(' · ') }}</span>
    </section>

    <section class="kd-sec">
      <h3 class="hw-h">Moje dzieci<button class="ghost small" @click="edit(null)"><svg class="i"><use href="#plus"/></svg>Dodaj dziecko</button></h3>
      <p v-if="!kids.length && !st.form" class="note">Dodaj swoje dzieci — w niedzielę zameldujesz je jednym kliknięciem, a nauczyciel zobaczy alergie.</p>
      <form v-if="st.form" class="kd-form card" @submit.prevent="save">
        <div class="kd-fields">
          <label>Imię<input v-model="st.form.name" maxlength="80" required></label>
          <label>Rok urodzenia<input v-model="st.form.born" type="number" min="2005" :max="new Date().getFullYear()" inputmode="numeric"></label>
        </div>
        <label>Alergie<input v-model="st.form.allergies" maxlength="300" placeholder="np. orzechy, laktoza — puste, gdy brak"></label>
        <label>Uwagi dla nauczyciela<input v-model="st.form.notes" maxlength="500" placeholder="opcjonalnie"></label>
        <div class="row"><button class="primary" :disabled="st.busy">Zapisz</button><button type="button" @click="st.form = null">Anuluj</button><button v-if="st.form.id" type="button" class="ghost kd-del" @click="remove">Usuń</button></div>
      </form>
      <div v-if="kids.length" class="kd-kids">
        <label v-for="k in kids" :key="k.id" class="kd-kid" :class="{ in: k.today && !k.today.out }">
          <input v-if="!(k.today && !k.today.out)" v-model="st.pick[k.id]" type="checkbox" :aria-label="'Zamelduj ' + k.name">
          <svg v-else class="i kd-ok"><use href="#check"/></svg>
          <span class="kd-who"><b>{{ k.name }}<small v-if="k.born"> · {{ age(k.born) }}</small></b>
            <small v-if="k.today && !k.today.out">w sali {{ k.today.room || '' }}</small><small v-else-if="k.today?.out">dziś odebrane</small>
            <em v-if="k.allergies" class="kd-alg">Alergia: {{ k.allergies }}</em></span>
          <button type="button" class="icon" :aria-label="'Edytuj ' + k.name" @click.prevent="edit(k)"><svg class="i"><use href="#pencil"/></svg></button>
        </label>
      </div>
      <div v-if="kids.some(k => !(k.today && !k.today.out))" class="kd-in">
        <select v-model="st.room" aria-label="Sala"><option v-for="r in st.me.rooms" :key="r" :value="r">{{ r }}</option></select>
        <button class="primary" :disabled="st.busy || !chosen.length" @click="checkin"><svg class="i"><use href="#check"/></svg>Zamelduj{{ chosen.length ? ' (' + chosen.length + ')' : '' }}</button>
      </div>
    </section>

    <!-- nauczyciel: odbiór po kodzie i dzisiejsze sale -->
    <section v-if="st.me.teacher" class="kd-sec">
      <h3 class="hw-h">Sale dziś<small>{{ present }} w salach</small></h3>
      <form class="kd-pick card" @submit.prevent="pickup">
        <label for="kdCode">Odbiór — kod rodzica</label>
        <div><input id="kdCode" v-model="st.code" inputmode="numeric" maxlength="4" pattern="\d{4}" placeholder="0000" autocomplete="off"><button class="primary" :disabled="st.busy || st.code.length !== 4">Wydaj</button></div>
        <p v-if="st.picked" class="kd-picked"><svg class="i"><use href="#check"/></svg>Wydano: <b>{{ st.picked }}</b></p>
      </form>
      <p v-if="!st.board.length" class="note">Dziś nikt jeszcze nie zameldował dziecka.</p>
      <article v-for="r in rooms" :key="r.name" class="kd-room card">
        <b class="kd-rname">{{ r.name }}<small>{{ r.kids.filter(k => !k.out).length }}</small></b>
        <p v-for="k in r.kids" :key="k.kid" class="kd-row" :class="{ out: k.out }">
          <span><b>{{ k.name }}<small v-if="k.born"> · {{ age(k.born) }}</small></b><small>{{ k.parent }}{{ k.notes ? ' · ' + k.notes : '' }}</small></span>
          <em v-if="k.allergies" class="kd-alg">{{ k.allergies }}</em>
          <small v-if="k.out" class="kd-outt">odebrane</small>
        </p>
      </article>
      <div class="kd-rooms">
        <template v-if="st.rooms !== null"><input v-model="st.rooms" aria-label="Sale, po przecinku" placeholder="Sale, po przecinku"><button class="small primary" @click="saveRooms">Zapisz</button></template>
        <template v-else><small>Sale: {{ (st.me.rooms || []).join(', ') }}</small><button class="ghost small" @click="st.rooms = (st.me.rooms || []).join(', ')">Zmień</button></template>
      </div>
    </section>

    <!-- administrator: służba szkółki -->
    <details v-if="st.me.manage" class="kd-sec kd-admin">
      <summary>Nauczyciele: która służba to szkółka?</summary>
      <label v-for="m in st.me.ministries" :key="m.id" class="check"><input type="checkbox" :checked="m.kids" @change="setKidsMinistry(m, $event.target.checked)">{{ m.name }}</label>
    </details>
  </template>
  <p v-else-if="!st.error" class="note">Wczytywanie…</p>
</template>

<style scoped>
.kd-code { display: grid; justify-items: center; gap: 6px; padding: 22px 16px; margin-bottom: 16px; border-radius: 24px; background: var(--accent); color: #2a1906; text-align: center; }
.kd-code small { font-size: 14px; font-weight: 600; opacity: .8; }
.kd-code b { font: 700 56px/1 var(--display); letter-spacing: .08em; font-variant-numeric: tabular-nums; }
.kd-code span { font-size: 15px; font-weight: 500; }
.kd-sec { margin-bottom: 22px; }
.kd-sec .hw-h { display: flex; align-items: center; gap: 10px; }
.kd-sec .hw-h button { margin-left: auto; }
.kd-form { display: grid !important; gap: 10px; padding: 16px !important; margin-bottom: 12px; }
.kd-form label { display: grid; gap: 4px; color: var(--muted); font-size: 13px; }
.kd-form input { font-size: 15px; color: var(--text); padding-left: 12px !important; }
.kd-fields { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
.kd-del { margin-left: auto; color: var(--bad-text) !important; }
.kd-kids { display: grid; gap: 8px; }
.kd-kid { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; background: var(--panel); cursor: pointer; }
.kd-kid input[type=checkbox] { width: 22px; height: 22px; flex: none; }
.kd-kid.in { box-shadow: inset 3px 0 0 var(--ok) !important; }
.kd-ok { flex: none; width: 22px; height: 22px; color: var(--ok-text); }
.kd-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.kd-who b { font-size: 16px; }
.kd-who b small, .kd-row b small { font-weight: 400; color: var(--muted); }
.kd-who small { color: var(--muted); font-size: 13px; }
.kd-alg { align-self: flex-start; font-style: normal; padding: 2px 9px; border-radius: 999px; background: var(--bad-soft); color: var(--bad-text); font-size: 12.5px; font-weight: 600; }
.kd-in { display: flex; gap: 8px; margin-top: 10px; }
.kd-in select { flex: 1; min-width: 0; }
.kd-pick { display: grid !important; gap: 6px; padding: 14px 16px !important; margin-bottom: 12px; }
.kd-pick label { color: var(--muted); font-size: 13px; }
.kd-pick div { display: flex; gap: 8px; }
.kd-pick input { flex: 1; min-width: 0; font: 700 24px/1 var(--display); letter-spacing: .3em; text-align: center; }
.kd-picked { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; color: var(--ok-text); }
.kd-picked svg.i { width: 18px; height: 18px; }
.kd-room { display: block !important; padding: 12px 16px !important; margin-bottom: 10px; }
.kd-rname { display: flex; justify-content: space-between; font-size: 15px; margin-bottom: 4px; }
.kd-rname small { color: var(--muted); }
.kd-row { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 0; border-top: 1px solid var(--line); }
.kd-row span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.kd-row span > small { color: var(--muted); font-size: 12.5px; }
.kd-row.out { opacity: .5; }
.kd-outt { color: var(--muted); }
.kd-rooms { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.kd-rooms small { color: var(--muted); font-size: 13px; }
.kd-rooms input { flex: 1; }
.kd-admin summary { cursor: pointer; color: var(--muted); font-size: 14px; margin-bottom: 8px; }
</style>

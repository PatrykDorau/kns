<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { computed, defineComponent, onMounted, reactive } from 'vue'
import { useApp } from '@/composables/useApp'
import AvailabilityPanel from '@/components/AvailabilityPanel.vue'

// „Moja służba”: służby, w których służę albo którymi kieruję — informacje wewnętrzne (zmienia lider),
// dyspozycyjność na niedziele, pliki tylko dla tej służby (z „Materiałów”), wiadomość do całej służby (lider), ASB — terminarz i grafik.
export default defineComponent({
  components: { AvailabilityPanel },
  setup() {
    const app = useApp()
    const mine = computed(() => app.serve.list.filter(m => m.mine === 'active' || m.leader || (m.id === 'asb' && app.canAsb.value)))
    const edit = reactive({}) // id służby → tekst w edycji
    onMounted(() => { app.loadProtocols(true) })
    return { ...app, mine, edit }
  },
})
</script>

<template>
  <p v-if="!mine.length" class="note">Nie należysz jeszcze do żadnej służby — zgłoś się w „Wszystkie służby”.</p>
  <div class="mm-list">
  <article v-for="m in mine" :key="m.id" class="ministry mm-card">
    <!-- nagłówek: nazwa, lider, wiadomość do służby -->
    <div class="mn-head mm-head"><span class="mn-ic"><svg class="i"><use href="#users"/></svg></span><b>{{ m.name }}</b><span v-if="m.leader" class="ann-tag pin">lider</span>
      <span class="mm-spacer"></span>
      <button v-if="m.leader || (m.lead && canMsg)" class="icon mm-msg" title="Wiadomość do całej służby" aria-label="Wiadomość do służby" @click="openMsg({ ministries: [m.id] })"><svg class="i"><use href="#megaphone"/></svg></button>
    </div>

    <!-- dyspozycyjność na najbliższe niedziele -->
    <AvailabilityPanel :ministry="m.id" />

    <!-- informacje wewnętrzne (zwinięte — w nagłówku początek tekstu) -->
    <details class="mm-sec" :open="edit[m.id] !== undefined">
      <summary><small class="mm-lbl">Informacje</small><span class="mm-peek">{{ m.internal ? m.internal.split('\n')[0] : m.lead ? 'brak — dodaj dla służby' : 'lider nie dodał jeszcze' }}</span><svg class="i mm-chev"><use href="#down"/></svg></summary>
      <template v-if="edit[m.id] !== undefined">
        <textarea v-model="edit[m.id]" rows="4" maxlength="5000" placeholder="np. kto ma klucze, gdzie są kable, zasady, kontakty"></textarea>
        <div class="row"><button class="primary small" :disabled="busy" @click="saveMinistryInternal(m, edit[m.id]); delete edit[m.id]">Zapisz</button><button class="small" @click="delete edit[m.id]">Anuluj</button></div>
      </template>
      <template v-else>
        <p v-if="m.internal" class="mm-text">{{ m.internal }}</p>
        <button v-if="m.lead" class="ghost small" @click="edit[m.id] = m.internal || ''"><svg class="i"><use href="#pencil"/></svg>{{ m.internal ? 'Zmień' : 'Dodaj informacje' }}</button>
      </template>
    </details>

    <!-- pliki tylko dla tej służby -->
    <details class="mm-sec">
      <summary><small class="mm-lbl">Pliki</small><span class="mm-peek">{{ ministryFiles(m.id).length ? ministryFiles(m.id).length + ' · ' + ministryFiles(m.id).map(p => p.title).join(', ') : 'nie ma jeszcze plików' }}</span><svg class="i mm-chev"><use href="#down"/></svg></summary>
      <button v-for="p in ministryFiles(m.id)" :key="p.id" class="mm-file" @click="openProto(p)"><svg class="i"><use href="#file"/></svg><span><b>{{ p.title }}</b><small>{{ p.link ? 'link · Google Dysk' : p.fileName }}</small></span><svg class="i chev"><use href="#chev"/></svg></button>
      <button v-if="m.lead" class="ghost small" @click="newMinistryFile(m)"><svg class="i"><use href="#plus"/></svg>Dodaj plik</button>
    </details>

    <div v-if="m.id === 'asb'" class="mm-actions">
      <button class="small primary" @click="openAsb">{{ canAsb ? 'Grafik spotkań' : 'Terminarz spotkań' }}<svg class="i"><use href="#chev"/></svg></button>
    </div>
  </article>
  </div>
</template>

<style scoped>
.mm-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 1100px) { .mm-list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
.mm-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; }
.mm-head { display: flex; align-items: center; gap: 8px; }
.mm-spacer { flex: 1; }
.mm-msg { flex: none; }
.mm-sec { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--line); }
.mm-sec > summary { display: flex; align-items: center; gap: 8px; min-height: 32px; cursor: pointer; list-style: none; }
.mm-sec > summary::-webkit-details-marker { display: none; }
.mm-peek { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; }
.mm-chev { flex: none; width: 16px; height: 16px; color: var(--muted); transition: transform .15s; }
.mm-sec[open] .mm-chev { transform: rotate(180deg); }
@media (pointer: coarse) { .mm-sec > summary { min-height: 44px; } }
.mm-lbl { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.mm-text { margin: 0; white-space: pre-wrap; line-height: 1.5; }
.mm-sec > .ghost, .mm-sec .row { align-self: flex-start; }
.mm-sec .row { display: flex; gap: 6px; }
.mm-file { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 8px 12px; border-radius: 12px; text-align: left; justify-content: flex-start; }
.mm-file > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mm-file small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-file .i { flex: none; width: 18px; height: 18px; }
.mm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mm-actions:empty { display: none; }
</style>

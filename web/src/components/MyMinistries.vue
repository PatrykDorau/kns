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
  <article v-for="m in mine" :key="m.id" class="ministry mm-card">
    <div class="mn-head"><span class="mn-ic"><svg class="i"><use href="#users"/></svg></span><b>{{ m.name }}</b><span v-if="m.leader" class="ann-tag pin">lider</span></div>

    <!-- informacje wewnętrzne -->
    <div class="mm-sec">
      <small class="mm-lbl">Informacje dla służby</small>
      <template v-if="edit[m.id] !== undefined">
        <textarea v-model="edit[m.id]" rows="4" maxlength="5000" placeholder="np. kto ma klucze, gdzie są kable, zasady, kontakty"></textarea>
        <div class="row"><button class="primary small" :disabled="busy" @click="saveMinistryInternal(m, edit[m.id]); delete edit[m.id]">Zapisz</button><button class="small" @click="delete edit[m.id]">Anuluj</button></div>
      </template>
      <template v-else>
        <p v-if="m.internal" class="mm-text">{{ m.internal }}</p>
        <p v-else class="note">{{ m.lead ? 'Brak informacji — dodaj je dla swojej służby.' : 'Lider nie dodał jeszcze informacji.' }}</p>
        <button v-if="m.lead" class="ghost small" @click="edit[m.id] = m.internal || ''"><svg class="i"><use href="#pencil"/></svg>{{ m.internal ? 'Zmień' : 'Dodaj informacje' }}</button>
      </template>
    </div>

    <!-- dyspozycyjność na najbliższe niedziele -->
    <AvailabilityPanel :ministry="m.id" />

    <!-- pliki tylko dla tej służby -->
    <div class="mm-sec">
      <small class="mm-lbl">Pliki służby</small>
      <button v-for="p in ministryFiles(m.id)" :key="p.id" class="mm-file" @click="openProto(p)"><svg class="i"><use href="#file"/></svg><span><b>{{ p.title }}</b><small>{{ p.link ? 'link · Google Dysk' : p.fileName }}</small></span><svg class="i chev"><use href="#chev"/></svg></button>
      <p v-if="!ministryFiles(m.id).length" class="note">Nie ma jeszcze plików.</p>
      <button v-if="m.lead" class="ghost small" @click="newMinistryFile(m)"><svg class="i"><use href="#plus"/></svg>Dodaj plik</button>
    </div>

    <div class="mm-actions">
      <button v-if="m.leader || (m.lead && canMsg)" class="small" @click="openMsg({ ministries: [m.id] })"><svg class="i"><use href="#megaphone"/></svg>Wiadomość do służby</button>
      <button v-if="m.id === 'asb'" class="small primary" @click="openAsb">{{ canAsb ? 'Grafik spotkań' : 'Terminarz spotkań' }}<svg class="i"><use href="#chev"/></svg></button>
    </div>
  </article>
</template>

<style scoped>
.mm-card { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.mm-sec { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px dashed var(--line); }
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

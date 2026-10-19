<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import AvailabilityPanel from '@/components/AvailabilityPanel.vue'

// Więcej: wszystko poza Startem i Kalendarzem (tylko to, do czego dana ranga ma dostęp) Zaangażuj się: służby szukające chętnych, zgłoszenia, akceptacja przez lidera
export default defineComponent({ components: { AvailabilityPanel }, setup: () => useApp() })
</script>

<template>
  <p class="note" style="margin-top:0">Wybierz służbę i zgłoś się — lider służby potwierdzi zgłoszenie.</p>
  <button v-if="canCreateMinistry" class="primary" style="width:100%;margin-bottom:12px" @click="editMinistry()"><svg class="i"><use href="#plus"/></svg>Nowa służba</button>
  <div v-if="serve.busy && !serve.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="serve.error" class="error">{{ serve.error }}</p>
  <p v-else-if="!serve.list.length" class="note">Nie ma jeszcze żadnych służb{{ canCreateMinistry ? ' — dodaj pierwszą.' : '.' }}</p>
  <AvailabilityPanel />
  <template v-for="sec in serveSections" :key="sec.id">
  <h2 class="mn-sec">{{ sec.title }}</h2>
  <div class="mn-grid">
  <article v-for="m in sec.list" :key="m.id" :id="'sluzba-' + m.id" class="ministry" :class="{ seeking: m.seeking, linked: linkedMinistry === m.id }">
    <div class="mn-head">
      <span class="mn-ic"><svg class="i"><use href="#users"/></svg></span>
      <b>{{ m.name }}</b>
      <span v-if="m.seeking" class="ann-tag pin">Szukamy chętnych</span>
      <span class="kh-spacer"></span>
      <button class="icon" aria-label="Kopiuj link do służby" title="Kopiuj link do służby" @click="shareLink('sluzba', m.id, m.name)"><svg class="i"><use href="#link"/></svg></button>
      <button v-if="m.lead" class="icon" aria-label="Edytuj służbę" title="Edytuj służbę" @click="editMinistry(m)"><svg class="i"><use href="#pencil"/></svg></button>
    </div>
    <p v-if="m.description" class="mn-desc">{{ m.description }}</p>
    <p v-if="m.leaders.length" class="mn-meta">Lider: {{ m.leaders.map(l => l.name).join(', ') }}</p>
    <!-- kto służy — zwinięte; lider po rozwinięciu dodaje i usuwa osoby -->
    <details class="mn-who">
      <summary><svg class="i"><use href="#users"/></svg><span>{{ (m.lead ? m.people.length : m.members.length) ? 'Kto służy · ' + (m.lead ? m.people.length : m.members.length) : 'Nikt jeszcze nie służy' }}</span><svg class="i mn-chev"><use href="#down"/></svg></summary>
      <div v-if="m.lead" class="mn-team">
        <div v-for="p in m.people" :key="p.id" class="mn-person">
          <span><b>{{ p.name }}</b></span>
          <button class="icon" :disabled="busy" :aria-label="'Usuń ' + p.name + ' ze służby'" title="Usuń ze służby" @click="removeFromMinistry(m, p)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <button class="ghost mn-add" :disabled="busy" @click="openAddPerson(m)"><svg class="i"><use href="#plus"/></svg>Dodaj osobę</button>
      </div>
      <div v-else-if="m.members.length" class="mn-names"><span v-for="n in m.members" :key="n" class="ann-tag">{{ n }}</span></div>
    </details>
    <div v-if="!m.leader" class="mn-actions">
      <button v-if="!m.mine" :class="{ primary: m.seeking }" :disabled="busy" @click="joinMinistry(m)">Chcę się zaangażować</button>
      <template v-else-if="m.mine === 'pending'"><span class="mn-state">Zgłoszono — czeka na lidera</span><button class="ghost" :disabled="busy" @click="leaveMinistry(m)">Wycofaj</button></template>
      <template v-else><span class="mn-state ok"><svg class="i"><use href="#check"/></svg>Służysz tutaj</span><button class="ghost" :disabled="busy" @click="leaveMinistry(m)">Zrezygnuj</button></template>
    </div>
    <div v-if="m.pending.length" class="mn-pending">
      <small>Zgłoszenia do akceptacji</small>
      <div v-for="p in m.pending" :key="p.id" class="mn-person">
        <span><b>{{ p.name }}</b><small v-if="p.grupa">{{ p.grupa }}</small></span>
        <button :disabled="busy" @click="decideMinistry(m, p, false)">Odrzuć</button>
        <button class="primary" :disabled="busy" @click="decideMinistry(m, p, true)">Akceptuj</button>
      </div>
    </div>
  </article>
  </div>
  </template>
</template>

<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// ASB: edycja spotkania
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="asbForm = null">
  <div class="np-panel" role="dialog" aria-label="Spotkanie ASB">
    <div class="np-head"><b>{{ asbForm._new ? 'Nowe spotkanie' : 'Spotkanie ASB' }}</b><button class="icon" aria-label="Zamknij" @click="asbForm = null"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="np-list">
      <label style="margin-top:0">Rodzaj</label>
      <div class="asb-kind-pick" role="radiogroup" aria-label="Rodzaj spotkania">
        <button v-for="k in ASB_KINDS" :key="k.id" type="button" role="radio" :aria-checked="asbForm.kind === k.id" :class="['k-' + k.id, { on: asbForm.kind === k.id }]" @click="asbForm.kind = k.id">{{ k.name }}</button>
      </div>
      <div class="row">
        <div><label for="asDate">Data</label><input id="asDate" v-model="asbForm.date" type="date" @change="asbAutoMonth"></div>
        <div><label for="asTime">Godzina</label><input id="asTime" v-model="asbForm.time" type="time"></div>
      </div>
      <label for="asTopic">Temat</label>
      <input id="asTopic" v-model="asbForm.topic" list="asb-ideas" :placeholder="asbForm.kind === 'wewnetrzne' ? 'np. Spotkanie organizacyjne — plan semestru' : asbForm.kind === 'ewangelizacyjne' ? 'np. Pytania o wiarę na kampusie' : 'np. Czy chrześcijaństwo ma sens? Dzieje 17:16-34'" autocomplete="off">
      <datalist id="asb-ideas"><option v-for="i in asb.ideas" :key="i.id" :value="i.topic"></option></datalist>
      <div class="row">
        <div><label for="asLeader">Prowadzący</label><input id="asLeader" v-model="asbForm.leader" list="asb-names" autocomplete="off"></div>
        <div><label for="asHelper">Prowadzący pomocniczy</label><input id="asHelper" v-model="asbForm.helper" list="asb-names" autocomplete="off"></div>
      </div>
      <datalist id="asb-names"><option v-for="p in asb.people" :key="p.id" :value="p.name"></option></datalist>
      <p v-for="h in asbLeaderHints" :key="h.text" class="note asb-cal asb-hint" :class="{ bad: h.bad }"><svg class="i"><use :href="h.bad ? '#warn' : '#bell'"/></svg><span>{{ h.text }}</span></p>
      <div class="row">
        <div><label for="asPlace">Miejsce</label><input id="asPlace" v-model="asbForm.place" list="asb-places" autocomplete="off"></div>
        <div><label for="asAtt">Frekwencja</label><input id="asAtt" v-model.number="asbForm.attendance" type="number" min="0" inputmode="numeric" placeholder="—"></div>
      </div>
      <datalist id="asb-places"><option v-for="p in asbPlaces" :key="p" :value="p"></option></datalist>
      <label for="asNote">Notatka</label>
      <textarea id="asNote" v-model="asbForm.note" class="short" placeholder="Ustalenia, co przygotować, kto przynosi…"></textarea>
      <label for="asStudy">Rozważanie dla prowadzącego</label>
      <textarea id="asStudy" v-model="asbForm.study" placeholder="Fragment Biblii, myśli, pytania do dyskusji…"></textarea>
      <label>Załączniki <small class="muted">(rozważanie, materiały, prezentacja — widzą je wszyscy z ASB)</small></label>
      <div class="asb-files">
        <div v-for="f in asbForm.files" :key="f.path || f.url" class="mn-person">
          <span><b>{{ f.name }}</b><small v-if="f.url">link</small></span>
          <button :disabled="busy" @click="asbOpenFile(f)">Otwórz</button>
          <button class="icon" :disabled="busy" :aria-label="'Usuń załącznik ' + f.name" title="Usuń załącznik" @click="asbRemoveFile(f)"><svg class="i"><use href="#x"/></svg></button>
        </div>
        <input ref="asbFileInput" type="file" multiple hidden @change="asbAddFile">
        <button type="button" :disabled="busy" @click="$refs.asbFileInput.click()"><svg class="i"><use href="#clip"/></svg>{{ busy ? 'Wgrywam…' : 'Dodaj załącznik (do 10 MB)' }}</button>
        <div class="row asb-link"><input id="asLink" v-model="asbForm._link" placeholder="albo wklej link z Dysku Google" inputmode="url" autocomplete="off" @keydown.enter.prevent="asbAddLink"><button type="button" :disabled="!asbForm._link" @click="asbAddLink"><svg class="i"><use href="#link"/></svg>Dodaj link</button></div>
      </div>
      <template v-if="asbForm.kind === 'cykliczne'">
        <label for="asConcept">Koncepcja okresu — co i po co robimy</label>
        <textarea id="asConcept" v-model="asbForm.concept" class="short"></textarea>
        <label>Integracja (opcjonalnie)</label>
        <div class="row">
          <div><input v-model="asbForm.int_idea" placeholder="Pomysł, np. Planszówki" aria-label="Pomysł na integrację" autocomplete="off"></div>
          <div><input v-model="asbForm.int_date" placeholder="Kiedy, np. 28.02" aria-label="Data integracji" autocomplete="off"></div>
        </div>
        <input v-model="asbForm.int_organizer" placeholder="Organizator" aria-label="Organizator integracji" autocomplete="off">
      </template>
      <label for="asSeason">Rok akademicki</label>
      <input id="asSeason" v-model="asbForm.season" list="asb-seasons" placeholder="2026/2027" autocomplete="off">
      <datalist id="asb-seasons"><option v-for="se in asbSeasons" :key="se" :value="se"></option></datalist>
      <p class="note asb-cal"><svg class="i"><use href="#calendar"/></svg><span>{{ asbCalNote }}</span></p>
      <p v-if="asbForm.reminded" class="note asb-cal"><svg class="i"><use href="#bell"/></svg><span>Przypomnienie wysłano {{ asbWhen(asbForm.reminded) }}.</span></p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div class="np-foot mn-foot">
      <button v-if="!asbForm._new" class="danger" :disabled="busy" @click="asbDelete">Usuń</button>
      <button :disabled="busy || !asbForm.season.trim() || !asbForm.date" title="Powiadomienie w aplikacji dla wszystkich z rangą ASB" @click="asbRemind"><svg class="i"><use href="#bell"/></svg>Przypomnij</button>
      <button class="primary" :disabled="busy || !asbForm.season.trim()" @click="asbSave">Zapisz</button>
    </div>
  </div>
</div>
</template>

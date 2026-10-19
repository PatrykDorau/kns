<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// AsbView
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="seg asb-tabs" role="tablist" aria-label="ASB">
    <button role="tab" :aria-selected="asb.tab === 'plan'" :class="{ on: asb.tab === 'plan' }" @click="asb.tab = 'plan'">Grafik</button>
    <button role="tab" :aria-selected="asb.tab === 'ideas'" :class="{ on: asb.tab === 'ideas' }" @click="asb.tab = 'ideas'">Pomysły<template v-if="asb.ideas.length"> ({{ asb.ideas.length }})</template></button>
  </div>
  <div v-if="asb.busy && !asb.meetings.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 6" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="asb.error" class="error">{{ asb.error }}</p>
  <template v-else-if="asb.tab === 'ideas'">
    <div class="asb-idea-add">
      <input v-model="asb.ideaTopic" placeholder="Nowy pomysł — temat" aria-label="Temat pomysłu" autocomplete="off" @keydown.enter="asbIdeaAdd">
      <input v-model="asb.ideaAuthor" placeholder="Pomysłodawca" aria-label="Pomysłodawca" autocomplete="off" @keydown.enter="asbIdeaAdd">
      <button :disabled="busy || !asb.ideaTopic.trim()" @click="asbIdeaAdd"><svg class="i"><use href="#plus"/></svg>Dodaj</button>
    </div>
    <p v-if="!asb.ideas.length" class="note">Na razie nie ma pomysłów — dopisz pierwszy.</p>
    <div v-for="i in asb.ideas" :key="i.id" class="mn-person asb-idea">
      <span><b>{{ i.topic }}</b><small v-if="i.author">{{ i.author }}</small></span>
      <button :disabled="busy" title="Nowe spotkanie z tym tematem" @click="asbEdit(null, i)"><svg class="i"><use href="#calendar"/></svg><span>Zaplanuj</span></button>
      <button class="icon" :disabled="busy" aria-label="Usuń pomysł" title="Usuń pomysł" @click="asbIdeaDelete(i)"><svg class="i"><use href="#x"/></svg></button>
    </div>
  </template>
  <template v-else>
    <div class="asb-seasons" role="tablist" aria-label="Rok akademicki">
      <button v-for="se in asbSeasons" :key="se" class="chipbtn" :class="{ on: asb.season === se }" @click="asb.season = se">{{ se }}</button>
    </div>
    <div class="asb-stats">
      <span><b>{{ asbList.filter(m => m.date && m.topic).length }}</b> spotkań z tematem</span>
      <span v-if="asbAvg"><b>{{ asbAvg }}</b> średnia frekwencja</span>
      <span v-if="asbNext"><b>{{ shortDate(asbNext.date) }}</b> najbliższe</span>
    </div>
    <div class="asb-kinds" role="group" aria-label="Rodzaj spotkań">
      <button class="chipbtn" :class="{ on: !asb.kind }" @click="asb.kind = ''">Wszystkie</button>
      <button v-for="k in ASB_KINDS" :key="k.id" class="chipbtn" :class="['k-' + k.id, { on: asb.kind === k.id }]" @click="asb.kind = asb.kind === k.id ? '' : k.id"><i></i>{{ k.plural }} · {{ asbList.filter(m => m.kind === k.id && !asbPause(m)).length }}</button>
      <button v-if="asbMissingCount" class="chipbtn miss" :class="{ on: asb.kind === 'braki' }" title="Najbliższe spotkania bez tematu, prowadzącego albo miejsca" @click="asb.kind = asb.kind === 'braki' ? '' : 'braki'"><svg class="i"><use href="#warn"/></svg>Do uzupełnienia · {{ asbMissingCount }}</button>
    </div>
    <div class="asb-tools">
      <button class="primary asb-add" @click="asbEdit()"><svg class="i"><use href="#plus"/></svg>Dodaj spotkanie</button>
      <button v-if="msgRanks.some(r => r.id === 'asb')" title="Powiadomienie dla wszystkich z rangą ASB" @click="openMsg({ ranks: ['asb'] })"><svg class="i"><use href="#megaphone"/></svg>Wiadomość</button>
    </div>
    <p v-if="!asbGroups.length" class="note">W tym roku nie ma jeszcze takich spotkań.</p>
    <template v-for="g in asbGroups" :key="g.month">
      <h2 class="mn-sec">{{ g.month }}</h2>
      <template v-for="m in g.list" :key="m.id">
        <p v-if="m.conceptStart" class="asb-concept">{{ m.concept }}</p>
        <button class="asb-row" :class="['k-' + m.kind, { past: m.date && m.date < todayStr, next: asbNext && m.id === asbNext.id, pause: asbPause(m), incomplete: asbMissing(m).length }]" @click="asbEdit(m)">
          <span class="asb-date"><small>{{ m.date ? wd(m.date) : '' }}</small><b>{{ m.date ? day(m.date) : '—' }}</b><small>{{ m.date ? month(m.date) : '' }}</small></span>
          <span class="asb-body">
            <span v-if="m.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(m.kind) }}</span>
            <b>{{ asbTitle(m) }}</b>
            <small v-if="asbMissing(m).length" class="asb-miss"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ asbMissing(m).join(', ') }}</small>
            <small v-if="m.leader && !asbPause(m)">Prowadzi: {{ m.leader }}<template v-if="m.helper && m.helper !== m.leader"> · pomaga: {{ m.helper }}</template></small>
            <small v-if="(m.kind !== 'cykliczne' && m.time) || m.place">{{ [m.kind !== 'cykliczne' ? m.time : '', m.place].filter(Boolean).join(' · ') }}</small>
            <small v-if="m.int_idea || m.int_date || m.int_organizer" class="asb-int">Integracja: {{ [m.int_idea, m.int_date, m.int_organizer].filter(Boolean).join(' · ') }}</small>
            <small v-if="m.note || m.study || (m.files || []).length" class="asb-meta">
              <span v-if="m.note"><svg class="i"><use href="#pencil"/></svg>Notatka</span>
              <span v-if="m.study || (m.files || []).length"><svg class="i"><use href="#file"/></svg>Rozważanie<template v-if="(m.files || []).length"> · {{ m.files.length }} {{ m.files.length === 1 ? 'plik' : m.files.length < 5 ? 'pliki' : 'plików' }}</template></span>
            </small>
          </span>
          <span v-if="m.attendance != null" class="asb-att" title="Frekwencja">{{ m.attendance }}</span>
        </button>
        <div v-if="(m.files || []).length" class="asb-file-row">
          <button v-for="f in m.files" :key="f.path" type="button" class="chipbtn" :title="'Otwórz ' + f.name" @click="asbOpenFile(f)"><svg class="i"><use href="#clip"/></svg>{{ f.name }}</button>
        </div>
      </template>
    </template>
  </template>
</template>

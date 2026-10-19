<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Posłuchaj: YouTube i Spotify (linki ustawia administrator) Cele wsparcia: deklaracje z dziesięciny, potwierdzanie miesięcy, pasek postępu; rada — cele i kto ile Wybory i głosowania: zgłoszenia → rada zatwierdza → tajne głosowanie (można kilka) → wyniki
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p class="goals-intro">Wybory (np. rady zboru) i głosowania na spotkaniach członkowskich. Najpierw członkowie zgłaszają kandydatów, rada zatwierdza listę, potem każdy członek oddaje <b>tajny</b> głos — można wybrać kilka osób, jeśli wybory na to pozwalają.</p>
  <p v-if="votes.error" class="error">{{ votes.error }}</p>
  <div class="section"><h2>Głosowania</h2><button v-if="votes.canRun && !votes.edit" class="small" @click="newElection"><svg class="i"><use href="#plus"/></svg>Nowe</button></div>

  <!-- formularz (rada) -->
  <section v-if="votes.edit" class="goal-form vote-form">
    <h2>{{ votes.edit._new ? 'Nowe głosowanie' : 'Edycja głosowania' }}</h2>
    <label for="vTitle">Tytuł <span class="req">*</span></label>
    <input id="vTitle" v-model="votes.edit.title" maxlength="160" placeholder="np. Wybory rady zboru 2027, Uchwała o zakupie nagłośnienia" autocomplete="off">
    <label for="vDesc">Opis (zasady, ile osób wybieramy, do kiedy)</label>
    <textarea id="vDesc" v-model="votes.edit.description" class="ann-text"></textarea>
    <template v-if="votes.edit._new || votes.edit.status === 'nominations'">
      <label>Na kogo / na co głosujemy</label>
      <div class="vote-seg" role="group" aria-label="Rodzaj">
        <button type="button" :class="{ on: votes.edit.kind === 'people' }" @click="votes.edit.kind = 'people'"><b>Na osoby</b><small>członkowie zgłaszają kandydatów, rada zatwierdza</small></button>
        <button type="button" :class="{ on: votes.edit.kind === 'options' }" @click="votes.edit.kind = 'options'"><b>Na odpowiedzi</b><small>np. Za / Przeciw / Wstrzymuję się</small></button>
      </div>
      <template v-if="votes.edit.kind === 'options'">
        <label>Odpowiedzi <small class="muted">(w tej kolejności na karcie)</small></label>
        <div class="vote-opts">
          <div v-for="(o, i) in votes.edit.opts" :key="i" class="vote-opt">
            <span class="vote-opt-n">{{ i + 1 }}</span>
            <input v-model="votes.edit.opts[i]" maxlength="120" :placeholder="['Za', 'Przeciw', 'Wstrzymuję się'][i] || 'Odpowiedź'" :aria-label="'Odpowiedź ' + (i + 1)" autocomplete="off" @keydown.enter.prevent="addOption(i + 1)">
            <button type="button" class="icon" :disabled="i === 0" title="Wyżej" aria-label="Przesuń wyżej" @click="moveOption(i, -1)"><svg class="i"><use href="#up"/></svg></button>
            <button type="button" class="icon" :disabled="votes.edit.opts.length <= 2" title="Usuń odpowiedź" aria-label="Usuń odpowiedź" @click="votes.edit.opts.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
          </div>
          <button type="button" class="ghost vote-opt-add" @click="addOption()"><svg class="i"><use href="#plus"/></svg>Dodaj odpowiedź</button>
        </div>
      </template>
      <label for="vMax">Ile można wybrać na jednej karcie</label>
      <input id="vMax" v-model.number="votes.edit.max_choices" type="number" min="1" max="50" inputmode="numeric" style="max-width:140px">
    </template>
    <label for="vEvent">Spotkanie (opcjonalnie) — głosowanie widać w wydarzeniu w kalendarzu</label>
    <div class="vote-ev">
      <div class="ann-search"><svg class="i"><use href="#search"/></svg><input id="vEvent" v-model="voteEv.query" type="search" placeholder="Szukaj spotkania: nazwa, miejsce, data…" autocomplete="off"></div>
      <div class="chips" role="group" aria-label="Rodzaj spotkań">
        <button v-for="[id, name] in VOTE_EV_TYPES" :key="id" type="button" class="chipbtn" :class="{ on: voteEv.type === id }" @click="voteEv.type = id">{{ name }}</button>
      </div>
      <div class="vote-ev-list" role="listbox" aria-label="Spotkanie">
        <button type="button" role="option" :aria-selected="!votes.edit.event_id" :class="{ on: !votes.edit.event_id }" @click="votes.edit.event_id = ''"><b>Bez spotkania</b></button>
        <button v-for="ev in voteEventsShown" :key="ev.id" type="button" role="option" :aria-selected="votes.edit.event_id === ev.id" :class="{ on: votes.edit.event_id === ev.id }" @click="votes.edit.event_id = ev.id">
          <i class="cal-dot" :style="{ background: typeOf(ev.type).color }"></i><b>{{ ev.title || typeOf(ev.type).name }}</b><small>{{ shortDate(ev.date) }}{{ ev.place ? ' · ' + ev.place : '' }}</small>
        </button>
        <p v-if="!voteEventsShown.length" class="note">Brak spotkań{{ voteEv.query ? ' dla „' + voteEv.query + '”' : '' }} — zmień filtr albo „Wszystkie”.</p>
      </div>
    </div>
    <label class="check"><input v-model="votes.edit.results_public" type="checkbox">Wyniki widzą wszyscy członkowie (inaczej tylko rada)</label>
    <div class="bar">
      <button class="primary" :disabled="busy || !votes.edit.title.trim() || (votes.edit.kind === 'options' && optionsOf(votes.edit).length < 2)" @click="saveElection">Zapisz</button>
      <button :disabled="busy" @click="votes.edit = null">Anuluj</button>
      <button v-if="!votes.edit._new" class="danger" :disabled="busy" @click="removeElection(votes.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
    </div>
  </section>

  <template v-else>
    <div v-if="votes.busy && !votes.list.length" class="skel-list" aria-busy="true"><div v-for="n in 2" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!votes.list.length" class="note">Nie ma jeszcze głosowań.{{ votes.canRun ? ' Utwórz pierwsze — „Nowe”.' : ' Ogłasza je rada zboru.' }}</p>
    <article v-for="e in votes.list" :key="e.id" class="vote" :class="['st-' + e.status, { focus: votes.open === e.id }]">
      <div class="vote-h">
        <span class="vote-status" :class="e.status">{{ VOTE_STATUS[e.status === 'nominations' && e.kind === 'options' ? 'ready' : e.status] }}</span>
        <b>{{ e.title }}</b>
        <button v-if="votes.canRun && e.status !== 'closed'" class="icon" title="Edytuj" aria-label="Edytuj głosowanie" @click="editElection(e)"><svg class="i"><use href="#pencil"/></svg></button>
      </div>
      <p v-if="e.description" class="vote-desc">{{ e.description }}</p>
      <p class="vote-meta">{{ e.kind === 'people' ? 'Na osoby' : 'Na odpowiedzi' }} · {{ e.max_choices === 1 ? 'jeden wybór' : 'do ' + e.max_choices + ' wyborów' }} · głos tajny</p>
      <button v-if="eventOf(e)" class="vote-event" @click="openEvent(eventOf(e))"><svg class="i"><use href="#calendar"/></svg>{{ eventOf(e).title || typeOf(eventOf(e).type).name }} · {{ shortDate(eventOf(e).date) }}<svg class="i chev"><use href="#chev"/></svg></button>

      <!-- 1. zgłaszanie kandydatów -->
      <template v-if="e.status === 'nominations'">
        <div v-if="e.kind === 'people'" class="vote-nominate">
          <label :for="'vn' + e.id">Zgłoś kandydata</label>
          <div class="row">
            <select :id="'vn' + e.id" :value="votes.pick[e.id] || ''" @focus="loadElectionPeople" @change="votes.pick[e.id] = $event.target.value">
              <option value="">— wybierz osobę —</option>
              <option v-for="p in votes.people.filter(p => !e.candidates.some(c => c.person === p.id && c.mine))" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button class="primary" :disabled="busy || !votes.pick[e.id]" @click="nominate(e)">Zgłoś</button>
          </div>
          <div v-if="e.candidates.some(c => c.mine)" class="vote-chips">
            <small>Twoje zgłoszenia:</small>
            <span v-for="c in e.candidates.filter(c => c.mine)" :key="c.id" class="vote-chip">{{ c.label }}<button class="icon" :aria-label="'Wycofaj zgłoszenie: ' + c.label" title="Wycofaj zgłoszenie" @click="nominate(e, c.person, true)"><svg class="i"><use href="#x"/></svg></button></span>
          </div>
        </div>
        <!-- rada: kto bierze udział -->
        <div v-if="votes.canRun" class="vote-review">
          <small class="vote-lbl">{{ e.kind === 'people' ? 'Zgłoszeni — kto bierze udział (decyduje rada)' : 'Odpowiedzi' }}</small>
          <div v-for="c in e.candidates" :key="c.id" class="vote-cand" :class="{ ok: c.accepted === true, no: c.accepted === false }">
            <span><b>{{ c.label }}</b><small v-if="e.kind === 'people'">{{ c.nominations }} {{ c.nominations === 1 ? 'zgłoszenie' : c.nominations < 5 ? 'zgłoszenia' : 'zgłoszeń' }}</small></span>
            <template v-if="e.kind === 'people'">
              <button class="small" :class="{ primary: c.accepted === true }" :disabled="busy" @click="reviewCand(c, c.accepted === true ? null : true)"><svg class="i"><use href="#check"/></svg>{{ c.accepted === true ? 'Bierze udział' : 'Zatwierdź' }}</button>
              <button class="small" :class="{ danger: c.accepted === false }" :disabled="busy" @click="reviewCand(c, c.accepted === false ? null : false)"><svg class="i"><use href="#x"/></svg>{{ c.accepted === false ? 'Odrzucony' : 'Odrzuć' }}</button>
            </template>
          </div>
          <p v-if="!e.candidates.length" class="note">Nikt jeszcze nie został zgłoszony.</p>
          <button class="primary vote-start" :disabled="busy || !e.candidates.some(c => c.accepted)" @click="setElectionStatus(e, 'voting')"><svg class="i"><use href="#check"/></svg>Rozpocznij głosowanie ({{ e.candidates.filter(c => c.accepted).length }})</button>
        </div>
      </template>

      <!-- 2. głosowanie -->
      <template v-else-if="e.status === 'voting' || e.status === 'paused'">
        <p v-if="e.voted" class="vote-done"><svg class="i"><use href="#check"/></svg>Twój głos został oddany. Dziękujemy!</p>
        <p v-else-if="e.status === 'paused'" class="vote-paused"><svg class="i"><use href="#info"/></svg>Głosowanie jest wstrzymane — prowadzący włączy je w odpowiednim momencie.</p>
        <template v-else>
          <small class="vote-lbl">{{ e.max_choices === 1 ? 'Wybierz jedną odpowiedź' : 'Wybierz do ' + e.max_choices }} · wybrano {{ (votes.ballot[e.id] || []).length }}</small>
          <button v-for="c in e.candidates" :key="c.id" class="vote-opt" :class="{ on: (votes.ballot[e.id] || []).includes(c.id) }" :aria-pressed="(votes.ballot[e.id] || []).includes(c.id)" :disabled="!(votes.ballot[e.id] || []).includes(c.id) && e.max_choices > 1 && (votes.ballot[e.id] || []).length >= e.max_choices" @click="toggleBallot(e, c)">
            <span class="vote-box" :class="{ radio: e.max_choices === 1 }"><svg class="i"><use href="#check"/></svg></span><b>{{ c.label }}</b>
          </button>
          <button class="primary vote-send" :disabled="busy || !(votes.ballot[e.id] || []).length" @click="castVote(e)">Oddaj głos</button>
          <p class="note">Głos jest tajny — nikt nie zobaczy, na kogo głosowałeś(-aś). Oddanego głosu nie da się zmienić.</p>
        </template>
        <div v-if="votes.canRun" class="vote-review">
          <small class="vote-lbl">Frekwencja: {{ e.turnout }} z {{ e.eligible }} członków</small>
          <div class="goal-bar"><i class="done" :style="{ width: Math.round(e.turnout / Math.max(1, e.eligible) * 100) + '%' }"></i></div>
          <div class="row vote-ctl">
            <button v-if="e.status === 'voting'" :disabled="busy" title="Nikt nie odda głosu, dopóki nie wznowisz — oddane głosy zostają" @click="setElectionStatus(e, 'paused')"><svg class="i"><use href="#x"/></svg>Wstrzymaj</button>
            <button v-else class="primary" :disabled="busy" @click="setElectionStatus(e, 'voting')"><svg class="i"><use href="#check"/></svg>Wznów głosowanie</button>
            <button class="danger" :disabled="busy" @click="setElectionStatus(e, 'closed')">Zakończ i policz</button>
          </div>
        </div>
      </template>

      <!-- 3. wyniki -->
      <template v-else>
        <template v-if="e.candidates.some(c => c.votes != null)">
          <small class="vote-lbl">Wyniki · głosowało {{ e.turnout }} z {{ e.eligible }}</small>
          <div v-for="(c, i) in [...e.candidates].filter(c => c.accepted).sort((a, b) => b.votes - a.votes)" :key="c.id" class="vote-res" :class="{ top: i < e.max_choices && c.votes > 0 }">
            <span><b>{{ c.label }}</b><em>{{ c.votes }} {{ c.votes === 1 ? 'głos' : c.votes % 10 >= 2 && c.votes % 10 <= 4 && (c.votes % 100 < 10 || c.votes % 100 >= 20) ? 'głosy' : 'głosów' }}</em></span>
            <div class="goal-bar"><i class="done" :style="{ width: Math.round(c.votes / Math.max(1, e.turnout) * 100) + '%' }"></i></div>
          </div>
        </template>
        <p v-else class="note">Wyniki zna rada zboru.</p>
      </template>
    </article>
  </template>
</template>

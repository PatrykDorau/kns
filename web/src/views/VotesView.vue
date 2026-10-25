<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import PersonSearch from '@/components/PersonSearch.vue'

// Wybory i głosowania: jedna lista do wyboru (osoby z listy członków i dowolne odpowiedzi), opcjonalnie zgłoszenia
// od członków do terminu (rada zatwierdza), głosowanie otwierane ręcznie albo w terminie od–do; tajny głos, wyniki.
export default defineComponent({ components: { PersonSearch }, setup: () => useApp() })
</script>

<template>
  <p class="beta-note"><small class="beta-tag">beta</small>Funkcja eksperymentalna — może się jeszcze zmienić. Uwagi zgłoś w „Zgłoszeniach”.</p>
  <p class="goals-intro">Wybory (np. rady zboru) i głosowania na spotkaniach członkowskich. Na liście mogą być osoby i dowolne odpowiedzi; członkowie mogą też zgłaszać propozycje do wyznaczonego terminu. Głos jest zawsze <b>tajny</b>.</p>
  <p v-if="votes.error" class="error">{{ votes.error }}</p>
  <div class="section"><h2>Głosowania</h2><button v-if="votes.canRun && !votes.edit" class="small" @click="newElection"><svg class="i"><use href="#plus"/></svg>Nowe</button></div>

  <!-- formularz (rada) -->
  <section v-if="votes.edit" class="goal-form vote-form">
    <h2>{{ votes.edit._new ? 'Nowe głosowanie' : 'Edycja głosowania' }}</h2>
    <label for="vTitle">Tytuł <span class="req">*</span></label>
    <input id="vTitle" v-model="votes.edit.title" maxlength="160" placeholder="np. Wybory rady zboru 2027, Uchwała o zakupie nagłośnienia" autocomplete="off">
    <label for="vDesc">Opis (zasady, ile osób wybieramy)</label>
    <textarea id="vDesc" v-model="votes.edit.description" class="ann-text"></textarea>

    <!-- 1. lista do wyboru -->
    <h3 class="vote-step"><span>1</span>Na kogo / na co głosujemy</h3>
    <p v-if="votes.edit.has_votes" class="note">Są już oddane głosy — listy i liczby wyborów nie można zmienić.</p>
    <template v-else>
      <div v-if="votes.edit.opts.length" class="vote-items">
        <div v-for="(o, i) in votes.edit.opts" :key="(o.person || 't') + i" class="vote-item" :class="{ 'is-person': o.person }">
          <span class="vote-item-n">{{ i + 1 }}</span>
          <span v-if="o.person" class="vote-item-person"><svg class="i"><use href="#user"/></svg><b>{{ o.label }}</b></span>
          <input v-else v-model="o.label" maxlength="160" placeholder="Odpowiedź" :aria-label="'Odpowiedź ' + (i + 1)" autocomplete="off" @keydown.enter.prevent="addOption(i + 1)">
          <button type="button" class="icon" :disabled="i === 0" title="Wyżej" aria-label="Przesuń wyżej" @click="moveOption(i, -1)"><svg class="i"><use href="#up"/></svg></button>
          <button type="button" class="icon" title="Usuń z listy" :aria-label="'Usuń z listy: ' + (o.label || 'odpowiedź')" @click="votes.edit.opts.splice(i, 1)"><svg class="i"><use href="#x"/></svg></button>
        </div>
      </div>
      <p v-else class="note">Lista jest pusta — dodaj osoby albo odpowiedzi{{ votes.edit.allow_nominations ? ' (albo zostaw zgłoszeniom członków)' : '' }}.</p>
      <div class="vote-add">
        <PersonSearch :people="votes.people" :exclude="votes.edit.opts.filter(o => o.person).map(o => o.person)" placeholder="Dodaj osobę — wpisz imię…" label="Dodaj osobę do listy" @pick="addPersonOption" />
        <div class="row">
          <button type="button" class="ghost small" @click="addOption()"><svg class="i"><use href="#plus"/></svg>Odpowiedź</button>
          <button type="button" class="ghost small" @click="addYesNo"><svg class="i"><use href="#plus"/></svg>Za / Przeciw / Wstrzymuję się</button>
        </div>
      </div>
      <label for="vMax">Ile można wybrać na jednej karcie</label>
      <input id="vMax" v-model.number="votes.edit.max_choices" type="number" min="1" max="50" inputmode="numeric" style="max-width:140px">
    </template>

    <!-- 2. zgłoszenia od członków -->
    <h3 class="vote-step"><span>2</span>Zgłoszenia od członków</h3>
    <label class="check"><input v-model="votes.edit.allow_nominations" type="checkbox">Członkowie mogą zgłaszać osoby i propozycje (rada zatwierdza, co trafi na listę)</label>
    <template v-if="votes.edit.allow_nominations">
      <label for="vNomUntil">Zgłoszenia do kiedy <small class="muted">(puste — do otwarcia głosowania)</small></label>
      <input id="vNomUntil" v-model="votes.edit.nominations_until" type="datetime-local" class="vote-dt">
      <p v-if="votes.edit.pending" class="note">{{ votes.edit.pending }} {{ votes.edit.pending === 1 ? 'zgłoszenie czeka' : 'zgłoszenia czekają' }} na decyzję rady — na karcie głosowania.</p>
    </template>

    <!-- 3. kiedy głosowanie -->
    <h3 class="vote-step"><span>3</span>Kiedy głosowanie</h3>
    <div class="vote-seg" role="radiogroup" aria-label="Kiedy głosowanie">
      <button type="button" role="radio" :aria-checked="!votes.edit.timed" :class="{ on: !votes.edit.timed }" @click="votes.edit.timed = false"><b>Ręcznie</b><small>prowadzący otwiera i kończy, np. na spotkaniu</small></button>
      <button type="button" role="radio" :aria-checked="votes.edit.timed" :class="{ on: votes.edit.timed }" @click="votes.edit.timed = true"><b>W terminie</b><small>otwiera się i kończy samo</small></button>
    </div>
    <div v-if="votes.edit.timed" class="vote-dates">
      <span v-if="votes.edit.status !== 'voting' && votes.edit.status !== 'paused'"><label for="vStart">Początek</label><input id="vStart" v-model="votes.edit.vote_start" type="datetime-local" class="vote-dt"></span>
      <span><label for="vEnd">Koniec</label><input id="vEnd" v-model="votes.edit.vote_end" type="datetime-local" class="vote-dt"></span>
    </div>

    <!-- 4. pozostałe -->
    <h3 class="vote-step"><span>4</span>Spotkanie i wyniki</h3>
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
    <p v-if="voteFormProblem" class="note vote-problem">{{ voteFormProblem }}</p>
    <div class="bar">
      <button class="primary" :disabled="busy || !!voteFormProblem" @click="saveElection">Zapisz</button>
      <button :disabled="busy" @click="votes.edit = null">Anuluj</button>
      <button v-if="!votes.edit._new" class="danger" :disabled="busy" @click="removeElection(votes.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
    </div>
  </section>

  <template v-else>
    <div v-if="votes.busy && !votes.list.length" class="skel-list" aria-busy="true"><div v-for="n in 2" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!votes.list.length" class="note">Nie ma jeszcze głosowań.{{ votes.canRun ? ' Utwórz pierwsze — „Nowe”.' : ' Ogłasza je rada zboru.' }}</p>
    <article v-for="e in votes.list" :key="e.id" class="vote" :class="['st-' + e.status, { focus: votes.open === e.id }]">
      <div class="vote-h">
        <span class="vote-status" :class="e.status">{{ VOTE_STATUS[e.status] }}</span>
        <b>{{ e.title }}</b>
        <button v-if="votes.canRun && e.status !== 'closed'" class="icon" title="Edytuj" aria-label="Edytuj głosowanie" @click="editElection(e)"><svg class="i"><use href="#pencil"/></svg></button>
      </div>
      <p v-if="e.description" class="vote-desc">{{ e.description }}</p>
      <p class="vote-meta">{{ e.max_choices === 1 ? 'Jeden wybór' : 'Do ' + e.max_choices + ' wyborów' }} · głos tajny<template v-if="voteSchedule(e)"><br><svg class="i"><use href="#calendar"/></svg>{{ voteSchedule(e) }}</template></p>
      <button v-if="eventOf(e)" class="vote-event" @click="openEvent(eventOf(e))"><svg class="i"><use href="#calendar"/></svg>{{ eventOf(e).title || typeOf(eventOf(e).type).name }} · {{ shortDate(eventOf(e).date) }}<svg class="i chev"><use href="#chev"/></svg></button>

      <!-- przed głosowaniem: lista, zgłoszenia, decyzje rady -->
      <template v-if="e.status === 'nominations' || e.status === 'ready'">
        <template v-if="!votes.canRun">
          <small class="vote-lbl">Na liście ({{ e.candidates.filter(c => c.accepted).length }})</small>
          <div v-if="e.candidates.some(c => c.accepted)" class="vote-chips"><span v-for="c in e.candidates.filter(c => c.accepted)" :key="c.id" class="vote-chip plain">{{ c.label }}</span></div>
          <p v-else class="note">Lista jeszcze pusta.</p>
        </template>
        <div v-if="e.status === 'nominations'" class="vote-nominate">
          <label>Zgłoś osobę albo propozycję</label>
          <PersonSearch :people="votes.people" :exclude="e.candidates.filter(c => c.person && (c.mine || c.accepted)).map(c => c.person)" placeholder="Wpisz imię osoby…" label="Zgłoś osobę" @focus="loadElectionPeople" @pick="p => nominate(e, { who: p.id })" />
          <div class="row">
            <input v-model="votes.propose[e.id]" maxlength="160" placeholder="…albo wpisz propozycję (np. inna odpowiedź)" aria-label="Propozycja tekstem" autocomplete="off" @keydown.enter.prevent="(votes.propose[e.id] || '').trim() && nominate(e, { label: votes.propose[e.id].trim() })">
            <button class="primary" :disabled="busy || !(votes.propose[e.id] || '').trim()" @click="nominate(e, { label: votes.propose[e.id].trim() })">Zgłoś</button>
          </div>
          <div v-if="e.candidates.some(c => c.mine)" class="vote-chips">
            <small>Twoje zgłoszenia:</small>
            <span v-for="c in e.candidates.filter(c => c.mine)" :key="c.id" class="vote-chip">{{ c.label }}<button class="icon" :aria-label="'Wycofaj zgłoszenie: ' + c.label" title="Wycofaj zgłoszenie" @click="nominate(e, c.person ? { who: c.person } : { label: c.label }, true)"><svg class="i"><use href="#x"/></svg></button></span>
          </div>
        </div>
        <!-- rada: lista i zgłoszenia -->
        <div v-if="votes.canRun" class="vote-review">
          <small class="vote-lbl">Lista do wyboru ({{ e.candidates.filter(c => c.accepted).length }}) — zmiany kolejności i dopisywanie w edycji</small>
          <div v-for="c in e.candidates" :key="c.id" class="vote-cand" :class="{ ok: c.accepted === true, no: c.accepted === false, wait: c.accepted == null }">
            <span><b>{{ c.label }}</b><small v-if="c.nominations">{{ c.nominations }} {{ c.nominations === 1 ? 'zgłoszenie' : c.nominations < 5 ? 'zgłoszenia' : 'zgłoszeń' }}{{ c.accepted == null ? ' · czeka na decyzję' : '' }}</small></span>
            <button class="small" :class="{ primary: c.accepted === true }" :disabled="busy" @click="reviewCand(c, c.accepted === true ? null : true)"><svg class="i"><use href="#check"/></svg>{{ c.accepted === true ? 'Na liście' : 'Dodaj' }}</button>
            <button class="small" :class="{ danger: c.accepted === false }" :disabled="busy" @click="reviewCand(c, c.accepted === false ? null : false)"><svg class="i"><use href="#x"/></svg>{{ c.accepted === false ? 'Odrzucone' : 'Odrzuć' }}</button>
          </div>
          <p v-if="!e.candidates.length" class="note">Lista jest pusta{{ e.allow_nominations ? ' i nikt jeszcze niczego nie zgłosił' : ' — dodaj pozycje w edycji' }}.</p>
          <button class="primary vote-start" :disabled="busy || !e.candidates.some(c => c.accepted)" @click="setElectionStatus(e, 'voting')"><svg class="i"><use href="#check"/></svg>Otwórz głosowanie teraz ({{ e.candidates.filter(c => c.accepted).length }})</button>
        </div>
      </template>

      <!-- głosowanie -->
      <template v-else-if="e.status === 'voting' || e.status === 'paused'">
        <p v-if="e.voted" class="vote-done"><svg class="i"><use href="#check"/></svg>Twój głos został oddany. Dziękujemy!</p>
        <p v-else-if="e.status === 'paused'" class="vote-paused"><svg class="i"><use href="#info"/></svg>Głosowanie jest wstrzymane — prowadzący włączy je w odpowiednim momencie.</p>
        <template v-else>
          <small class="vote-lbl">{{ e.max_choices === 1 ? 'Wybierz jedną odpowiedź' : 'Wybierz do ' + e.max_choices }} · wybrano {{ (votes.ballot[e.id] || []).length }}</small>
          <button v-for="c in e.candidates.filter(c => c.accepted)" :key="c.id" class="vote-opt" :class="{ on: (votes.ballot[e.id] || []).includes(c.id) }" :aria-pressed="(votes.ballot[e.id] || []).includes(c.id)" :disabled="!(votes.ballot[e.id] || []).includes(c.id) && e.max_choices > 1 && (votes.ballot[e.id] || []).length >= e.max_choices" @click="toggleBallot(e, c)">
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
            <button class="danger" :disabled="busy" @click="setElectionStatus(e, 'closed')">Zakończ teraz i policz</button>
          </div>
        </div>
      </template>

      <!-- wyniki -->
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

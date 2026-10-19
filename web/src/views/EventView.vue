<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// EventView
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p v-if="currentEvent.status === 'pending'" class="pending-note"><svg class="i"><use href="#bell"/></svg>{{ canReview ? 'Zgłoszenie czeka na Twoje zatwierdzenie' + (currentEvent.createdBy ? ' — od: ' + currentEvent.createdBy : '') + '.' : 'Czeka na zatwierdzenie — po zatwierdzeniu zobaczą je wszyscy.' }}</p>
  <p v-else-if="!eventSavedOnce && !canEdit && !canReview" class="pending-note"><svg class="i"><use href="#bell"/></svg>Wydarzenie pojawi się w kalendarzu po zatwierdzeniu przez lidera newslettera, radę zboru albo administratora.</p>
  <!-- podgląd wydarzenia (zawsze najpierw; edycja po „Edytuj”) -->
  <article v-if="!eventEditable || !eventEditing" class="ann-view ev-view">
    <img v-if="currentEvent.image" class="ann-hero" :src="currentEvent.image" alt="">
    <div class="ann-tags"><span class="ann-tag" :style="{ background: 'color-mix(in srgb, ' + typeOf(currentEvent.type).color + ' 22%, transparent)', color: typeOf(currentEvent.type).color }">{{ typeOf(currentEvent.type).name }}</span></div>
    <h2 class="ann-view-title">{{ currentEvent.title || typeOf(currentEvent.type).name }}</h2>
    <p v-if="typeOf(currentEvent.type).community" class="ev-community"><svg class="i"><use href="#users"/></svg>Inicjatywa członków kościoła{{ currentEvent.createdBy ? ' — organizuje: ' + currentEvent.createdBy : '' }}</p>
    <div class="facts">
      <span class="fact"><svg class="i"><use href="#calendar"/></svg><span><small>Kiedy</small><b>{{ pretty(currentEvent.date).replace(/^./, c => c.toUpperCase()) }}<template v-if="currentEvent.time">, {{ currentEvent.time }}</template></b></span></span>
      <a v-if="currentEvent.place" class="fact" :href="mapLink(currentEvent.place)" target="_blank" rel="noopener"><svg class="i"><use href="#pin"/></svg><span><small>Gdzie · mapa</small><b>{{ currentEvent.place }}</b></span></a>
    </div>
    <div v-if="currentEvent.description" class="ann-view-text">{{ currentEvent.description }}</div>
    <template v-if="(currentEvent.people || []).length">
      <h3 class="view-h">Biorą udział</h3>
      <div class="ev-people"><span v-for="p in currentEvent.people" :key="p.id" class="ev-person"><svg class="i"><use href="#user"/></svg>{{ p.name }}</span></div>
    </template>
    <template v-if="(currentEvent.program || []).length">
      <h3 class="view-h">Program</h3>
      <program-editor :items="currentEvent.program" :start="currentEvent.time || '00:00'" readonly></program-editor>
    </template>
    <template v-if="api.enabled && (eventVotes.length || (votes.canRun && ['czlonkowskie', 'rada'].includes(currentEvent.type)))">
      <h3 class="view-h">Głosowania</h3>
      <div class="ev-votes">
        <div v-for="e in eventVotes" :key="e.id" class="ev-vote" :class="e.status">
          <span class="vote-status" :class="e.status">{{ VOTE_STATUS[e.status === 'nominations' && e.kind === 'options' ? 'ready' : e.status] }}</span>
          <b>{{ e.title }}</b>
          <template v-if="votes.canRun">
            <button v-if="e.status === 'nominations' || e.status === 'paused'" class="small primary" :disabled="busy || !e.candidates.some(c => c.accepted)" :title="e.candidates.some(c => c.accepted) ? '' : 'Najpierw zatwierdź kandydatów'" @click="setElectionStatus(e, 'voting')">{{ e.status === 'paused' ? 'Wznów' : 'Aktywuj' }}</button>
            <button v-if="e.status === 'voting'" class="small" :disabled="busy" @click="setElectionStatus(e, 'paused')">Wstrzymaj</button>
            <button v-if="e.status === 'voting' || e.status === 'paused'" class="small danger" :disabled="busy" @click="setElectionStatus(e, 'closed')">Zakończ</button>
          </template>
          <button class="small" @click="goToVote(e)">{{ e.status === 'voting' && !e.voted ? 'Głosuj' : e.status === 'closed' ? 'Wyniki' : 'Otwórz' }}<svg class="i"><use href="#chev"/></svg></button>
        </div>
        <button v-if="votes.canRun" class="small ev-vote-add" @click="newVoteFor(currentEvent.id)"><svg class="i"><use href="#plus"/></svg>Nowe głosowanie na tym spotkaniu</button>
      </div>
    </template>
    <template v-if="['czlonkowskie', 'rada'].includes(currentEvent.type) && eventProtocols.length">
      <h3 class="view-h">Protokoły</h3>
      <button v-for="p in eventProtocols" :key="p.id" class="songsbtn" @click="openProto(p)"><svg class="i"><use href="#list"/></svg>{{ p.title }}<svg class="i chev"><use href="#chev"/></svg></button>
    </template>
    <section v-if="signup.board" class="signup-card">
      <div class="su-head">
        <b>Zapisy</b>
        <span class="su-count">{{ signup.board.taken }}<template v-if="signup.board.max"> / {{ signup.board.max }}</template> {{ signup.board.max ? 'miejsc zajętych' : 'zapisanych' }}</span>
      </div>
      <div v-if="signup.board.max" class="su-bar"><span :style="{ width: Math.min(100, signup.board.taken / signup.board.max * 100) + '%' }"></span></div>
      <p class="note su-info"><template v-if="signup.board.reserve">Lista rezerwowa: {{ signup.board.reserve }} · </template><template v-if="signup.board.manage && signup.board.pending">Do zatwierdzenia: {{ signup.board.pending }} · </template>{{ signup.board.open ? 'zapisy do ' + pretty(signup.board.until) : 'zapisy zamknięte' }}</p>
      <div v-if="signup.board.mine" class="su-mine" :class="signup.board.mine.status">
        <svg class="i"><use :href="signup.board.mine.status === 'confirmed' ? '#check' : '#bell'"/></svg>
        <span>{{ SIGNUP_STATUS[signup.board.mine.status] }} · {{ seatsText(signup.board.mine) }}</span>
      </div>
      <template v-if="signup.board.open">
        <div class="su-form">
          <div><label>Dorośli</label><div class="stepper"><button type="button" aria-label="Mniej dorosłych" @click="signup.adults = Math.max(0, signup.adults - 1)">−</button><b>{{ signup.adults }}</b><button type="button" aria-label="Więcej dorosłych" @click="signup.adults++">+</button></div></div>
          <div v-if="signup.board.kids"><label>Dzieci</label><div class="stepper"><button type="button" aria-label="Mniej dzieci" @click="signup.children = Math.max(0, signup.children - 1)">−</button><b>{{ signup.children }}</b><button type="button" aria-label="Więcej dzieci" @click="signup.children++">+</button></div></div>
        </div>
        <input v-model="signup.note" placeholder="Uwagi (np. wiek dzieci, dieta) — opcjonalnie" autocomplete="off">
        <div class="su-actions">
          <button class="primary" :disabled="busy || signup.adults + signup.children < 1" @click="signupJoin">{{ signup.board.mine ? 'Zmień zapis' : signup.board.max && signup.board.taken + signup.adults + signup.children > signup.board.max && !signup.board.approval ? 'Zapisz na listę rezerwową' : 'Zapisz się' }}</button>
          <button v-if="signup.board.mine" :disabled="busy" @click="signupLeave">Wypisz się</button>
        </div>
      </template>
      <!-- twórca wydarzenia / prawo edycji: lista zapisanych -->
      <div v-if="signup.board.manage && signup.board.list.length" class="su-list">
        <template v-for="g in signupGroups" :key="g.id">
          <small>{{ g.title }} ({{ g.list.reduce((n, p) => n + p.adults + p.children, 0) }})</small>
          <div v-for="p in g.list" :key="p.id" class="mn-person">
            <span><b>{{ p.name }}</b><small>{{ seatsText(p) }}<template v-if="p.grupa"> · {{ p.grupa }}</template><template v-if="p.note"> · {{ p.note }}</template></small></span>
            <button v-if="p.status !== 'confirmed'" class="primary" :disabled="busy" @click="signupDecide(p, 'confirm')">Potwierdź</button>
            <button v-if="p.status === 'pending'" :disabled="busy" @click="signupDecide(p, 'reserve')">Rezerwa</button>
            <button class="icon" :disabled="busy" :aria-label="'Usuń ' + p.name + ' z zapisów'" title="Usuń z zapisów" @click="signupDecide(p, 'remove')"><svg class="i"><use href="#x"/></svg></button>
          </div>
        </template>
      </div>
    </section>
    <div v-if="canReview && currentEvent.status === 'pending'" class="approve-row">
      <button :disabled="busy" @click="rejectEvent"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
      <button class="primary" :disabled="busy" @click="approveEvent"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
    </div>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <button v-if="eventEditable" class="ann-edit-btn" @click="eventEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj wydarzenie</button>
    <template v-if="currentEvent.asb">
      <p class="note">Spotkanie z grafiku ASB — zmienia się je w zakładce ASB, kalendarz aktualizuje się sam.</p>
      <button v-if="canAsb" class="ann-edit-btn" @click="openAsbMeeting(currentEvent.asb)"><svg class="i"><use href="#users"/></svg>Otwórz w ASB</button>
    </template>
  </article>
  <template v-else>
  <fieldset class="plain" :disabled="!eventEditable">
    <label for="evType">Rodzaj</label>
    <select id="evType" v-model="currentEvent.type" class="field" @change="typeChanged">
      <option v-for="t in eventTypesFor" :key="t.id" :value="t.id">{{ t.name }}</option>
    </select>
    <p v-if="!eventSavedOnce && canEdit" class="note" style="margin-top:4px">Nabożeństwo dodajesz w <button type="button" class="linkbtn" @click="newEvent('nabozenstwo')">Nabożeństwa → nowe nabożeństwo</button>.</p>
    <label for="evTitle">Nazwa <span class="req">*</span></label>
    <input id="evTitle" v-model="currentEvent.title" :class="{ invalid: !currentEvent.title.trim() }" autocomplete="off">
    <div class="row">
      <div><label for="evDate">Data <span class="req">*</span></label><input id="evDate" v-model="currentEvent.date" type="date" :class="{ invalid: !currentEvent.date }"></div>
      <div><label for="evTime">Godzina</label><input id="evTime" v-model="currentEvent.time" type="time"></div>
    </div>
    <label for="evPlace">Miejsce</label>
    <input id="evPlace" v-model="currentEvent.place" autocomplete="off">
    <label for="evDesc">Opis</label>
    <textarea id="evDesc" v-model="currentEvent.description" placeholder="Co, dla kogo, co przygotować…"></textarea>
    <template v-if="canNotify">
      <label>Osoby biorące udział (opcjonalnie)</label>
      <div v-if="(currentEvent.people || []).length" class="ev-people edit">
        <span v-for="p in currentEvent.people" :key="p.id" class="ev-person">{{ p.name }}<button type="button" :aria-label="'Usuń ' + p.name" @click="currentEvent.people = currentEvent.people.filter(x => x.id !== p.id)"><svg class="i"><use href="#x"/></svg></button></span>
      </div>
      <button type="button" class="songsbtn" :disabled="busy" @click="openNotify('people')"><svg class="i"><use href="#users"/></svg>{{ (currentEvent.people || []).length ? 'Zmień osoby (' + currentEvent.people.length + ')' : 'Dodaj osoby' }}<svg class="i chev"><use href="#chev"/></svg></button>
      <p class="note" style="margin:6px 0 0">Nowo dodane osoby po zapisaniu dostaną powiadomienie (dzwonek i telefon), a w wydarzeniu widać, kto bierze udział.</p>
    </template>
    <template v-if="drive.uploadImage || currentEvent.image">
      <label>Grafika (opcjonalnie)</label>
      <img v-if="currentEvent.image" class="ann-img edit" :src="currentEvent.image" alt="">
      <div v-if="drive.uploadImage" class="row">
        <button type="button" :disabled="imgBusy" @click="$refs.evImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : currentEvent.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
        <button v-if="currentEvent.image" type="button" :disabled="imgBusy" @click="currentEvent.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
      </div>
      <input ref="evImg" type="file" accept="image/*" hidden @change="pickEventImage">
      <label v-if="currentEvent.image" class="check"><input v-model="currentEvent.projector" type="checkbox">Pokaż na nabożeństwie — ta grafika w pętli ogłoszeń na rzutniku (przed i po)</label>
    </template>
    <label v-if="api.enabled" class="check"><input type="checkbox" :checked="eventIsPublic(currentEvent)" @change="currentEvent.public = $event.target.checked">Widoczne dla gości (bez konta)</label>
    <!-- Zapisy: limit miejsc (dorośli + dzieci), dzieci, zatwierdzanie przez twórcę, termin; brak miejsc → lista rezerwowa -->
    <template v-if="api.enabled">
      <label class="check"><input type="checkbox" :checked="!!currentEvent.signup?.enabled" @change="toggleSignup($event.target.checked)">Zapisy na to wydarzenie</label>
      <div v-if="currentEvent.signup?.enabled" class="signup-set">
        <div class="row">
          <div><label for="suMax">Limit miejsc</label><input id="suMax" v-model.number="currentEvent.signup.max" type="number" min="1" inputmode="numeric" placeholder="bez limitu"></div>
          <div><label for="suUntil">Zapisy do</label><input id="suUntil" v-model="currentEvent.signup.until" type="date" :max="currentEvent.date"></div>
        </div>
        <label class="check"><input v-model="currentEvent.signup.kids" type="checkbox">Można zapisać dzieci (liczą się do limitu)</label>
        <label class="check"><input v-model="currentEvent.signup.approval" type="checkbox">Zapisy zatwierdza twórca wydarzenia</label>
        <p class="note" style="margin:4px 0 0">{{ currentEvent.signup.approval ? 'Każdy zapis czeka na Twoje potwierdzenie (dostaniesz powiadomienie). Gdy brak miejsc — potwierdzony trafia na listę rezerwową.' : 'Zapis od razu na listę; gdy brak miejsc — na listę rezerwową, a po zwolnieniu miejsca wchodzi sam.' }}<template v-if="!currentEvent.signup.until"> Bez daty — zapisy do dnia wydarzenia.</template></p>
      </div>
    </template>
  </fieldset>
  <label>Program</label>
  <program-editor :items="currentEvent.program" :start="currentEvent.time || '00:00'" :readonly="!eventEditable" :template="typeOf(currentEvent.type).program" @fill="fillProgram(currentEvent, currentEvent.type)"></program-editor>
  <template v-if="['czlonkowskie', 'rada'].includes(currentEvent.type) && eventSavedOnce">
    <label>Protokoły</label>
    <button v-for="p in eventProtocols" :key="p.id" class="songsbtn" @click="openProto(p)"><svg class="i"><use href="#list"/></svg>{{ p.title }}<svg class="i chev"><use href="#chev"/></svg></button>
    <p v-if="!eventProtocols.length" class="note" style="margin:0 0 8px">Do tego spotkania nie dołączono jeszcze protokołu.</p>
    <button v-if="canWriteProto(currentEvent.type === 'rada' ? 'rada' : 'czlonkowskie')" class="songsbtn" @click="protoForEvent(currentEvent)"><svg class="i"><use href="#plus"/></svg>Dołącz protokół<svg class="i chev"><use href="#chev"/></svg></button>
  </template>
  <p v-if="currentEvent.createdBy || currentEvent.updatedBy" class="note who">
    <template v-if="currentEvent.createdBy">Utworzył(a): {{ currentEvent.createdBy }}</template>
    <template v-if="currentEvent.updatedBy"><br>Ostatnia zmiana: {{ currentEvent.updatedBy }}<template v-if="currentEvent.updated">, {{ new Date(currentEvent.updated).toLocaleString('pl', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</template></template>
  </p>
  <div v-if="canNotify" class="notify-box">
    <label>Powiadom osoby (opcjonalnie)</label>
    <button type="button" class="songsbtn" :disabled="busy" @click="openNotify"><svg class="i"><use href="#bell"/></svg>{{ notify.ids.length ? 'Powiadomię: ' + notifySummary : 'Wybierz, kogo powiadomić' }}<svg class="i chev"><use href="#chev"/></svg></button>
    <p class="note" style="margin:6px 0 0">Po zapisaniu powiadomienie pojawi się w aplikacji (dzwonek), a dodatkowo na telefonach osób, które je włączyły.</p>
  </div>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div v-if="canReview && currentEvent.status === 'pending'" class="approve-row">
    <button :disabled="busy" @click="rejectEvent"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
    <button class="primary" :disabled="busy" @click="approveEvent"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
  </div>
  <div v-if="eventEditable" class="bar">
    <template v-if="eventSavedOnce">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeEvent">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń wydarzenie" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    </template>
    <button class="primary" :disabled="busy || (!eventDirty && !notify.ids.length) || !currentEvent.title.trim() || !currentEvent.date" @click="saveEvent()">
      <svg v-if="!eventDirty && !notify.ids.length && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : eventDirty ? 'Zapisz' : notify.ids.length ? 'Wyślij powiadomienie' : 'Zapisane' }}
    </button>
  </div>
  </template>
</template>

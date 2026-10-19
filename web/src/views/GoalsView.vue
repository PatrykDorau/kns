<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// GoalsView
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <p class="goals-intro">Część swojej dziesięciny możesz przeznaczyć na wybrany cel. Deklarujesz kwotę <b>miesięcznie</b>, a po każdym miesiącu potwierdzasz, że Twoja dziesięcina wyniosła co najmniej sumę deklaracji — jeśli nie, zmniejszasz je. Twoje kwoty widzisz Ty i rada zboru, pozostali — tylko pasek postępu.</p>
  <p v-if="goals.error" class="error">{{ goals.error }}</p>

  <section v-for="m in shownMonths" :key="m.month" class="goal-confirm" :class="{ done: m.confirmed, due: !m.confirmed && m.month < thisMonth, later: !m.confirmed && m.month >= thisMonth && goals.expand !== m.month }">
    <div class="gc-h"><svg class="i"><use :href="m.confirmed ? '#check' : '#heart'"/></svg><b>{{ monthName(m.month) }}</b><span class="ann-tag">{{ m.confirmed ? 'potwierdzone · ' + zl(m.total) : m.month < thisMonth ? 'do potwierdzenia' : 'bieżący miesiąc' }}</span></div>
    <!-- bieżący miesiąc: potwierdza się razem z przelewem — do tego czasu krótka informacja -->
    <div v-if="!m.confirmed && m.month >= thisMonth && goals.expand !== m.month" class="gc-later">
      <span>Potwierdzisz, gdy wyślesz dziesięcinę za {{ monthName(m.month).split(' ')[0] }} — co najmniej <b>{{ zl(itemsSum(m)) }}</b>.</span>
      <button class="small" @click="goals.expand = m.month">Wysyłam teraz</button>
    </div>
    <template v-else-if="!m.confirmed">
      <p>Czy Twoja dziesięcina {{ m.month < thisMonth ? 'w tym miesiącu wyniosła' : 'w tym miesiącu wynosi' }} co najmniej <b>{{ zl(itemsSum(m)) }}</b>?</p>
      <ul class="gc-items"><li v-for="it in m.items || []" :key="it.goal"><span>{{ it.title }}</span><b>{{ zl(it.amount) }}</b></li></ul>
      <template v-if="goals.reduce?.month === m.month">
        <p class="note">Wpisz, ile faktycznie poszło na każdy cel — deklaracje zmniejszą się do tych kwot (na kolejne miesiące też).</p>
        <div v-for="it in goals.reduce.items" :key="it.goal" class="gc-reduce"><label :for="'gr' + it.goal">{{ it.title }}</label><input :id="'gr' + it.goal" v-model.number="it.value" type="number" min="0" :max="it.amount" step="10" inputmode="numeric"><small>z {{ zl(it.amount) }}</small></div>
        <div v-if="goals.confirming?.month !== m.month" class="row"><button class="primary" :disabled="busy" @click="askConfirm(m, true)">Dalej — z tymi kwotami</button><button :disabled="busy" @click="goals.reduce = null">Anuluj</button></div>
      </template>
      <div v-else-if="goals.confirming?.month !== m.month" class="row"><button class="primary" :disabled="busy" @click="askConfirm(m)"><svg class="i"><use href="#check"/></svg>Tak, potwierdzam</button><button :disabled="busy" @click="startReduce(m)">Nie — zmniejszam deklaracje</button></div>
      <!-- drugi krok: przelew i ostateczne potwierdzenie -->
      <div v-if="goals.confirming?.month === m.month" class="gc-final">
        <b>Wyślij przelew dziesięciny — co najmniej {{ zl(goals.confirming.total) }}</b>
        <dl v-if="support.account || support.blik" class="gc-transfer">
          <template v-if="support.account"><dt>Konto</dt><dd><code>{{ support.account }}</code><button class="small" @click="copyText(support.account.replace(/\s/g, ''), 'konto')">{{ copiedWhat === 'konto' ? 'Skopiowano' : 'Kopiuj' }}</button></dd></template>
          <template v-if="support.name"><dt>Odbiorca</dt><dd>{{ support.name }}</dd></template>
          <dt>Tytuł</dt><dd><code>{{ transferTitle(m) }}</code><button class="small" @click="copyText(transferTitle(m), 'tytul')">{{ copiedWhat === 'tytul' ? 'Skopiowano' : 'Kopiuj' }}</button></dd>
          <template v-if="support.blik"><dt>BLIK</dt><dd>na numer <code>{{ support.blik }}</code><button class="small" @click="copyText(support.blik.replace(/\s/g, ''), 'blik')">{{ copiedWhat === 'blik' ? 'Skopiowano' : 'Kopiuj' }}</button></dd></template>
        </dl>
        <p v-else class="note">Dane do przelewu ustawia administrator (na tej stronie, pod listą celów).</p>
        <p class="gc-warn"><svg class="i"><use href="#alert"/></svg><span>Potwierdzenie jest ostateczne. Do {{ nextMonthStart }} nie zmienisz też swoich deklaracji (nowa deklaracja na inny cel będzie liczona od {{ nextMonthStart }}).</span></p>
        <label class="check"><input v-model="goals.sent" type="checkbox">Wysłałem(-am) przelew dziesięciny — co najmniej {{ zl(goals.confirming.total) }}</label>
        <div class="row"><button class="primary" :disabled="busy || !goals.sent" @click="confirmMonth(m)"><svg class="i"><use href="#check"/></svg>Potwierdzam ostatecznie</button><button :disabled="busy" @click="goals.confirming = null">Wróć</button></div>
      </div>
    </template>
  </section>

  <!-- formularz celu (rada zboru, pastor, administrator) -->
  <section v-if="goals.edit" class="goal-form">
    <h2>{{ goals.edit._new ? 'Nowy cel' : 'Edycja celu' }}</h2>
    <label for="gTitle">Nazwa celu</label>
    <input id="gTitle" v-model="goals.edit.title" maxlength="120" :class="{ invalid: !goals.edit.title.trim() }" placeholder="np. Remont sali, Wyjazd młodzieży, Misja w …" autocomplete="off">
    <label for="gDesc">Opis (na co, dlaczego)</label>
    <textarea id="gDesc" v-model="goals.edit.description" class="ann-text"></textarea>
    <div class="goal-form-row">
      <span><label for="gTarget">Kwota łącznie (zł)</label><input id="gTarget" v-model.number="goals.edit.target" type="number" min="1" step="100" inputmode="numeric" :class="{ invalid: !(goals.edit.target > 0) }"></span>
      <span><label for="gEnds">Termin</label><input id="gEnds" v-model="goals.edit.ends" type="date" :min="todayStr" :class="{ invalid: !goals.edit.ends }"></span>
    </div>
    <label>Grafika (opcjonalnie)</label>
    <img v-if="goals.edit.image" class="ann-img edit" :src="goals.edit.image" alt="">
    <div v-if="drive.uploadImage" class="row">
      <button type="button" :disabled="imgBusy" @click="$refs.goalImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : goals.edit.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
      <button v-if="goals.edit.image" type="button" @click="goals.edit.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
    </div>
    <input ref="goalImg" type="file" accept="image/*" hidden @change="pickGoalImage">
    <label v-if="!goals.edit._new" class="check"><input v-model="goals.edit.closed" type="checkbox">Zakończony — nowych deklaracji już nie przyjmuje</label>
    <div class="bar">
      <button class="primary" :disabled="busy || !goals.edit.title.trim() || !(goals.edit.target > 0) || !goals.edit.ends" @click="saveGoal">Zapisz cel</button>
      <button :disabled="busy" @click="goals.edit = null">Anuluj</button>
      <button v-if="!goals.edit._new" class="danger" :disabled="busy" @click="removeGoal(goals.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
    </div>
  </section>

  <template v-else>
    <div class="section"><h2>Cele</h2><button v-if="goals.canManage" class="small" @click="newGoal"><svg class="i"><use href="#plus"/></svg>Nowy cel</button></div>
    <p v-if="goals.status.monthly" class="note">Razem deklarujesz <b>{{ zl(goals.status.monthly) }}</b> miesięcznie ze swojej dziesięciny.</p>
    <div v-if="goals.busy && !goals.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!goals.list.length" class="note">Nie ma jeszcze celów.{{ goals.canManage ? ' Dodaj pierwszy — „Nowy cel”.' : ' Ogłasza je rada zboru.' }}</p>
    <details v-if="canManage" class="goal-support">
      <summary>Dane do przelewu dziesięciny (widzą je członkowie przy potwierdzaniu)</summary>
      <label for="spAcc">Numer konta</label><input id="spAcc" v-model="supportEdit.account" inputmode="numeric" placeholder="np. 12 1020 …" autocomplete="off">
      <label for="spName">Odbiorca</label><input id="spName" v-model="supportEdit.name" placeholder="Kościół Na Skale" autocomplete="off">
      <label for="spTitle">Tytuł przelewu (miesiąc i imię dopiszą się same)</label><input id="spTitle" v-model="supportEdit.title" placeholder="Dziesięcina" autocomplete="off">
      <label for="spBlik">Telefon do BLIK</label><input id="spBlik" v-model="supportEdit.blik" inputmode="tel" placeholder="np. 789 571 542" autocomplete="off">
      <div class="row"><button class="primary" :disabled="busy" @click="saveSupport">Zapisz dane</button></div>
    </details>
    <article v-for="g in goals.list" :key="g.id" class="goal" :class="{ closed: g.closed, focus: goals.open === g.id }">
      <img v-if="g.image" class="goal-img" :src="g.image" alt="" loading="lazy">
      <div class="goal-h"><b>{{ g.title }}</b><span class="ann-tag">{{ g.closed ? 'zakończony' : 'do ' + shortDate(g.ends) }}</span></div>
      <p v-if="g.description" class="goal-desc">{{ g.description }}</p>
      <div class="goal-bar" role="progressbar" :aria-valuenow="goalPct(g)" aria-valuemin="0" aria-valuemax="100" :title="'Zebrano ' + goalPct(g) + '% · z deklaracjami do terminu ' + goalProj(g) + '%'">
        <i class="proj" :style="{ width: goalProj(g) + '%' }"></i><i class="done" :style="{ width: goalPct(g) + '%' }"></i>
      </div>
      <div class="goal-nums"><span><b>{{ zl(g.confirmed) }}</b> z {{ zl(g.target) }} · {{ goalPct(g) }}%</span><span>{{ g.people }} {{ g.people === 1 ? 'osoba' : g.people % 10 >= 2 && g.people % 10 <= 4 && (g.people % 100 < 10 || g.people % 100 >= 20) ? 'osoby' : 'osób' }} · {{ zl(g.monthly) }} / mies.</span></div>
      <small v-if="!g.closed" class="goal-legend"><i class="lg-done"></i>potwierdzone <i class="lg-proj"></i>z deklaracjami do terminu: {{ zl(goalProjAmount(g)) }}</small>
      <p v-if="monthLocked && g.mine" class="note goal-locked"><svg class="i"><use href="#check"/></svg><span>Twoja deklaracja: <b>{{ zl(g.mine) }}</b> miesięcznie. Dziesięcina w tym miesiącu już potwierdzona — zmienisz ją od {{ nextMonthStart }}.</span></p>
      <p v-else-if="goalDue && g.mine" class="note goal-locked"><svg class="i"><use href="#heart"/></svg><span>Twoja deklaracja: <b>{{ zl(g.mine) }}</b> miesięcznie. Najpierw potwierdź {{ monthName(goalDue.month).split(' ')[0] }} (u góry) — potem ją zmienisz.</span></p>
      <div v-else class="goal-mine">
        <p v-if="monthLocked && !g.mine" class="note">W tym miesiącu dziesięcina jest już potwierdzona — nowa deklaracja będzie liczona od {{ nextMonthStart }}.</p>
        <label :for="'gm' + g.id">{{ g.mine ? 'Twoja deklaracja' : 'Ile z dziesięciny co miesiąc?' }} <small>(zł miesięcznie)</small></label>
        <div class="row">
          <input :id="'gm' + g.id" v-model.number="goals.amount[g.id]" type="number" min="0" step="10" inputmode="numeric" :disabled="g.closed && !g.mine" placeholder="np. 100">
          <button class="primary" :disabled="busy || !(+goals.amount[g.id] >= 0) || +goals.amount[g.id] === g.mine || (!g.mine && !+goals.amount[g.id]) || (g.closed && +goals.amount[g.id] > g.mine)" @click="savePledge(g)">{{ g.mine ? 'Zmień' : 'Deklaruję' }}</button>
          <button v-if="g.mine" :disabled="busy" @click="withdraw(g)">Wycofaj</button>
        </div>
      </div>
      <div v-if="goals.canManage" class="goal-admin">
        <button class="small" @click="editGoal(g)"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
        <button class="small" @click="toggleGoalPeople(g)"><svg class="i"><use href="#users"/></svg>{{ goals.people[g.id] ? 'Ukryj osoby' : 'Kto deklaruje' }}</button>
      </div>
      <table v-if="goals.people[g.id]" class="goal-people">
        <thead><tr><th>Osoba</th><th>/ mies.</th><th>razem</th><th>{{ monthShort(prevMonth) }}</th><th>{{ monthShort(thisMonth) }}</th></tr></thead>
        <tbody>
          <tr v-for="p in goals.people[g.id]" :key="p.name"><td>{{ p.name }}</td><td>{{ zl(p.amount) }}</td><td>{{ zl(p.given) }}</td><td :class="{ miss: p.prev == null && p.since < thisMonth }">{{ p.prev == null ? (p.since < thisMonth ? 'brak' : '—') : '✓ ' + zl(p.prev) }}</td><td>{{ p.now == null ? '—' : '✓ ' + zl(p.now) }}</td></tr>
          <tr v-if="!goals.people[g.id].length"><td colspan="5" class="muted">Nikt jeszcze nie zadeklarował.</td></tr>
        </tbody>
      </table>
    </article>
  </template>
</template>

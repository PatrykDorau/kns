<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { computed, defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import { focusEl } from '@/utils/dom'

// Cele wsparcia: najpierw okienko „ile w tym miesiącu wpłaciłeś(-aś) dziesięciny”, potem procent tej kwoty (ustala rada)
// rozdzielasz na cele. Do końca miesiąca można zmieniać — potem miesiąc zamyka się sam (bez potwierdzania).
const IN_MONTH = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu']
export default defineComponent({
  setup() {
    const app = useApp()
    const cur = computed(() => app.goals.list.find(g => g.id === app.goals.open))
    const openGoal = g => { app.goals.open = g.id; app.goals.edit = null; scrollTo(0, 0) }
    const closeGoal = () => { app.goals.open = ''; scrollTo(0, 0) }
    const peopleWord = n => n === 1 ? 'osoba' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'osoby' : 'osób'
    // ile można wpisać na ten cel: to, co zostało, plus to, co już na nim jest
    const maxFor = g => app.goalLeft.value + (g.mine || 0)
    const inMonth = m => IN_MONTH[+String(m || '').slice(5, 7) - 1] || 'tym miesiącu'
    return { ...app, cur, openGoal, closeGoal, peopleWord, maxFor, inMonth, focusEl }
  },
})
</script>

<template>
  <p v-if="!goals.open && !goals.edit" class="beta-note"><small class="beta-tag">beta</small>Funkcja eksperymentalna — może się jeszcze zmienić. Uwagi zgłoś w „Zgłoszeniach”.</p>
  <details v-if="!goals.open && !goals.edit" class="goals-how"><summary><svg class="i"><use href="#info"/></svg>Jak to działa?<svg class="i mn-chev"><use href="#down"/></svg></summary><p class="goals-intro">Co miesiąc podajesz, ile wpłaciłeś(-aś) dziesięciny. <b>{{ goals.status.percent || 10 }}%</b> tej kwoty możesz rozdzielić na wybrane cele. Do końca miesiąca możesz to zmieniać — potem miesiąc zamyka się sam, a kwoty trafiają do zebranych. Twoje kwoty widzisz Ty i rada zboru, pozostali — tylko pasek postępu.</p></details>
  <p v-if="goals.error" class="error">{{ goals.error }}</p>

  <!-- okienko: najpierw kwota wpłaconej dziesięciny -->
  <Transition name="ask-fade">
    <div v-if="goals.ask" class="np-overlay ask-overlay" @click.self="goals.ask = false" @keydown.esc="goals.ask = false">
      <form class="np-panel ask-panel tithe-pop" role="dialog" aria-modal="true" aria-label="Dziesięcina w tym miesiącu" @submit.prevent="saveTithe">
        <b class="ask-title">Ile w {{ inMonth(goals.status.month) }} wpłaciłeś(-aś) dziesięciny?</b>
        <p class="ask-text">{{ goals.status.percent || 10 }}% tej kwoty rozdzielisz potem na cele wsparcia. Kwotę możesz poprawić do końca miesiąca.</p>
        <label class="tithe-in"><input :ref="focusEl" v-model.number="goals.tithe" type="number" min="0" step="10" inputmode="numeric" placeholder="np. 800" aria-label="Kwota dziesięciny w złotych"><span>zł</span></label>
        <p v-if="+goals.tithe > 0" class="tithe-pool">Na cele: <b>{{ zl(Math.floor(+goals.tithe * (goals.status.percent || 10) / 100)) }}</b></p>
        <details v-if="support.account || support.blik" class="tithe-transfer"><summary>Jeszcze nie wpłaciłeś(-aś)? Dane do przelewu</summary>
          <dl class="gc-transfer">
            <template v-if="support.account"><dt>Konto</dt><dd><code>{{ support.account }}</code><button type="button" class="small" @click="copyText(support.account.replace(/\s/g, ''), 'konto')">{{ copiedWhat === 'konto' ? 'Skopiowano' : 'Kopiuj' }}</button></dd></template>
            <template v-if="support.name"><dt>Odbiorca</dt><dd>{{ support.name }}</dd></template>
            <dt>Tytuł</dt><dd><code>{{ transferTitle(goals.status) }}</code></dd>
            <template v-if="support.blik"><dt>BLIK</dt><dd>na numer <code>{{ support.blik }}</code></dd></template>
          </dl>
        </details>
        <div class="ask-btns">
          <button type="button" @click="goals.ask = false">Później</button>
          <button type="submit" class="primary" :disabled="busy || goals.tithe === '' || !(+goals.tithe >= 0)">Dalej</button>
        </div>
      </form>
    </div>
  </Transition>

  <!-- ten miesiąc: wpłacona dziesięcina i ile zostało do rozdzielenia -->
  <section v-if="!goals.open && !goals.edit && goals.status.month" class="goal-confirm tithe-card">
    <div class="gc-h"><svg class="i"><use href="#heart"/></svg><b>{{ monthName(goals.status.month) }}</b><span class="ann-tag">zamknie się samo {{ monthEnd }}</span></div>
    <template v-if="goals.status.tithe != null">
      <p>Wpłacona dziesięcina: <b>{{ zl(goals.status.tithe) }}</b> · na cele ({{ goals.status.percent }}%): <b>{{ zl(goals.status.pool) }}</b></p>
      <div class="goal-bar thin" role="progressbar" :aria-valuenow="goals.status.used" aria-valuemin="0" :aria-valuemax="goals.status.pool"><i class="done" :style="{ width: (goals.status.pool ? Math.min(100, goals.status.used / goals.status.pool * 100) : 0) + '%' }"></i></div>
      <p class="tithe-left">Rozdzielono {{ zl(goals.status.used) }} · zostało <b>{{ zl(goalLeft) }}</b>{{ goalLeft ? ' — wybierz cel poniżej' : '' }}</p>
      <button class="small" @click="goals.ask = true"><svg class="i"><use href="#pencil"/></svg>Zmień kwotę</button>
    </template>
    <template v-else>
      <p>Podaj, ile w tym miesiącu wpłaciłeś(-aś) dziesięciny — potem rozdzielisz {{ goals.status.percent || 10 }}% na cele.</p>
      <button class="primary" @click="goals.ask = true">Podaj kwotę</button>
    </template>
    <p v-if="goals.status.prev?.used" class="note tithe-prev">{{ monthName(goals.status.prev.month) }}: na cele {{ zl(goals.status.prev.used) }} — zamknięte.</p>
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
      <span><label for="gEnds">Termin</label><input id="gEnds" v-model="goals.edit.ends" type="date" :min="todayStr" :disabled="goals.edit.open" :class="{ invalid: !goals.edit.open && !goals.edit.ends }"></span>
    </div>
    <label>Grafika (opcjonalnie)</label>
    <img v-if="goals.edit.image" class="ann-img edit" :src="goals.edit.image" alt="">
    <div v-if="drive.uploadImage" class="row">
      <button type="button" :disabled="imgBusy" @click="$refs.goalImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : goals.edit.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
      <button v-if="goals.edit.image" type="button" @click="goals.edit.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
    </div>
    <input ref="goalImg" type="file" accept="image/*" hidden @change="pickGoalImage">
    <ImageLinkInput @pick="u => goals.edit.image = u" />
    <label class="check"><input v-model="goals.edit.open" type="checkbox">Bez terminu — zbieramy, dopóki cel nie zostanie zakończony</label>
    <label v-if="!goals.edit._new" class="check"><input v-model="goals.edit.closed" type="checkbox">Zakończony — nowych deklaracji już nie przyjmuje</label>
    <div class="bar">
      <button class="primary" :disabled="busy || !goals.edit.title.trim() || !(goals.edit.target > 0) || (!goals.edit.open && !goals.edit.ends)" @click="saveGoal">Zapisz cel</button>
      <button :disabled="busy" @click="goals.edit = null">Anuluj</button>
      <button v-if="!goals.edit._new" class="danger" :disabled="busy" @click="removeGoal(goals.edit)"><svg class="i"><use href="#trash"/></svg>Usuń</button>
    </div>
  </section>

  <!-- szczegóły celu -->
  <template v-else-if="goals.open">
    <button class="ghost small goal-back" @click="closeGoal"><svg class="i"><use href="#back"/></svg>Wszystkie cele</button>
    <div v-if="!cur && goals.busy" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div class="skel skel-row"></div></div>
    <p v-else-if="!cur" class="note">Nie ma takiego celu — mógł zostać usunięty.</p>
    <template v-else v-for="g in [cur]" :key="g.id">
      <article class="goal goal-detail" :class="{ closed: g.closed }">
        <img v-if="g.image" class="goal-img" :src="g.image" alt="" loading="lazy">
        <div class="goal-h"><b>{{ g.title }}</b><span class="ann-tag">{{ g.closed ? 'zakończony' : g.ends ? 'do ' + shortDate(g.ends) : 'bez terminu' }}</span></div>
        <p v-if="g.description" class="goal-desc">{{ g.description }}</p>
        <div class="goal-bar" role="progressbar" :aria-valuenow="goalPct(g)" aria-valuemin="0" aria-valuemax="100" :title="'Zebrano ' + goalPct(g) + '% · z tym miesiącem ' + goalProj(g) + '%'">
          <i class="proj" :style="{ width: goalProj(g) + '%' }"></i><i class="done" :style="{ width: goalPct(g) + '%' }"></i>
        </div>
        <div class="goal-nums"><span><b>{{ zl(g.confirmed) }}</b> z {{ zl(g.target) }} · {{ goalPct(g) }}%</span><span>{{ g.people }} {{ peopleWord(g.people) }}</span></div>
        <small v-if="g.now" class="goal-legend"><i class="lg-done"></i>zebrane <i class="lg-proj"></i>z tym miesiącem: {{ zl(goalProjAmount(g)) }}</small>
        <p v-if="g.mine_total" class="note">Ty dotąd: <b>{{ zl(g.mine_total) }}</b></p>
        <div v-if="!g.closed || g.mine" class="goal-mine">
          <template v-if="goals.status.tithe == null">
            <p class="note">Najpierw podaj, ile w tym miesiącu wpłaciłeś(-aś) dziesięciny.</p>
            <button class="primary" @click="goals.ask = true">Podaj kwotę</button>
          </template>
          <template v-else>
            <label :for="'gm' + g.id">Na ten cel w tym miesiącu <small>(do rozdzielenia zostało {{ zl(goalLeft) }})</small></label>
            <div class="row">
              <input :id="'gm' + g.id" v-model.number="goals.amount[g.id]" type="number" min="0" :max="maxFor(g)" step="10" inputmode="numeric" :disabled="g.closed" placeholder="np. 50">
              <button class="primary" :disabled="busy || g.closed || !(+goals.amount[g.id] >= 0) || +goals.amount[g.id] === g.mine || +goals.amount[g.id] > maxFor(g)" @click="saveAllocation(g)">{{ g.mine ? 'Zmień' : 'Przeznaczam' }}</button>
              <button v-if="g.mine" :disabled="busy" @click="saveAllocation(g, 0)">Usuń</button>
            </div>
            <small v-if="+goals.amount[g.id] > maxFor(g)" class="bad">Najwyżej {{ zl(maxFor(g)) }}.</small>
          </template>
        </div>
        <div v-if="goals.canManage" class="goal-admin">
          <button class="small" @click="editGoal(g)"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
          <button class="small" @click="toggleGoalPeople(g)"><svg class="i"><use href="#users"/></svg>{{ goals.people[g.id] ? 'Ukryj osoby' : 'Kto wspiera' }}</button>
        </div>
        <table v-if="goals.people[g.id]" class="goal-people">
          <thead><tr><th>Osoba</th><th>{{ monthShort(thisMonth) }}</th><th>razem</th></tr></thead>
          <tbody>
            <tr v-for="p in goals.people[g.id]" :key="p.name"><td>{{ p.name }}</td><td>{{ p.now ? zl(p.now) : '—' }}</td><td>{{ zl(p.given) }}</td></tr>
            <tr v-if="!goals.people[g.id].length"><td colspan="3" class="muted">Nikt jeszcze nie wsparł.</td></tr>
          </tbody>
        </table>
      </article>
    </template>
  </template>

  <!-- lista celów -->
  <template v-else>
    <div class="section"><h2>Cele</h2><button v-if="goals.canManage" class="small" @click="newGoal"><svg class="i"><use href="#plus"/></svg>Nowy cel</button></div>
    <div v-if="goals.busy && !goals.list.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 3" :key="n" class="skel skel-row"></div></div>
    <p v-else-if="!goals.list.length" class="note">Nie ma jeszcze celów.{{ goals.canManage ? ' Dodaj pierwszy — „Nowy cel”.' : ' Ogłasza je rada zboru.' }}</p>
    <div class="goal-list">
      <button v-for="g in goals.list" :key="g.id" class="goal-card" :class="{ closed: g.closed }" @click="openGoal(g)">
        <img v-if="g.image" class="gcard-img" :src="g.image" alt="" loading="lazy">
        <span v-else class="gcard-img gcard-ic"><svg class="i"><use href="#money"/></svg></span>
        <span class="gcard-body">
          <span class="gcard-h"><b>{{ g.title }}</b><small>{{ g.closed ? 'zakończony' : g.ends ? 'do ' + shortDate(g.ends) : 'bez terminu' }}</small></span>
          <span class="goal-bar thin" role="progressbar" :aria-valuenow="goalPct(g)" aria-valuemin="0" aria-valuemax="100"><i class="proj" :style="{ width: goalProj(g) + '%' }"></i><i class="done" :style="{ width: goalPct(g) + '%' }"></i></span>
          <span class="gcard-nums"><span><b>{{ zl(g.confirmed) }}</b> z {{ zl(g.target) }}</span><b>{{ goalPct(g) }}%</b></span>
          <span v-if="g.mine" class="ann-tag pin">W tym miesiącu: {{ zl(g.mine) }}</span>
        </span>
        <svg class="i chev"><use href="#chev"/></svg>
      </button>
    </div>
    <details v-if="goals.canManage" class="goal-support">
      <summary>Ile procent dziesięciny na cele</summary>
      <label for="gShare">Procent (dla wszystkich, od razu)</label>
      <div class="row"><input id="gShare" v-model.number="goals.share" type="number" min="1" max="100" inputmode="numeric"><button class="primary" :disabled="busy || !(+goals.share >= 1 && +goals.share <= 100) || +goals.share === goals.status.percent" @click="saveShare">Zapisz</button></div>
    </details>
    <details v-if="canManage" class="goal-support">
      <summary>Dane do przelewu dziesięciny (widzą je członkowie w okienku z kwotą)</summary>
      <label for="spAcc">Numer konta</label><input id="spAcc" v-model="supportEdit.account" inputmode="numeric" placeholder="np. 12 1020 …" autocomplete="off">
      <label for="spName">Odbiorca</label><input id="spName" v-model="supportEdit.name" placeholder="Kościół Na Skale" autocomplete="off">
      <label for="spTitle">Tytuł przelewu (miesiąc i imię dopiszą się same)</label><input id="spTitle" v-model="supportEdit.title" placeholder="Dziesięcina" autocomplete="off">
      <label for="spBlik">Telefon do BLIK</label><input id="spBlik" v-model="supportEdit.blik" inputmode="tel" placeholder="np. 789 571 542" autocomplete="off">
      <div class="row"><button class="primary" :disabled="busy" @click="saveSupport">Zapisz dane</button></div>
    </details>
  </template>
</template>

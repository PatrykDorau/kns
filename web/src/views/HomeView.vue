<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import LiveEvent from '@/components/LiveEvent.vue'

// HomeView
export default defineComponent({ components: { LiveEvent }, setup: () => useApp() })
</script>

<template>
  <LiveEvent />
  <!-- Szeroki ekran (przeglądarka na komputerze): ten sam układ i te same style co w aplikacji na komputer (home.css). -->
  <div class="kh kh-web">
    <div class="kh-hello">
      <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
      <p>Oto co dzieje się w kościele.</p>
    </div>
    <button v-if="goalDue" class="goal-banner" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span><b>Potwierdź cele wsparcia za {{ monthName(goalDue.month) }}</b><small>Czy Twoja dziesięcina wyniosła co najmniej {{ zl(itemsSum(goalDue)) }}?</small></span><svg class="i chev"><use href="#chev"/></svg></button>
    <section v-if="lastSermon && thoughtList(lastSermon).length" class="kh-panel kh-thoughts">
      <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ shortDate(lastSermon.date) }}</span><span class="kh-spacer"></span><button v-if="canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
      <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> — {{ lastSermon.speaker }}</template></p>
      <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
    </section>

    <!-- komunikaty rady: baner na górze -->
    <button v-for="a in importantAnns" :key="a.id" class="hw-banner" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
      <span class="hw-banner-ic"><svg class="i"><use href="#megaphone"/></svg></span>
      <span class="hw-banner-text"><small>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em></small><b>{{ a.title }}</b><span>{{ a.text }}</span></span>
      <span class="hw-go">Czytaj<svg class="i"><use href="#chev"/></svg></span>
    </button>

    <!-- najbliższe nabożeństwo: duża karta (data po lewej, szczegóły i przycisk po prawej) -->
    <article class="hw-feature">
      <div class="hw-visual">
        <span v-for="(a, i) in HERO_ART" :key="a" class="hw-art" :class="{ on: i === heroArt, photo: heroIsPhoto }" :style="heroIsPhoto ? { '--img': 'url(' + a + ')' } : { backgroundImage: 'url(' + a + ')' }" aria-hidden="true"></span>
        <!-- przewijanie obrazów (strzałki i kropki) -->
        <span class="hw-nav">
          <button type="button" class="hw-arrow" aria-label="Poprzedni obraz" @click.stop="heroStep(-1)"><svg class="i"><use href="#back"/></svg></button>
          <small v-if="heroIsPhoto" class="hw-photo-cap">{{ photosLabel }}</small>
          <span class="hw-dots" aria-hidden="true"><i v-for="(a, i) in HERO_ART" :key="a" :class="{ on: i === heroArt }"></i></span>
          <button type="button" class="hw-arrow" aria-label="Następny obraz" @click.stop="heroStep(1)"><svg class="i"><use href="#chev"/></svg></button>
        </span>
        <span class="hw-step">1</span><span class="hw-kicker">Najbliższe nabożeństwo</span>
        <template v-if="nextService">
          <div class="hw-date"><b>{{ asDate(nextService.date).getDate() }}</b><span>{{ asDate(nextService.date).toLocaleDateString('pl', { month: 'long' }) }}<small>{{ asDate(nextService.date).toLocaleDateString('pl', { weekday: 'long' }) }}</small></span></div>
          <span class="hw-until" :class="{ live: countdown?.live }"><i></i>{{ countdown?.live ? 'Trwa teraz' : untilText }}</span>
        </template>
        <div v-else class="hw-date hw-date-empty"><span>Termin wkrótce<small>{{ canEdit ? 'zaplanuj nabożeństwo obok' : 'pojawi się tutaj, gdy zostanie zaplanowane' }}</small></span></div>
      </div>
      <div class="hw-info">
        <template v-if="nextService">
          <h2>{{ nextService.sermonTitle || 'Nabożeństwo' }}</h2>
          <p>{{ [nextService.passage, nextService.speaker].filter(Boolean).join(' — ') || 'Temat kazania pojawi się wkrótce.' }}</p>
          <dl class="hw-rows">
            <div><dt>Godzina</dt><dd>{{ nextService.time || DEFAULT_TIME }}</dd></div>
            <div><dt>Miejsce</dt><dd>{{ nextService.place || DEFAULT_PLACE }}</dd></div>
            <div v-if="(nextService.songs || []).length"><dt>Pieśni</dt><dd>{{ nextService.songs.length }}</dd></div>
            <div v-if="canEdit"><dt>Przygotowanie</dt><dd :class="missing(nextService).length ? 'bad' : 'ok'">{{ missing(nextService).length ? 'brakuje: ' + missing(nextService).join(', ') : 'komplet' }}</dd></div>
          </dl>
          <button class="primary hw-cta" @click="open(nextService)">{{ canEdit && missing(nextService).length ? 'Uzupełnij nabożeństwo' : 'Zobacz nabożeństwo' }}<svg class="i"><use href="#chev"/></svg></button>
        </template>
        <template v-else>
          <h2>Jeszcze nie zaplanowane</h2>
          <p>Następne nabożeństwo czeka na wypełnienie{{ canEdit ? ' — dodaj datę, kazanie i pieśni.' : '.' }}</p>
          <button v-if="canEdit" class="primary hw-cta" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Zaplanuj na {{ shortDate(planSunday) }}</button>
        </template>
      </div>
    </article>

    <section v-if="reviewItems.length" class="kh-panel kh-review">
      <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
      <div class="kh-anns">
        <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
          <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
          <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
          <small class="kh-wait">czeka</small>
        </button>
      </div>
    </section>

    <!-- trzy kolumny: ogłoszenia, tydzień, wspólnota -->
    <div class="hw-cols">
      <section class="hw-col">
        <h3 class="hw-h"><span class="hw-step">2</span>Ogłoszenia<small v-if="newAnnCount">{{ newAnnCount }} {{ newAnnCount === 1 ? 'nowe' : 'nowych' }}</small></h3>
        <button v-for="a in boardNews.slice(0, 5)" :key="a.id" class="hw-row" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
          <img v-if="a.image" class="hw-thumb" :src="a.image" alt="" loading="lazy"><span v-else class="hw-thumb">{{ a.title.trim()[0]?.toUpperCase() }}</span>
          <span class="hw-row-text"><b>{{ a.title }}</b><small>{{ shortDate(a.date) }}<template v-if="annIsNew(a)"> · <em>nowe</em></template></small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <p v-if="!boardNews.length" class="hw-none">Nie ma nowych ogłoszeń.</p>
        <button class="hw-link" @click="openAnns">Wszystkie ogłoszenia<template v-if="boardMore.n"> ({{ boardAll.length }})</template><svg class="i"><use href="#chev"/></svg></button>
      </section>
      <section class="hw-col">
        <h3 class="hw-h"><span class="hw-step">3</span>Ten tydzień<small>{{ weekRange }}</small></h3>
        <template v-for="d in weekDays" :key="d.date">
          <button v-for="it in d.items" :key="it.kind + it.id" class="hw-row hw-ev" :class="{ today: d.date === todayStr }" :style="{ '--c': typeOf(it.type).color }" @click="openItem(it)">
            <span class="hw-day"><small>{{ d.date === todayStr ? 'dziś' : d.wd }}</small><b>{{ d.n }}</b></span>
            <span class="hw-row-text"><b>{{ it.kind === 'service' ? 'Nabożeństwo' : it.title }}</b><small><i></i>{{ it.time || 'cały dzień' }} · {{ typeOf(it.type).name }}</small></span>
            <svg class="i hw-arr"><use href="#chev"/></svg>
          </button>
        </template>
        <p v-if="!weekDays.some(d => d.items.length)" class="hw-none">Spokojny tydzień — nic nie zaplanowano.</p>
        <div class="hw-links">
          <button class="hw-link" @click="openCalendar">Kalendarz<svg class="i"><use href="#chev"/></svg></button>
          <button v-if="canSubmit" class="hw-link" title="Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie." @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>Zaproś na swoje wydarzenie</button>
        </div>
      </section>
      <section v-if="api.enabled" class="hw-col">
        <h3 class="hw-h"><span class="hw-step">4</span>Wspólnota</h3>
        <button v-for="e in votes.list.filter(x => x.status === 'voting' && !x.voted)" :key="e.id" class="hw-row hw-due" @click="openVotes()">
          <span class="hw-thumb"><svg class="i"><use href="#check"/></svg></span>
          <span class="hw-row-text"><b>Głosowanie: {{ e.title }}</b><small>oddaj tajny głos</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <button v-if="goalDue" class="hw-row hw-due" @click="openGoals()">
          <span class="hw-thumb"><svg class="i"><use href="#money"/></svg></span>
          <span class="hw-row-text"><b>Potwierdź {{ monthName(goalDue.month).split(' ')[0] }}</b><small>dziesięcina co najmniej {{ zl(itemsSum(goalDue)) }}</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <button v-for="g in goals.list.filter(x => !x.closed).slice(0, 2)" :key="g.id" class="hw-row hw-goal" @click="openGoals(g.id)">
          <span class="hw-row-text"><b>{{ g.title }}</b><span class="hw-bar"><i :style="{ width: goalPct(g) + '%' }"></i></span><small>{{ zl(g.confirmed) }} z {{ zl(g.target) }} · {{ goalPct(g) }}%</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <button v-if="serve.list.some(m => m.seeking)" class="hw-row" @click="openServe">
          <span class="hw-thumb"><svg class="i"><use href="#serve"/></svg></span>
          <span class="hw-row-text"><b>Szukają chętnych</b><small>{{ serve.list.filter(m => m.seeking).map(m => m.name).join(', ') }}</small></span>
          <svg class="i hw-arr"><use href="#chev"/></svg>
        </button>
        <div class="hw-links">
          <button class="hw-link" @click="openGoals()">Cele wsparcia<svg class="i"><use href="#chev"/></svg></button>
          <button class="hw-link" @click="openServe">Zaangażuj się<svg class="i"><use href="#chev"/></svg></button>
        </div>
      </section>
    </div>
    <div class="kh-panels hw-old">
      <section class="kh-panel">
        <div class="kh-panel-h"><h2>Ogłoszenia</h2><span class="kh-muted">z newslettera</span><span class="kh-spacer"></span><button class="kh-link" @click="openAnns">Wszystkie</button></div>
        <div v-if="boardNews.length" class="kh-anns">
          <button v-for="a in boardNews" :key="a.id" class="kh-ann" :class="{ fresh: annIsNew(a) }" @click="openAnn(a)">
            <img v-if="a.image" class="kh-ann-ic kh-ann-img" :src="a.image" alt="" loading="lazy">
            <span v-else class="kh-ann-ic">{{ a.title.trim()[0]?.toUpperCase() }}</span>
            <span class="kh-ann-text"><b><svg v-if="a.pinned" class="i kh-pin"><use href="#pin"/></svg><span class="kh-ann-t">{{ a.title }}</span><em v-if="annIsNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></b><span>{{ a.text }}</span></span>
            <small>{{ shortDate(a.date) }}</small>
          </button>
        </div>
        <button v-if="boardMore.n" class="kh-more" @click="openAnns">Jeszcze {{ boardMore.n }} {{ boardMore.n === 1 ? 'ogłoszenie' : boardMore.n < 5 ? 'ogłoszenia' : 'ogłoszeń' }}<em v-if="boardMore.fresh" class="kh-new">{{ boardMore.fresh }} {{ boardMore.fresh === 1 ? 'nowe' : 'nowych' }}</em><svg class="i"><use href="#chev"/></svg></button>
        <p v-else class="kh-none">Nie ma nowych ogłoszeń.</p>
      </section>

      <section class="kh-panel">
        <div class="kh-panel-h"><h2>Tydzień</h2><span class="kh-muted">{{ weekRange }}</span><span class="kh-spacer"></span><button class="kh-link" @click="openCalendar">Kalendarz</button></div>
        <div class="kh-week">
          <div v-for="d in weekDays" :key="d.date" class="kh-day" :class="{ today: d.date === todayStr }">
            <span class="kh-wd">{{ d.wd }}</span>
            <span class="kh-n">{{ d.n }}</span>
            <button v-for="it in d.items" :key="it.kind + it.id" class="kh-ev" :style="{ '--c': typeOf(it.type).color }" :title="(it.time ? it.time + ' ' : '') + it.title" @click="openItem(it)">
              <small v-if="it.time">{{ it.time }}</small>{{ it.kind === 'service' ? 'Nabożeństwo' : it.title }}
            </button>
          </div>
        </div>
        <div v-if="canSubmit" class="invite invite-week"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
      </section>
    </div>
  </div>

  <div class="phone-home">
  <div class="hello">
    <h1>{{ greeting }}{{ firstName ? ', ' + firstName : '' }}</h1>
    <p>Oto co dzieje się w kościele.</p>
  </div>
  <button v-if="goalDue" class="goal-banner" @click="openGoals()"><svg class="i"><use href="#money"/></svg><span><b>Potwierdź cele wsparcia za {{ monthName(goalDue.month) }}</b><small>Czy Twoja dziesięcina wyniosła co najmniej {{ zl(itemsSum(goalDue)) }}?</small></span><svg class="i chev"><use href="#chev"/></svg></button>
  <section v-if="lastSermon && thoughtList(lastSermon).length" class="kh-panel kh-thoughts phone-thoughts">
    <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ shortDate(lastSermon.date) }}</span><span class="kh-spacer"></span><button v-if="canEdit" class="kh-link" @click="open(lastSermon)">Edytuj</button></div>
    <p class="kh-th-sermon"><b>{{ lastSermon.sermonTitle || 'Kazanie' }}</b><template v-if="lastSermon.passage"> · {{ lastSermon.passage }}</template><template v-if="lastSermon.speaker"> — {{ lastSermon.speaker }}</template></p>
    <ul class="kh-th-list"><li v-for="(t, i) in thoughtList(lastSermon)" :key="i">{{ t }}</li></ul>
  </section>
  <section v-if="reviewItems.length" class="kh-panel kh-review phone-thoughts">
    <div class="kh-panel-h"><h2>{{ canReview ? 'Do zatwierdzenia' : 'Twoje zgłoszenia' }}</h2><span class="kh-muted">{{ canReview ? 'czekają na Twoją decyzję' : 'czekają na zatwierdzenie' }}</span></div>
    <div class="kh-anns">
      <button v-for="it in reviewItems" :key="it.kind + it.id" class="kh-ann" @click="it.kind === 'event' ? openEvent(it.ref) : openAnn(it.ref)">
        <span class="kh-ann-ic"><svg class="i"><use :href="it.kind === 'event' ? '#calendar' : '#megaphone'"/></svg></span>
        <span class="kh-ann-text"><b>{{ it.title }}</b><span>{{ it.sub }}</span></span>
        <small class="kh-wait">czeka</small>
      </button>
    </div>
  </section>

  <div class="start-top">
    <button v-if="nextService" class="hero" :class="{ live: countdown?.live }" @click="open(nextService)">
      <span class="hero-top">
        <span v-if="countdown?.live" class="cd-live"><i class="cd-dot"></i>W TRAKCIE</span>
        <span v-else class="hero-cd">Najbliższe nabożeństwo · {{ untilText }}</span>
      </span>
      <b class="hero-when">{{ pretty(nextService.date).replace(/ \d{4}$/, '').replace(/^./, c => c.toUpperCase()) }}, {{ nextService.time || DEFAULT_TIME }}</b>
      <span class="hero-place">{{ nextService.place || DEFAULT_PLACE }}</span>
      <span v-if="nextService.sermonTitle || nextService.passage" class="hero-sermon">{{ [nextService.sermonTitle, nextService.passage].filter(Boolean).join(' · ') }}<template v-if="nextService.speaker"> — {{ nextService.speaker }}</template></span>
      <span v-if="canEdit" class="chips">
        <span v-if="!missing(nextService).length" class="chip good"><svg class="i"><use href="#check"/></svg>Komplet</span>
        <span v-for="m in missing(nextService)" :key="m" class="chip"><svg class="i"><use href="#warn"/></svg>brak: {{ m }}</span>
      </span>
    </button>
    <div v-else-if="canEdit" class="hero empty-hero">
      <b>Nie ma zaplanowanego nabożeństwa</b>
      <span class="hero-place">Na niedzielę {{ pretty(planSunday).replace(/^niedziela, /, '') }} nic jeszcze nie ma.</span>
      <button class="primary" @click="create(planSunday)"><svg class="i"><use href="#plus"/></svg>Utwórz nabożeństwo</button>
    </div>

    <div v-if="importantAnns.length" class="notices" :class="{ single: importantAnns.length === 1 }" aria-label="Komunikaty rady zboru">
      <button v-for="a in importantAnns" :key="a.id" class="notice" @click="openAnn(a)">
        <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
        <span class="notice-tag"><svg class="i"><use href="#megaphone"/></svg>Komunikat rady zboru<em v-if="annIsNew(a)" class="kh-new">Nowe</em><em v-if="a.video" class="kh-film">▶ Film</em></span>
        <b>{{ a.title }}</b>
        <span class="notice-text">{{ a.text }}</span>
      </button>
    </div>
  </div>

  <div class="start-panels">
    <section class="sp-week">
      <div class="section"><h2>Ten tydzień</h2><button class="ghost" @click="openCalendar">Kalendarz</button></div>
      <!-- telefon: lista -->
      <p v-if="!weekItems.length" class="note week-list-only">W najbliższych dniach nic nie zaplanowano.</p>
      <div v-else class="week week-list-only">
        <button v-for="it in weekItems" :key="it.kind + it.id" class="week-row" @click="openItem(it)">
          <span class="week-day" :class="{ today: it.date === todayStr }">{{ dayLabel(it.date) }}</span>
          <i class="week-dot" :style="{ background: typeOf(it.type).color }"></i>
          <span class="week-title">{{ it.title }}</span>
          <span class="week-time">{{ it.time }}</span>
        </button>
      </div>
      <div v-if="canSubmit" class="invite invite-week"><svg class="i"><use href="#users"/></svg><span><b>Zaproś kościół na swoje wydarzenie</b><small>Organizujesz coś i chcesz zaprosić ludzi z kościoła? Wpisz to do kalendarza — wszyscy zobaczą zaproszenie na stronie i w aplikacji.{{ canEdit || canReview ? '' : ' Zgłoszenie zatwierdza rada.' }}</small></span><button class="primary" @click="inviteEvent"><svg class="i"><use href="#plus"/></svg>{{ canEdit || canReview ? 'Dodaj wydarzenie' : 'Zgłoś wydarzenie' }}</button></div>
    </section>


    <section class="sp-news">
      <div class="section"><h2>Z newslettera</h2><button class="ghost" @click="openAnns">{{ canAnnounce ? 'Wszystkie / dodaj' : 'Wszystkie' }}</button></div>
      <p v-if="!homeAnns.length" class="note">Nie ma nowych ogłoszeń.</p>
      <div v-else class="news-grid">
        <button v-for="a in homeAnns" :key="a.id" class="news-card" @click="openAnn(a)">
          <img v-if="a.image" class="ann-img" :src="a.image" alt="" loading="lazy">
          <b><svg v-if="a.pinned" class="i kh-pin"><use href="#pin"/></svg>{{ a.title }}<em v-if="a.video" class="kh-film">▶ Film</em></b>
          <span>{{ a.text }}</span>
          <small>{{ shortDate(a.date) }}</small>
        </button>
      </div>
    </section>
  </div>
  </div>
</template>

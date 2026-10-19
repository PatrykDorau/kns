<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import { focusEl } from '@/utils/dom'

// „Zgłoś błąd albo pomysł”: krótki formularz z każdego miejsca aplikacji. Miejsce (adres) i urządzenie dopisują się same;
// zgłoszenie trafia do backlogu administratora i deweloperów.
export default defineComponent({ setup: () => ({ ...useApp(), focusEl }) })
</script>

<template>
  <div class="np-overlay" @click.self="bugs.form = null">
    <div class="np-panel bug-form" role="dialog" aria-label="Zgłoś błąd albo pomysł">
      <div class="np-head"><b>Zgłoś błąd albo pomysł</b><button class="icon" aria-label="Zamknij" @click="bugs.form = null"><svg class="i"><use href="#x"/></svg></button></div>
      <template v-if="!bugs.form.sent">
        <label for="bugTitle">Co nie działa albo co poprawić? <span class="req">*</span></label>
        <input id="bugTitle" :ref="focusEl" v-model="bugs.form.title" maxlength="160" placeholder="np. Nie mogę zapisać ogłoszenia z grafiką" autocomplete="off">
        <label for="bugBody">Szczegóły (opcjonalnie)</label>
        <textarea id="bugBody" v-model="bugs.form.body" rows="5" placeholder="Co klikasz, co się dzieje, czego się spodziewasz…"></textarea>
        <p class="note">Dołączymy też, gdzie jesteś w aplikacji i na jakim urządzeniu — nic więcej.</p>
        <p v-if="bugs.form.error" class="error">{{ bugs.form.error }}</p>
        <div class="btnrow">
          <button class="ghost" @click="bugs.form = null">Anuluj</button>
          <button class="primary" :disabled="bugs.form.busy || !bugs.form.title.trim()" @click="sendBug">{{ bugs.form.busy ? 'Wysyłam…' : 'Wyślij zgłoszenie' }}</button>
        </div>
      </template>
      <template v-else>
        <p class="bug-sent"><svg class="i"><use href="#check"/></svg>Dziękujemy! Zgłoszenie trafiło do zespołu, który rozwija aplikację. Dostaniesz powiadomienie, gdy coś się z nim zmieni.</p>
        <div class="btnrow"><button @click="openBugs(); bugs.form = null">Moje zgłoszenia</button><button class="primary" @click="bugs.form = null">Zamknij</button></div>
      </template>
    </div>
  </div>
</template>

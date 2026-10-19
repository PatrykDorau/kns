<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Wiadomość do rang i służb (pastor, rada, administrator; lider ASB → ASB; lider służby → jego służba)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="msg.open = false">
  <div class="np-panel" role="dialog" aria-label="Wiadomość">
    <div class="np-head"><b>Wiadomość</b><button class="icon" aria-label="Zamknij" @click="msg.open = false"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="np-list">
      <label style="margin-top:0">Do kogo</label>
      <div class="msg-targets" role="group" aria-label="Odbiorcy">
        <button v-for="r in msgRanks" :key="'r' + r.id" type="button" class="chipbtn" :class="{ on: msg.ranks.includes(r.id) }" :aria-pressed="msg.ranks.includes(r.id)" @click="msgToggle('ranks', r.id)">{{ r.name }} · {{ r.count }}</button>
        <button v-for="m in msgMinistries" :key="'m' + m.id" type="button" class="chipbtn" :class="{ on: msg.ministries.includes(m.id) }" :aria-pressed="msg.ministries.includes(m.id)" @click="msgToggle('ministries', m.id)">Służba: {{ m.name }} · {{ m.count }}</button>
      </div>
      <label for="msgTitle">Tytuł</label>
      <input id="msgTitle" v-model="msg.title" maxlength="120" placeholder="np. Modlitwa w czwartek o 19:00" autocomplete="off">
      <label for="msgBody">Treść</label>
      <textarea id="msgBody" v-model="msg.body" maxlength="340" placeholder="Co chcesz przekazać?"></textarea>
      <p class="note">Przyjdzie w aplikacji (dzwonek), a kto włączył powiadomienia — także na telefon. Na końcu dopiszę Twoje imię.</p>
      <p v-if="msg.error" class="error">{{ msg.error }}</p>
    </div>
    <div class="np-foot"><button class="primary" :disabled="msg.busy || !msg.title.trim() || !(msg.ranks.length + msg.ministries.length)" @click="sendMsg"><svg class="i"><use href="#megaphone"/></svg>{{ msg.busy ? 'Wysyłam…' : 'Wyślij' }}</button></div>
  </div>
</div>
</template>

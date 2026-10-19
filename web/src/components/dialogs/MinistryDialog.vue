<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// Służba: edycja (administrator — wszystko; lider — opis i „szukamy chętnych”)
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="mEdit = null">
  <div class="np-panel" role="dialog" aria-label="Służba">
    <div class="np-head"><b>{{ mEdit.isNew ? 'Nowa służba' : mEdit.name }}</b><button class="icon" aria-label="Zamknij" @click="mEdit = null"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="np-list">
      <template v-if="mEdit.full">
        <label for="mnName" style="margin-top:0">Nazwa <span class="req">*</span></label>
        <input id="mnName" v-model="mEdit.name" placeholder="np. Zespół uwielbienia" autocomplete="off">
      </template>
      <label for="mnDesc">Opis</label>
      <textarea id="mnDesc" v-model="mEdit.description" placeholder="Czym się zajmujecie, kogo szukacie, ile czasu to zajmuje"></textarea>
      <label class="check"><input v-model="mEdit.seeking" type="checkbox">Szukamy nowych chętnych</label>
      <template v-if="mEdit.full">
        <label>Liderzy (akceptują zgłoszenia) — osoby z rangą Lider</label>
        <p v-if="!memberNames.length" class="note" style="margin-top:0">Nikt nie ma jeszcze rangi Lider — nadaj ją w Więcej → Osoby.</p>
        <div class="notify-groups"><button v-for="p in memberNames" :key="p.id" type="button" class="chipbtn" :class="{ on: mEdit.leaders.includes(p.id) }" @click="toggleLeader(p.id)">{{ p.name }}</button></div>
      </template>
    </div>
    <div class="np-foot mn-foot">
      <button v-if="mEdit.full && !mEdit.isNew" class="danger" :disabled="busy" @click="deleteMinistry">Usuń</button>
      <button class="primary" :disabled="busy || (mEdit.full && !mEdit.name.trim())" @click="saveMinistry">Zapisz</button>
    </div>
  </div>
</div>
</template>

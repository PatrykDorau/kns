<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// materiały: protokoły, instrukcje i pliki pomocnicze
export default defineComponent({ setup: () => useApp() })
</script>

<template>
  <div class="notify-groups">
    <button class="chipbtn" :class="{ on: protoKind === 'all' }" @click="protoKind = 'all'">Wszystkie</button>
    <button v-for="(name, id) in MAT_PLURAL" :key="id" class="chipbtn" :class="{ on: protoKind === id }" @click="protoKind = id">{{ name }}</button>
    <button v-if="hasCouncil" class="chipbtn" :class="{ on: protoKind === 'rada' }" @click="protoKind = 'rada'">Rada zboru</button>
  </div>
  <button v-if="canAddProto" class="primary" style="width:100%;margin-bottom:12px" @click="newProto()"><svg class="i"><use href="#plus"/></svg>Dodaj materiał</button>
  <div v-if="protoBusy && !protocols.length" class="skel-list" aria-busy="true" aria-label="Wczytywanie"><div v-for="n in 4" :key="n" class="skel skel-row"></div></div>
  <p v-else-if="protoError" class="error">{{ protoError }}</p>
  <p v-else-if="!protocols.length" class="note">{{ protoKind === 'all' ? 'W materiałach nie ma jeszcze nic.' : 'Nic tu jeszcze nie ma.' }}</p>
  <button v-for="p in protocols" :key="p.id" class="ev" :style="{ '--c': MAT_COLOR[matType(p)] }" @click="openProto(p)">
    <span class="when"><small>{{ wd(p.date) }}</small><b>{{ day(p.date) }}</b><small>{{ month(p.date) }}</small></span>
    <span class="body"><b>{{ p.title }}</b><small>{{ MAT_TYPES[matType(p)] }} · {{ (p.ministries || []).length ? 'Tylko: ' + ministryNames(p.ministries) : VISIBILITY[p.kind] }}<template v-if="p.eventId && eventTitle(p.eventId)"> · {{ eventTitle(p.eventId) }}</template></small></span>
    <svg class="i chev"><use href="#chev"/></svg>
  </button>
</template>

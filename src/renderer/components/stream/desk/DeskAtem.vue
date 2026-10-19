<script setup lang="ts">
import { settings } from '@/stores'
import { useDesk } from '@/composables/stream/useStreamDesk'

// ATEM: przełączanie kamer z aplikacji (opcjonalnie, kabel sieciowy).
const { atem, address, atemError, connecting, cameras, others, connect, disconnect, run, pick } = useDesk()
</script>

<template>
  <section class="desk-atem">
    <div class="desk-head">
      <h2>ATEM</h2>
      <span class="desk-dot" :class="atem.connected ? 'ok' : connecting ? 'wait' : 'off'"></span>
      <small class="muted">{{ atem.connected ? (atem.model || 'połączono') + ' · ' + atem.address : connecting ? 'łączę z ' + atem.address + '… (sprawdź kabel sieciowy i adres)' : 'przełączanie kamer z aplikacji — niepołączony' }}</small>
      <span class="spacer"></span>
      <template v-if="atem.connected || connecting">
        <label class="check" title="Kliknięcie kamery od razu wysyła ją na wizję (bez podglądu)"><input v-model="settings.atemDirect" type="checkbox"> Od razu na wizję</label>
        <button class="small" @click="disconnect">Rozłącz</button>
      </template>
      <template v-else>
        <input v-model="address" class="desk-ip" placeholder="np. 192.168.10.240" aria-label="Adres IP miksera ATEM" inputmode="decimal" @keydown.enter="connect">
        <button class="small primary" @click="connect">Połącz</button>
      </template>
    </div>
    <p v-if="atemError" class="note bad">{{ atemError }}</p>
    <details v-if="!atem.connected && !connecting" class="desk-help">
      <summary>Jak podłączyć (opcjonalnie — przyciski na mikserze działają bez tego)</summary>
      <ol>
        <li>Kabel sieciowy: gniazdo <b>ETHERNET</b> w ATEM ↔ gniazdo sieciowe laptopa (albo przejściówka USB → Ethernet). USB-C zostaje na obraz.</li>
        <li><b>ATEM Setup</b> (mikser po USB): Configure → Network → adres stały <b>192.168.10.240</b>, maska 255.255.255.0 → Save.</li>
        <li>Windows: Ustawienia → Sieć i internet → Ethernet → Przypisanie IP → Ręcznie → IPv4: <b>192.168.10.10</b>, maska 255.255.255.0 (bez bramy — internet dalej przez Wi-Fi).</li>
        <li>Tutaj wpisz <b>192.168.10.240</b> → Połącz.</li>
      </ol>
    </details>
    <div v-if="atem.connected" class="desk-cams" role="group" aria-label="Kamery w mikserze">
      <button v-for="i in cameras" :key="i.id" class="desk-cam" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }"
              :aria-pressed="atem.program === i.id" :title="(atem.program === i.id ? 'Na wizji' : atem.preview === i.id ? 'W podglądzie' : settings.atemDirect ? 'Kliknij — na wizję' : 'Kliknij — do podglądu') + ' · ' + i.name" @click="pick(i)">
        <b>{{ i.short || i.id }}</b><span>{{ i.name }}</span>
        <em v-if="atem.program === i.id">NA WIZJI</em><em v-else-if="atem.preview === i.id">PODGLĄD</em>
      </button>
      <button v-for="i in others" :key="i.id" class="desk-cam black" :class="{ pgm: atem.program === i.id, pvw: atem.preview === i.id }" @click="pick(i)"><b>{{ i.short || 'BLK' }}</b><span>Czerń</span></button>
      <div class="desk-trans">
        <button class="desk-cut" title="Natychmiastowe przełączenie podglądu na wizję" @click="run('cut')">CUT</button>
        <button class="desk-auto" title="Płynne przejście podglądu na wizję" @click="run('auto')">AUTO</button>
      </div>
    </div>
  </section>
</template>

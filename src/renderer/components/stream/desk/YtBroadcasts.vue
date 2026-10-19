<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { prettyDate, serviceTime } from '@/stores'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { B_STATUS, PRIVACY, when, ytTitle } from '@/composables/stream/useYouTube'

// Zaplanowane transmisje na kanale: link, tytuł z nabożeństwa, koniec; zaplanowanie transmisji na wybrane nabożeństwo.
const { service, upcoming, forService, serviceStarted, ytBusy, copied, copy, refreshFromService, endBroadcast, createForService } = useDesk()
</script>

<template>
  <details class="desk-set">
    <summary>Zaplanowane transmisje ({{ upcoming.length }})</summary>
    <div class="desk-list">
      <div v-for="b in upcoming" :key="b.id" class="desk-bc" :class="{ live: b.status === 'live' }">
        <span class="desk-bc-text">
          <b>{{ b.title }}</b>
          <small>{{ [when(b), PRIVACY[b.privacy] || b.privacy].filter(Boolean).join(' · ') }} · <em>{{ B_STATUS[b.status] || b.status }}</em></small>
        </span>
        <button class="small" title="Kopiuj link do transmisji" @click="copy(b.id, b.url)"><Icon :name="copied === b.id ? 'check' : 'link'" /></button>
        <button v-if="service && b === forService && b.status !== 'live'" class="small" :disabled="ytBusy" title="Ustaw tytuł i opis z wybranego nabożeństwa" @click="refreshFromService(b)">Z nabożeństwa</button>
        <button v-if="['live', 'testing', 'liveStarting'].includes(b.status)" class="small danger" :disabled="ytBusy" @click="endBroadcast(b)">Zakończ</button>
      </div>
      <p v-if="!upcoming.length" class="note">Nie ma zaplanowanych transmisji.</p>
    </div>
    <div v-if="service && !forService" class="desk-new">
      <span><b>{{ ytTitle(service) }}</b><small class="muted">{{ prettyDate(service.date) }}, {{ serviceTime(service) }}</small></span>
      <button class="small" :disabled="ytBusy || serviceStarted" :title="serviceStarted ? 'Godzina nabożeństwa już minęła — YouTube planuje tylko przyszłe transmisje' : 'Tworzy na kanale zapowiedź transmisji (YouTube Studio → Transmisje na żywo → Zaplanowane)'" @click="createForService"><Icon name="plus" />Zaplanuj</button>
    </div>
    <p class="note">„Zaplanuj” tworzy na kanale zapowiedź transmisji z tytułem i opisem z nabożeństwa — widzowie widzą ją wcześniej i mogą ustawić przypomnienie. W dniu nabożeństwa wybierasz ją w polu „Transmisja” i klikasz „Rozpocznij”.<template v-if="service && serviceStarted"> Godzina wybranego nabożeństwa już minęła, więc nie da się go zaplanować.</template></p>
  </details>
</template>

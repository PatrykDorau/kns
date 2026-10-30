<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'
import { useDesk } from '@/composables/stream/useStreamDesk'

// Zaawansowane: serwer i stały klucz transmisji (OBS albo nadawanie prosto z ATEM).
const { yt, atem, showKey, copied, copy, run, stopAtemStream } = useDesk()
const sendKeyToAtem = () => run('streamService', { url: yt.value.stream.url, key: yt.value.stream.key })
</script>

<template>
  <details class="desk-set">
    <summary>Zaawansowane: klucz transmisji (nadawanie z ATEM)</summary>
    <div v-if="yt.stream" class="desk-key">
      <span><small class="muted">Serwer</small><code>{{ yt.stream.url }}</code></span>
      <button class="small" @click="copy('url', yt.stream.url)"><Icon :name="copied === 'url' ? 'check' : 'copy'" /></button>
      <span><small class="muted">Stały klucz (ten sam co tydzień)</small><code>{{ showKey ? yt.stream.key : '••••-••••-••••-••••' }}</code></span>
      <button class="small" :title="showKey ? 'Ukryj klucz' : 'Pokaż klucz'" @click="showKey = !showKey"><Icon :name="showKey ? 'eyeoff' : 'search'" /></button>
      <button class="small" @click="copy('key', yt.stream.key)"><Icon :name="copied === 'key' ? 'check' : 'copy'" />{{ copied === 'key' ? 'Skopiowano' : 'Kopiuj klucz' }}</button>
    </div>
    <div v-if="yt.stream && atem.connected" class="btnrow">
      <button class="small" title="Ustawia w ATEM serwer i klucz YouTube (transmisja prosto z miksera)" @click="sendKeyToAtem">Wyślij klucz do ATEM</button>
      <button v-if="atem.streaming !== 'streaming'" class="small" @click="run('streaming', true)">Start transmisji z ATEM</button>
      <button v-else class="small danger" @click="stopAtemStream">Stop transmisji z ATEM</button>
    </div>
    <p class="note">Tylko jeśli nadajecie innym programem: klucz wyślij do ATEM (mikser z internetem po kablu sieciowym).</p>
  </details>
</template>

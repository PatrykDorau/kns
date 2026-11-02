<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import { settings, today, uid } from '@/stores'
import { ask } from '@/utils/ask'
import { useDesk } from '@/composables/stream/useStreamDesk'
import { PRIVACY, when } from '@/composables/stream/useYouTube'

// Start transmisji: co nadajemy, gotowość, start i koniec. Lista sprawdza się sama i pokazuje to, co wymaga uwagi;
// własne punkty odhacza się ręcznie, a następnego dnia wracają puste. Konto i klucz YouTube są w osobnej sekcji.
const { yt, ytBusy, upcoming, chosenId, newTitle, nextTitle, privacy, live, liveOn, liveError, liveBroadcast, goLive, stopLive, engine, readiness, openCfg, lyricsInfo } = useDesk()
const all = ref(false), adding = ref(''), checks = computed(() => readiness.value.filter(r => r.cls))
const own = computed(() => settings.checkItems || [])
const done = computed(() => (settings.checkDone?.day === today() ? settings.checkDone.ids : []))
const ready = computed(() => checks.value.filter(r => r.cls === 'ok').length + own.value.filter(x => done.value.includes(x.id)).length)
const total = computed(() => checks.value.length + own.value.length)
const shown = computed(() => (all.value ? readiness.value : checks.value.filter(r => r.cls !== 'ok')))
function tick(id: string) { settings.checkDone = { day: today(), ids: done.value.includes(id) ? done.value.filter(x => x !== id) : [...done.value, id] } }
function addOwn() { if (adding.value.trim()) settings.checkItems = [...own.value, { id: uid(), text: adding.value.trim() }]; adding.value = '' }
function dropOwn(id: string) { settings.checkItems = own.value.filter(x => x.id !== id) }
// poważne braki nie blokują startu, ale trzeba je świadomie zaakceptować
async function start() {
  const bad = readiness.value.filter(r => r.cls === 'bad').map(r => r.k + ': ' + r.v)
  if (bad.length && !(await ask('Przed startem brakuje:\n\n' + bad.join('\n') + '\n\nRozpocząć mimo to?'))) return
  goLive()
}
</script>

<template>
  <section v-if="yt.loggedIn" class="desk-ctrl desk-start" aria-label="Transmisja">
    <template v-if="!liveOn">
      <label class="desk-field">Transmisja
        <select v-model="chosenId">
          <option v-for="b in upcoming" :key="b.id" :value="b.id">{{ b.title }}{{ when(b) ? ' — ' + when(b) : '' }} · {{ PRIVACY[b.privacy] || b.privacy }}</option>
          <option value="new">Nowa: „{{ newTitle }}”</option>
        </select>
      </label>
      <label v-if="chosenId === 'new'" class="desk-field">Widoczność
        <select v-model="privacy"><option value="public">Publiczna</option><option value="unlisted">Niepubliczna</option><option value="private">Prywatna</option></select>
      </label>
      <button class="ready-head" :class="{ full: ready === total }" :aria-expanded="all" @click="all = !all">
        <b>Gotowość {{ ready }} z {{ total }}</b><span>{{ all ? 'Pokaż tylko braki' : 'Pokaż wszystko' }}</span><Icon :name="all ? 'up' : 'down'" />
      </button>
      <div v-if="shown.length || all" class="desk-ready" aria-label="Gotowość">
        <button v-for="r in shown" :key="r.k" :title="r.cfg ? 'Ustawienia nadawania — ' + r.k : r.v" @click="r.cfg && openCfg()"><i :class="r.cls"></i><b>{{ r.k }}</b><span>{{ r.v }}</span></button>
      </div>
      <ul v-if="own.length" class="ready-own">
        <li v-for="x in own" :key="x.id">
          <label class="check"><input type="checkbox" :checked="done.includes(x.id)" @change="tick(x.id)"> {{ x.text }}</label>
          <button v-if="all" class="iconbtn" :aria-label="'Usuń: ' + x.text" @click="dropOwn(x.id)"><Icon name="x" /></button>
        </li>
      </ul>
      <form v-if="all" class="ready-add" @submit.prevent="addOwn">
        <input v-model="adding" maxlength="80" placeholder="Własny punkt, np. bateria w mikrofonie" aria-label="Nowy punkt listy">
        <button class="small" :disabled="!adding.trim()">Dodaj</button>
      </form>
      <button class="desk-golive" :disabled="ytBusy || (engine === 'simple' && !settings.streamVideo)" :title="'Rozpocznij: ' + nextTitle" @click="start"><i></i>Rozpocznij transmisję</button>
      <p v-if="liveError" class="note bad">{{ liveError }}</p>
    </template>
    <template v-else>
      <p class="desk-title">„{{ liveBroadcast?.title || nextTitle }}”</p>
      <p v-if="live.error" class="note bad">{{ live.error }}</p>
      <small class="muted desk-sub">Napisy: {{ lyricsInfo }}</small>
      <button class="desk-stop" @click="stopLive">■ Zakończ transmisję</button>
    </template>
  </section>
</template>

<style scoped>
.ready-head { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 10px; padding: 8px 10px; border: 0; border-radius: 10px; background: var(--panel2); text-align: left; }
.ready-head b { flex: 1; color: var(--warn, #e5a93b); }
.ready-head.full b { color: var(--ok); }
.ready-head span { color: var(--muted); font-size: 12px; font-weight: 500; }
.ready-own { display: grid; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; }
.ready-own li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ready-add { display: flex; gap: 6px; margin-top: 8px; }
.ready-add input { flex: 1; min-width: 0; }
</style>

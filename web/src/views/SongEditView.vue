<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { computed, defineComponent, ref, watch } from 'vue'
import { useApp } from '@/composables/useApp'
import SongSlides from '@/components/SongSlides.vue'
import { ago, songHistory } from '@/services/stats'

// Pieśń: najpierw ładny podgląd (zwrotki, refren wyróżniony), link i kod QR w nagłówku; „Edytuj” — edycja slajdów.
// ile razy pieśń była śpiewana (odbyte nabożeństwa) i kiedy ostatnio
const SHORTCUT = /^\[([^\]\s]{1,3})\][ \t]*/
const KIND = { R: 'Refren', B: 'Bridge', P: 'Przejście', K: 'Zakończenie' }
export default defineComponent({
  components: { SongSlides },
  setup() {
    const app = useApp()
    const sung = computed(() => {
      if (!app.song.value || app.song.value.isNew) return null
      const h = songHistory(app.services.value.filter(s => s.date && s.date <= app.todayStr.value), app.songs.value).get(app.song.value.id)
      return h ? { count: h.count, last: ago(h.dates[0], app.todayStr.value) } : { count: 0 }
    })
    // podgląd: nowa pieśń od razu w edycji; po otwarciu innej pieśni — znowu podgląd
    const editing = ref(!!app.song.value?.isNew)
    watch(() => app.song.value?.id, () => { editing.value = !!app.song.value?.isNew })
    // zwrotki — tak jak slajdy na rzutniku (puste linie dzielą, „[R]” na początku to refren)
    const parts = computed(() => {
      let verse = 0
      return String(app.song.value?.text || '').split(/\n[ \t]*\n/).map(v => v.replace(/^\n+|\s+$/g, '')).filter(v => v.trim()).map(v => {
        const m = SHORTCUT.exec(v), key = m ? m[1].toUpperCase() : ''
        const lines = (m ? v.slice(m[0].length) : v).split('\n').map(l => l.trim()).filter(Boolean)
        const name = KIND[key] || (key && !/^\d+$/.test(key) ? key : 'Zwrotka ' + (/^\d+$/.test(key) ? key : ++verse))
        return { key, name, lines, chorus: key === 'R' }
      })
    })
    return { ...app, sung, editing, parts }
  },
})
</script>

<template>
  <template v-if="!editing">
    <!-- podgląd pieśni -->
    <div class="song-view">
      <div class="sv-head">
        <span v-if="song.number" class="sv-num">{{ song.number }}</span>
        <div class="sv-title"><h2>{{ song.title }}</h2>
          <small v-if="sung"><svg class="i"><use href="#music"/></svg>{{ sung.count ? 'Śpiewana ' + sung.count + '× · ostatnio ' + sung.last : 'Jeszcze nie śpiewana na nabożeństwie' }}</small>
        </div>
        <button v-if="canEdit" class="sv-edit" @click="editing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
      </div>
      <p v-if="!parts.length" class="note">Pieśń nie ma jeszcze tekstu.</p>
      <section v-for="(p, i) in parts" :key="i" class="sv-part" :class="{ chorus: p.chorus }">
        <small class="sv-label">{{ p.name }}</small>
        <p><template v-for="(l, k) in p.lines" :key="k">{{ l }}<br v-if="k < p.lines.length - 1"></template></p>
      </section>
    </div>
  </template>
  <template v-else>
  <p v-if="!canEdit" class="note readonly"><svg class="i"><use href="#eye"/></svg>Tylko podgląd — pieśni zmieniają osoby z rangą z prawem edycji.</p>
  <p v-if="sung" class="note song-sung"><svg class="i"><use href="#music"/></svg>{{ sung.count ? 'Śpiewana ' + sung.count + '× · ostatnio ' + sung.last : 'Jeszcze nie śpiewana na nabożeństwie' }}</p>
  <button v-if="!song.isNew" class="ghost small sv-back" :disabled="songDirty" :title="songDirty ? 'Najpierw zapisz zmiany' : ''" @click="editing = false"><svg class="i"><use href="#eye"/></svg>Podgląd</button>
  <fieldset class="plain" :disabled="!canEdit">
  <div class="row">
    <div style="flex:0 0 96px"><label for="sNum">Numer</label><input id="sNum" v-model="song.number" inputmode="numeric" autocomplete="off"></div>
    <div><label for="sTitle">Tytuł <span class="req">*</span></label><input id="sTitle" v-model="song.title" :class="{ invalid: !song.title.trim() }" autocomplete="off"></div>
  </div>
  <p v-if="numberTaken" class="note error">Numer {{ song.number }} ma już pieśń „{{ numberTaken.title }}”.</p>
  <label>Tekst — slajdy na rzutniku</label>
  <SongSlides v-model="song.text" :disabled="!canEdit" />
  </fieldset>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div v-if="canEdit" class="bar">
    <template v-if="!song.isNew">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="deleteSong">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń pieśń" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    </template>
    <button class="primary" :disabled="busy || !songDirty || !song.title.trim()" @click="saveSong()">
      <svg v-if="!songDirty && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : songDirty ? 'Zapisz' : 'Zapisane' }}
    </button>
  </div>
  </template>
</template>

<style scoped>
.song-view { max-width: 720px; margin: 0 auto; }
.sv-head { display: flex; align-items: flex-start; gap: 14px; margin: 4px 0 18px; }
.sv-num { flex: none; display: grid; place-items: center; min-width: 52px; height: 52px; padding: 0 10px; border-radius: 16px; background: var(--accent-soft); color: var(--accent-text); font-weight: 800; font-size: 20px; }
.sv-title { flex: 1; min-width: 0; }
.sv-title h2 { margin: 2px 0 4px; font-size: 24px; line-height: 1.2; }
.sv-title small { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
.sv-title small .i { width: 14px; height: 14px; color: var(--accent-text); }
.sv-edit { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.sv-part { position: relative; margin: 0 0 14px; padding: 12px 16px 14px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); }
.sv-part p { margin: 4px 0 0; font-size: 18px; line-height: 1.6; }
.sv-label { display: block; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.sv-part.chorus { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
.sv-part.chorus .sv-label { color: var(--accent-text); }
.sv-part.chorus p { font-style: italic; }
.sv-back { margin: 0 0 10px; }
@media (min-width: 1100px) { .sv-part p { font-size: 19px; } }
</style>

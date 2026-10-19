<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'

// ASB: podgląd spotkania (kliknięcie w terminarzu) — wszystko do przeczytania, edycja osobnym przyciskiem
export default defineComponent({ setup: () => useApp() })
</script>

<template>
<div class="np-overlay" @click.self="asbPreview = null">
  <div class="np-panel asb-prev" role="dialog" :aria-label="asbTitle(asbPreview)">
    <div class="np-head"><b>Spotkanie ASB</b><button class="icon" aria-label="Zamknij" @click="asbPreview = null"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="np-list">
      <div class="asb-prev-top" :class="'k-' + asbPreview.kind">
        <span class="asb-date"><small>{{ asbPreview.date ? wd(asbPreview.date) : '' }}</small><b>{{ asbPreview.date ? day(asbPreview.date) : '—' }}</b><small>{{ asbPreview.date ? month(asbPreview.date) : '' }}</small></span>
        <span>
          <span v-if="asbPreview.kind !== 'cykliczne'" class="asb-badge">{{ asbKindName(asbPreview.kind) }}</span>
          <h3>{{ asbTitle(asbPreview) }}</h3>
          <small>{{ [asbPreview.date ? pretty(asbPreview.date) : 'Termin do ustalenia', asbPreview.time, asbPreview.place].filter(Boolean).join(' · ') }}</small>
        </span>
      </div>
      <p v-if="canAsb && asbMissing(asbPreview).length" class="asb-miss"><svg class="i"><use href="#warn"/></svg>Brakuje: {{ asbMissing(asbPreview).join(', ') }}</p>
      <dl class="asb-prev-dl">
        <template v-if="asbPreview.concept"><dt>Cykl</dt><dd>{{ asbPreview.concept }}</dd></template>
        <template v-if="asbPreview.leader"><dt>Prowadzi</dt><dd>{{ asbPreview.leader }}</dd></template>
        <template v-if="asbPreview.helper && asbPreview.helper !== asbPreview.leader"><dt>Pomaga</dt><dd>{{ asbPreview.helper }}</dd></template>
        <template v-if="asbPreview.attendance != null && asbPreview.attendance !== ''"><dt>Frekwencja</dt><dd>{{ asbPreview.attendance }}</dd></template>
        <template v-if="asbPreview.int_idea || asbPreview.int_date || asbPreview.int_organizer"><dt>Integracja</dt><dd>{{ [asbPreview.int_idea, asbPreview.int_date, asbPreview.int_organizer].filter(Boolean).join(' · ') }}</dd></template>
      </dl>
      <template v-if="asbPreview.study"><h4>Rozważanie</h4><p class="asb-prev-text">{{ asbPreview.study }}</p></template>
      <template v-if="asbPreview.note"><h4>Notatka</h4><p class="asb-prev-text">{{ asbPreview.note }}</p></template>
      <template v-if="(asbPreview.files || []).length">
        <h4>Załączniki</h4>
        <div class="asb-file-row"><button v-for="f in asbPreview.files" :key="f.path" type="button" class="chipbtn" :title="'Otwórz ' + f.name" @click="asbOpenFile(f)"><svg class="i"><use href="#clip"/></svg>{{ f.name }}</button></div>
      </template>
    </div>
    <div class="np-foot">
      <button v-if="canAsb" class="primary" @click="asbEdit(asbPreview); asbPreview = null"><svg class="i"><use href="#pencil"/></svg>Edytuj</button>
      <button @click="asbPreview = null">Zamknij</button>
    </div>
  </div>
</div>
</template>

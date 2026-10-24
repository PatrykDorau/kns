<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/common/Icon.vue'
import Thumb from '@/components/common/Thumb.vue'
import { TRASH_DAYS, emptyTrash, kindLabel, label, purgeTrashAt, restoreTrash, settings } from '@/stores'

// Kosz Biblioteki (wspólny dla Rzutnika i Studia): usunięte materiały można przywrócić przez 30 dni.
const list = computed(() => settings.libraryTrash || [])
const confirmEmpty = ref(false)
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / 86400000); return d ? d === 1 ? 'wczoraj' : d + ' dni temu' : new Date(t).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }) }
const left = (t: number) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - t) / 86400000))
</script>

<template>
  <section class="lib-trash" aria-label="Kosz Biblioteki">
    <div class="lib-trash-h">
      <b><Icon name="trash" />Kosz <small class="muted">— usunięte materiały wracają jednym kliknięciem (przez {{ TRASH_DAYS }} dni)</small></b>
      <template v-if="list.length">
        <template v-if="confirmEmpty">
          <button class="small del-yes" @click="emptyTrash(); confirmEmpty = false">Tak, usuń na zawsze</button>
          <button class="small" @click="confirmEmpty = false">Nie</button>
        </template>
        <button v-else class="small" @click="confirmEmpty = true">Opróżnij kosz</button>
      </template>
    </div>
    <p v-if="!list.length" class="muted lib-trash-empty">Kosz jest pusty.</p>
    <ul v-else class="lib-trash-list">
      <li v-for="(r, i) in list" :key="r.item.id + r.at">
        <Thumb :item="r.item" />
        <span class="lib-trash-meta"><b :title="label(r.item)">{{ label(r.item) }}</b><small>{{ kindLabel(r.item) }} · usunięto {{ ago(r.at) }} · zniknie za {{ left(r.at) }} dni</small></span>
        <button class="small primary" title="Wraca do Biblioteki (także do pętli, w których był)" @click="restoreTrash(i)"><Icon name="undo" />Przywróć</button>
        <button class="iconbtn danger" title="Usuń na zawsze (razem z plikiem)" :aria-label="'Usuń na zawsze: ' + label(r.item)" @click="purgeTrashAt(i)"><Icon name="x" /></button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lib-trash { margin: 8px 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel2); }
.lib-trash-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lib-trash-h b { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 200px; }
.lib-trash-h b small { font-weight: 400; }
.lib-trash-empty { margin: 6px 0 0; font-size: 13px; }
.lib-trash-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow: auto; }
.lib-trash-list li { display: flex; align-items: center; gap: 10px; }
.lib-trash-list :deep(.thumb) { width: 56px; height: 34px; border-radius: 6px; flex: none; }
.lib-trash-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lib-trash-meta b, .lib-trash-meta small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-trash-meta small { color: var(--muted); font-size: 12px; }
</style>

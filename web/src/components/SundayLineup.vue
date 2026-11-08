<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, onMounted, ref } from 'vue'
import { useApp } from '@/composables/useApp'

// „Skład na niedzielę” (wzór: Avenit) — kto w najbliższą niedzielę służy w każdej służbie, z rolą i stanem
// potwierdzenia (✓ przyjął, ⏱ czeka, ✕ nie może). Widzą wszyscy zatwierdzeni członkowie; wpisy niewysłane — nie.
export default defineComponent({
  setup() {
    const app = useApp()
    const line = ref(null)
    onMounted(async () => { if (app.api.enabled) line.value = await app.api.call('sundayLineup').catch(() => null) })
    const ICON = { yes: '✓', sent: '⏱', no: '✕' }
    const TITLE = { yes: 'potwierdził(a)', sent: 'czeka na odpowiedź', no: 'nie może' }
    const day = d => new Date(d + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'long' })
    return { line, ICON, TITLE, day }
  },
})
</script>

<template>
  <section v-if="line && line.ministries.length" class="sl">
    <h3 class="hw-h">Skład na niedzielę<small>{{ day(line.day) }}</small></h3>
    <div class="sl-grid">
      <article v-for="m in line.ministries" :key="m.id" class="sl-card">
        <b class="sl-name">{{ m.name }}</b>
        <p v-for="(p, i) in m.people" :key="i" class="sl-p" :class="['st-' + p.state, { me: p.me }]">
          <span class="sl-av">{{ p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }}</span>
          <span class="sl-who"><b>{{ p.me ? 'Ty' : p.name }}</b><small v-if="p.role">{{ p.role }}</small></span>
          <i :title="TITLE[p.state]" :aria-label="TITLE[p.state]">{{ ICON[p.state] }}</i>
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.sl { margin-top: 8px; }
.sl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.sl-card { padding: 14px 14px 8px; border-radius: 20px; background: var(--panel); }
.sl-name { display: block; margin-bottom: 6px; font-size: 15px; }
.sl-p { display: flex; align-items: center; gap: 10px; margin: 0; padding: 6px 0; border-top: 1px solid var(--line); }
.sl-av { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--panel2); color: var(--muted); font-size: 12px; font-weight: 600; }
.sl-p.me .sl-av { background: var(--accent); color: #2a1906; }
.sl-who { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.sl-who b { font-size: 14px; font-weight: 600; color: var(--text); }
.sl-who small { color: var(--muted); font-size: 12.5px; }
.sl-p i { font-style: normal; font-weight: 700; font-size: 13px; }
.st-yes i { color: var(--ok-text); }
.st-sent i { color: var(--accent-text); }
.st-no i { color: var(--bad-text); }
.st-no .sl-who b { text-decoration: line-through; color: var(--muted); }
</style>

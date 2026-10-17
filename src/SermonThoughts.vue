<script setup>
import { computed } from 'vue'
import { canUse, plannerRequest, role, services, today } from './store.js'

// Myśli z kazania: ostatnie nabożeństwo, które już się odbyło — widżet tylko wtedy, gdy kaznodzieja dodał myśli
// (pole „Myśli z kazania” w nabożeństwie, jedna myśl w linii). Style: mobile/home.css.
const last = computed(() => services.value.filter(s => s.date && s.date <= today()).sort((a, b) => b.date.localeCompare(a.date))[0] || null)
const thoughts = computed(() => String(last.value?.thoughts || '').split('\n').map(t => t.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean))
const when = computed(() => (last.value ? new Date(last.value.date + 'T12:00').toLocaleDateString('pl', { day: 'numeric', month: 'short' }).replace('.', '') : ''))
function edit() { plannerRequest.value = { id: last.value.id }; role.value = 'planner' }
</script>

<template>
  <section v-if="thoughts.length" class="kh-panel kh-thoughts">
    <div class="kh-panel-h"><h2>Myśli z kazania</h2><span class="kh-muted">{{ when }}</span><span class="kh-spacer"></span><button v-if="canUse('planner')" class="kh-link" @click="edit">Edytuj</button></div>
    <p class="kh-th-sermon"><b>{{ last.sermonTitle || 'Kazanie' }}</b><template v-if="last.passage"> · {{ last.passage }}</template><template v-if="last.speaker"> — {{ last.speaker }}</template></p>
    <ul class="kh-th-list"><li v-for="(t, i) in thoughts" :key="i">{{ t }}</li></ul>
  </section>
</template>

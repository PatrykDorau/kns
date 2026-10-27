<script lang="ts">
// @ts-nocheck — stan i działania wspólne (useApp)
import { defineComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '@/composables/useApp'

// iPhone: instalacji jednym dotknięciem nie da się zrobić (Apple nie pozwala stronom), więc zamiast akapitu tekstu —
// okno od dołu z trzema krokami po kolei (podświetlany krok, obrazki tego, co dotknąć) i strzałką do paska Safari.
// Gdzie jest „Udostępnij”, zależy od przeglądarki i wersji — strzałka wskazuje ten przycisk (place niżej).
// W Messengerze, Facebooku itp. najpierw trzeba otworzyć stronę w Safari.
const UA = navigator.userAgent
const iPad = /iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)
const safariVer = +(UA.match(/Version\/(\d+)/)?.[1] || 0)
// where: bottom (środek dolnego paska), bottom-right, top-right; first — co dotknąć najpierw; hint — dopisek
function place() {
  if (/CriOS/.test(UA)) return { where: 'top-right', first: 'Dotknij <b>Udostępnij</b> przy adresie strony', hint: 'Jeśli adres masz na dole — przycisk jest na dole, przy adresie.' }
  if (/FxiOS/.test(UA)) return { where: 'bottom-right', first: 'Dotknij menu <b>≡</b> w prawym dolnym rogu, potem <b>Udostępnij</b>', hint: '' }
  if (/EdgiOS/.test(UA)) return { where: 'bottom-right', first: 'Dotknij <b>⋯</b> w prawym dolnym rogu, potem <b>Udostępnij</b>', hint: '' }
  if (/OPiOS|GSA\/|YaBrowser|DuckDuckGo/.test(UA)) return { where: 'top-right', first: 'Otwórz menu przeglądarki i dotknij <b>Udostępnij</b>', hint: 'Najprościej: otwórz tę stronę w Safari.' }
  if (iPad) return { where: 'top-right', first: 'Dotknij <b>Udostępnij</b> w prawym górnym rogu', hint: '' }
  // Safari 26 (iOS 26): na dole pasek adresu, „Udostępnij” schowane w „⋯” obok niego
  if (safariVer >= 26) return { where: 'bottom-right', first: 'Dotknij <b>⋯</b> w prawym dolnym rogu, potem <b>Udostępnij</b>', hint: 'Pasek adresu masz u góry? Wtedy <b>⋯</b> jest u góry, przy adresie.' }
  // Safari 15–18: Udostępnij na środku dolnego paska
  return { where: 'bottom', first: 'Dotknij <b>Udostępnij</b> na środku dolnego paska Safari', hint: '' }
}
export default defineComponent({
  setup() {
    const app = useApp()
    const inApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Snapchat|TikTok/i.test(UA)
    const nav = place()
    const step = ref(0)
    let timer = 0
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    onMounted(() => { if (!still) timer = window.setInterval(() => { step.value = (step.value + 1) % 3 }, 2600) })
    onBeforeUnmount(() => clearInterval(timer))
    const close = () => { app.showHelp.value = false }
    const pick = i => { step.value = i; clearInterval(timer) }
    return { inApp, nav, step, close, pick }
  },
})
</script>

<template>
  <div class="ios-in" role="dialog" aria-modal="true" aria-label="Dodaj aplikację do ekranu początkowego" @click.self="close">
    <div class="ios-sheet">
      <button class="ios-x" aria-label="Zamknij" @click="close"><svg class="i"><use href="#x"/></svg></button>
      <img class="ios-ic" src="icon-192.png" alt="">
      <h2>Dodaj aplikację do ekranu</h2>
      <p class="ios-lead">Na iPhonie aplikację z sieci dodaje się w trzech krokach. Potem otwierasz ją z ekranu jak każdą inną.</p>

      <!-- Messenger, Facebook, Instagram…: najpierw Safari -->
      <ol v-if="inApp" class="ios-steps">
        <li class="on"><span class="ios-n">1</span><span class="ios-t">Dotknij <b>⋯</b> w prawym górnym rogu</span><span class="ios-pic">⋯</span></li>
        <li class="on"><span class="ios-n">2</span><span class="ios-t">Wybierz <b>Otwórz w przeglądarce</b> (Safari)</span><span class="ios-pic"><svg class="i"><use href="#link"/></svg></span></li>
        <li class="on"><span class="ios-n">3</span><span class="ios-t">W Safari dotknij <b>Pobierz</b> jeszcze raz</span><span class="ios-pic"><svg class="i"><use href="#download"/></svg></span></li>
      </ol>
      <ol v-else class="ios-steps">
        <li :class="{ on: step === 0 }" @click="pick(0)">
          <span class="ios-n">1</span>
          <span class="ios-t"><span v-html="nav.first"></span><small v-if="nav.hint" v-html="nav.hint"></small></span>
          <span class="ios-pic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span>
        </li>
        <li :class="{ on: step === 1 }" @click="pick(1)">
          <span class="ios-n">2</span>
          <span class="ios-t">Przewiń w dół i wybierz <b>Do ekranu początkowego</b></span>
          <span class="ios-pic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span>
        </li>
        <li :class="{ on: step === 2 }" @click="pick(2)">
          <span class="ios-n">3</span>
          <span class="ios-t">Dotknij <b>Dodaj</b> w prawym górnym rogu</span>
          <span class="ios-pic ios-add">Dodaj</span>
        </li>
      </ol>
    </div>
    <!-- strzałka do przycisku z kroku 1 (miejsce zależy od przeglądarki i wersji) -->
    <span v-if="!inApp && step === 0" class="ios-arrow" :class="nav.where" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg></span>
  </div>
</template>

<style scoped>
.ios-in { position: fixed; inset: 0; z-index: 90; display: flex; align-items: flex-end; justify-content: center; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); background: rgba(8, 7, 6, .62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: ios-fade .25s ease-out; }
.ios-sheet { position: relative; width: min(440px, 100%); margin-bottom: 64px; padding: 26px 20px 18px; border-radius: 26px; background: #181716; text-align: center; animation: ios-up .4s cubic-bezier(.2, .8, .2, 1); }
.ios-x { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 36px; height: 36px; min-height: 0; padding: 0; border-radius: 50%; background: #2a2826 !important; color: var(--muted); }
.ios-ic { width: 56px; height: 56px; border-radius: 14px; }
h2 { margin: 12px 0 0; font: 600 22px/1.2 var(--display); letter-spacing: -.02em; }
.ios-lead { margin: 8px auto 18px; max-width: 32ch; color: var(--muted); font-size: 15px; line-height: 1.45; }
.ios-steps { list-style: none; display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; text-align: left; }
.ios-steps li { display: grid; grid-template-columns: 30px 1fr 52px; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: #201e1c; opacity: .55; transition: opacity .3s, background .3s, transform .3s; }
.ios-steps li.on { opacity: 1; background: #2a2724; transform: scale(1.02); }
.ios-n { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: #1a1208; font: 700 14px/1 var(--display); }
.ios-t { font-size: 15px; line-height: 1.35; }
.ios-t small { display: block; margin-top: 2px; color: var(--muted); font-size: 13px; }
.ios-pic { display: grid; place-items: center; width: 52px; height: 44px; border-radius: 12px; background: #fff; color: #0a84ff; font: 600 20px/1 var(--display); }
.ios-pic svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ios-pic .i { width: 22px; height: 22px; }
.ios-add { font-size: 15px; }
.ios-arrow { position: fixed; left: 50%; bottom: calc(6px + env(safe-area-inset-bottom)); z-index: 91; width: 40px; height: 40px; margin-left: -20px; color: var(--accent); animation: ios-bob 1.1s ease-in-out infinite; }
.ios-arrow.bottom-right { left: auto; right: 14px; margin-left: 0; }
.ios-arrow.top-right { top: 6px; bottom: auto; left: auto; right: 14px; margin-left: 0; transform: rotate(180deg); animation-name: ios-bob-up; }
.ios-arrow svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
@keyframes ios-fade { from { opacity: 0; } }
@keyframes ios-up { from { opacity: 0; transform: translateY(30px); } }
@keyframes ios-bob { 50% { transform: translateY(8px); } }
@keyframes ios-bob-up { 0%, 100% { transform: rotate(180deg); } 50% { transform: rotate(180deg) translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .ios-in, .ios-sheet, .ios-arrow { animation: none; } .ios-steps li { opacity: 1; transform: none; } }
</style>

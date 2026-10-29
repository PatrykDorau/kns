// Strona na telefon (kns-nabo.netlify.app): Vue + Vite. Style, komponenty edytorów programu i myśli z kazania.
import { createApp, defineAsyncComponent } from 'vue'
import App from './App.vue'
// edytory (program, myśli z kazania, listy wyboru, obrazki) — tylko w edycji, więc osobno (gość ich nie pobiera)
const ProgramEditor = defineAsyncComponent(() => import('./components/ProgramEditor.vue'))
const ThoughtsEditor = defineAsyncComponent(() => import('./components/ThoughtsEditor.vue'))
const UiSelect = defineAsyncComponent(() => import('./components/UiSelect.vue'))
const ImageLinkInput = defineAsyncComponent(() => import('./components/ImageLinkInput.vue'))
import './styles/app.css'
import './styles/home.css'
import './styles/ui.css'
import './styles/taste.css' // kierunek „true-black-flat” (taste-skill): ciepła czerń, kolor tylko na danych, Inter

import { startMarquee } from './utils/marquee'
import { startAutoHideHeader } from './utils/autoHideHeader'
import { startViewportFix } from './utils/viewportFix'
import { startMotion } from './utils/motion'
import { startBackdrop } from './utils/backdrop'
// Style nie wstrzymują pierwszego obrazu (index.html — kns-css-async): tło i góra są od razu, a treść aplikacji
// pokazujemy dopiero z gotowymi stylami — bez mignięcia strony bez wyglądu.
const css = document.querySelector<HTMLLinkElement>('link[data-kns-css]')
if (css && !css.sheet) await new Promise(done => { css.addEventListener('load', done); css.addEventListener('error', done); setTimeout(done, 8000) })
createApp(App).component('UiSelect', UiSelect).component('ImageLinkInput', ImageLinkInput).component('program-editor', ProgramEditor).component('thoughts-editor', ThoughtsEditor).mount('#app')
startMarquee() // długie tytuły przesuwają się zamiast „…”
startAutoHideHeader() // telefon: pasek u góry chowa się przy przewijaniu w dół
startViewportFix() // telefon: szeroki widok po powrocie z logowania
startMotion() // wejścia kart, przesuwane zakładki, paralaksa
startBackdrop() // w tle: rysująca się kreską góra KNS z krzyżem

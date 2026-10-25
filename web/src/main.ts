// Strona na telefon (kns-nabo.netlify.app): Vue + Vite. Style, komponenty edytorów programu i myśli z kazania.
import { createApp } from 'vue'
import App from './App.vue'
import ProgramEditor from './components/ProgramEditor.vue'
import ThoughtsEditor from './components/ThoughtsEditor.vue'
import UiSelect from './components/UiSelect.vue'
import ImageLinkInput from './components/ImageLinkInput.vue'
import KnsSky from './components/KnsSky.vue'
import './styles/app.css'
import './styles/home.css'
import './styles/ui.css'
import './styles/taste.css' // kierunek „true-black-flat” (taste-skill): ciepła czerń, kolor tylko na danych, Inter

import { startMarquee } from './utils/marquee'
import { startAutoHideHeader } from './utils/autoHideHeader'
import { startViewportFix } from './utils/viewportFix'
createApp(App).component('UiSelect', UiSelect).component('ImageLinkInput', ImageLinkInput).component('KnsSky', KnsSky).component('program-editor', ProgramEditor).component('thoughts-editor', ThoughtsEditor).mount('#app')
startMarquee() // długie tytuły przesuwają się zamiast „…”
startAutoHideHeader() // telefon: pasek u góry chowa się przy przewijaniu w dół
startViewportFix() // telefon: szeroki widok po powrocie z logowania

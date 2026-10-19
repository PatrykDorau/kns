// Strona na telefon (kns-nabo.netlify.app): Vue + Vite. Style, komponenty edytorów programu i myśli z kazania.
import { createApp } from 'vue'
import App from './App.vue'
import ProgramEditor from './components/ProgramEditor.vue'
import ThoughtsEditor from './components/ThoughtsEditor.vue'
import './styles/app.css'
import './styles/home.css'
import './styles/ui.css'

createApp(App).component('program-editor', ProgramEditor).component('thoughts-editor', ThoughtsEditor).mount('#app')

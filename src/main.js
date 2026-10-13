import { createApp } from 'vue'
import App from './App.vue'
import Output from './Output.vue'
import './style.css'

// Jedna aplikacja, trzy rodzaje okien: panel (wybór służby i jej widok), obraz dla rzutnika (#output)
// oraz niewidoczne okno, które zamienia slajdy prezentacji PowerPoint na obrazy (#pptx).
if (location.hash.includes('pptx')) import('./pptxRender.js').then(m => m.renderPptx())
else createApp(location.hash.includes('output') ? Output : App).mount('#app')

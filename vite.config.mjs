import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// Okno aplikacji na komputer (Vue): src/renderer. Proces główny Electrona — src/main (osobno).
export default defineConfig({
  // Ścieżki względne, bo gotowa aplikacja ładuje pliki z dysku (file://).
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@web': fileURLToPath(new URL('./mobile', import.meta.url)),
    },
  },
  // <webview> (strona kns-nabo w aplikacji) to znacznik Electrona, nie komponent Vue
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag === 'webview' } } })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})

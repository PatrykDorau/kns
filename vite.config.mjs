import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Ścieżki względne, bo gotowa aplikacja ładuje pliki z dysku (file://).
  base: './',
  // <webview> (strona kns-nabo w aplikacji) to znacznik Electrona, nie komponent Vue
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag === 'webview' } } })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})

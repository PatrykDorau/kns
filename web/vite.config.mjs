import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Strona na telefon (kns-nabo.netlify.app): web/ → web/dist (Netlify publikuje web/dist).
//   npm run dev:web — podgląd;  npm run build:web — budowanie
// Testy bez Google i Supabase (dawniej skrypty/test-ui/przygotuj*.sh):
//   npx vite --config web/vite.config.mjs --mode baza --port 5184  — prawdziwy schemat bazy w przeglądarce (PGlite)
//   npx vite --config web/vite.config.mjs --mode dysk --port 5183  — dane na udawanym Dysku, serwer kont
// W przeglądarce: localStorage 'mock-user' (i 'fake-session' dla „baza”) = adres, którym się „logujesz”.
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const TEST = path.join(root, 'skrypty', 'test-ui')
const DB = path.join(root, 'supabase')

// Tryby testowe: udawane logowanie Google i Dysk (mock.js) zamiast skryptu Google; dla „baza” — udawany Supabase.
function testMode(mode) {
  const files = {
    '/mock.js': path.join(TEST, 'udawane-google.js'),
    '/udawana-baza.js': path.join(TEST, 'udawana-baza.js'),
    '/fake-client.mjs': path.join(DB, 'fake-client.mjs'),
  }
  return {
    name: 'kns-test-mode',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0]
        const file = files[url] || (/^\/[\w-]+\.sql$/.test(url) ? path.join(DB, url.slice(1)) : null)
        if (!file || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', url.endsWith('.sql') ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8')
        res.end(fs.readFileSync(file))
      })
    },
    transformIndexHtml(html) {
      const scripts = '<script src="/mock.js"></script>' + (mode === 'baza' ? '<script src="/udawana-baza.js"></script>' : '')
      return html.replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>/, scripts)
    },
  }
}

export default defineConfig(({ mode }) => ({
  root: here,
  base: '/',
  resolve: { alias: { '@': path.join(here, 'src') } },
  // adresy obrazków w szablonach (znak.png, *.svg) zostają zwykłymi adresami plików z public/ — jak dawniej
  plugins: [vue({ template: { transformAssetUrls: false } }), ...(mode === 'baza' || mode === 'dysk' ? [testMode(mode)] : [])],
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true },
}))

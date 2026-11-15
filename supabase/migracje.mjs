// Pełna lista plików bazy w kolejności (ta sama co w udawanej bazie podglądu: skrypty/test-ui/udawana-baza.js).
// Testy całej aplikacji (test-supa, test-cloud) ładują wszystko — inaczej nie widzą kolumn dodanych w późniejszych plikach.
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../skrypty/test-ui/udawana-baza.js', import.meta.url), 'utf8')
const extra = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])/)[1].replace(/'/g, '"'))
export const ALL_SQL = ['schema.sql', ...extra]
export const allSql = (more = []) => [...ALL_SQL, ...more].map(n => fs.readFileSync(new URL('./' + n, import.meta.url), 'utf8')).join('\n')

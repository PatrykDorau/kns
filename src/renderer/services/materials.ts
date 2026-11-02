// „Materiały” z aplikacji jako pliki w Bibliotece: pobranie raz, potem ten sam element (Rzutnik albo Stream).
import { addFiles, api, cloud, items, type Lib } from '@/stores'

export type Material = { id: string; title: string; type: string; date: string; file: string; fileName: string }
const sourceOf = (m: Material) => 'material:' + m.id + ':' + m.file
export const libraryItem = (m: Material, lib: Lib | '' = '') => items.value.find(i => i.source === sourceOf(m) && (i.lib || '') === (lib || ''))

// Zwraca element Biblioteki (widoczny, gdy z pliku powstało ich kilka, np. z prezentacji); błąd rzuca wyjątkiem.
export async function materialToLibrary(m: Material, lib: Lib | '' = '') {
  const have = libraryItem(m, lib)
  if (have) return have
  const url = await cloud.materialUrl(m.file)
  const got = await api.fetchFile(url, m.fileName || m.title)
  if (got?.error) throw new Error(got.error)
  const before = items.value.length
  await addFiles([got.path], null, lib || '')
  const added = items.value.slice(before)
  for (const it of added) { it.source = sourceOf(m); if (!it.hidden && m.title) it.name = m.title }
  return added.find(i => !i.hidden) || null
}

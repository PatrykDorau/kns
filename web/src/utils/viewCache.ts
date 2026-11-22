// Ostatnie dane podstron w pamięci (do zamknięcia aplikacji): ponowne wejście na podstronę pokazuje je od razu,
// a świeże dochodzą w tle. Klucz to podstrona (i np. rok); dane są tylko dla osoby, która je pobrała.
const mem = new Map<string, { who: string, data: unknown }>()

export function cached<T>(key: string, who: string | undefined): T | undefined {
  const x = mem.get(key)
  return x && x.who === (who || '') ? (x.data as T) : undefined
}
export function remember(key: string, who: string | undefined, data: unknown) {
  mem.set(key, { who: who || '', data })
}

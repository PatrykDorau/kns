// Serwer aplikacji (skrypty/serwer.gs na koncie kościoła): konta, prośby o dostęp, rangi.
// Zapytanie: POST z treścią JSON jako zwykły tekst (bez dodatkowego zapytania CORS), z tokenem logowania Google.
// W trybie pokazowym (?demo) — udawany serwer z kilkoma osobami w pamięci przeglądarki.

export function createApi(config, drive) {
  const url = config.apiUrl || ''
  return {
    enabled: !!url,
    async call(action, data = {}) {
      let res
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: drive.accessToken(), ...data }) })
      } catch { throw new Error('Nie udało się połączyć z serwerem aplikacji — sprawdź internet.') }
      const out = await res.json().catch(() => null)
      if (!out) throw new Error('Serwer aplikacji odpowiedział błędem ' + res.status + '.')
      if (out.error) throw Object.assign(new Error(out.error), { auth: /wygasło|Brak logowania/.test(out.error) })
      return out
    },
  }
}

// Rangi — te same co w serwer.gs (w trybie pokazowym serwera nie ma).
const RANKS = [
  { id: 'czlonek', name: 'Członek' },
  { id: 'lider', name: 'Lider', edit: true },
  { id: 'organizator', name: 'Organizator nabożeństw', edit: true },
  { id: 'technika', name: 'Technika (rzutnik, stream)', edit: true },
  { id: 'protokolant', name: 'Protokolant', protocols: true },
  { id: 'rada', name: 'Członek rady zboru', edit: true, council: true },
  { id: 'pastor', name: 'Pastor', edit: true, council: true },
  { id: 'admin', name: 'Administrator', edit: true, council: true, protocols: true, manage: true },
]

export function createDemoApi() {
  const KEY = 'kns-demo-people'
  const day = 86400000
  const start = () => [
    { email: 'ty@przyklad.pl', name: 'Ty (tryb pokazowy)', status: 'active', roles: ['czlonek', 'admin'], requested: Date.now() - 90 * day },
    { email: 'anna.nowak@przyklad.pl', name: 'Anna Nowak', status: 'pending', roles: [], requested: Date.now() - 2 * 3600e3 },
    { email: 'piotr.wisniewski@przyklad.pl', name: 'Piotr Wiśniewski', status: 'pending', roles: [], requested: Date.now() - day },
    { email: 'marta.kowalska@przyklad.pl', name: 'Marta Kowalska', status: 'active', roles: ['czlonek', 'protokolant'], requested: Date.now() - 40 * day },
    { email: 'jan.zielinski@przyklad.pl', name: 'Jan Zieliński', status: 'active', roles: ['czlonek', 'pastor'], requested: Date.now() - 60 * day },
    { email: 'tomek.technik@przyklad.pl', name: 'Tomek', status: 'active', roles: ['czlonek', 'technika'], requested: Date.now() - 20 * day },
  ]
  let people
  try { people = JSON.parse(localStorage.getItem(KEY)) } catch { /* brak zapisu */ }
  people = people || start()
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(people)) } catch { /* tryb prywatny */ } }
  const copy = x => JSON.parse(JSON.stringify(x))
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
  const ACTIONS = {
    me: () => ({ person: people[0], ranks: RANKS }),
    public: () => ({
      services: [{ date: inDays(((7 - new Date().getDay()) % 7) || 7), time: '12:12', place: 'Hotel Forza', sermonTitle: 'Światłość świata', passage: 'J 8,12', speaker: 'Jan Zieliński' }],
      events: [{ type: 'studenckie', title: 'Spotkanie studenckie', date: inDays(3), time: '19:00', place: 'Salka', description: 'Studium Ewangelii Jana' }],
      announcements: [{ id: 'p1', title: 'Piknik kościelny', text: 'W sobotę po nabożeństwie wspólny piknik w parku.', important: false, date: Date.now() }],
      types: [{ id: 'nabozenstwo', name: 'Nabożeństwo', color: '#5b8cff' }, { id: 'studenckie', name: 'Spotkanie studenckie', color: '#3ddc97' }],
    }),
    setNewsletter({ on }) { people[0].newsletter = !!on; persist(); return { person: people[0] } },
    people: () => ({ people, ranks: RANKS }),
    setPerson({ email, status, roles }) {
      const p = people.find(x => x.email === email)
      if (!p) throw new Error('Nie ma takiej osoby.')
      if (status) p.status = status
      if (Array.isArray(roles)) p.roles = roles
      if (p.status === 'active' && !p.roles.length) p.roles = ['czlonek']
      persist()
      return { person: p }
    },
  }
  return {
    enabled: true,
    demo: true,
    async call(action, data = {}) {
      await new Promise(r => setTimeout(r, 250))
      if (!ACTIONS[action]) throw new Error('Nieznane polecenie.')
      return copy(ACTIONS[action](data))
    },
  }
}

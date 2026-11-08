// Serwer aplikacji (skrypty/serwer.gs na koncie kościoła): konta, prośby o dostęp, rangi.
// Zapytanie: POST z treścią JSON jako zwykły tekst (bez dodatkowego zapytania CORS), z tokenem logowania Google.
// W trybie pokazowym (?demo) — udawany serwer z kilkoma osobami w pamięci przeglądarki.

export function createApi(config, drive) {
  const url = config.apiUrl || ''
  return {
    enabled: !!url,
    async call(action, data: any = {}) {
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
  const demoPlan = {}, demoMine = {}
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
  const ACTIONS = {
    me: () => ({ person: people[0], ranks: RANKS }),
    public: () => ({
      services: [{ date: inDays(((7 - new Date().getDay()) % 7) || 7), time: '12:12', place: 'Hotel Forza', sermonTitle: 'Światłość świata', passage: 'J 8,12', speaker: 'Jan Zieliński' }],
      events: [{ type: 'studenckie', title: 'Spotkanie studenckie', date: inDays(3), time: '19:00', place: 'Salka', description: 'Studium Ewangelii Jana' }],
      announcements: [{ id: 'p1', title: 'Piknik kościelny', text: 'W sobotę po nabożeństwie wspólny piknik w parku.', important: false, date: Date.now() }],
      types: [{ id: 'nabozenstwo', name: 'Nabożeństwo', color: '#5b8cff' }, { id: 'studenckie', name: 'Spotkanie studenckie', color: '#3ddc97' }],
    }),
    calendarToken: () => ({ token: '00000000-0000-4000-8000-000000000000' }),
    availability: () => { const days = [7, 14, 21, 28, 35, 42, 49, 56, 63].map(n => inDays(((7 - new Date().getDay()) % 7) + n)); return [{ id: 'd1', name: 'Administracyjno-gospodarcza', member: true, lead: true, you: 'o1', mine: { ...demoMine }, plan: copy(demoPlan), days,
      people: [['o1', 'Ty', demoMine], ['o2', 'Anna Nowak', { [days[0]]: 'yes', [days[1]]: 'no', [days[2]]: 'yes' }], ['o3', 'Jan Zieliński', {}], ['o4', 'Marta Kowalska', { [days[1]]: 'maybe' }]].map(([id, name, states]) => ({ id, name, states: { ...states } })) }] },
    availabilitySet({ day, state }) { if (state) demoMine[day] = state; else delete demoMine[day]; return null },
    scheduleToggle({ day, person }) { const l = demoPlan[day] || (demoPlan[day] = []), i = l.indexOf(person); if (i >= 0) l.splice(i, 1); else l.push(person); return null },
    schedulePublish: () => 0,
    scheduleRole: () => null, ministryRoles: () => null, scheduleAnswer: () => null, myDuties: () => [], sundayLineup: () => null, tasks: () => [], myTasks: () => [],
    ministries: () => [
      { id: 'd1', name: 'Administracyjno-gospodarcza', description: 'Dbamy o salę i sprzęt przed nabożeństwem.', seeking: true, lead: true, mine: 'active', leaders: [{ id: 'l1', name: 'Jan Zieliński' }], members: [], people: [], pending: [] },
      { id: 'd2', name: 'Powitania', description: 'Witamy gości w drzwiach.', seeking: true, lead: false, mine: 'pending', leaders: [{ id: 'l2', name: 'Marta Kowalska' }], members: [], people: [], pending: [] },
      { id: 'd3', name: 'Dźwięk', description: '', seeking: false, lead: false, mine: '', leaders: [], members: [], people: [], pending: [] },
    ],
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
    async call(action, data: any = {}) {
      await new Promise(r => setTimeout(r, 250))
      if (!ACTIONS[action]) throw new Error('Nieznane polecenie.')
      return copy(ACTIONS[action](data))
    },
  }
}

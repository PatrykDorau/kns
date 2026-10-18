// Udawany Supabase w przeglądarce: prawdziwy schemat i reguły (supabase/schema.sql) w PGlite (Postgres w WASM,
// dane w IndexedDB), a „logowanie Google” to wybór konta z localStorage 'mock-user' i przeładowanie strony.
// Zwykły skrypt (nie moduł) — musi ustawić window.supabase, zanim wystartuje aplikacja.
(function () {
  const dbP = (async () => {
    const [{ PGlite }, fake] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/index.js'),
      import('./fake-client.mjs'),
    ])
    const db = new PGlite('idb://kns-test')
    await db.waitReady
    const has = (await db.query(`select to_regclass('public.people') as t`)).rows[0].t
    if (!has) await fake.setupDb(db, await (await fetch('schema.sql')).text(), ['admin@kns.pl'])
    for (const f of ['kalendarz.sql', 'powiadomienia.sql', 'zatwierdzanie.sql', 'profil.sql', 'sluzby.sql', 'skrzynka.sql', 'zapisy.sql', 'posluchaj.sql', 'asb.sql', 'wiadomosci.sql', 'materialy.sql', 'przeczytane.sql']) await db.exec(await (await fetch(f)).text()) // dodatki (można uruchamiać wielokrotnie)
    return { db, fake }
  })()
  window.__db = dbP
  const proxyDb = { query: async (...a) => (await dbP).db.query(...a), exec: async (...a) => (await dbP).db.exec(...a) }

  window.supabase = { createClient() {
    const email = localStorage.getItem('fake-session')
    let inner = null
    const sessionP = (async () => {
      const { db, fake } = await dbP
      inner = fake.createFakeClient(proxyDb, null)
      if (!email) return null
      let id = (await db.query('select id from auth.users where email = $1', [email])).rows[0]?.id
      if (!id) { // pierwsze logowanie: konto powstaje (a wyzwalacz w bazie tworzy prośbę o dostęp)
        id = crypto.randomUUID()
        await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ full_name: email.split('@')[0] })])
      }
      inner.auth.setUser({ id, email })
      return { access_token: 'fake', user: { id, email } }
    })()
    const later = make => {
      // budowniczy zapytań: wywołania łańcuchowe zapamiętane, wykonanie po przygotowaniu bazy i sesji
      const calls = []
      const b = new Proxy({}, { get(_, k) {
        if (k === 'then') return (ok, bad) => sessionP.then(() => calls.reduce((q, [m, a]) => q[m](...a), make())).then(ok, bad)
        return (...a) => { calls.push([k, a]); return b }
      } })
      return b
    }
    return {
      from: table => later(() => inner.from(table)),
      rpc: (name, args) => sessionP.then(() => inner.rpc(name, args)),
      // magazyn plików (grafiki ogłoszeń): pliki w pamięci przeglądarki
      storage: { from: bucket => ({
        async upload(path, blob) { (window.__files ||= {})[path] = URL.createObjectURL(blob); return { error: null } },
        getPublicUrl: path => ({ data: { publicUrl: window.__files[path] + '#/' + bucket + '/' + path } }),
        async remove(paths) { (window.__removed ||= []).push(...paths); return { error: null } },
        async createSignedUrl(path) { return { data: { signedUrl: window.__files?.[path] || 'about:blank' }, error: null } },
      }) },
      auth: {
        getSession: async () => ({ data: { session: await sessionP } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        async signInWithOAuth() { localStorage.setItem('fake-session', localStorage.getItem('mock-user') || 'nowy@kns.pl'); location.reload(); return { error: null } },
        async signOut() { localStorage.removeItem('fake-session'); return { error: null } },
      },
    }
  } }
})()

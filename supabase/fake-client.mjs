// Podróbka klienta Supabase do testów: te wywołania, których używa mobile/supa.js, zamieniane na SQL
// w PGlite (Postgres w Node albo w przeglądarce) — jako zalogowana osoba (rola authenticated, auth.uid())
// albo gość (anon). Dzięki temu testy przechodzą przez prawdziwe reguły dostępu z supabase/schema.sql.

// Przygotowanie bazy: to, co Supabase ma gotowe (schemat auth, role), i schemat aplikacji.
export async function setupDb(db, schemaSql, admins = []) {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  await db.exec(schemaSql)
  for (const a of admins) await db.query(`insert into admin_emails (email) values ($1) on conflict do nothing`, [a])
}
// Nowe konto Google (jak pierwsze logowanie w Supabase).
export async function addUser(db, email, name = '') {
  const id = crypto.randomUUID()
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ full_name: name || email.split('@')[0] })])
  return { id, email }
}

export function createFakeClient(db, user = null) {
  let session = user ? { access_token: 'fake-' + user.id, user: { id: user.id, email: user.email } } : null
  const listeners = []
  let queue = Promise.resolve() // zapytania po kolei (zmiana roli dotyczy całego połączenia)
  async function run(sql, params = []) {
    const job = queue.then(async () => {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [session ? session.user.id : ''])
      await db.exec(`set role ${session ? 'authenticated' : 'anon'}`)
      try { return { data: await db.query(sql, params), error: null } } catch (e) {
        return { data: null, error: { message: e.message, code: e.code } }
      } finally { await db.exec('reset role') }
    })
    queue = job.catch(() => {})
    return job
  }
  const ident = s => '"' + String(s).replace(/"/g, '""') + '"'
  const lit = (v, params) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) { params.push(JSON.stringify(v)); return `$${params.length}::jsonb` }
    if (Array.isArray(v) && v.some(x => x !== null && typeof x === 'object')) { params.push(JSON.stringify(v)); return `$${params.length}::jsonb` }
    params.push(v); return `$${params.length}`
  }

  function from(table) {
    const q = { table, op: 'select', cols: '*', where: [], order: null, desc: false, range: null, rows: null, set: null }
    const b = {
      select(cols = '*') { if (q.op === 'select') q.cols = cols; return b },
      eq(col, val) { q.where.push(['eq', col, val]); return b },
      in(col, vals) { q.where.push(['in', col, vals]); return b },
      or(expr) { q.where.push(['or', expr]); return b },
      order(col, opts) { q.order = col; q.desc = opts?.ascending === false; return b },
      range(a, z) { q.range = [a, z]; return b },
      upsert(rows) { q.op = 'upsert'; q.rows = Array.isArray(rows) ? rows : [rows]; return b },
      update(obj) { q.op = 'update'; q.set = obj; return b },
      delete() { q.op = 'delete'; return b },
      then(ok, bad) { return exec().then(ok, bad) },
    }
    const where = params => {
      const parts = q.where.map(w => {
        if (w[0] === 'eq') return `${ident(w[1])} = ${lit(w[2], params)}`
        if (w[0] === 'in') { params.push(w[2]); return `${ident(w[1])} = any($${params.length})` }
        // or('date.gte.2026-01-01,date.is.null')
        return '(' + w[1].split(',').map(c => {
          const [col, op, ...rest] = c.split('.'); const val = rest.join('.')
          if (op === 'is' && val === 'null') return `${ident(col)} is null`
          const ops = { gte: '>=', lte: '<=', gt: '>', lt: '<', eq: '=' }
          return `${ident(col)} ${ops[op]} ${lit(val, params)}`
        }).join(' or ') + ')'
      })
      return parts.length ? ' where ' + parts.join(' and ') : ''
    }
    async function exec() {
      const params = []
      let sql
      if (q.op === 'select') {
        sql = `select ${q.cols === '*' ? '*' : q.cols.split(',').map(ident).join(',')} from public.${ident(table)}${where(params)}`
        if (q.order) sql += ` order by ${ident(q.order)}${q.desc ? ' desc' : ''}`
        if (q.range) sql += ` limit ${q.range[1] - q.range[0] + 1} offset ${q.range[0]}`
      } else if (q.op === 'upsert') {
        const cols = Object.keys(q.rows[0])
        const values = q.rows.map(r => '(' + cols.map(c => lit(r[c] === undefined ? null : r[c], params)).join(',') + ')').join(',')
        sql = `insert into public.${ident(table)} (${cols.map(ident).join(',')}) values ${values} on conflict (id) do update set ${cols.filter(c => c !== 'id').map(c => `${ident(c)} = excluded.${ident(c)}`).join(',')}`
      } else if (q.op === 'update') {
        sql = `update public.${ident(table)} set ${Object.entries(q.set).map(([k, v]) => `${ident(k)} = ${lit(v, params)}`).join(',')}${where(params)}`
      } else {
        sql = `delete from public.${ident(table)}${where(params)}`
      }
      const res = await run(sql, params)
      return res.error ? { data: null, error: res.error } : { data: res.data.rows, error: null }
    }
    return b
  }

  const ARRAYS = { new_roles: 'text[]', new_leaders: 'uuid[]', targets: 'uuid[]' }
  async function rpc(name, args = {}) {
    const params = []
    const list = Object.entries(args).map(([k, v]) => { params.push(v); return `${ident(k)} => $${params.length}${ARRAYS[k] ? '::' + ARRAYS[k] : ''}` })
    // funkcja zwracająca listę (returns table / setof) — jak w Supabase: tablica wierszy
    const set = (await db.query('select bool_or(proretset) as s from pg_proc where proname = $1', [name])).rows[0]?.s
    if (set) {
      const res = await run(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from public.${ident(name)}(${list.join(', ')}) t`, params)
      return res.error ? { data: null, error: res.error } : { data: res.data.rows[0].r, error: null }
    }
    const res = await run(`select to_jsonb(public.${ident(name)}(${list.join(', ')})) as r`, params)
    return res.error ? { data: null, error: res.error } : { data: res.data.rows[0].r, error: null }
  }

  return {
    from, rpc,
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
      // do testów: token tożsamości = adres e-mail istniejącego konta
      async signInWithIdToken({ token }) {
        const u = (await db.query('select id, email from auth.users where email = $1', [token])).rows[0]
        if (!u) return { data: null, error: { message: 'Invalid token' } }
        this.setUser(u)
        return { data: { session }, error: null }
      },
      async signInWithOAuth(opts) { this.lastOAuth = opts; return { error: null } },
      async signOut() { session = null; listeners.forEach(cb => cb('SIGNED_OUT', null)); return { error: null } },
      // do testów: zalogowanie jako inna osoba
      setUser(u) { session = u ? { access_token: 'fake-' + u.id, user: { id: u.id, email: u.email } } : null; listeners.forEach(cb => cb('SIGNED_IN', session)) },
    },
  }
}

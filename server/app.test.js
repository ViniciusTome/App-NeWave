import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from './app.js'

let app
let base
let dir
let dbPath
let ctx // instância separada, com um "mailer" falso que guarda os emails

async function startTestApp() {
  const testDir = mkdtempSync(join(tmpdir(), 'newave-reset-'))
  const testDbPath = join(testDir, 'test.db')
  const mails = []
  const testApp = createApp({
    dbPath: testDbPath,
    appUrl: 'http://app.test',
    mailer: { send: async (mail) => void mails.push(mail) },
  })
  await new Promise((resolve) => testApp.server.listen(0, '127.0.0.1', resolve))
  return {
    mails,
    dbPath: testDbPath,
    baseUrl: `http://127.0.0.1:${testApp.server.address().port}`,
    async close() {
      await testApp.close()
      rmSync(testDir, { recursive: true, force: true })
    },
  }
}

before(async () => {
  ctx = await startTestApp()
  dir = mkdtempSync(join(tmpdir(), 'newave-test-'))
  dbPath = join(dir, 'test.db')
  app = createApp({ dbPath })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${app.server.address().port}`
})

after(async () => {
  await ctx.close()
  await app.close()
  rmSync(dir, { recursive: true, force: true })
})

async function api(path, { method = 'GET', body, cookie, headers = {}, raw, baseUrl } = {}) {
  const finalHeaders = { ...headers }
  if (body !== undefined && !raw) finalHeaders['Content-Type'] = 'application/json'
  if (cookie) finalHeaders.Cookie = cookie
  const response = await fetch((baseUrl ?? base) + path, {
    method,
    headers: finalHeaders,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: response.headers.getSetCookie()[0],
    headers: response.headers,
  }
}

const cookieFrom = (setCookie) => setCookie.split(';')[0]

const validUser = { name: 'Ana Souza', email: 'ana@example.com', password: 'senha-forte-123' }

test('cadastro cria a conta e não devolve a senha', async () => {
  const res = await api('/api/auth/register', { method: 'POST', body: validUser })
  assert.equal(res.status, 201)
  assert.equal(res.body.user.email, 'ana@example.com')
  assert.equal(res.body.user.name, 'Ana Souza')
  assert.equal(res.body.user.password, undefined)
  assert.equal(res.body.user.password_hash, undefined)
})

test('a senha é guardada com hash, nunca em texto puro', () => {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('ana@example.com')
  db.close()
  assert.match(row.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)
  assert.ok(!row.password_hash.includes(validUser.password))
})

test('cadastro recusa email repetido (mesmo com maiúsculas)', async () => {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { ...validUser, email: 'ANA@Example.com' },
  })
  assert.equal(res.status, 409)
})

test('cadastro valida nome, email e senha', async () => {
  const cases = [
    { ...validUser, email: 'v1@example.com', name: '' },
    { ...validUser, email: 'sem-arroba' },
    { ...validUser, email: 'v2@example.com', password: 'curta' },
    { ...validUser, email: 'v3@example.com', password: 12345678 },
    { name: 'Sem Campos' },
  ]
  for (const body of cases) {
    const res = await api('/api/auth/register', { method: 'POST', body })
    assert.equal(res.status, 400, JSON.stringify(body))
  }
})

test('login com credenciais certas cria sessão com cookie HttpOnly', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: validUser.password },
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.user.name, 'Ana Souza')
  assert.match(res.setCookie, /^newave_session=[\w-]{40,}/)
  assert.match(res.setCookie, /HttpOnly/)
  assert.match(res.setCookie, /SameSite=Lax/)
  assert.doesNotMatch(res.setCookie, /Max-Age/) // sem "lembrar-me": cookie de sessão
  assert.doesNotMatch(res.setCookie, /Secure/) // só em produção
})

test('"Lembrar-me" deixa o cookie durar 30 dias', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: validUser.password, remember: true },
  })
  assert.equal(res.status, 200)
  assert.match(res.setCookie, /Max-Age=2592000/)
})

test('o login aceita email com maiúsculas e espaços', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: '  ANA@example.com ', password: validUser.password },
  })
  assert.equal(res.status, 200)
})

test('senha errada e email inexistente dão a mesma resposta', async () => {
  const wrongPassword = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: 'senha-errada-123' },
  })
  const unknownEmail = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ninguem@example.com', password: 'senha-errada-123' },
  })
  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownEmail.status, 401)
  assert.deepEqual(wrongPassword.body, unknownEmail.body)
  assert.equal(wrongPassword.setCookie, undefined)
})

test('/me só funciona com a sessão certa', async () => {
  const noCookie = await api('/api/auth/me')
  assert.equal(noCookie.status, 401)

  const fake = await api('/api/auth/me', { cookie: 'newave_session=token-inventado' })
  assert.equal(fake.status, 401)

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: validUser.password },
  })
  const me = await api('/api/auth/me', { cookie: cookieFrom(login.setCookie) })
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, 'ana@example.com')
})

test('logout invalida a sessão no servidor', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: validUser.password },
  })
  const cookie = cookieFrom(login.setCookie)

  const logout = await api('/api/auth/logout', { method: 'POST', cookie })
  assert.equal(logout.status, 204)
  assert.match(logout.setCookie, /Max-Age=0/)

  // O cookie antigo não vale mais, mesmo que alguém tenha copiado
  const me = await api('/api/auth/me', { cookie })
  assert.equal(me.status, 401)
})

test('recusa corpo que não é JSON', async () => {
  const wrongType = await api('/api/auth/login', {
    method: 'POST',
    raw: 'email=a@b.com&password=x',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  assert.equal(wrongType.status, 415)

  const broken = await api('/api/auth/login', { method: 'POST', raw: '{quebrado' })
  assert.equal(broken.status, 415) // sem Content-Type

  const brokenJson = await api('/api/auth/login', {
    method: 'POST',
    raw: '{quebrado',
    headers: { 'Content-Type': 'application/json' },
  })
  assert.equal(brokenJson.status, 400)
})

test('recusa corpo grande demais', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'a@b.com', password: 'x'.repeat(20_000) },
  })
  assert.equal(res.status, 413)
})

test('rota inexistente dá 404 em JSON', async () => {
  const res = await api('/api/nada')
  assert.equal(res.status, 404)
  assert.ok(res.body.error)
})

test('bloqueia depois de 10 senhas erradas, até para a senha certa', async () => {
  await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Bruno Lima', email: 'bruno@example.com', password: 'outra-senha-123' },
  })

  for (let i = 0; i < 10; i++) {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'bruno@example.com', password: `errada-${i}-xxxx` },
    })
    assert.equal(res.status, 401)
  }

  const blocked = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'bruno@example.com', password: 'outra-senha-123' },
  })
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)

  // Outro email, vindo do mesmo IP, continua podendo entrar
  const other = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: validUser.password },
  })
  assert.equal(other.status, 200)
})


// ---------- Esqueci a senha ----------

const post = (c, path, body) => api(path, { method: 'POST', body, baseUrl: c.baseUrl })
const forgot = (c, email) => post(c, '/api/auth/forgot-password', { email })
const reset = (c, token, password) => post(c, '/api/auth/reset-password', { token, password })
const login = (c, email, password) => post(c, '/api/auth/login', { email, password })
const signUp = (c, name, email, password) =>
  post(c, '/api/auth/register', { name, email, password })
const tokenFrom = (mail) =>
  new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')
const lastToken = (c) => tokenFrom(c.mails.at(-1))

test('esqueci a senha: resposta igual para email com e sem conta', async () => {
  await signUp(ctx, 'Maria Alves', 'maria@example.com', 'senha-antiga-1')

  const known = await forgot(ctx, 'maria@example.com')
  const unknown = await forgot(ctx, 'ninguem@example.com')

  assert.equal(known.status, 200)
  assert.equal(unknown.status, 200)
  assert.deepEqual(known.body, unknown.body)

  // Só quem tem conta recebe o email
  assert.equal(ctx.mails.length, 1)
  assert.equal(ctx.mails[0].to, 'maria@example.com')
  assert.match(ctx.mails[0].text, /^Olá, Maria!/)
  assert.match(ctx.mails[0].text, /http:\/\/app\.test\/auth\/reset-password\?token=[\w-]{40,}/)
})

test('esqueci a senha: exige o campo email', async () => {
  const res = await post(ctx, '/api/auth/forgot-password', {})
  assert.equal(res.status, 400)
})

test('o token do link fica guardado só como hash', () => {
  const token = lastToken(ctx)
  const db = new DatabaseSync(ctx.dbPath, { readOnly: true })
  const rows = db.prepare('SELECT token_hash FROM password_resets').all()
  db.close()
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, token)
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/)
})

test('redefinir a senha troca a senha e derruba as sessões abertas', async () => {
  const before = await login(ctx, 'maria@example.com', 'senha-antiga-1')
  const oldCookie = cookieFrom(before.setCookie)
  assert.equal((await api('/api/auth/me', { cookie: oldCookie, baseUrl: ctx.baseUrl })).status, 200)

  const res = await reset(ctx, lastToken(ctx), 'senha-nova-123')
  assert.equal(res.status, 200)

  // A sessão aberta antes (de outro aparelho, por exemplo) deixa de valer
  const me = await api('/api/auth/me', { cookie: oldCookie, baseUrl: ctx.baseUrl })
  assert.equal(me.status, 401)

  assert.equal((await login(ctx, 'maria@example.com', 'senha-antiga-1')).status, 401)
  assert.equal((await login(ctx, 'maria@example.com', 'senha-nova-123')).status, 200)
})

test('o link só funciona uma vez', async () => {
  const token = lastToken(ctx) // já foi usado no teste anterior
  const res = await reset(ctx, token, 'outra-senha-456')
  assert.equal(res.status, 400)
  assert.equal((await login(ctx, 'maria@example.com', 'senha-nova-123')).status, 200)
})

test('link inventado ou vazio é recusado', async () => {
  const invented = await reset(ctx, 'token-inventado', 'senha-nova-123')
  assert.equal(invented.status, 400)
  assert.equal(invented.body.code, 'invalid_reset_link')
  assert.equal((await reset(ctx, '', 'senha-nova-123')).status, 400)
  assert.equal((await post(ctx, '/api/auth/reset-password', { password: 'senha-nova-123' })).status, 400)
})

test('senha fraca não gasta o link', async () => {
  await signUp(ctx, 'Caio Reis', 'caio@example.com', 'senha-antiga-2')
  await forgot(ctx, 'caio@example.com')
  const token = lastToken(ctx)

  const weak = await reset(ctx, token, 'curta')
  assert.equal(weak.status, 400)
  assert.match(weak.body.error, /senha/i)
  assert.notEqual(weak.body.code, 'invalid_reset_link') // o link continua bom

  // O mesmo link ainda serve com uma senha boa
  assert.equal((await reset(ctx, token, 'senha-nova-789')).status, 200)
  assert.equal((await login(ctx, 'caio@example.com', 'senha-nova-789')).status, 200)
})

test('link expirado é recusado', async () => {
  await forgot(ctx, 'caio@example.com')
  const token = lastToken(ctx)

  const db = new DatabaseSync(ctx.dbPath)
  db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1000)
  db.close()

  const res = await reset(ctx, token, 'senha-nova-000')
  assert.equal(res.status, 400)
  assert.equal((await login(ctx, 'caio@example.com', 'senha-nova-000')).status, 401)
})

test('pedir um link novo invalida o anterior', async () => {
  await signUp(ctx, 'Dora Lima', 'dora@example.com', 'senha-antiga-3')
  await forgot(ctx, 'dora@example.com')
  const first = lastToken(ctx)
  await forgot(ctx, 'dora@example.com')
  const second = lastToken(ctx)
  assert.notEqual(first, second)

  assert.equal((await reset(ctx, first, 'senha-nova-111')).status, 400)
  assert.equal((await reset(ctx, second, 'senha-nova-111')).status, 200)
})

test('limite de pedidos de "esqueci a senha"', async () => {
  const c = await startTestApp()
  try {
    await signUp(c, 'Eva Costa', 'eva@example.com', 'senha-antiga-4')

    for (let i = 0; i < 3; i++) assert.equal((await forgot(c, 'eva@example.com')).status, 200)

    const blocked = await forgot(c, 'eva@example.com')
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    assert.equal(c.mails.length, 3) // o quarto pedido não mandou email

    // O limite vale também para emails sem conta (não revela quem existe)
    for (let i = 0; i < 3; i++) await forgot(c, 'fantasma@example.com')
    assert.equal((await forgot(c, 'fantasma@example.com')).status, 429)

    // Outro email continua podendo pedir
    assert.equal((await forgot(c, 'outro@example.com')).status, 200)
  } finally {
    await c.close()
  }
})

test('bloqueia quem fica tentando links inválidos', async () => {
  const c = await startTestApp()
  try {
    for (let i = 0; i < 10; i++) {
      assert.equal((await reset(c, `token-errado-${i}`, 'senha-nova-123')).status, 400)
    }
    assert.equal((await reset(c, 'token-errado-final', 'senha-nova-123')).status, 429)
  } finally {
    await c.close()
  }
})

test('dois pedidos ao mesmo tempo com o mesmo link: só um vale', async () => {
  await signUp(ctx, 'Fabio Neri', 'fabio@example.com', 'senha-antiga-5')
  await forgot(ctx, 'fabio@example.com')
  const token = lastToken(ctx)

  const [a, b] = await Promise.all([
    reset(ctx, token, 'senha-do-pedido-a'),
    reset(ctx, token, 'senha-do-pedido-b'),
  ])

  assert.deepEqual([a.status, b.status].sort(), [200, 400])

  // A senha final é a do pedido que venceu, e só ela funciona
  const winner = a.status === 200 ? 'senha-do-pedido-a' : 'senha-do-pedido-b'
  const loser = a.status === 200 ? 'senha-do-pedido-b' : 'senha-do-pedido-a'
  assert.equal((await login(ctx, 'fabio@example.com', winner)).status, 200)
  assert.equal((await login(ctx, 'fabio@example.com', loser)).status, 401)
})

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'

let app
let base
let dir
let ana // cookie de sessão da Ana
let bia // cookie de sessão da Bia

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'newave-swim-'))
  app = createApp({ dbPath: join(dir, 'test.db'), mailer: { send: async () => {} } })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${app.server.address().port}`
  ana = await signUpAndLogin('Ana Souza', 'ana@example.com')
  bia = await signUpAndLogin('Bia Rocha', 'bia@example.com')
})

after(async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
})

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const response = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: response.headers.getSetCookie()[0],
  }
}

async function signUpAndLogin(name, email) {
  const password = 'senha-forte-123'
  await api('/api/auth/register', { method: 'POST', body: { name, email, password } })
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return login.setCookie.split(';')[0]
}

const today = () => new Date().toISOString().slice(0, 10)
const addTest = (cookie, body) => api('/api/tests', { method: 'POST', body, cookie })
const addTraining = (cookie, body) => api('/api/trainings', { method: 'POST', body, cookie })

// ---------- Acesso ----------

test('sem login, nenhuma rota de dados funciona', async () => {
  const calls = [
    ['GET', '/api/tests'],
    ['POST', '/api/tests', { distance: 400, timeHundredths: 33245, date: '2025-10-01' }],
    ['DELETE', '/api/tests/1'],
    ['GET', '/api/trainings'],
    ['POST', '/api/trainings', { date: '2025-10-01', warmUp: '200 crawl' }],
  ]
  for (const [method, path, body] of calls) {
    const res = await api(path, { method, body })
    assert.equal(res.status, 401, `${method} ${path}`)
  }
})

// ---------- Testes de tempo ----------

test('registra um teste e devolve os dados', async () => {
  const res = await addTest(ana, { distance: 400, timeHundredths: 33245, date: '2025-10-01' })
  assert.equal(res.status, 201)
  assert.deepEqual(
    { ...res.body.test, id: undefined },
    { id: undefined, distance: 400, timeHundredths: 33245, date: '2025-10-01' },
  )
  assert.ok(res.body.test.id > 0)
})

test('lista os testes em ordem de data, do mais antigo ao mais novo', async () => {
  await addTest(ana, { distance: 400, timeHundredths: 32810, date: '2025-11-15' })
  await addTest(ana, { distance: 400, timeHundredths: 33900, date: '2025-09-01' })
  await addTest(ana, { distance: 100, timeHundredths: 7512, date: '2025-10-10' })

  const res = await api('/api/tests', { cookie: ana })
  assert.equal(res.status, 200)
  const dates = res.body.tests.map((t) => t.date)
  assert.deepEqual(dates, [...dates].sort())
  assert.equal(res.body.tests.length, 4)
})

test('aceita a data de hoje', async () => {
  const res = await addTest(ana, { distance: 50, timeHundredths: 3105, date: today() })
  assert.equal(res.status, 201)
})

test('valida distância, tempo e data do teste', async () => {
  const ok = { distance: 400, timeHundredths: 33245, date: '2025-10-01' }
  const invalid = [
    { ...ok, distance: 75 },
    { ...ok, distance: '400' },
    { ...ok, timeHundredths: 0 },
    { ...ok, timeHundredths: -100 },
    { ...ok, timeHundredths: 332.45 },
    { ...ok, timeHundredths: '33245' },
    { ...ok, timeHundredths: 2 * 60 * 60 * 100 + 1 },
    { ...ok, date: '2025-02-30' },
    { ...ok, date: '01/10/2025' },
    { ...ok, date: '2999-01-01' },
    { ...ok, date: '1800-01-01' },
    { distance: 400 },
  ]
  for (const body of invalid) {
    const res = await addTest(ana, body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.ok(res.body.error)
  }
})

test('cada usuário só vê os próprios testes', async () => {
  await addTest(bia, { distance: 200, timeHundredths: 15020, date: '2025-10-05' })

  const biaTests = (await api('/api/tests', { cookie: bia })).body.tests
  assert.equal(biaTests.length, 1)
  assert.equal(biaTests[0].distance, 200)

  const anaTests = (await api('/api/tests', { cookie: ana })).body.tests
  assert.ok(anaTests.every((t) => t.distance !== 200))
})

test('apaga o próprio teste', async () => {
  const created = await addTest(ana, { distance: 800, timeHundredths: 70000, date: '2025-10-02' })
  const id = created.body.test.id

  const del = await api(`/api/tests/${id}`, { method: 'DELETE', cookie: ana })
  assert.equal(del.status, 204)

  const tests = (await api('/api/tests', { cookie: ana })).body.tests
  assert.ok(!tests.some((t) => t.id === id))

  const again = await api(`/api/tests/${id}`, { method: 'DELETE', cookie: ana })
  assert.equal(again.status, 404)
})

test('não deixa apagar o teste de outra pessoa', async () => {
  const anaTest = (await api('/api/tests', { cookie: ana })).body.tests[0]

  const del = await api(`/api/tests/${anaTest.id}`, { method: 'DELETE', cookie: bia })
  assert.equal(del.status, 404)

  const still = (await api('/api/tests', { cookie: ana })).body.tests
  assert.ok(still.some((t) => t.id === anaTest.id))
})

test('id inválido na rota de apagar dá 404', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) {
    const res = await api(`/api/tests/${id}`, { method: 'DELETE', cookie: ana })
    assert.equal(res.status, 404, id)
  }
})

// ---------- Treinos realizados ----------

const sampleTraining = {
  date: '2025-10-20',
  title: 'Treino 1',
  warmUp: '200 crawl',
  speed: '(2x) 4 x 25\n1ª série com pp',
  mainSeries: '5 x 400 crawl A3 com pp + palmar',
  release: '200 costas',
  notes: 'Senti cansaço na última série',
}

test('registra um treino realizado', async () => {
  const res = await addTraining(ana, sampleTraining)
  assert.equal(res.status, 201)
  assert.equal(res.body.training.mainSeries, sampleTraining.mainSeries)
  assert.equal(res.body.training.speed, sampleTraining.speed) // mantém as quebras de linha
})

test('valida o treino', async () => {
  const invalid = [
    { title: 'Sem data', warmUp: '200 crawl' },
    { date: '2025-10-20', title: 'Sem nenhuma parte' },
    { date: '2025-10-20', warmUp: '   ' },
    { date: '2025-10-20', warmUp: 'x'.repeat(2001) },
    { date: '2025-10-20', warmUp: '200 crawl', title: 't'.repeat(101) },
    { date: '2999-01-01', warmUp: '200 crawl' },
  ]
  for (const body of invalid) {
    const res = await addTraining(ana, body)
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80))
  }
})

test('lista os últimos treinos, do mais recente para o mais antigo', async () => {
  await addTraining(ana, { ...sampleTraining, date: '2025-10-25', title: 'Treino 2' })
  await addTraining(ana, { ...sampleTraining, date: '2025-10-01', title: 'Treino 0' })

  const res = await api('/api/trainings', { cookie: ana })
  assert.equal(res.status, 200)
  assert.deepEqual(
    res.body.trainings.map((t) => t.title),
    ['Treino 2', 'Treino 1', 'Treino 0'],
  )
  // Vem o treino completo, pronto para abrir na janela
  const first = res.body.trainings[0]
  for (const key of ['warmUp', 'speed', 'mainSeries', 'release', 'notes']) {
    assert.equal(typeof first[key], 'string', key)
  }
})

test('o limite de treinos funciona e tem teto', async () => {
  const two = await api('/api/trainings?limit=2', { cookie: ana })
  assert.equal(two.body.trainings.length, 2)

  for (const limit of ['abc', '-5', '0', '999']) {
    const res = await api(`/api/trainings?limit=${limit}`, { cookie: ana })
    assert.equal(res.status, 200, limit)
    assert.ok(res.body.trainings.length >= 1 && res.body.trainings.length <= 50, limit)
  }
})

test('cada usuário só vê os próprios treinos', async () => {
  const res = await api('/api/trainings', { cookie: bia })
  assert.deepEqual(res.body.trainings, [])
})

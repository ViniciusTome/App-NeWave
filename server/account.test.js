import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { trainingStats } from './account.js'

let app
let base
let dir
const enviados = [] // emails "enviados" (mailer de teste)

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'newave-conta-'))
  app = createApp({
    dbPath: join(dir, 'test.db'),
    supportEmail: 'suporte@example.com',
    mailer: { send: async (m) => { enviados.push(m) } },
  })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${app.server.address().port}`
})

after(async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
})

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const response = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: response.headers.getSetCookie()[0] }
}

let contador = 0
async function novoUsuario(password = 'senha-forte-123') {
  contador++
  const email = `conta${contador}@example.com`
  await api('/api/auth/register', { method: 'POST', body: { name: `Atleta ${contador}`, email, password } })
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return { email, password, cookie: login.setCookie.split(';')[0] }
}

test('treinos realizados e sequência sem falhar (de verdade, pelos treinos)', () => {
  const t = (id, date, feito, falta = false) => ({ id, date, completed_at: feito ? date : null, missed_at: falta ? date : null })
  const hoje = '2026-11-23'
  // Sequência: do mais recente para trás, até a primeira falta ou o primeiro sem resposta
  assert.deepEqual(trainingStats([
    t(1, '2026-11-10', true), t(2, '2026-11-12', false, true), t(3, '2026-11-14', true),
    t(4, '2026-11-17', true), t(5, '2026-11-19', true), t(6, '2026-11-23', false), t(7, '2026-11-25', false),
  ], hoje), { realizados: 4, sequencia: 3 })
  // Passou da data sem resposta: quebra a sequência
  assert.deepEqual(trainingStats([t(1, '2026-11-17', true), t(2, '2026-11-19', false)], hoje), { realizados: 1, sequencia: 0 })
  // Sem treinos
  assert.deepEqual(trainingStats([], hoje), { realizados: 0, sequencia: 0 })
})

test('conta: precisa estar logado', async () => {
  for (const [method, path] of [['GET', '/api/account'], ['PATCH', '/api/account'], ['DELETE', '/api/account'],
    ['POST', '/api/account/password'], ['POST', '/api/support']]) {
    assert.equal((await api(path, { method, body: method === 'GET' ? undefined : {} })).status, 401, `${method} ${path}`)
  }
})

test('conta: os números do Perfil vêm dos treinos do atleta', async () => {
  const { cookie } = await novoUsuario()
  const ids = []
  for (const date of ['2026-11-16', '2026-11-18', '2026-11-20']) {
    ids.push((await api('/api/trainings', { method: 'POST', cookie, body: { date, warmUp: '200 crawl' } })).body.training.id)
  }
  for (const id of ids) await api(`/api/trainings/${id}/complete`, { method: 'POST', cookie, body: {} })
  const { body } = await api('/api/account?today=2026-11-23', { cookie })
  assert.deepEqual(body.stats, { realizados: 3, sequencia: 3 })
  assert.equal(body.account.phone, null)
  assert.equal(body.support.emailConfigured, true)
})

test('conta: editar nome, telefone e nascimento (com validação)', async () => {
  const { cookie } = await novoUsuario()
  const ok = await api('/api/account?today=2026-11-23', { method: 'PATCH', cookie, body: { name: ' Maria Silva ', phone: '(11) 98765-4321', birthDate: '1990-05-20' } })
  assert.equal(ok.status, 200)
  assert.deepEqual([ok.body.account.name, ok.body.account.phone, ok.body.account.birthDate], ['Maria Silva', '11987654321', '1990-05-20'])
  // O nome novo vale no resto do app
  assert.equal((await api('/api/auth/me', { cookie })).body.user.name, 'Maria Silva')
  for (const body of [{ phone: '1234' }, { birthDate: '2030-01-01' }, { birthDate: '1990-02-30' }, { name: 'A' }]) {
    assert.equal((await api('/api/account?today=2026-11-23', { method: 'PATCH', cookie, body })).status, 400, JSON.stringify(body))
  }
  // Vazio apaga
  const apagado = await api('/api/account', { method: 'PATCH', cookie, body: { phone: '' } })
  assert.equal(apagado.body.account.phone, null)
  assert.equal(apagado.body.account.birthDate, '1990-05-20')
})

test('conta: trocar a senha pede a atual; as outras sessões caem', async () => {
  const conta = await novoUsuario()
  const outra = (await api('/api/auth/login', { method: 'POST', body: { email: conta.email, password: conta.password } })).setCookie.split(';')[0]
  const errada = await api('/api/account/password', { method: 'POST', cookie: conta.cookie, body: { currentPassword: 'errada-123', newPassword: 'nova-senha-123' } })
  assert.equal(errada.status, 400)
  const curta = await api('/api/account/password', { method: 'POST', cookie: conta.cookie, body: { currentPassword: conta.password, newPassword: '123' } })
  assert.equal(curta.status, 400)
  const ok = await api('/api/account/password', { method: 'POST', cookie: conta.cookie, body: { currentPassword: conta.password, newPassword: 'nova-senha-123' } })
  assert.equal(ok.status, 200)
  assert.equal((await api('/api/auth/me', { cookie: conta.cookie })).status, 200) // esta continua
  assert.equal((await api('/api/auth/me', { cookie: outra })).status, 401) // a outra caiu
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: conta.email, password: 'nova-senha-123' } })).status, 200)
})

test('suporte: a mensagem fica guardada e vai para o email do suporte', async () => {
  const { cookie, email } = await novoUsuario()
  assert.equal((await api('/api/support', { method: 'POST', cookie, body: { message: 'oi' } })).status, 400)
  const ok = await api('/api/support', { method: 'POST', cookie, body: { message: 'Não consigo gerar os treinos.' } })
  assert.equal(ok.status, 201)
  await new Promise((r) => setTimeout(r, 20))
  const mail = enviados.find((m) => m.to === 'suporte@example.com' && m.text.includes(email))
  assert.ok(mail && mail.text.includes('Não consigo gerar os treinos.'))
})

test('excluir a conta: pede a senha e apaga tudo', async () => {
  const conta = await novoUsuario()
  const treino = (await api('/api/trainings', { method: 'POST', cookie: conta.cookie, body: { date: '2026-11-20', warmUp: '200 crawl' } })).body.training
  assert.ok(treino)
  assert.equal((await api('/api/account', { method: 'DELETE', cookie: conta.cookie, body: { password: 'errada-123' } })).status, 400)
  const ok = await api('/api/account', { method: 'DELETE', cookie: conta.cookie, body: { password: conta.password } })
  assert.equal(ok.status, 204)
  assert.match(ok.setCookie, /Max-Age=0/)
  assert.equal((await api('/api/auth/me', { cookie: conta.cookie })).status, 401)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: conta.email, password: conta.password } })).status, 401)
  // O email fica livre para um cadastro novo
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'De Novo', email: conta.email, password: 'senha-forte-123' } })).status, 201)
})

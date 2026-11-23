import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { createGoogleVerifier } from './google.js'

const CLIENT_ID = 'teste.apps.googleusercontent.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const outra = generateKeyPairSync('rsa', { modulusLength: 2048 })
const agora = Date.parse('2026-11-23T12:00:00Z')

// Token como o do Google (JWT RS256)
function token(dados = {}, { kid = 'k1', chave = privateKey } = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const cabecalho = b64({ alg: 'RS256', kid, typ: 'JWT' })
  const corpo = b64({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'Nadadora@Gmail.com',
    email_verified: true, name: 'Nadadora Teste', iat: agora / 1000 - 10, exp: agora / 1000 + 3600, ...dados,
  })
  const assinatura = sign('RSA-SHA256', Buffer.from(`${cabecalho}.${corpo}`), chave).toString('base64url')
  return `${cabecalho}.${corpo}.${assinatura}`
}
const verificar = createGoogleVerifier({ clientId: CLIENT_ID, chave: async (kid) => (kid === 'k1' ? publicKey : null), agora: () => agora })

test('Google: confere assinatura, para quem é, quem emitiu, validade e email verificado', async () => {
  assert.deepEqual(await verificar(token()), { sub: '1234567890', email: 'nadadora@gmail.com', name: 'Nadadora Teste' })
  assert.equal(await verificar(token({ aud: 'outro-app' })), null)
  assert.equal(await verificar(token({ iss: 'https://falso.com' })), null)
  assert.equal(await verificar(token({ exp: agora / 1000 - 1 })), null)
  assert.equal(await verificar(token({ email_verified: false })), null)
  assert.equal(await verificar(token({}, { chave: outra.privateKey })), null) // assinatura de outra chave
  assert.equal(await verificar(token({}, { kid: 'desconhecida' })), null)
  assert.equal(await verificar('lixo'), null)
  // Token alterado depois de assinado
  const [c, , s] = token().split('.')
  const corpoFalso = Buffer.from(JSON.stringify({ iss: 'accounts.google.com', aud: CLIENT_ID, sub: 'x', email: 'a@b.com', email_verified: true, exp: agora / 1000 + 99 })).toString('base64url')
  assert.equal(await verificar(`${c}.${corpoFalso}.${s}`), null)
})

let app
let base
let dir
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'newave-google-'))
  app = createApp({ dbPath: join(dir, 'test.db'), mailer: { send: async () => {} }, googleClientId: CLIENT_ID, verifyGoogle: verificar })
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
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : null, cookie: r.headers.getSetCookie()[0]?.split(';')[0] }
}

test('Google: o front recebe o client ID para mostrar o botão', async () => {
  assert.deepEqual((await api('/api/auth/config')).body, { googleClientId: CLIENT_ID })
})

test('Google: conta nova na hora, sem senha (pode criar uma); entrar de novo usa a mesma conta', async () => {
  const primeira = await api('/api/auth/google', { method: 'POST', body: { credential: token() } })
  assert.equal(primeira.status, 200)
  assert.equal(primeira.body.user.email, 'nadadora@gmail.com')
  assert.equal(primeira.body.user.name, 'Nadadora Teste')
  const conta = (await api('/api/account', { cookie: primeira.cookie })).body.account
  assert.equal(conta.hasPassword, false)
  assert.equal(conta.google, true)
  // De novo: a mesma conta
  const segunda = await api('/api/auth/google', { method: 'POST', body: { credential: token() } })
  assert.equal(segunda.body.user.id, primeira.body.user.id)
  // Cria a senha sem pedir a atual; depois entra com email e senha também
  assert.equal((await api('/api/account/password', { method: 'POST', cookie: segunda.cookie, body: { newPassword: 'senha-nova-123' } })).status, 200)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'nadadora@gmail.com', password: 'senha-nova-123' } })).status, 200)
})

test('Google: email que já tem conta no app é ligado à conta Google', async () => {
  await api('/api/auth/register', { method: 'POST', body: { name: 'Ana Prado', email: 'ana@gmail.com', password: 'senha-forte-123' } })
  const r = await api('/api/auth/google', { method: 'POST', body: { credential: token({ sub: '999', email: 'ana@gmail.com', name: 'Ana P.' }) } })
  assert.equal(r.status, 200)
  assert.equal(r.body.user.name, 'Ana Prado') // a conta que já existia
  const conta = (await api('/api/account', { cookie: r.cookie })).body.account
  assert.equal(conta.hasPassword, true)
  assert.equal(conta.google, true)
})

test('Google: token inválido não entra; conta só do Google exclui escrevendo EXCLUIR', async () => {
  assert.equal((await api('/api/auth/google', { method: 'POST', body: { credential: token({ aud: 'outro' }) } })).status, 401)
  const r = await api('/api/auth/google', { method: 'POST', body: { credential: token({ sub: '555', email: 'sosenha@gmail.com' }) } })
  assert.equal((await api('/api/account', { method: 'DELETE', cookie: r.cookie, body: { confirm: 'nao' } })).status, 400)
  assert.equal((await api('/api/account', { method: 'DELETE', cookie: r.cookie, body: { confirm: 'EXCLUIR' } })).status, 204)
  assert.equal((await api('/api/auth/me', { cookie: r.cookie })).status, 401)
})

test('Google: sem client ID configurado, o botão não aparece e a rota não existe', async () => {
  const d = mkdtempSync(join(tmpdir(), 'newave-sem-google-'))
  const semGoogle = createApp({ dbPath: join(d, 'test.db'), mailer: { send: async () => {} } })
  await new Promise((resolve) => semGoogle.server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${semGoogle.server.address().port}`
  assert.deepEqual(await (await fetch(url + '/api/auth/config')).json(), { googleClientId: null })
  assert.equal((await fetch(url + '/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404)
  await semGoogle.close()
  rmSync(d, { recursive: true, force: true })
})

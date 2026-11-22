import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { computeLevel } from './athlete.js'

let app
let base
let dir

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'newave-athlete-'))
  app = createApp({ dbPath: join(dir, 'test.db'), mailer: { send: async () => {} } })
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

// O servidor limita 10 cadastros por hora por IP, então os testes que não
// atrapalham uns aos outros usam o mesmo usuário (criado na primeira vez).
const users = {}
const userFor = async (key) => (users[key] ??= await newUser())

let counter = 0
async function newUser() {
  counter += 1
  const email = `atleta${counter}@example.com`
  const password = 'senha-forte-123'
  await api('/api/auth/register', { method: 'POST', body: { name: `Atleta ${counter}`, email, password } })
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return login.setCookie.split(';')[0]
}

const daysFromToday = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

const sampleProfile = {
  swimmingSince: '2a_5a',
  recentBreak: 'nao',
  continuousDistance: '1000_2000',
  strokes: ['peito', 'crawl'],
  trainingDays: [5, 1, 3],
  sessionMinutes: 60,
  poolLength: 25,
  equipment: ['palmar', 'pe_de_pato', 'pe_de_pato_peito', 'paraquedas'],
  injuries: '  Dor no ombro direito  ',
  reported400Hundredths: null,
  bestStroke: 'peito',
}

const saveProfile = (cookie, body = sampleProfile) =>
  api('/api/athlete-profile', { method: 'PUT', body, cookie })

const sampleCompetition = {
  name: 'Troféu Estadual',
  date: daysFromToday(60),
  modality: 'piscina_50',
  event: '200 m livre',
}

// ---------- Acesso ----------

test('sem login, nenhuma rota da anamnese funciona', async () => {
  const calls = [
    ['GET', '/api/athlete-profile'],
    ['PUT', '/api/athlete-profile', sampleProfile],
    ['GET', '/api/competitions'],
    ['POST', '/api/competitions', sampleCompetition],
    ['GET', '/api/preparations/current'],
    ['POST', '/api/preparations', { goal: 'saude' }],
  ]
  for (const [method, path, body] of calls) {
    const res = await api(path, { method, body })
    assert.equal(res.status, 401, `${method} ${path}`)
  }
})

// ---------- Anamnese ----------

test('antes de responder, a anamnese vem vazia', async () => {
  const cookie = await userFor('semAnamnese')
  const res = await api('/api/athlete-profile', { cookie })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { profile: null, time400: null, level: null, tempos: null })
})

test('salva a anamnese, organiza as listas e calcula o nível', async () => {
  const cookie = await userFor('anamnese')
  const res = await saveProfile(cookie)
  assert.equal(res.status, 200)
  const { profile, level } = res.body
  assert.deepEqual(profile.strokes, ['crawl', 'peito']) // na ordem das opções
  assert.deepEqual(profile.trainingDays, [1, 3, 5])
  assert.equal(profile.injuries, 'Dor no ombro direito')
  assert.equal(profile.bestStroke, 'peito')
  assert.deepEqual(profile.equipment, ['pe_de_pato', 'pe_de_pato_peito', 'palmar', 'paraquedas'])
  assert.equal(level.level, 'avancado')
  assert.equal(level.returning, false)

  // Fica guardada: na próxima vez não precisa responder de novo
  const again = await api('/api/athlete-profile', { cookie })
  assert.deepEqual(again.body.profile, profile)
})

test('quem só nada crawl não tem melhor estilo', async () => {
  const cookie = await userFor('anamnese')
  const res = await saveProfile(cookie, { ...sampleProfile, strokes: ['crawl'], bestStroke: null })
  assert.equal(res.status, 200)
  assert.equal(res.body.profile.bestStroke, null)
})

test('atualizar a anamnese troca as respostas', async () => {
  const cookie = await userFor('anamnese')
  await saveProfile(cookie)
  const res = await saveProfile(cookie, { ...sampleProfile, poolLength: 50, injuries: '', sessionMinutes: 40 })
  assert.equal(res.body.profile.poolLength, 50)
  assert.equal(res.body.profile.sessionMinutes, 40) // aula de 40 minutos
  assert.equal(res.body.profile.injuries, '')
})

test('valida as respostas da anamnese', async () => {
  const cookie = await userFor('anamnese')
  const invalid = [
    { swimmingSince: 'sempre' },
    { recentBreak: undefined },
    { continuousDistance: '5000' },
    { continuousDistance: 'ate_25' },
    { continuousDistance: '100_400' }, // faixa antiga
    { strokes: [] },
    { strokes: ['crawl', 'golfinho'] },
    { trainingDays: [] },
    { trainingDays: [7] },
    { sessionMinutes: 50 },
    { sessionMinutes: 35 },
    { poolLength: 33 },
    { equipment: ['nadadeira'] },
    { injuries: 'x'.repeat(501) },
    { reported400Hundredths: 1000 },
    { reported400Hundredths: 33245.5 },
    { bestStroke: 'costas' }, // não marcou costas
    { bestStroke: 'crawl' },
    { bestStroke: undefined }, // nada peito: precisa escolher
    { strokes: ['crawl'], bestStroke: 'peito' }, // só crawl: não tem melhor estilo
  ]
  for (const change of invalid) {
    const res = await saveProfile(cookie, { ...sampleProfile, ...change })
    assert.equal(res.status, 400, JSON.stringify(change))
  }
})

test('o tempo nos 400 m vem do último teste; sem teste, do tempo informado', async () => {
  const cookie = await userFor('tempo400')
  const informed = await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 40000 })
  assert.deepEqual(informed.body.time400, { hundredths: 40000, source: 'informado', date: null })

  await api('/api/tests', {
    method: 'POST',
    cookie,
    body: { distance: 400, timeHundredths: 33245, date: daysFromToday(-3) },
  })
  const res = await api('/api/athlete-profile', { cookie })
  assert.equal(res.body.time400.source, 'teste')
  assert.equal(res.body.time400.hundredths, 33245)
  // A tabela de tempos vem calculada pelo teste: A1 do 100 = teste ÷ 4
  assert.deepEqual(res.body.tempos['100'].A1, [83.1125, 83.1125])
})

test('cálculo do nível', () => {
  const base = { swimmingSince: 'mais_5a', recentBreak: 'nao', continuousDistance: 'mais_2000' }
  const fast = { hundredths: 4 * 6000 }
  const slow = { hundredths: 10 * 6000 }

  assert.equal(computeLevel(base, fast).level, 'avancado')
  assert.equal(computeLevel({ ...base, swimmingSince: 'menos_6m', continuousDistance: '200_400' }, slow).level, 'iniciante')
  // Quem nada até 100 m sem parar (ou só 50 m) é sempre iniciante
  assert.equal(computeLevel({ ...base, continuousDistance: '50_100' }, fast).level, 'iniciante')
  assert.equal(computeLevel({ ...base, continuousDistance: 'ate_50' }, fast).level, 'iniciante')
  // De 100 a 400 m sem parar: no máximo intermediário
  assert.equal(computeLevel({ ...base, continuousDistance: '100_200' }, fast).level, 'intermediario')
  assert.equal(computeLevel({ ...base, continuousDistance: '200_400' }, fast).level, 'intermediario')
  // Parado há mais de 6 meses: um nível abaixo, em readaptação
  assert.deepEqual(computeLevel({ ...base, recentBreak: 'mais_6m' }, fast), {
    level: 'intermediario',
    returning: true,
    recemIntermediario: false, // caiu de avançado: não é recém intermediário
  })
  // Recém intermediário: na metade de baixo da faixa do intermediário
  const recem = computeLevel({ swimmingSince: '6m_2a', recentBreak: 'nao', continuousDistance: '200_400' }, { hundredths: 8 * 6000 })
  assert.equal(recem.level, 'intermediario')
  assert.equal(recem.recemIntermediario, true)
  const bom = computeLevel({ swimmingSince: 'mais_5a', recentBreak: 'nao', continuousDistance: '400_1000' }, { hundredths: 7 * 6000 })
  assert.equal(bom.level, 'intermediario')
  assert.equal(bom.recemIntermediario, false)
})

// ---------- Competições ----------

test('cadastra competição e lista só as próximas, da mais próxima', async () => {
  const cookie = await userFor('competicoes')
  const created = await api('/api/competitions', { method: 'POST', cookie, body: sampleCompetition })
  assert.equal(created.status, 201)
  assert.equal(created.body.competition.priority, 'A')

  await api('/api/competitions', {
    method: 'POST',
    cookie,
    body: { ...sampleCompetition, name: 'Torneio de teste', date: daysFromToday(20), priority: 'C' },
  })

  const res = await api(`/api/competitions?today=${daysFromToday(0)}`, { cookie })
  assert.deepEqual(res.body.competitions.map((c) => c.name), ['Torneio de teste', 'Troféu Estadual'])
  // No dia seguinte à competição de daqui a 20 dias, ela some da lista
  const later = await api(`/api/competitions?today=${daysFromToday(21)}`, { cookie })
  assert.deepEqual(later.body.competitions.map((c) => c.name), ['Troféu Estadual'])
})

test('valida a competição', async () => {
  const cookie = await userFor('competicoes')
  const invalid = [
    { name: 'x' },
    { date: daysFromToday(-10) },
    { date: daysFromToday(800) },
    { date: '2026-02-30' },
    { modality: 'corrida' },
    { event: 'x'.repeat(101) },
    { priority: 'D' },
  ]
  for (const change of invalid) {
    const res = await api('/api/competitions', { method: 'POST', cookie, body: { ...sampleCompetition, ...change } })
    assert.equal(res.status, 400, JSON.stringify(change))
  }
})

// ---------- Preparação (prova alvo) ----------

test('não deixa gerar treinos sem responder a anamnese', async () => {
  const cookie = await userFor('semAnamnese')
  const res = await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  assert.equal(res.status, 409)
})

test('preparação com prova nova: a prova entra no calendário como alvo', async () => {
  const cookie = await userFor('provaNova')
  await saveProfile(cookie)
  const res = await api('/api/preparations', {
    method: 'POST',
    cookie,
    body: { goal: 'competir', competition: { ...sampleCompetition, priority: 'C' } },
  })
  assert.equal(res.status, 201)
  const { preparation } = res.body
  assert.equal(preparation.goal, 'competir')
  assert.equal(preparation.competition.name, 'Troféu Estadual')
  assert.equal(preparation.competition.priority, 'A') // prova alvo é sempre A
  assert.equal(preparation.active, true)

  const calendar = await api('/api/competitions', { cookie })
  assert.equal(calendar.body.competitions.length, 1)
})

test('preparação com prova do calendário: ela vira prioridade A', async () => {
  const cookie = await userFor('preparacao')
  await saveProfile(cookie)
  const { body } = await api('/api/competitions', {
    method: 'POST',
    cookie,
    body: { ...sampleCompetition, priority: 'B', modality: 'triatlo' },
  })
  const res = await api('/api/preparations', {
    method: 'POST',
    cookie,
    body: { goal: 'competir', competitionId: body.competition.id },
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.preparation.competition.priority, 'A')

  const current = await api('/api/preparations/current', { cookie })
  assert.equal(current.body.preparation.competition.modality, 'triatlo')
})

test('a cada geração a prova alvo pode mudar: a atual é a mais recente', async () => {
  const cookie = await userFor('preparacao')
  await saveProfile(cookie)
  await api('/api/preparations', {
    method: 'POST',
    cookie,
    body: { goal: 'competir', competition: { ...sampleCompetition, modality: 'triatlo', name: 'Triatlo' } },
  })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'condicionamento' } })

  const current = await api('/api/preparations/current', { cookie })
  assert.equal(current.body.preparation.goal, 'condicionamento')
  assert.equal(current.body.preparation.competition, null)
  assert.equal(current.body.preparation.active, true)
})

test('preparação deixa de valer depois que a prova alvo passa', async () => {
  const cookie = await userFor('preparacao')
  await saveProfile(cookie)
  await api('/api/preparations', {
    method: 'POST',
    cookie,
    body: { goal: 'competir', competition: { ...sampleCompetition, date: daysFromToday(10) } },
  })
  const res = await api(`/api/preparations/current?today=${daysFromToday(11)}`, { cookie })
  assert.equal(res.body.preparation.active, false)
})

test('valida a preparação', async () => {
  const cookie = await userFor('validaPreparacao')
  const other = await userFor('outraPessoa')
  await saveProfile(cookie)
  const { body } = await api('/api/competitions', { method: 'POST', cookie: other, body: sampleCompetition })

  const cases = [
    [{ goal: 'ganhar' }, 400],
    [{ goal: 'competir' }, 400], // sem prova
    [{ goal: 'competir', competitionId: 'abc' }, 400],
    [{ goal: 'competir', competitionId: body.competition.id }, 404], // prova de outra pessoa
    [{ goal: 'saude', competition: sampleCompetition }, 400],
    [{ goal: 'competir', competition: { ...sampleCompetition, modality: 'corrida' } }, 400],
  ]
  for (const [payload, status] of cases) {
    const res = await api('/api/preparations', { method: 'POST', cookie, body: payload })
    assert.equal(res.status, status, JSON.stringify(payload))
  }
  // Nenhuma tentativa inválida deixou preparação ou competição pela metade
  const current = await api('/api/preparations/current', { cookie })
  assert.equal(current.body.preparation, null)
  const calendar = await api('/api/competitions', { cookie })
  assert.deepEqual(calendar.body.competitions, [])
})

// ---------- Feedback e plano interno ----------

test('gerar treinos guarda o plano interno (o atleta não recebe) e o feedback entra no próximo', async () => {
  const cookie = await userFor('feedback')
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  const hoje = daysFromToday(0)
  const gerado = await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  assert.equal(gerado.status, 201)
  assert.ok(gerado.body.trainings.length > 0)
  assert.ok(gerado.body.trainings.every((t) => t.plano === undefined), 'o plano não vai para o atleta')

  const proximos = await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })
  const primeiro = proximos.body.trainings[0]
  assert.equal(JSON.stringify(primeiro).includes('esforcoEsperado'), false)
  const feito = await api(`/api/trainings/${primeiro.id}/complete`, {
    method: 'POST', cookie, body: { difficulty: 10, reason: 'forca' },
  })
  assert.equal(feito.status, 200)

  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  const linha = db.prepare('SELECT difficulty, difficulty_reason, plan FROM trainings WHERE id = ?').get(primeiro.id)
  assert.equal(linha.difficulty, 10)
  assert.equal(linha.difficulty_reason, 'forca')
  const plano = JSON.parse(linha.plan)
  assert.ok(plano.esforcoEsperado >= 4)

  // Gerando de novo: o feedback (10, bem acima do esperado) diminui a principal e foca na força
  const amanha = daysFromToday(1)
  await api(`/api/trainings/generate?today=${amanha}`, { method: 'POST', cookie })
  const novos = db.prepare('SELECT plan FROM trainings WHERE completed_at IS NULL AND date >= ? AND plan IS NOT NULL').all(amanha)
  db.close()
  assert.ok(novos.length > 0)
  for (const { plan } of novos) {
    const p = JSON.parse(plan)
    assert.equal(p.carga, -1)
    assert.equal(p.foco, 'forca')
    assert.ok(p.fatorPrincipal < plano.fatorPrincipal)
  }
})

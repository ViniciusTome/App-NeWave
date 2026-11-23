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
  // O tempo da anamnese também entra na evolução dos tempos (com a data de hoje)
  assert.deepEqual(informed.body.time400, { hundredths: 40000, source: 'informado', date: daysFromToday(0) })
  const evolucao = (await api('/api/tests', { cookie })).body.tests
  assert.deepEqual(evolucao.map((t) => [t.distance, t.timeHundredths, t.origin]), [[400, 40000, 'anamnese']])

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
    nivelAntesDaParada: 'avancado', // para a adaptação da borboleta
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
  // Sem escolher, a prova entra como C (não muda o treino)
  assert.equal(created.body.competition.priority, 'C')

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

test('3 treinos seguidos pesados refazem os próximos; o plano interno fica só no banco', async () => {
  const cookie = await userFor('feedback')
  // Nada só até 100 m: tudo em ritmo leve (esforço esperado 4)
  await saveProfile(cookie, { ...sampleProfile, continuousDistance: '50_100', reported400Hundredths: 36000 })
  const hoje = daysFromToday(0)
  const gerado = await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  assert.equal(gerado.status, 201)
  assert.ok(gerado.body.trainings.length > 3)
  assert.ok(gerado.body.trainings.every((t) => t.plano === undefined), 'o plano não vai para o atleta')

  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  const proximos = await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })
  assert.equal(JSON.stringify(proximos.body.trainings).includes('esforcoEsperado'), false)

  // 1º e 2º pesados: nada muda (pode ser o dia do atleta)
  const [t1, t2, t3] = proximos.body.trainings
  for (const t of [t1, t2]) {
    const res = await api(`/api/trainings/${t.id}/complete`, { method: 'POST', cookie, body: { difficulty: 9, reason: 'forca' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.reformulados, 0)
  }
  // 3º seguido: os próximos são refeitos, com menos tempo na principal e foco na força
  const antes = JSON.parse(db.prepare('SELECT plan FROM trainings WHERE id = ?').get(t3.id).plan)
  const terceiro = await api(`/api/trainings/${t3.id}/complete`, { method: 'POST', cookie, body: { difficulty: 10, reason: 'forca' } })
  assert.ok(terceiro.body.reformulados > 0)
  const linha = db.prepare('SELECT difficulty, difficulty_reason FROM trainings WHERE id = ?').get(t3.id)
  assert.deepEqual([linha.difficulty, linha.difficulty_reason], [10, 'forca'])
  const novos = db.prepare('SELECT plan FROM trainings WHERE completed_at IS NULL AND plan IS NOT NULL AND date >= ? ORDER BY date')
    .all(hoje).map((r) => JSON.parse(r.plan))
  assert.ok(novos.length > 0)
  // O próximo começa com menos tempo na principal (depois volta a subir devagar, no condicionamento)
  assert.ok(novos[0].fatorPrincipal < antes.fatorPrincipal, `${novos[0].fatorPrincipal} >= ${antes.fatorPrincipal}`)
  for (const p of novos) {
    assert.equal(p.carga, -1)
    assert.equal(p.foco, 'forca')
    assert.ok(['acumulacao', 'transicao', 'recuperacao', 'realizacao'].includes(p.fase))
  }
  // Concluir mais um (bem) não refaz de novo pelos mesmos 3
  const [t4] = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  const quarto = await api(`/api/trainings/${t4.id}/complete`, { method: 'POST', cookie, body: { difficulty: 4 } })
  assert.equal(quarto.body.reformulados, 0)
  db.close()
})

test('periodização: com prova alvo, vai até a prova; o teste na Transição depende do tempo', async () => {
  const cookie = await userFor('periodizacao')
  const hoje = daysFromToday(0)
  const prova = daysFromToday(60)
  // Só informou o tempo: na 1ª geração não tem teste
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  const competition = { name: 'Copa', date: prova, modality: 'piscina_25', event: '200 m livre' }
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competition } })
  const primeira = await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const datas = primeira.body.trainings.map((t) => t.date)
  assert.ok(datas.at(-1) <= prova && datas.at(-1) > daysFromToday(50), datas.at(-1))
  const temTeste = (res) => res.body.trainings.some((t) => t.partes.some((p) => p.parte === 'teste'))
  assert.equal(temTeste(primeira), false)
  // 2ª geração: o teste entra no começo da Transição
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competition: { ...competition, name: 'Copa 2' } } })
  assert.equal(temTeste(await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })), true)
  // Prova de 400 m em piscina: o teste é a própria prova
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competition: { ...competition, name: 'Copa 3', event: '400 m livre' } } })
  assert.equal(temTeste(await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })), false)
})

test('muda a prioridade de uma prova do calendário', async () => {
  // (o servidor limita os cadastros por hora: usa usuários dos outros testes)
  const cookie = await userFor('feedback')
  const outro = await userFor('periodizacao')
  const { body } = await api('/api/competitions', { method: 'POST', cookie, body: { ...sampleCompetition, name: 'Torneio' } })
  const id = body.competition.id
  const res = await api(`/api/competitions/${id}`, { method: 'PATCH', cookie, body: { priority: 'B' } })
  assert.equal(res.status, 200)
  assert.equal(res.body.competition.priority, 'B')
  assert.equal((await api(`/api/competitions/${id}`, { method: 'PATCH', cookie, body: { priority: 'D' } })).status, 400)
  // A prova de outra pessoa não muda
  assert.equal((await api(`/api/competitions/${id}`, { method: 'PATCH', cookie: outro, body: { priority: 'B' } })).status, 404)
  // Principal (A) é só a prova alvo: não dá para marcar nem cadastrar como A
  assert.equal((await api(`/api/competitions/${id}`, { method: 'PATCH', cookie, body: { priority: 'A' } })).status, 400)
  assert.equal((await api('/api/competitions', { method: 'POST', cookie, body: { ...sampleCompetition, priority: 'A' } })).status, 400)
  // Remove do calendário
  assert.equal((await api(`/api/competitions/${id}`, { method: 'DELETE', cookie: outro })).status, 404)
  assert.equal((await api(`/api/competitions/${id}`, { method: 'DELETE', cookie })).status, 200)
  assert.equal((await api(`/api/competitions/${id}`, { method: 'DELETE', cookie })).status, 404)
})

test('só uma prova é a principal: a prova alvo', async () => {
  const cookie = await userFor('feedback')
  const nova = (name, date) => api('/api/competitions', { method: 'POST', cookie, body: { ...sampleCompetition, name, date } })
  const a = (await nova('Prova 1', daysFromToday(30))).body.competition
  const b = (await nova('Prova 2', daysFromToday(50))).body.competition
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: a.id } })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: b.id } })
  const lista = (await api(`/api/competitions?today=${daysFromToday(0)}`, { cookie })).body.competitions
  const prioridade = (id) => lista.find((c) => c.id === id).priority
  // A nova alvo é a principal; a anterior vira importante
  assert.equal(prioridade(b.id), 'A')
  assert.equal(prioridade(a.id), 'B')
  assert.equal(lista.filter((c) => c.priority === 'A').length, 1)
  // A prova alvo não muda nem sai pelo calendário
  assert.equal((await api(`/api/competitions/${b.id}`, { method: 'PATCH', cookie, body: { priority: 'C' } })).status, 409)
  assert.equal((await api(`/api/competitions/${b.id}`, { method: 'DELETE', cookie })).status, 409)
  // Sem prova alvo: nenhuma é a principal
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const depois = (await api(`/api/competitions?today=${daysFromToday(0)}`, { cookie })).body.competitions
  assert.equal(depois.filter((c) => c.priority === 'A').length, 0)
})

test('sem prova (condicionamento ou saúde): periodização padrão A-T-R', async () => {
  const cookie = await userFor('periodizacao')
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  const { user } = (await api('/api/auth/me', { cookie })).body
  const etapas = db.prepare(`
    SELECT plan FROM trainings WHERE user_id = ? AND plan IS NOT NULL AND completed_at IS NULL ORDER BY date
  `).all(user.id).map((r) => JSON.parse(r.plan).etapa)
  db.close()
  assert.deepEqual([...new Set(etapas)], ['acumulacao1', 'transicao1', 'realizacao'])
})

test('trocar a prova alvo refaz a periodização para o tempo que falta', async () => {
  const cookie = await userFor('periodizacao')
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  const hoje = daysFromToday(0)
  const nova = async (name, dias) => (await api('/api/competitions', {
    method: 'POST', cookie, body: { ...sampleCompetition, name, date: daysFromToday(dias) },
  })).body.competition
  const longe = await nova('Longe', 100)
  const perto = await nova('Perto', 40)
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: longe.id } })
  const antes = (await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })).body.trainings
  assert.ok(antes.at(-1).date > daysFromToday(90))
  // Troca para a prova mais perto: a periodização vai só até ela
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: perto.id } })
  const depois = (await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })).body.trainings
  assert.ok(depois.at(-1).date <= perto.date && depois.at(-1).date > daysFromToday(30))
  const proximos = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  assert.ok(proximos.every((t) => t.date <= perto.date))
  // A antiga alvo vira importante; a nova é a única principal
  const lista = (await api(`/api/competitions?today=${hoje}`, { cookie })).body.competitions
  assert.equal(lista.find((c) => c.id === longe.id).priority, 'B')
  assert.equal(lista.find((c) => c.id === perto.id).priority, 'A')
})

test('registrar o teste de 400 m coloca os tempos (cd) nos treinos já montados, sem mudar as séries', async () => {
  const cookie = await userFor('feedback')
  // Sem tempo nenhum: o card mostra o descanso e o ritmo por extenso
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: null })
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  const { user } = (await api('/api/auth/me', { cookie })).body
  db.prepare('DELETE FROM tests WHERE user_id = ?').run(user.id)
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const antes = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  // (o dia do teste não tem série principal)
  const principal = (t) => t.partes.find((p) => p.parte === 'principal') ?? { texto: '' }
  assert.ok(antes.every((t) => !/a\/c \d/.test(principal(t).texto)), 'sem tempo não tem cd')
  assert.ok(antes.some((t) => /de descanso/.test(principal(t).texto)))

  // Registra o teste de 400 m
  const teste = await api('/api/tests', { method: 'POST', cookie, body: { distance: 400, timeHundredths: 36000, date: hoje } })
  assert.equal(teste.status, 201)
  assert.ok(teste.body.treinosAtualizados > 0)
  const depois = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  // As mesmas séries, nos mesmos dias...
  assert.deepEqual(depois.map((t) => [t.date, t.partes.map((p) => p.serieId)]), antes.map((t) => [t.date, t.partes.map((p) => p.serieId)]))
  // ... agora com o cd e sem o ritmo por extenso
  assert.ok(depois.some((t) => /a\/c \d/.test(principal(t).texto)))
  assert.ok(depois.every((t) => !/ritmo (leve|moderado|forte)/.test(principal(t).texto)))
  // Os campos antigos (histórico) também
  const linha = db.prepare('SELECT main_series FROM trainings WHERE id = ?').get(depois[0].id)
  assert.equal(linha.main_series.includes('ritmo leve'), false)
  db.close()
})

test('tempo novo com teste planejado: pergunta se vai fazer; sem tempos de novo, volta ao planejamento sem tempos', async () => {
  const cookie = await userFor('periodizacao')
  const { user } = (await api('/api/auth/me', { cookie })).body
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  db.prepare('DELETE FROM tests WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM trainings WHERE user_id = ?').run(user.id)
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: null })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const proximos = async () => (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  const diaDoTeste = (ts) => ts.find((t) => t.partes.some((p) => p.parte === 'teste'))
  const teste = diaDoTeste(await proximos())
  assert.ok(teste, 'sem tempo: teste depois de 1 mês')

  // Registra um tempo: os treinos ganham o cd e o app pergunta do teste planejado
  const registrar = () => api('/api/tests', { method: 'POST', cookie, body: { distance: 400, timeHundredths: 36000, date: hoje } })
  const r1 = await registrar()
  assert.deepEqual(r1.body.testePlanejado, { id: teste.id, date: teste.date })
  // "Não vou fazer": no lugar entra um treino normal
  const nao = await api(`/api/trainings/${teste.id}/planned-test`, { method: 'POST', cookie, body: { fazer: false } })
  assert.equal(nao.status, 200)
  const semTeste = await proximos()
  assert.equal(diaDoTeste(semTeste), undefined)
  const trocado = semTeste.find((t) => t.date === teste.date)
  assert.ok(trocado.partes.some((p) => p.parte === 'principal'))
  assert.match(trocado.partes.find((p) => p.parte === 'principal').texto, /a\/c \d|A1|A2|A3/)

  // Apaga o tempo: a evolução fica vazia e volta o planejamento sem tempos (com o teste)
  const { tests } = (await api('/api/tests', { cookie })).body
  for (const t of tests) await api(`/api/tests/${t.id}`, { method: 'DELETE', cookie })
  const deNovo = await proximos()
  assert.ok(diaDoTeste(deNovo), 'o teste volta')
  assert.ok(deNovo.every((t) => !/a\/c \d/.test(t.partes.find((p) => p.parte === 'principal')?.texto ?? '')))

  // Registra de novo e diz que vai fazer: o teste fica e não pergunta mais
  const r2 = await registrar()
  assert.ok(r2.body.testePlanejado)
  const sim = await api(`/api/trainings/${r2.body.testePlanejado.id}/planned-test`, { method: 'POST', cookie, body: { fazer: true } })
  assert.equal(sim.body.mantido, true)
  assert.ok(diaDoTeste(await proximos()))
  assert.equal((await registrar()).body.testePlanejado, null)
  // Resposta inválida
  assert.equal((await api(`/api/trainings/${r2.body.testePlanejado.id}/planned-test`, { method: 'POST', cookie, body: {} })).status, 400)
  db.close()
})

// ---------- Treinos sem resposta e faltas ----------

test('treinos que passaram sem resposta: a lista, a falta e o "fiz"', async () => {
  const cookie = await userFor('feedback')
  const { user } = (await api('/api/auth/me', { cookie })).body
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  db.prepare('DELETE FROM trainings WHERE user_id = ?').run(user.id)
  await saveProfile(cookie, { ...sampleProfile, continuousDistance: '200_400', trainingDays: [1, 3, 5], reported400Hundredths: 42000 })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  // Treinos montados há 3 semanas: os que passaram ficam sem resposta
  await api(`/api/trainings/generate?today=${daysFromToday(-21)}`, { method: 'POST', cookie })
  const pendentes = (await api(`/api/trainings/pending?today=${hoje}`, { cookie })).body.trainings
  assert.ok(pendentes.length >= 8)
  assert.ok(pendentes.every((t) => t.date < hoje && !t.completed && !t.missed))
  // "Fiz" no primeiro (concluir funciona para treino que passou)
  const fiz = await api(`/api/trainings/${pendentes[0].id}/complete`, { method: 'POST', cookie, body: { difficulty: 5 } })
  assert.equal(fiz.status, 200)
  // Faltas seguidas: até 3 nada muda; a 4ª deixa os próximos 2 treinos mais leves
  const faltas = []
  for (const t of pendentes.slice(-4)) {
    faltas.push((await api(`/api/trainings/${t.id}/missed?today=${hoje}`, { method: 'POST', cookie })).body)
  }
  assert.deepEqual(faltas.map((f) => f.maisLeves), [0, 0, 0, 2])
  assert.ok(faltas.every((f) => f.training.missed))
  const planos = db.prepare(`SELECT plan FROM trainings WHERE user_id = ? AND date >= ? ORDER BY date`).all(user.id, hoje)
    .map((r) => JSON.parse(r.plan))
  assert.ok(planos[0].maisLeve && planos[1].maisLeve && !planos[2].maisLeve)
  assert.ok(planos.slice(0, 2).every((p) => p.intensidade !== 'A3'))
  // Não lista mais os respondidos; não deixa marcar falta em treino de hoje em diante
  const depois = (await api(`/api/trainings/pending?today=${hoje}`, { cookie })).body.trainings
  assert.equal(depois.length, pendentes.length - 5)
  const [proximo] = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  assert.equal((await api(`/api/trainings/${proximo.id}/missed?today=${hoje}`, { method: 'POST', cookie })).status, 409)
  db.close()
})

test('avançado que treina pouco: 3 dias ou mais sem treinar deixam o 1º treino da volta mais leve', async () => {
  const cookie = await userFor('periodizacao')
  const { user } = (await api('/api/auth/me', { cookie })).body
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  db.prepare('DELETE FROM trainings WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM tests WHERE user_id = ?').run(user.id)
  await saveProfile(cookie, {
    ...sampleProfile, swimmingSince: 'mais_5a', continuousDistance: 'mais_2000', trainingDays: [1, 3, 5], reported400Hundredths: 30000,
  })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${daysFromToday(-10)}`, { method: 'POST', cookie })
  const [ultimo] = (await api(`/api/trainings/pending?today=${hoje}`, { cookie })).body.trainings.slice(-1)
  const falta = await api(`/api/trainings/${ultimo.id}/missed?today=${hoje}`, { method: 'POST', cookie })
  assert.equal(falta.body.maisLeves, 1)
  const planos = db.prepare('SELECT plan FROM trainings WHERE user_id = ? AND date >= ? ORDER BY date').all(user.id, hoje)
    .map((r) => JSON.parse(r.plan))
  assert.ok(planos[0].maisLeve && !planos[1].maisLeve)
  db.close()
})

test('remarcar o teste: vai para o dia que o atleta escolher', async () => {
  const cookie = await userFor('periodizacao')
  const { user } = (await api('/api/auth/me', { cookie })).body
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  db.prepare('DELETE FROM tests WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM trainings WHERE user_id = ?').run(user.id)
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: null })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const proximos = async () => (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
  const ehTeste = (t) => t.partes.some((p) => p.parte === 'teste')
  const lista = await proximos()
  const teste = lista.find(ehTeste)
  const depois = lista.filter((t) => t.date > teste.date)
  // Para um dia com treino: os dois trocam de dia
  const r1 = await api(`/api/trainings/${teste.id}/reschedule-test?today=${hoje}`, { method: 'POST', cookie, body: { date: depois[1].date } })
  assert.equal(r1.status, 200)
  assert.equal(r1.body.trocado, true)
  let agora = await proximos()
  assert.ok(ehTeste(agora.find((t) => t.date === depois[1].date)))
  assert.ok(!ehTeste(agora.find((t) => t.date === teste.date)))
  // O número do treino segue o dia
  assert.equal(agora.find((t) => t.date === depois[1].date).title, depois[1].title)
  // Para um dia sem treino: o teste só muda de data
  const novoTeste = agora.find(ehTeste)
  const livre = (() => {
    const datas = new Set(agora.map((t) => t.date))
    for (let d = 1; d < 60; d++) { const x = daysFromToday(d); if (x > novoTeste.date && !datas.has(x)) return x }
  })()
  const r2 = await api(`/api/trainings/${novoTeste.id}/reschedule-test?today=${hoje}`, { method: 'POST', cookie, body: { date: livre } })
  assert.equal(r2.body.trocado, false)
  agora = await proximos()
  assert.ok(ehTeste(agora.find((t) => t.date === livre)))
  // Dia que já passou ou o mesmo dia: não
  assert.equal((await api(`/api/trainings/${novoTeste.id}/reschedule-test?today=${hoje}`, { method: 'POST', cookie, body: { date: daysFromToday(-1) } })).status, 400)
  // Treino que não é teste: não
  const normal = agora.find((t) => !ehTeste(t))
  assert.equal((await api(`/api/trainings/${normal.id}/reschedule-test?today=${hoje}`, { method: 'POST', cookie, body: { date: livre } })).status, 404)
  db.close()
})

test('tempo da anamnese: vai para a evolução e para os treinos já montados; não duplica', async () => {
  const cookie = await userFor('feedback')
  const { user } = (await api('/api/auth/me', { cookie })).body
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dir, 'test.db'))
  db.prepare('DELETE FROM tests WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM trainings WHERE user_id = ?').run(user.id)
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: null })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  const hoje = daysFromToday(0)
  await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
  const principal = async () => (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
    .map((t) => t.partes.find((p) => p.parte === 'principal')?.texto ?? '').join('\n')
  assert.ok(!/a\/c \d/.test(await principal()))
  // Informa o tempo na anamnese: entra na evolução e o cd entra nos treinos
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 37000 })
  let evolucao = (await api('/api/tests', { cookie })).body.tests
  assert.equal(evolucao.length, 1)
  assert.equal(evolucao[0].origin, 'anamnese')
  assert.ok(/a\/c \d/.test(await principal()))
  // Salvar a anamnese de novo com o mesmo tempo não duplica; tempo novo entra
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 37000 })
  assert.equal((await api('/api/tests', { cookie })).body.tests.length, 1)
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  evolucao = (await api('/api/tests', { cookie })).body.tests
  assert.deepEqual(evolucao.map((t) => t.timeHundredths), [37000, 36000])
  // Apagou tudo da evolução: o tempo sai do perfil e os treinos voltam a ficar sem tempo
  for (const t of evolucao) await api(`/api/tests/${t.id}`, { method: 'DELETE', cookie })
  const perfil = (await api('/api/athlete-profile', { cookie })).body
  assert.equal(perfil.time400, null)
  assert.equal(perfil.profile.reported400Hundredths, null)
  assert.ok(!/a\/c \d/.test(await principal()))
  db.close()
})

test('página de periodização: cada treino com a fase, a intensidade, a metragem e o tempo', async () => {
  const cookie = await userFor('periodizacao')
  await saveProfile(cookie, { ...sampleProfile, reported400Hundredths: 36000 })
  await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'saude' } })
  await api(`/api/trainings/generate?today=${daysFromToday(0)}`, { method: 'POST', cookie })
  const res = await api('/api/trainings/periodization', { cookie })
  assert.equal(res.status, 200)
  const gerados = res.body.trainings.filter((t) => t.periodizacao)
  assert.ok(gerados.length > 10)
  assert.deepEqual([...new Set(gerados.filter((t) => !t.completed).map((t) => t.periodizacao.fase))], ['acumulacao', 'transicao', 'realizacao'])
  for (const t of gerados) {
    assert.ok(t.metros > 0 && t.minutos > 0, `${t.date}: ${t.metros} m, ${t.minutos} min`)
    assert.equal(t.metros, t.partes.reduce((s, p) => s + (p.metros ?? 0), 0))
    assert.equal(t.plan, undefined) // o plano interno não sai
  }
  // Em ordem de data
  assert.deepEqual(gerados.map((t) => t.date), gerados.map((t) => t.date).sort())
})

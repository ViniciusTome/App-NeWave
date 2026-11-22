import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { cardText, estimateSeconds, generateTrainings, trainingDates, withMeters } from './generator.js'
import { loadLibrary } from './series/index.js'
import { intervalBetweenSets, intervalRangeFor, loadRules, partsForLevel, strokeCategory } from './series/regras.js'

const rules = loadRules()
const library = loadLibrary()
const serieById = (id) => Object.values(library).flat().find((s) => s.id === id)

// Sorteio que se repete igual a cada execução
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const QUATRO = ['crawl', 'costas', 'peito', 'borboleta']
const avancado = {
  level: 'avancado', sessionMinutes: 60, trainingDays: [1, 3, 5], poolLength: 25,
  continuousDistance: 'mais_2000', strokes: QUATRO, bestStroke: 'costas',
  equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 33000 },
}
const gerar = (athlete, seed = 1) =>
  generateTrainings({ rules, library, athlete, today: '2026-11-23', random: seeded(seed) })

// ---------- Datas ----------

test('gera duas semanas de treinos, nos dias de treino da anamnese', () => {
  // 23/11/2026 é segunda-feira
  assert.deepEqual(trainingDates('2026-11-23', [1, 3, 5]), [
    '2026-11-23', '2026-11-25', '2026-11-27', '2026-11-30', '2026-12-02', '2026-12-04',
  ])
  const treinos = gerar(avancado)
  assert.equal(treinos.length, 6)
  assert.deepEqual(treinos.map((t) => t.title), ['Treino 1', 'Treino 2', 'Treino 3', 'Treino 4', 'Treino 5', 'Treino 6'])
})

// ---------- Regras respeitadas ----------

const casos = [
  ['avançado 1h', avancado],
  ['avançado 2h', { ...avancado, sessionMinutes: 120 }],
  ['intermediário 45 min sem teste', {
    ...avancado, level: 'intermediario', sessionMinutes: 45, continuousDistance: '400_1000',
    strokes: ['crawl', 'costas'], time400: null,
  }],
  ['iniciante 45 min', {
    ...avancado, level: 'iniciante', sessionMinutes: 45, continuousDistance: '100_200',
    strokes: ['crawl'], equipment: [], bestStroke: null, time400: null,
  }],
  ['piscina de 50 m', { ...avancado, poolLength: 50, sessionMinutes: 90 }],
]

for (const [nome, athlete] of casos) {
  test(`${nome}: segue a estrutura e as regras`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const treino of gerar(athlete, seed)) {
        // Partes na ordem da estrutura do nível e do tempo de aula
        const estrutura = partsForLevel(rules, athlete.level, athlete.sessionMinutes).map((p) =>
          p === 'hidratacao' ? 'hidratacao' : p)
        const ordem = treino.partes.map((p) => p.parte)
        let j = 0
        for (const parte of ordem) {
          while (j < estrutura.length && estrutura[j] !== parte) j++
          assert.ok(j < estrutura.length, `${nome}: ordem errada ${ordem.join(', ')}`)
          j++
        }
        if (athlete.level === 'iniciante') assert.ok(!ordem.includes('velocidade'), 'iniciante sem velocidade')

        for (const parte of treino.partes.filter((p) => p.serieId)) {
          const serie = serieById(parte.serieId)
          // Distância sem parar, piscina, material e tempo de aula
          const semParar = { '100_200': 100, '400_1000': 400, mais_2000: 2000 }[athlete.continuousDistance]
          assert.ok(serie.maiorDistancia <= semParar, `${parte.texto}: passa da distância sem parar`)
          assert.ok(serie.piscinas.includes(athlete.poolLength), `${parte.texto}: não fecha na piscina`)
          assert.ok(parte.material.every((m) => athlete.equipment.includes(m)), `${parte.texto}: material que não tem`)
          if (serie.aulaAcimaDeMinutos) assert.ok(athlete.sessionMinutes > serie.aulaAcimaDeMinutos)
        }

        // 2ª série principal: alterna crawl e estilo
        const principais = treino.partes.filter((p) => p.parte === 'principal')
        if (principais.length === 2 && athlete.strokes.some((s) => s !== 'crawl')) {
          const cat = (p) => strokeCategory(serieById(p.serieId), { nado: p.nado })
          assert.notEqual(cat(principais[0]), cat(principais[1]), `${principais[0].texto} / ${principais[1].texto}`)
          assert.notEqual(principais[0].serieId, principais[1].serieId)
        }
      }
    }
  })
}

test('o tempo do treino fica perto do tempo de aula', () => {
  for (const [nome, athlete] of casos.filter(([n]) => !n.startsWith('iniciante'))) {
    for (const treino of gerar(athlete)) {
      const razao = treino.minutos / athlete.sessionMinutes
      assert.ok(razao > 0.7 && razao < 1.2, `${nome}: ${treino.minutos} min para aula de ${athlete.sessionMinutes}`)
    }
  }
})

test('o treino mostra a hidratação nos treinos acima de 1h15', () => {
  const [treino] = gerar({ ...avancado, sessionMinutes: 120 })
  const hidratacao = treino.partes.find((p) => p.parte === 'hidratacao')
  assert.equal(hidratacao.minutos, 5)
  assert.equal(treino.partes.filter((p) => p.parte === 'principal').at(-1).titulo, '2ª série principal')
})

// ---------- Metragem no card ----------

test('o card mostra o "m" de metros depois das distâncias', () => {
  assert.equal(withMeters('300 livre'), '300 m livre')
  assert.equal(withMeters('100 indo crawl, voltando estilo'), '100 m indo crawl, voltando estilo')
  assert.equal(withMeters('(2x) 10 x 100 · com palmar'), '(2x) 10 x 100 m · com palmar')
  assert.equal(withMeters('8 x 25 forte · medley'), '8 x 25 m forte · medley')
  assert.equal(withMeters('8 x 25 (15 m forte, 10 m solto)'), '8 x 25 m (15 m forte, 10 m solto)')
  assert.equal(withMeters('4 x 15 m'), '4 x 15 m') // já tinha
  assert.equal(withMeters('1 x 400, 2 x 200 · os 400 com pé de pato + palmar, os 200 nadando'),
    '1 x 400 m, 2 x 200 m · os 400 m com pé de pato + palmar, os 200 m nadando')
  assert.equal(withMeters('400 perna com pé de pato'), '400 m perna com pé de pato')
  assert.equal(withMeters('Aqueça até sentir que o corpo está bem aquecido'), 'Aqueça até sentir que o corpo está bem aquecido')
})

test('nos treinos gerados, toda distância tem o "m"', () => {
  for (const [, athlete] of casos) {
    for (const treino of gerar(athlete)) {
      for (const parte of treino.partes.filter((p) => p.serieId)) {
        assert.doesNotMatch(parte.texto, /\b\d+ x \d+\b(?! m\b)/, parte.texto)
        assert.doesNotMatch(parte.texto, /^\d+ (?!m\b|x\b)/, parte.texto)
      }
      // A hidratação não ganha "m" ("5 min de hidratação")
      const hidratacao = treino.partes.find((p) => p.parte === 'hidratacao')
      if (hidratacao) assert.match(hidratacao.texto, /^5 min/)
    }
  }
})

// ---------- Uma metragem por linha ----------

test('pirâmides e grupos: uma metragem embaixo da outra, com o material na linha do bloco', () => {
  const p = (id) => library.principal.find((s) => s.id === id)
  assert.equal(cardText(p('pri-2x-200-100-200-50'), { texto: '(2x) 1 x 200, 2 x 100, 1 x 200, 4 x 50', padrao: 'sem_material', material: [] }),
    '(2x)\n1 x 200 m\n2 x 100 m\n1 x 200 m\n4 x 50 m')
  // Material na série toda: na última linha
  assert.equal(cardText(p('pri-2x-200-50'), { texto: '(2x) 1 x 200, 4 x 50 · com palmar + pull buoy', padrao: 'serie_inteira', material: ['palmar', 'pull_buoy'] }),
    '(2x)\n1 x 200 m\n4 x 50 m\ncom palmar + pull buoy')
  // Pirâmide alternando: cada bloco com o seu material
  assert.equal(cardText(p('pri-piramide-400-50'), {
    texto: 'ignorado · os 400 com ...', padrao: 'piramide_alternada', material: [],
    porBloco: [['pe_de_pato', 'palmar'], ['palmar'], [], ['pe_de_pato']],
  }), '1 x 400 m · com pé de pato + palmar\n2 x 200 m · com palmar\n4 x 100 m · nadando\n8 x 50 m · com pé de pato')
  // Só os 400 com material: o resto sem nada escrito
  assert.equal(cardText(p('pri-piramide-400-50'), {
    texto: 'x', padrao: 'obrigatorio_por_bloco', material: ['pe_de_pato', 'palmar'],
    porBloco: [['pe_de_pato', 'palmar'], [], [], []],
  }), '1 x 400 m · com pé de pato + palmar\n2 x 200 m\n4 x 100 m\n8 x 50 m')
  // Série de uma metragem só continua numa linha
  assert.equal(cardText(p('pri-5x400'), { texto: '5 x 400 · com palmar', padrao: 'serie_inteira', material: ['palmar'] }),
    '5 x 400 m · com palmar')
})

test('nos treinos gerados, as séries com várias metragens têm uma por linha', () => {
  let vistas = 0
  for (const [, athlete] of casos) {
    for (let seed = 1; seed <= 6; seed++) {
      for (const parte of gerar(athlete, seed).flatMap((t) => t.partes).filter((x) => x.serieId)) {
        const serie = serieById(parte.serieId)
        if (serie.blocos.length < 2) continue
        vistas++
        const linhas = parte.texto.split('\n').filter((l) => /^\d+ x \d+ m/.test(l))
        assert.equal(linhas.length, serie.blocos.length, parte.texto)
      }
    }
  }
  assert.ok(vistas > 0, 'nenhuma pirâmide ou grupo foi sorteado')
})

// ---------- Intervalo entre as séries da série principal ----------

const principalDe = (id) => library.principal.find((s) => s.id === id)

test('série principal com séries: 2 minutos de intervalo (iniciante, 2 a 3 minutos)', () => {
  for (const id of ['pri-2x10x100', 'pri-4x3x200', 'pri-3x-100-75-50-25', 'pri-2x-200-50']) {
    assert.deepEqual(intervalRangeFor(rules, 'principal', principalDe(id), 'avancado'), { min: 120, max: 120 }, id)
    assert.deepEqual(intervalRangeFor(rules, 'principal', principalDe(id), 'intermediario'), { min: 120, max: 120 }, id)
    assert.deepEqual(intervalRangeFor(rules, 'principal', principalDe(id), 'iniciante'), { min: 120, max: 180 }, id)
  }
  // Sem séries, não tem intervalo
  assert.equal(intervalRangeFor(rules, 'principal', principalDe('pri-10x200'), 'avancado'), null)
  // A velocidade continua com a saída (não muda)
  const vel = library.velocidade.find((s) => s.id === 'vel-2x4x25-forte')
  assert.equal(intervalRangeFor(rules, 'velocidade', vel, 'avancado'), null)
  assert.equal(intervalBetweenSets(rules, 'velocidade', vel, { fase: null, level: 'avancado', saidaSegundos: 30 }), 30)
})

test('o intervalo entra no tempo estimado e aparece no card', () => {
  const pace = 90
  const variation = { material: [] }
  const athleteAv = { level: 'avancado' }
  // (2x) 10 x 100 = 10 x 100 + 2' + 10 x 100: o intervalo soma ~2' no lugar de um descanso de 25"
  const comIntervalo = estimateSeconds(rules, 'principal', principalDe('pri-2x10x100'), variation, athleteAv, pace)
  const semIntervalo = estimateSeconds(rules, 'principal', principalDe('pri-16x100'), variation, athleteAv, pace) / 16 * 20
  assert.ok(Math.abs(comIntervalo - semIntervalo - (120 - 25)) < 1, `${comIntervalo} x ${semIntervalo}`)

  for (const [nome, athlete] of casos) {
    for (const treino of gerar(athlete, 2)) {
      for (const parte of treino.partes.filter((p) => p.parte === 'principal')) {
        const temSeries = /^\(\d+x\)/.test(parte.texto)
        if (!temSeries) {
          assert.equal(parte.intervalo, undefined, parte.texto)
          continue
        }
        const esperado = athlete.level === 'iniciante'
          ? "2' a 3' de intervalo entre as séries"
          : "2' de intervalo entre as séries"
        assert.equal(parte.intervalo, esperado, `${nome}: ${parte.texto}`)
      }
    }
  }
})

// ---------- Rota POST /api/trainings/generate ----------

let app
let base
let dir

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'newave-gen-'))
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
  const response = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: response.headers.getSetCookie()[0] }
}

async function newUser(email) {
  const password = 'senha-forte-123'
  await api('/api/auth/register', { method: 'POST', body: { name: 'Atleta Teste', email, password } })
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return login.setCookie.split(';')[0]
}

const profile = {
  swimmingSince: 'mais_5a', recentBreak: 'nao', continuousDistance: '1000_2000',
  strokes: ['crawl', 'costas'], bestStroke: 'costas', trainingDays: [1, 3, 5], sessionMinutes: 60,
  poolLength: 25, equipment: ['pe_de_pato', 'palmar'], injuries: '', reported400Hundredths: 36000,
}

test('rota: sem anamnese não gera', async () => {
  const cookie = await newUser('sem-anamnese@example.com')
  const res = await api('/api/trainings/generate', { method: 'POST', cookie })
  assert.equal(res.status, 409)
  assert.equal((await api('/api/trainings/generate', { method: 'POST' })).status, 401)
})

test('rota: gera, salva no carrossel e substitui os agendados que não foram feitos', async () => {
  const cookie = await newUser('gera@example.com')
  await api('/api/athlete-profile', { method: 'PUT', cookie, body: profile })
  const today = '2026-11-23'

  const first = await api(`/api/trainings/generate?today=${today}`, { method: 'POST', cookie })
  assert.equal(first.status, 201)
  assert.equal(first.body.trainings.length, 6)
  assert.equal(first.body.replaced, 0)

  const upcoming = await api(`/api/trainings/upcoming?today=${today}`, { cookie })
  assert.equal(upcoming.body.trainings.length, 6)
  const [primeiro] = upcoming.body.trainings
  assert.equal(primeiro.date, today)
  assert.ok(Array.isArray(primeiro.partes) && primeiro.partes.length > 0)
  assert.equal(primeiro.partes[0].parte, 'aquecimento')
  // Os campos antigos também são preenchidos (histórico e feedback)
  assert.ok(primeiro.warmUp.length > 0 && primeiro.mainSeries.length > 0)

  // Conclui um treino e gera de novo: o concluído fica; os outros são trocados
  await api(`/api/trainings/${primeiro.id}/complete`, { method: 'POST', cookie })
  const again = await api(`/api/trainings/generate?today=${today}`, { method: 'POST', cookie })
  assert.equal(again.body.replaced, 5)
  const history = await api(`/api/trainings?today=${today}`, { cookie })
  assert.deepEqual(history.body.trainings.map((t) => t.id), [primeiro.id])
  // O dia do treino concluído não ganha outro treino
  const depois = await api(`/api/trainings/upcoming?today=${today}`, { cookie })
  assert.equal(depois.body.trainings.length, 5)
  assert.ok(!depois.body.trainings.some((t) => t.date === today))
})

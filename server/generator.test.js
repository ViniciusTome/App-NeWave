import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import {
  abbreviate, adaptToDistance, descansoFor, sorteiaSaidaPorIntensidade, emAdaptacaoDaBorboleta, bestTimeFor, cardText, feedbackAdjustment, lightenTraining, periodPhases, planStages, estimateSeconds, generateTrainings, saidaFor, saidasDaSerie, saidaText,
  saidaVelocidade, setOptions, strokeFactor, trainingDates, withMeters,
} from './generator.js'
import { loadLibrary } from './series/index.js'
import {
  drawIntensities, intervalBetweenSets, intervalRangeFor, loadRules, partsForLevel, restFor, seriesVariations, strokeCategory,
  timeTable,
} from './series/regras.js'

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
const avancadoPerfil = {
  sessionMinutes: 60, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: 'mais_2000', strokes: QUATRO,
  bestStroke: 'costas', equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 33000 },
}
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

// O treino do teste de 400 m (atleta sem tempos) tem a estrutura dele
const semTeste = (treinos) => treinos.filter((t) => !t.partes.some((p) => p.parte === 'teste'))

for (const [nome, athlete] of casos) {
  test(`${nome}: segue a estrutura e as regras`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const treino of semTeste(gerar(athlete, seed))) {
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
          // A série como saiu (adaptada para quem nada pouco: 1 x 200 vira 2 x 100); com pé de pato, até 75 m
          const repeticoes = [...(parte.serieTexto ?? '').matchAll(/x (\d+)/g)].map((m) => Number(m[1]))
          const maior = repeticoes.length > 0 ? Math.max(...repeticoes) : serie.maiorDistancia
          const limite = parte.material?.includes('pe_de_pato') ? Math.max(semParar, 75) : semParar
          assert.ok(maior <= limite, `${parte.texto}: passa da distância sem parar`)
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
    for (const treino of semTeste(gerar(athlete))) {
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

// ---------- Abreviações do card ----------

test('o card usa as abreviações do treinador', () => {
  assert.equal(abbreviate('100 m indo crawl, voltando estilo'), '100 m indo CR, voltando estilo')
  assert.equal(abbreviate('8 x 25 m forte · medley · com pé de pato + palmar'), '8 x 25 m forte · MD · c/PÉ + PALM')
  assert.equal(abbreviate('com palmar + pull buoy'), 'c/PALM + BOIA')
  assert.equal(abbreviate('400 m perna com pé de pato · ida crawl, volta costas (melhor estilo)'), '400 m PR c/PÉ · ida CR, volta ME')
  assert.equal(abbreviate('ida crawl, volta peito (melhor estilo) · com pé de pato de peito'), 'ida CR, volta ME · c/PÉ de peito')
  assert.equal(abbreviate('1ª série nadando'), '1ª série NAD')
  // Frases que não são termos ficam iguais
  assert.equal(abbreviate('Aqueça até sentir que o corpo está bem aquecido'), 'Aqueça até sentir que o corpo está bem aquecido')
})

test('série com material ou nado mudando entre as séries: uma linha por série', () => {
  const vel = library.velocidade.find((s) => s.id === 'vel-2x4x25-forte')
  assert.equal(cardText(vel, { texto: 'x', padrao: 'por_serie', material: ['pe_de_pato'], series: [['pe_de_pato'], []] }),
    '(2x) 4 x 25 m forte\n1ª série: c/PÉ\n2ª série: NAD')

  // Mistura de nados: o melhor estilo aparece como ME, e série toda igual fica com um nado só
  const pri = library.principal.find((s) => s.id === 'pri-4x3x200')
  const mistura = {
    nado: 'misto', padrao: 'sem_material', material: [], melhorEstilo: 'costas', texto: 'x',
    porSerie: [['medley', 'peito', 'medley'], ['costas', 'medley', 'costas'], ['costas', 'costas', 'costas'], ['costas', 'peito', 'medley']],
  }
  assert.equal(cardText(pri, mistura, { min: 120, max: 120 }),
    "(4x) 3 x 200 m · c/2' de intervalo\n1ª série: MD | PE | MD\n2ª série: ME | MD | ME\n3ª série: ME\n4ª série: ME | PE | MD")
  // Iniciante: intervalo de 2' a 3'
  assert.match(cardText(pri, mistura, { min: 120, max: 180 }), /^\(4x\) 3 x 200 m · c\/2' a 3' de intervalo\n/)
})

// ---------- Uma metragem por linha ----------

test('pirâmides e grupos: uma metragem embaixo da outra, com o material na linha do bloco', () => {
  const p = (id) => library.principal.find((s) => s.id === id)
  assert.equal(cardText(p('pri-2x-200-100-200-50'), { texto: '(2x) 1 x 200, 2 x 100, 1 x 200, 4 x 50', padrao: 'sem_material', material: [] }),
    '(2x)\n1 x 200 m\n2 x 100 m\n1 x 200 m\n4 x 50 m')
  // Material na série toda: na última linha
  assert.equal(cardText(p('pri-2x-200-50'), { texto: '(2x) 1 x 200, 4 x 50 · com palmar + pull buoy', padrao: 'serie_inteira', material: ['palmar', 'pull_buoy'] }),
    '(2x)\n1 x 200 m\n4 x 50 m\nc/PALM + BOIA')
  // Pirâmide alternando: cada bloco com o seu material
  assert.equal(cardText(p('pri-piramide-400-50'), {
    texto: 'ignorado · os 400 com ...', padrao: 'piramide_alternada', material: [],
    porBloco: [['pe_de_pato', 'palmar'], ['palmar'], [], ['pe_de_pato']],
  }), '1 x 400 m · c/PÉ + PALM\n2 x 200 m · c/PALM\n4 x 100 m · NAD\n8 x 50 m · c/PÉ')
  // Só os 400 com material: o resto sem nada escrito
  assert.equal(cardText(p('pri-piramide-400-50'), {
    texto: 'x', padrao: 'obrigatorio_por_bloco', material: ['pe_de_pato', 'palmar'],
    porBloco: [['pe_de_pato', 'palmar'], [], [], []],
  }), '1 x 400 m · c/PÉ + PALM\n2 x 200 m\n4 x 100 m\n8 x 50 m')
  // Série de uma metragem só continua numa linha
  assert.equal(cardText(p('pri-5x400'), { texto: '5 x 400 · com palmar', padrao: 'serie_inteira', material: ['palmar'] }),
    '5 x 400 m · c/PALM')
})

test('nos treinos gerados, as séries com várias metragens têm uma por linha', () => {
  let vistas = 0
  for (const [, athlete] of casos) {
    for (let seed = 1; seed <= 6; seed++) {
      for (const parte of gerar(athlete, seed).flatMap((t) => t.partes).filter((x) => x.serieId)) {
        const serie = serieById(parte.serieId)
        if (!serie) continue // as do dia do teste não estão na biblioteca
        // Os blocos da série como saiu (adaptada para quem nada pouco, pode ter menos)
        const blocos = parte.serieTexto ? (parte.serieTexto.match(/\d+ x \d+/g) ?? []).length : serie.blocos.length
        if (blocos < 2) continue
        vistas++
        const linhas = parte.texto.split('\n').filter((l) => /^\d+ x \d+ m/.test(l))
        assert.equal(linhas.length, blocos, parte.texto)
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
  // (2x) 10 x 100 = 10 x 100 + 2' + 10 x 100: o intervalo soma ~2' no lugar de um descanso
  // de 20" (avançado, série de crawl)
  const comIntervalo = estimateSeconds(rules, 'principal', principalDe('pri-2x10x100'), variation, athleteAv, pace)
  const semIntervalo = estimateSeconds(rules, 'principal', principalDe('pri-16x100'), variation, athleteAv, pace) / 16 * 20
  assert.ok(Math.abs(comIntervalo - semIntervalo - (120 - 20)) < 1, `${comIntervalo} x ${semIntervalo}`)

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

// ---------- Intensidades na série principal ----------

const diario = { ...avancado, trainingDays: [0, 1, 2, 3, 4, 5, 6] }
const principaisDe = (athlete, seeds = 8) => {
  const lista = []
  for (let seed = 1; seed <= seeds; seed++) {
    for (const t of gerar(athlete, seed)) lista.push(...t.partes.filter((p) => p.parte === 'principal').map((p) => ({ ...p, date: t.date })))
  }
  return lista
}

test('a série principal sempre tem um jeito de nadar, e os tipos nunca se misturam', () => {
  const tipos = new Set()
  for (const p of principaisDe(diario)) {
    assert.ok(p.intensidades, p.texto)
    tipos.add(p.intensidades.tipo)
    const aLevels = p.intensidades.valores.filter((v) => /^A[123]$/.test(v))
    // Ou só A1/A2/A3, ou nenhum deles
    assert.ok(aLevels.length === 0 || aLevels.length === p.intensidades.valores.length, p.intensidades.valores.join())
    assert.equal(p.intensidades.tipo === 'intensidades', aLevels.length > 0)
  }
  assert.deepEqual([...tipos].sort(), ['AC', 'NEG', 'POS', 'finalForte', 'intensidades', 'saiChe'])
})

test('A3 sempre com equipamento (c/PÉ ou c/PÉ + PALM)', () => {
  let vistos = 0
  for (const p of principaisDe(diario)) {
    if (!p.intensidades.valores.includes('A3')) continue
    vistos++
    const linhas = p.texto.split('\n')
    // O material da série toda fica no cabeçalho ou, nas pirâmides e grupos, na linha depois dos blocos
    const daSerieToda = [linhas[0], ...linhas.filter((l) => !/ª série:/.test(l) && !/^\d+ x \d+ m/.test(l))]
    for (const linha of linhas.filter((l) => /\bA3\b/.test(l))) {
      assert.ok(linha.includes('c/PÉ') || daSerieToda.some((l) => l.includes('c/PÉ')), p.texto)
    }
  }
  assert.ok(vistos > 0, 'nenhuma série em A3 foi sorteada')
})

test('A3 sem pé de pato: quem não é avançado não recebe; com pé de pato, sim', () => {
  const semPe = { ...diario, level: 'intermediario', continuousDistance: '1000_2000', equipment: ['palmar'] }
  for (const p of principaisDe(semPe, 4)) assert.ok(!p.intensidades.valores.includes('A3'), p.texto)
  const serie = library.principal.find((s) => s.id === 'pri-4x4x100')
  const variacao = seriesVariations(rules, 'principal', serie, { ...avancado, equipment: ['pe_de_pato'] })[0]
  let comA3 = 0
  for (let seed = 1; seed <= 40; seed++) {
    const r = drawIntensities(rules, serie, variacao, { ...avancado, equipment: ['pe_de_pato'] }, { random: seeded(seed) })
    r.valores.forEach((v, i) => {
      if (v !== 'A3') return
      comA3++
      assert.ok(r.variation.series[i].includes('pe_de_pato'), `série ${i + 1} em A3 sem pé de pato`)
    })
  }
  assert.ok(comA3 > 0)
})

test('recuperação: depois de um treino com A3, o próximo dentro de 48 h não tem A3', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const treinos = gerar(diario, seed)
    for (let i = 1; i < treinos.length; i++) {
      const pesado = (t) => t.partes.some((p) => p.intensidades?.valores.some((v) => v === 'A3' || /^([5-9]|10) AC$/.test(v)))
      if (pesado(treinos[i - 1])) {
        const temA3 = treinos[i].partes.some((p) => p.intensidades?.valores.includes('A3'))
        assert.ok(!temA3, `${treinos[i - 1].date} e ${treinos[i].date} com A3`)
      }
    }
  }
})

test('séries simples: um ritmo por repetição ou um ritmo só; 400 m quase sempre 30 AC c/PÉ + PALM', () => {
  const s5x400 = library.principal.find((s) => s.id === 'pri-5x400')
  const variacao = seriesVariations(rules, 'principal', s5x400, avancado)[0]
  let trinta = 0
  for (let seed = 1; seed <= 60; seed++) {
    const r = drawIntensities(rules, s5x400, variacao, avancado, { random: seeded(seed) })
    if (r.valores[0] === '30 AC') {
      trinta++
      assert.equal(r.unidade, 'serie_toda')
      assert.deepEqual(r.variation.material, ['pe_de_pato', 'palmar'])
    }
  }
  assert.ok(trinta > 30 && trinta < 60, `${trinta} de 60`)
  // 10 x 200: às vezes um ritmo só, às vezes um por repetição
  const s10x200 = library.principal.find((s) => s.id === 'pri-10x200')
  const v200 = seriesVariations(rules, 'principal', s10x200, avancado)[0]
  const unidades = new Set()
  for (let seed = 1; seed <= 60; seed++) {
    const r = drawIntensities(rules, s10x200, v200, avancado, { random: seeded(seed) })
    if (r.tipo === 'intensidades') unidades.add(r.unidade)
  }
  assert.ok(unidades.has('serie_toda'))
})

test('série simples com um ritmo por repetição: sempre com equipamento, e só no início da temporada', () => {
  const s6x300 = library.principal.find((s) => s.id === 'pri-6x300')
  const v = seriesVariations(rules, 'principal', s6x300, avancado)[0] // sem material
  let porRep = 0
  for (let seed = 1; seed <= 80; seed++) {
    const r = drawIntensities(rules, s6x300, v, avancado, { random: seeded(seed) })
    if (r.tipo === 'intensidades' && r.unidade === 'repeticao') {
      porRep++
      assert.ok(r.variation.material.includes('pe_de_pato'), 'ritmo por repetição sem equipamento')
    }
    // Fora da Acumulação: nunca um ritmo por repetição
    const fora = drawIntensities(rules, s6x300, v, avancado, { random: seeded(seed), fase: 'realizacao' })
    assert.notEqual(fora.unidade, 'repeticao')
  }
  assert.ok(porRep > 0)
  // Sem pé de pato: um ritmo só
  const semPe = { ...avancado, equipment: ['palmar'] }
  for (let seed = 1; seed <= 30; seed++) {
    const r = drawIntensities(rules, s6x300, v, semPe, { random: seeded(seed) })
    assert.notEqual(r.unidade, 'repeticao')
  }
})

test('quem treina até 2x por semana e menos de 1 h pode ter A3 em qualquer treino (menos triatlo)', async () => {
  const { recoveryWaived } = await import('./series/regras.js')
  const pouco = { ...avancado, trainingDays: [2, 4], sessionMinutes: 40 }
  assert.equal(recoveryWaived(rules, pouco), true)
  assert.equal(recoveryWaived(rules, { ...pouco, modalidade: 'triatlo' }), false)
  assert.equal(recoveryWaived(rules, { ...pouco, sessionMinutes: 60 }), false)
  assert.equal(recoveryWaived(rules, { ...pouco, trainingDays: [1, 3, 5] }), false)
  // Treinando terça e quinta (48 h), mas também em dias seguidos: sem a regra, A3 seguido aparece
  const seguidos = { ...avancado, trainingDays: [2, 3], sessionMinutes: 45 }
  let a3Seguido = false
  for (let seed = 1; seed <= 20 && !a3Seguido; seed++) {
    const t = gerar(seguidos, seed)
    for (let i = 1; i < t.length; i++) {
      const temA3 = (x) => x.partes.some((p) => p.intensidades?.valores.includes('A3'))
      if (temA3(t[i - 1]) && temA3(t[i])) a3Seguido = true
    }
  }
  assert.ok(a3Seguido, 'sem a regra da recuperação, deveria poder ter A3 em treinos seguidos')
})

test('padrões do treinador e escada; AC diminuindo; final forte por bloco', () => {
  const padroes = rules.intensidadesNaPrincipal.padroes.map((p) => p.join())
  const vistos = new Set()
  for (const p of principaisDe(diario)) {
    const { tipo, unidade, valores } = p.intensidades
    if (tipo === 'intensidades' && padroes.includes(valores.join())) vistos.add(valores.join())
    if (tipo === 'AC' && valores.length > 1) {
      const n = valores.map((v) => Number(v.split(' ')[0]))
      assert.deepEqual(n, [...n].sort((a, b) => b - a), 'AC precisa diminuir')
    }
    if (tipo === 'finalForte' && unidade === 'bloco') {
      const serie = serieById(p.serieId)
      assert.deepEqual(valores, serie.blocos.map((b) => `${b.distancia - 25} NAD x 25 fo`))
    }
  }
  assert.ok(vistos.size > 0, 'nenhum padrão do treinador foi usado')
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
  // Sem prova alvo: a periodização inteira de 8 semanas, 3 treinos por semana
  const total = rules.periodizacao.semanasSemProva * profile.trainingDays.length
  assert.equal(first.body.trainings.length, total)
  assert.equal(first.body.replaced, 0)

  const upcoming = await api(`/api/trainings/upcoming?today=${today}`, { cookie })
  assert.equal(upcoming.body.trainings.length, total)
  const [primeiro] = upcoming.body.trainings
  assert.equal(primeiro.date, today)
  assert.ok(Array.isArray(primeiro.partes) && primeiro.partes.length > 0)
  assert.equal(primeiro.partes[0].parte, 'aquecimento')
  // Os campos antigos também são preenchidos (histórico e feedback)
  assert.ok(primeiro.warmUp.length > 0 && primeiro.mainSeries.length > 0)

  // Conclui um treino e gera de novo: o concluído fica; os outros são trocados
  await api(`/api/trainings/${primeiro.id}/complete`, { method: 'POST', cookie })
  const again = await api(`/api/trainings/generate?today=${today}`, { method: 'POST', cookie })
  assert.equal(again.body.replaced, total - 1)
  const history = await api(`/api/trainings?today=${today}`, { cookie })
  assert.deepEqual(history.body.trainings.map((t) => t.id), [primeiro.id])
  // O dia do treino concluído não ganha outro treino
  const depois = await api(`/api/trainings/upcoming?today=${today}`, { cookie })
  assert.equal(depois.body.trainings.length, total - 1)
  assert.ok(!depois.body.trainings.some((t) => t.date === today))
})

// ---------- Saídas ----------

test('saída = tempo da intensidade + descanso, de 5 em 5 segundos', () => {
  // Teste de 400 em 6'00": 100 m A1 = 1'30", A2 = 1'28", A3 = 1'26"
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  // Avançado, série de crawl: descanso do 100 pela tabela do crawl (20")
  assert.deepEqual(['A1', 'A2', 'A3'].map((v) => saidaFor(rules, avancado, { distancia: 100 }, v)), [110, 110, 105])
  // Série de estilo: o descanso da tabela geral (20" a 30" -> 25"); o tempo de nado x 1,35
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, 'A1', 1.35), 145)
  // 400 com 30 AC: melhor (6'00") + 30" + 1' de descanso = 7'30"
  assert.equal(saidaFor(rules, avancado, { distancia: 400 }, '30 AC'), 450)
  // Iniciante: descanso pela intensidade (A1 10", A2 15", A3 30")
  const iniciante = { level: 'iniciante', tabela: timeTable(rules, 360), teste400: 360 }
  assert.deepEqual(['A1', 'A2', 'A3'].map((v) => saidaFor(rules, iniciante, { distancia: 100 }, v)), [100, 105, 115])
  // Sem o teste (sem tabela) fica sem saída
  assert.equal(saidaFor(rules, { level: 'avancado' }, { distancia: 100 }, 'A1'), null)
})

test('Realização: descansos 30 a 40% maiores (35%), arredondados de 5 em 5', () => {
  const realizacao = rules.periodizacao.etapas.realizacao.descansoMaior
  assert.deepEqual(realizacao, [0.3, 0.4])
  const base = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const naR = { ...base, descansoMaior: realizacao }
  // 100 m A1 de crawl: 1'30" + 20" = 1'50"; na Realização 20" x 1,35 = 27 -> 25": 1'55"
  assert.equal(saidaFor(rules, base, { distancia: 100 }, 'A1'), 110)
  assert.equal(saidaFor(rules, naR, { distancia: 100 }, 'A1'), 115)
  // 200 m A1 de crawl: 40" -> 54 -> 55" (15" a mais)
  assert.equal(saidaFor(rules, naR, { distancia: 200 }, 'A1') - saidaFor(rules, base, { distancia: 200 }, 'A1'), 15)
  // 400 com 30 AC: 1' de descanso -> 81" -> 1'20": 7'30" -> 7'50"
  assert.equal(saidaFor(rules, naR, { distancia: 400 }, '30 AC'), 470)
  // NEG/POS nos 100: 25" -> 35"
  assert.equal(saidaFor(rules, naR, { distancia: 100 }, 'NEG') - saidaFor(rules, base, { distancia: 100 }, 'NEG'), 10)
  // Sem tempos: o descanso escrito também cresce (iniciante A3: 30" -> 40,5 -> 40")
  assert.equal(descansoFor(rules, { level: 'iniciante' }, { distancia: 100 }, 'A3'), 30)
  assert.equal(descansoFor(rules, { level: 'iniciante', descansoMaior: realizacao }, { distancia: 100 }, 'A3'), 40)
  // Velocidade: o avançado nos 25 m (cd 30") descansa mais: cd 35"
  assert.equal(saidaVelocidade(rules, base, { distancia: 25 }), 30)
  assert.equal(saidaVelocidade(rules, naR, { distancia: 25 }), 35)
  // Sempre múltiplo de 5
  for (const d of [25, 50, 75, 100, 150, 200, 400]) {
    for (const v of ['A1', 'A2', 'A3', '10 AC', 'NEG']) assert.equal(saidaFor(rules, naR, { distancia: d }, v) % 5, 0, `${d} ${v}`)
  }
})

test('Realização no gerador: as saídas ficam maiores que na Transição', () => {
  const [a] = gerar(avancado, 1)
  assert.ok(a)
  const plano = generateTrainings({ rules, library, athlete: avancado, today: '2026-11-23', random: seeded(3),
    periodizacao: { inicio: '2026-11-23', fim: '2027-02-28', semProva: true } })
  const daEtapa = (e) => plano.filter((t) => t.plano.etapa === e)
  assert.ok(daEtapa('realizacao').length > 0)
  const montagem = daEtapa('realizacao').flatMap((t) => t.plano.montagem).filter(Boolean)
  assert.ok(montagem.every((m) => m.dia.descansoMaior?.[0] === 0.3), 'o dia da Realização guarda a regra (para atualizar o tempo depois)')
})

test('texto da saída', () => {
  assert.equal(saidaText(45), '45"')
  assert.equal(saidaText(60), "1'00\"")
  assert.equal(saidaText(450), "7'30\"")
})

test('o card mostra a saída (cd) da série principal', () => {
  const textos = [1, 2, 3].flatMap((seed) => gerar(avancado, seed))
    .map((t) => t.partes.find((p) => p.parte === 'principal').texto)
  assert.ok(textos.some((t) => /a\/c \d+'\d{2}"/.test(t)), 'nenhum treino com saída')
})

test('na acumulação, A2/A3 perto do A1 ficam com a saída do A1; na transição, cada um com a sua', () => {
  const serie = { blocos: [{ repeticoes: 4, distancia: 100 }] }
  const I = { unidade: 'repeticao', valores: ['A1', 'A2', 'A1', 'A3'] }
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  // Sem fase definida vale a acumulação
  // (crawl: 20" de descanso nos 100)
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I), [110, 110, 110, 110])
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I, false), [110, 110, 110, 110])
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I, true), [110, 110, 110, 105])
})

test('iniciante: a saída do A3 fica no máximo 20" acima da do A1', () => {
  const I = { unidade: 'repeticao', valores: ['A1', 'A2', 'A3'] }
  const iniciante = { level: 'iniciante', tabela: timeTable(rules, 360), teste400: 360 }
  // 100 m: 1'40" / 1'45" / 1'55" (dentro do limite)
  assert.deepEqual(saidasDaSerie(rules, iniciante, { blocos: [{ repeticoes: 3, distancia: 100 }] }, I), [100, 105, 115])
  // Teste lento (9'): no 100 o A3 passaria 25" do A1; fica 20" acima
  const lento = { level: 'iniciante', tabela: timeTable(rules, 540), teste400: 540 }
  const [a1, , a3] = saidasDaSerie(rules, lento, { blocos: [{ repeticoes: 3, distancia: 100 }] }, I)
  assert.ok(a3 - a1 <= 20, `${a1} ${a3}`)
})

test('repetições longas (300 m ou mais): A2/A3 até 20" abaixo do A1 ficam com a do A1', () => {
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const I = { unidade: 'repeticao', valores: ['A1', 'A2', 'A3'] }
  const saidas = saidasDaSerie(rules, avancado, { blocos: [{ repeticoes: 3, distancia: 300 }] }, I)
  assert.equal(new Set(saidas).size, 1)
})

test('AC em outras distâncias: melhor tempo estimado pela tabela de percentuais', () => {
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  // A1 do 100 = 1'30" a 75%: melhor = 90 ÷ 1,25 = 72"
  assert.equal(bestTimeFor(rules, avancado, 100), 72)
  // 15 AC nos 100 (crawl): 72 + 15 + 20" de descanso = 107 -> 1'45"
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, '15 AC'), 105)
  // 10 AC: 72 + 10 + 20" = 1'42" -> 1'40", mas fica no nível do 15 AC (descansa mais): 1'45"
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, '10 AC'), 105)
  // Nos 400 vale o teste
  assert.equal(bestTimeFor(rules, avancado, 400), 360)
})

test('quanto mais perto do 100%, maior o descanso: 15, 10 e 5 AC com a mesma saída', () => {
  const avancado = { level: 'avancado', tabela: timeTable(rules, 330), teste400: 330 }
  for (const d of [50, 100, 200, 250]) {
    const [c15, c10, c5] = ['15 AC', '10 AC', '5 AC'].map((v) => saidaFor(rules, avancado, { distancia: d }, v))
    assert.equal(c10, c15, `${d} m`)
    assert.equal(c5, c15, `${d} m`)
  }
  // Os mais leves (20, 30 AC) continuam com a saída deles (maior)
  assert.ok(saidaFor(rules, avancado, { distancia: 100 }, '30 AC') > saidaFor(rules, avancado, { distancia: 100 }, '15 AC'))
  // Na série: 30, 20 e 10 AC -> a saída não diminui, fica no nível do 30 AC
  const serie = { blocos: [{ vezes: 3, repeticoes: 4, distancia: 100 }] }
  const saidas = saidasDaSerie(rules, avancado, serie, { unidade: 'serie', valores: ['30 AC', '20 AC', '10 AC'] }, true)
  assert.equal(new Set(saidas).size, 1, saidas.join(', '))
  // Nos treinos gerados: numa série com vários AC, a saída nunca cai de uma série para a outra
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const plano = generateTrainings({ rules, library, athlete: { ...avancado, ...avancadoPerfil }, today: '2026-11-23', random: seeded(seed),
      periodizacao: { inicio: '2026-11-23', fim: '2027-02-28', semProva: true } })
    for (const p of plano.flatMap((t) => t.partes).filter((x) => x.parte === 'principal')) {
      const linhas = p.texto.split('\n').filter((l) => /^\dª série:.*\(\d+ AC\)/.test(l))
      const cd = (l) => { const m = /a\/c (\d+)'(\d+)"/.exec(l) ?? /a\/c (\d+)"/.exec(l); return m[2] ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) }
      const ac = (l) => Number(/\((\d+) AC\)/.exec(l)[1])
      for (const a of linhas) for (const b of linhas) if (ac(b) < ac(a) && /· CR · cd/.test(a) && /· CR · cd/.test(b)) assert.ok(cd(b) >= cd(a), p.texto)
    }
  }
})

test('NEG, POS e final forte: tempo do A2 + 20" a 30" nos 50 e 100 m', () => {
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  // A2 do 100 = 1'28" + 25" = 1'53" -> 1'55"
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, 'NEG'), 115)
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, 'POS'), 115)
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, '75 NAD x 25 fo'), 115)
  // A2 do 50 = 40,5" + 25" -> 1'05"
  assert.equal(saidaFor(rules, avancado, { distancia: 50 }, 'NEG'), 65)
})

test('velocidade: avançado nos 25 a cada 30"; intermediário: tempo forte + 20" a 30" (nunca 1/1)', () => {
  const tabela = timeTable(rules, 360)
  assert.equal(saidaVelocidade(rules, { level: 'avancado', tabela, teste400: 360 }, { distancia: 25 }), 30)
  // Intermediário: 25 forte ~16" + 25" de descanso -> 40"
  assert.equal(saidaVelocidade(rules, { level: 'intermediario', tabela, teste400: 360 }, { distancia: 25 }), 40)
  // O card mostra a saída
  const textos = [1, 2, 3, 4].flatMap((seed) => gerar(avancado, seed))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(textos.length > 0 && textos.every((t) => /a\/c \d+"/.test(t)), textos.join('\n'))
})

test('grupos: cada distância com a sua saída', () => {
  const serie = { vezes: 3, blocos: [{ repeticoes: 1, distancia: 100 }, { repeticoes: 2, distancia: 75 }, { repeticoes: 3, distancia: 50 }] }
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const I = { unidade: 'serie', valores: ['A1', 'A2', 'A3'] }
  // Acumulação: tudo com a saída do A1, então vai na linha de cada distância
  const acumulacao = saidasDaSerie(rules, avancado, serie, I)
  assert.deepEqual(acumulacao.porBloco.map((col) => new Set(col).size), [1, 1, 1])
  const variation = { texto: '', material: [], padrao: 'livre' }
  const texto = cardText({ ...serie, texto: '' }, variation, null, I, acumulacao)
  assert.match(texto, /1 x 100 m · a\/c 1'50"/)
  // Transição: cada série com as suas saídas
  const transicao = saidasDaSerie(rules, avancado, serie, I, true)
  const texto2 = cardText({ ...serie, texto: '' }, variation, null, I, transicao)
  assert.match(texto2, /3ª série: A3 · 100 a\/c \d'\d{2}" \/ 75 a\/c/)
})

test('iniciante com equipamento: aviso para descansar o intervalo', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 60, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
    strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 54000 },
  }
  const partes = [1, 2, 3, 4, 5].flatMap((seed) => gerar(iniciante, seed)).flatMap((t) => t.partes)
  const comAviso = partes.filter((p) => p.aviso)
  assert.ok(comAviso.length > 0, 'nenhum aviso')
  for (const p of comAviso) {
    assert.match(p.texto, /a\/c /)
    // Descanso pela distância: 25 m 20"; 50 e 100 m 20" a 30"; 200 m 40" a 50"; 400 m 1'
    assert.match(p.aviso, /descanse (de 20 segundos|de 20 a 30 segundos|de 40 a 50 segundos|de 1 minuto) nos \d+ m/)
    assert.doesNotMatch(p.aviso, /10"/)
  }
  // Avançado não recebe o aviso
  assert.ok([1, 2, 3].flatMap((seed) => gerar(avancado, seed)).flatMap((t) => t.partes).every((p) => !p.aviso))
})

test('a mesma série nunca se repete de um treino para o seguinte', () => {
  const partes = rules.naoRepetirNoTreinoSeguinte.partes
  const iniciante = {
    level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '50_100',
    strokes: ['crawl'], equipment: ['pe_de_pato'], time400: null,
  }
  for (const athlete of [avancado, { ...avancado, sessionMinutes: 90 }, { ...avancado, sessionMinutes: 45 }, iniciante]) {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const treinos = gerar(athlete, seed)
      treinos.slice(1).forEach((t, i) => {
        const antes = treinos[i].partes.filter((p) => partes.includes(p.parte))
        for (const p of t.partes.filter((x) => partes.includes(x.parte))) {
          assert.ok(!antes.some((a) => a.serieId === p.serieId), `${p.serieId} repetiu em ${treinos[i].date} e ${t.date}`)
          // Nem a mesma série escrita igual (ex.: (4x) 4 x 50 e (6x) 4 x 50 reduzidas para (3x) 4 x 50)
          assert.ok(!antes.some((a) => a.serieTexto === p.serieTexto), `${p.serieTexto} repetiu em ${treinos[i].date} e ${t.date}`)
          // Nem da mesma família (4, 5 e 6 x 150 com pé de pato e palmar)
          if (p.serieFamilia) assert.ok(!antes.some((a) => a.serieFamilia === p.serieFamilia), `${p.serieFamilia} repetiu`)
        }
      })
    }
  }
})

test('o primeiro treino novo não repete as séries do último treino feito', () => {
  const primeiro = gerar(avancado, 1)[0]
  const principal = primeiro.partes.find((p) => p.parte === 'principal').serieId
  const outro = generateTrainings({
    rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), seriesAnteriores: [principal],
  })[0]
  assert.notEqual(outro.partes.find((p) => p.parte === 'principal').serieId, principal)
})

test('iniciante nada no máximo 50 minutos, mesmo em aulas mais longas', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 90, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
    strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 54000 },
  }
  for (const seed of [1, 2, 3]) {
    for (const t of gerar(iniciante, seed)) assert.ok(t.minutos <= 55, `${t.date}: ${t.minutos} min`)
  }
})

test('séries (2x), (3x), (4x): o gerador escolhe quantas séries o atleta faz', () => {
  const vezes = (opcoes) => opcoes.map((s) => Number(/^\((\d+)x\)/.exec(s.texto)?.[1] ?? 1))
  // (3x) 3 x 200: avançado de 2 a 4; iniciante só diminui (2 ou 3)
  assert.deepEqual(vezes(setOptions(rules, 'principal', serieById('pri-3x3x200'), 'avancado')), [3, 2, 4])
  assert.deepEqual(vezes(setOptions(rules, 'principal', serieById('pri-3x3x200'), 'iniciante')).slice(0, 2), [3, 1])
  // A metragem acompanha: (2x) 3 x 200 = 1.200 m
  const duas = setOptions(rules, 'principal', serieById('pri-3x3x200'), 'avancado')[1]
  assert.equal(duas.volume, 1200)
  assert.equal(duas.texto, '(2x) 3 x 200')
  // Grupos: (3x) 1 x 100, 2 x 75, 3 x 50, 4 x 25 -> (2x) = 1.000 m
  const grupo = setOptions(rules, 'principal', serieById('pri-3x-100-75-50-25'), 'avancado')[1]
  assert.equal(grupo.vezes, 2)
  assert.equal(grupo.volume, 1000)
  // Iniciante pode fazer uma série só: (2x) 10 x 100 -> 10 x 100
  const uma = setOptions(rules, 'principal', serieById('pri-2x10x100'), 'iniciante')
  assert.deepEqual(uma.map((s) => s.texto), ['(2x) 10 x 100', '10 x 100'])
  assert.equal(uma[1].volume, 1000)
  assert.equal(setOptions(rules, 'principal', serieById('pri-2x10x100'), 'avancado').length, 2)
  // Sem (Nx) não muda
  assert.equal(setOptions(rules, 'solto', { texto: '(2x) 100 solto', blocos: [] }, 'avancado').length, 1)
})

test('iniciante: menos séries para caber no tempo', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 40, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
    strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 54000 },
  }
  const treinos = [1, 2, 3, 4, 5, 6].flatMap((seed) => gerar(iniciante, seed))
  for (const t of treinos) assert.ok(t.minutos <= 45, `${t.date}: ${t.minutos} min`)
  const principais = treinos.map((t) => t.partes.find((p) => p.parte === 'principal'))
  const reduzida = principais.find((p) => {
    const escrito = /^\((\d+)x\)/.exec(serieById(p.serieId).texto)
    const feito = /^\((\d+)x\)/.exec(p.texto)
    return escrito && feito && Number(feito[1]) < Number(escrito[1])
  })
  assert.ok(reduzida, 'nenhuma série com menos séries')
})

// ---------- Sem tempos de referência ----------

const semTempo = {
  ...avancado, level: 'intermediario', sessionMinutes: 60, continuousDistance: '400_1000', time400: null,
}

test('sem tempos de referência: o teste de 400 m só depois de 1 mês de treino', () => {
  // Começando agora: nenhum teste nas duas primeiras semanas
  assert.ok(!gerar(semTempo).some((t) => t.partes.some((p) => p.parte === 'teste')))
  // Treinando desde 01/11: o teste é o primeiro treino a partir de 01/12
  const treinos = generateTrainings({
    rules, library, athlete: semTempo, today: '2026-11-23', random: seeded(1), inicioDosTreinos: '2026-11-01',
  })
  const comTeste = treinos.filter((t) => t.partes.some((p) => p.parte === 'teste'))
  assert.equal(comTeste.length, 1)
  assert.equal(comTeste[0].date, '2026-12-02')
  const primeiro = comTeste[0]
  const ordem = primeiro.partes.map((p) => p.parte)
  assert.deepEqual([ordem[0], ordem[1], ordem.at(-1)], ['aquecimento', 'teste', 'soltura'])
  const teste = primeiro.partes.find((p) => p.parte === 'teste')
  assert.equal(teste.titulo, 'Teste de 400 m')
  assert.match(teste.observacao, /registre o tempo/)
  // O resto da aula: séries com pé de pato em ritmo leve para recuperar
  const recuperar = primeiro.partes.filter((p) => p.parte === 'recuperacao')
  assert.ok(recuperar.length > 0)
  for (const p of recuperar) assert.match(p.texto, /^10 x (50|100) m · c\/PÉ · ritmo leve .* · CR · D\d+" de descanso/)
  assert.ok(primeiro.minutos >= 45 && primeiro.minutos <= 65, `${primeiro.minutos} min`)
  // Quem não nada 400 m sem parar não faz o teste (condicionamento)
  for (const continuousDistance of ['ate_50', '100_200', '200_400']) {
    const iniciante = { ...semTempo, level: 'iniciante', continuousDistance, strokes: ['crawl'] }
    const treinosIniciante = generateTrainings({
      rules, library, athlete: iniciante, today: '2026-11-23', random: seeded(1), inicioDosTreinos: '2026-01-01',
    })
    assert.ok(!treinosIniciante.some((t) => t.partes.some((p) => p.parte === 'teste')), continuousDistance)
  }
  // Com o tempo, não há teste
  const comTempo = generateTrainings({
    rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), inicioDosTreinos: '2026-01-01',
  })
  assert.ok(!comTempo.some((t) => t.partes.some((p) => p.parte === 'teste')))
})

test('sem tempos de referência: o descanso entre as repetições no lugar da saída', () => {
  const textos = [1, 2, 3, 4, 5].flatMap((seed) => semTeste(gerar(semTempo, seed)))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'principal' && p.intensidades).map((p) => p.texto))
  assert.ok(textos.length > 0)
  for (const t of textos) assert.ok(!/a\/c \d/.test(t) && !/AC\)/.test(t) && !/\bA[123]\b/.test(t), t)
  assert.ok(textos.some((t) => /ritmo (leve|moderado|forte)/.test(t)), textos.join('\n'))
  assert.ok(textos.some((t) => /D\d+"? de descanso|D\d+' de descanso/.test(t)), textos.join('\n'))
  // Velocidade do intermediário sem tempo: 20" a 30" de descanso (nunca 1/1)
  const velocidade = [1, 2, 3].flatMap((seed) => semTeste(gerar(semTempo, seed)))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(velocidade.every((t) => /D20" a 30" de descanso/.test(t) && !/1\/1/.test(t)), velocidade.join('\n'))
})

test('quem nada até 400 m sem parar descansa pelo menos 20 a 30 segundos', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
    strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar'], time400: null,
  }
  const descansos = [1, 2, 3, 4].flatMap((seed) => gerar(iniciante, seed)).flatMap((t) => t.partes)
    .flatMap((p) => [...p.texto.matchAll(/D(\d+)" de descanso/g)].map((m) => Number(m[1])))
  assert.ok(descansos.length > 0)
  for (const d of descansos) assert.ok(d >= 20, `${d}"`)
})

test('quem nada só 50 ou 100 m sem parar também tem aquecimento e soltura', () => {
  for (const continuousDistance of ['ate_50', '50_100']) {
    for (const poolLength of [25, 50]) {
      const athlete = {
        level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength, continuousDistance,
        strokes: ['crawl'], equipment: [], time400: null,
      }
      for (const t of gerar(athlete)) {
        const partes = t.partes.map((p) => p.parte)
        assert.ok(partes.includes('aquecimento') && partes.includes('solto'), `${continuousDistance} ${poolLength}: ${partes}`)
      }
    }
  }
})

// ---------- Quem nada pouco sem parar ----------

test('quem nada só 50 m: as séries são adaptadas (4 x 100 vira 8 x 50; com pé de pato os 75 ficam)', () => {
  const semPe = { level: 'iniciante', continuousDistance: 'ate_50', equipment: [] }
  const comPe = { ...semPe, equipment: ['pe_de_pato'] }
  const a = adaptToDistance(rules, serieById('pri-3x4x100'), semPe)
  assert.equal(a.texto, '(3x) 8 x 50')
  assert.equal(a.volume, serieById('pri-3x4x100').volume)
  // 75 sem pé de pato vira 3 x 25; com pé de pato fica 75 (e a série exige pé de pato)
  assert.equal(adaptToDistance(rules, serieById('pri-4x4x75'), semPe).texto, '(4x) 12 x 25')
  const com75 = adaptToDistance(rules, serieById('pri-4x4x75'), comPe)
  assert.equal(com75.texto, '(4x) 4 x 75')
  assert.equal(com75.exigePe, 75)
  // Repetições muito longas (400, 800) não são adaptadas
  assert.equal(adaptToDistance(rules, serieById('pri-3x800'), semPe), null)
  // Quem aguenta, fica como está
  assert.equal(adaptToDistance(rules, serieById('pri-3x4x100'), { ...semPe, continuousDistance: '400_1000' }).texto, '(3x) 4 x 100')
})

test('quem nada até 100 m sem parar: só ritmo leve e sem velocidade; mais variedade de séries', () => {
  for (const [continuousDistance, time400] of [['ate_50', null], ['50_100', { hundredths: 54000 }], ['100_200', null]]) {
    const athlete = {
      level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 2, 3, 4, 5], poolLength: 25, continuousDistance,
      strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar'], time400,
    }
    const treinos = gerar(athlete)
    const principais = treinos.map((t) => t.partes.find((p) => p.parte === 'principal'))
    for (const p of principais) {
      assert.deepEqual(p.intensidades.valores, ['A1'], p.texto)
      assert.ok(!/A[23]|moderado|forte|AC|NEG|POS/.test(p.texto), p.texto)
      if (!time400) assert.match(p.texto, /ritmo leve \(60-70% do seu máximo\)/)
    }
    assert.ok(treinos.every((t) => !t.partes.some((p) => p.parte === 'velocidade')))
    assert.ok(new Set(principais.map((p) => p.serieTexto)).size >= 4, `${continuousDistance}: pouca variedade`)
  }
})

// ---------- Condicionamento e feedback ----------

const condicionando = {
  level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
  strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: null,
}
const fatores = (treinos) => treinos.map((t) => t.plano.fatorPrincipal)

test('condicionamento: a metragem da principal aumenta devagar, treino a treino', () => {
  const treinos = gerar(condicionando)
  const f = fatores(treinos)
  assert.equal(f[0], rules.condicionamento.fatorInicial)
  for (let i = 1; i < f.length; i++) assert.ok(f[i] >= f[i - 1] && f[i] <= rules.condicionamento.fatorMaximo)
  assert.ok(treinos.every((t) => t.plano.condicionamento))
  // Quem nada 400 m sem parar não está no condicionamento
  assert.ok(gerar(avancado).every((t) => !t.plano.condicionamento && t.plano.fatorPrincipal === 1))
})

test('plano interno: esforço esperado de cada treino (o atleta não vê no card)', () => {
  for (const t of gerar(avancado)) {
    assert.ok([4, 6, 8].includes(t.plano.esforcoEsperado), `${t.plano.esforcoEsperado}`)
    assert.ok(t.partes.every((p) => !JSON.stringify(p).includes('esforcoEsperado')))
  }
  // Condicionamento: só ritmo leve
  assert.ok(gerar({ ...condicionando, continuousDistance: '50_100' }).every((t) => t.plano.esforcoEsperado === 4))
})

test('feedback: só ajusta com 3 treinos seguidos fora do esperado', () => {
  const plano = { esforcoEsperado: 4, fatorPrincipal: 0.8 }
  const feitos = (...notas) => notas.map((difficulty) => ({ difficulty, reason: 'respiracao', plan: plano }))
  // 1 ou 2 treinos pesados não mudam nada (pode ser o dia do atleta)
  assert.equal(feedbackAdjustment(rules, condicionando, feitos(9, 9)).carga, 0)
  assert.equal(feedbackAdjustment(rules, condicionando, feitos(9, 9, 5)).carga, 0)
  assert.equal(feedbackAdjustment(rules, condicionando, feitos(9, 5, 9)).carga, 0)
  // 3 seguidos com 8 ou mais, num treino que não era para isso: diminui
  const pesado = feedbackAdjustment(rules, condicionando, feitos(5, 8, 9, 10))
  assert.deepEqual([pesado.carga, pesado.fatorPrincipal, pesado.foco], [-1, 0.7, 'respiracao'])
  // Avançado já está acostumado: 8 não conta, só 9 e 10
  const moderado = { esforcoEsperado: 6, fatorPrincipal: 1 }
  const doAvancado = (...notas) => feedbackAdjustment(rules, avancado, notas.map((difficulty) => ({ difficulty, plan: moderado })))
  assert.equal(doAvancado(8, 8, 8).carga, 0)
  assert.equal(doAvancado(8, 9, 9).carga, 0)
  assert.equal(doAvancado(9, 10, 9).carga, -1)
  assert.equal(feedbackAdjustment(rules, { ...avancado, level: 'intermediario' }, [8, 8, 8].map((difficulty) => ({ difficulty, plan: moderado }))).carga, -1)
  // Treino que era para ser forte (esperado 8) com nota 8: está certo
  const forte = { esforcoEsperado: 8, fatorPrincipal: 1 }
  assert.equal(feedbackAdjustment(rules, avancado, [8, 9, 8].map((difficulty) => ({ difficulty, plan: forte }))).carga, 0)
  // 3 seguidos fáceis demais: aumenta
  const facil = feedbackAdjustment(rules, condicionando, feitos(1, 2, 2))
  assert.deepEqual([facil.carga, facil.fatorPrincipal], [1, 0.9])
  // Já ajustado (o próximo treino montado já tem a carga menor): não ajusta de novo
  assert.equal(feedbackAdjustment(rules, condicionando, feitos(9, 9, 9), 0.7).carga, 0)
  assert.equal(feedbackAdjustment(rules, condicionando, feitos(9, 9, 9), 0.7).fatorPrincipal, 0.7)
  // Sem histórico: o começo do condicionamento; para os outros, o tempo normal
  assert.equal(feedbackAdjustment(rules, condicionando, []).fatorPrincipal, rules.condicionamento.fatorInicial)
  assert.equal(feedbackAdjustment(rules, avancado, []).fatorPrincipal, 1)
  // O foco é o motivo que mais apareceu
  const forca = [
    { difficulty: 9, reason: 'forca', plan: plano }, { difficulty: 8, reason: 'respiracao', plan: plano },
    { difficulty: 9, reason: 'forca', plan: plano },
  ]
  assert.equal(feedbackAdjustment(rules, condicionando, forca).foco, 'forca')
})

test('feedback: os próximos treinos menores; sem A3 nos 2 primeiros quando foi pesado demais', () => {
  const historico = [9, 9, 10].map((difficulty) => ({ difficulty, plan: { esforcoEsperado: 6, fatorPrincipal: 1 } }))
  // (avançado: 3 seguidos com 9 ou mais num treino que era para ser moderado)
  const treinos = generateTrainings({ rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), historico })
  assert.ok(treinos.every((t) => t.plano.fatorPrincipal === 0.9 && t.plano.carga === -1))
  for (const t of treinos.slice(0, 2)) assert.notEqual(t.plano.intensidade, 'A3')
  // (vários sorteios: um só pode cair numa série maior por acaso)
  const seeds = [1, 2, 3, 4, 5, 6]
  const menores = seeds.flatMap((seed) => generateTrainings({ rules, library, athlete: avancado, today: '2026-11-23', random: seeded(seed), historico }))
  const normais = seeds.flatMap((seed) => gerar(avancado, seed))
  const metros = (ts) => ts.reduce((s, t) => s + t.plano.metrosPrincipal, 0)
  assert.ok(metros(menores) < metros(normais), `${metros(menores)} >= ${metros(normais)}`)
})

test('feedback: faltou ar -> repetições curtas; faltou força -> palmar', () => {
  const plano = { esforcoEsperado: 4, fatorPrincipal: 0.8 }
  const comFoco = (reason) => [1, 2, 3, 4].flatMap((seed) => generateTrainings({
    rules, library, athlete: condicionando, today: '2026-11-23', random: seeded(seed),
    historico: [9, 9, 9].map((difficulty) => ({ difficulty, reason, plan: plano })),
  })).map((t) => t.partes.find((p) => p.parte === 'principal'))
  const curtas = (ps) => ps.filter((p) => Math.max(...[...p.serieTexto.matchAll(/x (\d+)/g)].map((m) => Number(m[1]))) <= 50).length
  // Séries (ou a série toda) com palmar ou palmar + pull buoy, sem pé de pato
  const palmar = (ps) => ps.reduce((s, p) => s + (p.texto.match(/c\/PALM/g) ?? []).length, 0)
  const ar = comFoco('respiracao')
  const forca = comFoco('forca')
  assert.ok(curtas(ar) > curtas(forca), `curtas ${curtas(ar)} x ${curtas(forca)}`)
  assert.ok(palmar(forca) > palmar(ar), `palmar ${palmar(forca)} x ${palmar(ar)}`)
})

// ---------- Periodização inteira ----------

test('periodização: montada de trás para frente, com o ciclo do nível e a recuperação', () => {
  const etapas = rules.periodizacao.etapas
  const soma = (plano) => plano.reduce((s, p) => s + p.dias, 0)
  const nomes = (plano) => plano.map((p) => p.etapa).join(' ')
  // Iniciante: duas Acumulações para cada Transição; depois da Transição, 1 semana de recuperação
  assert.equal(nomes(planStages(rules, 84, 'iniciante', 5)), 'acumulacao1 acumulacao2 transicao1 recuperacao realizacao')
  // Antes da Realização, a recuperação só para quem treina mais de 3 vezes por semana
  assert.match(nomes(planStages(rules, 84, 'iniciante', 3)), /^acumulacao1 (acumulacao2 )+transicao1 realizacao$/)
  assert.equal(nomes(planStages(rules, 150, 'iniciante', 3)),
    'acumulacao1 acumulacao2 transicao1 recuperacao acumulacao1 acumulacao2 transicao2 realizacao')
  // Avançado: uma de cada (suporta mais pancada)
  assert.match(nomes(planStages(rules, 150, 'avancado')), /transicao1 recuperacao acumulacao2 transicao2 recuperacao acumulacao2 transicao2 recuperacao realizacao$/)
  // Iniciante com a prova mais longe: A1-A2-T-(rec)-A1-A2-T-(rec)-R
  assert.equal(nomes(planStages(rules, 150, 'iniciante')),
    'acumulacao1 acumulacao2 transicao1 recuperacao acumulacao1 acumulacao2 transicao2 recuperacao realizacao')
  // Realização: uma semana só (6 a 8 dias)
  for (const level of ['iniciante', 'avancado']) {
    for (const total of [45, 84, 150]) {
      const r = planStages(rules, total, level).at(-1)
      assert.ok(r.dias >= 6 && r.dias <= 8, `${level} ${total}: ${r.dias}`)
    }
  }
  for (const level of ['iniciante', 'intermediario', 'avancado']) {
    for (const total of [28, 45, 56, 70, 84, 120, 180, 240]) {
      const plano = planStages(rules, total, level)
      const texto = `${level} ${total}: ${JSON.stringify(plano)}`
      assert.equal(soma(plano), total, texto)
      // Sempre termina na Realização (antes da prova) e começa na Acumulação (base)
      assert.equal(plano.at(-1).etapa, 'realizacao', texto)
      assert.equal(etapas[plano[0].etapa].fase, 'acumulacao', texto)
      plano.forEach((p, k) => {
        assert.ok(p.dias <= etapas[p.etapa].dias[1], texto)
        // Toda Transição é seguida da semana de recuperação
        if (etapas[p.etapa].fase === 'transicao') assert.equal(plano[k + 1].etapa, 'recuperacao', texto)
        if (p.etapa === 'recuperacao') assert.equal(p.dias, 7)
      })
    }
  }
  // Curtíssimo: só a Realização
  assert.equal(nomes(planStages(rules, 10, 'avancado')), 'realizacao')
  // A semana dentro da etapa
  const etapaDe = periodPhases(rules, '2026-01-01', '2026-03-31', 'avancado')
  assert.deepEqual(etapaDe('2026-01-01'), { etapa: 'acumulacao1', nome: 'Acumulação 1', fase: 'acumulacao', semanaDaFase: 1 })
  assert.equal(etapaDe('2026-01-08').semanaDaFase, 2)
  assert.equal(etapaDe('2026-03-31').etapa, 'realizacao')
})

test('periodização: cada etapa muda o treino', () => {
  const periodizacao = { inicio: '2026-11-23', fim: '2027-02-20', testeNaTransicao: false }
  // 5 treinos por semana: tem a semana de recuperação antes da Realização
  const treinos = [1, 2, 3].flatMap((seed) => generateTrainings({
    rules, library, athlete: { ...avancado, trainingDays: [1, 2, 3, 4, 5] }, today: '2026-11-23', random: seeded(seed), periodizacao,
  }))
  const daEtapa = (e) => treinos.filter((t) => t.plano.etapa === e)
  const principais = (e) => daEtapa(e).flatMap((t) => t.partes.filter((p) => p.parte === 'principal'))
  // Acumulação: só A1/A2 (nada de A3, AC, NEG, POS, final forte). O 400 com 30 AC
  // (30" acima do melhor, com pé de pato e palmar) é aeróbio: pode
  for (const p of [...principais('acumulacao1'), ...principais('acumulacao2')]) {
    assert.ok(!/A3|(?<!30 )AC\)|NEG|POS|NAD x 25 fo/.test(p.texto), p.texto)
  }
  // Intervalo entre as séries: 2' em todas as etapas (o treinador achou 3' grande demais)
  const intervalos = (e) => principais(e).map((p) => p.intervalo).filter(Boolean)
  assert.ok([...intervalos('acumulacao1'), ...intervalos('acumulacao2')].every((i) => i.startsWith("2'")), intervalos('acumulacao1').join(', '))
  // Transição: entra o A3; Realização: menos volume
  assert.ok([...principais('transicao1'), ...principais('transicao2')].some((p) => /A3|AC\)|fo\)/.test(p.texto)))
  const media = (e) => daEtapa(e).reduce((s, t) => s + t.plano.fatorPrincipal, 0) / daEtapa(e).length
  assert.ok(media('realizacao') < media('acumulacao2'))
  // Transição: o avançado aperta a velocidade nos 25 m a cada 25"; na Realização, cd 30"
  const velocidadeDa = (...etapas) => etapas.flatMap((e) => daEtapa(e)).flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade'))
  // (de crawl; nos outros estilos o tempo de nado é maior)
  const crawl25 = (lista) => lista.filter((p) => /^\d+ x 25 m.*· CR · a\/c/.test(p.texto))
  assert.ok(crawl25(velocidadeDa('transicao1', 'transicao2')).length > 0)
  assert.ok(crawl25(velocidadeDa('transicao1', 'transicao2')).every((p) => /a\/c 25"/.test(p.texto)))
  assert.ok(crawl25(velocidadeDa('realizacao')).every((p) => !/a\/c 25"/.test(p.texto)))
  // Semana de recuperação: só ritmo leve, volume baixo, sem velocidade
  for (const t of daEtapa('recuperacao')) {
    assert.ok(!t.partes.some((p) => p.parte === 'velocidade'))
    for (const p of t.partes.filter((x) => x.parte === 'principal')) assert.deepEqual(p.intensidades.valores, ['A1'])
  }
  assert.ok(daEtapa('recuperacao').length > 0)
  // Plano guarda a etapa
  assert.ok(treinos.every((t) => t.plano.nomeDaEtapa))
})

test('periodização: gera todos os treinos até a prova, com o plano de cada um', () => {
  const periodizacao = { inicio: '2026-11-23', fim: '2027-01-31', testeNaTransicao: true, numeroInicial: 1 }
  const treinos = generateTrainings({ rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), periodizacao })
  // Seg, qua e sex de 23/11 a 31/01
  assert.equal(treinos.length, trainingDates('2026-11-23', [1, 3, 5], 70).length)
  assert.equal(treinos.at(-1).date <= '2027-01-31', true)
  assert.deepEqual(treinos.map((t) => t.plano.numero), treinos.map((_, i) => i + 1))
  const fases = treinos.map((t) => t.plano.fase)
  // 3 treinos por semana: sem a recuperação antes da Realização
  assert.deepEqual([...new Set(fases)], ['acumulacao', 'transicao', 'realizacao'])
  for (const t of treinos) {
    for (const campo of ['semanaDaFase', 'intensidade', 'esforcoEsperado', 'metrosPrincipal', 'tipoPrincipal', 'diaDeTeste', 'recuperacao', 'material']) {
      assert.ok(t.plano[campo] !== undefined, campo)
    }
  }
  // Um teste só: o 1º treino da Transição
  const testes = treinos.filter((t) => t.plano.diaDeTeste)
  assert.equal(testes.length, 1)
  assert.equal(testes[0], treinos.find((t) => t.plano.fase === 'transicao'))
  // Sem permissão para o teste (ex.: só informou o tempo, 1ª vez): nenhum
  const semTeste = generateTrainings({
    rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), periodizacao: { ...periodizacao, testeNaTransicao: false },
  })
  assert.ok(semTeste.every((t) => !t.plano.diaDeTeste))
  // Condicionamento (não nada 400 m): nunca tem teste
  const cond = generateTrainings({
    rules, library, athlete: { ...condicionando, time400: { hundredths: 54000 } }, today: '2026-11-23', random: seeded(1), periodizacao,
  })
  assert.ok(cond.every((t) => !t.plano.diaDeTeste))
})

// ---------- Material entre as séries ----------

test('(2x), (3x), (4x)...: cada série com um material diferente da anterior', () => {
  const athletes = [
    avancado,
    { ...avancado, level: 'intermediario' },
    { ...condicionando, continuousDistance: '200_400' },
    { ...condicionando, continuousDistance: '50_100' },
  ]
  let vistas = 0
  let comecaNadando = 0
  let iniciantes = 0
  for (const athlete of athletes) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const p of gerar(athlete, seed).flatMap((t) => t.partes)) {
        if (!['principal', 'velocidade'].includes(p.parte)) continue
        const linhas = p.texto.split('\n').filter((l) => /^\d+ª série:/.test(l))
        if (linhas.length < 2) continue
        const serie = serieById(p.serieId)
        if (serie?.exige.material.length > 0 || serie?.materialPorSerie) continue
        vistas++
        const materiais = linhas.map((l) => (l.match(/(NAD|c\/[A-ZÉ+ ]+?)(?= ·|$)/) ?? [''])[0].trim())
        materiais.slice(1).forEach((m, i) => assert.notEqual(m, materiais[i], p.texto))
        if (athlete.level !== 'avancado') {
          iniciantes++
          if (materiais[0] === 'NAD') comecaNadando++
        }
      }
    }
  }
  assert.ok(vistas > 10, `poucas séries: ${vistas}`)
  // Iniciante e intermediário: quase sempre começam nadando
  assert.ok(comecaNadando / iniciantes > 0.6, `${comecaNadando} de ${iniciantes}`)
})

test('periodização: volume da Transição 85%; Realização caindo de 85% a 60%', () => {
  const periodizacao = { inicio: '2026-11-23', fim: '2027-02-20', testeNaTransicao: false }
  const treinos = generateTrainings({
    rules, library, athlete: { ...avancado, trainingDays: [0, 1, 2, 3, 4, 5, 6] }, today: '2026-11-23', random: seeded(1), periodizacao,
  })
  const fatores = (etapa) => treinos.filter((t) => t.plano.etapa === etapa).map((t) => t.plano.fatorPrincipal)
  assert.ok([...fatores('transicao1'), ...fatores('transicao2')].every((f) => f === 0.85))
  const r = fatores('realizacao')
  assert.ok(r.length >= 6)
  assert.equal(r[0], 0.85)
  assert.equal(r.at(-1), 0.6)
  for (let i = 1; i < r.length; i++) assert.ok(r[i] < r[i - 1], r.join(', '))
  assert.ok(fatores('acumulacao1').every((f) => f === 1))
})

test('prova importante no meio da preparação: o volume cai aos poucos na semana dela, nada mais muda', () => {
  const base = { inicio: '2026-11-23', fim: '2027-02-20', testeNaTransicao: false }
  const athlete = { ...avancado, trainingDays: [0, 1, 2, 3, 4, 5, 6] }
  const gerar2 = (provas) => generateTrainings({
    rules, library, athlete, today: '2026-11-23', random: seeded(1), periodizacao: { ...base, provas },
  })
  const sem = gerar2([])
  const com = gerar2(['2026-12-20'])
  const fator = (ts, date) => ts.find((t) => t.date === date).plano.fatorPrincipal
  // Antes da semana da prova: igual
  assert.equal(fator(com, '2026-12-13'), fator(sem, '2026-12-13'))
  // Na semana: vai caindo, até uns 12,5% a menos no dia da prova
  const semana = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19', '2026-12-20']
  const f = semana.map((d) => fator(com, d) / fator(sem, d))
  for (let i = 1; i < f.length; i++) assert.ok(f[i] <= f[i - 1], f.join(', '))
  assert.ok(f.at(-1) >= 0.85 && f.at(-1) <= 0.9, `${f.at(-1)}`)
  // Depois da prova volta ao normal; a etapa e as intensidades não mudam
  assert.equal(fator(com, '2026-12-21'), fator(sem, '2026-12-21'))
  assert.deepEqual(com.map((t) => t.plano.etapa), sem.map((t) => t.plano.etapa))
})

test('sem prova: periodização padrão A-T-R (8 semanas = A 28, T 21, R 7)', () => {
  for (const level of ['iniciante', 'avancado']) {
    assert.deepEqual(planStages(rules, 56, level, 5, true), [
      { etapa: 'acumulacao1', dias: 28 }, { etapa: 'transicao1', dias: 21 }, { etapa: 'realizacao', dias: 7 },
    ])
  }
})

test('aula de 30 min: qualquer nível pode fazer uma série só, para caber no tempo', () => {
  const opcoes = (minutos) => setOptions(rules, 'principal', serieById('pri-2x10x100'), 'avancado', minutos).map((s) => s.texto)
  assert.ok(opcoes(30).includes('10 x 100'))
  assert.ok(!opcoes(60).includes('10 x 100'))
})

test('velocidade: o estilo vai escrito no card (CR, CO, PE, BO ou medley)', () => {
  const textos = [1, 2, 3, 4, 5, 6].flatMap((seed) => gerar(avancado, seed))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(textos.length > 0)
  for (const t of textos) assert.match(t, /\b(CR|CO|PE|BO|MD|ME)\b|estilo/, t)
  // Só os estilos que o atleta nada
  const soCrawl = [1, 2, 3].flatMap((seed) => gerar({ ...avancado, strokes: ['crawl'], bestStroke: null }, seed))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(soCrawl.every((t) => /\bCR\b/.test(t) && !/\b(CO|PE|BO)\b/.test(t)), soCrawl.join('\n'))
})

test('treino mais leve depois de faltas: as intensidades descem um degrau, as séries ficam', () => {
  const [treino] = gerar(avancado, 3).filter((t) => t.plano.intensidade === 'A3')
  assert.ok(treino, 'precisa de um treino com A3')
  const leve = lightenTraining(rules, avancado, treino)
  assert.equal(leve.plano.maisLeve, true)
  assert.equal(leve.plano.intensidade, 'A2')
  assert.deepEqual(leve.partes.map((p) => p.serieId), treino.partes.map((p) => p.serieId))
  for (const p of leve.partes.filter((x) => x.intensidades)) {
    assert.ok(!p.intensidades.valores.includes('A3'), p.texto)
    assert.ok(!/\bA3\b|AC\)|NEG|POS/.test(p.texto), p.texto)
  }
})

test('avançado: depois das faltas só o A3 sai (o resto fica como estava)', () => {
  const [treino] = gerar(avancado, 3).filter((t) => t.plano.intensidade === 'A3')
  const leve = lightenTraining(rules, avancado, treino, 'tirarA3')
  assert.equal(leve.plano.intensidade, 'A2')
  treino.partes.forEach((p, i) => {
    if (!p.intensidades) return
    const antes = p.intensidades.valores
    const depois = leve.partes[i].intensidades.valores
    antes.forEach((v, k) => {
      if (v === 'A3' || /^([1-9]|10) AC$/.test(v)) assert.equal(depois[k], 'A2')
      else assert.equal(depois[k], v)
    })
  })
})

test('a 2ª série principal nunca é igual à 1ª no mesmo treino', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const t of gerar({ ...avancado, sessionMinutes: 90 }, seed)) {
      const [a, b] = t.partes.filter((p) => p.parte === 'principal')
      if (b) assert.notEqual(a.serieTexto, b.serieTexto, `${t.date}: ${a.serieTexto}`)
    }
  }
})

test('série principal: o card sempre diz o estilo (CR na livre; os estilos de cada série na mistura)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const t of gerar(avancado, seed)) {
      for (const p of t.partes.filter((x) => x.parte === 'principal')) {
        assert.match(p.texto, /\b(CR|CO|PE|BO|MD|ME)\b|estilo/, p.texto)
      }
    }
  }
})

test('cd dos estilos: o tempo de nado do crawl x o fator do estilo; o descanso da tabela geral', () => {
  const a = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const crawl = saidaFor(rules, a, { distancia: 100 }, 'A1')
  const peito = saidaFor(rules, a, { distancia: 100 }, 'A1', rules.saidas.fatorDoEstilo.peito)
  // 100 A1 = 1'30" de crawl + 20" (tabela do crawl) = 1'50"; de peito (+35%) 2'01" + 25"
  // de descanso (tabela geral) -> 2'25"
  assert.equal(crawl, 110)
  assert.equal(peito, 145)
  // Série que mistura estilos: vale o mais lento
  const variation = { nado: 'misto', porSerie: [['costas', 'peito'], ['crawl']] }
  // (todos os estilos com +35%)
  for (const estilo of ['costas', 'peito', 'borboleta', 'medley']) assert.equal(rules.saidas.fatorDoEstilo[estilo], 1.35)
  assert.equal(strokeFactor(rules, variation, 0), 1.35)
  assert.equal(strokeFactor(rules, variation, 1), 1)
  assert.equal(strokeFactor(rules, { nado: 'livre', nadoAbrev: 'CR' }), 1)
  assert.equal(strokeFactor(rules, { nado: 'medley' }), rules.saidas.fatorDoEstilo.medley)
})

test('cd dos estilos bate com a experiência do treinador (avançado): 100 a cada 2\' e 200 a cada 4\'', () => {
  // Avançado com o 100 de crawl a cada 1'30" (teste de 400 em 4'40")
  const a = { level: 'avancado', tabela: timeTable(rules, 280), teste400: 280 }
  const medley = rules.saidas.fatorDoEstilo.medley
  const cd = (distancia, fator) => saidaFor(rules, a, { distancia }, 'A1', fator)
  assert.ok(Math.abs(cd(100, 1) - 90) <= 5, `crawl 100: ${cd(100, 1)}`)
  assert.ok(Math.abs(cd(100, medley) - 120) <= 5, `estilo 100: ${cd(100, medley)}`)
  assert.ok(Math.abs(cd(200, medley) - 240) <= 10, `estilo 200: ${cd(200, medley)}`)
})

// Ordem de cada linha da série principal: como nada · intensidade · estilo · tempo
const ordemDaLinha = (l) => {
  const pos = (re) => { const m = re.exec(l); return m ? m.index : -1 }
  const posicoes = [
    pos(/(?:^|: | · )(NAD|c\/(?:PÉ|PALM|BOIA|SNK|PARA)[^·]*)(?= ·|$)/),
    pos(/ · (A[123]|\([^)]*\)|ritmo (leve|moderado|forte)[^·]*)(?= ·|$)/),
    pos(/ · (CR|CO|PE|BO|MD|ME)\b/),
    pos(/ · (\d+ )?(a\/c \d|D\d+"( a \d+")? de descanso)/),
  ].filter((p) => p >= 0)
  return posicoes.every((p, i) => i === 0 || p > posicoes[i - 1])
}

test('regra: cada linha da principal segue a ordem como nada · intensidade · estilo · tempo', () => {
  let linhas = 0
  for (const athlete of [avancado, { ...avancado, time400: null }, { ...avancado, level: 'intermediario' }]) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const p of gerar(athlete, seed).flatMap((t) => t.partes).filter((x) => x.parte === 'principal')) {
        for (const l of p.texto.split('\n')) {
          linhas++
          assert.ok(ordemDaLinha(l), `${l}\n(${p.texto})`)
        }
        // Com a descrição de cada série, o estilo e o tempo vão nela (não no cabeçalho)
        const [cabecalho, ...resto] = p.texto.split('\n')
        if (resto.some((l) => /^\dª série:/.test(l))) {
          assert.ok(!/ · (CR|CO|PE|BO|MD|ME)\b| · a\/c \d/.test(cabecalho), p.texto)
        }
      }
    }
  }
  assert.ok(linhas > 100)
})

test('regra da borboleta na principal: até 100 m, de preferência com pé de pato, quase nunca com palmar + boia', () => {
  let comBorboleta = 0
  let comPalmarBoia = 0
  let comPe = 0
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const t of gerar({ ...avancado, sessionMinutes: 90 }, seed)) {
      for (const p of t.partes.filter((x) => x.parte === 'principal')) {
        for (const l of p.texto.split('\n').filter((x) => /\bBO\b/.test(x))) {
          comBorboleta++
          if (/c\/PALM \+ BOIA/.test(l)) comPalmarBoia++
          if (/c\/PÉ/.test(l)) comPe++
        }
        if (/\bBO\b(?!\/)/.test(p.texto)) {
          const maior = Math.max(...[...p.serieTexto.matchAll(/x (\d+)/g)].map((m) => Number(m[1])))
          assert.ok(maior <= 100, p.texto)
        }
      }
    }
  }
  assert.ok(comBorboleta > 5, `borboleta em ${comBorboleta} linhas`)
  assert.ok(comPalmarBoia / comBorboleta < 0.1, `${comPalmarBoia} de ${comBorboleta} com palmar + boia`)
  assert.ok(comPe / comBorboleta > 0.4, `${comPe} de ${comBorboleta} com pé de pato`)
})

test('avançado voltando de parada: borboleta da principal bem rara e curta nos primeiros meses', () => {
  const contar = (athlete, inicio) => {
    let linhas = 0
    let longas = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const treinos = generateTrainings({ rules, library, athlete, today: '2026-11-23', inicioDosTreinos: inicio, random: seeded(seed) })
      for (const t of treinos.filter((x) => x.date < '2026-12-20')) {
        for (const p of t.partes.filter((x) => x.parte === 'principal' && /\bBO\b(?!\/)/.test(x.texto))) {
          linhas += (p.texto.match(/\bBO\b/g) ?? []).length
          const maior = Math.max(...[...p.serieTexto.matchAll(/x (\d+)/g)].map((m) => Number(m[1])))
          if (maior > 50) longas++
        }
      }
    }
    return { linhas, longas }
  }
  const base = { ...avancado, sessionMinutes: 90 }
  const normal = contar({ ...base, recentBreak: 'nao' }, '2026-11-23')
  const voltando = contar({ ...base, recentBreak: '1_6m' }, '2026-11-23')
  const depois = contar({ ...base, recentBreak: '1_6m' }, '2026-09-01')
  const inicio2meses = '2026-10-22'
  assert.equal(voltando.longas, 0, 'nada de borboleta acima de 50 m')
  assert.ok(voltando.linhas < normal.linhas / 2, `voltando ${voltando.linhas} x normal ${normal.linhas}`)
  assert.ok(depois.linhas > voltando.linhas, 'depois da adaptação a borboleta volta')
  // Quem caiu de nível (parado mais de 6 meses) também conta como avançado voltando: 2 meses
  assert.equal(contar({ ...base, level: 'intermediario', nivelAntesDaParada: 'avancado', recentBreak: 'mais_6m' }, inicio2meses).longas, 0)
})

test('avançado voltando com borboleta de melhor estilo: um pouco menos de borboleta só no primeiro mês', () => {
  const contar = (athlete, inicio) => {
    let reps = 0
    let longas = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const t of generateTrainings({ rules, library, athlete, today: '2026-11-23', inicioDosTreinos: inicio, random: seeded(seed) }).filter((x) => x.date < '2026-12-20')) {
        for (const p of t.partes.filter((x) => x.parte === 'principal' && /\b(BO|ME)\b(?!\/)/.test(x.texto))) {
          reps += (p.texto.match(/\b(BO|ME)\b/g) ?? []).length
          if (Math.max(...[...p.serieTexto.matchAll(/x (\d+)/g)].map((m) => Number(m[1]))) > 100) longas++
        }
      }
    }
    return { reps, longas }
  }
  const base = { ...avancado, bestStroke: 'borboleta', sessionMinutes: 90 }
  const normal = contar({ ...base, recentBreak: 'nao' }, '2026-11-23')
  const voltando = contar({ ...base, recentBreak: 'mais_6m', nivelAntesDaParada: 'avancado' }, '2026-11-23')
  assert.equal(voltando.longas, 0)
  assert.ok(voltando.reps < normal.reps * 0.8, `voltando ${voltando.reps} x normal ${normal.reps}`)
  assert.ok(voltando.reps > 0, 'continua tendo um pouco de borboleta')
  // Passado o primeiro mês, volta ao normal (mesmo parado mais de 6 meses)
  const generator = { rules, athlete: { ...base, recentBreak: 'mais_6m', nivelAntesDaParada: 'avancado' } }
  assert.equal(emAdaptacaoDaBorboleta(generator.rules, generator.athlete, '2026-11-01', '2026-11-29'), true)
  assert.equal(emAdaptacaoDaBorboleta(generator.rules, generator.athlete, '2026-11-01', '2026-12-02'), false)
  assert.equal(emAdaptacaoDaBorboleta(generator.rules, { ...generator.athlete, bestStroke: 'costas' }, '2026-11-01', '2026-12-02'), true)
})

test('borboleta dividida no card: "BO/CO T/100" na repetição de 200', () => {
  const linhas = Array.from({ length: 40 }, (_, k) => k + 1).flatMap((seed) => gerar({ ...avancado, sessionMinutes: 90 }, seed))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'principal'))
    .flatMap((p) => p.texto.split('\n').map((l) => ({ l, serie: p.serieTexto })))
    .filter(({ l }) => /BO\/(CO|CR)/.test(l))
  assert.ok(linhas.length > 0, 'nenhuma borboleta dividida')
  for (const { l, serie } of linhas) {
    const metade = Math.max(...[...serie.matchAll(/x (\d+)/g)].map((m) => Number(m[1]))) / 2
    const trocas = [...l.matchAll(/BO\/(?:CO|CR)( T\/\d+)?/g)].map((m) => m[1]?.trim())
    for (const t of trocas) assert.equal(t, `T/${metade}`, l)
  }
})

test('perna: o card diz o estilo (um, dois alternando ou medley); com pé de pato, nada de peito', () => {
  const formatos = { um: 0, dois: 0, medley: 0 }
  const QUATRO_PERNA = { ...avancado, sessionMinutes: 90, bestStroke: 'peito', equipment: ['pe_de_pato', 'palmar', 'pull_buoy'] }
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const t of gerar(QUATRO_PERNA, seed)) {
      for (const p of t.partes.filter((x) => x.parte === 'perna')) {
        assert.match(p.texto, /\b(CR|CO|PE|BO|MD)\b/, p.texto)
        const comPe = /c\/PÉ(?! de)/.test(p.texto)
        // Com pé de pato: nem peito nem medley
        if (comPe) assert.ok(!/· (PE|MD)\b|\| PE\b/.test(p.texto), p.texto)
        if (/ \| /.test(p.texto)) formatos.dois++
        else if (/· MD\b/.test(p.texto)) formatos.medley++
        else formatos.um++
      }
    }
  }
  assert.ok(formatos.um > 0 && formatos.dois > 0, JSON.stringify(formatos))
  // Sem pé de pato: o medley e o peito podem entrar
  const semPe = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => gerar({ ...QUATRO_PERNA, equipment: [] }, seed))
    .flatMap((t) => t.partes.filter((x) => x.parte === 'perna').map((p) => p.texto))
  assert.ok(semPe.some((tx) => /\bMD\b/.test(tx)), semPe.join('\n'))
  assert.ok(semPe.some((tx) => /\bPE\b/.test(tx)), semPe.join('\n'))
})


test('descanso do avançado nas séries só de crawl (tabela do treinador)', () => {
  const crawl = { 50: 17.5, 100: 20, 150: 30, 200: 40, 300: 50, 400: 60, 800: 120 }
  for (const [d, s] of Object.entries(crawl)) {
    const { min, max } = restFor(rules, 'avancado', Number(d), true)
    assert.equal((min + max) / 2, s, `${d} m`)
  }
  // 50 m: 15" a 20"
  assert.deepEqual(restFor(rules, 'avancado', 50, true), { min: 15, max: 20 })
  // Fora da série de crawl, a tabela geral continua (100 m: 20" a 30")
  assert.deepEqual(restFor(rules, 'avancado', 100), { min: 20, max: 30 })
  // Os outros níveis não mudam
  assert.deepEqual(restFor(rules, 'intermediario', 100, true), restFor(rules, 'intermediario', 100))
  // No cd: 200 m A1 de crawl = tempo do A1 + 40"
  const a = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const a1de200 = saidaFor(rules, a, { distancia: 200 }, 'A1')
  assert.equal(a1de200 % 5, 0)
})

test('saída do A2/A3: sempre a do A1; só o avançado, a partir da Transição, em 40% das séries, fica com a sua', () => {
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  const I = { unidade: 'serie', valores: ['A1', 'A2', 'A3'] }
  // 200 m: o A3 mais rápido que o A1, mesmo assim sai junto com o A1 (mais descanso)
  const longas = saidasDaSerie(rules, avancado, { vezes: 3, blocos: [{ repeticoes: 1, distancia: 200 }] }, I)
  assert.equal(new Set(longas).size, 1, longas.join(', '))
  // Com a saída por intensidade: o A3 sai antes
  const porIntensidade = saidasDaSerie(rules, avancado, { vezes: 3, blocos: [{ repeticoes: 1, distancia: 200 }] }, I, true)
  assert.ok(porIntensidade[2] < porIntensidade[0], porIntensidade.join(', '))
  // Sorteio: só avançado, só na Transição e na Realização, ~40%
  const sorteios = (athlete) => Array.from({ length: 2000 }, (_, k) => sorteiaSaidaPorIntensidade(rules, athlete, seeded(k + 1)))
  const fracao = (lista) => lista.filter(Boolean).length / lista.length
  assert.equal(fracao(sorteios({ level: 'intermediario', fase: 'transicao' })), 0)
  assert.equal(fracao(sorteios({ level: 'avancado', fase: 'acumulacao' })), 0)
  for (const fase of ['transicao', 'realizacao']) {
    const f = fracao(sorteios({ level: 'avancado', fase }))
    assert.ok(f > 0.33 && f < 0.47, `${fase}: ${f}`)
  }
})

test('A3 seguido: só na mesma semana, uma vez por semana, em até 35% das semanas; nunca 3 seguidos', () => {
  const semanaDe = (iso) => { const ms = Date.parse(`${iso}T12:00:00Z`); return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10) }
  let pares = 0
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const treinos = generateTrainings({ rules, library, athlete: { ...avancado, trainingDays: [1, 2, 3, 4, 5] }, today: '2026-11-23', random: seeded(seed),
      periodizacao: { inicio: '2026-11-23', fim: '2027-03-01', semProva: true } })
    const a3 = (t) => t.plano.intensidade === 'A3' && !t.plano.diaDeTeste
    const semanas = new Map()
    treinos.forEach((t, k) => {
      if (k === 0 || !a3(t) || !a3(treinos[k - 1])) return
      // Só na Transição e na Realização (nunca na Acumulação)
      assert.ok(['transicao', 'realizacao'].includes(t.plano.fase), t.plano.fase)
      assert.ok(!(k > 1 && a3(treinos[k - 2])), `3 seguidos: ${t.date}`)
      assert.equal(semanaDe(treinos[k - 1].date), semanaDe(t.date))
      semanas.set(semanaDe(t.date), (semanas.get(semanaDe(t.date)) ?? 0) + 1)
      pares++
    })
    assert.ok([...semanas.values()].every((n) => n === 1))
    assert.ok(semanas.size <= Math.floor(0.35 * new Set(treinos.map((t) => semanaDe(t.date))).size))
  }
  assert.ok(pares > 0, 'nenhum A3 seguido: a regra deixa acontecer às vezes')
})

test('feedback: 3 treinos seguidos com nota 3 ou menos deixam os próximos mais difíceis', () => {
  const plan = (esforcoEsperado) => ({ esforcoEsperado, fatorPrincipal: 1 })
  const atleta = { level: 'intermediario', continuousDistance: '1000_2000' }
  // Esperado 4 (A1) com notas 3: antes não mudava (só 2 abaixo); agora é fácil
  const historico = [3, 3, 3].map((difficulty) => ({ difficulty, plan: plan(4) }))
  assert.equal(feedbackAdjustment(rules, atleta, historico).carga, 1)
  // Um com 4: não
  assert.equal(feedbackAdjustment(rules, atleta, [3, 4, 3].map((difficulty) => ({ difficulty, plan: plan(4) }))).carga, 0)
})

test('prova no crawl (triatlo, águas abertas, livre): a série principal é só crawl', () => {
  const comEstilos = { ...avancado, strokes: ['crawl', 'costas', 'peito', 'borboleta'], bestStroke: 'peito' }
  const periodizacao = { inicio: '2026-11-23', fim: '2027-03-20', testeNaTransicao: false, numeroInicial: 1, provas: [] }
  for (const athlete of [{ ...comEstilos, modalidade: 'triatlo' }, { ...comEstilos, modalidade: 'piscina_25', prova: { distancia: 200, estilo: 'crawl', metaCentesimos: null } }]) {
    for (const seed of [1, 2]) {
      const treinos = generateTrainings({ rules, library, athlete, today: '2026-11-23', random: seeded(seed), periodizacao })
      for (const p of treinos.flatMap((t) => t.partes).filter((x) => x.parte === 'principal')) {
        assert.doesNotMatch(p.texto, /· (CO|PE|BO|MD|ME)\b|estilo|medley/i, p.texto)
      }
    }
  }
  // Prova de peito: o "melhor estilo" da principal é o peito
  const peito = { ...comEstilos, bestStroke: 'costas', modalidade: 'piscina_25', prova: { distancia: 100, estilo: 'peito', metaCentesimos: null } }
  const linhas = [1, 2, 3].flatMap((seed) => generateTrainings({ rules, library, athlete: peito, today: '2026-11-23', random: seeded(seed), periodizacao }))
    .flatMap((t) => t.partes).filter((x) => x.parte === 'principal').map((p) => p.texto).join('\n')
  assert.match(linhas, /PE|ME/)
  assert.doesNotMatch(linhas, /\b(CO|BO|MD)\b|medley/)
})

test('condicionamento com prova alvo: tem Transição e Realização (sem prova, fica na Acumulação)', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '100_200',
    strokes: ['crawl'], equipment: [], time400: null, modalidade: 'triatlo',
  }
  const fases = (semProva) => new Set(generateTrainings({
    rules, library, athlete: iniciante, today: '2026-11-23', random: seeded(1),
    periodizacao: { inicio: '2026-11-23', fim: '2027-03-20', testeNaTransicao: false, numeroInicial: 1, provas: [], semProva },
  }).map((t) => t.plano.fase))
  const comProva = fases(false)
  assert.ok(comProva.has('transicao') && comProva.has('realizacao'), [...comProva].join(','))
  assert.deepEqual([...fases(true)].filter((f) => f !== 'acumulacao' && f !== 'recuperacao'), [])
})

test('séries de teste: o nado contínuo cresce aos poucos até a distância da prova', async () => {
  const { testSeriesDistance } = await import('./generator.js')
  const atleta = { level: 'iniciante', continuousDistance: '100_200', provas: [{ distancia: 750, estilo: 'crawl' }] }
  // Começa um passo acima do que nada hoje (100 m -> 150 m)
  assert.deepEqual(testSeriesDistance(rules, atleta, []), { distancia: 150, alvo: 750 })
  // Já nada a distância da prova: não precisa
  assert.equal(testSeriesDistance(rules, { ...atleta, continuousDistance: '1000_2000' }, []), null)
  const feito = (distancia, difficulty, nonstop = true, esforcoEsperado = 6) => ({ difficulty, nonstop, plan: { esforcoEsperado, serieDeTeste: { distancia } } })
  // 3 seguidos sem parar e no esforço de sempre: sobe (+50 até 400 m; +100 até 1 km)
  assert.equal(testSeriesDistance(rules, atleta, [feito(150, 6), feito(150, 5), feito(150, 6)]).distancia, 200)
  assert.equal(testSeriesDistance(rules, atleta, [feito(400, 6), feito(400, 5), feito(400, 6)]).distancia, 500)
  // Só 2: mantém
  assert.equal(testSeriesDistance(rules, atleta, [feito(150, 6), feito(150, 6)]).distancia, 150)
  // Não nadou sem parar: desce um passo na hora
  assert.equal(testSeriesDistance(rules, atleta, [feito(300, 6), feito(300, 6, false)]).distancia, 250)
  // 10 onde era 8 ou 9: desce; 10 num treino de 6 não é esse caso (conta como pesado)
  assert.equal(testSeriesDistance(rules, atleta, [feito(300, 10, true, 8)]).distancia, 250)
  assert.equal(testSeriesDistance(rules, atleta, [feito(300, 10, true, 6)]).distancia, 300)
  // 3 seguidos pesados: desce
  assert.equal(testSeriesDistance(rules, atleta, [feito(300, 9), feito(300, 8), feito(300, 9)]).distancia, 250)
  // Nunca passa da prova
  assert.equal(testSeriesDistance(rules, atleta, [feito(700, 5), feito(700, 5), feito(700, 5)]).distancia, 750)
  // No treino: "Nado contínuo" antes da série principal, e fica no plano
  const iniciante = {
    level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '100_200',
    strokes: ['crawl'], equipment: [], time400: null, modalidade: 'triatlo', provas: [{ distancia: 750, estilo: 'crawl' }],
  }
  const treinos = generateTrainings({
    rules, library, athlete: iniciante, today: '2026-11-23', random: seeded(1),
    periodizacao: { inicio: '2026-11-23', fim: '2027-03-20', testeNaTransicao: false, numeroInicial: 1, provas: [], semProva: false },
  })
  for (const t of treinos.filter((x) => !x.plano.diaDeTeste)) {
    const i = t.partes.findIndex((p) => p.parte === 'continuo')
    assert.ok(i >= 0, t.date)
    assert.equal(t.partes[i + 1]?.parte, 'principal')
    assert.match(t.partes[i].texto, /^150 m · CR · sem parar/)
    assert.equal(t.plano.serieDeTeste.distancia, 150)
    assert.doesNotMatch(t.partes[i].texto + t.partes[i].titulo + t.partes[i].observacao, /teste/i) // o atleta não sabe
  }
})

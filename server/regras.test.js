import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describe, loadPart, validate } from './series/index.js'
import {
  allowedAsSecondMain, drawMixedStrokes, effortFor, intensityName, intervalBetweenSets, repSeconds, restFor, timeTable,
  usesIntensityRest, loadRules, partsForLevel, pauseOf, seriesVariations, strokeCategory, validateRules,
} from './series/regras.js'

const rules = loadRules()
const velocidade = loadPart('velocidade')
const serie = (id) => velocidade.find((s) => s.id === id)

const TODO_MATERIAL = ['pe_de_pato', 'palmar', 'pull_buoy', 'prancha', 'snorkel']
const QUATRO_ESTILOS = ['crawl', 'costas', 'peito', 'borboleta']

const variations = (id, equipment, strokes = ['crawl']) =>
  seriesVariations(rules, 'velocidade', serie(id), { equipment, strokes })
const textos = (...args) => variations(...args).map((v) => v.texto)

// ---------- Níveis ----------

test('iniciante: sem velocidade, com o solto no final', () => {
  for (const minutos of [30, 45, 60, 75, 90, 120]) {
    assert.deepEqual(partsForLevel(rules, 'iniciante', minutos), ['aquecimento', 'principal', 'solto'])
  }
})

test('intermediário e avançado: a estrutura muda com o tempo de aula', () => {
  const ate50 = ['aquecimento', 'velocidade', 'solto', 'principal', 'soltura']
  const ate75 = ['aquecimento', 'velocidade', 'solto', 'principal', 'perna', 'soltura']
  const acima = ['aquecimento', 'velocidade', 'solto', 'principal', 'hidratacao', 'perna', 'principal', 'soltura']
  for (const nivel of ['intermediario', 'avancado']) {
    for (const minutos of [30, 45, 50]) assert.deepEqual(partsForLevel(rules, nivel, minutos), ate50)
    for (const minutos of [60, 75]) assert.deepEqual(partsForLevel(rules, nivel, minutos), ate75)
    for (const minutos of [90, 120]) assert.deepEqual(partsForLevel(rules, nivel, minutos), acima)
  }
})

test('a pausa de hidratação tem 5 minutos e não é uma parte com séries', () => {
  assert.deepEqual(pauseOf(rules, 'hidratacao'), {
    minutos: 5,
    texto: '5 min de hidratação e reposição (comer uma fruta)',
  })
  assert.equal(pauseOf(rules, 'principal'), null)
})

// ---------- Material na velocidade ----------

test('toda série de velocidade pode ser feita sem equipamento', () => {
  for (const s of velocidade) {
    const lista = seriesVariations(rules, 'velocidade', s, { equipment: TODO_MATERIAL, strokes: QUATRO_ESTILOS })
    assert.ok(lista.some((v) => v.padrao === 'sem_material' && v.nado === 'livre' && v.texto === s.texto), s.id)
  }
})

test('série sem intervalo entre séries: material na série inteira ou nadando, nunca trocando no meio', () => {
  assert.deepEqual(textos('vel-8x25-forte', TODO_MATERIAL), [
    '8 x 25 forte',
    '8 x 25 forte · com pé de pato',
    '8 x 25 forte · com palmar',
    '8 x 25 forte · com pé de pato + palmar',
    '8 x 25 forte · com palmar + pull buoy',
  ])
  for (const id of ['vel-4x25-forte', 'vel-16x25-forte', 'vel-8x25-15-forte-10-solto', 'vel-4x15']) {
    assert.ok(variations(id, TODO_MATERIAL, QUATRO_ESTILOS).every((v) => v.padrao !== 'por_serie'), id)
  }
})

test('(2x): material na 1ª série e nadando na 2ª, ou o contrário', () => {
  assert.deepEqual(textos('vel-2x4x25-forte', ['pe_de_pato']), [
    '(2x) 4 x 25 forte',
    '(2x) 4 x 25 forte · com pé de pato',
    '(2x) 4 x 25 forte · 1ª série com pé de pato, 2ª série nadando',
    '(2x) 4 x 25 forte · 1ª série nadando, 2ª série com pé de pato',
  ])
})

test('(4x): pé de pato, pé de pato + palmar, palmar, palmar + pull buoy', () => {
  const porSerie = variations('vel-4x4x25-forte', TODO_MATERIAL).filter((v) => v.padrao === 'por_serie')
  assert.equal(porSerie.length, 1)
  assert.equal(
    porSerie[0].texto,
    '(4x) 4 x 25 forte · 1ª série com pé de pato, 2ª série com pé de pato + palmar, ' +
      '3ª série com palmar, 4ª série com palmar + pull buoy',
  )
  // O material de cada série fica registrado, para o cálculo da duração
  assert.deepEqual(porSerie[0].series, [['pe_de_pato'], ['pe_de_pato', 'palmar'], ['palmar'], ['palmar', 'pull_buoy']])
  // Sem pull buoy, essa sequência não aparece
  assert.ok(variations('vel-4x4x25-forte', ['pe_de_pato', 'palmar']).every((v) => v.padrao !== 'por_serie'))
})

test('só oferece o material que o atleta tem', () => {
  assert.deepEqual(textos('vel-2x4x25-forte', []), ['(2x) 4 x 25 forte'])
  // Só pull buoy não basta: a opção com pull buoy exige palmar junto
  assert.deepEqual(textos('vel-8x25-forte', ['pull_buoy']), ['8 x 25 forte'])
  assert.ok(!textos('vel-8x25-forte', ['pe_de_pato']).some((t) => t.includes('palmar')))
})

test('série com material escrito no JSON é fixa', () => {
  const fixa = { ...serie('vel-8x25-forte'), outrosNados: [], exige: { estilos: [], outroEstilo: false, material: ['palmar'] } }
  const lista = seriesVariations(rules, 'velocidade', fixa, { equipment: TODO_MATERIAL, strokes: ['crawl'] })
  assert.deepEqual(lista.map((v) => v.padrao), ['fixo'])
})

test('parte sem regra de material: a série sai como está', () => {
  const aquecimento = loadPart('aquecimento')
  const lista = seriesVariations(rules, 'aquecimento', aquecimento[0], { equipment: TODO_MATERIAL, strokes: QUATRO_ESTILOS })
  assert.deepEqual(lista.map((v) => v.texto), ['100 livre'])
})

// ---------- Medley e estilo ----------

test('8 x 25, (2x) 8 x 25 e 16 x 25 também podem ser medley, com ou sem material', () => {
  for (const id of ['vel-8x25-forte', 'vel-2x8x25-forte', 'vel-16x25-forte']) {
    const lista = textos(id, ['pe_de_pato'], QUATRO_ESTILOS)
    assert.ok(lista.includes(`${serie(id).texto} · medley`), id)
    assert.ok(lista.includes(`${serie(id).texto} · medley · com pé de pato`), id)
  }
  assert.ok(textos('vel-2x8x25-forte', ['pe_de_pato'], QUATRO_ESTILOS).includes(
    '(2x) 8 x 25 forte · medley · 1ª série com pé de pato, 2ª série nadando',
  ))
  // As outras séries de velocidade não viram medley
  assert.ok(!textos('vel-4x25-forte', [], QUATRO_ESTILOS).some((t) => t.includes('medley')))
})

test('(4x) 4 x 25 pode ser medley ou no estilo do atleta, com ou sem material', () => {
  const lista = textos('vel-4x4x25-forte', TODO_MATERIAL, QUATRO_ESTILOS)
  for (const nado of ['medley', 'borboleta', 'costas', 'peito']) {
    assert.ok(lista.includes(`(4x) 4 x 25 forte · ${nado}`), nado)
    assert.ok(lista.some((t) => t.startsWith(`(4x) 4 x 25 forte · ${nado} · 1ª série com pé de pato`)), nado)
  }
  // "Estilo" é borboleta, costas ou peito: crawl não entra como estilo
  assert.ok(!lista.some((t) => t.includes('· crawl')))
})

test('medley só para quem nada os quatro estilos; estilo só os que o atleta nada', () => {
  const crawlECostas = textos('vel-4x4x25-forte', [], ['crawl', 'costas'])
  assert.deepEqual(crawlECostas, ['(4x) 4 x 25 forte', '(4x) 4 x 25 forte · costas'])
  assert.deepEqual(textos('vel-8x25-forte', [], ['crawl', 'costas', 'peito']), ['8 x 25 forte'])
})

test('medley alternado precisa de repetições em múltiplo de 4', () => {
  const problems = validate([{
    id: 'x-1', texto: '6 x 25', outrosNados: ['medley'],
    blocos: [{ repeticoes: 6, distancia: 25, nado: 'livre', intensidade: 'forte' }],
  }])
  assert.ok(problems.some((p) => p.includes('múltiplo de 4')), JSON.stringify(problems))
  const invalid = validate([{ id: 'x-2', texto: '4 x 25', outrosNados: ['golfinho'], blocos: [{ repeticoes: 4, distancia: 25, nado: 'livre', intensidade: 'forte' }] }])
  assert.ok(invalid.some((p) => p.includes('"outrosNados"')))
})

test('(4x) 4 x 25 medley dos dois jeitos: por repetição e por série', () => {
  const lista = textos('vel-4x4x25-forte', [], QUATRO_ESTILOS)
  assert.ok(lista.includes('(4x) 4 x 25 forte · medley'))
  assert.ok(lista.includes('(4x) 4 x 25 forte · 1ª série borboleta, 2ª série costas, 3ª série peito, 4ª série crawl'))
  // Medley por série com o material da (4x): cada série com o seu estilo e o seu material
  assert.ok(textos('vel-4x4x25-forte', TODO_MATERIAL, QUATRO_ESTILOS).includes(
    '(4x) 4 x 25 forte · 1ª série borboleta com pé de pato, 2ª série costas com pé de pato + palmar, ' +
      '3ª série peito com palmar, 4ª série crawl com palmar + pull buoy',
  ))
  // (2x) 8 x 25 não tem 4 séries: medley só por repetição
  assert.ok(!textos('vel-2x8x25-forte', [], QUATRO_ESTILOS).some((t) => t.includes('borboleta')))
})

test('séries mais longas alternam os estilos do atleta entre as séries', () => {
  const lista = textos('vel-4x4x25-forte', [], ['crawl', 'costas', 'peito'])
  assert.ok(lista.includes('(4x) 4 x 25 forte · 1ª e 3ª séries costas, 2ª e 4ª séries peito'))
  // Com material por série: "sem material" quando a série é nadando
  const comPe = textos('vel-4x4x25-forte', ['pe_de_pato', 'palmar', 'pull_buoy'], ['crawl', 'costas', 'peito'])
  assert.ok(comPe.includes(
    '(4x) 4 x 25 forte · 1ª série costas com pé de pato, 2ª série peito com pé de pato + palmar, ' +
      '3ª série costas com palmar, 4ª série peito com palmar + pull buoy',
  ))
  // Um estilo só: não tem o que alternar
  assert.ok(!textos('vel-4x4x25-forte', [], ['crawl', 'costas']).some((t) => t.includes('séries')))
})

test('séries agrupadas, como (2x) 1 x 200, 4 x 50, também trocam material entre as séries', () => {
  const grupo = loadPart('principal').find((s) => s.id === 'pri-2x-200-50')
  // A série principal ainda não tem regra de material: usando as da velocidade só para conferir
  const lista = seriesVariations(rules, 'velocidade', grupo, { equipment: ['pe_de_pato'], strokes: ['crawl'] })
  assert.ok(lista.some((v) => v.texto === '(2x) 1 x 200, 4 x 50 · 1ª série com pé de pato, 2ª série nadando'))
})

test('repetições acima de 400 m sempre com pé de pato + palmar; nas pirâmides, a partir de 400 m', () => {
  const principalSeries = loadPart('principal')
  const atleta = (equipment) => ({ equipment, strokes: ['crawl'] })
  const de = (id, equipment) => seriesVariations(rules, 'principal', principalSeries.find((s) => s.id === id), atleta(equipment))

  assert.deepEqual(de('pri-3x800', TODO_MATERIAL).map((v) => v.texto), ['3 x 800 · com pé de pato + palmar'])
  assert.equal(de('pri-3x800', TODO_MATERIAL)[0].padrao, 'obrigatorio')
  // Sem os dois materiais, o atleta não recebe a série
  assert.deepEqual(de('pri-3x800', ['pe_de_pato']), [])
  // 5 x 400: 400 m não é "acima de 400", continua podendo ser nadando
  assert.ok(de('pri-5x400', []).some((v) => v.padrao === 'sem_material'))

  // Pirâmides: os 400 sempre com pé de pato + palmar; o resto nadando...
  const piramide = de('pri-piramide-400-50', TODO_MATERIAL)
  assert.equal(piramide[0].texto, '1 x 400, 2 x 200, 4 x 100, 8 x 50 · os 400 com pé de pato + palmar')
  assert.deepEqual(piramide[0].porBloco, [['pe_de_pato', 'palmar'], [], [], []])
  // ...ou cada distância com um material diferente
  assert.ok(piramide.some((v) => v.texto ===
    '1 x 400, 2 x 200, 4 x 100, 8 x 50 · os 400 com pé de pato + palmar, os 200 com palmar, os 100 com pé de pato, os 50 nadando'))
  for (const v of piramide.filter((x) => x.padrao === 'piramide_alternada')) {
    assert.deepEqual(v.porBloco[0], ['pe_de_pato', 'palmar'], 'os 400 nunca mudam')
    const resto = v.porBloco.slice(1).map((m) => m.join('+'))
    assert.equal(new Set(resto).size, resto.length, `materiais repetidos: ${v.texto}`)
    assert.ok(!resto.includes('pe_de_pato+palmar'), 'o material dos 400 não se repete')
  }
  const ida_e_volta = de('pri-piramide-400-50-400', TODO_MATERIAL)[0]
  assert.deepEqual(ida_e_volta.porBloco.map((m) => m.length > 0), [true, false, false, false, false, false, true])
  assert.deepEqual(de('pri-piramide-400-50', ['palmar']), [])
  // Pirâmide sem 400: nada muda
  assert.ok(de('pri-piramide-50-200-50', []).some((v) => v.padrao === 'sem_material'))
})

test('pirâmide sem 400: cada distância com um material diferente, a mesma distância com o mesmo material', () => {
  const serie = loadPart('principal').find((s) => s.id === 'pri-piramide-50-200-50')
  const lista = seriesVariations(rules, 'principal', serie, { equipment: TODO_MATERIAL, strokes: ['crawl'] })
  const alternadas = lista.filter((v) => v.padrao === 'piramide_alternada')
  assert.ok(alternadas.length > 0)
  for (const v of alternadas) {
    // 8 x 50, 4 x 100, 2 x 200, 4 x 100, 8 x 50: os dois blocos de 50 (e os de 100) iguais
    assert.deepEqual(v.porBloco[0], v.porBloco[4])
    assert.deepEqual(v.porBloco[1], v.porBloco[3])
  }
  assert.ok(lista.some((v) => v.texto === '8 x 50, 4 x 100, 2 x 200, 4 x 100, 8 x 50 · os 50 com palmar, os 100 com pé de pato, os 200 nadando'))
  // Só com o material que o atleta tem
  const soPalmar = seriesVariations(rules, 'principal', serie, { equipment: ['palmar'], strokes: ['crawl'] })
  assert.ok(soPalmar.every((v) => v.material.every((m) => m === 'palmar')))
})

test('grupo repetido não é pirâmide: (2x) 1 x 200, 4 x 50 não alterna material por bloco', () => {
  const serie = loadPart('principal').find((s) => s.id === 'pri-2x-200-50')
  const lista = seriesVariations(rules, 'principal', serie, { equipment: TODO_MATERIAL, strokes: ['crawl'] })
  assert.ok(!lista.some((v) => v.padrao === 'piramide_alternada'))
})

// ---------- Intervalo entre as séries ----------

test('intervalo entre séries: uma saída do 25; 1 minuto na Realização ou entre séries de 8 x 25', () => {
  const contexto = { fase: 'acumulacao', saidaSegundos: 30 }
  assert.equal(intervalBetweenSets(rules, 'velocidade', serie('vel-2x4x25-forte'), contexto), 30)
  assert.equal(intervalBetweenSets(rules, 'velocidade', serie('vel-4x4x25-forte'), contexto), 30)
  assert.equal(intervalBetweenSets(rules, 'velocidade', serie('vel-2x8x25-forte'), contexto), 60)
  const realizacao = { fase: 'realizacao', saidaSegundos: 30 }
  assert.equal(intervalBetweenSets(rules, 'velocidade', serie('vel-2x4x25-forte'), realizacao), 60)
  // Série sem "(2x)", "(4x)": não tem intervalo entre séries
  assert.equal(intervalBetweenSets(rules, 'velocidade', serie('vel-8x25-forte'), contexto), null)
})

// ---------- Provas de piscina ----------

const comNados = (texto, repeticoes, distancia) => describe({
  id: 'p-x', texto, outrosNados: ['medley', 'estilo'],
  blocos: [{ repeticoes, distancia, nado: 'livre', intensidade: 'A2' }],
})
const nadosDe = (serie) => seriesVariations(rules, 'principal', serie, { equipment: [], strokes: QUATRO_ESTILOS })
  .map((v) => v.texto)

test('provas de piscina: repetição de 400 só em crawl ou medley, nunca em estilo', () => {
  const lista = nadosDe(comNados('8 x 400', 8, 400))
  assert.deepEqual(lista, ['8 x 400', '8 x 400 · medley'])
  const medley = seriesVariations(rules, 'principal', comNados('8 x 400', 8, 400), { equipment: [], strokes: QUATRO_ESTILOS })[1]
  assert.equal(medley.nado, 'medley_individual')
  assert.deepEqual(medley.piscinas, [25, 50])
})

test('provas de piscina: até 200 m vale estilo, medley alternado e medley individual', () => {
  const lista = nadosDe(comNados('8 x 200', 8, 200))
  assert.ok(lista.includes('8 x 200 · costas'))
  assert.ok(lista.includes('8 x 200 · medley alternado (um estilo por repetição)'))
  assert.ok(lista.includes('8 x 200 · medley'))
})

test('provas de piscina: 100 medley só na piscina de 25 m', () => {
  const lista = seriesVariations(rules, 'principal', comNados('8 x 100', 8, 100), { equipment: [], strokes: QUATRO_ESTILOS })
  assert.deepEqual(lista.find((v) => v.nado === 'medley_individual').piscinas, [25])
})

test('provas de piscina: 25 e 50 m em medley é sempre um estilo por repetição', () => {
  const lista = nadosDe(comNados('8 x 50', 8, 50))
  assert.ok(lista.includes('8 x 50 · medley'))
  const nados = seriesVariations(rules, 'principal', comNados('8 x 50', 8, 50), { equipment: [], strokes: QUATRO_ESTILOS })
  assert.ok(!nados.some((v) => v.nado === 'medley_individual'))
})

test('provas de piscina: a validação recusa estilo acima de 200 m', () => {
  const bloco = (nado, distancia) => [{ id: 'x-1', texto: 't', blocos: [{ repeticoes: 1, distancia, nado }] }]
  assert.ok(validate(bloco('costas', 400)).some((p) => p.includes('costas vai até 200 m')))
  assert.ok(validate(bloco('peito', 800)).some((p) => p.includes('peito vai até 200 m')))
  assert.deepEqual(validate(bloco('costas', 200)), [])
  assert.deepEqual(validate(bloco('medley', 400)), [])
  assert.ok(validate(bloco('medley', 300)).some((p) => p.includes('medley é de 200 ou 400 m')))
  assert.deepEqual(validate(bloco('crawl', 1500)), [])
  // Série que não comporta o nado extra
  const serie = (outrosNados, repeticoes, distancia) =>
    validate([{ id: 'x-2', texto: 't', outrosNados, blocos: [{ repeticoes, distancia, nado: 'livre' }] }])
  assert.ok(serie(['estilo'], 3, 800).some((p) => p.includes('"estilo" não cabe')))
  assert.ok(serie(['medley'], 3, 800).some((p) => p.includes('"medley" não cabe')))
  assert.deepEqual(serie(['medley'], 5, 400), [])
})

// ---------- Borboleta de 200 só para avançado ----------

test('borboleta de 200 m só para avançado; nos outros níveis, até 100 m', () => {
  const serie = comNados('8 x 200', 8, 200)
  const para = (level) => seriesVariations(rules, 'principal', serie, { equipment: [], strokes: QUATRO_ESTILOS, level })
    .map((v) => v.texto)

  const avancado = para('avancado')
  assert.ok(avancado.includes('8 x 200 · borboleta'))
  assert.ok(avancado.includes('8 x 200 · medley alternado (um estilo por repetição)'))

  for (const level of ['iniciante', 'intermediario']) {
    const lista = para(level)
    assert.ok(!lista.includes('8 x 200 · borboleta'), level)
    // No medley alternado cada repetição é inteira num estilo: teria 200 de borboleta
    assert.ok(!lista.some((t) => t.includes('medley alternado')), level)
    // Costas e peito continuam; o medley individual (só 50 de borboleta) também
    assert.ok(lista.includes('8 x 200 · costas'), level)
    assert.ok(lista.includes('8 x 200 · medley'), level)
  }

  // Até 100 m, a borboleta vale para todos
  const cem = seriesVariations(rules, 'principal', comNados('8 x 100', 8, 100), { equipment: [], strokes: QUATRO_ESTILOS, level: 'intermediario' })
  assert.ok(cem.some((v) => v.texto === '8 x 100 · borboleta'))
})

test('série escrita em 200 borboleta não vai para quem não é avançado', () => {
  const serie = describe({ id: 'b-1', texto: '4 x 200 borboleta', blocos: [{ repeticoes: 4, distancia: 200, nado: 'borboleta' }] })
  const de = (level) => seriesVariations(rules, 'principal', serie, { equipment: [], strokes: QUATRO_ESTILOS, level })
  assert.deepEqual(de('intermediario'), [])
  assert.ok(de('avancado').length > 0)
})

// ---------- Mistura de nados nas séries com (3x), (4x) ----------

// Sorteio que se repete igual a cada execução do teste
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const principalSerie = (id) => loadPart('principal').find((s) => s.id === id)
const avancadoCompleto = { equipment: [], strokes: QUATRO_ESTILOS, level: 'avancado', bestStroke: 'costas' }
const draws = (id, athlete, n = 2000) => {
  const random = seeded(42)
  return Array.from({ length: n }, () => drawMixedStrokes(rules, 'principal', principalSerie(id), athlete, random))
}

test('mistura de nados: nunca o mesmo estilo seguido; crawl em cerca de 30%; às vezes 100% estilo', () => {
  let crawl = 0
  let total = 0
  let soEstilo = 0
  for (const mistura of draws('pri-4x4x100', avancadoCompleto)) {
    assert.equal(mistura.porSerie.length, 4)
    for (const serie of mistura.porSerie) {
      assert.equal(serie.length, 4)
      serie.slice(1).forEach((n, k) => assert.notEqual(n, serie[k], serie.join(', ')))
      assert.ok(serie.every((n) => ['crawl', 'borboleta', 'costas', 'peito', 'medley'].includes(n)), serie.join())
      crawl += serie.filter((n) => n === 'crawl').length
      total += serie.length
      if (!serie.includes('crawl')) soEstilo++
    }
  }
  // 75% das séries com 30% de crawl e 25% sem crawl: ~22%
  const parte = crawl / total
  assert.ok(parte > 0.17 && parte < 0.3, `crawl: ${parte}`)
  assert.ok(soEstilo > 0, 'nenhuma série 100% em estilo')
})

test('mistura de nados do intermediário: metade crawl; às vezes 70% estilo e 30% crawl', () => {
  let crawl = 0
  let total = 0
  let soEstilo = 0
  let comTrinta = 0
  for (const mistura of draws('pri-4x4x100', { ...avancadoCompleto, level: 'intermediario' })) {
    for (const serie of mistura.porSerie) {
      serie.slice(1).forEach((n, k) => assert.notEqual(n, serie[k], serie.join(', ')))
      const c = serie.filter((n) => n === 'crawl').length
      crawl += c
      total += serie.length
      if (c === 0) soEstilo++
      if (c === 1) comTrinta++
    }
  }
  // 75% das séries com 50% de crawl e 25% com 30%: ~45%
  const parte = crawl / total
  assert.ok(parte > 0.4 && parte < 0.5, `crawl: ${parte}`)
  assert.ok(comTrinta > 0, 'nenhuma série com menos crawl')
  assert.ok(soEstilo < comTrinta / 3, `séries sem crawl: ${soEstilo}`)
})

test('borboleta dividida: repetição de 200 vira BO/CO ou BO/CR (100 de cada)', () => {
  const nados = new Set(draws('pri-4x3x200', { ...avancadoCompleto, poolLength: 25 }, 500).flatMap((m) => m.porSerie.flat()))
  assert.ok(nados.has('borboleta/costas') && nados.has('borboleta/crawl'), [...nados].join())
  assert.ok(!nados.has('borboleta'))
  // Quem não nada borboleta não ganha a dividida
  const semBo = new Set(draws('pri-4x3x200', { ...avancadoCompleto, strokes: ['crawl', 'costas', 'peito'] }, 200).flatMap((m) => m.porSerie.flat()))
  assert.ok(![...semBo].some((n) => n.startsWith('borboleta')))
  // 100 de borboleta cabem inteiros: nada de dividida
  const cem = new Set(draws('pri-4x4x100', avancadoCompleto, 300).flatMap((m) => m.porSerie.flat()))
  assert.ok(![...cem].some((n) => n.includes('/')))
})

test('borboleta na principal: só até 100 m, mais rara', () => {
  // 200: sem borboleta (nem para o avançado)
  for (const mistura of draws('pri-4x3x200', avancadoCompleto, 300)) {
    assert.ok(!mistura.porSerie.flat().includes('borboleta')) // inteira não (só a dividida, BO/CO)
  }
  // 100: entra, mas menos que os outros estilos
  const contagem = {}
  for (const mistura of draws('pri-4x4x100', { ...avancadoCompleto, bestStroke: null })) {
    for (const n of mistura.porSerie.flat()) contagem[n] = (contagem[n] ?? 0) + 1
  }
  assert.ok(contagem.borboleta > 0 && contagem.borboleta < contagem.costas && contagem.borboleta < contagem.peito, JSON.stringify(contagem))
})

test('mistura de nados: o texto mostra cada série', () => {
  const [mistura] = draws('pri-4x3x200', avancadoCompleto, 1)
  assert.match(mistura.texto, /^\(4x\) 3 x 200 · 1ª série [a-z, /]+; 2ª série [a-z, /]+; 3ª série [a-z, /]+; 4ª série [a-z, /]+$/)
})

test('mistura de nados: o melhor estilo aparece mais', () => {
  const contagem = {}
  for (const mistura of draws('pri-4x3x200', avancadoCompleto)) {
    for (const n of mistura.porSerie.flat()) contagem[n] = (contagem[n] ?? 0) + 1
  }
  for (const outro of ['peito', 'medley']) {
    assert.ok(contagem.costas > contagem[outro], JSON.stringify(contagem))
  }
})

test('mistura de nados: borboleta de 200 não entra para intermediário', () => {
  const intermediario = { ...avancadoCompleto, level: 'intermediario' }
  for (const mistura of draws('pri-4x3x200', intermediario, 500)) {
    assert.ok(!mistura.porSerie.flat().includes('borboleta'))
  }
})

test('mistura de nados: 50 m sem medley individual; 100 m de medley só na piscina de 25 m', () => {
  for (const mistura of draws('pri-3x6x50', avancadoCompleto, 300)) {
    assert.ok(!mistura.porSerie.flat().includes('medley'))
  }
  const comMedley = draws('pri-4x4x100', avancadoCompleto, 300).filter((m) => m.porSerie.flat().includes('medley'))
  assert.ok(comMedley.length > 0)
  for (const mistura of comMedley) assert.deepEqual(mistura.piscinas, [25])
})

test('mistura de nados: só nas séries com (3x), (4x)', () => {
  const um = (id) => drawMixedStrokes(rules, 'principal', principalSerie(id), avancadoCompleto, seeded(1))
  assert.equal(um('pri-10x200'), null) // sem séries
  assert.equal(um('pri-2x10x100'), null) // (2x)
  assert.equal(um('pri-3x-100-75-50-25'), null) // grupo de vários blocos
  assert.ok(um('pri-3x3x200'))
  assert.ok(um('pri-4x4x75'))
  // Só vale na série principal
  assert.equal(drawMixedStrokes(rules, 'velocidade', principalSerie('pri-3x3x200'), avancadoCompleto, seeded(1)), null)
})

test('mistura de nados: precisa de pelo menos dois nados para misturar', () => {
  const serie = principalSerie('pri-4x3x200')
  assert.equal(drawMixedStrokes(rules, 'principal', serie, { ...avancadoCompleto, strokes: ['crawl'] }, seeded(1)), null)
  assert.equal(drawMixedStrokes(rules, 'principal', serie, { ...avancadoCompleto, strokes: ['crawl', 'costas'] }, seeded(1)), null)
  assert.ok(drawMixedStrokes(rules, 'principal', serie, { ...avancadoCompleto, strokes: ['crawl', 'costas', 'peito'] }, seeded(1)))
})

test('mistura de nados: sem melhor estilo na anamnese, vale a ordem de velocidade', () => {
  const semResposta = { ...avancadoCompleto, bestStroke: null }
  const [mistura] = draws('pri-4x4x100', semResposta, 1)
  assert.equal(mistura.melhorEstilo, 'borboleta')
  // Repetições de 200: borboleta não entra na principal, então vale o seguinte
  const [de200] = draws('pri-4x3x200', semResposta, 1)
  assert.equal(de200.melhorEstilo, 'costas')
})

// ---------- 150 m: estilo, medley sem crawl, melhor estilo e medley ----------

test('6 x 150: estilo, medley sem crawl e alternando melhor estilo e medley', () => {
  const serie = principalSerie('pri-6x150')
  const para = (athlete) => seriesVariations(rules, 'principal', serie, { equipment: [], ...athlete }).map((v) => v.texto)

  const avancado = para({ strokes: QUATRO_ESTILOS, level: 'avancado', bestStroke: 'costas' })
  assert.ok(avancado.includes('6 x 150 · costas'))
  assert.ok(avancado.includes('6 x 150 · peito'))
  assert.ok(avancado.includes('6 x 150 · borboleta'))
  assert.ok(avancado.includes('6 x 150 · medley (borboleta, costas, peito)'))
  assert.ok(avancado.includes('6 x 150 · alternando costas (melhor estilo) e medley (borboleta, costas, peito)'))

  // Intermediário: borboleta de 150 não (até 100 m); o medley sem crawl sim (só 50 de borboleta)
  const intermediario = para({ strokes: QUATRO_ESTILOS, level: 'intermediario', bestStroke: 'peito' })
  assert.ok(!intermediario.includes('6 x 150 · borboleta'))
  assert.ok(intermediario.includes('6 x 150 · medley (borboleta, costas, peito)'))
  assert.ok(intermediario.includes('6 x 150 · alternando peito (melhor estilo) e medley (borboleta, costas, peito)'))

  // Medley sem crawl exige borboleta, costas e peito
  const semBorboleta = para({ strokes: ['crawl', 'costas', 'peito'], level: 'avancado', bestStroke: 'costas' })
  assert.ok(!semBorboleta.some((t) => t.includes('medley')))
  assert.ok(semBorboleta.includes('6 x 150 · costas'))
})

test('melhor estilo e medley também vale em 200 m, com o medley individual', () => {
  const serie = describe({
    id: 'p-200', texto: '6 x 200', outrosNados: ['melhorEstiloEMedley'],
    blocos: [{ repeticoes: 6, distancia: 200, nado: 'livre' }],
  })
  const lista = seriesVariations(rules, 'principal', serie, { equipment: [], strokes: QUATRO_ESTILOS, level: 'avancado', bestStroke: 'peito' })
  assert.ok(lista.some((v) => v.texto === '6 x 200 · alternando peito (melhor estilo) e medley'))
})

test('melhorEstiloEMedley só em séries onde cabem o estilo e o medley', () => {
  const problems = validate([{ id: 'x', texto: '4 x 400', outrosNados: ['melhorEstiloEMedley'], blocos: [{ repeticoes: 4, distancia: 400, nado: 'livre' }] }])
  assert.ok(problems.some((p) => p.includes('o melhor estilo vai até 200 m')))
  assert.deepEqual(validate([{ id: 'y', texto: '6 x 150', outrosNados: ['medley'], blocos: [{ repeticoes: 6, distancia: 150, nado: 'livre' }] }]), [])
})

// ---------- Perna ----------

const perna400 = () => loadPart('perna').find((s) => s.id === 'perna-400')
const pernaDe = (athlete) => seriesVariations(rules, 'perna', perna400(), { level: 'avancado', ...athlete })

test('perna: 400 sempre com pé de pato; quem não tem não recebe', () => {
  const lista = pernaDe({ equipment: ['pe_de_pato'], strokes: ['crawl'] })
  assert.deepEqual(lista.map((v) => v.texto), ['400 perna com pé de pato'])
  assert.deepEqual(lista[0].material, ['pe_de_pato'])
  // Material fixo da série: sem pé de pato não dá
  const semPe = pernaDe({ equipment: [], strokes: ['crawl'] })
  assert.ok(semPe.every((v) => v.material.includes('pe_de_pato') || v.material.includes('pe_de_pato_peito')))
})

test('perna: 400 indo crawl e voltando uma vez borboleta e outra costas', () => {
  const lista = pernaDe({ equipment: ['pe_de_pato'], strokes: QUATRO_ESTILOS, bestStroke: 'costas' })
  const alternando = lista.find((v) => v.nado === 'ida_crawl_volta_borboleta_e_costas')
  assert.equal(alternando.texto, '400 perna com pé de pato · ida crawl, voltando uma vez borboleta e outra costas')
  assert.deepEqual(alternando.piscinas, [25, 50])
})

test('perna: 400 indo crawl e voltando no melhor estilo', () => {
  const costas = pernaDe({ equipment: ['pe_de_pato'], strokes: QUATRO_ESTILOS, bestStroke: 'costas' })
  assert.ok(costas.some((v) => v.texto === '400 perna com pé de pato · ida crawl, volta costas (melhor estilo)'))

  // Melhor estilo peito sem pé de pato de peito: volta de borboleta ou de costas
  const peito = pernaDe({ equipment: ['pe_de_pato'], strokes: QUATRO_ESTILOS, bestStroke: 'peito' }).map((v) => v.texto)
  assert.ok(peito.includes('400 perna com pé de pato · ida crawl, volta borboleta (no lugar do peito, sem pé de pato de peito)'))
  assert.ok(peito.includes('400 perna com pé de pato · ida crawl, volta costas (no lugar do peito, sem pé de pato de peito)'))
  assert.ok(!peito.some((t) => t.includes('volta peito')))

  // Com pé de pato de peito: volta de peito, usando ele no lugar do pé de pato comum
  const comPePeito = pernaDe({ equipment: ['pe_de_pato', 'pe_de_pato_peito'], strokes: QUATRO_ESTILOS, bestStroke: 'peito' })
  const voltaPeito = comPePeito.find((v) => v.texto.includes('volta peito'))
  assert.equal(voltaPeito.texto, '400 perna · ida crawl, volta peito (melhor estilo) · com pé de pato de peito')
  assert.deepEqual(voltaPeito.material, ['pe_de_pato_peito'])
})

test('perna: com pé de pato na maioria, e sem material também, para treinar a pernada', () => {
  const serie = loadPart('perna').find((s) => s.id === 'perna-8x50')
  const de = (athlete) => seriesVariations(rules, 'perna', serie, { level: 'avancado', ...athlete })

  for (const strokes of [['crawl', 'costas'], ['crawl', 'peito']]) {
    const lista = de({ equipment: ['pe_de_pato'], strokes })
    assert.deepEqual(lista.map((v) => v.texto), ['8 x 50 perna', '8 x 50 perna · com pé de pato'])
    // Com pé de pato pesa 3: sai três vezes mais
    assert.equal(lista.find((v) => v.padrao === 'serie_inteira').peso, 3)
  }

  // Sem pé de pato: faz sem, não tem outro jeito
  assert.deepEqual(de({ equipment: [], strokes: ['crawl'] }).map((v) => v.texto), ['8 x 50 perna'])

  // O 400 continua sempre com pé de pato
  assert.ok(pernaDe({ equipment: ['pe_de_pato'], strokes: ['crawl', 'peito'] }).every((v) => v.material.length > 0))
})

test('perna: a opção "sem material só para quem nada peito" continua disponível nas regras', () => {
  const r = structuredClone(rules)
  r.material.perna.semMaterial = 'soQuemNadaPeito'
  assert.deepEqual(validateRules(r), [])
  const serie = loadPart('perna').find((s) => s.id === 'perna-8x50')
  const de = (strokes) => seriesVariations(r, 'perna', serie, { level: 'avancado', equipment: ['pe_de_pato'], strokes }).map((v) => v.texto)
  assert.deepEqual(de(['crawl']), ['8 x 50 perna · com pé de pato'])
  assert.deepEqual(de(['crawl', 'peito']), ['8 x 50 perna', '8 x 50 perna · com pé de pato'])
})

test('perna: as outras séries entram como estão', () => {
  const perna = loadPart('perna')
  assert.deepEqual(perna.map((s) => s.texto), [
    '8 x 50 perna', '(2x) 8 x 50 perna', '4 x 100 perna', '400 perna com pé de pato', '3 x 200 perna', '6 x 100 perna',
  ])
  assert.deepEqual(perna.map((s) => s.volume), [400, 800, 400, 400, 600, 600])
})

// ---------- 2ª série principal ----------

// Séries principais de exemplo (o principal.json ainda não existe)
const principal = (id, nado, outrosNados) => describe({
  id, texto: `5 x 200 ${nado} A2`, ...(outrosNados && { outrosNados }),
  blocos: [{ repeticoes: 5, distancia: 200, nado, intensidade: 'A2' }],
})
const crawl = principal('p-crawl', 'crawl')
const livre = principal('p-livre', 'livre', ['estilo', 'medley'])
const costas = principal('p-costas', 'costas')
const as = (serie, nado = 'livre') => ({ serie, variation: { nado } })

test('crawl ou estilo: medley e estilos contam como estilo', () => {
  assert.equal(strokeCategory(crawl, { nado: 'livre' }), 'crawl')
  assert.equal(strokeCategory(livre, { nado: 'livre' }), 'crawl')
  assert.equal(strokeCategory(costas, { nado: 'livre' }), 'estilo')
  assert.equal(strokeCategory(livre, { nado: 'peito' }), 'estilo')
  assert.equal(strokeCategory(livre, { nado: 'medley' }), 'estilo')
  assert.equal(strokeCategory(livre, { nado: 'estilos_por_serie' }), 'estilo')
})

test('2ª série principal: depois de estilo vem crawl, e depois de crawl vem estilo', () => {
  const nadaTudo = ['crawl', 'costas', 'peito', 'borboleta']
  // 1ª de estilo -> 2ª só crawl
  assert.equal(allowedAsSecondMain(rules, as(costas), as(crawl), nadaTudo), true)
  assert.equal(allowedAsSecondMain(rules, as(costas), as(livre, 'peito'), nadaTudo), false)
  assert.equal(allowedAsSecondMain(rules, as(livre, 'medley'), as(crawl), nadaTudo), true)
  // 1ª de crawl -> 2ª só estilo
  assert.equal(allowedAsSecondMain(rules, as(crawl), as(costas), nadaTudo), true)
  assert.equal(allowedAsSecondMain(rules, as(crawl), as(livre), nadaTudo), false)
  assert.equal(allowedAsSecondMain(rules, as(crawl), as(livre, 'medley'), nadaTudo), true)
})

test('2ª série principal: quem só nada crawl faz as duas em crawl', () => {
  assert.equal(allowedAsSecondMain(rules, as(crawl), as(livre), ['crawl']), true)
})

test('a regra da 2ª série principal pode ser desligada', () => {
  const semRegra = { ...rules, segundaPrincipal: { alternarCrawlEEstilo: false } }
  assert.equal(allowedAsSecondMain(semRegra, as(crawl), as(crawl), ['crawl', 'costas']), true)
})

// ---------- Descanso ----------

test('descanso: a tabela do treinador para intermediário e avançado', () => {
  for (const nivel of ['intermediario', 'avancado']) {
    assert.deepEqual(restFor(rules, nivel, 50), { min: 15, max: 30 })
    assert.deepEqual(restFor(rules, nivel, 100), { min: 20, max: 30 })
    assert.deepEqual(restFor(rules, nivel, 200), { min: 40, max: 40 })
    assert.deepEqual(restFor(rules, nivel, 400), { min: 60, max: 60 })
    assert.deepEqual(restFor(rules, nivel, 800), { min: 120, max: 120 })
  }
})

test('descanso: iniciante descansa mais', () => {
  assert.deepEqual(restFor(rules, 'iniciante', 50), { min: 25, max: 40 })
  assert.deepEqual(restFor(rules, 'iniciante', 100), { min: 30, max: 40 })
  assert.deepEqual(restFor(rules, 'iniciante', 200), { min: 40, max: 60 })
  assert.deepEqual(restFor(rules, 'iniciante', 400), { min: 60, max: 60 })
  assert.deepEqual(restFor(rules, 'iniciante', 800), { min: 120, max: 120 })
})

test('descanso: distâncias fora da tabela ficam entre as vizinhas, de 5 em 5 segundos', () => {
  assert.deepEqual(restFor(rules, 'avancado', 75), { min: 20, max: 30 })
  assert.deepEqual(restFor(rules, 'avancado', 150), { min: 30, max: 35 })
  assert.deepEqual(restFor(rules, 'avancado', 300), { min: 50, max: 50 })
  assert.deepEqual(restFor(rules, 'iniciante', 150), { min: 35, max: 50 })
  // Fora das pontas: vale a ponta
  assert.deepEqual(restFor(rules, 'avancado', 25), { min: 15, max: 30 })
  assert.deepEqual(restFor(rules, 'avancado', 1500), { min: 120, max: 120 })
})

// ---------- Intensidades ----------

test('esforço de cada intensidade por nível (% do máximo do teste de 400 m)', () => {
  assert.equal(effortFor(rules, 'A1', 'iniciante'), 65)
  assert.equal(effortFor(rules, 'A2', 'iniciante'), 75)
  assert.equal(effortFor(rules, 'A3', 'iniciante'), 82.5)
  assert.equal(effortFor(rules, 'A1', 'avancado'), 75)
  assert.equal(effortFor(rules, 'A2', 'avancado'), 80)
  assert.equal(effortFor(rules, 'A3', 'avancado'), 85)
  // Intermediário (provisório): meio termo entre o iniciante e o avançado
  assert.equal(effortFor(rules, 'A1', 'intermediario'), 70)
  assert.equal(effortFor(rules, 'A2', 'intermediario'), 77.5)
  // AA (velocidade) perto de 100%; "forte" é o mesmo que AA
  assert.equal(intensityName(rules, 'forte'), 'AA')
  assert.equal(effortFor(rules, 'forte', 'avancado'), 97.5)
})

test('descanso por intensidade: iniciante e recém intermediário; os outros, por distância', () => {
  assert.equal(usesIntensityRest(rules, { level: 'iniciante' }), true)
  assert.equal(usesIntensityRest(rules, { level: 'intermediario', recemIntermediario: true }), true)
  assert.equal(usesIntensityRest(rules, { level: 'intermediario', recemIntermediario: false }), false)
  assert.equal(usesIntensityRest(rules, { level: 'avancado' }), false)
  assert.deepEqual(rules.intensidades.A1.descanso, [0, 20])
  assert.deepEqual(rules.intensidades.A2.descanso, [0, 30])
  assert.deepEqual(rules.intensidades.A3.descanso, [0, 60])
  assert.deepEqual(rules.intensidades.AA.descanso, [0, 60])
})

test('A3 quase sempre com pé de pato ou pé + palmar; sem material só para avançado, e raramente', () => {
  const a3 = describe({ id: 'a3', texto: '6 x 200', blocos: [{ repeticoes: 6, distancia: 200, nado: 'livre', intensidade: 'A3' }] })
  const de = (level, equipment = TODO_MATERIAL) =>
    seriesVariations(rules, 'principal', a3, { level, equipment, strokes: ['crawl'] })
  const intermediario = de('intermediario')
  assert.deepEqual(intermediario.map((v) => v.material), [['pe_de_pato'], ['pe_de_pato', 'palmar']])
  const avancado = de('avancado')
  const sem = avancado.find((v) => v.padrao === 'sem_material')
  assert.ok(sem, 'avançado pode fazer sem material')
  assert.equal(sem.peso, 0.1)
  // Sem pé de pato, quem não é avançado não recebe a série em A3
  assert.deepEqual(de('intermediario', ['palmar']), [])
})

test('recuperação de cada intensidade fica guardada nas regras', () => {
  assert.deepEqual(rules.intensidades.A1.recuperacaoHoras, [0, 6])
  assert.deepEqual(rules.intensidades.A2.recuperacaoHoras, [12, 24])
  assert.deepEqual(rules.intensidades.A3.recuperacaoHoras, [24, 48])
  assert.deepEqual(rules.intensidades.AA.recuperacaoHoras, [6, 24])
})

// ---------- Tabela de tempos (método do treinador) ----------

test('tabela de tempos a partir do teste de 400 m (ex.: 6\'00")', () => {
  const t = timeTable(rules, 360)
  // 100 m: A1 = 400 ÷ 4; A2 = A1 − 2"; A3 = A1 − 4"
  assert.deepEqual(t['100'], { A1: [90, 90], A2: [88, 88], A3: [86, 86] })
  // 200 m: A2 = 400 ÷ 2; A1 = A2 + 4 a 6"; A3 = A2 − 4 a 6"
  assert.deepEqual(t['200'], { A1: [184, 186], A2: [180, 180], A3: [174, 176] })
  // 50 m: (A1 do 100 ÷ 2) − 2 a 3"; A2 = A1 − 2"; A3 = A1 − 4"
  assert.deepEqual(t['50'], { A1: [42, 43], A2: [40, 41], A3: [38, 39] })
  // 400 m: 30" acima do melhor
  assert.deepEqual(t['400'], { AC: [390, 390] })
})

test('tempo de nado de cada repetição pela tabela; outras distâncias estimadas', () => {
  const t = timeTable(rules, 360)
  assert.equal(repSeconds(rules, t, 100, 'A1'), 90)
  assert.equal(repSeconds(rules, t, 200, 'A3'), 175) // meio de 2'54" a 2'56"
  assert.equal(repSeconds(rules, t, 50, 'A2'), 40.5)
  assert.equal(repSeconds(rules, t, 400, 'A2'), 390) // 400: 30" acima do melhor
  // Sem intensidade: A2
  assert.equal(repSeconds(rules, t, 100, undefined), 88)
  // 150 m: ritmo entre o do 100 e o do 200
  const r150 = repSeconds(rules, t, 150, 'A2')
  assert.ok(r150 > 1.5 * 88 && r150 < 1.5 * 90, String(r150))
  // 25 m: ritmo do 50; 800 m: ritmo do 400
  assert.equal(repSeconds(rules, t, 25, 'A1'), 21.25)
  assert.equal(repSeconds(rules, t, 800, 'A1'), 780)
  // A tabela não cobre solto nem velocidade
  assert.equal(repSeconds(rules, t, 100, 'solto'), null)
  assert.equal(repSeconds(rules, t, 25, 'forte'), null)
})

test('escada progressiva: começa no A1 e termina no A3 (ou no A2, se A3 não pode)', async () => {
  const { ladder } = await import('./series/regras.js')
  assert.deepEqual(ladder(3), ['A1', 'A2', 'A3'])
  assert.deepEqual(ladder(4), ['A1', 'A2', 'A1', 'A3'])
  assert.deepEqual(ladder(6), ['A1', 'A1', 'A2', 'A2', 'A3', 'A3'])
  assert.deepEqual(ladder(4, 'A2'), ['A1', 'A2', 'A1', 'A2'])
  assert.deepEqual(ladder(2), ['A1', 'A2'])
})

// ---------- Validação do arquivo de regras ----------

test('a validação das regras aponta os erros', () => {
  assert.deepEqual(validateRules(structuredClone(rules)), [])

  const cases = [
    [(r) => { r.niveis.iniciante.estruturas[0].partes = ['nado'] }, 'niveis.iniciante.estruturas, estrutura 1'],
    [(r) => { delete r.niveis.avancado }, 'niveis.avancado.estruturas'],
    [(r) => { r.niveis.avancado.estruturas[2].ateMinutos = 120 }, 'a última estrutura não leva "ateMinutos"'],
    [(r) => { r.pausas.hidratacao.minutos = 0 }, 'pausas.hidratacao.minutos'],
    [(r) => { r.segundaPrincipal.alternarCrawlEEstilo = 'sim' }, 'segundaPrincipal.alternarCrawlEEstilo'],
    [(r) => { r.materialObrigatorio[0].distanciaAcimaDe = '400m' }, '"distanciaAcimaDe"'],
    [(r) => { r.materialObrigatorio[0].emPiramidesAPartirDe = 0 }, '"emPiramidesAPartirDe"'],
    [(r) => { r.material.principal.piramides = 'aleatorio' }, 'material.principal.piramides'],
    [(r) => { r.material.perna.semMaterial = 'nunca' }, 'material.perna.semMaterial'],
    [(r) => { r.material.perna.pesoComMaterial = 0 }, 'material.perna.pesoComMaterial'],
    [(r) => { r.limitesPorNivel.crawl = { iniciante: 100 } }, 'limitesPorNivel.crawl: "crawl" precisa ser'],
    [(r) => { r.misturaDeNados.parteDeCrawl.avancado = 3 }, 'misturaDeNados.parteDeCrawl'],
    [(r) => { r.descansos.iniciante['50'] = [40, 25] }, 'descansos.iniciante.50'],
    [(r) => { r.intensidades.A1.esforco.iniciante = [60, 120] }, 'intensidades.A1.esforco.iniciante'],
    [(r) => { r.tabelaDeTempos['100'].divisor = 0 }, 'tabelaDeTempos.100.divisor'],
    [(r) => { r.tabelaDeTempos['200'].ajustes.A1 = [6, 4] }, 'tabelaDeTempos.200.ajustes.A1'],
    [(r) => { r.intensidades.A3.material.semMaterialSo = ['junior'] }, 'intensidades.A3.material.semMaterialSo'],
    [(r) => { r.descansos.avancado = {} }, 'descansos.avancado'],
    [(r) => { r.descansos.avancado['cem'] = [20, 30] }, '"cem" precisa ser uma distância'],
    [(r) => { r.misturaDeNados.minimoDeSeries = 1 }, 'misturaDeNados.minimoDeSeries'],
    [(r) => { r.misturaDeNados.pesoMelhorEstilo = 0 }, 'misturaDeNados.pesoMelhorEstilo'],
    [(r) => { r.limitesPorNivel.borboleta.iniciante = 110 }, 'limitesPorNivel.borboleta.iniciante'],
    [(r) => { r.limitesPorNivel.borboleta.junior = 100 }, '"junior"'],
    [(r) => { r.materialObrigatorio[0].material = ['nadadeira'] }, 'materialObrigatorio, regra 1: "material"'],
    [(r) => { r.pausas.hidratacao.texto = '' }, 'pausas.hidratacao.texto'],
    [(r) => { r.pausas.principal = { minutos: 5, texto: 'x' } }, 'já é uma parte do treino'],
    [(r) => { delete r.pausas }, 'niveis.avancado.estruturas, estrutura 3'],
    [(r) => { r.niveis.avancado.estruturas.unshift({ ateMinutos: 60, partes: ['aquecimento'] }) }, 'maior que o da estrutura anterior'],
    [(r) => { r.material.velocidade.opcoes.push(['nadadeira']) }, 'opção 5'],
    [(r) => { r.material.velocidade.porSerie['2'] = [['nadando', 'nadando']] }, 'pelo menos uma série com material'],
    [(r) => { r.material.velocidade.porSerie['4'] = [['material', 'nadando']] }, 'precisa ter 4 itens'],
    [(r) => { r.material.velocidade.porSerie['4'] = [[['pe_de_pato'], ['nadadeira'], 'nadando', 'material']] }, 'lista de materiais'],
    [(r) => { r.material.velocidade.porSerie['1'] = [['material']] }, 'número de séries'],
    [(r) => { r.material.natacao = { opcoes: [['palmar']] } }, 'não é uma parte do treino'],
    [(r) => { r.intervalos.velocidade.excecoes.push({ fase: 'polimento', segundos: 60 }) }, '"fase" precisa ser'],
    [(r) => { r.intervalos.velocidade.excecoes.push({ fase: 'realizacao', repeticoesPorSerie: 8, segundos: 60 }) }, 'use uma condição'],
    [(r) => { r.intervalos.velocidade.excecoes.push({ repeticoesPorSerie: 8, segundos: '1min' }) }, '"segundos"'],
    [(r) => { r.intervalos.velocidade.padrao = 'fixo' }, 'padrao'],
    [(r) => { r.intervalos.principal.porNivel.iniciante = [180, 120] }, 'intervalos.principal.porNivel.iniciante'],
    [(r) => { delete r.intervalos.principal.porNivel.avancado }, 'intervalos.principal.porNivel.avancado'],
  ]
  for (const [change, expected] of cases) {
    const broken = structuredClone(rules)
    change(broken)
    const problems = validateRules(broken)
    assert.ok(problems.some((p) => p.includes(expected)), `${expected} -> ${JSON.stringify(problems)}`)
  }
})

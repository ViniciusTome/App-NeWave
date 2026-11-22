import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPart, validate } from './series/index.js'
import { intervalBetweenSets, loadRules, partsForLevel, seriesVariations, validateRules } from './series/regras.js'

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

test('intermediário e avançado: até 50 min sem perna; acima disso, perna depois da série principal', () => {
  const curto = ['aquecimento', 'velocidade', 'solto', 'principal', 'soltura']
  const longo = ['aquecimento', 'velocidade', 'solto', 'principal', 'perna', 'soltura']
  for (const nivel of ['intermediario', 'avancado']) {
    assert.deepEqual(partsForLevel(rules, nivel, 30), curto)
    assert.deepEqual(partsForLevel(rules, nivel, 45), curto)
    assert.deepEqual(partsForLevel(rules, nivel, 50), curto)
    assert.deepEqual(partsForLevel(rules, nivel, 60), longo)
    assert.deepEqual(partsForLevel(rules, nivel, 75), longo)
  }
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

test('medley precisa de repetições em múltiplo de 4', () => {
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

// ---------- Validação do arquivo de regras ----------

test('a validação das regras aponta os erros', () => {
  assert.deepEqual(validateRules(structuredClone(rules)), [])

  const cases = [
    [(r) => { r.niveis.iniciante.estruturas[0].partes = ['nado'] }, 'niveis.iniciante.estruturas, estrutura 1'],
    [(r) => { delete r.niveis.avancado }, 'niveis.avancado.estruturas'],
    [(r) => { r.niveis.iniciante.estruturas[0].partes = ['aquecimento', 'solto', 'solto'] }, 'parte repetida'],
    [(r) => { r.niveis.avancado.estruturas[1].ateMinutos = 120 }, 'a última estrutura não leva "ateMinutos"'],
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
  ]
  for (const [change, expected] of cases) {
    const broken = structuredClone(rules)
    change(broken)
    const problems = validateRules(broken)
    assert.ok(problems.some((p) => p.includes(expected)), `${expected} -> ${JSON.stringify(problems)}`)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPart } from './series/index.js'
import { loadRules, materialVariations, partsForLevel, validateRules } from './series/regras.js'

const rules = loadRules()
const velocidade = loadPart('velocidade')
const serie = (id) => velocidade.find((s) => s.id === id)
const textos = (id, equipment) =>
  materialVariations(rules, 'velocidade', serie(id), equipment).map((v) => v.texto)

const TODO_MATERIAL = ['pe_de_pato', 'palmar', 'pull_buoy', 'prancha', 'snorkel']

// ---------- Níveis ----------

test('iniciante não faz velocidade; intermediário e avançado fazem', () => {
  assert.deepEqual(partsForLevel(rules, 'iniciante'), ['aquecimento', 'principal', 'soltura'])
  assert.ok(partsForLevel(rules, 'intermediario').includes('velocidade'))
  assert.ok(partsForLevel(rules, 'avancado').includes('velocidade'))
})

// ---------- Material na velocidade ----------

test('série sem intervalo entre séries: material na série inteira ou nadando, nunca trocando no meio', () => {
  assert.deepEqual(textos('vel-8x25-forte', TODO_MATERIAL), [
    '8 x 25 forte',
    '8 x 25 forte · com pé de pato',
    '8 x 25 forte · com palmar',
    '8 x 25 forte · com pé de pato + palmar',
    '8 x 25 forte · com palmar + pull buoy',
  ])
  // Nenhuma variação muda o material entre as repetições
  for (const id of ['vel-4x25-forte', 'vel-16x25-forte', 'vel-8x25-15-forte-10-solto', 'vel-4x15']) {
    const variations = materialVariations(rules, 'velocidade', serie(id), TODO_MATERIAL)
    assert.ok(variations.every((v) => v.padrao !== 'por_serie'), id)
  }
})

test('(2x): troca o material entre a 1ª e a 2ª série', () => {
  const lista = textos('vel-2x4x25-forte', ['pe_de_pato'])
  assert.deepEqual(lista, [
    '(2x) 4 x 25 forte',
    '(2x) 4 x 25 forte · com pé de pato',
    '(2x) 4 x 25 forte · 1ª série com pé de pato, 2ª série nadando',
  ])
  assert.ok(textos('vel-2x8x25-forte', ['pe_de_pato']).includes(
    '(2x) 8 x 25 forte · 1ª série com pé de pato, 2ª série nadando',
  ))
})

test('(4x): troca o material entre as séries, conforme os modelos das regras', () => {
  const variations = materialVariations(rules, 'velocidade', serie('vel-4x4x25-forte'), ['palmar', 'pull_buoy'])
  const porSerie = variations.filter((v) => v.padrao === 'por_serie').map((v) => v.texto)
  assert.deepEqual(porSerie, [
    '(4x) 4 x 25 forte · 1ª e 3ª séries com palmar, 2ª e 4ª séries nadando',
    '(4x) 4 x 25 forte · 1ª e 2ª séries com palmar, 3ª e 4ª séries nadando',
    '(4x) 4 x 25 forte · 1ª e 3ª séries com palmar + pull buoy, 2ª e 4ª séries nadando',
    '(4x) 4 x 25 forte · 1ª e 2ª séries com palmar + pull buoy, 3ª e 4ª séries nadando',
  ])
  // O material de cada série fica registrado, para o cálculo da duração
  assert.deepEqual(variations.find((v) => v.padrao === 'por_serie').series, [['palmar'], [], ['palmar'], []])
})

test('só oferece o material que o atleta tem', () => {
  // Sem nenhum material: a série sai como está
  assert.deepEqual(textos('vel-2x4x25-forte', []), ['(2x) 4 x 25 forte'])
  // Só pull buoy não basta: as opções com pull buoy exigem palmar junto
  assert.deepEqual(textos('vel-8x25-forte', ['pull_buoy']), ['8 x 25 forte'])
  // Pé de pato + palmar só aparece se tiver os dois
  assert.ok(!textos('vel-8x25-forte', ['pe_de_pato']).some((t) => t.includes('palmar')))
})

test('série com material escrito no JSON é fixa', () => {
  const fixa = { ...serie('vel-8x25-forte'), exige: { estilos: [], outroEstilo: false, material: ['palmar'] } }
  const variations = materialVariations(rules, 'velocidade', fixa, TODO_MATERIAL)
  assert.deepEqual(variations.map((v) => v.padrao), ['fixo'])
})

test('parte sem regra de material: a série sai como está', () => {
  const aquecimento = loadPart('aquecimento')
  const variations = materialVariations(rules, 'aquecimento', aquecimento[0], TODO_MATERIAL)
  assert.deepEqual(variations.map((v) => v.padrao), ['sem_material'])
})

// ---------- Validação do arquivo de regras ----------

test('a validação das regras aponta os erros', () => {
  const ok = structuredClone(rules)
  assert.deepEqual(validateRules(ok), [])

  const cases = [
    [(r) => { r.niveis.iniciante.partes = ['nado'] }, 'niveis.iniciante.partes'],
    [(r) => { delete r.niveis.avancado }, 'niveis.avancado.partes'],
    [(r) => { r.material.velocidade.opcoes.push(['nadadeira']) }, 'opção 5'],
    [(r) => { r.material.velocidade.porSerie['2'] = [['material', 'material']] }, 'pelo menos uma série com material e uma nadando'],
    [(r) => { r.material.velocidade.porSerie['4'] = [['material', 'nadando']] }, 'precisa ter 4 itens'],
    [(r) => { r.material.velocidade.porSerie['1'] = [['material']] }, 'número de séries'],
    [(r) => { r.material.natacao = { opcoes: [['palmar']] } }, 'não é uma parte do treino'],
  ]
  for (const [change, expected] of cases) {
    const broken = structuredClone(rules)
    change(broken)
    const problems = validateRules(broken)
    assert.ok(problems.some((p) => p.includes(expected)), `${expected} -> ${JSON.stringify(problems)}`)
  }
})

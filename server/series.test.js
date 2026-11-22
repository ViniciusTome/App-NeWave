import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describe, loadLibrary, loadPart, validate } from './series/index.js'

const byId = (list, id) => list.find((serie) => serie.id === id)

// ---------- Arquivos da biblioteca ----------

test('os arquivos da biblioteca de séries são válidos', () => {
  // Se algum arquivo tiver erro, loadLibrary lança a lista de problemas
  const library = loadLibrary()
  assert.ok(library.aquecimento.length > 0)
})

test('aquecimento: metragem, distância sem parar e estilos calculados', () => {
  const aquecimento = loadPart('aquecimento')

  const livre300 = byId(aquecimento, 'aq-livre-300')
  assert.equal(livre300.volume, 300)
  assert.equal(livre300.maiorDistancia, 300)
  assert.deepEqual(livre300.exige, { estilos: [], outroEstilo: false, material: [] })
  assert.deepEqual(livre300.piscinas, [25, 50])
  assert.deepEqual(livre300.usos, ['treino'])

  // "voltando estilo" exige um estilo além do crawl
  const estilo = byId(aquecimento, 'aq-crawl-estilo-100')
  assert.deepEqual(estilo.exige.estilos, ['crawl'])
  assert.equal(estilo.exige.outroEstilo, true)

  // "voltando medley" exige os quatro estilos
  const medley = byId(aquecimento, 'aq-crawl-medley-400')
  assert.deepEqual(medley.exige.estilos, ['crawl', 'costas', 'peito', 'borboleta'])
})

test('aquecimento: "voltando medley" só fecha o medley nas piscinas certas', () => {
  const aquecimento = loadPart('aquecimento')
  // 200 na piscina de 50 m são só 2 voltas: não dá para passar pelos 4 estilos
  assert.deepEqual(byId(aquecimento, 'aq-crawl-medley-200').piscinas, [25])
  assert.deepEqual(byId(aquecimento, 'aq-crawl-medley-400').piscinas, [25, 50])
})

test('aquecimento: a série por sensação é para dia de teste', () => {
  const sensacao = byId(loadPart('aquecimento'), 'aq-ate-aquecer')
  assert.deepEqual(sensacao.usos, ['teste'])
  assert.equal(sensacao.duracaoMinutos, 15)
  assert.equal(sensacao.volume, 0)
  assert.deepEqual(sensacao.piscinas, [25, 50])
})

// ---------- Validação (o que acontece quando alguém digita errado) ----------

const ok = { id: 'x-1', texto: '4 x 50 crawl', blocos: [{ repeticoes: 4, distancia: 50, nado: 'crawl', intensidade: 'A2', descanso: 20 }] }

test('uma série correta não tem problemas', () => {
  assert.deepEqual(validate([ok]), [])
})

test('a validação aponta cada erro, dizendo a série e o campo', () => {
  const cases = [
    [{ ...ok, distancia: 100 }, 'campo "distancia" não existe'],
    [{ ...ok, id: 'Aquecimento 1' }, '"id" precisa ser'],
    [{ ...ok, texto: '' }, '"texto" é obrigatório'],
    [{ ...ok, usos: ['competicao'] }, '"usos"'],
    [{ ...ok, blocos: [] }, 'pelo menos um bloco'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], distancia: 60 }] }, 'múltiplo de 25'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], nado: 'golfinho' }] }, '"nado"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], nado: ['crawl'] }] }, '"nado"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], intensidade: 'A4' }] }, '"intensidade"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], descanso: '20s' }] }, '"descanso"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], material: ['nadadeira'] }] }, '"material"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], repeticoes: 0 }] }, '"repeticoes"'],
    [{ ...ok, duracaoMinutos: 10 }, 'só vale para série "porSensacao"'],
    [{ ...ok, porSensacao: true }, 'não tem blocos'],
    // 75 m indo e voltando: 3 piscinas de 25, não fecha em pares
    [{ ...ok, blocos: [{ ...ok.blocos[0], distancia: 75, nado: ['crawl', 'estilo'] }] }, 'não fecha em nenhuma piscina'],
  ]
  for (const [serie, expected] of cases) {
    const problems = validate([serie])
    assert.ok(problems.some((p) => p.includes(expected)), `${expected} -> ${JSON.stringify(problems)}`)
    assert.ok(problems.every((p) => p.startsWith('Série ')), 'toda mensagem diz qual série')
  }
})

test('id repetido é apontado', () => {
  const problems = validate([ok, { ...ok }])
  assert.deepEqual(problems, ['Série "x-1": "id" repetido: cada série precisa de um id diferente.'])
})

test('o arquivo precisa ser uma lista', () => {
  assert.equal(validate({ id: 'x' }).length, 1)
})

test('séries com vários blocos somam a metragem e juntam o material', () => {
  const serie = describe({
    id: 'p-1',
    texto: '(2x) 4 x 25',
    blocos: [
      { repeticoes: 4, distancia: 25, nado: 'crawl', intensidade: 'A3', material: ['pe_de_pato'] },
      { repeticoes: 4, distancia: 25, nado: 'crawl', intensidade: 'A3' },
    ],
  })
  assert.equal(serie.volume, 200)
  assert.equal(serie.maiorDistancia, 25)
  assert.deepEqual(serie.exige.material, ['pe_de_pato'])
  // 25 m não fecha numa piscina de 50 m
  assert.deepEqual(serie.piscinas, [25])
})

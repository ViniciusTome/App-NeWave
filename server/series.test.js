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

test('velocidade: "vezes" multiplica a metragem', () => {
  const velocidade = loadPart('velocidade')
  assert.equal(velocidade.length, 10)
  assert.equal(byId(velocidade, 'vel-4x25-forte').volume, 100)
  assert.equal(byId(velocidade, 'vel-2x4x25-forte').volume, 200)
  assert.equal(byId(velocidade, 'vel-2x8x25-forte').volume, 400)
  assert.equal(byId(velocidade, 'vel-16x25-forte').volume, 400)
  assert.equal(byId(velocidade, 'vel-4x4x25-forte').volume, 400)
  assert.equal(byId(velocidade, 'vel-8x25-15-forte-10-solto').volume, 200)
  assert.equal(byId(velocidade, 'vel-8x15').volume, 120)
})

test('velocidade: tiros de 25 m só fecham na piscina de 25 m; tiros de 15 m em qualquer uma', () => {
  const velocidade = loadPart('velocidade')
  assert.deepEqual(byId(velocidade, 'vel-8x25-forte').piscinas, [25])
  assert.deepEqual(byId(velocidade, 'vel-4x15').piscinas, [25, 50])
  assert.equal(byId(velocidade, 'vel-4x15').maiorDistancia, 15)
})

test('solto: 100 e 200 solto, com a observação do pull buoy', () => {
  const solto = loadPart('solto')
  assert.deepEqual(solto.map((s) => s.texto), ['100 solto', '200 solto'])
  for (const serie of solto) {
    assert.equal(serie.observacao, 'Pode ser feito com pull buoy.')
    // A observação é só um aviso: o pull buoy não vira exigência
    assert.deepEqual(serie.exige.material, [])
  }
})

test('principal: 25 séries, com a metragem calculada', () => {
  const principal = loadPart('principal')
  assert.equal(principal.length, 25)
  const volume = (id) => byId(principal, id).volume
  assert.equal(volume('pri-2x10x100'), 2000)
  assert.equal(volume('pri-3x800'), 2400)
  assert.equal(volume('pri-4x3x200'), 2400)
  // Grupos que se repetem: (3x) 1 x 100, 2 x 75, 3 x 50, 4 x 25 = 3 x 500
  assert.equal(volume('pri-3x-100-75-50-25'), 1500)
  assert.equal(volume('pri-4x-100-75-100-25'), 2600)
  assert.equal(volume('pri-2x-200-50'), 800)
  assert.equal(volume('pri-2x-200-100-50'), 1200)
  // Pirâmides
  assert.equal(volume('pri-piramide-400-50'), 1600)
  assert.equal(volume('pri-piramide-50-200-50'), 2000)
  assert.equal(volume('pri-piramide-400-50-400'), 2800)
})

test('principal: séries com 75 m só fecham na piscina de 25 m', () => {
  const principal = loadPart('principal')
  assert.deepEqual(byId(principal, 'pri-4x4x75').piscinas, [25])
  assert.deepEqual(byId(principal, 'pri-3x-100-75-50-25').piscinas, [25])
  // 250 m = 5 piscinas de 50 m: funciona nas duas
  assert.deepEqual(byId(principal, 'pri-6x250').piscinas, [25, 50])
  assert.deepEqual(byId(principal, 'pri-6x150').piscinas, [25, 50])
  assert.deepEqual(byId(principal, 'pri-5x400').piscinas, [25, 50])
  // Distância sem parar exigida: a maior repetição
  assert.equal(byId(principal, 'pri-piramide-400-50-400').maiorDistancia, 400)
})

// ---------- Validação (o que acontece quando alguém digita errado) ----------

const trechos = (forte, solto) => [{ metros: forte, intensidade: 'forte' }, { metros: solto, intensidade: 'solto' }]
const semIntensidade = { repeticoes: 4, nado: 'livre' }
const ok = { id: 'x-1', texto: '4 x 50 crawl', blocos: [{ repeticoes: 4, distancia: 50, nado: 'crawl', intensidade: 'A2', descanso: 20 }] }

test('uma série correta não tem problemas', () => {
  assert.deepEqual(validate([ok]), [])
  // Sem intensidade: fica em aberto, para ser definida na hora de gerar o treino
  const { intensidade: _sem, ...semIntensidadeOk } = ok.blocos[0]
  assert.deepEqual(validate([{ ...ok, blocos: [semIntensidadeOk] }]), [])
})

test('a validação aponta cada erro, dizendo a série e o campo', () => {
  const cases = [
    [{ ...ok, distancia: 100 }, 'campo "distancia" não existe'],
    [{ ...ok, id: 'Aquecimento 1' }, '"id" precisa ser'],
    [{ ...ok, texto: '' }, '"texto" é obrigatório'],
    [{ ...ok, observacao: '' }, '"observacao"'],
    [{ ...ok, observacao: 'x'.repeat(201) }, '"observacao"'],
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
    [{ ...ok, blocos: [{ ...ok.blocos[0], distancia: 17 }] }, 'tiro curto'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], vezes: 0 }] }, '"vezes"'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], intensidade: 'rapido' }] }, '"intensidade"'],
    [{ ...ok, vezes: 2 }, 'com um bloco só, coloque "vezes" dentro do bloco'],
    [{ ...ok, vezes: 0, blocos: [ok.blocos[0], ok.blocos[0]] }, '"vezes" da série'],
    [{ ...ok, blocos: [{ ...ok.blocos[0], distancia: 25, trechos: trechos(15, 10) }] }, 'não os dois'],
    [{ ...ok, blocos: [{ ...semIntensidade, distancia: 25, trechos: trechos(15, 5) }] }, 'os trechos somam 20 m, mas a "distancia" é 25 m'],
    [{ ...ok, blocos: [{ ...semIntensidade, distancia: 25, trechos: [{ metros: 25, intensidade: 'forte' }] }] }, 'pelo menos dois trechos'],
    [{ ...ok, blocos: [{ ...semIntensidade, distancia: 25, trechos: [{ metros: 15, intensidade: 'forte' }, { metros: 10, ritmo: 'solto' }] }] }, 'campo "ritmo" não existe'],
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trainingSummary } from './swimming.js'

const parts = (metros) => JSON.stringify([{ parte: 'principal', metros }])
const feito = (date, difficulty, reason = null, metros = 1000) => ({ date, completed_at: `${date}T20:00:00Z`, missed_at: null, difficulty, difficulty_reason: reason, parts: parts(metros) })
const naoFeito = (date, metros = 1000) => ({ date, completed_at: null, missed_at: null, difficulty: null, difficulty_reason: null, parts: parts(metros) })

test('resumo: nota média das últimas 4 semanas e das 4 antes', () => {
  const hoje = '2026-11-25' // quarta
  const rows = [
    feito('2026-11-20', 6), feito('2026-11-10', 7), // últimas 4 semanas: 6,5
    feito('2026-10-20', 8), feito('2026-10-10', 7.6 | 0), // antes: 7,5
  ]
  const { notas } = trainingSummary(rows, hoje)
  assert.equal(notas.recentes, 6.5)
  assert.equal(notas.treinosRecentes, 2)
  assert.equal(notas.anteriores, 7.5)
  // Sem notas: null
  assert.equal(trainingSummary([naoFeito('2026-11-20')], hoje).notas.recentes, null)
})

test('resumo: o que mais pesou nos últimos 10 treinos com nota', () => {
  const rows = Array.from({ length: 12 }, (_, i) => feito(`2026-11-${String(i + 1).padStart(2, '0')}`, 8,
    i >= 2 ? (i % 3 === 0 ? 'respiracao' : i % 3 === 1 ? 'forca' : null) : 'respiracao'))
  const { motivos } = trainingSummary(rows, '2026-11-25')
  assert.equal(motivos.treinos, 10)
  // (dias 3 a 12: i = 2..11)
  const esperado = (m) => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((i) => (i % 3 === 0 ? 'respiracao' : i % 3 === 1 ? 'forca' : null) === m).length
  assert.equal(motivos.respiracao, esperado('respiracao'))
  assert.equal(motivos.forca, esperado('forca'))
})

test('resumo: metragem da semana (segunda a domingo) e frequência dos últimos 30 dias', () => {
  const hoje = '2026-11-25' // quarta: a semana vai de 23/11 a 29/11
  const rows = [
    feito('2026-11-23', 6, null, 1800), naoFeito('2026-11-25', 2000), naoFeito('2026-11-27', 1900),
    feito('2026-11-21', 5, null, 1500), naoFeito('2026-11-19', 1600), feito('2026-11-17', 7, null, 1700),
  ]
  const { semana, frequencia } = trainingSummary(rows, hoje)
  assert.deepEqual([semana.inicio, semana.fim], ['2026-11-23', '2026-11-29'])
  assert.equal(semana.planejado, 1800 + 2000 + 1900)
  assert.equal(semana.nadado, 1800)
  assert.deepEqual([semana.feitos, semana.treinos], [1, 3])
  // Os que já passaram (o de hoje ainda não feito não conta) e os feitos
  assert.deepEqual([frequencia.feitos, frequencia.treinos, frequencia.faltas], [3, 4, 1])
})

test('metros de cada estilo numa parte, pelo card', async () => {
  const { strokeMeters } = await import('./generator.js')
  assert.deepEqual(strokeMeters('400 m solto', 400), { crawl: 400 })
  assert.deepEqual(strokeMeters('(2x) 4 x 100 m · c/2\' de intervalo\n1ª série: NAD · A1 · PE · a/c 1\'50"\n2ª série: c/PALM · A2 · PE', 800), { peito: 800 })
  // Mistura: cada repetição com o seu estilo; ME = melhor estilo
  assert.deepEqual(strokeMeters('4 x 50 m · CR | ME | CR | BO', 200, 'costas'), { crawl: 100, costas: 50, borboleta: 50 })
  // Medley: 1/4 de cada estilo
  assert.deepEqual(strokeMeters('8 x 25 m forte · MD · a/c 40"', 200), { borboleta: 50, costas: 50, peito: 50, crawl: 50 })
})

test('resumo: % de cada estilo no nadado (4 semanas) e no planejado (4 semanas)', () => {
  const parte = (metros, estilos) => ({ parte: 'principal', metros, estilos })
  const comPartes = (row, partes) => ({ ...row, parts: JSON.stringify(partes) })
  const hoje = '2026-11-25'
  const rows = [
    comPartes(feito('2026-11-20', 6), [parte(600, { crawl: 600 }), parte(400, { peito: 400 })]),
    comPartes(naoFeito('2026-11-27'), [parte(1000, { peito: 1000 })]),
    // Sem o cálculo guardado (treino antigo): pelo texto
    { ...naoFeito('2026-12-01'), parts: JSON.stringify([{ parte: 'principal', metros: 1000, texto: '10 x 100 m · CR' }]) },
  ]
  const { estilos } = trainingSummary(rows, hoje)
  assert.deepEqual(estilos.nadado, { metros: 1000, porEstilo: { crawl: 60, peito: 40 } })
  assert.deepEqual(estilos.planejado, { metros: 2000, porEstilo: { peito: 50, crawl: 50 } })
})

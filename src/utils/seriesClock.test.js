import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esperaDepoisDe, planoDaSerie, textoDaRepeticao } from './seriesClock.js'

test('relógio: no fim de cada série, o intervalo soma o descanso da última repetição', () => {
  const p = planoDaSerie('(3x) 4 x 50 m · A2 · CR · D15" de descanso · c/1\' de intervalo')
  assert.equal(p.reps.length, 12)
  assert.equal(esperaDepoisDe(p, 0), 15) // entre as repetições: o descanso
  assert.equal(esperaDepoisDe(p, 3), 60 + 15) // fim da 1ª série: 1' + 15"
  assert.equal(esperaDepoisDe(p, 7), 75)
})

test('relógio: séries por tempo (nada o tempo e descansa, sozinho)', () => {
  const p = planoDaSerie("5 x 4' (progressivo: em cada tiro, nade mais metros que no anterior) · progressivo · CR · D1' de descanso")
  assert.equal(p.reps.length, 5)
  assert.ok(p.reps.every((r) => r.modo === 'tempo' && r.nadar === 240 && r.segundos === 60))
  assert.equal(textoDaRepeticao(p.reps[0]), "4' nadando")
  // Pirâmide por tempo: cada repetição com o seu tempo; a última sem descanso
  const piramide = planoDaSerie("1 x 1' · A1 · CR · D45\" de descanso\n1 x 2' · A1 · CR · D45\" de descanso\n1 x 1' · A1 · CR")
  assert.deepEqual(piramide.reps.map((r) => [r.nadar, r.segundos]), [[60, 45], [120, 45], [60, 0]])
  // Uma repetição só por tempo (ex.: 30' contínuo): conta os 30 minutos
  assert.equal(planoDaSerie("1 x 30' (contínuo) · A1/A2 · CR").reps[0].nadar, 1800)
  // Por tempo com séries: (2x) e intervalo + descanso
  const comSeries = planoDaSerie("(2x) 3 x 2' · A1 · CR · D30\" de descanso · c/2' de intervalo")
  assert.equal(esperaDepoisDe(comSeries, 2), 120 + 30)
})

test('relógio: o que não tem saída nem descanso continua sem relógio', () => {
  assert.equal(planoDaSerie('400 m solto'), null)
  assert.equal(planoDaSerie('1 x 400 m (alternando 50 leve e 50 moderado) · A1/A2 · CR'), null)
  // Distância continua igual
  const p = planoDaSerie('8 x 50 m · CR · A1 · D20" de descanso')
  assert.equal(p.reps[0].distancia, 50)
  assert.equal(p.reps[0].modo, 'descanso')
  assert.equal(textoDaRepeticao(p.reps[0]), '8 x 50 m')
})

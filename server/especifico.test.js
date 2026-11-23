import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeDaProva, podeUsarEspecifico, validarProva } from './especifico/index.js'

test('prova: distâncias de cada estilo na piscina; águas abertas de 250 m a 25 km', () => {
  assert.deepEqual(validarProva({ modality: 'piscina_50', distance: 1500, stroke: 'crawl' }), { distance: 1500, stroke: 'crawl', goalHundredths: null })
  assert.ok(validarProva({ modality: 'piscina_50', distance: 400, stroke: 'peito' }).erro)
  assert.ok(validarProva({ modality: 'piscina_50', distance: 100, stroke: 'medley' }).erro) // 100 medley só na de 25
  assert.equal(validarProva({ modality: 'piscina_25', distance: 100, stroke: 'medley' }).distance, 100)
  assert.ok(validarProva({ modality: 'piscina_25', distance: 200 }).erro) // sem estilo
  assert.equal(validarProva({ modality: 'triatlo', distance: 1900, stroke: 'costas' }).stroke, 'crawl')
  for (const distance of [200, 25050, 1525, undefined]) assert.ok(validarProva({ modality: 'maratona_aquatica', distance }).erro, String(distance))
  // Meta: ritmo de 40" a 6' a cada 100 m
  assert.equal(validarProva({ modality: 'piscina_25', distance: 200, stroke: 'crawl', goalHundredths: 15000 }).goalHundredths, 15000)
  for (const goalHundredths of [5000, 90000, 1.5]) assert.ok(validarProva({ modality: 'piscina_25', distance: 200, stroke: 'crawl', goalHundredths }).erro)
})

test('nome da prova', () => {
  assert.equal(nomeDaProva({ modality: 'piscina_25', distance: 200, stroke: 'costas' }), '200 m costas')
  assert.equal(nomeDaProva({ modality: 'piscina_50', distance: 100, stroke: 'crawl' }), '100 m livre')
  assert.equal(nomeDaProva({ modality: 'maratona_aquatica', distance: 1500 }), '1,5 km')
  assert.equal(nomeDaProva({ modality: 'triatlo', distance: 750 }), '750 m')
})

test('modelo Específico: com prova alvo, distância e meta, para quem nada a distância sem parar', () => {
  const prova = (distance, goalHundredths = 100000) => ({ distance, goalHundredths })
  const pode = (continuousDistance, competition, goal = 'competir') => podeUsarEspecifico({ goal, competition, profile: { continuousDistance } }).ok
  assert.equal(pode('200_400', prova(400)), true)
  assert.equal(pode('100_200', prova(400)), false)
  assert.equal(pode('1000_2000', prova(1500)), true)
  // Acima de 2 km: basta nadar mais de 2 km sem parar
  assert.equal(pode('mais_2000', prova(10000)), true)
  assert.equal(pode('1000_2000', prova(3000)), false)
  // Sem meta, sem distância ou sem prova: não
  assert.equal(pode('mais_2000', prova(400, null)), false)
  assert.equal(pode('mais_2000', { distance: null }), false)
  assert.equal(pode('mais_2000', null, 'saude'), false)
})

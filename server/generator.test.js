import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import {
  abbreviate, adaptToDistance, bestTimeFor, cardText, feedbackAdjustment, periodPhases, estimateSeconds, generateTrainings, saidaFor, saidasDaSerie, saidaText,
  saidaVelocidade, setOptions, trainingDates, withMeters,
} from './generator.js'
import { loadLibrary } from './series/index.js'
import {
  drawIntensities, intervalBetweenSets, intervalRangeFor, loadRules, partsForLevel, seriesVariations, strokeCategory,
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
    "(4x) 3 x 200 m · c/2' de intervalo\n1ª série: MD / PE / MD\n2ª série: ME / MD / ME\n3ª série: ME\n4ª série: ME / PE / MD")
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
  assert.deepEqual([...tipos].sort(), ['AC', 'NEG', 'POS', 'finalForte', 'intensidades'])
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
  // Avançado: descanso do 100 pela tabela de distância (20" a 30" -> 25")
  assert.deepEqual(['A1', 'A2', 'A3'].map((v) => saidaFor(rules, avancado, { distancia: 100 }, v)), [115, 115, 110])
  // 400 com 30 AC: melhor (6'00") + 30" + 1' de descanso = 7'30"
  assert.equal(saidaFor(rules, avancado, { distancia: 400 }, '30 AC'), 450)
  // Iniciante: descanso pela intensidade (A1 10", A2 15", A3 30")
  const iniciante = { level: 'iniciante', tabela: timeTable(rules, 360), teste400: 360 }
  assert.deepEqual(['A1', 'A2', 'A3'].map((v) => saidaFor(rules, iniciante, { distancia: 100 }, v)), [100, 105, 115])
  // Sem o teste (sem tabela) fica sem saída
  assert.equal(saidaFor(rules, { level: 'avancado' }, { distancia: 100 }, 'A1'), null)
})

test('texto da saída', () => {
  assert.equal(saidaText(45), '45"')
  assert.equal(saidaText(60), "1'00\"")
  assert.equal(saidaText(450), "7'30\"")
})

test('o card mostra a saída (cd) da série principal', () => {
  const textos = [1, 2, 3].flatMap((seed) => gerar(avancado, seed))
    .map((t) => t.partes.find((p) => p.parte === 'principal').texto)
  assert.ok(textos.some((t) => /cd \d+'\d{2}"/.test(t)), 'nenhum treino com saída')
})

test('na acumulação, A2/A3 perto do A1 ficam com a saída do A1; na transição, cada um com a sua', () => {
  const serie = { blocos: [{ repeticoes: 4, distancia: 100 }] }
  const I = { unidade: 'repeticao', valores: ['A1', 'A2', 'A1', 'A3'] }
  const avancado = { level: 'avancado', tabela: timeTable(rules, 360), teste400: 360 }
  // Sem fase definida vale a acumulação
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I), [115, 115, 115, 115])
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I, 'acumulacao'), [115, 115, 115, 115])
  assert.deepEqual(saidasDaSerie(rules, avancado, serie, I, 'transicao'), [115, 115, 115, 110])
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
  // 10 AC nos 100: 72 + 10 + 25" de descanso = 107 -> 1'45"
  assert.equal(saidaFor(rules, avancado, { distancia: 100 }, '10 AC'), 105)
  // Nos 400 vale o teste
  assert.equal(bestTimeFor(rules, avancado, 400), 360)
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

test('velocidade: avançado nos 25 a cada 30"; intermediário 1/1', () => {
  const tabela = timeTable(rules, 360)
  assert.equal(saidaVelocidade(rules, { level: 'avancado', tabela, teste400: 360 }, { distancia: 25 }), 30)
  // Intermediário: 25 forte ~16" + 16" de descanso -> 35"
  assert.equal(saidaVelocidade(rules, { level: 'intermediario', tabela, teste400: 360 }, { distancia: 25 }), 35)
  // O card mostra a saída
  const textos = [1, 2, 3, 4].flatMap((seed) => gerar(avancado, seed))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(textos.length > 0 && textos.every((t) => /cd \d+"/.test(t)), textos.join('\n'))
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
  assert.match(texto, /1 x 100 m · cd 1'55"/)
  // Transição: cada série com as suas saídas
  const transicao = saidasDaSerie(rules, avancado, serie, I, 'transicao')
  const texto2 = cardText({ ...serie, texto: '' }, variation, null, I, transicao)
  assert.match(texto2, /3ª série: A3 · 100 cd \d'\d{2}" \/ 75 cd/)
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
    assert.match(p.texto, /cd /)
    assert.match(p.aviso, /descanse o tempo de descanso/)
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
  for (const p of recuperar) assert.match(p.texto, /^10 x (50|100) m · c\/PÉ · ritmo leve/)
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
  for (const t of textos) assert.ok(!/cd \d/.test(t) && !/AC\)/.test(t) && !/\bA[123]\b/.test(t), t)
  assert.ok(textos.some((t) => /ritmo (leve|moderado|forte)/.test(t)), textos.join('\n'))
  assert.ok(textos.some((t) => /c\/\d+"? de descanso|c\/\d+' de descanso/.test(t)), textos.join('\n'))
  // Velocidade do intermediário: 1/1
  const velocidade = [1, 2, 3].flatMap((seed) => semTeste(gerar(semTempo, seed)))
    .flatMap((t) => t.partes.filter((p) => p.parte === 'velocidade').map((p) => p.texto))
  assert.ok(velocidade.every((t) => /1\/1/.test(t)), velocidade.join('\n'))
})

test('quem nada até 400 m sem parar descansa pelo menos 20 a 30 segundos', () => {
  const iniciante = {
    level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
    strokes: ['crawl'], equipment: ['pe_de_pato', 'palmar'], time400: null,
  }
  const descansos = [1, 2, 3, 4].flatMap((seed) => gerar(iniciante, seed)).flatMap((t) => t.partes)
    .flatMap((p) => [...p.texto.matchAll(/c\/(\d+)" de descanso/g)].map((m) => Number(m[1])))
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
  const normais = gerar(avancado)
  const metros = (ts) => ts.reduce((s, t) => s + t.plano.metrosPrincipal, 0)
  assert.ok(metros(treinos) < metros(normais), `${metros(treinos)} >= ${metros(normais)}`)
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

test('periodização: fases na proporção das regras, com a semana de cada fase', () => {
  const faseDe = periodPhases(rules, '2026-01-01', '2026-03-31') // 90 dias: 45 A, 27 T, 18 R
  assert.deepEqual(faseDe('2026-01-01'), { fase: 'acumulacao', semanaDaFase: 1 })
  assert.deepEqual(faseDe('2026-01-08'), { fase: 'acumulacao', semanaDaFase: 2 })
  assert.equal(faseDe('2026-02-14').fase, 'acumulacao')
  assert.deepEqual(faseDe('2026-02-15'), { fase: 'transicao', semanaDaFase: 1 })
  assert.deepEqual(faseDe('2026-03-14'), { fase: 'realizacao', semanaDaFase: 1 })
  assert.equal(faseDe('2026-03-31').fase, 'realizacao')
})

test('periodização: gera todos os treinos até a prova, com o plano de cada um', () => {
  const periodizacao = { inicio: '2026-11-23', fim: '2027-01-31', testeNaTransicao: true, numeroInicial: 1 }
  const treinos = generateTrainings({ rules, library, athlete: avancado, today: '2026-11-23', random: seeded(1), periodizacao })
  // Seg, qua e sex de 23/11 a 31/01
  assert.equal(treinos.length, trainingDates('2026-11-23', [1, 3, 5], 70).length)
  assert.equal(treinos.at(-1).date <= '2027-01-31', true)
  assert.deepEqual(treinos.map((t) => t.plano.numero), treinos.map((_, i) => i + 1))
  const fases = treinos.map((t) => t.plano.fase)
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

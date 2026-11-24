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

import { generateTrainings } from './generator.js'
import { loadLibrary } from './series/index.js'
import { loadRules } from './series/regras.js'
import { limiteDaProva, loadEspecifico, ritmoDeProva, tempoText } from './especifico/index.js'

const rules = loadRules()
const library = loadLibrary()
const esp = loadEspecifico()
const PROVAS = [
  { distancia: 50, estilo: 'crawl', metaCentesimos: 2800, modalidade: 'piscina_25' },
  { distancia: 100, estilo: 'borboleta', metaCentesimos: 6500, modalidade: 'piscina_50' },
  { distancia: 200, estilo: 'costas', metaCentesimos: 15000, modalidade: 'piscina_25' },
  { distancia: 200, estilo: 'medley', metaCentesimos: 15500, modalidade: 'piscina_25' },
  { distancia: 400, estilo: 'peito', metaCentesimos: 36000, modalidade: 'piscina_25' },
  { distancia: 1500, estilo: 'crawl', metaCentesimos: 120000, modalidade: 'piscina_50' },
  { distancia: 1900, estilo: 'crawl', metaCentesimos: 180000, modalidade: 'triatlo' },
  { distancia: 25000, estilo: 'crawl', metaCentesimos: 3000000, modalidade: 'maratona_aquatica' },
]
const ABREV = { crawl: 'CR', costas: 'CO', peito: 'PE', borboleta: 'BO', medley: 'MD' }

function gerar(prova, { level = 'avancado', seed = 1, pool = prova.modalidade === 'piscina_50' ? 50 : 25, sessionMinutes = 60, modelo = 'especifico', time400 = { hundredths: 33000, source: 'teste' } } = {}) {
  let s = seed
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const athlete = {
    level, swimmingSince: 'mais_5a', recentBreak: 'nao', continuousDistance: 'mais_2000', strokes: ['crawl', 'costas', 'peito', 'borboleta'],
    trainingDays: [1, 3, 5], sessionMinutes, poolLength: pool, equipment: ['palmar', 'pe_de_pato', 'pull_buoy', 'paraquedas'], injuries: '',
    bestStroke: 'costas', time400, modalidade: prova.modalidade, modelo, prova,
  }
  return generateTrainings({ rules, library, athlete, today: '2026-11-23', random, periodizacao: { inicio: '2026-11-23', fim: '2027-02-01', testeNaTransicao: true, numeroInicial: 1, provas: [] } })
}

test('ritmo de prova: a meta dividida igualmente (200 m em 2\'30" = 37"5 a cada 50 m)', () => {
  const prova = { distancia: 200, metaCentesimos: 15000 }
  assert.equal(ritmoDeProva(prova, 50), 37.5)
  assert.equal(tempoText(ritmoDeProva(prova, 50)), '37"5')
  assert.equal(tempoText(ritmoDeProva(prova, 100)), '1\'15"')
  assert.equal(tempoText(28), '28"')
  assert.deepEqual([limiteDaProva(esp.regras, 50), limiteDaProva(esp.regras, 100), limiteDaProva(esp.regras, 200), limiteDaProva(esp.regras, 1500)], [750, 1500, 2000, 15000])
})

test('Específico: Acumulação igual ao Geral; na Transição e na Realização, a série da prova dentro do limite', () => {
  for (const prova of PROVAS) {
    for (const level of ['intermediario', 'avancado']) {
      for (const seed of [1, 2]) {
        const treinos = gerar(prova, { level, seed })
        const geral = gerar(prova, { level, seed, modelo: 'geral' })
        let comEspecifico = 0
        treinos.forEach((t, i) => {
          const onde = `${prova.distancia} ${prova.estilo} ${level} ${t.date} ${t.plano.fase}`
          const esp = t.partes.filter((p) => p.especifico)
          if (t.plano.fase === 'acumulacao' || t.plano.diaDeTeste || t.plano.fase === 'recuperacao') {
            assert.equal(esp.length, 0, onde)
            if (t.plano.fase === 'acumulacao' && i < 3) assert.deepEqual(t.partes, geral[i].partes, onde) // igual ao Geral
            return
          }
          comEspecifico++
          assert.equal(esp.length, 1, onde)
          assert.equal(t.partes.filter((p) => p.parte === 'principal').length, 1, onde)
          // Limite da prova no treino inteiro (15x nos 50 e 100 m; 10x nas outras)
          const metros = t.partes.filter((p) => !p.foraDoLimite).reduce((m, p) => m + p.metros, 0)
          assert.ok(metros <= limiteDaProva({ limiteDaProva: { ate100: 15, outras: 10 } }, prova.distancia), `${onde}: ${metros} m`)
          // Estilo da prova; RP pela meta; borboleta até 100 m; piscina de 50 sem 25 e 75
          const texto = esp[0].texto
          assert.equal(esp[0].nado, prova.estilo, onde)
          assert.ok(texto.split('\n').filter((l) => / x \d+ m/.test(l)).every((l) => l.includes(`· ${ABREV[prova.estilo]}`) || (prova.estilo === 'medley' && l.includes('BO|CO|PE|CR'))), `${onde}\n${texto}`)
          for (const [, rep, rp] of texto.matchAll(/(\d+) m[^·]*· RP ([^ ]+) ·/g)) {
            assert.equal(rp, tempoText(ritmoDeProva(prova, Number(rep))), `${onde}\n${texto}`)
          }
          if (prova.estilo === 'borboleta') assert.ok(![...texto.matchAll(/x (\d+) m/g)].some(([, d]) => Number(d) > 100), texto)
          if (prova.modalidade === 'piscina_50') assert.ok(![...texto.matchAll(/x (\d+) m/g)].some(([, d]) => ['25', '75'].includes(d)), texto)
          assert.match(esp[0].observacao, /^RP = ritmo de prova/)
          // A velocidade continua
          if (level === 'avancado') assert.ok(t.partes.some((p) => p.parte === 'velocidade') || t.metros <= 1500, onde)
        })
        assert.ok(comEspecifico > 5, `${prova.distancia} ${level}: ${comEspecifico}`)
      }
    }
  }
})

test('Específico sem tempos de referência (sem o teste de 400 m): o RP continua saindo da meta', () => {
  const prova = PROVAS[2]
  const treinos = gerar(prova, { time400: null })
  const esp = treinos.flatMap((t) => t.partes.filter((p) => p.especifico))
  assert.ok(esp.length > 5)
  assert.ok(esp.some((p) => p.texto.includes('RP 37"5')))
})

test('Específico: A1/A2/A3 com a/c (pelo teste de 400 m), que muda com um tempo novo; o RP continua pela meta', async () => {
  const { refreshTimes } = await import('./generator.js')
  const prova = PROVAS[4] // 400 m peito
  const treinos = gerar(prova, { seed: 3 })
  const t = treinos.find((x) => x.partes.some((p) => p.especifico && /A[123] · PE · a\/c/.test(p.texto)))
  assert.ok(t, 'algum treino com A1/A2/A3 e a/c')
  const i = t.partes.findIndex((p) => p.especifico)
  const athlete = { level: 'avancado', continuousDistance: 'mais_2000', sessionMinutes: 60, poolLength: 25, strokes: ['crawl', 'peito'], time400: { hundredths: 30000, source: 'teste' } }
  const novas = refreshTimes(rules, athlete, t)
  assert.notEqual(novas[i].texto, t.partes[i].texto)
  const rps = (texto) => [...texto.matchAll(/RP [^ ]+/g)].map((m) => m[0])
  assert.deepEqual(rps(novas[i].texto), rps(t.partes[i].texto))
  // Sem tempos: o descanso no lugar do a/c
  const semTempo = gerar(prova, { seed: 3, time400: null }).flatMap((x) => x.partes.filter((p) => p.especifico))
  assert.ok(semTempo.every((p) => !p.texto.includes('a/c')))
})

test('Específico: sobra de tempo (provas curtas) vira "Saídas e técnica", fora do limite da prova', () => {
  const treinos = gerar(PROVAS[0]) // 50 m crawl, aula de 60 min
  const comp = treinos.flatMap((t) => t.partes.filter((p) => p.parte === 'complemento'))
  assert.ok(comp.length > 5)
  for (const p of comp) {
    assert.equal(p.foraDoLimite, true)
    assert.match(p.texto, /saída \+ 15 m forte/)
  }
  // Na Acumulação não tem
  assert.ok(treinos.filter((t) => t.plano.fase === 'acumulacao').every((t) => t.partes.every((p) => p.parte !== 'complemento')))
})

test('ritmo de prova: pouco volume e descanso proporcional ao tiro (200 m: até 600 m em RP, nunca 10 x 100 RP)', () => {
  const prova = { distancia: 200, estilo: 'costas', metaCentesimos: 15000, modalidade: 'piscina_25' }
  const textos = [1, 2, 3, 4].flatMap((seed) => gerar(prova, { seed })).flatMap((t) => t.partes.filter((p) => p.especifico)).map((p) => p.texto)
  assert.ok(textos.length > 10)
  for (const texto of textos) {
    assert.doesNotMatch(texto, /10 x 100 m · RP/, texto)
    const vezes = Number(/^\((\d+)x\)/.exec(texto)?.[1] ?? 1)
    const rp = [...texto.matchAll(/(\d+) x (\d+) m[^·\n]*· (?:RP|máx) /g)].reduce((t, [, r, d]) => t + Number(r) * Number(d), 0) * vezes
    assert.ok(rp <= 600, `${rp} m em RP\n${texto}`)
    // 50 m em 37"5 x 0,8 = 30", e no RP 50% a mais = 45" de descanso
    for (const [, d] of texto.matchAll(/4 x 50 m · RP 37"5 · CO · D(\d+)"/g)) assert.equal(Number(d), 45)
  }
  assert.ok(textos.some((t) => /\((2|3)x\) 4 x 50 m · RP/.test(t)), 'sem 2 ou 3 x 4 x 50 RP')
})

test('Específico na Transição: 50% dos treinos em A3, 40% em A2 e 10% em A1 (nunca dois mais leves seguidos)', () => {
  for (const prova of PROVAS) {
    const naTransicao = gerar(prova).filter((t) => t.plano.fase === 'transicao' && t.partes.some((p) => p.especifico))
      .map((t) => t.partes.find((p) => p.especifico).intensidades.valores[0])
    const n = naTransicao.length
    const conta = (i) => naTransicao.filter((x) => x === i).length
    for (const [i, alvo] of [['A3', 0.5], ['A2', 0.4], ['A1', 0.1]]) assert.ok(Math.abs(conta(i) - alvo * n) < 1, `${prova.distancia} ${i}: ${naTransicao.join(' ')}`)
    assert.ok(naTransicao.every((x, k) => x === 'A3' || k === 0 || naTransicao[k - 1] === 'A3'), naTransicao.join(' '))
    // A série A1 é toda em A1, no estilo da prova
    for (const t of gerar(prova).filter((x) => x.plano.fase === 'transicao')) {
      const p = t.partes.find((q) => q.especifico)
      if (p?.intensidades.valores[0] === 'A1') assert.doesNotMatch(p.texto, /· (A2|A3|RP|máx) /, p.texto)
    }
  }
})

test('Específico na Transição: as outras provas (da competição e importantes) também têm séries', async () => {
  const { generateTrainings } = await import('./generator.js')
  const { loadLibrary } = await import('./series/index.js')
  const { loadRules } = await import('./series/regras.js')
  const rules = loadRules()
  const library = loadLibrary()
  const base = {
    swimmingSince: 'mais_5a', recentBreak: 'nao', continuousDistance: 'mais_2000', strokes: ['crawl', 'costas', 'peito', 'borboleta'],
    trainingDays: [1, 2, 3, 4, 5], sessionMinutes: 60, poolLength: 25, equipment: ['palmar', 'pe_de_pato'], injuries: '', bestStroke: 'peito',
    level: 'avancado', time400: { hundredths: 33000 }, modalidade: 'piscina_25', modelo: 'especifico',
  }
  const peito = { distancia: 100, estilo: 'peito', metaCentesimos: 7500, modalidade: 'piscina_25' }
  const periodizacao = { inicio: '2026-11-24', fim: '2027-02-15', semProva: false, provas: [], numeroInicial: 1, testeNaTransicao: false }
  let s = 7
  const random = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  for (const [extra, especifico] of [
    [{ provas: [peito, { distancia: 200, estilo: 'crawl', metaCentesimos: 13500 }] }, true], // mesma competição, com meta
    [{ provas: [peito], provasImportantes: [{ distancia: 200, estilo: 'crawl', metaCentesimos: null }] }, false], // importante, sem meta
  ]) {
    const treinos = generateTrainings({ rules, library, athlete: { ...base, prova: peito, ...extra }, today: '2026-11-24', random, periodizacao })
    const transicao = treinos.filter((t) => t.plano.fase === 'transicao')
    const outras = transicao.filter((t) => t.plano.provaDoEspecifico?.estilo === 'crawl')
    // ~40% da Transição para a outra prova; o resto, a principal
    assert.ok(Math.abs(outras.length - 0.4 * transicao.length) < 1.5, `${outras.length} de ${transicao.length}`)
    for (const t of outras) {
      const p = t.partes.find((x) => x.parte === 'principal')
      assert.match(p.titulo, /200 m crawl/)
      assert.equal(Boolean(p.especifico), especifico)
      assert.doesNotMatch(p.texto, /\b(PE|CO|BO|MD)\b/, p.texto)
    }
    // Realização: só a prova alvo
    assert.ok(treinos.filter((t) => t.plano.fase === 'realizacao').every((t) => !t.plano.provaDoEspecifico))
  }
})

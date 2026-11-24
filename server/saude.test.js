import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTrainings, isHealthDay, testSeriesDistance } from './generator.js'
import { loadLibrary } from './series/index.js'
import { loadRules } from './series/regras.js'
import { aplicarSaude, loadSaude, metrosDaSerie, segundosDaSerie, temPerna, textoDaSerie, validarSaude } from './saude/index.js'

const rules = loadRules()
const library = loadLibrary()
const saude = loadSaude()

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const base = {
  swimmingSince: 'mais_5a', recentBreak: 'nao', sessionMinutes: 60, trainingDays: [1, 3, 5], poolLength: 25, injuries: '',
  strokes: ['crawl', 'costas', 'peito'], bestStroke: 'crawl', equipment: ['pe_de_pato', 'palmar', 'pull_buoy'],
}
const ATLETAS = {
  iniciante: { ...base, level: 'iniciante', sessionMinutes: 50, continuousDistance: '100_200', time400: { hundredths: 54000 } },
  intermediario: { ...base, level: 'intermediario', continuousDistance: '400_1000', time400: { hundredths: 42000 } },
  avancado: { ...base, level: 'avancado', continuousDistance: 'mais_2000', time400: { hundredths: 33000 } },
}
const periodizacao = { inicio: '2026-11-23', fim: '2027-01-17', semProva: true }
const gerar = (athlete, seed = 1, extra = {}) => generateTrainings({ rules, library, athlete, today: '2026-11-23', random: seeded(seed), periodizacao, ...extra })

test('biblioteca de saúde: válida, com pelo menos 20 séries por nível e os tipos pedidos', () => {
  assert.deepEqual(validarSaude(saude), [])
  for (const nivel of ['iniciante', 'intermediario', 'avancado']) {
    const doNivel = saude.series.filter((s) => s.niveis.includes(nivel))
    assert.ok(doNivel.length >= 20, `${nivel}: ${doNivel.length}`)
    for (const tipo of ['extensivo', 'intensivo', 'fartlek', 'tempo']) assert.ok(doNivel.some((s) => s.tipo === tipo), `${nivel} sem ${tipo}`)
  }
  // As séries por tempo do treinador: 3 x 3' com 30" e 3 x 3' aumentando a metragem com 1'
  const porTempo = saude.series.filter((s) => s.blocos.some((b) => b.rep === 3 && b.tempo === 180))
  assert.ok(porTempo.some((s) => s.blocos[0].descanso === 30))
  assert.ok(porTempo.some((s) => s.blocos[0].descanso === 60 && /mais metros/.test(s.blocos[0].nota ?? '')))
  // Iniciante: nada contínuo longo (fracionado)
  for (const s of saude.series.filter((x) => x.niveis.includes('iniciante'))) {
    for (const b of s.blocos) assert.ok((b.dist ?? 0) <= 200 && (b.tempo ?? 0) <= 300, `${s.id}: ${textoDaSerie(s)}`)
  }
})

test('texto, metros e tempo de uma série de saúde', () => {
  const s = { id: 'x', niveis: ['intermediario'], tipo: 'extensivo', vezes: 3, intervalo: 60, blocos: [{ rep: 4, dist: 50, ritmo: 'A2', descanso: 10 }] }
  assert.equal(textoDaSerie(s), '(3x) 4 x 50 m · A2 · CR · D10" de descanso · c/1\' de intervalo')
  assert.equal(metrosDaSerie(s, saude.regras, 90), 600)
  assert.equal(Math.round(segundosDaSerie(s, saude.regras, 90)), Math.round(3 * 4 * (0.5 * 90 * 1.15 + 10) + 2 * 60 - 10))
})

test('objetivo saúde: todo treino é de saúde, sem fases, série do nível e dentro do tempo da aula', () => {
  for (const [nivel, atleta] of Object.entries(ATLETAS)) {
    for (const seed of [1, 2, 3]) {
      const treinos = gerar({ ...atleta, objetivo: 'saude' }, seed)
      assert.ok(treinos.length > 10)
      for (const t of treinos) {
        assert.equal(t.plano.saude, true)
        assert.equal(t.plano.fase, 'acumulacao', 'sem Transição nem Realização')
        assert.equal(t.plano.nomeDaEtapa, 'Saúde / emagrecimento')
        assert.equal(t.plano.diaDeTeste, false)
        const principais = t.partes.filter((p) => p.parte === 'principal')
        assert.ok(principais.length >= 1 && principais.length <= 2)
        for (const p of principais) {
          assert.equal(p.intensidades.tipo, 'saude')
          assert.ok(saude.series.find((s) => s.id === p.serieId).niveis.includes(nivel), `${nivel}: ${p.serieId}`)
        }
        assert.ok(t.minutos <= atleta.sessionMinutes + 2, `${nivel} ${t.date}: ${t.minutos} min`)
      }
    }
  }
})

test('saúde: a velocidade entra em poucos treinos (5%)', () => {
  let com = 0
  let total = 0
  for (let seed = 1; seed <= 15; seed++) {
    for (const t of gerar({ ...ATLETAS.avancado, objetivo: 'saude' }, seed)) {
      total++
      if (t.partes.some((p) => p.parte === 'velocidade')) com++
    }
  }
  assert.ok(com / total <= 0.1, `${com} de ${total}`)
})

test('saúde: as séries variam e o volume sobe aos poucos', () => {
  const treinos = gerar({ ...ATLETAS.intermediario, objetivo: 'saude' }, 4)
  const ids = treinos.map((t) => t.partes.find((p) => p.parte === 'principal').serieId)
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1])
  assert.ok(new Set(treinos.map((t) => t.plano.tipoSaude)).size >= 4)
  const fatores = treinos.map((t) => t.plano.fatorSaude)
  assert.ok(fatores[0] < 1)
  for (let i = 1; i < fatores.length; i++) assert.ok(fatores[i] >= fatores[i - 1])
  assert.equal(fatores.at(-1), 1)
  // Continua de onde parou (o último treino de saúde concluído)
  const depois = gerar({ ...ATLETAS.intermediario, objetivo: 'saude' }, 4, { historico: [{ difficulty: 6, plan: treinos[3].plano }] })
  assert.ok(depois[0].plano.fatorSaude > treinos[3].plano.fatorSaude)
})

test('saúde: o nado contínuo cresce aos poucos; no iniciante vai em partes', () => {
  const [ini] = gerar({ ...ATLETAS.iniciante, objetivo: 'saude' })
  const continuo = ini.partes.find((p) => p.parte === 'continuo')
  assert.ok(continuo.fracionado)
  assert.match(continuo.texto, /^\d+ x 50 m · CR · A1 · D20" de descanso$/)
  assert.equal(ini.plano.serieDeTeste.distancia, 150)
  const [inter] = gerar({ ...ATLETAS.intermediario, objetivo: 'saude' })
  const c2 = inter.partes.find((p) => p.parte === 'continuo')
  assert.ok(!c2.fracionado)
  assert.match(c2.texto, /sem parar/)
  // 3 treinos completos e sem ficar pesado: sobe um passo; não conseguiu: desce
  const feito = (nonstop) => ({ difficulty: 6, nonstop, plan: { ...ini.plano } })
  const sobe = testSeriesDistance(rules, ATLETAS.iniciante, [feito(true), feito(true), feito(true)], 135, 600)
  assert.equal(sobe.distancia, 200)
  assert.equal(testSeriesDistance(rules, ATLETAS.iniciante, [feito(false)], 135, 600).distancia, 100)
  // Quem já nada o alvo do nível: sem nado contínuo
  assert.ok(gerar({ ...ATLETAS.avancado, objetivo: 'saude' }).every((t) => !t.partes.some((p) => p.parte === 'continuo')))
})

test('objetivo misto: alterna ou segue os dias escolhidos; os de condicionamento continuam iguais', () => {
  const alternar = gerar({ ...ATLETAS.intermediario, objetivo: 'misto', mistura: { modo: 'alternar', condicionamento: 2, saude: 1 } })
  alternar.forEach((t, i) => assert.equal(Boolean(t.plano.saude), i % 3 === 2, t.title))
  const dias = gerar({ ...ATLETAS.intermediario, objetivo: 'misto', mistura: { modo: 'dias', dias: [3] } })
  for (const t of dias) assert.equal(Boolean(t.plano.saude), new Date(`${t.date}T12:00:00Z`).getUTCDay() === 3, t.date)
  // Condicionamento: as séries do Geral, com as fases (A-T-R) de sempre
  const cond = dias.filter((t) => !t.plano.saude)
  assert.ok(cond.every((t) => t.partes.every((p) => !p.saude)))
  assert.ok(cond.some((t) => t.plano.fase === 'transicao'))
  assert.ok(cond.every((t) => !t.plano.fatorSaude))
  // A sequência continua na próxima geração (pelo número do treino)
  assert.equal(isHealthDay({ objetivo: 'misto', mistura: { modo: 'alternar', condicionamento: 1, saude: 2 } }, '2026-11-23', 2), true)
  assert.equal(isHealthDay({ objetivo: 'misto', mistura: { modo: 'alternar', condicionamento: 1, saude: 2 } }, '2026-11-23', 4), false)
  assert.equal(isHealthDay({ objetivo: 'condicionamento' }, '2026-11-23', 1), false)
})

test('aplicarSaude: sem principal ou no dia de teste, não mexe', () => {
  const partes = [{ parte: 'teste', minutos: 10 }, { parte: 'soltura', minutos: 5 }]
  assert.equal(aplicarSaude({ saude, partes, athlete: ATLETAS.intermediario, pace: 105 }), partes)
})

test('saúde: série principal com perna -> sem a parte de perna depois (e as séries de perna viraram nado + perna)', () => {
  assert.ok(!saude.series.some((s) => s.blocos.some((b) => b.nado === 'perna')), 'sem série só de perna na biblioteca de saúde')
  let comPerna = 0
  for (const [nivel, atleta] of Object.entries(ATLETAS)) {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const t of gerar({ ...atleta, objetivo: 'saude' }, seed)) {
        const principais = t.partes.filter((p) => p.parte === 'principal')
        const ids = principais.map((p) => p.serieId)
        const series = ids.map((id) => saude.series.find((s) => s.id === id))
        if (!series.some((s) => s && temPerna(s))) continue
        comPerna++
        assert.ok(!t.partes.some((p) => p.parte === 'perna'), `${nivel} ${t.date}: ${ids.join(', ')}`)
        assert.ok(series.filter((s) => temPerna(s)).length === 1, 'só uma série com perna')
      }
    }
  }
  assert.ok(comPerna > 10)
})

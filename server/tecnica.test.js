import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTrainings, refreshTimes } from './generator.js'
import { loadLibrary } from './series/index.js'
import { loadRules } from './series/regras.js'
import { estadoDaTecnica, loadTecnica, montarTecnica, validarTecnica } from './tecnica/index.js'

const rules = loadRules()
const library = loadLibrary()
const tecnica = loadTecnica()

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
  level: 'avancado', sessionMinutes: 90, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: 'mais_2000',
  strokes: QUATRO, bestStroke: 'costas', equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], time400: { hundredths: 33000 },
}
const iniciante = {
  level: 'iniciante', sessionMinutes: 45, trainingDays: [1, 3, 5], poolLength: 25, continuousDistance: '200_400',
  strokes: ['crawl'], bestStroke: null, equipment: [], time400: null,
}
const gerar = (athlete, seed = 1, extra = {}) =>
  generateTrainings({ rules, library, athlete, today: '2026-11-23', random: seeded(seed), ...extra })
const montar = (athlete, parte, seed = 1, estado = null) =>
  montarTecnica({ tecnica, athlete, parte, pace: 90, random: seeded(seed), estado })

test('técnica: os educativos da planilha e os do treinador, sem problemas', () => {
  assert.deepEqual(validarTecnica(tecnica.itens), [])
  assert.ok(tecnica.itens.length > 230, `${tecnica.itens.length} itens`)
  // Fora da água não entra; o "esquema" também não
  assert.ok(!tecnica.itens.some((i) => /fora da água|no solo|esquema/i.test(i.texto)))
  // Técnicas do treinador
  for (const id of ['palmateio-maximo', 'menos-bracadas', 'respiracao-3-9', 'apneia', 'ondulacao-submersa-pe', 'maos-fechadas']) {
    assert.ok(tecnica.itens.some((i) => i.id === id), id)
  }
  // Saídas e viradas: sequências com os passos 1, 2, 3...
  assert.ok(tecnica.sequencias.size >= 10)
  // Saída do crawl e do borboleta: uma sequência só; virada do peito e do borboleta também
  assert.ok(tecnica.sequencias.has('crawl-borboleta-saida'))
  assert.ok(tecnica.sequencias.has('peito-borboleta-virada'))
  // Validação: passo pulado e estilo desconhecido
  assert.equal(validarTecnica([{ id: 'x', estilos: ['nado'], texto: 'a', sequencia: 's', passo: 2 }]).length, 2)
})

test('técnica: só o que serve para o nível, o material e os estilos do atleta', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const t = montar(iniciante, 'aquecimento', seed)
    const item = tecnica.itens.find((i) => i.id === t.registro.id)
    assert.ok(!item.niveis || item.niveis.includes('iniciante'), item.id)
    assert.ok(!item.material, `${item.id}: precisa de material que o atleta não tem`)
    assert.equal(t.registro.estilo, 'crawl')
    assert.match(t.texto, /^Técnica · 4 x 25 m · CR: .+ · D20" de descanso$/)
  }
  // Medley só para quem nada os quatro (e virada do medley só no foco do dia)
  const doisEstilos = { ...avancado, strokes: ['crawl', 'costas'] }
  for (let seed = 1; seed <= 200; seed++) {
    const estado = { passos: {}, soltos: 1 }
    const t = montar(doisEstilos, 'solto', seed, estado)
    assert.ok(['crawl', 'costas'].includes(t.registro.estilo), t.texto)
  }
})

test('técnica: aquecimento a partir de 30 min; solto (depois da velocidade) a partir de 45 min', () => {
  assert.equal(montar({ ...iniciante, sessionMinutes: 20 }, 'aquecimento'), null)
  assert.ok(montar({ ...iniciante, sessionMinutes: 30 }, 'aquecimento'))
  assert.equal(montar({ ...avancado, sessionMinutes: 40 }, 'solto'), null)
  assert.ok(montar({ ...avancado, sessionMinutes: 45 }, 'solto'))
})

test('foco do dia: no solto, um treino sim, um não; os passos avançam e continuam do plano já feito', () => {
  const estado = { passos: {}, soltos: 0 }
  const tipos = []
  for (let k = 0; k < 8; k++) tipos.push(montar(avancado, 'solto', k + 1, estado).texto.startsWith('Foco do dia') ? 'foco' : 'tec')
  assert.deepEqual(tipos, ['tec', 'foco', 'tec', 'foco', 'tec', 'foco', 'tec', 'foco'])
  // Um passo de cada vez, sem voltar
  const passos = Object.values(estado.passos)
  assert.ok(passos.length > 0 && passos.every((p) => p >= 1))
  // Continua do que já foi feito (plano dos treinos concluídos)
  const historico = [{ plan: { tecnica: [{ parte: 'solto', sequencia: 'crawl-virada_olimpica', passo: 5 }] } }]
  const continua = estadoDaTecnica(historico)
  assert.equal(continua.passos['crawl-virada_olimpica'], 5)
  assert.equal(continua.soltos, 1)
})

test('treino gerado: técnica no aquecimento e no solto depois da velocidade, guardada no plano', () => {
  const treinos = [1, 2, 3].flatMap((seed) => gerar(avancado, seed))
  for (const t of treinos.filter((x) => !x.plano.diaDeTeste)) {
    const aquecimento = t.partes.find((p) => p.parte === 'aquecimento')
    assert.match(aquecimento.texto, /\n(Técnica|Foco do dia) · /, aquecimento.texto)
    const solto = t.partes.find((p) => p.parte === 'solto')
    if (solto) assert.match(solto.texto, /\n(Técnica|Foco do dia) · /, solto.texto)
    assert.ok(t.plano.tecnica.length >= 1)
    // A metragem da parte conta a técnica
    assert.ok(aquecimento.metros > Number(/^(\d+)/.exec(aquecimento.serieTexto)?.[1] ?? 0))
  }
  // Iniciante: o solto é no fim (não depois da velocidade): sem técnica no solto
  for (const t of gerar(iniciante, 1)) {
    const solto = t.partes.find((p) => p.parte === 'solto')
    if (solto) assert.ok(!/Técnica|Foco do dia/.test(solto.texto), solto.texto)
  }
})

test('técnica: o mesmo educativo não se repete nos treinos seguintes', () => {
  const treinos = gerar(avancado, 4)
  const ids = treinos.map((t) => new Set(t.plano.tecnica.map((r) => r.id)))
  for (let k = 1; k < ids.length; k++) {
    for (const id of ids[k]) assert.ok(!ids[k - 1].has(id), `${id} repetido em seguida`)
  }
})

test('tempo novo: o treino é reescrito e a técnica continua igual', () => {
  const [treino] = gerar({ ...avancado, time400: null }, 2)
  const novas = refreshTimes(rules, { ...avancado, time400: { hundredths: 30000 } }, treino)
  for (const [k, p] of treino.partes.entries()) {
    const tec = p.texto.split('\n').filter((l) => /^(Técnica|Foco do dia)/.test(l))
    if (tec.length > 0) assert.deepEqual(novas[k].texto.split('\n').filter((l) => /^(Técnica|Foco do dia)/.test(l)), tec)
  }
})

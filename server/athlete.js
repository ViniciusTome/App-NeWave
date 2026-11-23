// Anamnese do atleta, calendário de competições e preparação (prova alvo).
// É a base do botão "Gerar treinos": as respostas ficam guardadas para o atleta
// não repetir tudo, e a prova alvo é escolhida a cada vez que ele gera treinos.
import { HttpError, readJson, sendJson } from './http.js'
import { feedbackAdjustment, generateTrainings, legacyFields, lightenTraining, prepareAthlete, refreshTimes, seriesUsadas, testSeriesDistance } from './generator.js'
import { timeTable } from './series/regras.js'
import { MODELOS, nomeDaProva, podeUsarEspecifico, validarProvas } from './especifico/index.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Opções aceitas em cada pergunta. As mesmas chaves estão em src/utils/athlete.js.
export const OPTIONS = {
  swimmingSince: ['menos_6m', '6m_2a', '2a_5a', 'mais_5a'],
  recentBreak: ['nao', 'menos_1m', '1_6m', 'mais_6m'],
  continuousDistance: ['ate_50', '50_100', '100_200', '200_400', '400_1000', '1000_2000', 'mais_2000'],
  strokes: ['crawl', 'costas', 'peito', 'borboleta'],
  sessionMinutes: [30, 40, 45, 60, 75, 90, 120],
  poolLength: [25, 50],
  equipment: ['pe_de_pato', 'palmar', 'prancha', 'pull_buoy', 'snorkel', 'paraquedas'],
  modality: ['triatlo', 'maratona_aquatica', 'piscina_25', 'piscina_50'],
  priority: ['A', 'B', 'C'],
  goal: ['competir', 'condicionamento', 'saude'],
}

const MIN_400 = 3 * 60 * 100 // 3 minutos
const MAX_400 = 30 * 60 * 100 // 30 minutos
const MAX_COMPETITION_DAYS = 2 * 366 // até dois anos à frente

// ---------- Nível do atleta ----------

// O nível não é perguntado: é calculado a partir de respostas objetivas.
// Regra inicial, para ser ajustada pelo treinador: cada resposta vale pontos,
// e a média define o nível. Algumas respostas limitam o nível máximo.
const POINTS = {
  continuousDistance: {
    ate_50: 0, '50_100': 1, '100_200': 2, '200_400': 3, '400_1000': 4, '1000_2000': 5, mais_2000: 6,
  },
  swimmingSince: { menos_6m: 0, '6m_2a': 1, '2a_5a': 2, mais_5a: 3 },
}
const MAX_POINTS = { continuousDistance: 6, swimmingSince: 3, time400: 4 }

// Pontos pelo tempo nos 400 m (centésimos de segundo)
function time400Points(hundredths) {
  const minutes = hundredths / 6000
  if (minutes >= 9) return 0
  if (minutes >= 7.5) return 1
  if (minutes >= 6) return 2
  if (minutes >= 5) return 3
  return 4
}

const LEVELS = ['iniciante', 'intermediario', 'avancado']

export function computeLevel(profile, time400) {
  let points = POINTS.continuousDistance[profile.continuousDistance] + POINTS.swimmingSince[profile.swimmingSince]
  let max = MAX_POINTS.continuousDistance + MAX_POINTS.swimmingSince
  if (time400) {
    points += time400Points(time400.hundredths)
    max += MAX_POINTS.time400
  }

  const ratio = points / max
  let index = ratio < 0.35 ? 0 : ratio < 0.7 ? 1 : 2

  // Quem nada até 100 m sem parar (inclusive só 50 m) é iniciante; de 100 a 400 m, no máximo intermediário.
  // Para quem nada só 50 m, até um 4 x 50 é pesado: o gerador de treinos vai precisar
  // de séries curtas (ex.: 25 m) com descanso longo.
  if (['ate_50', '50_100'].includes(profile.continuousDistance)) index = 0
  if (['100_200', '200_400'].includes(profile.continuousDistance)) index = Math.min(index, 1)

  // Parado há mais de 6 meses: começa um nível abaixo, em readaptação
  const returning = profile.recentBreak === 'mais_6m'
  const nivelAntesDaParada = LEVELS[index]
  if (returning) index = Math.max(index - 1, 0)

  // Recém intermediário: está na metade de baixo da faixa do intermediário
  // (PROVISÓRIO). Usa o descanso por intensidade, como o iniciante.
  const recemIntermediario = LEVELS[index] === 'intermediario' && ratio < 0.525

  return { level: LEVELS[index], returning, recemIntermediario, nivelAntesDaParada }
}

// ---------- Validação ----------

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

// Competição: de ontem (folga de fuso) até dois anos à frente
function isValidCompetitionDate(value) {
  if (!isRealDate(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return time >= Date.now() - 2 * DAY_MS && time <= Date.now() + MAX_COMPETITION_DAYS * DAY_MS
}

function readToday(req) {
  const today = new URL(req.url, 'http://localhost').searchParams.get('today')
  return isRealDate(today) ? today : new Date().toISOString().slice(0, 10)
}

const ONLY_ONE_TARGET = 'Só a prova alvo é a principal: escolha a prova alvo em "Gerar treinos".'
const IS_TARGET = 'Essa é a sua prova alvo. Para trocar, use "Gerar treinos".'

const oneOf = (list, value, message) => {
  if (!list.includes(value)) throw new HttpError(400, message)
  return value
}

// Lista sem repetidos, só com opções válidas
function listOf(list, value, { min = 0, message }) {
  if (!Array.isArray(value) || value.some((item) => !list.includes(item))) {
    throw new HttpError(400, message)
  }
  const unique = list.filter((item) => value.includes(item)) // mantém a ordem das opções
  if (unique.length < min) throw new HttpError(400, message)
  return unique
}

function validateProfile(body) {
  const injuries = typeof body.injuries === 'string' ? body.injuries.trim() : ''
  if (injuries.length > 500) throw new HttpError(400, 'Descreva as lesões em até 500 caracteres.')

  let reported400 = null
  if (body.reported400Hundredths !== null && body.reported400Hundredths !== undefined) {
    reported400 = body.reported400Hundredths
    if (!Number.isSafeInteger(reported400) || reported400 < MIN_400 || reported400 > MAX_400) {
      throw new HttpError(400, 'Informe um tempo nos 400 m entre 3 e 30 minutos.')
    }
  }

  return {
    swimmingSince: oneOf(OPTIONS.swimmingSince, body.swimmingSince, 'Diga há quanto tempo você nada.'),
    recentBreak: oneOf(OPTIONS.recentBreak, body.recentBreak, 'Diga se ficou parado recentemente.'),
    continuousDistance: oneOf(
      OPTIONS.continuousDistance,
      body.continuousDistance,
      'Diga quanto você nada sem parar.',
    ),
    strokes: listOf(OPTIONS.strokes, body.strokes, { min: 1, message: 'Escolha pelo menos um estilo.' }),
    trainingDays: listOf([0, 1, 2, 3, 4, 5, 6], body.trainingDays, {
      min: 1,
      message: 'Escolha pelo menos um dia de treino.',
    }),
    sessionMinutes: oneOf(OPTIONS.sessionMinutes, body.sessionMinutes, 'Escolha quanto tempo tem por treino.'),
    poolLength: oneOf(OPTIONS.poolLength, body.poolLength, 'Escolha o tamanho da piscina.'),
    // (o pé de pato de peito saiu do app: quem tinha marcado continua salvando sem ele)
    equipment: listOf(OPTIONS.equipment, (body.equipment ?? []).filter((m) => m !== 'pe_de_pato_peito'), { message: 'Material inválido.' }),
    injuries,
    reported400Hundredths: reported400,
    bestStroke: validateBestStroke(body),
  }
}

// Melhor estilo: um dos estilos (borboleta, costas, peito) que o atleta marcou.
// Quem só nada crawl não tem melhor estilo (null).
const BEST_STROKE_OPTIONS = ['borboleta', 'costas', 'peito']

function validateBestStroke(body) {
  const marcados = Array.isArray(body.strokes) ? BEST_STROKE_OPTIONS.filter((s) => body.strokes.includes(s)) : []
  if (marcados.length === 0) {
    if (body.bestStroke !== null && body.bestStroke !== undefined) {
      throw new HttpError(400, 'Só escolha o melhor estilo se nadar borboleta, costas ou peito.')
    }
    return null
  }
  if (!marcados.includes(body.bestStroke)) {
    throw new HttpError(400, 'Escolha o seu melhor estilo entre os que você nada (borboleta, costas ou peito).')
  }
  return body.bestStroke
}

function validateCompetition(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 100) {
    throw new HttpError(400, 'Dê um nome para a competição (até 100 caracteres).')
  }
  if (!isValidCompetitionDate(body.date)) {
    throw new HttpError(400, 'Informe a data da competição, de hoje até dois anos à frente.')
  }
  const modality = oneOf(OPTIONS.modality, body.modality, 'Escolha a modalidade da competição.')
  // As provas que vai nadar (distância, estilo e meta opcional); a 1ª é a principal
  const { provas, erro } = validarProvas({ modality, events: body.events, distance: body.distance, stroke: body.stroke, goalHundredths: body.goalHundredths })
  if (erro) throw new HttpError(400, erro)
  const prova = provas[0]

  return {
    name,
    date: body.date,
    modality,
    // Nome das provas (ex.: "100 m livre, 200 m livre"), para as telas e as regras que leem o texto
    event: provas.map((p) => nomeDaProva({ modality, ...p })).join(', '),
    events: provas,
    distance: prova.distance,
    stroke: prova.stroke,
    goalHundredths: prova.goalHundredths,
    // Sem escolher: C (não muda o treino). A e B: na semana da prova o volume diminui
    priority: oneOf(OPTIONS.priority, body.priority ?? 'C', 'Escolha a prioridade A, B ou C.'),
  }
}

// ---------- Formato das respostas ----------

const publicProfile = (row) => ({
  swimmingSince: row.swimming_since,
  recentBreak: row.recent_break,
  continuousDistance: row.continuous_distance,
  strokes: JSON.parse(row.strokes),
  trainingDays: JSON.parse(row.training_days),
  sessionMinutes: row.session_minutes,
  poolLength: row.pool_length,
  equipment: JSON.parse(row.equipment).filter((m) => m !== 'pe_de_pato_peito'),
  injuries: row.injuries,
  reported400Hundredths: row.reported_400_hundredths,
  bestStroke: row.best_stroke,
  updatedAt: row.updated_at,
})

const publicCompetition = (row) => ({
  id: row.id,
  name: row.name,
  date: row.date,
  modality: row.modality,
  event: row.event,
  distance: row.distance ?? null,
  stroke: row.stroke ?? null,
  goalHundredths: row.goal_hundredths ?? null,
  // Todas as provas da competição (a 1ª é a principal)
  events: parseEvents(row),
  priority: row.priority,
})

function parseEvents(row) {
  try {
    if (row.events) return JSON.parse(row.events)
  } catch {
    // cai na prova única abaixo
  }
  return row.distance ? [{ distance: row.distance, stroke: row.stroke, goalHundredths: row.goal_hundredths ?? null }] : []
}

function parseId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Competição inválida.')
  return id
}

// ---------- Rotas ----------

export function createAthleteRoutes({ db, requireUser, library, rules }) {
  const findProfile = db.prepare('SELECT * FROM athlete_profiles WHERE user_id = ?')
  const upsertProfile = db.prepare(`
    INSERT INTO athlete_profiles (
      user_id, swimming_since, recent_break, continuous_distance, strokes, training_days,
      session_minutes, pool_length, equipment, injuries, reported_400_hundredths, best_stroke,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      swimming_since = excluded.swimming_since,
      recent_break = excluded.recent_break,
      continuous_distance = excluded.continuous_distance,
      strokes = excluded.strokes,
      training_days = excluded.training_days,
      session_minutes = excluded.session_minutes,
      pool_length = excluded.pool_length,
      equipment = excluded.equipment,
      injuries = excluded.injuries,
      reported_400_hundredths = excluded.reported_400_hundredths,
      best_stroke = excluded.best_stroke,
      updated_at = excluded.updated_at
  `)
  // Teste de 400 m mais recente registrado pelo atleta
  // O tempo informado na anamnese também vai para a evolução dos tempos
  const insertAnamnesisTest = db.prepare(`
    INSERT INTO tests (user_id, distance, time_hundredths, date, created_at, origin) VALUES (?, 400, ?, ?, ?, 'anamnese')
  `)
  // O último teste de 400 m de verdade ("+ Teste"); e o último informado na anamnese
  const latest400Test = db.prepare(`
    SELECT time_hundredths, date, origin FROM tests
    WHERE user_id = ? AND distance = 400 AND (origin IS NULL OR origin <> 'anamnese') ORDER BY date DESC, id DESC LIMIT 1
  `)
  const latest400Informed = db.prepare(`
    SELECT time_hundredths, date FROM tests
    WHERE user_id = ? AND distance = 400 AND origin = 'anamnese' ORDER BY date DESC, id DESC LIMIT 1
  `)

  const listUpcomingCompetitions = db.prepare(`
    SELECT * FROM competitions WHERE user_id = ? AND date >= ? ORDER BY date, id LIMIT 100
  `)
  const findCompetition = db.prepare('SELECT * FROM competitions WHERE id = ? AND user_id = ?')
  const insertCompetition = db.prepare(`
    INSERT INTO competitions (user_id, name, date, modality, event, distance, stroke, goal_hundredths, events, priority, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const setPriority = db.prepare('UPDATE competitions SET priority = ? WHERE id = ? AND user_id = ?')
  // Só uma prova é a principal (A): a prova alvo. As outras que eram A viram importantes (B).
  const demoteOtherTargets = db.prepare(`UPDATE competitions SET priority = 'B' WHERE user_id = ? AND priority = 'A' AND id IS NOT ?`)
  const deleteCompetition = db.prepare('DELETE FROM competitions WHERE id = ? AND user_id = ?')

  // Gerar treinos: os agendados que ainda não foram feitos são substituídos
  const deleteUpcoming = db.prepare(
    'DELETE FROM trainings WHERE user_id = ? AND completed_at IS NULL AND date >= ?',
  )
  const completedDates = db.prepare(
    'SELECT DISTINCT date FROM trainings WHERE user_id = ? AND completed_at IS NOT NULL AND date >= ?',
  )
  // Últimos treinos feitos com o feedback e o plano interno (para ajustar os próximos)
  const feedbackHistory = db.prepare(`
    SELECT difficulty, difficulty_reason, plan, nonstop_ok FROM (
      SELECT date, id, difficulty, difficulty_reason, plan, nonstop_ok FROM trainings
      WHERE user_id = ? AND completed_at IS NOT NULL AND plan IS NOT NULL
      ORDER BY date DESC, id DESC LIMIT 10
    ) ORDER BY date, id
  `)
  // Treinos ainda não feitos, com o plano (para reescrever com um tempo novo)
  const upcomingWithPlan = db.prepare(`
    SELECT id, parts, plan FROM trainings
    WHERE user_id = ? AND completed_at IS NULL AND date >= ? AND parts IS NOT NULL AND plan IS NOT NULL
  `)
  const findTrainingRow = db.prepare('SELECT id, date, title, parts, plan, completed_at FROM trainings WHERE id = ? AND user_id = ?')
  const trainingNear = db.prepare(`
    SELECT parts FROM trainings WHERE user_id = ? AND parts IS NOT NULL AND date < ? ORDER BY date DESC, id DESC LIMIT 1
  `)
  const trainingAfter = db.prepare(`
    SELECT parts FROM trainings WHERE user_id = ? AND parts IS NOT NULL AND date > ? ORDER BY date, id LIMIT 1
  `)
  const replaceTraining = db.prepare(`
    UPDATE trainings SET parts = ?, plan = ?, warm_up = ?, speed = ?, main_series = ?, release = ? WHERE id = ? AND user_id = ?
  `)
  const setPlan = db.prepare('UPDATE trainings SET plan = ? WHERE id = ? AND user_id = ?')
  const trainingOnDate = db.prepare(`
    SELECT id, title, parts, plan, warm_up, speed, main_series, release, completed_at FROM trainings
    WHERE user_id = ? AND date = ? ORDER BY id LIMIT 1
  `)
  const moveTraining = db.prepare('UPDATE trainings SET date = ? WHERE id = ? AND user_id = ?')
  const swapContent = db.prepare(`
    UPDATE trainings SET title = ?, parts = ?, plan = ?, warm_up = ?, speed = ?, main_series = ?, release = ?
    WHERE id = ? AND user_id = ?
  `)
  // Treinos que já passaram, do mais recente (para contar as faltas seguidas)
  const pastTrainings = db.prepare(`
    SELECT date, completed_at, missed_at FROM trainings WHERE user_id = ? AND date < ? ORDER BY date DESC, id DESC LIMIT 30
  `)
  const lastCompleted = db.prepare('SELECT MAX(date) AS date FROM trainings WHERE user_id = ? AND completed_at IS NOT NULL')
  const upcomingOrdered = db.prepare(`
    SELECT id, parts, plan FROM trainings
    WHERE user_id = ? AND completed_at IS NULL AND date >= ? AND parts IS NOT NULL AND plan IS NOT NULL
    ORDER BY date, id LIMIT ?
  `)
  const updateParts = db.prepare(`
    UPDATE trainings SET parts = ?, warm_up = ?, speed = ?, main_series = ?, release = ? WHERE id = ? AND user_id = ?
  `)
  // Data do primeiro treino do atleta (o teste de quem não tem tempo vem depois de 1 mês)
  const firstTrainingDate = db.prepare('SELECT MIN(date) AS date FROM trainings WHERE user_id = ?')
  // Último treino antes de hoje (para não repetir as séries dele no primeiro treino novo)
  const lastPartsBefore = db.prepare(
    'SELECT parts FROM trainings WHERE user_id = ? AND date < ? AND parts IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1',
  )
  const insertGenerated = db.prepare(`
    INSERT INTO trainings
      (user_id, date, title, warm_up, speed, main_series, release, notes, created_at, completed_at, parts, plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, NULL, ?, ?)
  `)

  const findCurrentPreparation = db.prepare(`
    SELECT * FROM preparations WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `)
  const insertPreparation = db.prepare(`
    INSERT INTO preparations (user_id, goal, competition_id, model, created_at) VALUES (?, ?, ?, ?, ?)
  `)
  const setModel = db.prepare('UPDATE preparations SET model = ? WHERE id = ? AND user_id = ?')

  // Tempo nos 400 m: o teste registrado tem preferência sobre o tempo informado na anamnese
  function time400Of(userId, profile) {
    const test = latest400Test.get(userId)
    if (test) return { hundredths: test.time_hundredths, source: 'teste', date: test.date }
    // O tempo da anamnese (na evolução dos tempos) continua sendo "informado"
    const informado = latest400Informed.get(userId)
    if (informado) return { hundredths: informado.time_hundredths, source: 'informado', date: informado.date }
    if (profile?.reported400Hundredths) {
      return { hundredths: profile.reported400Hundredths, source: 'informado', date: null }
    }
    return null
  }

  const profileOf = (userId) => {
    const row = findProfile.get(userId)
    return row ? publicProfile(row) : null
  }

  function profileResponse(userId) {
    const row = findProfile.get(userId)
    const profile = row ? publicProfile(row) : null
    const time400 = time400Of(userId, profile)
    // Tabela de tempos (A1, A2, A3 de cada distância), pelo teste de 400 m
    const tempos = time400 && rules ? timeTable(rules, time400.hundredths / 100) : null
    return { profile, time400, level: profile ? computeLevel(profile, time400) : null, tempos }
  }

  const countUpcomingGenerated = db.prepare(`
    SELECT COUNT(*) AS total FROM trainings
    WHERE user_id = ? AND completed_at IS NULL AND date >= ? AND parts IS NOT NULL
  `)
  const nextPlan = db.prepare(`
    SELECT plan FROM trainings WHERE user_id = ? AND completed_at IS NULL AND date >= ? AND plan IS NOT NULL
    ORDER BY date, id LIMIT 1
  `)
  const countPreparations = db.prepare('SELECT COUNT(*) AS total FROM preparations WHERE user_id = ?')
  // Provas no meio da preparação (a semana delas tem menos volume)
  const competitionsBetween = db.prepare(`
    SELECT id, date, priority FROM competitions WHERE user_id = ? AND date >= ? AND date <= ?
  `)
  // Treinos da periodização que já passaram (para a numeração continuar)
  const countSince = db.prepare('SELECT COUNT(*) AS total FROM trainings WHERE user_id = ? AND date >= ? AND date < ?')

  const parsePlan = (texto) => {
    try {
      return texto ? JSON.parse(texto) : null
    } catch {
      return null
    }
  }
  const readHistory = (userId) => feedbackHistory.all(userId)
    .map((r) => ({ difficulty: r.difficulty, reason: r.difficulty_reason, plan: parsePlan(r.plan), nonstop: r.nonstop_ok === null ? null : r.nonstop_ok === 1 }))
  const nextFactor = (userId, today) => parsePlan(nextPlan.get(userId, today)?.plan)?.fatorPrincipal ?? null

  // Monta (ou refaz) todos os treinos da periodização, de hoje até o fim, e guarda no
  // banco com o plano interno de cada um. Os dias com treino concluído ficam como estão.
  // Periodização: do dia da preparação até a prova alvo; sem prova, `semanasSemProva` semanas.
  // Tudo o que o gerador precisa para montar os treinos do atleta a partir de hoje
  function periodizationInput(userId, today) {
    const { profile, time400, level } = profileResponse(userId)
    if (!profile) throw new HttpError(409, 'Responda a anamnese antes de gerar treinos.')

    const preparacao = preparationResponse(userId, today)
    const ativa = preparacao?.active ? preparacao : null
    // Modalidade da prova alvo (ex.: triatlo), para a regra da recuperação
    const modalidade = ativa?.competition?.modality ?? null
    const inicio = [ativa?.createdAt?.slice(0, 10) ?? today, today].sort()[0]
    const semanas = rules.periodizacao?.semanasSemProva ?? 8
    const semProva = new Date(`${inicio}T12:00:00Z`)
    semProva.setUTCDate(semProva.getUTCDate() + semanas * 7 - 1)
    const fim = ativa?.goal === 'competir' && ativa.competition?.date ? ativa.competition.date : semProva.toISOString().slice(0, 10)
    // Teste da periodização no começo da Transição: quem tem o teste registrado, desde a
    // 1ª vez; quem só informou o tempo, a partir da 2ª vez que gera os treinos. Prova alvo
    // de 400 m em piscina: o teste é a própria prova (no fim da Realização).
    const regra = rules.testeNaPeriodizacao
    const geracao = countPreparations.get(userId).total
    const aPartirDe = time400?.source === 'teste' ? regra?.aPartirDaGeracao?.tempoDoTeste ?? 1 : regra?.aPartirDaGeracao?.tempoInformado ?? 2
    const provaDe400 = regra?.excecao?.modalidades?.includes(modalidade) && (ativa?.competition?.distance
      ? ativa.competition.distance === Number(regra.excecao.prova)
      : new RegExp(`\\b${regra.excecao.prova}\\b`).test(ativa?.competition?.event ?? ''))
    const testeNaTransicao = Boolean(regra && time400 && geracao >= aPartirDe && !provaDe400)

    let seriesAnteriores = []
    try {
      const ultimo = lastPartsBefore.get(userId, today)
      seriesAnteriores = ultimo ? [...seriesUsadas(JSON.parse(ultimo.parts))] : []
    } catch {
      seriesAnteriores = []
    }
    return {
      rules, library, today, seriesAnteriores,
      historico: readHistory(userId),
      fatorDoProximo: nextFactor(userId, today),
      inicioDosTreinos: [firstTrainingDate.get(userId)?.date ?? today, today].sort()[0],
      periodizacao: {
        inicio, fim, testeNaTransicao, numeroInicial: countSince.get(userId, inicio, today).total + 1,
        // 1ª preparação: nomes por extenso nos treinos (com a abreviação entre parênteses)
        primeira: geracao <= 1,
        // Sem prova (condicionamento ou saúde): periodização padrão A-T-R
        semProva: !(ativa?.goal === 'competir' && ativa.competition),
        // As importantes (prioridade A ou B), menos a prova alvo
        provas: competitionsBetween.all(userId, today, fim)
          .filter((c) => c.id !== ativa?.competition?.id && (rules.periodizacao?.provaIntermediaria?.prioridades ?? []).includes(c.priority))
          .map((c) => c.date),
      },
      athlete: {
        ...profile, level: level.level, recemIntermediario: level.recemIntermediario, nivelAntesDaParada: level.nivelAntesDaParada, time400, modalidade,
        // Modelo de treino e a prova alvo (distância, estilo e meta), para o Específico
        modelo: ativa?.model ?? 'geral',
        prova: ativa?.competition?.distance
          ? { distancia: ativa.competition.distance, estilo: ativa.competition.stroke, metaCentesimos: ativa.competition.goalHundredths, modalidade }
          : null,
        // Todas as provas da competição alvo (os estilos da série principal; a mais longa
        // é a distância que o atleta precisa conseguir nadar sem parar)
        provas: (ativa?.competition?.events ?? []).map((e) => ({ distancia: e.distance, estilo: e.stroke, metaCentesimos: e.goalHundredths ?? null })),
      },
    }
  }

  // Monta (ou refaz) todos os treinos da periodização, de hoje até o fim, e guarda no
  // banco com o plano interno de cada um. Os dias com treino concluído ficam como estão.
  function buildPeriodization(userId, today) {
    const jaFeitos = new Set(completedDates.all(userId, today).map((r) => r.date))
    const trainings = generateTrainings(periodizationInput(userId, today)).filter((t) => !jaFeitos.has(t.date))

    const now = new Date().toISOString()
    let replaced = 0
    db.exec('BEGIN')
    try {
      replaced = Number(deleteUpcoming.run(userId, today).changes)
      for (const t of trainings) {
        const f = legacyFields(t.partes)
        insertGenerated.run(
          userId, t.date, t.title, f.warmUp, f.speed, f.mainSeries, f.release, now,
          JSON.stringify(t.partes), JSON.stringify(t.plano),
        )
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return { trainings, replaced }
  }

  // Tempo novo (teste de 400 m ou da anamnese): reescreve os treinos que ainda não foram
  // feitos com os tempos atuais. Devolve quantos treinos foram atualizados.
  function refreshTimesFor(userId, today = new Date().toISOString().slice(0, 10)) {
    const { profile, time400, level } = profileResponse(userId)
    if (!profile || !level) return 0
    // Ficou sem tempo nenhum: volta ao planejamento sem tempos (descanso no lugar do cd,
    // ritmo por extenso, sem AC e o teste depois de 1 mês de treino)
    if (!time400) {
      if (upcomingWithPlan.all(userId, today).length === 0) return 0
      return buildPeriodization(userId, today).trainings.length
    }
    const athlete = { ...profile, level: level.level, recemIntermediario: level.recemIntermediario, nivelAntesDaParada: level.nivelAntesDaParada, time400 }
    let atualizados = 0
    db.exec('BEGIN')
    try {
      for (const row of upcomingWithPlan.all(userId, today)) {
        const plano = JSON.parse(row.plan)
        if (!plano.montagem) continue
        const partes = refreshTimes(rules, athlete, { partes: JSON.parse(row.parts), plano })
        const f = legacyFields(partes)
        updateParts.run(JSON.stringify(partes), f.warmUp, f.speed, f.mainSeries, f.release, row.id, userId)
        atualizados++
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return atualizados
  }

  function preparationResponse(userId, today) {
    const row = findCurrentPreparation.get(userId)
    if (!row) return null
    const competitionRow = row.competition_id ? findCompetition.get(row.competition_id, userId) : null
    const competition = competitionRow ? publicCompetition(competitionRow) : null
    const especifico = podeUsarEspecifico({ goal: row.goal, competition, profile: profileOf(userId) })
    return {
      id: row.id,
      goal: row.goal,
      competition,
      // Modelo de treino: Geral ou Específico da prova (só para quem pode usar)
      model: especifico.ok ? row.model : 'geral',
      especifico,
      createdAt: row.created_at,
      // Preparação ainda vale se não tem prova ou se a prova ainda não passou
      active: row.goal !== 'competir' || (competition !== null && competition.date >= today),
    }
  }

  return {
    // GET /api/athlete-profile -> anamnese (ou null), tempo nos 400 m e nível calculado
    getProfile(req, res) {
      const user = requireUser(req)
      sendJson(res, 200, profileResponse(user.id))
    },

    // PUT /api/athlete-profile -> cria ou atualiza a anamnese
    async saveProfile(req, res) {
      const user = requireUser(req)
      const profile = validateProfile(await readJson(req))
      const now = new Date().toISOString()
      const antes = findProfile.get(user.id)?.reported_400_hundredths ?? null
      upsertProfile.run(
        user.id,
        profile.swimmingSince,
        profile.recentBreak,
        profile.continuousDistance,
        JSON.stringify(profile.strokes),
        JSON.stringify(profile.trainingDays),
        profile.sessionMinutes,
        profile.poolLength,
        JSON.stringify(profile.equipment),
        profile.injuries,
        profile.reported400Hundredths,
        profile.bestStroke,
        now,
        now,
      )
      // Tempo novo nos 400 m: entra na evolução dos tempos e nos treinos já montados
      if (profile.reported400Hundredths && profile.reported400Hundredths !== antes) {
        insertAnamnesisTest.run(user.id, profile.reported400Hundredths, readToday(req), now)
        refreshTimesFor(user.id, readToday(req))
      }
      sendJson(res, 200, profileResponse(user.id))
    },

    // GET /api/competitions?today=AAAA-MM-DD -> competições de hoje em diante, da mais próxima
    getCompetitions(req, res) {
      const user = requireUser(req)
      const rows = listUpcomingCompetitions.all(user.id, readToday(req))
      sendJson(res, 200, { competitions: rows.map(publicCompetition) })
    },

    // POST /api/competitions { name, date, modality, event?, priority? }
    async createCompetition(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      // A principal (A) é só a prova alvo, escolhida no "Gerar treinos"
      if (body.priority === 'A') throw new HttpError(400, ONLY_ONE_TARGET)
      const c = validateCompetition(body)
      const id = insertCompetition.run(
        user.id, c.name, c.date, c.modality, c.event, c.distance, c.stroke, c.goalHundredths, JSON.stringify(c.events), c.priority, new Date().toISOString(),
      ).lastInsertRowid
      sendJson(res, 201, { competition: publicCompetition(findCompetition.get(Number(id), user.id)) })
    },

    // PATCH /api/competitions/:id { priority: 'B' (importante) | 'C' (participação) }
    async updateCompetitionPriority(req, res, { id }) {
      const user = requireUser(req)
      const { priority } = await readJson(req)
      if (priority === 'A') throw new HttpError(400, ONLY_ONE_TARGET)
      oneOf(['B', 'C'], priority, 'Escolha se a prova é importante ou só participação.')
      const competition = findCompetition.get(parseId(id), user.id)
      if (!competition) throw new HttpError(404, 'Competição não encontrada.')
      if (competition.priority === 'A') throw new HttpError(409, IS_TARGET)
      setPriority.run(priority, competition.id, user.id)
      sendJson(res, 200, { competition: publicCompetition(findCompetition.get(competition.id, user.id)) })
    },

    // DELETE /api/competitions/:id (a prova alvo não sai do calendário por aqui)
    removeCompetition(req, res, { id }) {
      const user = requireUser(req)
      const competition = findCompetition.get(parseId(id), user.id)
      if (!competition) throw new HttpError(404, 'Competição não encontrada.')
      if (competition.priority === 'A') throw new HttpError(409, IS_TARGET)
      deleteCompetition.run(competition.id, user.id)
      sendJson(res, 200, { ok: true })
    },

    // POST /api/trainings/generate?today=AAAA-MM-DD -> gera os treinos dos próximos
    // dias (primeira versão do gerador) e substitui os agendados que não foram feitos
    async generate(req, res) {
      const user = requireUser(req)
      const resultado = buildPeriodization(user.id, readToday(req))
      // O plano interno fica só no banco: o atleta não recebe
      const semPlano = (t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'plano'))
      sendJson(res, 201, { trainings: resultado.trainings.map(semPlano), replaced: resultado.replaced })
    },

    // Tempo novo (teste de 400 m): reescreve os treinos que ainda não foram feitos com
    // os tempos atuais (cd, ritmo, velocidade). As séries e as intensidades não mudam.
    // Devolve quantos treinos foram atualizados.
    refreshTrainingTimes(userId, today) {
      return refreshTimesFor(userId, today)
    },

    // Faltas: quem treina pouco por semana perde mais com elas. Iniciante e intermediário
    // com mais de 3 faltas seguidas, e avançado com 3 dias ou mais sem treinar, têm os
    // próximos treinos mais leves (só as intensidades descem um degrau; as séries ficam).
    // Devolve quantos treinos ficaram mais leves.
    applyAbsenceRule(userId, today = new Date().toISOString().slice(0, 10)) {
      const { profile, time400, level } = profileResponse(userId)
      const regra = rules.faltas?.[level?.level]
      if (!profile || !regra || profile.trainingDays.length > regra.ateTreinosPorSemana) return 0
      let seguidas = 0
      for (const t of pastTrainings.all(userId, today)) {
        if (!t.missed_at) break
        seguidas++
      }
      if (seguidas === 0) return 0
      let vale
      if (regra.faltasSeguidasMaisQue !== undefined) vale = seguidas > regra.faltasSeguidasMaisQue
      else {
        const ultimo = lastCompleted.get(userId).date
        const dias = ultimo ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${ultimo}T12:00:00Z`)) / 86_400_000) : Infinity
        vale = dias >= regra.diasSemTreinar
      }
      if (!vale) return 0
      const proximos = upcomingOrdered.all(userId, today, regra.treinosMaisLeves)
      // Já ficaram mais leves por essas faltas
      if (proximos.length === 0 || JSON.parse(proximos[0].plan).maisLeve) return 0
      const athlete = { ...profile, level: level.level, recemIntermediario: level.recemIntermediario, nivelAntesDaParada: level.nivelAntesDaParada, time400 }
      db.exec('BEGIN')
      try {
        for (const row of proximos) {
          const { partes, plano } = lightenTraining(rules, athlete, { partes: JSON.parse(row.parts), plano: JSON.parse(row.plan) }, regra.comoDiminuir)
          const f = legacyFields(partes)
          replaceTraining.run(JSON.stringify(partes), JSON.stringify(plano), f.warmUp, f.speed, f.mainSeries, f.release, row.id, userId)
        }
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return proximos.length
    },

    // Teste de 400 m planejado (o de quem não tinha tempo) que o atleta ainda não disse
    // se vai fazer. Devolve { id, date } ou null.
    plannedTest(userId, today = new Date().toISOString().slice(0, 10)) {
      for (const row of upcomingWithPlan.all(userId, today)) {
        const plano = JSON.parse(row.plan)
        if (plano.tipoDeTeste === 'semTempo' && !plano.testeConfirmado) {
          return { id: row.id, date: findTrainingRow.get(row.id, userId).date }
        }
      }
      return null
    },

    // POST /api/trainings/:id/planned-test { fazer: true | false }
    // O atleta registrou um tempo e tinha um teste planejado: vai fazer o teste? Sim: o
    // teste fica. Não: no lugar entra um treino normal da etapa (sem repetir as séries
    // do treino anterior nem do seguinte).
    async answerPlannedTest(req, res, { id }) {
      const user = requireUser(req)
      const { fazer } = await readJson(req)
      if (typeof fazer !== 'boolean') throw new HttpError(400, 'Responda se vai fazer o teste.')
      const row = findTrainingRow.get(parseId(id), user.id)
      const plano = row?.plan ? JSON.parse(row.plan) : null
      if (!row || row.completed_at || !plano?.diaDeTeste) throw new HttpError(404, 'Teste planejado não encontrado.')
      if (fazer) {
        setPlan.run(JSON.stringify({ ...plano, testeConfirmado: true }), row.id, user.id)
        return sendJson(res, 200, { mantido: true })
      }
      const entrada = periodizationInput(user.id, row.date)
      const vizinhos = [trainingNear.get(user.id, row.date), trainingAfter.get(user.id, row.date)]
        .flatMap((r) => (r ? [...seriesUsadas(JSON.parse(r.parts))] : []))
      const [novo] = generateTrainings({
        ...entrada, dias: 1, semTeste: true, seriesAnteriores: vizinhos,
        periodizacao: { ...entrada.periodizacao, numeroInicial: plano.numero ?? 1 },
      })
      if (!novo || novo.date !== row.date) throw new HttpError(409, 'Não deu para montar um treino nesse dia.')
      const f = legacyFields(novo.partes)
      replaceTraining.run(JSON.stringify(novo.partes), JSON.stringify(novo.plano), f.warmUp, f.speed, f.mainSeries, f.release, row.id, user.id)
      sendJson(res, 200, { mantido: false })
    },

    // POST /api/trainings/:id/reschedule-test { date } -> o atleta não pode ir no dia do
    // teste: o teste vai para o dia que ele escolher (de preferência na semana seguinte).
    // Se nesse dia já tem treino, os dois trocam de dia; se não tem, o teste só muda de data.
    async rescheduleTest(req, res, { id }) {
      const user = requireUser(req)
      const { date } = await readJson(req)
      const today = readToday(req)
      if (!isRealDate(date) || date <= today) throw new HttpError(400, 'Escolha um dia daqui para a frente.')
      const row = findTrainingRow.get(parseId(id), user.id)
      const plano = row?.plan ? JSON.parse(row.plan) : null
      if (!row || row.completed_at || !plano?.diaDeTeste) throw new HttpError(404, 'Teste não encontrado.')
      if (date === row.date) throw new HttpError(400, 'Escolha um dia diferente do que está marcado.')
      const outro = trainingOnDate.get(user.id, date)
      if (outro?.completed_at) throw new HttpError(409, 'Nesse dia você já tem um treino concluído.')
      const teste = trainingOnDate.get(user.id, row.date)
      db.exec('BEGIN')
      try {
        if (outro) {
          // Troca o conteúdo: o teste vai para o dia escolhido; o treino daquele dia vem para cá
          // (o "Treino N" de cada dia fica, para a numeração seguir a ordem das datas)
          swapContent.run(teste.title, outro.parts, outro.plan, outro.warm_up, outro.speed, outro.main_series, outro.release, teste.id, user.id)
          swapContent.run(outro.title, teste.parts, teste.plan, teste.warm_up, teste.speed, teste.main_series, teste.release, outro.id, user.id)
        } else {
          moveTraining.run(date, row.id, user.id)
        }
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      sendJson(res, 200, { date, trocado: Boolean(outro) })
    },

    // Depois de concluir um treino: se os últimos 3 seguidos saíram do esperado,
    // refaz os treinos já montados (os próximos, não concluídos). Devolve quantos refez.
    reformulateIfNeeded(userId, today = new Date().toISOString().slice(0, 10)) {
      const { profile, level } = profileResponse(userId)
      if (!profile || !level) return 0
      const historico = readHistory(userId)
      const ajuste = feedbackAdjustment(rules, { ...profile, level: level.level }, historico, nextFactor(userId, today))
      if (countUpcomingGenerated.get(userId, today).total === 0) return 0
      // Nado contínuo (série de teste): subiu ou desceu um passo -> os próximos treinos mudam
      const proximo = upcomingOrdered.all(userId, today, 6).map((r) => parsePlan(r.plan)).find((p) => p?.serieDeTeste)
      let mudouContinuo = false
      if (proximo?.serieDeTeste) {
        const { athlete } = periodizationInput(userId, today)
        const pace = (athlete.time400?.hundredths ?? 0) / 400 || null
        mudouContinuo = testSeriesDistance(rules, prepareAthlete(rules, athlete), historico, pace)?.distancia !== proximo.serieDeTeste.distancia
      }
      if (ajuste.carga === 0 && !mudouContinuo) return 0
      return buildPeriodization(userId, today).trainings.length
    },

    // PATCH /api/preparations/current { model: 'geral' | 'especifico' } -> troca o modelo
    // de treino da preparação atual e refaz os treinos que ainda não foram feitos
    async changeModel(req, res) {
      const user = requireUser(req)
      const { model } = await readJson(req)
      oneOf(MODELOS, model, 'Escolha o modelo de treino: Geral ou Específico da prova.')
      const today = readToday(req)
      const atual = preparationResponse(user.id, today)
      if (!atual?.active) throw new HttpError(409, 'Use "Gerar treinos" para escolher a prova alvo antes.')
      if (model === 'especifico' && !atual.especifico.ok) throw new HttpError(400, atual.especifico.motivo)
      setModel.run(model, atual.id, user.id)
      const refeitos = countUpcomingGenerated.get(user.id, today).total > 0 ? buildPeriodization(user.id, today).trainings.length : 0
      sendJson(res, 200, { preparation: preparationResponse(user.id, today), refeitos })
    },

    // GET /api/preparations/current?today=AAAA-MM-DD -> preparação mais recente (ou null)
    getCurrentPreparation(req, res) {
      const user = requireUser(req)
      sendJson(res, 200, { preparation: preparationResponse(user.id, readToday(req)) })
    },

    // POST /api/preparations
    //   { goal: 'competir', competitionId }            -> prova do calendário
    //   { goal: 'competir', competition: { ... } }     -> prova nova (entra no calendário)
    //   { goal: 'condicionamento' | 'saude' }          -> sem prova alvo
    // A prova escolhida vira prioridade A (prova alvo).
    async createPreparation(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      const goal = oneOf(OPTIONS.goal, body.goal, 'Escolha o objetivo da preparação.')

      if (!findProfile.get(user.id)) {
        throw new HttpError(409, 'Responda a anamnese antes de gerar treinos.')
      }

      const now = new Date().toISOString()
      let competitionId = null

      db.exec('BEGIN')
      try {
        if (goal === 'competir') {
          if (body.competition) {
            const c = validateCompetition({ ...body.competition, priority: 'A' })
            competitionId = Number(
              insertCompetition.run(user.id, c.name, c.date, c.modality, c.event, c.distance, c.stroke, c.goalHundredths, JSON.stringify(c.events), 'A', now).lastInsertRowid,
            )
            demoteOtherTargets.run(user.id, competitionId)
          } else {
            competitionId = parseId(body.competitionId)
            const existing = findCompetition.get(competitionId, user.id)
            // Filtrar pelo usuário impede usar a competição de outra pessoa
            if (!existing) throw new HttpError(404, 'Competição não encontrada.')
            if (!isValidCompetitionDate(existing.date)) {
              throw new HttpError(400, 'Essa competição já passou. Escolha outra prova alvo.')
            }
            setPriority.run('A', competitionId, user.id)
            demoteOtherTargets.run(user.id, competitionId)
          }
        } else if (body.competition || body.competitionId) {
          throw new HttpError(400, 'Sem objetivo de competir, não escolha prova alvo.')
        } else {
          // Sem prova alvo: nenhuma prova é a principal
          demoteOtherTargets.run(user.id, null)
        }

        const model = oneOf(MODELOS, body.model ?? 'geral', 'Escolha o modelo de treino: Geral ou Específico da prova.')
        if (model === 'especifico') {
          const pode = podeUsarEspecifico({ goal, competition: competitionId ? publicCompetition(findCompetition.get(competitionId, user.id)) : null, profile: profileOf(user.id) })
          if (!pode.ok) throw new HttpError(400, pode.motivo)
        }
        insertPreparation.run(user.id, goal, competitionId, model, now)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }

      sendJson(res, 201, { preparation: preparationResponse(user.id, readToday(req)) })
    },
  }
}

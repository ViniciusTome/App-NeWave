// Anamnese do atleta, calendário de competições e preparação (prova alvo).
// É a base do botão "Gerar treinos": as respostas ficam guardadas para o atleta
// não repetir tudo, e a prova alvo é escolhida a cada vez que ele gera treinos.
import { HttpError, readJson, sendJson } from './http.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Opções aceitas em cada pergunta. As mesmas chaves estão em src/utils/athlete.js.
export const OPTIONS = {
  swimmingSince: ['menos_6m', '6m_2a', '2a_5a', 'mais_5a'],
  recentBreak: ['nao', 'menos_1m', '1_6m', 'mais_6m'],
  continuousDistance: ['ate_50', '50_100', '100_200', '200_400', '400_1000', '1000_2000', 'mais_2000'],
  strokes: ['crawl', 'costas', 'peito', 'borboleta'],
  sessionMinutes: [30, 45, 60, 75, 90, 120],
  poolLength: [25, 50],
  equipment: ['pe_de_pato', 'pe_de_pato_peito', 'palmar', 'prancha', 'pull_buoy', 'snorkel', 'paraquedas'],
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
  if (returning) index = Math.max(index - 1, 0)

  return { level: LEVELS[index], returning }
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
    equipment: listOf(OPTIONS.equipment, body.equipment ?? [], { message: 'Material inválido.' }),
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
  const event = typeof body.event === 'string' ? body.event.trim() : ''
  if (event.length > 100) throw new HttpError(400, 'Descreva a prova em até 100 caracteres.')

  return {
    name,
    date: body.date,
    modality: oneOf(OPTIONS.modality, body.modality, 'Escolha a modalidade da competição.'),
    event,
    priority: oneOf(OPTIONS.priority, body.priority ?? 'A', 'Escolha a prioridade A, B ou C.'),
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
  equipment: JSON.parse(row.equipment),
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
  priority: row.priority,
})

function parseId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Competição inválida.')
  return id
}

// ---------- Rotas ----------

export function createAthleteRoutes({ db, requireUser }) {
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
  const latest400Test = db.prepare(`
    SELECT time_hundredths, date FROM tests
    WHERE user_id = ? AND distance = 400 ORDER BY date DESC, id DESC LIMIT 1
  `)

  const listUpcomingCompetitions = db.prepare(`
    SELECT * FROM competitions WHERE user_id = ? AND date >= ? ORDER BY date, id LIMIT 100
  `)
  const findCompetition = db.prepare('SELECT * FROM competitions WHERE id = ? AND user_id = ?')
  const insertCompetition = db.prepare(`
    INSERT INTO competitions (user_id, name, date, modality, event, priority, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const setPriority = db.prepare('UPDATE competitions SET priority = ? WHERE id = ? AND user_id = ?')

  const findCurrentPreparation = db.prepare(`
    SELECT * FROM preparations WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `)
  const insertPreparation = db.prepare(`
    INSERT INTO preparations (user_id, goal, competition_id, created_at) VALUES (?, ?, ?, ?)
  `)

  // Tempo nos 400 m: o teste registrado tem preferência sobre o tempo informado na anamnese
  function time400Of(userId, profile) {
    const test = latest400Test.get(userId)
    if (test) return { hundredths: test.time_hundredths, source: 'teste', date: test.date }
    if (profile?.reported400Hundredths) {
      return { hundredths: profile.reported400Hundredths, source: 'informado', date: null }
    }
    return null
  }

  function profileResponse(userId) {
    const row = findProfile.get(userId)
    const profile = row ? publicProfile(row) : null
    const time400 = time400Of(userId, profile)
    return { profile, time400, level: profile ? computeLevel(profile, time400) : null }
  }

  function preparationResponse(userId, today) {
    const row = findCurrentPreparation.get(userId)
    if (!row) return null
    const competitionRow = row.competition_id ? findCompetition.get(row.competition_id, userId) : null
    const competition = competitionRow ? publicCompetition(competitionRow) : null
    return {
      id: row.id,
      goal: row.goal,
      competition,
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
      const c = validateCompetition(await readJson(req))
      const id = insertCompetition.run(
        user.id, c.name, c.date, c.modality, c.event, c.priority, new Date().toISOString(),
      ).lastInsertRowid
      sendJson(res, 201, { competition: { id: Number(id), ...c } })
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
              insertCompetition.run(user.id, c.name, c.date, c.modality, c.event, 'A', now).lastInsertRowid,
            )
          } else {
            competitionId = parseId(body.competitionId)
            const existing = findCompetition.get(competitionId, user.id)
            // Filtrar pelo usuário impede usar a competição de outra pessoa
            if (!existing) throw new HttpError(404, 'Competição não encontrada.')
            if (!isValidCompetitionDate(existing.date)) {
              throw new HttpError(400, 'Essa competição já passou. Escolha outra prova alvo.')
            }
            setPriority.run('A', competitionId, user.id)
          }
        } else if (body.competition || body.competitionId) {
          throw new HttpError(400, 'Sem objetivo de competir, não escolha prova alvo.')
        }

        insertPreparation.run(user.id, goal, competitionId, now)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }

      sendJson(res, 201, { preparation: preparationResponse(user.id, readToday(req)) })
    },
  }
}

// Rotas de dados de natação: testes de tempo e treinos (agendados e realizados).
// Todas exigem login e só enxergam os dados do próprio usuário.
import { HttpError, readJson, sendJson } from './http.js'

export const TEST_DISTANCES = [25, 50, 100, 200, 400, 800, 1500]
const MAX_TIME_HUNDREDTHS = 2 * 60 * 60 * 100 // 2 horas
const MAX_SECTION_LENGTH = 2000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PLAN_DAYS = 366 // até quanto tempo à frente dá para agendar um treino
const MAX_UPCOMING = 50
// Feedback ao concluir: dificuldade da série principal de 1 (muito fácil) a 10 (muito
// difícil); acima de 8, o motivo (o mesmo de server/series/regras.json, "feedback")
export const FEEDBACK = { motivoAcimaDe: 8, motivos: ['respiracao', 'forca'] }

// Aceita só datas reais (ex.: recusa 2026-02-30), a partir de 1900.
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(time)) return false
  return new Date(time).toISOString().slice(0, 10) === value && value >= '1900-01-01'
}

// Datas de algo que já aconteceu: até amanhã (folga para fuso horário
// diferente entre aparelho e servidor).
function isValidDate(value) {
  return isRealDate(value) && Date.parse(`${value}T00:00:00Z`) <= Date.now() + DAY_MS
}

// Datas de treino agendado: até um ano à frente.
function isValidPlanDate(value) {
  return isRealDate(value) && Date.parse(`${value}T00:00:00Z`) <= Date.now() + MAX_PLAN_DAYS * DAY_MS
}

// "Hoje" no fuso do aparelho do atleta, enviado pelo front em ?today=AAAA-MM-DD.
// Sem esse dado (ou se vier inválido), usa a data do servidor em UTC.
function readToday(url) {
  const today = url.searchParams.get('today')
  return isRealDate(today) ? today : new Date().toISOString().slice(0, 10)
}

const optionalText = (value) => (typeof value === 'string' ? value.trim() : '')

const publicTest = (row) => ({
  id: row.id,
  distance: row.distance,
  timeHundredths: row.time_hundredths,
  date: row.date,
})

const publicTraining = (row) => ({
  id: row.id,
  date: row.date,
  title: row.title,
  warmUp: row.warm_up,
  speed: row.speed,
  mainSeries: row.main_series,
  release: row.release,
  notes: row.notes,
  completed: row.completed_at !== null,
  // Treinos gerados: as partes, na ordem (aquecimento, velocidade, ...)
  partes: row.parts ? JSON.parse(row.parts) : null,
  // Feedback do atleta ao concluir (null quando não respondeu)
  difficulty: row.difficulty ?? null,
  difficultyReason: row.difficulty_reason ?? null,
})

// { difficulty?, reason? } do "Concluir treino"
function readFeedback(body) {
  if (body.difficulty === undefined || body.difficulty === null) return { difficulty: null, reason: null }
  const { difficulty, reason } = body
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
    throw new HttpError(400, 'Diga de 1 a 10 como foi a série principal.')
  }
  if (difficulty <= FEEDBACK.motivoAcimaDe) return { difficulty, reason: null }
  if (!FEEDBACK.motivos.includes(reason)) {
    throw new HttpError(400, 'Conte se foi difícil pela respiração ou pela força.')
  }
  return { difficulty, reason }
}

function parseId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'Não encontrado.')
  return id
}

export function createSwimmingRoutes({ db, requireUser }) {
  const listTests = db.prepare(`
    SELECT id, distance, time_hundredths, date FROM tests
    WHERE user_id = ? ORDER BY date, id
  `)
  const insertTest = db.prepare(`
    INSERT INTO tests (user_id, distance, time_hundredths, date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const deleteTest = db.prepare('DELETE FROM tests WHERE id = ? AND user_id = ?')

  const TRAINING_COLUMNS =
    'id, date, title, warm_up, speed, main_series, release, notes, completed_at, parts, difficulty, difficulty_reason'
  // Histórico: treinos concluídos e treinos cuja data já passou
  const listHistory = db.prepare(`
    SELECT ${TRAINING_COLUMNS} FROM trainings
    WHERE user_id = ? AND (completed_at IS NOT NULL OR date < ?)
    ORDER BY date DESC, id DESC LIMIT ?
  `)
  // Próximos: ainda não concluídos, de hoje em diante (o carrossel da Home)
  const listUpcoming = db.prepare(`
    SELECT ${TRAINING_COLUMNS} FROM trainings
    WHERE user_id = ? AND completed_at IS NULL AND date >= ?
    ORDER BY date, id LIMIT ?
  `)
  const findTraining = db.prepare(`SELECT ${TRAINING_COLUMNS} FROM trainings WHERE id = ? AND user_id = ?`)
  const insertTraining = db.prepare(`
    INSERT INTO trainings
      (user_id, date, title, warm_up, speed, main_series, release, notes, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const completeTraining = db.prepare(`
    UPDATE trainings SET completed_at = ?, difficulty = ?, difficulty_reason = ?
    WHERE id = ? AND user_id = ? AND completed_at IS NULL
  `)

  return {
    // GET /api/tests -> todos os testes do usuário, do mais antigo ao mais novo
    getTests(req, res) {
      const user = requireUser(req)
      sendJson(res, 200, { tests: listTests.all(user.id).map(publicTest) })
    },

    // POST /api/tests  { distance, timeHundredths, date }
    async createTest(req, res) {
      const user = requireUser(req)
      const { distance, timeHundredths, date } = await readJson(req)

      if (!TEST_DISTANCES.includes(distance)) {
        throw new HttpError(400, `Escolha uma distância válida (${TEST_DISTANCES.join(', ')} m).`)
      }
      if (
        !Number.isSafeInteger(timeHundredths) ||
        timeHundredths <= 0 ||
        timeHundredths > MAX_TIME_HUNDREDTHS
      ) {
        throw new HttpError(400, 'Informe um tempo válido.')
      }
      if (!isValidDate(date)) {
        throw new HttpError(400, 'Informe uma data válida, que não esteja no futuro.')
      }

      const id = insertTest.run(user.id, distance, timeHundredths, date, new Date().toISOString())
        .lastInsertRowid
      sendJson(res, 201, { test: { id: Number(id), distance, timeHundredths, date } })
    },

    // DELETE /api/tests/:id
    removeTest(req, res, { id }) {
      const user = requireUser(req)
      // Filtrar pelo usuário impede apagar o teste de outra pessoa
      if (deleteTest.run(parseId(id), user.id).changes === 0) {
        throw new HttpError(404, 'Teste não encontrado.')
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
    },

    // GET /api/trainings?limit=10&today=AAAA-MM-DD -> histórico, do mais recente:
    // treinos concluídos e os que passaram da data sem serem feitos (completed: false)
    getTrainings(req, res) {
      const user = requireUser(req)
      const url = new URL(req.url, 'http://localhost')
      const requested = Number(url.searchParams.get('limit') ?? 10)
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10
      const trainings = listHistory.all(user.id, readToday(url), limit)
      sendJson(res, 200, { trainings: trainings.map(publicTraining) })
    },

    // GET /api/trainings/upcoming?today=AAAA-MM-DD -> treinos agendados de hoje em diante,
    // ainda não concluídos, do mais próximo ao mais distante
    getUpcomingTrainings(req, res) {
      const user = requireUser(req)
      const today = readToday(new URL(req.url, 'http://localhost'))
      const trainings = listUpcoming.all(user.id, today, MAX_UPCOMING)
      sendJson(res, 200, { trainings: trainings.map(publicTraining) })
    },

    // POST /api/trainings/:id/complete -> marca o treino como realizado
    // POST /api/trainings/:id/complete  { difficulty?: 1-10, reason?: 'respiracao' | 'forca' }
    async completeTraining(req, res, { id }) {
      const user = requireUser(req)
      const trainingId = parseId(id)
      const comCorpo = (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')
      const { difficulty, reason } = readFeedback(comCorpo ? await readJson(req) : {})
      if (completeTraining.run(new Date().toISOString(), difficulty, reason, trainingId, user.id).changes === 0) {
        // Filtrar pelo usuário impede concluir o treino de outra pessoa
        if (!findTraining.get(trainingId, user.id)) throw new HttpError(404, 'Treino não encontrado.')
        throw new HttpError(409, 'Esse treino já foi concluído.')
      }
      sendJson(res, 200, { training: publicTraining(findTraining.get(trainingId, user.id)) })
    },

    // POST /api/trainings  { date, title?, warmUp?, speed?, mainSeries?, release?, notes?, planned? }
    // Sem `planned`: registra um treino já realizado (data até hoje).
    // Com `planned: true`: agenda um treino (data até um ano à frente), ainda não concluído.
    async createTraining(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      const planned = body.planned === true

      if (planned && !isValidPlanDate(body.date)) {
        throw new HttpError(400, 'Informe uma data válida, de até um ano à frente.')
      }
      if (!planned && !isValidDate(body.date)) {
        throw new HttpError(400, 'Informe uma data válida, que não esteja no futuro.')
      }

      const fields = {
        title: optionalText(body.title),
        warmUp: optionalText(body.warmUp),
        speed: optionalText(body.speed),
        mainSeries: optionalText(body.mainSeries),
        release: optionalText(body.release),
        notes: optionalText(body.notes),
      }

      if (fields.title.length > 100) throw new HttpError(400, 'O título pode ter até 100 caracteres.')
      if (Object.values(fields).some((text) => text.length > MAX_SECTION_LENGTH)) {
        throw new HttpError(400, `Cada parte do treino pode ter até ${MAX_SECTION_LENGTH} caracteres.`)
      }
      if (!fields.warmUp && !fields.speed && !fields.mainSeries && !fields.release) {
        throw new HttpError(400, 'Preencha pelo menos uma parte do treino.')
      }

      const now = new Date().toISOString()
      const id = insertTraining.run(
        user.id,
        body.date,
        fields.title,
        fields.warmUp,
        fields.speed,
        fields.mainSeries,
        fields.release,
        fields.notes,
        now,
        planned ? null : now,
      ).lastInsertRowid

      sendJson(res, 201, {
        training: { id: Number(id), date: body.date, ...fields, completed: !planned },
      })
    },
  }
}

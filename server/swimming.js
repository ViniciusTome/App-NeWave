// Rotas de dados de natação: testes de tempo e treinos realizados.
// Todas exigem login e só enxergam os dados do próprio usuário.
import { HttpError, readJson, sendJson } from './http.js'

export const TEST_DISTANCES = [25, 50, 100, 200, 400, 800, 1500]
const MAX_TIME_HUNDREDTHS = 2 * 60 * 60 * 100 // 2 horas
const MAX_SECTION_LENGTH = 2000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

// Aceita só datas reais (ex.: recusa 2026-02-30), a partir de 1900
// e até amanhã (folga para fuso horário diferente entre aparelho e servidor).
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(time)) return false
  if (new Date(time).toISOString().slice(0, 10) !== value) return false
  return value >= '1900-01-01' && time <= Date.now() + DAY_MS
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
})

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

  const listTrainings = db.prepare(`
    SELECT id, date, title, warm_up, speed, main_series, release, notes FROM trainings
    WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?
  `)
  const insertTraining = db.prepare(`
    INSERT INTO trainings
      (user_id, date, title, warm_up, speed, main_series, release, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    // GET /api/trainings?limit=10 -> últimos treinos realizados, do mais recente
    getTrainings(req, res) {
      const user = requireUser(req)
      const requested = Number(new URL(req.url, 'http://localhost').searchParams.get('limit') ?? 10)
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10
      sendJson(res, 200, { trainings: listTrainings.all(user.id, limit).map(publicTraining) })
    },

    // POST /api/trainings  { date, title?, warmUp?, speed?, mainSeries?, release?, notes? }
    async createTraining(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)

      if (!isValidDate(body.date)) {
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

      const id = insertTraining.run(
        user.id,
        body.date,
        fields.title,
        fields.warmUp,
        fields.speed,
        fields.mainSeries,
        fields.release,
        fields.notes,
        new Date().toISOString(),
      ).lastInsertRowid

      sendJson(res, 201, { training: { id: Number(id), date: body.date, ...fields } })
    },
  }
}

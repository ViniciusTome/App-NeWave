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
// difícil); a partir de 8, o motivo (o mesmo de server/series/regras.json, "feedback")
export const FEEDBACK = { motivoAPartirDe: 8, motivos: ['respiracao', 'forca'] }

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
  // "anamnese" = o tempo que o atleta informou na anamnese
  origin: row.origin ?? 'teste',
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
  // O atleta disse que não fez (falta)
  missed: Boolean(row.missed_at),
})

// { difficulty?, reason? } do "Concluir treino"
function readFeedback(body) {
  // Nado contínuo: conseguiu nadar sem parar? (true / false; sem a pergunta, null)
  if (body.nonstop !== undefined && body.nonstop !== null && typeof body.nonstop !== 'boolean') {
    throw new HttpError(400, 'Diga se conseguiu nadar o contínuo sem parar.')
  }
  const nonstop = typeof body.nonstop === 'boolean' ? body.nonstop : null
  if (body.difficulty === undefined || body.difficulty === null) return { difficulty: null, reason: null, nonstop }
  const { difficulty, reason } = body
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
    throw new HttpError(400, 'Diga de 1 a 10 como foi a série principal.')
  }
  if (difficulty < FEEDBACK.motivoAPartirDe) return { difficulty, reason: null, nonstop }
  if (!FEEDBACK.motivos.includes(reason)) {
    throw new HttpError(400, 'Conte se foi difícil pela respiração ou pela força.')
  }
  return { difficulty, reason, nonstop }
}

function parseId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'Não encontrado.')
  return id
}

// ---------- Resumo dos treinos (Desempenho) ----------

const addDaysIso = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const metrosDe = (row) => {
  try {
    return (row.parts ? JSON.parse(row.parts) : []).reduce((t, p) => t + (p.metros ?? 0), 0)
  } catch {
    return 0
  }
}
const media = (lista) => (lista.length ? Math.round((lista.reduce((t, x) => t + x, 0) / lista.length) * 10) / 10 : null)

// Resumo de todos os treinos juntos, ao longo do tempo. `rows` = os treinos do atleta (com
// date, completed_at, missed_at, difficulty, difficulty_reason, parts); `today` = AAAA-MM-DD.
// - notas: a média das notas da série principal nas últimas 4 semanas e nas 4 antes;
// - motivos: nos últimos 10 treinos com nota, quantas vezes faltou ar / faltou força;
// - semana: metros planejados e nadados na semana (de segunda a domingo);
// - frequencia: nos últimos 30 dias, treinos feitos e faltas (dos que já passaram).
export function trainingSummary(rows, today) {
  const comNota = rows.filter((r) => r.completed_at && Number.isInteger(r.difficulty)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const entre = (de, ate) => comNota.filter((r) => r.date > de && r.date <= ate).map((r) => r.difficulty)
  const recentes = entre(addDaysIso(today, -28), today)
  const anteriores = entre(addDaysIso(today, -56), addDaysIso(today, -28))
  const ultimos = comNota.slice(0, 10)
  const diaDaSemana = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const segunda = addDaysIso(today, -diaDaSemana)
  const domingo = addDaysIso(segunda, 6)
  const daSemana = rows.filter((r) => r.date >= segunda && r.date <= domingo)
  const passados = rows.filter((r) => r.date > addDaysIso(today, -30) && (r.date < today || r.completed_at))
  return {
    notas: { recentes: media(recentes), treinosRecentes: recentes.length, anteriores: media(anteriores), treinosAnteriores: anteriores.length },
    motivos: {
      treinos: ultimos.length,
      respiracao: ultimos.filter((r) => r.difficulty_reason === 'respiracao').length,
      forca: ultimos.filter((r) => r.difficulty_reason === 'forca').length,
    },
    semana: {
      inicio: segunda,
      fim: domingo,
      planejado: daSemana.reduce((t, r) => t + metrosDe(r), 0),
      nadado: daSemana.filter((r) => r.completed_at).reduce((t, r) => t + metrosDe(r), 0),
      treinos: daSemana.length,
      feitos: daSemana.filter((r) => r.completed_at).length,
    },
    frequencia: {
      dias: 30,
      treinos: passados.length,
      feitos: passados.filter((r) => r.completed_at).length,
      faltas: passados.filter((r) => !r.completed_at).length,
    },
  }
}

export function createSwimmingRoutes({
  db, requireUser, onTrainingCompleted = () => 0, onTimesChanged = () => 0, plannedTest = () => null,
  onTrainingMissed = () => 0, askAboutLastDays = 21,
}) {
  const listTests = db.prepare(`
    SELECT id, distance, time_hundredths, date, origin FROM tests
    WHERE user_id = ? ORDER BY date, id
  `)
  const insertTest = db.prepare(`
    INSERT INTO tests (user_id, distance, time_hundredths, date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const deleteTest = db.prepare('DELETE FROM tests WHERE id = ? AND user_id = ?')
  const findTest = db.prepare('SELECT time_hundredths, origin FROM tests WHERE id = ? AND user_id = ?')
  // Apagou o tempo que veio da anamnese: ele sai também do perfil (a evolução manda)
  const clearReported = db.prepare(`
    UPDATE athlete_profiles SET reported_400_hundredths = NULL WHERE user_id = ? AND reported_400_hundredths = ?
  `)

  const TRAINING_COLUMNS =
    'id, date, title, warm_up, speed, main_series, release, notes, completed_at, parts, difficulty, difficulty_reason, missed_at'
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
  // Página Treinos/Periodização: todos os treinos, com a fase de cada um
  const listPeriodization = db.prepare(`
    SELECT ${TRAINING_COLUMNS}, plan FROM trainings WHERE user_id = ? ORDER BY date, id LIMIT 500
  `)
  // Sem resposta: passou da data, não foi concluído nem marcado como falta
  const listPending = db.prepare(`
    SELECT ${TRAINING_COLUMNS} FROM trainings
    WHERE user_id = ? AND date < ? AND date >= ? AND completed_at IS NULL AND missed_at IS NULL
    ORDER BY date, id LIMIT 20
  `)
  const markMissed = db.prepare(`
    UPDATE trainings SET missed_at = ? WHERE id = ? AND user_id = ? AND completed_at IS NULL AND missed_at IS NULL AND date < ?
  `)
  const insertTraining = db.prepare(`
    INSERT INTO trainings
      (user_id, date, title, warm_up, speed, main_series, release, notes, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  // Resumo (Desempenho): os treinos das últimas 8 semanas até o fim desta semana
  const listForSummary = db.prepare(`
    SELECT date, completed_at, missed_at, difficulty, difficulty_reason, parts FROM trainings
    WHERE user_id = ? AND date >= ? AND date <= ?
  `)
  const completeTraining = db.prepare(`
    UPDATE trainings SET completed_at = ?, difficulty = ?, difficulty_reason = ?, nonstop_ok = ?
    WHERE id = ? AND user_id = ? AND completed_at IS NULL
  `)

  return {
    // GET /api/trainings/summary?today=AAAA-MM-DD -> resumo dos treinos ao longo do tempo
    getTrainingSummary(req, res) {
      const user = requireUser(req)
      const today = readToday(new URL(req.url, 'http://localhost'))
      const rows = listForSummary.all(user.id, addDaysIso(today, -56), addDaysIso(today, 7))
      sendJson(res, 200, { summary: trainingSummary(rows, today) })
    },

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
      // Teste de 400 m: os treinos que ainda não foram feitos ganham os tempos novos (cd,
      // ritmo). Se ainda tem um teste planejado, o app pergunta se ele vai fazer.
      const treinosAtualizados = distance === 400 ? onTimesChanged(user.id) : 0
      const testePlanejado = distance === 400 ? plannedTest(user.id) : null
      sendJson(res, 201, { test: { id: Number(id), distance, timeHundredths, date }, treinosAtualizados, testePlanejado })
    },

    // DELETE /api/tests/:id
    removeTest(req, res, { id }) {
      const user = requireUser(req)
      // Filtrar pelo usuário impede apagar o teste de outra pessoa
      const teste = findTest.get(parseId(id), user.id)
      if (deleteTest.run(parseId(id), user.id).changes === 0) {
        throw new HttpError(404, 'Teste não encontrado.')
      }
      if (teste?.origin === 'anamnese') clearReported.run(user.id, teste.time_hundredths)
      onTimesChanged(user.id) // sem esse teste, os tempos podem mudar
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

    // GET /api/trainings/periodization -> todos os treinos (do mais antigo ao mais
    // novo) com a fase da periodização, a intensidade da principal, a metragem e o
    // tempo de cada um. O plano interno continua guardado: só sai o que a página mostra.
    getPeriodization(req, res) {
      const user = requireUser(req)
      const trainings = listPeriodization.all(user.id).map((row) => {
        const plano = row.plan ? JSON.parse(row.plan) : null
        const partes = row.parts ? JSON.parse(row.parts) : []
        return {
          ...publicTraining(row),
          periodizacao: plano && {
            fase: plano.fase ?? null,
            etapa: plano.etapa ?? null,
            nomeDaEtapa: plano.nomeDaEtapa ?? null,
            intensidade: plano.intensidade ?? null,
            diaDeTeste: Boolean(plano.diaDeTeste),
          },
          metros: partes.reduce((s, p) => s + (p.metros ?? 0), 0),
          // (com o tempo morto das trocas entre as partes, guardado no plano)
          minutos: partes.reduce((s, p) => s + (p.minutos ?? 0), 0) + (plano?.minutosDeTroca ?? 0),
        }
      })
      sendJson(res, 200, { trainings })
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
    // GET /api/trainings/pending?today=AAAA-MM-DD -> treinos que passaram da data sem
    // resposta (dos últimos dias): o app pergunta se o atleta fez ou não
    getPendingTrainings(req, res) {
      const user = requireUser(req)
      const today = readToday(new URL(req.url, 'http://localhost'))
      const desde = new Date(Date.parse(`${today}T12:00:00Z`) - askAboutLastDays * DAY_MS).toISOString().slice(0, 10)
      sendJson(res, 200, { trainings: listPending.all(user.id, today, desde).map(publicTraining) })
    },

    // POST /api/trainings/:id/missed?today=AAAA-MM-DD -> o atleta não fez esse treino.
    // Muitas faltas deixam os próximos treinos mais leves (só as intensidades).
    missTraining(req, res, { id }) {
      const user = requireUser(req)
      const today = readToday(new URL(req.url, 'http://localhost'))
      const trainingId = parseId(id)
      if (markMissed.run(new Date().toISOString(), trainingId, user.id, today).changes === 0) {
        if (!findTraining.get(trainingId, user.id)) throw new HttpError(404, 'Treino não encontrado.')
        throw new HttpError(409, 'Esse treino não pode ser marcado como falta.')
      }
      const maisLeves = onTrainingMissed(user.id, today)
      sendJson(res, 200, { training: publicTraining(findTraining.get(trainingId, user.id)), maisLeves })
    },

    // POST /api/trainings/:id/complete  { difficulty?: 1-10, reason?: 'respiracao' | 'forca' }
    async completeTraining(req, res, { id }) {
      const user = requireUser(req)
      const trainingId = parseId(id)
      const comCorpo = (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')
      const { difficulty, reason, nonstop } = readFeedback(comCorpo ? await readJson(req) : {})
      if (completeTraining.run(new Date().toISOString(), difficulty, reason, nonstop === null ? null : Number(nonstop), trainingId, user.id).changes === 0) {
        // Filtrar pelo usuário impede concluir o treino de outra pessoa
        if (!findTraining.get(trainingId, user.id)) throw new HttpError(404, 'Treino não encontrado.')
        throw new HttpError(409, 'Esse treino já foi concluído.')
      }
      // 3 treinos seguidos fora do esperado: os próximos treinos são refeitos
      const reformulados = difficulty !== null || nonstop !== null ? onTrainingCompleted(user.id) : 0
      sendJson(res, 200, { training: publicTraining(findTraining.get(trainingId, user.id)), reformulados })
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

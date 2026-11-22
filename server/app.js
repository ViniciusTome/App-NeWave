import { createServer } from 'node:http'
import { openDatabase } from './db.js'
import {
  HttpError,
  clientIp,
  parseCookies,
  readJson,
  sendJson,
  tooManyRequests,
} from './http.js'
import { createConsoleMailer, passwordResetMessage } from './mailer.js'
import { createSwimmingRoutes } from './swimming.js'
import { createAthleteRoutes } from './athlete.js'
import { loadLibrary } from './series/index.js'
import { loadRules } from './series/regras.js'
import {
  createRateLimiter,
  generateToken,
  hashPassword,
  hashToken,
  spendVerificationTime,
  verifyPassword,
} from './security.js'

const SESSION_COOKIE = 'newave_session'
const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_SHORT_MS = 1 * DAY_MS // login normal
const SESSION_LONG_MS = 30 * DAY_MS // "Lembrar-me" marcado
const RESET_TTL_MS = 60 * 60 * 1000 // o link de "esqueci a senha" vale 1 hora
const FORGOT_PASSWORD_REPLY =
  'Se existir uma conta com este email, enviamos um link para redefinir a senha.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  createdAt: row.created_at,
})

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

function validateRegistration({ name, email, password }) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return 'Informe seu nome (de 2 a 100 caracteres).'
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return 'Informe um email válido.'
  }
  if (!isValidPassword(password)) {
    return 'A senha deve ter de 8 a 128 caracteres.'
  }
  return null
}

export function createApp({
  dbPath,
  secureCookies = false,
  mailer = createConsoleMailer(),
  appUrl = 'http://localhost:5173', // endereço do front-end, usado no link do email
}) {
  const db = openDatabase(dbPath)

  const findUserByEmail = db.prepare(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?',
  )
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
  )
  const insertSession = db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
  const findSessionUser = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `)
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
  const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  const deleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?')

  const insertReset = db.prepare(
    'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
  const findReset = db.prepare(
    'SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?',
  )
  const consumeReset = db.prepare(
    'DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ?',
  )
  const deleteUserResets = db.prepare('DELETE FROM password_resets WHERE user_id = ?')
  const deleteExpiredResets = db.prepare('DELETE FROM password_resets WHERE expires_at <= ?')
  const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')

  // Limites de tentativas
  const registerLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 })
  const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }) // por IP + email
  const loginIpLimiter = createRateLimiter({ max: 100, windowMs: 15 * 60 * 1000 }) // por IP
  const forgotLimiter = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 }) // por IP + email
  const forgotIpLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 }) // por IP
  const resetLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }) // links inválidos, por IP

  deleteExpiredSessions.run(Date.now())
  deleteExpiredResets.run(Date.now())

  function cookieHeader(value, maxAgeSeconds) {
    let cookie = `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/`
    if (maxAgeSeconds !== undefined) cookie += `; Max-Age=${maxAgeSeconds}`
    if (secureCookies) cookie += '; Secure'
    return cookie
  }

  const getSessionToken = (req) => parseCookies(req.headers.cookie)[SESSION_COOKIE]

  function getSessionUser(req) {
    const token = getSessionToken(req)
    if (!token) return null
    return findSessionUser.get(hashToken(token), Date.now()) ?? null
  }

  function requireUser(req) {
    const user = getSessionUser(req)
    if (!user) throw new HttpError(401, 'Não autenticado.')
    return user
  }

  async function register(req, res) {
    const ip = clientIp(req)
    const key = `register:${ip}`
    const wait = registerLimiter.retryAfterMs(key)
    if (wait) throw tooManyRequests(wait)

    const body = await readJson(req)
    registerLimiter.fail(key) // todo cadastro conta como tentativa

    const error = validateRegistration(body)
    if (error) throw new HttpError(400, error)

    const name = body.name.trim()
    const email = body.email.trim().toLowerCase()
    const emailTaken = new HttpError(409, 'Já existe uma conta com este email.')

    if (findUserByEmail.get(email)) throw emailTaken

    const passwordHash = await hashPassword(body.password)
    const createdAt = new Date().toISOString()

    let id
    try {
      id = insertUser.run(name, email, passwordHash, createdAt).lastInsertRowid
    } catch (err) {
      // duas requisições ao mesmo tempo com o mesmo email
      if (String(err.message).includes('UNIQUE')) throw emailTaken
      throw err
    }

    sendJson(res, 201, {
      user: publicUser({ id: Number(id), name, email, created_at: createdAt }),
    })
  }

  async function login(req, res) {
    const ip = clientIp(req)
    const body = await readJson(req)

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password || email.length > 254 || password.length > 128) {
      throw new HttpError(400, 'Informe email e senha.')
    }

    const emailKey = `${ip}:${email}`
    const wait = Math.max(loginLimiter.retryAfterMs(emailKey), loginIpLimiter.retryAfterMs(ip))
    if (wait) throw tooManyRequests(wait)

    const row = findUserByEmail.get(email)
    let valid = false
    if (row) {
      valid = await verifyPassword(password, row.password_hash)
    } else {
      await spendVerificationTime(password)
    }

    if (!valid) {
      loginLimiter.fail(emailKey)
      loginIpLimiter.fail(ip)
      // Mesma mensagem para "email não existe" e "senha errada"
      throw new HttpError(401, 'Email ou senha incorretos.')
    }

    loginLimiter.reset(emailKey)
    deleteExpiredSessions.run(Date.now())

    const remember = body.remember === true
    const lifetime = remember ? SESSION_LONG_MS : SESSION_SHORT_MS
    const token = generateToken()
    insertSession.run(hashToken(token), row.id, Date.now() + lifetime)

    // Sem "Lembrar-me": cookie some quando o navegador fecha (e vale no máximo 1 dia no servidor).
    const cookie = cookieHeader(token, remember ? lifetime / 1000 : undefined)
    sendJson(res, 200, { user: publicUser(row) }, { 'Set-Cookie': cookie })
  }

  function logout(req, res) {
    const token = getSessionToken(req)
    if (token) deleteSession.run(hashToken(token))
    res.writeHead(204, { 'Set-Cookie': cookieHeader('', 0), 'Cache-Control': 'no-store' })
    res.end()
  }

  function me(req, res) {
    const user = requireUser(req)
    sendJson(res, 200, { user: publicUser(user) })
  }

  async function forgotPassword(req, res) {
    const ip = clientIp(req)
    const body = await readJson(req)

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || email.length > 254) throw new HttpError(400, 'Informe seu email.')

    // O limite vale para qualquer email, exista conta ou não. Assim ele não
    // revela nada, e ninguém consegue usar o app para lotar a caixa de alguém.
    const emailKey = `${ip}:${email}`
    const wait = Math.max(forgotLimiter.retryAfterMs(emailKey), forgotIpLimiter.retryAfterMs(ip))
    if (wait) throw tooManyRequests(wait)
    forgotLimiter.fail(emailKey)
    forgotIpLimiter.fail(ip)

    const user = findUserByEmail.get(email)
    if (user) {
      deleteExpiredResets.run(Date.now())
      deleteUserResets.run(user.id) // um pedido novo invalida o anterior

      const token = generateToken()
      insertReset.run(hashToken(token), user.id, Date.now() + RESET_TTL_MS)

      const link = `${appUrl}/auth/reset-password?token=${token}`
      const message = passwordResetMessage({ name: user.name, link })

      // Sem await de propósito: a resposta demora igual com ou sem conta.
      Promise.resolve()
        .then(() => mailer.send({ to: user.email, ...message }))
        .catch((err) => console.error('Falha ao enviar o email de redefinição:', err))
    }

    // Mesma resposta nos dois casos, para não revelar quem tem conta.
    sendJson(res, 200, { message: FORGOT_PASSWORD_REPLY })
  }

  async function resetPassword(req, res) {
    const ip = clientIp(req)
    const wait = resetLimiter.retryAfterMs(ip)
    if (wait) throw tooManyRequests(wait)

    const body = await readJson(req)
    const token = typeof body.token === 'string' ? body.token : ''
    const invalidLink = new HttpError(
      400,
      'Este link é inválido ou expirou. Peça um novo.',
      {},
      'invalid_reset_link',
    )

    const tokenHash = hashToken(token)
    const reset = token && token.length <= 200 ? findReset.get(tokenHash, Date.now()) : null
    if (!reset) {
      resetLimiter.fail(ip)
      throw invalidLink
    }

    // Senha fraca não gasta o link: a pessoa pode corrigir e tentar de novo.
    if (!isValidPassword(body.password)) {
      throw new HttpError(400, 'A senha deve ter de 8 a 128 caracteres.')
    }

    const passwordHash = await hashPassword(body.password)

    // Tudo ou nada: gasta o link, troca a senha e derruba as sessões abertas.
    // O link só é gasto se ainda estiver válido, então dois pedidos ao mesmo
    // tempo com o mesmo link não funcionam os dois.
    let changed = false
    db.exec('BEGIN')
    try {
      if (consumeReset.run(tokenHash, Date.now()).changes === 1) {
        updatePassword.run(passwordHash, reset.user_id)
        deleteUserResets.run(reset.user_id)
        deleteUserSessions.run(reset.user_id)
        changed = true
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    if (!changed) {
      resetLimiter.fail(ip)
      throw invalidLink
    }

    sendJson(res, 200, { message: 'Senha alterada com sucesso.' })
  }

  // Ao concluir um treino, o feedback pode refazer os próximos (3 seguidos fora do esperado)
  const swimming = createSwimmingRoutes({
    db, requireUser, onTrainingCompleted: (userId) => athlete.reformulateIfNeeded(userId),
  })
  const athlete = createAthleteRoutes({ db, requireUser, library: loadLibrary(), rules: loadRules() })

  // Rotas da API. Trechos como ":id" viram parâmetros (ex.: /api/tests/7).
  const routes = [
    ['POST', '/api/auth/register', register],
    ['POST', '/api/auth/login', login],
    ['POST', '/api/auth/logout', logout],
    ['GET', '/api/auth/me', me],
    ['POST', '/api/auth/forgot-password', forgotPassword],
    ['POST', '/api/auth/reset-password', resetPassword],
    ['GET', '/api/tests', swimming.getTests],
    ['POST', '/api/tests', swimming.createTest],
    ['DELETE', '/api/tests/:id', swimming.removeTest],
    ['GET', '/api/trainings', swimming.getTrainings],
    ['GET', '/api/trainings/upcoming', swimming.getUpcomingTrainings],
    ['POST', '/api/trainings/generate', athlete.generate],
    ['POST', '/api/trainings', swimming.createTraining],
    ['POST', '/api/trainings/:id/complete', swimming.completeTraining],
    ['GET', '/api/athlete-profile', athlete.getProfile],
    ['PUT', '/api/athlete-profile', athlete.saveProfile],
    ['GET', '/api/competitions', athlete.getCompetitions],
    ['POST', '/api/competitions', athlete.createCompetition],
    ['PATCH', '/api/competitions/:id', athlete.updateCompetitionPriority],
    ['GET', '/api/preparations/current', athlete.getCurrentPreparation],
    ['POST', '/api/preparations', athlete.createPreparation],
  ].map(([method, path, handler]) => {
    const names = []
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      names.push(name)
      return '([^/]+)'
    })
    return { method, regex: new RegExp(`^${pattern}$`), names, handler }
  })

  function findRoute(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue
      const match = route.regex.exec(pathname)
      if (!match) continue
      const params = Object.fromEntries(route.names.map((name, i) => [name, match[i + 1]]))
      return { handler: route.handler, params }
    }
    return null
  }

  const server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost')
      const route = findRoute(req.method, pathname)
      if (!route) throw new HttpError(404, 'Rota não encontrada.')
      await route.handler(req, res, route.params)
    } catch (err) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, code: err.code }, err.headers)
        return
      }
      console.error('Erro inesperado:', err)
      sendJson(res, 500, { error: 'Erro interno do servidor.' })
    }
  })

  return {
    server,
    async close() {
      registerLimiter.close()
      loginLimiter.close()
      loginIpLimiter.close()
      forgotLimiter.close()
      forgotIpLimiter.close()
      resetLimiter.close()
      await new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      })
      db.close()
    },
  }
}

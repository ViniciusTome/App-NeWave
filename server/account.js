// Conta do atleta (Perfil): os números de verdade (treinos realizados e sequência),
// os dados pessoais, a troca de senha, a mensagem para o suporte e a exclusão da conta.
import { HttpError, readJson, sendJson, tooManyRequests } from './http.js'
import { createRateLimiter, hashPassword, verifyPassword } from './security.js'

const DATA = /^\d{4}-\d{2}-\d{2}$/

// Nascimento: data válida, entre 1900 e 3 anos atrás. Vazio apaga.
function readBirthDate(value, today) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const valida = typeof value === 'string' && DATA.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  const limite = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`
  if (!valida || value < '1900-01-01' || value > limite) throw new HttpError(400, 'Informe uma data de nascimento válida.')
  return value
}

// Sequência sem falhar: do treino mais recente para trás (os que já passaram da data
// ou foram feitos), quantos seguidos foram feitos. Para na primeira falta ou no primeiro
// treino que passou sem resposta. O de hoje ainda não feito não quebra a sequência.
export function trainingStats(rows, today) {
  const realizados = rows.filter((t) => t.completed_at).length
  let sequencia = 0
  for (const t of [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))) {
    if (t.completed_at) sequencia++
    else if (t.date < today || t.missed_at) break
  }
  return { realizados, sequencia }
}

// `sessionTokenHash(req)`: o hash da sessão atual (ela continua aberta ao trocar a senha);
// `logoutCookie()`: o cookie que encerra a sessão (ao excluir a conta)
export function createAccountRoutes({ db, requireUser, mailer, supportEmail = null, sessionTokenHash, logoutCookie }) {
  const findUser = db.prepare('SELECT id, name, email, birth_date, created_at, password_hash, password_set, google_sub FROM users WHERE id = ?')
  const updateUser = db.prepare('UPDATE users SET name = ?, birth_date = ? WHERE id = ?')
  const updatePassword = db.prepare('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?')
  const deleteOtherSessions = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
  const deleteUser = db.prepare('DELETE FROM users WHERE id = ?')
  const listTrainings = db.prepare('SELECT id, date, completed_at, missed_at FROM trainings WHERE user_id = ?')
  const insertSupport = db.prepare('INSERT INTO support_messages (user_id, name, email, message, created_at) VALUES (?, ?, ?, ?, ?)')

  const passwordLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 })
  const supportLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 })

  const publicAccount = (row) => ({
    id: row.id, name: row.name, email: row.email,
    birthDate: row.birth_date ?? null, createdAt: row.created_at,
    // Quem entrou só pelo Google não tem senha no app (pode criar uma)
    hasPassword: row.password_set !== 0, google: Boolean(row.google_sub),
  })
  const readToday = (req) => {
    const today = new URL(req.url, 'http://localhost').searchParams.get('today')
    return today && DATA.test(today) ? today : new Date().toISOString().slice(0, 10)
  }

  // Confere a senha atual (com limite de tentativas)
  async function checkPassword(user, password, key) {
    const wait = passwordLimiter.retryAfterMs(key)
    if (wait) throw tooManyRequests(wait)
    const ok = typeof password === 'string' && password.length <= 128 && await verifyPassword(password, user.password_hash)
    if (!ok) {
      passwordLimiter.fail(key)
      throw new HttpError(400, 'Senha atual incorreta.')
    }
  }

  return {
    // GET /api/account?today=AAAA-MM-DD -> dados pessoais e os números do Perfil
    getAccount(req, res) {
      const user = requireUser(req)
      const row = findUser.get(user.id)
      sendJson(res, 200, {
        account: publicAccount(row),
        stats: trainingStats(listTrainings.all(user.id), readToday(req)),
        support: { emailConfigured: Boolean(supportEmail) },
      })
    },

    // PATCH /api/account { name?, birthDate? } (o telefone saiu: não é preciso)
    async updateAccount(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      const row = findUser.get(user.id)
      let name = row.name
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100) {
          throw new HttpError(400, 'Informe seu nome (de 2 a 100 caracteres).')
        }
        name = body.name.trim()
      }
      const birthDate = readBirthDate(body.birthDate, readToday(req))
      updateUser.run(name, birthDate === undefined ? row.birth_date : birthDate, user.id)
      sendJson(res, 200, { account: publicAccount(findUser.get(user.id)) })
    },

    // POST /api/account/password { currentPassword, newPassword } -> as outras sessões caem
    async changePassword(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      const row = findUser.get(user.id)
      // Conta só do Google: cria a senha sem pedir a atual (não existe)
      if (row.password_set !== 0) await checkPassword(row, body.currentPassword, `senha:${user.id}`)
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128) {
        throw new HttpError(400, 'A nova senha deve ter de 8 a 128 caracteres.')
      }
      updatePassword.run(await hashPassword(body.newPassword), user.id)
      deleteOtherSessions.run(user.id, sessionTokenHash(req) ?? '')
      sendJson(res, 200, { message: 'Senha alterada. As outras sessões abertas foram encerradas.' })
    },

    // POST /api/support { message } -> guarda a mensagem (e manda por email, se configurado)
    async sendSupport(req, res) {
      const user = requireUser(req)
      const key = `suporte:${user.id}`
      const wait = supportLimiter.retryAfterMs(key)
      if (wait) throw tooManyRequests(wait)
      const body = await readJson(req)
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (message.length < 5 || message.length > 2000) throw new HttpError(400, 'Escreva a sua mensagem (de 5 a 2000 caracteres).')
      supportLimiter.fail(key)
      const row = findUser.get(user.id)
      insertSupport.run(user.id, row.name, row.email, message, new Date().toISOString())
      if (supportEmail && mailer) {
        Promise.resolve()
          .then(() => mailer.send({
            to: supportEmail,
            subject: `Suporte NeWave: mensagem de ${row.name}`,
            text: `De: ${row.name} <${row.email}>\n\n${message}`,
          }))
          .catch((err) => console.error('Falha ao enviar a mensagem de suporte:', err))
      }
      sendJson(res, 201, { message: 'Mensagem enviada. Vamos responder no seu email.' })
    },

    // DELETE /api/account { password } -> apaga a conta e tudo dela (treinos, testes, provas...)
    async deleteAccount(req, res) {
      const user = requireUser(req)
      const body = await readJson(req)
      const row = findUser.get(user.id)
      // Conta só do Google (sem senha): confirma escrevendo EXCLUIR
      if (row.password_set === 0) {
        if (String(body.confirm ?? '').trim().toUpperCase() !== 'EXCLUIR') throw new HttpError(400, 'Escreva EXCLUIR para confirmar.')
      } else await checkPassword(row, body.password, `excluir:${user.id}`)
      deleteUser.run(user.id) // ON DELETE CASCADE: sessões, treinos, testes, perfil, provas
      res.writeHead(204, { 'Set-Cookie': logoutCookie(), 'Cache-Control': 'no-store' })
      res.end()
    },

    close() {
      passwordLimiter.close()
      supportLimiter.close()
    },
  }
}

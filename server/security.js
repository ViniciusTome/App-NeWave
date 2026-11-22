import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

// Senha: scrypt com salt aleatório. Formato salvo: scrypt$<salt>$<hash>
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

// Quando o email não existe, ainda gastamos o mesmo tempo de uma verificação
// real. Assim ninguém descobre quais emails têm conta medindo a resposta.
let dummyHash = null
export async function spendVerificationTime(password) {
  if (!dummyHash) dummyHash = await hashPassword('senha-falsa-para-igualar-o-tempo')
  await verifyPassword(password, dummyHash)
}

// Token da sessão: 32 bytes aleatórios. O que vai pro banco é o hash dele.
export const generateToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

// Limite de tentativas em memória (zera se o servidor reiniciar).
export function createRateLimiter({ max, windowMs }) {
  const entries = new Map()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key)
    }
  }, windowMs)
  cleanup.unref()

  return {
    // Quantos ms faltam para liberar a chave (0 = pode tentar).
    retryAfterMs(key) {
      const entry = entries.get(key)
      const now = Date.now()
      if (!entry || entry.resetAt <= now || entry.count < max) return 0
      return entry.resetAt - now
    },
    fail(key) {
      const now = Date.now()
      const entry = entries.get(key)
      if (!entry || entry.resetAt <= now) {
        entries.set(key, { count: 1, resetAt: now + windowMs })
      } else {
        entry.count += 1
      }
    },
    reset(key) {
      entries.delete(key)
    },
    close() {
      clearInterval(cleanup)
    },
  }
}

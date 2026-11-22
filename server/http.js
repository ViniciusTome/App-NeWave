// Funções HTTP comuns, usadas por todas as rotas da API.

const MAX_BODY_BYTES = 10_000

export class HttpError extends Error {
  // `code` é opcional: um nome fixo para o front-end saber o que aconteceu
  // sem depender do texto da mensagem.
  constructor(status, message, headers = {}, code) {
    super(message)
    this.status = status
    this.headers = headers
    this.code = code
  }
}

export const tooManyRequests = (waitMs) =>
  new HttpError(429, 'Muitas tentativas. Aguarde um pouco e tente de novo.', {
    'Retry-After': String(Math.ceil(waitMs / 1000)),
  })

export function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(data === null ? undefined : JSON.stringify(data))
}

export function readJson(req) {
  const type = (req.headers['content-type'] ?? '').toLowerCase()
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Envie os dados em formato JSON.')
  }

  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooBig = false

    req.on('data', (chunk) => {
      if (tooBig) return // continua lendo (e descartando) para o cliente receber a resposta
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooBig = true
        reject(new HttpError(413, 'Requisição grande demais.', { Connection: 'close' }))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (tooBig) return
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('não é um objeto')
        }
        resolve(parsed)
      } catch {
        reject(new HttpError(400, 'JSON inválido.'))
      }
    })

    req.on('error', reject)
  })
}

export function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim()
  }
  return cookies
}

export const clientIp = (req) => req.socket.remoteAddress ?? 'desconhecido'

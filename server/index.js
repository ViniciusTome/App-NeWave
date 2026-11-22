// Ponto de entrada do backend: `npm run server`
import { fileURLToPath } from 'node:url'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `O backend precisa do Node 22.13 ou mais novo (você está com ${process.versions.node}).`,
  )
  process.exit(1)
}

const { createApp } = await import('./app.js')
const { createConsoleMailer } = await import('./mailer.js')
const { loadLibrary } = await import('./series/index.js')

// Confere a biblioteca de séries (server/series/*.json) antes de subir:
// se alguém digitou algo errado, o terminal mostra qual série e qual campo.
try {
  const library = loadLibrary()
  const counts = Object.entries(library)
    .filter(([, series]) => series.length > 0)
    .map(([part, series]) => `${series.length} de ${part}`)
  console.log(`Biblioteca de séries: ${counts.join(', ') || 'vazia'}.`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1' // só aceita conexões da sua própria máquina
const dbPath =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL('./data/newave.db', import.meta.url))

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction) {
  console.warn('Atenção: ainda não há provedor de email configurado, então "Esqueci a senha" não envia mensagens.')
}

const app = createApp({
  dbPath,
  secureCookies: isProduction,
  // Endereço do front-end, usado no link enviado por email
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  // Em desenvolvimento, o "email" aparece no terminal do servidor
  mailer: createConsoleMailer({ showContent: !isProduction }),
})

app.server.listen(port, host, () => {
  console.log(`API do NeWave rodando em http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}

// Service worker do NeWave (app para celular). Mudar o CACHE a cada versão nova:
// assim o celular que já tem o app instalado baixa a versão nova.
// - As chamadas da API (/api/...) vão sempre para a internet: treinos e tempos
//   precisam estar atualizados.
// - O resto do app (telas, estilos, ícones) fica guardado no aparelho e abre mais
//   rápido; sem internet, abre a última versão guardada.
const CACHE = 'newave-v0.4.4'

// Na instalação já guarda a tela e os arquivos que ela usa (os /assets/ do build)
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])
    const html = await (await cache.match('/')).text()
    const arquivos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await cache.addAll(arquivos)
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Telas: primeiro a internet (versão nova); sem internet, a guardada
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copia))
          return resposta
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Arquivos do app (têm o nome com o código da versão): guardados depois da 1ª vez
  event.respondWith(
    // ignoreVary: o script do app vem com o cabeçalho Origin (módulo), o guardado não
    caches.match(request, { ignoreVary: true }).then((guardado) => guardado ?? fetch(request).then((resposta) => {
      if (resposta.ok) {
        const copia = resposta.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copia))
      }
      return resposta
    })),
  )
})

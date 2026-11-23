// Entrar com o Google: confere o "ID token" que o botão do Google entrega ao navegador.
// O token é um JWT assinado pelo Google (RS256). Conferimos a assinatura com as chaves
// públicas do Google, para quem foi emitido (o nosso client ID), quem emitiu, a validade
// e se o email foi verificado. Sem bibliotecas: só node:crypto e fetch.
import { createPublicKey, verify } from 'node:crypto'

const CHAVES_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const EMISSORES = new Set(['accounts.google.com', 'https://accounts.google.com'])

const base64url = (texto) => Buffer.from(texto, 'base64url')

// Chaves públicas do Google, guardadas pelo tempo que o Google manda (Cache-Control)
export function createGoogleKeys({ fetchImpl = fetch } = {}) {
    let cache = { chaves: null, ate: 0 }
    return async function chave(kid) {
        if (!cache.chaves || Date.now() >= cache.ate || !cache.chaves.has(kid)) {
            const resposta = await fetchImpl(CHAVES_URL)
            if (!resposta.ok) throw new Error(`Chaves do Google: HTTP ${resposta.status}`)
            const { keys } = await resposta.json()
            const maxAge = Number(/max-age=(\d+)/.exec(resposta.headers.get('cache-control') ?? '')?.[1] ?? 3600)
            cache = { chaves: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])), ate: Date.now() + maxAge * 1000 }
        }
        return cache.chaves.get(kid) ?? null
    }
}

// Devolve { sub, email, name } se o token é válido; senão, null
export function createGoogleVerifier({ clientId, chave = createGoogleKeys(), agora = () => Date.now() }) {
    return async function verificar(token) {
        if (!clientId || typeof token !== 'string' || token.length > 4096) return null
        const partes = token.split('.')
        if (partes.length !== 3) return null
        let cabecalho
        let dados
        try {
            cabecalho = JSON.parse(base64url(partes[0]).toString('utf8'))
            dados = JSON.parse(base64url(partes[1]).toString('utf8'))
        } catch {
            return null
        }
        if (cabecalho.alg !== 'RS256' || !cabecalho.kid) return null
        const publica = await chave(cabecalho.kid)
        if (!publica) return null
        const assinaturaOk = verify('RSA-SHA256', Buffer.from(`${partes[0]}.${partes[1]}`), publica, base64url(partes[2]))
        if (!assinaturaOk) return null
        const segundos = agora() / 1000
        const valido = EMISSORES.has(dados.iss) && dados.aud === clientId && Number(dados.exp) > segundos &&
            (dados.iat === undefined || Number(dados.iat) <= segundos + 300) &&
            (dados.email_verified === true || dados.email_verified === 'true') && typeof dados.email === 'string' && dados.sub
        if (!valido) return null
        return { sub: String(dados.sub), email: dados.email.toLowerCase(), name: (dados.name ?? dados.email.split('@')[0]).trim() }
    }
}

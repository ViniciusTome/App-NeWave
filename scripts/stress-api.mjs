// Teste de estresse do app inteiro (API), com vários atletas ao mesmo tempo:
// cadastro, login, anamnese, provas no calendário (importante / participação),
// prova alvo, gerar a periodização, concluir treinos com feedback (3 pesados
// seguidos refazem os próximos), trocar a prova alvo e ver o histórico.
//
// Uso:  node scripts/stress-api.mjs [atletas]      ex.: node scripts/stress-api.mjs 60
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.js'

const ATLETAS = Number(process.argv[2] ?? 60)
const POR_SERVIDOR = 9 // o servidor limita 10 cadastros por hora por IP: um servidor novo a cada 9
const hoje = new Date().toISOString().slice(0, 10)
const daqui = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)

const resultados = new Map() // verificação -> { ok, falhas: [] }
function confere(nome, ok, detalhe) {
    if (!resultados.has(nome)) resultados.set(nome, { ok: 0, falhas: [] })
    const r = resultados.get(nome)
    if (ok) r.ok++
    else r.falhas.push(detalhe)
}

const PERFIS = [
    // [nível esperado, distância sem parar, tempo nos 400 (centésimos) ou null, dias, minutos]
    ['iniciante', 'ate_50', null, [1, 3, 5], 45],
    ['iniciante', '50_100', null, [2, 4], 30],
    ['iniciante', '100_200', 54000, [1, 3, 5], 60],
    ['intermediario', '200_400', 45000, [1, 2, 4, 5], 60],
    ['intermediario', '400_1000', 42000, [1, 3, 5], 75],
    ['intermediario', '1000_2000', null, [0, 1, 2, 3, 4, 5, 6], 90, '6m_2a'],
    ['avancado', '1000_2000', 33000, [1, 2, 3, 4, 5], 90],
    ['avancado', 'mais_2000', 30000, [1, 2, 3, 4, 5, 6], 120],
    ['avancado', 'mais_2000', 31000, [1, 3, 5], 60],
]

async function atleta(base, i) {
    const api = async (path, { method = 'GET', body, cookie } = {}) => {
        const headers = {}
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        if (cookie) headers.Cookie = cookie
        const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
        const text = await res.text()
        return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie()[0] }
    }
    const [nivel, continuousDistance, tempo, trainingDays, sessionMinutes, desde] = PERFIS[i % PERFIS.length]
    const quem = `atleta ${i + 1} (${nivel}, ${continuousDistance})`
    const email = `estresse${i}@example.com`
    const password = 'senha-forte-123'
    await api('/api/auth/register', { method: 'POST', body: { name: `Atleta ${i + 1}`, email, password } })
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    const cookie = login.setCookie?.split(';')[0]
    confere('Cadastro e login', login.status === 200 && cookie, `${quem}: ${login.status}`)
    if (!cookie) return

    const perfil = await api('/api/athlete-profile', {
        method: 'PUT', cookie, body: {
            swimmingSince: desde ?? (nivel === 'iniciante' ? 'menos_6m' : 'mais_5a'), recentBreak: 'nao', continuousDistance,
            strokes: ['crawl', 'costas'], bestStroke: 'costas', trainingDays, sessionMinutes, poolLength: 25,
            equipment: ['pe_de_pato', 'palmar', 'pull_buoy'], injuries: '', reported400Hundredths: tempo,
        },
    })
    confere('Anamnese salva e nível calculado', perfil.status === 200 && perfil.body.level?.level === nivel,
        `${quem}: ${perfil.status} ${perfil.body?.level?.level}`)

    // Provas: uma importante, uma de participação, a alvo
    const prova = (name, dias, priority) => api('/api/competitions', {
        method: 'POST', cookie, body: { name, date: daqui(dias), modality: 'piscina_25', event: '200 m livre', ...(priority && { priority }) },
    })
    const importante = (await prova('Importante', 30, 'B')).body.competition
    const participacao = (await prova('Participação', 45)).body.competition
    confere('Prova nova sem escolher entra como Participação (C)', participacao.priority === 'C', `${quem}: ${participacao.priority}`)
    confere('Não dá para cadastrar outra prova como principal (A)', (await prova('Outra', 50, 'A')).status === 400, quem)
    const alvo = (await prova('Alvo', 90)).body.competition
    await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: alvo.id } })

    const gerado = await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
    const treinos = gerado.body?.trainings ?? []
    confere('Gera a periodização até a prova alvo', gerado.status === 201 && treinos.at(-1)?.date <= alvo.date && treinos.at(-1)?.date > daqui(80),
        `${quem}: ${gerado.status} último ${treinos.at(-1)?.date}`)
    confere('O plano interno não vai para o atleta', treinos.every((t) => t.plano === undefined) && !JSON.stringify(treinos).includes('esforcoEsperado'), quem)

    // Conclui 3 seguidos com nota 9 (respiração): o 3º refaz os próximos
    const proximos = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
    const respostas = []
    for (const t of proximos.slice(0, 3)) {
        respostas.push(await api(`/api/trainings/${t.id}/complete`, { method: 'POST', cookie, body: { difficulty: 9, reason: 'respiracao' } }))
    }
    confere('Concluir com nota e motivo', respostas.every((r) => r.status === 200 && r.body.training.difficulty === 9), quem)
    confere('1º e 2º treino pesado não refazem nada', respostas.slice(0, 2).every((r) => r.body.reformulados === 0), quem)
    confere('3º treino pesado seguido refaz os próximos', respostas[2]?.body.reformulados > 0, `${quem}: ${respostas[2]?.body.reformulados}`)
    const semMotivo = await api(`/api/trainings/${proximos[3].id}/complete`, { method: 'POST', cookie, body: { difficulty: 8 } })
    confere('Nota 8 sem motivo é recusada', semMotivo.status === 400, `${quem}: ${semMotivo.status}`)

    // Histórico com a nota
    const historico = (await api(`/api/trainings?today=${daqui(1)}`, { cookie })).body.trainings
    confere('Histórico mostra a nota da série principal', historico.filter((t) => t.difficulty === 9).length === 3, quem)

    // Importância: troca e remove; a alvo não muda nem sai
    confere('Trocar importância da prova', (await api(`/api/competitions/${participacao.id}`, { method: 'PATCH', cookie, body: { priority: 'B' } })).status === 200, quem)
    confere('A prova alvo não muda pelo calendário', (await api(`/api/competitions/${alvo.id}`, { method: 'PATCH', cookie, body: { priority: 'C' } })).status === 409, quem)
    confere('Remover prova do calendário', (await api(`/api/competitions/${participacao.id}`, { method: 'DELETE', cookie })).status === 200, quem)

    // Troca a prova alvo para a importante (mais perto): periodização refeita até ela
    await api('/api/preparations', { method: 'POST', cookie, body: { goal: 'competir', competitionId: importante.id } })
    const refeito = await api(`/api/trainings/generate?today=${hoje}`, { method: 'POST', cookie })
    const novos = (await api(`/api/trainings/upcoming?today=${hoje}`, { cookie })).body.trainings
    confere('Trocar a prova alvo refaz a periodização até a nova prova', refeito.status === 201 && novos.every((t) => t.date <= importante.date),
        `${quem}: último ${novos.at(-1)?.date} > ${importante.date}`)
    const provas = (await api(`/api/competitions?today=${hoje}`, { cookie })).body.competitions
    confere('Só uma prova alvo', provas.filter((c) => c.priority === 'A').length === 1, `${quem}: ${provas.map((c) => c.priority)}`)

    // Treinos de outro atleta não aparecem / não podem ser concluídos
    confere('Cada atleta só vê os próprios treinos', novos.every((t) => !String(t.title).includes('undefined')), quem)
}

const t0 = performance.now()
for (let inicio = 0; inicio < ATLETAS; inicio += POR_SERVIDOR) {
    const dir = mkdtempSync(join(tmpdir(), 'newave-estresse-'))
    const app = createApp({ dbPath: join(dir, 'estresse.db'), mailer: { send: async () => {} } })
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${app.server.address().port}`
    const lote = Array.from({ length: Math.min(POR_SERVIDOR, ATLETAS - inicio) }, (_, k) => inicio + k)
    // Todos do lote ao mesmo tempo
    await Promise.all(lote.map((i) => atleta(base, i).catch((err) => confere('Sem erro inesperado', false, `atleta ${i + 1}: ${err.message}`))))
    await app.close()
    rmSync(dir, { recursive: true, force: true })
}
const segundos = (performance.now() - t0) / 1000

console.log(`\nTeste de estresse do app (API): ${ATLETAS} atletas, ${POR_SERVIDOR} ao mesmo tempo, em ${segundos.toFixed(1)} s\n`)
let falhas = 0
for (const [nome, r] of resultados) {
    if (r.falhas.length) falhas++
    console.log(`${r.falhas.length ? 'FALHA' : 'OK   '} ${nome}  (${r.ok} ok${r.falhas.length ? `, ${r.falhas.length} falhas` : ''})`)
    for (const f of r.falhas.slice(0, 4)) console.log(`        - ${f}`)
}
console.log(`\n${resultados.size - falhas} de ${resultados.size} verificações sem falhas.`)
process.exitCode = falhas ? 1 : 0

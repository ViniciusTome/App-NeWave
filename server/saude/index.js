// Treino de saúde/emagrecimento. Fica separado do gerador (como o Específico): nos dias de
// saúde, a série principal sai daqui (biblioteca por nível: extensivo, intensivo, fartlek,
// por tempo...), a velocidade quase nunca entra (5%) e não há fases. O condicionamento e o
// Geral continuam como antes.
import { readFileSync } from 'node:fs'

const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'))
const NIVEIS = ['iniciante', 'intermediario', 'avancado']
const TIPOS = ['extensivo', 'intensivo', 'fartlek', 'tempo', 'misto', 'perna', 'material']
const RITMOS = ['A1', 'A2', 'A3', 'A1/A2', 'A1/A3', 'progressivo']
const MATERIAL = { pe_de_pato: 'c/PÉ', palmar: 'c/PALM', pull_buoy: 'c/BOIA' }

export function validarSaude({ series }) {
    const problemas = []
    const ids = new Set()
    for (const s of series) {
        const onde = `série "${s.id}"`
        if (!s.id || ids.has(s.id)) problemas.push(`${onde}: id vazio ou repetido.`)
        ids.add(s.id)
        if (!s.niveis?.length || s.niveis.some((n) => !NIVEIS.includes(n))) problemas.push(`${onde}: níveis: ${NIVEIS.join(', ')}.`)
        if (!TIPOS.includes(s.tipo)) problemas.push(`${onde}: tipo: ${TIPOS.join(', ')}.`)
        for (const b of s.blocos ?? []) {
            if (!(b.rep >= 1) || !(b.dist > 0 || b.tempo > 0) || !RITMOS.includes(b.ritmo) || !(b.descanso >= 0)) {
                problemas.push(`${onde}: bloco inválido (rep, dist ou tempo, ritmo ${RITMOS.join('/')}, descanso).`)
            }
        }
        if (!s.blocos?.length) problemas.push(`${onde}: sem blocos.`)
    }
    return problemas
}

export function loadSaude() {
    const saude = { regras: ler('./regras.json'), series: ler('./series.json') }
    const problemas = validarSaude(saude)
    if (problemas.length > 0) throw new Error(`Treino de saúde com problemas:\n- ${problemas.join('\n- ')}`)
    return saude
}

const pausa = (s) => (s >= 60 ? (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`) : `${s}"`)

// Segundos de nado de uma repetição (distância pelo ritmo do teste; por tempo, o próprio tempo)
function segundosDaRep(b, regras, pace) {
    if (b.tempo) return b.tempo
    const ritmo = regras.ritmo[b.nado] ?? regras.ritmo[b.ritmo.split('/').at(-1)] ?? 1.15
    return (b.dist / 100) * pace * ritmo
}
// Metros de uma repetição por tempo: o que dá para nadar no ritmo
const metrosDaRep = (b, regras, pace) => (b.dist ?? Math.round((b.tempo / (pace * (regras.ritmo.A1 ?? 1.25))) * 100 / 25) * 25)

// (o descanso depois da última repetição da série não conta: ela acaba ali)
export const segundosDaSerie = (s, regras, pace) => (s.vezes ?? 1) * s.blocos.reduce((t, b) => t + b.rep * (segundosDaRep(b, regras, pace) + b.descanso), 0) +
    ((s.vezes ?? 1) - 1) * (s.intervalo ?? 0) - (s.blocos.at(-1)?.descanso ?? 0)
export const metrosDaSerie = (s, regras, pace) => (s.vezes ?? 1) * s.blocos.reduce((t, b) => t + b.rep * metrosDaRep(b, regras, pace), 0)

// "8 x 25 m · A1 · CR · D30" de descanso"; por tempo: "3 x 3' (nade o máximo...) · A2 · CR · D30" de descanso"
function linha(b, ultimaSozinha = false) {
    const quanto = b.dist ? `${b.rep} x ${b.dist} m` : `${b.rep} x ${pausa(b.tempo)}`
    const nado = b.nado === 'perna' ? ' perna' : b.nado === 'braco' ? ' braçada' : ''
    const nota = b.nota ? ` (${b.nota})` : ''
    const material = b.material ? ` · ${MATERIAL[b.material] ?? b.material}` : ''
    const estilo = b.nado === 'perna' ? 'PR · CR' : b.nado === 'braco' ? 'BR · CR' : 'CR'
    // (1 repetição no fim da série: não tem descanso depois)
    const descanso = ultimaSozinha ? '' : ` · D${pausa(b.descanso)} de descanso`
    return `${quanto}${nado}${nota}${material} · ${b.ritmo} · ${estilo}${descanso}`
}
export function textoDaSerie(s) {
    const linhas = s.blocos.map((b, i) => linha(b, (s.vezes ?? 1) === 1 && i === s.blocos.length - 1 && b.rep === 1))
    if ((s.vezes ?? 1) === 1) return linhas.join('\n')
    const intervalo = `c/${pausa(s.intervalo ?? 60)} de intervalo`
    return linhas.length === 1 ? `(${s.vezes}x) ${linhas[0]} · ${intervalo}` : `(${s.vezes}x) ${intervalo}\n${linhas.join('\n')}`
}

// A série tem perna? (perna inteira ou misturada com o nado, ex.: "100 nado + 50 perna")
export const temPerna = (s) => s.blocos.some((b) => b.nado === 'perna' || /perna/.test(b.nota ?? ''))

const INTENSIDADE = { A1: 'A1', A2: 'A2', A3: 'A3', 'A1/A2': 'A2', 'A1/A3': 'A3', progressivo: 'A3' }
const intensidadeDaSerie = (s) => s.blocos.map((b) => INTENSIDADE[b.ritmo]).sort().at(-1)

// Troca o treino do dia (montado pelo Geral) pelo de saúde: tira a velocidade (e o solto
// depois dela) em 95% dos treinos e coloca a série de saúde do nível no lugar da principal,
// com o tempo que sobrou. Devolve as partes novas.
export function aplicarSaude({ saude, partes, athlete, pace, random = Math.random, recentes = null, segundosPorTroca = 0, fator = 1 }) {
    const { regras, series } = saude
    if (partes.some((p) => p.parte === 'teste')) return partes
    const posicao = partes.findIndex((p) => p.parte === 'principal')
    if (posicao < 0) return partes
    const nivel = athlete.level ?? 'iniciante'
    const material = new Set(athlete.equipment ?? [])
    const candidatas = series.filter((s) => s.niveis.includes(nivel) &&
        s.blocos.every((b) => !b.material || material.has(b.material)))
    // Velocidade: só em 5% dos treinos de saúde (sai junto o solto que vem depois dela)
    const tirar = new Set(partes.map((p, i) => (p.parte === 'principal' ? i : -1)).filter((i) => i >= 0))
    const iVel = partes.findIndex((p) => p.parte === 'velocidade')
    const tirarVelocidade = () => {
        tirar.add(iVel)
        if (partes[iVel + 1]?.parte === 'solto') tirar.add(iVel + 1)
    }
    if (iVel >= 0 && random() >= regras.chanceDeVelocidade) tirarVelocidade()
    // O tempo da principal: o das partes que saem (e as trocas que deixam de existir)
    // (`fator`: o volume da saúde, que começa um pouco abaixo e sobe a cada treino de saúde)
    // (e nunca mais que o que sobra da aula: o tempo das outras partes e das trocas, que o
    // app conta em minutos inteiros)
    const tempoDaPrincipal = () => {
        const ficam = partes.filter((_, i) => !tirar.has(i))
        const trocas = Math.round((ficam.filter((p) => p.parte !== 'hidratacao').length * segundosPorTroca) / 60) * 60
        const daAula = athlete.sessionMinutes ? athlete.sessionMinutes * 60 - ficam.reduce((t, p) => t + p.minutos * 60, 0) - trocas : Infinity
        return Math.min(daAula, [...tirar].reduce((t, i) => t + partes[i].minutos * 60, 0) + (tirar.size - 1) * segundosPorTroca) * Math.min(fator, 1)
    }
    let tempo = tempoDaPrincipal()
    // Aula curta em que nenhuma série cabe com a velocidade: a velocidade sai
    const maisCurta = Math.min(...candidatas.map((s) => segundosDaSerie(s, regras, pace)))
    if (iVel >= 0 && !tirar.has(iVel) && maisCurta > tempo + 60) {
        tirarVelocidade()
        tempo = tempoDaPrincipal()
    }
    if (candidatas.length === 0) return partes
    // Uma série perto do tempo (passar é pior que ficar um pouco abaixo), sem repetir as
    // séries e os tipos dos últimos treinos. Sobrou tempo: uma 2ª série, de outro tipo.
    const escolher = (alvo, fora, folga) => {
        const distancia = (s) => {
            const seg = segundosDaSerie(s, regras, pace)
            return (seg > alvo ? 1.5 : 1) * Math.abs(seg - alvo) +
                600 * (recentes?.vezes(`saude:${s.id}`) ?? 0) + 120 * (recentes?.vezes(`saude-tipo:${s.tipo}`) ?? 0)
        }
        // (a 2ª série nunca tem perna: o treino já tem a parte de perna ou a 1ª série já teve)
        const livres = candidatas.filter((s) => !fora.some((f) => f.id === s.id || f.tipo === s.tipo) && (fora.length === 0 || !temPerna(s)))
        // (as que passam do tempo além da folga só entram se nenhuma couber)
        const cabem = livres.filter((s) => segundosDaSerie(s, regras, pace) <= alvo + folga)
        if (cabem.length === 0 && fora.length === 0 && livres.length > 0) {
            // Nenhuma cabe (aula curta): a mais curta
            return [...livres].sort((x, y) => segundosDaSerie(x, regras, pace) - segundosDaSerie(y, regras, pace))[0]
        }
        const ordenadas = [...cabem].sort((x, y) => distancia(x) - distancia(y))
        if (ordenadas.length === 0) return null
        const limite = distancia(ordenadas[0]) + Math.max(60, alvo * 0.15)
        const melhores = ordenadas.filter((s) => distancia(s) <= limite).slice(0, 4)
        return melhores[Math.floor(random() * melhores.length)]
    }
    const escolhidas = [escolher(tempo, [], 60)]
    // Série principal com perna: a parte de perna do treino sai (não faz sentido perna e depois
    // mais perna) e o tempo dela vai para a série principal
    const iPerna = partes.findIndex((p) => p.parte === 'perna')
    if (iPerna >= 0 && temPerna(escolhidas[0])) {
        tirar.add(iPerna)
        tempo = tempoDaPrincipal()
    }
    const sobra = tempo - segundosDaSerie(escolhidas[0], regras, pace) - segundosPorTroca
    if (sobra >= (regras.segundaSerieAPartirDe ?? 300)) {
        const segunda = escolher(sobra, escolhidas, 0)
        if (segunda) escolhidas.push(segunda)
    }
    const novas = escolhidas.map((escolhida, k) => {
        recentes?.add(`saude:${escolhida.id}`)
        recentes?.add(`saude-tipo:${escolhida.tipo}`)
        const segundos = segundosDaSerie(escolhida, regras, pace)
        return {
            parte: 'principal',
            titulo: k === 0 ? 'Série principal' : '2ª série principal',
            serieId: escolhida.id,
            serieTexto: escolhida.id,
            texto: textoDaSerie(escolhida),
            nado: 'crawl',
            material: [...new Set(escolhida.blocos.map((b) => b.material).filter(Boolean))],
            observacao: regras.explicacao[escolhida.tipo],
            metros: metrosDaSerie(escolhida, regras, pace),
            minutos: Math.round(segundos / 60),
            intensidades: { tipo: 'saude', unidade: 'serie_toda', valores: [intensidadeDaSerie(escolhida)] },
            saude: escolhida.tipo,
        }
    })
    const resto = partes.map((p, i) => (tirar.has(i) ? null : [p]))
    resto[posicao] = novas
    let final = resto.filter(Boolean).flat()
    // Passou do tempo da aula (aula curta): sai o solto do meio e depois a perna, como no Geral
    const total = (lista) => lista.reduce((t, p) => t + p.minutos, 0) + Math.round((Math.max(0, lista.filter((p) => p.parte !== 'hidratacao').length - 1) * segundosPorTroca) / 60)
    for (const parte of ['solto', 'perna']) {
        if (!athlete.sessionMinutes || total(final) <= athlete.sessionMinutes + 1) break
        const i = final.findIndex((p, k) => p.parte === parte && k < final.length - 1)
        if (i >= 0) final = final.filter((_, k) => k !== i)
    }
    return final
}

// Relógio de saída: lê o texto de uma série do treino (como o servidor escreve) e monta a
// sequência de repetições com a saída (a/c) ou o descanso (D) de cada uma.
// Ex.: "(3x) 4 x 50 m · RP 37"5 · CO · D45" de descanso · c/4'30" de intervalo"
//   -> 3 séries de 4 x 50, descanso de 45" e 4'30" de intervalo entre as séries.

// 1'10" -> 70; 45" -> 45; 2' -> 120
export function tempoEmSegundos(texto) {
    const m = /^(?:(\d+)')?(?:(\d+)")?$/.exec(texto.trim())
    if (!m || (!m[1] && !m[2])) return null
    return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
}

const TEMPO = `(\\d+'(?:\\d+")?|\\d+")`
const RE_SAIDA = new RegExp(`a/c ${TEMPO}`)
const RE_DESCANSO = new RegExp(`D${TEMPO}(?: a \\d+["'])? de descanso`)
const RE_INTERVALO = new RegExp(`c/${TEMPO}(?: a \\d+')? de intervalo`)
const RE_BLOCO = /^(?:\(\d+x\) )?(\d+) [x×] (\d+) m/

// Saída (a/c) ou descanso (D) escrito numa linha: { modo, segundos } ou null
function tempoDaLinha(linha) {
    const saida = RE_SAIDA.exec(linha)
    if (saida) return { modo: 'saida', segundos: tempoEmSegundos(saida[1]) }
    const descanso = RE_DESCANSO.exec(linha)
    if (descanso) return { modo: 'descanso', segundos: tempoEmSegundos(descanso[1]) }
    return null
}

// Monta a série: { series, intervalo, reps: [{ serie, numero, total, distancia, modo, segundos }] }
// ou null quando o texto não tem saída nem descanso (ex.: "400 m solto").
export function planoDaSerie(texto) {
    if (!texto) return null
    const linhas = texto.split('\n')
    const series = Number(/^\((\d+)x\)/.exec(linhas[0])?.[1] ?? 1)
    const intervalo = tempoEmSegundos(RE_INTERVALO.exec(texto)?.[1] ?? '') ?? 0
    const blocos = linhas
        .map((l) => ({ m: RE_BLOCO.exec(l), tempo: tempoDaLinha(l) }))
        .filter((b) => b.m)
        .map((b) => ({ repeticoes: Number(b.m[1]), distancia: Number(b.m[2]), tempo: b.tempo }))
    if (blocos.length === 0) return null
    // "1ª série: ... a/c 1'05"" (o tempo de cada série, quando muda de uma para a outra)
    const daSerie = linhas.filter((l) => /^\d+ª série:/.test(l)).map(tempoDaLinha)
    const qualquer = linhas.map(tempoDaLinha).find(Boolean)
    if (!qualquer) return null
    const reps = []
    for (let s = 1; s <= series; s++) {
        const doBloco = blocos.flatMap((b) => Array.from({ length: b.repeticoes }, () => b))
        doBloco.forEach((b, i) => {
            const tempo = b.tempo ?? daSerie[s - 1] ?? qualquer
            reps.push({ serie: s, numero: i + 1, total: doBloco.length, distancia: b.distancia, modo: tempo.modo, segundos: tempo.segundos })
        })
    }
    return { series, intervalo, reps }
}

// Segundos -> 1:05 / 0:45 (o relógio grande)
export const relogio = (segundos) => {
    const s = Math.max(0, Math.ceil(segundos))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Centésimos -> 5:32.45 (o cronômetro)
export const cronometro = (centesimos) => {
    const c = Math.max(0, Math.floor(centesimos))
    const min = Math.floor(c / 6000)
    const seg = Math.floor((c % 6000) / 100)
    return `${min}:${String(seg).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`
}

// Biblioteca de séries: um arquivo JSON para cada parte do treino.
// O gerador combina uma série de cada parte, então não existem treinos prontos.
//
// Cada série guarda só o que o treinador precisa escrever. O resto
// (metragem, distância sem parar, estilos exigidos, piscinas em que funciona)
// é calculado aqui. O guia de como cadastrar está em server/series/LEIAME.md.
import { readFileSync, existsSync } from 'node:fs'

// Partes do treino, na ordem em que são nadadas. Os arquivos que ainda não
// existem são ignorados (por enquanto só o aquecimento está pronto).
export const PARTS = ['aquecimento', 'velocidade', 'principal', 'soltura']

// "livre": o atleta escolhe (normalmente crawl).
// "estilo": um estilo que não seja o crawl (o que o atleta nada melhor).
// "medley": cada volta num estilo, na ordem borboleta, costas, peito, crawl.
export const NADOS = ['livre', 'crawl', 'costas', 'peito', 'borboleta', 'estilo', 'medley']
export const INTENSIDADES = ['A1', 'A2', 'A3']
export const USOS = ['treino', 'teste']
export const MATERIAIS = ['pe_de_pato', 'palmar', 'prancha', 'pull_buoy', 'snorkel']
export const PISCINAS = [25, 50]

const MEDLEY = ['borboleta', 'costas', 'peito', 'crawl']
const SERIE_KEYS = ['id', 'texto', 'blocos', 'usos', 'porSensacao', 'duracaoMinutos']
const BLOCO_KEYS = ['repeticoes', 'distancia', 'nado', 'intensidade', 'descanso', 'material']

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

// ---------- Cálculos a partir dos blocos ----------

// Em quais piscinas a série funciona. A distância de cada repetição precisa
// fechar em piscinas inteiras; "ida X, volta Y" precisa de idas e voltas em
// pares; "volta medley" precisa de voltas suficientes para fechar o medley
// (múltiplo de 4: borboleta, costas, peito, crawl).
function poolsFor(blocos) {
    return PISCINAS.filter((pool) =>
        blocos.every((bloco) => {
            if (bloco.distancia % pool !== 0) return false
            const piscinas = bloco.distancia / pool
            if (!Array.isArray(bloco.nado)) return true
            if (piscinas % 2 !== 0) return false
            const voltas = piscinas / 2
            if (bloco.nado.includes('medley') && voltas % MEDLEY.length !== 0) return false
            return true
        }),
    )
}

// Estilos que o atleta precisa saber nadar para fazer a série
function requiredStrokes(blocos) {
    const strokes = new Set()
    let outroEstilo = false
    for (const bloco of blocos) {
        for (const nado of [bloco.nado].flat()) {
            if (nado === 'medley') MEDLEY.forEach((s) => strokes.add(s))
            else if (nado === 'estilo') outroEstilo = true
            else if (nado !== 'livre') strokes.add(nado)
        }
    }
    // Mesma ordem das opções da anamnese
    return { estilos: ['crawl', 'costas', 'peito', 'borboleta'].filter((s) => strokes.has(s)), outroEstilo }
}

// Informações calculadas, que o gerador usa para escolher a série
export function describe(serie) {
    const blocos = serie.blocos
    const material = new Set(blocos.flatMap((bloco) => bloco.material ?? []))
    return {
        ...serie,
        usos: serie.usos ?? ['treino'],
        // Metragem total da série
        volume: blocos.reduce((sum, b) => sum + b.repeticoes * b.distancia, 0),
        // Maior distância nadada sem parar (o atleta precisa aguentar isso)
        maiorDistancia: blocos.reduce((max, b) => Math.max(max, b.distancia), 0),
        exige: { ...requiredStrokes(blocos), material: MATERIAIS.filter((m) => material.has(m)) },
        // Séries "por sensação" (sem metragem) funcionam em qualquer piscina
        piscinas: serie.porSensacao ? [...PISCINAS] : poolsFor(blocos),
    }
}

// ---------- Validação ----------

// Devolve a lista de problemas do arquivo (vazia = tudo certo).
// Cada mensagem diz qual série e qual campo está errado.
export function validate(series) {
    if (!Array.isArray(series)) return ['O arquivo precisa ser uma lista de séries: [ {...}, {...} ]']

    const problems = []
    const ids = new Set()

    series.forEach((serie, index) => {
        const name = typeof serie?.id === 'string' && serie.id ? `"${serie.id}"` : `nº ${index + 1}`
        const report = (message) => problems.push(`Série ${name}: ${message}`)

        if (serie === null || typeof serie !== 'object' || Array.isArray(serie)) {
            return report('precisa ser um objeto { ... }.')
        }
        for (const key of Object.keys(serie)) {
            if (!SERIE_KEYS.includes(key)) report(`campo "${key}" não existe (campos: ${SERIE_KEYS.join(', ')}).`)
        }

        if (typeof serie.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(serie.id)) {
            report('"id" precisa ser em minúsculas, sem acento, com hífens (ex.: "aq-livre-200").')
        } else if (ids.has(serie.id)) {
            report('"id" repetido: cada série precisa de um id diferente.')
        } else {
            ids.add(serie.id)
        }

        if (typeof serie.texto !== 'string' || serie.texto.trim() === '') {
            report('"texto" é obrigatório (é como a série aparece no treino).')
        }

        if (serie.usos !== undefined) {
            if (!Array.isArray(serie.usos) || serie.usos.length === 0 || serie.usos.some((u) => !USOS.includes(u))) {
                report(`"usos" precisa ser uma lista com: ${USOS.join(', ')}.`)
            }
        }

        if (!Array.isArray(serie.blocos)) return report('"blocos" é obrigatório (uma lista).')

        if (serie.porSensacao !== undefined && serie.porSensacao !== true) {
            report('"porSensacao" só aceita true (ou tire o campo).')
        }
        if (serie.porSensacao) {
            if (serie.blocos.length > 0) report('série "porSensacao" não tem blocos: use "blocos": [].')
            if (!isInt(serie.duracaoMinutos, 1, 60)) report('série "porSensacao" precisa de "duracaoMinutos" (1 a 60).')
            return
        }
        if (serie.duracaoMinutos !== undefined) {
            report('"duracaoMinutos" só vale para série "porSensacao": nas outras a duração é calculada.')
        }
        if (serie.blocos.length === 0) return report('precisa de pelo menos um bloco.')

        serie.blocos.forEach((bloco, b) => {
            const where = serie.blocos.length > 1 ? `bloco ${b + 1}, ` : ''
            if (bloco === null || typeof bloco !== 'object' || Array.isArray(bloco)) {
                return report(`${where}cada bloco precisa ser um objeto { ... }.`)
            }
            for (const key of Object.keys(bloco)) {
                if (!BLOCO_KEYS.includes(key)) {
                    report(`${where}campo "${key}" não existe (campos: ${BLOCO_KEYS.join(', ')}).`)
                }
            }
            if (!isInt(bloco.repeticoes, 1, 50)) report(`${where}"repeticoes" precisa ser um número de 1 a 50.`)
            if (!isInt(bloco.distancia, 25, 3000) || bloco.distancia % 25 !== 0) {
                report(`${where}"distancia" precisa ser em metros, múltiplo de 25 (25 a 3000).`)
            }
            const nados = [bloco.nado].flat()
            const nadoOk = Array.isArray(bloco.nado)
                ? bloco.nado.length === 2 && nados.every((n) => NADOS.includes(n))
                : NADOS.includes(bloco.nado)
            if (!nadoOk) {
                report(`${where}"nado" precisa ser um de (${NADOS.join(', ')}) ou ida e volta: ["crawl", "estilo"].`)
            }
            if (!INTENSIDADES.includes(bloco.intensidade)) {
                report(`${where}"intensidade" precisa ser uma de: ${INTENSIDADES.join(', ')}.`)
            }
            if (bloco.descanso !== undefined && !isInt(bloco.descanso, 0, 600)) {
                report(`${where}"descanso" é em segundos (0 a 600).`)
            }
            if (bloco.material !== undefined) {
                if (!Array.isArray(bloco.material) || bloco.material.some((m) => !MATERIAIS.includes(m))) {
                    report(`${where}"material" precisa ser uma lista com: ${MATERIAIS.join(', ')}.`)
                }
            }
        })

        // Só confere as piscinas se os blocos estão certos (senão o erro fica confuso)
        const blocksOk = serie.blocos.every(
            (b) => b && isInt(b.distancia, 25, 3000) && b.distancia % 25 === 0 && [b.nado].flat().every((n) => NADOS.includes(n)),
        )
        if (blocksOk && poolsFor(serie.blocos).length === 0) {
            report('não fecha em nenhuma piscina (25 ou 50 m). Confira a distância e as idas e voltas.')
        }
    })

    return problems
}

// ---------- Leitura dos arquivos ----------

// Lê e valida uma parte. Se o arquivo tiver problema, o servidor nem sobe:
// melhor descobrir na hora do que gerar treino errado.
export function loadPart(part, dir = new URL('./', import.meta.url)) {
    const file = new URL(`${part}.json`, dir)
    if (!existsSync(file)) return []

    let series
    try {
        series = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
        throw new Error(`server/series/${part}.json não é um JSON válido: ${err.message}`)
    }
    const problems = validate(series)
    if (problems.length > 0) {
        throw new Error(`server/series/${part}.json tem problemas:\n- ${problems.join('\n- ')}`)
    }
    return series.map(describe)
}

export function loadLibrary(dir) {
    return Object.fromEntries(PARTS.map((part) => [part, loadPart(part, dir)]))
}

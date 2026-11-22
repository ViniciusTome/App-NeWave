// Regras de montagem dos treinos (server/series/regras.json):
// - quais partes do treino cada nível faz (iniciante não faz velocidade);
// - como o material entra em cada parte.
//
// Regra do material: ele só muda onde existe intervalo entre séries
// ("(2x) 4 x 25": 1ª série com pé de pato, 2ª nadando). Dentro de uma série
// é sempre o mesmo, porque não dá para colocar e tirar material com 20" de descanso.
import { readFileSync } from 'node:fs'
import { MATERIAIS, PARTS } from './index.js'

const NIVEIS = ['iniciante', 'intermediario', 'avancado']
// Fases da periodização ATR: Acumulação, Transição, Realização
export const FASES = ['acumulacao', 'transicao', 'realizacao']

const NOMES = { pe_de_pato: 'pé de pato', palmar: 'palmar', prancha: 'prancha', pull_buoy: 'pull buoy', snorkel: 'snorkel' }
const ORDINAIS = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª']

// "pé de pato + palmar"
export const materialText = (material) => material.map((m) => NOMES[m]).join(' + ')

// "1ª", "1ª e 3ª", "1ª, 2ª e 3ª"
function listText(indexes) {
    const names = indexes.map((i) => ORDINAIS[i])
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

// ---------- Validação ----------

// Item de um modelo "porSerie": "material" (o material escolhido entre as opções),
// "nadando" (sem material) ou uma lista fixa, ex.: ["palmar", "pull_buoy"]
const isModelItem = (item) =>
    item === 'material' || item === 'nadando' ||
    (Array.isArray(item) && item.length > 0 && item.every((m) => MATERIAIS.includes(m)))

export function validateRules(rules) {
    const problems = []
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) {
        return ['O arquivo de regras precisa ser um objeto { "niveis": ..., "material": ... }.']
    }

    for (const nivel of NIVEIS) {
        const estruturas = rules.niveis?.[nivel]?.estruturas
        const where = `niveis.${nivel}.estruturas`
        if (!Array.isArray(estruturas) || estruturas.length === 0) {
            problems.push(`${where} precisa ser uma lista, ex.: [{ "ateMinutos": 50, "partes": [...] }, { "partes": [...] }].`)
            continue
        }
        let previous = 0
        const validParts = [...PARTS, ...Object.keys(rules.pausas ?? {})]
        estruturas.forEach((estrutura, i) => {
            const label = `${where}, estrutura ${i + 1}`
            const partes = estrutura?.partes
            // Uma parte pode aparecer duas vezes (ex.: 2ª série principal)
            if (!Array.isArray(partes) || partes.length === 0 || partes.some((p) => !validParts.includes(p))) {
                problems.push(`${label}: "partes" precisa ser uma lista com: ${validParts.join(', ')}.`)
            }
            const last = i === estruturas.length - 1
            if (last && estrutura?.ateMinutos !== undefined) {
                problems.push(`${label}: a última estrutura não leva "ateMinutos" (vale para qualquer tempo acima).`)
            } else if (!last) {
                const ate = estrutura?.ateMinutos
                if (!Number.isInteger(ate) || ate <= previous) {
                    problems.push(`${label}: "ateMinutos" precisa ser um número maior que o da estrutura anterior.`)
                } else {
                    previous = ate
                }
            }
        })
    }

    if (rules.segundaPrincipal !== undefined &&
        typeof rules.segundaPrincipal?.alternarCrawlEEstilo !== 'boolean') {
        problems.push('segundaPrincipal.alternarCrawlEEstilo precisa ser true ou false.')
    }

    for (const [nome, pausa] of Object.entries(rules.pausas ?? {})) {
        const where = `pausas.${nome}`
        if (PARTS.includes(nome)) problems.push(`${where}: "${nome}" já é uma parte do treino; use outro nome.`)
        if (!(Number.isInteger(pausa?.minutos) && pausa.minutos >= 1 && pausa.minutos <= 30)) {
            problems.push(`${where}.minutos precisa ser de 1 a 30.`)
        }
        if (typeof pausa?.texto !== 'string' || pausa.texto.trim() === '') {
            problems.push(`${where}.texto é obrigatório (é como a pausa aparece no treino).`)
        }
    }

    for (const [parte, regra] of Object.entries(rules.material ?? {})) {
        const where = `material.${parte}`
        if (!PARTS.includes(parte)) {
            problems.push(`${where}: "${parte}" não é uma parte do treino (${PARTS.join(', ')}).`)
            continue
        }
        const opcoes = regra?.opcoes
        if (!Array.isArray(opcoes) || opcoes.length === 0) {
            problems.push(`${where}.opcoes precisa ser uma lista, ex.: [["pe_de_pato"], ["palmar", "pull_buoy"]].`)
        } else {
            opcoes.forEach((opcao, i) => {
                if (!Array.isArray(opcao) || opcao.length === 0 || opcao.some((m) => !MATERIAIS.includes(m))) {
                    problems.push(`${where}.opcoes, opção ${i + 1}: use uma lista com: ${MATERIAIS.join(', ')}.`)
                }
            })
        }
        for (const [vezes, modelos] of Object.entries(regra?.porSerie ?? {})) {
            const n = Number(vezes)
            if (!Number.isInteger(n) || n < 2 || n > 10) {
                problems.push(`${where}.porSerie: "${vezes}" precisa ser o número de séries (2 a 10).`)
                continue
            }
            if (!Array.isArray(modelos) || modelos.length === 0) {
                problems.push(`${where}.porSerie.${vezes} precisa ser uma lista de modelos.`)
                continue
            }
            modelos.forEach((modelo, i) => {
                const valid = Array.isArray(modelo) && modelo.length === n && modelo.every(isModelItem)
                if (!valid) {
                    problems.push(
                        `${where}.porSerie.${vezes}, modelo ${i + 1}: precisa ter ${n} itens, cada um "material", ` +
                        `"nadando" ou uma lista de materiais (ex.: ["palmar", "pull_buoy"]).`,
                    )
                } else if (modelo.every((m) => m === 'nadando')) {
                    problems.push(`${where}.porSerie.${vezes}, modelo ${i + 1}: precisa de pelo menos uma série com material.`)
                }
            })
        }
    }
    for (const [parte, regra] of Object.entries(rules.intervalos ?? {})) {
        const where = `intervalos.${parte}`
        if (!PARTS.includes(parte)) {
            problems.push(`${where}: "${parte}" não é uma parte do treino (${PARTS.join(', ')}).`)
            continue
        }
        if (regra?.padrao !== 'saida') {
            problems.push(`${where}.padrao: por enquanto só existe "saida" (o intervalo é uma saída da repetição).`)
        }
        ;(Array.isArray(regra?.excecoes) ? regra.excecoes : [null]).forEach((excecao, i) => {
            const label = `${where}.excecoes, exceção ${i + 1}`
            if (excecao === null || typeof excecao !== 'object') {
                return problems.push(`${where}.excecoes precisa ser uma lista, ex.: [{ "fase": "realizacao", "segundos": 60 }].`)
            }
            const conditions = ['fase', 'repeticoesPorSerie'].filter((k) => excecao[k] !== undefined)
            if (conditions.length !== 1) {
                problems.push(`${label}: use uma condição, "fase" ou "repeticoesPorSerie".`)
            } else if (excecao.fase !== undefined && !FASES.includes(excecao.fase)) {
                problems.push(`${label}: "fase" precisa ser uma de: ${FASES.join(', ')}.`)
            } else if (excecao.repeticoesPorSerie !== undefined &&
                !(Number.isInteger(excecao.repeticoesPorSerie) && excecao.repeticoesPorSerie > 0)) {
                problems.push(`${label}: "repeticoesPorSerie" precisa ser um número, ex.: 8.`)
            }
            if (!(Number.isInteger(excecao.segundos) && excecao.segundos >= 0 && excecao.segundos <= 600)) {
                problems.push(`${label}: "segundos" precisa ser de 0 a 600.`)
            }
        })
    }
    return problems
}

export function loadRules(file = new URL('./regras.json', import.meta.url)) {
    let rules
    try {
        rules = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
        throw new Error(`server/series/regras.json não é um JSON válido: ${err.message}`)
    }
    const problems = validateRules(rules)
    if (problems.length > 0) {
        throw new Error(`server/series/regras.json tem problemas:\n- ${problems.join('\n- ')}`)
    }
    return rules
}

// ---------- Uso das regras ----------

// Partes do treino para o nível e o tempo de aula, na ordem em que são nadadas.
// Vale a primeira estrutura cujo "ateMinutos" comporta a aula; a última vale
// para qualquer tempo acima. Ex.: até 50 min sem perna; até 1h15 com perna;
// acima disso, com pausa de hidratação e 2ª série principal.
// Os nomes que estão em "pausas" (ex.: "hidratacao") não são séries: veja pauseOf.
export function partsForLevel(rules, nivel, minutos) {
    const estruturas = rules.niveis[nivel].estruturas
    const estrutura = estruturas.find((e) => e.ateMinutos === undefined || minutos <= e.ateMinutos)
    return estrutura.partes
}

// Pausa do treino (ex.: hidratação), ou null se o nome é uma parte com séries
export const pauseOf = (rules, nome) => rules.pausas?.[nome] ?? null

// Agrupa as séries que ficam iguais: "1ª e 3ª séries com palmar, 2ª e 4ª séries nadando"
function groupSets(descriptions) {
    const groups = []
    descriptions.forEach((description, i) => {
        const group = groups.find((g) => g.description === description)
        if (group) group.indexes.push(i)
        else groups.push({ description, indexes: [i] })
    })
    return groups
        .map(({ description, indexes }) =>
            `${listText(indexes)} ${indexes.length > 1 ? 'séries' : 'série'} ${description}`)
        .join(', ')
}

// Número de séries: "(4x) 4 x 25" = 4 (vezes no bloco); "(3x) 100, 2 x 75, ..." = 3
// (vezes na série, repetindo o grupo de blocos). Sem "vezes", é uma só.
const setsOf = (serie) => serie.vezes ?? (serie.blocos.length === 1 ? serie.blocos[0].vezes ?? 1 : 1)

// Repete a lista até ter n itens: ["costas", "peito"] -> costas, peito, costas, peito
const cycle = (list, n) => Array.from({ length: n }, (_, i) => list[i % list.length])

// Formas de usar o material na série, com o que o atleta tem. Devolve
// [{ padrao, material, series? }]:
// - "sem_material": a série como está (sempre possível);
// - "serie_inteira": a série toda com o mesmo material;
// - "por_serie": muda entre as séries de "(2x)", "(4x)"... conforme os modelos
//   (`series` tem o material de cada série);
// - "fixo": a série tem material escrito no próprio JSON, e o gerador não mexe.
function materialOptions(rules, parte, serie, athleteEquipment) {
    if (serie.exige.material.length > 0) {
        return [{ padrao: 'fixo', material: serie.exige.material }]
    }

    const options = [{ padrao: 'sem_material', material: [] }]
    const regra = rules.material[parte]
    if (!regra || serie.porSensacao) return options

    const has = new Set(athleteEquipment)
    const hasAll = (material) => material.every((m) => has.has(m))
    const opcoes = regra.opcoes.filter(hasAll)

    for (const opcao of opcoes) options.push({ padrao: 'serie_inteira', material: opcao })

    for (const modelo of regra.porSerie?.[String(setsOf(serie))] ?? []) {
        // Modelo com "material": um para cada opção. Modelo com listas fixas: um só.
        const usesOption = modelo.includes('material')
        for (const opcao of usesOption ? opcoes : [null]) {
            const series = modelo.map((m) => (m === 'material' ? opcao : m === 'nadando' ? [] : m))
            if (!series.every(hasAll)) continue
            const material = MATERIAIS.filter((m) => series.some((s) => s.includes(m)))
            options.push({ padrao: 'por_serie', material, series })
        }
    }
    return options
}

// ---------- Variações de nado ----------

const ESTILOS = ['borboleta', 'costas', 'peito'] // "estilo" = qualquer um que não seja o crawl
const ORDEM_MEDLEY = ['borboleta', 'costas', 'peito', 'crawl']

// Nados possíveis para a série, só com os estilos que o atleta marcou na anamnese:
// - "livre": a série como está (sempre entra);
// - "medley": cada repetição num estilo; e, com 4 séries (ou múltiplo),
//   "medley_por_serie": 1ª série borboleta, 2ª costas, 3ª peito, 4ª crawl.
//   Os dois exigem os quatro estilos;
// - "estilo": a série toda num estilo (borboleta, costas ou peito) que ele nada; e,
//   com várias séries e mais de um estilo, "estilos_por_serie": os estilos se alternam.
// `nados` (quando existe) tem o nado de cada série.
function strokeOptions(serie, athleteStrokes) {
    const has = new Set(athleteStrokes)
    const sets = setsOf(serie)
    const options = [{ nado: 'livre' }]
    for (const outro of serie.outrosNados) {
        if (outro === 'medley' && ORDEM_MEDLEY.every((s) => has.has(s))) {
            options.push({ nado: 'medley' })
            if (sets % 4 === 0) options.push({ nado: 'medley_por_serie', nados: cycle(ORDEM_MEDLEY, sets) })
        }
        if (outro === 'estilo') {
            const estilos = ESTILOS.filter((s) => has.has(s))
            for (const estilo of estilos) options.push({ nado: estilo })
            if (sets > 1 && estilos.length > 1) {
                options.push({ nado: 'estilos_por_serie', nados: cycle(estilos, sets) })
            }
        }
    }
    return options
}

// Texto da variação. O que vale para a série toda vai depois do texto da série;
// o que muda entre as séries vai junto, série por série:
// "(4x) 4 x 25 forte · 1ª série borboleta com pé de pato, 2ª série costas com pé de pato + palmar, ..."
function variationText(serie, stroke, option) {
    const parts = [serie.texto]
    if (!stroke.nados && stroke.nado !== 'livre') parts.push(stroke.nado)
    if (option.padrao === 'serie_inteira') parts.push(`com ${materialText(option.material)}`)

    if (stroke.nados || option.series) {
        const sets = (stroke.nados ?? option.series).length
        const descriptions = Array.from({ length: sets }, (_, i) => {
            const nado = stroke.nados?.[i]
            const material = option.series?.[i]
            if (!material) return nado
            if (material.length === 0) return nado ? `${nado} sem material` : 'nadando'
            return [nado, `com ${materialText(material)}`].filter(Boolean).join(' ')
        })
        parts.push(groupSets(descriptions))
    }
    return parts.join(' · ')
}

// Todas as formas de nadar a série para esse atleta: cada nado possível
// combinado com cada forma de usar o material, com o texto pronto.
// `serie` vem de describe() (index.js); `athlete` é { equipment, strokes } da anamnese.
export function seriesVariations(rules, parte, serie, athlete) {
    const variations = []
    for (const stroke of strokeOptions(serie, athlete.strokes)) {
        for (const option of materialOptions(rules, parte, serie, athlete.equipment)) {
            variations.push({ ...stroke, ...option, texto: variationText(serie, stroke, option) })
        }
    }
    return variations
}

// ---------- Intervalo entre as séries ----------

// Segundos de intervalo entre as séries de um "(2x)", "(4x)"... (null se a série
// não tem intervalo). Em geral é uma saída da repetição (se o atleta faz o 25 a
// cada 30", o intervalo é 30"); as exceções das regras podem aumentar,
// ex.: 1 minuto na fase de Realização ou entre séries de 8 x 25.
// `contexto` = { fase, saidaSegundos }.
export function intervalBetweenSets(rules, parte, serie, contexto) {
    if (setsOf(serie) < 2) return null
    const regra = rules.intervalos?.[parte]
    let segundos = contexto.saidaSegundos
    for (const excecao of regra?.excecoes ?? []) {
        const vale = excecao.fase !== undefined
            ? excecao.fase === contexto.fase
            : excecao.repeticoesPorSerie === serie.blocos[0].repeticoes
        if (vale) segundos = Math.max(segundos, excecao.segundos)
    }
    return segundos
}

// ---------- 2ª série principal ----------

// A variação é de crawl ou de estilo? Medley conta como estilo (não é só crawl).
// "livre" segue o nado escrito nos blocos: crawl/livre é crawl; o resto é estilo.
export function strokeCategory(serie, variation) {
    if (variation.nado !== 'livre') return 'estilo'
    const nados = serie.blocos.flatMap((bloco) => [bloco.nado].flat())
    return nados.every((n) => n === 'crawl' || n === 'livre') ? 'crawl' : 'estilo'
}

// Nos treinos com duas séries principais: se a 1ª foi de estilo, a 2ª é crawl,
// e vice-versa. Quem não nada nenhum estilo (borboleta, costas, peito) faz as
// duas em crawl, senão o treino ficaria impossível.
// `first` e `second` são { serie, variation }; `athleteStrokes` vem da anamnese.
export function allowedAsSecondMain(rules, first, second, athleteStrokes) {
    if (!rules.segundaPrincipal?.alternarCrawlEEstilo) return true
    const primeira = strokeCategory(first.serie, first.variation)
    const segunda = strokeCategory(second.serie, second.variation)
    if (primeira === 'estilo') return segunda === 'crawl'
    const nadaEstilo = ESTILOS.some((s) => athleteStrokes.includes(s))
    return nadaEstilo ? segunda === 'estilo' : true
}

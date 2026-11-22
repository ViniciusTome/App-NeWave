// Regras de montagem dos treinos (server/series/regras.json):
// - quais partes do treino cada nível faz (iniciante não faz velocidade);
// - como o material entra em cada parte.
//
// Regra do material: ele só muda onde existe intervalo entre séries
// ("(2x) 4 x 25": 1ª série com pé de pato, 2ª nadando). Dentro de uma série
// é sempre o mesmo, porque não dá para colocar e tirar material com 20" de descanso.
import { readFileSync } from 'node:fs'
import {
    MATERIAIS, PARTS, canAlternateMedley, canSwimInStroke, canSwimMedleyWithoutCrawl, individualMedleyPools,
} from './index.js'

const NIVEIS = ['iniciante', 'intermediario', 'avancado']
const ESTILOS = ['borboleta', 'costas', 'peito'] // "estilo" = qualquer um que não seja o crawl
// Formatos de cada série na mistura de nados: igual (costas, costas, costas),
// espelhado (medley, peito, medley) e diferentes (melhor estilo, peito, medley)
const FORMATOS = ['igual', 'espelhado', 'diferentes']

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

    if (rules.misturaDeNados !== undefined) {
        const m = rules.misturaDeNados
        const where = 'misturaDeNados'
        if (!Array.isArray(m?.partes) || m.partes.some((p) => !PARTS.includes(p))) {
            problems.push(`${where}.partes precisa ser uma lista com: ${PARTS.join(', ')}.`)
        }
        if (!(Number.isInteger(m?.minimoDeSeries) && m.minimoDeSeries >= 2)) {
            problems.push(`${where}.minimoDeSeries precisa ser um número a partir de 2 (ex.: 3 para "(3x)", "(4x)").`)
        }
        if (!Array.isArray(m?.formatos) || m.formatos.length === 0 || m.formatos.some((f) => !FORMATOS.includes(f))) {
            problems.push(`${where}.formatos precisa ser uma lista com: ${FORMATOS.join(', ')}.`)
        }
        if (!(Number.isInteger(m?.pesoMelhorEstilo) && m.pesoMelhorEstilo >= 1)) {
            problems.push(`${where}.pesoMelhorEstilo precisa ser um número a partir de 1 (1 = sem preferência).`)
        }
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

    for (const [nado, limites] of Object.entries(rules.limitesPorNivel ?? {})) {
        const where = `limitesPorNivel.${nado}`
        if (!ESTILOS.includes(nado)) {
            problems.push(`${where}: "${nado}" precisa ser um de: ${ESTILOS.join(', ')}.`)
            continue
        }
        for (const [nivel, metros] of Object.entries(limites ?? {})) {
            if (!NIVEIS.includes(nivel)) problems.push(`${where}: "${nivel}" precisa ser um de: ${NIVEIS.join(', ')}.`)
            if (!(Number.isInteger(metros) && metros >= 25 && metros % 25 === 0)) {
                problems.push(`${where}.${nivel}: use metros em múltiplo de 25, ex.: 100.`)
            }
        }
    }

    if (rules.materialObrigatorio !== undefined) {
        if (!Array.isArray(rules.materialObrigatorio)) {
            problems.push('materialObrigatorio precisa ser uma lista, ex.: [{ "distanciaAcimaDe": 400, "material": ["pe_de_pato", "palmar"] }].')
        } else {
            rules.materialObrigatorio.forEach((regra, i) => {
                const label = `materialObrigatorio, regra ${i + 1}`
                if (!(Number.isInteger(regra?.distanciaAcimaDe) && regra.distanciaAcimaDe > 0)) {
                    problems.push(`${label}: "distanciaAcimaDe" precisa ser um número de metros, ex.: 400.`)
                }
                if (regra?.emPiramidesAPartirDe !== undefined &&
                    !(Number.isInteger(regra.emPiramidesAPartirDe) && regra.emPiramidesAPartirDe > 0)) {
                    problems.push(`${label}: "emPiramidesAPartirDe" precisa ser um número de metros, ex.: 400.`)
                }
                const material = regra?.material
                if (!Array.isArray(material) || material.length === 0 || material.some((m) => !MATERIAIS.includes(m))) {
                    problems.push(`${label}: "material" precisa ser uma lista com: ${MATERIAIS.join(', ')}.`)
                }
            })
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
        if (regra?.piramides !== undefined && regra.piramides !== 'material_diferente_por_distancia') {
            problems.push(`${where}.piramides: por enquanto só existe "material_diferente_por_distancia".`)
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
// - "fixo": a série tem material escrito no próprio JSON, e o gerador não mexe;
// - "obrigatorio": repetição longa, que sempre usa o material das regras;
// - "obrigatorio_por_bloco": só alguns blocos usam (ex.: os 400 de uma pirâmide);
// - "piramide_alternada": cada distância da pirâmide com um material diferente.
function materialOptions(rules, parte, serie, athleteEquipment) {
    if (serie.exige.material.length > 0) {
        return [{ padrao: 'fixo', material: serie.exige.material }]
    }

    const has = new Set(athleteEquipment)
    const hasAll = (material) => material.every((m) => has.has(m))
    const regra = rules.material[parte]
    const opcoes = (regra?.opcoes ?? []).filter(hasAll)
    // Pirâmide: vários blocos, sem repetir o grupo (o "(2x) 1 x 200, 4 x 50" não é pirâmide)
    const piramide = serie.blocos.length > 1 && !(serie.vezes > 1)

    // Repetições longas sempre com o mesmo material, bloco por bloco: acima de
    // 400 m, e nas pirâmides a partir de 400 m.
    // Ex.: na pirâmide 1 x 400, 2 x 200, ... os 400 usam pé de pato + palmar.
    // Quem não tem esse material não recebe a série.
    let fixos = serie.blocos.map(() => null) // material obrigatório de cada bloco
    let obrigatorio = null
    for (const regraObrig of rules.materialObrigatorio ?? []) {
        const precisa = serie.blocos.map((bloco) =>
            bloco.distancia > regraObrig.distanciaAcimaDe ||
            (piramide && regraObrig.emPiramidesAPartirDe !== undefined && bloco.distancia >= regraObrig.emPiramidesAPartirDe))
        if (!precisa.some(Boolean)) continue
        if (!hasAll(regraObrig.material)) return []
        if (precisa.every(Boolean)) return [{ padrao: 'obrigatorio', material: regraObrig.material }]
        fixos = precisa.map((p) => (p ? regraObrig.material : null))
        obrigatorio = regraObrig.material
        break
    }

    const options = []
    if (obrigatorio) {
        // O resto da pirâmide nadando
        options.push({
            padrao: 'obrigatorio_por_bloco',
            material: obrigatorio,
            porBloco: fixos.map((m) => m ?? []),
            distancias: [...new Set(serie.blocos.filter((_, i) => fixos[i]).map((b) => b.distancia))],
        })
    } else {
        options.push({ padrao: 'sem_material', material: [] })
        if (!regra || serie.porSensacao) return options
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
    }

    // Pirâmide alternando: cada distância com um material diferente (ou nadando),
    // sem repetir o material obrigatório. Ex.: os 400 com pé de pato + palmar,
    // os 200 com palmar, os 100 com pé de pato, os 50 nadando.
    if (piramide && regra?.piramides === 'material_diferente_por_distancia') {
        const livres = [...new Set(serie.blocos.filter((_, i) => !fixos[i]).map((b) => b.distancia))]
        const key = (m) => m.join('+')
        const escolhas = [...opcoes.filter((o) => !obrigatorio || key(o) !== key(obrigatorio)), []]
        for (const combinacao of arrangements(escolhas, livres.length)) {
            if (combinacao.every((m) => m.length === 0)) continue // tudo nadando já existe
            const porDistancia = new Map(livres.map((d, i) => [d, combinacao[i]]))
            const porBloco = serie.blocos.map((b, i) => fixos[i] ?? porDistancia.get(b.distancia))
            const material = MATERIAIS.filter((m) => porBloco.some((b) => b.includes(m)))
            options.push({ padrao: 'piramide_alternada', material, porBloco })
        }
    }
    return options
}

// Todas as formas de escolher n itens diferentes da lista, em ordem
function arrangements(list, n) {
    if (n === 0) return [[]]
    return list.flatMap((item, i) =>
        arrangements([...list.slice(0, i), ...list.slice(i + 1)], n - 1).map((rest) => [item, ...rest]))
}

// "os 400 com pé de pato + palmar, os 200 com palmar, os 50 nadando"
function perBlockText(serie, porBloco) {
    const seen = new Map()
    serie.blocos.forEach((b, i) => { if (!seen.has(b.distancia)) seen.set(b.distancia, porBloco[i]) })
    return [...seen].map(([d, m]) => `os ${d} ${m.length > 0 ? `com ${materialText(m)}` : 'nadando'}`).join(', ')
}

// ---------- Variações de nado ----------

const ORDEM_MEDLEY = ['borboleta', 'costas', 'peito', 'crawl']
const MEDLEY_SEM_CRAWL_TEXTO = 'medley (borboleta, costas, peito)'

// Nados possíveis para a série, só com os estilos que o atleta marcou na anamnese:
// - "livre": a série como está (sempre entra);
// - "medley": cada repetição num estilo; e, com 4 séries (ou múltiplo),
//   "medley_por_serie": 1ª série borboleta, 2ª costas, 3ª peito, 4ª crawl.
//   Os dois exigem os quatro estilos;
// - "estilo": a série toda num estilo (borboleta, costas ou peito) que ele nada; e,
//   com várias séries e mais de um estilo, "estilos_por_serie": os estilos se alternam.
// `nados` (quando existe) tem o nado de cada série.
// Maior repetição que o atleta pode nadar num estilo, pelo nível
// (ex.: borboleta até 100 m, a não ser o avançado). Sem limite: Infinity.
const limitFor = (rules, nado, nivel) => rules.limitesPorNivel?.[nado]?.[nivel] ?? Infinity

function strokeOptions(rules, serie, athlete) {
    const has = new Set(athlete.strokes)
    const sets = setsOf(serie)
    const maior = serie.maiorDistancia
    // Estilos que cabem na série para esse atleta (ex.: borboleta de 200 só para avançado)
    const podeNadar = (estilo) => has.has(estilo) && maior <= limitFor(rules, estilo, athlete.level)
    const options = [{ nado: 'livre' }]
    for (const outro of serie.outrosNados) {
        // No medley alternado e por série, cada repetição é nadada inteira num estilo
        if (outro === 'medley' && ORDEM_MEDLEY.every((s) => has.has(s))) {
            // Provas de piscina: alternado (um estilo por repetição) só até 200 m;
            // medley individual (cada repetição um medley) em 200/400 m (100 m na de 25 m)
            const curta = serie.blocos.every((b) => b.distancia <= 50)
            if (canAlternateMedley(serie.blocos) && ESTILOS.every(podeNadar)) {
                options.push({ nado: 'medley', texto: curta ? 'medley' : 'medley alternado (um estilo por repetição)' })
                if (sets % 4 === 0) options.push({ nado: 'medley_por_serie', nados: cycle(ORDEM_MEDLEY, sets) })
            }
            const pools = individualMedleyPools(serie.blocos)
            if (pools.length > 0) options.push({ nado: 'medley_individual', texto: 'medley', piscinas: pools })
        }
        // 150 m: medley sem crawl (50 borboleta, 50 costas, 50 peito)
        if (outro === 'medley' && canSwimMedleyWithoutCrawl(serie.blocos) && ESTILOS.every((s) => has.has(s))) {
            options.push({ nado: 'medley_sem_crawl', texto: MEDLEY_SEM_CRAWL_TEXTO })
        }
        // Repetições alternando: melhor estilo, medley, melhor estilo, medley...
        if (outro === 'melhorEstiloEMedley') {
            const melhor = bestStrokeOf(athlete, ESTILOS.filter(podeNadar))
            const semCrawl = canSwimMedleyWithoutCrawl(serie.blocos) && ESTILOS.every((s) => has.has(s))
            const individual = ORDEM_MEDLEY.every((s) => has.has(s)) ? individualMedleyPools(serie.blocos) : []
            if (melhor && canSwimInStroke(serie.blocos) && (semCrawl || individual.length > 0)) {
                const medley = semCrawl ? MEDLEY_SEM_CRAWL_TEXTO : 'medley'
                options.push({
                    nado: 'melhor_estilo_e_medley',
                    melhorEstilo: melhor,
                    texto: `alternando ${melhor} (melhor estilo) e ${medley}`,
                    ...(!semCrawl && { piscinas: individual }),
                })
            }
        }
        if (outro === 'estilo' && canSwimInStroke(serie.blocos)) {
            const estilos = ESTILOS.filter(podeNadar)
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
    if (!stroke.nados && stroke.nado !== 'livre') parts.push(stroke.texto ?? stroke.nado)
    if (option.padrao === 'serie_inteira' || option.padrao === 'obrigatorio') {
        parts.push(`com ${materialText(option.material)}`)
    }
    if (option.padrao === 'obrigatorio_por_bloco') {
        parts.push(`os ${option.distancias.join(' e os ')} com ${materialText(option.material)}`)
    }
    if (option.padrao === 'piramide_alternada') parts.push(perBlockText(serie, option.porBloco))

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
// `serie` vem de describe() (index.js); `athlete` é { equipment, strokes, level }
// (anamnese e nível calculado).
export function seriesVariations(rules, parte, serie, athlete) {
    // Bloco escrito num estilo acima do limite do nível (ex.: 200 borboleta para
    // quem não é avançado): o atleta não recebe a série
    const acimaDoLimite = serie.blocos.some((b) =>
        !Array.isArray(b.nado) && b.distancia > limitFor(rules, b.nado, athlete.level))
    if (acimaDoLimite) return []

    const variations = []
    for (const stroke of strokeOptions(rules, serie, athlete)) {
        for (const option of materialOptions(rules, parte, serie, athlete.equipment)) {
            const { texto: _nadoTexto, ...strokeInfo } = stroke
            variations.push({ ...strokeInfo, ...option, texto: variationText(serie, stroke, option) })
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

// A variação é de crawl ou de estilo? Medley (alternado ou individual) conta como estilo.
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

// ---------- Mistura de nados nas séries com "(3x)", "(4x)" ----------

// Melhor estilo do atleta; sem resposta na anamnese, o primeiro na ordem de
// velocidade (borboleta, costas, peito) entre os que ele pode nadar
function bestStrokeOf(athlete, possiveis) {
    if (possiveis.includes(athlete.bestStroke)) return athlete.bestStroke
    return ESTILOS.find((s) => possiveis.includes(s)) ?? null
}

// Sorteia uma mistura de nados para a série: cada série do "(3x)", "(4x)" ganha
// um formato (igual, espelhado ou diferentes) com medley, o melhor estilo e os
// estilos que o atleta nada. O crawl fica de fora (a série em crawl já existe
// como a série normal). Respeita as provas de piscina e os limites por nível.
// Ex.: "(4x) 3 x 200 · 1ª série medley, peito, medley; 2ª série costas, medley, costas; ..."
// Devolve null se a série ou o atleta não comportam a mistura.
// `random` permite repetir o sorteio nos testes.
export function drawMixedStrokes(rules, parte, serie, athlete, random = Math.random) {
    const regra = rules.misturaDeNados
    if (!regra || !regra.partes.includes(parte)) return null
    const sets = setsOf(serie)
    if (serie.blocos.length !== 1 || sets < regra.minimoDeSeries) return null

    const bloco = serie.blocos[0]
    const has = new Set(athlete.strokes)
    const estilos = canSwimInStroke(serie.blocos)
        ? ESTILOS.filter((s) => has.has(s) && bloco.distancia <= limitFor(rules, s, athlete.level))
        : []
    // Medley aqui é o medley individual: cada repetição um medley completo
    const medleyPools = ORDEM_MEDLEY.every((s) => has.has(s)) ? individualMedleyPools(serie.blocos) : []
    const nados = [...estilos, ...(medleyPools.length > 0 ? ['medley'] : [])]
    if (nados.length < 2) return null

    const melhor = bestStrokeOf(athlete, estilos)
    const peso = (nado) => (nado === melhor ? regra.pesoMelhorEstilo : 1)
    const pick = (opcoes) => {
        const total = opcoes.reduce((sum, n) => sum + peso(n), 0)
        let r = random() * total
        for (const n of opcoes) {
            r -= peso(n)
            if (r < 0) return n
        }
        return opcoes.at(-1)
    }
    const reps = bloco.repeticoes
    const formatos = regra.formatos.filter((f) =>
        f === 'igual' || (f === 'espelhado' && reps >= 3) || (f === 'diferentes' && reps <= nados.length))

    const porSerie = Array.from({ length: sets }, () => {
        const formato = formatos[Math.floor(random() * formatos.length)]
        if (formato === 'igual') return Array(reps).fill(pick(nados))
        if (formato === 'espelhado') {
            const ponta = pick(nados)
            const meio = pick(nados.filter((n) => n !== ponta))
            return Array.from({ length: reps }, (_, i) => (i === 0 || i === reps - 1 ? ponta : meio))
        }
        const usados = []
        for (let i = 0; i < reps; i++) usados.push(pick(nados.filter((n) => !usados.includes(n))))
        return usados
    })

    const usaMedley = porSerie.some((s) => s.includes('medley'))
    const texto = `${serie.texto} · ` + porSerie
        .map((nadosDaSerie, i) => {
            const todosIguais = nadosDaSerie.every((n) => n === nadosDaSerie[0])
            return `${ORDINAIS[i]} série ${todosIguais ? nadosDaSerie[0] : nadosDaSerie.join(', ')}`
        })
        .join('; ')

    return {
        nado: 'misto',
        porSerie,
        melhorEstilo: melhor,
        padrao: 'sem_material',
        material: [],
        // 100 medley só existe na piscina de 25 m
        ...(usaMedley && { piscinas: medleyPools }),
        texto,
    }
}

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
        const partes = rules.niveis?.[nivel]?.partes
        if (!Array.isArray(partes) || partes.length === 0 || partes.some((p) => !PARTS.includes(p))) {
            problems.push(`niveis.${nivel}.partes precisa ser uma lista com: ${PARTS.join(', ')}.`)
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

// Partes do treino que o nível faz (ex.: iniciante não faz velocidade)
export const partsForLevel = (rules, nivel) => rules.niveis[nivel].partes

// "1ª série com pé de pato, 2ª série com pé de pato + palmar, 3ª e 4ª séries nadando".
// Séries seguidas com o mesmo material são agrupadas, na ordem em que aparecem.
function perSetText(series) {
    const groups = []
    series.forEach((material, i) => {
        const key = material.join('+')
        const group = groups.find((g) => g.key === key)
        if (group) group.indexes.push(i)
        else groups.push({ key, material, indexes: [i] })
    })
    return groups
        .map(({ material, indexes }) => {
            const what = material.length === 0 ? 'nadando' : `com ${materialText(material)}`
            return `${listText(indexes)} ${indexes.length > 1 ? 'séries' : 'série'} ${what}`
        })
        .join(', ')
}

// Formas de usar o material na série, com o que o atleta tem. Devolve
// [{ padrao, material, series?, sufixo }]:
// - "sem_material": a série como está (sempre possível);
// - "serie_inteira": a série toda com o mesmo material;
// - "por_serie": muda entre as séries de "(2x)", "(4x)"... conforme os modelos;
// - "fixo": a série tem material escrito no próprio JSON, e o gerador não mexe.
function materialOptions(rules, parte, serie, athleteEquipment) {
    if (serie.exige.material.length > 0) {
        return [{ padrao: 'fixo', material: serie.exige.material, sufixo: '' }]
    }

    const options = [{ padrao: 'sem_material', material: [], sufixo: '' }]
    const regra = rules.material[parte]
    if (!regra || serie.porSensacao) return options

    const has = new Set(athleteEquipment)
    const hasAll = (material) => material.every((m) => has.has(m))
    const opcoes = regra.opcoes.filter(hasAll)

    for (const opcao of opcoes) {
        options.push({ padrao: 'serie_inteira', material: opcao, sufixo: `com ${materialText(opcao)}` })
    }

    // Troca entre séries só existe com um bloco repetido ("vezes")
    const vezes = serie.blocos.length === 1 ? serie.blocos[0].vezes ?? 1 : 1
    for (const modelo of regra.porSerie?.[String(vezes)] ?? []) {
        // Modelo com "material": um para cada opção. Modelo com listas fixas: um só.
        const usesOption = modelo.includes('material')
        for (const opcao of usesOption ? opcoes : [null]) {
            const series = modelo.map((m) => (m === 'material' ? opcao : m === 'nadando' ? [] : m))
            if (!series.every(hasAll)) continue
            const material = MATERIAIS.filter((m) => series.some((s) => s.includes(m)))
            options.push({ padrao: 'por_serie', material, series, sufixo: perSetText(series) })
        }
    }
    return options
}

// ---------- Variações de nado ----------

const ESTILOS = ['borboleta', 'costas', 'peito'] // "estilo" = qualquer um que não seja o crawl
const QUATRO = ['crawl', 'costas', 'peito', 'borboleta']

// Nados possíveis para a série, com os estilos que o atleta nada.
// A série como está ("livre") sempre entra; "medley" exige os quatro estilos;
// "estilo" vira uma opção para cada estilo (borboleta, costas, peito) que ele nada.
function strokeOptions(serie, athleteStrokes) {
    const has = new Set(athleteStrokes)
    const options = [{ nado: 'livre', sufixo: '' }]
    for (const outro of serie.outrosNados) {
        if (outro === 'medley' && QUATRO.every((s) => has.has(s))) {
            options.push({ nado: 'medley', sufixo: 'medley' })
        }
        if (outro === 'estilo') {
            for (const estilo of ESTILOS.filter((s) => has.has(s))) options.push({ nado: estilo, sufixo: estilo })
        }
    }
    return options
}

// Todas as formas de nadar a série para esse atleta: cada nado possível
// combinado com cada forma de usar o material. O texto já sai pronto, ex.:
// "(4x) 4 x 25 forte · medley · 1ª série com pé de pato, 2ª série com pé de pato + palmar, ..."
// `serie` vem de describe() (index.js); `athlete` é { equipment, strokes } da anamnese.
export function seriesVariations(rules, parte, serie, athlete) {
    const variations = []
    for (const stroke of strokeOptions(serie, athlete.strokes)) {
        for (const option of materialOptions(rules, parte, serie, athlete.equipment)) {
            const texto = [serie.texto, stroke.sufixo, option.sufixo].filter(Boolean).join(' · ')
            variations.push({ nado: stroke.nado, ...option, texto })
        }
    }
    return variations.map(({ sufixo: _sufixo, ...variation }) => variation)
}

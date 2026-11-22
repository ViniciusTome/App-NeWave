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
                const valid = Array.isArray(modelo) && modelo.length === n &&
                    modelo.every((m) => m === 'material' || m === 'nadando')
                if (!valid) {
                    problems.push(`${where}.porSerie.${vezes}, modelo ${i + 1}: precisa ter ${n} itens, cada um "material" ou "nadando".`)
                } else if (!modelo.includes('material') || !modelo.includes('nadando')) {
                    problems.push(`${where}.porSerie.${vezes}, modelo ${i + 1}: precisa de pelo menos uma série com material e uma nadando.`)
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

// Todas as formas de nadar a série com o material que o atleta tem.
// `serie` vem de describe() (index.js). Devolve [{ padrao, material, series, texto }]:
// - "sem_material": a série como está (sempre possível);
// - "serie_inteira": a série toda com o mesmo material;
// - "por_serie": muda entre as séries de "(2x)", "(4x)"... conforme os modelos.
// Série com material escrito no próprio JSON é fixa: o gerador não mexe.
export function materialVariations(rules, parte, serie, athleteEquipment) {
    if (serie.exige.material.length > 0) {
        return [{ padrao: 'fixo', material: serie.exige.material, texto: serie.texto }]
    }

    const variations = [{ padrao: 'sem_material', material: [], texto: serie.texto }]
    const regra = rules.material[parte]
    if (!regra || serie.porSensacao) return variations

    const has = new Set(athleteEquipment)
    const opcoes = regra.opcoes.filter((opcao) => opcao.every((m) => has.has(m)))

    for (const opcao of opcoes) {
        variations.push({
            padrao: 'serie_inteira',
            material: opcao,
            texto: `${serie.texto} · com ${materialText(opcao)}`,
        })
    }

    // Troca entre séries só existe com um bloco repetido ("vezes")
    const vezes = serie.blocos.length === 1 ? serie.blocos[0].vezes ?? 1 : 1
    const modelos = regra.porSerie?.[String(vezes)] ?? []
    for (const opcao of opcoes) {
        for (const modelo of modelos) {
            const com = modelo.flatMap((m, i) => (m === 'material' ? [i] : []))
            const sem = modelo.flatMap((m, i) => (m === 'nadando' ? [i] : []))
            const plural = (list) => (list.length > 1 ? 'séries' : 'série')
            variations.push({
                padrao: 'por_serie',
                material: opcao,
                series: modelo.map((m) => (m === 'material' ? opcao : [])),
                texto: `${serie.texto} · ${listText(com)} ${plural(com)} com ${materialText(opcao)}, ` +
                    `${listText(sem)} ${plural(sem)} nadando`,
            })
        }
    }
    return variations
}

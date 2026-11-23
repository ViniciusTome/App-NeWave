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
// Tipos de "como nadar" na série principal (nunca dois juntos)
const TIPOS_DE_INTENSIDADE = ['intensidades', 'AC', 'finalForte', 'NEG', 'POS']

// Formatos de cada série na mistura de nados: igual (costas, costas, costas),
// espelhado (medley, peito, medley) e diferentes (melhor estilo, peito, medley)

// Fases da periodização ATR: Acumulação, Transição, Realização
export const FASES = ['acumulacao', 'transicao', 'realizacao']

const NOMES = {
    pe_de_pato: 'pé de pato', pe_de_pato_peito: 'pé de pato de peito', palmar: 'palmar',
    prancha: 'prancha', pull_buoy: 'pull buoy', snorkel: 'snorkel', paraquedas: 'paraquedas',
}
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
        const maximo = rules.niveis?.[nivel]?.maxMinutosDeTreino
        if (maximo !== undefined && !(Number.isFinite(maximo) && maximo > 0)) {
            problems.push(`niveis.${nivel}.maxMinutosDeTreino precisa ser um número de minutos, ex.: 50.`)
        }
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

    for (const [nome, regra] of Object.entries(rules.intensidades ?? {})) {
        const where = `intensidades.${nome}`
        const faixa = (f) => Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === 'number' && x >= 0) && f[0] <= f[1]
        for (const [nivel, esforco] of Object.entries(regra?.esforco ?? {})) {
            if (!NIVEIS.includes(nivel)) problems.push(`${where}.esforco: "${nivel}" precisa ser um de: ${NIVEIS.join(', ')}.`)
            if (!faixa(esforco) || esforco[1] > 100) problems.push(`${where}.esforco.${nivel}: use [mínimo, máximo] em %, até 100.`)
        }
        if (!faixa(regra?.descanso)) problems.push(`${where}.descanso: use [mínimo, máximo] em segundos.`)
        if (!faixa(regra?.recuperacaoHoras)) problems.push(`${where}.recuperacaoHoras: use [mínimo, máximo] em horas.`)
        if (regra?.material !== undefined) {
            const m = regra.material
            if (!Array.isArray(m.opcoes) || m.opcoes.some((o) => !Array.isArray(o) || o.some((x) => !MATERIAIS.includes(x)))) {
                problems.push(`${where}.material.opcoes: listas com ${MATERIAIS.join(', ')}.`)
            }
            if (!Array.isArray(m.semMaterialSo) || m.semMaterialSo.some((n) => !NIVEIS.includes(n))) {
                problems.push(`${where}.material.semMaterialSo: lista de níveis (${NIVEIS.join(', ')}).`)
            }
        }
    }

    const diaDoTeste = rules.diaDoTeste
    if (diaDoTeste !== undefined) {
        const ok = Array.isArray(diaDoTeste.completarCom) && diaDoTeste.completarCom.every((s) =>
            typeof s.id === 'string' && typeof s.texto === 'string' && Array.isArray(s.blocos) &&
            s.blocos.every((b) => Number.isInteger(b.repeticoes) && Number.isInteger(b.distancia)))
        if (!ok) problems.push('diaDoTeste.completarCom: use séries como na biblioteca, ex.: { "id": "...", "texto": "10 x 50", "blocos": [{ "repeticoes": 10, "distancia": 50, "nado": "livre" }] }.')
    }
    const ajustaveis = rules.seriesAjustaveis
    if (ajustaveis !== undefined) {
        const { partes, minimo, maximo, aumentarAte = {}, minimoPorNivel = {} } = ajustaveis
        if (Object.entries(minimoPorNivel).some(([nivel, n]) => !NIVEIS.includes(nivel) || !(Number.isInteger(n) && n >= 1))) {
            problems.push(`seriesAjustaveis.minimoPorNivel: use os níveis (${NIVEIS.join(', ')}) com um número inteiro, ex.: { "iniciante": 1 }.`)
        }
        if (!Array.isArray(partes)) problems.push('seriesAjustaveis.partes precisa ser uma lista de partes.')
        if (!(Number.isInteger(minimo) && Number.isInteger(maximo) && minimo >= 1 && maximo >= minimo)) {
            problems.push('seriesAjustaveis: "minimo" e "maximo" precisam ser números inteiros, com o mínimo menor que o máximo.')
        }
        if (Object.entries(aumentarAte).some(([nivel, n]) => !NIVEIS.includes(nivel) || !(Number.isInteger(n) && n >= 0))) {
            problems.push(`seriesAjustaveis.aumentarAte: use os níveis (${NIVEIS.join(', ')}) com um número inteiro, ex.: { "iniciante": 0 }.`)
        }
    }
    const naoRepetir = rules.naoRepetirNoTreinoSeguinte
    if (naoRepetir !== undefined && (!Array.isArray(naoRepetir.partes) || naoRepetir.partes.some((x) => typeof x !== 'string'))) {
        problems.push('naoRepetirNoTreinoSeguinte.partes precisa ser uma lista de partes, ex.: ["principal", "perna"].')
    }
    if (rules.saidas !== undefined) {
        const { igualarAoA1Ate, maximoAcimaDoA1, fasesComSaidaPorIntensidade = [] } = rules.saidas
        for (const [k, v] of Object.entries({ igualarAoA1Ate, maximoAcimaDoA1 })) {
            if (v !== undefined && !(Number.isFinite(v) && v >= 0)) problems.push(`saidas.${k} precisa ser um número de segundos.`)
        }
        const longas = rules.saidas.igualarAoA1AteNasLongas
        if (longas !== undefined && !(Number.isFinite(longas.aPartirDeMetros) && Number.isFinite(longas.segundos))) {
            problems.push('saidas.igualarAoA1AteNasLongas: use { "aPartirDeMetros": 300, "segundos": 20 }.')
        }
        if (!Array.isArray(fasesComSaidaPorIntensidade) || fasesComSaidaPorIntensidade.some((f) => !FASES.includes(f))) {
            problems.push(`saidas.fasesComSaidaPorIntensidade: use fases entre ${FASES.join(', ')}.`)
        }
    }
    for (const [distancia, cfg] of Object.entries(rules.tabelaDeTempos ?? {})) {
        const where = `tabelaDeTempos.${distancia}`
        if (!(Number(distancia) > 0)) problems.push(`${where}: a chave precisa ser a distância em metros.`)
        if (!(typeof cfg?.divisor === 'number' && cfg.divisor > 0)) problems.push(`${where}.divisor precisa ser um número (ex.: 4 = teste ÷ 4).`)
        const ajustes = Object.entries(cfg?.ajustes ?? {})
        if (ajustes.length === 0) problems.push(`${where}.ajustes precisa ter pelo menos uma intensidade.`)
        for (const [nome, faixa] of ajustes) {
            if (!(Array.isArray(faixa) && faixa.length === 2 && faixa.every((x) => typeof x === 'number') && faixa[0] <= faixa[1])) {
                problems.push(`${where}.ajustes.${nome}: use [de, até] em segundos, ex.: [-3, -2].`)
            }
        }
    }

    if (rules.recuperacaoDispensada !== undefined) {
        const r = rules.recuperacaoDispensada
        if (!(Number.isInteger(r.maxTreinosPorSemana) && r.maxTreinosPorSemana >= 1) ||
            !(Number.isInteger(r.aulaAbaixoDeMinutos) && r.aulaAbaixoDeMinutos > 0) ||
            !Array.isArray(r.excetoModalidades)) {
            problems.push('recuperacaoDispensada: use { "maxTreinosPorSemana": 2, "aulaAbaixoDeMinutos": 60, "excetoModalidades": ["triatlo"] }.')
        }
    }

    if (rules.intensidadesNaPrincipal !== undefined) {
        const r = rules.intensidadesNaPrincipal
        const where = 'intensidadesNaPrincipal'
        const tipos = Object.entries(r.tipos ?? {})
        if (tipos.length === 0 || tipos.some(([t, p]) => !TIPOS_DE_INTENSIDADE.includes(t) || !(p > 0))) {
            problems.push(`${where}.tipos: pesos maiores que 0 para: ${TIPOS_DE_INTENSIDADE.join(', ')}.`)
        }
        if (!Array.isArray(r.padroes) || r.padroes.some((p) => !Array.isArray(p) || p.length === 0 || p.some((i) => !['A1', 'A2', 'A3'].includes(i)))) {
            problems.push(`${where}.padroes: listas com A1, A2 e A3, ex.: ["A1", "A2", "A1", "A3"].`)
        }
        if (r.ritmoPorRepeticao !== undefined) {
            const rr = r.ritmoPorRepeticao
            if (!Array.isArray(rr.fases) || rr.fases.some((f) => !FASES.includes(f)) ||
                !Array.isArray(rr.material) || rr.material.some((m) => !Array.isArray(m) || m.some((x) => !MATERIAIS.includes(x)))) {
                problems.push(`${where}.ritmoPorRepeticao: use { "fases": ["acumulacao"], "material": [["pe_de_pato"]] }.`)
            }
        }
        for (const [d, cfg] of Object.entries(r.ritmoPorDistancia ?? {})) {
            if (typeof cfg?.valor !== 'string' || !Array.isArray(cfg.material) ||
                cfg.material.some((m) => !Array.isArray(m) || m.some((x) => !MATERIAIS.includes(x)))) {
                problems.push(`${where}.ritmoPorDistancia.${d}: use { "valor": "30 AC", "material": [["pe_de_pato", "palmar"]] }.`)
            }
        }
        if (!Array.isArray(r.acimaDoMelhor) || r.acimaDoMelhor.some((x) => !(Number.isInteger(x) && x > 0))) {
            problems.push(`${where}.acimaDoMelhor: segundos acima do melhor, ex.: [20, 15, 10, 5].`)
        }
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
        const fracao = (v) => typeof v === 'number' && v >= 0 && v <= 1
        const porNivel = (v) => v && typeof v === 'object' && NIVEIS.every((n) => fracao(v[n]))
        if (!porNivel(m?.parteDeCrawl)) {
            problems.push(`${where}.parteDeCrawl precisa ter ${NIVEIS.join(', ')}, cada um de 0 a 1 (ex.: 0.3 = 30%).`)
        }
        if (m?.variacao !== undefined && !(fracao(m.variacao.chance) && porNivel(m.variacao.parteDeCrawl))) {
            problems.push(`${where}.variacao precisa de "chance" (0 a 1) e "parteDeCrawl" por nível (0 a 1).`)
        }
        if (m?.borboletaDividida !== undefined &&
            !(Array.isArray(m.borboletaDividida.com) && m.borboletaDividida.com.every((s) => ['costas', 'peito', 'crawl'].includes(s)))) {
            problems.push(`${where}.borboletaDividida.com precisa ser uma lista com costas, peito ou crawl.`)
        }
        if (!(Number.isInteger(m?.pesoMelhorEstilo) && m.pesoMelhorEstilo >= 1)) {
            problems.push(`${where}.pesoMelhorEstilo precisa ser um número a partir de 1 (1 = sem preferência).`)
        }
    }

    if (rules.segundaPrincipal !== undefined &&
        typeof rules.segundaPrincipal?.alternarCrawlEEstilo !== 'boolean') {
        problems.push('segundaPrincipal.alternarCrawlEEstilo precisa ser true ou false.')
    }

    if (rules.descansos !== undefined) {
        for (const nivel of NIVEIS) {
            const tabela = rules.descansos?.[nivel]
            const where = `descansos.${nivel}`
            if (tabela === null || typeof tabela !== 'object' || Object.keys(tabela).length === 0) {
                problems.push(`${where} precisa ser uma tabela, ex.: { "50": [15, 30], "100": [20, 30] }.`)
                continue
            }
            for (const [distancia, faixa] of Object.entries(tabela)) {
                const d = Number(distancia)
                if (!Number.isInteger(d) || d <= 0) problems.push(`${where}: "${distancia}" precisa ser uma distância em metros.`)
                const valid = Array.isArray(faixa) && faixa.length === 2 &&
                    faixa.every((s) => Number.isInteger(s) && s >= 0 && s <= 600) && faixa[0] <= faixa[1]
                if (!valid) {
                    problems.push(`${where}.${distancia}: use [mínimo, máximo] em segundos, ex.: [15, 30].`)
                }
            }
        }
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
        if (regra?.semMaterial !== undefined && regra.semMaterial !== 'soQuemNadaPeito') {
            problems.push(`${where}.semMaterial: por enquanto só existe "soQuemNadaPeito".`)
        }
        if (regra?.pesoComMaterial !== undefined && !(Number.isInteger(regra.pesoComMaterial) && regra.pesoComMaterial >= 1)) {
            problems.push(`${where}.pesoComMaterial precisa ser um número a partir de 1.`)
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
        // Intervalo fixo por nível, em segundos [mínimo, máximo] (ex.: série principal)
        if (regra?.porNivel !== undefined) {
            for (const nivel of NIVEIS) {
                const faixa = regra.porNivel?.[nivel]
                const valid = Array.isArray(faixa) && faixa.length === 2 &&
                    faixa.every((x) => Number.isInteger(x) && x >= 0 && x <= 600) && faixa[0] <= faixa[1]
                if (!valid) problems.push(`${where}.porNivel.${nivel}: use [mínimo, máximo] em segundos, ex.: [120, 180].`)
            }
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
function materialOptions(rules, parte, serie, athleteEquipment, athleteStrokes = [], athleteLevel = null) {
    // Material de cada série escrito no JSON (ex.: 1ª nadando, 2ª com pé de pato)
    if (serie.materialPorSerie) {
        const todos = MATERIAIS.filter((m) => serie.materialPorSerie.some((s) => s.includes(m)))
        if (todos.every((m) => athleteEquipment.includes(m))) {
            return [{ padrao: 'por_serie', series: serie.materialPorSerie, material: todos }]
        }
        return [{ padrao: 'sem_material', material: [] }]
    }
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

    // Intensidade com material próprio (A3: quase sempre c/PÉ ou c/PÉ + PALM;
    // sem material só para avançado, e raramente)
    const intensidadeComMaterial = serie.blocos.flatMap((b) => blockIntensities(rules, b))
        .map((i) => rules.intensidades?.[i]?.material).find(Boolean)
    if (intensidadeComMaterial && !obrigatorio) {
        const lista = intensidadeComMaterial.opcoes.filter(hasAll).map((m) => ({ padrao: 'serie_inteira', material: m }))
        if (intensidadeComMaterial.semMaterialSo.includes(athleteLevel)) {
            lista.push({ padrao: 'sem_material', material: [], peso: intensidadeComMaterial.pesoSemMaterial ?? 1 })
        }
        return lista
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
        if (!regra || serie.porSensacao) return [{ padrao: 'sem_material', material: [] }]
        // Sem material: sempre, a não ser que a regra diga só para quem nada peito
        // (perna: quem nada peito também treina sem pé de pato). Quem não tem
        // nenhuma das opções de material faz sem, porque não tem outro jeito.
        const semMaterial = regra.semMaterial !== 'soQuemNadaPeito' || athleteStrokes.includes('peito') ||
            opcoes.length === 0
        if (semMaterial) options.push({ padrao: 'sem_material', material: [] })
        // "pesoComMaterial": quantas vezes mais o gerador escolhe com material (ex.: 3)
        const peso = regra.pesoComMaterial ?? 1
        for (const opcao of opcoes) options.push({ padrao: 'serie_inteira', material: opcao, ...(peso > 1 && { peso }) })

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
        // Ida crawl; as voltas alternam borboleta e costas até fechar a distância.
        // Em cada piscina as voltas precisam ser em número par (borboleta, costas, ...).
        if (outro === 'idaCrawlVoltaBorboletaECostas' && has.has('borboleta') && has.has('costas')) {
            const pools = [25, 50].filter((pool) => serie.blocos.every((b) => (b.distancia / pool / 2) % 2 === 0))
            if (pools.length > 0) {
                options.push({
                    nado: 'ida_crawl_volta_borboleta_e_costas',
                    texto: 'ida crawl, voltando uma vez borboleta e outra costas',
                    piscinas: pools,
                })
            }
        }
        // Ida crawl, volta no melhor estilo. Se o melhor estilo for peito: com pé de pato
        // de peito, volta de peito; sem ele, a volta é de borboleta ou de costas.
        if (outro === 'idaCrawlVoltaMelhorEstilo') {
            const melhor = bestStrokeOf(athlete, ESTILOS.filter((s) => has.has(s)))
            if (melhor === 'peito' && athlete.equipment?.includes('pe_de_pato_peito')) {
                options.push({
                    nado: 'ida_crawl_volta_melhor_estilo', texto: 'ida crawl, volta peito (melhor estilo)',
                    trocaMaterial: { de: 'pe_de_pato', para: 'pe_de_pato_peito' },
                })
            } else if (melhor === 'peito') {
                for (const outroEstilo of ['borboleta', 'costas'].filter((s) => has.has(s))) {
                    options.push({
                        nado: 'ida_crawl_volta_melhor_estilo',
                        texto: `ida crawl, volta ${outroEstilo} (no lugar do peito, sem pé de pato de peito)`,
                    })
                }
            } else if (melhor) {
                options.push({ nado: 'ida_crawl_volta_melhor_estilo', texto: `ida crawl, volta ${melhor} (melhor estilo)` })
            }
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
        // Volta de peito na perna: o pé de pato da série vira o pé de pato de peito
        if (stroke.trocaMaterial) {
            const { de, para } = stroke.trocaMaterial
            const { trocaMaterial: _troca, texto: nadoTexto, ...strokeInfo } = stroke
            const material = serie.exige.material.map((m) => (m === de ? para : m))
            const base = serie.texto.replace(` com ${materialText(serie.exige.material)}`, '')
            variations.push({
                ...strokeInfo, padrao: 'fixo', material,
                texto: [base, nadoTexto, `com ${materialText(material)}`].join(' · '),
                // O card monta o texto da série sem o material antigo e com o nado
                textoDaSerie: `${base} com ${materialText(material)}`, nadoTexto,
            })
            continue
        }
        for (const option of materialOptions(rules, parte, serie, athlete.equipment, athlete.strokes, athlete.level)) {
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
    // Intervalo fixo por nível (série principal): o meio da faixa (PROVISÓRIO)
    const faixa = intervalRangeFor(rules, parte, serie, contexto.level)
    if (faixa) return (faixa.min + faixa.max) / 2
    let segundos = contexto.saidaSegundos
    for (const excecao of regra?.excecoes ?? []) {
        const vale = excecao.fase !== undefined
            ? excecao.fase === contexto.fase
            : excecao.repeticoesPorSerie === serie.blocos[0].repeticoes
        if (vale) segundos = Math.max(segundos, excecao.segundos)
    }
    return segundos
}

// Intervalo entre as séries que é fixo por nível (ex.: série principal: 2' para
// intermediário e avançado, 2' a 3' para iniciante), em segundos { min, max }.
// null se a série não tem várias séries ou a parte não usa intervalo por nível.
export function intervalRangeFor(rules, parte, serie, nivel) {
    if (setsOf(serie) < 2) return null
    const faixa = rules.intervalos?.[parte]?.porNivel?.[nivel]
    return faixa ? { min: faixa[0], max: faixa[1] } : null
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
    // O melhor estilo não cabe nesta série (ex.: borboleta de 200): nada de "ME" para outro
    // estilo, que o glossário diria ser o melhor do atleta
    if (athlete.bestStroke) return null
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
    // Borboleta na principal: só em repetições curtas (até 100 m)
    const borboleta = rules.borboleta
    const borboletaCabe = !borboleta || bloco.distancia <= borboleta.maiorRepeticaoNaPrincipal
    const estilos = canSwimInStroke(serie.blocos)
        ? ESTILOS.filter((s) => has.has(s) && bloco.distancia <= limitFor(rules, s, athlete.level) &&
            (s !== 'borboleta' || borboletaCabe))
        : []
    // Medley aqui é o medley individual: cada repetição um medley completo
    const medleyPools = ORDEM_MEDLEY.every((s) => has.has(s)) ? individualMedleyPools(serie.blocos) : []
    // Repetição longa demais para a borboleta inteira (ex.: 200): metade borboleta, metade
    // costas ou crawl ("BO/CO", "BO/CR"). Bom para o medley e não sobrecarrega.
    const metade = bloco.distancia / 2
    const divididas = has.has('borboleta') && !borboletaCabe && canSwimInStroke(serie.blocos) && regra.borboletaDividida &&
        metade <= (borboleta?.maiorRepeticaoNaPrincipal ?? Infinity) && metade <= limitFor(rules, 'borboleta', athlete.level) &&
        (!athlete.poolLength || metade % athlete.poolLength === 0)
        ? regra.borboletaDividida.com.filter((s) => has.has(s)).map((s) => `borboleta/${s}`)
        : []
    const nados = [...estilos, ...divididas, ...(medleyPools.length > 0 ? ['medley'] : [])]
    if (nados.length < 2) return null

    const melhor = bestStrokeOf(athlete, estilos)
    // Melhor estilo aparece mais; borboleta, menos (a dividida conta como borboleta)
    const ehBorboleta = (nado) => nado === 'borboleta' || nado.startsWith('borboleta/')
    const peso = (nado) => (nado === melhor || (ehBorboleta(nado) && athlete.bestStroke === 'borboleta') ? regra.pesoMelhorEstilo : 1) *
        (ehBorboleta(nado) ? borboleta?.pesoNaPrincipal ?? 1 : 1)
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
    const comCrawl = has.has('crawl') && bloco.distancia <= limitFor(rules, 'crawl', athlete.level)

    // Cada série: nunca o mesmo estilo duas vezes seguidas; o crawl entra em cerca de
    // parteDeCrawl das repetições (avançado 30%, intermediário 50%). Na variação
    // (1 de cada 4 séries): avançado 100% em estilo; intermediário 30% de crawl.
    // Como o crawl não repete seguido, a chance a cada repetição é c / (1 - c).
    const nivel = athlete.level ?? 'intermediario'
    const porSerie = Array.from({ length: sets }, () => {
        const variacao = regra.variacao && random() < regra.variacao.chance
        const parte = comCrawl ? (variacao ? regra.variacao.parteDeCrawl : regra.parteDeCrawl)[nivel] ?? 0.3 : 0
        const chance = parte >= 0.5 ? 1 : parte / (1 - parte)
        const lista = []
        for (let k = 0; k < reps; k++) {
            const anterior = lista[k - 1]
            const crawlPode = parte > 0 && anterior !== 'crawl'
            // Nunca o mesmo estilo seguido (nem duas com borboleta: BO/CO | BO/CR)
            const opcoes = nados.filter((n) => n !== anterior && !(anterior && ehBorboleta(n) && ehBorboleta(anterior)))
            if (crawlPode && random() < chance) lista.push('crawl')
            else lista.push(opcoes.length > 0 ? pick(opcoes) : 'crawl')
        }
        return lista
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
        // Borboleta dividida: troca na metade da repetição ("BO/CO T/100")
        ...(porSerie.flat().some((n) => n.includes('/')) && { trocaACada: metade }),
        padrao: 'sem_material',
        material: [],
        // 100 medley só existe na piscina de 25 m
        ...(usaMedley && { piscinas: medleyPools }),
        texto,
    }
}

// ---------- Descanso entre as repetições ----------

// Descanso padrão de uma repetição, pelo nível e pela distância, em segundos:
// { min, max }. As distâncias que não estão na tabela ficam entre as vizinhas
// (ex.: 150 m entre o 100 e o 200), arredondadas de 5 em 5 segundos. Abaixo da
// menor e acima da maior distância da tabela, vale a da ponta.
// Séries com "descanso" escrito no próprio bloco usam o que está escrito.
export function restFor(rules, nivel, distancia) {
    const tabela = Object.entries(rules.descansos[nivel])
        .map(([d, faixa]) => [Number(d), faixa])
        .sort((a, b) => a[0] - b[0])
    const arredonda = (s) => Math.round(s / 5) * 5
    const [primeira, ultima] = [tabela[0], tabela.at(-1)]
    if (distancia <= primeira[0]) return { min: primeira[1][0], max: primeira[1][1] }
    if (distancia >= ultima[0]) return { min: ultima[1][0], max: ultima[1][1] }
    const i = tabela.findIndex(([d]) => d >= distancia)
    const [[d0, [min0, max0]], [d1, [min1, max1]]] = [tabela[i - 1], tabela[i]]
    const t = (distancia - d0) / (d1 - d0)
    return { min: arredonda(min0 + (min1 - min0) * t), max: arredonda(max0 + (max1 - max0) * t) }
}

// ---------- Intensidades ----------

// Nome da intensidade nas regras ("forte" é o mesmo que "AA")
export function intensityName(rules, intensidade) {
    if (!intensidade) return null
    if (rules.intensidades?.[intensidade]) return intensidade
    return Object.keys(rules.intensidades ?? {}).find((k) => rules.intensidades[k].nomes?.includes(intensidade)) ?? null
}

// % do esforço máximo (do teste de 400 m) na intensidade, para o nível.
// Faixa: o meio. Intermediário sem valor nas regras: PROVISÓRIO, o meio termo
// entre o meio da faixa do iniciante e o valor do avançado.
export function effortFor(rules, intensidade, nivel) {
    const regra = rules.intensidades?.[intensityName(rules, intensidade)]
    if (!regra) return null
    const meio = (f) => (f[0] + f[1]) / 2
    if (regra.esforco[nivel]) return meio(regra.esforco[nivel])
    const { iniciante, avancado } = regra.esforco
    if (nivel === 'intermediario' && iniciante && avancado) return (meio(iniciante) + meio(avancado)) / 2
    return meio(regra.esforco.avancado ?? regra.esforco.iniciante)
}

// O atleta usa o descanso por intensidade (iniciante e recém intermediário)?
// Os outros usam a tabela por distância ("descansos").
export function usesIntensityRest(rules, athlete) {
    const lista = rules.descansoPorIntensidadePara ?? []
    if (lista.includes(athlete.level)) return true
    return athlete.level === 'intermediario' && athlete.recemIntermediario === true && lista.includes('intermediarioInicio')
}

// A série tem algum trecho na intensidade? (bloco ou trechos)
const blockIntensities = (rules, bloco) =>
    (bloco.trechos ? bloco.trechos.map((t) => t.intensidade) : [bloco.intensidade]).map((i) => intensityName(rules, i))

// ---------- Tabela de tempos (método do treinador) ----------

// Tempos de cada distância e intensidade a partir do teste de 400 m (segundos):
//   100 m: A1 = teste ÷ 4; A2 = A1 − 2"; A3 = A1 − 4"
//   200 m: A2 = teste ÷ 2; A1 = A2 + 4 a 6"; A3 = A2 − 4 a 6"
//   50 m:  (A1 do 100 ÷ 2) − 2 a 3" = A1; A2 = A1 − 2"; A3 = A1 − 4"
//   400 m: 30" acima do melhor (AC)
// Devolve { 50: { A1: [de, até], ... }, ..., 400: { AC: [de, até] } }.
export function timeTable(rules, teste400Segundos) {
    const tabela = {}
    for (const [distancia, cfg] of Object.entries(rules.tabelaDeTempos ?? {})) {
        const base = teste400Segundos / cfg.divisor
        tabela[distancia] = Object.fromEntries(
            Object.entries(cfg.ajustes).map(([nome, [de, ate]]) => [nome, [base + de, base + ate]]))
    }
    return tabela
}

// Tempo de nado de uma repetição (segundos), pela tabela de tempos. Usa o meio
// da faixa. As distâncias fora da tabela (25, 75, 150, 250, 300, 800...) são
// estimadas pelo ritmo das vizinhas. Sem intensidade, usa A2 (PROVISÓRIO).
// Devolve null para o que a tabela não cobre (solto, velocidade).
export function repSeconds(rules, tabela, distancia, intensidade) {
    const nome = intensityName(rules, intensidade ?? 'A2') ?? intensidade
    if (!['A1', 'A2', 'A3'].includes(nome)) return null
    const meio = (f) => (f[0] + f[1]) / 2
    // Ritmo por 100 m em cada distância da tabela, para essa intensidade
    const ritmos = Object.entries(tabela)
        .map(([d, valores]) => {
            const faixa = valores[nome] ?? valores.AC ?? Object.values(valores)[0]
            return [Number(d), (meio(faixa) / Number(d)) * 100]
        })
        .sort((a, b) => a[0] - b[0])
    const exata = ritmos.find(([d]) => d === distancia)
    if (exata) return (exata[1] * distancia) / 100
    let ritmo
    if (distancia < ritmos[0][0]) ritmo = ritmos[0][1]
    else if (distancia > ritmos.at(-1)[0]) ritmo = ritmos.at(-1)[1]
    else {
        const i = ritmos.findIndex(([d]) => d > distancia)
        const [[d0, r0], [d1, r1]] = [ritmos[i - 1], ritmos[i]]
        ritmo = r0 + ((r1 - r0) * (distancia - d0)) / (d1 - d0)
    }
    return (ritmo * distancia) / 100
}

// ---------- Intensidades na série principal ----------

// Escada progressiva com n partes, sempre começando no A1 e terminando no teto
// (ex.: 3 -> A1, A2, A3; 4 -> A1, A2, A1, A3, como o treinador prefere;
// 6 -> A1, A1, A2, A2, A3, A3)
export function ladder(n, teto = 'A3') {
    const niveis = teto === 'A3' ? ['A1', 'A2', 'A3'] : ['A1', 'A2']
    if (n === 1) return ['A2']
    if (n === 2) return ['A1', 'A2']
    if (n === 4) return ['A1', 'A2', 'A1', teto]
    return Array.from({ length: n }, (_, i) => niveis[Math.round((i * (niveis.length - 1)) / (n - 1))])
}

// Partes da série que recebem a intensidade: as séries de um (2x), (4x)...; os
// blocos de uma pirâmide; ou as repetições de uma série simples.
export function intensityUnits(serie) {
    const sets = setsOf(serie)
    if (sets >= 2) return { unidade: 'serie', n: sets }
    if (serie.blocos.length > 1) return { unidade: 'bloco', n: serie.blocos.length }
    return { unidade: 'repeticao', n: serie.blocos[0].repeticoes }
}

// Escolhe com peso: { nome: peso }
function pickWeighted(pesos, random) {
    const lista = Object.entries(pesos).filter(([, p]) => p > 0)
    let r = random() * lista.reduce((s, [, p]) => s + p, 0)
    for (const [nome, p] of lista) {
        r -= p
        if (r < 0) return nome
    }
    return lista.at(-1)[0]
}

// Sorteia como nadar a série principal: um tipo só (intensidades A1/A2/A3, AC,
// NEG, POS ou final forte), nunca dois juntos. Devolve { tipo, unidade, valores }
// (um valor por série, bloco ou repetição) e a variação com o material ajustado:
// A3 sempre com equipamento (c/PÉ ou c/PÉ + PALM), trocando material só entre séries.
// `proibidas` (ex.: ['A3']) vem da recuperação do treino anterior; 'AC' fica de
// fora quando o atleta ainda não tem tempos de referência (não sabe o melhor tempo).
// `tipos` (opcional) troca os pesos dos tipos pelos da etapa da periodização.
export function drawIntensities(rules, serie, variation, athlete, {
    proibidas = [], random = Math.random, fase = null, tipos: tiposDaEtapa = null,
} = {}) {
    const regra = rules.intensidadesNaPrincipal
    if (!regra) return null
    let { unidade, n } = intensityUnits(serie)
    const distancias = unidade === 'bloco' ? serie.blocos.map((b) => b.distancia) : Array(n).fill(serie.blocos[0].distancia)
    const todasAsDistancias = serie.blocos.map((b) => b.distancia)
    const repeticoesLongas = unidade === 'repeticao' && n > (regra.maxRepeticoesComIntensidade ?? 7)

    const has = new Set(athlete.equipment ?? [])
    const a3 = rules.intensidades?.A3?.material
    const opcoesA3 = (a3?.opcoes ?? [['pe_de_pato']]).filter((o) => o.every((m) => has.has(m)))
    const podeA3 = !proibidas.includes('A3') && (opcoesA3.length > 0 || a3?.semMaterialSo?.includes(athlete.level))

    // Ritmo próprio da distância nas séries simples (ex.: 400 = 30 AC c/PÉ + PALM,
    // a série toda num ritmo só)
    const proprio = unidade === 'repeticao' ? regra.ritmoPorDistancia?.[String(distancias[0])] : null
    if (proprio && !proibidas.includes('AC') && random() * 100 < (proprio.chance ?? 100)) {
        const material = proprio.material.find((m) => m.every((x) => has.has(x)))
        if (material) {
            return {
                tipo: 'AC', unidade: 'serie_toda', valores: [proprio.valor],
                variation: { ...variation, padrao: 'serie_inteira', material, series: undefined },
            }
        }
    }

    // Tipos possíveis (NEG, POS e final forte precisam de repetições de pelo menos 50 m)
    const tipos = { ...(tiposDaEtapa ?? regra.tipos) }
    if (todasAsDistancias.some((d) => d < 50)) delete tipos.NEG, delete tipos.POS, delete tipos.finalForte
    if (proibidas.includes('AC')) delete tipos.AC
    const tipo = pickWeighted(tipos, random)

    let valores
    if (tipo === 'intensidades') {
        // Série simples: um ritmo só para a série toda, ou um por repetição.
        // Um por repetição (5 x 400 = A1, A2, A1, A2, A3) é do início da temporada
        // (fase ainda não calculada: vale sempre) e sempre com equipamento.
        const porRep = regra.ritmoPorRepeticao
        const materialPorRep = porRep?.material.find((m) => m.every((x) => has.has(x)))
        const fasePermite = !fase || !porRep?.fases || porRep.fases.includes(fase)
        const ritmoUnico = unidade === 'repeticao' &&
            (random() * 100 < (regra.ritmoUnicoNasSimples ?? 0) || !fasePermite || (porRep && !materialPorRep))
        if (repeticoesLongas || ritmoUnico) {
            // Muitas repetições (ou ritmo único): a série toda numa intensidade
            unidade = 'serie_toda'
            const opcoes = podeA3 ? ['A1', 'A2', 'A3'] : ['A1', 'A2']
            valores = [opcoes[Math.floor(random() * opcoes.length)]]
        } else {
            const padroes = regra.padroes.filter((p) => p.length === n && (podeA3 || !p.includes('A3')))
            const escada = ladder(n, podeA3 ? 'A3' : 'A2')
            const opcoes = [...padroes, escada]
            valores = opcoes[Math.floor(random() * opcoes.length)]
            // Ritmo por repetição: a série toda com equipamento
            if (unidade === 'repeticao' && materialPorRep) {
                variation = { ...variation, padrao: 'serie_inteira', material: materialPorRep, series: undefined }
            }
        }
    } else if (tipo === 'AC') {
        // Diminuindo: 20, 15, 10, 5 acima do melhor (as últimas n)
        // Sem A3 (recuperação): o AC de 10" ou menos conta como A3, então fica de fora
        const escada = podeA3 ? regra.acimaDoMelhor : regra.acimaDoMelhor.filter((x) => x > 10)
        valores = (repeticoesLongas || n > escada.length) ? null : escada.slice(escada.length - n).map((x) => `${x} AC`)
        if (!valores) {
            unidade = 'serie_toda'
            valores = [podeA3 ? '10 AC' : `${Math.min(...escada)} AC`]
        }
    } else if (tipo === 'finalForte' && serie.blocos.length > 1) {
        // Pirâmides e grupos: o final forte é de cada bloco (175 NAD x 25 fo nos 200...)
        unidade = 'bloco'
        valores = todasAsDistancias.map((d) => `${d - 25} NAD x 25 fo`)
    } else if (tipo === 'finalForte') {
        unidade = 'serie_toda'
        valores = [`${distancias[0] - 25} NAD x 25 fo`]
    } else {
        // NEG ou POS: a série toda
        unidade = 'serie_toda'
        valores = [tipo]
    }

    // Tudo igual em todas as séries: vale para a série toda
    if (unidade === 'serie' && valores.every((v) => v === valores[0])) {
        unidade = 'serie_toda'
        valores = [valores[0]]
    }

    // A3 sempre com equipamento
    let ajustada = variation
    const comA3 = valores.map((v) => v === 'A3')
    if (comA3.some(Boolean) && opcoesA3.length > 0) {
        const escolhaA3 = (atual) =>
            atual?.some((m) => m === 'pe_de_pato') ? atual : opcoesA3[Math.floor(random() * opcoesA3.length)]
        if (unidade === 'serie') {
            const base = variation.series ?? Array(n).fill(variation.material)
            const series = base.map((m, i) => (comA3[i] ? escolhaA3(m) : m))
            ajustada = { ...variation, padrao: 'por_serie', series, material: MATERIAIS.filter((x) => series.some((s) => s.includes(x))) }
        } else if (unidade === 'bloco') {
            const base = variation.porBloco ?? Array(n).fill(variation.material)
            const porBloco = base.map((m, i) => (comA3[i] ? escolhaA3(m) : m))
            ajustada = { ...variation, padrao: 'piramide_alternada', porBloco, material: MATERIAIS.filter((x) => porBloco.some((s) => s.includes(x))) }
        } else {
            // Repetições ou série toda: o material não muda no meio, então a série toda vai com ele
            const material = escolhaA3(variation.material)
            ajustada = { ...variation, padrao: 'serie_inteira', material, series: undefined }
        }
    }
    return { tipo, unidade, valores, variation: ajustada }
}

// Intensidade "mais pesada" de uma série principal, para a recuperação:
// A3 e AC até 10 contam como A3; NEG, POS e final forte, como A2 (PROVISÓRIO).
export function hardestIntensity(intensidades) {
    if (!intensidades) return null
    const peso = (v) => (v === 'A3' || /^([5-9]|10) AC$/.test(v) ? 3 : v === 'A1' ? 1 : 2)
    return ['A1', 'A2', 'A3'][Math.max(...intensidades.valores.map(peso)) - 1]
}

// Quem treina pouco (até 2 vezes por semana e menos de 1 hora) não precisa da
// regra da recuperação: pode ter A3 em qualquer treino. A não ser na
// preparação para triatlo.
export function recoveryWaived(rules, athlete) {
    const r = rules.recuperacaoDispensada
    if (!r) return false
    if (r.excetoModalidades.includes(athlete.modalidade)) return false
    return athlete.trainingDays.length <= r.maxTreinosPorSemana && (athlete.aulaMinutos ?? athlete.sessionMinutes) < r.aulaAbaixoDeMinutos
}

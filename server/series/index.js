// Biblioteca de séries: um arquivo JSON para cada parte do treino.
// O gerador combina uma série de cada parte, então não existem treinos prontos.
//
// Cada série guarda só o que o treinador precisa escrever. O resto
// (metragem, distância sem parar, estilos exigidos, piscinas em que funciona)
// é calculado aqui. O guia de como cadastrar está em server/series/LEIAME.md.
import { readFileSync, existsSync } from 'node:fs'

// Partes do treino. "solto" é o nado de recuperação entre a velocidade e a
// série principal; "perna" entra nos treinos mais longos. A ordem de cada treino
// vem das regras (regras.json). Os arquivos que ainda não existem são ignorados.
export const PARTS = ['aquecimento', 'velocidade', 'solto', 'principal', 'perna', 'soltura']

// "livre": o atleta escolhe (normalmente crawl).
// "estilo": um estilo que não seja o crawl (o que o atleta nada melhor).
// "medley": cada volta num estilo, na ordem borboleta, costas, peito, crawl.
export const NADOS = ['livre', 'crawl', 'costas', 'peito', 'borboleta', 'estilo', 'medley']
// "solto": nado leve, de recuperação. "AA" (alático) = velocidade; "forte" é o mesmo que AA.
export const INTENSIDADES = ['solto', 'A1', 'A2', 'A3', 'AA', 'forte']
export const USOS = ['treino', 'teste']
export const MATERIAIS = ['pe_de_pato', 'pe_de_pato_peito', 'palmar', 'prancha', 'pull_buoy', 'snorkel', 'paraquedas']
export const PISCINAS = [25, 50]

const MEDLEY = ['borboleta', 'costas', 'peito', 'crawl']
const SERIE_KEYS = [
    'id', 'texto', 'observacao', 'vezes', 'blocos', 'usos', 'outrosNados', 'porSensacao', 'duracaoMinutos',
    'aulaAcimaDeMinutos', 'peso', 'paraQuemNadaAte', 'materialPorSerie',
]
// Além do nado escrito nos blocos, a série também pode ser feita em:
// "medley" (cada repetição num estilo: borboleta, costas, peito, crawl) ou
// "estilo" (toda no estilo do atleta: borboleta, costas ou peito).
// "melhorEstiloEMedley": as repetições alternam entre o melhor estilo e o medley.
// "idaCrawlVoltaBorboletaECostas": ida crawl; as voltas alternam borboleta e costas.
// "idaCrawlVoltaMelhorEstilo": ida crawl, volta no melhor estilo.
export const OUTROS_NADOS = [
    'medley', 'estilo', 'melhorEstiloEMedley', 'idaCrawlVoltaBorboletaECostas', 'idaCrawlVoltaMelhorEstilo',
]
const IDA_E_VOLTA = ['idaCrawlVoltaBorboletaECostas', 'idaCrawlVoltaMelhorEstilo']

// Provas de piscina: a distância de uma repetição num nado segue as provas
// oficiais. Borboleta, costas e peito vão até 200 m; medley (cada repetição
// um medley completo) é 200 ou 400 m, e 100 m só na piscina de 25 m.
// Crawl não tem limite. Ex.: não existe 400 de costas, mas existe 400 medley.
export const PROVAS = {
    estiloAte: 200,
    medley: { 25: [100, 200, 400], 50: [200, 400] },
    // 150 m em medley é sem crawl: 50 borboleta, 50 costas, 50 peito
    medleySemCrawl: [150],
}
const ESTILOS_DE_PROVA = ['costas', 'peito', 'borboleta', 'estilo']

// Medley alternado: cada repetição num estilo (precisa de repetições em múltiplo
// de 4 e cada uma até 200 m). Medley individual: cada repetição é um medley
// completo (200 ou 400 m; 100 m na piscina de 25 m).
export const canAlternateMedley = (blocos) =>
    blocos.every((b) => b.repeticoes % 4 === 0 && b.distancia <= PROVAS.estiloAte)
export const individualMedleyPools = (blocos) =>
    PISCINAS.filter((pool) => blocos.every((b) => PROVAS.medley[pool].includes(b.distancia)))
export const canSwimInStroke = (blocos) => blocos.every((b) => b.distancia <= PROVAS.estiloAte)
// Medley sem crawl (borboleta, costas, peito) em cada repetição: 150 m
export const canSwimMedleyWithoutCrawl = (blocos) => blocos.every((b) => PROVAS.medleySemCrawl.includes(b.distancia))
const BLOCO_KEYS = ['vezes', 'repeticoes', 'distancia', 'nado', 'intensidade', 'trechos', 'descanso', 'material']
const TRECHO_KEYS = ['metros', 'intensidade']

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

// Distância de cada repetição: múltiplo de 25 m, ou um tiro curto
// (5 a 20 m, ex.: 15 m) que não precisa fechar a piscina.
const isShortSprint = (distancia) => isInt(distancia, 5, 20) && distancia % 5 === 0
const isValidDistance = (distancia) =>
    isShortSprint(distancia) || (isInt(distancia, 25, 3000) && distancia % 25 === 0)

// ---------- Cálculos a partir dos blocos ----------

// Em quais piscinas a série funciona. A distância de cada repetição precisa
// fechar em piscinas inteiras; "ida X, volta Y" precisa de idas e voltas em
// pares; "volta medley" precisa de voltas suficientes para fechar o medley
// (múltiplo de 4: borboleta, costas, peito, crawl).
function poolsFor(blocos) {
    return PISCINAS.filter((pool) =>
        blocos.every((bloco) => {
            if (isShortSprint(bloco.distancia)) return true
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
        peso: serie.peso ?? 1,
        outrosNados: serie.outrosNados ?? [],
        // Metragem total da série ("vezes" repete o bloco inteiro: (2x) 4 x 25 = 200 m)
        // "vezes" na série repete o grupo de blocos: (3x) 1 x 100, 2 x 75, 3 x 50, 4 x 25
        volume: (serie.vezes ?? 1) * blocos.reduce((sum, b) => sum + (b.vezes ?? 1) * b.repeticoes * b.distancia, 0),
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

        if (serie.observacao !== undefined &&
            (typeof serie.observacao !== 'string' || serie.observacao.trim() === '' || serie.observacao.length > 200)) {
            report('"observacao" precisa ser um texto de até 200 caracteres (ou tire o campo).')
        }

        // Só em aulas mais longas que isso (ex.: 90 = acima de 1h30)
        if (serie.aulaAcimaDeMinutos !== undefined && !isInt(serie.aulaAcimaDeMinutos, 1, 240)) {
            report('"aulaAcimaDeMinutos" precisa ser um número de minutos (ex.: 90 para acima de 1h30).')
        }
        // Material de cada série do (2x), (3x)...: [[], ["pe_de_pato"]] = 1ª nadando, 2ª com pé de pato
        if (serie.materialPorSerie !== undefined) {
            const ok = Array.isArray(serie.materialPorSerie) && serie.materialPorSerie.length === (serie.vezes ?? 0) &&
                serie.materialPorSerie.every((m) => Array.isArray(m) && m.every((x) => MATERIAIS.includes(x)))
            if (!ok) report('"materialPorSerie" precisa ter o material de cada série do "vezes", ex.: [[], ["pe_de_pato"]].')
        }
        // Só para quem nada até essa distância sem parar (ex.: 100 = séries curtas para quem nada pouco)
        if (serie.paraQuemNadaAte !== undefined && !isInt(serie.paraQuemNadaAte, 25, 2000)) {
            report('"paraQuemNadaAte" precisa ser uma distância em metros (ex.: 100).')
        }
        // Frequência no sorteio: 1 é o normal; 0.25 sai bem menos (de vez em quando)
        if (serie.peso !== undefined && !(typeof serie.peso === 'number' && serie.peso > 0 && serie.peso <= 10)) {
            report('"peso" precisa ser um número maior que 0 (1 = normal; 0.25 = de vez em quando; 3 = mais vezes).')
        }

        if (serie.usos !== undefined) {
            if (!Array.isArray(serie.usos) || serie.usos.length === 0 || serie.usos.some((u) => !USOS.includes(u))) {
                report(`"usos" precisa ser uma lista com: ${USOS.join(', ')}.`)
            }
        }

        if (serie.outrosNados !== undefined) {
            const list = serie.outrosNados
            if (!Array.isArray(list) || list.length === 0 || list.some((n) => !OUTROS_NADOS.includes(n))) {
                report(`"outrosNados" precisa ser uma lista com: ${OUTROS_NADOS.join(', ')}.`)
            } else if (Array.isArray(serie.blocos) && serie.blocos.length > 0 &&
                serie.blocos.every((b) => Number.isInteger(b?.repeticoes) && Number.isInteger(b?.distancia))) {
                // Provas de piscina: o nado extra precisa ser possível na série
                const temMedley = canAlternateMedley(serie.blocos) ||
                    individualMedleyPools(serie.blocos).length > 0 || canSwimMedleyWithoutCrawl(serie.blocos)
                if ((list.includes('medley') || list.includes('melhorEstiloEMedley')) && !temMedley) {
                    report('"medley" não cabe nesta série: medley alternado precisa de repetições em múltiplo de 4 ' +
                        'de até 200 m; medley individual, repetições de 200 ou 400 m (100 m na piscina de 25 m); ' +
                        'medley sem crawl, de 150 m.')
                }
                // Ida e volta: cada repetição fecha em idas e voltas (múltiplo de 50 m)
                if (list.some((n) => IDA_E_VOLTA.includes(n)) && serie.blocos.some((b) => b.distancia % 50 !== 0)) {
                    report('ida crawl e volta em outro nado precisa de repetições em múltiplo de 50 m (ida e volta).')
                }
                if (list.includes('melhorEstiloEMedley') && !canSwimInStroke(serie.blocos)) {
                    report('"melhorEstiloEMedley" não cabe nesta série: o melhor estilo vai até 200 m (provas de piscina).')
                }
                if (list.includes('estilo') && !canSwimInStroke(serie.blocos)) {
                    report('"estilo" não cabe nesta série: borboleta, costas e peito vão até 200 m (provas de piscina).')
                }
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

        // "vezes" na série repete o grupo de blocos; com um bloco só, use "vezes" dentro do bloco
        if (serie.vezes !== undefined) {
            if (!isInt(serie.vezes, 1, 10)) {
                report('"vezes" da série precisa ser um número de 1 a 10.')
            } else if (serie.blocos.length < 2) {
                report('"vezes" da série é para repetir vários blocos juntos; com um bloco só, coloque "vezes" dentro do bloco.')
            }
        }

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
            if (bloco.vezes !== undefined && !isInt(bloco.vezes, 1, 10)) {
                report(`${where}"vezes" precisa ser um número de 1 a 10 (ex.: 2 para "(2x) 4 x 25").`)
            }
            if (!isInt(bloco.repeticoes, 1, 50)) report(`${where}"repeticoes" precisa ser um número de 1 a 50.`)
            if (!isValidDistance(bloco.distancia)) {
                report(`${where}"distancia" precisa ser em metros, múltiplo de 25 (25 a 3000), ou um tiro curto de 5 a 20 m.`)
            }
            const nados = [bloco.nado].flat()
            const nadoOk = Array.isArray(bloco.nado)
                ? bloco.nado.length === 2 && nados.every((n) => NADOS.includes(n))
                : NADOS.includes(bloco.nado)
            if (!nadoOk) {
                report(`${where}"nado" precisa ser um de (${NADOS.join(', ')}) ou ida e volta: ["crawl", "estilo"].`)
            } else if (!Array.isArray(bloco.nado) && Number.isInteger(bloco.distancia)) {
                // Provas de piscina (ida e volta diferentes é educativo, não prova: fica de fora)
                if (ESTILOS_DE_PROVA.includes(bloco.nado) && bloco.distancia > PROVAS.estiloAte) {
                    report(`${where}${bloco.nado} vai até ${PROVAS.estiloAte} m (provas de piscina). Para mais, use medley ou crawl.`)
                }
                if (bloco.nado === 'medley' && individualMedleyPools([bloco]).length === 0) {
                    report(`${where}medley é de 200 ou 400 m (100 m só na piscina de 25 m), como nas provas de piscina.`)
                }
            }
            // Uma intensidade para a repetição inteira, ou trechos (ex.: 15 m forte + 10 m solto).
            // Sem nenhum dos dois, a intensidade fica em aberto (definida na hora de gerar o treino).
            if (bloco.trechos !== undefined) {
                if (bloco.intensidade !== undefined) {
                    report(`${where}use "intensidade" ou "trechos", não os dois.`)
                }
                validateTrechos(bloco, (message) => report(`${where}${message}`))
            } else if (bloco.intensidade !== undefined && !INTENSIDADES.includes(bloco.intensidade)) {
                report(`${where}"intensidade" precisa ser uma de: ${INTENSIDADES.join(', ')} (ou use "trechos", ou deixe em aberto).`)
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
            (b) => b && isValidDistance(b.distancia) && [b.nado].flat().every((n) => NADOS.includes(n)),
        )
        if (blocksOk && poolsFor(serie.blocos).length === 0) {
            report('não fecha em nenhuma piscina (25 ou 50 m). Confira a distância e as idas e voltas.')
        }
    })

    return problems
}

// Trechos de uma repetição: [{ "metros": 15, "intensidade": "forte" }, { "metros": 10, "intensidade": "solto" }]
function validateTrechos(bloco, report) {
    const trechos = bloco.trechos
    if (!Array.isArray(trechos) || trechos.length < 2) {
        return report('"trechos" precisa de pelo menos dois trechos, ex.: [{ "metros": 15, "intensidade": "forte" }, ...].')
    }
    let total = 0
    trechos.forEach((trecho, t) => {
        if (trecho === null || typeof trecho !== 'object' || Array.isArray(trecho)) {
            return report(`trecho ${t + 1} precisa ser um objeto { "metros": ..., "intensidade": ... }.`)
        }
        for (const key of Object.keys(trecho)) {
            if (!TRECHO_KEYS.includes(key)) report(`trecho ${t + 1}: campo "${key}" não existe (campos: metros, intensidade).`)
        }
        if (!isInt(trecho.metros, 5, 3000) || trecho.metros % 5 !== 0) {
            report(`trecho ${t + 1}: "metros" precisa ser múltiplo de 5.`)
        }
        if (!INTENSIDADES.includes(trecho.intensidade)) {
            report(`trecho ${t + 1}: "intensidade" precisa ser uma de: ${INTENSIDADES.join(', ')}.`)
        }
        total += Number.isInteger(trecho.metros) ? trecho.metros : 0
    })
    if (Number.isInteger(bloco.distancia) && total !== bloco.distancia) {
        report(`os trechos somam ${total} m, mas a "distancia" é ${bloco.distancia} m.`)
    }
}

// A série vale para uma aula desse tamanho? (ex.: 400 solto só acima de 1h30)
export const fitsSession = (serie, minutos) =>
    serie.aulaAcimaDeMinutos === undefined || minutos > serie.aulaAcimaDeMinutos

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

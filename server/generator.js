// Gerador de treinos — PRIMEIRA VERSÃO.
//
// Junta a anamnese, a biblioteca de séries (server/series/*.json) e as regras
// (server/series/regras.json) para montar os treinos dos próximos dias.
//
// Tudo que está marcado com PROVISÓRIO é estimativa minha, para o gerador já
// funcionar, e vai ser trocado pelos critérios do treinador:
// - o tempo de cada série (ritmo por intensidade);
// - quanto do tempo de aula vai para cada parte;
// - intensidade e fase da temporada das séries principais (ainda ignoradas);
// - o valor usado dentro das faixas de descanso (o meio da faixa).
import { fitsSession } from './series/index.js'
import {
    allowedAsSecondMain, drawMixedStrokes, intervalBetweenSets, intervalRangeFor, partsForLevel, pauseOf, restFor,
    seriesVariations,
} from './series/regras.js'

// PROVISÓRIO: tempo nos 400 m de quem ainda não tem teste (centésimos)
const DEFAULT_400 = { iniciante: 9 * 6000, intermediario: 7 * 6000, avancado: 5 * 6000 + 3000 }

// PROVISÓRIO: quanto mais lento (> 1) ou mais rápido (< 1) que o ritmo do teste
// de 400 m é cada intensidade. Sem intensidade definida: entre A1 e A2.
const RITMO = { solto: 1.3, A1: 1.2, A2: 1.1, A3: 1.0, forte: 0.9 }
const RITMO_SEM_INTENSIDADE = 1.15
const RITMO_PERNA = 1.6 // pernada é bem mais lenta que o nado
const RITMO_PE_DE_PATO = 0.9 // pé de pato deixa mais rápido

// PROVISÓRIO: parte do tempo de aula (descontadas as pausas) de cada parte do
// treino. As partes que o treino não tem são ignoradas e o resto é dividido
// na mesma proporção. Com duas séries principais, cada uma fica com metade.
const TEMPO_DAS_PARTES = { aquecimento: 15, velocidade: 12, solto: 5, principal: 50, perna: 12, soltura: 6 }

const DIAS_PADRAO = 14 // PROVISÓRIO: gera duas semanas de treinos

// Distância que o atleta aguenta sem parar, pela faixa da anamnese (o começo
// da faixa: quem marcou "100 a 200 m" tem garantidos 100 m)
const SEM_PARAR = {
    ate_50: 50, '50_100': 50, '100_200': 100, '200_400': 200, '400_1000': 400, '1000_2000': 1000, mais_2000: 2000,
}

export const NOMES_DAS_PARTES = {
    aquecimento: 'Aquecimento', velocidade: 'Velocidade', solto: 'Solto', principal: 'Série principal',
    perna: 'Perna', soltura: 'Soltura',
}

// ---------- Tempo estimado de uma série ----------

// Segundos que o atleta leva na série, com os descansos. `pace` = segundos por
// 100 m no ritmo do teste de 400 m.
export function estimateSeconds(rules, parte, serie, variation, athlete, pace) {
    if (serie.porSensacao) return serie.duracaoMinutos * 60

    const comPe = variation.material.includes('pe_de_pato') || variation.material.includes('pe_de_pato_peito')
    const fator = (parte === 'perna' ? RITMO_PERNA : 1) * (comPe ? RITMO_PE_DE_PATO : 1)
    // Intervalo entre as séries: troca o descanso da última repetição de cada série
    const intervalo = (saidaSegundos) =>
        intervalBetweenSets(rules, parte, serie, { fase: null, level: athlete.level, saidaSegundos })
    let total = 0
    let ultimo = { saida: 0, descanso: 0 }
    for (const bloco of serie.blocos) {
        const ritmo = bloco.trechos
            ? bloco.trechos.reduce((s, t) => s + t.metros * (RITMO[t.intensidade] ?? RITMO_SEM_INTENSIDADE), 0) / bloco.distancia
            : RITMO[bloco.intensidade] ?? RITMO_SEM_INTENSIDADE
        const nado = (bloco.distancia / 100) * pace * ritmo * fator
        const { min, max } = restFor(rules, athlete.level, bloco.distancia)
        const descanso = bloco.descanso ?? (min + max) / 2 // PROVISÓRIO: meio da faixa
        const vezes = bloco.vezes ?? 1
        total += vezes * bloco.repeticoes * (nado + descanso)
        // "(4x) 3 x 200": intervalo entre as séries do bloco
        if (vezes > 1) total += (vezes - 1) * Math.max(0, intervalo(nado + descanso) - descanso)
        ultimo = { saida: nado + descanso, descanso }
    }
    // "(3x) 1 x 100, 2 x 75, ...": o grupo se repete, com intervalo entre as séries
    const vezesDaSerie = serie.vezes ?? 1
    if (vezesDaSerie > 1) {
        total = total * vezesDaSerie + (vezesDaSerie - 1) * Math.max(0, intervalo(ultimo.saida) - ultimo.descanso)
    }
    return total
}

// ---------- Texto do card ----------

// Coloca o "m" de metros depois das distâncias do texto da série:
// "300 livre" -> "300 m livre"; "(2x) 10 x 100" -> "(2x) 10 x 100 m";
// "os 400 com pé de pato" -> "os 400 m com pé de pato". O que já tem "m" fica igual.
export function withMeters(texto) {
    return texto
        .replace(/\b(\d+) x (\d+)\b(?! ?m\b)/g, '$1 x $2 m')
        .replace(/^(\d+) (?![xm]\b)(?=\p{L})/u, '$1 m ')
        .replace(/\bos (\d+)\b(?! ?m\b)/g, 'os $1 m')
}

// ---------- Abreviações do card (as mesmas do glossário) ----------

const MATERIAL_ABREV = {
    pe_de_pato: 'PÉ', pe_de_pato_peito: 'PÉ de peito', palmar: 'PAL', pull_buoy: 'BOIA',
    snorkel: 'SNK', paraquedas: 'PARA', prancha: 'prancha',
}
const NADO_ABREV = { crawl: 'CR', costas: 'CO', peito: 'PE', borboleta: 'BO', medley: 'MD', livre: 'livre' }

// ["pe_de_pato", "palmar"] -> "c/ PÉ + PAL"; [] -> "NAD"
export const materialAbbrev = (material) =>
    material.length === 0 ? 'NAD' : `c/ ${material.map((m) => MATERIAL_ABREV[m]).join(' + ')}`

// Troca as palavras do texto pelas abreviações do treinador:
// "100 indo crawl, voltando estilo" -> "100 indo CR, voltando estilo";
// "com pé de pato + palmar" -> "c/ PÉ + PAL"; "nadando" -> "NAD"
export function abbreviate(texto) {
    return texto
        .replace(/\bpé de pato de peito\b/g, 'PÉ de peito')
        .replace(/\bpé de pato\b/g, 'PÉ')
        .replace(/\bpalmar\b/g, 'PAL')
        .replace(/\bpull buoy\b/g, 'BOIA')
        .replace(/\bsnorkel\b/g, 'SNK')
        .replace(/\bparaquedas\b/g, 'PARA')
        .replace(/\bcom (?=PÉ|PAL|BOIA|SNK|PARA|prancha)/g, 'c/ ')
        .replace(/\bnadando\b/g, 'NAD')
        // "costas (melhor estilo)" -> "ME" (o glossário mostra qual é o do atleta)
        .replace(/\b(?:crawl|costas|peito|borboleta) \(melhor estilo\)/g, 'ME')
        .replace(/\bmelhor estilo\b/g, 'ME')
        .replace(/\bcrawl\b/g, 'CR')
        .replace(/\bcostas\b/g, 'CO')
        .replace(/(?<!PÉ de )\bpeito\b/g, 'PE') // "PÉ de peito" (o material) fica por extenso
        .replace(/\bborboleta\b/g, 'BO')
        .replace(/\bmedley\b/g, 'MD')
        .replace(/\bperna\b/g, 'PR')
}

// "c/2'" ou "c/2' a 3'" (intervalo entre as séries)
const minutosCurto = (s) => (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`)
const intervalAbbrev = (faixa) =>
    faixa && `c/${faixa.min === faixa.max ? minutosCurto(faixa.min) : `${minutosCurto(faixa.min)} a ${minutosCurto(faixa.max)}`}`

// Texto do card, abreviado como no caderno do treinador.
// - Série simples: uma linha ("5 x 400 m · c/ PAL").
// - Quando o nado ou o material muda entre as séries de um (2x), (4x)...:
//   cabeçalho e uma linha por série
//     (4x) 3 x 200 m · c/2'
//     1ª série: NAD · MD / PE / MD
//     2ª série: c/ PÉ · ME / MD / ME
// - Pirâmides e grupos: uma metragem por linha, com o material do bloco.
// `intervalo` = { min, max } do intervalo entre as séries (ou null).
export function cardText(serie, variation, intervalo = null) {
    const c = intervalAbbrev(intervalo)
    const nadoDaSerie = variation.nados || variation.porSerie || !variation.nado || variation.nado === 'livre'
        ? null : abbreviate(variation.texto.slice(serie.texto.length).split(' · ')[1] ?? '')
    const materialDaSerie = ['serie_inteira', 'obrigatorio'].includes(variation.padrao)
        ? materialAbbrev(variation.material) : null

    // Pirâmides e grupos
    if (serie.blocos.length > 1) {
        const linhas = []
        const cabecalho = [(serie.vezes ?? 1) > 1 ? `(${serie.vezes}x)` : null, c].filter(Boolean).join(' · ')
        if (cabecalho) linhas.push(cabecalho)
        const alternada = variation.padrao === 'piramide_alternada'
        serie.blocos.forEach((bloco, i) => {
            const vezes = bloco.vezes > 1 ? `(${bloco.vezes}x) ` : ''
            let linha = `${vezes}${bloco.repeticoes} x ${bloco.distancia} m`
            const material = variation.porBloco?.[i]
            if (material?.length > 0) linha += ` · ${materialAbbrev(material)}`
            else if (alternada) linha += ' · NAD'
            linhas.push(linha)
        })
        const resto = [nadoDaSerie, materialDaSerie].filter(Boolean).join(' · ')
        if (resto) linhas.push(resto)
        return linhas.join('\n')
    }

    const base = abbreviate(withMeters(serie.texto))
    const porSerie = variation.series || variation.nados || variation.porSerie
    if (!porSerie) {
        // Série simples: o texto da variação, abreviado, mais o intervalo
        return [abbreviate(withMeters(variation.texto)), c].filter(Boolean).join(' · ')
    }

    // Uma linha por série
    const cabecalho = [base, nadoDaSerie, materialDaSerie, c].filter(Boolean).join(' · ')
    const linhas = porSerie.map((_, i) => {
        const material = variation.series ? materialAbbrev(variation.series[i]) : null
        let nados = null
        if (variation.porSerie) {
            // O melhor estilo aparece como ME
            const daSerie = variation.porSerie[i].map((n) => (n === variation.melhorEstilo ? 'ME' : NADO_ABREV[n] ?? n))
            nados = daSerie.every((n) => n === daSerie[0]) ? daSerie[0] : daSerie.join(' / ')
        } else if (variation.nados) {
            nados = NADO_ABREV[variation.nados[i]] ?? variation.nados[i]
        }
        return `${ORDINAIS[i]} série: ${[material, nados].filter(Boolean).join(' · ')}`
    })
    return [cabecalho, ...linhas].join('\n')
}

const ORDINAIS = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª']

// "2' de intervalo entre as séries" / "2' a 3' de intervalo entre as séries"
const minutos = (s) => (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`)
function intervalText(faixa) {
    if (!faixa) return null
    const valor = faixa.min === faixa.max ? minutos(faixa.min) : `${minutos(faixa.min)} a ${minutos(faixa.max)}`
    return `${valor} de intervalo entre as séries`
}

// ---------- Escolha das séries ----------

// O atleta pode fazer essa série? (distância sem parar, estilos, piscina, tempo de aula)
function seriesFits(serie, athlete) {
    if (!serie.usos.includes('treino')) return false
    if (!fitsSession(serie, athlete.sessionMinutes)) return false
    if (!serie.piscinas.includes(athlete.poolLength)) return false
    if (serie.maiorDistancia > SEM_PARAR[athlete.continuousDistance]) return false
    if (!serie.exige.estilos.every((s) => athlete.strokes.includes(s))) return false
    if (serie.exige.outroEstilo && !athlete.strokes.some((s) => s !== 'crawl')) return false
    return true
}

// A variação cabe para o atleta? (material que ele tem, piscina)
function variationFits(variation, athlete) {
    if (!variation.material.every((m) => athlete.equipment.includes(m))) return false
    if (variation.piscinas && !variation.piscinas.includes(athlete.poolLength)) return false
    return true
}

// Sorteio com peso: [{ item, peso }]
function weightedPick(options, random) {
    const total = options.reduce((s, o) => s + o.peso, 0)
    let r = random() * total
    for (const o of options) {
        r -= o.peso
        if (r < 0) return o.item
    }
    return options.at(-1).item
}

// Escolhe a série e a variação de uma parte, perto do tempo da parte.
// Evita as séries usadas nos últimos treinos e, na 2ª principal, segue a regra
// de alternar crawl e estilo.
function pickForPart({ rules, library, parte, budget, athlete, pace, random, recentes, primeiraPrincipal }) {
    const candidatas = []
    for (const serie of library[parte] ?? []) {
        if (!seriesFits(serie, athlete)) continue
        if (primeiraPrincipal && serie.id === primeiraPrincipal.serie.id) continue
        let variations = seriesVariations(rules, parte, serie, athlete).filter((v) => variationFits(v, athlete))
        const mistura = drawMixedStrokes(rules, parte, serie, athlete, random)
        if (mistura && variationFits(mistura, athlete)) variations.push(mistura)
        if (primeiraPrincipal) {
            variations = variations.filter((variation) =>
                allowedAsSecondMain(rules, primeiraPrincipal, { serie, variation }, athlete.strokes))
        }
        if (variations.length === 0) continue
        // Tempo da série: o da variação sem material (o material muda pouco o tempo)
        const segundos = estimateSeconds(rules, parte, serie, variations[0], athlete, pace)
        candidatas.push({ serie, variations, segundos })
    }
    if (candidatas.length === 0) return null

    // As que mais se aproximam do tempo da parte; as usadas recentemente perdem prioridade
    // Passar do tempo é pior que ficar um pouco abaixo (a aula tem hora para acabar)
    const distancia = (c) => (c.segundos > budget ? 1.5 : 1) * Math.abs(c.segundos - budget) *
        (recentes.has(c.serie.id) ? 3 : 1)
    const melhores = candidatas.sort((a, b) => distancia(a) - distancia(b)).slice(0, 3)
    const escolhida = weightedPick(melhores.map((c) => ({ item: c, peso: c.serie.peso })), random)
    const variation = weightedPick(escolhida.variations.map((v) => ({ item: v, peso: v.peso ?? 1 })), random)
    const segundos = estimateSeconds(rules, parte, escolhida.serie, variation, athlete, pace)
    return { serie: escolhida.serie, variation, segundos }
}

// ---------- Datas ----------

const toIso = (date) => date.toISOString().slice(0, 10)

// Próximos dias de treino (dias da semana da anamnese), a partir de hoje
export function trainingDates(today, trainingDays, dias = DIAS_PADRAO) {
    const start = new Date(`${today}T12:00:00Z`)
    const dates = []
    for (let i = 0; i < dias; i++) {
        const day = new Date(start.getTime() + i * 86_400_000)
        if (trainingDays.includes(day.getUTCDay())) dates.push(toIso(day))
    }
    return dates
}

// ---------- Montagem ----------

// Monta um treino: uma série para cada parte da estrutura do nível e do tempo de aula.
function buildTraining({ rules, library, athlete, pace, random, recentes }) {
    const estrutura = partsForLevel(rules, athlete.level, athlete.sessionMinutes)
    const pausas = estrutura.map((p) => pauseOf(rules, p)).filter(Boolean)
    const segundosLivres = (athlete.sessionMinutes - pausas.reduce((s, p) => s + p.minutos, 0)) * 60
    const somaPesos = estrutura.filter((p) => !pauseOf(rules, p)).reduce((s, p) => s + (TEMPO_DAS_PARTES[p] ?? 0), 0)
    const principais = estrutura.filter((p) => p === 'principal').length

    const escolhas = new Map() // posição na estrutura -> escolha
    const escolher = (i, budget, primeiraPrincipal = null) => {
        const parte = estrutura[i]
        const escolha = pickForPart({ rules, library, parte, budget, athlete, pace, random, recentes, primeiraPrincipal })
        if (escolha) {
            escolhas.set(i, escolha)
            recentes.add(escolha.serie.id)
        }
        return escolha
    }

    // 1º as partes que não são a principal, cada uma com a sua parte do tempo
    let usado = 0
    estrutura.forEach((parte, i) => {
        if (parte === 'principal' || pauseOf(rules, parte)) return
        const escolha = escolher(i, (segundosLivres * (TEMPO_DAS_PARTES[parte] ?? 0)) / somaPesos)
        if (escolha) usado += escolha.segundos
    })
    // 2º a série principal fica com o tempo que sobrou (dividido se forem duas)
    const budgetPrincipal = Math.max(0, segundosLivres - usado) / Math.max(principais, 1)
    let primeiraPrincipal = null
    estrutura.forEach((parte, i) => {
        if (parte !== 'principal') return
        const escolha = escolher(i, budgetPrincipal, primeiraPrincipal)
        if (escolha && !primeiraPrincipal) primeiraPrincipal = escolha
    })

    // Monta na ordem do treino
    const partes = []
    estrutura.forEach((parte, i) => {
        const pausa = pauseOf(rules, parte)
        if (pausa) {
            partes.push({ parte, titulo: 'Hidratação', texto: pausa.texto, metros: 0, minutos: pausa.minutos })
            return
        }
        const escolha = escolhas.get(i)
        if (!escolha) return // nenhuma série da biblioteca serve para esse atleta
        const segunda = parte === 'principal' && partes.some((p) => p.parte === 'principal')
        const intervalo = intervalText(intervalRangeFor(rules, parte, escolha.serie, athlete.level))
        partes.push({
            parte,
            titulo: segunda ? '2ª série principal' : NOMES_DAS_PARTES[parte],
            serieId: escolha.serie.id,
            texto: cardText(escolha.serie, escolha.variation, intervalRangeFor(rules, parte, escolha.serie, athlete.level)),
            ...(intervalo && { intervalo }),
            nado: escolha.variation.nado,
            material: escolha.variation.material,
            ...(escolha.serie.observacao && { observacao: escolha.serie.observacao }),
            metros: escolha.serie.volume,
            minutos: Math.round(escolha.segundos / 60),
        })
    })
    return partes
}

// Gera os treinos dos próximos dias para o atleta.
// `athlete` = respostas da anamnese + { level } (nível calculado) + { time400 }.
// `random` permite repetir o sorteio nos testes.
export function generateTrainings({ rules, library, athlete, today, random = Math.random, dias = DIAS_PADRAO }) {
    const tempo400 = athlete.time400?.hundredths ?? DEFAULT_400[athlete.level]
    const pace = tempo400 / 4 / 100 // segundos por 100 m
    const recentes = new Set()

    return trainingDates(today, athlete.trainingDays, dias).map((date, i) => {
        // Só as séries dos últimos 2 treinos contam como "recentes"
        if (i % 2 === 0) recentes.clear()
        const partes = buildTraining({ rules, library, athlete, pace, random, recentes })
        return {
            date,
            title: `Treino ${i + 1}`,
            partes,
            metros: partes.reduce((s, p) => s + p.metros, 0),
            minutos: partes.reduce((s, p) => s + p.minutos, 0),
        }
    })
}

// Texto de cada parte do jeito que os campos antigos do treino guardam
// (aquecimento, velocidade, série principal, soltura), para o histórico e o feedback.
export function legacyFields(partes) {
    const juntar = (nomes) => partes.filter((p) => nomes.includes(p.parte)).map((p) => p.texto).join('\n')
    return {
        warmUp: juntar(['aquecimento']),
        speed: juntar(['velocidade', 'solto']),
        mainSeries: juntar(['principal', 'hidratacao', 'perna']),
        release: juntar(['soltura']),
    }
}


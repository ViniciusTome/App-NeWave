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
import { describe, fitsSession } from './series/index.js'
import {
    allowedAsSecondMain, drawMixedStrokes, effortFor, intensityName, intervalBetweenSets, intervalRangeFor,
    partsForLevel, pauseOf, repSeconds, restFor, seriesVariations, timeTable, usesIntensityRest,
    drawIntensities, hardestIntensity, recoveryWaived,
} from './series/regras.js'

// PROVISÓRIO: tempo nos 400 m de quem ainda não tem teste (centésimos)
const DEFAULT_400 = { iniciante: 9 * 6000, intermediario: 7 * 6000, avancado: 5 * 6000 + 3000 }

// Ritmo de cada intensidade = tempo do teste de 400 m ÷ % do esforço máximo
// (regras.json, "intensidades"). Sem intensidade definida (série principal,
// por enquanto): PROVISÓRIO, como A2. "solto": PROVISÓRIO, 60% do esforço.
const ESFORCO_SOLTO = 60
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

// Quanto mais lento que o ritmo do teste: 100 ÷ % do esforço (A2 avançado: 100/80 = 1,25)
function paceFactor(rules, intensidade, athlete) {
    if (intensidade === 'solto') return 100 / ESFORCO_SOLTO
    const esforco = effortFor(rules, intensidade ?? 'A2', athlete.level) ?? effortFor(rules, 'A2', athlete.level)
    return 100 / esforco
}

// Descanso de uma repetição: o escrito no bloco; senão, para iniciante e recém
// intermediário, o da intensidade; para os outros, o da tabela por distância.
// Dentro da faixa, o meio (PROVISÓRIO).
function blockRest(rules, bloco, athlete) {
    if (bloco.descanso !== undefined) return bloco.descanso
    const meio = (f) => (f[0] + f[1]) / 2
    const intensidade = intensityName(rules, bloco.trechos ? bloco.trechos[0].intensidade : bloco.intensidade)
    let descanso
    if (intensidade && usesIntensityRest(rules, athlete)) descanso = meio(rules.intensidades[intensidade].descanso)
    else {
        const { min, max } = restFor(rules, athlete.level, bloco.distancia)
        descanso = (min + max) / 2
    }
    // Quem nada pouco sem parar (até 400 m) descansa pelo menos 20 a 30 segundos
    const minimo = rules.descansoMinimo
    if (minimo && intensidade !== 'solto' && (SEM_PARAR[athlete.continuousDistance] ?? Infinity) <= minimo.paraQuemNadaAte) {
        descanso = Math.max(descanso, minimo.segundos[intensidade] ?? minimo.segundos.outras ?? 0)
    }
    // Acumulação 1: intervalos maiores (descanso a mais), menos no solto
    if (athlete.descansoExtra && intensidade !== 'solto') descanso += athlete.descansoExtra
    return descanso
}

// ---------- Saída ----------

const de5em5 = (s) => Math.round(s / 5) * 5

// Melhor tempo estimado numa distância (100%), pela tabela de percentuais:
// tempo = melhor × (1 + (100 − esforço) ÷ 100). Parte do tempo do A1 e do esforço do A1.
export function bestTimeFor(rules, athlete, distancia) {
    if (distancia === 400 && athlete.teste400) return athlete.teste400
    const a1 = repSeconds(rules, athlete.tabela, distancia, 'A1')
    const esforco = effortFor(rules, 'A1', athlete.level)
    if (a1 === null || !esforco) return null
    return a1 / (1 + (100 - esforco) / 100)
}

// Saída de uma repetição: o tempo que o atleta tem que fazer + o descanso,
// arredondada de 5 em 5 segundos (para o mais perto).
// - A1/A2/A3: tabela de tempos.
// - "30 AC": melhor tempo (teste nos 400; estimado nas outras distâncias) + 30".
// - NEG, POS e final forte: tempo do A2 + 20" a 30" (50 e 100 m).
// null quando não dá para calcular.
export function saidaFor(rules, athlete, bloco, valor) {
    if (!athlete.tabela || !valor) return null
    const intensidade = /^A[123]$/.test(valor) ? valor : null
    const ac = /^(\d+) AC$/.exec(valor)
    const ritmoLivre = valor === 'NEG' || valor === 'POS' || / NAD x 25 fo$/.test(valor)
    let nado = null
    if (intensidade) nado = repSeconds(rules, athlete.tabela, bloco.distancia, intensidade)
    else if (ac) {
        const melhor = bestTimeFor(rules, athlete, bloco.distancia)
        if (melhor !== null) nado = melhor + Number(ac[1])
    } else if (ritmoLivre) nado = repSeconds(rules, athlete.tabela, bloco.distancia, 'A2')
    if (nado === null) return null
    const regra = rules.saidas?.negPosFinalForte
    const descanso = ritmoLivre && regra && bloco.distancia <= regra.ateMetros
        ? (regra.descanso[0] + regra.descanso[1]) / 2
        : blockRest(rules, { ...bloco, intensidade: intensidade ?? (ritmoLivre ? 'A2' : 'A3') }, athlete)
    return de5em5(nado + descanso)
}

// Saída da velocidade: avançado nos 25 m a cada 30"; nos outros casos 1/1
// (o tempo forte estimado + o mesmo tempo de descanso).
export function saidaVelocidade(rules, athlete, bloco) {
    const cfg = rules.saidas?.velocidade
    if (!cfg) return null
    // Realização: o avançado força mais nos 25 m (cd 25")
    const fixa = (athlete.velocidade25 && athlete.level === 'avancado' && bloco.distancia === 25 ? athlete.velocidade25 : null) ??
        cfg[athlete.level]?.[String(bloco.distancia)]
    if (fixa) return fixa
    if (!athlete.tabela) return null
    const melhor50 = bestTimeFor(rules, athlete, 50)
    if (melhor50 === null) return null
    const nado = (melhor50 * bloco.distancia) / 50
    return Math.max(5, de5em5(nado * (1 + (cfg.descansoPorNado ?? 1))))
}

// Sem tempos de referência (sem teste de 400 m) não dá para montar a saída:
// no lugar dela vai o descanso entre as repetições ("c/20\" de descanso").
export function descansoFor(rules, athlete, bloco, valor) {
    const intensidade = /^A[123]$/.test(valor ?? '') ? valor : null
    const ritmoLivre = valor === 'NEG' || valor === 'POS' || / NAD x 25 fo$/.test(valor ?? '')
    const regra = rules.saidas?.negPosFinalForte
    const segundos = ritmoLivre && regra && bloco.distancia <= regra.ateMetros
        ? (regra.descanso[0] + regra.descanso[1]) / 2
        : blockRest(rules, { ...bloco, intensidade: intensidade ?? (ritmoLivre ? 'A2' : (valor ? 'A3' : bloco.intensidade)) }, athlete)
    return Math.max(5, de5em5(segundos))
}
const descansoText = (segundos) =>
    `c/${segundos >= 60 ? minutosCurto(segundos) : `${segundos}"`} de descanso`

// Os descansos de cada parte com intensidade, no mesmo formato das saídas
function descansosDaSerie(rules, athlete, serie, intensidades) {
    if (!intensidades) return null
    const { unidade, valores } = intensidades
    const marca = (b, v) => descansoText(descansoFor(rules, athlete, b, v))
    if (unidade === 'bloco') return serie.blocos.map((b, i) => marca(b, valores[i]))
    if (serie.blocos.length > 1) return { porBloco: serie.blocos.map((b) => valores.map((v) => marca(b, v))) }
    return valores.map((v) => marca(serie.blocos[0], v))
}

// Sem tempos de referência o atleta não sabe o tempo do A1, A2, A3: no card vai
// o ritmo por extenso, com o quanto do máximo
// ("ritmo leve (60-70% do seu máximo)"), com o esforço do nível
export function rhythmLabel(rules, athlete, valor) {
    const nome = rules.semTempos?.nomes?.[valor]
    if (!nome) return valor
    const esforco = rules.intensidades?.[valor]?.esforco
    const faixa = esforco?.[athlete.level === 'avancado' ? 'avancado' : 'iniciante'] ?? esforco?.iniciante
    if (!faixa) return nome
    return `${nome} (${faixa[0] === faixa[1] ? faixa[0] : `${faixa[0]}-${faixa[1]}`}% do seu máximo)`
}

function comoMostrar(rules, athlete, intensidades) {
    if (!intensidades || athlete.tabela || !rules.semTempos?.nomes) return intensidades
    return { ...intensidades, valores: intensidades.valores.map((v) => rhythmLabel(rules, athlete, v)) }
}

// Saída (segundos) ou descanso (texto) do jeito que vai no card
const marcaText = (x) => (typeof x === 'number' ? `cd ${saidaText(x)}` : x)

// 90 -> 1'30"; 45 -> 45"
export const saidaText = (segundos) =>
    segundos >= 60 ? `${Math.floor(segundos / 60)}'${String(segundos % 60).padStart(2, '0')}"` : `${segundos}"`

// Saídas de cada parte que recebeu intensidade (série, bloco, repetição ou a série toda)
export function saidasDaSerie(rules, athlete, serie, intensidades, fase = null) {
    if (!intensidades) return null
    const { unidade, valores } = intensidades
    if (unidade === 'bloco') return serie.blocos.map((b, i) => saidaFor(rules, athlete, b, valores[i]))
    // Grupos: cada distância com a sua saída -> { porBloco: [[saídas de cada série] de cada bloco] }
    if (serie.blocos.length > 1) {
        return {
            porBloco: serie.blocos.map((b) => ajustarAoA1(rules, valores,
                valores.map((v) => saidaFor(rules, athlete, b, v)), saidaFor(rules, athlete, b, 'A1'), fase, b.distancia)),
        }
    }
    const bloco = serie.blocos[0]
    return ajustarAoA1(rules, valores, valores.map((v) => saidaFor(rules, athlete, bloco, v)),
        saidaFor(rules, athlete, bloco, 'A1'), fase, bloco.distancia)
}

// A2/A3 perto do A1: mesma saída do A1 (na transição, cada intensidade com a sua).
// Acima do A1 (iniciante, que descansa mais no A3): só um pouco acima.
function ajustarAoA1(rules, valores, saidas, saidaA1, fase, distancia) {
    const cfg = rules.saidas
    if (!cfg || !saidaA1) return saidas
    const porIntensidade = (cfg.fasesComSaidaPorIntensidade ?? []).includes(fase)
    const longas = cfg.igualarAoA1AteNasLongas
    const igualarAte = longas && distancia >= longas.aPartirDeMetros ? longas.segundos : (cfg.igualarAoA1Ate ?? 0)
    return saidas.map((s, i) => {
        if (!s || !['A2', 'A3'].includes(valores[i])) return s
        if (s > saidaA1) return Math.min(s, saidaA1 + (cfg.maximoAcimaDoA1 ?? Infinity))
        if (!porIntensidade && saidaA1 - s <= igualarAte) return saidaA1
        return s
    })
}

// Séries com (2x), (3x), (4x)...: cada série com um material diferente da anterior e
// da seguinte (pode repetir, mas não em seguida). Iniciante e intermediário começam
// nadando quase sempre e vão colocando material. A3 vai com pé de pato.
// Ex.: nadando, c/PÉ, c/PÉ + PALM, c/PALM + BOIA.
export function rotateSetMaterials(rules, parte, serie, variation, intensidades, athlete, random = Math.random) {
    const cfg = rules.materialEntreAsSeries
    const sets = serie.vezes ?? (serie.blocos.length === 1 ? serie.blocos[0].vezes ?? 1 : 1)
    if (!cfg?.partes.includes(parte) || sets < 2) return variation
    // Material escrito na série (JSON) ou obrigatório (repetições longas): fica como está
    if (serie.exige.material.length > 0 || serie.materialPorSerie) return variation
    if (['fixo', 'obrigatorio', 'obrigatorio_por_bloco'].includes(variation.padrao)) return variation
    const tem = (m) => m.every((x) => (athlete.equipment ?? []).includes(x))
    const opcoes = [[], ...(rules.material?.[parte]?.opcoes ?? []).filter(tem)]
    if (opcoes.length < 2) return variation
    const chave = (m) => m.join('+')
    const valorDa = (i) => (intensidades?.unidade === 'serie' ? intensidades.valores[i]
        : intensidades?.unidade === 'serie_toda' ? intensidades.valores[0] : null)
    const comPe = opcoes.filter((m) => m.includes('pe_de_pato'))
    const permitidas = (i) => (valorDa(i) === 'A3' && comPe.length > 0 ? comPe : opcoes)
    const sorteia = (lista) => lista[Math.floor(random() * lista.length)]
    const series = []
    for (let i = 0; i < sets; i++) {
        let candidatas = permitidas(i).filter((m) => i === 0 || chave(m) !== chave(series[i - 1]))
        // A próxima só tem uma opção (ex.: A3 só com pé de pato): esta não pode ser ela
        const proxima = i + 1 < sets ? permitidas(i + 1) : null
        if (proxima?.length === 1) {
            const semElas = candidatas.filter((m) => chave(m) !== chave(proxima[0]))
            if (semElas.length > 0) candidatas = semElas
        }
        if (candidatas.length === 0) candidatas = permitidas(i)
        const nadando = candidatas.find((m) => m.length === 0)
        if (i === 0 && nadando && random() * 100 < (cfg.comecarNadando?.[athlete.level] ?? 0)) {
            series.push(nadando)
            continue
        }
        // Depois do 1º, vai colocando material (nadando de novo é menos provável).
        // Faltou força (feedback): de preferência palmar ou palmar + pull buoy, sem pé de pato
        let comMaterial = candidatas.filter((m) => m.length > 0)
        const soBracos = comMaterial.filter((m) => m.includes('palmar') && !m.includes('pe_de_pato'))
        if (parte === 'principal' && athlete.foco === 'forca' && soBracos.length > 0 && random() < 0.8) comMaterial = soBracos
        series.push(comMaterial.length > 0 && random() < 0.8 ? sorteia(comMaterial) : sorteia(candidatas))
    }
    const material = ['pe_de_pato', 'pe_de_pato_peito', 'palmar', 'pull_buoy', 'prancha', 'snorkel', 'paraquedas']
        .filter((m) => series.some((s) => s.includes(m)))
    return { ...variation, padrao: 'por_serie', series, material }
}

// Iniciante com pé de pato ou palmar nada bem mais rápido que o tempo proposto:
// a saída continua a mesma, com o aviso para descansar o intervalo de descanso.
function avisoComEquipamento(rules, athlete, escolha, saidas) {
    const temSaida = Array.isArray(saidas) ? saidas.some(Boolean) : saidas?.porBloco?.some((c) => c.some(Boolean))
    if (athlete.level !== 'iniciante' || !temSaida) return null
    const v = escolha.variation
    const materiais = [v.material, ...(v.series ?? []), ...(v.porBloco ?? [])].flat()
    if (!materiais.some((m) => ['pe_de_pato', 'pe_de_pato_peito', 'palmar'].includes(m))) return null
    const meio = (f) => (f[0] + f[1]) / 2
    const usadas = [...new Set((escolha.intensidades?.valores ?? []).filter((x) => /^A[123]$/.test(x)))].sort()
    const descansos = usadas.map((x) => `${meio(rules.intensidades[x].descanso)}" no ${x}`).join(', ')
    return 'Com equipamento você pode chegar bem antes da saída (cd). Se fizer muito abaixo do tempo proposto, ' +
        `descanse o tempo de descanso${descansos ? ` (${descansos})` : ''} antes da próxima.`
}

// Segundos que o atleta leva na série, com os descansos. `pace` = segundos por
// 100 m no ritmo do teste de 400 m.
export function estimateSeconds(rules, parte, serie, variation, athlete, pace) {
    if (serie.porSensacao) return serie.duracaoMinutos * 60

    const comPe = variation.material.includes('pe_de_pato') || variation.material.includes('pe_de_pato_peito')
    const fator = (parte === 'perna' ? RITMO_PERNA : 1) * (comPe ? RITMO_PE_DE_PATO : 1)
    // Intervalo entre as séries: troca o descanso da última repetição de cada série
    const intervalo = (saidaSegundos) =>
        intervalBetweenSets(rules, parte, serie, { fase: athlete.fase ?? null, level: athlete.level, saidaSegundos }) +
        (parte === 'principal' ? athlete.intervaloExtra ?? 0 : 0)
    let total = 0
    let ultimo = { saida: 0, descanso: 0 }
    for (const bloco of serie.blocos) {
        const ritmo = bloco.trechos
            ? bloco.trechos.reduce((s, t) => s + t.metros * paceFactor(rules, t.intensidade, athlete), 0) / bloco.distancia
            : paceFactor(rules, bloco.intensidade, athlete)
        // Tempo de nado: a tabela de tempos do treinador (pelo teste de 400 m);
        // o que ela não cobre (solto, velocidade, trechos) vai pelo % de esforço
        const daTabela = athlete.tabela && !bloco.trechos
            ? repSeconds(rules, athlete.tabela, bloco.distancia, bloco.intensidade) : null
        const nado = (daTabela ?? (bloco.distancia / 100) * pace * ritmo) * fator
        const descanso = blockRest(rules, bloco, athlete)
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
    pe_de_pato: 'PÉ', pe_de_pato_peito: 'PÉ de peito', palmar: 'PALM', pull_buoy: 'BOIA',
    snorkel: 'SNK', paraquedas: 'PARA', prancha: 'prancha',
}
const NADO_ABREV = { crawl: 'CR', costas: 'CO', peito: 'PE', borboleta: 'BO', medley: 'MD', livre: 'livre' }

// ["pe_de_pato", "palmar"] -> "c/PÉ + PALM"; [] -> "NAD"
export const materialAbbrev = (material) =>
    material.length === 0 ? 'NAD' : `c/${material.map((m) => MATERIAL_ABREV[m]).join(' + ')}`

// Troca as palavras do texto pelas abreviações do treinador:
// "100 indo crawl, voltando estilo" -> "100 indo CR, voltando estilo";
// "com pé de pato + palmar" -> "c/PÉ + PALM"; "nadando" -> "NAD"
export function abbreviate(texto) {
    return texto
        .replace(/\bpé de pato de peito\b/g, 'PÉ de peito')
        .replace(/\bpé de pato\b/g, 'PÉ')
        .replace(/\bpalmar\b/g, 'PALM')
        .replace(/\bpull buoy\b/g, 'BOIA')
        .replace(/\bsnorkel\b/g, 'SNK')
        .replace(/\bparaquedas\b/g, 'PARA')
        .replace(/\bcom (?=PÉ|PALM|BOIA|SNK|PARA|prancha)/g, 'c/')
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

// "c/2' de intervalo" ou "c/2' a 3' de intervalo" (intervalo entre as séries)
const minutosCurto = (s) => (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`)
const intervalAbbrev = (faixa) =>
    faixa && `c/${faixa.min === faixa.max ? minutosCurto(faixa.min) : `${minutosCurto(faixa.min)} a ${minutosCurto(faixa.max)}`} de intervalo`

// Texto do card, abreviado como no caderno do treinador.
// - Série simples: uma linha ("5 x 400 m · c/PALM").
// - Quando o nado ou o material muda entre as séries de um (2x), (4x)...:
//   cabeçalho e uma linha por série
//     (4x) 3 x 200 m · c/2' de intervalo
//     1ª série: NAD · MD / PE / MD
//     2ª série: c/PÉ · ME / MD / ME
// - Pirâmides e grupos: uma metragem por linha, com o material do bloco.
// `intervalo` = { min, max } do intervalo entre as séries (ou null).
export function cardText(serie, variation, intervalo = null, intensidades = null, saidas = null) {
    const c = intervalAbbrev(intervalo)
    const nadoDaSerie = variation.nados || variation.porSerie || !variation.nado || variation.nado === 'livre'
        ? null : abbreviate(variation.texto.slice(serie.texto.length).split(' · ')[1] ?? '')
    // Material igual em todas as séries: vai no cabeçalho, uma vez só
    const seriesIguais = variation.series?.every((m) => m.join('+') === variation.series[0].join('+'))
    const materialDaSerie = ['serie_inteira', 'obrigatorio'].includes(variation.padrao) || seriesIguais
        ? materialAbbrev(seriesIguais ? variation.series[0] : variation.material) : null
    const materialPorSerie = variation.series && !seriesIguais ? variation.series : null
    // Como nadar: A1/A2/A3 como estão; AC, NEG, POS e final forte entre parênteses
    const I = intensidades
    const fmt = (v) => (/^A\d$/.test(v) || /^ritmo /.test(v) ? v : `(${v})`)
    // Intensidade com a saída (quando dá para calcular): "A1 · cd 1'30\""
    const comSaida = (v, i) => [fmt(v), saidas?.[i] ? marcaText(saidas[i]) : null].filter(Boolean).join(' · ')
    const sequencia = I ? (I.valores.every((v) => v === I.valores[0]) ? comSaida(I.valores[0], 0) : I.valores.map(fmt).join(' / ')) : null
    // Série simples com um ritmo por repetição e saídas: uma linha por repetição
    const porRepeticao = I?.unidade === 'repeticao' && Array.isArray(saidas) && saidas.some(Boolean)
    // Grupos: a saída de cada distância (igual em todas as séries -> vai na linha do bloco)
    const porBloco = saidas?.porBloco
    const blocoIgual = porBloco?.map((col) => (col[0] && col.every((s) => s === col[0]) ? col[0] : null))
    const saidaNaSerie = porBloco && blocoIgual.some((s) => s === null) && porBloco.some((col) => col.some(Boolean))

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
            if (I?.unidade === 'bloco') linha += ` · ${comSaida(I.valores[i], i)}`
            else if (blocoIgual?.[i] && !saidaNaSerie) linha += ` · ${marcaText(blocoIgual[i])}`
            linhas.push(linha)
        })
        const resto = [nadoDaSerie, materialDaSerie, I?.unidade === 'serie_toda' ? sequencia : null].filter(Boolean).join(' · ')
        if (resto) linhas.push(resto)
        // Grupo repetido com intensidade por série
        if (I?.unidade === 'serie') {
            I.valores.forEach((v, i) => {
                const material = materialPorSerie ? materialAbbrev(materialPorSerie[i]) : null
                // Saídas diferentes em cada série: "100 cd 1'55" / 75 cd 1'25""
                const cds = saidaNaSerie ? serie.blocos.map((b, j) => (porBloco[j][i] ? `${b.distancia} ${marcaText(porBloco[j][i])}` : null))
                    .filter(Boolean).join(' / ') : null
                linhas.push(`${ORDINAIS[i]} série: ${[material, fmt(v), cds].filter(Boolean).join(' · ')}`)
            })
        }
        return linhas.join('\n')
    }

    const base = abbreviate(withMeters(serie.texto))
    // Sem intensidade (velocidade): a saída, quando tem
    const cd = !I && Array.isArray(saidas) && saidas[0] ? marcaText(saidas[0]) : null
    const porSerie = materialPorSerie || variation.nados || variation.porSerie || (I?.unidade === 'serie' ? I.valores : null)
    if (!porSerie) {
        // Sem intensidade (velocidade): a saída, quando tem
        if (!I) return [abbreviate(withMeters(variation.texto)), cd, c].filter(Boolean).join(' · ')
        if (porRepeticao) {
            // 5 x 400 m · c/PÉ + PALM
            // 1º: A1 · cd 6'50"
            const cabecalho = [base, nadoDaSerie, materialDaSerie, c].filter(Boolean).join(' · ')
            return [cabecalho, ...I.valores.map((v, i) => `${i + 1}º: ${comSaida(v, i)}`)].join('\n')
        }
        // Série simples com intensidade: na série toda ou repetição por repetição
        return [base, nadoDaSerie, materialDaSerie, sequencia, c].filter(Boolean).join(' · ')
    }

    // Uma linha por série
    const cabecalho = [base, nadoDaSerie, materialDaSerie, I?.unidade === 'serie_toda' ? sequencia : null, cd, c]
        .filter(Boolean).join(' · ')
    const linhas = porSerie.map((_, i) => {
        const material = materialPorSerie ? materialAbbrev(materialPorSerie[i]) : null
        const intensidade = I?.unidade === 'serie' ? comSaida(I.valores[i], i) : null
        let nados = null
        if (variation.porSerie) {
            // O melhor estilo aparece como ME
            const daSerie = variation.porSerie[i].map((n) => (n === variation.melhorEstilo ? 'ME' : NADO_ABREV[n] ?? n))
            nados = daSerie.every((n) => n === daSerie[0]) ? daSerie[0] : daSerie.join(' / ')
        } else if (variation.nados) {
            nados = NADO_ABREV[variation.nados[i]] ?? variation.nados[i]
        }
        return `${ORDINAIS[i]} série: ${[material, intensidade, nados].filter(Boolean).join(' · ')}`
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

// Quem nada pouco sem parar (até 100 m): divide as repetições na distância que
// ele aguenta ("(3x) 4 x 100" -> "(3x) 8 x 50"). Com pé de pato, os 75 ficam (e a
// série vai com pé de pato). Devolve a série como está, a adaptada ou null (não dá).
export function adaptToDistance(rules, serie, athlete) {
    const cfg = rules.quemNadaPouco
    const aguenta = SEM_PARAR[athlete.continuousDistance] ?? Infinity
    if (serie.porSensacao || serie.maiorDistancia <= aguenta) return serie
    if (!cfg || aguenta > cfg.paraQuemNadaAte) return serie
    const temPe = (athlete.equipment ?? []).includes('pe_de_pato')
    let exigePe = false
    const blocos = []
    for (const bloco of serie.blocos) {
        if (bloco.distancia <= aguenta) { blocos.push(bloco); continue }
        if (temPe && bloco.distancia <= cfg.comPeDePato) { exigePe = true; blocos.push(bloco); continue }
        // "Indo crawl, voltando medley" e trechos não dá para dividir
        if (bloco.distancia > cfg.maiorRepeticao || Array.isArray(bloco.nado) || bloco.trechos) return null
        const pedaco = [aguenta, 50, 25].find((d) => d <= aguenta && bloco.distancia % d === 0)
        if (!pedaco) return null
        blocos.push({ ...bloco, repeticoes: bloco.repeticoes * (bloco.distancia / pedaco), distancia: pedaco })
    }
    // Blocos iguais em seguida viram um só: "2 x 100, 2 x 100" -> "4 x 100"
    for (let i = blocos.length - 1; i > 0; i--) {
        const [a, b] = [blocos[i - 1], blocos[i]]
        if (a.distancia === b.distancia && (a.vezes ?? 1) === 1 && (b.vezes ?? 1) === 1 &&
            JSON.stringify({ ...a, repeticoes: 0 }) === JSON.stringify({ ...b, repeticoes: 0 })) {
            blocos.splice(i - 1, 2, { ...a, repeticoes: a.repeticoes + b.repeticoes })
        }
    }
    if (blocos.length === 1 && serie.blocos.length > 1 && (serie.vezes ?? 1) === 1) return null
    // Pirâmide que vira tudo igual (8 x 50, 8 x 50, 8 x 50) não serve
    if (blocos.length > 1 && blocos.every((b) => b.repeticoes === blocos[0].repeticoes && b.distancia === blocos[0].distancia)) return null
    const estrutura = /^(?:\(\d+x\) )?(?:(?:\(\d+x\) )?(?:\d+ x )?\d+(?:, )?)+/.exec(serie.texto)?.[0] ?? ''
    const resto = serie.texto.slice(estrutura.length).trim()
    const blocoTexto = (b) => `${(b.vezes ?? 1) > 1 ? `(${b.vezes}x) ` : ''}${b.repeticoes} x ${b.distancia}`
    const texto = [`${(serie.vezes ?? 1) > 1 ? `(${serie.vezes}x) ` : ''}${blocos.map(blocoTexto).join(', ')}`, resto]
        .filter(Boolean).join(' ')
    return describe({ ...serie, texto, blocos, ...(exigePe && { exigePe: cfg.comPeDePato }) })
}

// Só ritmo leve, sem velocidade, para quem nada pouco sem parar (condicionamento primeiro)
export const soRitmoLeve = (rules, athlete) => Boolean(rules.quemNadaPouco?.soRitmoLeve) &&
    (SEM_PARAR[athlete.continuousDistance] ?? Infinity) <= rules.quemNadaPouco.paraQuemNadaAte

// O atleta pode fazer essa série? (distância sem parar, estilos, piscina, tempo de aula)
function seriesFits(serie, athlete) {
    if (!serie.usos.includes('treino')) return false
    if (!fitsSession(serie, athlete.sessionMinutes)) return false
    if (!serie.piscinas.includes(athlete.poolLength)) return false
    // Adaptada com pé de pato: aguenta até 75 m
    const aguenta = Math.max(SEM_PARAR[athlete.continuousDistance], serie.exigePe ?? 0)
    if (serie.maiorDistancia > aguenta) return false
    // Séries curtas, só para quem nada pouco sem parar
    if (serie.paraQuemNadaAte !== undefined && SEM_PARAR[athlete.continuousDistance] > serie.paraQuemNadaAte) return false
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
function pickForPart(args) {
    const { rules, parte, bloqueadas } = args
    // A série do treino anterior não se repete (só se não houver outra que sirva)
    const semRepetir = (rules.naoRepetirNoTreinoSeguinte?.partes ?? []).includes(parte) && bloqueadas?.size > 0
    return (semRepetir && pickAmong(args, bloqueadas)) || pickAmong(args, null)
}

// Séries (2x), (3x), (4x)...: as opções de quantas séries o atleta faz (a escrita
// primeiro). De `minimo` até o número escrito + `aumentarAte` do nível.
export function setOptions(rules, parte, serie, level) {
    const cfg = rules.seriesAjustaveis
    const escrito = /^\((\d+)x\) /.exec(serie.texto)
    if (!cfg || !cfg.partes.includes(parte) || !escrito || serie.materialPorSerie) return [serie]
    const n = Number(escrito[1])
    const doGrupo = serie.vezes === n
    const doBloco = !doGrupo && serie.blocos.length === 1 && serie.blocos[0].vezes === n
    if (!doGrupo && !doBloco) return [serie]
    const ate = Math.min(cfg.maximo, n + (cfg.aumentarAte?.[level] ?? 0))
    const opcoes = [serie]
    const minimo = cfg.minimoPorNivel?.[level] ?? cfg.minimo
    for (let vezes = Math.min(minimo, n); vezes <= ate; vezes++) {
        if (vezes === n) continue
        opcoes.push(describe({
            ...serie,
            // Uma série só: sem o "(1x)"
            texto: serie.texto.replace(escrito[0], vezes === 1 ? '' : `(${vezes}x) `),
            ...(doGrupo ? { vezes } : { blocos: [{ ...serie.blocos[0], vezes }] }),
        }))
    }
    return opcoes
}

function pickAmong({ rules, library, parte, budget, athlete, pace, random, recentes, primeiraPrincipal }, evitar) {
    const candidatas = []
    // Passar do tempo é pior que ficar um pouco abaixo (a aula tem hora para acabar)
    const foraDoTempo = (segundos) => (segundos > budget ? 1.5 : 1) * Math.abs(segundos - budget)
    for (const daBiblioteca of library[parte] ?? []) {
        const original = adaptToDistance(rules, daBiblioteca, athlete)
        if (!original || !seriesFits(original, athlete)) continue
        if (evitar?.has(original.id) || (original.familia && evitar?.has(`familia:${original.familia}`))) continue
        if (primeiraPrincipal && original.id === primeiraPrincipal.serie.id) continue
        // (2x), (3x), (4x)...: o número de séries que melhor cabe no tempo da parte.
        // Fora as que ficariam iguais à do treino anterior (ex.: (4x) 4 x 50 e (6x) 4 x 50 viram (3x) 4 x 50)
        const opcoes = setOptions(rules, parte, original, athlete.level).filter((s) => !evitar?.has(`texto:${s.texto}`))
        if (opcoes.length === 0) continue
        const serie = opcoes.length === 1 ? opcoes[0] : opcoes
            .map((s) => ({ s, fora: foraDoTempo(estimateSeconds(rules, parte, s, { material: [] }, athlete, pace)) }))
            .reduce((melhor, o) => (o.fora < melhor.fora ? o : melhor)).s
        // Série adaptada com os 75 m: só com pé de pato
        const serve = (v) => variationFits(v, athlete) && (!serie.exigePe || v.material.includes('pe_de_pato'))
        let variations = seriesVariations(rules, parte, serie, athlete).filter(serve)
        const mistura = drawMixedStrokes(rules, parte, serie, athlete, random)
        if (mistura && serve(mistura)) variations.push(mistura)
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
    // Repetir uma série recente custa como passar 1 minuto do tempo: varia sem
    // estourar a aula nas partes com poucas séries (solto, soltura)
    // (cada vez que a série apareceu nos últimos treinos conta, pelo id e como saiu)
    // Pelo feedback: faltou ar -> repetições curtas (até 50 m); faltou força -> palmar
    // ou palmar + pull buoy, sem pé de pato (para os braços empurrarem mais água)
    const foco = parte === 'principal' ? athlete.foco : null
    const comPalmar = (v) => v.material.includes('palmar') && !v.material.includes('pe_de_pato')
    const bonus = (c) => (foco === 'respiracao' && c.serie.maiorDistancia <= 50 ? 90 : 0) +
        (foco === 'forca' && c.variations.some(comPalmar) ? 90 : 0)
    const distancia = (c) => foraDoTempo(c.segundos) - bonus(c) +
        60 * (recentes.vezes(c.serie.id) + recentes.vezes(`texto:${c.serie.texto}`) +
            (c.serie.familia ? recentes.vezes(`familia:${c.serie.familia}`) : 0))
    // Sorteia só entre as que ficam perto da melhor (até 1 min ou 15% do tempo da parte a mais)
    const ordenadas = candidatas.sort((a, b) => distancia(a) - distancia(b))
    const limite = distancia(ordenadas[0]) + Math.max(60, budget * 0.15)
    const melhores = ordenadas.filter((c) => distancia(c) <= limite).slice(0, 3)
    const escolhida = weightedPick(melhores.map((c) => ({ item: c, peso: c.serie.peso })), random)
    const variation = weightedPick(escolhida.variations.map((v) =>
        ({ item: v, peso: (v.peso ?? 1) * (foco === 'forca' && comPalmar(v) ? 4 : 1) })), random)
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
function buildTraining({ rules, library, athlete, pace, random, recentes, proibidas = [], bloqueadas, fatorPrincipal = 1 }) {
    const leve = soRitmoLeve(rules, athlete)
    const estrutura = partsForLevel(rules, athlete.level, athlete.sessionMinutes).filter((p) => !leve || p !== 'velocidade')
    const pausas = estrutura.map((p) => pauseOf(rules, p)).filter(Boolean)
    const segundosLivres = (athlete.sessionMinutes - pausas.reduce((s, p) => s + p.minutos, 0)) * 60
    const somaPesos = estrutura.filter((p) => !pauseOf(rules, p)).reduce((s, p) => s + (TEMPO_DAS_PARTES[p] ?? 0), 0)
    const principais = estrutura.filter((p) => p === 'principal').length

    const escolhas = new Map() // posição na estrutura -> escolha
    const escolher = (i, budget, primeiraPrincipal = null) => {
        const parte = estrutura[i]
        const escolha = pickForPart({ rules, library, parte, budget, athlete, pace, random, recentes, primeiraPrincipal, bloqueadas })
        if (escolha) {
            escolhas.set(i, escolha)
            recentes.add(escolha.serie.id)
            recentes.add(`texto:${escolha.serie.texto}`)
            if (escolha.serie.familia) recentes.add(`familia:${escolha.serie.familia}`)
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
    // (o feedback e o condicionamento aumentam ou diminuem esse tempo: `fatorPrincipal`)
    const budgetPrincipal = (Math.max(0, segundosLivres - usado) / Math.max(principais, 1)) * fatorPrincipal
    let primeiraPrincipal = null
    estrutura.forEach((parte, i) => {
        if (parte !== 'principal') return
        const escolha = escolher(i, budgetPrincipal, primeiraPrincipal)
        if (escolha && !primeiraPrincipal) primeiraPrincipal = escolha
        // Como nadar a série principal (A1/A2/A3, AC, NEG, POS ou final forte)
        if (escolha) {
            // Quem nada pouco sem parar, ou série escrita toda em A1 (ex.: as de 25 m do
            // condicionamento): a série toda em ritmo leve
            const toda = escolha.serie.blocos.every((b) => b.intensidade === 'A1')
            const sorteio = leve || toda
                ? { tipo: 'intensidades', unidade: 'serie_toda', valores: ['A1'], variation: escolha.variation }
                : drawIntensities(rules, escolha.serie, escolha.variation, athlete, {
                    proibidas: athlete.tabela ? proibidas : [...proibidas, 'AC'], random, fase: athlete.fase ?? null,
                    tipos: athlete.tiposDaEtapa,
                })
            if (sorteio) {
                escolha.variation = sorteio.variation
                escolha.intensidades = { tipo: sorteio.tipo, unidade: sorteio.unidade, valores: sorteio.valores }
            }
        }
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
        // (2x), (3x), (4x)...: um material diferente em cada série, sem repetir em seguida
        escolha.variation = rotateSetMaterials(rules, parte, escolha.serie, escolha.variation, escolha.intensidades, athlete, random)
        // Intervalo entre as séries (Acumulação 1: maior)
        const faixa = intervalRangeFor(rules, parte, escolha.serie, athlete.level)
        const extra = parte === 'principal' ? athlete.intervaloExtra ?? 0 : 0
        const faixaDoDia = faixa && extra ? { min: faixa.min + extra, max: faixa.max + extra } : faixa
        const intervalo = intervalText(faixaDoDia)
        let saidas = parte === 'velocidade'
            ? (escolha.serie.blocos.length === 1 ? [saidaVelocidade(rules, athlete, escolha.serie.blocos[0])] : null)
            : saidasDaSerie(rules, athlete, escolha.serie, escolha.intensidades, athlete.fase ?? null)
        const aviso = avisoComEquipamento(rules, athlete, escolha, saidas)
        // Sem tempos de referência: o descanso no lugar da saída (velocidade: 1/1)
        if (!athlete.tabela) {
            saidas = parte === 'velocidade'
                ? (saidas?.[0] ? saidas : ['1/1'])
                : descansosDaSerie(rules, athlete, escolha.serie, escolha.intensidades)
        }
        partes.push({
            parte,
            titulo: segunda ? '2ª série principal' : NOMES_DAS_PARTES[parte],
            serieId: escolha.serie.id,
            serieTexto: escolha.serie.texto,
            ...(escolha.serie.familia && { serieFamilia: escolha.serie.familia }),
            texto: cardText(escolha.serie, escolha.variation, faixaDoDia,
                comoMostrar(rules, athlete, escolha.intensidades), saidas),
            ...(aviso && { aviso }),
            ...(escolha.intensidades && { intensidades: escolha.intensidades }),
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

// Treino do teste de 400 m (quando o atleta ainda não tem tempos de referência):
// aquecimento do teste, o teste e a soltura.
function buildTestTraining({ rules, library, athlete, pace, random, recentes }) {
    const partes = []
    const aquecimento = (library.aquecimento ?? []).find((s) => s.usos.includes('teste'))
    if (aquecimento) {
        partes.push({
            parte: 'aquecimento', titulo: 'Aquecimento', serieId: aquecimento.id, texto: abbreviate(withMeters(aquecimento.texto)),
            metros: aquecimento.volume, minutos: aquecimento.duracaoMinutos ?? 15,
        })
    }
    partes.push({
        parte: 'teste',
        titulo: 'Teste de 400 m',
        texto: '400 m CR · o mais rápido que conseguir',
        observacao: 'Cronometre e registre o tempo no app (bloco Tempos). Com ele, o app calcula as suas saídas (cd) e periodiza melhor os seus treinos.',
        metros: 400,
        minutos: Math.round((pace * 4) / 60),
    })
    const estrutura = partsForLevel(rules, athlete.level, athlete.sessionMinutes)
    const ultima = estrutura[estrutura.length - 1]
    const soltura = pickForPart({ rules, library, parte: ultima, budget: 5 * 60, athlete, pace, random, recentes })

    // O resto da aula: séries para recuperar (A1 com pé de pato), da maior para a menor
    const cfg = rules.diaDoTeste
    let livres = athlete.sessionMinutes * 60 - partes.reduce((s, p) => s + p.minutos * 60, 0) - (soltura?.segundos ?? 0)
    const material = (cfg?.material ?? []).filter((m) => (athlete.equipment ?? []).includes(m))
    const intensidades = { tipo: 'intensidades', unidade: 'serie_toda', valores: [cfg?.intensidade ?? 'A1'] }
    for (const crua of cfg?.completarCom ?? []) {
        const serie = describe({ ...crua, blocos: crua.blocos.map((b) => ({ ...b, intensidade: intensidades.valores[0] })) })
        if (serie.maiorDistancia > (SEM_PARAR[athlete.continuousDistance] ?? Infinity)) continue
        if (!serie.piscinas.includes(athlete.poolLength)) continue
        const variation = { texto: serie.texto, material, padrao: 'serie_inteira', nado: 'livre' }
        const segundos = estimateSeconds(rules, 'principal', serie, variation, athlete, pace)
        if (segundos > livres || segundos < (cfg.minimoDeMinutos ?? 0) * 60) continue
        livres -= segundos
        const saidas = athlete.tabela ? saidasDaSerie(rules, athlete, serie, intensidades, athlete.fase ?? null)
            : descansosDaSerie(rules, athlete, serie, intensidades)
        partes.push({
            parte: 'recuperacao', titulo: 'Para recuperar', serieId: serie.id,
            texto: cardText(serie, variation, null, comoMostrar(rules, athlete, intensidades), saidas),
            intensidades, nado: 'livre', material, metros: serie.volume, minutos: Math.round(segundos / 60),
        })
    }

    if (soltura) {
        partes.push({
            parte: ultima, titulo: NOMES_DAS_PARTES[ultima], serieId: soltura.serie.id,
            texto: cardText(soltura.serie, soltura.variation), metros: soltura.serie.volume, minutos: Math.round(soltura.segundos / 60),
        })
    }
    return partes
}

// Séries usadas nos últimos `n` treinos (e no treino que está sendo montado):
// quanto mais vezes apareceu, menos chance de sair de novo
function recentWindow(n) {
    const treinos = []
    let atual = new Set()
    return {
        vezes: (chave) => treinos.filter((t) => t.has(chave)).length + (atual.has(chave) ? 1 : 0),
        add: (chave) => atual.add(chave),
        fecharTreino: () => {
            treinos.push(atual)
            if (treinos.length > n) treinos.shift()
            atual = new Set()
        },
    }
}

// Séries de um treino, para não repetir no seguinte: o id e a série como saiu
// (com o número de séries escolhido), ex.: "texto:(3x) 4 x 50"
export const seriesUsadas = (partes) => new Set(partes.flatMap((p) =>
    [p.serieId, p.serieTexto && `texto:${p.serieTexto}`, p.serieFamilia && `familia:${p.serieFamilia}`].filter(Boolean)))

// Quem não nada 400 m sem parar está no condicionamento: sem teste, e a metragem
// da principal vai aumentando devagar
export const inConditioning = (rules, athlete) => Boolean(rules.condicionamento) &&
    (SEM_PARAR[athlete.continuousDistance] ?? Infinity) < rules.condicionamento.paraQuemNadaMenosDe

// Esforço que o app espera na série principal (1 a 10). Fica só no plano interno
// do treino: o atleta não vê.
export function expectedEffort(rules, partes) {
    const tabela = rules.feedback?.esforcoEsperado ?? {}
    if (partes.some((p) => p.parte === 'teste')) return tabela.teste ?? null
    const intensidades = partes.filter((p) => p.intensidades).map((p) => hardestIntensity(p.intensidades))
    const maisForte = intensidades.includes('A3') ? 'A3' : intensidades.includes('A2') ? 'A2' : intensidades.length ? 'A1' : null
    return maisForte ? tabela[maisForte] ?? null : null
}

// Ajuste pelo feedback. `historico` = treinos concluídos, do mais antigo ao mais novo:
// [{ difficulty, reason, plan: { esforcoEsperado, fatorPrincipal } }].
// Só ajusta quando os últimos 3 treinos SEGUIDOS saíram do esperado (1 ou 2 podem ser
// do dia do atleta: dormiu mal, trabalhou muito, não comeu direito...):
// - pesado: os 3 com nota 8 ou mais (avançado: 9 ou mais), sem o treino ser para isso;
// - fácil: os 3 com nota 2 ou mais abaixo do esperado.
// E só se a carga ainda não mudou depois deles (`fatorDoProximo`), para não ajustar duas vezes.
// Devolve { carga: -1 (pesado) | 0 | 1 (fácil), foco, fatorPrincipal }.
export function feedbackAdjustment(rules, athlete, historico = [], fatorDoProximo = null) {
    const cfg = rules.feedback
    const cond = inConditioning(rules, athlete) ? rules.condicionamento : null
    const ultimoPlano = [...historico].reverse().find((t) => t.plan?.fatorPrincipal)?.plan
    let fator = ultimoPlano?.fatorPrincipal ?? (cond ? cond.fatorInicial : 1)
    if (!cfg) return { carga: 0, foco: null, fatorPrincipal: fator }
    const n = cfg.treinosEmSequencia ?? 3
    const seguidos = historico.filter((t) => t.plan?.esforcoEsperado).slice(-n)
    const avaliados = seguidos.length === n && seguidos.every((t) => Number.isInteger(t.difficulty))
    // Nota que conta como pesado: 8; o avançado, que já está acostumado, só 9 e 10
    const limite = cfg.pesadoAPartirDe?.[athlete.level] ?? cfg.pesadoAPartirDe?.padrao ?? cfg.perguntarMotivoAPartirDe
    const pesado = avaliados && seguidos.every((t) => t.difficulty >= limite && t.plan.esforcoEsperado < limite)
    const facil = avaliados && seguidos.every((t) => t.difficulty <= t.plan.esforcoEsperado - cfg.diferencaParaFacil)
    // Já ajustado depois desses treinos: o próximo treino montado tem outra carga
    const ja = (t) => fatorDoProximo !== null &&
        (pesado ? fatorDoProximo < t.plan.fatorPrincipal - 1e-6 : fatorDoProximo > t.plan.fatorPrincipal + 1e-6)
    const carga = (pesado || facil) && !seguidos.some(ja) ? (pesado ? -1 : 1) : 0
    // Foco: o motivo que mais apareceu nos treinos pesados (o mais recente desempata)
    const motivos = seguidos.filter((t) => t.difficulty >= cfg.perguntarMotivoAPartirDe && t.reason).map((t) => t.reason)
    const contagem = (m) => motivos.filter((x) => x === m).length
    const foco = [...motivos].reverse().sort((a, b) => contagem(b) - contagem(a))[0] ?? null
    if (carga === 0 && fatorDoProximo !== null) fator = fatorDoProximo
    fator += carga * (cfg.ajusteDaPrincipal ?? 0.1)
    const maximo = cond ? cond.fatorMaximo : cfg.fatorMaximo
    fator = Math.min(maximo ?? 1, Math.max(cfg.fatorMinimo ?? 0.5, fator))
    return { carga, foco, fatorPrincipal: Math.round(fator * 100) / 100 }
}

// Gera os treinos dos próximos dias para o atleta.
// `athlete` = respostas da anamnese + { level } (nível calculado) + { time400 }.
// `random` permite repetir o sorteio nos testes.
const addDays = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return toIso(d)
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

// Etapas da periodização (ATR) para um período de `total` dias e o nível do atleta.
// O modelo vem do nível e do tempo até a prova (ex.: iniciante A1-A2-T-R, ou
// A1-A2-T-A-T-R com a prova mais longe). Quanto mais longa a
// preparação, mais Acumulação: os dias que sobram vão o dobro para ela, e acima do
// maior modelo entram mais etapas de Acumulação. Devolve [{ etapa, dias }].
export function planStages(rules, total, level = null) {
    const cfg = rules.periodizacao
    const etapas = cfg?.etapas
    const modelos = cfg?.modelos?.[level] ?? cfg?.modelos?.padrao
    if (!etapas || !modelos?.length) return [{ etapa: null, dias: total }]
    const soma = (modelo, k) => modelo.reduce((s, e) => s + etapas[e].dias[k], 0)
    const ehAcumulacao = (e) => etapas[e].fase === 'acumulacao'
    const escolhido = modelos.find((m) => total >= m.aPartirDeDias) ?? modelos.at(-1)
    let modelo = escolhido.etapas
    // Mais longo que o maior modelo: mais Acumulação no começo (constrói a base)
    if (escolhido === modelos[0]) {
        while (soma(modelo, 1) < total && modelo.length < 12) {
            const depois = modelo.findIndex((e) => !ehAcumulacao(e))
            modelo = [...modelo.slice(0, depois), 'acumulacao2', ...modelo.slice(depois)]
        }
    }
    // Cada etapa começa no mínimo; os dias que sobram vão em rodízio para as que ainda
    // cabem, 2 por vez para a Acumulação e 1 para as outras
    const dias = modelo.map((e) => etapas[e].dias[0])
    let sobra = total - dias.reduce((s, d) => s + d, 0)
    if (sobra < 0) {
        // Mais curto que o mínimo: tira da primeira etapa
        dias[0] = Math.max(1, dias[0] + sobra)
        sobra = 0
    }
    while (sobra > 0) {
        let deu = false
        for (let k = 0; k < modelo.length && sobra > 0; k++) {
            const vez = Math.min(ehAcumulacao(modelo[k]) ? 2 : 1, sobra, etapas[modelo[k]].dias[1] - dias[k])
            if (vez > 0) {
                dias[k] += vez
                sobra -= vez
                deu = true
            }
        }
        if (!deu) { dias[0] += sobra; sobra = 0 } // passou do máximo de tudo: vai para a 1ª
    }
    return modelo.map((etapa, k) => ({ etapa, dias: dias[k] }))
}

// Etapa de cada dia da periodização, do início ao fim (a prova alvo).
// Devolve (data) -> { etapa, nome, fase, semanaDaFase } (semana dentro da etapa).
export function periodPhases(rules, inicio, fim, level = null) {
    const total = Math.max(1, daysBetween(inicio, fim) + 1)
    const plano = planStages(rules, total, level)
    let comeca = 0
    const limites = plano.map(({ etapa, dias }) => {
        const l = { etapa, comeca, termina: comeca + dias }
        comeca += dias
        return l
    })
    return (date) => {
        const dia = Math.min(total - 1, Math.max(0, daysBetween(inicio, date)))
        const atual = limites.find((l) => dia < l.termina) ?? limites.at(-1)
        const cfg = rules.periodizacao?.etapas?.[atual.etapa]
        return {
            etapa: atual.etapa,
            nome: cfg?.nome ?? null,
            fase: cfg?.fase ?? null,
            semanaDaFase: Math.floor((dia - atual.comeca) / 7) + 1,
        }
    }
}

// `seriesAnteriores` = séries do último treino antes de hoje (não se repetem no primeiro).
// `inicioDosTreinos` = data do primeiro treino do atleta (para marcar o teste depois de 1 mês).
// `historico` = treinos feitos, com o feedback e o plano interno (para ajustar os próximos).
// `fatorDoProximo` = tempo da principal do próximo treino já montado (para o feedback
// não ajustar duas vezes pelos mesmos treinos).
// `periodizacao` = { inicio, fim, testeNaTransicao, numeroInicial }: gera todos os
// treinos até o fim, cada um com a sua fase. Sem ela, gera `dias` dias, sem fase.
export function generateTrainings({
    rules, library, athlete, today, random = Math.random, dias = DIAS_PADRAO, seriesAnteriores = [],
    inicioDosTreinos = today, historico = [], fatorDoProximo = null, periodizacao = null,
}) {
    const tempo400 = athlete.time400?.hundredths ?? DEFAULT_400[athlete.level]
    const pace = tempo400 / 4 / 100 // segundos por 100 m
    // Tabela de tempos do atleta (método do treinador). Sem o teste de 400 m (nem o
    // tempo informado na anamnese) não há tempos de referência: o card mostra o
    // descanso no lugar da saída e, depois de 1 mês de treino, entra o teste.
    const semReferencia = !athlete.time400?.hundredths
    athlete = semReferencia ? { ...athlete, tabela: null, teste400: null }
        : { ...athlete, tabela: timeTable(rules, tempo400 / 100), teste400: tempo400 / 100 }
    // Tempo de treino: o da aula, até o máximo do nível (iniciante nada no máximo 50 min)
    const maximo = rules.niveis[athlete.level]?.maxMinutosDeTreino
    if (maximo && athlete.sessionMinutes > maximo) {
        athlete = { ...athlete, aulaMinutos: athlete.sessionMinutes, sessionMinutes: maximo }
    }
    // Feedback dos últimos treinos: carga, foco (respiração ou força) e o tempo da principal
    const ajuste = feedbackAdjustment(rules, athlete, historico, fatorDoProximo)
    athlete = { ...athlete, foco: ajuste.foco }
    const condicionamento = inConditioning(rules, athlete)
    const recentes = recentWindow(4) // séries dos últimos 4 treinos perdem prioridade
    // Teste de 400 m de quem não tem tempo: o primeiro treino depois de 1 mês de treino
    const testeAPartirDe = addDays(inicioDosTreinos, rules.diaDoTeste?.semTemposAposDias ?? 30)
    let testeMarcado = false
    // Periodização: todos os treinos até o fim, com a fase de cada um
    const faseDe = periodizacao ? periodPhases(rules, periodizacao.inicio, periodizacao.fim, athlete.level) : null
    const totalDeDias = periodizacao
        ? Math.min(rules.periodizacao?.maximoDeDias ?? 366, Math.max(1, daysBetween(today, periodizacao.fim) + 1))
        : dias
    let testeDaPeriodizacao = false
    // Séries do treino anterior: não se repetem no treino seguinte
    let bloqueadas = new Set(seriesAnteriores)

    // Recuperação: depois de um treino com A3 na série principal, o próximo não tem
    // A3 enquanto não passarem as horas de recuperação do A3 (até 48 h)
    let anterior = null // { date, intensidade }
    const horasEntre = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 3_600_000

    return trainingDates(today, athlete.trainingDays, totalDeDias).map((date, i) => {
        // Etapa do dia (Acumulação 1, ..., Realização). Condicionamento: fica na Acumulação.
        const daData = faseDe ? faseDe(date) : { etapa: null, nome: null, fase: null, semanaDaFase: null }
        const etapa = condicionamento && daData.fase && daData.fase !== 'acumulacao' ? 'acumulacao2' : daData.etapa
        const efeitos = rules.periodizacao?.etapas?.[etapa] ?? {}
        const fase = efeitos.fase ?? daData.fase
        const doDia = {
            ...athlete,
            fase,
            etapa,
            descansoExtra: efeitos.descansoExtra ?? 0,
            intervaloExtra: efeitos.intervaloExtra ?? 0,
            tiposDaEtapa: efeitos.tipos ?? null,
            velocidade25: efeitos.velocidadeAvancado25 ?? null,
            // Transição 2 (força específica): palmar e palmar + pull buoy, se o feedback não pediu outra coisa
            foco: athlete.foco ?? efeitos.foco ?? null,
        }
        const proibidas = []
        // Acumulação: só A1/A2
        if (efeitos.semA3) proibidas.push('A3')
        // Pesado demais nos últimos treinos: os 2 primeiros sem A3
        if (ajuste.carga < 0 && i < 2) proibidas.push('A3')
        const recuperacao = anterior?.intensidade === 'A3' && !recoveryWaived(rules, athlete)
        if (recuperacao) {
            const horas = rules.intensidades?.A3?.recuperacaoHoras?.[1] ?? 48
            if (horasEntre(anterior.date, date) < horas) proibidas.push('A3')
        }
        // Tempo da principal: o do feedback; no condicionamento, aumenta um pouco a cada treino
        const cond = rules.condicionamento
        // A etapa também mexe no volume (ex.: Realização com 70%)
        const fatorPrincipal = Math.round((condicionamento
            ? Math.min(cond.fatorMaximo, ajuste.fatorPrincipal + i * cond.aumentoPorTreino)
            : ajuste.fatorPrincipal) * (efeitos.volume ?? 1) * 100) / 100
        // Teste de quem não tem tempo (depois de 1 mês) e o teste da periodização (no
        // começo da Transição). Quem não nada 400 m sem parar não faz teste (condicionamento).
        const testeSemTempo = semReferencia && !condicionamento && !testeMarcado && date >= testeAPartirDe
        const testeNaTransicao = periodizacao?.testeNaTransicao && !semReferencia && !condicionamento &&
            !testeDaPeriodizacao && fase === 'transicao'
        if (testeSemTempo) testeMarcado = true
        if (testeNaTransicao) testeDaPeriodizacao = true
        const partes = testeSemTempo || testeNaTransicao
            ? buildTestTraining({ rules, library, athlete: doDia, pace, random, recentes })
            : buildTraining({ rules, library, athlete: doDia, pace, random, recentes, proibidas, bloqueadas, fatorPrincipal })
        bloqueadas = seriesUsadas(partes)
        recentes.fecharTreino()
        const intensidades = partes.filter((p) => p.intensidades).map((p) => hardestIntensity(p.intensidades))
        const diaDeTeste = partes.some((p) => p.parte === 'teste')
        if (diaDeTeste) intensidades.push('A3') // o teste é forte
        anterior = { date, intensidade: intensidades.includes('A3') ? 'A3' : intensidades.includes('A2') ? 'A2' : 'A1' }
        const principais = partes.filter((p) => p.parte === 'principal')
        const numero = (periodizacao?.numeroInicial ?? 1) + i
        return {
            date,
            title: `Treino ${numero}`,
            partes,
            metros: partes.reduce((s, p) => s + p.metros, 0),
            minutos: partes.reduce((s, p) => s + p.minutos, 0),
            // Plano interno (o atleta não vê): como é o treino na periodização, para
            // comparar com o feedback e montar ou refazer os próximos
            plano: {
                numero,
                fase,
                etapa,
                nomeDaEtapa: rules.periodizacao?.etapas?.[etapa]?.nome ?? null,
                semanaDaFase: daData.semanaDaFase,
                intensidade: anterior.intensidade,
                esforcoEsperado: expectedEffort(rules, partes),
                metrosPrincipal: principais.reduce((s, p) => s + p.metros, 0),
                minutosPrincipal: principais.reduce((s, p) => s + p.minutos, 0),
                tipoPrincipal: principais.map((p) => p.intensidades?.tipo ?? null),
                diaDeTeste,
                recuperacao: Boolean(recuperacao),
                material: [...new Set(principais.flatMap((p) => p.material ?? []))],
                fatorPrincipal,
                carga: ajuste.carga,
                foco: ajuste.foco,
                condicionamento,
            },
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
        mainSeries: juntar(['teste', 'recuperacao', 'principal', 'hidratacao', 'perna']),
        release: juntar(['soltura']),
    }
}


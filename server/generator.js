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
import { canSwimInStroke, describe, fitsSession } from './series/index.js'
import {
    allowedAsSecondMain, drawMixedStrokes, effortFor, intensityName, intervalBetweenSets, intervalRangeFor,
    partsForLevel, pauseOf, repSeconds, restFor, seriesVariations, timeTable, usesIntensityRest,
    drawIntensities, hardestIntensity, recoveryWaived,
} from './series/regras.js'
import { aplicarEspecifico, loadEspecifico, textoDaSerie } from './especifico/index.js'
import { aplicarSaude, loadSaude } from './saude/index.js'
import { estadoDaTecnica, loadTecnica, montarTecnica, parteDaTecnica } from './tecnica/index.js'

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
    perna: 'Perna', soltura: 'Soltura', complemento: 'Saídas e técnica', continuo: 'Nado contínuo',
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
// `soCrawl`: série só de crawl (o avançado tem a tabela de descanso do crawl)
function blockRest(rules, bloco, athlete, soCrawl = false) {
    if (bloco.descanso !== undefined) return bloco.descanso
    const meio = (f) => (f[0] + f[1]) / 2
    const intensidade = intensityName(rules, bloco.trechos ? bloco.trechos[0].intensidade : bloco.intensidade)
    let descanso
    if (intensidade && usesIntensityRest(rules, athlete)) descanso = meio(rules.intensidades[intensidade].descanso)
    else {
        const { min, max } = restFor(rules, athlete.level, bloco.distancia, soCrawl)
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

// Realização: descansos 30 a 40% maiores (usa o meio, 35%), arredondados para
// múltiplo de 5 (regras.periodizacao.etapas.realizacao.descansoMaior)
function restOfPhase(athlete, descanso) {
    const faixa = athlete.descansoMaior
    if (!faixa) return descanso
    return Math.max(Math.round((descanso * (1 + (faixa[0] + faixa[1]) / 2)) / 5) * 5, Math.round(descanso / 5) * 5 + 5)
}

// Saída com o descanso da fase: na Realização, sempre pelo menos 5" a mais que a
// saída normal (o arredondamento de 5 em 5 não pode apagar o descanso a mais)
function saidaComDescanso(athlete, nado, descanso) {
    const normal = Math.round((nado + descanso) / 5) * 5
    if (!athlete.descansoMaior) return normal
    return Math.max(Math.round((nado + restOfPhase(athlete, descanso)) / 5) * 5, normal + 5)
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
// `fator` = o estilo: o tempo de nado do crawl x o fator do estilo (o descanso é o mesmo).
export function saidaFor(rules, athlete, bloco, valor, fator = 1) {
    if (!athlete.tabela || !valor) return null
    const intensidade = /^A[123]$/.test(valor) ? valor : null
    const ac = /^(\d+) AC$/.exec(valor)
    const ritmoLivre = valor === 'NEG' || valor === 'POS' || valor === 'sai/che' || / NAD x 25 fo$/.test(valor)
    let nado = null
    if (intensidade) nado = repSeconds(rules, athlete.tabela, bloco.distancia, intensidade)
    else if (ac) {
        const melhor = bestTimeFor(rules, athlete, bloco.distancia)
        if (melhor !== null) nado = melhor + Number(ac[1])
    } else if (ritmoLivre) nado = repSeconds(rules, athlete.tabela, bloco.distancia, 'A2')
    if (nado === null) return null
    nado *= fator
    const regra = rules.saidas?.negPosFinalForte
    const descanso = ritmoLivre && regra && bloco.distancia <= regra.ateMetros
        ? (regra.descanso[0] + regra.descanso[1]) / 2
        : blockRest(rules, { ...bloco, intensidade: intensidade ?? (ritmoLivre ? 'A2' : 'A3') }, athlete, fator === 1)
    const saida = saidaComDescanso(athlete, nado, descanso)
    // Quanto mais perto do 100%, maior o descanso: o AC abaixo da referência (ex.: 5 AC)
    // fica com a saída do 15 AC (nada mais rápido e descansa mais)
    const referencia = rules.saidas?.acNoMesmoNivel?.referencia
    if (ac && referencia && Number(ac[1]) < referencia) {
        return Math.max(saida, saidaFor(rules, athlete, bloco, `${referencia} AC`, fator) ?? 0)
    }
    return saida
}

// Saída da velocidade: avançado nos 25 m a cada 30"; nos outros casos o tempo forte
// estimado + 20" a 30" de descanso (nunca 1/1).
export function saidaVelocidade(rules, athlete, bloco, fator = 1) {
    const cfg = rules.saidas?.velocidade
    if (!cfg) return null
    // Realização: o avançado força mais nos 25 m (cd 25")
    const fixa = (athlete.velocidade25 && athlete.level === 'avancado' && bloco.distancia === 25 ? athlete.velocidade25 : null) ??
        cfg[athlete.level]?.[String(bloco.distancia)]
    const melhor50 = athlete.tabela ? bestTimeFor(rules, athlete, 50) : null
    const nado = melhor50 === null ? null : ((melhor50 * bloco.distancia) / 50) * fator
    // (a saída fixa é a do crawl; nos estilos, o tempo de nado é maior)
    if (fixa) {
        const saida = fator === 1 ? fixa : de5em5(fixa * fator)
        // Realização: o descanso dentro da saída fixa também fica maior
        if (!athlete.descansoMaior) return saida
        if (nado === null) return saida + 5
        return saidaComDescanso(athlete, nado, saida - nado)
    }
    if (nado === null) return null
    const [de, ate] = cfg.descanso ?? [20, 30]
    return saidaComDescanso(athlete, nado, (de + ate) / 2)
}

// Sem tempos de referência (sem teste de 400 m) não dá para montar a saída:
// no lugar dela vai o descanso entre as repetições ("D20\" de descanso", notação do treinador).
export function descansoFor(rules, athlete, bloco, valor, fator = 1) {
    const intensidade = /^A[123]$/.test(valor ?? '') ? valor : null
    const ritmoLivre = valor === 'NEG' || valor === 'POS' || valor === 'sai/che' || / NAD x 25 fo$/.test(valor ?? '')
    const regra = rules.saidas?.negPosFinalForte
    const segundos = ritmoLivre && regra && bloco.distancia <= regra.ateMetros
        ? (regra.descanso[0] + regra.descanso[1]) / 2
        : blockRest(rules, { ...bloco, intensidade: intensidade ?? (ritmoLivre ? 'A2' : (valor ? 'A3' : bloco.intensidade)) }, athlete, fator === 1)
    // (o solto não muda na Realização)
    return Math.max(5, de5em5(intensityName(rules, bloco.intensidade) === 'solto' && !valor ? segundos : restOfPhase(athlete, segundos)))
}
const descansoText = (segundos) =>
    `D${segundos >= 60 ? minutosCurto(segundos) : `${segundos}"`} de descanso`

// Os descansos de cada parte com intensidade, no mesmo formato das saídas
function descansosDaSerie(rules, athlete, serie, intensidades, fator = 1) {
    if (!intensidades) return null
    const { unidade, valores } = intensidades
    const marca = (b, v) => descansoText(descansoFor(rules, athlete, b, v, fator))
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
// Saída na notação do treinador: "a/c 1'50\"" (a cada)
const marcaText = (x) => (typeof x === 'number' ? `a/c ${saidaText(x)}` : x)

// 90 -> 1'30"; 45 -> 45"
export const saidaText = (segundos) =>
    segundos >= 60 ? `${Math.floor(segundos / 60)}'${String(segundos % 60).padStart(2, '0')}"` : `${segundos}"`

// Saídas de cada parte que recebeu intensidade (série, bloco, repetição ou a série toda)
// `porIntensidade`: cada intensidade com a sua saída (senão A2/A3 ficam com a do A1)
export function saidasDaSerie(rules, athlete, serie, intensidades, porIntensidade = false, variation = null) {
    if (!intensidades) return null
    const { unidade, valores } = intensidades
    // O estilo de cada série (por série) ou o mais lento da série toda
    const sets = serie.vezes ?? (serie.blocos.length === 1 ? serie.blocos[0].vezes ?? 1 : 1)
    const fatorDaSerie = (i) => strokeFactor(rules, variation, i, athlete, serie)
    const todos = Math.max(...Array.from({ length: Math.max(1, sets) }, (_, i) => fatorDaSerie(i)))
    const fator = (i) => (unidade === 'serie' ? fatorDaSerie(i) : todos)
    if (unidade === 'bloco') return serie.blocos.map((b, i) => saidaFor(rules, athlete, b, valores[i], todos))
    // Grupos: cada distância com a sua saída -> { porBloco: [[saídas de cada série] de cada bloco] }
    if (serie.blocos.length > 1) {
        return {
            porBloco: serie.blocos.map((b) => acNoMesmoNivel(rules, valores, ajustarAoA1(rules, valores,
                valores.map((v, i) => saidaFor(rules, athlete, b, v, fator(i))), saidaFor(rules, athlete, b, 'A1', todos), porIntensidade))),
        }
    }
    const bloco = serie.blocos[0]
    return acNoMesmoNivel(rules, valores, ajustarAoA1(rules, valores, valores.map((v, i) => saidaFor(rules, athlete, bloco, v, fator(i))),
        saidaFor(rules, athlete, bloco, 'A1', todos), porIntensidade))
}

// Série com vários AC (ex.: 15, 10 e 5 AC): a saída nunca diminui quando o AC aperta;
// cada AC fica com a maior saída dos AC mais leves (número maior) da série
function acNoMesmoNivel(rules, valores, saidas) {
    if (!rules.saidas?.acNoMesmoNivel) return saidas
    const acDe = (v) => Number(/^(\d+) AC$/.exec(v ?? '')?.[1] ?? NaN)
    return saidas.map((s, i) => {
        const n = acDe(valores[i])
        if (!s || Number.isNaN(n)) return s
        const maisLeves = saidas.filter((x, j) => x && acDe(valores[j]) >= n)
        return Math.max(s, ...maisLeves)
    })
}

// Fator do estilo da série `i` sobre o tempo do crawl (o mais lento quando a série
// mistura estilos). Ex.: costas 1,1 = 10% mais tempo de nado que o crawl.
const ABREV_NADO = { CR: 'crawl', CO: 'costas', PE: 'peito', BO: 'borboleta', MD: 'medley' }
export function strokeFactor(rules, variation, i = 0, athlete = {}, serie = null) {
    const fatores = rules.saidas?.fatorDoEstilo ?? {}
    const de = (nado) => {
        if (!nado || nado === 'livre') return 1
        if (fatores[nado] !== undefined) return fatores[nado]
        // Dividida (ex.: "borboleta/costas"): vale o mais lento
        if (nado.includes('/')) return Math.max(...nado.split('/').map(de))
        if (/medley|estilo/.test(nado)) return fatores.medley ?? 1
        return 1
    }
    if (!variation) return 1
    if (variation.nadoAbrev) return de(ABREV_NADO[variation.nadoAbrev] ?? variation.nadoAbrev)
    let nados
    if (variation.porSerie) nados = variation.porSerie[i] ?? variation.porSerie.flat()
    else if (variation.nados) nados = [variation.nados[i] ?? variation.nados[0]]
    else if (variation.nado === 'melhor_estilo_e_medley') nados = [variation.melhorEstilo, 'medley']
    else if (variation.nado === 'ida_crawl_volta_melhor_estilo') {
        // Metade crawl, metade no melhor estilo
        return (1 + de(athlete.bestStroke ?? 'medley')) / 2
    } else nados = [variation.nado]
    // Blocos escritos com estilos (ex.: "indo crawl, voltando medley")
    const doBloco = (serie?.blocos ?? []).flatMap((b) => [b.nado].flat()).filter((n) => n && n !== 'livre')
    if (variation.nado === 'livre' && doBloco.length > 0) {
        return Math.max(...doBloco.map(de))
    }
    return Math.max(...nados.map(de))
}

// A2/A3 com saída menor que a do A1: a do A1 (mais descanso perto do 100%). Com
// `porIntensidade` (avançado, a partir da Transição, 40% das séries: decidido na
// montagem), cada intensidade fica com a sua. Acima do A1 (iniciante, que descansa
// mais no A3): só um pouco acima.
function ajustarAoA1(rules, valores, saidas, saidaA1, porIntensidade) {
    const cfg = rules.saidas
    if (!cfg || !saidaA1) return saidas
    return saidas.map((s, i) => {
        if (!s || !['A2', 'A3'].includes(valores[i])) return s
        if (s > saidaA1) return Math.min(s, saidaA1 + (cfg.maximoAcimaDoA1 ?? Infinity))
        return porIntensidade ? s : saidaA1
    })
}

// Sorteio (na montagem): esta série fica com a saída de cada intensidade?
export function sorteiaSaidaPorIntensidade(rules, athlete, random = Math.random) {
    const cfg = rules.saidas?.saidaPorIntensidade
    if (!cfg || !cfg.niveis.includes(athlete.level) || !cfg.fases.includes(athlete.fase)) return false
    return random() < cfg.chance
}

// Borboleta na série principal (regra do treinador): de preferência com pé de pato;
// com palmar + pull buoy, bem rara; só em repetições curtas (até 100 m) e mais rara
// que os outros estilos. Na velocidade pode à vontade.
// Avançado voltando de uma parada: nos primeiros 1 ou 2 meses (regras.borboleta.voltandoDaParada)
// a borboleta da principal fica bem rara e só em repetições curtas, para o corpo se acostumar.
export function emAdaptacaoDaBorboleta(rules, athlete, inicioDosTreinos, date) {
    const cfg = adaptacaoDaBorboleta(rules, athlete)
    const dias = cfg?.diasDeAdaptacao?.[athlete.recentBreak]
    if (!dias || !rules.borboleta.voltandoDaParada.niveis.includes(athlete.nivelAntesDaParada ?? athlete.level)) return false
    return daysBetween(inicioDosTreinos, date) < dias
}
// Borboleta como melhor estilo: adaptação mais leve e só no primeiro mês
const adaptacaoDaBorboleta = (rules, athlete) => {
    const cfg = rules.borboleta?.voltandoDaParada
    return athlete.bestStroke === 'borboleta' && cfg?.seForOMelhorEstilo ? cfg.seForOMelhorEstilo : cfg
}
function rulesVoltando(rules, athlete, inicioDosTreinos, date) {
    if (!emAdaptacaoDaBorboleta(rules, athlete, inicioDosTreinos, date)) return rules
    const { pesoNaPrincipal, maiorRepeticaoNaPrincipal } = adaptacaoDaBorboleta(rules, athlete)
    return { ...rules, borboleta: { ...rules.borboleta, pesoNaPrincipal, maiorRepeticaoNaPrincipal } }
}

const temBorboletaInteira = (v) => v.nado === 'borboleta' || v.nados?.includes('borboleta') || v.porSerie?.flat().includes('borboleta')
const temBorboleta = (v) => v.nado === 'borboleta' || v.nados?.includes('borboleta') || v.porSerie?.flat().some((n) => n === 'borboleta' || n.startsWith('borboleta/'))
function butterflyRule(rules, serie, variations) {
    const cfg = rules.borboleta
    if (!cfg) return variations
    const evitar = (m) => (cfg.evitarMaterial ?? []).some((e) => e.every((x) => m.includes(x)))
    return variations
        // A dividida (BO/CO) já vem do sorteio com só metade da repetição em borboleta
        .filter((v) => !temBorboletaInteira(v) || serie.maiorDistancia <= cfg.maiorRepeticaoNaPrincipal)
        .map((v) => (temBorboleta(v)
            ? { ...v, peso: (v.peso ?? 1) * cfg.pesoNaPrincipal * (evitar(v.material) && v.padrao === 'serie_inteira' ? 0.1 : 1) }
            : v))
}

// Velocidade escrita como "livre": o atleta precisa saber o que nadar. Sorteia o estilo
// entre os que ele nada (crawl com mais chance) e escreve no card (CR, CO, PE, BO).
// Perna com pé de pato: nada de peito (nem medley, que tem perna de peito): com o pé
// de pato não dá para fazer a pernada de peito. Nadando (principal, velocidade) pode:
// dá para nadar peito com perna de crawl ou de borboleta.
const temPeito = (nado) => Boolean(nado) && (nado === 'peito' || /medley/.test(nado))
const comPeDePato = (material) => (material ?? []).includes('pe_de_pato')

export function withSpeedStroke(rules, variation, athlete, random = Math.random) {
    if (variation.nado !== 'livre' || variation.nados || variation.porSerie || variation.nadoAbrev) return variation
    const pesoCrawl = rules.saidas?.velocidade?.pesoDoCrawl ?? 2
    // Prova num estilo: o estilo da prova com bem mais chance (regras.estiloDaProva)
    const pesoDaProva = rules.estiloDaProva?.velocidade?.pesoDaProva ?? 1
    const daProva = (n) => (athlete.estilosDaProva ?? []).includes(n)
    const nados = (athlete.strokes?.length ? athlete.strokes : ['crawl']).map((n) => ({ item: n, peso: daProva(n) ? pesoDaProva : n === 'crawl' ? pesoCrawl : 1 }))
    const nado = weightedPick(nados, random)
    return { ...variation, nadoAbrev: NADO_ABREV[nado] ?? nado }
}

// Perna: o card diz o estilo (regras.perna.estilos). Um estilo só, dois alternando
// a cada repetição ("CR | CO") ou medley ("MD", quando a repetição fecha o medley na
// piscina). Com pé de pato, nada de peito (nem medley, que tem peito).
export function withLegStroke(rules, variation, athlete, random = Math.random) {
    if (variation.nadoAbrev || variation.nados || variation.porSerie) return variation
    if (variation.nado && variation.nado !== 'livre') {
        // Escrita num estilo (ex.: "400 perna com pé de pato" de crawl): o card mostra
        return NADO_ABREV[variation.nado] ? { ...variation, nadoAbrev: NADO_ABREV[variation.nado] } : variation
    }
    const cfg = rules.perna?.estilos
    if (!cfg) return variation
    const comPe = comPeDePato(variation.material)
    const pode = (n) => !(comPe && temPeito(n))
    const nados = (athlete.strokes?.length ? athlete.strokes : ['crawl']).filter(pode)
    if (nados.length === 0) return { ...variation, nadoAbrev: 'CR' }
    // Prova num estilo: a perna do estilo da prova com bem mais chance (regras.estiloDaProva)
    const pesoDaProva = rules.estiloDaProva?.perna?.pesoDaProva ?? 1
    const pesoDo = (n) => ((athlete.estilosDaProva ?? []).includes(n) ? pesoDaProva : n === 'crawl' ? cfg.pesoDoCrawl ?? 1 : 1)
    const um = () => weightedPick(nados.map((n) => ({ item: n, peso: pesoDo(n) })), random)
    const distancia = variation._distancia ?? null
    const piscina = athlete.poolLength ?? 25
    const fechaMedley = ['crawl', 'costas', 'peito', 'borboleta'].every((n) => (athlete.strokes ?? []).includes(n)) &&
        !comPe && distancia !== null && distancia % (4 * piscina) === 0
    const formatos = [
        { item: 'um', peso: cfg.formatos.um },
        // (dois alternando só com mais de uma repetição: num tiro único não tem como)
        ...(nados.length >= 2 && (variation._repeticoes ?? 2) > 1 ? [{ item: 'dois', peso: cfg.formatos.dois }] : []),
        ...(fechaMedley ? [{ item: 'medley', peso: cfg.formatos.medley }] : []),
    ]
    const formato = weightedPick(formatos, random)
    if (formato === 'medley') return { ...variation, nadoAbrev: 'MD' }
    const primeiro = um()
    if (formato === 'um') return { ...variation, nadoAbrev: NADO_ABREV[primeiro] }
    const resto = nados.filter((n) => n !== primeiro)
    const segundo = weightedPick(resto.map((n) => ({ item: n, peso: pesoDo(n) })), random)
    return { ...variation, nadoAbrev: `${NADO_ABREV[primeiro]} | ${NADO_ABREV[segundo]}` }
}

// Série escrita como "livre" (sem estilo misturado): é crawl, e o card mostra "CR"
export const withCrawl = (variation) =>
    (variation.nado !== 'livre' || variation.nados || variation.porSerie || variation.nadoAbrev ? variation : { ...variation, nadoAbrev: 'CR' })

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
    // A3 vai com pé de pato; a série adaptada com os 75 m (quem nada pouco) também, toda
    const precisaPe = (i) => serie.exigePe || valorDa(i) === 'A3'
    const permitidas = (i) => (precisaPe(i) && comPe.length > 0 ? comPe : opcoes)
    const embaralha = (lista) => lista.map((m) => ({ m, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.m)
    const comecaNadando = random() * 100 < (cfg.comecarNadando?.[athlete.level] ?? 0)
    const soBracos = (m) => m.includes('palmar') && !m.includes('pe_de_pato')
    const forca = parte === 'principal' && athlete.foco === 'forca'
    // Série com borboleta (principal): evita palmar + pull buoy e prefere pé de pato
    const borboletaNa = (i) => parte === 'principal' && (variation.nado === 'borboleta' ||
        variation.nados?.[i] === 'borboleta' || variation.porSerie?.[i]?.some((n) => n === 'borboleta' || n.startsWith('borboleta/')))
    const evitarNaBorboleta = (m) => (rules.borboleta?.evitarMaterial ?? []).some((e) => e.every((x) => m.includes(x)))
    // Ordem de preferência de cada série: a 1ª nadando (iniciante e intermediário quase
    // sempre); depois, vai colocando material (faltou força: palmar e palmar + pull buoy)
    const preferencia = (i) => {
        let lista = embaralha(permitidas(i))
        if (borboletaNa(i)) {
            const semEvitar = lista.filter((m) => !evitarNaBorboleta(m))
            if (semEvitar.length > 0 && random() < 0.9) lista = semEvitar
        }
        const peso = (m) => (i === 0 && comecaNadando && m.length === 0 ? -3 : 0) +
            (i > 0 && m.length === 0 ? (random() < 0.8 ? 2 : 0) : 0) + (forca && soBracos(m) && random() < 0.8 ? -2 : 0) +
            (borboletaNa(i) && m.includes('pe_de_pato') ? -2.5 : 0)
        return lista.sort((a, b) => peso(a) - peso(b))
    }
    // Procura uma combinação em que nenhuma série repete o material da anterior. Só
    // pode repetir entre duas séries que precisam do mesmo pé de pato (ex.: A3 e A3 de
    // quem só tem pé de pato), porque aí não tem outro jeito.
    const series = []
    const semSaida = (i) => i > 0 && permitidas(i).length === 1 && permitidas(i - 1).length === 1
    const busca = (i) => {
        if (i === sets) return true
        for (const m of preferencia(i)) {
            if (i > 0 && chave(m) === chave(series[i - 1]) && !semSaida(i)) continue
            series.push(m)
            if (busca(i + 1)) return true
            series.pop()
        }
        return false
    }
    if (!busca(0)) {
        // Não tem como (ex.: só pé de pato e todas as séries em A3): repete o possível
        series.length = 0
        for (let i = 0; i < sets; i++) series.push(preferencia(i)[0])
    }
    const material = ['pe_de_pato', 'palmar', 'pull_buoy', 'prancha', 'snorkel', 'paraquedas']
        .filter((m) => series.some((s) => s.includes(m)))
    return { ...variation, padrao: 'por_serie', series, material }
}

// Iniciante com pé de pato ou palmar nada bem mais rápido que o tempo proposto:
// a saída continua a mesma, com o aviso para descansar o intervalo de descanso.
function avisoComEquipamento(rules, athlete, escolha, saidas, serie = null) {
    const temSaida = Array.isArray(saidas) ? saidas.some(Boolean) : saidas?.porBloco?.some((c) => c.some(Boolean))
    if (athlete.level !== 'iniciante' || !temSaida) return null
    const v = escolha.variation
    const materiais = [v.material, ...(v.series ?? []), ...(v.porBloco ?? [])].flat()
    if (!materiais.some((m) => ['pe_de_pato', 'palmar'].includes(m))) return null
    // Descanso pela distância da repetição (regra do treinador; com material eles nadam
    // mais forte que o A3): 25 m 20"; 50 e 100 m 20" a 30"; 200 m 40" a 50"; 400 m 1'
    const tabela = rules.avisoComMaterial?.descanso ?? {}
    const distancias = [...new Set((serie?.blocos ?? []).map((b) => b.distancia))].sort((a, b) => a - b)
    const textos = [...new Set(distancias.map((d) => {
        const chave = Object.keys(tabela).map(Number).sort((a, b) => a - b).find((k) => d <= k)
        return chave !== undefined ? `${tabela[chave]} nos ${d} m` : null
    }).filter(Boolean))]
    return 'Com equipamento você pode chegar bem antes da saída (a/c). Se fizer muito abaixo do tempo proposto, ' +
        `descanse${textos.length ? ` ${textos.join(', ')}` : ' de 20 a 30 segundos'} antes da próxima.`
}

// Segundos que o atleta leva na série, com os descansos. `pace` = segundos por
// 100 m no ritmo do teste de 400 m.
export function estimateSeconds(rules, parte, serie, variation, athlete, pace) {
    if (serie.porSensacao) return serie.duracaoMinutos * 60

    const comPe = variation.material.includes('pe_de_pato')
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
        const base = blockRest(rules, bloco, athlete, fator === 1)
        const descanso = intensityName(rules, bloco.intensidade) === 'solto' ? base : restOfPhase(athlete, base)
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
    pe_de_pato: 'PÉ', palmar: 'PALM', pull_buoy: 'BOIA',
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
        .replace(/\bpeito\b/g, 'PE')
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
// Ordem do que vai em cada linha (o treinador lê assim): como vai nadar (NAD, c/PÉ...),
// a intensidade (A1, A2, NEG...), o(s) estilo(s) e por último o tempo (cd). Quando a
// série tem a descrição de cada série (1ª série, 2ª série...), o estilo e o tempo vão nela.
export function cardText(serie, variation, intervalo = null, intensidades = null, saidas = null) {
    const c = intervalAbbrev(intervalo)
    const nadoDaSerie = variation.nadoAbrev ?? (variation.nadoTexto ? abbreviate(variation.nadoTexto) : null) ??
        (variation.nados || variation.porSerie || !variation.nado || variation.nado === 'livre'
            ? null : abbreviate(variation.texto.slice(serie.texto.length).split(' · ')[1] ?? ''))
    // Material igual em todas as séries: vai no cabeçalho, uma vez só
    const seriesIguais = variation.series?.every((m) => m.join('+') === variation.series[0].join('+'))
    const materialDaSerie = ['serie_inteira', 'obrigatorio'].includes(variation.padrao) || seriesIguais
        ? materialAbbrev(seriesIguais ? variation.series[0] : variation.material) : null
    const materialPorSerie = variation.series && !seriesIguais ? variation.series : null
    // Como nadar: A1/A2/A3 como estão; AC, NEG, POS e final forte entre parênteses
    const I = intensidades
    const fmt = (v) => (/^A\d$/.test(v) || /^ritmo /.test(v) ? v : `(${v})`)
    const cdDe = (i) => (Array.isArray(saidas) && saidas[i] ? marcaText(saidas[i]) : null)
    // A série toda num ritmo só: a intensidade e o tempo uma vez
    const todasIguais = I && I.valores.every((v) => v === I.valores[0])
    const intensidadeToda = I ? (todasIguais ? fmt(I.valores[0]) : I.valores.map(fmt).join(' / ')) : null
    const cdTodo = I ? (todasIguais ? cdDe(0) : null) : cdDe(0)
    // Os estilos de cada série (mistura) ou o da série toda
    const nadosDa = (i) => {
        if (variation.porSerie) {
            // O melhor estilo aparece como ME
            const daSerie = variation.porSerie[i].map((n) => (n === variation.melhorEstilo ? 'ME'
                : n.includes('/') ? `${n.split('/').map((x) => NADO_ABREV[x] ?? x).join('/')} T/${variation.trocaACada}`
                    : NADO_ABREV[n] ?? n))
            return daSerie.every((n) => n === daSerie[0]) ? daSerie[0] : daSerie.join(' | ')
        }
        if (variation.nados) return NADO_ABREV[variation.nados[i]] ?? variation.nados[i]
        return nadoDaSerie
    }
    const linha = (...partes) => partes.filter(Boolean).join(' · ')
    // Série simples com um ritmo por repetição e saídas: uma linha por repetição
    const porRepeticao = I?.unidade === 'repeticao' && Array.isArray(saidas) && saidas.some(Boolean)
    // Grupos: a saída de cada distância (igual em todas as séries -> vai na linha do bloco)
    const porBloco = saidas?.porBloco
    const blocoIgual = porBloco?.map((col) => (col[0] && col.every((s) => s === col[0]) ? col[0] : null))
    const saidaNaSerie = porBloco && blocoIgual.some((s) => s === null) && porBloco.some((col) => col.some(Boolean))

    // Pirâmides e grupos
    if (serie.blocos.length > 1) {
        const linhas = []
        const porSerieNoGrupo = I?.unidade === 'serie'
        const cabecalho = linha((serie.vezes ?? 1) > 1 ? `(${serie.vezes}x)` : null, !I ? nadoDaSerie : null, c)
        if (cabecalho) linhas.push(cabecalho)
        const alternada = variation.padrao === 'piramide_alternada'
        serie.blocos.forEach((bloco, i) => {
            const vezes = bloco.vezes > 1 ? `(${bloco.vezes}x) ` : ''
            const material = variation.porBloco?.[i]
            const comoNada = material?.length > 0 ? materialAbbrev(material) : alternada ? 'NAD' : null
            const base = `${vezes}${bloco.repeticoes} x ${bloco.distancia} m`
            // Pirâmide com uma intensidade por distância: tudo na linha da distância
            if (I?.unidade === 'bloco') linhas.push(linha(base, comoNada, fmt(I.valores[i]), nadoDaSerie, cdDe(i)))
            else linhas.push(linha(base, comoNada, blocoIgual?.[i] && !saidaNaSerie ? marcaText(blocoIgual[i]) : null))
        })
        // A série toda num ritmo: material, intensidade e estilo numa linha
        if (I?.unidade === 'serie_toda' || (!porSerieNoGrupo && I?.unidade !== 'bloco')) {
            const resto = linha(materialDaSerie, I ? intensidadeToda : null, I ? nadoDaSerie : null)
            if (resto) linhas.push(resto)
        } else if (porSerieNoGrupo && materialDaSerie) {
            linhas.push(materialDaSerie)
        }
        // Estilos misturados (um por repetição, na ordem das linhas acima), quando a
        // intensidade não é por série (aí os estilos vão na linha de cada série)
        if (variation.porSerie && !porSerieNoGrupo) {
            if (variation.porSerie.length === 1) linhas.push(`Estilos: ${nadosDa(0)}`)
            else variation.porSerie.forEach((_, i) => linhas.push(`${ORDINAIS[i]} série: ${nadosDa(i)}`))
        }
        // Grupo repetido com intensidade por série
        if (porSerieNoGrupo) {
            I.valores.forEach((v, i) => {
                const material = materialPorSerie ? materialAbbrev(materialPorSerie[i]) : null
                // Saídas diferentes em cada série: "100 cd 1'55" / 75 cd 1'25""
                const cds = saidaNaSerie ? serie.blocos.map((b, j) => (porBloco[j][i] ? `${b.distancia} ${marcaText(porBloco[j][i])}` : null))
                    .filter(Boolean).join(' / ') : null
                linhas.push(`${ORDINAIS[i]} série: ${linha(material, fmt(v), nadosDa(i), cds)}`)
            })
        }
        return linhas.join('\n')
    }

    const base = abbreviate(withMeters(variation.textoDaSerie ?? serie.texto))
    const porSerie = materialPorSerie || variation.nados || variation.porSerie || (I?.unidade === 'serie' ? I.valores : null)
    if (!porSerie) {
        if (porRepeticao) {
            // 5 x 400 m · c/PÉ + PALM
            // 1º: A1 · CR · cd 6'50"
            return [linha(base, materialDaSerie, c), ...I.valores.map((v, i) => `${i + 1}º: ${linha(fmt(v), nadoDaSerie, cdDe(i))}`)].join('\n')
        }
        // Uma linha só: série · como nada · intensidade · estilo · tempo · intervalo
        return linha(base, materialDaSerie, intensidadeToda, nadoDaSerie, cdTodo, c)
    }

    // Uma linha por série: como nada · intensidade · estilo(s) · tempo
    const linhas = porSerie.map((_, i) => {
        const material = materialPorSerie ? materialAbbrev(materialPorSerie[i]) : null
        const intensidade = I ? fmt(I.unidade === 'serie' ? I.valores[i] : I.valores[0]) : null
        const cd = I?.unidade === 'serie' ? cdDe(i) : cdTodo
        return `${ORDINAIS[i]} série: ${linha(material, intensidade, nadosDa(i), cd)}`
    })
    return [linha(base, materialDaSerie, c), ...linhas].join('\n')
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

// Segundos de tempo morto a cada troca de parte do treino (regra do treinador)
export const tempoMorto = (rules) => rules.tempoMorto?.segundosPorTroca ?? 0
// Minutos de tempo morto de um treino montado: uma troca entre cada parte nadada
export const minutosDeTroca = (rules, partes) =>
    Math.round((Math.max(0, partes.filter((p) => p.parte !== 'hidratacao').length - 1) * tempoMorto(rules)) / 60)

// O atleta, do jeito que a série principal enxerga: pela prova alvo (estilo da prova)
const NO_CRAWL = ['triatlo', 'maratona_aquatica']
export function athleteForMain(athlete) {
    const provas = athlete.provas?.length ? athlete.provas : athlete.prova ? [athlete.prova] : []
    const estilosDasProvas = provas.length ? [...new Set(provas.map((p) => p.estilo))] : NO_CRAWL.includes(athlete.modalidade) ? ['crawl'] : []
    if (estilosDasProvas.length === 0 || estilosDasProvas.includes('medley')) return athlete
    // Provas no crawl (triatlo, águas abertas, livre): só crawl. Provas num estilo: a principal
    // fica nesses estilos e no crawl (o "ME" é o estilo da prova principal)
    const estilos = estilosDasProvas.filter((e) => e !== 'crawl' && athlete.strokes?.includes(e))
    const principal = provas[0]?.estilo
    return {
        ...athlete,
        strokes: ['crawl', ...estilos],
        bestStroke: estilos.includes(principal) ? principal : estilos[0] ?? null,
    }
}

// ---------- Metros de cada estilo (resumo do Desempenho) ----------

const ESTILO_DA_ABREV = { CR: 'crawl', CO: 'costas', PE: 'peito', BO: 'borboleta' }
// Metros de cada estilo numa parte do treino, pelo que está escrito no card: os metros da parte
// divididos pelos estilos que aparecem (cada "CR", "PE"... é uma repetição ou uma série; medley
// conta 1/4 para cada estilo; "ME" é o melhor estilo). Sem estilo escrito: crawl (livre).
export function strokeMeters(texto, metros, melhorEstilo = null) {
    const peso = {}
    const somar = (estilo, w) => { peso[estilo] = (peso[estilo] ?? 0) + w }
    for (const [, abrev] of (texto ?? '').matchAll(/\b(CR|CO|PE|BO|MD|ME)\b/g)) {
        if (abrev === 'MD') for (const e of ['borboleta', 'costas', 'peito', 'crawl']) somar(e, 0.25)
        else if (abrev === 'ME') somar(melhorEstilo ?? 'crawl', 1)
        else somar(ESTILO_DA_ABREV[abrev], 1)
    }
    const total = Object.values(peso).reduce((t, w) => t + w, 0)
    if (!metros) return {}
    if (total === 0) return { crawl: metros }
    return Object.fromEntries(Object.entries(peso).map(([e, w]) => [e, Math.round((metros * w) / total)]))
}

// ---------- Estilo da prova na preparação toda ----------

// As outras provas do atleta além da principal: as da competição alvo e as importantes
// (prioridade B), sem repetir e só nos estilos que ele nada (medley: os quatro)
export function otherRaces(athlete) {
    const principal = athlete.prova ?? athlete.provas?.[0] ?? null
    const nada = new Set(athlete.strokes ?? [])
    const quatro = ['crawl', 'costas', 'peito', 'borboleta'].every((e) => nada.has(e))
    const chave = (p) => `${p.distancia}-${p.estilo}`
    const vistas = new Set(principal ? [chave(principal)] : [])
    return [...(athlete.provas ?? []), ...(athlete.provasImportantes ?? [])].filter((p) => {
        if (!p?.distancia || !p.estilo || vistas.has(chave(p))) return false
        vistas.add(chave(p))
        return p.estilo === 'medley' ? quatro : nada.has(p.estilo)
    }).map((p) => ({ ...p, modalidade: p.modalidade ?? principal?.modalidade ?? athlete.modalidade ?? null }))
}

// Estilos das provas (alvo e importantes) que o atleta treina além do crawl. Medley só se ele
// nada os quatro. Prova de crawl (livre, triatlo, águas abertas): nenhum.
export function raceStrokes(athlete) {
    const provas = athlete.provas?.length ? athlete.provas : athlete.prova ? [athlete.prova] : []
    const nada = new Set(athlete.strokes ?? [])
    const quatro = ['crawl', 'costas', 'peito', 'borboleta'].every((e) => nada.has(e))
    return [...new Set([...provas.map((p) => p.estilo), ...(athlete.estilosImportantes ?? []), ...(athlete.provasImportantes ?? []).map((p) => p.estilo)])]
        .filter((e) => e && e !== 'crawl' && (e === 'medley' ? quatro : nada.has(e)))
}

// Foco da série principal de cada treino com prova num estilo (regra do treinador): ~40% no
// estilo da prova, ~40% de crawl e ~20% de outros estilos (se o atleta nada outros). Sai na
// ordem que mantém as proporções (o que está mais atrasado entra primeiro).
export function styleFocusSchedule(rules, athlete, total) {
    const cfg = rules.estiloDaProva
    const todos = raceStrokes(athlete)
    if (!cfg || todos.length === 0) return Array(total).fill(null)
    // A prova principal num estilo fica com a parte da 'prova'; os estilos das outras provas
    // (da competição e importantes) entram na parte dos 'outros' estilos
    const principal = (athlete.prova ?? athlete.provas?.[0])?.estilo
    const estilos = principal && todos.includes(principal) ? [principal] : todos
    const preferidos = todos.filter((e) => !estilos.includes(e))
    const outros = (athlete.strokes ?? []).some((e) => e !== 'crawl' && !estilos.includes(e))
    const alvo = { prova: cfg.principal.prova + (outros ? 0 : cfg.principal.outros), crawl: cfg.principal.crawl, outros: outros ? cfg.principal.outros : 0 }
    const feitos = { prova: 0, crawl: 0, outros: 0 }
    return Array.from({ length: total }, (_, i) => {
        const cat = Object.keys(alvo).filter((k) => alvo[k] > 0)
            .sort((a, b) => (alvo[b] * (i + 1) - feitos[b]) - (alvo[a] * (i + 1) - feitos[a]))[0]
        feitos[cat]++
        return { categoria: cat, estilos, ...(cat === 'outros' && preferidos.length > 0 && { preferidos }) }
    })
}

const ehCrawl = (v) => v.nado === 'livre' && !v.nados && !v.porSerie && !v.nadoAbrev
// As variações da série para o foco do treino ('prova', 'crawl' ou 'outros'). Vazia: a série
// não serve para esse foco.
function variationsForFocus(rules, parte, serie, athlete, foco, variations, random) {
    const comEstilo = (estilos) => {
        if (!canSwimInStroke(serie.blocos)) return []
        const comoEstilo = { ...serie, outrosNados: [...new Set([...(serie.outrosNados ?? []), 'estilo'])] }
        const nadador = { ...athlete, strokes: ['crawl', ...estilos] }
        return seriesVariations(rules, parte, comoEstilo, nadador).filter((v) => estilos.includes(v.nado) && variationFits(v, athlete))
    }
    if (foco.categoria === 'crawl') return variations.filter(ehCrawl)
    if (foco.categoria === 'prova') {
        const simples = foco.estilos.filter((e) => e !== 'medley')
        const daProva = comEstilo(simples)
        if (foco.estilos.includes('medley')) {
            // Prova de medley: o medley (individual ou alternado) ou os estilos misturados
            const medley = seriesVariations(rules, parte, { ...serie, outrosNados: ['medley'] }, athlete).filter((v) => /medley/.test(v.nado) && variationFits(v, athlete))
            const mistura = drawMixedStrokes(rules, parte, serie, { ...athlete, strokes: athlete.estilosDoAtleta ?? athlete.strokes }, random)
            return [...daProva, ...medley, ...(mistura && variationFits(mistura, athlete) ? [mistura] : [])]
        }
        return daProva
    }
    // Outros estilos: o das outras provas (da competição e importantes), a série inteira nele
    if (foco.preferidos?.length) {
        const dasOutras = comEstilo(foco.preferidos.filter((e) => e !== 'medley'))
        const medley = foco.preferidos.includes('medley')
            ? seriesVariations(rules, parte, { ...serie, outrosNados: ['medley'] }, { ...athlete, strokes: athlete.estilosDoAtleta ?? athlete.strokes })
                .filter((v) => /medley/.test(v.nado) && variationFits(v, athlete))
            : []
        if (dasOutras.length + medley.length > 0) return [...dasOutras, ...medley]
    }
    // Senão, a série num estilo que não é o da prova, ou os estilos misturados
    const todos = athlete.estilosDoAtleta ?? athlete.strokes ?? []
    const outros = todos.filter((e) => e !== 'crawl' && !foco.estilos.includes(e))
    const mistura = drawMixedStrokes(rules, parte, serie, { ...athlete, strokes: todos }, random)
    return [...comEstilo(outros), ...(mistura && variationFits(mistura, athlete) ? [mistura] : [])]
}

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
    // A série do treino anterior não se repete (só se não houver outra que sirva). Na 2ª
    // principal, não repetir vale mais que alternar crawl e estilo: se só a série de
    // ontem serve como estilo, vai outra (sem repetir), mesmo sem alternar.
    const semRepetir = (rules.naoRepetirNoTreinoSeguinte?.partes ?? []).includes(parte) && bloqueadas?.size > 0
    const escolher = (a) => (semRepetir && pickAmong(a, bloqueadas)) ||
        (semRepetir && a.primeiraPrincipal && pickAmong({ ...a, semAlternar: true }, bloqueadas)) ||
        pickAmong(a, null)
    // Com o foco de estilo do treino (prova num estilo); sem série que sirva, sem o foco
    return (args.focoDeEstilo && escolher(args)) || escolher({ ...args, focoDeEstilo: null })
}

// Séries (2x), (3x), (4x)...: as opções de quantas séries o atleta faz (a escrita
// primeiro). De `minimo` até o número escrito + `aumentarAte` do nível.
export function setOptions(rules, parte, serie, level, sessionMinutes = null) {
    const cfg = rules.seriesAjustaveis
    const escrito = /^\((\d+)x\) /.exec(serie.texto)
    if (!cfg || !cfg.partes.includes(parte) || !escrito || serie.materialPorSerie) return [serie]
    const n = Number(escrito[1])
    const doGrupo = serie.vezes === n
    const doBloco = !doGrupo && serie.blocos.length === 1 && serie.blocos[0].vezes === n
    if (!doGrupo && !doBloco) return [serie]
    const ate = Math.min(cfg.maximo, n + (cfg.aumentarAte?.[level] ?? 0))
    const opcoes = [serie]
    // Aula curta (30 min): qualquer nível pode fazer uma série só
    const aulaCurta = sessionMinutes !== null && sessionMinutes <= (cfg.aulaCurtaAteMinutos ?? 0)
    const minimo = aulaCurta ? 1 : cfg.minimoPorNivel?.[level] ?? cfg.minimo
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

function pickAmong({ rules, library, parte, budget, athlete, pace, random, recentes, primeiraPrincipal, semAlternar = false, focoDeEstilo = null }, evitar) {
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
        // (e a 2ª principal nunca igual à 1ª, mesmo vindo de outra série da biblioteca)
        const opcoes = setOptions(rules, parte, original, athlete.level, athlete.sessionMinutes)
            .filter((s) => !evitar?.has(`texto:${s.texto}`) && s.texto !== primeiraPrincipal?.serie.texto)
        if (opcoes.length === 0) continue
        const serie = opcoes.length === 1 ? opcoes[0] : opcoes
            .map((s) => ({ s, fora: foraDoTempo(estimateSeconds(rules, parte, s, { material: [] }, athlete, pace)) }))
            .reduce((melhor, o) => (o.fora < melhor.fora ? o : melhor)).s
        // Série adaptada com os 75 m: só com pé de pato
        const serve = (v) => variationFits(v, athlete) && (!serie.exigePe || v.material.includes('pe_de_pato'))
        let variations = seriesVariations(rules, parte, serie, athlete).filter(serve)
        // Borboleta na principal: só até 100 m, mais rara, e quase nunca com palmar + pull buoy
        if (parte === 'principal') variations = butterflyRule(rules, serie, variations)
        const mistura = drawMixedStrokes(rules, parte, serie, athlete, random)
        if (mistura && serve(mistura)) variations.push(mistura)
        // Prova num estilo: o foco do treino (estilo da prova, crawl ou outros estilos)
        if (focoDeEstilo) {
            variations = variationsForFocus(rules, parte, serie, athlete, focoDeEstilo, variations, random).filter(serve)
            if (parte === 'principal') variations = butterflyRule(rules, serie, variations)
        }
        if (primeiraPrincipal && !semAlternar) {
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
    // Prova de peito (ou medley): a perna sem pé de pato (com ele não dá a pernada de peito)
    const pernaDePeito = parte === 'perna' && (athlete.estilosDaProva ?? []).some((e) => e === 'peito' || e === 'medley')
    const semPe = (v) => !v.material.includes('pe_de_pato')
    const bonus = (c) => (foco === 'respiracao' && c.serie.maiorDistancia <= 50 ? 90 : 0) +
        (foco === 'forca' && c.variations.some(comPalmar) ? 90 : 0) +
        (pernaDePeito && c.variations.some(semPe) ? (rules.estiloDaProva?.perna?.bonusSemPeDePato ?? 0) : 0)
    // (o solto e a soltura podem repetir: lá, só o tempo conta)
    const variar = (rules.naoRepetirNoTreinoSeguinte?.partes ?? []).includes(parte)
    const distancia = (c) => foraDoTempo(c.segundos) - bonus(c) + (variar ? 60 * (recentes.vezes(c.serie.id) +
        recentes.vezes(`texto:${c.serie.texto}`) + (c.serie.familia ? recentes.vezes(`familia:${c.serie.familia}`) : 0)) : 0)
    // Sorteia só entre as que ficam perto da melhor (até 1 min ou 15% do tempo da parte a mais)
    const ordenadas = candidatas.sort((a, b) => distancia(a) - distancia(b))
    const limite = distancia(ordenadas[0]) + Math.max(60, budget * 0.15)
    const melhores = ordenadas.filter((c) => distancia(c) <= limite).slice(0, 3)
    const escolhida = weightedPick(melhores.map((c) => ({ item: c, peso: c.serie.peso })), random)
    // Estilos misturados (quem nada outros estilos): saem em 'misturaDeNados.chance' das séries
    // em que cabem (antes era uma variação entre muitas de crawl e quase nunca saía)
    const misturada = escolhida.variations.find((v) => v.nado === 'misto')
    const chanceDaMistura = rules.misturaDeNados?.chance
    const outras = escolhida.variations.filter((v) => v !== misturada || chanceDaMistura === undefined)
    const variation = misturada && (outras.length === 0 || (chanceDaMistura !== undefined && random() < chanceDaMistura)) ? misturada
        : weightedPick(outras.map((v) => ({
            item: v, peso: (v.peso ?? 1) * (foco === 'forca' && comPalmar(v) ? 4 : 1) * (pernaDePeito && semPe(v) ? rules.estiloDaProva?.perna?.pesoSemPeDePato ?? 1 : 1),
        })), random)
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
// Técnica (educativos): módulo separado, carregado uma vez
let tecnicaPadrao = null
const tecnicaDoApp = () => (tecnicaPadrao ??= loadTecnica())
// Saída (a/c) do A1, A2 e A3 nas séries do Específico: a mesma conta do Geral (tabela do
// teste de 400 m, fator do estilo e o descanso escrito na série). Sem tempos: null.
const saidaDoEspecifico = (rules, athlete) => (athlete.tabela
    ? (b, estilo) => saidaFor(rules, athlete, { distancia: b.dist, repeticoes: b.rep, intensidade: b.ritmo, descanso: b.descanso }, b.ritmo,
        rules.saidas?.fatorDoEstilo?.[estilo] ?? 1)
    : null)

// Modelo Específico da prova (módulo separado): só nos treinos da Transição e da Realização
let especificoPadrao = null
const especificoDoApp = () => (especificoPadrao ??= loadEspecifico())
// Treino de saúde/emagrecimento (módulo separado): só nos dias de saúde
let saudePadrao = null
const saudeDoApp = () => (saudePadrao ??= loadSaude())

function buildTraining({ rules, library, athlete, pace, random, recentes, proibidas = [], bloqueadas, fatorPrincipal = 1, tecnica = null, estadoTecnica = null, focoDoEstilo = null }) {
    const leve = soRitmoLeve(rules, athlete) || Boolean(athlete.soLeve)
    let estrutura = partsForLevel(rules, athlete.level, athlete.sessionMinutes).filter((p) => !leve || p !== 'velocidade')
    // Com o nado contínuo (série de teste), ele fica no lugar da 2ª série principal
    if (athlete.serieDeTeste) {
        const primeira = estrutura.indexOf('principal')
        estrutura = estrutura.filter((p, i) => p !== 'principal' || i === primeira)
    }
    const pausas = estrutura.map((p) => pauseOf(rules, p)).filter(Boolean)
    // Tempo morto: a troca de uma parte para a outra (1' cada; a hidratação já é parada)
    const trocas = Math.max(0, estrutura.filter((p) => !pauseOf(rules, p)).length - 1 + (athlete.serieDeTeste ? 1 : 0))
    const segundosLivres = (athlete.sessionMinutes - pausas.reduce((s, p) => s + p.minutos, 0)) * 60 - trocas * tempoMorto(rules)
    const somaPesos = estrutura.filter((p) => !pauseOf(rules, p)).reduce((s, p) => s + (TEMPO_DAS_PARTES[p] ?? 0), 0)
    const principais = estrutura.filter((p) => p === 'principal').length

    const escolhas = new Map() // posição na estrutura -> escolha
    // A série principal segue a prova alvo: prova no crawl (triatlo, águas abertas, livre)
    // só crawl; prova num estilo: ele é o "melhor estilo" da principal
    // (com os estilos que ele nada, para os "outros estilos" do foco do treino)
    const daPrincipal = { ...athleteForMain(athlete), estilosDoAtleta: athlete.strokes }
    // Triatlo e maratona aquática: o aquecimento e a velocidade também são de crawl
    const soCrawl = NO_CRAWL.includes(athlete.modalidade) ? { ...athlete, strokes: ['crawl'], bestStroke: null } : athlete
    const doAtleta = (parte) => (parte === 'principal' ? daPrincipal : ['aquecimento', 'velocidade'].includes(parte) ? soCrawl : athlete)
    const escolher = (i, budget, primeiraPrincipal = null) => {
        const parte = estrutura[i]
        // Prova num estilo: a 1ª série principal segue o foco do treino (prova, crawl ou outros)
        const focoDeEstilo = parte === 'principal' && !primeiraPrincipal ? focoDoEstilo : null
        const escolha = pickForPart({ rules, library, parte, budget, athlete: doAtleta(parte), pace, random, recentes, primeiraPrincipal, bloqueadas, focoDeEstilo })
        if (escolha) {
            escolhas.set(i, escolha)
            recentes.add(escolha.serie.id)
            recentes.add(`texto:${escolha.serie.texto}`)
            if (escolha.serie.familia) recentes.add(`familia:${escolha.serie.familia}`)
        }
        return escolha
    }

    // Técnica: no aquecimento OU no solto depois da velocidade (nunca nos dois)
    const soltoDepoisDaVelocidade = estrutura.some((p, i) => p === 'solto' && estrutura[i - 1] === 'velocidade')
    const parteComTecnica = tecnica ? parteDaTecnica({ tecnica, athlete, soltoDepoisDaVelocidade, random }) : null

    // 1º as partes que não são a principal, cada uma com a sua parte do tempo
    let usado = 0
    estrutura.forEach((parte, i) => {
        if (parte === 'principal' || pauseOf(rules, parte)) return
        const escolha = escolher(i, (segundosLivres * (TEMPO_DAS_PARTES[parte] ?? 0)) / somaPesos)
        if (escolha) usado += escolha.segundos
        // Técnica no aquecimento e no solto depois da velocidade (técnica cansado)
        const comTecnica = parte === parteComTecnica && (parte === 'aquecimento' || estrutura[i - 1] === 'velocidade')
        if (escolha && comTecnica) {
            escolha.tecnica = montarTecnica({ tecnica, athlete: doAtleta(parte), parte, pace, random, recentes, estado: estadoTecnica })
            if (escolha.tecnica) usado += escolha.tecnica.segundos
        }
    })
    // Nado contínuo (série de teste): antes da série principal, e o tempo dele sai da principal
    let continuo = null
    if (athlete.serieDeTeste) {
        const { distancia } = athlete.serieDeTeste
        const estilo = ['costas', 'peito'].includes(athlete.prova?.estilo) && athlete.strokes?.includes(athlete.prova.estilo) ? athlete.prova.estilo : 'crawl'
        const fator = estilo === 'crawl' ? 1 : rules.saidas?.fatorDoEstilo?.[estilo] ?? 1.35
        const abrev = { crawl: 'CR', costas: 'CO', peito: 'PE' }[estilo]
        const { fracionado } = athlete.serieDeTeste
        // Iniciante no dia de saúde: o nado contínuo vai em partes (ex.: 8 x 50 m com 20" de descanso)
        const reps = fracionado ? Math.max(1, Math.round(distancia / fracionado.repeticao)) : 1
        const segundos = Math.round((distancia / 100) * pace * (rules.serieDeTeste?.ritmo ?? 1.15) * fator) + (reps - 1) * (fracionado?.descanso ?? 0)
        continuo = fracionado ? {
            parte: 'continuo', titulo: 'Nado em partes', serieId: 'nado-fracionado', serieTexto: `${distancia} m em partes`,
            texto: `${reps} x ${fracionado.repeticao} m · ${abrev} · A1 · D${fracionado.descanso}" de descanso`,
            observacao: 'Nade todas as repetições em ritmo leve. Conforme for ficando fácil, a metragem aumenta aos poucos.',
            nado: estilo, material: [], metros: reps * fracionado.repeticao, minutos: Math.round(segundos / 60), fracionado: true,
        } : {
            parte: 'continuo', titulo: NOMES_DAS_PARTES.continuo, serieId: 'nado-continuo', serieTexto: `${distancia} m contínuo`,
            texto: `${distancia} m · ${abrev} · sem parar, em ritmo leve`,
            observacao: 'Nade a distância toda sem parar, no seu ritmo. Se precisar parar, tudo bem: conte isso ao concluir o treino.',
            nado: estilo, material: [], metros: distancia, minutos: Math.round(segundos / 60),
        }
        usado += segundos
    }
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

    // A técnica não pode fazer o treino passar do tempo (a série principal já está no
    // mínimo): sai primeiro a do solto, depois a do aquecimento
    if (tecnica) {
        const limite = Math.min(athlete.sessionMinutes, rules.niveis?.[athlete.level]?.maxMinutosDeTreino ?? Infinity) * 60 * 1.15
        let total = pausas.reduce((s, p) => s + p.minutos * 60, 0) +
            [...escolhas.values()].reduce((s, e) => s + e.segundos + (e.tecnica?.segundos ?? 0), 0) + (continuo ? continuo.minutos * 60 : 0) + trocas * tempoMorto(rules)
        for (const parte of ['solto', 'aquecimento']) {
            if (total <= limite) break
            const escolha = [...escolhas.entries()].find(([i, e]) => estrutura[i] === parte && e.tecnica)?.[1]
            if (!escolha) continue
            total -= escolha.tecnica.segundos
            const { sequencia, passo } = escolha.tecnica.registro
            if (sequencia && estadoTecnica) estadoTecnica.passos[sequencia] = passo - 1 // o passo fica para o próximo
            escolha.tecnica = null
        }
    }

    // Monta na ordem do treino
    const partes = []
    estrutura.forEach((parte, i) => {
        if (parte === 'principal' && continuo) {
            partes.push(continuo)
            continuo = null
        }
        const pausa = pauseOf(rules, parte)
        if (pausa) {
            partes.push({ parte, titulo: 'Hidratação', texto: pausa.texto, metros: 0, minutos: pausa.minutos })
            return
        }
        const escolha = escolhas.get(i)
        if (!escolha) return // nenhuma série da biblioteca serve para esse atleta
        const segunda = parte === 'principal' && partes.some((p) => p.parte === 'principal')
        // Velocidade "livre": o estilo vai escrito (sorteado entre os que o atleta nada).
        // Série principal "livre": é crawl, e o card diz isso (CR)
        if (parte === 'velocidade') escolha.variation = withSpeedStroke(rules, escolha.variation, soCrawl, random)
        if (parte === 'principal') escolha.variation = withCrawl(escolha.variation)
        if (parte === 'perna') {
            const distancia = Math.max(...escolha.serie.blocos.map((b) => b.distancia))
            const repeticoes = escolha.serie.blocos.reduce((s, b) => s + (b.vezes ?? 1) * b.repeticoes, 0)
            const { _distancia, _repeticoes, ...comEstilo } = withLegStroke(rules,
                { ...escolha.variation, _distancia: distancia, _repeticoes: repeticoes }, athlete, random)
            void _distancia
            void _repeticoes
            escolha.variation = comEstilo
        }
        // (2x), (3x), (4x)...: um material diferente em cada série, sem repetir em seguida
        escolha.variation = rotateSetMaterials(rules, parte, escolha.serie, escolha.variation, escolha.intensidades, athlete, random)
        // Intervalo entre as séries (Acumulação 1: maior)
        const faixa = intervalRangeFor(rules, parte, escolha.serie, athlete.level)
        const extra = parte === 'principal' ? athlete.intervaloExtra ?? 0 : 0
        const faixaDoDia = faixa && extra ? { min: faixa.min + extra, max: faixa.max + extra } : faixa
        const intervalo = intervalText(faixaDoDia)
        // Como a parte foi montada (fica no plano interno): com um tempo novo, o texto é
        // refeito (cd, ritmo, velocidade) sem mudar a série
        const montagem = partMontage(parte, escolha.serie, escolha.variation, faixaDoDia, escolha.intensidades, athlete)
        if (escolha.tecnica) montagem.tecnica = escolha.tecnica.texto
        // Saída de cada intensidade (avançado, a partir da Transição, 40% das séries)
        if (escolha.intensidades && sorteiaSaidaPorIntensidade(rules, athlete, random)) montagem.dia.saidaPorIntensidade = true
        const { texto, aviso } = renderPart(rules, athlete, montagem)
        partes.push({
            parte,
            titulo: segunda ? '2ª série principal' : NOMES_DAS_PARTES[parte],
            serieId: escolha.serie.id,
            serieTexto: escolha.serie.texto,
            ...(escolha.serie.familia && { serieFamilia: escolha.serie.familia }),
            texto,
            ...(aviso && { aviso }),
            _montagem: montagem,
            ...(escolha.intensidades && { intensidades: escolha.intensidades }),
            ...(intervalo && { intervalo }),
            nado: escolha.variation.nado,
            material: escolha.variation.material,
            ...(escolha.serie.observacao && !escolha.tecnica && { observacao: escolha.serie.observacao }),
            metros: escolha.serie.volume + (escolha.tecnica?.metros ?? 0),
            minutos: Math.round((escolha.segundos + (escolha.tecnica?.segundos ?? 0)) / 60),
            ...(escolha.tecnica && { _tecnica: escolha.tecnica.registro }),
        })
    })
    // Se o treino passar do tempo da aula (contando o tempo morto das trocas), saem a perna e
    // o solto do meio do treino; com o nado contínuo, também a velocidade (nessa ordem)
    const ordem = partes.some((p) => p.parte === 'continuo') ? ['perna', 'solto', 'velocidade'] : ['perna', 'solto']
    let lista = partes
    for (const tirar of ordem) {
        const total = lista.reduce((t, p) => t + (p.minutos ?? 0), 0) + minutosDeTroca(rules, lista)
        if (total <= athlete.sessionMinutes * 1.1) break
        lista = lista.filter((p) => p.parte !== tirar)
    }
    if (lista !== partes) return lista
    return partes
}

// ---------- Montagem guardada (para refazer o texto com um tempo novo) ----------

// O que é preciso para escrever o card de novo: a série (como saiu), a variação
// (material, estilos), o intervalo, as intensidades e as regras do dia (etapa).
function partMontage(parte, serie, variation, faixa, intensidades, athlete) {
    const { id, texto, vezes, blocos, exigePe, materialPorSerie, familia, observacao } = serie
    return {
        parte,
        serie: { id, texto, ...(vezes && { vezes }), blocos, ...(exigePe && { exigePe }), ...(materialPorSerie && { materialPorSerie }),
            ...(familia && { familia }), ...(observacao && { observacao }) },
        variation,
        faixa: faixa ?? null,
        intensidades: intensidades ?? null,
        dia: {
            fase: athlete.fase ?? null, descansoExtra: athlete.descansoExtra ?? 0, velocidade25: athlete.velocidade25 ?? null,
            descansoMaior: athlete.descansoMaior ?? null,
        },
    }
}

// Escreve o texto do card de uma parte montada: saídas (cd) quando o atleta tem
// tempos; sem tempos, o descanso e o ritmo por extenso. Devolve { texto, aviso }.
export function renderPart(rules, athlete, montagem) {
    const { parte, variation, faixa, intensidades } = montagem
    const doDia = { ...athlete, ...montagem.dia }
    // Série da prova (modelo Específico): só o a/c do A1, A2 e A3 muda com o tempo novo
    if (montagem.especifico) return { texto: textoDaSerie(montagem.especifico.serie, montagem.especifico.prova, saidaDoEspecifico(rules, doDia)) }
    const serie = describe(montagem.serie)
    let saidas = parte === 'velocidade'
        ? (serie.blocos.length === 1 ? [saidaVelocidade(rules, doDia, serie.blocos[0], strokeFactor(rules, variation, 0, doDia, serie))] : null)
        : saidasDaSerie(rules, doDia, serie, intensidades, Boolean(montagem.dia?.saidaPorIntensidade), variation)
    const aviso = avisoComEquipamento(rules, doDia, { variation, intensidades }, saidas, serie)
    // Sem tempos de referência: o descanso no lugar da saída (velocidade: 20" a 30")
    if (!doDia.tabela) {
        // (na Realização, 30 a 40% a mais e de 5 em 5: 25" a 40")
        const [de, ate] = (rules.saidas?.velocidade?.descanso ?? [20, 30]).map((x) => restOfPhase(doDia, x))
        saidas = parte === 'velocidade'
            ? (saidas?.[0] ? saidas : [`D${de}" a ${ate}" de descanso`])
            : descansosDaSerie(rules, doDia, serie, intensidades, strokeFactor(rules, variation, null, doDia, serie))
    }
    const base = cardText(serie, variation, faixa, comoMostrar(rules, doDia, intensidades), saidas)
    const texto = base + legAlternation(parte, serie, variation) + breaststrokeWithFins(parte, base, doDia)
    // Técnica da parte (aquecimento, solto): vai embaixo, como foi montada. A observação
    // da série (ex.: "Pode ser feito com pull buoy.") vai junto da série, para não
    // parecer ser da técnica
    if (!montagem.tecnica) return { texto, aviso }
    const obs = montagem.serie.observacao?.replace(/\.$/, '')
    const daSerie = obs ? `${texto} (${obs[0].toLowerCase()}${obs.slice(1)})` : texto
    return { texto: `${daSerie}\n${montagem.tecnica}`, aviso }
}

// Peito com pé de pato (nadando, fora da perna): a pernada é de borboleta ou de crawl
// (regra do treinador). Vale para PE, MD (o medley tem peito) e ME quando o melhor estilo
// é o peito, na mesma linha do c/PÉ (ou na série toda, quando o c/PÉ está no cabeçalho).
function breaststrokeWithFins(parte, texto, athlete) {
    if (parte === 'perna' || !texto.includes('c/PÉ')) return ''
    const temPeito = (t) => /\b(PE|MD)\b/.test(t) || (athlete.bestStroke === 'peito' && /\bME\b/.test(t))
    const linhas = texto.split('\n')
    const vale = linhas[0].includes('c/PÉ') ? temPeito(texto) : linhas.some((l) => l.includes('c/PÉ') && temPeito(l))
    return vale ? '\nPeito com pé de pato: faça a pernada de borboleta ou de crawl.' : ''
}

// Perna com dois estilos ("CO | CR"): explica que alterna a cada repetição, para não
// parecer ida de um e volta de outro. Ex.: "1ª: 100 m CO · 2ª: 100 m CR · 3ª: 100 m CO..."
function legAlternation(parte, serie, variation) {
    const dois = parte === 'perna' && /^(\w+) \| (\w+)$/.exec(variation.nadoAbrev ?? '')
    if (!dois) return ''
    const reps = serie.blocos.flatMap((b) => Array(b.repeticoes).fill(b.distancia))
    const todas = Array.from({ length: serie.vezes ?? 1 }, () => reps).flat()
    const mostrar = Math.min(todas.length, 4)
    const lista = todas.slice(0, mostrar).map((d, i) => `${ORDINAIS[i]}: ${d} m ${dois[1 + (i % 2)]}`).join(' · ')
    return `\nUma repetição de cada estilo, alternando: ${lista}${todas.length > mostrar ? ' · e assim por diante' : ''}`
}

// Treino mais leve depois de faltas. `como` = 'degrau' (iniciante e intermediário):
// cada intensidade desce um degrau (A3 -> A2, A2 -> A1; AC, NEG, POS e final forte -> A2);
// 'tirarA3' (avançado): só o A3 (e o AC de 10" ou menos, que conta como A3) vira A2.
// As séries e o material não mudam. `treino` = { partes, plano } como guardado.
// Devolve { partes, plano }.
export function lightenTraining(rules, athlete, treino, como = 'degrau') {
    const degrau = (v) => (v === 'A3' ? 'A2' : v === 'A2' || v === 'A1' ? 'A1' : 'A2')
    const semA3 = (v) => (v === 'A3' || /^([1-9]|10) AC$/.test(v) ? 'A2' : v)
    const desce = como === 'tirarA3' ? semA3 : degrau
    const pronto = prepareAthlete(rules, athlete)
    const montagem = (treino.plano?.montagem ?? []).map((m) => (m?.intensidades
        ? {
            ...m,
            intensidades: {
                ...m.intensidades,
                // Só muda o tipo se algum valor mudou para A1/A2 (ex.: AC que virou A2)
                tipo: m.intensidades.valores.some((v) => desce(v) !== v && !/^A[123]$/.test(v)) ? 'intensidades' : m.intensidades.tipo,
                valores: m.intensidades.valores.map(desce),
            },
        }
        : m))
    const partes = treino.partes.map((p, i) => {
        const m = montagem[i]
        if (!m?.intensidades) return p
        const { texto, aviso } = renderPart(rules, pronto, m)
        const { aviso: _antigo, ...resto } = p
        return { ...resto, texto, intensidades: m.intensidades, ...(aviso && { aviso }) }
    })
    const intensidade = treino.plano?.intensidade ? desce(treino.plano.intensidade) : null
    return {
        partes,
        plano: {
            ...treino.plano, montagem, maisLeve: true, intensidade,
            esforcoEsperado: rules.feedback?.esforcoEsperado?.[intensidade] ?? treino.plano?.esforcoEsperado,
        },
    }
}

// O atleta pronto para gerar ou reescrever os treinos: tabela de tempos (teste de
// 400 m ou o tempo informado) e o tempo de treino do nível.
export function prepareAthlete(rules, athlete) {
    const tempo400 = athlete.time400?.hundredths
    let pronto = tempo400
        ? { ...athlete, tabela: timeTable(rules, tempo400 / 100), teste400: tempo400 / 100 }
        : { ...athlete, tabela: null, teste400: null }
    const maximo = rules.niveis[athlete.level]?.maxMinutosDeTreino
    if (maximo && athlete.sessionMinutes > maximo) {
        pronto = { ...pronto, aulaMinutos: athlete.sessionMinutes, sessionMinutes: maximo }
    }
    return pronto
}

// Reescreve os treinos já montados com os tempos atuais do atleta (ex.: registrou o
// teste de 400 m): só o texto muda (cd, ritmo, velocidade); as séries ficam as mesmas.
// `treino` = { partes, plano } como guardado. Devolve as partes novas.
export function refreshTimes(rules, athlete, treino) {
    const pronto = prepareAthlete(rules, athlete)
    return treino.partes.map((p, i) => {
        const montagem = treino.plano?.montagem?.[i]
        if (!montagem) return p
        const { texto, aviso } = renderPart(rules, pronto, montagem)
        const { aviso: _antigo, ...resto } = p
        return { ...resto, texto, ...(aviso && { aviso }) }
    })
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
        const variation = { texto: serie.texto, material, padrao: 'serie_inteira', nado: 'livre', nadoAbrev: 'CR' }
        const segundos = estimateSeconds(rules, 'principal', serie, variation, athlete, pace)
        if (segundos > livres || segundos < (cfg.minimoDeMinutos ?? 0) * 60) continue
        livres -= segundos
        const montagem = partMontage('recuperacao', serie, variation, null, intensidades, athlete)
        partes.push({
            parte: 'recuperacao', titulo: 'Para recuperar', serieId: serie.id,
            texto: renderPart(rules, athlete, montagem).texto,
            _montagem: montagem,
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

// ---------- Saúde/emagrecimento ----------

// O treino de número `numero` (na data `date`) é de saúde? Objetivo saúde: todos. Objetivo
// misto (condicionamento + saúde), como o atleta escolheu:
// - { modo: 'dias', dias: [1, 4] }: nesses dias da semana (0 = domingo);
// - { modo: 'alternar', condicionamento: 2, saude: 1 }: 2 de condicionamento, 1 de saúde...
export function isHealthDay(athlete, date, numero) {
    if (athlete.objetivo === 'saude') return true
    if (athlete.objetivo !== 'misto') return false
    const m = athlete.mistura
    if (m?.modo === 'dias') return m.dias.includes(new Date(`${date}T12:00:00Z`).getUTCDay())
    const c = m?.condicionamento ?? 1
    const s = m?.saude ?? 1
    return (numero - 1) % (c + s) >= c
}

// ---------- Séries de teste (o atleta vê "Nado contínuo") ----------

// Próximo passo acima / abaixo de uma distância (regras.serieDeTeste.passos)
function passoDe(cfg, distancia) {
    return (cfg.passos.find((p) => distancia < p.ate) ?? cfg.passos.at(-1)).passo
}
const subir = (cfg, d) => d + passoDe(cfg, d)
const descer = (cfg, d) => Math.max(cfg.minimo ?? 50, d - passoDe(cfg, d - 1))

// Distância do nado contínuo dos próximos treinos (ou null: não precisa). A prova mais
// longa da competição alvo é o alvo; começa um passo acima do que nada hoje (anamnese).
// Pelos treinos feitos (`historico`, do mais antigo ao mais novo) nessa distância:
// - não nadou sem parar, ou deu 10 onde era 8 ou 9: desce um passo;
// - 3 seguidos pesados: desce; 3 seguidos sem parar e sem ficar pesado: sobe.
// `alvoFixo`: o alvo sem prova (treino de saúde: a distância que o nado contínuo pode alcançar)
export function testSeriesDistance(rules, athlete, historico = [], pace = null, alvoFixo = null) {
    const cfg = rules.serieDeTeste
    const provas = athlete.provas?.length ? athlete.provas : athlete.prova ? [athlete.prova] : []
    let alvo = alvoFixo ?? Math.max(0, ...provas.map((p) => p.distancia ?? 0))
    // O contínuo cabe no treino: até `parteDaAula` do tempo da aula (a progressão para aí)
    const segundosPor100 = (pace ?? DEFAULT_400[athlete.level ?? 'intermediario'] / 400) * (cfg?.ritmo ?? 1.15)
    const cabe = Math.floor(((athlete.sessionMinutes ?? 60) * 60 * (cfg?.parteDaAula ?? 0.6)) / segundosPor100 * 100 / 50) * 50
    if (athlete.sessionMinutes) alvo = Math.min(alvo, cabe)
    const hoje = SEM_PARAR[athlete.continuousDistance] ?? Infinity
    if (!cfg || !alvo || hoje >= alvo) return null
    const feitos = historico.filter((t) => t.plan?.serieDeTeste?.distancia)
    if (feitos.length === 0) return { distancia: Math.min(alvo, subir(cfg, hoje)), alvo }
    const atual = feitos.at(-1).plan.serieDeTeste.distancia
    const nessa = []
    for (let k = feitos.length - 1; k >= 0 && feitos[k].plan.serieDeTeste.distancia === atual; k--) nessa.unshift(feitos[k])
    const fb = rules.feedback ?? {}
    const limite = fb.pesadoAPartirDe?.[athlete.level] ?? fb.pesadoAPartirDe?.padrao ?? 8
    const ultimo = nessa.at(-1)
    const falhou = ultimo.nonstop === false || (ultimo.difficulty === 10 && [8, 9].includes(ultimo.plan.esforcoEsperado))
    const pesado = (t) => Number.isInteger(t.difficulty) && t.difficulty >= limite && (t.plan.esforcoEsperado ?? 0) < limite
    const ultimos = nessa.slice(-(cfg.treinosParaSubir ?? 3))
    const completos = ultimos.length === (cfg.treinosParaSubir ?? 3)
    let distancia = atual
    if (falhou || (completos && ultimos.every(pesado))) distancia = descer(cfg, atual)
    else if (completos && ultimos.every((t) => t.nonstop !== false && Number.isInteger(t.difficulty) && !pesado(t))) distancia = subir(cfg, atual)
    return { distancia: Math.min(alvo, distancia), alvo }
}

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
    // Fácil: 2 ou mais abaixo do esperado, ou nota 3 ou menos (regra do treinador), nos 3 seguidos
    const facil = avaliados && seguidos.every((t) => t.difficulty <= t.plan.esforcoEsperado - cfg.diferencaParaFacil ||
        t.difficulty <= (cfg.facilAteNota ?? 0))
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

// Etapas da periodização (ATR) para um período de `total` dias e o nível do atleta,
// montadas de trás para frente, como o treinador faz: primeiro a Realização (antes
// da prova), depois a semana de recuperação, a Transição e a Acumulação, repetindo o
// ciclo do nível até encaixar tudo (iniciante: duas Acumulações para cada Transição;
// avançado: uma de cada). Depois de cada Transição vem 1 semana de recuperação.
// Devolve [{ etapa, dias }] na ordem do treino.
// `treinosPorSemana`: a recuperação entre a última Transição e a Realização só entra
// para quem treina mais de 3 vezes por semana (a Realização já é leve no volume).
// `semProva` (condicionamento ou saúde): a periodização padrão, A-T-R.
export function planStages(rules, total, level = null, treinosPorSemana = null, semProva = false) {
    const cfg = rules.periodizacao
    const etapas = cfg?.etapas
    if (semProva && etapas && cfg.modeloSemProva) return standardStages(rules, total, cfg.modeloSemProva)
    const ciclo = cfg?.ciclo?.[level] ?? cfg?.ciclo?.intermediario
    if (!etapas || !ciclo) return [{ etapa: null, dias: total }]
    const minimo = (fase) => etapas[fase === 'acumulacao' ? 'acumulacao1' : fase === 'transicao' ? 'transicao1' : fase].dias[0]
    const ideal = (fase) => cfg.diasIdeais?.[fase] ?? minimo(fase)
    const recuperacao = cfg.recuperacaoDepoisDaTransicao ?? 0
    const antesDaRealizacao = treinosPorSemana === null || treinosPorSemana > (cfg.recuperacaoAntesDaRealizacaoAcimaDe ?? 0)

    // De trás para frente: [{ fase, dias }], a última etapa (Realização) primeiro.
    // `tamanho` = dias de cada etapa ao encaixar (o ideal; se não sobrar espaço para
    // começar pela Acumulação, tenta de novo com o mínimo)
    const encaixa = (tamanho) => {
        const blocos = [{ fase: 'realizacao', dias: Math.min(total, Math.max(minimo('realizacao'), tamanho('realizacao'))) }]
        let livre = total - blocos[0].dias
        let k = ciclo.length - 1 // o ciclo de trás para frente: transição, acumulação, acumulação...
        for (;;) {
            const fase = ciclo[k]
            // A Transição vem seguida da semana de recuperação (se não couber, sem ela)
            // (a que vem logo antes da Realização só para quem treina mais de 3 vezes por semana)
            const logoAntesDaRealizacao = blocos.length === 1
            let extra = fase === 'transicao' && recuperacao > 0 && (!logoAntesDaRealizacao || antesDaRealizacao) ? recuperacao : 0
            if (livre < minimo(fase) + extra) extra = 0
            if (livre < minimo(fase)) break
            if (extra) blocos.push({ fase: 'recuperacao', dias: extra })
            const dias = Math.min(tamanho(fase), livre - extra)
            blocos.push({ fase, dias })
            livre -= dias + extra
            k = (k - 1 + ciclo.length) % ciclo.length
        }
        // Sobrou espaço e o ciclo pede outra Acumulação antes da primeira: divide em duas
        // (ex.: iniciante com 70 dias = A1 + A2, não uma Acumulação longa)
        const primeira = blocos.at(-1)
        if (ciclo[k] === 'acumulacao' && primeira.fase === 'acumulacao' && primeira.dias + livre >= 2 * minimo('acumulacao')) {
            const dias = primeira.dias + livre
            primeira.dias = Math.ceil(dias / 2)
            blocos.push({ fase: 'acumulacao', dias: Math.floor(dias / 2) })
            livre = 0
        }
        return { blocos: blocos.reverse(), livre }
    }
    let { blocos, livre: resta } = encaixa(ideal)
    // Período curto em que, com os dias ideais, não coube nenhuma Acumulação: tenta com o mínimo
    if (blocos.length > 1 && !blocos.some((b) => b.fase === 'acumulacao')) {
        const curto = encaixa(minimo)
        if (curto.blocos[0].fase === 'acumulacao') ({ blocos, livre: resta } = curto)
    }
    // O primeiro ciclo ficou incompleto (ex.: iniciante com uma Acumulação só antes da
    // Transição): tudo até a recuperação dele vira Acumulação (a base), em etapas de até o máximo
    const acumulacoesNoCiclo = ciclo.indexOf('transicao')
    const primeiraT = blocos.findIndex((b) => b.fase === 'transicao')
    if (primeiraT > 0 && primeiraT < acumulacoesNoCiclo && blocos[primeiraT + 1]?.fase === 'recuperacao' &&
        blocos.slice(primeiraT + 2).some((b) => b.fase === 'transicao')) {
        const dias = blocos.slice(0, primeiraT + 2).reduce((s, b) => s + b.dias, 0)
        const maximo = etapas.acumulacao1.dias[1]
        const partes = Math.max(acumulacoesNoCiclo, Math.ceil(dias / maximo))
        const novas = Array.from({ length: partes }, (_, i) => ({
            fase: 'acumulacao', dias: Math.floor(dias / partes) + (i < dias % partes ? 1 : 0),
        }))
        blocos = [...novas, ...blocos.slice(primeiraT + 2)]
    }
    // Ainda começa pela Transição: ela (e a recuperação) vira Acumulação, porque a
    // periodização começa construindo a base
    while (blocos.length > 1 && blocos[0].fase !== 'acumulacao' && blocos[0].fase !== 'realizacao') {
        const inicio = blocos.findIndex((b) => b.fase === 'acumulacao' || b.fase === 'realizacao')
        const dias = blocos.slice(0, inicio).reduce((s, b) => s + b.dias, 0)
        blocos = [{ fase: 'acumulacao', dias }, ...blocos.slice(inicio)]
    }

    // Dá o nome de cada etapa: a 1ª Acumulação de cada ciclo é a Acumulação 1 (intervalos
    // maiores), a seguinte a Acumulação 2; a 1ª Transição é a Transição 1, as outras a 2.
    let transicoes = 0
    let anterior = null
    const plano = blocos.map(({ fase, dias }) => {
        let etapa = fase
        if (fase === 'acumulacao') etapa = anterior === 'acumulacao' || (ciclo.filter((f) => f === 'acumulacao').length === 1 && transicoes > 0) ? 'acumulacao2' : 'acumulacao1'
        if (fase === 'transicao') etapa = ++transicoes === 1 ? 'transicao1' : 'transicao2'
        anterior = fase
        return { etapa, dias }
    })

    // Os dias que sobram: primeiro para a Acumulação, depois Transição e Realização,
    // sem passar do máximo de cada etapa
    for (const fase of ['acumulacao', 'transicao', 'realizacao']) {
        let deu = true
        while (resta > 0 && deu) {
            deu = false
            for (const p of plano) {
                if (resta > 0 && etapas[p.etapa].fase === fase && p.dias < etapas[p.etapa].dias[1]) {
                    p.dias++
                    resta--
                    deu = true
                }
            }
        }
    }
    // Passou do máximo de tudo: uma Acumulação curta no começo (ou a 1ª etapa fica maior)
    if (resta >= 5 && etapas[plano[0].etapa].fase !== 'acumulacao') plano.unshift({ etapa: 'acumulacao1', dias: resta })
    else if (resta > 0) plano[0].dias += resta
    return plano
}

// Periodização padrão (sem prova): as etapas do modelo, cada uma com os dias ideais e
// o que sobra primeiro para a Acumulação (sem passar do máximo).
function standardStages(rules, total, modelo) {
    const etapas = rules.periodizacao.etapas
    const ideais = rules.periodizacao.diasIdeais ?? {}
    const plano = modelo.map((etapa) => ({ etapa, dias: etapas[etapa].dias[0] }))
    let resta = total - plano.reduce((s, p) => s + p.dias, 0)
    if (resta < 0) return [{ etapa: modelo.at(-1), dias: total }]
    // Até os dias ideais, depois até o máximo (Acumulação primeiro)
    for (const limite of [(p) => Math.max(etapas[p.etapa].dias[0], ideais[etapas[p.etapa].fase] ?? 0), (p) => etapas[p.etapa].dias[1]]) {
        for (const fase of ['acumulacao', 'transicao', 'realizacao']) {
            for (const p of plano.filter((x) => etapas[x.etapa].fase === fase)) {
                const vai = Math.min(resta, Math.max(0, limite(p) - p.dias))
                p.dias += vai
                resta -= vai
            }
        }
    }
    plano[0].dias += resta // passou do máximo de tudo: a Acumulação fica maior
    return plano
}

// Etapa de cada dia da periodização, do início ao fim (a prova alvo).
// Devolve (data) -> { etapa, nome, fase, semanaDaFase } (semana dentro da etapa).
export function periodPhases(rules, inicio, fim, level = null, treinosPorSemana = null, semProva = false) {
    const total = Math.max(1, daysBetween(inicio, fim) + 1)
    const plano = planStages(rules, total, level, treinosPorSemana, semProva)
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
// `semTeste` = nenhum dia de teste (ex.: o atleta disse que não vai fazer o teste planejado).
// `periodizacao` = { inicio, fim, testeNaTransicao, numeroInicial, provas, semProva }: gera todos os
// treinos até o fim, cada um com a sua fase. `provas` = datas das provas importantes no
// meio da preparação (o volume cai na semana delas). Sem ela, gera `dias` dias, sem fase.
// Semana (de segunda a domingo) de uma data: a segunda-feira dela
function semanaDe(iso) {
    const ms = Date.parse(`${iso}T12:00:00Z`)
    const diaDaSemana = (new Date(ms).getUTCDay() + 6) % 7
    return new Date(ms - diaDaSemana * 86_400_000).toISOString().slice(0, 10)
}

export function generateTrainings({
    rules, library, athlete, today, random = Math.random, dias = DIAS_PADRAO, seriesAnteriores = [],
    inicioDosTreinos = today, historico = [], fatorDoProximo = null, periodizacao = null, semTeste = false,
    tecnica = tecnicaDoApp(), especifico = athlete.modelo === 'especifico' ? especificoDoApp() : null,
    saude = ['saude', 'misto'].includes(athlete.objetivo) ? saudeDoApp() : null,
}) {
    const tempo400 = athlete.time400?.hundredths ?? DEFAULT_400[athlete.level]
    const pace = tempo400 / 4 / 100 // segundos por 100 m
    // Tabela de tempos do atleta (método do treinador). Sem o teste de 400 m (nem o
    // tempo informado na anamnese) não há tempos de referência: o card mostra o
    // descanso no lugar da saída e, depois de 1 mês de treino, entra o teste.
    const semReferencia = !athlete.time400?.hundredths
    // Tempo de treino: o da aula, até o máximo do nível (iniciante nada no máximo 50 min)
    athlete = prepareAthlete(rules, athlete)
    // Feedback dos últimos treinos: carga, foco (respiração ou força) e o tempo da principal
    const ajuste = feedbackAdjustment(rules, athlete, historico, fatorDoProximo)
    athlete = { ...athlete, foco: ajuste.foco }
    const condicionamento = inConditioning(rules, athlete)
    // Prova num estilo (alvo e importantes): o estilo entra na preparação toda (série principal,
    // velocidade e perna), não só na Transição
    athlete = { ...athlete, estilosDaProva: raceStrokes(athlete) }
    const recentes = recentWindow(4) // séries dos últimos 4 treinos perdem prioridade
    // Técnica: continua do passo em que o atleta parou (saídas, viradas)
    const estadoTecnica = estadoDaTecnica(historico)
    // Série de teste: o nado contínuo que vai crescendo até a distância da prova
    // (no Específico o atleta já nada a distância da prova: não precisa)
    // Só para o iniciante (regra do treinador)
    // Específico: a conta das intensidades dos treinos da Transição (A3, A2, A1)
    const estadoEspecifico = {}
    const serieDeTeste = periodizacao && !periodizacao.semProva && athlete.modelo !== 'especifico' && athlete.level === 'iniciante'
        ? testSeriesDistance(rules, athlete, historico, pace) : null
    // Saúde/emagrecimento: nos dias de saúde, o nado contínuo vai crescendo até o alvo do
    // nível (no iniciante, em partes) e o volume sobe um pouco a cada treino de saúde
    const regrasDaSaude = saude?.regras ?? null
    const continuoDaSaude = regrasDaSaude ? (() => {
        const cfg = regrasDaSaude.nadoContinuo
        const d = testSeriesDistance(rules, athlete, historico, pace, cfg.alvo[athlete.level] ?? cfg.alvo.intermediario)
        if (!d) return null
        return cfg.fracionadoPara.includes(athlete.level)
            ? { ...d, fracionado: { repeticao: cfg.repeticaoDoFracionado, descanso: cfg.descansoDoFracionado } }
            : d
    })() : null
    // Volume da saúde: continua do último treino de saúde (pesado 3 vezes: desce; fácil: sobe)
    const volSaude = regrasDaSaude?.volume
    let fatorDeSaude = volSaude
        ? ([...historico].reverse().find((t) => t.plan?.fatorSaude)?.plan.fatorSaude ?? volSaude.fatorInicial - volSaude.aumentoPorTreino) +
            ajuste.carga * (rules.feedback?.ajusteDaPrincipal ?? 0.1)
        : 1
    // Teste de 400 m de quem não tem tempo: o primeiro treino depois de 1 mês de treino
    const testeAPartirDe = addDays(inicioDosTreinos, rules.diaDoTeste?.semTemposAposDias ?? 30)
    let testeMarcado = false
    // Periodização: todos os treinos até o fim, com a fase de cada um
    const faseDe = periodizacao ? periodPhases(rules, periodizacao.inicio, periodizacao.fim, athlete.level, athlete.trainingDays?.length ?? null, Boolean(periodizacao.semProva))
        : null
    const totalDeDias = periodizacao
        ? Math.min(rules.periodizacao?.maximoDeDias ?? 366, Math.max(1, daysBetween(today, periodizacao.fim) + 1))
        : dias
    let testeDaPeriodizacao = false
    // Séries do treino anterior: não se repetem no treino seguinte
    let bloqueadas = new Set(seriesAnteriores)

    // Recuperação: depois de um treino com A3 na série principal, o próximo não tem
    // A3 enquanto não passarem as horas de recuperação do A3 (até 48 h)
    let anterior = null // { date, intensidade }
    let antesDoAnterior = null // a intensidade do treino antes do anterior (nunca 3 A3 seguidos)
    const semanasComA3Seguido = new Set()
    let a3SeguidoPermitido = null

    const datas = trainingDates(today, athlete.trainingDays, totalDeDias)
    // Foco de estilo de cada treino (pelo número do treino: continua igual ao gerar de novo)
    const focoDe = styleFocusSchedule(rules, athlete, (periodizacao?.numeroInicial ?? 1) - 1 + datas.length)
    // Específico: as outras provas (da competição alvo e as importantes) também têm séries nas
    // fases de 'outrasProvas' (regra do treinador). Devolve a outra prova do treino, ou null (a principal)
    const outras = especifico ? otherRaces(athlete) : []
    const cfgOutras = especifico?.regras.outrasProvas
    const contaDasProvas = { principal: 0, outras: outras.map(() => 0) }
    const escolherProva = (faseDoDia) => {
        if (!outras.length || !cfgOutras || !(cfgOutras.fases ?? []).includes(faseDoDia)) return null
        const feitos = contaDasProvas.principal + contaDasProvas.outras.reduce((t, n) => t + n, 0) + 1
        const faltaPrincipal = (1 - cfgOutras.parte) * feitos - contaDasProvas.principal
        const faltas = outras.map((_, k) => (cfgOutras.parte / outras.length) * feitos - contaDasProvas.outras[k])
        const k = faltas.indexOf(Math.max(...faltas))
        if (faltaPrincipal >= faltas[k]) {
            contaDasProvas.principal++
            return null
        }
        contaDasProvas.outras[k]++
        return outras[k]
    }
    const totalDeSemanas = new Set(datas.map(semanaDe)).size
    // Volume da etapa: fixo (ex.: 85%) ou caindo treino a treino ([85%, 60%] na Realização)
    const etapaDeCada = faseDe ? datas.map((d) => faseDe(d).etapa) : []
    const volumeDaEtapa = (etapa, i) => {
        const volume = rules.periodizacao?.etapas?.[etapa]?.volume ?? 1
        if (!Array.isArray(volume)) return volume
        const daEtapa = datas.filter((_, k) => etapaDeCada[k] === etapa && Math.abs(k - i) < 20)
        const posicao = daEtapa.indexOf(datas[i])
        return daEtapa.length < 2 ? volume[1] : volume[0] - ((volume[0] - volume[1]) * posicao) / (daEtapa.length - 1)
    }
    // Prova importante no meio da preparação: o volume cai aos poucos na semana dela
    const regraProva = rules.periodizacao?.provaIntermediaria
    const volumeDaProva = (date) => {
        if (!regraProva) return 1
        const faltam = (periodizacao?.provas ?? []).map((p) => daysBetween(date, p)).filter((d) => d >= 0 && d < regraProva.diasAntes)
        if (faltam.length === 0) return 1
        return 1 - regraProva.reducaoMaxima * (1 - Math.min(...faltam) / regraProva.diasAntes)
    }

    return datas.map((date, i) => {
        // Etapa do dia (Acumulação 1, ..., Realização). Condicionamento: fica na Acumulação.
        const daData = faseDe ? faseDe(date) : { etapa: null, nome: null, fase: null, semanaDaFase: null }
        // (com prova alvo, faz a Transição e a Realização como todo mundo: regra do treinador)
        const numero = (periodizacao?.numeroInicial ?? 1) + i
        // Dia de saúde (objetivo saúde, ou o dia de saúde do objetivo misto): sem fases (fica na Acumulação)
        const deSaude = Boolean(saude) && isHealthDay(athlete, date, numero)
        const etapa = deSaude && daData.etapa ? 'acumulacao2'
            : condicionamento && (!periodizacao || periodizacao.semProva) && ['transicao', 'realizacao'].includes(daData.fase) ? 'acumulacao2' : daData.etapa
        const efeitos = rules.periodizacao?.etapas?.[etapa] ?? {}
        const fase = efeitos.fase ?? daData.fase
        const doDia = {
            ...athlete,
            fase,
            etapa,
            descansoExtra: efeitos.descansoExtra ?? 0,
            descansoMaior: efeitos.descansoMaior ?? null,
            intervaloExtra: efeitos.intervaloExtra ?? 0,
            tiposDaEtapa: efeitos.tipos ?? null,
            velocidade25: efeitos.velocidadeAvancado25 ?? null,
            // Semana de recuperação: só ritmo leve, sem velocidade
            soLeve: Boolean(efeitos.soRitmoLeve),
            // Transição 2 (força específica): palmar e palmar + pull buoy, se o feedback não pediu outra coisa
            foco: athlete.foco ?? efeitos.foco ?? null,
            serieDeTeste: deSaude ? continuoDaSaude : serieDeTeste,
        }
        const proibidas = []
        // Acumulação: só A1/A2
        if (efeitos.semA3) proibidas.push('A3')
        // Pesado demais nos últimos treinos: os 2 primeiros sem A3
        if (ajuste.carga < 0 && i < 2) proibidas.push('A3')
        // A3 seguido (regra do treinador): 2 treinos seguidos com A3 só na mesma semana, uma
        // vez por semana e em até 35% das semanas; nunca 3 seguidos
        let recuperacao = false
        const regraSeguido = rules.intensidades?.A3?.seguido
        if (anterior?.intensidade === 'A3' && !recoveryWaived(rules, athlete)) {
            const semana = semanaDe(date)
            const pode = regraSeguido && (regraSeguido.fases ?? []).includes(fase) && antesDoAnterior !== 'A3' && semanaDe(anterior.date) === semana &&
                !semanasComA3Seguido.has(semana) &&
                semanasComA3Seguido.size < Math.floor(regraSeguido.maximoDasSemanas * totalDeSemanas)
            if (!pode) {
                recuperacao = true
                proibidas.push('A3')
            } else a3SeguidoPermitido = semana
        } else a3SeguidoPermitido = null
        // Tempo da principal: o do feedback; no condicionamento, aumenta um pouco a cada treino
        const cond = rules.condicionamento
        // A etapa também mexe no volume (Transição 85%; Realização de 85% a 60%) e a
        // semana de uma prova importante no meio da preparação também
        const volume = etapa && efeitos.volume !== undefined ? volumeDaEtapa(etapa, i) : 1
        // Saúde: começa um pouco abaixo e sobe a cada treino de saúde (sem fases)
        if (deSaude && volSaude) fatorDeSaude = Math.max(rules.feedback?.fatorMinimo ?? 0.5, Math.min(volSaude.fatorMaximo, fatorDeSaude + volSaude.aumentoPorTreino))
        const fatorDaSaude = deSaude ? fatorDeSaude : 1
        // (no dia de saúde, o Geral monta com o tempo cheio: o volume é o da saúde, `fatorDaSaude`)
        const fatorPrincipal = Math.round((deSaude ? 1 : condicionamento
            ? Math.min(cond.fatorMaximo, ajuste.fatorPrincipal + i * cond.aumentoPorTreino)
            : ajuste.fatorPrincipal) * (deSaude ? 1 : volume) * volumeDaProva(date) * 100) / 100
        // (no dia de saúde, o aumento vai para a série de saúde, não para a do Geral)
        const fatorSaude = Math.round(fatorDaSaude * 100) / 100
        // Teste de quem não tem tempo (depois de 1 mês) e o teste da periodização (no
        // começo da Transição). Quem não nada 400 m sem parar não faz teste (condicionamento).
        const testeSemTempo = !semTeste && semReferencia && !condicionamento && !testeMarcado && date >= testeAPartirDe
        const testeNaTransicao = !semTeste && periodizacao?.testeNaTransicao && !semReferencia && !condicionamento &&
            !testeDaPeriodizacao && fase === 'transicao'
        if (testeSemTempo) testeMarcado = true
        if (testeNaTransicao) testeDaPeriodizacao = true
        // Específico: as outras provas (da competição alvo e as importantes) revezam com a principal
        const provaDoDia = especifico && !testeSemTempo && !testeNaTransicao ? escolherProva(fase) : null
        // (prova sem meta: sem o ritmo de prova, a principal é a do Geral no estilo dela)
        const semMeta = provaDoDia && !provaDoDia.metaCentesimos
        const focoDoDia = semMeta
            ? { categoria: provaDoDia.estilo === 'crawl' ? 'crawl' : 'prova', estilos: provaDoDia.estilo === 'crawl' ? [] : [provaDoDia.estilo] }
            : focoDe[numero - 1]
        const doGeral = testeSemTempo || testeNaTransicao
            ? buildTestTraining({ rules, library, athlete: doDia, pace, random, recentes })
            : buildTraining({
                rules: rulesVoltando(rules, athlete, inicioDosTreinos, date), library, athlete: doDia, pace, random, recentes, proibidas, bloqueadas,
                fatorPrincipal, tecnica, estadoTecnica, focoDoEstilo: deSaude ? null : focoDoDia,
            })
        // Específico da prova: na Transição e na Realização, a série principal é a da prova
        // (estilo e ritmo da prova) e o treino inteiro fica dentro do limite (15x ou 10x a prova)
        const partes = especifico && !semMeta ? aplicarEspecifico({
            esp: especifico, partes: doGeral, athlete: provaDoDia ? { ...doDia, prova: provaDoDia } : doDia, pace, random, recentes,
            saida: saidaDoEspecifico(rules, doDia), tecnica, estado: estadoEspecifico, segundosPorTroca: tempoMorto(rules),
        }) : especifico ? doGeral : deSaude ? aplicarSaude({
            saude, partes: doGeral, athlete: doDia, pace, random, recentes, segundosPorTroca: tempoMorto(rules), fator: fatorDaSaude,
        }) : doGeral
        // Outra prova (não a principal): o título diz qual
        if (provaDoDia) {
            const qual = `${provaDoDia.distancia} m ${provaDoDia.estilo}`
            partes.filter((p) => p.parte === 'principal').forEach((p) => {
                p.titulo = p.especifico ? `Série principal da prova · ${qual}` : `Série principal · ${qual}`
            })
        }
        // A montagem de cada parte vai para o plano interno (o atleta não recebe)
        const montagem = partes.map((p) => p._montagem ?? null)
        const tecnicaDoTreino = partes.map((p) => p._tecnica).filter(Boolean)
        partes.forEach((p) => {
            delete p._montagem
            delete p._tecnica
        })
        // 1ª preparação do atleta: as telas mostram os nomes por extenso, com a abreviação
        // entre parênteses, para ele ir se acostumando
        if (periodizacao?.primeira) partes.forEach((p) => { p.extenso = true })
        // Metros de cada estilo em cada parte (o "ME" da principal é o melhor estilo dela)
        const melhorDaPrincipal = athleteForMain(doDia).bestStroke ?? doDia.bestStroke ?? null
        partes.forEach((p) => {
            if (p.metros > 0) p.estilos = strokeMeters(p.texto, p.metros, p.parte === 'principal' ? melhorDaPrincipal : doDia.bestStroke ?? null)
        })
        bloqueadas = seriesUsadas(partes)
        recentes.fecharTreino()
        const intensidades = partes.filter((p) => p.intensidades).map((p) => hardestIntensity(p.intensidades))
        const diaDeTeste = partes.some((p) => p.parte === 'teste')
        if (diaDeTeste) intensidades.push('A3') // o teste é forte
        antesDoAnterior = anterior?.intensidade ?? null
        anterior = { date, intensidade: intensidades.includes('A3') ? 'A3' : intensidades.includes('A2') ? 'A2' : 'A1' }
        if (a3SeguidoPermitido && anterior.intensidade === 'A3') semanasComA3Seguido.add(a3SeguidoPermitido)
        const principais = partes.filter((p) => p.parte === 'principal')
        return {
            date,
            title: `Treino ${numero}`,
            partes,
            metros: partes.reduce((s, p) => s + p.metros, 0),
            // (com o tempo morto das trocas entre as partes)
            minutos: partes.reduce((s, p) => s + p.minutos, 0) + minutosDeTroca(rules, partes),
            // Plano interno (o atleta não vê): como é o treino na periodização, para
            // comparar com o feedback e montar ou refazer os próximos
            plano: {
                numero,
                fase,
                etapa,
                // (dia de saúde: sem fases, o nome é o do treino)
                nomeDaEtapa: deSaude ? 'Saúde / emagrecimento' : rules.periodizacao?.etapas?.[etapa]?.nome ?? null,
                semanaDaFase: daData.semanaDaFase,
                intensidade: anterior.intensidade,
                esforcoEsperado: expectedEffort(rules, partes),
                metrosPrincipal: principais.reduce((s, p) => s + p.metros, 0),
                minutosPrincipal: principais.reduce((s, p) => s + p.minutos, 0),
                tipoPrincipal: principais.map((p) => p.intensidades?.tipo ?? null),
                diaDeTeste,
                // Qual teste: o de quem não tem tempo (depois de 1 mês) ou o da periodização
                ...(diaDeTeste && { tipoDeTeste: testeSemTempo ? 'semTempo' : 'periodizacao' }),
                recuperacao: Boolean(recuperacao),
                material: [...new Set(principais.flatMap((p) => p.material ?? []))],
                fatorPrincipal,
                ...(deSaude && { fatorSaude }),
                carga: ajuste.carga,
                ...(deSaude && { saude: true, tipoSaude: principais.find((p) => p.saude)?.saude ?? null }),
                foco: ajuste.foco,
                condicionamento,
                ...(provaDoDia && { provaDoEspecifico: { distancia: provaDoDia.distancia, estilo: provaDoDia.estilo } }),
                minutosDeTroca: minutosDeTroca(rules, partes),
                montagem,
                tecnica: tecnicaDoTreino,
                ...(partes.some((p) => p.parte === 'continuo') && { serieDeTeste: doDia.serieDeTeste }),
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
        mainSeries: juntar(['teste', 'recuperacao', 'continuo', 'principal', 'complemento', 'hidratacao', 'perna']),
        release: juntar(['soltura']),
    }
}


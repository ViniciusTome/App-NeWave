// Modelo "Específico da prova". Fica separado do modelo Geral de propósito: os dois só
// se encontram na escolha de qual usar (a preparação guarda `model`).
//
// Nesta parte: quem pode usar o Específico e os dados da prova (distância, estilo, meta).
// As séries de cada prova, o ritmo de prova saindo da meta e o limite de 10x/15x a
// distância da prova vêm na próxima entrega.

import { readFileSync } from 'node:fs'
import { montarTecnica } from '../tecnica/index.js'

export const MODELOS = ['geral', 'especifico']
export const ESTILOS_DA_PROVA = ['crawl', 'costas', 'peito', 'borboleta', 'medley']
// Modalidades em piscina: o estilo é escolhido; nas águas abertas é sempre crawl
export const PISCINA = ['piscina_25', 'piscina_50']
export const DISTANCIAS_NA_PISCINA = {
    crawl: [50, 100, 200, 400, 800, 1500],
    costas: [50, 100, 200],
    peito: [50, 100, 200],
    borboleta: [50, 100, 200],
    medley: [100, 200, 400], // 100 medley só em piscina de 25 m
}
export const AGUAS_ABERTAS = { minimo: 250, maximo: 25000 }

// Até quanto o atleta nada sem parar (faixa da anamnese)
const NADA_SEM_PARAR_ATE = {
    ate_50: 50, '50_100': 100, '100_200': 200, '200_400': 400, '400_1000': 1000, '1000_2000': 2000, mais_2000: Infinity,
}
// Águas abertas e provas longas: basta nadar mais de 2 km sem parar
const BASTA_NADAR = 2001

// Pode usar o Específico? { ok, motivo } — o motivo aparece para o atleta
export function podeUsarEspecifico({ goal, competition, profile }) {
    if (goal !== 'competir' || !competition) return { ok: false, motivo: 'O modelo Específico é para quem tem uma prova alvo.' }
    if (!competition.distance) return { ok: false, motivo: 'Cadastre a distância da prova alvo para usar o modelo Específico.' }
    if (!competition.goalHundredths) return { ok: false, motivo: 'Informe o tempo que quer fazer na prova (a meta): o ritmo de prova sai dela.' }
    const ate = NADA_SEM_PARAR_ATE[profile?.continuousDistance] ?? 0
    if (ate < Math.min(competition.distance, BASTA_NADAR)) {
        return { ok: false, motivo: 'O modelo Específico é para quem já nada a distância da prova sem parar (nas provas acima de 2 km, mais de 2 km sem parar).' }
    }
    return { ok: true, motivo: null }
}

// Confere a distância, o estilo e a meta da prova. Devolve { distance, stroke, goalHundredths }
// ou o texto do problema em `erro`.
export function validarProva({ modality, distance, stroke, goalHundredths }) {
    const piscina = PISCINA.includes(modality)
    if (distance === undefined || distance === null) return { erro: 'Escolha a distância da prova.' }
    if (!Number.isSafeInteger(distance)) return { erro: 'Distância da prova inválida.' }
    let estilo = 'crawl'
    if (piscina) {
        if (!ESTILOS_DA_PROVA.includes(stroke)) return { erro: 'Escolha o estilo da prova.' }
        estilo = stroke
        const pode = DISTANCIAS_NA_PISCINA[estilo]
        if (!pode.includes(distance) || (estilo === 'medley' && distance === 100 && modality !== 'piscina_25')) {
            return { erro: 'Essa distância não existe para esse estilo na piscina.' }
        }
    } else if (distance < AGUAS_ABERTAS.minimo || distance > AGUAS_ABERTAS.maximo || distance % 50 !== 0) {
        return { erro: 'Nas águas abertas, a distância vai de 250 m a 25 km.' }
    }
    let meta = null
    if (goalHundredths !== undefined && goalHundredths !== null) {
        // Ritmo da meta a cada 100 m: de 40" a 6' (fora disso foi erro de digitação)
        const por100 = goalHundredths / (distance / 100)
        if (!Number.isSafeInteger(goalHundredths) || por100 < 4000 || por100 > 36000) {
            return { erro: 'Confira o tempo da meta: ele não combina com a distância da prova.' }
        }
        meta = goalHundredths
    }
    return { distance, stroke: estilo, goalHundredths: meta }
}

// Várias provas na mesma competição (até 6): [{ distance, stroke, goalHundredths }], a 1ª é a
// principal. Aceita também uma prova só (distance, stroke, goalHundredths). { provas } ou { erro }.
export const MAXIMO_DE_PROVAS = 6
export function validarProvas({ modality, events, distance, stroke, goalHundredths }) {
    const lista = Array.isArray(events) ? events : [{ distance, stroke, goalHundredths }]
    if (lista.length === 0) return { erro: 'Escolha a distância da prova.' }
    if (lista.length > MAXIMO_DE_PROVAS) return { erro: `Escolha até ${MAXIMO_DE_PROVAS} provas por competição.` }
    const provas = []
    for (const e of lista) {
        const p = validarProva({ modality, distance: e?.distance, stroke: e?.stroke, goalHundredths: e?.goalHundredths })
        if (p.erro) return { erro: lista.length > 1 ? `${provas.length + 1}ª prova: ${p.erro}` : p.erro }
        if (provas.some((x) => x.distance === p.distance && x.stroke === p.stroke)) return { erro: 'A mesma prova foi escolhida duas vezes.' }
        provas.push(p)
    }
    return { provas }
}

// "200 m costas", "1,5 km" (águas abertas)
export function nomeDaProva({ modality, distance, stroke }) {
    if (!distance) return ''
    const nomes = { crawl: 'livre', costas: 'costas', peito: 'peito', borboleta: 'borboleta', medley: 'medley' }
    if (!PISCINA.includes(modality)) return distance >= 1000 ? `${String(distance / 1000).replace('.', ',')} km` : `${distance} m`
    return `${distance} m ${nomes[stroke] ?? ''}`.trim()
}

// ---------- Treino do Específico (Transição e Realização) ----------


const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'))
const RITMOS = ['RP', 'max', 'A1', 'A2', 'A3']
const ABREV = { crawl: 'CR', costas: 'CO', peito: 'PE', borboleta: 'BO', medley: 'MD' }

// Confere as séries: ids únicos, grupos e fases conhecidos, ritmos válidos
export function validarEspecifico({ regras, series }) {
    const problemas = []
    const grupos = new Set(regras.grupos.map((g) => g.grupo))
    const ids = new Set()
    for (const s of series) {
        const onde = `série "${s.id}"`
        if (!s.id || ids.has(s.id)) problemas.push(`${onde}: id vazio ou repetido.`)
        ids.add(s.id)
        if (!s.grupos?.length || s.grupos.some((g) => !grupos.has(g))) problemas.push(`${onde}: grupos: ${[...grupos].join(', ')}.`)
        if (!s.fases?.length || s.fases.some((f) => !regras.fases.includes(f))) problemas.push(`${onde}: fases: ${regras.fases.join(', ')}.`)
        for (const b of s.blocos ?? []) {
            if (!(b.rep >= 1 && b.dist >= 10 && b.descanso >= 0) || !RITMOS.includes(b.ritmo)) problemas.push(`${onde}: bloco inválido (rep, dist, ritmo ${RITMOS.join('/')}, descanso).`)
        }
        if (!s.blocos?.length) problemas.push(`${onde}: sem blocos.`)
    }
    return problemas
}

export function loadEspecifico() {
    const esp = { regras: ler('./regras.json'), series: ler('./series.json') }
    const problemas = validarEspecifico(esp)
    if (problemas.length > 0) throw new Error(`Modelo Específico com problemas:\n- ${problemas.join('\n- ')}`)
    return esp
}

// Metragem máxima do treino inteiro: 15x a prova nos 50 e 100 m; 10x nas outras
export const limiteDaProva = (regras, distancia) =>
    distancia * (distancia <= 100 ? regras.limiteDaProva.ate100 : regras.limiteDaProva.outras)

export const grupoDaProva = (regras, distancia) => (regras.grupos.find((g) => distancia <= g.ate) ?? regras.grupos.at(-1)).grupo

// Tempo em segundos -> 37"5 (abaixo de 1 minuto, com décimos) ou 1'15"
export function tempoText(segundos) {
    if (segundos < 60) {
        const d = Math.round(segundos * 10) / 10
        return Number.isInteger(d) ? `${d}"` : `${Math.floor(d)}"${Math.round((d % 1) * 10)}`
    }
    const s = Math.round(segundos)
    return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`
}
const pausaText = (s) => (s >= 60 ? (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`) : `${s}"`)

// Ritmo de prova: a meta dividida igualmente pela distância (200 m em 2'00" = 30" a cada 50 m)
export const ritmoDeProva = (prova, distancia) => (prova.metaCentesimos / 100) * (distancia / prova.distancia)

// A série como o atleta nada: piscina de 50 m (25 vira 50; 75 não dá), borboleta até 100 m
function adaptar(serie, { prova, poolLength }, regras) {
    let blocos = serie.blocos
    if (poolLength === 50) {
        if (blocos.some((b) => b.dist === 75 || b.quebrado)) return null
        blocos = blocos.map((b) => (b.dist === 25 ? { ...b, dist: 50, rep: Math.max(1, Math.ceil(b.rep / 2)) } : b))
    }
    if (prova.estilo === 'borboleta' && blocos.some((b) => b.dist > (regras.borboletaAte ?? 100))) return null
    return { ...serie, blocos }
}

const volumeDe = (s) => (s.vezes ?? 1) * s.blocos.reduce((t, b) => t + b.rep * b.dist, 0)

// Valor da tabela pela distância da prova (chave = até essa distância)
const pelaDistancia = (tabela, distancia) => {
    const chave = Object.keys(tabela).map(Number).sort((a, b) => a - b).find((k) => distancia <= k)
    return tabela[chave ?? Object.keys(tabela).at(-1)]
}
export const volumeMaximoEmRP = (regras, distancia) => pelaDistancia(regras.ritmoDeProva.volumeMaximo, distancia)
const emRitmoDeProva = (b) => b.ritmo === 'RP' || b.ritmo === 'max'
const volumeEmRP = (s) => (s.vezes ?? 1) * s.blocos.filter(emRitmoDeProva).reduce((t, b) => t + b.rep * b.dist, 0)

// Ritmo de prova (regra do treinador): pouco volume em RP/máx e descanso proporcional ao
// tiro (o tempo da repetição x o fator da prova). Ex.: 200 m -> no máximo 600 m em RP.
function ajustarRitmoDeProva(serie, prova, regras) {
    const cfg = regras.ritmoDeProva
    if (!cfg || !serie.blocos.some(emRitmoDeProva)) return serie
    const fator = pelaDistancia(cfg.descanso.fator, prova.distancia)
    const de5em5 = (x) => Math.round(x / 5) * 5
    let s = {
        ...serie,
        blocos: serie.blocos.map((b) => {
            if (!emRitmoDeProva(b) || b.quebrado) return b
            const tiro = ritmoDeProva(prova, b.dist) * (b.ritmo === 'max' ? regras.ritmos.max : 1)
            // RP: 50% a mais de descanso (regra do treinador)
            const aumento = b.ritmo === 'RP' ? cfg.descanso.aumentoNoRP ?? 1 : 1
            const proporcional = Math.min(cfg.descanso.maximo * aumento, Math.max(cfg.descanso.minimo, de5em5(tiro * fator * aumento)))
            // Máximo: nunca menos que o descanso escrito na série (tiro forte descansa bem)
            return { ...b, descanso: b.ritmo === 'max' ? Math.max(b.descanso, proporcional) : proporcional }
        }),
        ...((serie.vezes ?? 1) > 1 && { intervalo: Math.max(serie.intervalo ?? 0, cfg.intervaloMinimo ?? 0) }),
    }
    // Volume em RP: menos séries; depois menos repetições no maior bloco em RP
    const maximo = pelaDistancia(cfg.volumeMaximo, prova.distancia)
    while (volumeEmRP(s) > maximo) {
        if ((s.vezes ?? 1) > 1) {
            s = { ...s, vezes: s.vezes - 1 }
            continue
        }
        const i = s.blocos.reduce((m, b, k) => (emRitmoDeProva(b) && (m < 0 || b.rep * b.dist > s.blocos[m].rep * s.blocos[m].dist) ? k : m), -1)
        if (s.blocos[i].rep > 1) s = { ...s, blocos: s.blocos.map((b, k) => (k === i ? { ...b, rep: b.rep - 1 } : b)) }
        else if (s.blocos.length > 1) s = { ...s, blocos: s.blocos.filter((_, k) => k !== i) }
        else break
    }
    return s
}

// Segundos de nado de cada repetição: RP pela meta; A1/A2/A3 pelo ritmo do atleta (teste de 400 m)
function segundosDaRep(b, prova, pace, regras) {
    const rp = ritmoDeProva(prova, b.dist)
    if (b.ritmo === 'RP') return rp
    if (b.ritmo === 'max') return rp * regras.ritmos.max
    return (b.dist / 100) * pace * (regras.ritmos[b.ritmo] ?? 1.1)
}
function segundosDe(s, prova, pace, regras) {
    const umaVez = s.blocos.reduce((t, b) => t + b.rep * (segundosDaRep(b, prova, pace, regras) + b.descanso + (b.quebrado ? b.pausa * (b.quebrado.length - 1) : 0)), 0)
    return (s.vezes ?? 1) * umaVez + ((s.vezes ?? 1) - 1) * (s.intervalo ?? 0)
}

// Diminui a série, um passo de cada vez: menos vezes, menos repetições, menos blocos,
// e por fim repetições mais curtas. Devolve null quando não dá para diminuir mais.
function diminuir(s) {
    if ((s.vezes ?? 1) > 1) return { ...s, vezes: s.vezes - 1 }
    const i = s.blocos.reduce((m, b, k) => (b.rep * b.dist > s.blocos[m].rep * s.blocos[m].dist ? k : m), 0)
    const maior = s.blocos[i]
    const troca = (b) => ({ ...s, blocos: s.blocos.map((x, k) => (k === i ? b : x)) })
    if (maior.rep > 1) return troca({ ...maior, rep: maior.rep - 1 })
    if (s.blocos.length > 1) return { ...s, blocos: s.blocos.filter((_, k) => k !== i) }
    if (maior.dist > 50 && !maior.quebrado) return troca({ ...maior, dist: Math.max(50, Math.floor(maior.dist / 2 / 50) * 50) })
    return null
}

// Estilo da série: o da prova; medley em repetições curtas vai estilo a estilo
const estiloText = (prova, dist) => (prova.estilo === 'medley' && dist < 100 ? 'BO|CO|PE|CR' : ABREV[prova.estilo] ?? 'CR')

// A1, A2 e A3 com o tempo de saída (a/c) pelo teste de 400 m, como no Geral; RP e máx
// (e quem ainda não tem tempo) com o descanso. `saida(bloco, estilo)` -> segundos ou null.
function linhaDoBloco(b, prova, saida) {
    const quebrado = b.quebrado ? ` quebrado (${b.quebrado.join(' + ')}, D${b.pausa}")` : ''
    const nota = b.nota ? ` ${b.nota}` : ''
    const ritmo = b.ritmo === 'RP' ? `RP ${tempoText(ritmoDeProva(prova, b.dist))}` : b.ritmo === 'max' ? 'máx' : b.ritmo
    const ac = /^A[123]$/.test(b.ritmo) ? saida?.(b, prova.estilo) : null
    const fim = ac ? `a/c ${pausaText(ac)}` : `D${pausaText(b.descanso)} de descanso`
    return `${b.rep} x ${b.dist} m${quebrado}${nota} · ${ritmo} · ${estiloText(prova, b.dist)} · ${fim}`
}

// Texto da série da prova (também usado para reescrever com um tempo novo de 400 m)
export function textoDaSerie(s, prova, saida = null) {
    const linhas = s.blocos.map((b) => linhaDoBloco(b, prova, saida))
    if ((s.vezes ?? 1) === 1) return linhas.join('\n')
    const intervalo = `c/${pausaText(s.intervalo ?? 120)} de intervalo`
    return linhas.length === 1 ? `(${s.vezes}x) ${linhas[0]} · ${intervalo}` : `(${s.vezes}x) ${intervalo}\n${linhas.join('\n')}`
}

const INTENSIDADE = { RP: 'A3', max: 'A3', A3: 'A3', A2: 'A2', A1: 'A1' }
// Intensidade do próximo treino da Transição, pela proporção (ex.: A3 55%, A2 35%, A1 10%):
// a que está mais atrás da sua parte até agora, sem depender de sorte. Um treino A2 ou A1
// sempre vem depois de um A3 (nunca dois mais leves seguidos). Sem `estado`, sorteado.
const INTENSIDADES = ['A3', 'A2', 'A1']
function intensidadeDoTreino(proporcao, estado, random) {
    if (!estado) {
        let r = random()
        for (const i of INTENSIDADES) {
            r -= proporcao[i] ?? 0
            if (r < 0) return i
        }
        return 'A3'
    }
    estado.contagem ??= { A3: 0, A2: 0, A1: 0 }
    const feitos = INTENSIDADES.reduce((t, i) => t + estado.contagem[i], 0) + 1
    let escolha = INTENSIDADES.reduce((melhor, i) =>
        ((proporcao[i] ?? 0) * feitos - estado.contagem[i] > (proporcao[melhor] ?? 0) * feitos - estado.contagem[melhor] ? i : melhor), 'A3')
    if (escolha !== 'A3' && estado.anterior && estado.anterior !== 'A3') escolha = 'A3'
    estado.contagem[escolha]++
    estado.anterior = escolha
    return escolha
}

// A intensidade da série: a mais forte dos blocos (RP e máx contam como A3)
const intensidadeDaSerie = (serie) => serie.blocos.map((b) => INTENSIDADE[b.ritmo]).sort().at(-1)

// Troca a série principal do treino do Geral pela série da prova e respeita o limite
// da prova (15x ou 10x a distância) no treino inteiro. Devolve as partes novas (ou as
// mesmas, quando o Específico não vale nesse treino).
export function aplicarEspecifico({ esp, partes, athlete, pace, random = Math.random, recentes = null, saida = null, tecnica = null, estado = null }) {
    const { regras, series } = esp
    const prova = athlete.prova
    if (athlete.modelo !== 'especifico' || !prova?.distancia || !prova.metaCentesimos) return partes
    if (!regras.fases.includes(athlete.fase) || partes.some((p) => p.parte === 'teste')) return partes
    const posicao = partes.findIndex((p) => p.parte === 'principal')
    if (posicao < 0) return partes

    const limite = limiteDaProva(regras, prova.distancia)
    const tempo = partes.filter((p) => p.parte === 'principal').reduce((s, p) => s + p.minutos * 60, 0)
    // As outras partes, com a posição no treino (para a principal voltar ao mesmo lugar)
    let resto = partes.map((p, i) => ({ ...p, _i: i })).filter((p) => p.parte !== 'principal')
    const sobra = () => limite - resto.reduce((s, p) => s + p.metros, 0)

    const grupo = grupoDaProva(regras, prova.distancia)
    const todas = series
        .filter((s) => s.grupos.includes(grupo) && s.fases.includes(athlete.fase))
        .filter((s) => !s.material || (athlete.equipment ?? []).includes(s.material))
        .map((s) => adaptar(s, { prova, poolLength: athlete.poolLength }, regras))
        .filter(Boolean)
        .map((s) => ajustarRitmoDeProva(s, prova, regras))
    if (todas.length === 0) return partes
    // Transição (regra do treinador): 55% dos treinos em A3, 35% em A2 e 10% em A1
    const naTransicao = athlete.fase === 'transicao' ? regras.intensidadeNaTransicao : null
    const alvo = naTransicao ? intensidadeDoTreino(naTransicao, estado, random) : null
    const daIntensidade = alvo ? todas.filter((s) => intensidadeDaSerie(s) === alvo) : []
    const candidatas = daIntensidade.length > 0 ? daIntensidade : todas
    const menor = Math.min(...candidatas.map(volumeDe))

    // Não cabe nem a menor série: sai a perna, depois o aquecimento fica curto
    if (sobra() < menor) resto = resto.filter((p) => p.parte !== 'perna')
    // (e o solto e a soltura ficam curtos, sem a técnica)
    const curta = (p, cfg, serieId) => ({
        _i: p._i, parte: p.parte, titulo: p.titulo, serieId, serieTexto: cfg.texto, texto: cfg.texto,
        metros: cfg.metros, minutos: Math.max(1, Math.round((cfg.metros / 100) * pace * 1.3 / 60)),
    })
    // (por último, a velocidade fica curta: ela continua em todas as provas)
    const velocidadeCurta = { ...regras.velocidadeCurta, texto: regras.velocidadeCurta.texto.replace('{estilo}', estiloText(prova, 25)) }
    const encurtaveis = [['aquecimento', regras.aquecimentoCurto], ['solto', regras.soltoCurto], ['soltura', regras.soltoCurto], ['velocidade', velocidadeCurta]]
    const encurtar = (precisa) => {
        for (const [parte, cfg] of encurtaveis) {
            if (!precisa()) break
            resto = resto.map((p) => (p.parte === parte && p.metros > cfg.metros ? curta(p, cfg, `esp-${parte}`) : p))
        }
    }
    encurtar(() => sobra() < menor)
    const metrosLivres = Math.max(0, sobra())

    // A que cabe (metros e tempo), sem repetir as dos últimos treinos; a maior, mais vezes
    const vezes = (s) => recentes?.vezes(`esp:${s.id}`) ?? 0
    const cabe = (s) => volumeDe(s) <= metrosLivres && segundosDe(s, prova, pace, regras) <= tempo * 1.1
    const pool = candidatas.filter(cabe)
    const lista = pool.length > 0 ? pool : candidatas
    const menos = Math.min(...lista.map(vezes))
    const livres = lista.filter((s) => vezes(s) === menos)
    let r = random() * livres.reduce((t, s) => t + volumeDe(s), 0)
    let escolhida = livres.at(-1)
    for (const s of livres) {
        r -= volumeDe(s)
        if (r < 0) { escolhida = s; break }
    }
    // Nenhuma cabe: a que mais perto chega, diminuída até caber
    if (pool.length === 0) {
        const excesso = (s) => Math.max(volumeDe(s) / Math.max(metrosLivres, 1), segundosDe(s, prova, pace, regras) / Math.max(tempo, 1))
        escolhida = livres.reduce((a, b) => (excesso(b) < excesso(a) ? b : a))
        for (let menorAinda = diminuir(escolhida); !cabe(escolhida) && menorAinda; menorAinda = diminuir(escolhida)) escolhida = menorAinda
    }
    recentes?.add(`esp:${escolhida.id}`)
    // Passou do tempo da aula (ex.: a técnica no aquecimento de uma aula curta): as outras partes ficam curtas
    const minutosDaAula = (athlete.sessionMinutes ?? 60) * 1.1
    encurtar(() => resto.reduce((t, p) => t + p.minutos, 0) + segundosDe(escolhida, prova, pace, regras) / 60 > minutosDaAula)

    const segundos = segundosDe(escolhida, prova, pace, regras)
    const intensidade = intensidadeDaSerie(escolhida)
    const rp = ritmoDeProva(prova, prova.distancia <= 100 ? 25 : 50)
    const principal = {
        parte: 'principal',
        titulo: 'Série principal da prova',
        serieId: escolhida.id,
        serieTexto: escolhida.id,
        texto: textoDaSerie(escolhida, prova, saida),
        // Para reescrever com um tempo novo de 400 m (o a/c do A1, A2 e A3)
        _montagem: {
            parte: 'principal', especifico: { serie: escolhida, prova },
            dia: { fase: athlete.fase ?? null, descansoExtra: athlete.descansoExtra ?? 0, descansoMaior: athlete.descansoMaior ?? null },
        },
        nado: prova.estilo,
        material: escolhida.material ? [escolhida.material] : [],
        observacao: `RP = ritmo de prova, pela sua meta: ${tempoText(rp)} a cada ${prova.distancia <= 100 ? 25 : 50} m.${escolhida.nota ? ` ${escolhida.nota[0].toUpperCase()}${escolhida.nota.slice(1)}.` : ''}`,
        metros: volumeDe(escolhida),
        minutos: Math.round(segundos / 60),
        intensidades: { tipo: 'especifico', unidade: 'serie_toda', valores: [intensidade] },
        especifico: true,
    }
    // A principal vai no lugar da primeira principal do Geral
    const limpa = (p) => {
        const copia = { ...p }
        delete copia._i
        return copia
    }
    // Sobrou tempo da aula (provas curtas, com o limite da prova): saídas, técnica e
    // viradas, que não contam na metragem da prova
    const usados = resto.reduce((t, p) => t + p.minutos, 0) + principal.minutos
    const complemento = complementar({ regras, athlete, prova, pace, random, recentes, tecnica, minutos: minutosDaAula / 1.1 - usados })
    return [...resto.filter((p) => p._i < posicao).map(limpa), principal, ...(complemento ? [complemento] : []), ...resto.filter((p) => p._i > posicao).map(limpa)]
}

// "Saídas e técnica": completa o tempo que sobrou com saídas, um educativo no estilo da
// prova e viradas (nessa ordem, o que couber). Não conta no limite de 15x/10x.
function complementar({ regras, athlete, prova, pace, random, recentes, tecnica, minutos }) {
    const cfg = regras.complemento
    if (!cfg || minutos < cfg.aPartirDeMinutosLivres) return null
    let livres = minutos * 60
    const linhas = []
    let metros = 0
    const segundosDoItem = (i) => i.rep * ((i.dist / 100) * pace * 1.2 + i.descanso)
    const item = (i) => {
        const seg = segundosDoItem(i)
        if (seg > livres) return
        linhas.push(`${i.rep} x ${i.texto} · ${estiloText(prova, 25)} · D${pausaText(i.descanso)} de descanso`)
        metros += i.rep * i.dist
        livres -= seg
    }
    item(cfg.saidas)
    // Educativo no estilo da prova (biblioteca de técnica)
    if (tecnica) {
        const estilos = prova.estilo === 'medley' ? ['crawl', 'costas', 'peito', 'borboleta'] : [prova.estilo]
        const tec = montarTecnica({ tecnica, athlete: { ...athlete, strokes: estilos, estiloDaProva: prova.estilo }, parte: 'aquecimento', pace, random, recentes })
        if (tec && tec.segundos <= livres) {
            linhas.push(tec.texto.split('\n').at(-1))
            metros += tec.metros
            livres -= tec.segundos
        }
    }
    if (prova.modalidade?.startsWith('piscina')) item(cfg.viradas)
    if (linhas.length === 0) return null
    return {
        parte: 'complemento',
        titulo: 'Saídas e técnica',
        serieId: 'esp-complemento',
        serieTexto: 'Saídas e técnica',
        texto: linhas.join('\n'),
        observacao: 'Não conta na metragem da prova: é para usar o tempo que sobra da aula.',
        metros,
        minutos: Math.round((minutos * 60 - livres) / 60),
        foraDoLimite: true,
    }
}

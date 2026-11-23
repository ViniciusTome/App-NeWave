// Modelo "Específico da prova". Fica separado do modelo Geral de propósito: os dois só
// se encontram na escolha de qual usar (a preparação guarda `model`).
//
// Nesta parte: quem pode usar o Específico e os dados da prova (distância, estilo, meta).
// As séries de cada prova, o ritmo de prova saindo da meta e o limite de 10x/15x a
// distância da prova vêm na próxima entrega.

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

// "200 m costas", "1,5 km" (águas abertas)
export function nomeDaProva({ modality, distance, stroke }) {
    if (!distance) return ''
    const nomes = { crawl: 'livre', costas: 'costas', peito: 'peito', borboleta: 'borboleta', medley: 'medley' }
    if (!PISCINA.includes(modality)) return distance >= 1000 ? `${String(distance / 1000).replace('.', ',')} km` : `${distance} m`
    return `${distance} m ${nomes[stroke] ?? ''}`.trim()
}

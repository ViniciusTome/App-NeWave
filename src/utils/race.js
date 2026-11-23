// Campos da prova (componente RaceFields): a modalidade e as provas que o atleta vai nadar
// na competição (distância, estilo e meta opcional). A 1ª prova é a principal.
import { POOL_MODALITIES } from './athlete'

export const EMPTY_EVENT = { stroke: null, distance: null, goalH: '', goalMin: '', goalSec: '' }
export const EMPTY_RACE = { modality: null, events: [EMPTY_EVENT] }
export const MAX_EVENTS = 6

// Meta em centésimos (null = sem meta; undefined = não deu para entender)
export function goalHundredths(event) {
    const vazio = [event.goalH, event.goalMin, event.goalSec].every((v) => String(v ?? '').trim() === '')
    if (vazio) return null
    const h = Number(event.goalH || 0)
    const min = Number(event.goalMin || 0)
    const sec = Number(String(event.goalSec || 0).replace(',', '.'))
    if (![h, min].every(Number.isInteger) || h < 0 || min < 0 || Number.isNaN(sec) || sec < 0 || sec >= 60 || (h > 0 && min >= 60)) return undefined
    const total = (h * 3600 + min * 60) * 100 + Math.round(sec * 100)
    return total > 0 ? total : undefined
}

// O que vai para o servidor: as provas (a principal primeiro) e, para as telas que
// olham só a principal, a distância, o estilo e a meta dela
export function racePayload(race) {
    const piscina = POOL_MODALITIES.includes(race.modality)
    const events = race.events.map((e) => ({
        distance: e.distance, stroke: piscina ? e.stroke : 'crawl', goalHundredths: goalHundredths(e) ?? null,
    }))
    return { modality: race.modality, events, ...events[0] }
}

// Problema nos campos (ou '')
export function raceProblem(race) {
    if (!race.modality) return 'Escolha a modalidade da prova.'
    const piscina = POOL_MODALITIES.includes(race.modality)
    for (const [i, e] of race.events.entries()) {
        const qual = race.events.length > 1 ? `${i + 1}ª prova: ` : ''
        if (piscina && !e.stroke) return `${qual}escolha o estilo.`
        if (!e.distance) return `${qual}escolha a distância.`
        if (goalHundredths(e) === undefined) return `${qual}confira o tempo que quer fazer (a meta).`
    }
    const chaves = race.events.map((e) => `${piscina ? e.stroke : 'crawl'}-${e.distance}`)
    if (new Set(chaves).size !== chaves.length) return 'A mesma prova foi escolhida duas vezes.'
    return ''
}

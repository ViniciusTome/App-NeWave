// Campos da prova (componente RaceFields): valor vazio, a meta em centésimos e o que vai para o servidor
import { POOL_MODALITIES } from './athlete'

export const EMPTY_RACE = { modality: null, stroke: null, distance: null, goalH: '', goalMin: '', goalSec: '' }

// Meta em centésimos (null = sem meta; undefined = não deu para entender)
export function goalHundredths(race) {
    const vazio = [race.goalH, race.goalMin, race.goalSec].every((v) => String(v).trim() === '')
    if (vazio) return null
    const h = Number(race.goalH || 0)
    const min = Number(race.goalMin || 0)
    const sec = Number(String(race.goalSec || 0).replace(',', '.'))
    if (![h, min].every(Number.isInteger) || h < 0 || min < 0 || Number.isNaN(sec) || sec < 0 || sec >= 60 || (h > 0 && min >= 60)) return undefined
    const total = (h * 3600 + min * 60) * 100 + Math.round(sec * 100)
    return total > 0 ? total : undefined
}

// O que vai para o servidor
export const racePayload = (race) => ({
    modality: race.modality,
    distance: race.distance,
    stroke: POOL_MODALITIES.includes(race.modality) ? race.stroke : 'crawl',
    goalHundredths: goalHundredths(race),
})

// Problema nos campos (ou '')
export function raceProblem(race) {
    if (!race.modality) return 'Escolha a modalidade da prova.'
    if (POOL_MODALITIES.includes(race.modality) && !race.stroke) return 'Escolha o estilo da prova.'
    if (!race.distance) return 'Escolha a distância da prova.'
    if (goalHundredths(race) === undefined) return 'Confira o tempo que quer fazer (a meta).'
    return ''
}

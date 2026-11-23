// Dados da página Treinos/Periodização: fases, semana, mês e metragem.

// Fases na ordem do ATR. A semana de recuperação só aparece quando existe.
export const FASES = [
    {
        id: 'acumulacao', nome: 'Acumulação', sigla: 'A',
        sobre: 'Base aeróbica: séries em A1 e A2, mais volume e descanso um pouco maior.',
    },
    {
        id: 'transicao', nome: 'Transição', sigla: 'T',
        sobre: 'Especificidade: entram o A3, o AC, NEG, POS e final forte. Volume em 85%.',
    },
    {
        id: 'recuperacao', nome: 'Recuperação', sigla: 'Rec',
        sobre: 'Semana para recuperar: só ritmo leve e volume baixo.',
    },
    {
        id: 'realizacao', nome: 'Realização', sigla: 'R',
        sobre: 'Ritmo de prova e velocidade: menos volume (de 85% a 60%) e mais intensidade.',
    },
]

export const INTENSIDADES = [
    { id: 'A1', nome: 'A1 · leve' },
    { id: 'A2', nome: 'A2 · moderado' },
    { id: 'A3', nome: 'A3 · forte' },
]

const DAY = 86_400_000
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10)
const msOf = (iso) => Date.parse(`${iso}T12:00:00Z`)

// Semana de segunda a domingo que contém o dia
export function weekOf(iso) {
    const ms = msOf(iso)
    const weekday = (new Date(ms).getUTCDay() + 6) % 7 // segunda = 0
    return { inicio: toIso(ms - weekday * DAY), fim: toIso(ms + (6 - weekday) * DAY) }
}

// Mês do dia: '2026-11-01' a '2026-11-30'
export function monthOf(iso) {
    const [y, m] = iso.split('-').map(Number)
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const pad = (n) => String(n).padStart(2, '0')
    return { inicio: `${y}-${pad(m)}-01`, fim: `${y}-${pad(m)}-${pad(ultimo)}` }
}

// Metragem planejada e feita dos treinos entre duas datas (falta não conta como feito)
export function volumeBetween(trainings, { inicio, fim }) {
    const doPeriodo = trainings.filter((t) => t.date >= inicio && t.date <= fim)
    return {
        planejado: doPeriodo.reduce((s, t) => s + (t.metros ?? 0), 0),
        feito: doPeriodo.filter((t) => t.completed).reduce((s, t) => s + (t.metros ?? 0), 0),
        treinos: doPeriodo.length,
    }
}

// 12400 -> '12.400 m'
export const formatMeters = (metros) => `${Math.round(metros).toLocaleString('pt-BR')} m`

// O treino "do dia": o de hoje ou, sem treino hoje, o próximo
export const trainingOfTheDay = (trainings, today) =>
    trainings.find((t) => t.date === today) ?? trainings.find((t) => t.date > today) ?? null

// Fase em que o atleta está: a do treino do dia (ou a do último treino)
export const currentPhase = (trainings, today) =>
    (trainingOfTheDay(trainings, today) ?? trainings.at(-1))?.periodizacao?.fase ?? null

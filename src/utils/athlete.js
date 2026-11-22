// Textos das opções da anamnese e da preparação.
// As chaves (valores) são as mesmas aceitas pelo servidor, em server/athlete.js.
import { formatDate, formatSwimTime } from './format'

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }))

export const SWIMMING_SINCE = options([
    ['menos_6m', 'Menos de 6 meses'],
    ['6m_2a', '6 meses a 2 anos'],
    ['2a_5a', '2 a 5 anos'],
    ['mais_5a', 'Mais de 5 anos'],
])

export const RECENT_BREAK = options([
    ['nao', 'Não parei'],
    ['menos_1m', 'Menos de 1 mês'],
    ['1_6m', 'De 1 a 6 meses'],
    ['mais_6m', 'Mais de 6 meses'],
])

export const CONTINUOUS_DISTANCE = options([
    ['ate_50', 'Até 50 m'],
    ['50_100', '50 a 100 m'],
    ['100_200', '100 a 200 m'],
    ['200_400', '200 a 400 m'],
    ['400_1000', '400 m a 1 km'],
    ['1000_2000', '1 a 2 km'],
    ['mais_2000', 'Mais de 2 km'],
])

export const STROKES = options([
    ['crawl', 'Crawl'],
    ['costas', 'Costas'],
    ['peito', 'Peito'],
    ['borboleta', 'Borboleta'],
])

// Começa na segunda, que é como os atletas costumam pensar a semana (0 = domingo)
export const WEEK_DAYS = options([
    [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom'],
])

export const SESSION_MINUTES = options([
    [30, '30 min'], [40, '40 min'], [45, '45 min'], [60, '1 h'], [75, '1h15'], [90, '1h30'], [120, '2 h'],
])

export const POOL_LENGTH = options([[25, '25 m'], [50, '50 m']])

export const EQUIPMENT = options([
    ['pe_de_pato', 'Pé de pato'],
    ['pe_de_pato_peito', 'Pé de pato de peito'],
    ['palmar', 'Palmar'],
    ['prancha', 'Prancha'],
    ['pull_buoy', 'Pull buoy'],
    ['snorkel', 'Snorkel'],
    ['paraquedas', 'Paraquedas'],
])

export const MODALITY = options([
    ['triatlo', 'Triatlo'],
    ['maratona_aquatica', 'Maratona aquática'],
    ['piscina_25', 'Piscina de 25 m'],
    ['piscina_50', 'Piscina de 50 m'],
])

export const NO_COMPETITION_GOALS = options([
    ['condicionamento', 'Condicionamento'],
    ['saude', 'Saúde / emagrecimento'],
])

export const PRIORITY = { A: 'Prova alvo', B: 'Importante', C: 'Teste' }

export const LEVEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' }

// Texto da opção escolhida (ou das opções, numa lista)
export const labelOf = (list, value) => list.find((option) => option.value === value)?.label ?? '—'
export const labelsOf = (list, values) =>
    list.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ') || 'Nenhum'

export const goalLabel = (goal) =>
    goal === 'competir' ? 'Competir' : labelOf(NO_COMPETITION_GOALS, goal)

// "Troféu Estadual · 200 m livre · Piscina de 50 m · 21/01/2027"
export const competitionLabel = (competition) =>
    [competition.name, competition.event, labelOf(MODALITY, competition.modality), formatDate(competition.date)]
        .filter(Boolean)
        .join(' · ')

// Dias entre hoje e a data (as duas no formato AAAA-MM-DD)
export const daysUntil = (isoDate, today) =>
    Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)

export const daysUntilText = (days) =>
    days === 0 ? 'é hoje!' : days === 1 ? 'falta 1 dia' : `faltam ${days} dias`

// Nível calculado, com o aviso de readaptação
export const levelText = (level) =>
    level ? `${LEVEL[level.level]}${level.returning ? ' (em readaptação)' : ''}` : '—'

export const time400Text = (time400) => {
    if (!time400) return 'Ainda sem tempo (o primeiro treino pode ser o teste)'
    const origin = time400.source === 'teste' ? `teste de ${formatDate(time400.date)}` : 'informado por você'
    return `${formatSwimTime(time400.hundredths)} (${origin})`
}

// Melhor estilo: quem só nada crawl não tem; quem respondeu a anamnese antes
// dessa pergunta existir ainda não escolheu
const bestStrokeText = (profile) => {
    if (profile.bestStroke) return labelOf(STROKES, profile.bestStroke)
    const nadaEstilo = profile.strokes.some((s) => s !== 'crawl')
    return nadaEstilo ? 'Ainda não respondido (edite as respostas)' : 'Só nada crawl'
}

// Respostas da anamnese em pares [pergunta, resposta], para resumos
export const profileSummary = (profile, time400) => [
    ['Nada há', labelOf(SWIMMING_SINCE, profile.swimmingSince)],
    ['Parado recentemente', labelOf(RECENT_BREAK, profile.recentBreak)],
    ['Nada sem parar', labelOf(CONTINUOUS_DISTANCE, profile.continuousDistance)],
    ['Estilos', labelsOf(STROKES, profile.strokes)],
    ['Melhor estilo', bestStrokeText(profile)],
    ['Dias de treino', labelsOf(WEEK_DAYS, profile.trainingDays)],
    ['Tempo por treino', labelOf(SESSION_MINUTES, profile.sessionMinutes)],
    ['Piscina onde treina', labelOf(POOL_LENGTH, profile.poolLength)],
    ['Material', labelsOf(EQUIPMENT, profile.equipment)],
    ['Lesões ou limitações', profile.injuries || 'Nenhuma'],
    ['Tempo nos 400 m', time400Text(time400)],
]

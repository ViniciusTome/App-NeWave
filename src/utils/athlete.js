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
// Na anamnese, "Medley" marca os quatro estilos de uma vez (o app guarda os quatro)
export const MEDLEY = 'medley'
export const STROKES_WITH_MEDLEY = [...STROKES, { value: MEDLEY, label: 'Medley (os quatro)' }]

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

// Prova: estilo e distâncias (as mesmas regras de server/especifico/index.js)
export const POOL_MODALITIES = ['piscina_25', 'piscina_50']
export const RACE_STROKES = options([
    ['crawl', 'Livre (crawl)'],
    ['costas', 'Costas'],
    ['peito', 'Peito'],
    ['borboleta', 'Borboleta'],
    ['medley', 'Medley'],
])
const POOL_DISTANCES = {
    crawl: [50, 100, 200, 400, 800, 1500],
    costas: [50, 100, 200],
    peito: [50, 100, 200],
    borboleta: [50, 100, 200],
    medley: [100, 200, 400],
}
const OPEN_WATER_DISTANCES = {
    triatlo: [750, 1500, 1900, 3800],
    maratona_aquatica: [1000, 1500, 2000, 3000, 5000, 10000, 25000],
}
export const distanceText = (m) => (m >= 1000 ? `${String(m / 1000).replace('.', ',')} km` : `${m} m`)
// Distâncias que aparecem para escolher, conforme a modalidade e o estilo
export function raceDistances(modality, stroke) {
    if (!modality) return []
    if (!POOL_MODALITIES.includes(modality)) return OPEN_WATER_DISTANCES[modality] ?? []
    const list = POOL_DISTANCES[stroke] ?? []
    return stroke === 'medley' && modality !== 'piscina_25' ? list.filter((d) => d !== 100) : list
}

// Modelo de treino
export const TRAINING_MODELS = options([
    ['geral', 'Geral'],
    ['especifico', 'Específico da prova'],
])
export const MODEL_TEXT = {
    geral: 'A periodização completa para nadar melhor, com séries de todas as distâncias.',
    especifico: 'A Acumulação é igual à do Geral. Na Transição e na Realização, as séries são no estilo e no ritmo da sua prova, que sai da meta.',
}
const SWIMS_UP_TO = { ate_50: 50, '50_100': 100, '100_200': 200, '200_400': 400, '400_1000': 1000, '1000_2000': 2000, mais_2000: Infinity }
// Pode usar o Específico? (o mesmo que o servidor confere) -> '' ou o motivo
export function specificBlocker(competition, profile) {
    if (!competition) return 'O modelo Específico é para quem tem uma prova alvo.'
    if (!competition.distance) return 'Cadastre a distância da prova alvo para usar o modelo Específico.'
    if (!competition.goalHundredths) return 'Informe o tempo que quer fazer na prova (a meta): o ritmo de prova sai dela.'
    if ((SWIMS_UP_TO[profile?.continuousDistance] ?? 0) < Math.min(competition.distance, 2001)) {
        return 'O modelo Específico é para quem já nada a distância da prova sem parar (nas provas acima de 2 km, mais de 2 km sem parar).'
    }
    return ''
}

export const NO_COMPETITION_GOALS = options([
    ['condicionamento', 'Condicionamento'],
    ['saude', 'Saúde / emagrecimento'],
])

// Importância das provas (o app guarda A, B e C; o atleta vê os nomes)
// - Prova alvo: só uma, a da preparação (escolhida em "Gerar treinos")
// - Importante: na semana dela o volume do treino diminui um pouco
// - Participação: não muda o treino
export const PRIORITY = { A: 'Prova alvo', B: 'Importante', C: 'Participação' }
export const IMPORTANCE_OPTIONS = [
    { value: 'B', label: 'Importante' },
    { value: 'C', label: 'Participação' },
]
export const IMPORTANCE_NOTICE = 'Prova importante: na semana dela o volume do treino diminui um pouco (o resto continua igual). ' +
    'Participação: o treino não muda. A prova alvo (só uma) é escolhida em "Gerar treinos" ou em "Tornar prova alvo".'

export const LEVEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' }

// Texto da opção escolhida (ou das opções, numa lista)
export const labelOf = (list, value) => list.find((option) => option.value === value)?.label ?? '—'
export const labelsOf = (list, values) =>
    list.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ') || 'Nenhum'

export const goalLabel = (goal) =>
    goal === 'competir' ? 'Competir' : labelOf(NO_COMPETITION_GOALS, goal)

// Tempo da meta: 15000 -> 2'30"00; 4500000 -> 1h15'00"
export const goalTimeText = (hundredths) => {
    if (hundredths < 360000) return formatSwimTime(hundredths)
    const h = Math.floor(hundredths / 360000)
    const rest = Math.round((hundredths % 360000) / 100)
    return `${h}h${String(Math.floor(rest / 60)).padStart(2, '0')}'${String(rest % 60).padStart(2, '0')}"`
}

// Nome da prova (distância e estilo): "200 m costas", "1,5 km"
export function raceName(competition) {
    if (!competition.distance) return competition.event
    if (!POOL_MODALITIES.includes(competition.modality)) return distanceText(competition.distance)
    const stroke = competition.stroke === 'crawl' ? 'livre' : labelOf(RACE_STROKES, competition.stroke).toLowerCase()
    return `${competition.distance} m ${stroke}`
}

// "Troféu Estadual · 200 m livre · meta 2'10"00 · Piscina de 50 m · 21/01/2027"
export const competitionLabel = (competition) =>
    [competition.name, raceName(competition), competition.goalHundredths ? `meta ${goalTimeText(competition.goalHundredths)}` : '',
        labelOf(MODALITY, competition.modality), formatDate(competition.date)]
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

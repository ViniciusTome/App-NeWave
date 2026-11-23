import { useState } from 'react'
import { ChoiceGroup } from '../ChoiceGroup'
import { api, notifyAthleteChanged, notifyTrainingsChanged } from '../../services/api'
import {
    CONTINUOUS_DISTANCE, EQUIPMENT, POOL_LENGTH, RECENT_BREAK, SESSION_MINUTES,
    MEDLEY, STROKES, STROKES_WITH_MEDLEY, SWIMMING_SINCE, WEEK_DAYS,
} from '../../utils/athlete'
import { formatDate, formatSwimTime } from '../../utils/format'
import styles from './wizard.module.css'

const YES_NO = [{ value: false, label: 'Não' }, { value: true, label: 'Sim' }]

// '5', '32,45' -> 33245 centésimos (ou null se não der para entender)
function parseTime(minutes, seconds) {
    const min = Number(minutes)
    const sec = Number(String(seconds).replace(',', '.'))
    if (!Number.isInteger(min) || min < 0 || Number.isNaN(sec) || sec < 0 || sec >= 60) return null
    if (String(minutes).trim() === '' || String(seconds).trim() === '') return null
    return min * 6000 + Math.round(sec * 100)
}

function splitTime(hundredths) {
    if (!hundredths) return { minutes: '', seconds: '' }
    const seconds = ((hundredths % 6000) / 100).toFixed(2).replace('.', ',')
    return { minutes: String(Math.floor(hundredths / 6000)), seconds }
}

// Anamnese em etapas. Usada no "Gerar treinos" (primeira vez ou "Atualizar meus dados")
// e no Perfil. `profile` preenche as respostas quando o atleta está editando.
// `time400` é o tempo que o app já conhece: se veio de um teste registrado,
// a pergunta do tempo nos 400 m não aparece.
export const AnamnesisForm = ({ profile, time400, onSaved, onCancel, cancelLabel = 'Cancelar' }) => {
    const [answers, setAnswers] = useState(() => ({
        swimmingSince: profile?.swimmingSince ?? null,
        recentBreak: profile?.recentBreak ?? null,
        continuousDistance: profile?.continuousDistance ?? null,
        strokes: profile?.strokes ?? [],
        bestStroke: profile?.bestStroke ?? null,
        trainingDays: profile?.trainingDays ?? [],
        sessionMinutes: profile?.sessionMinutes ?? null,
        poolLength: profile?.poolLength ?? null,
        equipment: profile?.equipment ?? [],
        hasInjury: profile ? profile.injuries !== '' : null,
        injuries: profile?.injuries ?? '',
        neverTested: profile ? profile.reported400Hundredths === null : false,
        ...splitTime(profile?.reported400Hundredths),
    }))
    const [step, setStep] = useState(0)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const set = (key) => (value) => {
        setAnswers((current) => ({ ...current, [key]: value }))
        setError('')
    }

    const hasTestTime = time400?.source === 'teste'

    // Melhor estilo: só entre borboleta, costas e peito que o atleta marcou
    const bestStrokeOptions = STROKES.filter((s) => s.value !== 'crawl' && answers.strokes.includes(s.value))
    // "Medley" marca (ou desmarca) os quatro estilos; desmarcar um deles tira o medley
    const quatro = STROKES.map((s) => s.value)
    const temMedley = quatro.every((s) => answers.strokes.includes(s))
    const setStrokesWithMedley = (escolhidos) => {
        const marcouMedley = escolhidos.includes(MEDLEY) && !temMedley
        const desmarcouMedley = !escolhidos.includes(MEDLEY) && temMedley && quatro.every((s) => escolhidos.includes(s))
        if (marcouMedley) return setStrokes(quatro)
        if (desmarcouMedley) return setStrokes(['crawl'])
        setStrokes(escolhidos.filter((s) => s !== MEDLEY))
    }
    const setStrokes = (strokes) => {
        setAnswers((current) => ({
            ...current,
            strokes,
            // Se desmarcou o estilo que era o melhor, a resposta deixa de valer
            bestStroke: strokes.includes(current.bestStroke) ? current.bestStroke : null,
        }))
        setError('')
    }

    // Cada etapa: título, campos e o que precisa estar respondido para seguir
    const steps = [
        {
            title: 'Experiência',
            check: () =>
                !answers.swimmingSince || !answers.recentBreak || !answers.continuousDistance
                    ? 'Responda as três primeiras perguntas.'
                    : answers.strokes.length === 0 ? 'Escolha pelo menos um estilo.'
                        : bestStrokeOptions.length > 0 && !answers.bestStroke ? 'Escolha o seu melhor estilo.' : '',
            fields: (
                <>
                    <ChoiceGroup label='Há quanto tempo você nada?' options={SWIMMING_SINCE}
                        value={answers.swimmingSince} onChange={set('swimmingSince')} />
                    <ChoiceGroup label='Ficou parado recentemente? Por quanto tempo?' options={RECENT_BREAK}
                        value={answers.recentBreak} onChange={set('recentBreak')} />
                    <ChoiceGroup label='Quanto você nada sem parar?' options={CONTINUOUS_DISTANCE}
                        value={answers.continuousDistance} onChange={set('continuousDistance')} />
                    <ChoiceGroup label='Quais estilos você nada bem?' hint='Pode marcar mais de um.'
                        options={STROKES_WITH_MEDLEY} value={temMedley ? [...answers.strokes, MEDLEY] : answers.strokes}
                        onChange={setStrokesWithMedley} multiple />
                    {bestStrokeOptions.length > 0 && (
                        <ChoiceGroup label='Qual é o seu melhor estilo?'
                            hint='Sem contar o crawl: o estilo em que você é mais rápido.'
                            options={bestStrokeOptions} value={answers.bestStroke} onChange={set('bestStroke')} />
                    )}
                </>
            ),
        },
        {
            title: 'Rotina',
            check: () =>
                answers.trainingDays.length === 0 ? 'Escolha pelo menos um dia de treino.'
                    : !answers.sessionMinutes ? 'Escolha quanto tempo você tem por treino.' : '',
            fields: (
                <>
                    <ChoiceGroup label='Em quais dias da semana você pode treinar?' options={WEEK_DAYS}
                        value={answers.trainingDays} onChange={set('trainingDays')} multiple />
                    <ChoiceGroup label='Quanto tempo você tem por treino?' options={SESSION_MINUTES}
                        value={answers.sessionMinutes} onChange={set('sessionMinutes')} />
                </>
            ),
        },
        {
            title: 'Estrutura',
            check: () => (!answers.poolLength ? 'Escolha o tamanho da piscina.' : ''),
            fields: (
                <>
                    <ChoiceGroup label='Qual o tamanho da piscina onde você treina?' options={POOL_LENGTH}
                        value={answers.poolLength} onChange={set('poolLength')} />
                    <ChoiceGroup label='Que material você tem para treinar?'
                        hint='Marque tudo o que tiver. Se não tiver nenhum, pode seguir.'
                        options={EQUIPMENT} value={answers.equipment} onChange={set('equipment')} multiple />
                </>
            ),
        },
        {
            title: 'Saúde',
            check: () =>
                answers.hasInjury === null ? 'Diga se você tem alguma lesão ou limitação.'
                    : answers.hasInjury && answers.injuries.trim() === '' ? 'Conte qual é a lesão ou limitação.' : '',
            fields: (
                <>
                    <ChoiceGroup label='Você tem alguma lesão ou limitação?' options={YES_NO}
                        value={answers.hasInjury} onChange={set('hasInjury')} />
                    {answers.hasInjury && (
                        <label className={styles.textField}>
                            <span>Qual? Onde dói, desde quando, o que piora.</span>
                            <textarea
                                rows={3}
                                maxLength={500}
                                value={answers.injuries}
                                onChange={(e) => set('injuries')(e.target.value)}
                                placeholder='Ex.: dor no ombro direito há 2 meses, piora com palmar'
                            />
                        </label>
                    )}
                </>
            ),
        },
    ]

    if (!hasTestTime) {
        steps.push({
            title: 'Tempo nos 400 m',
            check: () =>
                answers.neverTested || parseTime(answers.minutes, answers.seconds) !== null
                    ? '' : 'Informe o tempo (minutos e segundos) ou marque que nunca fez o teste.',
            fields: (
                <>
                    <p className={styles.question}>Qual o seu tempo mais recente nos 400 m livre?</p>
                    <p className={styles.hint}>
                        É com ele que calculamos o ritmo de cada intensidade (A1, A2, A3).
                    </p>
                    <div className={styles.timeRow}>
                        <label className={styles.timeField}>
                            <input inputMode='numeric' value={answers.minutes} disabled={answers.neverTested}
                                onChange={(e) => set('minutes')(e.target.value)} aria-label='Minutos' placeholder='6' />
                            <span>min</span>
                        </label>
                        <label className={styles.timeField}>
                            <input inputMode='decimal' value={answers.seconds} disabled={answers.neverTested}
                                onChange={(e) => set('seconds')(e.target.value)} aria-label='Segundos' placeholder='32,45' />
                            <span>s</span>
                        </label>
                    </div>
                    <label className={styles.checkbox}>
                        <input type='checkbox' checked={answers.neverTested}
                            onChange={(e) => set('neverTested')(e.target.checked)} />
                        Nunca fiz o teste (o primeiro treino pode ser o próprio teste)
                    </label>
                </>
            ),
        })
    }

    const current = steps[step]
    const isLast = step === steps.length - 1

    const next = async () => {
        const problem = current.check()
        if (problem) return setError(problem)
        if (!isLast) return setStep(step + 1)

        setSaving(true)
        try {
            const result = await api('/athlete-profile', {
                method: 'PUT',
                body: {
                    swimmingSince: answers.swimmingSince,
                    recentBreak: answers.recentBreak,
                    continuousDistance: answers.continuousDistance,
                    strokes: answers.strokes,
                    bestStroke: bestStrokeOptions.length > 0 ? answers.bestStroke : null,
                    trainingDays: answers.trainingDays,
                    sessionMinutes: answers.sessionMinutes,
                    poolLength: answers.poolLength,
                    equipment: answers.equipment,
                    injuries: answers.hasInjury ? answers.injuries : '',
                    // Com teste registrado, mantém o tempo informado antes (se houver)
                    reported400Hundredths: hasTestTime
                        ? (profile?.reported400Hundredths ?? null)
                        : answers.neverTested ? null : parseTime(answers.minutes, answers.seconds),
                },
            })
            onSaved(result)
            // O tempo nos 400 m vai para a evolução dos tempos e para os treinos
            notifyAthleteChanged()
            notifyTrainingsChanged()
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <div>
            <div className={styles.progress} aria-hidden='true'>
                {steps.map((s, index) => (
                    <span key={s.title} className={index <= step ? styles.progressDone : ''} />
                ))}
            </div>
            <p className={styles.stepLabel}>Etapa {step + 1} de {steps.length} · {current.title}</p>

            {current.fields}

            {hasTestTime && isLast && (
                <p className={styles.hint}>
                    Tempo nos 400 m: usamos o seu teste de {formatDate(time400.date)} ({formatSwimTime(time400.hundredths)}).
                </p>
            )}

            {error && <p className={styles.error} role='alert'>{error}</p>}

            <div className={styles.actions}>
                {step === 0
                    ? <button type='button' className={styles.secondary} onClick={onCancel}>{cancelLabel}</button>
                    : <button type='button' className={styles.secondary} onClick={() => { setError(''); setStep(step - 1) }}>Voltar</button>}
                <button type='button' className={styles.primary} onClick={next} disabled={saving}>
                    {saving ? 'Salvando...' : isLast ? 'Salvar respostas' : 'Próximo'}
                </button>
            </div>
        </div>
    )
}

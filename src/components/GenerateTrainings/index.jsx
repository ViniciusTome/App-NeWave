import { useEffect, useState } from 'react'
import { AnamnesisForm } from './AnamnesisForm'
import { ChoiceGroup } from '../ChoiceGroup'
import { RaceFields } from '../RaceFields'
import { EMPTY_RACE, racePayload, raceProblem } from '../../utils/race'
import { api, notifyAthleteChanged, notifyTrainingsChanged } from '../../services/api'
import {
    IMPORTANCE_OPTIONS, MIX_MODES, MIX_SEQUENCES, MODEL_TEXT, POOL_MODALITIES, NO_COMPETITION_GOALS, TRAINING_MODELS, WEEK_DAYS,
    competitionLabel, daysUntil, daysUntilText, mixText,
    goalLabel, labelOf, levelText, profileSummary, specificBlocker,
} from '../../utils/athlete'
import { formatDate, formatSwimTime, todayIso } from '../../utils/format'
import styles from './wizard.module.css'

const TEST_OPTIONS = [{ value: true, label: 'Sim, quero fazer' }, { value: false, label: 'Não, meu tempo já vale' }]
const EMPTY_COMPETITION = { name: '', date: '', ...EMPTY_RACE }

// Fluxo do botão "Gerar treinos":
// 1. Primeira vez: anamnese (fica guardada).
// 2. Toda vez: prova alvo (continuar a atual, escolher do calendário, cadastrar nova ou sem prova).
// 3. Resumo, com "Atualizar meus dados".
// 4. Confirma e salva a preparação.
export const GenerateTrainings = ({ onClose }) => {
    const [phase, setPhase] = useState('loading') // loading | anamnese | alvo | resumo | pronto
    const [loadError, setLoadError] = useState('')
    const [athlete, setAthlete] = useState(null) // { profile, time400, level }
    const [preparation, setPreparation] = useState(null)
    const [competitions, setCompetitions] = useState([])

    // Escolha da prova alvo
    const [mode, setMode] = useState(null) // atual | calendario | nova | sem
    const [chosenId, setChosenId] = useState(null)
    const [newCompetition, setNewCompetition] = useState(EMPTY_COMPETITION)
    const [noCompetitionGoal, setNoCompetitionGoal] = useState(null)
    // Objetivo misto: escolher os dias de saúde ou alternar (ex.: '2-1' = 2 de condicionamento, 1 de saúde)
    const [mixMode, setMixMode] = useState(null)
    const [mixDays, setMixDays] = useState([])
    const [mixSequence, setMixSequence] = useState(null)
    const [targetError, setTargetError] = useState('')
    const [model, setModel] = useState('geral') // geral | especifico
    const [withTest, setWithTest] = useState(null) // quer o teste de 400 m nesta preparação?

    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saved, setSaved] = useState(null)

    useEffect(() => {
        let cancelled = false
        const today = todayIso()
        Promise.all([
            api('/athlete-profile'),
            api(`/preparations/current?today=${today}`),
            api(`/competitions?today=${today}`),
        ])
            .then(([athleteData, { preparation }, { competitions }]) => {
                if (cancelled) return
                setAthlete(athleteData)
                setPreparation(preparation)
                setCompetitions(competitions)
                // Se a preparação atual ainda vale, já vem marcada "continuar"
                if (preparation?.active) {
                    setMode('atual')
                    setModel(preparation.model ?? 'geral')
                }
                setPhase(athleteData.profile ? 'alvo' : 'anamnese')
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err.message)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const today = todayIso()
    const currentIsActive = Boolean(preparation?.active)
    // No calendário, só as provas que não são a alvo atual
    const otherCompetitions = competitions.filter(
        (c) => !(currentIsActive && c.id === preparation.competition?.id),
    )

    const newCompetitionPayload = () => ({ name: newCompetition.name, date: newCompetition.date, ...racePayload(newCompetition) })

    // Prova alvo escolhida (para o resumo e para saber se o Específico pode)
    function targetCompetition() {
        if (mode === 'atual') return preparation.goal === 'competir' ? preparation.competition : null
        if (mode === 'calendario') return competitions.find((c) => c.id === chosenId) ?? null
        if (mode === 'nova') return newCompetitionPayload()
        return null
    }
    const specificProblem = phase === 'resumo' ? specificBlocker(targetCompetition(), athlete?.profile) : ''
    // Teste de 400 m: quem já tem tempo escolhe se faz (sem tempo, o teste entra depois de 1 mês).
    // Prova alvo de 400 m em piscina: o teste é a própria prova
    const alvo = phase === 'resumo' ? targetCompetition() : null
    const provaDe400 = Boolean(alvo && POOL_MODALITIES.includes(alvo.modality) && alvo.distance === 400)
    // (objetivo saúde: sem fases, sem Transição, então sem o teste da periodização)
    const soSaude = (mode === 'sem' && noCompetitionGoal === 'saude') || (mode === 'atual' && preparation?.goal === 'saude')
    const askTest = Boolean(athlete?.time400) && !provaDe400 && !soSaude
    const chosenModel = specificProblem ? 'geral' : model
    const trainingDays = athlete?.profile?.trainingDays ?? []

    const testChoice = () => (askTest ? { withTest } : {})

    // O que vai para o servidor, conforme a escolha
    function targetPayload() {
        if (mode === 'atual') {
            return preparation.goal === 'competir'
                ? { goal: 'competir', competitionId: preparation.competition.id, model: chosenModel, ...testChoice() }
                : { goal: preparation.goal, ...(preparation.mix && { mix: preparation.mix }), ...testChoice() }
        }
        if (mode === 'calendario') return { goal: 'competir', competitionId: chosenId, model: chosenModel, ...testChoice() }
        if (mode === 'nova') return { goal: 'competir', competition: newCompetitionPayload(), model: chosenModel, ...testChoice() }
        return { goal: noCompetitionGoal, ...(noCompetitionGoal === 'misto' && { mix: chosenMix() }), ...testChoice() }
    }

    function chosenMix() {
        if (mixMode === 'dias') return { modo: 'dias', dias: mixDays }
        const [condicionamento, saude] = (mixSequence ?? '1-1').split('-').map(Number)
        return { modo: 'alternar', condicionamento, saude }
    }
    const goalText = (goal, mix) => (goal === 'misto' && mix ? `${goalLabel(goal)} (${mixText(mix)})` : goalLabel(goal))

    // Provas do calendário que não são a alvo escolhida (as intermediárias)
    const targetId = mode === 'atual' ? preparation?.competition?.id : mode === 'calendario' ? chosenId : null
    const intermediateCompetitions = competitions.filter((c) => c.id !== targetId)
    const [priorityError, setPriorityError] = useState('')
    const changePriority = async (competition, priority) => {
        setPriorityError('')
        try {
            const { competition: updated } = await api(`/competitions/${competition.id}`, { method: 'PATCH', body: { priority } })
            setCompetitions((list) => list.map((c) => (c.id === updated.id ? updated : c)))
        } catch (err) {
            setPriorityError(err.message)
        }
    }

    // Texto da prova alvo escolhida, para o resumo
    function targetText() {
        if (mode === 'atual') {
            return preparation.competition
                ? competitionLabel(preparation.competition)
                : `Sem prova alvo · ${goalText(preparation.goal, preparation.mix)}`
        }
        if (mode === 'calendario') return competitionLabel(competitions.find((c) => c.id === chosenId))
        if (mode === 'nova') return competitionLabel(newCompetitionPayload())
        return `Sem prova alvo · ${goalText(noCompetitionGoal, noCompetitionGoal === 'misto' ? chosenMix() : null)}`
    }

    function checkTarget() {
        if (!mode) return 'Escolha a prova alvo desta preparação.'
        if (mode === 'calendario' && !chosenId) return 'Escolha uma prova do calendário.'
        if (mode === 'nova') {
            if (newCompetition.name.trim().length < 2) return 'Dê um nome para a competição.'
            if (!newCompetition.date) return 'Informe a data da competição.'
            if (newCompetition.date < today) return 'A data da competição já passou.'
            const problem = raceProblem(newCompetition)
            if (problem) return problem
        }
        if (mode === 'sem' && !noCompetitionGoal) return 'Escolha o objetivo.'
        if (mode === 'sem' && noCompetitionGoal === 'misto') {
            if (!mixMode) return 'Escolha como misturar o condicionamento e a saúde.'
            if (mixMode === 'dias' && mixDays.length === 0) return 'Escolha os dias de saúde.'
            if (mixMode === 'dias' && mixDays.length >= trainingDays.length) return 'Deixe pelo menos um dia para o condicionamento.'
            if (mixMode === 'alternar' && !mixSequence) return 'Escolha a sequência dos treinos.'
        }
        return ''
    }

    const goToSummary = () => {
        const problem = checkTarget()
        if (problem) return setTargetError(problem)
        setSaveError('')
        setPhase('resumo')
    }

    const confirm = async () => {
        if (askTest && withTest === null) return setSaveError('Responda se quer fazer o teste de 400 m nesta preparação.')
        setSaving(true)
        setSaveError('')
        try {
            const { preparation } = await api(`/preparations?today=${today}`, {
                method: 'POST',
                body: targetPayload(),
            })
            // Monta todos os treinos da periodização (até a prova alvo; sem prova, 8 semanas)
            const generated = await api(`/trainings/generate?today=${today}`, { method: 'POST' })
            setSaved({ ...preparation, trainings: generated.trainings, replaced: generated.replaced })
            setPhase('pronto')
            notifyAthleteChanged()
            notifyTrainingsChanged() // o carrossel recarrega
        } catch (err) {
            setSaveError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const setNew = (key) => (value) => {
        setNewCompetition((current) => ({ ...current, [key]: value }))
        setTargetError('')
    }

    const pick = (value) => {
        setMode(value)
        setTargetError('')
    }

    if (loadError) return <p className={styles.error} role='alert'>{loadError}</p>
    if (phase === 'loading') return <p className={styles.hint}>Carregando...</p>

    if (phase === 'anamnese') {
        const firstTime = !athlete.profile
        return (
            <div>
                {firstTime && (
                    <p className={styles.intro}>
                        Antes de montar seus treinos, precisamos te conhecer melhor.
                        <strong> Você só responde isso uma vez</strong>: depois dá para atualizar quando algo mudar.
                    </p>
                )}
                <AnamnesisForm
                    profile={athlete.profile}
                    time400={athlete.time400}
                    cancelLabel={firstTime ? 'Agora não' : 'Cancelar'}
                    onCancel={firstTime ? onClose : () => setPhase('resumo')}
                    onSaved={(data) => {
                        setAthlete(data)
                        notifyAthleteChanged()
                        // Primeira vez: segue para a prova alvo. Atualização: volta ao resumo.
                        setPhase(firstTime ? 'alvo' : 'resumo')
                    }}
                />
            </div>
        )
    }

    if (phase === 'alvo') {
        return (
            <div>
                <p className={styles.question}>Qual é a prova alvo desta preparação?</p>
                <p className={styles.hint}>
                    É para ela que os treinos vão ser montados. Provas intermediárias você coloca depois no calendário.
                </p>

                <div className={styles.targetList} role='radiogroup' aria-label='Prova alvo'>
                    {currentIsActive && (
                        <TargetOption checked={mode === 'atual'} onSelect={() => pick('atual')}
                            title='Continuar com a prova atual'
                            detail={preparation.competition
                                ? `${competitionLabel(preparation.competition)} · ${daysUntilText(daysUntil(preparation.competition.date, today))}`
                                : `Sem prova alvo · ${goalText(preparation.goal, preparation.mix)}`} />
                    )}

                    {otherCompetitions.length > 0 && (
                        <TargetOption checked={mode === 'calendario'} onSelect={() => pick('calendario')}
                            title='Escolher uma prova do meu calendário'>
                            {mode === 'calendario' && (
                                <div className={styles.subOptions}>
                                    {otherCompetitions.map((c) => (
                                        <label key={c.id} className={styles.radioLine}>
                                            <input type='radio' name='competicao' checked={chosenId === c.id}
                                                onChange={() => { setChosenId(c.id); setTargetError('') }} />
                                            {competitionLabel(c)}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </TargetOption>
                    )}

                    <TargetOption checked={mode === 'nova'} onSelect={() => pick('nova')}
                        title='Cadastrar uma prova nova'
                        detail={mode === 'nova' ? null : 'Ela também entra no seu calendário de competições.'}>
                        {mode === 'nova' && (
                            <div className={styles.subOptions}>
                                <label className={styles.textField}>
                                    <span>Nome da competição</span>
                                    <input value={newCompetition.name} maxLength={100}
                                        onChange={(e) => setNew('name')(e.target.value)} placeholder='Ex.: Troféu Estadual' />
                                </label>
                                <label className={styles.textField}>
                                    <span>Data</span>
                                    <input type='date' min={today} value={newCompetition.date}
                                        onChange={(e) => setNew('date')(e.target.value)} />
                                </label>
                                <RaceFields value={newCompetition}
                                    onChange={(value) => { setNewCompetition(value); setTargetError('') }} />
                            </div>
                        )}
                    </TargetOption>

                    <TargetOption checked={mode === 'sem'} onSelect={() => pick('sem')}
                        title='Não vou competir agora'
                        detail={mode === 'sem' ? null : 'Treinos para condicionamento ou saúde.'}>
                        {mode === 'sem' && (
                            <div className={styles.subOptions}>
                                <ChoiceGroup label='Qual o objetivo?' options={NO_COMPETITION_GOALS}
                                    value={noCompetitionGoal}
                                    onChange={(value) => { setNoCompetitionGoal(value); setTargetError('') }} />
                                {noCompetitionGoal === 'misto' && (
                                    <>
                                        <ChoiceGroup label='Como misturar?'
                                            hint='Nos dias de saúde o treino é de emagrecimento: intervalado, fartlek e séries por tempo.'
                                            options={MIX_MODES} value={mixMode}
                                            onChange={(value) => { setMixMode(value); setTargetError('') }} />
                                        {mixMode === 'dias' && (
                                            <ChoiceGroup label='Quais dias são de saúde?' hint='Os outros dias de treino são de condicionamento.'
                                                options={WEEK_DAYS.filter((d) => trainingDays.includes(d.value))} value={mixDays} multiple
                                                onChange={(value) => { setMixDays(value); setTargetError('') }} />
                                        )}
                                        {mixMode === 'alternar' && (
                                            <ChoiceGroup label='Qual a sequência?' options={MIX_SEQUENCES} value={mixSequence}
                                                onChange={(value) => { setMixSequence(value); setTargetError('') }} />
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </TargetOption>
                </div>

                {targetError && <p className={styles.error} role='alert'>{targetError}</p>}

                <div className={styles.actions}>
                    <button type='button' className={styles.secondary} onClick={onClose}>Cancelar</button>
                    <button type='button' className={styles.primary} onClick={goToSummary}>Continuar</button>
                </div>
            </div>
        )
    }

    if (phase === 'resumo') {
        return (
            <div>
                <p className={styles.question}>Confira antes de gerar</p>

                <dl className={styles.summary}>
                    <div className={styles.summaryHighlight}>
                        <dt>Prova alvo</dt>
                        <dd>{targetText()}</dd>
                    </div>
                    <div className={styles.summaryHighlight}>
                        <dt>Nível calculado</dt>
                        <dd>{levelText(athlete.level)}</dd>
                    </div>
                    {profileSummary(athlete.profile, athlete.time400).map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>

                <button type='button' className={styles.link} onClick={() => setPhase('anamnese')}>
                    Algo mudou? Atualizar meus dados
                </button>

                {targetCompetition() && (
                    <div className={styles.intermediate}>
                        <p className={styles.question}>Modelo de treino</p>
                        {specificProblem ? (
                            <p className={styles.hint}>
                                <strong>Geral.</strong> {MODEL_TEXT.geral}<br />
                                Específico da prova: {specificProblem}
                            </p>
                        ) : (
                            <>
                                <ChoiceGroup label='Como montar os treinos?' options={TRAINING_MODELS} value={chosenModel} onChange={setModel} />
                                <p className={styles.hint}>{MODEL_TEXT[chosenModel]}</p>
                            </>
                        )}
                    </div>
                )}

                {intermediateCompetitions.length > 0 && (
                    <div className={styles.intermediate}>
                        <p className={styles.question}>Outras provas no seu calendário</p>
                        <p className={styles.notice} role='note'>
                            ⚠️ Prova de <strong>participação</strong> não muda o treino. Se ela for importante para
                            você, marque <strong>Importante</strong>: na semana dela, o volume do treino diminui um
                            pouco (o resto continua igual).
                        </p>
                        {intermediateCompetitions.map((c) => (
                            <ChoiceGroup key={c.id} label={competitionLabel(c)} options={IMPORTANCE_OPTIONS}
                                value={c.priority === 'A' ? 'B' : c.priority} onChange={(priority) => changePriority(c, priority)} />
                        ))}
                        {priorityError && <p className={styles.error} role='alert'>{priorityError}</p>}
                    </div>
                )}

                {askTest && (
                    <div className={styles.intermediate}>
                        <ChoiceGroup
                            label='Quer fazer o teste de 400 m nesta preparação?'
                            hint={`O teste entra no começo da Transição e atualiza os seus tempos. Se o seu tempo atual (${formatSwimTime(athlete.time400.hundredths)}) ainda vale, não precisa.`}
                            options={TEST_OPTIONS}
                            value={withTest}
                            onChange={(v) => { setWithTest(v); setSaveError('') }}
                        />
                    </div>
                )}

                <p className={styles.hint}>
                    Vamos montar todos os treinos da sua preparação: até a prova alvo ou, sem prova, das
                    próximas 8 semanas. Os treinos agendados que você ainda não fez serão substituídos pelos novos.
                </p>

                {saveError && <p className={styles.error} role='alert'>{saveError}</p>}

                <div className={styles.actions}>
                    <button type='button' className={styles.secondary} onClick={() => setPhase('alvo')}>Voltar</button>
                    <button type='button' className={styles.primary} onClick={confirm} disabled={saving}>
                        {saving ? 'Gerando...' : 'Confirmar e gerar'}
                    </button>
                </div>
            </div>
        )
    }

    // phase === 'pronto'
    return (
        <div className={styles.done}>
            <p className={styles.doneTitle}>
                {saved.trainings.length === 1 ? '1 treino gerado!' : `${saved.trainings.length} treinos gerados!`}
            </p>
            <p>
                {saved.competition
                    ? <>Prova alvo: <strong>{competitionLabel(saved.competition)}</strong> ({daysUntilText(daysUntil(saved.competition.date, today))}).</>
                    : <>Objetivo: <strong>{goalText(saved.goal, saved.mix)}</strong>, sem prova alvo.</>}
                {saved.competition && <> Modelo de treino: <strong>{labelOf(TRAINING_MODELS, saved.model)}</strong>.</>}
            </p>
            {saved.trainings.length > 0 && (
                <ul className={styles.generatedList}>
                    {saved.trainings.map((t) => (
                        <li key={t.date}>
                            <strong>{formatDate(t.date)}</strong> · {t.metros} m · ~{t.minutos} min
                        </li>
                    ))}
                </ul>
            )}
            <p className={styles.hint}>
                Eles já estão no seu carrossel, na página inicial.
                {saved.replaced > 0 && ` ${saved.replaced} treino(s) agendado(s) que ainda não tinham sido feitos foram substituídos.`}
                {' '}Esta é a primeira versão do gerador: o tempo de cada série ainda é uma estimativa.
            </p>
            <div className={styles.actions}>
                <button type='button' className={styles.primary} onClick={onClose}>Fechar</button>
            </div>
        </div>
    )
}

// Uma opção de prova alvo: um cartão clicável que pode abrir mais campos
const TargetOption = ({ checked, onSelect, title, detail, children }) => (
    <div className={`${styles.target} ${checked ? styles.targetChecked : ''}`}>
        <label className={styles.targetHead}>
            <input type='radio' name='prova-alvo' checked={checked} onChange={onSelect} />
            <span>
                <span className={styles.targetTitle}>{title}</span>
                {detail && <span className={styles.targetDetail}>{detail}</span>}
            </span>
        </label>
        {children}
    </div>
)

import { useCallback, useEffect, useState } from 'react'
import { AnamnesisForm } from '../GenerateTrainings/AnamnesisForm'
import { Modal } from '../Modal'
import { api, ATHLETE_CHANGED, notifyAthleteChanged, notifyTrainingsChanged } from '../../services/api'
import {
    MODEL_TEXT, TRAINING_MODELS, competitionLabel, daysUntil, daysUntilText, goalLabel, levelText, profileSummary,
} from '../../utils/athlete'
import { todayIso } from '../../utils/format'
import styles from './athletesummary.module.css'

// Bloco "Meu treino" do Perfil: preparação atual, nível e respostas da anamnese,
// com o botão para editar as respostas.
export const AthleteSummary = () => {
    const [athlete, setAthlete] = useState(null) // null = carregando
    const [preparation, setPreparation] = useState(null)
    const [loadError, setLoadError] = useState('')
    const [editing, setEditing] = useState(false)
    const [changingModel, setChangingModel] = useState(false)
    const [modelError, setModelError] = useState('')

    // Trocar o modelo de treino: os treinos que ainda não foram feitos são refeitos
    const changeModel = async (model) => {
        if (model === preparation.model) return
        const nome = TRAINING_MODELS.find((m) => m.value === model).label
        if (!window.confirm(`Trocar para o modelo ${nome}?\n\nOs treinos que você ainda não fez serão refeitos. Os já feitos continuam no histórico.`)) return
        setModelError('')
        setChangingModel(true)
        try {
            await api(`/preparations/current?today=${todayIso()}`, { method: 'PATCH', body: { model } })
            notifyAthleteChanged()
            notifyTrainingsChanged()
        } catch (err) {
            setModelError(err.message)
        } finally {
            setChangingModel(false)
        }
    }

    const load = useCallback(() => {
        Promise.all([api('/athlete-profile'), api(`/preparations/current?today=${todayIso()}`)])
            .then(([athleteData, { preparation }]) => {
                setAthlete(athleteData)
                setPreparation(preparation)
                setLoadError('')
            })
            .catch((err) => setLoadError(err.message))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(ATHLETE_CHANGED, load)
        return () => window.removeEventListener(ATHLETE_CHANGED, load)
    }, [load])

    if (loadError) return <p className={styles.message} role='alert'>{loadError}</p>
    if (!athlete) return <p className={styles.message}>Carregando...</p>

    const today = todayIso()
    const hasProfile = athlete.profile !== null

    return (
        <div className={styles.container}>
            {!hasProfile ? (
                <div className={styles.empty}>
                    <p>Você ainda não respondeu as perguntas sobre o seu treino.</p>
                    <p className={styles.message}>
                        Elas são usadas para montar os seus treinos, e você só responde uma vez.
                    </p>
                </div>
            ) : (
                <>
                    <div className={styles.highlights}>
                        <div>
                            <span className={styles.label}>Preparação atual</span>
                            <span className={styles.value}>
                                {!preparation?.active
                                    ? 'Nenhuma: use "Gerar treinos" para escolher a prova alvo'
                                    : preparation.competition
                                        ? `${competitionLabel(preparation.competition)} (${daysUntilText(daysUntil(preparation.competition.date, today))})`
                                        : `Sem prova alvo · ${goalLabel(preparation.goal)}`}
                            </span>
                        </div>
                        <div>
                            <span className={styles.label}>Nível calculado</span>
                            <span className={styles.value}>{levelText(athlete.level)}</span>
                        </div>
                    </div>
                    {preparation?.active && preparation.competition && (
                        <div className={styles.model}>
                            <span className={styles.label}>Modelo de treino</span>
                            {preparation.especifico?.ok ? (
                                <div className={styles.toggle} role='group' aria-label='Modelo de treino'>
                                    {TRAINING_MODELS.map((m) => (
                                        <button key={m.value} type='button' aria-pressed={preparation.model === m.value}
                                            disabled={changingModel} onClick={() => changeModel(m.value)}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <span className={styles.value}>Geral</span>
                            )}
                            <span className={styles.modelHint}>
                                {changingModel ? 'Refazendo os treinos...' : MODEL_TEXT[preparation.model ?? 'geral']}
                                {!preparation.especifico?.ok && preparation.especifico?.motivo && <><br />Específico da prova: {preparation.especifico.motivo}</>}
                            </span>
                            {modelError && <span className={styles.modelError} role='alert'>{modelError}</span>}
                        </div>
                    )}
                    <dl className={styles.answers}>
                        {profileSummary(athlete.profile, athlete.time400).map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </>
            )}

            <button type='button' className={styles.edit} onClick={() => setEditing(true)}>
                {hasProfile ? 'Editar respostas' : 'Responder agora'}
            </button>

            <Modal
                open={editing}
                onClose={() => setEditing(false)}
                title={hasProfile ? 'Editar meus dados' : 'Sobre o seu treino'}
            >
                <AnamnesisForm
                    profile={athlete.profile}
                    time400={athlete.time400}
                    onCancel={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false)
                        notifyAthleteChanged()
                    }}
                />
            </Modal>
        </div>
    )
}

import { useCallback, useEffect, useState } from 'react'
import { AnamnesisForm } from '../GenerateTrainings/AnamnesisForm'
import { Modal } from '../Modal'
import { api, ATHLETE_CHANGED, notifyAthleteChanged } from '../../services/api'
import {
    competitionLabel, daysUntil, daysUntilText, goalLabel, levelText, profileSummary,
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

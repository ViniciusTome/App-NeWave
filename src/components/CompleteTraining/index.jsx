import { useState } from 'react'
import { ChoiceGroup } from '../ChoiceGroup'
import styles from './completetraining.module.css'

// A partir disso o app pergunta o motivo (o mesmo de server/swimming.js, FEEDBACK)
const PERGUNTAR_MOTIVO_A_PARTIR_DE = 8

const NOTAS = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const MOTIVOS = [
    { value: 'respiracao', label: 'A respiração (faltou ar)' },
    { value: 'forca', label: 'A força (os braços ficaram pesados)' },
]

// Perguntas ao concluir o treino, mostradas na janela flutuante.
// `onSubmit({ difficulty, reason })` conclui o treino com as respostas.
export const CompleteTraining = ({ onSubmit, submitting, error }) => {
    const [difficulty, setDifficulty] = useState(null)
    const [reason, setReason] = useState(null)
    const precisaMotivo = difficulty !== null && difficulty >= PERGUNTAR_MOTIVO_A_PARTIR_DE
    const pronto = difficulty !== null && (!precisaMotivo || reason !== null)

    const handleSubmit = (event) => {
        event.preventDefault()
        if (!pronto) return
        onSubmit({ difficulty, ...(precisaMotivo && { reason }) })
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <ChoiceGroup
                label='Como foi a série principal?'
                hint='1 = muito fácil · 10 = muito difícil'
                options={NOTAS}
                value={difficulty}
                onChange={(nota) => {
                    setDifficulty(nota)
                    if (nota < PERGUNTAR_MOTIVO_A_PARTIR_DE) setReason(null)
                }}
            />
            {precisaMotivo && (
                <ChoiceGroup
                    label='O que deixou mais difícil?'
                    options={MOTIVOS}
                    value={reason}
                    onChange={setReason}
                />
            )}
            {error && <p className={styles.error} role='alert'>{error}</p>}
            <button type='submit' className={styles.submit} disabled={!pronto || submitting}>
                {submitting ? 'Concluindo...' : 'Concluir treino'}
            </button>
        </form>
    )
}

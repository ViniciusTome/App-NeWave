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

const SIM_NAO = [{ value: true, label: 'Sim, sem parar' }, { value: false, label: 'Não, precisei parar' }]
// Nado em partes (iniciante no treino de saúde): conseguiu nadar todas as repetições?
const SIM_NAO_PARTES = [{ value: true, label: 'Sim, todas' }, { value: false, label: 'Não, parei antes' }]

// Perguntas ao concluir o treino, mostradas na janela flutuante.
// `onSubmit({ difficulty, reason, nonstop })` conclui o treino com as respostas.
// Treino com nado contínuo: pergunta também se conseguiu nadar sem parar.
export const CompleteTraining = ({ training = null, onSubmit, submitting, error }) => {
    const [difficulty, setDifficulty] = useState(null)
    const [reason, setReason] = useState(null)
    const [nonstop, setNonstop] = useState(null)
    const continuo = training?.partes?.find((p) => p.parte === 'continuo') ?? null
    const precisaMotivo = difficulty !== null && difficulty >= PERGUNTAR_MOTIVO_A_PARTIR_DE
    const pronto = difficulty !== null && (!precisaMotivo || reason !== null) && (!continuo || nonstop !== null)

    const handleSubmit = (event) => {
        event.preventDefault()
        if (!pronto) return
        onSubmit({ difficulty, ...(precisaMotivo && { reason }), ...(continuo && { nonstop }) })
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
            {continuo && (
                <ChoiceGroup
                    label={continuo.fracionado
                        ? `Você nadou todas as repetições do nado em partes (${continuo.texto.split(' · ')[0]})?`
                        : `Você nadou os ${continuo.metros} m do nado contínuo sem parar?`}
                    hint='Precisar parar não tem problema: os próximos treinos se ajustam a você.'
                    options={continuo.fracionado ? SIM_NAO_PARTES : SIM_NAO}
                    value={nonstop}
                    onChange={setNonstop}
                />
            )}
            {error && <p className={styles.error} role='alert'>{error}</p>}
            <button type='submit' className={styles.submit} disabled={!pronto || submitting}>
                {submitting ? 'Concluindo...' : 'Concluir treino'}
            </button>
        </form>
    )
}

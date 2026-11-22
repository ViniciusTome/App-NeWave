import { useState } from 'react'
import { api, notifyAthleteChanged, notifyTrainingsChanged } from '../../../services/api'
import { todayIso } from '../../../utils/format'
import styles from './evolutionofthetimes.module.css'

const DISTANCES = [25, 50, 100, 200, 400, 800, 1500]

// Formulário de "Registrar teste", mostrado dentro da janela flutuante.
export const AddTestForm = ({ defaultDistance, onSaved }) => {
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const onSubmit = async (event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const minutes = Number(form.get('minutes') || 0)
        const seconds = Number(form.get('seconds') || 0)
        const hundredths = Number(form.get('hundredths') || 0)
        const timeHundredths = minutes * 6000 + seconds * 100 + hundredths

        if (timeHundredths <= 0) {
            setError('Informe o tempo do teste.')
            return
        }

        setError('')
        setIsSubmitting(true)
        try {
            const { test } = await api('/tests', {
                method: 'POST',
                body: {
                    distance: Number(form.get('distance')),
                    timeHundredths,
                    date: form.get('date'),
                },
            })
            onSaved(test)
            // Um teste novo (de 400 m) muda a tabela de tempos e o nível, e os treinos
            // que ainda não foram feitos ganham os tempos (cd)
            notifyAthleteChanged()
            notifyTrainingsChanged()
        } catch (err) {
            setError(err.message)
            setIsSubmitting(false)
        }
    }

    return (
        <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
                <span>Distância</span>
                <select name='distance' defaultValue={defaultDistance ?? 400} className={styles.control}>
                    {DISTANCES.map((d) => (
                        <option key={d} value={d}>{d} metros</option>
                    ))}
                </select>
            </label>

            <fieldset className={styles.timeFields}>
                <legend>Tempo</legend>
                <label className={styles.field}>
                    <span>Minutos</span>
                    <input name='minutes' type='number' min='0' max='119' step='1' inputMode='numeric' placeholder='0' className={styles.control} />
                </label>
                <label className={styles.field}>
                    <span>Segundos</span>
                    <input name='seconds' type='number' min='0' max='59' step='1' inputMode='numeric' placeholder='0' className={styles.control} />
                </label>
                <label className={styles.field}>
                    <span>Centésimos</span>
                    <input name='hundredths' type='number' min='0' max='99' step='1' inputMode='numeric' placeholder='0' className={styles.control} />
                </label>
            </fieldset>

            <label className={styles.field}>
                <span>Data do teste</span>
                <input name='date' type='date' required defaultValue={todayIso()} max={todayIso()} className={styles.control} />
            </label>

            {error && <p className={styles.formError} role='alert'>{error}</p>}

            <button type='submit' className={styles.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar teste'}
            </button>
        </form>
    )
}

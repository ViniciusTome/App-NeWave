import { useState } from 'react'
import { Modal } from '../Modal'
import { api, notifyTrainingsChanged } from '../../services/api'
import { formatDate, todayIso } from '../../utils/format'
import styles from './rescheduletest.module.css'

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const dayText = (iso) => `${WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${formatDate(iso)}`
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// "Remarcar o teste": o atleta não pode ir no dia do teste de 400 m e escolhe outro.
// Sugere os próximos dias de treino (de preferência a semana seguinte).
// `training` = o dia do teste; `trainings` = os próximos treinos (para as sugestões).
export const RescheduleTest = ({ training, trainings }) => {
    const [open, setOpen] = useState(false)
    const [date, setDate] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const amanha = addDays(todayIso(), 1)
    const sugestoes = trainings
        .map((t) => t.date)
        .filter((d) => d > training.date && d <= addDays(training.date, 14))
        .slice(0, 6)

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            await api(`/trainings/${training.id}/reschedule-test?today=${todayIso()}`, { method: 'POST', body: { date } })
            setOpen(false)
            notifyTrainingsChanged()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <button type='button' className={styles.link} onClick={() => { setDate(''); setError(''); setOpen(true) }}>
                Não vou conseguir ir: remarcar o teste
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title='Remarcar o teste de 400 m'>
                <div className={styles.box}>
                    <p>
                        O teste está marcado para <strong>{dayText(training.date)}</strong>. Escolha um dia em que você
                        tem certeza de que vai poder fazer (de preferência na semana seguinte):
                    </p>
                    {sugestoes.length > 0 && (
                        <div className={styles.options} role='group' aria-label='Próximos dias de treino'>
                            {sugestoes.map((d) => (
                                <button key={d} type='button' aria-pressed={date === d} onClick={() => setDate(d)}>
                                    {dayText(d)}
                                </button>
                            ))}
                        </div>
                    )}
                    <label className={styles.field}>
                        <span>Ou outro dia</span>
                        <input type='date' min={amanha} value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>
                    <p className={styles.hint}>Se nesse dia já tiver um treino, os dois trocam de dia.</p>
                    {error && <p className={styles.error} role='alert'>{error}</p>}
                    <button type='button' className={styles.primary} disabled={!date || saving} onClick={save}>
                        {saving ? 'Remarcando...' : 'Remarcar o teste'}
                    </button>
                </div>
            </Modal>
        </>
    )
}

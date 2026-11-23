import { useEffect, useState } from 'react'
import { CompleteTraining } from '../CompleteTraining'
import { Modal } from '../Modal'
import { api, notifyTrainingsChanged } from '../../services/api'
import { formatDate, todayIso } from '../../utils/format'
import styles from './pendingtrainings.module.css'

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const dayText = (iso) => `${WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${formatDate(iso)}`

// Ao abrir o app: treinos que passaram da data sem resposta. O atleta diz se fez ou
// não (às vezes ele só esqueceu de clicar em "Concluir treino"). Faltas seguidas
// deixam os próximos treinos mais leves.
export const PendingTrainings = () => {
    const [pending, setPending] = useState([])
    const [answers, setAnswers] = useState({}) // id -> 'fiz' | 'nao'
    const [feedbackFor, setFeedbackFor] = useState(null) // um treino só: as perguntas de "Concluir treino"
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [lighter, setLighter] = useState(false)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        api(`/trainings/pending?today=${todayIso()}`)
            .then(({ trainings }) => {
                setPending(trainings)
                setOpen(trainings.length > 0)
            })
            .catch(() => {})
    }, [])

    const finish = (maisLeves) => {
        notifyTrainingsChanged()
        if (maisLeves > 0) setLighter(true)
        else setOpen(false)
    }

    const missed = async (training) => {
        const { maisLeves } = await api(`/trainings/${training.id}/missed?today=${todayIso()}`, { method: 'POST' })
        return maisLeves
    }

    // Um treino só: "Fiz" leva às perguntas da série principal
    const completeOne = async (feedback) => {
        setSaving(true)
        setError('')
        try {
            await api(`/trainings/${feedbackFor.id}/complete`, { method: 'POST', body: feedback })
            finish(0)
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    // Vários: marca de uma vez, na ordem das datas (as faltas seguidas contam)
    const confirmAll = async () => {
        setSaving(true)
        setError('')
        try {
            let maisLeves = 0
            for (const t of pending) {
                if (answers[t.id] === 'fiz') await api(`/trainings/${t.id}/complete`, { method: 'POST' })
                else maisLeves += await missed(t)
            }
            finish(maisLeves)
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const notDoneOne = async () => {
        setSaving(true)
        setError('')
        try {
            finish(await missed(pending[0]))
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    if (pending.length === 0) return null
    const one = pending.length === 1
    const allAnswered = pending.every((t) => answers[t.id])

    return (
        <Modal open={open} onClose={() => setOpen(false)} title={one ? 'Você fez este treino?' : 'Você fez estes treinos?'}>
            {lighter ? (
                <div className={styles.box}>
                    <p>
                        Como você ficou alguns treinos sem nadar, deixamos os próximos <strong>um pouco mais leves</strong>.
                        As séries são as mesmas; só a intensidade diminuiu.
                    </p>
                    <button type='button' className={styles.primary} onClick={() => setOpen(false)}>Entendi</button>
                </div>
            ) : feedbackFor ? (
                <CompleteTraining training={feedbackFor} onSubmit={completeOne} submitting={saving} error={error} />
            ) : one ? (
                <div className={styles.box}>
                    <p><strong>{pending[0].title}</strong> · {dayText(pending[0].date)}</p>
                    {error && <p className={styles.error} role='alert'>{error}</p>}
                    <button type='button' className={styles.primary} disabled={saving} onClick={() => setFeedbackFor(pending[0])}>
                        Sim, fiz
                    </button>
                    <button type='button' className={styles.secondary} disabled={saving} onClick={notDoneOne}>
                        Não fiz
                    </button>
                </div>
            ) : (
                <div className={styles.box}>
                    <p>Esses treinos passaram da data sem resposta. Marque os que você fez:</p>
                    <ul className={styles.list}>
                        {pending.map((t) => (
                            <li key={t.id} className={styles.item}>
                                <span><strong>{t.title}</strong> · {dayText(t.date)}</span>
                                <div className={styles.toggle} role='group' aria-label={`${t.title}: fez ou não`}>
                                    {[['fiz', 'Fiz'], ['nao', 'Não fiz']].map(([value, label]) => (
                                        <button key={value} type='button' aria-pressed={answers[t.id] === value}
                                            onClick={() => setAnswers((a) => ({ ...a, [t.id]: value }))}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {error && <p className={styles.error} role='alert'>{error}</p>}
                    <button type='button' className={styles.primary} disabled={!allAnswered || saving} onClick={confirmAll}>
                        {saving ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            )}
        </Modal>
    )
}

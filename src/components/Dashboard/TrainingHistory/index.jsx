import { useEffect, useState } from 'react'
import { Modal } from '../../Modal'
import { Training } from '../../Training'
import { api } from '../../../services/api'
import { formatDate, formatShortDate } from '../../../utils/format'
import styles from './traininghistory.module.css'

const HISTORY_SIZE = 7

export const TrainingHistory = () => {
    const [trainings, setTrainings] = useState(null) // null = carregando
    const [loadError, setLoadError] = useState('')
    const [selected, setSelected] = useState(null)

    useEffect(() => {
        let cancelled = false
        api(`/trainings?limit=${HISTORY_SIZE}`)
            .then(({ trainings }) => {
                if (!cancelled) setTrainings(trainings)
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err.message)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const titleOf = (training) => training.title || 'Treino'

    return (
        <div className={styles.container}>
            <h4>Histórico de treinos</h4>

            {trainings === null && !loadError && <p className={styles.message}>Carregando treinos...</p>}
            {loadError && <p className={styles.message} role='alert'>{loadError}</p>}

            {trainings && trainings.length === 0 && (
                <div className={styles.empty}>
                    <p>Nenhum treino realizado ainda.</p>
                    <p className={styles.message}>Os treinos que você concluir vão aparecer aqui.</p>
                </div>
            )}

            {trainings && trainings.length > 0 && (
                <ul className={styles.list}>
                    {trainings.map((training) => (
                        <li key={training.id}>
                            <button
                                type='button'
                                className={styles.item}
                                onClick={() => setSelected(training)}
                                aria-label={`Ver ${titleOf(training)} de ${formatDate(training.date)}`}
                            >
                                <span className={styles.date}>{formatShortDate(training.date)}</span>
                                <span className={styles.info}>
                                    <span className={styles.title}>{titleOf(training)}</span>
                                    {training.mainSeries && (
                                        <span className={styles.preview}>{training.mainSeries}</span>
                                    )}
                                </span>
                                <svg className={styles.arrow} viewBox='0 0 24 24' width='16' height='16' aria-hidden='true'>
                                    <path d='M9 6l6 6-6 6' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' />
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <Modal
                open={selected !== null}
                onClose={() => setSelected(null)}
                title={selected ? `${titleOf(selected)} · ${formatDate(selected.date)}` : ''}
            >
                {selected && (
                    <>
                        <Training training={selected} />
                        {selected.notes && (
                            <div className={styles.notes}>
                                <h3>Anotações</h3>
                                <p>{selected.notes}</p>
                            </div>
                        )}
                    </>
                )}
            </Modal>
        </div>
    )
}

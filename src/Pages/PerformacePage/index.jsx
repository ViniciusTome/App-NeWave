import { useEffect, useState } from 'react'
import { Aside } from '../../components/Aside';
import { Card } from '../../components/Card'
import { EvolutionOfTheTimes } from '../../components/Dashboard/EvolutionOfTheTimes';
import { Input } from '../../components/Input'
import { Modal } from '../../components/Modal'
import { TestAndTimes } from '../../components/TestAndTimes';
import { Training } from '../../components/Training'
import { api } from '../../services/api'
import { formatDate, todayIso } from '../../utils/format'
import styles from './performancepage.module.css'

const FEEDBACK_SIZE = 50

// "9/10 · faltou ar" (a nota que o atleta deu à série principal ao concluir)
const MOTIVOS = { respiracao: 'faltou ar', forca: 'faltou força' }
const notaText = (training) =>
    [`${training.difficulty}/10`, MOTIVOS[training.difficultyReason]].filter(Boolean).join(' · ')

export const PerformancePage = () => {

    // Mesmos treinos do histórico: concluídos e os que passaram da data
    const [trainings, setTrainings] = useState(null) // null = carregando
    const [loadError, setLoadError] = useState('')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState(null)

    useEffect(() => {
        let cancelled = false
        api(`/trainings?limit=${FEEDBACK_SIZE}&today=${todayIso()}`)
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

    // Procura pelo título ou pela data (ex.: "velocidade" ou "17/11")
    const query = search.trim().toLowerCase()
    const visible = (trainings ?? []).filter((training) =>
        !query ||
        titleOf(training).toLowerCase().includes(query) ||
        formatDate(training.date).includes(query)
    )

    return (
        <div className={styles.container}>
            <Aside/>
            <div>
                <div className={styles.feedback}>
                    <h2>FeedBack</h2>
                    <Input
                        className={styles.input}
                        placeholder='Procure o treino...'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label='Procurar treino pelo título ou pela data'
                    />
                    {trainings === null && !loadError && <p className={styles.message}>Carregando treinos...</p>}
                    {loadError && <p className={styles.message} role='alert'>{loadError}</p>}
                    {trainings && trainings.length === 0 && (
                        <p className={styles.message}>
                            Os treinos que você concluir ou que passarem da data vão aparecer aqui.
                        </p>
                    )}
                    {trainings && trainings.length > 0 && visible.length === 0 && (
                        <p className={styles.message}>Nenhum treino encontrado para "{search.trim()}".</p>
                    )}
                    <div className={styles.boxCards}>
                        {visible.map((training) => (
                            <button
                                type='button'
                                key={training.id}
                                className={styles.boxCardComplete}
                                onClick={() => setSelected(training)}
                                aria-label={`Ver ${titleOf(training)} de ${formatDate(training.date)}`}
                            >
                                <div className={styles.boxCard}>
                                    <Card training={training} inTrainingPage='true' />
                                </div>
                                <div className={styles.boxFeedback}>
                                    <ul>
                                        <li>
                                            <strong>Situação:</strong>{' '}
                                            {training.completed ? 'Realizado' : 'Não realizado'}
                                        </li>
                                        {training.difficulty && (
                                            <li><strong>Nota da série principal:</strong> {notaText(training)}</li>
                                        )}
                                        {training.notes && (
                                            <li className={styles.notes}><strong>Anotações:</strong> {training.notes}</li>
                                        )}
                                    </ul>
                                </div>
                            </button>
                        ))}
                    </div>
                    <Modal
                        open={selected !== null}
                        onClose={() => setSelected(null)}
                        title={selected ? `${titleOf(selected)} · ${formatDate(selected.date)}` : ''}
                    >
                        {selected && (
                            <>
                                <p className={styles.status}>
                                    {selected.completed ? 'Treino realizado.' : 'Este treino passou da data sem ser concluído.'}
                                </p>
                                {selected.difficulty && (
                                    <p className={styles.status}>Nota da série principal: {notaText(selected)}</p>
                                )}
                                <Training training={selected} />
                                {selected.notes && (
                                    <div className={styles.modalNotes}>
                                        <h3>Anotações</h3>
                                        <p>{selected.notes}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </Modal>
                </div>
                <h2 className={styles.SectionName}>Desempenho</h2>
                <div className={styles.TestAndTimes}>
                    <TestAndTimes/>
                </div>
                <div className={styles.EvolutionTimes}>
                    <EvolutionOfTheTimes/>
                </div>
            </div>
            
        </div>
    )
}
                    
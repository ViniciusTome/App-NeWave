import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '../Card'
import { api, notifyTrainingsChanged, TRAININGS_CHANGED } from '../../services/api'
import { todayIso } from '../../utils/format'
import chevron from '../../assets/chevron.svg'
import styles from './carousel.module.css'

// Carrossel da Home: só os treinos que ainda vão acontecer (de hoje em diante e não concluídos).
// Os já feitos ou que passaram da data ficam no histórico e no feedback.
// O primeiro da lista (o de hoje ou o próximo) fica em destaque.
export const Carousel = () => {

    const carousel = useRef(null);
    const [trainings, setTrainings] = useState(null) // null = carregando
    const [loadError, setLoadError] = useState('')
    const [completing, setCompleting] = useState(false)
    const [completeError, setCompleteError] = useState('')

    const load = useCallback(() => {
        return api(`/trainings/upcoming?today=${todayIso()}`)
            .then(({ trainings }) => {
                setTrainings(trainings)
                setLoadError('')
            })
            .catch((err) => setLoadError(err.message))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(TRAININGS_CHANGED, load)
        return () => window.removeEventListener(TRAININGS_CHANGED, load)
    }, [load])

    const handleLeftClick = (e) => {
        e.preventDefault();
        carousel.current.scrollLeft -= (carousel.current.offsetWidth / 3) //telas menores é melhor usar  /2 e telas maiores /3

    };
    const handleRightClick = (e) => {
        e.preventDefault();
        carousel.current.scrollLeft += (carousel.current.offsetWidth / 3) //telas menores é melhor usar  /2 e telas maiores /3

    };

    const handleComplete = async (training) => {
        setCompleting(true)
        setCompleteError('')
        try {
            await api(`/trainings/${training.id}/complete`, { method: 'POST' })
            notifyTrainingsChanged() // recarrega o carrossel e o histórico
        } catch (err) {
            setCompleteError(err.message)
        } finally {
            setCompleting(false)
        }
    }

    const hasTrainings = trainings && trainings.length > 0

    return (
        <div>
            <div className={styles.carousel} ref={carousel}>
                <h2 style={{ color: 'white', fontSize: '25px' }}>Treinos</h2>

                {trainings === null && !loadError && <p className={styles.message}>Carregando treinos...</p>}
                {loadError && <p className={styles.message} role='alert'>{loadError}</p>}
                {trainings && trainings.length === 0 && (
                    <p className={styles.message}>
                        Nenhum treino agendado. Os próximos treinos vão aparecer aqui.
                    </p>
                )}

                {hasTrainings && (
                    <div className={styles.cards}>
                        {trainings.map((training, index) => {
                            const isFeatured = index === 0
                            const isToday = training.date === todayIso()
                            return (
                                <div
                                    key={training.id}
                                    className={`${styles.slide} ${isFeatured ? styles.featured : styles.dimmed}`}
                                    aria-current={isFeatured && isToday ? 'date' : undefined}
                                >
                                    {isFeatured && (
                                        <span className={styles.badge}>
                                            {isToday ? 'Treino de hoje' : 'Próximo treino'}
                                        </span>
                                    )}
                                    <Card
                                        training={training}
                                        className={isFeatured ? styles.featuredCard : ''}
                                    />
                                    {isFeatured && (
                                        <>
                                            <button
                                                type='button'
                                                className={styles.complete}
                                                onClick={() => handleComplete(training)}
                                                disabled={completing}
                                            >
                                                {completing ? 'Concluindo...' : 'Concluir treino'}
                                            </button>
                                            {completeError && (
                                                <p className={styles.error} role='alert'>{completeError}</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {hasTrainings && trainings.length > 1 && (
                <div className={styles.buttons}>
                    <button onClick={handleLeftClick}><img src={chevron} alt='Voltar'/> </button>
                    <button onClick={handleRightClick}><img src={chevron} alt='Avançar'/></button>
                </div>
            )}
        </div>
    )
}
